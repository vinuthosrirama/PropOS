// PropOS Vendor Pipeline Segmentation
//
// Classifies past buyers into actionable pipelines based on:
//   - ownership status (investor vs owner-occupier)
//   - hold period
//   - property type / family signals
//   - agent notes
//   - financial position (equity, CGT window)

import type { PastBuyer } from "../data/pastBuyers"
import type { FinancialSnapshot } from "./vendorFinancials"

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export type Pipeline =
  | "investor-to-seller"      // investor who should sell for profit
  | "investor-to-rebalance"   // investor who should rebalance portfolio
  | "owner-to-seller"         // owner-occupier ready to move on
  | "owner-to-upsizer"        // owner in starter home, family growing
  | "owner-to-downsizer"      // owner in large home, kids gone
  | "renter-to-buyer"         // was renting, now ready to buy

export interface PipelineLabel {
  id: Pipeline
  label: string
  shortLabel: string
  color: string
  icon: string
  description: string
}

export const PIPELINE_LABELS: Record<Pipeline, PipelineLabel> = {
  "investor-to-seller":    { id: "investor-to-seller",    label: "Investor: Sell for Profit",    shortLabel: "Sell for profit",    color: "#64d090", icon: "💰", description: "Held long enough to maximise CGT discount. Strong equity position. Time to realise gains." },
  "investor-to-rebalance": { id: "investor-to-rebalance", label: "Investor: Rebalance",          shortLabel: "Rebalance",          color: "#a6daff", icon: "⚖️", description: "Consider selling one to reinvest. Market conditions favour realisation." },
  "owner-to-seller":       { id: "owner-to-seller",       label: "Owner: Ready to Move",         shortLabel: "Ready to move",      color: "#c8a0ff", icon: "🏠", description: "Life stage suggests readiness. Equity unlocks the next chapter." },
  "owner-to-upsizer":      { id: "owner-to-upsizer",      label: "Owner: Upsizing",              shortLabel: "Upsizer",            color: "#ffb864", icon: "📐", description: "Growing family, outgrowing current home. Equity enables the upgrade." },
  "owner-to-downsizer":    { id: "owner-to-downsizer",    label: "Owner: Downsizing",            shortLabel: "Downsizer",          color: "#ff9e9e", icon: "🏡", description: "Kids have left or retiring. Free up equity, reduce maintenance." },
  "renter-to-buyer":       { id: "renter-to-buyer",       label: "Renter: Ready to Buy",         shortLabel: "Renter to buyer",    color: "#90e0c0", icon: "🔑", description: "Renting in the area but showing purchase intent. Help them take the step." },
}

// ---------------------------------------------------------------------------
// Trigger events — generated from rules + notes analysis
// ---------------------------------------------------------------------------

export interface TriggerEvent {
  label: string
  urgency: "high" | "medium" | "low"
  source: "rule" | "notes" | "financial"
}

// ---------------------------------------------------------------------------
// Segment a single past buyer
// ---------------------------------------------------------------------------

export interface SegmentResult {
  pipeline: Pipeline
  confidence: number          // 0-100
  triggers: TriggerEvent[]
  pitchAngles: string[]       // natural language pitch points
}

export function segmentBuyer(
  buyer: PastBuyer,
  financials: FinancialSnapshot,
): SegmentResult {
  const triggers: TriggerEvent[] = []
  const pitchAngles: string[] = []
  const notesLower = (buyer.notes ?? "").toLowerCase()
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const suburb = buyer.suburb

  // ── Rule-based classification ─────────────────────────────────────────

  // INVESTOR checks
  if (buyer.status === "investor") {
    // CGT window — trigger label hidden; data still used in financial snapshots
    if (financials.cgtDiscount && financials.cgtSavingsBy2027 > 5000) {
      pitchAngles.push(`${fname} saves roughly ${fmtK(financials.cgtSavingsBy2027)} in tax if they sell before July 2027. That window is closing fast and most investors don't realise until it's too late.`)
    }

    // Strong equity
    if (financials.equityGainPct > 30) {
      triggers.push({ label: `${Math.round(financials.equityGainPct)}% equity gain since purchase`, urgency: "high", source: "financial" })
      pitchAngles.push(`${fname}'s place in ${suburb} has grown ${Math.round(financials.equityGainPct)}% since purchase. That's ${fmtK(financials.equityGain)} sitting there. Worth a conversation about what that could unlock.`)
    }

    // Cash-on-cash
    if (financials.cashOnCashReturn && financials.cashOnCashReturn > 100) {
      triggers.push({ label: `${financials.cashOnCashReturn}% return on original deposit`, urgency: "medium", source: "financial" })
      pitchAngles.push(`${fname} put in ${fmtK(financials.depositOriginal!)} and is now sitting on ${fmtK(financials.equityGain)} in equity. That's a ${financials.cashOnCashReturn}% return. Hard to find that anywhere else right now.`)
    }

    // Long hold → sell for profit
    if (financials.yearsHeld >= 5) {
      triggers.push({ label: `Held ${financials.yearsHeld} years, profit-taking window`, urgency: "medium", source: "rule" })
      const pipeline: Pipeline = "investor-to-seller"
      return { pipeline, confidence: 85, triggers, pitchAngles }
    }

    // Short hold → rebalance
    return { pipeline: "investor-to-rebalance", confidence: 70, triggers, pitchAngles }
  }

  // OWNER-OCCUPIER checks
  if (buyer.status === "owner-occupier" || buyer.status === "unknown") {

    // Notes-based triggers
    if (/upsize|upgrad|bigger|growing|more room|more space|another baby|third kid|fourth bed|5th bed/i.test(notesLower)) {
      triggers.push({ label: "Notes mention upsizing / growing family", urgency: "high", source: "notes" })
      pitchAngles.push(`The family's outgrown the ${buyer.beds}-bed. With ${fmtK(financials.equityGain)} in equity they could step up to something with more space and barely feel it.`)
    }

    if (/downsize|retire|empty nest|kids.*left|kids.*gone|kids.*moved|too big|maintenance/i.test(notesLower)) {
      triggers.push({ label: "Notes mention downsizing / retirement", urgency: "high", source: "notes" })
      pitchAngles.push(`${fname} is probably paying maintenance on rooms they don't need anymore. ${fmtK(financials.equityGain)} in equity and a downsizer discount could set them up really comfortably.`)
    }

    if (/relocat|moving.*interstate|moving.*overseas|job.*transfer|brisbane|sydney|perth|adelaide/i.test(notesLower)) {
      triggers.push({ label: "Relocation mentioned in notes", urgency: "high", source: "notes" })
      pitchAngles.push(`If ${fname}'s move is getting closer, the timing works in their favour. ${suburb} is running well and their equity position is strong for a clean exit.`)
    }

    if (/separat|divorce|split|settlement/i.test(notesLower)) {
      triggers.push({ label: "Life change: separation/settlement", urgency: "high", source: "notes" })
      pitchAngles.push(`${fname} is going through a lot. I can keep this discreet, move quickly, and make the process as smooth as possible for everyone.`)
    }

    // School calendar trigger — Year 11/12 transition is the #1 family move trigger
    const yrMatch = notesLower.match(/yr\s*(\d+)|year\s*(\d+)/)
    const yrNum = yrMatch ? parseInt(yrMatch[1] ?? yrMatch[2], 10) : null
    if (yrNum !== null && yrNum >= 9 && yrNum <= 12) {
      const yrsToFinish = Math.max(0, 12 - yrNum)
      const urgency: TriggerEvent["urgency"] = yrsToFinish <= 1 ? "high" : yrsToFinish <= 2 ? "medium" : "low"
      triggers.push({
        label: yrsToFinish === 0
          ? "School transition: child finishing Year 12 this year — peak move window"
          : `School transition: ${yrsToFinish} year${yrsToFinish > 1 ? "s" : ""} until Year 12 — plan now`,
        urgency,
        source: "notes",
      })
      pitchAngles.push(
        yrsToFinish === 0
          ? `With the kids finishing school this year, now is the natural window for ${fname} to make the next move. Most families wait until after — getting in before means less competition and better timing on CGT.`
          : `${fname}'s children are ${yrsToFinish} year${yrsToFinish > 1 ? "s" : ""} from finishing school. That's the most common trigger for a move in ${suburb} — worth a conversation now while they can plan properly.`
      )
    } else if (/school|kindy|prep|primary|yr\s*[1-8]|year\s*[1-8]/i.test(notesLower) && /kid|child|son|daughter/i.test(notesLower)) {
      triggers.push({ label: "School-zone timing: children in school years align with upgrade window", urgency: "medium", source: "notes" })
      pitchAngles.push(`Families in ${suburb} with school-age kids tend to move when the timing aligns with school zones. ${fname}'s equity position means they can move on their terms.`)
    }

    // Property-based inference
    if (buyer.beds <= 3 && /kid|child|baby|school|family|pregnant/i.test(notesLower)) {
      triggers.push({ label: `${buyer.beds}-bed home with growing family`, urgency: "medium", source: "rule" })
      return { pipeline: "owner-to-upsizer", confidence: 80, triggers, pitchAngles }
    }

    if (buyer.beds >= 4 && financials.yearsHeld >= 8 && /retire|downsize|empty|kids.*left/i.test(notesLower)) {
      triggers.push({ label: `${buyer.beds}-bed home, held ${financials.yearsHeld}yrs, downsizing signals`, urgency: "medium", source: "rule" })
      return { pipeline: "owner-to-downsizer", confidence: 80, triggers, pitchAngles }
    }

    // Equity-based triggers (apply to all owners)
    if (financials.equityGainPct > 25) {
      triggers.push({ label: `${Math.round(financials.equityGainPct)}% equity growth`, urgency: "medium", source: "financial" })
      pitchAngles.push(`${fname}'s place has grown ${Math.round(financials.equityGainPct)}% since they bought. Most people in ${suburb} don't realise the position they're in. ${fmtK(financials.equityGain)} is real buying power.`)
    }

    // Long hold + no strong signals → general seller
    if (financials.yearsHeld >= 7) {
      triggers.push({ label: `Owned ${financials.yearsHeld} years, natural move window`, urgency: "low", source: "rule" })
    }

    // Determine pipeline from strongest trigger
    if (triggers.some(t => t.source === "notes" && /upsize|growing/i.test(t.label))) {
      return { pipeline: "owner-to-upsizer", confidence: 75, triggers, pitchAngles }
    }
    if (triggers.some(t => t.source === "notes" && /downsize|retire/i.test(t.label))) {
      return { pipeline: "owner-to-downsizer", confidence: 75, triggers, pitchAngles }
    }

    // Default owner → general seller
    const conf = financials.equityGainPct > 20 ? 65 : financials.yearsHeld > 5 ? 55 : 40
    return { pipeline: "owner-to-seller", confidence: conf, triggers, pitchAngles }
  }

  // RENTER
  if (buyer.status === "renter") {
    triggers.push({ label: "Currently renting, potential first home buyer", urgency: "medium", source: "rule" })
    pitchAngles.push(`${fname} is still renting. Worth a conversation about what getting into the market actually looks like now versus waiting another year.`)
    return { pipeline: "renter-to-buyer", confidence: 50, triggers, pitchAngles }
  }

  // Fallback
  return { pipeline: "owner-to-seller", confidence: 30, triggers, pitchAngles }
}

// ---------------------------------------------------------------------------
// Batch segmentation — sort by priority
// ---------------------------------------------------------------------------

export interface SegmentedBuyer {
  buyer: PastBuyer
  financials: FinancialSnapshot
  segment: SegmentResult
  priority: number   // 0-100, higher = contact first
}

export function batchSegment(
  buyers: PastBuyer[],
  financials: Map<number, FinancialSnapshot>,
): SegmentedBuyer[] {
  return buyers
    .map(buyer => {
      const fin = financials.get(buyer.id)
      if (!fin) return null
      const segment = segmentBuyer(buyer, fin)

      // Priority score: weighted combination of confidence, equity, urgency, recency
      const urgencyBoost = segment.triggers.some(t => t.urgency === "high") ? 20 : segment.triggers.some(t => t.urgency === "medium") ? 10 : 0
      const equityBoost = Math.min(fin.equityGainPct / 2, 20)
      const cgtBoost = fin.cgtSavingsBy2027 > 10000 ? 15 : fin.cgtSavingsBy2027 > 5000 ? 8 : 0
      const priority = Math.min(100, Math.round(segment.confidence * 0.4 + urgencyBoost + equityBoost + cgtBoost))

      return { buyer, financials: fin, segment, priority }
    })
    .filter((x): x is SegmentedBuyer => x !== null)
    .sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}
