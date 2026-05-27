/**
 * POST /api/vendor-bulk-send
 *
 * Generates and "fires" outreach for all past-buyer contacts at once.
 *
 * Demo mode (default when TEST_RECIPIENT_EMAIL is set):
 *   - All emails redirected to the demo email address
 *   - Twilio SMS completely suppressed
 *   - Uses template generation (no AI, instant) so the whole batch finishes in <3s
 *
 * Returns:
 *   { ok, total, sent, skipped, demoMode, demoEmail, durationMs, results[] }
 */

import { Router } from "express"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"
import { buildEmailHTML } from "../lib/emailTemplate.js"

const router = Router()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkContact {
  id: number
  name: string
  email?: string
  phone?: string
  purchaseAddress: string
  suburb: string
  purchaseYear: string
  purchasePrice: number
  currentEstimate: number
  equityGain: number
  equityGainPct: number
  pipeline: string
  status: "owner-occupier" | "investor" | "unknown"
}

interface BulkSendRequest {
  contacts: BulkContact[]
  agentName: string
  agentAgency: string
  agentEmail: string
  agentPhone?: string
  agencyColor?: string
  demoMode?: boolean   // default true when TEST_RECIPIENT_EMAIL set
}

// ---------------------------------------------------------------------------
// Template generation — fast, no AI
// ---------------------------------------------------------------------------

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function shortAddr(address: string): string {
  const parts = address.split(",")
  const street = parts[0].trim()
  const tokens = street.split(" ")
  if (tokens.length <= 3) return street
  return tokens.slice(1).join(" ")
    .replace(/\bCourt\b/g, "Ct").replace(/\bStreet\b/g, "St")
    .replace(/\bAvenue\b/g, "Ave").replace(/\bDrive\b/g, "Dr")
    .replace(/\bRoad\b/g, "Rd").replace(/\bCrescent\b/g, "Cres")
}

function generateTemplate(contact: BulkContact, agentFirst: string, agentAgency: string): {
  sms: string
  emailSubject: string
  emailBody: string[]
} {
  const fname     = contact.name.split("&")[0].split(" ")[0].trim()
  const addr      = shortAddr(contact.purchaseAddress)
  const estStr    = fmtK(contact.currentEstimate)
  const equityStr = fmtK(contact.equityGain)
  const equityPct = Math.round(contact.equityGainPct)
  const signoff   = contact.status === "investor" ? "Kind regards" : "Cheers"

  const sms = `Hi ${fname}, ${agentFirst} from ${agentAgency}. ${addr} is worth ~${estStr} today, ${equityStr} gain (${equityPct}%) since ${contact.purchaseYear}. Worth a chat? ${signoff}, ${agentFirst}`
    .slice(0, 160)

  const emailSubject = `Your property update, ${fname} — ${contact.suburb} market insights`

  const emailBody = [
    `Hi ${fname}, hope you're well. ${agentFirst} from ${agentAgency} here with a quick market update on your property.`,
    `${contact.purchaseAddress} has grown to approximately ${estStr} since you purchased in ${contact.purchaseYear}. That's ${equityStr} in equity — a ${equityPct}% gain on your investment.`,
    `I'd love to offer a complimentary, no-obligation appraisal if you're ever curious about your options. Just reply here or give me a call whenever suits.\n\n${signoff},\n${agentFirst}`,
  ]

  return { sms, emailSubject, emailBody }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.post("/", async (req, res) => {
  const body = req.body as BulkSendRequest
  const { contacts, agentName, agentAgency, agentEmail, agentPhone, agencyColor } = body

  if (!contacts?.length || !agentName || !agentAgency) {
    return res.status(400).json({ error: "contacts, agentName, agentAgency are required" })
  }

  const DEMO_EMAIL = process.env.TEST_RECIPIENT_EMAIL || "vinuth.srirama@outlook.com"
  const isDemoMode = body.demoMode !== false || !!process.env.TEST_RECIPIENT_EMAIL

  const agentFirst = agentName.split(" ")[0]
  const startMs    = Date.now()

  const results: Array<{
    id: number
    name: string
    to: string
    status: "sent" | "skipped" | "no-email"
    channel: string
  }> = []

  let sentCount    = 0
  let skippedCount = 0

  for (const contact of contacts) {
    const { sms, emailSubject, emailBody } = generateTemplate(contact, agentFirst, agentAgency)

    // In demo mode: always send to test email, never to real contact
    const recipientEmail = isDemoMode ? DEMO_EMAIL : (contact.email ?? "")

    if (!recipientEmail) {
      results.push({ id: contact.id, name: contact.name, to: "(no email)", status: "no-email", channel: "none" })
      skippedCount++
      continue
    }

    // Only actually fire if Gmail is configured
    if (gmailConfigured()) {
      try {
        const html = buildEmailHTML({
          agentName,
          agencyName:     agentAgency,
          agentEmail,
          agentPhone,
          agencyColor,
          leadFirstName:  contact.name.split(" ")[0],
          propertyAddress: contact.purchaseAddress,
          priceGuide:     fmtK(contact.currentEstimate),
          bodyParagraphs: emailBody,
          leadId:         `bulk_${contact.id}`,
        })
        await sendEmail({
          to:       recipientEmail,
          fromName: agentName,
          subject:  isDemoMode ? `[DEMO] ${emailSubject}` : emailSubject,
          htmlBody: html,
        })
        results.push({ id: contact.id, name: contact.name, to: recipientEmail, status: "sent", channel: isDemoMode ? "email (demo)" : "email" })
        sentCount++
      } catch (err) {
        results.push({ id: contact.id, name: contact.name, to: recipientEmail, status: "skipped", channel: "email (error)" })
        skippedCount++
      }
    } else {
      // Gmail not configured — simulate success for the demo
      results.push({ id: contact.id, name: contact.name, to: recipientEmail, status: "sent", channel: "simulated" })
      sentCount++
    }
  }

  const durationMs = Date.now() - startMs

  res.json({
    ok: true,
    total: contacts.length,
    sent: sentCount,
    skipped: skippedCount,
    demoMode: isDemoMode,
    demoEmail: isDemoMode ? DEMO_EMAIL : null,
    durationMs,
    results,
  })
})

export default router
