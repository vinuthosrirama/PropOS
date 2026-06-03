import { Router } from "express"
import twilio from "twilio"
import { addOptOut } from "../lib/compliance.js"
import { addReplyToThread } from "../lib/conversations.js"
import { cancelNurtureJobs } from "../lib/scheduler.js"
import { writeToSheet } from "../lib/sheets.js"

const router = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateLeadStatusInSheets(params: {
  phone?: string
  email?: string
  status: string
  detail?: string
}): Promise<void> {
  // writeToSheet retries internally, has a 10s timeout, and never throws
  void writeToSheet({ type: "update_lead_status", ...params })
}

// ---------------------------------------------------------------------------
// POST /api/webhook/sms
// Twilio sends this when a lead replies to an outbound SMS.
// IMPORTANT: Always return TwiML 200 — non-2xx triggers Twilio retries
// which causes double-processing of the same message.
// ---------------------------------------------------------------------------
router.post("/sms", async (req, res) => {
  // ── Signature validation — rejects spoofed webhooks ──────────────────────
  // Only enforced when TWILIO_AUTH_TOKEN and BASE_URL are both set (production).
  // Skip in dev/demo mode where BASE_URL may not match the actual request URL.
  if (process.env.TWILIO_AUTH_TOKEN && process.env.BASE_URL) {
    const signature = String(req.headers["x-twilio-signature"] ?? "")
    const url       = `${process.env.BASE_URL}/api/webhook/sms`
    const valid     = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      req.body as Record<string, string>,
    )
    if (!valid) {
      console.warn("[webhook/sms] Rejected — invalid Twilio signature")
      // Still return TwiML 200 so legitimate retries from valid requests aren't
      // accidentally blocked during URL mis-configuration. Log clearly instead.
      res.set("Content-Type", "text/xml").send("<Response/>")
      return
    }
  }

  const from: string      = String(req.body?.From ?? "")
  const body: string      = String(req.body?.Body ?? "")
  const lowerBody: string = body.toLowerCase().trim()

  try {
    // Opt-out keywords (AU SPAM Act 2003 + Twilio STOP handling)
    if (["stop", "unsubscribe", "cancel", "quit", "end", "stopall"].includes(lowerBody)) {
      await addOptOut(from, "sms", "reply")
      // Twilio automatically honours STOP — we just persist it
    } else {
      // Track in conversation thread store + update Sheets lead status
      await addReplyToThread(from, body)
      void updateLeadStatusInSheets({ phone: from, status: "sms_replied", detail: body.slice(0, 200) })
      // Cancel any pending nurture jobs — they replied, no need to keep following up
      await cancelNurtureJobs(from)
    }
  } catch (err) {
    // Log but do NOT let the error propagate — a non-200 response triggers Twilio
    // retries which causes the message to be double-processed.
    console.error("[webhook/sms] handler error (suppressed to prevent Twilio retry):", (err as Error).message)
  }

  // Must return TwiML — empty response means "no auto-reply"
  res.set("Content-Type", "text/xml").send("<Response/>")
})

// ---------------------------------------------------------------------------
// POST /api/webhook/email
// SendGrid Event Webhook — fires for open, click, unsubscribe events.
// ---------------------------------------------------------------------------
router.post("/email", async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body]

  try {
    for (const event of events) {
      const email: string     = String(event.email ?? "")
      const eventType: string = String(event.event ?? "")

      switch (eventType) {
        case "open":
          void updateLeadStatusInSheets({ email, status: "email_opened" })
          break
        case "click":
          void updateLeadStatusInSheets({ email, status: "email_clicked", detail: String(event.url ?? "") })
          break
        case "unsubscribe":
        case "group_unsubscribe":
          await addOptOut(email, "email", "link")
          break
        case "spamreport":
          await addOptOut(email, "all", "reply")
          break
      }
    }
  } catch (err) {
    console.error("[webhook/email] handler error:", (err as Error).message)
  }

  res.sendStatus(200)
})

export default router
