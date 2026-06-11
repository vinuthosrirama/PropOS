import { Router } from "express"
import { isDbConnected, query, execute } from "../lib/db.js"

const router = Router()

/**
 * Generic per-agent key/value persistence — for settings and small blobs
 * (comm preferences, featured listing, SLM overrides, etc.) that previously
 * lived only in localStorage and were lost on a different browser/device.
 *
 * GET /api/agent-state/:key  -> { value: <json> | null }
 * PUT /api/agent-state/:key  { value: <json> } -> { ok: true }
 *
 * DB-less mode: in-memory map per process (demo/dev without DATABASE_URL).
 */

const memState = new Map<string, unknown>()

router.get("/:key", async (req, res) => {
  const agentId = String(req.agentId ?? "default")
  const { key } = req.params
  if (!isDbConnected()) {
    return res.json({ value: memState.get(`${agentId}:${key}`) ?? null })
  }
  try {
    const row = await query<{ value: unknown }>(
      `SELECT value FROM agent_state WHERE agent_id = $1 AND key = $2`,
      [agentId, key],
    )
    res.json({ value: row[0]?.value ?? null })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put("/:key", async (req, res) => {
  const agentId = String(req.agentId ?? "default")
  const { key } = req.params
  const { value } = req.body as { value?: unknown }
  if (value === undefined) return res.status(400).json({ error: "value is required" })

  if (!isDbConnected()) {
    memState.set(`${agentId}:${key}`, value)
    return res.json({ ok: true, persisted: false })
  }
  try {
    await execute(
      `INSERT INTO agent_state (agent_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (agent_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [agentId, key, JSON.stringify(value)],
    )
    res.json({ ok: true, persisted: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
