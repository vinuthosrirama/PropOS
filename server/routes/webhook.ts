import { Router } from "express"
import { addOptOut } from "../lib/compliance.js"
import { addReplyToThread } from "../lib/conversations.js"
import { cancelNurtureJobs } from "../lib/scheduler.js"

const router = Router()

const SHEET_URL = process.env.SHEET_URL

async function updateLeadStatusInSheets(params: {
  phone?: string
  email?: string
  status: string
  detail?: string
}): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ type: "update_lead_status", ...params }),
    })
  } catch {
    // Non-fatal — status update best-effort
  }
}

/**
 * POST /api/webhook/sms
 * Twilio sends this when a lead replies to an outbound SMS.
 * Twilio requires a TwiML response (empty <Response/> is fine).
 */
router.post("/sms", async (req, res) => {
  // Twilio posts URL-encoded body
  const from: string = req.body?.From ?? ""
  const body: string = req.body?.Body ?? ""
  const lowerBody = body.toLowerCase().trim()

  // Opt-out keywords (AU SPAM Act 2003 + Twilio STOP handling)
  if (["stop", "unsubscribe", "cancel", "quit", "end", "stopall"].includes(lowerBody)) {
    await addOptOut(from, "sms", "reply")
    // Twilio automatically honours STOP — we just persist it
  } else {
    // Track in conversation thread store + update Sheets lead status
    await addReplyToThread(from, body)
    await updateLeadStatusInSheets({ phone: from, status: "sms_replied", detail: body.slice(0, 200) })
    // Cancel any pending nurture jobs — they replied, no need to keep following up
    await cancelNurtureJobs(from)
  }

  // Must return TwiML — empty response means "no auto-reply"
  res.set("Content-Type", "text/xml").send("<Response/>")
})

/**
 * POST /api/webhook/email
 * SendGrid Event Webhook — fires for open, click, unsubscribe events.
 */
router.post("/email", async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body]

  for (const event of events) {
    const email: string = event.email ?? ""
    const eventType: string = event.event ?? ""

    switch (eventType) {
      case "open":
        await updateLeadStatusInSheets({ email, status: "email_opened" })
        break
      case "click":
        // A click on a property link is a strong signal
        await updateLeadStatusInSheets({ email, status: "email_clicked", detail: event.url })
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

  res.sendStatus(200)
})

export default router
