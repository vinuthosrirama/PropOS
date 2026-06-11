/**
 * Appraisal Generator
 *
 * Assembles an AppraisalPayload for a new pitch of type 'appraisal' by:
 *   1. Calling Domain AVM (with AbortSignal timeout)
 *   2. Getting suburb context (sync)
 *   3. Generating a 2-paragraph executive summary via Claude (with LLM fallback)
 *   4. Blending Domain AVM + suburb compound-growth into a price guide
 *
 * Called from POST /api/pitches/appraisal — target wall-clock time < 30s.
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { getDomainEstimate, type AvmEstimate } from "./domainAvm.js"
import { getSuburbContext } from "./suburbContext.js"
import { getActivePrompt, getActiveVersionId, recordSignal } from "./promptOptimiser.js"
import { sanitiseText } from "./sanitise.js"
import type { AppraisalPayload, AppraisalProperty, AppraisalPriceGuide, PitchAgentInfo, PitchCompSale } from "./pitchGenerator.js"

// ── Fallback system prompt (overridden by DB-stored version once trained) ──────

const APPRAISAL_SYSTEM_PROMPT = `You are writing a pre-listing appraisal executive summary on behalf of a real estate agent. Write in first person, professional and confident but warm. 2 paragraphs: (1) current market conditions in the suburb relevant to this property type, (2) recommended price positioning and rationale. Never use em-dashes. Never use these AI-writing tells: leverage, utilize, robust, seamless, holistic, actionable, synergy, paradigm, delve, showcasing, cutting-edge, pivotal, transformative, elevate, cornerstone, empower, nuanced, multifaceted, paramount, comprehensive. Use plain words. Max 150 words total.`

const APPRAISAL_DISCLAIMER = "This estimate is indicative only and does not constitute a formal property valuation. Prepared for general guidance purposes. For a formal valuation, engage a licensed property valuer."

// ── Price blending ────────────────────────────────────────────────────────────

function blendPriceGuide(
  avm: AvmEstimate | null,
  suburbMid: number,
  annualGrowthPct: number,
): AppraisalPriceGuide {
  let mid: number
  let confidence: string
  let method: string

  if (avm && avm.confidence !== "low" && avm.confidence !== "unknown") {
    // Domain AVM is reliable — blend 60% AVM, 40% suburb growth model
    mid = Math.round((0.6 * avm.mid + 0.4 * suburbMid) / 1000) * 1000
    confidence = avm.confidence
    method = "Domain AVM + comparable analysis"
  } else if (avm) {
    // AVM present but low confidence — use as a soft anchor
    mid = Math.round((0.4 * avm.mid + 0.6 * suburbMid) / 1000) * 1000
    confidence = "medium"
    method = "Comparable analysis (Domain AVM low confidence)"
  } else {
    // No AVM — suburb growth model only
    mid = Math.round(suburbMid / 1000) * 1000
    confidence = "estimate"
    method = "Comparable analysis"
  }

  const low  = Math.round(Math.min(avm?.low ?? mid * 0.92, mid * 0.92) / 1000) * 1000
  const high = Math.round(Math.max(avm?.high ?? mid * 1.08, mid * 1.08) / 1000) * 1000

  return { low, mid, high, confidence, method }
}

// ── Executive summary generation ──────────────────────────────────────────────

async function generateExecutiveSummary(
  property: AppraisalProperty,
  priceGuide: AppraisalPriceGuide,
  agentName: string,
  suburbPromptBlock: string | null,
): Promise<{ text: string; versionId: number | null }> {
  const systemPrompt = await getActivePrompt("appraisal_system", APPRAISAL_SYSTEM_PROMPT)
  const versionId = await getActiveVersionId("appraisal_system")

  const fmtMid = `$${priceGuide.mid.toLocaleString("en-AU")}`
  const fmtRange = `$${priceGuide.low.toLocaleString("en-AU")} to $${priceGuide.high.toLocaleString("en-AU")}`

  const userPrompt = [
    `Agent: ${agentName}`,
    `Property: ${property.address}, ${property.suburb}`,
    `Type: ${property.propertyType}, ${property.beds}bd ${property.baths}ba`,
    `Estimated value: ${fmtMid} (range ${fmtRange}, method: ${priceGuide.method})`,
    suburbPromptBlock ? `\n${suburbPromptBlock}` : `Suburb: ${property.suburb}`,
    "\nWrite the executive summary now:",
  ].join("\n")

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }, { signal }),
    )
    const raw = message.content[0]?.type === "text" ? message.content[0].text : ""
    const cleaned = raw.replace(/```\n?/g, "").trim()
    if (!cleaned) throw new Error("empty LLM response")

    if (versionId) void recordSignal(versionId, "approved")
    return { text: sanitiseText(cleaned), versionId }
  } catch {
    // Template fallback — always succeeds
    const agentFirst = agentName.split(" ")[0]
    const fallback = [
      `${property.suburb} continues to see steady buyer activity, with properties in this price range attracting genuine interest from families and investors alike. ` +
      `The ${property.beds}-bedroom ${property.propertyType.toLowerCase()} market remains competitive, with well-presented homes moving quickly.`,
      `Based on recent comparable sales and current suburb data, I'm comfortable recommending a price guide of ${fmtRange}. ` +
      `This positions the property to attract strong opening interest while giving room to achieve a premium outcome. ` +
      `Happy to talk through the strategy in more detail. ${agentFirst}.`,
    ].join("\n\n")
    return { text: fallback, versionId: null }
  }
}

// ── Public assembly function ──────────────────────────────────────────────────

export interface AppraisalGenParams {
  property:       AppraisalProperty
  agent:          PitchAgentInfo
  comparableSales?: PitchCompSale[]
}

export async function generateAppraisalPayload(
  params: AppraisalGenParams,
): Promise<AppraisalPayload> {
  const { property, agent, comparableSales } = params

  // Parallel: Domain AVM + suburb context (sync, wrapped in Promise.resolve)
  const [avmResult, ctxResult] = await Promise.allSettled([
    getDomainEstimate(property.address),
    Promise.resolve(getSuburbContext(property.suburb)),
  ])

  const avm = avmResult.status === "fulfilled" ? avmResult.value : null
  const ctx = ctxResult.status === "fulfilled" ? ctxResult.value : null

  // Suburb median as the growth-model mid price
  const suburbMid = ctx
    ? (property.propertyType === "Unit" ? ctx.stats.medianUnit : ctx.stats.medianHouse)
    : 850_000   // Melbourne metro fallback

  const priceGuide = blendPriceGuide(avm, suburbMid, ctx?.stats.annualGrowthPct ?? 5.5)

  const { text: executiveSummary } = await generateExecutiveSummary(
    property, priceGuide, agent.name, ctx?.promptBlock ?? null,
  )

  const suburbStats = ctx ? {
    medianHouse:     ctx.stats.medianHouse,
    annualGrowthPct: ctx.stats.annualGrowthPct,
    avgDaysOnMarket: ctx.stats.avgDaysOnMarket,
    clearanceRate:   ctx.stats.clearanceRate,
  } : undefined

  return {
    property,
    priceGuide,
    comparableSales: comparableSales ?? [],
    agentCard: agent,
    executiveSummary,
    suburbStats,
    disclaimer: APPRAISAL_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  }
}
