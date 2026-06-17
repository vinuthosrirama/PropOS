/**
 * BlueBubbles health, restart, and daemon routes.
 *
 * Public (daemon secret):
 *   GET  /api/bb/daemon/poll  — Mac watchdog polls every 30s for restart commands
 *   POST /api/bb/daemon/ack   — Mac watchdog acks completed action + updates last-seen
 *
 * Protected (JWT):
 *   GET  /api/bb/status       — live transport health (shown in VoiceAgentView)
 *   POST /api/bb/restart      — queues restart command; Mac daemon acts within 30s
 */

import { Router, type Request, type Response } from "express"
import { checkSmsTransport, checkTransportChain } from "../lib/sms.js"
import { requireAuth } from "../middleware/auth.js"
import { execute, query, isDbConnected } from "../lib/db.js"

const router = Router()

// ── Daemon secret (constant-time compare) ─────────────────────────────────────

function isDaemonAuthed(req: Request): boolean {
  const provided = String(req.query.secret ?? req.body?.secret ?? "")
  const expected  = process.env.WEBHOOK_SECRET?.trim() ?? ""
  if (!expected || !provided || provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

// ── GET /api/bb/status — live transport health (JWT) ─────────────────────────

router.get("/status", requireAuth, async (_req: Request, res: Response) => {
  const [primary, chain] = await Promise.all([
    checkSmsTransport().catch(() => ({ ok: false, transport: "none" as const, label: "error", detail: "health check threw" })),
    checkTransportChain().catch(() => []),
  ])

  let daemonLastSeen: string | null = null
  let restartQueued = false

  if (isDbConnected()) {
    const rows = await query<{ key: string; value: string; updated_at: string }>(
      `SELECT key, value, updated_at::text AS updated_at FROM system_kv
       WHERE key IN ('bb_daemon_last_seen', 'bb_restart_requested')`,
    ).catch(() => [])

    for (const r of rows) {
      if (r.key === "bb_daemon_last_seen") daemonLastSeen = r.updated_at
      if (r.key === "bb_restart_requested") restartQueued = r.value === "1"
    }
  }

  const daemonActiveSince = daemonLastSeen
    ? Date.now() - new Date(daemonLastSeen).getTime()
    : Infinity
  const daemonActive = daemonActiveSince < 90_000  // seen within 90s (2 poll intervals)

  res.json({
    ...primary,
    chain,
    daemon: {
      lastSeen:      daemonLastSeen,
      active:        daemonActive,
      restartQueued,
    },
  })
})

// ── POST /api/bb/restart — queue restart (JWT) ────────────────────────────────

router.post("/restart", requireAuth, async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.status(503).json({ error: "Database not connected — cannot queue restart command" })
  }

  await execute(
    `INSERT INTO system_kv (key, value, updated_at) VALUES ('bb_restart_requested', '1', NOW())
     ON CONFLICT (key) DO UPDATE SET value = '1', updated_at = NOW()`,
  )

  res.json({
    ok:      true,
    message: "Restart command queued. Mac daemon will restart BlueBubbles + cloudflared within 30s.",
  })
})

// ── GET /api/bb/daemon/poll — daemon polls for commands (WEBHOOK_SECRET) ─────

router.get("/daemon/poll", async (req: Request, res: Response) => {
  if (!isDaemonAuthed(req)) return res.status(401).json({ error: "Unauthorized" })
  if (!isDbConnected()) return res.json({ restart: false })

  // Touch last-seen (heartbeat)
  void execute(
    `INSERT INTO system_kv (key, value, updated_at) VALUES ('bb_daemon_last_seen', 'ok', NOW())
     ON CONFLICT (key) DO UPDATE SET value = 'ok', updated_at = NOW()`,
  )

  const rows = await query<{ value: string }>(
    `SELECT value FROM system_kv WHERE key = 'bb_restart_requested'`,
  ).catch(() => [])

  res.json({ restart: rows[0]?.value === "1" })
})

// ── POST /api/bb/daemon/ack — daemon reports completion ───────────────────────

router.post("/daemon/ack", async (req: Request, res: Response) => {
  if (!isDaemonAuthed(req)) return res.status(401).json({ error: "Unauthorized" })

  const { action, status: ackStatus = "ok", detail } = req.body as {
    action?: string; status?: string; detail?: string
  }

  if (action === "restart" && isDbConnected()) {
    await execute(
      `INSERT INTO system_kv (key, value, updated_at) VALUES ('bb_restart_requested', '0', NOW())
       ON CONFLICT (key) DO UPDATE SET value = '0', updated_at = NOW()`,
    ).catch(() => null)
  }

  if (isDbConnected()) {
    void execute(
      `INSERT INTO system_kv (key, value, updated_at) VALUES ('bb_daemon_last_seen', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [ackStatus],
    )
  }

  console.log(`[bb-daemon] ack: action=${action ?? "heartbeat"} status=${ackStatus}${detail ? ` detail=${detail}` : ""}`)
  res.json({ ok: true })
})

export default router
