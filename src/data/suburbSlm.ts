/**
 * Suburb SLM Index — aggregate benchmarks per suburb.
 * Built from all PropertySLM records in the active dataset.
 * Used in slmMatch.ts to contextualise individual field values
 * (e.g., "land 680sqm is 11% above Berwick median of 612sqm").
 */

import type { PropertySLM } from "./propertySlm"

export interface SuburbSLMIndex {
  suburb: string
  sampleSize: number
  medianLandSqm: number
  medianHouseSqm: number
  medianBeds: number
  medianBaths: number
  medianGrossYield: number
  medianDistanceToTrainKm: number
  medianDistanceToShoppingKm: number
  medianSuburb5yrGrowth: number
  medianPriceMid: number
  topQuestionsAsked: string[]       // most common question keywords across suburb
}

function numericValues(slms: PropertySLM[], field: keyof PropertySLM): number[] {
  return slms
    .map(s => s[field])
    .filter((v): v is number => typeof v === "number" && v > 0)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Build a suburb index from an array of PropertySLM records */
export function buildSuburbIndex(slms: PropertySLM[]): SuburbSLMIndex {
  const suburb = slms[0]?.suburb ?? "Unknown"
  const priceMids = slms.map(s => {
    const lo = typeof s.priceMin === "number" ? s.priceMin : 0
    const hi = typeof s.priceMax === "number" ? s.priceMax : 0
    return lo > 0 && hi > 0 ? (lo + hi) / 2 : lo || hi
  }).filter(v => v > 0)

  // Aggregate all QA questions to find most-asked topics
  const questionWords: Record<string, number> = {}
  for (const slm of slms) {
    for (const qa of slm.qa ?? []) {
      for (const word of qa.keywords) {
        questionWords[word] = (questionWords[word] ?? 0) + 1
      }
    }
  }
  const topQuestionsAsked = Object.entries(questionWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word)

  return {
    suburb,
    sampleSize: slms.length,
    medianLandSqm:             median(numericValues(slms, "landSqm")),
    medianHouseSqm:            median(numericValues(slms, "houseSqm")),
    medianBeds:                median(numericValues(slms, "beds")),
    medianBaths:               median(numericValues(slms, "baths")),
    medianGrossYield:          median(numericValues(slms, "grossYieldAtAsk")),
    medianDistanceToTrainKm:   median(numericValues(slms, "distanceToTrainKm")),
    medianDistanceToShoppingKm:median(numericValues(slms, "distanceToShoppingKm")),
    medianSuburb5yrGrowth:     median(numericValues(slms, "suburb5yrGrowthPct")),
    medianPriceMid:            median(priceMids),
    topQuestionsAsked,
  }
}

/** Build indices keyed by suburb name from all SLM records */
export function buildAllSuburbIndices(slms: PropertySLM[]): Record<string, SuburbSLMIndex> {
  const bySuburb: Record<string, PropertySLM[]> = {}
  for (const slm of slms) {
    const s = slm.suburb ?? "Unknown"
    if (!bySuburb[s]) bySuburb[s] = []
    bySuburb[s].push(slm)
  }
  const result: Record<string, SuburbSLMIndex> = {}
  for (const [suburb, records] of Object.entries(bySuburb)) {
    result[suburb] = buildSuburbIndex(records)
  }
  return result
}

/** Return a human-readable benchmark string for a numeric field value */
export function benchmarkLabel(
  value: number,
  median: number,
  unit: string,
  higherIsBetter = true
): string {
  if (median === 0 || value === 0) return ""
  const diffPct = Math.round(((value - median) / median) * 100)
  if (Math.abs(diffPct) < 3) return `At suburb median (${median.toLocaleString()}${unit})`
  const sign = diffPct > 0 ? "+" : ""
  const better = diffPct > 0 === higherIsBetter
  return `${sign}${diffPct}% vs suburb median (${better ? "above" : "below"} avg ${median.toLocaleString()}${unit})`
}
