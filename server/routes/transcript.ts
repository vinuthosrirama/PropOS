import { Router, type Request, type Response } from "express"
import { writeToSheet } from "../lib/sheets.js"
import { isDbConnected, execute } from "../lib/db.js"

const router = Router()

interface TranscriptBody {
  leadId?:         string
  leadName?:       string
  phone?:          string
  propertyAddress?: string
  transcript?:     string
  generatedSMS?:   string
  generatedEmail?: string
  emailSubject?:   string
  timestamp?:      string
}

/**
 * POST /api/transcript
 *
 * Upserts a lead's generated SMS, email, and voice transcript back to:
 *  1. Google Sheets (existing behaviour — patch_lead_outreach)
 *  2. PropOS_democontacts.questions_asked in Supabase (new — matched by phone)
 *
 * Never throws — any failure returns { ok: true, warning } so the demo
 * keeps running regardless of connectivity.
 */
router.post("/", async (req: Request, res: Response) => {
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
  } = req.body as TranscriptBody

  if (!leadName || (!generatedSMS && !generatedEmail)) {
    return res.status(400).json({ error: "leadName and at least one of generatedSMS or generatedEmail are required" })
  }

  // 1. Upsert voice transcript → PropOS_democontacts.questions_asked (by phone)
  if (transcript?.trim() && isDbConnected()) {
    const cleanPhone = (phone ?? "").replace(/\s+/g, "")
    const label = `[Voice note ${new Date().toLocaleDateString("en-AU")}]: ${transcript.trim()}`
    execute(
      `UPDATE "PropOS_democontacts"
       SET questions_asked = CASE
         WHEN questions_asked IS NULL OR questions_asked = '' THEN $1
         ELSE questions_asked || E'\\n' || $1
       END,
       updated_at = NOW()
       WHERE ($2 <> '' AND replace(lead_phone, ' ', '') = $2)
          OR (lead_first_name || ' ' || lead_last_name ILIKE $3)`,
      [label, cleanPhone, leadName.trim()],
    ).catch(() => {/* non-fatal */})
  }

  // 2. Write to Google Sheet (fire-and-forget)
  if (process.env.SHEET_URL || process.env.VITE_SHEET_URL) {
    void writeToSheet({
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
  }

  return res.json({ ok: true })
})

export default router
