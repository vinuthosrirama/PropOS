/**
 * PropOS Vendor Appraisal Engine
 *
 * Generates comparable recent sales, an estimated value range, and
 * equity release scenarios for a vendor's property.
 *
 * In production this would call Domain/CoreLogic APIs. In demo mode it uses
 * deterministic seeded data derived from suburb profiles and the buyer record.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompSale {
  address: string
  suburb: string
  beds: number
  baths: number
  land: number          // sqm
  soldDate: string      // e.g. "14 Mar 2025"
  soldPrice: number
  pricePerSqm: number
  matchScore: number    // 0-100, how similar to the vendor's property
  agentSold?: boolean   // true if sold by the same agent (social proof)
}

export interface AppraisalRange {
  low: number
  mid: number
  high: number
  avgPricePerSqm: number
  daysOnMarket: number      // suburb average
  clearanceRate: number     // suburb auction clearance %
  demandScore: number       // 1-10
  methodNote: string
}

export interface EquityScenario {
  label: "Conservative" | "Mid-range" | "Optimistic"
  salePrice: number
  sellingCosts: number
  estimatedCGT: number
  netProceeds: number
  equityReleased: number    // net - purchasePrice
  color: string
}

// ---------------------------------------------------------------------------
// Suburb data — street pools + market stats
// ---------------------------------------------------------------------------

interface SuburbData {
  medianHouse: number
  annualGrowthPct: number
  daysOnMarket: number
  clearanceRate: number     // 0-100
  demandScore: number       // 1-10
  streets: string[]
}

const SUBURB_DATA: Record<string, SuburbData> = {
  "berwick": {
    medianHouse: 880000, annualGrowthPct: 6.2,
    daysOnMarket: 24, clearanceRate: 76, demandScore: 8,
    streets: [
      "Clyde Road", "Birkdale Road", "Eden Rise", "Manuka Drive",
      "O'Neil Road", "Peel Street", "Outlook Drive", "Inverness Way",
      "Soldiers Road", "Heritage Boulevard", "Lakeview Boulevard",
      "Delfin Drive", "Hartsmere Drive", "Ashmore Avenue",
      "Homestead Drive", "Ayr Hill Avenue", "Brindabella Drive",
      "Riviera Way", "Jacaranda Court", "Mayfield Drive",
    ],
  },
  "narre warren south": {
    medianHouse: 870000, annualGrowthPct: 6.0,
    daysOnMarket: 28, clearanceRate: 72, demandScore: 7,
    streets: [
      "Stoney Creek Road", "Hillcrest Avenue", "Ferndale Court",
      "Balmoral Rise", "Jasper Way", "Pinehurst Drive",
      "Clearwater Court", "Ridgewood Avenue", "Settlers Run",
    ],
  },
  "officer": {
    medianHouse: 760000, annualGrowthPct: 6.5,
    daysOnMarket: 26, clearanceRate: 74, demandScore: 7,
    streets: [
      "Tallis Drive", "Hazel Glen Road", "Farmhouse Circuit",
      "Village Way", "Eucalyptus Boulevard", "Cobblestone Rise",
      "Harvest Road", "Meadowbrook Drive",
    ],
  },
  "pakenham": {
    medianHouse: 700000, annualGrowthPct: 6.0,
    daysOnMarket: 31, clearanceRate: 70, demandScore: 7,
    streets: [
      "Station Street", "Racecourse Road", "Lakeside Boulevard",
      "Maple Drive", "Gumtree Rise", "Bald Hill Road",
      "Toomuc Valley Road", "Homestead Circuit",
    ],
  },
  "warragul": {
    medianHouse: 680000, annualGrowthPct: 5.8,
    daysOnMarket: 38, clearanceRate: 62, demandScore: 6,
    streets: [
      "Bona Vista Road", "Kelly's Road", "Sutton Street",
      "Burke Street", "Gladstone Road", "Lardner Road",
      "Princes Way", "Mason Street", "Stead Street",
    ],
  },
  "clyde north": {
    medianHouse: 800000, annualGrowthPct: 6.8,
    daysOnMarket: 22, clearanceRate: 78, demandScore: 8,
    streets: [
      "Hardys Road", "Pattersons Road", "Ballarto Road",
      "Banora Rise", "Sunbury Court", "Elliot Crescent",
      "Lakewood Boulevard", "Emerald Drive",
    ],
  },
  "cranbourne": {
    medianHouse: 740000, annualGrowthPct: 5.6,
    daysOnMarket: 33, clearanceRate: 68, demandScore: 7,
    streets: [
      "High Street", "Thompson Road", "Evans Road",
      "Botanical Drive", "Clarinda Road", "Cochrane Street",
      "Sladen Street", "Hall Road",
    ],
  },
}

const DEFAULT_SUBURB: SuburbData = {
  medianHouse: 800000, annualGrowthPct: 5.5,
  daysOnMarket: 30, clearanceRate: 70, demandScore: 6,
  streets: [
    "Maple Street", "Oak Court", "River Road", "Garden Close",
    "Hillside Drive", "Valley View", "Park Avenue", "Forest Way",
  ],
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// ---------------------------------------------------------------------------
// Seeded PRNG — same buyer → same comps every render
// ---------------------------------------------------------------------------

function makePrng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s ^= s >>> 16
    return (s >>> 0) / 0x100000000
  }
}

// ---------------------------------------------------------------------------
// Generate comparable sales
// ---------------------------------------------------------------------------

export function generateComparables(params: {
  suburb: string
  propertyType: "House" | "Unit" | "Townhouse"
  beds: number
  land: number
  buyerId: number
  agentSoldAddress?: string   // address the agent recently sold (for social proof comp)
}): CompSale[] {
  const suburbData = SUBURB_DATA[params.suburb.toLowerCase().trim()] ?? DEFAULT_SUBURB
  const rand = makePrng(params.buyerId)

  const comps: CompSale[] = []
  const usedStreets = new Set<string>()

  for (let i = 0; i < 3; i++) {
    // Pick a unique street
    let street: string
    do {
      const idx = Math.floor(rand() * suburbData.streets.length)
      street = suburbData.streets[idx]
    } while (usedStreets.has(street))
    usedStreets.add(street)

    const streetNum = Math.floor(rand() * 80) + 4

    // ±1 bed from vendor, occasionally exact match
    const bedVariance = i === 0 ? 0 : (rand() > 0.6 ? 1 : rand() > 0.5 ? -1 : 0)
    const beds = Math.max(2, Math.min(5, params.beds + bedVariance))
    const baths = beds >= 4 ? 2 : (rand() > 0.3 ? 2 : 1)

    // Land size: ±15% of vendor's land, never below 400sqm for houses
    const landVariance = 0.85 + rand() * 0.30
    const land = params.propertyType === "House"
      ? Math.max(400, Math.round((params.land * landVariance) / 25) * 25)
      : 0

    // Sold within last 90 days (not the future)
    const now = new Date("2026-05-27")
    const daysAgo = Math.floor(rand() * 85) + 5
    const soldDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    const soldDateStr = `${soldDate.getDate()} ${MONTHS[soldDate.getMonth()]} ${soldDate.getFullYear()}`

    // Price: median ± 10%, adjusted for beds and land
    const bedAdj = beds === 4 ? 1.08 : beds === 3 ? 1.0 : beds >= 5 ? 1.16 : 0.92
    const landAdj = params.propertyType === "House" ? 0.85 + (land / 1200) * 0.30 : 1.0
    const priceVariance = 0.92 + rand() * 0.16
    const soldPrice = Math.round(suburbData.medianHouse * bedAdj * landAdj * priceVariance / 5000) * 5000

    const pricePerSqm = land > 0 ? Math.round(soldPrice / land) : 0

    // Match score: higher when beds/land closer to vendor's
    const bedDiff = Math.abs(beds - params.beds)
    const landDiff = land > 0 && params.land > 0 ? Math.abs(land - params.land) / params.land : 0
    const matchScore = Math.max(40, Math.min(98, Math.round(95 - bedDiff * 15 - landDiff * 30 + rand() * 8 - 4)))

    comps.push({
      address: `${streetNum} ${street}`,
      suburb: params.suburb,
      beds,
      baths,
      land,
      soldDate: soldDateStr,
      soldPrice,
      pricePerSqm,
      matchScore,
      agentSold: false,
    })
  }

  // Sort by match score descending
  comps.sort((a, b) => b.matchScore - a.matchScore)
  return comps
}

// ---------------------------------------------------------------------------
// Build appraisal range from comps
// ---------------------------------------------------------------------------

export function buildAppraisalRange(
  comps: CompSale[],
  suburb: string,
): AppraisalRange {
  const suburbData = SUBURB_DATA[suburb.toLowerCase().trim()] ?? DEFAULT_SUBURB

  const prices = comps.map(c => c.soldPrice)
  const mid = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 5000) * 5000
  const low  = Math.round(mid * 0.92 / 5000) * 5000
  const high = Math.round(mid * 1.10 / 5000) * 5000

  const psms = comps.filter(c => c.pricePerSqm > 0).map(c => c.pricePerSqm)
  const avgPsm = psms.length > 0 ? Math.round(psms.reduce((a, b) => a + b, 0) / psms.length) : 0

  const methodNote = `Based on ${comps.length} comparable ${comps[0]?.beds ?? 4}-bedroom sales in ${suburb} within 90 days`

  return {
    low,
    mid,
    high,
    avgPricePerSqm: avgPsm,
    daysOnMarket: suburbData.daysOnMarket,
    clearanceRate: suburbData.clearanceRate,
    demandScore: suburbData.demandScore,
    methodNote,
  }
}

// ---------------------------------------------------------------------------
// Build equity release scenarios
// ---------------------------------------------------------------------------

const AGENT_FEE_PCT = 0.02
const MARKETING = 6000
const CONVEYANCING = 1500
const CGT_DISCOUNT_THRESHOLD_YEARS = 1
const DEFAULT_TAX_RATE = 0.325
const CGT_DISCOUNT_DEADLINE = new Date("2027-07-01")

export function buildEquityScenarios(params: {
  purchasePrice: number
  purchaseDate: string
  deposit: number | null
  range: AppraisalRange
}): EquityScenario[] {
  const buyDate = new Date(params.purchaseDate)
  const now = new Date("2026-05-27")
  const yearsHeld = (now.getTime() - buyDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

  const cgtDiscount = yearsHeld >= CGT_DISCOUNT_THRESHOLD_YEARS
  const cgtDeadlinePassed = now >= CGT_DISCOUNT_DEADLINE

  function calcScenario(
    salePrice: number,
    label: "Conservative" | "Mid-range" | "Optimistic",
    color: string,
  ): EquityScenario {
    const agentFee = Math.round(salePrice * AGENT_FEE_PCT)
    const sellingCosts = agentFee + MARKETING + CONVEYANCING
    const capitalGain = Math.max(0, salePrice - params.purchasePrice)
    const taxableGain = cgtDiscount && !cgtDeadlinePassed ? capitalGain * 0.5 : capitalGain
    const estimatedCGT = Math.round(taxableGain * DEFAULT_TAX_RATE)
    const netProceeds = Math.round(salePrice - sellingCosts - estimatedCGT)
    const equityReleased = netProceeds - params.purchasePrice

    return { label, salePrice, sellingCosts, estimatedCGT, netProceeds, equityReleased, color }
  }

  return [
    calcScenario(params.range.low,  "Conservative", "#64b5f6"),
    calcScenario(params.range.mid,  "Mid-range",    "#66bb6a"),
    calcScenario(params.range.high, "Optimistic",   "#ffa726"),
  ]
}

// ---------------------------------------------------------------------------
// Formatting helpers (local — don't depend on vendorFinancials)
// ---------------------------------------------------------------------------

export function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}
