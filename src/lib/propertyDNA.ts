/**
 * Property DNA — fingerprints a past buyer's property and life-stage
 * so the listing match engine can rank them accurately.
 */

import type { PastBuyer } from "../data/pastBuyers"
import type { FinancialSnapshot } from "./vendorFinancials"

export type PropertyClass = "starter" | "family" | "prestige" | "investor-grade" | "downsizer"
export type LocationTier  = "core" | "growth" | "fringe"
export type LifeStage     = "establishing" | "growing" | "plateauing" | "transitioning" | "downsizing"

export interface PropertyDNA {
  propertyClass:    PropertyClass
  landScore:        number   // 0-100
  locationTier:     LocationTier
  upgradeCapacity:  number   // max $ buyer could spend on next property (equity × 3 leverage)
  lifeStage:        LifeStage
  matchTags:        string[]
}

// ---------------------------------------------------------------------------
// Location tier lookup
// ---------------------------------------------------------------------------

const CORE_SUBURBS    = new Set(["berwick", "narre warren south", "hallam", "narre warren"])
const GROWTH_SUBURBS  = new Set(["officer", "pakenham"])
// Everything else = fringe

function locationTier(suburb: string): LocationTier {
  const s = suburb.toLowerCase().trim()
  if (CORE_SUBURBS.has(s))   return "core"
  if (GROWTH_SUBURBS.has(s)) return "growth"
  return "fringe"
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computePropertyDNA(
  buyer:      PastBuyer,
  financials: FinancialSnapshot,
): PropertyDNA {
  const notes = (buyer.notes ?? "").toLowerCase()

  // ── Property class ────────────────────────────────────────────────────────
  let propertyClass: PropertyClass
  if (buyer.status === "investor") {
    propertyClass = "investor-grade"
  } else if (financials.yearsHeld >= 8 && buyer.beds >= 4 && /downsize|retire|empty nest|kids.*left|kids.*gone|too big/i.test(notes)) {
    propertyClass = "downsizer"
  } else if (financials.equityGainPct > 55) {
    propertyClass = "prestige"
  } else if (buyer.beds >= 4 && (buyer.land ?? 0) >= 600 && /kid|child|family|school|grow/i.test(notes)) {
    propertyClass = "family"
  } else {
    propertyClass = "starter"
  }

  // ── Land score ────────────────────────────────────────────────────────────
  const land = buyer.land ?? 0
  const landScore = land === 0 ? 0 : Math.min(100, Math.round(land / 9))

  // ── Life stage ────────────────────────────────────────────────────────────
  let lifeStage: LifeStage
  if (/downsize|retire|empty nest|kids.*left|kids.*gone/i.test(notes) || (financials.yearsHeld >= 10 && buyer.beds >= 4)) {
    lifeStage = "downsizing"
  } else if (/relocat|moving.*interstate|job.*transfer|another city|perth|brisbane|sydney/i.test(notes)) {
    lifeStage = "transitioning"
  } else if (/upsize|bigger|growing|more room|another baby|third kid|fourth bed/i.test(notes) || (buyer.beds <= 3 && /kid|child|school/i.test(notes))) {
    lifeStage = "growing"
  } else if (financials.yearsHeld >= 5 && financials.yearsHeld < 9) {
    lifeStage = "plateauing"
  } else {
    lifeStage = "establishing"
  }

  // ── Upgrade capacity ─────────────────────────────────────────────────────
  const upgradeCapacity = Math.min(financials.equityGain * 3, 1_500_000)

  // ── Match tags ────────────────────────────────────────────────────────────
  const matchTags: string[] = []
  if (buyer.beds >= 4)              matchTags.push(`${buyer.beds}-bed`)
  if (landScore >= 60)              matchTags.push("big-land")
  if (/school/i.test(notes))        matchTags.push("school-zone")
  if (propertyClass === "investor-grade") matchTags.push("investor-exit")
  if (lifeStage === "growing")      matchTags.push("upsizer")
  if (lifeStage === "downsizing")   matchTags.push("downsizer")
  if (financials.cgtSavingsBy2027 > 8000) matchTags.push("cgt-window")
  if (upgradeCapacity > 600_000)    matchTags.push("strong-capacity")

  return {
    propertyClass,
    landScore,
    locationTier: locationTier(buyer.suburb),
    upgradeCapacity,
    lifeStage,
    matchTags,
  }
}
