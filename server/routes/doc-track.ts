/**
 * Document Intelligence tracking route — public, no auth required.
 *
 * POST /api/doc-track       — receive batched engagement events (JSON body)
 * POST /api/doc-track/flush — sendBeacon endpoint (text/plain body)
 * GET  /api/doc-track/sessions/:pitchId — fetch sessions for a pitch (used by DocInsightsView)
 */

import express, { Router, type Request, type Response } from "express"
import { query, queryOne, execute, isDbConnected } from "../lib/db.js"
import { sendSMS } from "../lib/sms.js"

const router = Router()

// ── Types ──────────────────────────────────────────────────────────────────────

type DocEventType =
  | "open" | "section_enter" | "section_exit" | "scroll_depth"
  | "cursor_sample" | "text_select" | "tab_blur" | "tab_focus" | "session_end"

interface DocEvent {
  type:       DocEventType
  sectionId?: string
  data?:      Record<string, unknown>
  ts:         number
}

interface BatchPayload {
  pitchId:   string
  pitchType: string
  sessionId: string
  contactId?: number
  events:    DocEvent[]
}

interface SessionRow {
  id:               number
  pitch_id:         string
  pitch_type:       string
  session_id:       string
  contact_id:       number | null
  agent_id:         string | null
  total_time_s:     number
  sections_viewed:  string[]
  completion_pct:   number
  scroll_depth_pct: number
  page_times_json:  Record<string, number>
  cursor_samples:   Array<{ section: string; x: number; y: number; t: number }>
  text_selections:  string[]
  lead_score_delta: number
  score_applied:    boolean
  opened_at:        string
  last_active_at:   string | null
}

interface PitchRow {
  id:           string
  type:         string
  agent_id:     string
  lead_id:      string | null
  payload_json: Record<string, unknown>
}

interface AgentRow {
  phone: string | null
  name:  string
}

// ── Lead score model ───────────────────────────────────────────────────────────

const TOTAL_SECTIONS: Record<string, number> = {
  appraisal:         7,
  buyer_brief:       7,
  listing_proposal:  8,
  price_update:      5,
  digital_intro:     5,
  vendor_report:     5,
}

function computeScoreDelta(
  pitchType: string,
  totalTimeS: number,
  sectionsViewed: string[],
  pageTimes: Record<string, number>,
  textSelections: string[],
): number {
  let score = 0
  const totalSections = TOTAL_SECTIONS[pitchType] ?? 6
  const sectionPct    = sectionsViewed.length / totalSections

  if (totalTimeS > 30)  score += 1
  if (totalTimeS > 120) score += 2
  if (totalTimeS > 300) score += 3

  if (sectionPct > 0.5) score += 2
  if (sectionPct > 0.8) score += 3
  if (sectionPct >= 1)  score += 4

  if (sectionsViewed.includes("price-guide")) score += 3
  if ((pageTimes["price-guide"] ?? 0) > 30)    score += 4
  if ((pageTimes["comparable-sales"] ?? 0) > 30) score += 3

  if (textSelections.length > 0) score += 2

  return score
}

// ── Parse batch (JSON body or text/plain from sendBeacon) ─────────────────────

function parseBatch(req: Request): BatchPayload | null {
  try {
    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString("utf8")) as BatchPayload
    }
    if (typeof req.body === "string") {
      return JSON.parse(req.body) as BatchPayload
    }
    if (req.body && typeof req.body === "object") {
      return req.body as BatchPayload
    }
    return null
  } catch {
    return null
  }
}

// ── Core batch handler ────────────────────────────────────────────────────────

async function handleBatch(req: Request, res: Response): Promise<void> {
  const batch = parseBatch(req)
  if (!batch?.pitchId || !batch.sessionId || !Array.isArray(batch.events)) {
    res.status(400).json({ error: "Invalid payload" })
    return
  }

  res.json({ ok: true }) // Ack immediately — don't block on DB ops

  if (!isDbConnected()) return

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "").trim()
  const ua = (req.headers["user-agent"] ?? "").slice(0, 512)

  try {
    const existing = await queryOne<SessionRow>(
      `SELECT * FROM document_sessions WHERE session_id = $1`,
      [batch.sessionId],
    )

    // Accumulate deltas from this event batch
    let addedTimeS = 0
    const newSections = new Set<string>(existing?.sections_viewed ?? [])
    const pageTimes: Record<string, number> = { ...(existing?.page_times_json ?? {}) }
    const cursorSamples: Array<{ section: string; x: number; y: number; t: number }> = []
    const newSelections = new Set<string>(existing?.text_selections ?? [])
    let maxScrollDepth = existing?.scroll_depth_pct ?? 0
    let isFirstOpen = false

    for (const ev of batch.events) {
      if (ev.type === "open" && !existing) isFirstOpen = true
      if (ev.type === "section_enter" && ev.sectionId) newSections.add(ev.sectionId)
      if (ev.type === "section_exit" && ev.sectionId && ev.data?.duration_ms) {
        const durationS = Math.max(0, Math.round(Number(ev.data.duration_ms) / 1000))
        addedTimeS += durationS
        pageTimes[ev.sectionId] = (pageTimes[ev.sectionId] ?? 0) + durationS
      }
      if (ev.type === "scroll_depth" && ev.data?.pct) {
        maxScrollDepth = Math.max(maxScrollDepth, Math.min(100, Number(ev.data.pct)))
      }
      if (ev.type === "cursor_sample" && ev.sectionId && ev.data?.x != null && ev.data?.y != null) {
        cursorSamples.push({ section: ev.sectionId, x: Number(ev.data.x), y: Number(ev.data.y), t: ev.ts })
      }
      if (ev.type === "text_select" && ev.data?.text) {
        const t = String(ev.data.text).trim()
        if (t.length > 1) newSelections.add(t.slice(0, 200))
      }
    }

    const totalTimeS       = (existing?.total_time_s ?? 0) + addedTimeS
    const sectionsViewed   = [...newSections]
    const totalSections    = TOTAL_SECTIONS[batch.pitchType] ?? 6
    const completionPct    = Math.min(100, (sectionsViewed.length / totalSections) * 100)
    const textSelections   = [...newSelections]

    const existingSamples  = (existing?.cursor_samples ?? []) as Array<{ section: string; x: number; y: number; t: number }>
    const allCursorSamples = [...existingSamples, ...cursorSamples].slice(-500)

    // Fetch agent_id from pitch on new sessions
    let agentId = existing?.agent_id ?? null
    let pitch: PitchRow | null = null
    if (!existing) {
      pitch = await queryOne<PitchRow>(
        `SELECT id, type, agent_id, lead_id, payload_json FROM pitches WHERE id = $1`,
        [batch.pitchId],
      )
      agentId = pitch?.agent_id ?? null
    }

    if (!existing) {
      await execute(
        `INSERT INTO document_sessions
           (pitch_id, pitch_type, session_id, contact_id, agent_id, viewer_ip, viewer_ua,
            total_time_s, sections_viewed, completion_pct, scroll_depth_pct,
            page_times_json, cursor_samples, text_selections, last_active_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
        [
          batch.pitchId, batch.pitchType, batch.sessionId,
          batch.contactId ?? null, agentId, ip, ua,
          totalTimeS, sectionsViewed, completionPct, maxScrollDepth,
          JSON.stringify(pageTimes), JSON.stringify(allCursorSamples), textSelections,
        ],
      )
    } else {
      await execute(
        `UPDATE document_sessions SET
           total_time_s = $1, sections_viewed = $2, completion_pct = $3,
           scroll_depth_pct = $4, page_times_json = $5, cursor_samples = $6,
           text_selections = $7, last_active_at = NOW()
         WHERE session_id = $8`,
        [
          totalTimeS, sectionsViewed, completionPct, maxScrollDepth,
          JSON.stringify(pageTimes), JSON.stringify(allCursorSamples),
          textSelections, batch.sessionId,
        ],
      )
    }

    // Insert raw events (fire-and-forget, non-fatal)
    for (const ev of batch.events) {
      execute(
        `INSERT INTO document_events (session_id, event_type, section_id, data, recorded_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5::bigint / 1000.0))`,
        [batch.sessionId, ev.type, ev.sectionId ?? null,
         ev.data ? JSON.stringify(ev.data) : null, ev.ts],
      ).catch(() => {/* non-fatal */})
    }

    // Compute new score delta
    const newDelta   = computeScoreDelta(batch.pitchType, totalTimeS, sectionsViewed, pageTimes, textSelections)
    const prevDelta  = existing?.lead_score_delta ?? 0

    if (newDelta !== prevDelta) {
      execute(
        `UPDATE document_sessions SET lead_score_delta = $1 WHERE session_id = $2`,
        [newDelta, batch.sessionId],
      ).catch(() => {/* non-fatal */})

      // Apply incremental delta to contact engagement_score
      const contactId = batch.contactId ?? existing?.contact_id
      if (contactId && newDelta > prevDelta) {
        const increment = newDelta - prevDelta
        execute(
          `UPDATE contacts SET engagement_score = COALESCE(engagement_score, 0) + $1 WHERE id = $2`,
          [increment, contactId],
        ).catch(() => {/* non-fatal */})
      }
    }

    // SMS: first open
    if (isFirstOpen) {
      void sendOpenSms(batch, pitch, agentId)
    }
    // SMS: high engagement threshold crossed
    if (newDelta >= 10 && prevDelta < 10) {
      void sendHighEngagementSms(agentId, totalTimeS, newDelta)
    }

  } catch (err) {
    console.error("[doc-track] error:", (err as Error).message)
  }
}

// ── SMS helpers ───────────────────────────────────────────────────────────────

async function sendOpenSms(
  batch: BatchPayload,
  pitch: PitchRow | null,
  agentId: string | null,
): Promise<void> {
  try {
    if (!agentId) return
    const agent = await queryOne<AgentRow>(
      `SELECT phone, name FROM agents WHERE id::text = $1 OR email = $1 LIMIT 1`,
      [agentId],
    )
    if (!agent?.phone) return

    const p       = pitch?.payload_json ?? {}
    const who     = (p.buyerName as string | undefined)
      ?? (p.vendorName as string | undefined)
      ?? "Someone"
    const addr    = (p as { property?: { address?: string } }).property?.address
      ?? (p.propertyAddress as string | undefined)
      ?? ""
    const docType = batch.pitchType === "buyer_brief" ? "buyer brief" : "appraisal"
    const msg     = `${who} just opened your ${docType}${addr ? ` for ${addr}` : ""}.`

    await sendSMS(agent.phone, msg)
  } catch {/* non-fatal */}
}

async function sendHighEngagementSms(
  agentId: string | null,
  totalTimeS: number,
  score: number,
): Promise<void> {
  try {
    if (!agentId) return
    const agent = await queryOne<AgentRow>(
      `SELECT phone, name FROM agents WHERE id::text = $1 OR email = $1 LIMIT 1`,
      [agentId],
    )
    if (!agent?.phone) return

    const mins = Math.round(totalTimeS / 60)
    const msg  = `High interest: lead spent ${mins > 0 ? `${mins}min` : `${totalTimeS}s`} reading your document. Lead score +${score}.`
    await sendSMS(agent.phone, msg)
  } catch {/* non-fatal */}
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Regular 5s flush — JSON body (already parsed by global express.json middleware)
router.post("/", handleBatch)

// sendBeacon flush — text/plain body (navigator.sendBeacon sends plain string)
router.post("/flush",
  express.raw({ type: ["text/plain", "application/octet-stream"], limit: "128kb" }),
  handleBatch,
)

// GET /api/doc-track/sessions/:pitchId — DocInsightsView uses this
router.get("/sessions/:pitchId", async (req: Request, res: Response) => {
  if (!isDbConnected()) return res.json({ sessions: [] })

  const sessions = await query<SessionRow>(
    `SELECT * FROM document_sessions WHERE pitch_id = $1 ORDER BY opened_at DESC LIMIT 50`,
    [req.params.pitchId],
  )
  res.json({ sessions })
})

// GET /api/doc-track/overview — all sessions for an agent (DocInsightsView global tab)
router.get("/overview", async (req: Request, res: Response) => {
  if (!isDbConnected()) return res.json({ rows: [] })

  const agentId = String(req.query.agentId ?? "")
  if (!agentId) return res.status(400).json({ error: "agentId required" })

  const rows = await query(
    `SELECT
       ds.pitch_id, ds.pitch_type, ds.session_id, ds.opened_at, ds.last_active_at,
       ds.total_time_s, ds.completion_pct, ds.lead_score_delta,
       ds.sections_viewed, ds.text_selections,
       p.payload_json->>'vendorName' AS vendor_name,
       p.payload_json->>'buyerName'  AS buyer_name,
       p.payload_json->'property'->>'address' AS property_address,
       p.payload_json->>'propertyAddress' AS property_address2,
       p.slug
     FROM document_sessions ds
     JOIN pitches p ON p.id = ds.pitch_id
     WHERE p.agent_id = $1
     ORDER BY ds.opened_at DESC
     LIMIT 200`,
    [agentId],
  )
  res.json({ rows })
})

// GET /api/doc-track/contact-summary — aggregate engagement for a contact
router.get("/contact-summary", async (req: Request, res: Response) => {
  if (!isDbConnected()) return res.json({ docsSent: 0, lastOpened: null, totalScore: 0 })

  const leadId = req.query.leadId as string | undefined
  const phone  = (req.query.phone as string | undefined)?.replace(/\s+/g, "")

  if (!leadId && !phone) return res.json({ docsSent: 0, lastOpened: null, totalScore: 0 })

  const rows = await query<{ docs_sent: number; last_opened: string | null; total_score: number }>(
    `SELECT
       COUNT(DISTINCT p.id)::int                  AS docs_sent,
       MAX(ds.opened_at)                          AS last_opened,
       COALESCE(SUM(ds.lead_score_delta), 0)::int AS total_score
     FROM pitches p
     LEFT JOIN document_sessions ds ON ds.pitch_id = p.id
     WHERE ($1::text IS NOT NULL AND p.lead_id = $1)
        OR ($2::text IS NOT NULL AND replace(p.payload_json->>'phone', ' ', '') = $2)`,
    [leadId ?? null, phone ?? null],
  )

  const r = rows[0] ?? { docs_sent: 0, last_opened: null, total_score: 0 }
  res.json({ docsSent: r.docs_sent, lastOpened: r.last_opened, totalScore: r.total_score })
})

export default router
