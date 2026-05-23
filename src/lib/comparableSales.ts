/**
 * PropOS Comparable Sales Engine
 *
 * Estimates the current market value of a past buyer's property using:
 *   1. Suburb-level annualised growth rates (from historical scraper data)
 *   2. Property type + bedroom adjustments
 *   3. Simple compound-growth formula
 *
 * In production this would call Domain / CoreLogic APIs. In demo mode it uses
 * hardcoded suburb growth parameters derived from property_radar_v3 scraper data.
 */

// ---------------------------------------------------------------------------
// Suburb growth profiles
// ---------------------------------------------------------------------------

interface SuburbProfile {
  annualGrowthPct: number   // median annual capital growth % (10yr CAGR)
  medianHouse: number       // current median for Houses ($)
  medianUnit: number        // current median for Units/Townhouses ($)
  demandScore: number       // 1-10 demand index (higher = more buyer demand)
}

const SUBURB_PROFILES: Record<string, SuburbProfile> = {
  // Berwick corridor — primary demo suburbs
  "berwick":              { annualGrowthPct: 6.2,  medianHouse: 880000,  medianUnit: 510000, demandScore: 8 },
  "narre warren south":   { annualGrowthPct: 6.0,  medianHouse: 870000,  medianUnit: 490000, demandScore: 7 },
  "narre warren":         { annualGrowthPct: 5.8,  medianHouse: 790000,  medianUnit: 460000, demandScore: 7 },
  "hampton park":         { annualGrowthPct: 5.5,  medianHouse: 680000,  medianUnit: 430000, demandScore: 6 },
  "hallam":               { annualGrowthPct: 5.7,  medianHouse: 720000,  medianUnit: 440000, demandScore: 7 },
  "officer":              { annualGrowthPct: 6.5,  medianHouse: 760000,  medianUnit: 460000, demandScore: 7 },
  "pakenham":             { annualGrowthPct: 6.0,  medianHouse: 700000,  medianUnit: 430000, demandScore: 7 },
  "clyde north":          { annualGrowthPct: 6.8,  medianHouse: 800000,  medianUnit: 480000, demandScore: 8 },
  "cranbourne":           { annualGrowthPct: 5.6,  medianHouse: 740000,  medianUnit: 450000, demandScore: 7 },
  "dandenong":            { annualGrowthPct: 5.2,  medianHouse: 700000,  medianUnit: 440000, demandScore: 6 },
  "dandenong south":      { annualGrowthPct: 5.0,  medianHouse: 680000,  medianUnit: 420000, demandScore: 6 },
  // Inner suburbs
  "fitzroy":              { annualGrowthPct: 4.5,  medianHouse: 1500000, medianUnit: 700000, demandScore: 9 },
  "south yarra":          { annualGrowthPct: 4.2,  medianHouse: 2200000, medianUnit: 750000, demandScore: 9 },
  "malvern":              { annualGrowthPct: 4.8,  medianHouse: 2500000, medianUnit: 800000, demandScore: 9 },
  "glen waverley":        { annualGrowthPct: 5.5,  medianHouse: 1350000, medianUnit: 600000, demandScore: 8 },
}

const DEFAULT_PROFILE: SuburbProfile = {
  annualGrowthPct: 5.5,
  medianHouse: 800000,
  medianUnit: 480000,
  demandScore: 6,
}

// ---------------------------------------------------------------------------
// Bedroom premium table (% above/below median for bed count)
// ---------------------------------------------------------------------------

const BED_PREMIUM: Record<number, number> = {
  1: -0.20,
  2: -0.05,
  3:  0.00,
  4:  0.10,
  5:  0.18,
  6:  0.25,
}

// ---------------------------------------------------------------------------
// Estimate current value
// ---------------------------------------------------------------------------

export interface ValueEstimate {
  estimate: number      // point estimate (rounded to nearest $5K)
  low: number           // -8% confidence range
  high: number          // +8% confidence range
  method: "compound_growth" | "median_adjusted"
  annualGrowthUsed: number
  suburbProfile: SuburbProfile
}

export function estimateCurrentValue(params: {
  purchasePrice: number
  purchaseDate: string
  suburb: string
  propertyType: "House" | "Unit" | "Townhouse"
  beds: number
}): ValueEstimate {
  const { purchasePrice, purchaseDate, suburb, propertyType, beds } = params
  const profile = SUBURB_PROFILES[suburb.toLowerCase().trim()] ?? DEFAULT_PROFILE

  const buyDate = new Date(purchaseDate)
  const now = new Date()
  const yearsHeld = Math.max((now.getTime() - buyDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 0)

  // Method 1: Compound growth on purchase price
  const growthRate = profile.annualGrowthPct / 100
  const compoundEstimate = purchasePrice * Math.pow(1 + growthRate, yearsHeld)

  // Method 2: Median-based (anchored to current suburb median)
  const baseMedian = propertyType === "House" ? profile.medianHouse : profile.medianUnit
  const bedPremium = BED_PREMIUM[beds] ?? 0
  const medianAdjusted = baseMedian * (1 + bedPremium)

  // Blend: 60% compound growth, 40% median-based (mimics CoreLogic AVM methodology)
  const blended = compoundEstimate * 0.60 + medianAdjusted * 0.40

  // Round to nearest $5K
  const estimate = Math.round(blended / 5000) * 5000
  const low      = Math.round(estimate * 0.92 / 5000) * 5000
  const high     = Math.round(estimate * 1.08 / 5000) * 5000

  return {
    estimate,
    low,
    high,
    method: "compound_growth",
    annualGrowthUsed: profile.annualGrowthPct,
    suburbProfile: profile,
  }
}

// ---------------------------------------------------------------------------
// Batch estimates — for the VendorPortfolio loading step
// ---------------------------------------------------------------------------

export function batchEstimateValues(
  buyers: Array<{
    id: number
    purchasePrice: number
    purchaseDate: string
    suburb: string
    propertyType: "House" | "Unit" | "Townhouse"
    beds: number
  }>,
  overrides?: Record<number, number>,  // manual value overrides from CURRENT_VALUE_ESTIMATES
): Map<number, number> {
  const result = new Map<number, number>()
  for (const b of buyers) {
    if (overrides && overrides[b.id] !== undefined) {
      result.set(b.id, overrides[b.id])
    } else {
      const est = estimateCurrentValue(b)
      result.set(b.id, est.estimate)
    }
  }
  return result
}
