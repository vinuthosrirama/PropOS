import { Router } from "express"
import { checkCompliance } from "../lib/compliance.js"
import { sendSMS, twilioConfigured } from "../lib/twilio.js"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"
import { buildEmailHTML } from "../lib/emailTemplate.js"
import { addAgentMessageToThread } from "../lib/conversations.js"

const router = Router()

interface SendRequest {
  leadId:           string
  leadName:         string
  phone:            string
  email:            string
  agentEmail:       string
  agentName?:       string
  agentAgency?:     string
  agentPhone?:      string
  agencyColor?:     string
  agencyTagline?:   string
  propertyAddress?: string
  priceGuide?:      string
  sms:              string
  subject:          string
  emailBody:        string   // \n\n-separated plain-text paragraphs
  channel:          "sms" | "email" | "both"
}

/**
 * GET /api/send/hello-sms
 * Sends "Hello from PropOS 👋" to TEST_RECIPIENT_PHONE.
 * Only works when TEST_RECIPIENT_PHONE is set and Twilio is configured.
 */
router.get("/hello-sms", async (_req, res) => {
  if (!process.env.TEST_RECIPIENT_PHONE) {
    return res.status(400).json({ error: "TEST_RECIPIENT_PHONE not set in .env" })
  }
  if (!twilioConfigured()) {
    return res.status(503).json({ error: "Twilio not configured (TWILIO_* env vars missing)" })
  }
  try {
    const result = await sendSMS(process.env.TEST_RECIPIENT_PHONE, "Hello from PropOS 👋 — Twilio is wired up and working.")
    res.json({ ok: true, sid: result.sid })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

/**
 * POST /api/send
 * Delivers approved outreach via Twilio (SMS) and Gmail (email).
 * Runs compliance check before any delivery.
 */
router.post("/", async (req, res) => {
  const body = req.body as SendRequest
  const { leadId, leadName, phone, email, agentEmail, sms, subject, emailBody, channel } = body
  const agentName    = body.agentName    ?? agentEmail.split("@")[0]
  const agentAgency  = body.agentAgency  ?? ""
  const agentPhone   = body.agentPhone
  const agencyColor  = body.agencyColor
  const agencyTagline = body.agencyTagline
  const propertyAddr = body.propertyAddress ?? ""
  const priceGuide   = body.priceGuide

  if (!leadId || !leadName) {
    return res.status(400).json({ error: "leadId and leadName are required" })
  }

  const compliance = checkCompliance(phone ?? "", email ?? "")
  if (!compliance.smsOk && !compliance.emailOk) {
    return res.status(200).json({ ok: false, blocked: true, reason: compliance.reason })
  }

  const results: { sms?: { sid: string }; email?: { messageId: string }; errors: string[] } = { errors: [] }

  // ── SMS ──────────────────────────────────────────────────────────────────────
  if ((channel === "sms" || channel === "both") && compliance.smsOk) {
    if (!phone) {
      results.errors.push("SMS requested but no phone number on lead")
    } else if (!twilioConfigured()) {
      results.errors.push("SMS skipped: TWILIO_* env vars not configured")
    } else {
      try {
        results.sms = await sendSMS(phone, sms)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`SMS failed: ${msg}`)
      }
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────────
  if ((channel === "email" || channel === "both") && compliance.emailOk) {
    if (!email) {
      results.errors.push("Email requested but no email address on lead")
    } else if (!gmailConfigured()) {
      results.errors.push("Email skipped: GMAIL_* env vars not configured")
    } else {
      const html = buildEmailHTML({
        agentName,
        agencyName:      agentAgency,
        agentEmail:      agentEmail,
        agentPhone,
        agencyColor,
        agencyTagline,
        leadFirstName:   leadName.split(" ")[0],
        propertyAddress: propertyAddr,
        priceGuide,
        bodyParagraphs:  emailBody.split("\n\n").filter(p => p.trim()),
        leadId,
      })
      try {
        results.email = await sendEmail({ to: email, fromName: agentName, subject, htmlBody: html })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`Email failed: ${msg}`)
      }
    }
  }

  const delivered = !!(results.sms || results.email)

  if (delivered && phone && sms) {
    await addAgentMessageToThread(phone, sms, { leadId, leadName, email })
  }

  const testMode = !!(process.env.TEST_RECIPIENT_PHONE || process.env.TEST_RECIPIENT_EMAIL)
  res.json({ ok: delivered, testMode, ...results })
})

export default router
