/**
 * Self-outreach campaign management — Vinuth pitching PropOS to boutique RE agents.
 *
 * POST /api/outreach-targets/seed              — upsert the 16-agent seed list
 * POST /api/outreach-targets/seed-test         — upsert 25 synthetic test leads (fake phones, sends → TEST_RECIPIENT_PHONE)
 * POST /api/outreach-targets/clear-test        — remove test leads (source = 'test:synthetic')
 * GET  /api/outreach-targets                   — list all targets (?status= filter)
 * GET  /api/outreach-targets/brief             — morning summary (drafts, replies, follow-ups due)
 * GET  /api/outreach-targets/drafts            — pending AI reply drafts awaiting approval
 * POST /api/outreach-targets/approve-draft/:id — approve (+ optional edit) + send draft
 * POST /api/outreach-targets/reject-draft/:id  — discard draft
 * POST /api/outreach-targets/trigger-now       — manually fire today's outreach (test mode)
 * POST /api/outreach-targets/send-batch        — fire scripts for all 'new' targets (up to cap)
 * GET  /api/outreach-targets/:id               — single target
 * GET  /api/outreach-targets/:id/thread        — full conversation thread for a target
 * POST /api/outreach-targets/:id/reply         — manually send a custom reply to a target
 * POST /api/outreach-targets/:id/generate-draft — on-demand AI draft
 * PUT  /api/outreach-targets/:id               — update status / notes / reply
 * POST /api/outreach-targets/send/:id          — fire the pre-written sms_script
 *
 * IMPORTANT: All static paths (/brief, /drafts, /seed, /trigger-now, /send-batch) are
 * registered BEFORE the dynamic /:id route so Express matches them correctly.
 */

import { Router } from "express"
import { query, execute, isDbConnected } from "../lib/db.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { smsOptOutReason } from "../lib/compliance.js"
import { addAgentMessageToThread, getThread } from "../lib/conversations.js"
import { OUTREACH_TARGETS_SEED } from "../data/outreachTargetsSeed.js"
import { TEST_TARGETS_SEED } from "../data/testTargetsSeed.js"
import {
  getPendingDrafts,
  approveDraft,
  markDraftSent,
  rejectDraft,
  getMorningBrief,
  generateOutreachDraft,
  saveOutreachDraft,
  type OutreachTargetRow,
} from "../lib/outreachAgent.js"
import { triggerOutreachNow, getSchedulerStatus } from "../lib/outreachScheduler.js"
import { recordSignal } from "../lib/promptOptimiser.js"
import { guard } from "../lib/asyncGuard.js"

const router = Router()

// ── Seed ──────────────────────────────────────────────────────────────────────

router.post("/seed", guard(async (_req, res) => {
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
      errors.push(`${t.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  res.json({ ok: errors.length === 0, total: OUTREACH_TARGETS_SEED.length, upserted, errors })
}))

// ── Test seed: 25 synthetic leads, phones redirect to TEST_RECIPIENT_PHONE ───

router.post("/seed-test", guard(async (_req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ error: "Database not connected" })
  }
  let upserted = 0
  const errors: string[] = []
  for (const t of TEST_TARGETS_SEED) {
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
           status              = 'new',
           updated_at          = NOW()`,
        [
          t.name, t.agency, t.phone ?? null, t.email ?? null, t.suburb,
          t.recentSaleAddress ?? null, t.yearsInArea ?? null, t.agencySizeEst ?? null,
          t.personalNote, t.smsScript, t.source,
        ],
      )
      upserted++
    } catch (err) {
      errors.push(`${t.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const testPhone = process.env.TEST_RECIPIENT_PHONE?.trim() ?? "(not set)"
  res.json({ ok: errors.length === 0, total: TEST_TARGETS_SEED.length, upserted, errors, testPhone })
}))

// ── Clear test leads ──────────────────────────────────────────────────────────

router.post("/clear-test", guard(async (_req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ error: "Database not connected" })
  }
  const deleted = await execute(
    `DELETE FROM outreach_targets WHERE source = 'test:synthetic'`,
  )
  res.json({ ok: true, deleted })
}))

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/", guard(async (req, res) => {
  if (!isDbConnected()) return res.json({ targets: [], demo: true })

  const status = typeof req.query.status === "string" ? req.query.status : undefined
  const rows = status
    ? await query("SELECT * FROM outreach_targets WHERE status=$1 ORDER BY id", [status])
    : await query("SELECT * FROM outreach_targets ORDER BY id")

  res.json({ targets: rows, total: rows.length })
}))

// ── Morning brief — MUST be before /:id ───────────────────────────────────────

router.get("/brief", guard(async (_req, res) => {
  if (!isDbConnected()) return res.json({ demo: true, pendingDrafts: 0 })
  const [brief, schedulerStatus] = await Promise.all([getMorningBrief(), Promise.resolve(getSchedulerStatus())])
  res.json({ ...brief, scheduler: schedulerStatus })
}))

// ── Pending AI drafts — MUST be before /:id ───────────────────────────────────

router.get("/drafts", guard(async (_req, res) => {
  if (!isDbConnected()) return res.json({ drafts: [], demo: true })
  const drafts = await getPendingDrafts()
  res.json({ drafts, total: drafts.length })
}))

// ── Approve draft and send ────────────────────────────────────────────────────

router.post("/approve-draft/:id", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const draftId = parseInt(req.params.id, 10)
  if (isNaN(draftId)) return res.status(400).json({ error: "Invalid draft ID" })

  // Trim and reject empty string — callers who send "" mean "use the original draft"
  const editedBodyRaw = typeof req.body?.editedBody === "string" ? req.body.editedBody.trim() : ""
  const editedBody = editedBodyRaw.length > 0 ? editedBodyRaw.slice(0, 300) : undefined

  const body = await approveDraft(draftId, editedBody)
  if (!body) return res.status(404).json({ error: "Draft not found or already processed" })

  // Fetch target phone — draft is already approved at this point, so we must
  // revert to 'pending' if the SMS send fails to prevent the draft being lost.
  const draftRows = await query<{ target_id: number }>(
    `SELECT target_id FROM outreach_drafts WHERE id = $1`, [draftId],
  )
  const targetId = draftRows[0]?.target_id
  if (!targetId) {
    // This shouldn't happen (approveDraft would have returned null), but be safe
    return res.status(404).json({ error: "Draft target not found" })
  }

  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets WHERE id = $1`, [targetId],
  )
  const target = targets[0]
  if (!target?.phone) return res.status(400).json({ error: "Target has no phone number" })

  // Fetch version_id before mutating the draft (for signal recording)
  const versionRows = await query<{ version_id: number | null }>(
    `SELECT version_id FROM outreach_drafts WHERE id = $1`, [draftId],
  )
  const versionId = versionRows[0]?.version_id ?? null

  // Compliance gate: if the target has opted out, do not send. Keep the draft
  // visible by reverting it to pending.
  const optOut = await smsOptOutReason(target.phone)
  if (optOut) {
    await execute(
      `UPDATE outreach_drafts SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [draftId],
    )
    return res.status(403).json({ error: `Cannot send: ${optOut}` })
  }

  try {
    const result = await sendSMS(target.phone, body)
    await markDraftSent(draftId)

    await addAgentMessageToThread(target.phone, body, {
      leadName:        target.name,
      propertyAddress: target.recent_sale_address ?? "",
    })
    await execute(
      `UPDATE outreach_targets
       SET last_message = $1, last_contact_date = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [body.slice(0, 300), targetId],
    )

    // Quality signal: edited body = 'edited', unchanged body = 'approved'
    if (versionId) {
      const signal = editedBody ? "edited" : "approved"
      void recordSignal(versionId, signal, { draftId, targetId })
    }

    res.json({
      ok:        true,
      sid:       result.sid,
      transport: result.transport,
      testMode:  result.testMode,
      sent:      body,
      to:        target.phone,
      name:      target.name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Revert draft to pending so it stays visible and can be retried
    await execute(
      `UPDATE outreach_drafts SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [draftId],
    )
    res.status(502).json({ error: `SMS send failed: ${msg}` })
  }
}))

// ── Reject draft ──────────────────────────────────────────────────────────────

router.post("/reject-draft/:id", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const draftId = parseInt(req.params.id, 10)
  if (isNaN(draftId)) return res.status(400).json({ error: "Invalid draft ID" })

  // Capture version_id before rejection for signal recording
  const versionRows = await query<{ version_id: number | null }>(
    `SELECT version_id FROM outreach_drafts WHERE id = $1`, [draftId],
  )
  const versionId = versionRows[0]?.version_id ?? null

  await rejectDraft(draftId)

  // Quality signal: rejected draft = negative feedback for the prompt version
  if (versionId) void recordSignal(versionId, "rejected", { draftId })

  res.json({ ok: true })
}))

// ── Manual trigger (test mode) — MUST be before /:id ─────────────────────────

router.post("/trigger-now", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })
  const limit = Math.min(Number(req.body?.limit ?? 1), 5)
  if (isNaN(limit)) return res.status(400).json({ error: "limit must be a number" })
  const result = await triggerOutreachNow(limit)
  res.json(result)
}))

// ── Batch send — MUST be before /:id ─────────────────────────────────────────

router.post("/send-batch", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const limit = Math.min(Number(req.body?.limit ?? 20), 20)
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
    const optOut = await smsOptOutReason(t.phone!)
    if (optOut) { results.push({ name: t.name, ok: false, error: optOut }); continue }
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
    await new Promise(r => setTimeout(r, 2_000))
  }

  const sent = results.filter(r => r.ok).length
  res.json({ ok: true, total: targets.length, sent, results })
}))

// ── Single target ─────────────────────────────────────────────────────────────
// NOTE: All static paths above must be registered before this dynamic route.

router.get("/:id", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const rows = await query("SELECT * FROM outreach_targets WHERE id=$1", [req.params.id])
  if (!rows.length) return res.status(404).json({ error: "Not found" })
  res.json(rows[0])
}))

// ── Conversation thread for a target ─────────────────────────────────────────

router.get("/:id/thread", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets WHERE id = $1`, [req.params.id],
  )
  const target = targets[0]
  if (!target) return res.status(404).json({ error: "Target not found" })

  const [thread, drafts] = await Promise.all([
    target.phone ? getThread(target.phone) : Promise.resolve(null),
    query(
      `SELECT id, inbound_body, draft_body, status, created_at
       FROM outreach_drafts WHERE target_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [target.id],
    ),
  ])

  res.json({ target, thread, drafts })
}))

// ── Manual custom reply ───────────────────────────────────────────────────────

router.post("/:id/reply", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets WHERE id = $1`, [req.params.id],
  )
  const target = targets[0]
  if (!target)       return res.status(404).json({ error: "Target not found" })
  if (!target.phone) return res.status(400).json({ error: "No phone number" })

  const body = typeof req.body?.message === "string" ? req.body.message.trim() : ""
  if (!body)            return res.status(400).json({ error: "message is required" })
  if (body.length > 300) return res.status(400).json({ error: "message too long (max 300 chars)" })

  const optOut = await smsOptOutReason(target.phone)
  if (optOut) return res.status(403).json({ error: `Cannot send: ${optOut}` })

  try {
    const result = await sendSMS(target.phone, body)
    await addAgentMessageToThread(target.phone, body, {
      leadName:        target.name,
      propertyAddress: target.recent_sale_address ?? "",
    })
    await execute(
      `UPDATE outreach_targets
       SET last_message = $1, last_contact_date = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [body.slice(0, 300), target.id],
    )
    res.json({ ok: true, sid: result.sid, transport: result.transport, testMode: result.testMode })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
  }
}))

// ── On-demand AI draft generation ─────────────────────────────────────────────

router.post("/:id/generate-draft", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets WHERE id = $1`, [req.params.id],
  )
  const target = targets[0]
  if (!target) return res.status(404).json({ error: "Target not found" })

  const inbound = typeof req.body?.inbound === "string"
    ? req.body.inbound.slice(0, 500)
    : "(manual request)"

  const { draft, versionId } = await generateOutreachDraft(target, inbound)
  const draftId = await saveOutreachDraft(target.id, inbound, draft, versionId)
  res.json({ ok: true, draft, draftId })
}))

// ── Update ────────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["new", "contacted", "replied", "demo_booked", "won", "not_interested"])

interface UpdateBody {
  status?:       string
  notes?:        string
  replyBody?:    string
  lastMessage?:  string
  demoBookedAt?: string
}

router.put("/:id", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  const b = req.body as UpdateBody

  if (b.status && !VALID_STATUSES.has(b.status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${[...VALID_STATUSES].join(", ")}` })
  }

  const fields: string[] = []
  const params: unknown[] = []
  let n = 1

  if (b.status)       { fields.push(`status=$${n++}`);         params.push(b.status) }
  if (b.notes)        { fields.push(`notes=$${n++}`);          params.push(b.notes) }
  if (b.replyBody)    { fields.push(`reply_body=$${n++}`);     params.push(b.replyBody) }
  if (b.lastMessage)  { fields.push(`last_message=$${n++}`);   params.push(b.lastMessage) }
  if (b.demoBookedAt) { fields.push(`demo_booked_at=$${n++}`); params.push(b.demoBookedAt) }

  if (!fields.length) return res.status(400).json({ error: "No fields to update" })

  fields.push(`updated_at=NOW()`)
  params.push(req.params.id)

  await execute(`UPDATE outreach_targets SET ${fields.join(",")} WHERE id=$${n}`, params)

  // Strong quality signal: demo booked = the outreach campaign is working
  if (b.demoBookedAt || b.status === "demo_booked") {
    try {
      const latestVersion = await query<{ id: number }>(
        `SELECT id FROM prompt_versions WHERE context = 'outreach_system' AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
      )
      if (latestVersion[0]?.id) {
        void recordSignal(latestVersion[0].id, "demo_booked", { targetId: req.params.id })
      }
    } catch { /* non-fatal */ }
  }

  res.json({ ok: true })
}))

// ── Send pre-written script ───────────────────────────────────────────────────

router.post("/send/:id", guard(async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: "No database" })
  if (!smsConfigured())  return res.status(503).json({ error: "No SMS transport configured" })

  const rows = await query<{
    id: number; name: string; phone: string | null; sms_script: string | null; status: string
  }>("SELECT id, name, phone, sms_script, status FROM outreach_targets WHERE id=$1", [req.params.id])

  if (!rows.length) return res.status(404).json({ error: "Target not found" })
  const target = rows[0]

  if (!target.phone)      return res.status(400).json({ error: "No phone number on this target" })
  if (!target.sms_script) return res.status(400).json({ error: "No SMS script — set sms_script first" })

  const optOut = await smsOptOutReason(target.phone)
  if (optOut) return res.status(403).json({ error: `Cannot send: ${optOut}` })

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
    res.status(502).json({ error: `SMS send failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}))

export default router
