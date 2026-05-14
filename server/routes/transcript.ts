import { Router } from "express"

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

  const sheetUrl = process.env.SHEET_URL ?? process.env.VITE_SHEET_URL ?? ""

  if (!sheetUrl) {
    return res.json({ ok: true, warning: "No SHEET_URL configured — transcript saved locally only" })
  }

  try {
    const payload = {
      action:         "upsert_lead",
      leadId:         leadId ?? "",
      leadName:       leadName ?? "",
      phone:          phone ?? "",
      propertyAddress: propertyAddress ?? "",
      transcript:     transcript ?? "",
      generatedSMS:   generatedSMS ?? "",
      generatedEmail: generatedEmail ?? "",
      emailSubject:   emailSubject ?? "",
      timestamp:      timestamp ?? new Date().toISOString(),
    }

    const response = await fetch(sheetUrl, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify(payload),
    })

    if (!response.ok) {
      console.warn("Sheet upsert responded with", response.status)
      return res.json({ ok: true, warning: `Sheet responded ${response.status}` })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.warn("Sheet upsert failed (non-fatal):", err)
    return res.json({ ok: true, warning: "Sheet sync failed — message saved locally" })
  }
})

export default router
