/**
 * Rate Sensitivity Classifier
 *
 * Classifies how exposed a vendor is to interest rate movements.
 * High sensitivity = strong "sell now before rates hurt buyer pool" pitch.
 */

import type { PastBuyer } from "../data/pastBuyers"
import type { FinancialSnapshot } from "./vendorFinancials"

export type RateSensitivity = "high" | "medium" | "low"

export interface RateSensitivityResult {
  sensitivity:  RateSensitivity
  lvrEstimate:  number    // estimated remaining LVR as % of current value
  reason:       string    // short label for UI chip
  pitchAngle:   string    // full sentence for outreach / pitch panel
}

export function classifyRateSensitivity(
  buyer:      PastBuyer,
  financials: FinancialSnapshot,
): RateSensitivityResult {
  const originalDeposit = buyer.deposit ?? financials.purchasePrice * 0.1
  // Remaining loan ≈ purchase price minus original deposit (rough; ignores repayments)
  // Adjusted for time: assume 3% annual principal repayment
  const yearsHeld = financials.yearsHeld
  const principalRepaid = financials.purchasePrice * 0.03 * yearsHeld
  const remainingLoan = Math.max(0, financials.purchasePrice - originalDeposit - principalRepaid)
  const lvrEstimate = Math.min(90, Math.max(5, Math.round((remainingLoan / financials.currentEstimate) * 100)))

  const fname = buyer.name.split("&")[0].split(" ")[0].trim()

  if (buyer.status === "investor" && lvrEstimate > 40) {
    return {
      sensitivity: "high",
      lvrEstimate,
      reason: "High rate exposure",
      pitchAngle: `Servicing costs on ${fname}'s investment have risen roughly 40% since 2022. Selling now and banking the equity is a clean exit from ongoing rate risk.`,
    }
  }

  if (buyer.status === "owner-occupier" && lvrEstimate > 50 && yearsHeld < 5) {
    return {
      sensitivity: "high",
      lvrEstimate,
      reason: "Rate pressure on equity",
      pitchAngle: `${fname}'s equity has grown even under rate pressure. A sale now locks in the gain before any further softening in buyer borrowing capacity.`,
    }
  }

  if (lvrEstimate > 20 && lvrEstimate <= 50) {
    return {
      sensitivity: "medium",
      lvrEstimate,
      reason: "Moderate rate exposure",
      pitchAngle: `The rate environment has changed what buyers can borrow. Listing before the next RBA decision keeps ${fname} ahead of any further buyer capacity compression.`,
    }
  }

  // Low: long-held, largely paid down
  return {
    sensitivity: "low",
    lvrEstimate,
    reason: "Low rate exposure",
    pitchAngle: `${fname}'s low remaining debt means rate moves don't hurt their position — but the buyer pool's borrowing capacity is still worth timing around. Spring clearance rates in ${buyer.suburb} peak at 78%+.`,
  }
}
