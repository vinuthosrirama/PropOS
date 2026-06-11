/**
 * Pitch Suite — Price Update pitches.
 *
 * POST /api/pitches              (authed)  — generate + create a pitch, returns slug
 * GET  /api/pitches/by-slug/:slug (public) — fetch a pitch for the public /p/:slug page
 * POST /api/pitches/:id/view      (public) — record a view (Realtair's "notified when opened")
 *
 * The two public routes are registered before requireAuth in index.ts.
 */

import { Router, type Request, type Response } from "express"
import { randomBytes } from "crypto"
import { query, queryOne, execute, isDbConnected } from "../lib/db.js"
import {
  generatePriceUpdatePitch,
  type PitchAgentInfo,
  type PitchCompSale,
  type PitchMarketStats,
  type PriceUpdatePayload,
} from "../lib/pitchGenerator.js"

const publicRouter = Router()
const authedRouter = Router()

interface PitchRow {
  id: string
  type: string
  slug: string
  agent_id: string
  lead_id: string | null
  property_ref: string | null
  payload_json: PriceUpdatePayload
  status: string
  view_count: number
  first_viewed_at: string | null
  last_viewed_at: string | null
  created_at: string
  regenerated_at: string | null
}

function makeSlug(): string {
  return randomBytes(6).toString("base64url")
}

// In-memory fallback store, used when DATABASE_URL isn't set (local/demo mode) —
// mirrors the "DB-free endpoint" pattern used elsewhere so /p/:slug works in dev.
const memPitches = new Map<string, PitchRow>()

// ── POST /api/pitches (authed) ──────────────────────────────────────────────
interface CreatePitchBody {
  type?: string
  leadId?: string
  propertyRef?: string
  agent: PitchAgentInfo
  recipientName: string
  propertyAddress: string
  suburb: string
  comparableSales?: PitchCompSale[]
  marketStats?: PitchMarketStats
  voiceContext?: string
  cachedCoverNote?: string
}

authedRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as CreatePitchBody
  const type = body.type ?? "price_update"

  if (type !== "price_update") {
    return res.status(400).json({ error: `Unsupported pitch type: ${type}` })
  }
  if (!body.agent || !body.recipientName || !body.propertyAddress || !body.suburb) {
    return res.status(400).json({ error: "Missing required fields: agent, recipientName, propertyAddress, suburb" })
  }

  const payload = await generatePriceUpdatePitch({
    agent: body.agent,
    recipientName: body.recipientName,
    propertyAddress: body.propertyAddress,
    suburb: body.suburb,
    comparableSales: body.comparableSales,
    marketStats: body.marketStats,
    voiceContext: body.voiceContext,
    cachedCoverNote: body.cachedCoverNote,
  })

  const agentId = req.agentId ? String(req.agentId) : "default"
  const slug = makeSlug()

  let row: PitchRow | null

  if (isDbConnected()) {
    row = await queryOne<PitchRow>(
      `INSERT INTO pitches (type, slug, agent_id, lead_id, property_ref, payload_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING *`,
      [type, slug, agentId, body.leadId ?? null, body.propertyRef ?? null, JSON.stringify(payload)],
    )
  } else {
    row = {
      id: slug,
      type, slug, agent_id: agentId,
      lead_id: body.leadId ?? null,
      property_ref: body.propertyRef ?? null,
      payload_json: payload,
      status: "draft",
      view_count: 0,
      first_viewed_at: null,
      last_viewed_at: null,
      created_at: new Date().toISOString(),
      regenerated_at: null,
    }
    memPitches.set(slug, row)
  }

  if (!row) return res.status(503).json({ error: "Database not available" })

  // Always resolve to the production domain — req.headers.origin/host can be a
  // Railway internal hostname or a Cloudflare *.pages.dev preview URL, neither
  // of which the recipient can reach.
  const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
  res.json({ id: row.id, slug: row.slug, type: row.type, payload, url: `${base}/p/${row.slug}` })
})

// ── GET /api/pitches/by-slug/:slug (public) ─────────────────────────────────
publicRouter.get("/by-slug/:slug", async (req: Request, res: Response) => {
  const row = isDbConnected()
    ? await queryOne<PitchRow>(`SELECT * FROM pitches WHERE slug = $1`, [req.params.slug])
    : memPitches.get(req.params.slug) ?? null
  if (!row) return res.status(404).json({ error: "Pitch not found" })

  res.json({
    id: row.id,
    type: row.type,
    payload: row.payload_json,
    status: row.status,
    viewCount: row.view_count,
    createdAt: row.created_at,
  })
})

// ── POST /api/pitches/:id/view (public) ─────────────────────────────────────
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

  await execute(`UPDATE pitches SET status = 'viewed' WHERE id = $1`, [id]).catch(() => { /* non-fatal */ })

  res.json({ ok: true })
})

// ── GET /api/pitches (authed) — list pitches for the current agent ─────────
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

export { publicRouter, authedRouter }
