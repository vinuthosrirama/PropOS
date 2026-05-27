/**
 * Layer 3: Suburb Market Context
 *
 * Generates a concise market context block for a given suburb that can be
 * injected into the vendor outreach prompt. Makes the message reference
 * specific local facts rather than generic growth claims.
 *
 * Data source: hardcoded suburb profiles (from comparableSales.ts patterns).
 * Future: replace with Domain API / CoreLogic AVM for live data.
 */

// ---------------------------------------------------------------------------
// Suburb data (mirrors src/lib/comparableSales.ts — server-side copy)
// ---------------------------------------------------------------------------

interface SuburbStats {
  annualGrowthPct: number
  medianHouse: number
  medianUnit: number
  demandScore: number          // 1-10
  avgDaysOnMarket: number      // typical days to sell
  clearanceRate: number        // auction clearance % (0-100)
  recentSalesCount: number     // approx sales last 90 days
  popularSchool?: string       // primary school buyers reference
  nearbyTrain?: string         // nearest train station
  lifestyle?: string           // 1-liner lifestyle descriptor
}

const SUBURB_STATS: Record<string, SuburbStats> = {
  "berwick": {
    annualGrowthPct: 6.2, medianHouse: 880000, medianUnit: 510000, demandScore: 8,
    avgDaysOnMarket: 28, clearanceRate: 72, recentSalesCount: 38,
    popularSchool: "Berwick Primary", nearbyTrain: "Berwick Station",
    lifestyle: "family-friendly with parks, cafes and Berwick Village",
  },
  "narre warren south": {
    annualGrowthPct: 6.0, medianHouse: 870000, medianUnit: 490000, demandScore: 7,
    avgDaysOnMarket: 31, clearanceRate: 68, recentSalesCount: 29,
    popularSchool: "Narre Warren South P-12", nearbyTrain: "Narre Warren Station",
    lifestyle: "quiet streets and large family blocks",
  },
  "narre warren": {
    annualGrowthPct: 5.8, medianHouse: 790000, medianUnit: 460000, demandScore: 7,
    avgDaysOnMarket: 33, clearanceRate: 65, recentSalesCount: 24,
    popularSchool: "Narre Warren Primary", nearbyTrain: "Narre Warren Station",
    lifestyle: "growing community close to Fountain Gate",
  },
  "officer": {
    annualGrowthPct: 6.5, medianHouse: 760000, medianUnit: 460000, demandScore: 7,
    avgDaysOnMarket: 35, clearanceRate: 64, recentSalesCount: 22,
    popularSchool: "Officer Primary", nearbyTrain: "Officer Station",
    lifestyle: "new estates with good amenities and room to grow",
  },
  "pakenham": {
    annualGrowthPct: 6.0, medianHouse: 700000, medianUnit: 430000, demandScore: 7,
    avgDaysOnMarket: 36, clearanceRate: 62, recentSalesCount: 31,
    popularSchool: "Pakenham Primary", nearbyTrain: "Pakenham Station",
    lifestyle: "popular family suburb on the growth corridor",
  },
  "clyde north": {
    annualGrowthPct: 6.8, medianHouse: 800000, medianUnit: 480000, demandScore: 8,
    avgDaysOnMarket: 30, clearanceRate: 70, recentSalesCount: 26,
    popularSchool: "Clyde North Primary", nearbyTrain: "Clyde Station",
    lifestyle: "one of Melbourne's fastest-growing communities",
  },
  "hampton park": {
    annualGrowthPct: 5.5, medianHouse: 680000, medianUnit: 430000, demandScore: 6,
    avgDaysOnMarket: 38, clearanceRate: 60, recentSalesCount: 18,
    nearbyTrain: "Hallam Station",
    lifestyle: "affordable family suburb with strong community feel",
  },
  "hallam": {
    annualGrowthPct: 5.7, medianHouse: 720000, medianUnit: 440000, demandScore: 7,
    avgDaysOnMarket: 34, clearanceRate: 63, recentSalesCount: 20,
    nearbyTrain: "Hallam Station",
    lifestyle: "convenient access to Princes Hwy and Dandenong",
  },
  "cranbourne": {
    annualGrowthPct: 5.6, medianHouse: 740000, medianUnit: 450000, demandScore: 7,
    avgDaysOnMarket: 37, clearanceRate: 61, recentSalesCount: 27,
    nearbyTrain: "Cranbourne Station",
    lifestyle: "established suburb with strong buyer demand",
  },
  "dandenong": {
    annualGrowthPct: 5.2, medianHouse: 700000, medianUnit: 440000, demandScore: 6,
    avgDaysOnMarket: 40, clearanceRate: 58, recentSalesCount: 22,
    nearbyTrain: "Dandenong Station",
    lifestyle: "vibrant multicultural hub with great transport links",
  },
  "fitzroy": {
    annualGrowthPct: 4.5, medianHouse: 1500000, medianUnit: 700000, demandScore: 9,
    avgDaysOnMarket: 22, clearanceRate: 82, recentSalesCount: 15,
    nearbyTrain: "Clifton Hill Station",
    lifestyle: "inner-city lifestyle with cafes, bars and cultural venues",
  },
  "south yarra": {
    annualGrowthPct: 4.2, medianHouse: 2200000, medianUnit: 750000, demandScore: 9,
    avgDaysOnMarket: 25, clearanceRate: 80, recentSalesCount: 12,
    nearbyTrain: "South Yarra Station",
    lifestyle: "premium lifestyle suburb close to the CBD",
  },
  "glen waverley": {
    annualGrowthPct: 5.5, medianHouse: 1350000, medianUnit: 600000, demandScore: 8,
    avgDaysOnMarket: 27, clearanceRate: 76, recentSalesCount: 34,
    popularSchool: "Glen Waverley Primary", nearbyTrain: "Glen Waverley Station",
    lifestyle: "top-rated schools and family-friendly amenities",
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SuburbContextBlock {
  suburb: string
  stats: SuburbStats
  /** Ready-to-inject text for the outreach prompt */
  promptBlock: string
  /** Short social proof sentence for SMS (≤ 30 words) */
  smsHook: string
}

export function getSuburbContext(suburb: string): SuburbContextBlock | null {
  const key = suburb.toLowerCase().trim()
  const stats = SUBURB_STATS[key]
  if (!stats) return null

  const medianStr = formatK(stats.medianHouse)
  const trendWord = stats.annualGrowthPct >= 6.5 ? "strongly" : stats.annualGrowthPct >= 5.5 ? "steadily" : "consistently"

  // Build a 3-4 sentence prompt block
  const sentences: string[] = [
    `${titleCase(suburb)} median house price is ${medianStr}, up ${stats.annualGrowthPct}% annually.`,
    `Properties are selling in an average of ${stats.avgDaysOnMarket} days with a ${stats.clearanceRate}% auction clearance rate — demand is ${stats.demandScore >= 8 ? "very strong" : stats.demandScore >= 6 ? "solid" : "steady"}.`,
  ]
  if (stats.recentSalesCount > 0) {
    sentences.push(`There have been approximately ${stats.recentSalesCount} sales in the suburb over the last 90 days — the market is ${trendWord} active.`)
  }
  if (stats.lifestyle) {
    sentences.push(`Buyers are drawn to ${titleCase(suburb)} for its ${stats.lifestyle}.`)
  }

  const promptBlock = [
    "=== SUBURB MARKET CONTEXT ===",
    `Suburb: ${titleCase(suburb)}`,
    ...sentences,
    stats.popularSchool ? `School zone note: ${stats.popularSchool} is a key buyer draw.` : "",
  ].filter(Boolean).join("\n")

  // Short SMS hook (pick the most compelling single fact)
  const smsHook = stats.avgDaysOnMarket <= 30
    ? `Homes in ${titleCase(suburb)} are selling in ${stats.avgDaysOnMarket} days right now.`
    : `${titleCase(suburb)} prices are up ${stats.annualGrowthPct}% per year — market is strong.`

  return { suburb: titleCase(suburb), stats, promptBlock, smsHook }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`
  return `$${n}`
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
