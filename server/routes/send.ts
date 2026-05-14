import { Router } from "express"
import { checkCompliance } from "../lib/compliance.js"
import { sendSMS, twilioConfigured } from "../lib/twilio.js"
import { sendEmail, sendgridConfigured } from "../lib/sendgrid.js"

const router = Router()

interface SendRequest {
  leadId:     string
  leadName:   string
  phone:      string
  email:      string
  agentEmail: string
  sms:        string
  subject:    string
  emailBody:  string   // HTML or plain paragraphs joined with <br/><br/>
  channel:    "sms" | "email" | "both"
}

/**
 * POST /api/send
 * Delivers approved outreach via Twilio (SMS) and/or SendGrid (email).
 * Runs compliance check before any delivery.
 */
router.post("/", async (req, res) => {
  const { leadId, leadName, phone, email, agentEmail, sms, subject, emailBody, channel } =
    req.body as SendRequest

  if (!leadId || !leadName) {
    return res.status(400).json({ error: "leadId and leadName are required" })
  }

  // Compliance gate — honour opt-outs before touching any delivery SDK
  const compliance = checkCompliance(phone ?? "", email ?? "")
  if (!compliance.smsOk && !compliance.emailOk) {
    return res.status(200).json({
      ok: false,
      blocked: true,
      reason: compliance.reason,
    })
  }

  const results: { sms?: { sid: string }; email?: { messageId: string }; errors: string[] } = { errors: [] }

  // ── SMS delivery ─────────────────────────────────────────────────────────────
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

  // ── Email delivery ───────────────────────────────────────────────────────────
  if ((channel === "email" || channel === "both") && compliance.emailOk) {
    if (!email) {
      results.errors.push("Email requested but no email address on lead")
    } else if (!sendgridConfigured()) {
      results.errors.push("Email skipped: SENDGRID_API_KEY not configured")
    } else {
      // Convert plain paragraphs to HTML if needed
      const html = emailBody.includes("<")
        ? emailBody
        : emailBody.split("\n\n").map(p => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("")

      try {
        results.email = await sendEmail({
          to: email,
          from: agentEmail,
          subject,
          htmlBody: html,
          leadId,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`Email failed: ${msg}`)
      }
    }
  }

  const delivered = !!(results.sms || results.email)
  res.json({ ok: delivered, ...results })
})

export default router
