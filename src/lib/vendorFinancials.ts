// PropOS Vendor Financial Calculator
//
// Computes equity gain, CGT estimate, cash-on-cash return, and net proceeds
// for past buyers — giving the agent hard numbers to pitch a listing.

export interface FinancialSnapshot {
  purchasePrice: number
  currentEstimate: number
  yearsHeld: number

  // Equity
  equityGain: number           // currentEstimate - purchasePrice
  equityGainPct: number        // (gain / purchasePrice) * 100
  annualAppreciation: number   // annualised % growth

  // Returns (if deposit known)
  depositOriginal: number | null
  cashOnCashReturn: number | null  // (equityGain / deposit) * 100

  // CGT
  capitalGain: number
  cgtDiscount: boolean         // true if held > 12 months
  taxableGain: number          // capitalGain * 0.5 if discount applies
  estimatedCGT: number         // taxableGain * marginal rate
  cgtSavingsBy2027: number     // savings from current 50% discount vs full rate

  // Net proceeds
  sellingCosts: number         // agent fee + marketing + conveyancing
  netProceeds: number          // currentEstimate - sellingCosts - CGT
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MARGINAL_TAX_RATE = 0.325   // 32.5% bracket ($45K-$120K)
const AGENT_FEE_PCT = 0.02                 // 2% commission
const MARKETING_COST = 6000                // typical Vic campaign
const CONVEYANCING_COST = 1500
const CGT_DISCOUNT_DEADLINE = new Date("2027-07-01")

// ---------------------------------------------------------------------------
// Core calculator
// ---------------------------------------------------------------------------

export function calculateFinancials(
  purchasePrice: number,
  purchaseDate: string | Date,
  currentEstimate: number,
  deposit?: number | null,
  marginalTaxRate = DEFAULT_MARGINAL_TAX_RATE,
): FinancialSnapshot {
  const buyDate = typeof purchaseDate === "string" ? new Date(purchaseDate) : purchaseDate
  const now = new Date()
  const msHeld = now.getTime() - buyDate.getTime()
  const yearsHeld = Math.max(msHeld / (365.25 * 24 * 60 * 60 * 1000), 0.1)

  // Equity
  const equityGain = currentEstimate - purchasePrice
  const equityGainPct = (equityGain / purchasePrice) * 100
  const annualAppreciation = (Math.pow(currentEstimate / purchasePrice, 1 / yearsHeld) - 1) * 100

  // Cash-on-cash
  const depositOriginal = deposit ?? null
  const cashOnCashReturn = depositOriginal && depositOriginal > 0
    ? (equityGain / depositOriginal) * 100
    : null

  // CGT
  const capitalGain = Math.max(0, equityGain)
  const cgtDiscount = yearsHeld >= 1
  const taxableGain = cgtDiscount ? capitalGain * 0.5 : capitalGain
  const estimatedCGT = Math.round(taxableGain * marginalTaxRate)

  // CGT savings — difference between discounted and undiscounted CGT
  const fullCGT = Math.round(capitalGain * marginalTaxRate)
  const cgtSavingsBy2027 = now < CGT_DISCOUNT_DEADLINE
    ? Math.round(fullCGT - estimatedCGT)
    : 0

  // Net proceeds
  const agentFee = Math.round(currentEstimate * AGENT_FEE_PCT)
  const sellingCosts = agentFee + MARKETING_COST + CONVEYANCING_COST
  const netProceeds = Math.round(currentEstimate - sellingCosts - estimatedCGT)

  return {
    purchasePrice,
    currentEstimate,
    yearsHeld: Math.round(yearsHeld * 10) / 10,
    equityGain,
    equityGainPct: Math.round(equityGainPct * 10) / 10,
    annualAppreciation: Math.round(annualAppreciation * 10) / 10,
    depositOriginal,
    cashOnCashReturn: cashOnCashReturn !== null ? Math.round(cashOnCashReturn) : null,
    capitalGain,
    cgtDiscount,
    taxableGain,
    estimatedCGT,
    cgtSavingsBy2027,
    sellingCosts,
    netProceeds,
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function fmtDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}
