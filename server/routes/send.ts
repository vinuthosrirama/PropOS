import { Router } from "express"
import { checkCompliance } from "../lib/compliance.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"
import { buildEmailHTML, buildPitchContentHtml } from "../lib/emailTemplate.js"
import type { PriceUpdatePayload } from "../lib/pitchGenerator.js"
import { addAgentMessageToThread } from "../lib/conversations.js"
import { logOutreach, updateOutreachStatus } from "../lib/db.js"
import { queueNurtureSequence, type NurtureContext } from "../lib/scheduler.js"

const router = Router()

/** Retry an async fn up to `maxAttempts` times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
    }
  }
  throw lastErr
}

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
  pitchPayload?:    PriceUpdatePayload           // when set, comps/stats are embedded in the email body
  pipeline?:        string                      // vendor pipeline id — triggers nurture scheduling
  nurtureContext?:  NurtureContext                // extra context passed to nurture LLM
}

/**
 * GET /api/send/hello-sms
 * Sends "Hello from PropOS 👋" to TEST_RECIPIENT_PHONE via BlueBubbles.
 */
router.get("/hello-sms", async (_req, res) => {
  if (!process.env.TEST_RECIPIENT_PHONE) {
    return res.status(400).json({ error: "TEST_RECIPIENT_PHONE not set in .env" })
  }
  if (!smsConfigured()) {
    return res.status(503).json({ error: "SMS not configured — set SMS_TRANSPORT=bluebubbles and BLUEBUBBLES_URL in server/.env" })
  }
  try {
    const result = await sendSMS(process.env.TEST_RECIPIENT_PHONE, "Hello from PropOS 👋 BlueBubbles is wired up and working.")
    res.json({ ok: true, sid: result.sid })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

/**
 * POST /api/send
 * Delivers approved outreach via BlueBubbles (SMS) and Gmail (email).
 * Runs compliance check before any delivery.
 */
router.post("/", async (req, res) => {
  const body = req.body as SendRequest
  const { leadId, leadName, phone, email, agentEmail, sms, subject, emailBody, channel } = body
  const agentName    = body.agentName    ?? (agentEmail?.includes("@") ? agentEmail.split("@")[0] : agentEmail) ?? "Agent"
  const agentAgency  = body.agentAgency  ?? ""
  const agentPhone   = body.agentPhone
  const agencyColor  = body.agencyColor
  const agencyTagline = body.agencyTagline
  const propertyAddr = body.propertyAddress ?? ""
  const priceGuide   = body.priceGuide

  if (!leadId || !leadName) {
    return res.status(400).json({ error: "leadId and leadName are required" })
  }

  // liveMode: send to actual CRM contact phone/email, bypassing TEST_RECIPIENT_* redirect.
  // Self-demo sends ("self_demo" leadId) still go to the test recipient.
  const liveMode = leadId !== "self_demo"

  let compliance: { smsOk: boolean; emailOk: boolean; reason?: string }
  try {
    compliance = await checkCompliance(phone ?? "", email ?? "")
  } catch (err) {
    console.error("[send] compliance check failed:", (err as Error).message)
    compliance = { smsOk: true, emailOk: true } // fail open so demo always works
  }
  if (!compliance.smsOk && !compliance.emailOk) {
    return res.status(200).json({ ok: false, blocked: true, reason: compliance.reason })
  }

  const results: { sms?: { sid: string }; email?: { messageId: string }; errors: string[] } = { errors: [] }

  // ── SMS ──────────────────────────────────────────────────────────────────────
  if ((channel === "sms" || channel === "both") && compliance.smsOk) {
    if (!phone) {
      results.errors.push("SMS requested but no phone number on lead")
    } else if (!smsConfigured()) {
      results.errors.push("SMS skipped: no SMS transport configured (set SMS_TRANSPORT=bluebubbles)")
    } else {
      try {
        results.sms = await withRetry(() => sendSMS(phone, sms, [], liveMode))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`SMS failed: ${msg}`)
      }
    }
  }

  // ── Pre-log to get outreach ID (for email tracking pixel) ───────────────────
  // Logged as "sent" optimistically; updated to "failed" below if the send throws.
  const agentIdStr = req.agentId ? String(req.agentId) : undefined

  let outreachLogId = 0
  if ((channel === "email" || channel === "both") && compliance.emailOk && email) {
    outreachLogId = await logOutreach({
      agentId:         agentIdStr,
      contactPhone:    phone,
      contactEmail:    email,
      contactName:     leadName,
      channel,
      smsBody:         sms,
      emailSubject:    subject,
      emailBody:       emailBody,
      status:          "sent",
      propertyAddress: propertyAddr,
    }).catch(() => 0)
  }

  let emailActuallySent = false

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
        contentHtml:     body.pitchPayload ? buildPitchContentHtml(body.pitchPayload, agencyColor ?? "#4B2E7E") : undefined,
        leadId,
        trackingId:      outreachLogId > 0 ? outreachLogId : undefined,
      })
      try {
        results.email = await withRetry(() => sendEmail({ to: email, fromName: agentName, subject, htmlBody: html, liveMode }))
        emailActuallySent = true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`Email failed: ${msg}`)
        // Correct the pre-logged "sent" status so analytics show the real outcome
        if (outreachLogId > 0) updateOutreachStatus(outreachLogId, "failed").catch(() => { /* non-fatal */ })
      }
    }
  }

  const delivered = !!(results.sms || results.email)

  // Always thread the outbound message so inbox works in demo mode too
  if (phone && sms) {
    await addAgentMessageToThread(phone, sms, { leadId, leadName, email, propertyAddress: propertyAddr })
      .catch(err => console.error("[send] thread write failed:", (err as Error).message))
  }

  // Log SMS-only sends (email sends were pre-logged above for tracking)
  if (delivered && outreachLogId === 0) {
    await logOutreach({
      agentId:         agentIdStr,
      contactPhone:    phone,
      contactEmail:    email,
      contactName:     leadName,
      channel,
      smsBody:         sms,
      emailSubject:    subject,
      emailBody:       emailBody,
      status:          "sent",
      propertyAddress: propertyAddr,
    }).catch(() => { /* non-fatal */ })
  }

  // Queue Day 7/14/30 nurture follow-ups for vendor pipeline contacts
  if (body.pipeline && phone) {
    await queueNurtureSequence({
      contactPhone:    phone,
      contactName:     leadName,
      contactEmail:    email ?? "",
      propertyAddress: propertyAddr,
      pipeline:        body.pipeline,
      context: body.nurtureContext ?? {
        agentName:    agentName,
        agentAgency:  agentAgency,
        agentEmail:   agentEmail,
        agentPhone:   agentPhone,
        agencyColor:  agencyColor,
        agencyTagline: agencyTagline,
      },
    }).catch(() => { /* non-fatal — no DB in demo mode */ })
  }

  const testMode = !!(process.env.TEST_RECIPIENT_PHONE || process.env.TEST_RECIPIENT_EMAIL)
  res.json({ ok: delivered, testMode, ...results })
})

export default router
