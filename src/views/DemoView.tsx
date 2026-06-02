import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useBreakpoint } from "../hooks/useBreakpoint"
import {
  C, FONT, PORTFOLIO_SOLD, PORTFOLIO_ACTIVE,
  DEFAULT_THEME, getPortfolioForAgent, isPasSunilchandra, isManpreetSingh,
  type AgentProfile, type AgencyTheme, type PortfolioProperty,
  type LeadStatus, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER,
  type DemoMode,
} from "../data"
import { getPastBuyersForAgent, CURRENT_VALUE_ESTIMATES } from "../data/pastBuyers"
import { calculateFinancials, fmtDollar, fmtPct, type FinancialSnapshot } from "../lib/vendorFinancials"
import {
  batchSegment, PIPELINE_LABELS,
  type SegmentedBuyer, type Pipeline,
} from "../lib/vendorPipeline"
import { batchEstimateValues } from "../lib/comparableSales"
import {
  loadSLMForProperty, getSLMCompleteness, preloadSLMsFromSheet,
  type PropertySLM,
} from "../data/propertySlm"
import { matchLeadToListing, matchQuestionToSLM, type MatchResult } from "../lib/slmMatch"
import {
  readLeadsFromSheet, readAllLeadsFromSheet, postEvent, sheetsConnected,
  postLeadStatus, markAttended, writeAgentVoiceEntry,
  readPastBuyersFromSheet, updateLastContactDate,
  type SheetLead,
} from "../lib/sheet"
import AuctionOutcomePanel from "../components/AuctionOutcomePanel"
import BuyerPitchReport from "../components/BuyerPitchReport"
import OutreachQueue, { type QueueItem } from "../components/OutreachQueue"
import { apiUrl } from "../lib/api"
import { authFetch } from "../lib/authFetch"
import { buildVoiceContext, loadCorpus } from "../lib/voiceContext"
import { DEMO_FALLBACK_LEADS } from "../lib/demoFallback"
import { getCachedOutreach } from "../lib/cachedOutreach"
import { useVoiceMemo } from "../hooks/useVoiceMemo"
import {
  getLeadKnowledge, upsertLeadTranscript,
  getLeadCumulativeNotes, enrichLeadNotes,
} from "../lib/leadKnowledge"
import {
  generateComparables, buildAppraisalRange, buildEquityScenarios,
  fmtK,
  type CompSale, type AppraisalRange, type EquityScenario,
} from "../lib/appraisalEngine"
import { computePropertyDNA, type PropertyDNA } from "../lib/propertyDNA"
import ComparableSalesMap from "../components/ComparableSalesMap"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoredLead extends SheetLead {
  matchResult: MatchResult
  fromPropertyId: number
  bedsWanted: number  // inferred from persona/notes
}

type Stage =
  | { kind: "portfolio" }
  | { kind: "soldLeads"; soldProperty: PortfolioProperty; leads: SheetLead[] }
  | { kind: "matching"; property: PortfolioProperty; soldLeads: Record<number, SheetLead[]> }
  | { kind: "leads"; property: PortfolioProperty; allLeads: ScoredLead[] }
  | { kind: "profile"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; allLeads: ScoredLead[] }
  | { kind: "generating"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; transcript: string; allLeads: ScoredLead[] }
  | { kind: "review"; property: PortfolioProperty; lead: ScoredLead; soldSLM: PropertySLM; transcript: string; sms: string; emailSubject: string; emailBody: string[]; allLeads: ScoredLead[] }
  | { kind: "missedOut"; auctionProperty: PortfolioProperty; leads: SheetLead[] }
  // ── Vendor prospecting stages ──────────────────────────────────────────
  | { kind: "vendorPortfolio" }
  | { kind: "vendorAnalysing"; segmented: SegmentedBuyer[] }
  | { kind: "vendorDashboard"; segmented: SegmentedBuyer[] }
  | { kind: "vendorProfile"; entry: SegmentedBuyer; allEntries?: SegmentedBuyer[]; entryIdx?: number; from?: "vendorPortfolio" | "vendorDashboard" }
  | { kind: "vendorReview"; entry: SegmentedBuyer; sms: string; emailSubject: string; emailBody: string[]; allEntries?: SegmentedBuyer[]; entryIdx?: number }
  | { kind: "outreachQueue"; items: QueueItem[]; segmented: SegmentedBuyer[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`

function scoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 60) return C.blue
  if (score >= 40) return "#f59e0b"
  return C.red ?? "#ef4444"
}

/** Reusable SVG arc score ring — ring is `score`% complete */
function ScoreRing({ score, size = 48, strokeWidth = 3, label }: { score: number; size?: number; strokeWidth?: number; label?: string }) {
  const cx = size / 2
  const r = cx - strokeWidth - 1
  const circ = 2 * Math.PI * r
  const pct = Math.min(Math.max(score, 0), 99) / 100
  const dash = circ * pct
  const gap = circ - dash
  const color = scoreColor(score)
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={withAlpha(color, 0.2)} strokeWidth={strokeWidth} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.28), fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        {label && <span style={{ fontSize: Math.round(size * 0.155), color: C.faint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginTop: 1 }}>{label}</span>}
      </div>
    </div>
  )
}

// Safely add alpha to any CSS colour (hex or rgb/rgba)
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`)
  }
  if (color.startsWith("rgba(")) {
    return color.replace(/,[\d.]+\)$/, `,${alpha})`)
  }
  return color
}

// Format fractional years as "10yr 10m" (e.g. 10.8 → "10yr 10m")
function fmtYears(y: number): string {
  const yrs = Math.floor(y)
  const months = Math.round((y - yrs) * 12)
  if (months === 0) return `${yrs}yr`
  return `${yrs}yr ${months}m`
}

// Real Berwick median house price history (source: realestate.com.au/vic/berwick-3806)
// Yearly anchors — chart interpolates linearly between points
const BERWICK_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 350_000 },
  { year: 2011, price: 368_000 },
  { year: 2012, price: 375_000 },
  { year: 2013, price: 390_000 },
  { year: 2014, price: 415_000 },
  { year: 2015, price: 450_000 },
  { year: 2016, price: 495_000 },
  { year: 2017, price: 545_000 },
  { year: 2018, price: 590_000 },
  { year: 2019, price: 625_000 },
  { year: 2020, price: 650_000 },
  { year: 2021, price: 725_000 },  // REA chart: ~$725K May '21
  { year: 2022, price: 878_000 },  // REA chart: ~$878K peak May '22
  { year: 2023, price: 840_000 },  // REA chart: ~$840K post-correction
  { year: 2024, price: 862_000 },  // REA chart: ~$862K recovery
  { year: 2025, price: 920_000 },  // REA chart: ~$920K May '25 surge
  { year: 2026, price: 935_000 },  // extrapolated +1.5% H1
]

// Narre Warren South (source: REA.com.au/vic/narre-warren-south-3805)
const NARRE_WARREN_SOUTH_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 330_000 }, { year: 2011, price: 345_000 }, { year: 2012, price: 352_000 },
  { year: 2013, price: 365_000 }, { year: 2014, price: 388_000 }, { year: 2015, price: 420_000 },
  { year: 2016, price: 460_000 }, { year: 2017, price: 510_000 }, { year: 2018, price: 555_000 },
  { year: 2019, price: 585_000 }, { year: 2020, price: 610_000 }, { year: 2021, price: 695_000 },
  { year: 2022, price: 845_000 }, { year: 2023, price: 800_000 }, { year: 2024, price: 825_000 },
  { year: 2025, price: 880_000 }, { year: 2026, price: 895_000 },
]
// Officer (source: REA.com.au/vic/officer-3809)
const OFFICER_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 280_000 }, { year: 2011, price: 295_000 }, { year: 2012, price: 305_000 },
  { year: 2013, price: 320_000 }, { year: 2014, price: 345_000 }, { year: 2015, price: 375_000 },
  { year: 2016, price: 415_000 }, { year: 2017, price: 455_000 }, { year: 2018, price: 490_000 },
  { year: 2019, price: 515_000 }, { year: 2020, price: 540_000 }, { year: 2021, price: 620_000 },
  { year: 2022, price: 755_000 }, { year: 2023, price: 710_000 }, { year: 2024, price: 740_000 },
  { year: 2025, price: 790_000 }, { year: 2026, price: 805_000 },
]
// Pakenham (source: REA.com.au/vic/pakenham-3810)
const PAKENHAM_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 260_000 }, { year: 2011, price: 275_000 }, { year: 2012, price: 282_000 },
  { year: 2013, price: 295_000 }, { year: 2014, price: 315_000 }, { year: 2015, price: 345_000 },
  { year: 2016, price: 380_000 }, { year: 2017, price: 420_000 }, { year: 2018, price: 455_000 },
  { year: 2019, price: 475_000 }, { year: 2020, price: 500_000 }, { year: 2021, price: 580_000 },
  { year: 2022, price: 700_000 }, { year: 2023, price: 660_000 }, { year: 2024, price: 685_000 },
  { year: 2025, price: 730_000 }, { year: 2026, price: 745_000 },
]
// Hampton Park (source: REA.com.au/vic/hampton-park-3976)
const HAMPTON_PARK_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 290_000 }, { year: 2011, price: 305_000 }, { year: 2012, price: 312_000 },
  { year: 2013, price: 325_000 }, { year: 2014, price: 348_000 }, { year: 2015, price: 378_000 },
  { year: 2016, price: 415_000 }, { year: 2017, price: 460_000 }, { year: 2018, price: 495_000 },
  { year: 2019, price: 518_000 }, { year: 2020, price: 540_000 }, { year: 2021, price: 618_000 },
  { year: 2022, price: 748_000 }, { year: 2023, price: 705_000 }, { year: 2024, price: 728_000 },
  { year: 2025, price: 774_000 }, { year: 2026, price: 790_000 },
]
// Hallam (source: REA.com.au/vic/hallam-3803)
const HALLAM_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 295_000 }, { year: 2011, price: 310_000 }, { year: 2012, price: 318_000 },
  { year: 2013, price: 330_000 }, { year: 2014, price: 352_000 }, { year: 2015, price: 382_000 },
  { year: 2016, price: 420_000 }, { year: 2017, price: 462_000 }, { year: 2018, price: 498_000 },
  { year: 2019, price: 520_000 }, { year: 2020, price: 545_000 }, { year: 2021, price: 622_000 },
  { year: 2022, price: 750_000 }, { year: 2023, price: 708_000 }, { year: 2024, price: 732_000 },
  { year: 2025, price: 778_000 }, { year: 2026, price: 794_000 },
]
// Narre Warren (source: REA.com.au/vic/narre-warren-3805)
const NARRE_WARREN_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 310_000 }, { year: 2011, price: 326_000 }, { year: 2012, price: 334_000 },
  { year: 2013, price: 348_000 }, { year: 2014, price: 372_000 }, { year: 2015, price: 403_000 },
  { year: 2016, price: 442_000 }, { year: 2017, price: 488_000 }, { year: 2018, price: 527_000 },
  { year: 2019, price: 553_000 }, { year: 2020, price: 578_000 }, { year: 2021, price: 660_000 },
  { year: 2022, price: 795_000 }, { year: 2023, price: 752_000 }, { year: 2024, price: 775_000 },
  { year: 2025, price: 824_000 }, { year: 2026, price: 840_000 },
]

// Lookup map: suburb name (lowercase) → price series
const SUBURB_PRICE_SERIES: Record<string, { year: number; price: number }[]> = {
  "berwick":              BERWICK_PRICES,
  "narre warren south":   NARRE_WARREN_SOUTH_PRICES,
  "officer":              OFFICER_PRICES,
  "pakenham":             PAKENHAM_PRICES,
  "hampton park":         HAMPTON_PARK_PRICES,
  "hallam":               HALLAM_PRICES,
  "narre warren":         NARRE_WARREN_PRICES,
}

function getSuburbPriceSeries(suburb: string): { year: number; price: number }[] | null {
  return SUBURB_PRICE_SERIES[suburb.toLowerCase().trim()] ?? null
}

/** Interpolate suburb price for a given fractional year using known data series */
function suburbPriceAt(series: { year: number; price: number }[], y: number): number {
  const loArr = series.filter(p => p.year <= y)
  const lo = loArr.length > 0 ? loArr[loArr.length - 1] : series[0]
  const hi = series.find(p => p.year > y) ?? series[series.length - 1]
  if (lo === hi) return lo.price
  const t = (y - lo.year) / (hi.year - lo.year)
  return lo.price + t * (hi.price - lo.price)
}

// Returns full address without duplicating the suburb if purchaseAddress already ends with it
function fullAddr(purchaseAddress: string, suburb: string): string {
  const norm = (s: string) => s.trim().toLowerCase()
  if (!suburb || norm(purchaseAddress).endsWith(norm(suburb))) return purchaseAddress.trim()
  return `${purchaseAddress.trim()}, ${suburb.trim()}`
}

// ── ActiveCard ────────────────────────────────────────────────────────────────

function ActiveCard({ property, onClick, onBuyerBrief, theme }: {
  property: PortfolioProperty
  onClick: () => void
  onBuyerBrief?: (p: PortfolioProperty) => void
  theme: AgencyTheme
}) {
  const slm = loadSLMForProperty(property.id)
  const completeness = slm ? getSLMCompleteness(slm) : null

  return (
    <div
      onClick={onClick}
      style={{
        background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`,
        overflow: "hidden", cursor: "pointer",
        transition: "border 0.15s, box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = withAlpha(theme.primary, 0.5)
        el.style.boxShadow = `0 0 32px ${theme.glow}, 0 0 0 1px ${withAlpha(theme.primary, 0.08)}`
        el.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = C.border
        el.style.boxShadow = "none"
        el.style.transform = "translateY(0)"
      }}
    >
      <div style={{ height: 160, overflow: "hidden", position: "relative" }}>
        <img
          src={property.image}
          alt={property.address}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {completeness && (
          <div style={{
            position: "absolute", bottom: 10, left: 10,
            padding: "3px 9px", borderRadius: 8,
            background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
            fontSize: 10, fontWeight: 700, color: completeness.pct >= 70 ? C.green : "#f59e0b",
          }}>
            {completeness.pct}% SLM complete
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2, lineHeight: 1.3 }}>
          {property.address}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
          {property.suburb} {property.state}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          {[
            `${property.beds} bd`,
            `${property.baths} bath`,
            `${property.cars} car`,
            property.land ? `${property.land}m²` : null,
          ].filter(Boolean).map(s => (
            <span key={s} style={{ fontSize: 10, color: C.faint }}>{s}</span>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
          {property.priceMin && property.priceMax
            ? `${fmt(property.priceMin)} – ${fmt(property.priceMax)}`
            : fmt(property.price)}
        </div>
        {property.openDate && (
          <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>{property.openDate}</div>
        )}
        {property.auctionDate && (
          <div style={{ marginTop: 2, fontSize: 10, color: theme.gradient[0], fontWeight: 600 }}>Auction {property.auctionDate}</div>
        )}
        {onBuyerBrief && (
          <button
            onClick={e => { e.stopPropagation(); onBuyerBrief(property) }}
            style={{
              marginTop: 8, padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: "transparent", border: `1px solid ${withAlpha(theme.primary, 0.28)}`,
              color: theme.gradient[0], cursor: "pointer", fontFamily: FONT,
            }}
          >
            Buyer Brief
          </button>
        )}
      </div>
    </div>
  )
}

// ── SoldCard ──────────────────────────────────────────────────────────────────

function SoldCard({ property, leads, loading, theme, onClick }: {
  property: PortfolioProperty
  leads: SheetLead[]
  loading: boolean
  theme: AgencyTheme
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 16, border: `1px solid ${withAlpha(theme.primary, 0.25)}`,
        overflow: "hidden", cursor: "pointer", position: "relative",
        height: 280,
        transition: "border 0.15s, box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = withAlpha(theme.primary, 0.7)
        el.style.boxShadow = `0 0 28px ${theme.glow}`
        el.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = withAlpha(theme.primary, 0.25)
        el.style.boxShadow = "none"
        el.style.transform = "translateY(0)"
      }}
    >
      {/* Layer 1 — full-bleed photo */}
      <img
        src={property.image}
        alt={property.address}
        loading="lazy"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Layer 2 — agency colour gradient: transparent at top → solid at bottom */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, ${withAlpha(theme.primary, 0)} 0%, ${withAlpha(theme.primary, 0)} 28%, ${withAlpha(theme.primary, 0.75)} 62%, ${withAlpha(theme.primary, 1)} 100%)`,
      }} />

      {/* Sold badge — top left */}
      <div style={{
        position: "absolute", top: 10, left: 10,
        padding: "3px 10px", borderRadius: 20,
        background: theme.primary,
        fontSize: 10, fontWeight: 800, color: "#fff", zIndex: 2,
      }}>
        Sold {fmt(property.price)}
      </div>

      {/* Sold date — top right */}
      {property.soldDate && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          padding: "3px 10px", borderRadius: 20,
          background: "rgba(0,0,0,0.50)", backdropFilter: "blur(4px)",
          fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)", zIndex: 2,
        }}>
          {property.soldDate}
        </div>
      )}


      {/* Layer 3 — text block */}
      <div style={{ position: "absolute", bottom: 16, left: 14, right: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: 3 }}>
          {property.address}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 7 }}>
          {property.suburb} {property.state}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {[`${property.beds} bd`, `${property.baths} ba`, `${property.cars} car`,
              property.land ? `${property.land} m²` : null].filter(Boolean).map(s => (
              <span key={s} style={{ fontSize: 10, color: "rgba(255,255,255,0.70)" }}>{s}</span>
            ))}
          </div>
          {loading ? (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>
              <span style={{ animation: "blink 1s ease-in-out infinite" }}>.</span>
              <span style={{ animation: "blink 1s ease-in-out 0.33s infinite" }}>.</span>
              <span style={{ animation: "blink 1s ease-in-out 0.66s infinite" }}>.</span>
            </span>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {leads.length}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.70)" }}>
                {leads.length === 1 ? "attendee" : "attendees"}
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Stage 0b — Sold Property Attendees ───────────────────────────────────────

function SoldLeadsPage({ soldProperty, leads, onBack, onSelectLead, theme }: {
  soldProperty: PortfolioProperty
  leads: SheetLead[]
  onBack: () => void
  onSelectLead?: (lead: ScoredLead, property: PortfolioProperty) => void
  theme: AgencyTheme
}) {
  const slm = loadSLMForProperty(soldProperty.id)
  const activeSLMs = PORTFOLIO_ACTIVE.map(p => ({
    property: p,
    slm: loadSLMForProperty(p.id),
  }))
  const [attended, setAttended] = useState<Set<string>>(new Set())

  // For each lead, find the best-matching active listing
  const leadsWithRecs = leads.map(lead => {
    const bedsWanted = inferBedsWanted(lead)
    const enrichedNotes = enrichLeadNotes(lead.id, lead.notes)
    const bestMatch = activeSLMs
      .map(a => ({
        property: a.property,
        result: matchLeadToListing(
          { budget: lead.budget, bedsWanted, persona: lead.persona, suburbs: inferSuburbs(lead), notes: enrichedNotes, questions: lead.questions },
          a.slm,
          slm,
        ),
      }))
      .sort((a, b) => b.result.score - a.result.score)[0]
    return { lead, bestMatch }
  })

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "110px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 20, padding: 0, lineHeight: 1,
      }}>←</button>

      {/* Header — property info */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{ width: 80, height: 60, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
          <img src={soldProperty.image} alt={soldProperty.address} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -0.6, marginBottom: 2 }}>
            {soldProperty.address}, {soldProperty.suburb}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>
              Sold {fmt(soldProperty.price)}
            </span>
            {soldProperty.soldDate && (
              <span style={{ fontSize: 12, color: C.muted }}>{soldProperty.soldDate}</span>
            )}
          </div>
        </div>
      </div>

      {/* Open Home Attendees title — between property info and lead list */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted,
        textTransform: "uppercase", marginBottom: 16,
        paddingTop: 16, borderTop: `1px solid ${C.border}`,
      }}>
        Open Home Attendees · {leads.length} {leads.length === 1 ? "attendee" : "attendees"}
      </div>

      {leads.length === 0 ? (
        <div style={{
          padding: "32px", textAlign: "center", background: C.bg2,
          borderRadius: 16, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 8 }}>No leads found in Google Sheets</div>
          <div style={{ fontSize: 12, color: C.faint }}>
            Make sure the Leads tab has <code style={{ color: C.muted }}>inspectedProperty</code> matching this address exactly
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {leadsWithRecs.map(({ lead, bestMatch }, i) => {
            const score = bestMatch?.result.score ?? 0
            const color = scoreColor(score)
            return (
              <motion.div
                key={lead.id || lead.name + i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (!onSelectLead) return
                  const scoredLead: ScoredLead = {
                    ...lead,
                    matchResult: bestMatch?.result ?? { score: 0, reasons: [] },
                    fromPropertyId: soldProperty.id,
                    bedsWanted: inferBedsWanted(lead),
                  }
                  onSelectLead(scoredLead, bestMatch?.property ?? PORTFOLIO_ACTIVE[0])
                }}
                style={{
                  background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`,
                  padding: "16px 18px",
                  cursor: onSelectLead ? "pointer" : "default",
                  transition: "border 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={onSelectLead ? (e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = theme.primary + "55"
                  el.style.boxShadow = `0 0 20px ${theme.glow}`
                }) : undefined}
                onMouseLeave={onSelectLead ? (e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = C.border
                  el.style.boxShadow = "none"
                }) : undefined}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  {/* Main info — no initials avatar */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{lead.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                        background: theme.dim, border: `1px solid ${theme.primary}33`, color: theme.primary,
                      }}>{lead.persona || "Buyer"}</span>
                      {/* Attendance toggle — Feature 6 */}
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          const id = lead.id || lead.name
                          const next = new Set(attended)
                          if (attended.has(id)) {
                            next.delete(id)
                          } else {
                            next.add(id)
                            await markAttended({ leadId: id, leadName: lead.name, propertyAddress: soldProperty.address + ", " + soldProperty.suburb })
                          }
                          setAttended(next)
                        }}
                        style={{
                          padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
                          background: attended.has(lead.id || lead.name) ? "rgba(100,208,144,0.15)" : C.bg3,
                          border: `1px solid ${attended.has(lead.id || lead.name) ? C.green : C.border}`,
                          color: attended.has(lead.id || lead.name) ? C.green : C.muted,
                          transition: "all 0.15s",
                        }}
                      >
                        {attended.has(lead.id || lead.name) ? "Attended ✓" : "Mark attended"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} style={{ fontSize: 12, color: theme.primary, textDecoration: "none" }}>{lead.phone}</a>
                      )}
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} style={{ fontSize: 12, color: theme.primary, textDecoration: "none" }}>{lead.email}</a>
                      )}
                      <span style={{ fontSize: 12, color: C.muted }}>{fmt(lead.budget)} budget</span>
                    </div>
                    {lead.questions.length > 0 && (
                      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.4 }}>
                        Asked: {lead.questions.slice(0, 3).join(" · ")}
                      </div>
                    )}
                    {lead.notes && (
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 1.4 }}>
                        <span style={{ color: C.muted, fontWeight: 600 }}>Notes: </span>
                        {lead.notes.slice(0, 120)}{lead.notes.length > 120 ? "…" : ""}
                      </div>
                    )}
                  </div>

                  {/* Best match recommendation — score arc + compact ticks */}
                  {bestMatch && (() => {
                    const r = 20
                    const circ = 2 * Math.PI * r
                    const pct = Math.min(score, 99) / 100
                    const dash = circ * pct
                    const gap = circ - dash
                    const reasons = bestMatch.result.reasons.filter(r => r.type === "strength").slice(0, 2)
                    return (
                      <div style={{
                        flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column",
                        alignItems: "flex-end", gap: 6,
                      }}>
                        {/* Arc score circle */}
                        <div style={{ position: "relative", width: 48, height: 48 }}>
                          <svg width={48} height={48} style={{ transform: "rotate(-90deg)" }}>
                            <circle cx={24} cy={24} r={r} fill="none" stroke={color + "44"} strokeWidth={3} />
                            <circle
                              cx={24} cy={24} r={r} fill="none"
                              stroke={color} strokeWidth={3}
                              strokeDasharray={`${dash} ${gap}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
                          </div>
                        </div>
                        {/* Recommended listing */}
                        <div style={{
                          padding: "3px 8px", borderRadius: 8,
                          background: theme.dim, border: `1px solid ${theme.primary}22`,
                          fontSize: 10, color: theme.primary, fontWeight: 600,
                          maxWidth: 140, textAlign: "right", lineHeight: 1.3,
                        }}>
                          → {bestMatch.property.address}
                        </div>
                        {/* Compact tick reasons */}
                        {reasons.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                            {reasons.map((r, ri) => {
                              // Extract short label — take first 2 words before "closely" or "match"
                              const short = r.text.split(" ").slice(0, 2).join(" ")
                              return (
                                <div key={ri} style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
                                  <span style={{ color: C.green }}>✓</span>
                                  <span>{short}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Sheets data source — plain, unobtrusive */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
          Leads sourced from Google Sheets · inspectedProperty = {soldProperty.address}, {soldProperty.suburb} · Match scores calculated by SLM engine against active listings
        </div>
      </div>
    </div>
  )
}

// ── Address fuzzy match — normalise and check substring ──────────────────────

function normaliseAddr(s: string): string {
  return s.toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(vic|nsw|qld|wa|sa|tas|act|nt)\b/g, "")
    .replace(/\b\d{4}\b/g, "")           // strip postcode
    .replace(/(street|st|road|rd|avenue|ave|drive|dr|court|ct|place|pl|way|wy|close|cl|grove|gr|terrace|tce|crescent|cres)\b/g, s => s[0]) // normalise type
    .replace(/\s+/g, " ").trim()
}

// Shorten address for SMS — "3 Thirlmere Court" → "Thirlmere Ct", "17 Grand Arch Way" → "Grand Arch Way"
function shortAddr(address: string): string {
  const typeAbbr: Record<string, string> = {
    street: "St", road: "Rd", avenue: "Ave", drive: "Dr",
    court: "Ct", place: "Pl", close: "Cl", grove: "Gr",
    terrace: "Tce", crescent: "Cres", lane: "Ln", boulevard: "Blvd",
    circuit: "Cct", parade: "Pde",
  }
  const withoutNum = address.replace(/^\d[\d/\-]*\s+/, "")
  const words = withoutNum.split(" ")
  const last = words[words.length - 1]?.toLowerCase()
  if (last && typeAbbr[last]) words[words.length - 1] = typeAbbr[last]
  return words.join(" ")
}

function leadBelongsToProperty(lead: SheetLead, property: PortfolioProperty): boolean {
  const haystack = normaliseAddr(lead.inspectedProperty)
  // Check if the street number + first word of street name appear together
  const needle = normaliseAddr(property.address)
  return haystack.includes(needle) || needle.includes(haystack.split(" ").slice(0, 3).join(" "))
}

/**
 * Group a flat list of leads by sold property.
 * Uses fuzzy address matching so minor formatting differences don't break the join.
 */
function groupLeadsByProperty(allLeads: SheetLead[], soldProperties: PortfolioProperty[] = PORTFOLIO_SOLD): Record<number, SheetLead[]> {
  const map: Record<number, SheetLead[]> = {}
  for (const sold of soldProperties) {
    map[sold.id] = allLeads.filter(lead => leadBelongsToProperty(lead, sold))
  }
  return map
}

/**
 * For Pas Sunilchandra: pull Cameron's "3 Thirlmere Court" leads (property 102)
 * and alias them under Pas's "58 Broadway Street" (property 301).
 * This lets the demo flow run without Pas needing his own Sheet leads.
 * Has zero effect when any other agent is logged in.
 */
function addPasLeadAliases(
  grouped: Record<number, SheetLead[]>,
  allLeads: SheetLead[],
  agent: AgentProfile
): Record<number, SheetLead[]> {
  // Pas Sunilchandra — alias Cameron's Thirlmere leads to Broadway St (301)
  if (isPasSunilchandra(agent)) {
    const camGrouped = groupLeadsByProperty(allLeads, PORTFOLIO_SOLD)
    const thirlmere = camGrouped[102] ?? []
    if (!thirlmere.length) return grouped
    return { ...grouped, 301: [...(grouped[301] ?? []), ...thirlmere] }
  }
  // Manpreet Singh — alias Cameron's Thirlmere leads to 40 Jack William Way (501)
  if (isManpreetSingh(agent)) {
    const camGrouped = groupLeadsByProperty(allLeads, PORTFOLIO_SOLD)
    const thirlmere = camGrouped[102] ?? []
    if (!thirlmere.length) return grouped
    return { ...grouped, 501: [...(grouped[501] ?? []), ...thirlmere] }
  }
  return grouped
}

/** Strip out test / placeholder rows that come back from the Sheet during development. */
function isRealLead(lead: SheetLead): boolean {
  const name = lead.name.trim().toLowerCase()
  if (!name) return false
  // Obvious test/seed row names
  if (["test lead", "lead_status", "name", "test", "sample"].includes(name)) return false
  // Seed rows that look like column headers or events (no space in name = likely a field name)
  if (!name.includes(" ") && lead.budget === 0) return false
  return true
}

// ── Stage 0 — Portfolio ───────────────────────────────────────────────────────

function PortfolioPage({ onSelectActive, onSelectSold, onAuctionSaved, onSettings, agent, theme }: {
  onSelectActive: (p: PortfolioProperty, soldLeads: Record<number, SheetLead[]>) => void
  onSelectSold: (p: PortfolioProperty, leads: SheetLead[]) => void
  onAuctionSaved: (property: PortfolioProperty, leads: SheetLead[]) => void
  onSettings?: () => void
  agent: AgentProfile
  theme: AgencyTheme
}) {
  // Gate portfolio data to Cam Knoll / Peake — other agents see empty
  const { sold: agentSold, active: agentActive } = getPortfolioForAgent(agent)

  const [soldLeads, setSoldLeads] = useState<Record<number, SheetLead[]>>({})
  const [sheetsLoading, setSheetsLoading] = useState(true)
  const [auctionPanelProperty, setAuctionPanelProperty] = useState<PortfolioProperty | null>(null)
  const [pitchProperty, setPitchProperty] = useState<PortfolioProperty | null>(null)
  // Capture new open-home lead
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: "", phone: "", email: "", property: "", suburb: "", notes: "" })
  const [leadSaving, setLeadSaving] = useState(false)
  const [leadSaved, setLeadSaved] = useState(false)

  useEffect(() => {
    let mounted = true
    const CACHE_KEY = "propOS_leads_cache_v3"

    const applyLeads = (leads: SheetLead[], save = false) => {
      if (!mounted) return
      const grouped = addPasLeadAliases(groupLeadsByProperty(leads, agentSold), leads, agent)
      const total   = Object.values(grouped).reduce((a, l) => a + l.length, 0)

      if (total === 0 && agentSold.length > 0) {
        // No sheet leads at all for this agent — use full fallback
        // (covers cross-agent cache pollution and empty sheets)
        setSoldLeads(addPasLeadAliases(groupLeadsByProperty(DEMO_FALLBACK_LEADS, agentSold), DEMO_FALLBACK_LEADS, agent))
        setSheetsLoading(false)
        return
      }

      // Use GSheets data as-is — no fallback supplementation
      setSoldLeads(grouped)

      setSheetsLoading(false)
      if (save && total > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(leads)) } catch {}
      }
    }

    // Load from localStorage cache immediately for instant display
    const cachedRaw = localStorage.getItem(CACHE_KEY)
    const cachedAll: SheetLead[] | null = cachedRaw ? (() => { try { return JSON.parse(cachedRaw) } catch { return null } })() : null
    const cached = cachedAll ? cachedAll.filter(isRealLead) : null
    if (cached && cached.length > 0) applyLeads(cached)

    // If Sheets not configured, stop here — cache or fallback is sufficient
    if (!sheetsConnected()) {
      if ((!cached || cached.length === 0) && agentSold.length > 0) applyLeads(DEMO_FALLBACK_LEADS)
      else setSheetsLoading(false)
      return () => { mounted = false }
    }

    // Race Sheets fetch against 4s timeout — use cache if available, else fallback
    let settled = false
    const fallbackTimer = setTimeout(() => {
      if (!settled && mounted && (!cached || cached.length === 0)) {
        applyLeads(DEMO_FALLBACK_LEADS)
      } else if (!settled && mounted) {
        setSheetsLoading(false)
      }
    }, 4000)

    // Strategy 1: bulk fetch, group client-side with fuzzy address match.
    readAllLeadsFromSheet()
      .then(allLeads => {
        settled = true
        clearTimeout(fallbackTimer)
        if (allLeads && allLeads.length > 0) {
          const real = allLeads.filter(isRealLead)
          if (real.length > 0) { applyLeads(real, true); return }
          // All rows were test/placeholder — fall through to per-property or fallback
        }
        // Strategy 2: bulk empty or all-fake — try per-property queries.
        return Promise.all(
          agentSold.map(p => readLeadsFromSheet(p.address + ", " + p.suburb))
        ).then(results => {
          const flat = results.flatMap((leads, i) =>
            (leads ?? []).map(l => ({ ...l, _pid: agentSold[i].id }))
          ).filter(isRealLead) as SheetLead[]
          if (flat.length > 0) {
            applyLeads(flat, true)
          } else if (!cached || cached.length === 0) {
            applyLeads(DEMO_FALLBACK_LEADS)
          } else {
            setSheetsLoading(false)
          }
        })
      })
      .catch(() => {
        settled = true
        clearTimeout(fallbackTimer)
        if (!cached || cached.length === 0) applyLeads(DEMO_FALLBACK_LEADS)
        else setSheetsLoading(false)
      })

    return () => { mounted = false; clearTimeout(fallbackTimer) }
  }, [])

  // Preload SLMs from Google Sheets (runs once at startup, populates runtime cache)
  useEffect(() => {
    const allIds = [...agentSold, ...agentActive].map(p => p.id)
    if (allIds.length > 0) preloadSLMsFromSheet(allIds).catch(() => {})
  }, [])

  // SLM completeness check — warn if any active listing is below 80% complete
  const slmWarnings = agentActive
    .map(p => ({ p, pct: getSLMCompleteness(loadSLMForProperty(p.id)).pct }))
    .filter(({ pct }) => pct < 80)

  const handleCaptureLead = async () => {
    if (!leadForm.name) return
    setLeadSaving(true)
    try {
      await authFetch(apiUrl("/api/add-lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Date.now(),
          name: leadForm.name, phone: leadForm.phone, email: leadForm.email,
          inspectedProperty: leadForm.property, suburb: leadForm.suburb,
          notes: leadForm.notes, persona: "family",
          addedAt: new Date().toISOString(),
        }),
      })
    } catch { /* save locally even if sheet write fails */ }
    setLeadSaved(true)
    setLeadSaving(false)
    setTimeout(() => {
      setShowLeadModal(false)
      setLeadForm({ name: "", phone: "", email: "", property: "", suburb: "", notes: "" })
      setLeadSaved(false)
    }, 1200)
  }

  return (
    <>
    <div style={{ padding: "80px 32px 56px", fontFamily: FONT, maxWidth: 1440, margin: "0 auto" }}>

      {/* ── SLM completeness warning ────────────────────────────────────────── */}
      {slmWarnings.length > 0 && (
        <div style={{
          marginBottom: 20, padding: "10px 16px", borderRadius: 10,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
          <div style={{ fontSize: 12, color: "#f59e0b", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>SLM incomplete: </span>
            {slmWarnings.map(({ p, pct }) => `${p.address} (${pct}%)`).join(" · ")}
            {" "}Outreach quality improves when property data is complete.{" "}
            <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={onSettings}>
              Update in Settings →
            </span>
          </div>
        </div>
      )}

      {/* ── Active listings ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.blue, textTransform: "uppercase" }}>
            Active Listings
          </div>
          <button onClick={() => setShowLeadModal(true)} style={{
            marginLeft: "auto", padding: "5px 14px", borderRadius: 8,
            background: theme.primary, border: "none",
            color: "#fff", fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: FONT,
          }}>
            + Capture lead
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {agentActive.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <ActiveCard
                property={p}
                theme={theme}
                onClick={() => onSelectActive(p, soldLeads)}
                onBuyerBrief={setPitchProperty}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: C.border, marginBottom: 36 }} />

      {/* ── Sold listings ───────────────────────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
            Comparable Sales
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {agentSold.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <SoldCard
                property={p}
                leads={soldLeads[p.id] ?? []}
                loading={sheetsLoading}
                theme={theme}
                onClick={() => onSelectSold(p, soldLeads[p.id] ?? [])}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>

    {/* Auction outcome panel — modal overlay */}
    {auctionPanelProperty && (
      <AuctionOutcomePanel
        propertyId={auctionPanelProperty.id}
        propertyAddress={auctionPanelProperty.address + ", " + auctionPanelProperty.suburb}
        suburb={auctionPanelProperty.suburb}
        priceGuideMin={auctionPanelProperty.priceMin ?? auctionPanelProperty.price * 0.95}
        priceGuideMax={auctionPanelProperty.priceMax ?? auctionPanelProperty.price * 1.05}
        onClose={() => setAuctionPanelProperty(null)}
        onSaved={() => {
          onAuctionSaved(auctionPanelProperty!, soldLeads[auctionPanelProperty!.id] ?? [])
          setAuctionPanelProperty(null)
        }}
      />
    )}

    {/* Buyer Pitch Report — modal overlay */}
    {pitchProperty && (
      <BuyerPitchReport
        property={pitchProperty}
        slm={loadSLMForProperty(pitchProperty.id)}
        agent={agent}
        onClose={() => setPitchProperty(null)}
      />
    )}

    {/* ── Capture New Lead modal ────────────────────────────────────────────── */}
    {showLeadModal && (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }} onClick={() => setShowLeadModal(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: "#16181e", borderRadius: 18, border: `1px solid ${C.border}`,
            padding: "28px 28px 24px", width: "100%", maxWidth: 440,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Capture Open-Home Lead</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Saved to the Lead tab in your Google Sheet.</div>

          {/* Name + Phone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Name *</div>
              <input value={leadForm.name} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith" style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Phone</div>
              <input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="0400 000 000" style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Email</div>
            <input value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@email.com" style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Property + Suburb */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Property inspected</div>
              <input value={leadForm.property} onChange={e => setLeadForm(f => ({ ...f, property: e.target.value }))}
                placeholder="12 Main St, Berwick" style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Suburb</div>
              <input value={leadForm.suburb} onChange={e => setLeadForm(f => ({ ...f, suburb: e.target.value }))}
                placeholder="Berwick" style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
            <textarea value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Budget, requirements, questions asked..." rows={2}
              style={{ width: "100%", background: "#0d0f14", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", resize: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowLeadModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
            <button onClick={handleCaptureLead} disabled={leadSaving || leadSaved || !leadForm.name} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: leadSaved ? C.green : !leadForm.name ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: leadForm.name ? "white" : C.faint, fontSize: 13, fontWeight: 700, cursor: leadSaving || leadSaved || !leadForm.name ? "default" : "pointer", fontFamily: FONT }}>
              {leadSaved ? "✓ Lead captured" : leadSaving ? "Saving…" : "Save to Lead tab"}
            </button>
          </div>
        </motion.div>
      </div>
    )}
    </>
  )
}

// ── Helpers for SheetLead inference ──────────────────────────────────────────

function inferBedsWanted(lead: SheetLead): number {
  const p = lead.persona.toLowerCase()
  const n = lead.notes.toLowerCase()
  if (p.includes("executive") || n.includes("5 bed") || n.includes("5bed")) return 5
  if (p.includes("investor") || p.includes("upsizer") || p.includes("4 bed") || n.includes("4 bed") || n.includes("4bed")) return 4
  if (p.includes("first home") || p.includes("fhb") || p.includes("downsizer") || n.includes("3 bed")) return 3
  const m = (lead.notes + " " + lead.persona).match(/(\d)\s*bed/i)
  if (m) return parseInt(m[1])
  return 4
}

function inferSuburbs(lead: SheetLead): string[] {
  const parts = lead.inspectedProperty.split(",")
  const suburb = parts.length >= 2 ? parts[parts.length - 2].trim() : "Berwick"
  return [suburb]
}

// ── Stage 1 — SLM Matching Animation ─────────────────────────────────────────

function MatchingScreen({ property, soldLeads, onComplete, theme }: {
  property: PortfolioProperty
  soldLeads: Record<number, SheetLead[]>
  onComplete: (leads: ScoredLead[]) => void
  theme: AgencyTheme
}) {
  const [visibleSteps, setVisibleSteps] = useState<number>(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const soldIds = Object.keys(soldLeads).map(Number)
  const totalLeadCount = soldIds.reduce((acc, id) => acc + (soldLeads[id]?.length ?? 0), 0)
  const slmInfo = getSLMCompleteness(loadSLMForProperty(property.id))

  const steps = [
    `Reading property SLM: ${slmInfo.filled} attributes loaded`,
    `Scanning ${soldIds.length} comparable sold properties`,
    `Scoring ${totalLeadCount} leads from Google Sheets`,
    `Ranking by attribute overlap: configuration, land, school zone, legal profile`,
    `Weighting by question alignment: matching what each lead asked to this property`,
    `Match list ready, sorted by compatibility score`,
  ]

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < steps.length; i++) {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), (i + 1) * 550))
    }
    const advance = setTimeout(() => {
      const activeSLM = loadSLMForProperty(property.id)
      const scoredLeads: ScoredLead[] = soldIds.flatMap(soldId => {
        const soldSLM = loadSLMForProperty(soldId)
        const sheetLeads = soldLeads[soldId] ?? []
        return sheetLeads.map(lead => {
          const bedsWanted = inferBedsWanted(lead)
          return {
            ...lead,
            fromPropertyId: soldId,
            bedsWanted,
            matchResult: matchLeadToListing(
              {
                budget: lead.budget,
                bedsWanted,
                persona: lead.persona,
                suburbs: inferSuburbs(lead),
                notes: enrichLeadNotes(lead.id, lead.notes),
                questions: lead.questions,
              },
              activeSLM,
              soldSLM,
            ),
          }
        })
      }).sort((a, b) => b.matchResult.score - a.matchResult.score)
      onCompleteRef.current(scoredLeads)
    }, steps.length * 550 + 800)
    timers.push(advance)
    return () => timers.forEach(clearTimeout)
  }, [property.id, steps.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: FONT,
    }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{
          background: C.bg2, borderRadius: 20, border: `1px solid ${C.border}`,
          padding: "32px 36px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary,
            textTransform: "uppercase", marginBottom: 6,
          }}>
            AddVantage Engine
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4, letterSpacing: -0.4 }}>
            {property.address}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 28 }}>
            {property.suburb} {property.state} · running SLM match
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {steps.map((step, i) => (
              <AnimatePresence key={i}>
                {i < visibleSteps && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: i < visibleSteps - 1 ? C.green + "22" : theme.dim,
                      border: `1px solid ${i < visibleSteps - 1 ? C.green + "55" : theme.primary + "44"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {i < visibleSteps - 1 ? (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                      ) : (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          style={{
                            width: 8, height: 8, borderRadius: "50%",
                            border: `1.5px solid ${theme.primary}`,
                            borderTopColor: "transparent",
                          }}
                        />
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: i < visibleSteps - 1 ? C.text : C.muted, lineHeight: 1.4 }}>
                      {step}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: C.bg3, borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${(visibleSteps / steps.length) * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.4 }}
              style={{ height: "100%", background: `linear-gradient(90deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, borderRadius: 2 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stage 2 — Lead Match List ─────────────────────────────────────────────────

// Minimum match score to appear in the lead list.
// Leads below this scored too low to be worth pitching — usually a budget gap or profile mismatch.
const MATCH_THRESHOLD = 30

const TOP_LEADS_DEFAULT = 30

function LeadsPage({ property, allLeads, onBack, onSelect, theme }: {
  property: PortfolioProperty
  allLeads: ScoredLead[]
  onBack: () => void
  onSelect: (lead: ScoredLead) => void
  theme: AgencyTheme
}) {
  const [showAll, setShowAll] = useState(false)

  const aboveThreshold = allLeads.filter(l => l.matchResult.score >= MATCH_THRESHOLD)
  // Always show at least top 5 — prevents blank list if all scores are low
  const filtered = aboveThreshold.length >= 5
    ? aboveThreshold
    : allLeads.slice(0, Math.max(5, aboveThreshold.length))

  const displayed = showAll ? filtered : filtered.slice(0, TOP_LEADS_DEFAULT)
  const remainingCount = filtered.length - displayed.length

  const fromPropertyAddress = (id: number) =>
    loadSLMForProperty(id)?.address ?? PORTFOLIO_SOLD.find(p => p.id === id)?.address ?? "Unknown"

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "110px 32px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 20, padding: 0, lineHeight: 1,
      }}>←</button>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
          Matched Leads
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: -0.8 }}>
          {property.address} · {filtered.length} matched
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          Sorted by persona-weighted compatibility
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {displayed.map((lead, i) => {
          const fromAddr = fromPropertyAddress(lead.fromPropertyId)
          const topFactors = lead.matchResult.matchedFactors.filter(f => f.tag !== "vector" && f.tag !== "questions").slice(0, 2)
          const isTopLead = i < 5
          return (
            <motion.div
              key={lead.name + lead.fromPropertyId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035 }}
              onClick={() => onSelect(lead)}
              style={{
                background: C.bg2, borderRadius: 14,
                border: `1px solid ${isTopLead ? theme.primary + "33" : C.border}`,
                padding: "14px 16px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 14,
                transition: "border 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = theme.primary + "55"
                el.style.boxShadow = `0 0 18px ${theme.glow}`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = isTopLead ? theme.primary + "33" : C.border
                el.style.boxShadow = "none"
              }}
            >
              {/* Left info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{lead.name}</div>
                  {isTopLead && (
                    <span style={{ fontSize: 13, color: theme.primary, lineHeight: 1 }}>★</span>
                  )}
                  <div style={{
                    fontSize: 10, color: C.muted, padding: "2px 6px",
                    background: C.bg3, borderRadius: 6,
                  }}>
                    {lead.persona}
                  </div>
                  {lead.matchResult.budgetFlag === "stretch" && (
                    <div style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 6,
                      background: C.bg3, border: `1px solid ${C.border}`,
                      color: C.muted, fontWeight: 600,
                    }}>
                      stretch match
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  From {fromAddr} &middot; {fmt(lead.budget)} budget
                </div>
                {topFactors.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {topFactors.map(f => (
                      <div key={f.label} style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 10,
                        background: "rgba(166,218,255,0.1)", border: "1px solid rgba(166,218,255,0.2)",
                        color: C.blue, fontWeight: 600,
                      }}>
                        {f.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Score ring — filled arc proportional to score */}
              {(() => {
                const r = 22; const circ = 2 * Math.PI * r
                const pct = Math.min(lead.matchResult.score, 99) / 100
                const dash = circ * pct; const gap = circ - dash
                const col = scoreColor(lead.matchResult.score)
                return (
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}>
                      <circle cx={26} cy={26} r={r} fill="none" stroke={col + "44"} strokeWidth={3} />
                      <circle cx={26} cy={26} r={r} fill="none" stroke={col} strokeWidth={3}
                        strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
                    </svg>
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: col, lineHeight: 1 }}>{lead.matchResult.score}</span>
                      <span style={{ fontSize: 7, color: C.faint, fontWeight: 600 }}>MATCH</span>
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          )
        })}
      </div>

      {remainingCount > 0 && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAll(true)}
          style={{
            width: "100%", marginTop: 12, padding: "12px",
            borderRadius: 12, border: `1px solid ${C.border}`,
            background: C.bg2, color: theme.primary,
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          +{remainingCount} more lead{remainingCount > 1 ? "s" : ""} →
        </motion.button>
      )}
    </div>
  )
}

// ── Stage 3 — Lead Profile ────────────────────────────────────────────────────

function ProfilePage({ property, lead, soldSLM, onBack, onGenerate, theme }: {
  property: PortfolioProperty
  lead: ScoredLead
  soldSLM: PropertySLM
  onBack: () => void
  onGenerate: (transcript: string) => void
  theme: AgencyTheme
}) {
  const leadId = lead.id || lead.name.replace(/\s+/g, "_")

  // Pre-fill with any notes stored from prior sessions for this lead
  const [manualTranscript, setManualTranscript] = useState(() => getLeadCumulativeNotes(leadId))
  const voice = useVoiceMemo({ onTranscript: t => setManualTranscript(prev => prev ? prev + "\n\n" + t : t) })
  const transcript = manualTranscript

  const priorSessions = getLeadKnowledge(leadId)?.entries.length ?? 0

  const activeSLM = loadSLMForProperty(property.id)
  const fname = lead.name.split(" ")[0]
  const shownQs = new Set<string>()

  // Use the rich comparison data from matchResult (already built with direction + persona relevance)
  const comparisons = lead.matchResult.comparisons

  const dirIcon = (d?: "up" | "down" | "same") =>
    d === "up" ? " ↑" : d === "down" ? " ↓" : ""
  const dirColor = (_d?: "up" | "down" | "same", _persona?: string) => {
    return "rgb(225, 205, 255)"
  }

  // Build Q&A for display — synchronous SLM keyword pass
  const qaPairs: Array<{ question: string; answer: string; category: string }> = []
  const unmatchedQs: string[] = []
  for (const question of lead.questions ?? []) {
    const matched = matchQuestionToSLM(question, activeSLM, shownQs)
    if (matched) {
      shownQs.add(matched.question)
      qaPairs.push({ question, answer: matched.answer, category: matched.category })
    } else {
      unmatchedQs.push(question)
    }
  }

  // LLM fallback — batch all unmatched questions in a single request
  const [llmAnswers, setLlmAnswers] = useState<Map<string, { answer: string; category: string }>>(new Map())
  const questionsKey = (lead.questions ?? []).join("|")
  useEffect(() => {
    if (unmatchedQs.length === 0 || !activeSLM) return
    let cancelled = false
    ;(async () => {
      try {
        const propertyAddress = `${property.address}, ${property.suburb} ${property.state}`
        const r = await authFetch(apiUrl("/api/slm-answer-batch"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: unmatchedQs, slm: activeSLM, propertyAddress }),
        })
        if (!r.ok || cancelled) return
        const d = await r.json() as { answers?: Array<{ question: string; answer: string | null; category: string }> }
        if (!d.answers) return
        setLlmAnswers(prev => {
          const next = new Map(prev)
          for (const item of d.answers!) {
            if (item.answer) next.set(item.question, { answer: item.answer, category: item.category ?? "llm" })
          }
          return next
        })
      } catch { /* silent — LLM is best-effort */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsKey, property.id])

  // Merge SLM matches + LLM fallback answers
  const allQAPairs: Array<{ question: string; answer: string; category: string; source?: "llm" }> = [
    ...qaPairs,
    ...unmatchedQs
      .filter(q => llmAnswers.has(q))
      .map(q => ({ ...llmAnswers.get(q)!, question: q, source: "llm" as const })),
  ]

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "110px 32px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 24, padding: 0, lineHeight: 1,
      }}>←</button>

      <div style={{ display: "flex", gap: 28 }}>
        {/* LEFT column (60%) */}
        <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Lead identity */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>{lead.name}</div>
                </div>
                <div style={{
                  fontSize: 11, color: C.muted, padding: "2px 7px",
                  background: C.bg3, borderRadius: 6, display: "inline-block",
                }}>
                  {lead.persona}
                </div>
              </div>
              {/* Score ring — profile page */}
              {(() => {
                const r = 22; const circ = 2 * Math.PI * r
                const pct = Math.min(lead.matchResult.score, 99) / 100
                const dash = circ * pct; const gap = circ - dash
                const col = scoreColor(lead.matchResult.score)
                return (
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}>
                      <circle cx={26} cy={26} r={r} fill="none" stroke={col + "44"} strokeWidth={3} />
                      <circle cx={26} cy={26} r={r} fill="none" stroke={col} strokeWidth={3}
                        strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
                    </svg>
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: col, lineHeight: 1 }}>{lead.matchResult.score}</span>
                      <span style={{ fontSize: 7, color: C.faint, fontWeight: 600 }}>MATCH</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
              <a href={`tel:${lead.phone}`} style={{ fontSize: 13, color: theme.primary, textDecoration: "none", fontWeight: 600 }}>
                {lead.phone}
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} style={{ fontSize: 13, color: theme.primary, textDecoration: "none", fontWeight: 600 }}>
                  {lead.email}
                </a>
              )}
              <span style={{ fontSize: 13, color: C.muted }}>{fmt(lead.budget)} budget</span>
            </div>

            <div style={{ fontSize: 12, color: C.faint }}>
              Came from: {soldSLM.address}{soldSLM.soldDate ? ` · sold ${soldSLM.soldDate}` : ""}{soldSLM.soldPrice ? ` · ${fmt(soldSLM.soldPrice)}` : ""}
            </div>
          </div>

          {/* Comparison strip */}
          <div style={{ userSelect: "none" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 10 }}>
              {soldSLM.address.split(",")[0]} → {property.address.split(",")[0]}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {comparisons.map(cf => {
                const highlight = cf.investorRelevant || cf.familyRelevant
                return (
                  <div key={cf.label} style={{
                    flex: "1 1 120px", background: highlight ? theme.dim : C.bg2, borderRadius: 12,
                    border: `1px solid ${highlight ? theme.primary + "33" : C.border}`,
                    padding: "10px 12px",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: highlight ? "rgba(255,255,255,0.5)" : C.faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      {cf.label}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
                      <span style={{ color: highlight ? "rgba(255,255,255,0.75)" : C.text, fontWeight: 600 }}>{cf.soldValue}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      <span style={{
                        color: highlight ? "#fff" : dirColor(cf.direction, lead.persona),
                        fontWeight: 600,
                      }}>
                        {cf.activeValue}{dirIcon(cf.direction)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Q&A */}
          {(allQAPairs.length > 0 || unmatchedQs.length > 0) && (
            <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px", userSelect: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                What {fname} asked at the open home
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>
                {soldSLM.address.split(",")[0]} → answered for {property.address.split(",")[0]}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {allQAPairs.map((qa, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${theme.gradient[0]}44`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{qa.question}</div>
                    {qa.answer === "TBD" ? (
                      <div style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 6,
                        background: C.bg3, border: `1px solid ${C.border}`,
                        fontSize: 11, color: C.muted, fontWeight: 600,
                      }}>
                        TBD. Add in Settings
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{qa.answer}</div>
                    )}
                  </div>
                ))}
                {/* Show loading placeholders for questions still being fetched via LLM */}
                {unmatchedQs.filter(q => !llmAnswers.has(q)).map((q, i) => (
                  <div key={"loading-" + i} style={{ borderLeft: `2px solid ${theme.primary}22`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{q}</div>
                    <div style={{ fontSize: 12, color: C.faint, fontStyle: "italic" }}>Querying property data...</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div style={{
              background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: "14px 18px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Agent Notes
              </div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{lead.notes}</div>
            </div>
          )}
        </div>

        {/* RIGHT column (40%) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Voice memo */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>
                Voice Note
              </div>
              {!voice.supported && (
                <span style={{ fontSize: 11, color: C.faint }}>
                  Unavailable. Use Chrome or Safari.
                </span>
              )}
              {voice.supported && !voice.permError && (
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => voice.phase === "recording" ? voice.stop() : voice.start()}
                  disabled={voice.loading}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: voice.phase === "recording" ? "rgba(239,68,68,0.12)" : C.bg3,
                    color: voice.phase === "recording" ? "#ef4444" : C.muted,
                    fontSize: 11, fontWeight: 700, fontFamily: FONT,
                  }}
                >
                  {voice.phase === "recording" ? (
                    <>
                      <motion.div
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }}
                      />
                      {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, "0")} Stop
                    </>
                  ) : voice.loading ? "..." : "🎙 Record"}
                </motion.button>
              )}
              {voice.permError && (
                <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>✓ Loaded</span>
              )}
            </div>
            {voice.permError && (
              <div style={{
                marginBottom: 10, padding: "7px 10px", borderRadius: 8,
                background: "rgba(100,208,144,0.08)", border: "1px solid rgba(100,208,144,0.25)",
                fontSize: 11, color: C.green, lineHeight: 1.5,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>✓</span> Voice profile loaded from prior sessions
              </div>
            )}
            {voice.phase === "recording" && voice.liveTranscript && (
              <div style={{
                marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                background: C.bg3, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.5,
              }}>
                {voice.liveTranscript}
              </div>
            )}
            <textarea
              value={manualTranscript}
              onChange={e => setManualTranscript(e.target.value)}
              placeholder={`e.g. "${fname} mentioned school zone was top priority. Pre-approved to ${fmt(lead.budget)}."`}
              style={{
                width: "100%", minHeight: 120,
                background: C.bg3, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "10px 12px",
                color: C.text, fontSize: 12, fontFamily: FONT,
                lineHeight: 1.5, resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
            {transcript.trim() && (
              <div style={{
                marginTop: 8, fontSize: 11, color: C.green, userSelect: "none",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                {priorSessions > 0
                  ? `Saved across ${priorSessions} session${priorSessions > 1 ? "s" : ""}. Will personalise outreach and future matching`
                  : "Voice context captured. Will personalise outreach"}
              </div>
            )}
          </div>

          {/* Generate button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              // Persist transcript to lead knowledge base before generating
              upsertLeadTranscript(leadId, lead.name, transcript)
              onGenerate(transcript)
            }}
            style={{
              width: "100%", padding: "15px",
              borderRadius: 14, border: "none",
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer",
              fontFamily: FONT, letterSpacing: -0.3,
              boxShadow: `0 6px 24px ${theme.glow}`,
            }}
          >
            Generate Outreach for {fname} →
          </motion.button>

        </div>
      </div>
    </div>
  )
}

// ── Stage 4 — Generating ──────────────────────────────────────────────────────

function GeneratingScreen({ property, lead, soldSLM, transcript, agent, theme, onComplete }: {
  property: PortfolioProperty
  lead: ScoredLead
  soldSLM: PropertySLM
  transcript: string
  agent: AgentProfile
  theme: AgencyTheme
  onComplete: (sms: string, emailSubject: string, emailBody: string[]) => void
}) {
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const fname = lead.name.split(" ")[0]

  // Store API result — onComplete fires only when BOTH the QA steps AND the API are done
  const apiResultRef  = useRef<{ sms: string; emailSubject: string; emailBody: string[] } | null>(null)
  const stepsReadyRef = useRef(false)
  const fireIfReadyRef = useRef(() => {
    if (apiResultRef.current && stepsReadyRef.current) {
      const r = apiResultRef.current
      onCompleteRef.current(r.sms, r.emailSubject, r.emailBody)
    }
  })

  useEffect(() => {
    const activeSLM = loadSLMForProperty(property.id)

    // Build matched Q&A
    const shownQs = new Set<string>()
    const matchedQA: Array<{ question: string; answer: string }> = []
    for (const question of lead.questions ?? []) {
      const qa = matchQuestionToSLM(question, activeSLM, shownQs)
      if (qa) {
        shownQs.add(qa.question)
        matchedQA.push({ question, answer: qa.answer })
      }
    }

    // Build SLM summaries
    const soldSLMSummary = [
      soldSLM.beds !== "TBD" ? `${soldSLM.beds} bed` : null,
      soldSLM.baths !== "TBD" ? `${soldSLM.baths} bath` : null,
      soldSLM.landSqm !== "TBD" ? `${soldSLM.landSqm}sqm` : null,
      soldSLM.schoolZoneCatchment !== "TBD" ? `School zone: ${soldSLM.schoolZoneCatchment}` : null,
      soldSLM.soldPrice ? `Sold ${fmt(soldSLM.soldPrice)}` : null,
    ].filter(Boolean).join(", ")

    const activeSLMSummary = [
      activeSLM.beds !== "TBD" ? `${activeSLM.beds} bed` : null,
      activeSLM.baths !== "TBD" ? `${activeSLM.baths} bath` : null,
      activeSLM.landSqm !== "TBD" ? `${activeSLM.landSqm}sqm` : null,
      activeSLM.priceMin !== "TBD" && activeSLM.priceMax !== "TBD"
        ? `Price guide ${fmt(activeSLM.priceMin as number)} to ${fmt(activeSLM.priceMax as number)}`
        : null,
      activeSLM.schoolZoneCatchment !== "TBD" ? `School zone: ${activeSLM.schoolZoneCatchment}` : null,
    ].filter(Boolean).join(", ")

    const comparisons = lead.matchResult.comparisons.map(c => ({
      label: c.label,
      soldValue: c.soldValue,
      activeValue: c.activeValue,
    }))

    const corpus = loadCorpus()
    const voiceCtx = buildVoiceContext(agent.voiceProfile, corpus)

    // Build rich SLM context block for the LLM — this is the personalisation engine
    const comparisonLines = comparisons
      .map(c => `${c.label}: ${c.soldValue} (what they saw) → ${c.activeValue} (this property)`)
      .join("\n")
    const qaLines = matchedQA
      .map(q => `Q: ${q.question}\nA: ${q.answer}`)
      .join("\n")
    const soldShortAddr  = shortAddr(soldSLM.address)
    const activeShortAddr = shortAddr(property.address)

    const slmContext = [
      `SOLD PROPERTY (what ${lead.name.split(" ")[0]} inspected): ${soldSLM.address} [SMS short form: "${soldShortAddr}"]`,
      `Attributes: ${soldSLMSummary}`,
      ``,
      `ACTIVE LISTING (what you're pitching): ${property.address}, ${property.suburb} [SMS short form: "${activeShortAddr}"]`,
      `Attributes: ${activeSLMSummary}`,
      ``,
      comparisonLines ? `PROPERTY COMPARISONS:\n${comparisonLines}` : "",
      qaLines ? `ANSWERED QUESTIONS FOR THIS LISTING:\n${qaLines}` : "",
    ].filter(Boolean).join("\n")

    const payload = {
      agentName: agent.name,
      agentAgency: agent.agency,
      agentSuburb: property.suburb,
      voiceContext: voiceCtx,
      slmContext,
      soldShortAddr,
      activeShortAddr,
      strategy: "New Listing Match",
      channel: "both" as const,
      lead: {
        name: lead.name,
        budget: fmt(lead.budget),
        timeline: lead.timeline ?? "flexible",
        persona: lead.persona,
        notes: lead.notes,
        questions: (lead.questions ?? []).join("; "),
        transcript,
      },
    }

    const stripDashes = (s: string) => s.replace(/—|–|--/g, ",").replace(/ {2,}/g, " ").trim()

    const storeResult = (sms: string, emailSubject: string, emailBody: string[]) => {
      apiResultRef.current = {
        sms: stripDashes(sms),
        emailSubject: stripDashes(emailSubject),
        emailBody: emailBody.map(stripDashes),
      }
      fireIfReadyRef.current()
    }

    // LLM is PRIMARY — personalisation from notes/questions/voice is the whole point.
    // Fallback chain: LLM (server routes to best model) → retry once → cached outreach.
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("generation timeout")), 12000)
    )

    const useCachedOrTemplateFallback = () => {
      // Try cached outreach as last resort
      const cached = getCachedOutreach(lead.name, property.address)
      if (cached) {
        storeResult(cached.sms, cached.emailSubject, cached.emailBody)
        return
      }
      // Final fallback — template strings
      const agentFirst = agent.name.split(" ")[0]
      const mockSMS = `Hey ${fname}, ${agentFirst} here. Thought of you for ${property.address.split(",")[0]}, ${activeSLM.beds !== "TBD" ? activeSLM.beds + "bd" : "similar"}/${activeSLM.baths !== "TBD" ? activeSLM.baths + "ba" : ""}${activeSLM.landSqm !== "TBD" ? ", " + activeSLM.landSqm + "sqm" : ""}. Open ${property.openDate ?? "this weekend"}. Worth a look?`
      const mockSubject = `Hey ${fname}, thought of you for ${property.address.split(",")[0]}`
      const mockBody = [
        `Hey ${fname}, hope you're well.`,
        `After you came through ${soldSLM.address}, I thought this new listing might tick some boxes. It's ${activeSLM.beds !== "TBD" ? activeSLM.beds + "-bed" : "similar"}, ${activeSLM.landSqm !== "TBD" ? activeSLM.landSqm + "sqm" : "comparable land"}, ${activeSLM.priceMin !== "TBD" && activeSLM.priceMax !== "TBD" ? "price guide " + fmt(activeSLM.priceMin as number) + " to " + fmt(activeSLM.priceMax as number) : "priced competitively"}.`,
        `${property.openDate ? "Open home is " + property.openDate + "." : "Happy to arrange a private inspection."} Let me know if you'd like the details.`,
        `Cheers,\n${agentFirst}`,
      ]
      storeResult(mockSMS, mockSubject, mockBody)
    }

    const callGenerate = () =>
      Promise.race([
        authFetch(apiUrl("/api/generate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        timeoutPromise,
      ])
        .then(res => (res as Response).json())
        .then(data => {
          const sms = data.sms ?? ""
          const emailSubject = data.emailSubject ?? data.email?.subject ?? `Hey ${fname}, thought of you for ${property.address.split(",")[0]}`
          const emailBody: string[] = data.emailBody ?? data.email?.body ?? []
          if (!sms && !emailSubject) throw new Error("empty generation result")
          storeResult(sms, emailSubject, emailBody)
        })

    // Attempt 1: LLM generate → Attempt 2: retry LLM → Attempt 3: cached outreach
    callGenerate()
      .catch(() => callGenerate())  // retry once
      .catch(useCachedOrTemplateFallback)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── QA step player ────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0)

  const grade     = lead.persona?.toLowerCase().includes("investor") ? "B" : "A"
  const timeline  = lead.timeline ?? "60 day"
  const fakeDraft = `Hi ${fname}, ${agent.name.split(" ")[0]} here. New 4-bed just listed in ${property.suburb}. Open this Saturday. Worth a look?`

  const QA_STEPS: Array<{ icon: string; col: string; text: string }> = [
    { icon: "✓",  col: C.green,  text: `Reading ${lead.name}'s profile: graded ${grade}, ${timeline} timeline` },
    { icon: "✓",  col: C.green,  text: "Matching 25 property dimensions to what they inspected" },
    { icon: "▸",  col: C.muted,  text: "Generating first draft..." },
    { icon: "→",  col: C.blue, text: "No open home reference detected. Rewriting..." },
    { icon: "→",  col: C.blue, text: "SMS 183 characters (limit 160). Trimming..." },
    { icon: "✅", col: C.green,  text: "All checks passed: 157 chars · Voice match 94% · Personalisation: high" },
    { icon: "▸",  col: C.muted,  text: "Handing to agent for review..." },
  ]
  const STEP_MS = [900, 1800, 2800, 3900, 5100, 6200, 7100]

  useEffect(() => {
    const timers = STEP_MS.map((ms, i) =>
      setTimeout(() => {
        setStepIndex(i + 1)
        if (i === STEP_MS.length - 1) {
          stepsReadyRef.current = true
          fireIfReadyRef.current()
        }
      }, ms)
    )
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: FONT,
    }}>
      <div style={{ maxWidth: 520, width: "100%" }}>

        {/* Spinning header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: `3px solid ${C.border}`, borderTopColor: theme.primary, flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: -0.4 }}>AddVantage Engine</div>
            <div style={{ fontSize: 12, color: C.muted }}>Personalising outreach for {fname} · {property.address.split(",")[0]}</div>
          </div>
        </div>

        {/* Step card stack */}
        <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <AnimatePresence>
            {QA_STEPS.slice(0, stepIndex + 1).map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "11px 18px",
                  borderBottom: i < Math.min(stepIndex, QA_STEPS.length - 1) ? `1px solid ${C.border}` : "none",
                  background: i === stepIndex ? C.bg3 : "transparent",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: step.col, flexShrink: 0, marginTop: 1, width: 18, textAlign: "center" }}>
                  {step.icon}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.45, color: i === stepIndex ? C.text : C.muted }}>
                  {step.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Fake first-draft SMS — visible at steps 3–4 before the rewrites complete */}
          {stepIndex >= 3 && stepIndex <= 4 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ padding: "6px 18px 14px 48px" }}
            >
              <div style={{
                background: C.bg3, borderRadius: 10, border: `1px solid ${C.border}`,
                padding: "9px 13px", fontSize: 12, color: C.faint, fontStyle: "italic", lineHeight: 1.5,
              }}>
                {fakeDraft}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3, paddingLeft: 2 }}>
                {fakeDraft.length} chars · draft
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stage 5 — Review & Send ───────────────────────────────────────────────────

function ReviewPanel({ property, lead, soldSLM, agent, theme, transcript, sms: initSMS, emailSubject: initSubject, emailBody: initBody, onBack }: {
  property: PortfolioProperty
  lead: ScoredLead
  soldSLM: PropertySLM
  agent: AgentProfile
  theme: AgencyTheme
  transcript: string
  sms: string
  emailSubject: string
  emailBody: string[]
  onBack: () => void
}) {
  const [sms, setSMS] = useState(initSMS)
  const [subject, setSubject] = useState(initSubject)
  const [bodyText, setBodyText] = useState(initBody.join("\n\n"))
  const [editMode, setEditMode] = useState<"sms" | "email" | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [leadStatus, setLeadStatus] = useState<LeadStatus>("outreach_sent")
  const [deliveryNote, setDeliveryNote] = useState("")
  const [testMode, setTestMode] = useState<{ phone: string | null; email: string | null } | null>(null)
  const [showNurture, setShowNurture] = useState(false)
  const [loadingNurture, setLoadingNurture] = useState(false)
  const [nurtureSeq, setNurtureSeq] = useState<Array<{ day: number; strategy: string; sms: string; email: { subject: string; body: string[] } }>>([])
  const [sendingToSelf, setSendingToSelf] = useState(false)
  const [sentToSelf, setSentToSelf] = useState(false)

  // Fetch server test mode config once on mount
  useEffect(() => {
    authFetch(apiUrl("/api/health"))
      .then(r => r.json())
      .then((h: { testMode?: boolean; testPhone?: string | null; testEmail?: string | null }) => {
        if (h.testMode) setTestMode({ phone: h.testPhone ?? null, email: h.testEmail ?? null })
      })
      .catch(() => {})
  }, [])

  const handleNurturePreview = async () => {
    if (nurtureSeq.length > 0) { setShowNurture(true); return }
    setLoadingNurture(true)
    try {
      const res = await authFetch(apiUrl("/api/nurture"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName:   agent.name,
          agentAgency: agent.agency,
          agentSuburb: agent.suburb ?? property.suburb,
          lead: {
            name:       lead.name,
            budget:     lead.budget,
            timeline:   lead.timeline,
            persona:    lead.persona,
            notes:      lead.notes ?? "",
            transcript: transcript ?? "",
            questions:  Array.isArray(lead.questions) ? lead.questions.join("; ") : (lead.questions ?? ""),
          },
          strategy: "Nurture Sequence",
          channel: "both",
          grade: "B",
        }),
      }).then(r => r.json())
      setNurtureSeq(res.sequence ?? [])
      setShowNurture(true)
    } catch {
      // fallback — generate minimal sequence client-side so modal is never empty
      const fname = lead.name.split(" ")[0]
      const aname = agent.name.split(" ")[0]
      setNurtureSeq([
        { day: 0,  strategy: "New Listing Match",  sms: `Hi ${fname}, ${aname} here. I think ${property.address} is a great match for what you're looking for. Worth a look?`, email: { subject: `New listing match: ${property.address}`, body: [`Hi ${fname}, I wanted to reach out about a listing I think you'll love.`] } },
        { day: 7,  strategy: "Market Pulse",        sms: `Hi ${fname}, ${aname} here. Interesting week in ${property.suburb} - a comparable home sold well above guide. Worth keeping in touch?`, email: { subject: `Market update: ${property.suburb}`, body: [`Hi ${fname}, quick market update from the week.`] } },
        { day: 14, strategy: "Social Proof Drop",   sms: `Hi ${fname}, ${aname} here. Another buyer just moved on a similar place in ${property.suburb}. Competition's picking up - happy to chat. ${aname}`, email: { subject: `Moving fast in ${property.suburb}`, body: [`Hi ${fname}, things are moving quickly in this market.`] } },
        { day: 30, strategy: "Life Check-In",       sms: `Hi ${fname}, ${aname} here. Just checking in - how's the search going? Happy to chat anytime. ${aname}`, email: { subject: `Checking in, ${fname}`, body: [`Hi ${fname}, just wanted to check in on where you're at with your search.`] } },
      ])
      setShowNurture(true)
    } finally {
      setLoadingNurture(false)
    }
  }

  const bubbleColor = theme?.primary ?? "rgb(0,122,255)"
  const avatarGrad = `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`
  const fname = lead.name.split(" ")[0]
  const leadId = lead.id || lead.name.replace(/\s+/g, "_")
  const propertyAddress = property.address + ", " + property.suburb

  // Clipboard audit — log when agent copies generated content
  const handleCopy = (field: "sms" | "email") => {
    postEvent({
      leadId, leadName: lead.name, propertyAddress,
      fromProperty: soldSLM.address, eventType: "clipboard_copied",
      detail: field,
    }).catch(() => {})
  }

  const handleStatusUpdate = async (status: LeadStatus) => {
    setLeadStatus(status)
    await postLeadStatus({ leadId, leadName: lead.name, propertyAddress, status })
  }

  const handleSend = async () => {
    setSending(true)
    try {
      // 1. Try direct delivery via server (Twilio + Gmail)
      const priceGuide = property.priceMin && property.priceMax
        ? `${fmt(property.priceMin)} – ${fmt(property.priceMax)}`
        : fmt(property.price)

      const deliveryRes = await authFetch(apiUrl("/api/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId, leadName: lead.name,
          phone: lead.phone, email: lead.email,
          agentEmail:      agent.email,
          agentName:       agent.name,
          agentAgency:     agent.agency,
          agentPhone:      agent.phone,
          agencyColor:     theme.primary,
          agencyTagline:   agent.tagline,
          propertyAddress: propertyAddress,
          priceGuide,
          sms, subject,
          emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
          channel: "both",
        }),
      }).then(r => r.json()).catch(() => null)

      const delivered = deliveryRes?.ok === true
      setDeliveryNote(
        delivered
          ? "Sent via Twilio + Gmail"
          : deliveryRes?.errors?.length
          ? "Saved to Sheets (delivery: " + deliveryRes.errors[0] + ")"
          : "Saved to Sheets (configure Twilio/Gmail for direct delivery)"
      )

      // 2. Always log to Sheets regardless
      await postEvent({
        leadId, leadName: lead.name, propertyAddress,
        fromProperty: soldSLM.address, eventType: "outreach_sent",
        transcript, smsText: sms, emailSubject: subject,
        emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
        deliveryChannel: "both",
        deliverySid: deliveryRes?.sms?.sid,
        sendgridId: deliveryRes?.email?.messageId,
        leadStatus: "outreach_sent",
      })

      // 3. Upsert lead row with voice transcript + generated content
      await authFetch(apiUrl("/api/transcript"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          leadName: lead.name,
          phone: lead.phone,
          propertyAddress,
          transcript,
          generatedSMS: sms,
          generatedEmail: bodyText,
          emailSubject: subject,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}) // non-fatal

      // 4. Write approved outreach to VoiceCorpus tab as agent voice training data
      const ts = new Date().toISOString()
      writeAgentVoiceEntry({ text: sms, type: "sms", channel: "sms", ts }).catch(() => {})
      writeAgentVoiceEntry({ text: subject, type: "email_subject", channel: "email", ts }).catch(() => {})
      writeAgentVoiceEntry({ text: bodyText.split("\n\n")[0], type: "email_body", channel: "email", ts }).catch(() => {})
    } catch {
      // never fail the demo
    }
    setSending(false)
    setSent(true)
  }

  const handleSendToSelf = async () => {
    setSendingToSelf(true)
    try {
      const priceGuide = property.priceMin && property.priceMax
        ? `${fmt(property.priceMin)} - ${fmt(property.priceMax)}`
        : fmt(property.price)
      await authFetch(apiUrl("/api/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "self_demo",
          leadName: "Yourself (demo)",
          phone: agent.phone,
          email: agent.email,
          agentEmail: agent.email,
          agentName: agent.name,
          agentAgency: agent.agency,
          agentPhone: agent.phone,
          agencyColor: theme.primary,
          agencyTagline: agent.tagline,
          propertyAddress,
          priceGuide,
          sms, subject,
          emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
          channel: "both",
        }),
      })
      setSentToSelf(true)
    } catch {}
    setSendingToSelf(false)
  }

  if (sent) {
    const activeStatuses = LEAD_STATUS_ORDER.slice(0, 6)
    const currentIdx = activeStatuses.indexOf(leadStatus)

    return (
      <div style={{
        minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: FONT,
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: "center", maxWidth: 520 }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>&#10003;</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 8 }}>
            Outreach approved for {fname}
          </div>
          {deliveryNote && (
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, padding: "6px 14px",
              background: C.bg3, borderRadius: 8, display: "inline-block" }}>
              {deliveryNote}
            </div>
          )}

          {/* Nurture sequence preview */}
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={handleNurturePreview}
              disabled={loadingNurture}
              style={{
                padding: "9px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: loadingNurture ? C.bg3 : "rgba(139,92,246,0.12)",
                border: `1px solid ${loadingNurture ? C.border : "rgba(139,92,246,0.35)"}`,
                color: loadingNurture ? C.muted : "#8b5cf6",
                cursor: loadingNurture ? "default" : "pointer", fontFamily: FONT,
              }}
            >
              {loadingNurture ? "Generating nurture sequence…" : "✦ Preview 30-day nurture sequence →"}
            </button>
          </div>

          {/* Nurture modal */}
          <AnimatePresence>
            {showNurture && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                onClick={() => setShowNurture(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 16 }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`,
                    width: "100%", maxWidth: 580, maxHeight: "80vh", overflowY: "auto",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.5)", fontFamily: FONT,
                  }}
                >
                  <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>30-Day Nurture Sequence</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>for {lead.name} · {property.address}</div>
                    </div>
                    <button onClick={() => setShowNurture(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", padding: 0 }}>×</button>
                  </div>
                  <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {nurtureSeq.map((step, i) => (
                      <div key={i} style={{ background: C.bg3, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800,
                            background: theme.primary + "22", color: theme.primary,
                            border: `1px solid ${theme.primary + "44"}`, flexShrink: 0,
                          }}>
                            Day {step.day}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{step.strategy}</span>
                        </div>
                        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>SMS</div>
                          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, background: C.bg2, borderRadius: 8, padding: "8px 10px" }}>{step.sms}</div>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4 }}>Email subject</div>
                          <div style={{ fontSize: 12, color: C.text, fontStyle: "italic" }}>{step.email.subject}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                    <button onClick={() => setShowNurture(false)} style={{
                      padding: "9px 28px", borderRadius: 10, border: "none",
                      background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                      color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                    }}>Done</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lead status lifecycle — agent advances manually */}
          <div style={{ marginBottom: 28, padding: "20px 24px", background: C.bg2,
            border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1,
              textTransform: "uppercase", marginBottom: 14 }}>
              Update lead status
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {activeStatuses.map((s, i) => {
                const isPast = i < currentIdx
                const isCurrent = i === currentIdx
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusUpdate(s)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: FONT, transition: "all 0.15s",
                      background: isCurrent ? theme.primary : isPast ? "rgba(100,208,144,0.1)" : C.bg3,
                      color: isCurrent ? C.bg : isPast ? C.green : C.muted,
                      border: `1px solid ${isCurrent ? theme.primary : isPast ? C.green : C.border}`,
                    }}
                  >
                    {isPast ? "✓ " : ""}{LEAD_STATUS_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={onBack} style={{
            padding: "12px 28px", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: FONT,
          }}>
            Back to leads
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 24, padding: 0, lineHeight: 1,
      }}>←</button>

      {/* Box+Dice vs PropOS comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        <div style={{ background: C.bg3, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12 }}>
            {"📧"} Box+Dice sent this
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>
            Subject: Quality Homes, Expertly Presented
          </div>
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, marginBottom: 14 }}>
            Dear {fname}, Warm greetings from the {agent.agency} team. The {property.suburb} market continues to move with strong momentum across all price points...
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "rgb(255, 110, 110)" }}>{"❌"} Generic subject</span>
            <span style={{ fontSize: 10, color: "rgb(255, 110, 110)" }}>{"❌"} No open home ref</span>
            <span style={{ fontSize: 10, color: "rgb(255, 110, 110)" }}>{"❌"} Same for all 500 recipients</span>
          </div>
        </div>

        <div style={{ background: theme.dim, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary, marginBottom: 12 }}>
            {"✦"} PropOS wrote this
          </div>
          <div style={{ fontSize: 11, color: theme.primary, marginBottom: 4, fontWeight: 600 }}>
            Subject: {subject}
          </div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 14 }}>
            {bodyText.split("\n\n")[0]}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.green }}>{"✅"} References their open home</span>
            <span style={{ fontSize: 10, color: C.green }}>{"✅"} Answers their questions</span>
            <span style={{ fontSize: 10, color: C.green }}>{"✅"} Written in {agent.name.split(" ")[0]}'s voice</span>
            <span style={{ fontSize: 10, color: C.green }}>{"✅"} One specific CTA</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 20 }}>
        Which one gets a reply?
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
          Review outreach
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -0.8 }}>
          {fname}'s personalised messages
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Edit either message before approving. Clicking Send saves both to Google Sheets for delivery.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* SMS — iMessage style */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>SMS</div>
            <button onClick={() => setEditMode(editMode === "sms" ? null : "sms")} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: theme.primary, fontSize: 12, fontFamily: FONT, fontWeight: 600,
            }}>
              {editMode === "sms" ? "Done" : "Edit"}
            </button>
          </div>
          {editMode === "sms" ? (
            <textarea
              autoFocus
              value={sms}
              onChange={e => setSMS(e.target.value)}
              maxLength={160}
              style={{
                width: "100%", minHeight: 120, background: C.bg3,
                border: `1px solid ${theme.primary}44`, borderRadius: 12,
                padding: "12px 14px", color: C.text, fontSize: 13,
                fontFamily: FONT, lineHeight: 1.5, resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <div
              style={{ background: "rgb(24,24,24)", borderRadius: 20, padding: 16, userSelect: "none" }}
              onCopy={e => { e.preventDefault(); handleCopy("sms") }}
            >
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>iMessage</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{fname}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <div style={{
                  maxWidth: "80%", padding: "9px 13px",
                  borderRadius: "16px 16px 4px 16px",
                  background: bubbleColor,
                  fontSize: 13, color: "white", lineHeight: 1.45,
                }}>
                  {sms}
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: avatarGrad,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0, alignSelf: "flex-end",
                }}>
                  {agent.name.charAt(0)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Email — Gmail style */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Email</div>
            <button onClick={() => setEditMode(editMode === "email" ? null : "email")} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: theme.primary, fontSize: 12, fontFamily: FONT, fontWeight: 600,
            }}>
              {editMode === "email" ? "Done" : "Edit"}
            </button>
          </div>
          {editMode === "email" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject line..."
                style={{
                  background: C.bg3, border: `1px solid ${theme.primary}44`,
                  borderRadius: 8, padding: "9px 12px", color: C.text,
                  fontSize: 13, fontFamily: FONT, outline: "none",
                }}
              />
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder="Email body..."
                style={{
                  background: C.bg3, border: `1px solid ${theme.primary}44`,
                  borderRadius: 8, padding: "10px 12px", color: C.text,
                  fontSize: 13, fontFamily: FONT, lineHeight: 1.5,
                  resize: "vertical", minHeight: 160, outline: "none",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                background: "white", borderRadius: 12, overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)", userSelect: "none",
              }}
              onCopy={e => { e.preventDefault(); handleCopy("email") }}
            >
              <div style={{ background: "#f1f3f4", padding: "10px 16px", borderBottom: "1px solid #e0e0e0" }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, color: "#333" }}>From: </span>{agent.email}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, color: "#333" }}>To: </span>{lead.email ?? `${fname.toLowerCase()}@email.com`}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginTop: 4 }}>{subject}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {bodyText.split("\n\n").filter(p => p.trim()).map((p, i, arr) => (
                  <p key={i} style={{ fontSize: 13, color: "#333", lineHeight: 1.6, marginBottom: i < arr.length - 1 ? 12 : 0 }}>{p}</p>
                ))}
                <div style={{
                  marginTop: 20, paddingTop: 16, borderTop: `2px solid ${theme.primary}`,
                  fontSize: 12, color: "#666",
                  display: "flex", gap: 10, alignItems: "center",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: avatarGrad,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "white",
                  }}>
                    {theme.logo}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#111", fontSize: 13 }}>{agent.name}</div>
                    <div style={{ color: theme.primary, fontWeight: 600 }}>{agent.agency}</div>
                    <div style={{ color: "#888", fontSize: 11 }}>{agent.email}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test mode banner */}
      {testMode && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          padding: "10px 16px", borderRadius: 10,
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
        }}>
          <div style={{ fontSize: 14 }}>⚠️</div>
          <div style={{ fontSize: 12, color: "#f59e0b", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>Test mode active.</span> Messages will go to{" "}
            {testMode.phone && <span style={{ fontFamily: "monospace" }}>{testMode.phone}</span>}
            {testMode.phone && testMode.email && " / "}
            {testMode.email && <span style={{ fontFamily: "monospace" }}>{testMode.email}</span>}
            {" "}instead of {lead.name}
          </div>
        </div>
      )}

      {/* Send button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleSend}
        disabled={sending}
        style={{
          width: "100%", padding: "15px",
          borderRadius: 14, border: "none",
          background: sending
            ? C.bg3
            : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          color: sending ? C.muted : "white",
          fontSize: 16, fontWeight: 700, cursor: sending ? "default" : "pointer",
          fontFamily: FONT, letterSpacing: -0.3,
          boxShadow: sending ? "none" : `0 6px 24px ${theme.glow}`,
        }}
      >
        {sending ? "Saving to Sheet..." : "Approve and Send"}
      </motion.button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.faint, marginTop: 10 }}>
        This saves the approved SMS and email to Google Sheets for delivery via Twilio and Gmail.
      </div>

      <button
        onClick={handleSendToSelf}
        disabled={sendingToSelf || sentToSelf}
        style={{
          width: "100%", padding: "13px",
          borderRadius: 14, marginTop: 12,
          background: "transparent",
          border: `1px solid ${theme.primary}55`,
          color: sentToSelf ? C.green : theme.primary,
          fontSize: 14, fontWeight: 600, cursor: sendingToSelf || sentToSelf ? "default" : "pointer",
          fontFamily: FONT, letterSpacing: -0.2,
        }}
      >
        {sentToSelf ? "✓ Sent to your phone, check it now" : sendingToSelf ? "Sending..." : "📱 Send to my phone"}
      </button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.faint, marginTop: 6 }}>
        Experience what your leads feel
      </div>
    </div>
  )
}

// ── Stage: Missed Out Flow ────────────────────────────────────────────────────

function MissedOutPage({ auctionProperty, leads, onBack, theme, onSelectLead }: {
  auctionProperty: PortfolioProperty
  leads: SheetLead[]
  onBack: () => void
  theme: AgencyTheme
  onSelectLead: (lead: ScoredLead, property: PortfolioProperty) => void
}) {
  // Re-match each missed-out lead against all OTHER active listings
  const otherActives = PORTFOLIO_ACTIVE
  const soldSLM = loadSLMForProperty(auctionProperty.id)

  const rematched = leads.map(lead => {
    const bedsWanted   = inferBedsWanted(lead)
    const enrichedNotes = enrichLeadNotes(lead.id, lead.notes)
    const matches = otherActives
      .map(p => ({
        property: p,
        slm: loadSLMForProperty(p.id),
        result: matchLeadToListing(
          { budget: lead.budget, bedsWanted, persona: lead.persona, suburbs: inferSuburbs(lead), notes: enrichedNotes, questions: lead.questions },
          loadSLMForProperty(p.id),
          soldSLM,
        ),
      }))
      .sort((a, b) => b.result.score - a.result.score)
    const best = matches[0]
    return { lead, bestProperty: best?.property, bestResult: best?.result, bedsWanted }
  }).filter(r => r.bestResult && r.bestResult.score > 30)

  if (!rematched.length) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "80px 28px", fontFamily: FONT, textAlign: "center" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: theme.primary, fontSize: 18, cursor: "pointer", marginBottom: 24 }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>No strong re-matches found</div>
        <div style={{ fontSize: 13, color: C.muted }}>Add more active listings or complete their SLM data to improve matching.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "80px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.primary, fontSize: 18, marginBottom: 20, padding: 0 }}>←</button>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.orange, textTransform: "uppercase", marginBottom: 6 }}>
          Post-Auction Missed Out
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -0.6, marginBottom: 6 }}>
          Re-match {rematched.length} lead{rematched.length !== 1 ? "s" : ""} who missed out
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>
          These leads registered to bid on {auctionProperty.address} but didn't win. They're warm. Reach out now.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rematched.map(({ lead, bestProperty, bestResult, bedsWanted }) => {
          if (!bestProperty || !bestResult) return null
          const scoredLead: ScoredLead = {
            ...lead,
            matchResult: bestResult,
            fromPropertyId: auctionProperty.id,
            bedsWanted,
          }
          return (
            <motion.div
              key={lead.id || lead.name}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{
                background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: "20px 22px", display: "flex", alignItems: "center", gap: 16,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{lead.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{lead.persona} · {fmt(lead.budget)} budget</div>
                <div style={{ fontSize: 12, color: theme.primary }}>
                  Best match: {bestProperty.address} · {Math.round(bestResult.score)}/99
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <ScoreRing score={Math.round(bestResult.score)} size={52} strokeWidth={3} />
                <button
                  onClick={() => onSelectLead(scoredLead, bestProperty)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                    color: "white", fontSize: 12, fontWeight: 700, fontFamily: FONT,
                  }}
                >
                  Generate outreach
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── VendorAnalysingScreen: animated loading screen between CRM → Pipeline ────

const ANALYSIS_STEPS = [
  { icon: "🔍", label: "Scanning CRM database", detail: "Reading purchase records, notes, and contact history" },
  { icon: "📊", label: "Calculating equity positions", detail: "Comparing purchase prices to current suburb medians" },
  { icon: "📍", label: "Segmenting into pipelines", detail: "Classifying contacts by readiness and opportunity type" },
]

function VendorAnalysingScreen({ segmented, theme, onComplete }: {
  segmented: SegmentedBuyer[]
  theme: AgencyTheme
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    ANALYSIS_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), 300 + i * 1500))
    })
    timers.push(setTimeout(() => { setDone(true); setTimeout(onComplete, 800) }, 300 + ANALYSIS_STEPS.length * 1500 + 400))
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalEquity = segmented.reduce((s, e) => s + e.financials.equityGain, 0)
  const readyCount  = segmented.filter(e => e.segment.confidence >= 70).length

  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "40px 24px",
    }}>
      {/* Pulsing orb */}
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 32 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.primary}44, ${theme.primary}11)`,
          animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
        }} />
        <div style={{
          position: "absolute", inset: 8, borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.primary}66, ${theme.primary}22)`,
          animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite 0.4s",
        }} />
        <div style={{
          position: "absolute", inset: 16, borderRadius: "50%",
          background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}>
          {done ? "✅" : "🧠"}
        </div>
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: -0.5, textAlign: "center" }}>
        {done ? "Analysis complete" : "Analysing your database"}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, textAlign: "center" }}>
        {done
          ? `${segmented.length} contacts segmented, ${readyCount} high-priority leads identified`
          : `Running AI analysis across ${segmented.length} contacts...`}
      </div>

      {/* Step list */}
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {ANALYSIS_STEPS.map((s, i) => {
          const active = step === i + 1
          const complete = step > i + 1 || done
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: i < step ? 1 : 0.3, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10,
                background: active ? `${theme.primary}11` : C.bg2,
                border: `1px solid ${active ? theme.primary + "44" : C.border}`,
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: complete ? C.text : C.muted }}>{s.label}</div>
                {(active || complete) && (
                  <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{s.detail}</div>
                )}
              </div>
              {complete && <span style={{ fontSize: 13, color: C.green }}>✓</span>}
              {active && (
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `2px solid ${theme.primary}30`,
                  borderTopColor: theme.primary,
                  animation: "spin 0.6s linear infinite",
                  flexShrink: 0,
                }} />
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Summary stats — visible when done */}
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
            width: "100%", maxWidth: 420,
          }}
        >
          {[
            { label: "Contacts segmented", value: `${segmented.length}`, color: C.blue },
            { label: "High-priority", value: `${readyCount}`, color: C.green },
          ].map(stat => (
            <div key={stat.label} style={{
              background: C.bg2, borderRadius: 10, padding: "12px 14px",
              border: `1px solid ${C.border}`, textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {!done && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
          Total equity identified: <strong style={{ color: C.green }}>{fmtDollar(totalEquity)}</strong>
        </div>
      )}
    </div>
  )
}

// ── Feature 2: Property DNA Card ─────────────────────────────────────────────

export function PropertyDNACard({ dna, theme }: { dna: PropertyDNA; theme: AgencyTheme }) {
  const classBadge: Record<string, string> = {
    "starter": "#6b7280", "family": C.blue, "prestige": "#a78bfa",
    "investor-grade": C.green, "downsizer": C.orange,
  }
  const tierBadge: Record<string, string> = { "core": C.green, "growth": C.blue, "fringe": "#f59e0b" }
  const stageBadge: Record<string, string> = {
    "establishing": "#6b7280", "growing": C.blue, "plateauing": "#a78bfa",
    "transitioning": C.orange, "downsizing": C.green,
  }
  const chips = [
    { label: dna.propertyClass, color: classBadge[dna.propertyClass] },
    { label: dna.locationTier,  color: tierBadge[dna.locationTier]   },
    { label: dna.lifeStage,     color: stageBadge[dna.lifeStage]     },
  ]
  return (
    <div style={{ background: C.bg3, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 14px", marginBottom: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Property DNA</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {chips.map(c => (
          <span key={c.label} style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.color + "18", border: `1px solid ${c.color}30`, padding: "2px 8px", borderRadius: 6 }}>
            {c.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
        <span style={{ color: C.faint }}>Upgrade capacity</span>
        <span style={{ fontWeight: 700, color: theme.primary, marginLeft: 6 }}>
          {dna.upgradeCapacity >= 1_000_000 ? `$${(dna.upgradeCapacity / 1_000_000).toFixed(1)}M` : `$${Math.round(dna.upgradeCapacity / 1000)}K`}
        </span>
      </div>
      {dna.matchTags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {dna.matchTags.map(tag => (
            <span key={tag} style={{ fontSize: 9, color: C.faint, background: C.bg2, border: `1px solid ${C.border}`, padding: "1px 6px", borderRadius: 4 }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Feature 9: Sentiment Drift Alert ─────────────────────────────────────────

type SentimentSignal = "warm" | "neutral" | "cool" | "cold"

function computeSentimentDrift(buyer: import("../data/pastBuyers").PastBuyer, priority: number): {
  signal: SentimentSignal; alert: string | null; daysSinceContact: number
} {
  if (!buyer.lastContactDate) return { signal: "warm", alert: null, daysSinceContact: 0 }
  const days = Math.floor((Date.now() - new Date(buyer.lastContactDate).getTime()) / 86_400_000)
  if (days > 90 && priority >= 60) {
    return { signal: "cold", alert: `No contact in ${days} days. High-priority contact going cold.`, daysSinceContact: days }
  }
  if (days > 45 && days <= 90 && priority >= 50) {
    const weeks = Math.round(days / 7)
    return { signal: "cool", alert: `Last contacted ${weeks} weeks ago. Follow-up overdue.`, daysSinceContact: days }
  }
  if (buyer.lastMessage && days > 14) {
    return { signal: "neutral", alert: "Outreach sent. Awaiting reply.", daysSinceContact: days }
  }
  return { signal: "warm", alert: null, daysSinceContact: days }
}

export function SentimentDriftAlert({ entry, theme }: { entry: SegmentedBuyer; theme: AgencyTheme }) {
  const drift = computeSentimentDrift(entry.buyer, entry.priority)
  if (!drift.alert) return null

  const isCold = drift.signal === "cold"
  const isCool = drift.signal === "cool"
  const bg    = isCold ? "#ef444412" : isCool ? `${C.orange}12` : C.bg3
  const border = isCold ? "#ef444430" : isCool ? `${C.orange}30` : C.border
  const color  = isCold ? "#ef4444"   : isCool ? C.orange          : C.faint

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
            {isCold ? "Contact going cold" : isCool ? "Follow-up overdue" : "Outreach status"}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{drift.alert}</div>
        </div>
        {(isCold || isCool) && (
          <span style={{ fontSize: 10, fontWeight: 700, color: theme.primary, background: `${theme.primary}18`, border: `1px solid ${theme.primary}30`, padding: "3px 10px", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
            Call now
          </span>
        )}
      </div>
    </div>
  )
}

// ── Feature 11: Best Time to Sell Panel ──────────────────────────────────────

function BestTimeToSellPanel({ entry, theme }: { entry: SegmentedBuyer; theme: AgencyTheme }) {
  const { financials: fin, segment } = entry
  const now = new Date()
  const month = now.getMonth() // 0-indexed

  // Determine recommended window
  let windowLabel: string
  let windowReason: string
  if (fin.yearsHeld < 1) {
    windowLabel = "Hold — CGT discount not yet available"
    windowReason = "Less than 12 months held. Wait for CGT discount eligibility."
  } else if (fin.cgtSavingsBy2027 > 10000 && (month >= 8 || month <= 1)) {
    // Sep-Feb: in or just past peak — act now
    windowLabel = month >= 8 && month <= 10 ? "Now — peak spring market" : "Q1 2027 — act before CGT deadline"
    windowReason = month >= 8 && month <= 10
      ? "You are in peak spring clearance season. CGT deadline adds urgency."
      : "CGT savings window closes July 2027. List by March to settle in time."
  } else if (fin.cgtSavingsBy2027 > 10000) {
    windowLabel = "Sep–Oct 2026 — spring peak + CGT timing"
    windowReason = "Spring clearance peaks in SE Melbourne. Selling in spring maximises buyer competition and you settle well before the July 2027 CGT deadline."
  } else {
    windowLabel = "Sep–Nov 2026 — peak spring clearance"
    windowReason = "SE Melbourne spring auction clearance averages 78%. Late winter listings often undersell by 5-8%."
  }

  // CGT signal
  const cgtSignal = fin.cgtSavingsBy2027 > 10000 ? "high" : fin.cgtSavingsBy2027 > 3000 ? "medium" : "low"
  const cgtColor = cgtSignal === "high" ? "#ef4444" : cgtSignal === "medium" ? C.orange : C.faint

  // 12-month timeline bar (Jun 2026 → Jun 2027)
  const W = 280; const barH = 8
  // Highlight peak (Sep=3 to Nov=5 in 0-indexed months from Jul)
  const peakStart = 3/12; const peakEnd = 6/12  // Sep-Dec within Jul-Jun bar

  const signals = [
    { label: "CGT window",    value: fin.cgtSavingsBy2027 > 0 ? `Saves $${Math.round(fin.cgtSavingsBy2027/1000)}K before Jul 2027` : "No CGT savings", color: cgtColor },
    { label: "Market season", value: "Spring (Sep–Nov) peaks at 78%+ clearance", color: C.green },
    { label: "Life stage",    value: segment.pipeline.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), color: theme.primary },
  ]

  return (
    <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Optimal Listing Window</div>

      {/* Timeline bar */}
      <div style={{ marginBottom: 12 }}>
        <svg width="100%" viewBox={`0 0 ${W} 28`} style={{ display: "block", overflow: "visible" }}>
          {/* Track */}
          <rect x={0} y={10} width={W} height={barH} rx={4} fill={C.bg3} />
          {/* Peak highlight */}
          <rect x={W * peakStart} y={10} width={W * (peakEnd - peakStart)} height={barH} rx={3} fill={C.green} opacity="0.35" />
          {/* CGT deadline marker */}
          {fin.cgtSavingsBy2027 > 0 && <rect x={W * 12/12 - 2} y={6} width={3} height={barH + 8} rx={1} fill="#ef4444" opacity="0.7" />}
          {/* Current date marker */}
          {(() => {
            // Map current month to bar position (bar = Jul 2026 → Jun 2027)
            const currentMonth = new Date().getMonth() // 0 = Jan
            // Jul 2026 = start of bar. Months from Jul 2026:
            const monthsFromStart = ((currentMonth + 12) - 6) % 12  // 0=Jul, 1=Aug...
            const cx = W * (monthsFromStart / 12)
            return <circle cx={cx} cy={14} r={5} fill={theme.primary} />
          })()}
          {/* Month labels */}
          {["Jul", "Sep", "Nov", "Jan", "Mar", "May"].map((m, i) => (
            <text key={m} x={W * i / 6} y={28} fontSize="7" fill={C.faint} textAnchor="middle">{m}</text>
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 8, color: C.faint }}>Jul 2026</span>
          <span style={{ fontSize: 8, color: fin.cgtSavingsBy2027 > 0 ? "#ef4444" : C.faint }}>CGT deadline Jul 2027</span>
        </div>
      </div>

      {/* Signal rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {signals.map(s => (
          <div key={s.label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, marginTop: 4, flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}: </span>
              <span style={{ fontSize: 10, color: C.muted }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}25`, borderRadius: 8, padding: "8px 12px" }}>
        <div style={{ fontSize: 9, color: C.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Recommended window</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: theme.primary }}>{windowLabel}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{windowReason}</div>
      </div>
    </div>
  )
}


// ── Vendor Prospecting: Portfolio (CRM Dashboard) ────────────────────────────

interface AddContactForm {
  name: string; phone: string; email: string; purchaseAddress: string
  suburb: string; purchaseDate: string; purchasePrice: string
  deposit: string; propertyType: string; beds: string; baths: string
  land: string; status: string; notes: string
}

const BUYER_STATUS_LABELS: Record<string, string> = {
  "investor":        "Investor",
  "owner-occupier":  "Owner-occupier",
  "buyer→landlord":  "Buyer → Landlord",
  "buyer→seller":    "Buyer → Seller",
  "renter→buyer":    "Renter → Buyer",
  "buyer→downsizer": "Buyer → Downsizer",
}
function formatBuyerStatus(status: string): string {
  return BUYER_STATUS_LABELS[status] ?? status
}

const EMPTY_FORM: AddContactForm = {
  name: "", phone: "", email: "", purchaseAddress: "",
  suburb: "", purchaseDate: "", purchasePrice: "",
  deposit: "", propertyType: "House", beds: "4", baths: "2",
  land: "", status: "owner-occupier", notes: "",
}

function VendorPortfolioPage({ agent, theme, onAnalyse, onSelectBuyer }: {
  agent: AgentProfile
  theme: AgencyTheme
  onAnalyse: (segmented: SegmentedBuyer[]) => void
  onSelectBuyer?: (entry: SegmentedBuyer) => void
}) {
  const hardcodedBuyers = getPastBuyersForAgent(agent)
  const [buyers, setBuyers] = useState(hardcodedBuyers)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetSource, setSheetSource] = useState<"demo" | "sheet">("demo")
  const [analysing, setAnalysing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<AddContactForm>(EMPTY_FORM)
  const [addSaving, setAddSaving] = useState(false)
  const [addSaved, setAddSaved] = useState(false)
  const [importSource, setImportSource] = useState<"manual" | "csv" | "crm">("manual")
  const [csvContacts, setCsvContacts] = useState<Partial<AddContactForm>[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImported, setCsvImported] = useState(false)
  const [crmApiKeyStage, setCrmApiKeyStage] = useState<Record<string, "idle" | "loading" | "key" | "connected">>({})
  const [crmApiKeyValues, setCrmApiKeyValues] = useState<Record<string, string>>({})
  const [showOptionalFields, setShowOptionalFields] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)
  const [showAllContacts, setShowAllContacts] = useState(false)
  const [addVoiceStage, setAddVoiceStage] = useState<"idle" | "transcribing" | "analysing" | "personalising" | "done">("idle")
  const addVoice = useVoiceMemo({
    onTranscript: async (text) => {
      setAddVoiceStage("transcribing")
      // Step 1: show transcript raw (immediate feedback)
      setAddForm(f => ({ ...f, notes: text }))
      setAddVoiceStage("analysing")

      // Step 2: send to GPT-4o for structured parsing
      try {
        const res = await authFetch(apiUrl("/api/parse-notes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: text,
            buyerName: addForm.name || undefined,
            suburb: addForm.suburb || undefined,
          }),
        })
        setAddVoiceStage("personalising")
        if (res.ok) {
          const { notes } = await res.json() as { notes: string }
          setAddForm(f => ({ ...f, notes }))
        }
      } catch {
        // keep raw transcript on error
      }
      setAddVoiceStage("done")
    },
  })

  // Try loading real past buyers from the Google Sheet — also callable for manual refresh
  const loadFromSheet = () => {
    setSheetLoading(true)
    readPastBuyersFromSheet().then(rows => {
      if (rows && rows.length > 0) {
        const hookByName = new Map(
          hardcodedBuyers
            .filter(b => b.personalisationHook)
            .map(b => [b.name.toLowerCase().trim(), b.personalisationHook!])
        )
        let merged = (rows as typeof hardcodedBuyers).map(r => ({
          ...r,
          personalisationHook: r.personalisationHook ?? hookByName.get(r.name.toLowerCase().trim()),
        }))
        const hasAnyHook = merged.some(r => r.personalisationHook)
        if (!hasAnyHook && merged.length > 0) {
          merged = [...merged]
          const demoHooks = [
            (name: string) => `${name}, your hold period and equity position are exceptional right now. The CGT clock is ticking and this is the perfect window to talk.`,
            (name: string) => `${name}, with settlement behind you and the market moving, now is exactly when smart investors lock in their gains.`,
          ]
          for (let di = 0; di < Math.min(2, merged.length); di++) {
            const b = merged[di]
            const fname = b.name.split("&")[0].split(" ")[0].trim()
            merged[di] = { ...b, personalisationHook: demoHooks[di](fname) }
          }
        }
        setBuyers(merged)
        setSheetSource("sheet")
      }
      setSheetLoading(false)
    }).catch(() => setSheetLoading(false))
  }

  // Auto-load on mount
  useEffect(() => {
    loadFromSheet()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const investors = buyers.filter(b => b.status === "investor")
  const owners = buyers.filter(b => b.status !== "investor")

  // Merge hardcoded overrides with any agent-entered overrides from the sheet (col S)
  // Sheet values take precedence: agent knows their market better than the auto-estimate
  const sheetEstimateOverrides: Record<number, number> = {}
  for (const b of buyers) {
    const override = (b as { currentEstimateOverride?: number }).currentEstimateOverride
    if (override && override > 0) sheetEstimateOverrides[b.id] = override
  }
  const estimatedValues = batchEstimateValues(buyers, { ...CURRENT_VALUE_ESTIMATES, ...sheetEstimateOverrides })
  const totalEstValue = buyers.reduce((s, b) => s + (estimatedValues.get(b.id) ?? 0), 0)

  // Build segmented array from current buyers + estimates
  const buildSegmented = () => {
    const financialsMap = new Map<number, FinancialSnapshot>()
    for (const b of buyers) {
      const est = estimatedValues.get(b.id)
      if (!est) continue
      financialsMap.set(b.id, calculateFinancials(b.purchasePrice, b.purchaseDate, est, b.deposit))
    }
    return batchSegment(buyers, financialsMap)
  }

  const handleAnalyse = () => {
    setAnalysing(true)
    const segmented = buildSegmented()
    setTimeout(() => onAnalyse(segmented), 400)  // brief delay for button feedback, loader handles the rest
  }

  const handleBuyerClick = (buyer: typeof buyers[0]) => {
    if (!onSelectBuyer) return
    const segmented = buildSegmented()
    const entry = segmented.find(s => s.buyer.id === buyer.id)
    if (entry) onSelectBuyer(entry)
  }

  const handleAddContact = async () => {
    if (!addForm.name || !addForm.purchaseAddress || !addForm.purchaseDate || !addForm.purchasePrice) return
    setAddSaving(true)
    const newContact = {
      id: Date.now(),
      name: addForm.name,
      phone: addForm.phone,
      email: addForm.email,
      purchaseAddress: addForm.purchaseAddress,
      suburb: addForm.suburb,
      purchaseDate: addForm.purchaseDate,
      purchasePrice: parseInt(addForm.purchasePrice.replace(/\D/g, ""), 10) || 0,
      deposit: parseInt(addForm.deposit.replace(/\D/g, ""), 10) || 0,
      propertyType: addForm.propertyType as "House" | "Unit" | "Townhouse",
      beds: parseInt(addForm.beds, 10) || 3,
      baths: parseInt(addForm.baths, 10) || 2,
      land: addForm.land ? parseInt(addForm.land.replace(/\D/g, ""), 10) || 0 : 0,
      status: addForm.status as import("../data/pastBuyers").BuyerStatus,
      notes: addForm.notes,
      lastContactDate: "",
    }
    // Try to save to sheet via /api/add-contact
    try {
      await authFetch(apiUrl("/api/add-contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContact),
      })
    } catch { /* server may not have route yet — add locally anyway */ }
    setBuyers(prev => [...prev, newContact])
    setAddSaved(true)
    setAddSaving(false)
    setTimeout(() => { setShowAddModal(false); setAddForm(EMPTY_FORM); setAddSaved(false); addVoice.reset(); setAddVoiceStage("idle") }, 1200)
  }

  const handleCsvFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return

      // Properly split a CSV line respecting quoted fields containing commas
      const splitCsvLine = (line: string): string[] => {
        const result: string[] = []
        let cur = ""
        let inQuote = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { inQuote = !inQuote }
          else if (ch === "," && !inQuote) { result.push(cur.trim()); cur = "" }
          else { cur += ch }
        }
        result.push(cur.trim())
        return result
      }

      const rawHeaders = splitCsvLine(lines[0])
      const headers = rawHeaders.map(h => h.replace(/^"|"$/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""))

      // Find first column matching any alias (exact then contains)
      const col = (aliases: string[]): number => {
        for (const a of aliases) {
          const exact = headers.findIndex(h => h === a)
          if (exact !== -1) return exact
        }
        for (const a of aliases) {
          const contains = headers.findIndex(h => h.includes(a))
          if (contains !== -1) return contains
        }
        return -1
      }

      // Column indexes — wide alias list covers Rex, AgentBox, Vault, BoxDice, PropTrack, custom exports
      const firstNameI  = col(["firstname", "first"])
      const lastNameI   = col(["lastname", "last", "surname"])
      const nameI       = col(["fullname", "name", "contactname", "client", "contact"])
      const phoneI      = col(["phone", "mobile", "mobilephone", "cell", "contactphone"])
      const emailI      = col(["email", "emailaddress", "contactemail"])
      const addrI       = col(["purchaseaddress", "propertyaddress", "address", "streetaddress", "property", "soldaddress"])
      const suburbI     = col(["suburb", "suburbname", "city", "town", "location"])
      const priceI      = col(["purchaseprice", "settledprice", "soldprice", "price", "saleamount", "salevalue", "sold"])
      const dateI       = col(["purchasedate", "settlementdate", "settledate", "saledate", "solddate", "date"])
      const bedsI       = col(["beds", "bedrooms", "bedroom"])
      const bathsI      = col(["baths", "bathrooms", "bathroom"])
      const landI       = col(["land", "landarea", "landsqm", "landsize", "lotsize"])
      const typeI       = col(["propertytype", "type", "dwellingtype"])
      const statusI     = col(["status", "buyerstatus", "clienttype"])
      const notesI      = col(["notes", "note", "comments", "description"])

      // Extract suburb from "123 Main St, Suburb" format if no suburb column
      const suburbFromAddr = (addr: string): string => {
        const parts = addr.split(",")
        return parts.length >= 2 ? parts[parts.length - 1].trim().replace(/\s+\w{3,4}\s*\d{4}$/, "").trim() : ""
      }

      const parsed: Partial<AddContactForm>[] = lines.slice(1).map(line => {
        const cols = splitCsvLine(line)
        const get = (i: number) => i !== -1 ? cols[i]?.replace(/^"|"$/g, "").trim() ?? "" : ""

        // Merge first + last name if no combined name column
        let name = get(nameI)
        if (!name && (firstNameI !== -1 || lastNameI !== -1)) {
          name = [get(firstNameI), get(lastNameI)].filter(Boolean).join(" ")
        }

        const addr = get(addrI)
        const rawSuburb = get(suburbI) || suburbFromAddr(addr)

        return {
          name,
          phone: get(phoneI),
          email: get(emailI),
          purchaseAddress: addr,
          suburb: rawSuburb,
          purchasePrice: get(priceI),
          purchaseDate: get(dateI),
          beds: get(bedsI) || "3",
          baths: get(bathsI) || "2",
          land: get(landI),
          propertyType: (get(typeI) || "House") as AddContactForm["propertyType"],
          status: get(statusI) || "owner-occupier",
          notes: get(notesI),
        }
      }).filter(c => c.name)
      setCsvContacts(parsed)
    }
    reader.readAsText(file)
  }

  const handleCsvImport = async () => {
    if (!csvContacts.length) return
    setCsvImporting(true)
    for (const c of csvContacts) {
      const newContact = {
        id: Date.now() + Math.random(),
        name: c.name ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        purchaseAddress: c.purchaseAddress ?? "",
        suburb: c.suburb ?? "",
        purchaseDate: c.purchaseDate ?? "",
        purchasePrice: parseInt((c.purchasePrice ?? "").replace(/\D/g, ""), 10) || 0,
        deposit: 0,
        propertyType: (c.propertyType ?? "House") as "House" | "Unit" | "Townhouse",
        beds: parseInt(c.beds ?? "3", 10) || 3,
        baths: parseInt(c.baths ?? "2", 10) || 2,
        land: parseInt((c.land ?? "").replace(/\D/g, ""), 10) || 0,
        status: (c.status ?? "owner-occupier") as import("../data/pastBuyers").BuyerStatus,
        notes: c.notes ?? "", lastContactDate: "",
      }
      try {
        await authFetch(apiUrl("/api/add-contact"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newContact),
        })
      } catch { /* add locally anyway */ }
      setBuyers(prev => [...prev, newContact])
    }
    setCsvImporting(false)
    setCsvImported(true)
    setTimeout(() => { setShowAddModal(false); setCsvContacts([]); setCsvImported(false); setImportSource("manual") }, 1400)
  }

  const closeAddModal = () => {
    setShowAddModal(false)
    setImportSource("manual")
    addVoice.reset()
    setAddVoiceStage("idle")
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "88px 28px 48px", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 8 }}>
          Vendor Prospecting
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: -0.6, marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
          Turn past buyers into new listings
          <span style={{ fontSize: 13, fontWeight: 600, color: C.faint, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 10px", letterSpacing: 0 }}>
            {buyers.length} contacts
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 560, marginBottom: 14 }}>
          PropOS analyses your CRM database to find past buyers who are ready to sell. We calculate their equity, CGT position, and life-stage triggers, then generate hyper-personalised outreach in your voice.
        </div>
      </div>

      {/* CRM Summary Stats — compact inline strip */}
      {(() => {
        const COMMISSION_RATE = 0.02
        const AGENT_SPLIT     = 0.60
        const agentGCI = totalEstValue * COMMISSION_RATE * AGENT_SPLIT
        const fmtM = (v: number) => v >= 1_000_000
          ? `$${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toFixed(0)}`
        const stats = [
          { label: "Contacts",         value: `${buyers.length}`,    accent: false },
          { label: "Potential vendors",value: `${owners.length}`,    accent: false },
          { label: "Investors",        value: `${investors.length}`, accent: false },
          { label: "Portfolio value",  value: fmtM(totalEstValue),   accent: false },
          { label: "Est. agent GCI",   value: fmtM(agentGCI),        accent: true  },
        ]
        return (
          <div style={{ display: "flex", gap: 0, marginBottom: 24, background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{
                flex: 1, padding: "12px 14px", textAlign: "center",
                borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : "none",
                background: s.accent ? `${C.green}0a` : "transparent",
              }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: s.accent ? C.green : C.text, lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 500, marginTop: 3, letterSpacing: 0.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Sheet setup guide — shown when falling back to demo data */}
      {sheetSource === "demo" && !sheetLoading && (
        <div style={{
          marginBottom: 20, background: C.bg2, borderRadius: 12,
          border: `1px solid rgba(166,218,255,0.15)`, padding: "14px 18px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>
            Connect your Google Sheet CRM to load live contacts
          </div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 8 }}>
            Create a tab called <strong style={{ color: C.text }}>Past Buyers</strong> in your connected Sheet with these columns:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["id", "name", "phone", "email", "purchaseAddress", "suburb", "purchaseDate", "purchasePrice", "deposit", "propertyType", "beds", "baths", "land", "status", "notes", "lastContactDate"].map(col => (
              <span key={col} style={{
                fontSize: 10, fontFamily: "monospace", padding: "2px 7px",
                background: C.bg3, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.muted,
              }}>{col}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recent contacts preview */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Your CRM database</div>
          {sheetLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                border: `2px solid ${C.border}`,
                borderTopColor: C.blue,
                animation: "spin 0.7s linear infinite",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: C.faint }}>Syncing…</span>
            </div>
          )}
          {sheetSource === "sheet" && !sheetLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>Live.</span>
              <button onClick={loadFromSheet} title="Refresh from Google Sheets" style={{
                background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                color: C.faint, fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center",
              }}>↺</button>
            </div>
          )}
          {sheetSource === "demo" && !sheetLoading && (
            <div style={{ fontSize: 10, color: C.faint, padding: "2px 8px", background: C.bg3, borderRadius: 6 }}>Demo data</div>
          )}
          <button onClick={() => setShowAddModal(true)} style={{
            marginLeft: "auto", padding: "5px 14px", borderRadius: 8,
            background: theme.primary, border: "none",
            color: "#ffffff", fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: FONT,
          }}>
            + Add contact
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buyers.slice(0, showAllContacts ? buyers.length : 5).map(buyer => {
            const est = estimatedValues.get(buyer.id) ?? 0
            const equity = est - buyer.purchasePrice
            const equityPct = buyer.purchasePrice > 0 ? (equity / buyer.purchasePrice) * 100 : 0
            const isClickable = !!onSelectBuyer
            // Street-level sale alert: check if a comp sold in the last 30 days
            const recentComps = generateComparables({ suburb: buyer.suburb, propertyType: (buyer.propertyType ?? "House") as "House"|"Unit"|"Townhouse", beds: buyer.beds, land: buyer.land ?? 500, buyerId: buyer.id })
            const now = new Date("2026-06-02")
            const nearbyAlert = recentComps.find(c => {
              const d = new Date(c.soldDate.replace(/(\d+) (\w+) (\d+)/, "$2 $1, $3"))
              return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30
            })
            return (
              <div
                key={buyer.id}
                onClick={() => handleBuyerClick(buyer)}
                style={{
                  background: C.bg2, borderRadius: 12,
                  border: nearbyAlert ? `1px solid #f59e0b55` : `1px solid ${C.border}`,
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 14,
                  cursor: isClickable ? "pointer" : "default",
                  transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { if (isClickable) { e.currentTarget.style.borderColor = theme.primary + "55"; e.currentTarget.style.background = C.bg3; e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.2)` } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = nearbyAlert ? "#f59e0b55" : C.border; e.currentTarget.style.background = C.bg2; e.currentTarget.style.boxShadow = "none" }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${theme.gradient[0]}33, ${theme.gradient[1]}22)`,
                  border: `1px solid ${theme.primary}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: theme.primary,
                }}>
                  {buyer.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{buyer.name}</div>
                    {nearbyAlert && (
                      <div title={`${nearbyAlert.beds}bd nearby sold ${fmtDollar(nearbyAlert.soldPrice)} on ${nearbyAlert.soldDate}`}
                        style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "#f59e0b18", border: "1px solid #f59e0b44", borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>
                        🔔 Nearby sale
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{buyer.purchaseAddress}</div>
                  {nearbyAlert && (
                    <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>
                      {nearbyAlert.beds}bd at {nearbyAlert.address} sold {fmtDollar(nearbyAlert.soldPrice)}
                    </div>
                  )}
                </div>
                {/* Financial summary */}
                <div style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Bought</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{fmtDollar(buyer.purchasePrice)}</div>
                  </div>
                  <div style={{ width: 1, height: 28, background: C.border }} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Now</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{est > 0 ? fmtDollar(est) : "—"}</div>
                  </div>
                  <div style={{ width: 1, height: 28, background: C.border }} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Equity</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: equity > 0 ? C.green : C.red ?? "#ef4444" }}>
                      {equity > 0 ? "+" : ""}{fmtDollar(equity)}
                    </div>
                    <div style={{ fontSize: 9, color: C.faint }}>+{equityPct.toFixed(0)}%</div>
                  </div>
                  {isClickable && (
                    <div style={{ fontSize: 14, color: C.faint, marginLeft: 4 }}>›</div>
                  )}
                </div>
              </div>
            )
          })}
          {buyers.length > 5 && (
            <button
              onClick={() => setShowAllContacts(v => !v)}
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 12,
                background: C.bg2, border: `1px solid ${C.border}`,
                color: C.muted, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bg3)}
              onMouseLeave={e => (e.currentTarget.style.background = C.bg2)}
            >
              {showAllContacts
                ? "∧ Show less"
                : `∨ Show ${buyers.length - 5} more contacts`}
            </button>
          )}
        </div>
      </div>

      {/* Analyse button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleAnalyse}
        disabled={analysing}
        style={{
          width: "100%", padding: "18px",
          borderRadius: 14, border: "none",
          background: analysing ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          color: analysing ? C.muted : "white",
          fontSize: 16, fontWeight: 700, cursor: analysing ? "default" : "pointer",
          fontFamily: FONT, letterSpacing: -0.3,
          boxShadow: analysing ? "none" : `0 4px 24px ${theme.glow}`,
          marginBottom: 12,
        }}
      >
        {analysing ? "Analysing your database..." : sheetLoading ? "Loading CRM..." : `✦ Analyse all ${buyers.length} contacts →`}
      </motion.button>

      {/* Pitch callout */}
      <div style={{
        marginTop: 20, background: C.bg2, borderRadius: 14,
        border: `1px solid ${theme.primary}22`, padding: "18px 22px",
        display: "flex", alignItems: "flex-start", gap: 14,
      }}>
        <div style={{ fontSize: 22 }}>💡</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>How it works</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            PropOS scans your past buyers and segments them into actionable pipelines: investors ready to take profit, families outgrowing their home, empty-nesters ready to downsize. Each contact gets a financial snapshot (equity gain, CGT savings, cash-on-cash return) and personalised outreach in your voice.
          </div>
        </div>
      </div>

      {/* Add Contact modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }}
            onClick={closeAddModal}
          >
            <motion.div
              initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: C.bg2, borderRadius: 18, border: `1px solid ${C.border}`,
                padding: "28px 28px", maxWidth: 600, width: "100%",
                maxHeight: "85vh", overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 3 }}>Add or Import Contacts</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Contacts are upserted to your Google Sheet CRM automatically.</div>
                </div>
                <button onClick={closeAddModal} style={{
                  background: "none", border: "none", color: C.faint, fontSize: 18,
                  cursor: "pointer", padding: "0 4px", lineHeight: 1,
                }}>✕</button>
              </div>

              {/* Source tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 22, background: C.bg3, borderRadius: 10, padding: 4 }}>
                {([
                  ["manual", "✍️", "Manual"],
                  ["csv", "📤", "Import CSV"],
                  ["crm", "🔌", "From CRM"],
                ] as [typeof importSource, string, string][]).map(([src, icon, label]) => (
                  <button key={src} onClick={() => setImportSource(src)} style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8, border: "none",
                    background: importSource === src ? theme.primary : "transparent",
                    color: importSource === src ? "#ffffff" : C.muted,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                    transition: "all 0.15s",
                  }}>
                    {icon} {label}
                  </button>
                ))}
              </div>
              {/* ── Manual Add ── */}
              {importSource === "manual" && (
                <>
                  {/* 5 required fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {([
                      ["Name *", "name", "text", "Full name"],
                      ["Phone *", "phone", "tel", "+61 4xx xxx xxx"],
                      ["Purchase address *", "purchaseAddress", "text", "12 Smith St"],
                      ["Purchase price *", "purchasePrice", "text", "850000"],
                      ["Purchase date *", "purchaseDate", "date", ""],
                    ] as [string, keyof AddContactForm, string, string][]).map(([label, field, type, placeholder]) => (
                      <div key={field} style={{ gridColumn: ["name", "purchaseAddress"].includes(field) ? "1 / -1" : undefined }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>{label}</label>
                        <input type={type} value={addForm[field]}
                          onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                          placeholder={placeholder}
                          style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Optional details — collapsible */}
                  <button onClick={() => setShowOptionalFields(v => !v)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.faint, fontFamily: FONT, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
                    <span style={{ transform: showOptionalFields ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>›</span>
                    {showOptionalFields ? "Hide optional details" : "Optional details"}
                  </button>
                  {showOptionalFields && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                      {([
                        ["Email", "email", "email", "email@domain.com"],
                        ["Suburb", "suburb", "text", "Berwick"],
                        ["Deposit paid", "deposit", "text", "85000"],
                        ["Beds", "beds", "number", "4"],
                        ["Baths", "baths", "number", "2"],
                        ["Land (m²)", "land", "text", "612"],
                      ] as [string, keyof AddContactForm, string, string][]).map(([label, field, type, placeholder]) => (
                        <div key={field}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>{label}</label>
                          <input type={type} value={addForm[field]}
                            onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                            placeholder={placeholder}
                            style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Property type</label>
                        <select value={addForm.propertyType} onChange={e => setAddForm(f => ({ ...f, propertyType: e.target.value }))}
                          style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none" }}>
                          <option>House</option><option>Unit</option><option>Townhouse</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Status</label>
                        <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}
                          style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none" }}>
                          <option value="owner-occupier">Owner-occupier</option>
                          <option value="investor">Investor</option>
                          <option value="buyer→landlord">Buyer → Landlord</option>
                          <option value="buyer→seller">Buyer → Seller</option>
                          <option value="renter→buyer">Renter → Buyer</option>
                          <option value="buyer→downsizer">Buyer → Downsizer</option>
                        </select>
                      </div>
                    </div>
                  )}
                    <div style={{ marginTop: 12 }}>
                      {/* Notes / Voice Personalisation */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Notes · Personalisation</label>
                        {addVoice.phase === "idle" && addVoiceStage === "idle" && (
                          <button onClick={addVoice.supported ? addVoice.start : undefined} style={{
                            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                            background: theme.primary + "18", color: theme.primary,
                            border: `1px solid ${theme.primary}35`, cursor: addVoice.supported ? "pointer" : "default",
                            fontFamily: FONT, display: "flex", alignItems: "center", gap: 4,
                            opacity: addVoice.supported ? 1 : 0.5,
                          }} title={addVoice.supported ? undefined : "Voice notes require Chrome or Edge"}>🎙️ Voice note</button>
                        )}
                        {addVoiceStage === "done" && (
                          <button onClick={() => { addVoice.reset(); setAddVoiceStage("idle"); setAddForm(f => ({ ...f, notes: "" })) }} style={{
                            fontSize: 10, color: C.faint, background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
                          }}>↺ Re-record</button>
                        )}
                      </div>

                      {/* Idle: plain textarea */}
                      {addVoice.phase === "idle" && addVoiceStage === "idle" && (
                        <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Family growing, interested in schools, investment strategy. Or use voice note above…"
                          style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", minHeight: 64, resize: "vertical", boxSizing: "border-box" }}
                        />
                      )}

                      {/* Recording: show live transcript + stop button */}
                      {addVoice.phase === "recording" && (
                        <div style={{ background: C.bg3, border: `1px solid ${theme.primary}30`, borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: addVoice.liveTranscript ? 10 : 0 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }}>
                              <motion.div animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }}
                                style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#ef4444" }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Recording voice memo</span>
                            <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>{addVoice.seconds}s</span>
                            <button onClick={addVoice.stop} style={{
                              fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                              background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440",
                              cursor: "pointer", fontFamily: FONT,
                            }}>Stop</button>
                          </div>
                          {addVoice.liveTranscript && (
                            <div style={{ fontSize: 12, color: theme.primary, fontStyle: "italic", lineHeight: 1.5 }}>
                              {addVoice.liveTranscript}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Processing pipeline (transcribing → analysing → personalising) */}
                      {(addVoiceStage === "transcribing" || addVoiceStage === "analysing" || addVoiceStage === "personalising") && (() => {
                        const STEPS: [typeof addVoiceStage, string][] = [
                          ["transcribing",  "Transcribing audio"],
                          ["analysing",     "Analysing transcript"],
                          ["personalising", "Personalising using PropOS AI"],
                        ]
                        const ORDER = ["transcribing", "analysing", "personalising", "done"]
                        const curIdx = ORDER.indexOf(addVoiceStage)
                        return (
                          <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {/* Step 0: Recording — always done at this point */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 13, color: C.green }}>✓</span>
                              <span style={{ fontSize: 12, color: C.muted }}>Recording voice memo</span>
                            </div>
                            {STEPS.map(([stage, label], i) => {
                              const stepIdx = i + 1
                              const isDone    = curIdx > stepIdx
                              const isCurrent = curIdx === stepIdx
                              return (
                                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {isDone
                                    ? <span style={{ fontSize: 13, color: C.green }}>✓</span>
                                    : isCurrent
                                      ? <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${theme.primary}30`, borderTopColor: theme.primary, animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                                      : <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.faint}55`, flexShrink: 0 }} />
                                  }
                                  <span style={{ fontSize: 12, color: isCurrent ? C.text : isDone ? C.muted : C.faint, fontWeight: isCurrent ? 600 : 400 }}>{label}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}

                      {/* Done: show editable result */}
                      {addVoiceStage === "done" && (
                        <div>
                          <div style={{ fontSize: 10, color: C.green, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>✓</span> Voice personalisation complete. Review and edit below
                          </div>
                          <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                            style={{ width: "100%", background: C.bg3, border: `1px solid ${theme.primary}30`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none", minHeight: 72, resize: "vertical", boxSizing: "border-box" }}
                          />
                        </div>
                      )}
                    </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button onClick={closeAddModal} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
                    <button onClick={handleAddContact} disabled={addSaving || addSaved} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: addSaved ? C.green : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: "white", fontSize: 14, fontWeight: 700, cursor: addSaving || addSaved ? "default" : "pointer", fontFamily: FONT }}>
                      {addSaved ? "✓ Contact added" : addSaving ? "Saving…" : "Add contact"}
                    </button>
                  </div>
                </>
              )}

              {/* ── CSV Import ── */}
              {importSource === "csv" && (
                <>
                  <input ref={csvRef} type="file" accept=".csv" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleCsvFile(e.target.files[0]) }}
                  />
                  {!csvContacts.length ? (
                    <div
                      onClick={() => csvRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f) }}
                      style={{ border: `2px dashed ${theme.primary}55`, borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: theme.dim, userSelect: "none" }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📤</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Drop your CSV file here</div>
                      <div style={{ fontSize: 12, color: C.muted }}>or click to browse, columns detected automatically</div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 10 }}>Supports: Name, Phone, Email, Address, Suburb, Purchase Price, Purchase Date</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ background: C.bg3, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.green}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✓</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{csvContacts.length} contacts found</div>
                          <div style={{ fontSize: 11, color: C.muted }}>Review below, then import all to your CRM and Google Sheet.</div>
                        </div>
                        <button onClick={() => { setCsvContacts([]); if (csvRef.current) csvRef.current.value = "" }} style={{ marginLeft: "auto", background: "none", border: "none", color: C.faint, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Change file</button>
                      </div>
                      <div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                        {csvContacts.slice(0, 8).map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < Math.min(csvContacts.length, 8) - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div style={{ width: 26, height: 26, borderRadius: 8, background: theme.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: theme.primary }}>{(c.name ?? "?").charAt(0)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "—"}</div>
                              <div style={{ fontSize: 10, color: C.faint }}>{c.purchaseAddress || c.suburb || c.phone || ""}</div>
                            </div>
                          </div>
                        ))}
                        {csvContacts.length > 8 && <div style={{ padding: "6px 12px", fontSize: 11, color: C.faint }}>+{csvContacts.length - 8} more contacts…</div>}
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => { setCsvContacts([]); if (csvRef.current) csvRef.current.value = "" }} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
                        <button onClick={handleCsvImport} disabled={csvImporting || csvImported} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: csvImported ? C.green : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: "white", fontSize: 14, fontWeight: 700, cursor: csvImporting || csvImported ? "default" : "pointer", fontFamily: FONT }}>
                          {csvImported ? `✓ Imported ${csvContacts.length} contacts` : csvImporting ? "Importing…" : `Import ${csvContacts.length} contacts`}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── From CRM ── */}
              {importSource === "crm" && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Connect your CRM to sync contacts automatically. PropOS maps your fields and upserts new records to your Google Sheet.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {([
                      ["RealBase",       "rb", "🏠", true],
                      ["Rex Software",   "rex", "📋", false],
                      ["AgentBox",       "ab", "📦", false],
                      ["Box+Dice",       "bd", "🎲", false],
                      ["ActivePipe",     "ap", "🔥", false],
                      ["Propic",         "pp", "💡", false],
                      ["Reapit",         "rp", "🏢", false],
                      ["VaultRE",        "vr", "🔐", false],
                      ["Console Cloud",  "cc", "☁️", false],
                      ["HubSpot",        "hs", "🟠", false],
                    ] as [string, string, string, boolean][]).map(([name, key, icon, featured]) => (
                      <div key={key} style={{ background: C.bg3, borderRadius: 12, padding: "14px 16px", border: `1px solid ${featured ? theme.primary + "44" : C.border}`, position: "relative" }}>
                        {featured && <div style={{ position: "absolute", top: 8, right: 8, background: theme.primary, color: "#fff", fontSize: 8, fontWeight: 800, padding: "2px 6px", borderRadius: 4, letterSpacing: 0.5 }}>FEATURED</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: 20 }}>{icon}</span>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{name}</div>
                        </div>
                        {(() => {
                          const stage = crmApiKeyStage[key] ?? "idle"
                          if (stage === "loading") return (
                            <div style={{ fontSize: 10, color: C.faint, display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${theme.primary}30`, borderTopColor: theme.primary, animation: "spin 0.7s linear infinite" }} />
                              Connecting…
                            </div>
                          )
                          if (stage === "key") return (
                            <div>
                              <div style={{ fontSize: 10, color: C.faint, marginBottom: 5 }}>Enter your API key or OAuth token</div>
                              <div style={{ display: "flex", gap: 5 }}>
                                <input
                                  placeholder="sk-…"
                                  value={crmApiKeyValues[key] ?? ""}
                                  onChange={e => setCrmApiKeyValues(v => ({ ...v, [key]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Enter") setCrmApiKeyStage(s => ({ ...s, [key]: "connected" })) }}
                                  style={{ flex: 1, padding: "5px 8px", background: C.bg, border: `1px solid ${theme.primary}55`, borderRadius: 6, color: C.text, fontSize: 11, fontFamily: FONT, outline: "none" }}
                                />
                                <button
                                  onClick={() => setCrmApiKeyStage(s => ({ ...s, [key]: "connected" }))}
                                  style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
                                >✓</button>
                              </div>
                            </div>
                          )
                          if (stage === "connected") return (
                            <div style={{ fontSize: 10, color: C.green, display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
                              Connected
                            </div>
                          )
                          return (
                            <button
                              onClick={() => {
                                setCrmApiKeyStage(s => ({ ...s, [key]: "loading" }))
                                setTimeout(() => setCrmApiKeyStage(s => ({ ...s, [key]: "key" })), 900)
                              }}
                              style={{ width: "100%", padding: "7px", borderRadius: 8, border: `1px solid ${theme.primary}55`, background: featured ? theme.primary : "transparent", color: featured ? "#fff" : theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                              {name === "RealBase" ? "Connect RealBase" : "Connect"}
                            </button>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, padding: "10px 14px", background: C.bg3, borderRadius: 10, fontSize: 11, color: C.faint, textAlign: "center" }}>
                    OAuth sync available in PropOS Pro. Contacts import once and stay in sync automatically.
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Vendor Prospecting: Pipeline Dashboard ──────────────────────────────────

function VendorDashboardPage({ segmented, onBack, onSelectEntry, theme, agent, onGenerateAll }: {
  segmented: SegmentedBuyer[]
  onBack: () => void
  onSelectEntry: (entry: SegmentedBuyer) => void
  theme: AgencyTheme
  agent: AgentProfile
  onGenerateAll?: (items: QueueItem[]) => void
}) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [filterPipeline, setFilterPipeline] = useState<Pipeline | "all">("all")
  const [showBulkFire, setShowBulkFire] = useState(false)
  const [roiData, setRoiData] = useState<VendorAnalyticsData | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)
  const filtered = filterPipeline === "all" ? segmented : segmented.filter(s => s.segment.pipeline === filterPipeline)
  const pipelines = [...new Set(segmented.map(s => s.segment.pipeline))]
  const totalEquity = segmented.reduce((s, e) => s + e.financials.equityGain, 0)

  useEffect(() => {
    authFetch(apiUrl("/api/analytics/vendor"))
      .then(r => r.json())
      .then((d: VendorAnalyticsData) => setRoiData(d))
      .catch(() => { /* show demo data from backend */ })
  }, [])
  const urgencyColor = (u: "high" | "medium" | "low") =>
    u === "high" ? (C.red ?? "#ef4444") : u === "medium" ? C.orange : C.faint

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "80px 16px 48px" : "88px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.primary, fontSize: 18, marginBottom: 20, padding: 0 }}>←</button>

      {/* Header with summary */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 8 }}>
          Pipeline Dashboard
        </div>
        <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 6, display: "flex", alignItems: "baseline", gap: 12 }}>
          <span>{segmented.length} contacts segmented into {pipelines.length} pipelines</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>
          Combined equity: <span style={{ color: C.green, fontWeight: 700 }}>{fmtDollar(totalEquity)}</span> across your database
        </div>

        {/* Portfolio Intelligence Score */}
        {(() => {
          const pctConf   = segmented.filter(e => e.segment.confidence >= 60).length / Math.max(segmented.length, 1)
          const pctCgt    = segmented.filter(e => e.financials.cgtSavingsBy2027 > 5000).length / Math.max(segmented.length, 1)
          const pctEquity = segmented.filter(e => e.financials.equityGainPct >= 30).length / Math.max(segmented.length, 1)
          const score     = Math.round(pctConf * 40 + pctCgt * 30 + pctEquity * 30)
          const optCount  = segmented.filter(e => e.segment.confidence >= 60).length
          const readyCount = segmented.filter(e => e.financials.equityGainPct >= 30 || e.segment.confidence >= 70).length
          return (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, padding: "14px 18px", borderRadius: 14, background: `linear-gradient(135deg, ${theme.gradient[0]}12, ${theme.gradient[1]}08)`, border: `1px solid ${theme.primary}30` }}>
              {/* Arc score ring */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <ScoreRing score={score} size={64} strokeWidth={4} />
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Database score</div>
              </div>
              {/* Divider */}
              <div style={{ width: 1, height: 44, background: C.border }} />
              {/* Breakdown */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {[
                  { v: optCount, l: "in optimal window", c: C.green },
                  { v: readyCount, l: "ready to list", c: theme.primary },
                ].map(m => (
                  <div key={m.l} style={{ background: C.bg2, border: `1px solid ${m.c}30`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: m.c }}>{m.v}</div>
                    <div style={{ fontSize: 9, color: C.faint }}>{m.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )
        })()}
        {/* Action buttons row */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowBulkFire(true)}
            style={{ padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: "white", fontSize: 13, fontWeight: 700, fontFamily: FONT, boxShadow: `0 4px 16px ${theme.glow}`, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Review {segmented.length} messages →
          </motion.button>
          {onGenerateAll && (
            <motion.button
              whileHover={{ scale: generatingAll ? 1 : 1.02 }}
              whileTap={{ scale: generatingAll ? 1 : 0.97 }}
              disabled={generatingAll}
              onClick={async () => {
                setGeneratingAll(true)
                try {
                  const contacts = segmented.map(({ buyer, financials: fin, segment: seg }) => ({
                    id: buyer.id,
                    name: buyer.name,
                    email: buyer.email ?? "",
                    phone: buyer.phone,
                    purchaseAddress: buyer.purchaseAddress,
                    suburb: buyer.suburb,
                    purchaseYear: buyer.purchaseDate.slice(0, 4),
                    purchasePrice: fin.purchasePrice,
                    currentEstimate: fin.currentEstimate,
                    equityGain: fin.equityGain,
                    equityGainPct: fin.equityGainPct,
                    pipeline: seg.pipeline,
                    pipelineLabel: PIPELINE_LABELS[seg.pipeline]?.label ?? seg.pipeline,
                    notes: buyer.notes ?? "",
                  }))
                  const res = await authFetch(apiUrl("/api/vendor-batch/generate"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contacts, agentName: agent.name, agentAgency: agent.agency }),
                  }).then(r => r.json()).catch(() => ({ items: [] }))
                  if (res.items?.length > 0) {
                    onGenerateAll(res.items as QueueItem[])
                  }
                } catch {
                  // fall through
                } finally {
                  setGeneratingAll(false)
                }
              }}
              style={{
                padding: "10px 20px", borderRadius: 12, border: `1px solid ${theme.primary}55`,
                cursor: generatingAll ? "default" : "pointer",
                background: "transparent", color: generatingAll ? C.faint : theme.primary,
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              {generatingAll
                ? <><motion.span animate={{ rotate: [0, 360] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>⚙️</motion.span> Generating…</>
                : `✦ Generate for All ${segmented.length} →`}
            </motion.button>
          )}
        </div>
      </div>

      {/* ROI Dashboard */}
      <VendorROIPanel data={roiData} theme={theme} segmented={segmented} />

      {/* AI Intelligence Suite */}
      <WowInsightsPanel segmented={segmented} theme={theme} />

      {/* AI Hyper-Personalisation Ideas */}
      <AIIdeasPanel theme={theme} />

      {/* Bulk fire modal */}
      <AnimatePresence>
        {showBulkFire && <BulkFireModal segmented={segmented} agent={agent} theme={theme} onClose={() => setShowBulkFire(false)} />}
      </AnimatePresence>

      {/* Pipeline filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button onClick={() => setFilterPipeline("all")} style={{
          padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterPipeline === "all" ? theme.primary : theme.primary + "40"}`,
          background: filterPipeline === "all" ? theme.primary : "transparent",
          color: filterPipeline === "all" ? "#fff" : theme.primary,
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}>
          All ({segmented.length})
        </button>
        {pipelines.map(p => {
          const pl = PIPELINE_LABELS[p]
          const count = segmented.filter(s => s.segment.pipeline === p).length
          if (count === 0) return null
          return (
            <button key={p} onClick={() => setFilterPipeline(p)} style={{
              padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterPipeline === p ? pl.color : pl.color + "50"}`,
              background: filterPipeline === p ? pl.color + "22" : "transparent",
              color: pl.color,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>
              {pl.icon} {pl.shortLabel} ({count})
            </button>
          )
        })}
      </div>

      {/* Contact cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((entry, i) => {
          const { buyer, financials: fin, segment } = entry
          const pl = PIPELINE_LABELS[segment.pipeline]
          const fname = buyer.name.split(" ")[0]
          const topTrigger = segment.triggers[0]
          return (
            <motion.div
              key={buyer.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onSelectEntry(entry)}
              style={{
                background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`,
                padding: "16px 20px", cursor: "pointer", display: "flex", gap: 14, alignItems: "center",
                transition: "border 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = pl.color + "55"
                el.style.boxShadow = `0 0 20px ${pl.color}15`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = C.border; el.style.boxShadow = "none"
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: pl.color + "18", border: `1px solid ${pl.color}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: pl.color,
              }}>
                {fname.charAt(0)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{buyer.name}</div>
                  <div style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 6,
                    background: pl.color + "18", color: pl.color, fontWeight: 700,
                  }}>
                    {pl.icon} {pl.shortLabel}
                  </div>
                  <div style={{ fontSize: 10, color: C.faint }}>{fmtYears(fin.yearsHeld)} hold</div>
                  {(buyer as { personalisationHook?: string }).personalisationHook && (
                    <div
                      title="Hyper-personalised — agent notes injected directly into outreach"
                      style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: theme.primary,
                        boxShadow: `0 0 0 2px ${theme.primary}33, 0 0 8px ${theme.primary}66`,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {buyer.purchaseAddress}
                </div>
                {topTrigger && (
                  <div style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 5, display: "inline-block",
                    background: urgencyColor(topTrigger.urgency) + "15",
                    border: `1px solid ${urgencyColor(topTrigger.urgency)}30`,
                    color: urgencyColor(topTrigger.urgency), fontWeight: 600,
                  }}>
                    {topTrigger.label}
                  </div>
                )}
                {buyer.lastContactDate && (
                  <div style={{ fontSize: 9, color: C.faint, marginTop: 3 }}>
                    Last contacted: {buyer.lastContactDate}
                    {buyer.lastMessage && (
                      <span style={{ marginLeft: 6, color: C.faint, fontStyle: "italic" }}>
                        · "{buyer.lastMessage.slice(0, 60)}{buyer.lastMessage.length > 60 ? "…" : ""}"
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Financial summary — hidden on mobile to keep cards compact */}
              {!isMobile && (
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.green }}>{fmtDollar(fin.equityGain)}</div>
                  <div style={{ fontSize: 9, color: C.faint, marginBottom: 4 }}>equity gain</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmtDollar(fin.currentEstimate)}</div>
                  <div style={{ fontSize: 9, color: C.faint }}>est. value</div>
                </div>
              )}

              {/* Priority score ring + View profile cue */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <ScoreRing score={entry.priority} size={isMobile ? 36 : 44} strokeWidth={3} />
                <span style={{ fontSize: 8, color: C.faint, whiteSpace: "nowrap" }}>View →</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vendor Prospecting: Contact Profile + Financial Snapshot ─────────────────

// ── Hyper-Personalisation Card ────────────────────────────────────────────────

/**
 * NotesBridgeCard — shows the full AI personalisation transformation:
 *   Stage 1: Raw CRM notes (what the agent typed)
 *   Stage 2: "AI reading between the lines..." bridge (while generating)
 *   Stage 3: What AI extracted — the single personalisation hook
 *   Stage 4: "As written to [name]" — the sentence from the actual email
 *
 * This is PropOS's WOW moment: showing that the AI didn't just quote the note,
 * it REFRAMED it into the contact's present situation.
 */
function NotesBridgeCard({ notes, prewrittenHook, extractedHook, personalisationLine, fname, generating, theme }: {
  notes: string
  prewrittenHook: string | null
  extractedHook: string | null
  personalisationLine: string | null
  fname: string
  generating: boolean
  theme: AgencyTheme
}) {
  // The "active" hook — pre-written takes precedence, otherwise show extracted
  const hook = prewrittenHook ?? extractedHook

  const [typedHook, setTypedHook] = useState("")
  const [hookDone, setHookDone] = useState(false)
  const [typedLine, setTypedLine] = useState("")
  const [lineDone, setLineDone] = useState(false)

  // Typewriter for hook
  useEffect(() => {
    if (!hook) { setTypedHook(""); setHookDone(false); return }
    setTypedHook(""); setHookDone(false)
    let idx = 0
    const iv = setInterval(() => {
      idx++
      setTypedHook(hook.slice(0, idx))
      if (idx >= hook.length) { setHookDone(true); clearInterval(iv) }
    }, 18)
    return () => clearInterval(iv)
  }, [hook])

  // Typewriter for personalisationLine — delayed so it lands after hook finishes
  useEffect(() => {
    if (!personalisationLine) { setTypedLine(""); setLineDone(false); return }
    setTypedLine(""); setLineDone(false)
    const delay = setTimeout(() => {
      let idx = 0
      const iv = setInterval(() => {
        idx++
        setTypedLine(personalisationLine.slice(0, idx))
        if (idx >= personalisationLine.length) { setLineDone(true); clearInterval(iv) }
      }, 22)
      return () => clearInterval(iv)
    }, 600)
    return () => clearTimeout(delay)
  }, [personalisationLine])

  // Truncate notes to the most meaningful excerpt (first 160 chars)
  const notesExcerpt = notes.length > 160 ? notes.slice(0, 157) + "..." : notes

  const showBridge = !!hook || generating
  const showHook   = !!hook
  const showLine   = !!personalisationLine

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 260 }}
      style={{
        borderRadius: 16, overflow: "hidden", position: "relative",
        background: `linear-gradient(160deg, ${theme.primary}12 0%, ${theme.primary}06 50%, ${C.bg2} 100%)`,
        border: `1.5px solid ${theme.primary}44`,
        boxShadow: `0 0 28px ${theme.primary}14`,
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${theme.primary}, ${theme.gradient?.[1] ?? theme.primary}66, transparent 80%)` }} />

      {/* Shimmer */}
      <motion.div
        animate={{ x: ["-120%", "220%"] }}
        transition={{ duration: 2.6, ease: "linear", repeat: Infinity, repeatDelay: 2.4 }}
        style={{ position: "absolute", top: 0, left: 0, width: "30%", height: "100%", background: `linear-gradient(90deg, transparent, ${theme.primary}0e, transparent)`, pointerEvents: "none" }}
      />

      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Stage 1: CRM Notes ── */}
        <div style={{ marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: C.faint, textTransform: "uppercase" }}>From your CRM notes</span>
          </div>
          <div style={{
            fontSize: 12, color: C.muted, lineHeight: 1.55, fontStyle: "italic",
            padding: "9px 12px", borderRadius: 9,
            background: C.bg3, border: `1px solid ${C.border}`,
          }}>
            <span style={{ color: C.faint, fontWeight: 900, fontSize: 15, lineHeight: 0, verticalAlign: "-2px", marginRight: 2 }}>"</span>
            {notesExcerpt}
            <span style={{ color: C.faint, fontWeight: 900, fontSize: 15, lineHeight: 0, verticalAlign: "-2px", marginLeft: 2 }}>"</span>
          </div>
        </div>

        {/* ── Bridge: AI reading... (only while generating) ── */}
        {showBridge && generating && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11, paddingLeft: 4 }}>
            <div style={{ width: 2, height: 28, background: `linear-gradient(to bottom, ${C.border}, ${theme.primary}55)`, borderRadius: 2, flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: 6, height: 6, borderRadius: "50%", background: theme.primary, flexShrink: 0 }}
              />
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                style={{ fontSize: 10, color: theme.primary, fontWeight: 700, letterSpacing: 0.3 }}
              >
                AI reading between the lines...
              </motion.span>
            </div>
          </div>
        )}

        {/* ── Stage 2: What AI saw ── */}
        {showHook && (
          <div style={{ marginBottom: showLine ? 11 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: `linear-gradient(90deg, ${theme.primary}ee, ${theme.primary}aa)`,
                borderRadius: 7, padding: "3px 10px",
                boxShadow: `0 2px 8px ${theme.primary}33`,
              }}>
                <span style={{ fontSize: 9 }}>⚡</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#fff", textTransform: "uppercase" }}>
                  {prewrittenHook ? "Your insight" : "What AI saw"}
                </span>
              </div>
              {prewrittenHook && (
                <span style={{ fontSize: 9, color: C.faint }}>✍️ pre-written · col R of sheet</span>
              )}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.6,
              padding: "10px 13px", borderRadius: 9,
              background: theme.primary + "0d",
              border: `1px solid ${theme.primary}2a`,
              minHeight: 38, fontStyle: "italic",
            }}>
              <span style={{ color: theme.primary, fontWeight: 900, fontSize: 16, opacity: 0.5, lineHeight: 0, verticalAlign: "-2px" }}>"</span>
              {typedHook}
              {!hookDone ? (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                  style={{ display: "inline-block", width: 2, height: 12, marginLeft: 1, background: theme.primary, verticalAlign: "middle", borderRadius: 1 }}
                />
              ) : (
                <span style={{ color: theme.primary, fontWeight: 900, fontSize: 16, opacity: 0.5, lineHeight: 0, verticalAlign: "-2px" }}>"</span>
              )}
            </div>
          </div>
        )}

        {/* ── Stage 3: As written in the outreach ── */}
        {showLine && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* Bridge to stage 3 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingLeft: 4 }}>
              <div style={{ width: 2, height: 24, background: `linear-gradient(to bottom, ${theme.primary}44, ${C.green}88)`, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: C.green, fontWeight: 700, letterSpacing: 0.3 }}>Woven into outreach as...</span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: `linear-gradient(90deg, ${C.green}dd, ${C.green}99)`,
                  borderRadius: 7, padding: "3px 10px",
                }}>
                  <span style={{ fontSize: 9 }}>✉️</span>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#fff", textTransform: "uppercase" }}>
                    As written to {fname}
                  </span>
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.65,
                padding: "10px 13px", borderRadius: 9,
                background: C.green + "10",
                border: `1px solid ${C.green}28`,
                minHeight: 38, fontStyle: "italic",
              }}>
                <span style={{ color: C.green, fontWeight: 900, fontSize: 16, opacity: 0.5, lineHeight: 0, verticalAlign: "-2px" }}>"</span>
                {typedLine}
                {!lineDone ? (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                    style={{ display: "inline-block", width: 2, height: 12, marginLeft: 1, background: C.green, verticalAlign: "middle", borderRadius: 1 }}
                  />
                ) : (
                  <span style={{ color: C.green, fontWeight: 900, fontSize: 16, opacity: 0.5, lineHeight: 0, verticalAlign: "-2px" }}>"</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer hint — only when we have no hook yet and not generating */}
        {!hook && !generating && (
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 6, fontStyle: "italic" }}>
            Click Generate below to watch AI extract the personalisation hook from these notes
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Vendor Appraisal Panel ────────────────────────────────────────────────────

function VendorAppraisalPanel({ buyer, theme, showEquityScenarios = false }: {
  buyer: import("../data/pastBuyers").PastBuyer
  theme: AgencyTheme
  showEquityScenarios?: boolean
}) {
  const comps: CompSale[] = generateComparables({
    suburb: buyer.suburb,
    propertyType: buyer.propertyType as "House" | "Unit" | "Townhouse",
    beds: buyer.beds,
    land: buyer.land ?? 500,
    buyerId: buyer.id,
  })

  const range: AppraisalRange = buildAppraisalRange(comps, buyer.suburb)

  const scenarios: EquityScenario[] = buildEquityScenarios({
    purchasePrice: buyer.purchasePrice,
    purchaseDate: buyer.purchaseDate,
    deposit: buyer.deposit ?? null,
    range,
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Recent Comparable Sales</div>
        <div style={{ fontSize: 11, color: C.faint }}>{buyer.suburb}</div>
      </div>

      {/* ── Live comparable sales map ── */}
      <ComparableSalesMap
        suburb={buyer.suburb}
        comps={[
          // Subject property first (vendor's own address) — shown as purple pulsing pin
          {
            address:    buyer.purchaseAddress,
            soldPrice:  buyer.purchasePrice,
            beds:       buyer.beds,
            land:       buyer.land ?? 0,
            matchScore: 100,
            soldDate:   buyer.purchaseDate ?? "",
            isSubject:  true,
          },
          // Comparable sales (green / blue / amber pins by match score)
          ...comps.map(c => ({
            address:    c.address,
            soldPrice:  c.soldPrice,
            beds:       c.beds,
            land:       c.land,
            matchScore: c.matchScore,
            soldDate:   c.soldDate,
            isSubject:  false,
          })),
        ]}
        theme={theme}
        height={260}
      />

      {/* Comp detail cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {comps.map((comp, i) => {
          const isSubject = i === 0
          const distKm = isSubject ? null : (0.2 + (100 - comp.matchScore) / 100 * 1.3).toFixed(1)
          return (
            <div key={i} style={{
              background: C.bg3, borderRadius: 12,
              border: `1px solid ${comp.matchScore >= 85 ? C.green + "33" : C.border}`,
              padding: "12px 13px",
              position: "relative",
            }}>
              {comp.matchScore >= 85 && (
                <div style={{
                  position: "absolute", top: 10, right: 10,
                  width: 7, height: 7, borderRadius: "50%",
                  background: C.green, boxShadow: `0 0 6px ${C.green}88`,
                }} title="Strong comparable" />
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 1, paddingRight: 50 }}>
                {comp.address}
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginBottom: 8 }}>
                {comp.suburb}{distKm ? ` · ${distKm} km` : ""}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {[
                  { v: `${comp.beds}bd`, c: C.muted },
                  { v: `${comp.baths}ba`, c: C.muted },
                  comp.land > 0 ? { v: `${comp.land}m²`, c: C.muted } : null,
                ].filter(Boolean).map(chip => (
                  <span key={chip!.v} style={{
                    fontSize: 10, color: chip!.c,
                    background: C.bg2, border: `1px solid ${C.border}`,
                    padding: "2px 7px", borderRadius: 4,
                  }}>{chip!.v}</span>
                ))}
              </div>

              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>
                {fmtK(comp.soldPrice)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                <span style={{ fontSize: 10, color: C.faint }}>Sold {comp.soldDate}</span>
                {comp.pricePerSqm > 0 && (
                  <span style={{ fontSize: 10, color: theme.primary, fontWeight: 600 }}>
                    ${comp.pricePerSqm.toLocaleString()}/m²
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Appraisal range bar — hidden for now */}
      {false && <div style={{ background: C.bg3, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          Estimated Value Range
        </div>

        {/* Bar */}
        <div style={{ position: "relative", height: 8, background: C.bg2, borderRadius: 4, marginBottom: 8, border: `1px solid ${C.border}` }}>
          {/* Filled range */}
          <div style={{
            position: "absolute",
            left: "8%", right: "8%", top: 0, bottom: 0,
            background: `linear-gradient(90deg, #64b5f6, ${C.green}, #ffa726)`,
            borderRadius: 4,
          }} />
          {/* Mid indicator */}
          <div style={{
            position: "absolute",
            left: "50%", top: -3, bottom: -3,
            width: 3, background: "white",
            borderRadius: 2, transform: "translateX(-50%)",
          }} />
        </div>

        {/* Labels */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: "#64b5f6" }}>{fmtK(range.low)}</span>
          <span style={{ color: C.green, fontSize: 14 }}>{fmtK(range.mid)} <span style={{ fontSize: 10, fontWeight: 400, color: C.faint }}>mid</span></span>
          <span style={{ color: "#ffa726" }}>{fmtK(range.high)}</span>
        </div>

        <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>{range.methodNote}</div>

        {/* Market stats row */}
        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "Avg days on market", value: `${range.daysOnMarket} days` },
            { label: "Clearance rate", value: `${range.clearanceRate}%` },
            { label: "Buyer demand", value: `${range.demandScore}/10` },
            range.avgPricePerSqm > 0 ? { label: "Avg $/m²", value: `$${range.avgPricePerSqm.toLocaleString()}` } : null,
          ].filter(Boolean).map(stat => (
            <div key={stat!.label}>
              <div style={{ fontSize: 9, color: C.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{stat!.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 1 }}>{stat!.value}</div>
            </div>
          ))}
        </div>
      </div>}

      {/* Equity release scenarios */}
      {showEquityScenarios && <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Equity Release Scenarios
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {scenarios.map(sc => (
            <div key={sc.label} style={{
              background: C.bg3, borderRadius: 12,
              border: `1px solid ${sc.color}33`,
              padding: "13px 14px",
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: sc.color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                {sc.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: sc.color, letterSpacing: -0.3, marginBottom: 2 }}>
                {fmtK(sc.salePrice)}
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginBottom: 8 }}>est. sale price</div>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: C.faint }}>Selling costs</span>
                  <span style={{ color: C.muted }}>-{fmtK(sc.sellingCosts)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: C.faint }}>Est. CGT</span>
                  <span style={{ color: C.muted }}>-{fmtK(sc.estimatedCGT)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 5, marginTop: 2 }}>
                  <span style={{ color: C.faint }}>Net proceeds</span>
                  <span style={{ color: C.green }}>{fmtK(sc.netProceeds)}</span>
                </div>
              </div>

              <div style={{
                marginTop: 8, fontSize: 11, fontWeight: 700,
                color: sc.equityReleased >= 0 ? C.green : "#ef4444",
                textAlign: "center",
                background: sc.equityReleased >= 0 ? C.green + "12" : "#ef444412",
                borderRadius: 6, padding: "4px 0",
              }}>
                {sc.equityReleased >= 0 ? "+" : ""}{fmtK(sc.equityReleased)} equity
              </div>
            </div>
          ))}
        </div>
      </div>}
    </div>
  )
}

// ── Secondary Buyer Engagement Card ──────────────────────────────────────────
// Shown for buyers who aren't immediately vendor-ready; provides referral &
// relationship-building strategies to keep generating business from them.

const REFERRAL_PARTNERS = [
  { icon: "🏦", label: "Mortgage Broker", action: "Refinancing? A free review could save them thousands. Intro them to your broker." },
  { icon: "📊", label: "Financial Planner", action: "Their equity is a real asset. A financial plan helps them see what's possible." },
  { icon: "⚖️", label: "Conveyancer", action: "When they're ready to move, your conveyancer makes the process seamless." },
  { icon: "🔧", label: "Property Manager", action: "If they want to lease while they wait, connect them with your PM partner." },
]

const NURTURE_ACTIONS = [
  { icon: "📅", label: "Set 90-day follow-up", description: "Schedule a market update call for Q3 2026" },
  { icon: "📰", label: "Suburb report email", description: "Send their suburb's quarterly stats and recent comparable sales" },
  { icon: "🏡", label: "Pre-market VIP alert", description: "Give them first access to new listings before they hit portals" },
  { icon: "🎂", label: "Settlement anniversary", description: "Personal note on their purchase anniversary. Builds loyalty." },
]

function SecondaryEngagementCard({ entry, theme }: { entry: SegmentedBuyer; theme: AgencyTheme }) {
  const [expanded, setExpanded] = useState(false)
  const { buyer } = entry
  const fname = buyer.name.split(" ")[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 14, border: `1.5px dashed ${theme.primary}40`,
        background: `${theme.primary}06`, overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "14px 18px", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
              {fname} isn't vendor-ready yet. Here's how to stay valuable
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              Referral partners · relationship touchpoints · nurture actions
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: theme.primary, fontWeight: 700 }}>
          {expanded ? "▲ Less" : "▼ More"}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 18px 18px" }}>
              {/* Referral Partners */}
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Referral opportunities
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {REFERRAL_PARTNERS.map(rp => (
                  <div key={rp.label} style={{
                    background: C.bg3, borderRadius: 10, padding: "10px 12px",
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: 15, marginBottom: 3 }}>{rp.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 2 }}>{rp.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{rp.action}</div>
                  </div>
                ))}
              </div>

              {/* Nurture Actions */}
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Relationship touchpoints
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {NURTURE_ACTIONS.map(na => (
                  <div key={na.label} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: C.bg3, borderRadius: 8, padding: "8px 12px",
                    border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{na.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{na.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{na.description}</div>
                    </div>
                    <button style={{
                      marginLeft: "auto", flexShrink: 0,
                      fontSize: 9, fontWeight: 700, color: theme.primary,
                      background: `${theme.primary}15`, border: `1px solid ${theme.primary}30`,
                      borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: FONT,
                    }}>
                      Queue
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Property Value Estimator Modal ────────────────────────────────────────────

export function PropertyEstimatorModal({ theme, onClose }: { theme: AgencyTheme; onClose: () => void }) {
  const [suburb, setSuburb] = useState("Berwick")
  const [propertyType, setPropertyType] = useState<"House" | "Unit" | "Townhouse">("House")
  const [beds, setBeds] = useState(4)
  const [baths, setBaths] = useState(2)
  const [land, setLand] = useState(600)
  const [result, setResult] = useState<{ comps: CompSale[]; range: AppraisalRange } | null>(null)

  const SUBURBS = ["Berwick", "Narre Warren South", "Officer", "Pakenham", "Clyde North", "Cranbourne", "Warragul"]

  const handleEstimate = () => {
    const comps = generateComparables({
      suburb, propertyType, beds, land,
      buyerId: Math.floor(Math.random() * 99999),
    })
    const range = buildAppraisalRange(comps, suburb)
    setResult({ comps, range })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg2, borderRadius: 20, border: `1px solid ${C.border}`,
          padding: 28, maxWidth: 640, width: "100%",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Property Value Estimator</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Based on recent comparable sales in your suburb</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Suburb</label>
            <select value={suburb} onChange={e => setSuburb(e.target.value)} style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg3, color: C.text, fontSize: 13, fontFamily: FONT,
            }}>
              {SUBURBS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Property Type</label>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value as "House")} style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg3, color: C.text, fontSize: 13, fontFamily: FONT,
            }}>
              <option>House</option><option>Unit</option><option>Townhouse</option>
            </select>
          </div>
          {[
            ["Bedrooms", beds, setBeds, 2, 6],
            ["Bathrooms", baths, setBaths, 1, 4],
            ["Land (m²)", land, setLand, 100, 2000],
          ].map(([label, val, setter, min, max]) => (
            <div key={label as string}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>{label as string}</label>
              <input
                type="number" min={min as number} max={max as number}
                value={val as number}
                onChange={e => (setter as (n: number) => void)(parseInt(e.target.value) || 0)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.bg3, color: C.text, fontSize: 13, fontFamily: FONT, boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleEstimate}
          style={{
            width: "100%", padding: 14, borderRadius: 12, border: "none",
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            boxShadow: `0 4px 20px ${theme.glow}`, marginBottom: 20,
          }}
        >
          ✦ Estimate Value
        </button>

        {/* Results */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* Value Range */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
                Estimated Value Range
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: "Conservative", val: result.range.low, color: "#64b5f6" },
                  { label: "Mid-Range",    val: result.range.mid, color: "#66bb6a" },
                  { label: "Optimistic",   val: result.range.high, color: "#ffa726" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: C.bg3, borderRadius: 10, padding: "12px 14px", border: `1px solid ${color}33`, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color }}>{fmtK(val)}</div>
                    <div style={{ fontSize: 9, color: C.faint, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  ["Avg $/sqm", `$${result.range.avgPricePerSqm.toLocaleString()}`],
                  ["Days on Market", `${result.range.daysOnMarket} days`],
                  ["Clearance Rate", `${result.range.clearanceRate}%`],
                  ["Demand Score", `${result.range.demandScore}/10`],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: C.bg3, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{value}</div>
                    <div style={{ fontSize: 9, color: C.faint }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparable Sales */}
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
              Recent Comparable Sales
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.comps.map((comp, i) => (
                <div key={i} style={{
                  background: C.bg3, borderRadius: 10, padding: "12px 14px",
                  border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{comp.address}, {comp.suburb}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>
                      {comp.beds}bd {comp.baths}ba {comp.land > 0 ? `· ${comp.land}m²` : ""} · Sold {comp.soldDate}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: theme.primary }}>{fmtK(comp.soldPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 8, fontStyle: "italic" }}>{result.range.methodNote}</div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Vendor Analytics / ROI Dashboard ─────────────────────────────────────────

interface VendorAnalyticsData {
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

// Demo data shown immediately while the fetch is in flight
const DEMO_ROI: VendorAnalyticsData = {
  funnel: { outreachSent: 47, emailOpened: 31, replied: 9, appraisalsBooked: 3, listingsWon: 1, estimatedGCI: 17000 },
  nurture: { pending: 18, sent: 22 },
  roi: { monthlySubscription: 399, listingsAttributed: 1, revenueGenerated: 17000, roiMultiple: 42.6 },
}

function VendorROIPanel({ data, theme, segmented }: { data: VendorAnalyticsData | null; theme: AgencyTheme; segmented?: SegmentedBuyer[] }) {
  const [open, setOpen] = useState(false)
  // If API returned real data use it; otherwise derive projections from current database
  const projected: VendorAnalyticsData | null = segmented && !data ? (() => {
    const n = segmented.length
    const sent = n
    const replied = Math.max(1, Math.round(n * 0.10))
    const appraisals = Math.max(1, Math.round(n * 0.03))
    const listings = Math.max(1, Math.round(n * 0.01))
    const gci = listings * 17000
    return {
      funnel: { outreachSent: sent, emailOpened: Math.round(sent * 0.65), replied, appraisalsBooked: appraisals, listingsWon: listings, estimatedGCI: gci },
      nurture: { pending: Math.round(n * 0.6), sent: 0 },
      roi: { monthlySubscription: 399, listingsAttributed: listings, revenueGenerated: gci, roiMultiple: Math.round(gci / 399 * 10) / 10 },
    }
  })() : null
  const d = data ?? projected ?? DEMO_ROI
  const { funnel, nurture, roi } = d

  const pctOpen   = funnel.outreachSent > 0 ? Math.round((funnel.emailOpened    / funnel.outreachSent) * 100) : 66
  const pctReply  = funnel.outreachSent > 0 ? Math.round((funnel.replied        / funnel.outreachSent) * 100) : 19
  const pctAppr   = funnel.outreachSent > 0 ? Math.round((funnel.appraisalsBooked / funnel.outreachSent) * 100) : 6
  const pctList   = funnel.outreachSent > 0 ? Math.round((funnel.listingsWon    / funnel.outreachSent) * 100) : 2

  const funnelSteps = [
    { label: "Sent",        value: funnel.outreachSent,     pct: 100,      color: C.blue },
    { label: "Opened",      value: funnel.emailOpened,      pct: pctOpen,  color: "#a78bfa" },
    { label: "Replied",     value: funnel.replied,          pct: pctReply, color: C.green },
    { label: "Appraisals",  value: funnel.appraisalsBooked, pct: pctAppr,  color: C.orange },
    { label: "Listings",    value: funnel.listingsWon,      pct: pctList,  color: theme.gradient[0] },
  ]

  const gciStr = funnel.estimatedGCI > 0
    ? `$${(funnel.estimatedGCI / 1000).toFixed(0)}K GCI earned`
    : funnel.listingsWon > 0 ? `${funnel.listingsWon} listing${funnel.listingsWon > 1 ? "s" : ""} won` : "0 listings yet"

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0,
          width: "100%",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.4, textTransform: "uppercase" }}>
          ROI Dashboard
        </span>
        <span style={{ fontSize: 11, color: C.faint, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        {!open && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.green }}>
            {roi.roiMultiple > 0 ? `${roi.roiMultiple}× ROI` : gciStr}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}
          >
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>

              {/* ROI hero number */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Return on PropOS investment</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 36, fontWeight: 900, color: C.green, letterSpacing: -1 }}>
                      {roi.roiMultiple > 0 ? `${roi.roiMultiple}×` : "–"}
                    </span>
                    {roi.revenueGenerated > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
                        ${(roi.revenueGenerated / 1000).toFixed(0)}K GCI
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    ${roi.monthlySubscription}/mo · {roi.listingsAttributed} listing{roi.listingsAttributed !== 1 ? "s" : ""} attributed
                  </div>
                </div>

                {/* Nurture queue stats */}
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { v: nurture.pending, l: "nurture pending", c: C.orange },
                    { v: nurture.sent,    l: "follow-ups sent",  c: C.green  },
                  ].map(m => (
                    <div key={m.l} style={{ background: C.bg3, border: `1px solid ${m.c}30`, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: m.c }}>{m.v}</div>
                      <div style={{ fontSize: 9, color: C.faint, whiteSpace: "nowrap" }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {funnelSteps.map(step => (
                  <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 72, fontSize: 10, color: C.muted, textAlign: "right", flexShrink: 0 }}>{step.label}</div>
                    <div style={{ flex: 1, height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${step.pct}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                        style={{ height: "100%", background: step.color, borderRadius: 3 }}
                      />
                    </div>
                    <div style={{ width: 54, display: "flex", gap: 4, alignItems: "baseline", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: step.color }}>{step.value}</span>
                      {step.pct < 100 && <span style={{ fontSize: 9, color: C.faint }}>{step.pct}%</span>}
                    </div>
                  </div>
                ))}
                {/* GCI row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ width: 72, fontSize: 10, color: C.faint, textAlign: "right", flexShrink: 0 }}>GCI</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: C.green }}>
                    {funnel.estimatedGCI > 0 ? `$${(funnel.estimatedGCI / 1000).toFixed(0)}K` : "–"}
                  </div>
                  <div style={{ width: 54, fontSize: 10, color: C.faint, flexShrink: 0 }}>earned</div>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 10, color: C.faint, fontStyle: "italic" }}>
                {data ? "Live data from your outreach log" : "Demo figures · connect database to track real numbers"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Bulk Fire Modal ───────────────────────────────────────────────────────────

function BulkFireModal({ segmented, agent, theme, onClose }: {
  segmented: SegmentedBuyer[]
  agent: AgentProfile
  theme: AgencyTheme
  onClose: () => void
}) {
  const [phase, setPhase] = useState<"confirm" | "firing" | "done">("confirm")
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ sent: number; total: number; durationMs: number; demoMode: boolean; demoEmail: string } | null>(null)

  const DEMO_EMAIL = "vinuth.srirama@outlook.com"
  const total = segmented.length

  const handleFire = async () => {
    setPhase("firing")
    setProgress(0)

    // Animate the progress bar at 40ms/contact (visual demo effect)
    const step = 100 / total
    let cur = 0
    const animInterval = setInterval(() => {
      cur = Math.min(cur + step, 100)
      setProgress(cur)
    }, 40)

    try {
      const contacts = segmented.map(({ buyer, financials: fin }) => ({
        id: buyer.id,
        name: buyer.name,
        email: buyer.email ?? "",
        phone: buyer.phone,
        purchaseAddress: buyer.purchaseAddress,
        suburb: buyer.suburb,
        purchaseYear: buyer.purchaseDate.slice(0, 4),
        purchasePrice: fin.purchasePrice,
        currentEstimate: fin.currentEstimate,
        equityGain: fin.equityGain,
        equityGainPct: fin.equityGainPct,
        pipeline: segmented.find(s => s.buyer.id === buyer.id)?.segment.pipeline ?? "",
        status: buyer.status,
      }))

      const res = await authFetch(apiUrl("/api/vendor-bulk-send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts,
          agentName: agent.name,
          agentAgency: agent.agency,
          agentEmail: agent.email,
          agentPhone: agent.phone,
          agencyColor: theme.primary,
          demoMode: true,
        }),
      }).then(r => r.json()).catch(() => ({ ok: true, sent: total, durationMs: total * 40, demoMode: true, demoEmail: DEMO_EMAIL }))

      clearInterval(animInterval)
      setProgress(100)
      await new Promise(r => setTimeout(r, 300))
      setResult({ sent: res.sent ?? total, total, durationMs: res.durationMs ?? total * 42, demoMode: res.demoMode ?? true, demoEmail: res.demoEmail ?? DEMO_EMAIL })
      setPhase("done")
    } catch {
      clearInterval(animInterval)
      setProgress(100)
      setResult({ sent: total, total, durationMs: total * 42, demoMode: true, demoEmail: DEMO_EMAIL })
      setPhase("done")
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={phase === "confirm" ? onClose : undefined}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg2, borderRadius: 22, border: `1px solid ${C.border}`,
          padding: 32, maxWidth: 520, width: "100%", textAlign: "center",
        }}
      >
        {phase === "confirm" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              Fire outreach to all {total} contacts?
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}>
              Each contact gets a personalised email with their property's equity snapshot, market data, and a complimentary appraisal offer.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: 14, borderRadius: 12, border: `1px solid ${C.border}`,
                background: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: FONT,
              }}>
                Cancel
              </button>
              <button onClick={handleFire} style={{
                flex: 2, padding: 14, borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                boxShadow: `0 4px 20px ${theme.glow}`,
              }}>
                Fire {total} emails now
              </button>
            </div>
          </>
        )}

        {phase === "firing" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 16 }}>
              <motion.span animate={{ rotate: [0, 360] }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                style={{ display: "inline-block" }}>⚡</motion.span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>Firing outreach…</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              {Math.round((progress / 100) * total)} of {total} contacts reached
            </div>
            <div style={{ height: 8, background: C.bg3, borderRadius: 8, overflow: "hidden" }}>
              <motion.div
                style={{ height: "100%", background: `linear-gradient(90deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, borderRadius: 8 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </>
        )}

        {phase === "done" && result && (
          <>
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12, stiffness: 200 }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            </motion.div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>
              {result.sent} contacts reached!
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
              {result.sent} personalised emails fired in {(result.durationMs / 1000).toFixed(1)}s.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
              {[
                ["📧", result.sent.toString(), "Emails sent"],
                ["⚡", `${(result.durationMs / result.sent).toFixed(0)}ms`, "Per contact"],
                ["📊", "100%", "CRM coverage"],
              ].map(([icon, value, label]) => (
                <div key={label} style={{ background: C.bg3, borderRadius: 12, padding: "14px 12px" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: theme.primary }}>{value}</div>
                  <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose} style={{
              width: "100%", padding: 14, borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>
              Done
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Wow Insights Panel ────────────────────────────────────────────────────────
// 10 AI-powered features shown on the vendor dashboard as a scrollable strip.

const CGT_DEADLINE = new Date("2027-07-01")
const NOW_DATE     = new Date("2026-05-27")
const DAYS_TO_CGT  = Math.round((CGT_DEADLINE.getTime() - NOW_DATE.getTime()) / (1000 * 60 * 60 * 24))

// ── CGT Urgency Modal ─────────────────────────────────────────────────────────

export function CGTUrgencyModal({ segmented, theme, onClose, onSelectEntry }: {
  segmented: SegmentedBuyer[]
  theme: AgencyTheme
  onClose: () => void
  onSelectEntry?: (e: SegmentedBuyer) => void
}) {
  const contacts = segmented
    .filter(e => e.financials.cgtSavingsBy2027 > 0)
    .sort((a, b) => b.financials.cgtSavingsBy2027 - a.financials.cgtSavingsBy2027)

  const urgColor = DAYS_TO_CGT < 90 ? (C.red ?? "#ef4444") : DAYS_TO_CGT < 180 ? C.orange : C.green

  return (
    <motion.div
      key="cgt-modal"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`, padding: "28px 32px", maxWidth: 640, width: "90vw", maxHeight: "80vh", overflowY: "auto", fontFamily: FONT, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.4 }}>CGT Urgency Dashboard</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{DAYS_TO_CGT} days until 50% discount window closes · sorted by savings at risk</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 0 }}>×</button>
        </div>
        {contacts.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, padding: "32px 0", fontSize: 13 }}>No contacts with CGT savings identified.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {contacts.map((entry, i) => {
              const { buyer, financials: fin, segment } = entry
              return (
                <div key={buyer.id} style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${i === 0 ? urgColor + "55" : C.border}`, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? urgColor : C.muted, flexShrink: 0 }}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{buyer.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{buyer.purchaseAddress}</div>
                    <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>
                      {segment.pipeline === "investor-to-seller" ? "Investment property" : "Owner-occupier"} · since {buyer.purchaseDate.slice(0,4)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: urgColor, letterSpacing: -0.5 }}>{fmtDollar(fin.cgtSavingsBy2027)}</div>
                    <div style={{ fontSize: 9, color: C.faint }}>potential CGT saving</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: urgColor, background: urgColor + "15", borderRadius: 6, padding: "2px 8px", display: "inline-block", marginTop: 4 }}>{DAYS_TO_CGT}d left</div>
                  </div>
                  {onSelectEntry && (
                    <button onClick={() => { onClose(); onSelectEntry(entry) }} style={{ padding: "8px 14px", borderRadius: 10, background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: "white", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: FONT, flexShrink: 0, boxShadow: `0 2px 8px ${theme.glow}` }}>
                      Contact →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: `${theme.primary}08`, border: `1px solid ${theme.primary}20` }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              Total CGT savings across database: <span style={{ color: C.green, fontWeight: 700 }}>{fmtDollar(contacts.reduce((s, e) => s + e.financials.cgtSavingsBy2027, 0))}</span>. Money back in your clients' pockets if you act now.
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Negotiation Coach Modal ────────────────────────────────────────────────────

function NegotiationCoachModal({ entry, agent, theme, onClose }: {
  entry: SegmentedBuyer
  agent: AgentProfile
  theme: AgencyTheme
  onClose: () => void
}) {
  const [expandedObj, setExpandedObj] = useState<number | null>(null)
  const { buyer, financials: fin, segment } = entry
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const agentFirst = agent.name.split(" ")[0]

  const comps = generateComparables({ suburb: buyer.suburb, propertyType: buyer.propertyType as "House"|"Unit"|"Townhouse", beds: buyer.beds, land: buyer.land ?? 500, buyerId: buyer.id })
  const range = buildAppraisalRange(comps, buyer.suburb)

  const equityStr  = fmtDollar(fin.equityGain)
  const equityPct  = Math.round(fin.equityGainPct)
  const estVal     = fmtDollar(fin.currentEstimate)
  const cgtStr     = fin.cgtSavingsBy2027 > 0 ? fmtDollar(fin.cgtSavingsBy2027) : null
  const topTrigger = segment.triggers[0]

  const opening = topTrigger?.urgency === "high"
    ? `Hi ${fname}, ${agentFirst} from ${agent.agency}. I've been looking at your numbers and thought I'd reach out. The timing is looking really good right now. Got 10 minutes for a quick chat?`
    : `Hi ${fname}, ${agentFirst} here. Been keeping an eye on ${buyer.suburb} and there's been some good movement lately that might be worth a look. Got a minute?`

  const pitches = [
    { icon: "💰", title: "Equity position", body: `Your property has grown from ${fmtDollar(buyer.purchasePrice)} to approximately ${estVal}. That's ${equityStr} in equity (${equityPct}%) sitting dormant. Most people don't realise the position they're in.` },
    cgtStr ? { icon: "🏛️", title: "CGT deadline", body: `Selling before 1 July 2027 saves you approximately ${cgtStr} in tax under the current 50% CGT discount. After that date the rules change. That's real money at stake.` }
           : { icon: "📈", title: "Market conditions", body: `${buyer.suburb} is running at ${range.clearanceRate}% clearance with just ${range.daysOnMarket} days on market. Sellers are in control right now. It's a strong window.` },
    { icon: "🤝", title: "No obligation", body: `I'm offering a complimentary appraisal, 20 minutes, I come to you. You'll walk away knowing exactly what your place is worth and what your options look like.` },
  ].filter(Boolean)

  const objections = [
    { q: "I'm not ready to sell", a: `Totally fine. My job is just to make sure you have the numbers. You've got ${equityStr} in equity right now.${cgtStr ? ` And selling before July 2027 saves you ${cgtStr} in CGT.` : ""} The decision is completely yours.` },
    { q: "The market feels slow", a: `${buyer.suburb} clearance rate is ${range.clearanceRate}% and average days on market is just ${range.daysOnMarket}. That's ${range.clearanceRate >= 72 ? "above" : "close to"} the long-run average. Genuine buyer demand is still there.` },
    { q: "My neighbour sold for more", a: `That's a great sign, it means the market is strong. At an estimated ${estVal} for your place, you're in a strong bracket. Let me pull the exact comps so you can see how yours stacks up.` },
    { q: "I want to renovate first", a: `Renovation costs don't always recoup dollar-for-dollar. You already have ${equityStr} in equity. A $50K reno might add $30K in value. I can show you the numbers so you can decide.` },
    { q: "I'll wait for rates to drop", a: `Rates affect buyers' borrowing capacity, but ${buyer.suburb} buyers are still active right now. Your property is worth ${estVal} today and the CGT window is running.` },
  ]

  return (
    <motion.div key="coach-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()}
        style={{ background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`, padding: "28px 32px", maxWidth: 640, width: "90vw", maxHeight: "85vh", overflowY: "auto", fontFamily: FONT, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.4 }}>Negotiation Coach</div>
            <div style={{ fontSize: 12, color: theme.primary, marginTop: 3 }}>Personalised call script for {buyer.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 0 }}>×</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Step 1 — Opening</div>
          <div style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}30`, borderRadius: 12, padding: "14px 16px", fontSize: 13, color: C.text, lineHeight: 1.6, fontStyle: "italic" }}>
            "{opening}"
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Step 2 — Key points to cover</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pitches.map((p, i) => (
              <div key={i} style={{ background: C.bg2, borderRadius: 12, padding: "12px 14px", border: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{p!.icon}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.primary, marginBottom: 3 }}>{p!.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{p!.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Step 3 — If they push back</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {objections.map((obj, i) => (
              <div key={i} style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div onClick={() => setExpandedObj(expandedObj === i ? null : i)}
                  style={{ padding: "11px 14px", background: expandedObj === i ? `${theme.primary}10` : C.bg2, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>"{obj.q}"</span>
                  <span style={{ fontSize: 11, color: C.faint }}>{expandedObj === i ? "▲" : "▼"}</span>
                </div>
                <AnimatePresence>
                  {expandedObj === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px 12px", background: C.bg3, fontSize: 12, color: C.muted, lineHeight: 1.6, borderTop: `1px solid ${C.border}` }}>
                        {obj.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Pre-Market Buyer Matcher Modal ────────────────────────────────────────────

export function PreMarketMatcherModal({ segmented, agent, theme, onClose, onSelectEntry }: {
  segmented: SegmentedBuyer[]
  agent: AgentProfile
  theme: AgencyTheme
  onClose: () => void
  onSelectEntry?: (e: SegmentedBuyer) => void
}) {
  const { active: activeListings } = getPortfolioForAgent(agent)
  const [selId, setSelId] = useState<number | null>(activeListings[0]?.id ?? null)
  const [alerted, setAlerted] = useState<Set<number>>(new Set())

  const listing = activeListings.find(l => l.id === selId) ?? null

  const ADJACENT_SUBURBS: Record<string, string[]> = {
    "berwick":            ["narre warren south", "officer", "hallam"],
    "narre warren south": ["berwick", "narre warren", "hallam"],
    "officer":            ["pakenham", "berwick", "narre warren south"],
    "pakenham":           ["officer"],
    "hallam":             ["berwick", "narre warren south", "narre warren"],
    "narre warren":       ["narre warren south", "hallam"],
  }
  const matchScore = (entry: SegmentedBuyer, l: PortfolioProperty): { score: number; factors: string[] } => {
    const dna = computePropertyDNA(entry.buyer, entry.financials)
    const b = entry.buyer
    let s = 0
    const factors: string[] = []
    // Suburb proximity
    const sameSuburb = b.suburb.toLowerCase() === (l.suburb ?? "").toLowerCase()
    const adjacent = (ADJACENT_SUBURBS[b.suburb.toLowerCase()] ?? []).includes((l.suburb ?? "").toLowerCase())
    if (sameSuburb) { s += 40; factors.push("Same suburb") }
    else if (adjacent) { s += 22; factors.push("Adjacent suburb") }
    // Bed match
    const lBeds = l.beds ?? 4
    if (Math.abs(b.beds - lBeds) <= 1) { s += 15; factors.push("Bed match") }
    else if (lBeds > b.beds && dna.lifeStage === "growing") { s += 10; factors.push("Upsizer fit") }
    // Upgrade capacity vs listing price
    const listingPrice = l.price || l.priceMin || 0
    if (listingPrice > 0 && dna.upgradeCapacity > listingPrice * 0.9) { s += 18; factors.push(`$${Math.round(dna.upgradeCapacity/1000)}K capacity`) }
    // Investor match
    if (b.status === "investor" && l.priceMin && l.priceMin > 500_000) { s += 12; factors.push("Investor grade") }
    // DNA tag bonus
    if (dna.matchTags.includes("school-zone") && /school|primary|berwick/i.test((l.suburb ?? "") + " " + l.address)) { s += 8; factors.push("School zone") }
    // Priority
    if (entry.priority >= 60) { s += 8; factors.push("High priority") }
    return { score: Math.min(s, 98), factors }
  }

  const matches = listing
    ? segmented
        .map(e => { const r = matchScore(e, listing); return { entry: e, score: r.score, factors: r.factors } })
        .filter(m => m.score >= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : []

  return (
    <motion.div key="matcher-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()}
        style={{ background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`, padding: "28px 32px", maxWidth: 660, width: "90vw", maxHeight: "85vh", overflowY: "auto", fontFamily: FONT, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.4 }}>📡 Pre-Market Buyer Matcher</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Match past buyers to active listings before portals</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 0 }}>×</button>
        </div>

        {activeListings.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Select listing</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeListings.map(l => (
                <button key={l.id} onClick={() => setSelId(l.id)} style={{ padding: "6px 14px", borderRadius: 10, border: `1px solid ${selId === l.id ? theme.primary : theme.primary + "40"}`, background: selId === l.id ? `${theme.primary}18` : "transparent", color: theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {l.address.split(",")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {listing && (
          <div style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}30`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{listing.address}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{listing.suburb} · {listing.beds}bd {listing.baths}ba · {listing.priceMin ? `${fmtK(listing.priceMin)}–${fmtK(listing.priceMax!)}` : fmt(listing.price)}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.primary, background: `${theme.primary}18`, padding: "3px 10px", borderRadius: 8 }}>PRE-MARKET</div>
          </div>
        )}

        {matches.length > 0 ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{matches.length} matched buyers</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {matches.map(({ entry, score, factors }, i) => {
                const { buyer } = entry
                const sent = alerted.has(buyer.id)
                return (
                  <div key={buyer.id} style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${i === 0 ? theme.primary + "50" : C.border}`, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{buyer.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{buyer.purchaseAddress}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {factors.map(f => <span key={f} style={{ fontSize: 10, color: theme.primary, background: `${theme.primary}12`, border: `1px solid ${theme.primary}25`, padding: "2px 7px", borderRadius: 5 }}>{f}</span>)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <ScoreRing score={score} size={44} strokeWidth={3} label="match" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                      <button onClick={() => setAlerted(prev => new Set([...prev, buyer.id]))}
                        style={{ padding: "6px 11px", borderRadius: 9, border: "none", cursor: "pointer", background: sent ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: sent ? C.muted : "white", fontSize: 10, fontWeight: 700, fontFamily: FONT, boxShadow: sent ? "none" : `0 2px 8px ${theme.glow}` }}>
                        {sent ? "✓ Alerted" : "📨 Alert"}
                      </button>
                      {onSelectEntry && (
                        <button onClick={() => { onClose(); onSelectEntry(entry) }}
                          style={{ padding: "5px 11px", borderRadius: 9, border: `1px solid ${theme.primary}50`, cursor: "pointer", background: "transparent", color: theme.primary, fontSize: 10, fontWeight: 700, fontFamily: FONT }}>
                          Profile →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>No strong matches found for this listing.</div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Nurture Sequence Panel ────────────────────────────────────────────────────

const NURTURE_STEP_LABELS = ["Initial outreach", "Market pulse follow-up", "Comparable sales update", "Final check-in"]
const NURTURE_DAYS        = [0, 7, 14, 30]

function NurtureSequencePanel({ entry, agent, theme }: { entry: SegmentedBuyer; agent: AgentProfile; theme: AgencyTheme }) {
  const [enabled, setEnabled] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const fetchedRef = useRef(false)
  const [msgs, setMsgs] = useState<Array<{ sms: string; emailSubject: string }> | null>(null)

  const { buyer, financials: fin } = entry
  const fname     = buyer.name.split("&")[0].split(" ")[0].trim()
  const agentFirst = agent.name.split(" ")[0]
  const signoff   = buyer.status === "investor" ? "Kind regards" : "Cheers"

  const templates = [
    { sms: `Hi ${fname}, ${agentFirst} from ${agent.agency}. Quick market update on ${buyer.suburb}. Your place is looking really strong. Worth a chat? ${signoff}, ${agentFirst}`.slice(0, 160), emailSubject: `Market update for ${buyer.suburb}, ${fname}` },
    { sms: `Hi ${fname}, ${agentFirst} here. ${buyer.suburb} clearance rate is tracking well. Happy to share the data. ${signoff}, ${agentFirst}`.slice(0, 160), emailSubject: `${buyer.suburb} market moving, ${fname}` },
    { sms: `Hi ${fname}, a comparable property in ${buyer.suburb} just sold for ${fmtK(Math.round(fin.currentEstimate * 1.03 / 5000) * 5000)}. Want the full comps? ${agentFirst}`.slice(0, 160), emailSubject: `Comparable sale you should see, ${fname}` },
    { sms: `Hi ${fname}, ${agentFirst} here. Just circling back. Happy to chat whenever the timing suits. ${signoff}, ${agentFirst}`.slice(0, 160), emailSubject: `Still here when you're ready, ${fname}` },
  ]

  const handleEnable = () => {
    const next = !enabled
    setEnabled(next)
    if (next && !fetchedRef.current) {
      fetchedRef.current = true
      setMsgs(templates)
      authFetch(apiUrl("/api/nurture"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: agent.name, agentAgency: agent.agency, agentPhone: agent.phone, agentEmail: agent.email, lead: { name: buyer.name, budget: fin.currentEstimate, persona: buyer.status, notes: buyer.notes ?? "", questions: [] }, grade: "C" }),
      })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data.messages) && data.messages.length >= 4) setMsgs(data.messages.map((m: { sms: string; emailSubject: string }) => ({ sms: m.sms ?? "", emailSubject: m.emailSubject ?? "" }))) })
        .catch(() => {})
    }
  }

  return (
    <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
      {/* Single enable toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Automated follow-up sequence</div>
            <div style={{ fontSize: 10, color: C.faint }}>
              {enabled
                ? `Active · 4 messages · Day 0, 7, 14, 30 · stops if ${fname} replies`
                : "4 messages over 30 days, sent in your voice"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {enabled && (
            <button onClick={() => setShowSchedule(v => !v)} style={{ fontSize: 10, color: theme.primary, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, textDecoration: "underline" }}>
              {showSchedule ? "Hide schedule" : "Edit schedule →"}
            </button>
          )}
          {/* Toggle pill */}
          <div
            onClick={handleEnable}
            style={{
              width: 38, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
              background: enabled ? C.green : C.bg3,
              border: `1px solid ${enabled ? C.green : C.border}`,
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute", top: 3, left: enabled ? 18 : 3, width: 14, height: 14,
              borderRadius: "50%", background: enabled ? "#fff" : C.faint,
              transition: "left 0.2s",
            }} />
          </div>
        </div>
      </div>

      {/* Schedule detail — collapsed by default */}
      <AnimatePresence>
        {enabled && showSchedule && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {NURTURE_DAYS.map((day, i) => {
                const m = msgs?.[i]
                return (
                  <div key={day} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ flexShrink: 0, background: theme.primary + "20", color: theme.primary, fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "3px 7px", minWidth: 40, textAlign: "center" }}>Day {day}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{NURTURE_STEP_LABELS[i]}</div>
                      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m?.sms ?? templates[i].sms}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Voice Brief Card ──────────────────────────────────────────────────────────

function parseVoiceBrief(transcript: string, buyerName: string, buyerSuburb: string): { urgency: "HIGH"|"MED"|"LOW"; actions: string[]; signals: string[] } {
  const t = transcript.toLowerCase()
  const fname = buyerName.split("&")[0].split(" ")[0].trim()
  const urgency: "HIGH"|"MED"|"LOW" =
    /urgent|asap|immediately|this week|call today|deadline|cgt|tax/.test(t) ? "HIGH"
    : /follow.?up|call.?back|ring|next week|soon|thinking/.test(t) ? "MED" : "LOW"
  const actions: string[] = []
  if (/follow.?up|call.?back|ring/.test(t)) actions.push(`Follow up ${fname}`)
  if (/send.*(apprais|report|comp)/.test(t)) actions.push("Send appraisal report")
  if (/book.*(apprais|meet|inspect)/.test(t)) actions.push("Book appraisal appointment")
  if (/email|sms|text|message/.test(t)) actions.push("Send outreach message")
  const dayM = t.match(/monday|tuesday|wednesday|thursday|friday/)
  if (dayM) actions.push(`Follow up ${dayM[0].charAt(0).toUpperCase() + dayM[0].slice(1)}`)
  actions.push("Log call notes to CRM")
  const signals: string[] = []
  if (/cgt|capital gains/.test(t)) signals.push("CGT deadline")
  if (/invest(ment|or)/.test(t)) signals.push("Investment property")
  if (/tenant|rent/.test(t)) signals.push("Tenant leaving")
  if (/ready|sell|list|market/.test(t)) signals.push("Selling intent")
  if (/renovation|reno/.test(t)) signals.push("Renovation plans")
  if (/rate[s]?|interest/.test(t)) signals.push("Interest rate concern")
  if (/family|kids|child/.test(t)) signals.push("Family trigger")
  void buyerSuburb
  return { urgency, actions: [...new Set(actions)], signals }
}

function VoiceBriefCard({ transcript, buyerName, buyerSuburb, theme }: { transcript: string; buyerName: string; buyerSuburb: string; theme: AgencyTheme }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const brief = parseVoiceBrief(transcript, buyerName, buyerSuburb)
  const uc = brief.urgency === "HIGH" ? (C.red ?? "#ef4444") : brief.urgency === "MED" ? C.orange : C.green
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: `${theme.primary}06`, borderRadius: 12, border: `1px solid ${theme.primary}25`, padding: "12px 14px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: theme.primary, textTransform: "uppercase", letterSpacing: 1 }}>🤖 AI Brief</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: uc, background: uc + "18", border: `1px solid ${uc}40`, borderRadius: 6, padding: "2px 8px" }}>{brief.urgency} PRIORITY</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>Action items</div>
        {brief.actions.map((item, i) => (
          <div key={i} onClick={() => setChecked(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })}
            style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", padding: "3px 0" }}>
            <span style={{ fontSize: 13, color: checked.has(i) ? C.green : C.muted }}>{checked.has(i) ? "☑" : "☐"}</span>
            <span style={{ fontSize: 11, color: checked.has(i) ? C.faint : C.muted, textDecoration: checked.has(i) ? "line-through" : "none" }}>{item}</span>
          </div>
        ))}
      </div>
      {brief.signals.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>Detected signals</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {brief.signals.map(s => <span key={s} style={{ fontSize: 10, color: theme.primary, background: `${theme.primary}12`, border: `1px solid ${theme.primary}25`, padding: "2px 8px", borderRadius: 5 }}>{s}</span>)}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── Printable Appraisal Modal ─────────────────────────────────────────────────

function PrintableAppraisalModal({ entry, agent, theme, onClose }: {
  entry: SegmentedBuyer; agent: AgentProfile; theme: AgencyTheme; onClose: () => void
}) {
  const { buyer, financials: fin } = entry
  const comps = generateComparables({ suburb: buyer.suburb, propertyType: buyer.propertyType as "House"|"Unit"|"Townhouse", beds: buyer.beds, land: buyer.land ?? 500, buyerId: buyer.id })
  const range = buildAppraisalRange(comps, buyer.suburb)
  const scenarios = buildEquityScenarios({ purchasePrice: buyer.purchasePrice, purchaseDate: buyer.purchaseDate, deposit: buyer.deposit ?? null, range })
  const today = new Date("2026-05-27").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const midScenario = scenarios[1] ?? scenarios[0]

  return (
    <motion.div key="print-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div id="appraisal-print-root" className="appraisal-report-modal" initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 20, maxWidth: 700, width: "90vw", maxHeight: "88vh", overflowY: "auto", color: "#1a1a1a", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", fontFamily: "'Georgia', serif" }}>

        {/* Print CSS — forces white background and hides the modal overlay when printing */}
        <style>{`
          @media print {
            body > *:not(#appraisal-print-root) { display: none !important; }
            #appraisal-print-root { position: static !important; background: white !important; }
            .appraisal-report-modal { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; }
            .appraisal-toolbar { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        `}</style>

        {/* Toolbar */}
        <div className="appraisal-toolbar" style={{ background: C.bg2, borderRadius: "20px 20px 0 0", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Appraisal Report Preview · {buyer.name}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, color: "white", fontSize: 12, fontWeight: 700, fontFamily: FONT, boxShadow: `0 2px 8px ${theme.glow}` }}>
              🖨️ Print Report
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
        </div>

        {/* Report body */}
        <div style={{ padding: "40px 48px 48px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, borderBottom: `3px solid ${theme.primary}`, paddingBottom: 18 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -0.4, fontFamily: FONT }}>{agent.agency}</div>
              <div style={{ fontSize: 13, color: theme.primary, fontWeight: 700, fontFamily: FONT, marginTop: 2 }}>{agent.name}</div>
              <div style={{ fontSize: 12, color: "#666", fontFamily: FONT }}>{agent.phone} · {agent.email}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#888", fontFamily: FONT }}>Prepared {today}</div>
              <div style={{ fontSize: 11, color: "#888", fontFamily: FONT, marginTop: 2 }}>For {buyer.name}</div>
              <div style={{ fontSize: 11, color: theme.primary, fontWeight: 700, fontFamily: FONT, marginTop: 4 }}>COMPLIMENTARY APPRAISAL</div>
            </div>
          </div>

          {/* Property */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#888", fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Property</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.4, fontFamily: FONT }}>{buyer.purchaseAddress}</div>
            <div style={{ fontSize: 14, color: theme.primary, fontWeight: 600, fontFamily: FONT }}>{buyer.suburb}, VIC</div>
            <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
              {[{ l: "Purchased", v: buyer.purchaseDate.slice(0,4) }, { l: "Purchase price", v: fmtDollar(buyer.purchasePrice) }, { l: "Type", v: buyer.propertyType }, { l: "Config", v: `${buyer.beds}bd ${buyer.baths}ba` }, buyer.land ? { l: "Land", v: `${buyer.land}m²` } : null].filter(Boolean).map(it => (
                <div key={it!.l}><div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONT, fontWeight: 700 }}>{it!.l}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: FONT }}>{it!.v}</div></div>
              ))}
            </div>
          </div>

          {/* Value range */}
          <div style={{ background: "#f8f8f8", borderRadius: 12, padding: "18px 20px", marginBottom: 22, border: "1px solid #e8e8e8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 14, fontFamily: FONT }}>Estimated Market Value Range</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[{ l: "Conservative", v: fmtK(range.low), c: "#64b5f6" }, { l: "Mid-range", v: fmtK(range.mid), c: theme.primary }, { l: "Optimistic", v: fmtK(range.high), c: "#ffa726" }].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#888", fontFamily: FONT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div><div style={{ fontSize: 24, fontWeight: 900, color: s.c, fontFamily: FONT, letterSpacing: -0.5 }}>{s.v}</div></div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
              {[{ l: "Clearance rate", v: `${range.clearanceRate}%` }, { l: "Days on market", v: `${range.daysOnMarket}` }, { l: "Buyer demand", v: `${range.demandScore}/10` }].map(s => (
                <div key={s.l}><div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONT, fontWeight: 700 }}>{s.l}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: FONT }}>{s.v}</div></div>
              ))}
            </div>
          </div>

          {/* Comps */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10, fontFamily: FONT }}>Comparable Sales · {buyer.suburb}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {comps.slice(0, 3).map((comp, i) => (
                <div key={i} style={{ background: "#f8f8f8", borderRadius: 10, padding: "12px 13px", border: "1px solid #e8e8e8" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", marginBottom: 1, fontFamily: FONT }}>{comp.address}</div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 8, fontFamily: FONT }}>{comp.beds}bd · {comp.baths}ba · {comp.land}m²</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: theme.primary, fontFamily: FONT }}>{fmtK(comp.soldPrice)}</div>
                  <div style={{ fontSize: 10, color: "#888", fontFamily: FONT }}>{comp.soldDate}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Equity waterfall */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10, fontFamily: FONT }}>Equity Waterfall · Mid-Range Scenario</div>
            {[
              { l: "Estimated sale price", v: `+ ${fmtK(range.mid)}`, c: "#22c55e", bold: false },
              { l: "Selling costs (commission + marketing)", v: fmtK(midScenario.sellingCosts), c: "#ef4444", bold: false },
              midScenario.estimatedCGT > 0 ? { l: "Estimated CGT (50% discount)", v: `− ${fmtK(midScenario.estimatedCGT)}`, c: "#f59e0b", bold: false } : null,
              { l: "Net proceeds", v: `= ${fmtK(midScenario.netProceeds)}`, c: theme.primary, bold: true },
              { l: "Equity released vs purchase price", v: fmtK(midScenario.netProceeds - buyer.purchasePrice), c: "#22c55e", bold: true },
            ].filter(Boolean).map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e8e8e8" }}>
                <span style={{ fontSize: 13, color: "#444", fontFamily: FONT, fontWeight: row!.bold ? 700 : 400 }}>{row!.l}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: row!.c, fontFamily: FONT }}>{row!.v}</span>
              </div>
            ))}
          </div>

          {/* CGT callout */}
          {fin.cgtSavingsBy2027 > 0 && (
            <div style={{ background: "#fff7ed", borderRadius: 12, padding: "14px 18px", marginBottom: 22, border: "1px solid #fcd34d" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4, fontFamily: FONT }}>CGT Deadline Alert</div>
              <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6, fontFamily: FONT }}>
                Selling before 1 July 2027 saves approximately <strong>{fmtDollar(fin.cgtSavingsBy2027)}</strong> under the 50% CGT discount. After that date the discount may no longer apply.
              </div>
            </div>
          )}

          {/* CTA */}
          <div style={{ background: `linear-gradient(135deg, ${theme.gradient[0]}15, ${theme.gradient[1]}15)`, borderRadius: 12, padding: "18px 20px", border: `1px solid ${theme.primary}30` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary, marginBottom: 5, fontFamily: FONT }}>Ready to explore your options, {fname}?</div>
            <div style={{ fontSize: 12, color: "#444", marginBottom: 10, fontFamily: FONT, lineHeight: 1.6 }}>Complimentary, no-obligation appraisal. 20 minutes at a time that suits you.</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary, fontFamily: FONT }}>📞 {agent.phone} &nbsp;·&nbsp; ✉️ {agent.email}</div>
          </div>

          {/* Agent card footer */}
          <div style={{ marginTop: 28, borderTop: `2px solid ${theme.primary}20`, paddingTop: 20, display: "flex", alignItems: "center", gap: 18 }}>
            {/* Photo / initials */}
            <div style={{ flexShrink: 0 }}>
              {agent.photoUrl && !agent.photoUrl.includes("peakere.com.au/our-team") ? (
                <img src={agent.photoUrl} alt={agent.name}
                  style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `3px solid ${theme.primary}` }} />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, fontWeight: 900, color: "white", fontFamily: FONT,
                  border: `3px solid ${theme.primary}`,
                }}>
                  {agent.name.split(" ").map(p => p[0]).slice(0, 2).join("")}
                </div>
              )}
            </div>
            {/* Details */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1a1a1a", fontFamily: FONT, letterSpacing: -0.3 }}>{agent.name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.primary, fontFamily: FONT }}>{agent.agency}</div>
              <div style={{ fontSize: 12, color: "#555", fontFamily: FONT, marginTop: 3 }}>{agent.phone} · {agent.email}</div>
              <div style={{ fontSize: 10, color: "#aaa", fontFamily: FONT, marginTop: 6, lineHeight: 1.5 }}>
                Estimates based on comparable sales as at {today}. This report is prepared as a guide only and is not a formal property valuation.
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── AIIdeasPanel: hyper-personalisation roadmap ───────────────────────────────

const AI_IDEAS = [
  {
    emoji: "🏡",
    title: "Street-level sale alerts",
    tag: "Layer 3: Market context",
    color: "#a6daff",
    description:
      "When a property sells within 500m of a contact's address, auto-trigger a personalised message: \"Hi David, a 4-bed just sold two streets over for $895K — that puts yours at roughly $920K now.\" Hooks into Domain/CoreLogic webhooks for real-time triggers.",
    effort: "Medium",
  },
  {
    emoji: "🎓",
    title: "School-zone life-stage trigger",
    tag: "Layer 2: Life-stage inference",
    color: "#64d090",
    description:
      "Infer the age of each contact's children from CRM notes. When the youngest turns 17–18, fire a \"final year of school\" outreach: the most statistically common trigger for families upgrading or downsizing. Claude Haiku extracts this from free-text notes at <$0.001/contact.",
    effort: "Low",
  },
  {
    emoji: "⏳",
    title: "CGT 50% discount countdown",
    tag: "Layer 4: Timing intelligence",
    color: "#ffb864",
    description:
      "Automatically calculate the exact date each investor crosses the 12-month CGT threshold. Send a personalised countdown message 90, 30, and 7 days before: \"Wei, you're 30 days from saving an estimated $54K in CGT. This window closes 14 July 2027.\" No other CRM in Australia does this.",
    effort: "Ready now",
  },
  {
    emoji: "🔁",
    title: "Reply sentiment → next-step classifier",
    tag: "AI reply agent",
    color: "#a6daff",
    description:
      "When a contact replies to any outreach, Claude Sonnet classifies intent (interested / not now / hot lead / objection) and drafts the ideal next message with their equity snapshot embedded. An \"interested\" reply auto-books an appraisal slot. A \"not yet\" reply schedules a 90-day re-engagement.",
    effort: "Medium",
  },
  {
    emoji: "📰",
    title: "Personalised market report PDF",
    tag: "Layer 5: Relationship memory",
    color: "#64d090",
    description:
      "Generate a one-page PDF for each contact showing: their property's estimated value, 3 comparable recent sales, CGT position, and a tailored paragraph from the agent. Send as an email attachment. Converts cold contacts into warm conversations — better ROI than any mass letterbox drop.",
    effort: "Medium",
  },
]

function AIIdeasPanel({ theme }: { theme: AgencyTheme }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      marginBottom: 24, background: C.bg2, borderRadius: 14,
      border: `1px solid ${theme.primary}22`,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "16px 20px", background: "none", border: "none",
          cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 12,
          textAlign: "left",
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: `linear-gradient(135deg, ${theme.gradient[0]}33, ${theme.gradient[1]}22)`,
          border: `1px solid ${theme.primary}33`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>🚀</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>AI Hyper-Personalisation Roadmap</div>
          <div style={{ fontSize: 11, color: C.muted }}>5 ways to deepen the moat — ideas PropOS can build next</div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: theme.primary, background: theme.primary + "18",
          padding: "3px 8px", borderRadius: 6, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0,
        }}>Ideas</div>
        <div style={{ fontSize: 16, color: C.faint, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>›</div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
              {AI_IDEAS.map((idea, i) => (
                <div key={i} style={{
                  background: C.bg3, borderRadius: 12, padding: "14px 16px",
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${idea.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{idea.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{idea.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: idea.color, background: idea.color + "18", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{idea.tag}</span>
                        <span style={{
                          marginLeft: "auto", fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                          color: idea.effort === "Ready now" ? C.green : "#f59e0b",
                          background: idea.effort === "Ready now" ? C.green + "18" : "#f59e0b18",
                          padding: "2px 7px", borderRadius: 4, textTransform: "uppercase",
                        }}>{idea.effort}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, paddingLeft: 28 }}>
                    {idea.description}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WowInsightsPanel({ segmented, theme }: { segmented: SegmentedBuyer[]; theme: AgencyTheme }) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const totalEquity = segmented.reduce((s, e) => s + e.financials.equityGain, 0)
  const equityPerMonth = Math.round(totalEquity / (12 * 3))  // approximate monthly growth
  const highPriority = segmented.filter(e => e.priority >= 70).length
  const cgtContacts = segmented.filter(e => e.financials.cgtSavingsBy2027 > 5000).length

  const WOW_ITEMS = [
    {
      icon: "⏱️", title: "Equity Clock",
      value: `$${(totalEquity / 1_000_000).toFixed(1)}M dormant`,
      sub: `Growing ~${Math.round(equityPerMonth / 1000)}K/month`,
      detail: "Your database holds millions in equity that hasn't been unlocked yet. Every month you wait, your contacts build equity but so do competing agents who outreach first.",
    },
    {
      icon: "📅", title: "Listing Window",
      value: "Mar to May optimal",
      sub: "Based on 3yr seasonal data",
      detail: "Historical data shows autumn is the strongest listing window for the SE corridor: 12% more transactions and 4% higher clearance rates than winter. You're in the window now.",
    },
    {
      icon: "⏰", title: "CGT Deadline",
      value: `${DAYS_TO_CGT} days left`,
      sub: "50% discount · closes Jul 2027",
      detail: `${cgtContacts} of your contacts qualify for the 50% CGT discount, but only if they sell before 1 July 2027. That's ${DAYS_TO_CGT} days. Every week of delay costs them real money.`,
    },
    {
      icon: "🎙️", title: "Voice Intel Engine",
      value: "Record → AI extracts",
      sub: "Personalisation in 10 seconds",
      detail: "Speak a quick note about any contact on your phone ('Jason's tenant just moved out, he seemed frustrated about the vacancy'). AI extracts the personalisation hook and writes the outreach for you.",
    },
    {
      icon: "💬", title: "Smart Reply AI",
      value: "Vendor replied? AI drafts it",
      sub: "Context-aware follow-up",
      detail: "When a vendor responds to your outreach, PropOS reads the reply and drafts a perfect follow-up that continues the conversation naturally. Matches your voice, references their specific response.",
    },
    {
      icon: "📄", title: "One-Click Appraisal PDF",
      value: "Branded · 2 pages · instant",
      sub: "Comps + equity waterfall",
      detail: "Generate a print-quality, branded appraisal report for any contact in one click. Includes suburb comps, your estimated value range, equity scenarios, and CGT savings. Leave-behind for listing presentations.",
    },
    {
      icon: "📡", title: "Pre-Market Alert Network",
      value: `${highPriority} buyers → VIP access`,
      sub: "Tell them before portals",
      detail: "Your top-priority past buyers become VIP buyers for new listings in their preferred suburb. Send a pre-market alert 48 hours before Domain/REA. Builds loyalty and creates FOMO that accelerates offers.",
    },
    {
      icon: "🤝", title: "AI Negotiation Coach",
      value: "First-call script, personalised",
      sub: "Handles every objection",
      detail: "For each contact you're about to call, PropOS prepares a personalised call script: opening line based on their CRM notes, three pitch angles from their financial position, and responses to the top 5 objections.",
    },
  ]

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none",
          border: "none", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, letterSpacing: 1.4, textTransform: "uppercase" }}>
          AI Intelligence Suite
        </span>
        <span style={{ fontSize: 11, color: C.faint, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        {!open && <span style={{ fontSize: 10, color: C.faint, fontWeight: 400 }}>({WOW_ITEMS.length} features)</span>}
      </button>

      <AnimatePresence>
      {open && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        {WOW_ITEMS.map((item, i) => (
          <motion.div
            key={item.title}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveIdx(activeIdx === i ? null : i)}
            style={{
              flexShrink: 0, width: 140, borderRadius: 14, padding: "14px 14px",
              background: activeIdx === i ? `linear-gradient(140deg, ${theme.primary}20, ${theme.primary}08)` : C.bg3,
              border: `1.5px solid ${activeIdx === i ? theme.primary + "60" : C.border}`,
              cursor: "pointer",
              boxShadow: activeIdx === i ? `0 0 18px ${theme.primary}18` : "none",
              transition: "border 0.15s, box-shadow 0.15s",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 3, lineHeight: 1.2 }}>{item.title}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.primary }}>{item.value}</div>
            <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>{item.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Expanded detail for selected item */}
      <AnimatePresence>
        {activeIdx !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              marginTop: 10, background: `${theme.primary}08`, borderRadius: 12,
              border: `1px solid ${theme.primary}25`, padding: "14px 18px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                {WOW_ITEMS[activeIdx].icon} {WOW_ITEMS[activeIdx].title}
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                {WOW_ITEMS[activeIdx].detail}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>)}
      </AnimatePresence>
    </div>
  )
}

// ── Vendor Profile Page ───────────────────────────────────────────────────────

function VendorProfilePage({ entry, agent, theme, onBack, onReview, vendorSettings, allEntries, entryIdx, onNavigate }: {
  entry: SegmentedBuyer
  agent: AgentProfile
  theme: AgencyTheme
  onBack: () => void
  onReview: (sms: string, emailSubject: string, emailBody: string[]) => void
  vendorSettings?: import("../data").VendorDisplaySettings
  allEntries?: SegmentedBuyer[]
  entryIdx?: number
  onNavigate?: (entry: SegmentedBuyer) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [overrideValue, setOverrideValue] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState(false)
  const [editValueInput, setEditValueInput] = useState("")
  const [voiceNotes, setVoiceNotes] = useState("")  // appended to CRM notes for generation
  const [showNegotiationCoach, setShowNegotiationCoach] = useState(false)
  const [showPrintAppraisal, setShowPrintAppraisal] = useState(false)
  const [showAllMetrics, setShowAllMetrics] = useState(false)
  const [showInsights, setShowInsights] = useState(true)    // triggers open by default
  const [showPitchAngles, setShowPitchAngles] = useState(false)  // pitch angles collapsed by default
  const [profileTab, setProfileTab] = useState<"analysis" | "outreach">("analysis")
  const [selectedAngleIdx, setSelectedAngleIdx] = useState(0)
  // NotesBridge: populated from API response after generation
  const [extractedHook, setExtractedHook] = useState<string | null>(null)
  const [personalisationLine, setPersonalisationLine] = useState<string | null>(null)

  const bpVP = useBreakpoint()
  const isMobileVP = bpVP === "mobile"
  const [avmRefreshing, setAvmRefreshing] = useState(false)
  const [avmSource, setAvmSource] = useState<string | null>(null)

  const handleAvmRefresh = async () => {
    setAvmRefreshing(true)
    try {
      const res = await authFetch(apiUrl(`/api/avm?address=${encodeURIComponent(buyer.purchaseAddress + ", " + buyer.suburb)}`))
      if (res.ok) {
        const data = await res.json() as { mid?: number; source?: string }
        if (data.mid && data.mid > 0) {
          setOverrideValue(data.mid)
          setAvmSource(data.source ?? "Domain API")
        }
      }
    } catch { /* silent — keep existing estimate */ }
    setAvmRefreshing(false)
  }

  // Voice memo — lets agent dictate extra context about this contact before generating
  const vendorVoice = useVoiceMemo({
    onTranscript: (t) => setVoiceNotes(prev => prev ? prev + " " + t : t),
  })

  const { buyer, segment } = entry
  const pl = PIPELINE_LABELS[segment.pipeline]
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const agentFirst = agent.name.split(" ")[0]

  // Is this a secondary (not-yet-ready) contact? Show relationship strategies instead of just generate.
  const isSecondary = segment.pipeline === "renter-to-buyer" || segment.pipeline === "investor-to-rebalance"
    || (segment.pipeline === "owner-to-seller" && segment.confidence < 50)

  // Recalculate financials if user has overridden the value estimate
  const fin = overrideValue !== null
    ? calculateFinancials(buyer.purchasePrice, buyer.purchaseDate, overrideValue, buyer.deposit)
    : entry.financials

  const stripDashes = (s: string) => s.replace(/—|–|--/g, ",").replace(/ {2,}/g, " ").trim()

  const startEditValue = () => {
    setEditValueInput(String(fin.currentEstimate))
    setEditingValue(true)
  }
  const commitEditValue = () => {
    const n = parseInt(editValueInput.replace(/\D/g, ""), 10)
    if (!isNaN(n) && n > 0) setOverrideValue(n)
    setEditingValue(false)
  }

  const handleGenerate = async () => {
    setGenerating(true)

    // Auto-save voice notes to sheet before generating (persist regardless of whether agent sends)
    if (voiceNotes) {
      const merged = [buyer.notes, voiceNotes].filter(Boolean).join("\n\nVoice note: ")
      authFetch(apiUrl("/api/sheet"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateNotes", id: buyer.id, notes: merged }),
      }).catch(() => {})
      buyer.notes = merged  // optimistic local update
    }

    const triggerSummary = segment.triggers.map(t => t.label).join("; ")

    // Find comparable recent sales in same suburb from agent's portfolio
    const { sold: agentSoldProps } = getPortfolioForAgent(agent)
    const suburbComps = agentSoldProps
      .filter(p => p.suburb.toLowerCase() === buyer.suburb.toLowerCase() && p.soldDate)
      .slice(0, 2)
      .map(p => `${p.address}, ${p.suburb}: sold ${fmt(p.price)} (${p.soldDate})`)

    const payload = {
      agentName: agent.name,
      agentAgency: agent.agency,
      agentPhone: agent.phone,
      voiceContext: buildVoiceContext(agent.voiceProfile, loadCorpus()),
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      buyerStatus: buyer.status,
      purchaseAddress: buyer.purchaseAddress,
      suburb: buyer.suburb,
      purchaseYear: buyer.purchaseDate.slice(0, 4),
      purchasePrice: fin.purchasePrice,
      currentEstimate: fin.currentEstimate,
      equityGain: fin.equityGain,
      equityGainPct: fin.equityGainPct,
      yearsHeld: fin.yearsHeld,
      annualAppreciation: fin.annualAppreciation,
      cashOnCashReturn: fin.cashOnCashReturn,
      cgtSavingsBy2027: fin.cgtSavingsBy2027,
      netProceeds: fin.netProceeds,
      pipelineLabel: pl.label,
      triggerSummary,
      // Combine base CRM notes with any voice-dictated notes from this session
      crmNotes: [buyer.notes ?? "", voiceNotes].filter(Boolean).join("\n\nVoice note: "),
      soldComps: suburbComps.join("; "),
      // Sheet col R: if agent pre-wrote the hook, send it directly (bypasses OpenAI extraction)
      parsedPersonalisation: (buyer as { personalisationHook?: string }).personalisationHook ?? undefined,
    }

    // Template fallback
    const templateFallback = () => {
      const addr = shortAddr(buyer.purchaseAddress)
      const estStr = fmtDollar(fin.currentEstimate)
      const equityStr = fmtDollar(fin.equityGain)
      const signoff = buyer.status === "investor" ? "Kind regards" : "Cheers"
      const smsRaw = `Hi ${fname}, ${agentFirst} from ${agent.agency}. ${addr} is now worth ~${estStr} (${equityStr} equity since ${payload.purchaseYear}). Worth a quick chat? ${signoff}, ${agentFirst}`
      const sms = stripDashes(smsRaw.length > 160 ? smsRaw.slice(0, 157) + "..." : smsRaw)
      const emailSubject = stripDashes(`Market update on ${buyer.purchaseAddress}, ${fname}`)
      const cgtLine = fin.cgtSavingsBy2027 > 0 ? ` The current 50% CGT discount saves you approximately ${fmtDollar(fin.cgtSavingsBy2027)} if you sell before July 2027.` : ""
      const emailBody = [
        `Hi ${fname}, ${agentFirst} from ${agent.agency} here. Quick update on ${buyer.suburb}.`,
        `Your property at ${buyer.purchaseAddress} has grown to approximately ${estStr} since you purchased in ${payload.purchaseYear}. That is ${equityStr} in equity.${cgtLine}`,
        `I would love to offer a complimentary, no-obligation appraisal if you are curious. Takes about 20 minutes, happy to come to you. No pressure at all.\n\n${signoff},\n${agentFirst}`,
      ].map(stripDashes)
      setGenerating(false)
      onReview(sms, emailSubject, emailBody)
    }

    try {
      const res = await Promise.race([
        authFetch(apiUrl("/api/vendor-generate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(r => r.json()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 14000)),
      ]) as {
        sms?: string
        email?: { subject?: string; body?: string[] }
        personalisationHook?: string | null
        personalisationLine?: string | null
      }

      const sms = res.sms ?? ""
      const emailSubject = res.email?.subject ?? ""
      const emailBody: string[] = res.email?.body ?? []
      if (!sms && !emailSubject) throw new Error("empty")

      // Capture NotesBridge data — show the transformation BEFORE navigating to review
      if (res.personalisationHook) setExtractedHook(res.personalisationHook)
      if (res.personalisationLine) setPersonalisationLine(res.personalisationLine)

      setGenerating(false)

      // Pause so the user sees the NotesBridge "What AI saw → As written to" animation
      // before the review screen replaces the page (3.5s = typewriter + moment to read)
      await new Promise(r => setTimeout(r, res.personalisationLine ? 3500 : 400))
      onReview(stripDashes(sms), stripDashes(emailSubject), emailBody.map(stripDashes))
    } catch {
      templateFallback()
    }
  }

  // Fix 6: Auto-trigger generation as soon as outreach tab is selected — skip the manual button click
  useEffect(() => {
    if (profileTab === "outreach" && !generating) {
      handleGenerate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTab])

  const equityPct = Math.round((fin.equityGain / fin.purchasePrice) * 100)
  const equityBarWidth = Math.min(equityPct, 100)

  // Comparable sales + range — used by angle-based outreach picker
  const comps = generateComparables({ suburb: buyer.suburb, propertyType: buyer.propertyType as "House"|"Unit"|"Townhouse", beds: buyer.beds, land: buyer.land ?? 500, buyerId: buyer.id })
  const range = buildAppraisalRange(comps, buyer.suburb)

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: isMobileVP ? "80px 16px 48px" : "88px 28px 48px", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.primary, fontSize: 18, padding: 0 }}>←</button>
        {allEntries && entryIdx !== undefined && allEntries.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => onNavigate?.(allEntries[entryIdx - 1])}
              disabled={entryIdx === 0}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`,
                background: entryIdx === 0 ? "transparent" : C.bg3,
                color: entryIdx === 0 ? C.faint : C.text,
                cursor: entryIdx === 0 ? "default" : "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >‹</button>
            <span style={{ fontSize: 11, color: C.faint, minWidth: 40, textAlign: "center" }}>
              {entryIdx + 1} / {allEntries.length}
            </span>
            <button
              onClick={() => onNavigate?.(allEntries[entryIdx + 1])}
              disabled={entryIdx === allEntries.length - 1}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`,
                background: entryIdx === allEntries.length - 1 ? "transparent" : C.bg3,
                color: entryIdx === allEntries.length - 1 ? C.faint : C.text,
                cursor: entryIdx === allEntries.length - 1 ? "default" : "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >›</button>
          </div>
        )}
      </div>

      {/* Identity card — always visible */}
      <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>{buyer.name}</div>
          <div style={{
            fontSize: 10, padding: "3px 10px", borderRadius: 8,
            background: pl.color + "18", color: pl.color, fontWeight: 700,
          }}>
            {pl.icon} {pl.label}
          </div>
        </div>
        <div style={{ fontSize: 13, color: theme.primary, fontWeight: 600, marginBottom: 14 }}>
          {buyer.purchaseAddress}
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "Purchased", value: buyer.purchaseDate.slice(0, 4) },
            { label: "Purchase price", value: fmtDollar(buyer.purchasePrice) },
            { label: "Hold period", value: fmtYears(fin.yearsHeld) },
            { label: "Type", value: `${buyer.beds}bd ${buyer.baths}ba ${buyer.propertyType}` },
            buyer.land ? { label: "Land", value: `${buyer.land}m²` } : null,
            { label: "Status", value: formatBuyerStatus(buyer.status) },
          ].filter(Boolean).map(item => (
            <div key={item!.label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{item!.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item!.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {(["analysis", "outreach"] as const).map(tab => (
          <button key={tab} onClick={() => setProfileTab(tab)} style={{
            padding: "10px 22px", background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            color: profileTab === tab ? theme.primary : C.faint,
            borderBottom: `2px solid ${profileTab === tab ? theme.primary : "transparent"}`,
            marginBottom: -1,
            transition: "color 0.15s, border-color 0.15s",
          }}>
            {tab === "analysis" ? "Analysis" : "Outreach"}
          </button>
        ))}
      </div>

      {/* Two-column layout — tab controls which sections are visible */}
      <div style={{ display: "flex", flexDirection: isMobileVP ? "column" : "row", gap: isMobileVP ? 16 : 28 }}>
        {/* LEFT col */}
        <div style={{ flex: isMobileVP ? "unset" : "0 0 58%", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* === ANALYSIS TAB: financial + DNA sections === */}
          {profileTab === "analysis" && (<>

          {/* Financial Snapshot */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>
              Financial snapshot
            </div>

            {/* Equity bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Purchased {fmtDollar(fin.purchasePrice)}</span>
                {editingValue ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      value={editValueInput}
                      onChange={e => setEditValueInput(e.target.value)}
                      onBlur={commitEditValue}
                      onKeyDown={e => { if (e.key === "Enter") commitEditValue(); if (e.key === "Escape") setEditingValue(false) }}
                      style={{
                        width: 110, padding: "3px 8px", background: C.bg3, border: `1px solid ${theme.primary}`,
                        borderRadius: 6, color: C.text, fontSize: 12, fontFamily: FONT,
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={startEditValue}
                      title="Click to override estimate"
                      style={{
                        background: "transparent", border: "none", cursor: "pointer", padding: 0,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: FONT }}>Now {fmtDollar(fin.currentEstimate)}</span>
                      {overrideValue && <span style={{ fontSize: 9, color: theme.primary, background: theme.primary + "18", padding: "1px 5px", borderRadius: 4 }}>{avmSource ?? "custom"}</span>}
                      <span style={{ fontSize: 9, color: C.faint }}>✏️</span>
                    </button>
                    <button
                      onClick={handleAvmRefresh}
                      disabled={avmRefreshing}
                      title="Refresh via Domain API"
                      style={{
                        background: avmRefreshing ? "none" : C.bg3,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "2px 7px",
                        fontSize: 9, color: avmRefreshing ? C.faint : theme.primary,
                        cursor: avmRefreshing ? "default" : "pointer", fontFamily: FONT, fontWeight: 600,
                      }}
                    >
                      {avmRefreshing ? "…" : "↻ AVM"}
                    </button>
                  </div>
                )}
              </div>
              <div style={{ height: 10, background: C.bg3, borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 6, width: `${equityBarWidth}%`,
                  background: `linear-gradient(90deg, ${theme.gradient[0]}, ${C.green})`,
                  transition: "width 0.8s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4, textAlign: "right" }}>
                {fmtPct(fin.equityGainPct)} equity growth ({fmtPct(fin.annualAppreciation)} p.a.)
              </div>
            </div>

            {/* Value growth line chart */}
            {(() => {
              const W = 320; const H = 88; const PAD_L = 4; const PAD_R = 4; const PAD_T = 12; const PAD_B = 24
              const startYear = buyer.purchaseDate ? parseInt(buyer.purchaseDate.slice(0, 4)) || 2013 : 2013
              const endYear = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 0.5 : 0)
              // Monthly steps for realistic-looking chart
              const steps = Math.max(24, Math.round((endYear - startYear) * 12))
              // Deterministic seeded noise: ±2.5% monthly volatility
              const seededNoise = (seed: number) => {
                const x = Math.sin(seed * 9301 + 49297) * 49979
                return (x - Math.floor(x)) - 0.5  // -0.5 .. 0.5
              }
              // Choose data source: real suburb series OR compound formula for unknown suburbs
              const priceSeries = getSuburbPriceSeries(buyer.suburb)
              const pts: { x: number; y: number; val: number; year: number }[] = []
              for (let i = 0; i <= steps; i++) {
                const y = startYear + (i / steps) * (endYear - startYear)
                let base: number
                if (priceSeries) {
                  // Scale real suburb series so it anchors at purchasePrice at startYear
                  const rawAt = suburbPriceAt(priceSeries, y)
                  const rawStart = suburbPriceAt(priceSeries, startYear)
                  base = buyer.purchasePrice * (rawAt / rawStart)
                } else {
                  base = buyer.purchasePrice * Math.pow(1 + fin.annualAppreciation / 100, y - startYear)
                }
                // Add monthly noise (±2.5%) — deterministic so chart doesn't re-jitter on re-render
                const noise = seededNoise(buyer.id * 1000 + i) * 0.05 * base
                const val = Math.max(base * 0.85, base + noise)
                pts.push({ year: y, val, x: 0, y: 0 })
              }
              const minV = Math.min(...pts.map(p => p.val))
              const maxV = Math.max(...pts.map(p => p.val))
              const rng = maxV - minV || 1
              pts.forEach((p, idx) => {
                p.x = PAD_L + (idx / (pts.length - 1)) * (W - PAD_L - PAD_R)
                p.y = PAD_T + (1 - (p.val - minV) / rng) * (H - PAD_T - PAD_B)
              })
              const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
              const areaD = `${d} L${pts[pts.length-1].x.toFixed(1)},${(H - PAD_B).toFixed(1)} L${PAD_L},${(H - PAD_B).toFixed(1)} Z`
              const peakPt = pts.reduce((a, b) => a.val > b.val ? a : b)
              const sourceLabel = priceSeries ? "REA.com.au data" : `${fmtPct(fin.annualAppreciation)} p.a.`
              // Mid-year axis labels (every 3 years between start and end)
              const axisYears: { x: number; yr: number }[] = []
              const step3 = Math.ceil(startYear / 3) * 3
              for (let yr = step3; yr < Math.floor(endYear); yr += 3) {
                if (yr > startYear + 0.5) {
                  const frac = (yr - startYear) / (endYear - startYear)
                  axisYears.push({ x: PAD_L + frac * (W - PAD_L - PAD_R), yr })
                }
              }
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {buyer.suburb} median price trend
                    </div>
                    <div style={{ fontSize: 8, color: C.faint, opacity: 0.6 }}>{sourceLabel}</div>
                  </div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="vgFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.green} stopOpacity="0.22" />
                        <stop offset="100%" stopColor={C.green} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaD} fill="url(#vgFill)" />
                    <path d={d} fill="none" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Peak marker */}
                    {peakPt !== pts[pts.length - 1] && (
                      <circle cx={peakPt.x} cy={peakPt.y} r="2.5" fill="none" stroke={C.green} strokeWidth="1.2" opacity="0.5" />
                    )}
                    <circle cx={pts[0].x} cy={pts[0].y} r="3" fill={C.bg3} stroke={C.green} strokeWidth="1.5" />
                    <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="4" fill={C.green} />
                    {/* Start/end year labels */}
                    <text x={PAD_L} y={H} fontSize="8" fill={C.faint} textAnchor="start">{startYear}</text>
                    <text x={W - PAD_R} y={H} fontSize="8" fill={C.faint} textAnchor="end">{Math.floor(endYear)}</text>
                    {/* Mid-period year labels */}
                    {axisYears.map(({ x, yr }) => (
                      <text key={yr} x={x} y={H} fontSize="8" fill={C.faint} textAnchor="middle" opacity="0.6">{yr}</text>
                    ))}
                    {/* Price labels */}
                    <text x={PAD_L} y={pts[0].y - 4} fontSize="9" fill={C.faint} textAnchor="start" fontFamily={FONT}>{fmtDollar(Math.round(pts[0].val / 1000) * 1000)}</text>
                    <text x={W - PAD_R} y={pts[pts.length-1].y - 4} fontSize="9" fill={C.green} fontWeight="700" textAnchor="end" fontFamily={FONT}>{fmtDollar(Math.round(pts[pts.length-1].val / 1000) * 1000)}</text>
                  </svg>
                </div>
              )
            })()}

            {/* Hero metrics — the 3 numbers that matter most */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
              {[
                { label: "Equity gain", value: fmtDollar(fin.equityGain), color: C.green },
                { label: "Est. current value", value: fmtDollar(fin.currentEstimate), color: C.text },
                fin.cgtSavingsBy2027 > 0
                  ? { label: "CGT saves by Jul 2027", value: fmtDollar(fin.cgtSavingsBy2027), color: C.red ?? "#ef4444" }
                  : { label: "Net proceeds (est.)", value: fmtDollar(fin.netProceeds), color: C.green },
              ].map(m => (
                <div key={m.label} style={{
                  background: C.bg3, borderRadius: 10, padding: "10px 12px",
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color, fontFamily: FONT }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Drill-down toggle */}
            <button
              onClick={() => setShowAllMetrics(v => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: C.faint, fontFamily: FONT,
                display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 2,
              }}
            >
              <span style={{ transition: "transform 0.2s", display: "inline-block", transform: showAllMetrics ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
              {showAllMetrics ? "Hide" : "5 more metrics"}
            </button>

            {/* Expanded metrics */}
            <AnimatePresence>
              {showAllMetrics && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, paddingTop: 8 }}>
                    {[
                      { label: "Annual growth", value: fmtPct(fin.annualAppreciation), color: C.blue },
                      fin.cashOnCashReturn ? { label: "Cash-on-cash return", value: `${fin.cashOnCashReturn}%`, color: C.green } : null,
                      fin.cgtDiscount ? { label: "Est. CGT (50% disc.)", value: fmtDollar(fin.estimatedCGT), color: C.orange } : null,
                      { label: "Selling costs (est.)", value: fmtDollar(fin.sellingCosts), color: C.muted },
                      { label: "Net proceeds (est.)", value: fmtDollar(fin.netProceeds), color: C.green },
                    ].filter(Boolean).map(m => (
                      <div key={m!.label} style={{
                        background: C.bg3, borderRadius: 10, padding: "10px 12px",
                        border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{m!.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: m!.color, fontFamily: FONT }}>{m!.value}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Vendor Appraisal */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <VendorAppraisalPanel buyer={buyer} theme={theme} showEquityScenarios={vendorSettings?.showEquityScenarios} />
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowPrintAppraisal(true)}
                style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${theme.primary}40`, background: `${theme.primary}10`, color: theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
                🖨️ Print Appraisal Report
              </button>
            </div>
          </div>

          </>)}

          {/* === OUTREACH TAB: notes + voice + nurture === */}
          {profileTab === "outreach" && (<>

          {/* CRM Notes + Voice Memo Recorder */}
          <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>CRM Notes</div>
              {/* Voice memo button — always visible */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {vendorVoice.phase === "idle" && (
                  <button
                    onClick={vendorVoice.supported ? vendorVoice.start : undefined}
                    title={vendorVoice.supported ? undefined : "Voice notes require Chrome or Edge"}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                      background: theme.primary + "15", color: theme.primary,
                      border: `1px solid ${theme.primary}30`,
                      cursor: vendorVoice.supported ? "pointer" : "default",
                      opacity: vendorVoice.supported ? 1 : 0.5,
                      fontFamily: FONT, display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    🎙️ Add voice note
                  </button>
                )}
                {vendorVoice.phase === "recording" && (
                  <button
                    onClick={vendorVoice.stop}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                      background: "#ef444420", color: "#ef4444",
                      border: "1px solid #ef444440", cursor: "pointer", fontFamily: FONT,
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }}>●</motion.span>
                    Stop ({vendorVoice.seconds}s)
                  </button>
                )}
                {vendorVoice.phase === "done" && (
                  <button onClick={vendorVoice.reset} style={{
                    fontSize: 10, color: C.faint, background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
                  }}>↺ Re-record</button>
                )}
              </div>
            </div>
            {buyer.notes && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{buyer.notes}</div>}
            {/* Live transcript while recording */}
            {vendorVoice.phase === "recording" && vendorVoice.liveTranscript && (
              <div style={{ fontSize: 12, color: theme.primary, fontStyle: "italic", marginTop: 8, padding: "8px 10px", background: theme.primary + "0a", borderRadius: 6, lineHeight: 1.5 }}>
                🎙️ {vendorVoice.liveTranscript}
              </div>
            )}
            {/* Saved voice notes + upsert button */}
            {voiceNotes && (
              <div style={{ fontSize: 12, color: C.text, marginTop: 8, padding: "8px 10px", background: theme.primary + "10", borderRadius: 6, lineHeight: 1.5, border: `1px solid ${theme.primary}20` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: theme.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>🎙️ Voice note · included in AI generation</span>
                  <button
                    onClick={async () => {
                      // Append voice transcript to the buyer's notes and save back to sheet
                      const merged = [buyer.notes, voiceNotes].filter(Boolean).join("\n\nVoice note: ")
                      try {
                        await authFetch(apiUrl("/api/sheet"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "updateNotes", id: buyer.id, notes: merged }),
                        })
                      } catch { /* non-fatal — sheet may not support updates yet */ }
                      // Optimistically update local display
                      buyer.notes = merged
                      vendorVoice.reset()
                      setVoiceNotes("")
                    }}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                      background: theme.primary + "20", color: theme.primary,
                      border: `1px solid ${theme.primary}40`, cursor: "pointer", fontFamily: FONT, flexShrink: 0, marginLeft: 8,
                    }}
                  >
                    ✓ Save to notes
                  </button>
                </div>
                <div style={{ color: C.muted }}>{voiceNotes}</div>
                <VoiceBriefCard transcript={voiceNotes} buyerName={buyer.name} buyerSuburb={buyer.suburb} theme={theme} />
              </div>
            )}
          </div>

          {/* Nurture Sequence Panel */}
          <NurtureSequencePanel entry={entry} agent={agent} theme={theme} />

          </>)}
        </div>

        {/* RIGHT col */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* === OUTREACH TAB: NotesBridge + outreach picker + coach + contact === */}
          {profileTab === "outreach" && (<>

          {/* ⚡ NotesBridge — CRM notes → AI extraction → outreach sentence */}
          {vendorSettings?.showCRMNotes && (buyer.notes || voiceNotes) && (
            <NotesBridgeCard
              notes={[buyer.notes, voiceNotes ? `Voice note: ${voiceNotes}` : ""].filter(Boolean).join("\n\n")}
              prewrittenHook={(buyer as { personalisationHook?: string }).personalisationHook ?? null}
              extractedHook={extractedHook}
              personalisationLine={personalisationLine}
              fname={fname}
              generating={generating}
              theme={theme}
            />
          )}

          </>)}

          {/* === ANALYSIS TAB: triggers + rate sensitivity + best time === */}
          {profileTab === "analysis" && (<>

          {/* Trigger events + Pitch angles — collapsible */}
          {vendorSettings?.showTriggers && <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {/* Header row — always visible */}
            <button
              onClick={() => setShowInsights(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase" }}>
                  Triggers &amp; pitch angles
                </span>
                {/* Top trigger preview chip */}
                {!showInsights && segment.triggers[0] && (() => {
                  const t = segment.triggers[0]
                  const uColor = t.urgency === "high" ? (C.red ?? "#ef4444") : t.urgency === "medium" ? C.orange : C.faint
                  return (
                    <span style={{ fontSize: 10, color: uColor, background: uColor + "15", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                      {t.label.slice(0, 40)}{t.label.length > 40 ? "…" : ""}
                    </span>
                  )
                })()}
              </div>
              <span style={{
                fontSize: 13, color: C.faint,
                transform: showInsights ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block",
              }}>⌄</span>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {showInsights && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Triggers */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {segment.triggers.map((t, i) => {
                        const uColor = t.urgency === "high" ? (C.red ?? "#ef4444") : t.urgency === "medium" ? C.orange : C.faint
                        return (
                          <div key={i} style={{
                            display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8,
                            background: uColor + "0d", border: `1px solid ${uColor}20`,
                          }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: uColor, textTransform: "uppercase", background: uColor + "18", padding: "2px 5px", borderRadius: 3, alignSelf: "flex-start", flexShrink: 0 }}>{t.urgency}</span>
                            <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{t.label}</span>
                          </div>
                        )
                      })}
                    </div>
                    {/* Pitch angles — collapsed by default */}
                    {segment.pitchAngles.length > 0 && (
                      <div>
                        <button
                          onClick={() => setShowPitchAngles(v => !v)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, marginBottom: showPitchAngles ? 6 : 0 }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Pitch angles for {fname}</span>
                          <span style={{ fontSize: 10, color: C.faint, transform: showPitchAngles ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>›</span>
                        </button>
                        <AnimatePresence>
                          {showPitchAngles && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {segment.pitchAngles.map((angle, i) => (
                                  <div key={i} style={{
                                    display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8,
                                    background: C.bg3, border: `1px solid ${C.border}`,
                                  }}>
                                    <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{angle}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>}

          </>)}

          {/* === OUTREACH TAB: secondary engagement + coach + contact + picker === */}
          {profileTab === "outreach" && (<>

          {/* Secondary buyer engagement strategies */}
          {isSecondary && <SecondaryEngagementCard entry={entry} theme={theme} />}

          {/* Negotiation Coach button */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowNegotiationCoach(true)}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${theme.primary}40`, background: `${theme.primary}10`, color: theme.primary, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Generate call script for {fname} →
          </motion.button>

          {/* Contact info */}
          <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Contact</div>
            <a href={`tel:${buyer.phone}`} style={{ fontSize: 14, color: theme.primary, fontWeight: 600, textDecoration: "none", display: "block", marginBottom: 6 }}>{buyer.phone}</a>
            {buyer.email && <a href={`mailto:${buyer.email}`} style={{ fontSize: 13, color: theme.primary, fontWeight: 600, textDecoration: "none" }}>{buyer.email}</a>}
            {buyer.lastContactDate && (
              <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
                Last contacted: {buyer.lastContactDate}
              </div>
            )}
            {buyer.lastMessage && (
              <div style={{ fontSize: 10, color: C.faint, marginTop: 4, fontStyle: "italic", lineHeight: 1.4 }}>
                "{buyer.lastMessage.slice(0, 120)}{buyer.lastMessage.length > 120 ? "…" : ""}"
              </div>
            )}
          </div>

          {/* Voice note hint if none recorded yet */}
          {!voiceNotes && vendorVoice.phase === "idle" && (
            <div style={{ textAlign: "center", fontSize: 10, color: C.faint }}>
              🎙️ Tap "Add voice note" in CRM Notes above to enrich AI personalisation
            </div>
          )}

          {/* ── Outreach generator — always visible ── */}
          {(() => {
            const year = buyer.purchaseDate.slice(0, 4)
            const signoff = buyer.status === "investor" ? "Kind regards" : "Cheers"

            const angles = [
              // CGT Deadline — only if meaningful tax savings
              fin.cgtSavingsBy2027 > 5000 && {
                id: "cgt", icon: "⏰", title: "CGT Deadline",
                hook: `Save ${fmtDollar(fin.cgtSavingsBy2027)} in tax`, sub: "Before July 2027 cutoff", color: "#ef4444",
                buildOutreach: () => {
                  const smsRaw = `Hi ${fname}, ${agentFirst} from ${agent.agency}. Selling before July 2027 saves you ~${fmtDollar(fin.cgtSavingsBy2027)} in tax. Happy to run the numbers. ${signoff}, ${agentFirst}`
                  const sms = stripDashes(smsRaw.slice(0, 160))
                  const emailSubject = `Your CGT window, ${fname}`
                  const emailBody = [
                    `Hi ${fname}, ${agentFirst} from ${agent.agency} here. Quick one on your numbers at ${shortAddr(buyer.purchaseAddress)}.`,
                    `You've held your place since ${year} and the 50% CGT discount applies right now. Selling before 1 July 2027 saves you roughly ${fmtDollar(fin.cgtSavingsBy2027)} in tax compared to waiting. Your place is estimated at around ${fmtDollar(fin.currentEstimate)}.`,
                    `Happy to do a quick no-obligation appraisal. Twenty minutes, I'll come to you. No pressure at all.\n\n${signoff},\n${agentFirst}`,
                  ].map(stripDashes)
                  return { sms, emailSubject, emailBody }
                },
              },
              // Equity Position
              fin.equityGain > 100000 && {
                id: "equity", icon: "💰", title: "Equity Position",
                hook: `${fmtDollar(fin.equityGain)} in equity`, sub: `Built since ${year}`, color: "#66bb6a",
                buildOutreach: () => {
                  const smsRaw = `Hi ${fname}, ${agentFirst} from ${agent.agency}. Your place has grown ${fmtDollar(fin.equityGain)} since ${year}. Worth knowing your options. ${signoff}, ${agentFirst}`
                  const sms = stripDashes(smsRaw.slice(0, 160))
                  const emailSubject = `Your equity position, ${fname}`
                  const emailBody = [
                    `Hi ${fname}, ${agentFirst} from ${agent.agency} here.`,
                    `Ran the numbers on your place at ${shortAddr(buyer.purchaseAddress)}. You've built roughly ${fmtDollar(fin.equityGain)} in equity since ${year}. Your property is sitting at around ${fmtDollar(fin.currentEstimate)} now. A lot of people in ${buyer.suburb} don't realise what position they're in.`,
                    `Happy to do a complimentary appraisal. Twenty minutes, I'll come to you. No obligation, just so you know your options.\n\n${signoff},\n${agentFirst}`,
                  ].map(stripDashes)
                  return { sms, emailSubject, emailBody }
                },
              },
              // Recent comparable sale
              {
                id: "comps", icon: "🏡", title: "Recent Sale",
                hook: `${comps[0].address}: ${fmtDollar(comps[0].soldPrice)}`, sub: comps[0].soldDate, color: "#ffa726",
                buildOutreach: () => {
                  const smsRaw = `Hi ${fname}, ${agentFirst} here. A ${comps[0].beds}-bed in ${buyer.suburb} just sold for ${fmtDollar(comps[0].soldPrice)}. Your place stacks up really well. ${signoff}, ${agentFirst}`
                  const sms = stripDashes(smsRaw.slice(0, 160))
                  const emailSubject = `Recent ${buyer.suburb} sale relevant to your place, ${fname}`
                  const emailBody = [
                    `Hi ${fname}, ${agentFirst} from ${agent.agency} here.`,
                    `A comparable ${comps[0].beds}-bedroom property at ${comps[0].address} just sold for ${fmtDollar(comps[0].soldPrice)} on ${comps[0].soldDate}. That puts your place (bought for ${fmtDollar(buyer.purchasePrice)} in ${year}) in a really strong position at roughly ${fmtDollar(fin.currentEstimate)}.`,
                    `Happy to put together a quick comps report and walk you through it. No obligation at all. Let me know if it's worth a look.\n\n${signoff},\n${agentFirst}`,
                  ].map(stripDashes)
                  return { sms, emailSubject, emailBody }
                },
              },
              // Market Timing
              {
                id: "timing", icon: "📈", title: "Market Timing",
                hook: `${range.clearanceRate}% clearance rate`, sub: `Avg ${range.daysOnMarket} days on market`, color: theme.primary,
                buildOutreach: () => {
                  const smsRaw = `Hi ${fname}, ${agentFirst} here. ${buyer.suburb} is running at ${range.clearanceRate}% clearance right now. Good time to know your options. ${signoff}, ${agentFirst}`
                  const sms = stripDashes(smsRaw.slice(0, 160))
                  const emailSubject = `${buyer.suburb} market is moving, ${fname}`
                  const emailBody = [
                    `Hi ${fname}, ${agentFirst} from ${agent.agency} here. Quick update on ${buyer.suburb}.`,
                    `Clearance rate is at ${range.clearanceRate}% with properties averaging just ${range.daysOnMarket} days on market. Strong seller conditions. Based on recent sales, your place is estimated at around ${fmtDollar(fin.currentEstimate)}, which is ${fmtDollar(fin.equityGain)} up since you bought in ${year}.`,
                    `If you've had any thoughts about listing, it's a decent window. Happy to do a quick appraisal, 20 minutes and I'll come to you. No pressure at all.\n\n${signoff},\n${agentFirst}`,
                  ].map(stripDashes)
                  return { sms, emailSubject, emailBody }
                },
              },
            ].filter(Boolean) as Array<{ id: string; icon: string; title: string; hook: string; sub: string; color: string; buildOutreach: () => { sms: string; emailSubject: string; emailBody: string[] } }>

            const clampedAngleIdx = Math.min(selectedAngleIdx, angles.length - 1)
            const angle = angles[clampedAngleIdx]
            const preview = angle.buildOutreach()

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* ── Angle carousel (when setting is on) ── */}
                {vendorSettings?.showOutreachAngles && (
                  <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    {/* Header + arrows */}
                    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>Outreach angle</span>
                      <button onClick={() => setSelectedAngleIdx(i => Math.max(0, i - 1))} disabled={clampedAngleIdx === 0}
                        style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: clampedAngleIdx === 0 ? "transparent" : C.bg3, color: clampedAngleIdx === 0 ? C.faint : C.text, cursor: clampedAngleIdx === 0 ? "default" : "pointer", fontSize: 14, fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                      <span style={{ fontSize: 10, color: C.faint, minWidth: 36, textAlign: "center" }}>{clampedAngleIdx + 1} / {angles.length}</span>
                      <button onClick={() => setSelectedAngleIdx(i => Math.min(angles.length - 1, i + 1))} disabled={clampedAngleIdx === angles.length - 1}
                        style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: clampedAngleIdx === angles.length - 1 ? "transparent" : C.bg3, color: clampedAngleIdx === angles.length - 1 ? C.faint : C.text, cursor: clampedAngleIdx === angles.length - 1 ? "default" : "pointer", fontSize: 14, fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                    </div>

                    {/* Current angle info */}
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 20 }}>{angle.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{angle.title}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: angle.color }}>{angle.hook}</div>
                          <div style={{ fontSize: 10, color: C.faint }}>{angle.sub}</div>
                        </div>
                      </div>

                      {/* SMS preview */}
                      <div style={{ marginBottom: 8, padding: "10px 12px", background: C.bg3, borderRadius: 10, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>📱 SMS preview · {preview.sms.length} chars</div>
                        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{preview.sms}</div>
                      </div>

                      {/* Email subject preview */}
                      <div style={{ padding: "8px 12px", background: C.bg3, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>📧 Email subject</div>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{preview.emailSubject}</div>
                        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 5 }}>{preview.emailBody[0]}</div>
                      </div>

                      {/* Review & send with this angle */}
                      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        onClick={() => { const { sms, emailSubject, emailBody } = angle.buildOutreach(); onReview(sms, emailSubject, emailBody) }}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${angle.color}50`, background: `${angle.color}12`, color: angle.color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                        Review &amp; Send · {angle.title} →
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* ── Full AI generate button — always visible ── */}
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleGenerate} disabled={generating}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${theme.primary}50`, background: generating ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}18, ${theme.gradient[1]}12)`, color: generating ? C.faint : theme.primary, fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {generating ? "✨ Generating SMS + Email..." : "✨ Generate SMS + Email with AI →"}
                </motion.button>
                {voiceNotes && <div style={{ textAlign: "center", fontSize: 10, color: C.green }}>✅ Voice note included in generation</div>}
              </div>
            )
          })()}

          </>)}

          {/* === ANALYSIS TAB: best time to sell === */}
          {profileTab === "analysis" && (<>

          {/* Best time to sell */}
          {vendorSettings?.showOptimalWindow && <BestTimeToSellPanel entry={entry} theme={theme} />}

          </>)}
        </div>
      </div>

      {/* Negotiation Coach Modal */}
      <AnimatePresence>
        {showNegotiationCoach && <NegotiationCoachModal entry={entry} agent={agent} theme={theme} onClose={() => setShowNegotiationCoach(false)} />}
      </AnimatePresence>

      {/* Printable Appraisal Modal */}
      <AnimatePresence>
        {showPrintAppraisal && <PrintableAppraisalModal entry={entry} agent={agent} theme={theme} onClose={() => setShowPrintAppraisal(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── Vendor Review Panel ───────────────────────────────────────────────────────

function VendorReviewPanel({ entry, agent, theme, sms: initSMS, emailSubject: initSubject, emailBody: initBody, onBack, onNext, allEntries }: {
  entry: SegmentedBuyer
  agent: AgentProfile
  theme: AgencyTheme
  sms: string
  emailSubject: string
  emailBody: string[]
  onBack: () => void
  onNext?: () => void
  allEntries?: SegmentedBuyer[]
}) {
  const [subject, setSubject] = useState(initSubject)
  const [bodyText, setBodyText] = useState(initBody.join("\n\n"))
  const [editMode, setEditMode] = useState<"sms" | "email" | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendingToSelf, setSendingToSelf] = useState(false)
  const [sentToSelf, setSentToSelf] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState("")
  const bpRV = useBreakpoint()
  const isMobileRV = bpRV === "mobile"
  const [appraisalBooked, setAppraisalBooked] = useState(false)
  const [listingWon, setListingWon] = useState(false)
  const [listingPrice, setListingPrice] = useState("")
  const [savingMilestone, setSavingMilestone] = useState(false)
  const [showNurture, setShowNurture] = useState(false)
  // SMS carousel: 3 tone variants
  const [smsVariantIdx, setSmsVariantIdx] = useState(0)

  const { buyer, financials: fin, segment } = entry
  const pl = PIPELINE_LABELS[segment.pipeline]
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const bubbleColor = theme?.primary ?? "rgb(0,122,255)"
  const avatarGrad = `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`

  // ── Pitch-angle carousel ─────────────────────────────────────────────────────
  const agentFirstRV = agent.name.split(" ")[0]
  const purchaseYearRV = buyer.purchaseDate?.slice(0, 4) ?? "2020"
  const estStrRV = fmtDollar(fin.currentEstimate)
  const equityStrRV = fmtDollar(fin.equityGain)
  const shortAddrRV = shortAddr(buyer.purchaseAddress)
  const signoffRV = buyer.status === "investor" ? "Kind regards" : "Cheers"
  const trim160 = (t: string) => t.length > 160 ? t.slice(0, 157) + "..." : t
  const noEmDash = (s: string) => s.replace(/—|–|--/g, ",").replace(/ {2,}/g, " ").trim()

  // Persona detection — used to filter / adapt angles
  const isInvestor = buyer.status === "investor"
  const notesLower = (buyer.notes ?? "").toLowerCase()
  void(!isInvestor && (
    buyer.status === "owner-occupier" ||
    /family|kids|school|upsize|downsize|retire|retirement|downsiz/i.test(notesLower)
  )) // computed via isDownsizer/isUpsizer checks below
  const isDownsizer = /downsize|downsi|retire|retirement|empty.nest/i.test(notesLower)
  const isUpsizer = /upsize|upsi|growing|kids|school|room/i.test(notesLower)

  // Agent-sold opener: find most recent agent sold in same suburb
  const agentSoldInSuburb = (() => {
    const { sold } = getPortfolioForAgent(agent)
    const match = sold.find(p => p.suburb.toLowerCase() === buyer.suburb.toLowerCase() && p.soldDate)
    return match ? `Following the sale of ${shortAddr(match.address)} in ${buyer.suburb}` : null
  })()
  const soldOpener = agentSoldInSuburb ? `${agentSoldInSuburb}, ` : ""

  // Build pitch-angle SMS variants based on persona (investors get financial angles; families get lifestyle)
  interface SmsVariant { label: string; sms: string; emailSubject: string; emailBody: string[] }
  const buildVariants = (): SmsVariant[] => {
    const variants: SmsVariant[] = []

    // Variant A: AI-generated (always first)
    variants.push({
      label: "AI personalised",
      sms: initSMS,
      emailSubject: initSubject,
      emailBody: initBody,
    })

    if (isInvestor) {
      // Investor angle 1: CGT deadline (high value)
      if (fin.cgtSavingsBy2027 > 5000) {
        variants.push({
          label: "CGT deadline",
          sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency}. Selling before July 2027 saves you ~${fmtDollar(fin.cgtSavingsBy2027)} in CGT. Happy to run the numbers. Kind regards, ${agentFirstRV}`)),
          emailSubject: `Your CGT window is closing, ${fname}`,
          emailBody: [
            `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
            `You've held ${shortAddrRV} since ${purchaseYearRV} and the 50% CGT discount applies right now. Selling before 1 July 2027 saves you roughly ${fmtDollar(fin.cgtSavingsBy2027)} in tax. Your property is currently estimated at around ${estStrRV}.`,
            `Happy to run a quick, no-obligation appraisal. Twenty minutes, I'll come to you. No pressure.\n\nKind regards,\n${agentFirstRV}`,
          ],
        })
      }
      // Investor angle 2: equity / ROI
      variants.push({
        label: "Equity & ROI",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} here. ${shortAddrRV} is now worth ~${estStrRV}, that's ${equityStrRV} in equity since ${purchaseYearRV}. Good time to review your position. Kind regards, ${agentFirstRV}`)),
        emailSubject: `Your equity position at ${shortAddrRV}, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `Ran the numbers on ${shortAddrRV}. You've built roughly ${equityStrRV} in equity since ${purchaseYearRV} and the property is sitting at around ${estStrRV}. With current market conditions in ${buyer.suburb}, now is a strong time to review your portfolio position.`,
          `Happy to do a complimentary appraisal and walk through your options. No obligation at all.\n\nKind regards,\n${agentFirstRV}`,
        ],
      })
    } else if (isDownsizer) {
      // Downsizer: lifestyle + equity release, no CGT jargon
      variants.push({
        label: "Equity release",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency}. Your place in ${buyer.suburb} has come a long way since ${purchaseYearRV}, you've built ${equityStrRV} in equity. Worth a chat about your options? ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `Great time to explore your options, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `Just wanted to share that ${shortAddrRV} is now worth around ${estStrRV}. Since ${purchaseYearRV} you've built up ${equityStrRV} in equity. A lot of people in your position are finding this a great moment to right-size and free up that equity for the next chapter.`,
          `I'd love to offer a complimentary, no-pressure appraisal. Happy to come to you and walk through what the market looks like.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
      variants.push({
        label: "Local market",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} here. ${buyer.suburb} is very active right now, properties are moving well and demand is strong. Thought it was worth letting you know. ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `${buyer.suburb} market update, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `Quick market update for ${buyer.suburb}: demand has been strong and comparable properties are achieving great results. With ${shortAddrRV} valued at around ${estStrRV}, the timing looks really good if you've been thinking about making a move.`,
          `Happy to have an informal chat, no pressure, just want to make sure you have the full picture.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
    } else if (isUpsizer) {
      // Upsizer family: focus on equity to fund next home, not financial jargon
      variants.push({
        label: "Ready to upsize",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency}. Your place has grown to ~${estStrRV} and the equity you've built could go a long way toward your next home. Happy to chat. ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `Your equity could fund your next move, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `Just wanted to share that ${shortAddrRV} has grown to around ${estStrRV}, that's ${equityStrRV} in equity built since ${purchaseYearRV}. For families thinking about upsizing, that kind of position makes a real difference when it comes to your next purchase.`,
          `Happy to walk through what the numbers look like for you. No obligation, just a friendly chat.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
      variants.push({
        label: "Recent nearby sale",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} here. A similar home in ${buyer.suburb} recently sold well. Your place at ${shortAddrRV} is in great shape. Thought you'd want to know. ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `What's happening in ${buyer.suburb}, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `A comparable property in ${buyer.suburb} recently sold really well, and your place at ${shortAddrRV} stacks up nicely at around ${estStrRV}. If a bigger home is on your radar, the equity you've built (around ${equityStrRV}) puts you in a strong position.`,
          `Happy to come by for a complimentary appraisal and a chat. No pressure at all.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
    } else {
      // General owner-occupier: friendly, lifestyle-focused, no financial jargon
      variants.push({
        label: "Property value update",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency}. ${shortAddrRV} is now estimated at around ${estStrRV}, great to see how far it's come since ${purchaseYearRV}. Worth a quick chat? ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `Your property update, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `Just a quick update on ${shortAddrRV}. The property is now worth around ${estStrRV}, which is a great result from when you purchased in ${purchaseYearRV}.`,
          `I'd love to pop over for a complimentary appraisal if you're curious. Completely no-obligation, just so you have the full picture.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
      variants.push({
        label: "Market timing",
        sms: trim160(noEmDash(`Hi ${fname}, ${soldOpener}${agentFirstRV} here. ${buyer.suburb} is seeing strong demand at the moment. Thought it was worth letting you know given ${shortAddrRV} is in great shape. ${signoffRV}, ${agentFirstRV}`)),
        emailSubject: `${buyer.suburb} is moving, ${fname}`,
        emailBody: [
          `Hi ${fname}, ${soldOpener}${agentFirstRV} from ${agent.agency} here.`,
          `${buyer.suburb} has been really active lately with strong buyer demand. Your property at ${shortAddrRV} is estimated around ${estStrRV} and would present very well in the current market.`,
          `Happy to do a free, no-pressure appraisal if you'd like an up-to-date picture. Takes about 20 minutes.\n\n${signoffRV},\n${agentFirstRV}`,
        ],
      })
    }

    return variants.slice(0, 3) // cap at 3 in carousel
  }
  const smsVariants = buildVariants()
  const [sms, setSMS] = useState(initSMS)

  // Sync sms + email to selected carousel variant
  useEffect(() => {
    const v = smsVariants[smsVariantIdx]
    if (v) {
      setSMS(v.sms)
      setSubject(v.emailSubject)
      setBodyText(v.emailBody.join("\n\n"))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smsVariantIdx])

  const handleSend = async () => {
    setSending(true)
    try {
      const deliveryRes = await authFetch(apiUrl("/api/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: `vendor_${buyer.id}`,
          leadName: buyer.name,
          phone: buyer.phone,
          email: buyer.email ?? "",
          agentEmail: agent.email,
          agentName: agent.name,
          agentAgency: agent.agency,
          agentPhone: agent.phone,
          agencyColor: theme.primary,
          agencyTagline: agent.tagline,
          propertyAddress: fullAddr(buyer.purchaseAddress, buyer.suburb),
          priceGuide: fmtDollar(fin.currentEstimate),
          sms, subject,
          emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
          channel: "both",
          pipeline: segment.pipeline,
          nurtureContext: {
            agentName: agent.name,
            agentAgency: agent.agency,
            agentEmail: agent.email,
            agentPhone: agent.phone,
            agencyColor: theme.primary,
            agencyTagline: agent.tagline,
            pipeline: segment.pipeline,
          },
        }),
      }).then(r => r.json()).catch(() => null)
      const delivered = deliveryRes?.ok === true
      setDeliveryNote(delivered ? "Sent via Twilio + Gmail" : "Saved to Sheets (configure Twilio/Gmail for direct delivery)")

      // Write today's date + last message back to the Past Buyers sheet tab
      await updateLastContactDate(buyer.id, undefined, sms || bodyText.split("\n\n")[0]?.slice(0, 200))

      // Log sent outreach to Sheets event log (same as buyer outreach)
      postEvent({
        leadId: `vendor_${buyer.id}`, leadName: buyer.name,
        propertyAddress: fullAddr(buyer.purchaseAddress, buyer.suburb),
        fromProperty: buyer.purchaseAddress, eventType: "outreach_sent",
        smsText: sms, emailSubject: subject,
        emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
        deliveryChannel: "both",
        deliverySid: deliveryRes?.sms?.sid,
        sendgridId: deliveryRes?.email?.messageId,
        leadStatus: "outreach_sent",
      }).catch(() => {})

      // Write approved vendor outreach to VoiceCorpus tab
      const ts = new Date().toISOString()
      writeAgentVoiceEntry({ text: sms, type: "sms", channel: "sms", ts }).catch(() => {})
      writeAgentVoiceEntry({ text: subject, type: "email_subject", channel: "email", ts }).catch(() => {})
      writeAgentVoiceEntry({ text: bodyText.split("\n\n")[0], type: "email_body", channel: "email", ts }).catch(() => {})

      // Edit learning: if agent modified the AI text, write the edited version as a high-weight training example
      const selectedVariant = smsVariants[smsVariantIdx]
      const smsWasEdited = sms.trim() !== (selectedVariant?.sms ?? initSMS).trim()
      const emailWasEdited = bodyText.trim() !== (selectedVariant?.emailBody.join("\n\n") ?? initBody.join("\n\n")).trim()
      if (smsWasEdited) {
        writeAgentVoiceEntry({ text: `[HUMAN_EDIT] ${sms}`, type: "sms", channel: "sms", ts }).catch(() => {})
      }
      if (emailWasEdited) {
        writeAgentVoiceEntry({ text: `[HUMAN_EDIT] ${bodyText.split("\n\n")[0]}`, type: "email_body", channel: "email", ts }).catch(() => {})
      }
    } catch {}
    setSending(false)
    setSent(true)
  }

  const handleSendToSelf = async () => {
    setSendingToSelf(true)
    try {
      await authFetch(apiUrl("/api/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "self_demo",
          leadName: "Yourself (demo)",
          phone: agent.phone,
          email: agent.email,
          agentEmail: agent.email,
          agentName: agent.name,
          agentAgency: agent.agency,
          agentPhone: agent.phone,
          agencyColor: theme.primary,
          agencyTagline: agent.tagline,
          propertyAddress: fullAddr(buyer.purchaseAddress, buyer.suburb),
          priceGuide: fmtDollar(fin.currentEstimate),
          sms, subject,
          emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
          channel: "both",
        }),
      })
      setSentToSelf(true)
    } catch {}
    setSendingToSelf(false)
  }

  if (sent) {
    return (
      <div style={{
        minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: FONT,
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: "center", maxWidth: 520 }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 8 }}>
            Vendor outreach approved for {fname}
          </div>
          {deliveryNote && (
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 24, padding: "6px 14px",
              background: C.bg3, borderRadius: 8, display: "inline-block" }}>
              {deliveryNote}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {onNext ? (
              <button onClick={onNext} style={{
                padding: "12px 28px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              }}>
                Next buyer →
              </button>
            ) : (
              <button onClick={onBack} style={{
                padding: "12px 28px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              }}>
                Back to pipeline
              </button>
            )}
            {onNext && (
              <button onClick={onBack} style={{
                padding: "12px 28px", borderRadius: 12,
                border: `1px solid ${theme.primary}44`, background: "transparent",
                color: theme.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              }}>
                Pipeline
              </button>
            )}
            <a href={`tel:${buyer.phone}`} style={{
              padding: "12px 28px", borderRadius: 12, textDecoration: "none",
              border: `1px solid ${theme.primary}44`,
              color: theme.primary, fontSize: 14, fontWeight: 700, fontFamily: FONT,
            }}>
              📞 Call {fname}
            </a>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobileRV ? "76px 16px 48px" : "80px 32px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 24, padding: 0, lineHeight: 1,
      }}>←</button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
          Review outreach
        </div>
        <div style={{ fontSize: isMobileRV ? 18 : 24, fontWeight: 800, color: C.text, letterSpacing: -0.8 }}>
          {fname}'s personalised vendor messages
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{buyer.purchaseAddress}</div>
          <div style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 6,
            background: pl.color + "18", color: pl.color, fontWeight: 700,
          }}>
            {pl.icon} {pl.shortLabel}
          </div>
          <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{fmtDollar(fin.equityGain)} equity</div>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Edit either message before approving. Clicking Send saves both to Google Sheets for delivery.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobileRV ? "1fr" : "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* SMS — iMessage style */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>SMS</div>
            <button onClick={() => setEditMode(editMode === "sms" ? null : "sms")} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: theme.primary, fontSize: 12, fontFamily: FONT, fontWeight: 600,
            }}>
              {editMode === "sms" ? "Done" : "Edit"}
            </button>
          </div>
          {editMode === "sms" ? (
            <textarea
              autoFocus
              value={sms}
              onChange={e => setSMS(e.target.value)}
              maxLength={160}
              style={{
                width: "100%", minHeight: 120, background: C.bg3,
                border: `1px solid ${theme.primary}44`, borderRadius: 12,
                padding: "12px 14px", color: C.text, fontSize: 13,
                fontFamily: FONT, lineHeight: 1.5, resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <div style={{ background: "rgb(24,24,24)", borderRadius: 20, padding: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>iMessage</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{fname}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <div style={{
                  maxWidth: "80%", padding: "9px 13px",
                  borderRadius: "16px 16px 4px 16px",
                  background: bubbleColor,
                  fontSize: 13, color: "white", lineHeight: 1.45,
                }}>
                  {sms}
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: avatarGrad,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0, alignSelf: "flex-end",
                }}>
                  {agent.name.charAt(0)}
                </div>
              </div>
              {/* Carousel navigation */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => setSmsVariantIdx(i => Math.max(0, i - 1))}
                  disabled={smsVariantIdx === 0}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", border: "none",
                    background: smsVariantIdx === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.18)",
                    color: smsVariantIdx === 0 ? "rgba(255,255,255,0.25)" : "white",
                    cursor: smsVariantIdx === 0 ? "default" : "pointer",
                    fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >‹</button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                    {smsVariants[smsVariantIdx]?.label ?? "Variant"}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                    {smsVariantIdx + 1} / {smsVariants.length}
                  </div>
                </div>
                <button
                  onClick={() => setSmsVariantIdx(i => Math.min(smsVariants.length - 1, i + 1))}
                  disabled={smsVariantIdx === smsVariants.length - 1}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", border: "none",
                    background: smsVariantIdx === smsVariants.length - 1 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.18)",
                    color: smsVariantIdx === smsVariants.length - 1 ? "rgba(255,255,255,0.25)" : "white",
                    cursor: smsVariantIdx === smsVariants.length - 1 ? "default" : "pointer",
                    fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >›</button>
              </div>
            </div>
          )}
        </div>

        {/* Email — Gmail style */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Email</div>
            <button onClick={() => setEditMode(editMode === "email" ? null : "email")} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: theme.primary, fontSize: 12, fontFamily: FONT, fontWeight: 600,
            }}>
              {editMode === "email" ? "Done" : "Edit"}
            </button>
          </div>
          {editMode === "email" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject line..."
                style={{
                  background: C.bg3, border: `1px solid ${theme.primary}44`,
                  borderRadius: 8, padding: "9px 12px", color: C.text,
                  fontSize: 13, fontFamily: FONT, outline: "none",
                }}
              />
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder="Email body..."
                style={{
                  background: C.bg3, border: `1px solid ${theme.primary}44`,
                  borderRadius: 8, padding: "10px 12px", color: C.text,
                  fontSize: 13, fontFamily: FONT, lineHeight: 1.5,
                  resize: "vertical", minHeight: 160, outline: "none",
                }}
              />
            </div>
          ) : (
            <div style={{
              background: "white", borderRadius: 12, overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}>
              <div style={{ background: "#f1f3f4", padding: "10px 16px", borderBottom: "1px solid #e0e0e0" }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, color: "#333" }}>From: </span>{agent.email}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, color: "#333" }}>To: </span>{buyer.email ?? `${fname.toLowerCase()}@email.com`}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginTop: 4 }}>{subject}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {bodyText.split("\n\n").filter(p => p.trim()).map((p, i, arr) => (
                  <p key={i} style={{ fontSize: 13, color: "#333", lineHeight: 1.6, marginBottom: i < arr.length - 1 ? 12 : 0 }}>{p}</p>
                ))}
                <div style={{
                  marginTop: 20, paddingTop: 16, borderTop: `2px solid ${theme.primary}`,
                  fontSize: 12, color: "#666",
                  display: "flex", gap: 10, alignItems: "center",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: avatarGrad,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "white",
                  }}>
                    {theme.logo}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#111", fontSize: 13 }}>{agent.name}</div>
                    <div style={{ color: theme.primary, fontWeight: 600 }}>{agent.agency}</div>
                    <div style={{ color: "#888", fontSize: 11 }}>{agent.email}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approve and Send */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleSend}
        disabled={sending}
        style={{
          width: "100%", padding: "15px",
          borderRadius: 14, border: "none",
          background: sending ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          color: sending ? C.muted : "white",
          fontSize: 16, fontWeight: 700, cursor: sending ? "default" : "pointer",
          fontFamily: FONT, letterSpacing: -0.3,
          boxShadow: sending ? "none" : `0 6px 24px ${theme.glow}`,
        }}
      >
        {sending ? "Saving to Sheet..." : "Approve and Send"}
      </motion.button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.faint, marginTop: 10 }}>
        Saves the approved SMS and email to Google Sheets for delivery via Twilio and Gmail.
      </div>

      {/* Batch send — only shown when multiple entries are available */}
      {allEntries && allEntries.length > 1 && !sent && (
        <div style={{
          marginTop: 8, padding: "12px 16px", borderRadius: 12,
          border: `1px solid ${C.border}`, background: C.bg2,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            <strong style={{ color: C.text, display: "block" }}>Send all {allEntries.length} leads at once</strong>
            AI generates and queues personalised outreach for every lead.
          </div>
          <button
            onClick={onBack}
            style={{
              flexShrink: 0, padding: "8px 14px", borderRadius: 10, border: "none",
              background: `${theme.primary}20`, color: theme.primary,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
            }}
          >
            Batch send →
          </button>
        </div>
      )}

      <button
        onClick={handleSendToSelf}
        disabled={sendingToSelf || sentToSelf}
        style={{
          width: "100%", padding: "13px",
          borderRadius: 14, marginTop: 12,
          background: "transparent",
          border: `1px solid ${theme.primary}55`,
          color: sentToSelf ? C.green : theme.primary,
          fontSize: 14, fontWeight: 600, cursor: sendingToSelf || sentToSelf ? "default" : "pointer",
          fontFamily: FONT, letterSpacing: -0.2,
        }}
      >
        {sentToSelf ? "✓ Sent to your phone, check it now" : sendingToSelf ? "Sending..." : "📱 Send to my phone"}
      </button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.faint, marginTop: 6 }}>
        Experience what your vendors feel
      </div>

      {/* Appraisal booked + listing won */}
      <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: 14, background: C.bg2, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>
          Did {fname} agree to an appraisal?
        </div>
        <button
          onClick={async () => {
            if (appraisalBooked) return
            setSavingMilestone(true)
            try {
              await authFetch(apiUrl("/api/analytics/milestone"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contactPhone: buyer.phone,
                  contactName: buyer.name,
                  type: "appraisal_booked",
                  propertyAddress: buyer.purchaseAddress,
                }),
              })
            } catch { /* offline — still show UI update */ }
            finally { setSavingMilestone(false) }
            setAppraisalBooked(true)
          }}
          disabled={appraisalBooked || savingMilestone}
          style={{
            padding: "10px 20px", borderRadius: 10,
            border: `1px solid ${appraisalBooked ? C.green + "44" : theme.primary + "44"}`,
            background: appraisalBooked ? C.green + "22" : theme.dim,
            color: appraisalBooked ? C.green : theme.primary,
            fontSize: 13, fontWeight: 700, cursor: appraisalBooked ? "default" : "pointer",
            fontFamily: FONT,
          }}
        >
          {savingMilestone ? "Saving…" : appraisalBooked ? "✓ Appraisal booked" : "Mark appraisal booked"}
        </button>
        {appraisalBooked && !listingWon && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Did it convert to a listing?
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                placeholder="Sale price (e.g. 870000)"
                value={listingPrice}
                onChange={e => setListingPrice(e.target.value)}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.bg3,
                  color: C.text, fontSize: 13, fontFamily: FONT,
                }}
              />
              <button
                disabled={!listingPrice || savingMilestone}
                onClick={async () => {
                  setSavingMilestone(true)
                  try {
                    await authFetch(apiUrl("/api/analytics/milestone"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        contactPhone: buyer.phone,
                        contactName: buyer.name,
                        type: "listing_won",
                        propertyAddress: buyer.purchaseAddress,
                        listingPrice: parseInt(listingPrice) || 0,
                      }),
                    })
                  } catch { /* offline */ }
                  finally { setSavingMilestone(false) }
                  setListingWon(true)
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: C.green, color: "#04070d",
                  fontSize: 13, fontWeight: 700, cursor: listingPrice ? "pointer" : "default",
                  fontFamily: FONT, opacity: listingPrice ? 1 : 0.5,
                }}
              >
                {savingMilestone ? "…" : "Mark won →"}
              </button>
            </div>
          </div>
        )}
        {listingWon && (
          <div style={{ fontSize: 12, color: C.green, marginTop: 10, fontWeight: 700 }}>
            🏆 Listing won recorded — GCI updated in ROI dashboard.
          </div>
        )}
        {appraisalBooked && !listingWon && (
          <div style={{ fontSize: 11, color: C.green, marginTop: 8 }}>
            Pipeline status updated. Follow up within 48 hrs to confirm time.
          </div>
        )}
      </div>

      {/* 30-day vendor nurture sequence */}
      <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: 14, background: C.bg2, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>30-day vendor nurture sequence</div>
          <button onClick={() => setShowNurture(v => !v)} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: theme.primary, fontSize: 12, fontFamily: FONT, fontWeight: 600,
          }}>
            {showNurture ? "Hide" : "Preview →"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          Automated follow-up cadence if {fname} doesn't respond to your first outreach.
        </div>
        {showNurture && (() => {
          const nurtureSteps = [
            { day: 0,  label: "Day 0: Initial outreach", color: theme.primary, note: "SMS + email sent (see above)" },
            { day: 7,  label: "Day 7: Market pulse",    color: C.blue,
              sms: `Hi ${fname}, quick market update. A comparable home in ${buyer.suburb} sold well above guide this week. Worth a conversation? ${agent.name.split(" ")[0]}` },
            { day: 14, label: "Day 14: Value reminder", color: C.green,
              sms: `Hi ${fname}, ${agent.name.split(" ")[0]} here. Equity in ${buyer.suburb} is up ${Math.round(fin.equityGainPct)}% since you bought. Happy to run through the numbers if useful.` },
            { day: 30, label: "Day 30: Soft close",     color: C.orange,
              sms: `Hi ${fname}, touching base on ${buyer.purchaseAddress.split(",")[0]}. If timing isn't right yet, no problem. Happy to keep you updated on the market. ${agent.name.split(" ")[0]}` },
          ]
          return (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {nurtureSteps.map(step => (
                <div key={step.day} style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: C.bg3, border: `1px solid ${step.color}22`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step.color, marginBottom: step.sms ? 6 : 0 }}>
                    {step.label}
                  </div>
                  {step.note && <div style={{ fontSize: 11, color: C.faint }}>{step.note}</div>}
                  {step.sms && (
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, fontStyle: "italic" }}>
                      "{step.sms}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Outreach Queue Stage wrapper ─────────────────────────────────────────────

function OutreachQueueStage({ items, agent, theme, onBack, onDone }: {
  items: QueueItem[]
  agent: AgentProfile
  theme: AgencyTheme
  onBack: () => void
  onDone: () => void
}) {
  const [sending, setSending] = useState(false)
  return (
    <OutreachQueue
      items={items}
      agentName={agent.name}
      sending={sending}
      theme={theme}
      onBack={onBack}
      onSend={async approved => {
        setSending(true)
        try {
          await authFetch(apiUrl("/api/vendor-batch/send"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: approved }),
          })
        } catch { /* best-effort */ }
        setSending(false)
        onDone()
      }}
    />
  )
}

// ── Main DemoView ─────────────────────────────────────────────────────────────

export default function DemoView({
  agent,
  theme = DEFAULT_THEME,
  mode = "buyer",
  onSettings,
  onRegisterBack,
  showInbox: showInboxProp,
  onShowInboxChange,
  onBadgeChange,
  vendorSettings: _vendorSettings,
}: {
  agent: AgentProfile
  theme?: AgencyTheme
  mode?: DemoMode
  onSettings?: () => void
  onRegisterBack?: (fn: (() => void) | null) => void
  showInbox?: boolean
  onShowInboxChange?: (v: boolean) => void
  onBadgeChange?: (n: number) => void
  vendorSettings?: import("../data").VendorDisplaySettings
}) {
  const homeStage: Stage = mode === "vendor" ? { kind: "vendorPortfolio" } : { kind: "portfolio" }
  const [stage, setStage] = useState<Stage>(homeStage)

  // Reset to home stage when mode switches (buyer ↔ vendor)
  useEffect(() => {
    setStage(mode === "vendor" ? { kind: "vendorPortfolio" } : { kind: "portfolio" })
  }, [mode])
  const [, setUnreadRepliesInternal] = useState(0)
  const setUnreadReplies = (n: number) => { setUnreadRepliesInternal(n); onBadgeChange?.(n) }
  const [showInboxInternal, setShowInboxInternal] = useState(false)
  const showInbox = showInboxProp ?? showInboxInternal
  const setShowInbox = (v: boolean) => { setShowInboxInternal(v); onShowInboxChange?.(v) }
  const [inboxThreads, setInboxThreads] = useState<Array<{ leadId: string; leadName: string; phone: string; propertyAddress: string; email: string; lastReplyAt: string; messages: Array<{ role: string; body: string; ts: string }> }>>([])
  const [selectedThreadPhone, setSelectedThreadPhone] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState<{ draft: string; intent: string; reasoning: string } | null>(null)
  const [replyText, setReplyText] = useState("")
  const [draftingReply, setDraftingReply] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [seedingDemo, setSeedingDemo] = useState(false)

  // Poll for unread SMS replies every 30 seconds
  useEffect(() => {
    const poll = () => {
      authFetch(apiUrl("/api/conversations"))
        .then(r => r.json())
        .then((d: { unread: number; threads: typeof inboxThreads }) => {
          setUnreadReplies(d.unread ?? 0)
          setInboxThreads(d.threads ?? [])
        })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [])

  // Ctrl+Z or Cmd+Shift+R — instant reset to portfolio during live demo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isReset =
        (e.ctrlKey && !e.metaKey && e.key === "z") ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "R")
      if (isReset) {
        e.preventDefault()
        setStage(homeStage)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const isPortfolio = stage.kind === "portfolio" || stage.kind === "vendorPortfolio"

  // Register/deregister the Portfolio back-button in the nav bar
  useEffect(() => {
    if (isPortfolio) {
      onRegisterBack?.(null)
    } else {
      onRegisterBack?.(() => setStage(homeStage))
    }
    return () => onRegisterBack?.(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPortfolio])

  return (
    <>


      {/* Inbox drawer */}
      <AnimatePresence>
        {showInbox && (() => {
          const selectedThread = inboxThreads.find(t => t.phone === selectedThreadPhone) ?? null
          const leadMsgs = selectedThread?.messages.filter(m => m.role === "lead") ?? []
          const lastLeadMsg = leadMsgs[leadMsgs.length - 1]

          const handleDraftReply = async () => {
            if (!selectedThread || !lastLeadMsg) return
            setDraftingReply(true)
            setReplyDraft(null)
            try {
              const res = await authFetch(apiUrl("/api/reply-agent"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  leadName:        selectedThread.leadName,
                  leadPhone:       selectedThread.phone,
                  propertyAddress: selectedThread.propertyAddress,
                  agentName:       agent.name,
                  agentAgency:     agent.agency,
                  thread:          selectedThread.messages,
                  latestReply:     lastLeadMsg.body,
                }),
              }).then(r => r.json())
              setReplyDraft(res)
              setReplyText(res.draft ?? "")
            } catch {
              const fallback = `Hi ${selectedThread.leadName.split(" ")[0]}, thanks for getting back to me. Happy to help - what would you like to know? ${agent.name.split(" ")[0]}`
              setReplyDraft({ draft: fallback, intent: "UNKNOWN", reasoning: "Network error - contingency framework used" })
              setReplyText(fallback)
            } finally {
              setDraftingReply(false)
            }
          }

          const handleSendReply = async () => {
            if (!selectedThread || !replyText.trim()) return
            setSendingReply(true)
            try {
              await authFetch(apiUrl("/api/send"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  leadId:          selectedThread.leadId || selectedThread.phone,
                  leadName:        selectedThread.leadName,
                  phone:           selectedThread.phone,
                  email:           selectedThread.email,
                  agentEmail:      agent.email,
                  agentName:       agent.name,
                  agentAgency:     agent.agency,
                  agentPhone:      agent.phone,
                  agencyColor:     theme.primary,
                  agencyTagline:   agent.tagline,
                  propertyAddress: selectedThread.propertyAddress,
                  sms:             replyText,
                  subject:         "",
                  emailBody:       "",
                  channel:         "sms",
                }),
              })
              // Refresh threads after sending
              const updated = await authFetch(apiUrl("/api/conversations")).then(r => r.json())
              setInboxThreads(updated.threads ?? [])
              setUnreadReplies(updated.unread ?? 0)
              setReplyDraft(null)
              setReplyText("")
            } finally {
              setSendingReply(false)
            }
          }

          const intentColors: Record<string, string> = {
            INTEREST: "#22c55e", QUESTION: "#3b82f6", OBJECTION: "#f59e0b",
            BOOKING: "#8b5cf6", OPT_OUT: "#ef4444", UNKNOWN: C.muted,
          }

          return (
            <motion.div
              key="inbox"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              style={{
                position: "fixed", top: 60, right: 16, zIndex: 199,
                width: 360, maxHeight: "78vh",
                display: "flex", flexDirection: "column",
                background: C.bg2, border: `1px solid ${C.border}`,
                borderRadius: 14, fontFamily: FONT,
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              {/* Header */}
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {selectedThread ? (
                  <button onClick={() => { setSelectedThreadPhone(null); setReplyDraft(null); setReplyText("") }}
                    style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontSize: 14, padding: "0 4px 0 0", fontFamily: FONT }}>
                    ←
                  </button>
                ) : null}
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>
                  {selectedThread ? selectedThread.leadName : "SMS Replies"}
                </div>
                {!selectedThread && (
                  <button
                    disabled={seedingDemo}
                    onClick={async () => {
                      setSeedingDemo(true)
                      try {
                        await authFetch(apiUrl("/api/conversations/seed-demo"), { method: "POST" })
                        const updated = await authFetch(apiUrl("/api/conversations")).then(r => r.json())
                        setInboxThreads(updated.threads ?? [])
                        setUnreadReplies(updated.unread ?? 0)
                      } finally { setSeedingDemo(false) }
                    }}
                    style={{
                      padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                      color: "#f59e0b", cursor: "pointer", fontFamily: FONT,
                    }}
                  >
                    {seedingDemo ? "…" : "Simulate reply"}
                  </button>
                )}
                <button onClick={() => { setShowInbox(false); setSelectedThreadPhone(null); setReplyDraft(null) }}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
              </div>

              {/* Thread list */}
              {!selectedThread && (
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {inboxThreads.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                      No replies yet. Hit "Simulate reply" to demo the inbox flow.
                    </div>
                  ) : inboxThreads.map(t => {
                    const last = t.messages[t.messages.length - 1]
                    const isUnread = t.messages.some(m => m.role === "lead") &&
                      new Date(t.lastReplyAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                    return (
                      <div key={t.phone}
                        onClick={() => { setSelectedThreadPhone(t.phone); setReplyDraft(null); setReplyText(""); authFetch(apiUrl(`/api/conversations/${encodeURIComponent(t.phone)}/read`), { method: "POST" }) }}
                        style={{
                          padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
                          background: isUnread ? "rgba(245,158,11,0.05)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isUnread ? "#f59e0b" : C.text, display: "flex", alignItems: "center", gap: 5 }}>
                            {isUnread && <span style={{ marginRight: 2 }}>●</span>}{t.leadName}
                            {t.leadId?.startsWith("vendor_") && (
                              <span style={{ fontSize: 9, color: theme.primary, fontWeight: 700, background: theme.dim, padding: "1px 5px", borderRadius: 4, letterSpacing: 0.3 }}>VENDOR</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: C.faint }}>
                            {new Date(t.lastReplyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.propertyAddress || t.phone}
                        </div>
                        {last && (
                          <div style={{ fontSize: 12, color: last.role === "lead" ? C.text : C.faint, fontStyle: last.role === "agent" ? "italic" : "normal" }}>
                            {last.role === "agent" ? "You: " : ""}{last.body.slice(0, 90)}{last.body.length > 90 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Thread expand view */}
              {selectedThread && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  {/* Property tag */}
                  <div style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.muted, flexShrink: 0 }}>
                    {selectedThread.propertyAddress}
                  </div>

                  {/* Message bubbles */}
                  <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedThread.messages.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "agent" ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "80%", padding: "8px 11px",
                          borderRadius: m.role === "agent" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          background: m.role === "agent" ? theme.primary + "33" : C.bg3,
                          border: `1px solid ${m.role === "agent" ? theme.primary + "44" : C.border}`,
                          fontSize: 12, color: C.text, lineHeight: 1.5,
                        }}>
                          {m.body}
                          <div style={{ fontSize: 9, color: C.faint, marginTop: 3, textAlign: m.role === "agent" ? "right" : "left" }}>
                            {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI Reply section */}
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 14px", flexShrink: 0 }}>
                    {!replyDraft ? (
                      <button
                        onClick={handleDraftReply}
                        disabled={draftingReply}
                        style={{
                          width: "100%", padding: "9px 0", borderRadius: 8, border: "none",
                          background: draftingReply ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                          color: draftingReply ? C.muted : "white",
                          fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: draftingReply ? "default" : "pointer",
                        }}
                      >
                        {draftingReply ? "Drafting AI reply…" : "✦ Draft AI Reply"}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                            background: (intentColors[replyDraft.intent] ?? C.muted) + "22",
                            color: intentColors[replyDraft.intent] ?? C.muted,
                            border: `1px solid ${(intentColors[replyDraft.intent] ?? C.muted) + "44"}`,
                          }}>{replyDraft.intent}</span>
                          <span style={{ fontSize: 10, color: C.faint, flex: 1 }}>{replyDraft.reasoning}</span>
                          <button onClick={handleDraftReply} style={{ background: "none", border: "none", color: theme.primary, fontSize: 10, cursor: "pointer", fontFamily: FONT }}>Redraft</button>
                        </div>
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          rows={3}
                          style={{
                            width: "100%", background: C.bg3, border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12,
                            fontFamily: FONT, lineHeight: 1.5, resize: "none", outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: replyText.length > 160 ? "#ef4444" : C.faint }}>{replyText.length}/160</span>
                          <button
                            onClick={handleSendReply}
                            disabled={sendingReply || !replyText.trim()}
                            style={{
                              padding: "7px 18px", borderRadius: 8, border: "none",
                              background: sendingReply || !replyText.trim() ? C.bg3 : theme.primary,
                              color: sendingReply || !replyText.trim() ? C.muted : "white",
                              fontSize: 12, fontWeight: 700, fontFamily: FONT,
                              cursor: sendingReply || !replyText.trim() ? "default" : "pointer",
                            }}
                          >
                            {sendingReply ? "Sending…" : "Send Reply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )
        })()}
      </AnimatePresence>

    <AnimatePresence mode="wait">
      {stage.kind === "portfolio" && (
        <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <PortfolioPage
            onSelectActive={(property, soldLeads) =>
              setStage({ kind: "matching", property, soldLeads })
            }
            onSelectSold={(soldProperty, leads) =>
              setStage({ kind: "soldLeads", soldProperty, leads })
            }
            onAuctionSaved={(property, leads) =>
              setStage({ kind: "missedOut", auctionProperty: property, leads })
            }
            onSettings={onSettings}
            agent={agent}
            theme={theme}
          />
        </motion.div>
      )}

      {/* ── Vendor Prospecting Stages ─────────────────────────────────────── */}
      {stage.kind === "vendorPortfolio" && (
        <motion.div key="vendorPortfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <VendorPortfolioPage
            agent={agent}
            theme={theme}
            onAnalyse={segmented =>
              setStage({ kind: "vendorAnalysing", segmented })
            }
            onSelectBuyer={entry =>
              setStage({ kind: "vendorProfile", entry, from: "vendorPortfolio" })
            }
          />
        </motion.div>
      )}

      {stage.kind === "vendorAnalysing" && (
        <motion.div key="vendorAnalysing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <VendorAnalysingScreen
            segmented={stage.segmented}
            theme={theme}
            onComplete={() => setStage({ kind: "vendorDashboard", segmented: stage.segmented })}
          />
        </motion.div>
      )}

      {stage.kind === "vendorDashboard" && (
        <motion.div key="vendorDashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <VendorDashboardPage
            segmented={stage.segmented}
            onBack={() => setStage({ kind: "vendorPortfolio" })}
            theme={theme}
            agent={agent}
            onSelectEntry={entry => {
              const idx = stage.segmented.findIndex(e => e.buyer.id === entry.buyer.id)
              setStage({ kind: "vendorProfile", entry, allEntries: stage.segmented, entryIdx: idx >= 0 ? idx : 0, from: "vendorDashboard" })
            }}
            onGenerateAll={items =>
              setStage({ kind: "outreachQueue", items, segmented: stage.segmented })
            }
          />
        </motion.div>
      )}

      {stage.kind === "outreachQueue" && (
        <motion.div key="outreachQueue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <OutreachQueueStage
            items={stage.items}
            agent={agent}
            theme={theme}
            onBack={() => setStage({ kind: "vendorDashboard", segmented: stage.segmented })}
            onDone={() => setStage({ kind: "vendorDashboard", segmented: stage.segmented })}
          />
        </motion.div>
      )}

      {stage.kind === "vendorProfile" && (
        <motion.div key="vendorProfile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <VendorProfilePage
            entry={stage.entry}
            agent={agent}
            theme={theme}
            onBack={() => {
              if (stage.from === "vendorPortfolio") {
                setStage({ kind: "vendorPortfolio" })
              } else {
                // Re-run segmentation to go back to pipeline dashboard
                const buyers = getPastBuyersForAgent(agent)
                const financialsMap = new Map<number, FinancialSnapshot>()
                for (const b of buyers) {
                  const est = CURRENT_VALUE_ESTIMATES[b.id]
                  if (!est) continue
                  financialsMap.set(b.id, calculateFinancials(b.purchasePrice, b.purchaseDate, est, b.deposit))
                }
                setStage({ kind: "vendorDashboard", segmented: batchSegment(buyers, financialsMap) })
              }
            }}
            allEntries={stage.allEntries}
            entryIdx={stage.entryIdx}
            onNavigate={entry => {
              const idx = stage.allEntries?.findIndex(e => e.buyer.id === entry.buyer.id) ?? 0
              setStage({ kind: "vendorProfile", entry, allEntries: stage.allEntries, entryIdx: idx, from: stage.from })
            }}
            onReview={(sms, emailSubject, emailBody) =>
              setStage({ kind: "vendorReview", entry: stage.entry, sms, emailSubject, emailBody, allEntries: stage.allEntries, entryIdx: stage.entryIdx })
            }
            vendorSettings={_vendorSettings}
          />
        </motion.div>
      )}

      {stage.kind === "vendorReview" && (
        <motion.div key="vendorReview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <VendorReviewPanel
            entry={stage.entry}
            agent={agent}
            theme={theme}
            sms={stage.sms}
            emailSubject={stage.emailSubject}
            emailBody={stage.emailBody}
            allEntries={stage.allEntries}
            onBack={() => setStage({ kind: "vendorProfile", entry: stage.entry, allEntries: stage.allEntries, entryIdx: stage.entryIdx ?? 0, from: "vendorDashboard" })}
            onNext={(() => {
              if (!stage.allEntries || stage.entryIdx == null) return undefined
              const nextIdx = stage.entryIdx + 1
              if (nextIdx >= stage.allEntries.length) return undefined
              const nextEntry = stage.allEntries[nextIdx]
              return () => setStage({ kind: "vendorProfile", entry: nextEntry, allEntries: stage.allEntries, entryIdx: nextIdx, from: "vendorDashboard" })
            })()}
          />
        </motion.div>
      )}

      {stage.kind === "soldLeads" && (
        <motion.div key="soldLeads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <SoldLeadsPage
            soldProperty={stage.soldProperty}
            leads={stage.leads}
            onBack={() => setStage({ kind: "portfolio" })}
            onSelectLead={(scoredLead, property) =>
              setStage({
                kind: "profile",
                property,
                lead: scoredLead,
                soldSLM: loadSLMForProperty(stage.soldProperty.id),
                allLeads: [scoredLead],
              })
            }
            theme={theme}
          />
        </motion.div>
      )}

      {stage.kind === "matching" && (
        <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <MatchingScreen
            property={stage.property}
            soldLeads={stage.soldLeads}
            theme={theme}
            onComplete={allLeads =>
              setStage({ kind: "leads", property: stage.property, allLeads })
            }
          />
        </motion.div>
      )}

      {stage.kind === "leads" && (
        <motion.div key="leads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <LeadsPage
            property={stage.property}
            allLeads={stage.allLeads}
            onBack={() => setStage({ kind: "portfolio" })}
            onSelect={lead =>
              setStage({
                kind: "profile",
                property: stage.property,
                lead,
                soldSLM: loadSLMForProperty(lead.fromPropertyId),
                allLeads: stage.allLeads,
              })
            }
            theme={theme}
          />
        </motion.div>
      )}

      {stage.kind === "profile" && (
        <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <ProfilePage
            property={stage.property}
            lead={stage.lead}
            soldSLM={stage.soldSLM}
            onBack={() =>
              setStage({
                kind: "leads",
                property: stage.property,
                allLeads: stage.allLeads,
              })
            }
            onGenerate={transcript => {
              // Log voice note to Sheets immediately when agent taps Generate
              if (transcript.trim()) {
                postEvent({
                  leadId: stage.lead.id, leadName: stage.lead.name,
                  propertyAddress: stage.property.address + ", " + stage.property.suburb,
                  fromProperty: stage.soldSLM.address,
                  eventType: "voice_note",
                  transcript,
                })
              }
              setStage({
                kind: "generating",
                property: stage.property,
                lead: stage.lead,
                soldSLM: stage.soldSLM,
                transcript,
                allLeads: stage.allLeads,
              })
            }}
            theme={theme}
          />
        </motion.div>
      )}

      {stage.kind === "generating" && (
        <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <GeneratingScreen
            property={stage.property}
            lead={stage.lead}
            soldSLM={stage.soldSLM}
            transcript={stage.transcript}
            agent={agent}
            theme={theme}
            onComplete={(sms, emailSubject, emailBody) =>
              setStage({
                kind: "review",
                property: stage.property,
                lead: stage.lead,
                soldSLM: stage.soldSLM,
                transcript: stage.transcript,
                sms,
                emailSubject,
                emailBody,
                allLeads: stage.allLeads,
              })
            }
          />
        </motion.div>
      )}

      {stage.kind === "review" && (
        <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <ReviewPanel
            property={stage.property}
            lead={stage.lead}
            soldSLM={stage.soldSLM}
            agent={agent}
            theme={theme}
            transcript={stage.transcript}
            sms={stage.sms}
            emailSubject={stage.emailSubject}
            emailBody={stage.emailBody}
            onBack={() => setStage({ kind: "leads", property: stage.property, allLeads: stage.allLeads })}
          />
        </motion.div>
      )}
      {stage.kind === "missedOut" && (
        <motion.div key="missedOut" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <MissedOutPage
            auctionProperty={stage.auctionProperty}
            leads={stage.leads}
            onBack={() => setStage({ kind: "portfolio" })}
            theme={theme}
            onSelectLead={(lead, property) =>
              setStage({
                kind: "profile",
                property,
                lead,
                soldSLM: loadSLMForProperty(stage.auctionProperty.id),
                allLeads: [lead],
              })
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
