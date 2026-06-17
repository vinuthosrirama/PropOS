import { Router } from "express"
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
// BlueBubbles sends this when a lead replies to an outbound SMS/iMessage.
// ---------------------------------------------------------------------------
router.post("/sms", async (req, res) => {
  // BlueBubbles POSTs the reply as { from, body } or the raw message object
  const from: string      = String(req.body?.From ?? req.body?.from ?? "")
  const body: string      = String(req.body?.Body ?? req.body?.body ?? req.body?.text ?? "")
  const lowerBody: string = body.toLowerCase().trim()

  try {
    // Opt-out keywords (AU SPAM Act 2003)
    if (["stop", "unsubscribe", "cancel", "quit", "end", "stopall"].includes(lowerBody)) {
      await addOptOut(from, "sms", "reply")
    } else {
      // Track in conversation thread store + update Sheets lead status
      await addReplyToThread(from, body)
      void updateLeadStatusInSheets({ phone: from, status: "sms_replied", detail: body.slice(0, 200) })
      // Cancel any pending nurture jobs — they replied, no need to keep following up
      await cancelNurtureJobs(from)
    }
  } catch (err) {
    console.error("[webhook/sms] handler error:", (err as Error).message)
  }

  res.sendStatus(200)
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
