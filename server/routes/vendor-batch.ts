/**
 * Batch vendor outreach — generate for many contacts, then send approved items.
 *
 * POST /api/vendor-batch/generate
 *   Body: { contacts: BatchContact[], agentName, agentAgency, agentEmail, agentPhone?, voiceContext? }
 *   Returns: { items: BatchItem[] }  — preview only, does NOT send
 *
 * POST /api/vendor-batch/send
 *   Body: { items: ApprovedItem[] }
 *   Returns: { sent, skipped, errors[] }
 */
import { Router } from "express"
import { checkCompliance } from "../lib/compliance.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"
import { buildEmailHTML } from "../lib/emailTemplate.js"
import { addAgentMessageToThread } from "../lib/conversations.js"
import { logOutreach } from "../lib/db.js"

const router = Router()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BatchContact {
  id: number
  name: string
  phone?: string
  email?: string
  purchaseAddress: string
  suburb: string
  purchaseYear: string
  purchasePrice: number
  currentEstimate: number
  equityGain: number
  equityGainPct: number
  pipeline: string
  status: "owner-occupier" | "investor" | "unknown"
  notes?: string
}

export interface BatchItem {
  contact: BatchContact
  sms: string
  subject: string
  emailBody: string
  approved: boolean
}

interface GenerateRequest {
  contacts: BatchContact[]
  agentName: string
  agentAgency: string
  agentEmail: string
  agentPhone?: string
  agencyColor?: string
  agencyTagline?: string
  voiceContext?: string
}

interface ApprovedItem {
  contact: BatchContact
  sms: string
  subject: string
  emailBody: string
}

interface SendRequest {
  items: ApprovedItem[]
  agentName: string
  agentAgency: string
  agentEmail: string
  agentPhone?: string
  agencyColor?: string
  agencyTagline?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function shortAddr(address: string): string {
  const parts  = address.split(",")
  const street = parts[0].trim()
  const tokens = street.split(" ")
  if (tokens.length <= 3) return street
  return tokens.slice(1).join(" ")
    .replace(/\bCourt\b/g, "Ct").replace(/\bStreet\b/g, "St")
    .replace(/\bAvenue\b/g, "Ave").replace(/\bDrive\b/g, "Dr")
    .replace(/\bRoad\b/g, "Rd").replace(/\bCrescent\b/g, "Cres")
}

function generateTemplate(contact: BatchContact, agentFirst: string, agentAgency: string): {
  sms: string; subject: string; emailBody: string
} {
  const fname     = contact.name.split("&")[0].split(" ")[0].trim()
  const addr      = shortAddr(contact.purchaseAddress)
  const estStr    = fmtK(contact.currentEstimate)
  const equityStr = fmtK(contact.equityGain)
  const equityPct = Math.round(contact.equityGainPct)
  const signoff   = contact.status === "investor" ? "Kind regards" : "Cheers"

  const smsRaw = `Hi ${fname}, ${agentFirst} from ${agentAgency}. ${addr} is worth ~${estStr} today — ${equityStr} growth (${equityPct}%) since ${contact.purchaseYear}. Worth a chat? ${signoff}, ${agentFirst}`
  const sms = smsRaw.length <= 160 ? smsRaw : smsRaw.slice(0, 157).trimEnd() + "..."

  const subject = `Your property update, ${fname}: ${contact.suburb} market insights`

  const emailBody = [
    `Hi ${fname}, hope you're well. ${agentFirst} from ${agentAgency} here with a quick market update on your property.`,
    `${contact.purchaseAddress} has grown to approximately ${estStr} since you purchased in ${contact.purchaseYear}. That's ${equityStr} in equity — a ${equityPct}% gain on your investment.`,
    `I'd love to offer you a complimentary, no-obligation appraisal if you're ever curious about your options. Just reply here or call me whenever suits.\n\n${signoff},\n${agentFirst}`,
  ].join("\n\n")

  return { sms, subject, emailBody }
}

// ── Generate (no send) ────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  const body = req.body as GenerateRequest
  const { contacts, agentName, agentAgency } = body

  if (!contacts?.length || !agentName || !agentAgency) {
    return res.status(400).json({ error: "contacts, agentName, agentAgency are required" })
  }

  const agentFirst = agentName.split(" ")[0]
  const items: BatchItem[] = contacts.map(contact => {
    const { sms, subject, emailBody } = generateTemplate(contact, agentFirst, agentAgency)
    return { contact, sms, subject, emailBody, approved: true }
  })

  return res.json({ items, total: items.length })
})

// ── Send approved items ───────────────────────────────────────────────────────

router.post("/send", async (req, res) => {
  const body = req.body as SendRequest
  const { items, agentName, agentAgency, agentEmail, agentPhone, agencyColor, agencyTagline } = body

  if (!items?.length) {
    return res.status(400).json({ error: "items array is required" })
  }

  const TEST_PHONE = process.env.TEST_RECIPIENT_PHONE?.trim() || null
  const TEST_EMAIL = process.env.TEST_RECIPIENT_EMAIL?.trim() || null
  const agentFirst = agentName.split(" ")[0]

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of items) {
    const { contact, sms, subject, emailBody } = item
    const recipientPhone = TEST_PHONE ?? contact.phone ?? ""
    const recipientEmail = TEST_EMAIL ?? contact.email ?? ""

    let compliance: { smsOk: boolean; emailOk: boolean }
    try {
      compliance = await checkCompliance(recipientPhone, recipientEmail)
    } catch {
      compliance = { smsOk: true, emailOk: true } // fail open
    }
    if (!compliance.smsOk && !compliance.emailOk) {
      skipped++
      continue
    }

    let smsSent = false
    let emailSent = false

    // SMS
    if (recipientPhone && compliance.smsOk && smsConfigured()) {
      try {
        await sendSMS(recipientPhone, sms)
        smsSent = true
      } catch (err) {
        errors.push(`SMS failed for ${contact.name}: ${(err as Error).message}`)
      }
    }

    // Email
    if (recipientEmail && compliance.emailOk && gmailConfigured()) {
      try {
        const html = buildEmailHTML({
          agentName,
          agencyName:      agentAgency,
          agentEmail,
          agentPhone,
          agencyColor,
          agencyTagline,
          leadFirstName:   contact.name.split(" ")[0],
          propertyAddress: contact.purchaseAddress,
          priceGuide:      fmtK(contact.currentEstimate),
          bodyParagraphs:  emailBody.split("\n\n").filter(p => p.trim()),
          leadId:          `batch_${contact.id}`,
        })
        const displaySubject = TEST_EMAIL ? `[TEST] ${subject}` : subject
        await sendEmail({ to: recipientEmail, fromName: agentFirst, subject: displaySubject, htmlBody: html })
        emailSent = true
      } catch (err) {
        errors.push(`Email failed for ${contact.name}: ${(err as Error).message}`)
      }
    }

    const agentIdStr = req.agentId ? String(req.agentId) : undefined
    if (smsSent || emailSent) {
      if (contact.phone) {
        await addAgentMessageToThread(contact.phone, sms, {
          leadId: `vendor_${contact.id}`,
          leadName: contact.name,
          email: contact.email,
          propertyAddress: contact.purchaseAddress,
        }).catch(err => console.error("[vendor-batch] thread write failed:", (err as Error).message))
      }
      await logOutreach({
        agentId:         agentIdStr,
        contactPhone:    contact.phone,
        contactEmail:    contact.email,
        contactName:     contact.name,
        channel:         smsSent && emailSent ? "both" : smsSent ? "sms" : "email",
        smsBody:         sms,
        emailSubject:    subject,
        emailBody,
        status:          "sent",
        pipeline:        contact.pipeline,
        propertyAddress: contact.purchaseAddress,
      }).catch(() => { /* non-fatal */ })
      sent++
    } else {
      skipped++
    }
  }

  return res.json({ ok: true, sent, skipped, total: items.length, errors,
    testMode: !!(TEST_PHONE || TEST_EMAIL) })
})

export default router
