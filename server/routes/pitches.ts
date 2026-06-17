/**
 * Pitch Suite routes.
 *
 * Public routes (registered before requireAuth in index.ts):
 *   GET  /api/pitches/by-slug/:slug    — fetch pitch for /p/:slug page
 *   POST /api/pitches/:id/view         — record a view
 *   POST /api/pitches/:token/accept    — vendor/buyer accepts the proposal
 *
 * Authed routes (registered after requireAuth):
 *   POST /api/pitches                  — generate + create a price_update pitch
 *   POST /api/pitches/appraisal        — generate an instant CMA appraisal pitch
 *   POST /api/pitches/:id/send-email   — email pitch link to vendor
 *   GET  /api/pitches                  — list pitches for the current agent
 *   GET  /api/vendor-reports           — list vendor reports for the current agent
 *   POST /api/vendor-reports/generate  — manually trigger a vendor report
 *   POST /api/vendor-reports/:id/send  — resend a failed/draft vendor report
 */

import { Router, type Request, type Response } from "express"
import { randomBytes } from "crypto"
import { query, queryOne, execute, isDbConnected } from "../lib/db.js"
import {
  generatePriceUpdatePitch,
  type PitchAgentInfo,
  type PitchCompSale,
  type PitchMarketStats,
  type PitchBuyerDemand,
  type PriceUpdatePayload,
  type AppraisalPayload,
  type AppraisalProperty,
} from "../lib/pitchGenerator.js"
import { generateAppraisalPayload } from "../lib/appraisalGenerator.js"
import { sendVendorReport, runWeeklyVendorReports, type VendorReportContext, type VendorReportRow } from "../lib/vendorReportGenerator.js"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"

const publicRouter  = Router()
const authedRouter  = Router()

// ── Types ──────────────────────────────────────────────────────────────────────

interface PitchRow {
  id:              string
  type:            string
  slug:            string
  agent_id:        string
  lead_id:         string | null
  property_ref:    string | null
  payload_json:    PriceUpdatePayload | AppraisalPayload | Record<string, unknown>
  status:          string
  view_count:      number
  first_viewed_at: string | null
  last_viewed_at:  string | null
  created_at:      string
  regenerated_at:  string | null
  // acceptance
  accepted_at:      string | null
  accepted_by:      string | null
  accepted_ip:      string | null
  acceptance_token: string | null
  // vendor
  vendor_email:     string | null
  vendor_name:      string | null
}

function makeSlug(): string {
  return randomBytes(6).toString("base64url")
}

// In-memory fallback for DB-free (demo/dev) mode
const memPitches = new Map<string, PitchRow>()

// ── GET /api/pitches/by-slug/:slug  (public) ──────────────────────────────────

publicRouter.get("/by-slug/:slug", async (req: Request, res: Response) => {
  const row = isDbConnected()
    ? await queryOne<PitchRow>(`SELECT * FROM pitches WHERE slug = $1`, [req.params.slug])
    : memPitches.get(req.params.slug) ?? null
  if (!row) return res.status(404).json({ error: "Pitch not found" })

  res.json({
    id:              row.id,
    type:            row.type,
    payload:         row.payload_json,
    status:          row.status,
    viewCount:       row.view_count,
    createdAt:       row.created_at,
    // acceptance (frontend needs token to post accept, name/time to show confirmed state)
    acceptanceToken: row.acceptance_token ?? null,
    acceptedAt:      row.accepted_at ?? null,
    acceptedBy:      row.accepted_by ?? null,
    // vendor
    vendorEmail:     row.vendor_email ?? null,
    vendorName:      row.vendor_name ?? null,
  })
})

// ── POST /api/pitches/:id/view  (public) ─────────────────────────────────────

publicRouter.post("/:id/view", async (req: Request, res: Response) => {
  const { id } = req.params

  if (!isDbConnected()) {
    const row = memPitches.get(id)
    if (!row) return res.status(404).json({ error: "Pitch not found" })
    row.view_count += 1
    row.last_viewed_at = new Date().toISOString()
    row.first_viewed_at = row.first_viewed_at ?? row.last_viewed_at
    row.status = "viewed"
    return res.json({ ok: true })
  }

  const updated = await execute(
    `UPDATE pitches
     SET view_count = view_count + 1,
         last_viewed_at = NOW(),
         first_viewed_at = COALESCE(first_viewed_at, NOW()),
         status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END
     WHERE id = $1`,
    [id],
  )
  if (updated === 0) return res.status(404).json({ error: "Pitch not found" })
  await execute(`UPDATE pitches SET status = 'viewed' WHERE id = $1 AND status != 'accepted'`, [id]).catch(() => {/* non-fatal */})
  res.json({ ok: true })
})

// ── POST /api/pitches/:token/accept  (public) ─────────────────────────────────
// Proposal e-acceptance: captures name + timestamp + IP as an audit trail.
// NOT a legally-binding e-signature — see disclaimer in frontend modal.

publicRouter.post("/:token/accept", async (req: Request, res: Response) => {
  const { token } = req.params
  const name = (req.body?.name ?? "").toString().trim()

  if (!name) return res.status(400).json({ error: "Full name is required" })
  if (name.length > 200) return res.status(400).json({ error: "Name too long" })

  if (!isDbConnected()) {
    // In-memory mode: find pitch by acceptance_token (which we store as the slug in mem mode)
    const row = [...memPitches.values()].find(r => (r.acceptance_token ?? r.slug) === token)
    if (!row) return res.status(404).json({ error: "Proposal not found" })
    if (row.status === "accepted") return res.json({ ok: true, acceptedAt: row.accepted_at, acceptedBy: row.accepted_by })
    row.accepted_at = new Date().toISOString()
    row.accepted_by = name
    row.status = "accepted"
    return res.json({ ok: true, acceptedAt: row.accepted_at, acceptedBy: name })
  }

  const pitch = await queryOne<PitchRow>(
    `SELECT id, slug, agent_id, status, accepted_at, accepted_by, payload_json FROM pitches WHERE acceptance_token = $1`,
    [token],
  )
  if (!pitch) return res.status(404).json({ error: "Proposal not found" })

  // Idempotent — return existing acceptance record if already accepted
  if (pitch.status === "accepted") {
    return res.json({ ok: true, acceptedAt: pitch.accepted_at, acceptedBy: pitch.accepted_by })
  }

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "unknown").trim()

  await execute(
    `UPDATE pitches
     SET status = 'accepted', accepted_at = NOW(), accepted_by = $1, accepted_ip = $2
     WHERE acceptance_token = $3`,
    [name, ip, token],
  )

  const acceptedAt = new Date().toISOString()

  // Notify agent via email (non-fatal)
  if (gmailConfigured()) {
    const payload = pitch.payload_json as PriceUpdatePayload
    const address = (payload as PriceUpdatePayload).recipient?.propertyAddress
      ?? (payload as AppraisalPayload & { property?: { address?: string } }).property?.address
      ?? "your property"
    const agentEmail = (payload as PriceUpdatePayload).agentCard?.email
    if (agentEmail) {
      const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
      sendEmail({
        to:       agentEmail,
        fromName: "PropOS",
        subject:  `Proposal accepted by ${name}`,
        htmlBody: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#7B35BE">Proposal accepted</h2>
          <p><strong>${name}</strong> has accepted your proposal for <strong>${address}</strong>.</p>
          <p style="color:#666">Accepted at: ${new Date(acceptedAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })} AEST</p>
          <p style="color:#666">IP address: ${ip}</p>
          <p><a href="${base}/p/${pitch.slug}" style="color:#7B35BE">View the proposal</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="font-size:12px;color:#999">This notification was sent by PropOS. The acceptance is an evidentiary record only, not a legally binding signature.</p>
        </div>`,
      }).catch(() => {/* non-fatal */})
    }
  }

  res.json({ ok: true, acceptedAt, acceptedBy: name })
})

// ── POST /api/pitches  (authed) — price_update pitch ─────────────────────────

interface CreatePitchBody {
  type?:          string
  leadId?:        string
  propertyRef?:   string
  vendorEmail?:   string
  vendorName?:    string
  agent:          PitchAgentInfo
  recipientName:  string
  propertyAddress: string
  suburb:         string
  comparableSales?: PitchCompSale[]
  marketStats?:   PitchMarketStats
  buyerDemand?:   PitchBuyerDemand
  voiceContext?:  string
  cachedCoverNote?: string
}

authedRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as CreatePitchBody
  const type = body.type ?? "price_update"

  if (type === "appraisal") {
    // Redirect to appraisal handler — POST /api/pitches/appraisal
    return res.status(400).json({ error: "Use POST /api/pitches/appraisal for appraisal pitches" })
  }

  if (!["price_update", "listing_proposal", "digital_intro"].includes(type)) {
    return res.status(400).json({ error: `Unsupported pitch type: ${type}` })
  }
  if (!body.agent || !body.recipientName || !body.propertyAddress || !body.suburb) {
    return res.status(400).json({ error: "Missing required fields: agent, recipientName, propertyAddress, suburb" })
  }

  const payload = await generatePriceUpdatePitch({
    agent:          body.agent,
    recipientName:  body.recipientName,
    propertyAddress: body.propertyAddress,
    suburb:         body.suburb,
    comparableSales: body.comparableSales,
    marketStats:    body.marketStats,
    buyerDemand:    body.buyerDemand,
    voiceContext:   body.voiceContext,
    cachedCoverNote: body.cachedCoverNote,
  })

  const agentId = req.agentId ? String(req.agentId) : "default"
  const slug    = makeSlug()

  let row: PitchRow | null

  if (isDbConnected()) {
    row = await queryOne<PitchRow>(
      `INSERT INTO pitches (type, slug, agent_id, lead_id, property_ref, payload_json, status, vendor_email, vendor_name)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
       RETURNING *`,
      [type, slug, agentId, body.leadId ?? null, body.propertyRef ?? null,
       JSON.stringify(payload), body.vendorEmail ?? null, body.vendorName ?? null],
    )
  } else {
    row = {
      id: slug, type, slug, agent_id: agentId,
      lead_id: body.leadId ?? null, property_ref: body.propertyRef ?? null,
      payload_json: payload, status: "draft", view_count: 0,
      first_viewed_at: null, last_viewed_at: null,
      created_at: new Date().toISOString(), regenerated_at: null,
      accepted_at: null, accepted_by: null, accepted_ip: null,
      acceptance_token: slug,
      vendor_email: body.vendorEmail ?? null, vendor_name: body.vendorName ?? null,
    }
    memPitches.set(slug, row)
  }

  if (!row) return res.status(503).json({ error: "Database not available" })

  const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
  res.json({ id: row.id, slug: row.slug, type: row.type, payload, url: `${base}/p/${row.slug}` })
})

// ── POST /api/pitches/appraisal  (authed) — instant CMA ──────────────────────

interface AppraisalBody {
  agent:          PitchAgentInfo
  address:        string
  suburb:         string
  beds:           number
  baths:          number
  parking:        number
  propertyType:   "House" | "Unit" | "Townhouse"
  landSqm?:       number
  comparableSales?: PitchCompSale[]
  vendorEmail?:   string
  vendorName?:    string
}

authedRouter.post("/appraisal", async (req: Request, res: Response) => {
  const body = req.body as AppraisalBody

  if (!body.agent || !body.address || !body.suburb) {
    return res.status(400).json({ error: "Missing required fields: agent, address, suburb" })
  }
  if (!body.beds || !body.propertyType) {
    return res.status(400).json({ error: "Missing required fields: beds, propertyType" })
  }
  if (!["House", "Unit", "Townhouse"].includes(body.propertyType)) {
    return res.status(400).json({ error: "propertyType must be House, Unit, or Townhouse" })
  }

  const property: AppraisalProperty = {
    address:      body.address,
    suburb:       body.suburb,
    beds:         Number(body.beds),
    baths:        Number(body.baths) || 1,
    parking:      Number(body.parking) || 0,
    landSqm:      body.landSqm,
    propertyType: body.propertyType,
  }

  let payload: AppraisalPayload
  try {
    payload = await generateAppraisalPayload({
      property,
      agent:          body.agent,
      comparableSales: body.comparableSales,
    })
  } catch (err) {
    return res.status(500).json({ error: `Appraisal generation failed: ${(err as Error).message}` })
  }

  const agentId = req.agentId ? String(req.agentId) : "default"
  const slug    = makeSlug()

  let row: PitchRow | null

  if (isDbConnected()) {
    row = await queryOne<PitchRow>(
      `INSERT INTO pitches (type, slug, agent_id, payload_json, status, vendor_email, vendor_name)
       VALUES ('appraisal', $1, $2, $3, 'draft', $4, $5)
       RETURNING *`,
      [slug, agentId, JSON.stringify(payload), body.vendorEmail ?? null, body.vendorName ?? null],
    )
  } else {
    row = {
      id: slug, type: "appraisal", slug, agent_id: agentId,
      lead_id: null, property_ref: null,
      payload_json: payload, status: "draft", view_count: 0,
      first_viewed_at: null, last_viewed_at: null,
      created_at: new Date().toISOString(), regenerated_at: null,
      accepted_at: null, accepted_by: null, accepted_ip: null,
      acceptance_token: slug,
      vendor_email: body.vendorEmail ?? null, vendor_name: body.vendorName ?? null,
    }
    memPitches.set(slug, row)
  }

  if (!row) return res.status(503).json({ error: "Database not available" })

  const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
  res.json({ id: row.id, slug: row.slug, type: "appraisal", payload, url: `${base}/p/${row.slug}` })
})

// ── POST /api/pitches/:id/send-email  (authed) ────────────────────────────────

authedRouter.post("/:id/send-email", async (req: Request, res: Response) => {
  const { id } = req.params
  const to: string = (req.body?.to ?? "").toString().trim()
  const subject: string = (req.body?.subject ?? "").toString().trim() || "Your property report from PropOS"

  if (!to || !to.includes("@")) return res.status(400).json({ error: "Valid email address required" })
  if (!gmailConfigured()) return res.status(503).json({ error: "Email not configured on this server" })

  const pitch = isDbConnected()
    ? await queryOne<PitchRow>(`SELECT * FROM pitches WHERE id = $1`, [id])
    : memPitches.get(id) ?? null
  if (!pitch) return res.status(404).json({ error: "Pitch not found" })

  const payload  = pitch.payload_json as (PriceUpdatePayload & AppraisalPayload & Record<string, unknown>)
  const agentName = (payload.agentCard as PitchAgentInfo | undefined)?.name ?? "Your agent"
  const base      = process.env.BASE_URL ?? "https://propos.addvantage.site"
  const pitchUrl  = `${base}/p/${pitch.slug}`
  const address   = (payload.recipient as { propertyAddress?: string } | undefined)?.propertyAddress
    ?? (payload.property as { address?: string } | undefined)?.address
    ?? "your property"

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#7B35BE">Your property report</h2>
      <p>${address}</p>
      <p><a href="${pitchUrl}" style="display:inline-block;background:linear-gradient(135deg,#7B35BE,#3f0278);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
        View your report
      </a></p>
      <p style="color:#888;font-size:13px">Link: ${pitchUrl}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:12px;color:#aaa">Sent by ${agentName} via PropOS by AddVantage AI</p>
    </div>`

  try {
    const result = await sendEmail({ to, fromName: agentName, subject, htmlBody })

    // Store vendor email on pitch for weekly reports
    if (isDbConnected()) {
      await execute(
        `UPDATE pitches SET vendor_email = COALESCE(vendor_email, $1) WHERE id = $2`,
        [to, id],
      ).catch(() => {/* non-fatal */})
    }

    res.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    res.status(500).json({ error: `Email send failed: ${(err as Error).message}` })
  }
})

// ── GET /api/pitches  (authed) — list ─────────────────────────────────────────

authedRouter.get("/", async (req: Request, res: Response) => {
  const agentId = req.agentId ? String(req.agentId) : "default"

  if (!isDbConnected()) {
    const rows = [...memPitches.values()]
      .filter(r => r.agent_id === agentId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return res.json({ pitches: rows })
  }

  const rows = await query<PitchRow>(
    `SELECT * FROM pitches WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [agentId],
  )
  res.json({ pitches: rows })
})

// ── Vendor report endpoints (authed) ──────────────────────────────────────────

// GET /api/vendor-reports
authedRouter.get("/vendor-reports", async (req: Request, res: Response) => {
  const agentId = req.agentId ? String(req.agentId) : "default"
  if (!isDbConnected()) return res.json({ reports: [] })

  const reports = await query<VendorReportRow>(
    `SELECT vr.*, p.slug as pitch_slug
     FROM vendor_reports vr
     JOIN pitches p ON p.id = vr.pitch_id
     WHERE vr.agent_id = $1
     ORDER BY vr.created_at DESC
     LIMIT 100`,
    [agentId],
  )
  res.json({ reports })
})

// POST /api/vendor-reports/generate  — manual trigger for a specific pitch
authedRouter.post("/vendor-reports/generate", async (req: Request, res: Response) => {
  const pitchId: string = (req.body?.pitchId ?? "").toString().trim()
  if (!pitchId) return res.status(400).json({ error: "pitchId required" })
  if (!gmailConfigured()) return res.status(503).json({ error: "Gmail not configured" })

  const pitch = await queryOne<PitchRow>(`SELECT * FROM pitches WHERE id = $1`, [pitchId])
  if (!pitch) return res.status(404).json({ error: "Pitch not found" })
  if (!pitch.vendor_email) return res.status(400).json({ error: "No vendor email on this pitch" })

  const p = pitch.payload_json as PriceUpdatePayload
  const refDate  = pitch.first_viewed_at ?? pitch.created_at
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000))
  const weekNumber = Math.max(1, Math.ceil(daysSince / 7))

  const ctx: VendorReportContext = {
    pitchId:         pitch.id,
    slug:            pitch.slug,
    propertyAddress: p.recipient?.propertyAddress ?? "Your property",
    suburb:          p.recipient?.suburb ?? "",
    agentCard:       p.agentCard ?? { name: "Your agent", agency: "", suburb: "" },
    vendorName:      pitch.vendor_name ?? "Valued client",
    vendorEmail:     pitch.vendor_email,
    weekNumber,
    viewCount:       pitch.view_count,
    firstViewedAt:   pitch.first_viewed_at,
    lastViewedAt:    pitch.last_viewed_at,
    comparableSales: p.comparableSales ?? [],
  }

  try {
    await sendVendorReport(ctx)
    res.json({ ok: true, weekNumber, to: pitch.vendor_email })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/vendor-reports/:id/send  — resend a failed/draft report
authedRouter.post("/vendor-reports/:id/send", async (req: Request, res: Response) => {
  if (!isDbConnected()) return res.status(503).json({ error: "Database not available" })
  if (!gmailConfigured()) return res.status(503).json({ error: "Gmail not configured" })

  const report = await queryOne<VendorReportRow & { pitch_slug: string }>(
    `SELECT vr.*, p.slug as pitch_slug, p.payload_json, p.vendor_email, p.vendor_name,
            p.view_count, p.first_viewed_at, p.last_viewed_at
     FROM vendor_reports vr JOIN pitches p ON p.id = vr.pitch_id
     WHERE vr.id = $1`,
    [req.params.id],
  )
  if (!report) return res.status(404).json({ error: "Report not found" })

  const pitch = await queryOne<PitchRow>(`SELECT * FROM pitches WHERE id = $1`, [report.pitch_id])
  if (!pitch?.vendor_email) return res.status(400).json({ error: "No vendor email on this pitch" })

  const p = pitch.payload_json as PriceUpdatePayload

  const ctx: VendorReportContext = {
    pitchId:         pitch.id,
    slug:            pitch.slug,
    propertyAddress: p.recipient?.propertyAddress ?? "Your property",
    suburb:          p.recipient?.suburb ?? "",
    agentCard:       p.agentCard ?? { name: "Your agent", agency: "", suburb: "" },
    vendorName:      pitch.vendor_name ?? "Valued client",
    vendorEmail:     pitch.vendor_email,
    weekNumber:      report.week_number,
    viewCount:       pitch.view_count,
    firstViewedAt:   pitch.first_viewed_at,
    lastViewedAt:    pitch.last_viewed_at,
    comparableSales: p.comparableSales ?? [],
  }

  try {
    await sendVendorReport(ctx)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── GET /api/vendor-reports/:id  (authed) — fetch report HTML ─────────────────
authedRouter.get("/vendor-reports/:id", async (req: Request, res: Response) => {
  if (!isDbConnected()) return res.status(503).json({ error: "Database not available" })
  const report = await queryOne<VendorReportRow>(`SELECT * FROM vendor_reports WHERE id = $1`, [req.params.id])
  if (!report) return res.status(404).json({ error: "Report not found" })
  res.json(report)
})

// ── POST /api/pitches/buyer-brief  (authed) ───────────────────────────────────
// Create a BuyerOS brief connecting an open-home contact to a matched listing.

interface BuyerBriefBody {
  contactId:       number
  agentId:         string
  propertyAddress: string
  suburb:          string
  beds:            number
  baths:           number
  parking?:        number
  propertyType:    string
  landSqm?:        number
  priceGuide?:     { low: number; high: number }
  inspectionTimes?: string[]
  keyFeatures?:    string[]
  comparableSales?: Array<{ address: string; price: number; date: string; beds: number; baths?: number; land?: number }>
  matchReason?:    string
  listingUrl?:     string
}

authedRouter.post("/buyer-brief", async (req: Request, res: Response) => {
  const body = req.body as BuyerBriefBody

  if (!body.contactId || !body.propertyAddress || !body.suburb) {
    return res.status(400).json({ error: "contactId, propertyAddress, and suburb are required" })
  }

  const agentId = (req as Request & { agentId?: string }).agentId ?? body.agentId
  if (!agentId) return res.status(401).json({ error: "Missing agent" })

  // Look up agent card from agents table (or fall back to a minimal card)
  let agentCard: PitchAgentInfo = { name: "Your Agent", agency: "", suburb: "" }
  if (isDbConnected()) {
    const agentRow = await queryOne<{ name: string; agency: string; suburb: string; phone: string; email: string }>(
      `SELECT name, agency, suburb, phone, email FROM agents WHERE id = $1`,
      [agentId],
    ).catch(() => null)
    if (agentRow) agentCard = { name: agentRow.name, agency: agentRow.agency, suburb: agentRow.suburb, phone: agentRow.phone, email: agentRow.email }
  }

  // Look up buyer name from contacts
  let buyerName = "there"
  if (isDbConnected()) {
    const contact = await queryOne<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM contacts WHERE id = $1`,
      [body.contactId],
    ).catch(() => null)
    if (contact) buyerName = `${contact.first_name} ${contact.last_name}`.trim()
  }

  const payload = {
    buyerName,
    propertyAddress: body.propertyAddress,
    suburb:          body.suburb,
    beds:            body.beds,
    baths:           body.baths,
    parking:         body.parking,
    propertyType:    body.propertyType,
    landSqm:         body.landSqm,
    priceGuide:      body.priceGuide,
    inspectionTimes: body.inspectionTimes,
    keyFeatures:     body.keyFeatures,
    comparableSales: body.comparableSales,
    matchReason:     body.matchReason,
    agentCard,
    listingUrl:      body.listingUrl,
  }

  const slug = makeSlug()
  const pitchId = crypto.randomUUID()

  if (isDbConnected()) {
    await execute(
      `INSERT INTO pitches (id, type, slug, agent_id, lead_id, payload_json, status, acceptance_token)
       VALUES ($1, 'buyer_brief', $2, $3, $4, $5, 'draft', NULL)`,
      [pitchId, slug, agentId, String(body.contactId), JSON.stringify(payload)],
    )
  } else {
    const now = new Date().toISOString()
    memPitches.set(slug, {
      id: pitchId, type: "buyer_brief", slug, agent_id: agentId,
      lead_id: String(body.contactId), property_ref: null,
      payload_json: payload,
      status: "draft", view_count: 0,
      first_viewed_at: null, last_viewed_at: null,
      created_at: now, regenerated_at: null,
      accepted_at: null, accepted_by: null, accepted_ip: null, acceptance_token: null,
      vendor_email: null, vendor_name: null,
    })
  }

  const baseUrl = process.env.FRONTEND_URL ?? "https://propos.addvantage.site"
  res.json({ ok: true, slug, pitchId, url: `${baseUrl}/p/${slug}` })
})

// ── GET /api/pitches/buyer-brief/matches  (authed) ────────────────────────────
// Returns CRM contacts for the agent with engagement data, for the match queue UI.
// Frontend does the contact×listing scoring using PORTFOLIO_ACTIVE.

interface BuyerCandidateRow {
  id:            number
  firstName:     string
  lastName:      string
  name:          string
  phone:         string | null
  email:         string | null
  leadType:      string
  suburb:        string | null
  address:       string | null
  beds:          number | null
  baths:         number | null
  priceRangeMin: number | null
  priceRangeMax: number | null
  openHomeDate:  string | null
  notes:         string | null
  questionsAsked: string | null
  docsSent:      number
  lastOpened:    string | null
  totalScore:    number
}

authedRouter.get("/buyer-brief/matches", async (req: Request, res: Response) => {
  const agentName = (req.query.agentName as string) || "Cameron Knoll"

  if (!isDbConnected()) return res.json({ candidates: [] })

  const candidates = await query<BuyerCandidateRow>(`
    SELECT
      c.id,
      c.lead_first_name                              AS "firstName",
      c.lead_last_name                               AS "lastName",
      (c.lead_first_name || ' ' || c.lead_last_name) AS name,
      c.lead_phone                                   AS phone,
      c.lead_email                                   AS email,
      c.lead_type                                    AS "leadType",
      c.property_suburb                              AS suburb,
      c.property_address                             AS address,
      c.property_beds                                AS beds,
      c.property_baths                               AS baths,
      c.price_range_min                              AS "priceRangeMin",
      c.price_range_max                              AS "priceRangeMax",
      c.open_home_date                               AS "openHomeDate",
      c.notes,
      c.questions_asked                              AS "questionsAsked",
      COUNT(DISTINCT p.id)::int                      AS "docsSent",
      MAX(ds.opened_at)                              AS "lastOpened",
      COALESCE(SUM(ds.lead_score_delta), 0)::int     AS "totalScore"
    FROM "PropOS_democontacts" c
    LEFT JOIN pitches p  ON p.lead_id = c.id::text
    LEFT JOIN document_sessions ds ON ds.pitch_id = p.id
    WHERE c.rea_agent_name ILIKE $1
      AND c.lead_type IN ('open_home_attendee', 'previous_buyer', 'prospective_buyer')
    GROUP BY c.id
    ORDER BY "totalScore" DESC, c.open_home_date DESC NULLS LAST, c.id ASC
    LIMIT 100
  `, [agentName])

  res.json({ candidates })
})

export { publicRouter, authedRouter }
