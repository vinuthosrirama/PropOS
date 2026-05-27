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

  // ── Rule-based classification ─────────────────────────────────────────

  // INVESTOR checks
  if (buyer.status === "investor") {
    // CGT window
    if (financials.cgtDiscount && financials.cgtSavingsBy2027 > 5000) {
      triggers.push({ label: `CGT 50% discount saves ${fmtK(financials.cgtSavingsBy2027)}, window closes July 2027`, urgency: "high", source: "financial" })
      pitchAngles.push(`Selling before July 2027 saves you approximately ${fmtK(financials.cgtSavingsBy2027)} in capital gains tax under the current 50% discount`)
    }

    // Strong equity
    if (financials.equityGainPct > 30) {
      triggers.push({ label: `${Math.round(financials.equityGainPct)}% equity gain since purchase`, urgency: "high", source: "financial" })
      pitchAngles.push(`Your property has grown ${Math.round(financials.equityGainPct)}% since you bought it. That's ${fmtK(financials.equityGain)} in equity.`)
    }

    // Cash-on-cash
    if (financials.cashOnCashReturn && financials.cashOnCashReturn > 100) {
      triggers.push({ label: `${financials.cashOnCashReturn}% return on original deposit`, urgency: "medium", source: "financial" })
      pitchAngles.push(`Your original deposit of ${fmtK(financials.depositOriginal!)} has turned into ${fmtK(financials.equityGain)} in equity, a ${financials.cashOnCashReturn}% return.`)
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
      pitchAngles.push("Your family is growing and your current equity could unlock the space you need.")
    }

    if (/downsize|retire|empty nest|kids.*left|kids.*gone|kids.*moved|too big|maintenance/i.test(notesLower)) {
      triggers.push({ label: "Notes mention downsizing / retirement", urgency: "high", source: "notes" })
      pitchAngles.push("With the kids settled, now could be the perfect time to unlock your equity and simplify")
    }

    if (/relocat|moving.*interstate|moving.*overseas|job.*transfer|brisbane|sydney|perth|adelaide/i.test(notesLower)) {
      triggers.push({ label: "Relocation mentioned in notes", urgency: "high", source: "notes" })
      pitchAngles.push("If you're considering a move, the current market gives you a strong position to sell")
    }

    if (/separat|divorce|split|settlement/i.test(notesLower)) {
      triggers.push({ label: "Life change: separation/settlement", urgency: "high", source: "notes" })
      pitchAngles.push("I understand things are changing. I can make the process as smooth and private as possible.")
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
      pitchAngles.push(`Your home has appreciated ${Math.round(financials.equityGainPct)}% since you purchased. That's ${fmtK(financials.equityGain)} in equity you could deploy.`)
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
    pitchAngles.push("Have you thought about making the move from renting to owning? Happy to show you what's possible")
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
