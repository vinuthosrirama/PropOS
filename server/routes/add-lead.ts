import { Router } from "express"
import { writeToSheet } from "../lib/sheets.js"

const router = Router()

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

  // Fire-and-forget — writeToSheet retries internally and never throws
  void writeToSheet({
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
  })

  console.log("[add-lead] New lead added")
  return res.json({ ok: true })
})

export default router
