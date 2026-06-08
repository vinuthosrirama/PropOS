/**
 * POST /api/outreach-targets/seed   — upsert the static seed list (one-time setup)
 * GET  /api/outreach-targets        — list all targets (optional ?status= filter)
 * GET  /api/outreach-targets/:id    — single target
 * PUT  /api/outreach-targets/:id    — update status / notes / reply
 * POST /api/outreach-targets/send/:id — fire the SMS script for a target via active transport
 */

import { Router } from "express"
import { query, execute, isDbConnected } from "../lib/db.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { OUTREACH_TARGETS_SEED } from "../data/outreachTargetsSeed.js"

const router = Router()

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/outreach-targets/seed
 * Upserts all 16 boutique agents from the seed file.
 * Safe to call multiple times — conflict resolution is on phone column.
 */
router.post("/seed", async (_req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ error: "Database not connected — set DATABASE_URL in server/.env" })
  }

  let upserted = 0
  const errors: string[] = []

  for (const t of OUTREACH_TARGETS_SEED) {
    try {
      await execute(
        `INSERT INTO outreach_targets
           (name, agency, phone, email, suburb, state,
            recent_sale_address, years_in_area, agency_size_est,
            personal_note, sms_script, source, status)
         VALUES ($1,$2,$3,$4,$5,'VIC',$6,$7,$8,$9,$10,$11,'new')
         ON CONFLICT (phone) DO UPDATE SET
           name                = EXCLUDED.name,
           agency              = EXCLUDED.agency,
           email               = COALESCE(EXCLUDED.email, outreach_targets.email),
           suburb              = EXCLUDED.suburb,
           recent_sale_address = EXCLUDED.recent_sale_address,
           years_in_area       = EXCLUDED.years_in_area,
           agency_size_est     = EXCLUDED.agency_size_est,
           personal_note       = EXCLUDED.personal_note,
           sms_script          = EXCLUDED.sms_script,
           source              = EXCLUDED.source,
           updated_at          = NOW()`,
        [
          t.name, t.agency, t.phone ?? null, t.email ?? null, t.suburb,
          t.recentSaleAddress ?? null, t.yearsInArea ?? null, t.agencySizeEst ?? null,
          t.personalNote, t.smsScript, t.source,
        ],
      )
      upserted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${t.name}: ${msg}`)
    }
  }

  res.json({
    ok:      errors.length === 0,
    total:   OUTREACH_TARGETS_SEED.length,
    upserted,
    errors,
  })
})

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  if (!isDbConnected()) return res.json({ targets: [], demo: true })

  const status = req.query.status as string | undefined
  const rows = status
    ? await query("SELECT * FROM outreach_targets WHERE status=$1 ORDER BY id", [status])
    : await query("SELECT * FROM outreach_targets ORDER BY id")

  res.json({ targets: rows, total: rows.length })
})

// ── Single ────────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const rows = await query("SELECT * FROM outreach_targets WHERE id=$1", [req.params.id])
  if (!rows.length) return res.status(404).json({ error: "Not found" })
  res.json(rows[0])
})

// ── Update ────────────────────────────────────────────────────────────────────

interface UpdateBody {
  status?:          string
  notes?:           string
  replyBody?:       string
  lastMessage?:     string
  demoBookedAt?:    string
}

router.put("/:id", async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const b = req.body as UpdateBody

  const fields: string[] = []
  const params: unknown[] = []
  let n = 1

  if (b.status)       { fields.push(`status=$${n++}`);          params.push(b.status) }
  if (b.notes)        { fields.push(`notes=$${n++}`);           params.push(b.notes) }
  if (b.replyBody)    { fields.push(`reply_body=$${n++}`);      params.push(b.replyBody) }
  if (b.lastMessage)  { fields.push(`last_message=$${n++}`);    params.push(b.lastMessage) }
  if (b.demoBookedAt) { fields.push(`demo_booked_at=$${n++}`);  params.push(b.demoBookedAt) }

  if (!fields.length) return res.status(400).json({ error: "No fields to update" })

  fields.push(`updated_at=NOW()`)
  params.push(req.params.id)

  await execute(
    `UPDATE outreach_targets SET ${fields.join(",")} WHERE id=$${n}`,
    params,
  )
  res.json({ ok: true })
})

// ── Send SMS ──────────────────────────────────────────────────────────────────

/**
 * POST /api/outreach-targets/send/:id
 * Fires the pre-written sms_script for this agent via the active SMS transport.
 * Marks status → contacted on success.
 */
router.post("/send/:id", async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const rows = await query<{
    id: number; name: string; phone: string | null; sms_script: string | null; status: string
  }>("SELECT id, name, phone, sms_script, status FROM outreach_targets WHERE id=$1", [req.params.id])

  if (!rows.length) return res.status(404).json({ error: "Target not found" })
  const target = rows[0]

  if (!target.phone) return res.status(400).json({ error: "No phone number on this target" })
  if (!target.sms_script) return res.status(400).json({ error: "No SMS script — set sms_script first" })

  try {
    const result = await sendSMS(target.phone, target.sms_script)

    await execute(
      `UPDATE outreach_targets
         SET status='contacted', last_contact_date=NOW(),
             last_message=$1, updated_at=NOW()
         WHERE id=$2`,
      [target.sms_script.slice(0, 300), target.id],
    )

    res.json({
      ok:        true,
      sid:       result.sid,
      transport: result.transport,
      fallback:  result.fallback,
      testMode:  result.testMode,
      to:        target.phone,
      name:      target.name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({ error: `SMS send failed: ${msg}` })
  }
})

/**
 * POST /api/outreach-targets/send-batch
 * Fire SMS scripts for all targets with status='new', up to a max daily cap.
 * Sends in batches of 20/day to stay under iPhone spam filters.
 */
router.post("/send-batch", async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const limit = Math.min(Number(req.body?.limit ?? 20), 20)  // hard cap at 20/day
  const targets = await query<{
    id: number; name: string; phone: string | null; sms_script: string | null
  }>(
    "SELECT id, name, phone, sms_script FROM outreach_targets WHERE status='new' AND phone IS NOT NULL LIMIT $1",
    [limit],
  )

  if (!targets.length) return res.json({ ok: true, sent: 0, message: "No new targets to contact" })

  const results: { name: string; ok: boolean; transport?: string; error?: string }[] = []

  for (const t of targets) {
    if (!t.sms_script) { results.push({ name: t.name, ok: false, error: "no sms_script" }); continue }
    try {
      const r = await sendSMS(t.phone!, t.sms_script)
      await execute(
        `UPDATE outreach_targets SET status='contacted', last_contact_date=NOW(),
                last_message=$1, updated_at=NOW() WHERE id=$2`,
        [t.sms_script.slice(0, 300), t.id],
      )
      results.push({ name: t.name, ok: true, transport: r.transport })
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    // 2-second gap between sends — avoids carrier throttling
    await new Promise(r => setTimeout(r, 2_000))
  }

  const sent = results.filter(r => r.ok).length
  res.json({ ok: true, total: targets.length, sent, results })
})

export default router
