/**
 * GET /api/crm/leads
 *
 * Reads open-home attendees and buyer leads directly from PropOS_democontacts
 * in Supabase. Maps each row to the SheetLead shape that DemoView expects,
 * so the app shows live Supabase data instead of hardcoded DEMO_FALLBACK_LEADS.
 *
 * Authed — caller must supply valid JWT (requireAuth middleware).
 */

import { Router, type Request, type Response } from "express"
import { query, isDbConnected } from "../lib/db.js"

const router = Router()

interface DemoContactRow {
  id:                  number
  rea_agent_name:      string
  lead_first_name:     string
  lead_last_name:      string
  lead_phone:          string | null
  lead_email:          string | null
  lead_type:           string
  buyer_status:        string | null
  property_address:    string | null
  property_suburb:     string | null
  price_range_min:     number | null
  price_range_max:     number | null
  open_home_date:      string | null
  notes:               string | null
  personalisation_hook: string | null
  questions_asked:     string | null
  property_beds:       number | null
  property_type:       string | null
  purchase_price:      number | null
  purchase_date:       string | null
}

function mapLeadType(leadType: string): string {
  switch (leadType) {
    case "open_home_attendee": return "Family buyer"
    case "previous_buyer":     return "Past client"
    case "prospective_buyer":  return "Prospective buyer"
    case "prospective_vendor": return "Prospective vendor"
    case "auction_attendee":   return "Auction attendee"
    default:                   return leadType
  }
}

function parseQuestions(raw: string | null): string[] {
  if (!raw) return []
  // Support JSON array or newline-delimited
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return raw.split(/\n|;/).map(s => s.trim()).filter(Boolean)
}

// GET /api/crm/leads?agentName=Cameron+Knoll
router.get("/", async (req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json({ leads: [], source: "no-db" })
  }

  // Resolve agent name — try agent's own record, or use query param
  const agentNameParam = (req.query.agentName as string | undefined)?.trim()
  let agentName = agentNameParam ?? ""

  if (!agentName) {
    // Look up the calling agent's name from the agents table
    try {
      const agent = await query<{ name: string }>(
        `SELECT name FROM agents WHERE id = $1 LIMIT 1`,
        [String((req as Request & { agentId?: string }).agentId ?? "")],
      )
      agentName = agent[0]?.name ?? ""
    } catch {}
  }

  try {
    const rows = await query<DemoContactRow>(
      `SELECT id, rea_agent_name, lead_first_name, lead_last_name,
              lead_phone, lead_email, lead_type, buyer_status,
              property_address, property_suburb,
              price_range_min, price_range_max,
              open_home_date, notes, personalisation_hook, questions_asked,
              property_beds, property_type, purchase_price, purchase_date
       FROM "PropOS_democontacts"
       WHERE ($1 = '' OR rea_agent_name ILIKE $1)
       ORDER BY id ASC`,
      [agentName || ""],
    )

    const leads = rows.map(r => {
      const name = `${r.lead_first_name} ${r.lead_last_name}`.trim()
      const inspectedAddr = [r.property_address, r.property_suburb]
        .filter(Boolean).join(", ")

      // Budget: for previous buyers use purchase_price; for prospects use price_range_max
      const budget =
        r.purchase_price
          ? Number(r.purchase_price)
          : r.price_range_max
            ? Number(r.price_range_max)
            : 0

      const notes = [r.notes, r.personalisation_hook]
        .filter(Boolean).join("\n")

      return {
        id:               String(r.id),
        name,
        firstName:        r.lead_first_name,
        lastName:         r.lead_last_name,
        phone:            r.lead_phone ?? "",
        email:            r.lead_email ?? "",
        budget,
        budgetMin:        r.price_range_min ?? 0,
        timeline:         r.lead_type === "open_home_attendee" ? "1 to 4 weeks" : "flexible",
        persona:          mapLeadType(r.lead_type),
        notes,
        inspectedProperty: inspectedAddr || "Berwick VIC",
        lastContact:       r.open_home_date ?? r.purchase_date ?? new Date().toISOString().slice(0, 10),
        questions:         parseQuestions(r.questions_asked),
        leadType:          r.lead_type,
        buyerStatus:       r.buyer_status ?? "",
        source:            (r.lead_type === "open_home_attendee" || r.lead_type === "auction_attendee")
                             ? "open-home" as const
                             : "other" as const,
      }
    })

    res.json({ leads, source: "supabase", count: leads.length })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// PATCH /api/crm/leads/:id/questions — append voice note transcript to questions_asked
router.patch("/:id/questions", async (req: Request, res: Response) => {
  const { id } = req.params
  const { transcript } = req.body as { transcript?: string }
  if (!transcript?.trim()) return res.status(400).json({ error: "transcript is required" })
  if (!isDbConnected()) return res.json({ ok: true, persisted: false })

  try {
    await query(
      `UPDATE "PropOS_democontacts"
       SET questions_asked = CASE
         WHEN questions_asked IS NULL OR questions_asked = '' THEN $1
         ELSE questions_asked || E'\\n' || $1
       END,
       updated_at = NOW()
       WHERE id = $2`,
      [transcript.trim(), id],
    )
    res.json({ ok: true, persisted: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
