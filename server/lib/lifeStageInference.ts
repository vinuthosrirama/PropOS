/**
 * Layer 2: Life-Stage Inference Engine
 *
 * Uses Claude Haiku to extract structured life-stage data that the agent's
 * CRM notes IMPLY but don't explicitly state. Results are cached in-memory
 * by a fingerprint of the notes + property details (notes rarely change).
 *
 * Input:  free-text CRM notes + property spec
 * Output: LifeStageProfile — structured JSON with family, career, pain points
 *
 * Cost: ~$0.001 per contact (Haiku at ~500 tokens in/out)
 */

import { getClient } from "./claude.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifeStageProfile {
  /** Inferred children — names/ages where mentioned, otherwise estimated from context */
  children: Array<{ name?: string; estimatedAge?: number; school?: string }>
  /** Partner/spouse name if mentioned */
  partnerName?: string
  /** Career/work signals */
  workSituation?: string    // e.g. "David commutes to CBD, Karen part-time"
  /** Who makes the decisions in this household */
  decisionMaker?: string    // e.g. "Karen", "David", "joint"
  /** Specific things about the property they don't like */
  propertyPainPoints: string[]  // e.g. ["kitchen too small", "garden too big"]
  /** Things they said or implied they WANT in a home */
  futureWants: string[]         // e.g. ["bigger kitchen", "close to train"]
  /** Any forward-looking signals they mentioned */
  futureIntentSignals: string[] // e.g. ["mentioned upsizing", "thinking about retiring"]
  /** Emotional triggers — what they care about */
  emotionalTriggers: string[]   // e.g. ["family gatherings", "kids' school community"]
  /** Preferred communication tone — extracted from notes */
  communicationTone?: string    // e.g. "warm and casual", "formal, investor mindset"
  /** Confidence 0-100 — how much usable personal data was found */
  confidence: number
}

// ---------------------------------------------------------------------------
// In-memory cache (notes rarely change — no need to re-infer every request)
// ---------------------------------------------------------------------------

const cache = new Map<string, LifeStageProfile>()

function cacheKey(notes: string, beds: number, propertyType: string): string {
  // Simple fingerprint — first 200 chars of notes + property spec
  return `${notes.slice(0, 200)}|${beds}|${propertyType}`
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function inferLifeStage(params: {
  notes: string
  buyerName: string
  purchaseAddress: string
  purchaseYear: string
  beds: number
  propertyType: string
}): Promise<LifeStageProfile | null> {
  const { notes, buyerName, purchaseAddress, purchaseYear, beds, propertyType } = params

  // Skip if no useful notes
  if (!notes || notes.trim().length < 10) return null

  // Check cache
  const key = cacheKey(notes, beds, propertyType)
  if (cache.has(key)) return cache.get(key)!

  // Skip if no Anthropic key
  if (!process.env.ANTHROPIC_API_KEY) return null

  const prompt = `You are extracting structured personal intelligence from a real estate agent's CRM notes about a past buyer.

Buyer: ${buyerName}
Property: ${purchaseAddress} (purchased ${purchaseYear}, ${beds}-bed ${propertyType})
CRM notes: "${notes}"

Extract what the notes IMPLY, not just what they say explicitly. For example:
- "two kids at Berwick Primary" → children aged ~6-12, school community matters
- "mentioned wanting more space" → property pain point, upsizing intent
- "David commutes to the city" → career signal, transport matters
- "Karen runs the household" → decision maker is Karen

Return ONLY valid JSON matching this exact shape (use null/empty for unknown fields):
{
  "children": [{"name": "...", "estimatedAge": 0, "school": "..."}],
  "partnerName": "...",
  "workSituation": "...",
  "decisionMaker": "...",
  "propertyPainPoints": ["..."],
  "futureWants": ["..."],
  "futureIntentSignals": ["..."],
  "emotionalTriggers": ["..."],
  "communicationTone": "...",
  "confidence": 0
}

Rules:
- confidence: 0-100 based on how much specific personal data you found (0 = nothing personal, 100 = rich detail)
- Only include children entries where there's actual evidence of children
- propertyPainPoints: specific things wrong with their CURRENT property
- futureWants: what they want in their NEXT property
- emotionalTriggers: what they genuinely care about (family, community, money, lifestyle etc)
- communicationTone: warm/casual or formal/professional based on how the agent described them
- NEVER invent facts not implied by the notes
- Return ONLY the JSON object, no markdown, no explanation`

  try {
    const msg = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : ""
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    const parsed = JSON.parse(cleaned) as LifeStageProfile
    // Validate minimal shape
    if (typeof parsed.confidence !== "number") parsed.confidence = 30
    parsed.children        = Array.isArray(parsed.children)        ? parsed.children        : []
    parsed.propertyPainPoints = Array.isArray(parsed.propertyPainPoints) ? parsed.propertyPainPoints : []
    parsed.futureWants     = Array.isArray(parsed.futureWants)     ? parsed.futureWants     : []
    parsed.futureIntentSignals = Array.isArray(parsed.futureIntentSignals) ? parsed.futureIntentSignals : []
    parsed.emotionalTriggers = Array.isArray(parsed.emotionalTriggers) ? parsed.emotionalTriggers : []

    cache.set(key, parsed)
    return parsed

  } catch {
    // Non-fatal — continue without life-stage data
    return null
  }
}

// ---------------------------------------------------------------------------
// Render to prompt block
// ---------------------------------------------------------------------------

/**
 * Convert a LifeStageProfile into a concise text block for injection into the
 * Sonnet outreach prompt. Skips empty / low-confidence fields.
 */
export function renderLifeStageBlock(profile: LifeStageProfile | null): string {
  if (!profile || profile.confidence < 20) return ""

  const lines: string[] = []

  if (profile.children.length > 0) {
    const childDesc = profile.children.map(c => {
      const parts = []
      if (c.name) parts.push(c.name)
      if (c.estimatedAge) parts.push(`~${c.estimatedAge}yo`)
      if (c.school) parts.push(`at ${c.school}`)
      return parts.join(" ") || "child"
    })
    lines.push(`Children: ${childDesc.join(", ")}`)
  }
  if (profile.partnerName) lines.push(`Partner: ${profile.partnerName}`)
  if (profile.workSituation) lines.push(`Work: ${profile.workSituation}`)
  if (profile.decisionMaker) lines.push(`Decision maker: ${profile.decisionMaker}`)
  if (profile.propertyPainPoints.length > 0) lines.push(`Current property pain: ${profile.propertyPainPoints.join("; ")}`)
  if (profile.futureWants.length > 0) lines.push(`What they want next: ${profile.futureWants.join("; ")}`)
  if (profile.futureIntentSignals.length > 0) lines.push(`Intent signals: ${profile.futureIntentSignals.join("; ")}`)
  if (profile.emotionalTriggers.length > 0) lines.push(`What they care about: ${profile.emotionalTriggers.join(", ")}`)
  if (profile.communicationTone) lines.push(`Tone: ${profile.communicationTone}`)

  if (lines.length === 0) return ""
  return `=== LIFE-STAGE INTELLIGENCE (from CRM notes) ===\n${lines.join("\n")}`
}
