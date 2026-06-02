import { Router } from "express"

const router = Router()

const SHEET_URL = process.env.SHEET_URL ?? ""

/**
 * POST /api/add-lead
 *
 * Appends a new open-home lead to the "Leads" tab in Google Sheets.
 * The Apps Script web app must handle type=add_lead.
 *
 * Body: Lead fields (name, phone, email, inspectedProperty, suburb,
 *       budget, timeline, persona, notes, questions)
 * Returns: { ok: true }
 */
router.post("/", async (req, res) => {
  const lead = req.body as Record<string, unknown>

  if (!lead.name) {
    return res.status(400).json({ error: "name is required" })
  }

  if (SHEET_URL) {
    try {
      await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          type:              "add_lead",
          id:                lead.id ?? Date.now(),
          name:              lead.name,
          phone:             lead.phone ?? "",
          email:             lead.email ?? "",
          inspectedProperty: lead.inspectedProperty ?? lead.purchaseAddress ?? "",
          suburb:            lead.suburb ?? "",
          budget:            lead.budget ?? "",
          timeline:          lead.timeline ?? "",
          persona:           lead.persona ?? "family",
          notes:             lead.notes ?? "",
          questions:         lead.questions ?? "",
          addedAt:           new Date().toISOString(),
        }),
      })
    } catch (err) {
      console.error("[add-lead] Sheet write error:", err)
    }
  }

  console.log(`[add-lead] New lead added: ${lead.name}`)
  return res.json({ ok: true })
})

export default router
