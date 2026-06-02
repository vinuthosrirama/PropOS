/**
 * Domain Group AVM (Automated Valuation Model)
 *
 * Uses the free Domain Developer API to get property price estimates.
 * Requires DOMAIN_API_KEY env var — get a free key at developer.domain.com.au
 *
 * Falls back to null (caller uses hardcoded suburb model) if API is unavailable.
 */

const DOMAIN_API_BASE = "https://api.domain.com.au/v1"

export interface AvmEstimate {
  low:        number
  mid:        number
  high:       number
  confidence: "high" | "medium" | "low" | "unknown"
  source:     "domain" | "fallback"
}

function domainConfigured(): boolean {
  return !!process.env.DOMAIN_API_KEY
}

async function domainFetch<T>(path: string): Promise<T | null> {
  const key = process.env.DOMAIN_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${DOMAIN_API_BASE}${path}`, {
      headers: { "X-Api-Key": key, "Accept": "application/json" },
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

interface SuggestResult {
  id?:           string
  displayName?:  string
  propertyType?: string
}

interface PriceEstimate {
  estimate?:       number
  confidenceLow?:  number
  confidenceHigh?: number
  confidence?:     string
}

/**
 * Look up a property address and return a price estimate from Domain.
 * Returns null if the API is not configured or the address isn't found.
 */
export async function getDomainEstimate(address: string): Promise<AvmEstimate | null> {
  if (!domainConfigured()) return null

  // Step 1: autocomplete → get property ID
  const suggestions = await domainFetch<SuggestResult[]>(
    `/properties/_suggest?terms=${encodeURIComponent(address)}&channel=residential`,
  )
  if (!suggestions?.length || !suggestions[0].id) return null

  const propertyId = suggestions[0].id

  // Step 2: price estimate
  const estimate = await domainFetch<PriceEstimate>(
    `/properties/${encodeURIComponent(propertyId)}/priceEstimate`,
  )
  if (!estimate?.estimate) return null

  const mid  = Math.round(estimate.estimate / 1000) * 1000
  const low  = estimate.confidenceLow
    ? Math.round(estimate.confidenceLow / 1000) * 1000
    : Math.round(mid * 0.92 / 1000) * 1000
  const high = estimate.confidenceHigh
    ? Math.round(estimate.confidenceHigh / 1000) * 1000
    : Math.round(mid * 1.08 / 1000) * 1000

  const confidence = (estimate.confidence?.toLowerCase() ?? "unknown") as AvmEstimate["confidence"]

  return { low, mid, high, confidence, source: "domain" }
}
