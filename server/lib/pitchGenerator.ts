/**
 * Pitch Generator — Price Update payload assembly.
 *
 * Builds the payload_json for a "price_update" pitch: an AI-written cover
 * note (in the agent's voice, cached-outreach-first) plus whichever data
 * sections the caller actually has. Sections with no data are simply
 * omitted from the payload so PitchView can render conditionally
 * (mirrors Realtair's "section only shows if it has a value" behaviour).
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { sanitiseText } from "./sanitise.js"

export interface PitchAgentInfo {
  name: string
  agency: string
  email?: string
  phone?: string
  suburb: string
  tagline?: string
  photoUrl?: string
}

export interface PitchCompSale {
  address: string
  price: number
  date: string
  beds: number
}

export interface PitchMarketStats {
  medianPrice?: number
  daysOnMarket?: number
  clearanceRate?: number
  annualGrowthPct?: number
}

export interface PitchRecipientInfo {
  name: string
  propertyAddress: string
  suburb: string
}

export interface PitchBuyerDemand {
  name: string
  detail: string
}

export interface PriceUpdatePayload {
  recipient?: PitchRecipientInfo
  coverNote?: string
  comparableSales?: PitchCompSale[]
  agentCard?: PitchAgentInfo
  marketStats?: PitchMarketStats
  buyerDemand?: PitchBuyerDemand
}

export interface AppraisalProperty {
  address:      string
  suburb:       string
  beds:         number
  baths:        number
  parking:      number
  landSqm?:     number
  propertyType: "House" | "Unit" | "Townhouse"
}

export interface AppraisalPriceGuide {
  low:        number
  mid:        number
  high:       number
  method:     string      // e.g. "Domain AVM + comparable analysis"
  confidence: string      // "high" | "medium" | "low" | "estimate"
}

export interface AppraisalPayload {
  property:         AppraisalProperty
  priceGuide:       AppraisalPriceGuide
  comparableSales?: PitchCompSale[]
  agentCard:        PitchAgentInfo
  executiveSummary: string
  suburbStats?: {
    medianHouse:       number
    annualGrowthPct:   number
    avgDaysOnMarket:   number
    clearanceRate:     number
  }
  disclaimer:   string
  generatedAt:  string
}

export interface GeneratePriceUpdateParams {
  agent: PitchAgentInfo
  recipientName: string
  propertyAddress: string
  suburb: string
  comparableSales?: PitchCompSale[]
  marketStats?: PitchMarketStats
  buyerDemand?: PitchBuyerDemand
  voiceContext?: string
  // If a vetted, hand-written cover note already exists for this lead/property
  // combo, use it verbatim (sanitised) instead of calling Claude.
  cachedCoverNote?: string
}

export async function generatePriceUpdatePitch(params: GeneratePriceUpdateParams): Promise<PriceUpdatePayload> {
  const payload: PriceUpdatePayload = {}

  payload.recipient = {
    name: params.recipientName,
    propertyAddress: params.propertyAddress,
    suburb: params.suburb,
  }
  payload.agentCard = params.agent

  if (params.comparableSales && params.comparableSales.length > 0) {
    payload.comparableSales = params.comparableSales
  }

  if (params.marketStats && Object.values(params.marketStats).some(v => v !== undefined)) {
    payload.marketStats = params.marketStats
  }

  if (params.buyerDemand) {
    payload.buyerDemand = params.buyerDemand
  }

  payload.coverNote = await generateCoverNote(params)

  return payload
}

async function generateCoverNote(params: GeneratePriceUpdateParams): Promise<string> {
  if (params.cachedCoverNote) return sanitiseText(params.cachedCoverNote)

  const { agent, recipientName, propertyAddress, suburb, comparableSales, voiceContext } = params
  const agentFirst = agent.name.split(" ")[0]
  const recipientFirst = recipientName.split(" ")[0]

  const voiceBlock = voiceContext
    ? voiceContext
    : "Communication style:\n- professional, warm, Australian-colloquial"

  const compsBlock = comparableSales && comparableSales.length > 0
    ? `\nRecent comparable sales near ${propertyAddress}:\n` +
      comparableSales.slice(0, 3).map(c => `- ${c.address}: $${c.price.toLocaleString("en-AU")} (${c.date}, ${c.beds}bd)`).join("\n")
    : ""

  const prompt = `You are ${agent.name}, a real estate agent at ${agent.agency} in ${agent.suburb}.

${voiceBlock}
${compsBlock}

Write a short cover note for a Price Update you're sending to ${recipientName} about their property at ${propertyAddress}, ${suburb}.

Hard rules:
- Write in first person as ${agent.name} — use "I" throughout.
- HARD CONSTRAINT: never use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma instead.
- 2-3 short paragraphs maximum.
- Use ${recipientFirst}'s first name at least once.
- Reference at least one specific data point from the comparable sales above if provided.
- No spam words (FREE, URGENT, ACT NOW etc.)
- NEVER use these AI-writing tells: leverage, utilize, robust, seamless, holistic, actionable, synergy, paradigm, delve, showcasing, cutting-edge, pivotal, "testament to", transformative, elevate, cornerstone, empower, nuanced, multifaceted, paramount, comprehensive. Use plain words.
- NO hollow openers: never start with "I wanted to reach out", "I hope this finds you well", "I wanted to let you know", "just wanted to touch base", "I came across", or "I wanted to share". Get straight to the point.
- Sign off with your first name only.

Respond with the cover note text only, no JSON, no markdown, no quotes.`

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }, { signal }),
    )

    const raw = message.content[0]?.type === "text" ? message.content[0].text : ""
    const cleaned = raw.replace(/```\n?/g, "").trim()
    if (!cleaned) throw new Error("empty response")
    return sanitiseText(cleaned)
  } catch {
    return sanitiseText(
      `Hi ${recipientFirst}, here's your latest market snapshot for ${suburb}. ` +
      `Some interesting activity near ${propertyAddress} recently, happy to talk through what it means for you.\n\n` +
      `Cheers,\n${agentFirst}`,
    )
  }
}
