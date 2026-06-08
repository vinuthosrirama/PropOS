/**
 * Self-Hosted iOS Shortcut Relay Routes
 *
 * These endpoints are polled by the iOS Shortcut installed on the agent's iPhone.
 * Authentication is via a shared secret (SHORTCUT_RELAY_SECRET env var).
 *
 * All endpoints return JSON. The iOS Shortcut calls them via "Get contents of URL".
 *
 * Endpoints:
 *   POST /register              — one-time device registration
 *   GET  /poll                  — Shortcut polls this to get pending messages
 *   POST /sent/:id              — Shortcut calls this after each successful send
 *   POST /failed/:id            — Shortcut calls this if a send fails
 *   POST /reply                 — Shortcut calls this when a reply arrives
 *   GET  /status                — queue stats + device info (for debugging)
 *
 * iOS Shortcut setup:
 *   1. Create Shortcut with these actions (in order):
 *      a. Get contents of URL:
 *           Method: GET
 *           URL: https://propos.addvantage.site/api/sms-shortcut/poll?device_id=DEVICE_ID&secret=SECRET
 *      b. Repeat with each item in result:
 *           - Send Message: number = "to" from item, message = "body" from item
 *           - Get contents of URL:
 *               Method: POST
 *               URL: https://propos.addvantage.site/api/sms-shortcut/sent/ID?secret=SECRET
 *   2. Create iOS Automation: "Every day at 9:55am" → Run Shortcut
 *      Add more time triggers as needed (e.g. 2pm for follow-ups)
 *   3. For reply monitoring: add a second Shortcut that runs when Messages app
 *      receives a notification and POSTs to /api/sms-shortcut/reply
 */

import { Router, type Request, type Response } from "express"
import {
  verifyShortcutSecret,
  pollPending,
  markSent,
  markFailed,
  registerDevice,
  getDevice,
  getQueueStats,
} from "../lib/shortcutRelay.js"

const router = Router()

// ── Auth middleware for Shortcut endpoints ────────────────────────────────────

function requireShortcutSecret(req: Request, res: Response, next: () => void): void {
  const secret = String(req.query.secret ?? req.body?.secret ?? "")
  if (!verifyShortcutSecret(secret)) {
    res.status(401).json({ error: "Invalid secret" })
    return
  }
  next()
}

// ── POST /register ────────────────────────────────────────────────────────────
// Called once when you first set up the Shortcut on a new iPhone.
// Stores the device_id → phone mapping so the server knows who this iPhone is.
//
// Body: { device_id, phone, secret, label? }
// Returns: { ok: true, device_id }

router.post("/register", async (req: Request, res: Response) => {
  const { device_id, phone, secret, label } = req.body ?? {}

  if (!verifyShortcutSecret(String(secret ?? ""))) {
    return res.status(401).json({ error: "Invalid secret" })
  }
  if (!device_id || typeof device_id !== "string") {
    return res.status(400).json({ error: "device_id required" })
  }
  if (!phone || typeof phone !== "string") {
    return res.status(400).json({ error: "phone required" })
  }

  await registerDevice(
    device_id.slice(0, 64),
    phone.slice(0, 20),
    typeof label === "string" ? label.slice(0, 80) : undefined,
  )

  res.json({ ok: true, device_id })
})

// ── GET /poll ─────────────────────────────────────────────────────────────────
// The iOS Shortcut calls this on every automation trigger.
// Returns up to 10 pending messages. Marks them 'claimed' atomically.
//
// Query: ?device_id=X&secret=Y
// Returns: [{ id, to, body }, ...]  — empty array means nothing to send

router.get("/poll", requireShortcutSecret, async (req: Request, res: Response) => {
  const deviceId = String(req.query.device_id ?? "").trim()
  if (!deviceId) {
    return res.status(400).json({ error: "device_id required" })
  }

  const messages = await pollPending(deviceId)
  res.json(messages)
})

// ── POST /sent/:id ────────────────────────────────────────────────────────────
// Called by the Shortcut after each message is successfully sent via iMessage.
// Marks the queue entry as 'sent'.
//
// Query: ?secret=Y
// Returns: { ok: true }

router.post("/sent/:id", requireShortcutSecret, async (req: Request, res: Response) => {
  const id = req.params.id?.trim()
  if (!id) return res.status(400).json({ error: "id required" })

  await markSent(id)
  res.json({ ok: true })
})

// ── POST /failed/:id ──────────────────────────────────────────────────────────
// Called by the Shortcut if a send fails (e.g. recipient not on iMessage,
// Messages app error). Reverts to 'pending' so the next poll retries.
//
// Query: ?secret=Y
// Body: { reason? }
// Returns: { ok: true }

router.post("/failed/:id", requireShortcutSecret, async (req: Request, res: Response) => {
  const id     = req.params.id?.trim()
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : undefined

  if (!id) return res.status(400).json({ error: "id required" })

  await markFailed(id, reason)
  res.json({ ok: true })
})

// ── POST /reply ───────────────────────────────────────────────────────────────
// Called by the Shortcut when a reply arrives in Messages app.
// The Shortcut monitors the Messages app via "Personal Automation → App Opens"
// and POSTs the sender + body back here.
//
// Query: ?secret=Y
// Body: { from, body, device_id }
// Returns: { ok: true }
//
// NOTE: The actual reply processing (addReplyToThread, handleOutreachInbound etc.)
// is handled via the onReply callback registered by index.ts. This keeps the
// router free of circular dependencies with index.ts.

type ReplyCallback = (from: string, body: string) => Promise<void>
let _onReply: ReplyCallback | null = null

/** Called once by index.ts at startup to wire in the reply handler. */
export function registerReplyHandler(fn: ReplyCallback): void {
  _onReply = fn
}

router.post("/reply", requireShortcutSecret, async (req: Request, res: Response) => {
  const from = String(req.body?.from ?? "").trim()
  const body = String(req.body?.body ?? "").trim()

  if (!from || !body) {
    return res.status(400).json({ error: "from and body required" })
  }

  res.json({ ok: true })  // ack immediately

  if (_onReply) {
    void _onReply(from, body)
  } else {
    console.warn("[sms-shortcut] reply received but no handler registered")
  }
})

// ── GET /status ───────────────────────────────────────────────────────────────
// Debug endpoint — shows device info + queue stats.
// Useful to verify the Shortcut is polling correctly.

router.get("/status", requireShortcutSecret, async (req: Request, res: Response) => {
  const deviceId = String(req.query.device_id ?? "").trim()
  if (!deviceId) return res.status(400).json({ error: "device_id required" })

  const [device, stats] = await Promise.all([
    getDevice(deviceId),
    getQueueStats(deviceId),
  ])

  res.json({
    device: device ?? { error: "not registered" },
    queue: stats,
    transport: "shortcut-relay",
    pollUrl: `${process.env.BASE_URL ?? ""}/api/sms-shortcut/poll?device_id=${deviceId}&secret=<SECRET>`,
  })
})

export default router
