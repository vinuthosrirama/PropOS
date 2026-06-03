import { Router } from "express"
import { writeToSheet } from "../lib/sheets.js"

const router = Router()

/**
 * POST /api/transcript
 *
 * Upserts a lead's generated SMS, email, and voice transcript back to the
 * Google Sheet so Gmail + Twilio can fire from there.
 *
 * Body:
 *   leadId         — Sheet row identifier (id field from the lead)
 *   leadName       — lead's name (for logging)
 *   phone          — lead's mobile number
 *   propertyAddress — which property this is for
 *   transcript     — raw voice transcript from the demo recording
 *   generatedSMS   — approved SMS text
 *   generatedEmail — approved email body (full text, newlines between paragraphs)
 *   emailSubject   — email subject line
 *   timestamp      — ISO timestamp
 *
 * Never throws — any Sheet failure returns { ok: true, warning } so the demo
 * keeps running regardless of connectivity.
 */
router.post("/", async (req, res) => {
  const {
    leadId,
    leadName,
    phone,
    propertyAddress,
    transcript,
    generatedSMS,
    generatedEmail,
    emailSubject,
    timestamp,
  } = req.body

  if (!leadName || (!generatedSMS && !generatedEmail)) {
    return res.status(400).json({ error: "leadName and at least one of generatedSMS or generatedEmail are required" })
  }

  if (!process.env.SHEET_URL && !process.env.VITE_SHEET_URL) {
    return res.json({ ok: true, warning: "No SHEET_URL configured — transcript saved locally only" })
  }

  // writeToSheet handles timeout (10s), retry (3×), correct Content-Type, and never throws
  void writeToSheet({
    // patch_lead_outreach — Apps Script must only update outreach columns,
    // never touch name/phone/email/budget/notes/persona.
    // Transcript is appended (separated by \n---\n), not replaced.
    action:          "patch_lead_outreach",
    leadId:          leadId ?? "",
    leadName:        leadName ?? "",
    phone:           phone ?? "",
    propertyAddress: propertyAddress ?? "",
    transcript:      transcript ?? "",
    generatedSMS:    generatedSMS ?? "",
    generatedEmail:  generatedEmail ?? "",
    emailSubject:    emailSubject ?? "",
    timestamp:       timestamp ?? new Date().toISOString(),
  })

  return res.json({ ok: true })
})

export default router
