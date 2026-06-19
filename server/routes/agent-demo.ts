import { Router } from "express"
import { query, isDbConnected } from "../lib/db.js"

const router = Router()

// ── GET /api/agent-demo/portfolio ────────────────────────────────────────────
// Returns { sold: PortfolioProperty[], active: PortfolioProperty[] } from DB.
// Returns HTTP 204 (no content) when the agent has no DB portfolio — DemoView
// falls back to hardcoded Cameron data in that case.
router.get("/portfolio", async (req, res) => {
  if (!isDbConnected() || req.agentId === undefined) return res.sendStatus(204)

  const rows = await query<{
    id: number; address: string; suburb: string; state: string; postcode: string | null
    price: number; price_min: number | null; price_max: number | null
    beds: number; baths: number; cars: number; land_sqm: number | null
    property_type: string; status: string
    sold_date: string | null; open_date: string | null; lead_count: number
    image_url: string | null; description: string | null
  }>(
    `SELECT id, address, suburb, state, postcode, price, price_min, price_max,
            beds, baths, cars, land_sqm, property_type, status,
            sold_date, open_date, lead_count, image_url, description
     FROM agent_portfolios
     WHERE agent_id = $1
     ORDER BY status DESC, sold_date DESC NULLS LAST`,
    [req.agentId],
  )

  if (rows.length === 0) return res.sendStatus(204)

  const toProperty = (r: typeof rows[0]) => ({
    id:          r.id,
    address:     r.address,
    suburb:      r.suburb,
    state:       r.state,
    postcode:    r.postcode ?? "",
    price:       r.price,
    priceMin:    r.price_min ?? undefined,
    priceMax:    r.price_max ?? undefined,
    beds:        r.beds,
    baths:       r.baths,
    cars:        r.cars,
    land:        r.land_sqm ?? undefined,
    type:        r.property_type as "House" | "Unit" | "Townhouse",
    status:      r.status as "sold" | "active" | "under_order",
    soldDate:    r.sold_date ?? undefined,
    openDate:    r.open_date ?? undefined,
    image:       r.image_url ?? `/property-${r.id}.jpg`,
    description: r.description ?? "",
    leadCount:   r.lead_count,
  })

  const sold   = rows.filter(r => r.status === "sold").map(toProperty)
  const active = rows.filter(r => r.status !== "sold").map(toProperty)

  res.json({ sold, active })
})

// ── GET /api/agent-demo/slm/:portfolioId ─────────────────────────────────────
// Returns the SLM JSON for one listing, or 204 if not generated yet.
router.get("/slm/:portfolioId", async (req, res) => {
  if (!isDbConnected()) return res.sendStatus(204)

  const portfolioId = parseInt(req.params.portfolioId, 10)
  if (isNaN(portfolioId)) return res.status(400).json({ error: "invalid portfolioId" })

  const rows = await query<{ slm_json: Record<string, unknown> }>(
    `SELECT slm_json FROM agent_property_slm WHERE portfolio_id = $1 LIMIT 1`,
    [portfolioId],
  )

  if (rows.length === 0) return res.sendStatus(204)
  res.json(rows[0].slm_json)
})

// ── GET /api/agent-demo/leads ─────────────────────────────────────────────────
// Returns demo buyer contacts assigned to this agent (cloned from Cameron's buyers).
// Returns 204 if none found — DemoView falls back to DEMO_FALLBACK_LEADS.
router.get("/leads", async (req, res) => {
  if (!isDbConnected() || req.agentId === undefined) return res.sendStatus(204)

  const rows = await query<{
    id: number; name: string; phone: string; email: string | null
    rea_data: Record<string, unknown>; buyer_profile: Record<string, unknown>
    stage: string; status: string
  }>(
    `SELECT id, name, phone, email, rea_data, buyer_profile, stage, status
     FROM sms_contacts
     WHERE assigned_agent_id = $1
     ORDER BY id`,
    [req.agentId],
  )

  if (rows.length === 0) return res.sendStatus(204)
  res.json({ leads: rows })
})

// ── GET /api/agent-demo/theme ─────────────────────────────────────────────────
// Returns brand colours for the agent, or 204 if not set.
router.get("/theme", async (req, res) => {
  if (!isDbConnected() || req.agentId === undefined) return res.sendStatus(204)

  const rows = await query<{
    brand_primary: string | null; brand_accent: string | null
    brand_logo: string | null; brand_gradient: string[] | null
    agency: string
  }>(
    `SELECT brand_primary, brand_accent, brand_logo, brand_gradient, agency
     FROM agents WHERE id = $1`,
    [req.agentId],
  )

  const agent = rows[0]
  if (!agent || !agent.brand_primary) return res.sendStatus(204)

  res.json({
    primary:  agent.brand_primary,
    accent:   agent.brand_accent ?? agent.brand_primary,
    logo:     agent.brand_logo ?? agent.agency.slice(0, 2).toUpperCase(),
    gradient: agent.brand_gradient ?? [agent.brand_primary, agent.brand_primary],
  })
})

export default router
