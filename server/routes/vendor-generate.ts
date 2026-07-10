import { Router } from "express"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { inferLifeStage, renderLifeStageBlock } from "../lib/lifeStageInference.js"
import { getSuburbContext } from "../lib/suburbContext.js"
import { getTimingTriggers, renderTimingBlock } from "../lib/timingTriggers.js"
import { sanitiseText, ensureSignoff } from "../lib/sanitise.js"
import { withRetry } from "../lib/llmUtils.js"

const router = Router()

// Lazy Anthropic client (for Sonnet generation — step 2)
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// Lazy OpenAI client (for personalisation extraction — step 1)
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "not-set" })
  return _openai
}

// No style-driven cap — Vinuth's real SMS answers run 138-455 chars (see
// docs/VOICE_CORPUS_VINUTH.md), prompt is told to match that range naturally.
// Pure runaway-generation safety net, not meant to trigger in normal use.
function clampSMS(s: string): string {
  return s.length <= 700 ? s : s.slice(0, 697).trimEnd() + "..."
}

// Shared safety net: em-dash hard rule + AI-tell vocabulary + hollow openers.
function sanitise(s: string): string {
  return sanitiseText(s)
}

export interface VendorGenerateParams {
  agentName: string
  agentAgency: string
  agentNickname?: string   // e.g. "Manny" — used in outreach sign-offs
  agentAgencyShort?: string // e.g. "BP" — used in outreach intro
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
  soldComps?: string               // comparable recent sales in same suburb

  // New layer inputs
  beds?: number
  propertyType?: string
  purchaseDate?: string   // ISO date — for timing triggers
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
 *   3. Sanitise      → no em-dashes, SMS length matches voice profile (no strict cap)
 */
router.post("/", async (req, res) => {
  const params = req.body as VendorGenerateParams

  if (!params.buyerName || !params.agentName) {
    return res.status(400).json({ error: "buyerName and agentName are required" })
  }

  const agentFirst  = params.agentNickname ?? params.agentName.split(" ")[0]
  const agencyLabel = params.agentAgencyShort ?? params.agentAgency
  const fname       = params.buyerName.split("&")[0].split(" ")[0].trim()
  const isInvestor  = params.buyerStatus === "investor"
  // Greeting and sign-off match the agent's voice (Manny: "Hey" + "Cheers", others keep "Hi" + appropriate close)
  const hasNickname = !!params.agentNickname
  const greeting    = hasNickname ? "Hey" : "Hi"
  const signoff     = hasNickname ? "Cheers" : (isInvestor ? "Kind regards" : "Cheers")
  const addr        = shortAddr(params.purchaseAddress)
  const estStr      = fmtK(params.currentEstimate)
  const equityStr   = fmtK(params.equityGain)
  const equityPct   = Math.round(params.equityGainPct)
  const agentSig     = params.agentAgency ? `${agentFirst}, ${params.agentAgency}` : agentFirst

  // ── Template fallback (no API keys at all) ──────────────────────────────────
  // Previously gated on `!ANTHROPIC_API_KEY` alone, so an OpenAI-only setup (no
  // Anthropic key) skipped the LLM entirely and always fell to the hardcoded
  // template below — Step 2 had no OpenAI branch to reach. Fixed: only fall to
  // template when neither key is present; OpenAI is now a real path in Step 2.
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    const cgtLine = params.cgtSavingsBy2027 > 0
      ? ` The current 50% CGT discount saves you approximately ${fmtK(params.cgtSavingsBy2027)} if you sell before July 2027.`
      : ""
    // If a pre-written personalisation hook exists, weave it into para 2 as its own sentence
    const hookBase = params.parsedPersonalisation?.trim().replace(/\.$/, "") ?? ""
    const hookSentence = hookBase
      ? sanitise(`${hookBase}, and with ${equityStr} in equity built up, now might be the perfect time to act on it.`)
      : ""
    const para2 = sanitise(
      `Your property at ${params.purchaseAddress} has grown to approximately ${estStr} since you purchased in ${params.purchaseYear}. That's ${equityStr} in equity, a ${equityPct}% gain.${cgtLine}` +
      (hookSentence ? ` ${hookSentence}` : "")
    )
    // Signature phrasing (see docs/VOICE_CORPUS_VINUTH.md) even in the last-resort
    // template, so a genuine outage still sounds like a person, not a mail-merge.
    // Identity appears ONCE (the sign-off) — a live send doubled up "Cameron from
    // Peake" at both ends. These are known past clients; open warm, not with a
    // self-introduction.
    const smsRaw = `${greeting} ${fname}, hope you and the family have been well! It's been a little while, and ${addr} is sitting on a fair bit of equity, about ${equityStr} since ${params.purchaseYear}. More than happy to grab a coffee (or tea) and run through the numbers if you're keen? ${signoff}, ${agentSig}`
    const sms = clampSMS(sanitise(smsRaw))
    return res.json({
      sms,
      email: {
        subject: sanitise(`Market update on ${params.purchaseAddress}, ${fname}`),
        body: [
          `${greeting} ${fname}, ${agentFirst} from ${agencyLabel} here. It's been a little while since we connected, so wanted to send a quick market update on ${params.suburb}.`,
          para2,
          `More than happy to offer a complimentary, no-obligation appraisal if you're curious, no pressure at all. Takes about 20 minutes, happy to come to you.\n\n${signoff},\n${agentSig}`,
        ].map(sanitise),
      },
      personalisationHook: params.parsedPersonalisation || null,
      // Stage 3 shows just the personalisation sentence — keeps the demo moment focused
      personalisationLine: hookSentence || null,
    })
  }

  try {
    // ── Layers 2-4: Run enrichment in parallel ───────────────────────────────
    const [lifeStageProfile, suburbCtx, timingTriggers] = await Promise.all([
      // Layer 2: Life-stage inference from CRM notes
      (params.crmNotes || params.parsedPersonalisation)
        ? inferLifeStage({
            notes:           params.crmNotes ?? "",
            buyerName:       params.buyerName,
            purchaseAddress: params.purchaseAddress,
            purchaseYear:    params.purchaseYear,
            beds:            params.beds ?? 3,
            propertyType:    params.propertyType ?? "House",
          })
        : Promise.resolve(null),

      // Layer 3: Suburb market context
      Promise.resolve(getSuburbContext(params.suburb)),

      // Layer 4: Timing triggers
      Promise.resolve(getTimingTriggers({
        purchaseDate:     params.purchaseDate ?? `${params.purchaseYear}-01-01`,
        cgtSavingsBy2027: params.cgtSavingsBy2027,
        hasChildren:      false, // will be overridden once lifeStage resolves
        pipeline:         params.pipelineLabel.toLowerCase().replace(/ /g, "-"),
      })),
    ])

    // Re-run timing with hasChildren from life-stage result
    const hasChildren = (lifeStageProfile?.children?.length ?? 0) > 0
    const refinedTimingTriggers = hasChildren
      ? getTimingTriggers({
          purchaseDate:     params.purchaseDate ?? `${params.purchaseYear}-01-01`,
          cgtSavingsBy2027: params.cgtSavingsBy2027,
          hasChildren:      true,
          pipeline:         params.pipelineLabel.toLowerCase().replace(/ /g, "-"),
        })
      : timingTriggers

    const lifeStageBlock  = renderLifeStageBlock(lifeStageProfile)
    const timingBlock     = renderTimingBlock(refinedTimingTriggers)
    const suburbBlock     = suburbCtx?.promptBlock ?? ""

    // ── Step 1: Extract personalisation hook from CRM notes (Haiku) ─────────
    let personalisationHook = params.parsedPersonalisation ?? ""

    if (!personalisationHook && params.crmNotes && params.crmNotes.trim()) {
      try {
        // Step 1 uses OpenAI GPT-4o-mini for fast, cheap extraction
        const extractPrompt = `Extract the single most personal, specific detail from these CRM notes that an agent could reference in a warm outreach message. This is for ${params.buyerName}, who purchased ${params.purchaseAddress} in ${params.purchaseYear}.

CRM notes: "${params.crmNotes}"

Return ONE sentence (max 20 words) capturing a real personal detail (family, lifestyle, future plans, local connection). Do not invent facts. If nothing specific exists, return an empty string.
Return ONLY the sentence or empty string — no JSON, no labels.`

        if (process.env.OPENAI_API_KEY) {
          const completion = await getOpenAI().chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 80,
            temperature: 0.4,
            messages: [{ role: "user", content: extractPrompt }],
          })
          const raw = completion.choices[0]?.message?.content?.trim() ?? ""
          if (raw && raw.length < 150) personalisationHook = raw
        } else if (process.env.ANTHROPIC_API_KEY) {
          // Fallback: use Haiku if no OpenAI key
          const msg = await getClient().messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 80,
            messages: [{ role: "user", content: extractPrompt }],
          })
          const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : ""
          if (raw && raw.length < 150) personalisationHook = raw
        }
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

    const compsBlock = params.soldComps
      ? `\nRecent comparable sales in ${params.suburb} (use as social proof — mention one in the email if relevant):\n${params.soldComps}`
      : ""

    // Assemble enrichment blocks — only include non-empty ones
    const enrichmentBlocks = [lifeStageBlock, suburbBlock, timingBlock, compsBlock]
      .filter(Boolean)
      .join("\n\n")

    const nicknameRule = params.agentNickname
      ? `- Sign off as "${params.agentNickname}", not "${params.agentName.split(" ")[0]}". Introduce yourself as "${params.agentNickname} from ${agencyLabel}" — never use the full name or full agency name in the message.`
      : ""
    const greetingRule = params.agentNickname
      ? `- Start SMS and email with "${greeting} ${fname}," — never "Hi" or "Dear".`
      : ""

    const sonnetPrompt = `You are ${params.agentName}, a real estate agent at ${params.agentAgency}.
${vocBlock}
Hard rules:
- Write in first person as ${params.agentName} — use "I" throughout. This is a personal message from the agent to someone they already know.
- HARD CONSTRAINT: NEVER use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma or period instead.
- SMS has no strict length cap. Match the training examples' natural length, do not compress or pad. Reads like a real text, warm, not salesy.
- SMS sign-off: "${signoff}, ${agentSig}" (match agent voice style above)
- Your identity appears ONCE in the SMS: the sign-off. NEVER also introduce yourself by name at the start ("${agentFirst} from ${agencyLabel}") — this is a known past client, they have your number.
- Open the SMS WARM: a personal line drawn from the CRM personal detail below if one exists (e.g. "hope the cake business is keeping you busy!", "hope the footy season's treating Bruce well!"), otherwise "hope you and the family have been well". The warm line comes FIRST, before any market or equity talk.
- Email: 2-3 short paragraphs maximum
- This is vendor prospecting — you sold this person a home and now you're reaching out about their property's value growth. Never say "I remember you from the open home."
- Reference the settlement — "hope you've been well since we settled on ${addr}" is a natural opener
- Reference being nearby or working on another listing in the street as the reason for reaching out
- Include at least one specific financial number (equity gain or estimated value)
- Celebrate the equity position as a positive — "well done" or "great result" style
- Offer a complimentary, no-obligation appraisal — never pressured, "let me know if you'd like a chat"
- Warm, casual, Australian-colloquial tone. Sounds like a mate checking in, not a pitch.
- If life-stage intelligence is provided, weave it in naturally (don't quote it verbatim — feel it)
- If timing triggers are provided, choose the most natural one to reference in the email (never force both)
- If suburb data is provided, reference one concrete local fact — makes the message feel informed
${nicknameRule ? nicknameRule + "\n" : ""}${greetingRule ? greetingRule + "\n" : ""}${personalisationBlock}

${enrichmentBlocks ? enrichmentBlocks + "\n" : ""}VENDOR DETAILS:
Name: ${params.buyerName}
Property: ${params.purchaseAddress}, ${params.suburb}
Purchased: ${params.purchaseYear} for ${fmtK(params.purchasePrice)}
Current estimate: ${estStr}
Equity gain: ${equityStr} (${equityPct}% over ${params.yearsHeld} years)
Annual growth: ${params.annualAppreciation.toFixed(1)}% p.a.${params.cashOnCashReturn ? `\nCash-on-cash return on deposit: ${params.cashOnCashReturn}%` : ""}${cgtContext}
Net proceeds estimate (after all costs): ${fmtK(params.netProceeds)}
Pipeline: ${params.pipelineLabel}
Triggers: ${params.triggerSummary}
Owner type: ${isInvestor ? "Investor (investment property)" : "Owner-occupier"}${compsBlock}

Write personalised SMS and email vendor outreach for ${fname}.

Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2","paragraph 3"]},"personalisationLine":"the single sentence from the email body that best references the personal detail from the CRM notes (copy verbatim from the body, or empty string if no personal detail was used)"}`

    // OpenAI is primary — this repo currently runs without an Anthropic key.
    // Anthropic stays as the fallback for any deployment that does have one.
    let raw: string
    let modelUsed: string
    if (process.env.OPENAI_API_KEY) {
      modelUsed = "gpt-4o-mini"
      const completion = await withRetry(() => getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: sonnetPrompt }],
      }))
      raw = completion.choices[0]?.message?.content ?? "{}"
    } else {
      modelUsed = "claude-haiku-4-5"
      const message = await withRetry(() => getClient().messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 700,
        messages: [{ role: "user", content: sonnetPrompt }],
      }))
      raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
    }
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    try {
      const parsed = JSON.parse(cleaned) as {
        sms: string
        email: { subject: string; body: string[] }
        personalisationLine?: string
      }
      return res.json({
        sms:   clampSMS(ensureSignoff(sanitise(parsed.sms ?? ""), agentFirst, agencyLabel, signoff)),
        email: {
          subject: sanitise(parsed.email?.subject ?? ""),
          body:    (parsed.email?.body ?? []).map(sanitise),
        },
        personalisationHook: personalisationHook || null,
        personalisationLine: sanitise(parsed.personalisationLine ?? "") || null,
        meta: { model_used: modelUsed },
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
    const smsRaw = `${greeting} ${fname}, hope you and the family have been well! ${addr} is sitting on a fair bit of equity today, about ${equityStr} since ${params.purchaseYear}. More than happy to grab a coffee (or tea) if you're keen? ${signoff}, ${agentSig}`
    return res.json({
      sms: clampSMS(sanitise(smsRaw)),
      email: {
        subject: sanitise(`Your property update, ${fname}`),
        body: [
          `${greeting} ${fname}, ${agentFirst} from ${agencyLabel} here. It's been a little while since we connected.`,
          `Wanted to give you a quick market update on ${params.purchaseAddress}. The suburb has grown well and your property is now worth approximately ${estStr}, representing ${equityStr} in equity since you purchased in ${params.purchaseYear}.${cgtLine}`,
          `More than happy to provide a complimentary appraisal, no obligation at all. Happy to call or come by whenever suits.\n\n${signoff},\n${agentSig}`,
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
