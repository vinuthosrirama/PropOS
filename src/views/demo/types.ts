import type { SheetLead } from "../../lib/sheet"
import type { MatchResult } from "../../lib/slmMatch"
import type { PortfolioProperty } from "../../data"
import type { PropertySLM } from "../../data/propertySlm"
import type { SegmentedBuyer } from "../../lib/vendorPipeline"
import type { QueueItem } from "../../components/OutreachQueue"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredLead extends SheetLead {
  matchResult: MatchResult
  fromPropertyId: number
  bedsWanted: number  // inferred from persona/notes
}

export type Stage =
  | { kind: "portfolio" }
  | { kind: "soldLeads"; soldProperty: PortfolioProperty; leads: SheetLead[] }
  | { kind: "matching"; property: PortfolioProperty; soldLeads: Record<number, SheetLead[]> }
  | { kind: "leads"; property: PortfolioProperty; allLeads: ScoredLead[]; soldLeads?: Record<number, SheetLead[]> }
  | { kind: "profile"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; allLeads: ScoredLead[] }
  | { kind: "generating"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; transcript: string; allLeads: ScoredLead[] }
  | { kind: "review"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; transcript: string; sms: string; emailSubject: string; emailBody: string[]; allLeads: ScoredLead[]; versionId?: number }
  | { kind: "missedOut"; auctionProperty: PortfolioProperty; leads: SheetLead[] }
  | { kind: "matchQueue" }
  // ── Vendor prospecting stages ──────────────────────────────────────────
  | { kind: "vendorPortfolio" }
  | { kind: "vendorAnalysing"; segmented: SegmentedBuyer[] }
  | { kind: "vendorDashboard"; segmented: SegmentedBuyer[] }
  | { kind: "vendorProfile"; entry: SegmentedBuyer; allEntries?: SegmentedBuyer[]; entryIdx?: number; from?: "vendorPortfolio" | "vendorDashboard" }
  | { kind: "vendorReview"; entry: SegmentedBuyer; sms: string; emailSubject: string; emailBody: string[]; allEntries?: SegmentedBuyer[]; entryIdx?: number }
  | { kind: "outreachQueue"; items: QueueItem[]; segmented: SegmentedBuyer[] }

// ── Vendor Analytics / ROI Dashboard ─────────────────────────────────────────

export interface VendorAnalyticsData {
  funnel: {
    outreachSent:     number
    emailOpened:      number
    replied:          number
    appraisalsBooked: number
    listingsWon:      number
    estimatedGCI:     number
  }
  nurture: { pending: number; sent: number }
  roi: {
    monthlySubscription: number
    listingsAttributed:  number
    revenueGenerated:    number
    roiMultiple:         number
  }
}

// ── Add Contact Form ─────────────────────────────────────────────────────────

export interface AddContactForm {
  name: string; phone: string; email: string; purchaseAddress: string
  suburb: string; purchaseDate: string; purchasePrice: string
  deposit: string; propertyType: string; beds: string; baths: string
  land: string; status: string; notes: string
}

export const EMPTY_FORM: AddContactForm = {
  name: "", phone: "", email: "", purchaseAddress: "",
  suburb: "", purchaseDate: "", purchasePrice: "",
  deposit: "", propertyType: "House", beds: "4", baths: "2",
  land: "", status: "owner-occupier", notes: "",
}
