// Flywheel matching — connects BuyerOS and VendorOS using the same lead.
//
// Two directions:
//  1. recommendListingForBuyer — a "buyer→seller" (a past vendor we just
//     re-engaged) gets matched against the agent's active listings, so we can
//     pitch them a new property to move into.
//  2. findBuyerDemand — when pitching a current vendor a Price Update, we look
//     for an active buyer in the portfolio searching in the same suburb for
//     the same property type, and surface that as buyer-demand evidence.

import type { PastBuyer } from "../data/pastBuyers"
import type { PortfolioProperty } from "../data"

export interface ListingRecommendation {
  listing: PortfolioProperty
  reason: string
}

export function recommendListingForBuyer(
  buyer: PastBuyer,
  activeListings: PortfolioProperty[]
): ListingRecommendation | null {
  if (activeListings.length === 0) return null

  const sameSuburb = activeListings.filter(l => l.suburb.toLowerCase() === buyer.suburb.toLowerCase())
  const pool = sameSuburb.length > 0
    ? sameSuburb
    : activeListings.filter(l => l.type === buyer.propertyType)

  if (pool.length === 0) return null

  // Pick the listing whose guide price is closest to what they paid last time
  // (a reasonable proxy for what they can afford to move into).
  const best = pool.reduce((a, b) => {
    const aPrice = a.priceMin ?? a.price
    const bPrice = b.priceMin ?? b.price
    return Math.abs(aPrice - buyer.purchasePrice) < Math.abs(bPrice - buyer.purchasePrice) ? a : b
  })

  const sameSuburbMatch = best.suburb.toLowerCase() === buyer.suburb.toLowerCase()
  const sameTypeMatch = best.type === buyer.propertyType
  const reason = sameSuburbMatch && sameTypeMatch
    ? `Same suburb, ${best.type.toLowerCase()} like the one they bought`
    : sameSuburbMatch
      ? `New listing in ${best.suburb}, where they already own`
      : `Closest match to their last purchase price`

  return { listing: best, reason }
}

export interface BuyerDemandMatch {
  name: string
  detail: string
}

// For a vendor's Price Update pitch, find a buyer in the portfolio actively
// looking in the same suburb/type — used as "we already have a buyer for this".
export function findBuyerDemand(
  buyers: PastBuyer[],
  vendor: { suburb: string; propertyType: string; name: string }
): BuyerDemandMatch | null {
  const candidate = buyers.find(b =>
    b.name !== vendor.name &&
    b.status !== "buyer→seller" &&
    b.suburb.toLowerCase() === vendor.suburb.toLowerCase() &&
    b.propertyType === vendor.propertyType
  )
  if (!candidate) return null

  const fname = candidate.name.split("&")[0].split(" ")[0].trim()
  return {
    name: candidate.name,
    detail: `${fname} is actively looking for a ${candidate.beds}-bedroom ${candidate.propertyType.toLowerCase()} in ${vendor.suburb}, exactly like yours.`,
  }
}
