import { Router } from "express"
import Anthropic from "@anthropic-ai/sdk"

const router = Router()

// Lazy Anthropic client
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

function clampSMS(s: string): string {
  return s.length <= 160 ? s : s.slice(0, 157).trimEnd() + "..."
}

function sanitise(s: string): string {
  return s.replace(/—|–|--/g, ",").replace(/ {2,}/g, " ").trim()
}

export interface VendorGenerateParams {
  agentName: string
  agentAgency: string
  agentPhone?: string
  voiceContext?: string

  // Past buyer / vendor
  buyerName: string
  buyerPhone: string
  buyerStatus: "owner-occupier" | "investor" | "unknown"
  purchaseAddress: string
  suburb: string
  purchaseYear: string
  purchasePrice: number

  // Financials
  currentEstimate: number
  equityGain: number
  equityGainPct: number
  yearsHeld: number
  annualAppreciation: number
  cashOnCashReturn: number | null
  cgtSavingsBy2027: number
  netProceeds: number

  // Segmentation
  pipelineLabel: string
  triggerSummary: string

  // CRM personalisation
  crmNotes?: string
  parsedPersonalisation?: string   // from hyper-personalisation engine
}

/**
 * POST /api/vendor-generate
 *
 * Generates vendor prospecting outreach (SMS + email) for a past buyer whose
 * property has grown in value. This is NOT buyer reactivation — it is a
 * vendor prospecting pitch framed as a caring financial update from their agent.
 *
 * Pipeline:
 *   1. Claude Haiku  → extract personalisation hook from CRM notes
 *   2. Claude Sonnet → write SMS + email with financial incentives
 *   3. Sanitise      → no em-dashes, SMS clamped to 160 chars
 */
router.post("/", async (req, res) => {
  const params = req.body as VendorGenerateParams

  if (!params.buyerName || !params.agentName) {
    return res.status(400).json({ error: "buyerName and agentName are required" })
  }

  const agentFirst  = params.agentName.split(" ")[0]
  const fname       = params.buyerName.split("&")[0].split(" ")[0].trim()
  const isInvestor  = params.buyerStatus === "investor"
  const signoff     = isInvestor ? "Kind regards" : "Cheers"
  const addr        = shortAddr(params.purchaseAddress)
  const estStr      = fmtK(params.currentEstimate)
  const equityStr   = fmtK(params.equityGain)
  const equityPct   = Math.round(params.equityGainPct)

  // ── Template fallback (no API keys) ─────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    const cgtLine = params.cgtSavingsBy2027 > 0
      ? ` The current 50% CGT discount saves you approximately ${fmtK(params.cgtSavingsBy2027)} if you sell before July 2027.`
      : ""
    const smsRaw = `Hi ${fname}, ${agentFirst} from ${params.agentAgency}. ${addr} is now worth ~${estStr} (${equityStr} equity since ${params.purchaseYear}). Worth a quick chat? ${signoff}, ${agentFirst}`
    const sms = clampSMS(sanitise(smsRaw))
    return res.json({
      sms,
      email: {
        subject: sanitise(`Market update on ${params.purchaseAddress}, ${fname}`),
        body: [
          `Hi ${fname}, ${agentFirst} from ${params.agentAgency} here. Quick market update on ${params.suburb}.`,
          `Your property at ${params.purchaseAddress} has grown to approximately ${estStr} since you purchased in ${params.purchaseYear}. That's ${equityStr} in equity, a ${equityPct}% gain.${cgtLine}`,
          `I'd love to offer a complimentary, no-obligation appraisal if you're curious. Takes about 20 minutes, happy to come to you.\n\n${signoff},\n${agentFirst}`,
        ].map(sanitise),
      },
    })
  }

  try {
    // ── Step 1: Extract personalisation hook from CRM notes (Haiku) ─────────
    let personalisationHook = params.parsedPersonalisation ?? ""

    if (!personalisationHook && params.crmNotes && params.crmNotes.trim()) {
      try {
        const haikuPrompt = `Extract the single most personal, specific detail from these CRM notes that an agent could reference in a warm outreach message. This is for ${params.buyerName}, who purchased ${params.purchaseAddress} in ${params.purchaseYear}.

CRM notes: "${params.crmNotes}"

Return ONE sentence (max 20 words) that captures a real personal detail (family, lifestyle, future plans, local connection). Do not make up facts. If there is nothing specific, return empty string.
Return ONLY the sentence or empty string, no JSON, no labels.`

        const msg = await getClient().messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 80,
          messages: [{ role: "user", content: haikuPrompt }],
        })
        const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : ""
        if (raw && raw.length < 150) personalisationHook = raw
      } catch {
        // continue without personalisation
      }
    }

    // ── Step 2: Generate outreach (Claude Sonnet) ────────────────────────────
    const cgtContext = params.cgtSavingsBy2027 > 0
      ? `\n- CGT discount: Selling before July 2027 under the current 50% CGT discount saves approximately ${fmtK(params.cgtSavingsBy2027)} in tax.`
      : ""

    const vocBlock = params.voiceContext
      ? `\n=== AGENT VOICE STYLE ===\n${params.voiceContext}\n`
      : ""

    const personalisationBlock = personalisationHook
      ? `\nPersonal detail from CRM: ${personalisationHook}`
      : ""

    const sonnetPrompt = `You are ${params.agentName}, a real estate agent at ${params.agentAgency}.
${vocBlock}
Hard rules:
- Write in first person as ${params.agentName}
- HARD CONSTRAINT: NEVER use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma or period instead.
- SMS must be under 160 characters, reads like a real text — warm, not salesy
- SMS sign-off: "${signoff}, ${agentFirst}" (match agent voice style above)
- Email: 2-3 short paragraphs maximum
- This is vendor prospecting — you sold this person a home and now you're reaching out about their property's value growth. Never say "I remember you from the open home."
- Reference the property address (short form: "${addr}") naturally
- Include at least one specific financial number (equity gain or estimated value)
- Offer a complimentary, no-obligation appraisal — never pressured
- Warm, empathetic, Australian-colloquial tone. Sounds like a caring check-in, not a pitch.
${personalisationBlock}

VENDOR DETAILS:
Name: ${params.buyerName}
Property: ${params.purchaseAddress}, ${params.suburb}
Purchased: ${params.purchaseYear} for ${fmtK(params.purchasePrice)}
Current estimate: ${estStr}
Equity gain: ${equityStr} (${equityPct}% over ${params.yearsHeld} years)
Annual growth: ${params.annualAppreciation.toFixed(1)}% p.a.${params.cashOnCashReturn ? `\nCash-on-cash return on deposit: ${params.cashOnCashReturn}%` : ""}${cgtContext}
Net proceeds estimate (after all costs): ${fmtK(params.netProceeds)}
Pipeline: ${params.pipelineLabel}
Triggers: ${params.triggerSummary}
Owner type: ${isInvestor ? "Investor (investment property)" : "Owner-occupier"}

Write personalised SMS and email vendor outreach for ${fname}.

Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2","paragraph 3"]}}`

    const message = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 700,
      messages: [{ role: "user", content: sonnetPrompt }],
    })

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    try {
      const parsed = JSON.parse(cleaned) as {
        sms: string
        email: { subject: string; body: string[] }
      }
      return res.json({
        sms:   clampSMS(sanitise(parsed.sms ?? "")),
        email: {
          subject: sanitise(parsed.email?.subject ?? ""),
          body:    (parsed.email?.body ?? []).map(sanitise),
        },
      })
    } catch {
      // JSON parse failed — return template fallback
      throw new Error("json_parse_failed")
    }

  } catch (err) {
    console.error("[vendor-generate] error:", err)
    // Template fallback on any error
    const cgtLine = params.cgtSavingsBy2027 > 0
      ? ` The current 50% CGT discount saves you approximately ${fmtK(params.cgtSavingsBy2027)} if you sell before July 2027.`
      : ""
    const smsRaw = `Hi ${fname}, ${agentFirst} from ${params.agentAgency}. ${addr} is worth ~${estStr} today, ${equityStr} gain since ${params.purchaseYear}. Free appraisal? ${signoff} ${agentFirst}`
    return res.json({
      sms: clampSMS(sanitise(smsRaw)),
      email: {
        subject: sanitise(`Your property update, ${fname}`),
        body: [
          `Hi ${fname}, ${agentFirst} from ${params.agentAgency} here.`,
          `Just wanted to give you a quick market update on ${params.purchaseAddress}. The suburb has grown well and your property is now worth approximately ${estStr}, representing ${equityStr} in equity since you purchased in ${params.purchaseYear}.${cgtLine}`,
          `I'd love to provide a complimentary appraisal at no obligation. Happy to call or come by whenever suits.\n\n${signoff},\n${agentFirst}`,
        ].map(sanitise),
      },
    })
  }
})

function shortAddr(address: string): string {
  const parts = address.split(",")
  const streetPart = parts[0].trim()
  const tokens = streetPart.split(" ")
  if (tokens.length <= 3) return streetPart
  // "18 Ascot Rise" → "Ascot Rise"; "8 Thirlmere Court" → "Thirlmere Ct"
  const streetOnly = tokens.slice(1).join(" ")
  return streetOnly
    .replace(/\bCourt\b/g, "Ct")
    .replace(/\bStreet\b/g, "St")
    .replace(/\bAvenue\b/g, "Ave")
    .replace(/\bDrive\b/g, "Dr")
    .replace(/\bBoulevard\b/g, "Blvd")
    .replace(/\bRoad\b/g, "Rd")
    .replace(/\bCrescent\b/g, "Cres")
    .replace(/\bPlace\b/g, "Pl")
    .replace(/\bWay\b/g, "Way")
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export default router
