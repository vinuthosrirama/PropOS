import { useState } from "react"
import { motion } from "framer-motion"
import { FONT, type PortfolioProperty, type AgentProfile } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import type { PropertySLM } from "../data/propertySlm"

interface Props {
  property: PortfolioProperty
  slm:      PropertySLM
  agent:    AgentProfile
  onClose:  () => void
}

type BuyerType = "first_home" | "investor" | "owner_occupier"

const BUYER_TABS: { key: BuyerType; label: string; short: string }[] = [
  { key: "first_home",      label: "First Home Buyer", short: "FHB" },
  { key: "investor",        label: "Investor",         short: "INV" },
  { key: "owner_occupier",  label: "Owner Occupier",   short: "OO" },
]

const P = {
  ink:     "#3f0278",
  mid:     "#7B35BE",
  tint:    "#f3eeff",
  rule:    "rgba(63,2,120,0.12)",
  white:   "#ffffff",
  ink10:   "rgba(63,2,120,0.10)",
  ink18:   "rgba(63,2,120,0.18)",
  ink60:   "rgba(63,2,120,0.60)",
}

function val(v: unknown): string {
  if (v === "TBD" || v === undefined || v === null) return "—"
  if (typeof v === "number") return v.toLocaleString("en-AU")
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

function money(v: unknown): string {
  if (v === "TBD" || v === undefined || v === null || typeof v !== "number") return "—"
  return "$" + v.toLocaleString("en-AU")
}

const Row = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "7px 0", borderBottom: `1px solid ${P.rule}`, gap: 12,
  }}>
    <span style={{ fontSize: 12, color: "#555", fontWeight: 400, flexShrink: 0, minWidth: 110 }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: accent ? 700 : 500, color: accent ? P.ink : "#1a1a1a", textAlign: "right" }}>
      {value}
    </span>
  </div>
)

// ── Berwick research data (real data from web research) ──────────────────────
interface LocationData {
  schools: { name: string; type: string; distance: string; notes?: string }[]
  transport: { trainStation: string; trainLine: string; trainDistance: string; busRoutes: string }
  amenities: { name: string; type: string; distance: string }[]
  zoning: string
  councilRatesEst: string
  subdivisionNotes: string
  crimeNote: string
}

function getBerwickLocationData(): LocationData {
  return {
    schools: [
      { name: "Berwick Primary School", type: "Government Primary", distance: "0.4 km", notes: "IB World School, 1,143 students" },
      { name: "St Michael's Primary", type: "Catholic Primary", distance: "1.5 km" },
      { name: "Nossal High School", type: "Government Selective", distance: "2.5 km", notes: "Median ATAR 92" },
      { name: "Berwick Secondary College", type: "Government Secondary", distance: "1.5 km" },
      { name: "St Margaret's Berwick Grammar", type: "Independent", distance: "1.2 km", notes: "Co-ed, non-denominational" },
      { name: "Haileybury Berwick", type: "Independent", distance: "0.8 km" },
    ],
    transport: {
      trainStation: "Berwick Railway Station",
      trainLine: "Pakenham / Traralgon Line",
      trainDistance: "2.0 km (~20 min walk)",
      busRoutes: "828, 834, 835, 836, 846, 888",
    },
    amenities: [
      { name: "Eden Rise Village", type: "Shopping", distance: "1.2 km" },
      { name: "Berwick Village / High Street", type: "Shops & Cafes", distance: "1.5 km" },
      { name: "Casey Hospital", type: "Public Hospital (229 beds)", distance: "2.0 km" },
      { name: "St John of God Berwick", type: "Private Hospital", distance: "2.1 km" },
      { name: "Wilson Botanic Park", type: "Park (39 ha)", distance: "1.8 km" },
      { name: "Akoonah Park", type: "Recreation / Markets", distance: "2.5 km" },
    ],
    zoning: "General Residential Zone (GRZ), City of Casey",
    councilRatesEst: "$2,300 – $2,800/year (est.)",
    subdivisionNotes: "GRZ permits lots of 300–500 sqm. Lots over 700 sqm may be subdivisible (subject to overlays & heritage checks).",
    crimeNote: "Casey LGA: property crime down 41% over 10 years. Motor vehicle theft spike in 2024–25.",
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BuyerPitchReport({ property, slm, agent, onClose }: Props) {
  const [buyerType, setBuyerType] = useState<BuyerType>("first_home")
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const guideMin = property.priceMin ?? property.price * 0.95
  const guideMax = property.priceMax ?? property.price * 1.05

  const rentalLow   = typeof slm.rentalAppraisalLow  === "number" ? slm.rentalAppraisalLow  : null
  const rentalHigh  = typeof slm.rentalAppraisalHigh === "number" ? slm.rentalAppraisalHigh : null
  const annualRent  = rentalLow  ? rentalLow * 52 : null
  const grossYield  = typeof slm.grossYieldAtAsk     === "number" ? slm.grossYieldAtAsk     : null
  const council     = typeof slm.councilRates        === "number" ? slm.councilRates        : null
  const water       = typeof slm.waterRates          === "number" ? slm.waterRates          : null
  const growth      = typeof slm.suburb5yrGrowthPct  === "number" ? slm.suburb5yrGrowthPct  : null
  const medianPrice = typeof slm.suburbMedianPrice   === "number" ? slm.suburbMedianPrice   : null
  const stampDuty   = typeof slm.stampDutyEstimate   === "number" ? slm.stampDutyEstimate   : null
  const settlement  = typeof slm.settlementTermsDays === "number" ? slm.settlementTermsDays : null
  const comparables = slm.comparableSales !== "TBD" ? slm.comparableSales : []

  const purchasePrice  = property.price
  const annualGrowth   = growth ? growth / 100 : 0.05
  const projectedValue = purchasePrice * Math.pow(1 + annualGrowth / 5, 5)
  const equityGain     = projectedValue - purchasePrice
  const netRentalAnnual = annualRent && council && water ? annualRent - council - water : annualRent

  const loc = getBerwickLocationData()

  const tabLabel = BUYER_TABS.find(t => t.key === buyerType)?.label ?? "Brief"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(10,0,20,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: "#ffffff",
          width: "min(700px, calc(100vw - 32px))", maxHeight: "92vh", overflowY: "auto",
          borderRadius: 6,
          boxShadow: "0 32px 96px rgba(63,2,120,0.35), 0 4px 16px rgba(0,0,0,0.25)",
          fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
          color: "#1a1a1a",
        }}
        id="buyer-pitch-report"
      >

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ background: P.ink }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "16px 32px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                fontSize: 26, fontWeight: 800, color: "#fff",
                letterSpacing: -1.5, lineHeight: 1,
                fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}>
                {agent.agency}
              </div>
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 1, fontWeight: 500 }}>
                REAL ESTATE
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 }}>
                {tabLabel} Brief
              </div>
            </div>
          </div>

          <div style={{ padding: "22px 32px 24px" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
              color: "rgba(255,255,255,0.50)", marginBottom: 8,
            }}>
              Property {tabLabel} Brief
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: "#fff",
              letterSpacing: -0.7, lineHeight: 1.15, marginBottom: 4,
            }}>
              {property.address}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 18 }}>
              {property.suburb} {property.state} {property.postcode}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                `${money(guideMin)} – ${money(guideMax)}`,
                slm.beds !== "TBD" ? `${val(slm.beds)} bed` : null,
                slm.baths !== "TBD" ? `${val(slm.baths)} bath` : null,
                slm.cars  !== "TBD" ? `${val(slm.cars)} car`  : null,
                slm.landSqm !== "TBD" ? `${val(slm.landSqm)} m²` : null,
              ].filter(Boolean).map((chip, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 20, padding: "4px 11px",
                  color: "rgba(255,255,255,0.90)",
                }}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Buyer Type Tabs ────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 0,
          borderBottom: `2px solid ${P.rule}`,
          background: P.tint,
        }}>
          {BUYER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setBuyerType(tab.key)}
              style={{
                flex: 1,
                padding: "12px 8px",
                fontSize: 11, fontWeight: buyerType === tab.key ? 700 : 500,
                color: buyerType === tab.key ? P.ink : "#888",
                background: buyerType === tab.key ? "#fff" : "transparent",
                border: "none",
                borderBottom: buyerType === tab.key ? `2px solid ${P.ink}` : "2px solid transparent",
                cursor: "pointer",
                fontFamily: FONT,
                letterSpacing: 0.3,
                transition: "all 0.15s",
                marginBottom: -2,
              }}
            >
              {isMobile ? tab.short : tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ padding: "0 32px 36px" }}>

          <div style={{
            width: "100%", height: 210, overflow: "hidden",
            marginBottom: 28, background: "#ece6f4",
          }}>
            <img
              src={property.image}
              alt={property.address}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          {/* ── FIRST HOME BUYER ────────────────────────────── */}
          {buyerType === "first_home" && (
            <>
              {/* Equity Forecast */}
              <SectionHead>Equity Forecast</SectionHead>
              <div style={{
                background: P.tint, border: `1px solid ${P.ink18}`,
                borderRadius: 8, padding: "20px 22px", marginBottom: 28,
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                  gap: 16, marginBottom: 16,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>
                      Purchase Price
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>
                      {money(purchasePrice)}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>
                      Projected 5yr Value
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: P.ink, letterSpacing: -0.5 }}>
                      {money(Math.round(projectedValue))}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>
                      Equity Gain
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a", letterSpacing: -0.5 }}>
                      +{money(Math.round(equityGain))}
                    </div>
                  </div>
                </div>
                {growth !== null && (
                  <>
                    <div style={{ height: 6, background: P.ink10, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        background: `linear-gradient(90deg, ${P.ink}, ${P.mid})`,
                        width: `${Math.min((equityGain / purchasePrice) * 100 * 3, 100)}%`,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#666", textAlign: "center" }}>
                      Berwick suburb 5-year growth: <strong style={{ color: P.ink }}>{growth}%</strong>
                    </div>
                  </>
                )}
              </div>

              {/* Entry Costs */}
              <SectionHead>Entry Costs</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Price Guide"            value={`${money(guideMin)} – ${money(guideMax)}`} accent />
                <Row label="Stamp Duty (est.)"      value={stampDuty ? money(stampDuty) : "—"} />
                <Row label="FHB Stamp Duty Concession" value="May apply (check SRO eligibility)" />
                <Row label="Total Entry Cost"       value={stampDuty ? money(guideMax + stampDuty) : "—"} />
                <Row label="Deposit (10%)"          value={money(Math.round(guideMax * 0.1))} />
                <Row label="First Home Owner Grant"  value="$10,000 (if eligible, new home)" />
                {settlement !== null && <Row label="Settlement" value={`${settlement} days`} />}
              </div>

              {/* Lifestyle & Liveability */}
              <SectionHead>Lifestyle & Liveability</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Primary School"    value={`${val(slm.primarySchool)} (${val(slm.primarySchoolRating)})`} />
                <Row label="Secondary School"  value={`${val(slm.secondarySchool)} (${val(slm.secondarySchoolRating)})`} />
                <Row label="Train Station"     value={`${loc.transport.trainStation} (${loc.transport.trainDistance})`} />
                <Row label="Bus Routes"        value={loc.transport.busRoutes} />
                <Row label="Shopping"          value="Eden Rise Village (1.2 km), Berwick Village" />
                <Row label="Hospital"          value="Casey Hospital (2.0 km)" />
              </div>

              {/* Investment Potential (for future) */}
              <SectionHead>Future Investment Potential</SectionHead>
              <div style={{
                display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
                gap: 10, marginBottom: 28,
              }}>
                {[
                  { label: "Rental Appraisal", value: rentalLow && rentalHigh ? `$${rentalLow}–$${rentalHigh}/wk` : "—", sub: "if you move on" },
                  { label: "Gross Yield", value: grossYield ? `${grossYield}%` : "—", sub: "at asking price" },
                  { label: "Suburb Median", value: medianPrice ? money(medianPrice) : "—", sub: "current median" },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: P.tint, border: `1px solid ${P.ink18}`,
                    borderRadius: 8, padding: "16px 14px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: P.ink, letterSpacing: -0.5, lineHeight: 1, marginBottom: 4 }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 2 }}>{card.label}</div>
                    <div style={{ fontSize: 9, color: "#888" }}>{card.sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── INVESTOR ────────────────────────────────────── */}
          {buyerType === "investor" && (
            <>
              {/* Yield & Returns */}
              <SectionHead>Yield & Returns</SectionHead>
              <div style={{
                display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                gap: 10, marginBottom: 28,
              }}>
                {[
                  { label: "Gross Yield", value: grossYield ? `${grossYield}%` : "—", sub: "at asking" },
                  { label: "Weekly Rent", value: rentalLow && rentalHigh ? `$${rentalLow}–$${rentalHigh}` : "—", sub: "appraisal" },
                  { label: "Annual Rent", value: annualRent ? money(annualRent) : "—", sub: "gross" },
                  { label: "Net Rent (est.)", value: netRentalAnnual ? money(Math.round(netRentalAnnual)) : "—", sub: "after rates" },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: P.tint, border: `1px solid ${P.ink18}`,
                    borderRadius: 8, padding: "14px 10px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: P.ink, letterSpacing: -0.5, lineHeight: 1, marginBottom: 4 }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#333", marginBottom: 2 }}>{card.label}</div>
                    <div style={{ fontSize: 9, color: "#888" }}>{card.sub}</div>
                  </div>
                ))}
              </div>

              {/* Financial Detail */}
              <SectionHead>Financial Detail</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Price Guide"            value={`${money(guideMin)} – ${money(guideMax)}`} accent />
                <Row label="Stamp Duty (est.)"      value={stampDuty ? money(stampDuty) : "—"} />
                <Row label="Total Entry Cost"       value={stampDuty ? money(guideMax + stampDuty) : "—"} />
                <Row label="Council Rates (annual)" value={council ? money(council) : loc.councilRatesEst} />
                <Row label="Water Rates (annual)"   value={water ? money(water) : "—"} />
                <Row label="Deposit"                value={typeof slm.depositPct === "number" ? `${slm.depositPct}%` : "10%"} />
                {settlement !== null && <Row label="Settlement" value={`${settlement} days`} />}
              </div>

              {/* Subdivision Potential */}
              <SectionHead>Subdivision Potential</SectionHead>
              <div style={{
                background: P.tint, border: `1px solid ${P.ink18}`,
                borderRadius: 8, padding: "16px 20px", marginBottom: 28,
              }}>
                <Row label="Land Size" value={slm.landSqm !== "TBD" ? `${val(slm.landSqm)} m²` : "—"} accent />
                <Row label="Zoning" value={loc.zoning} />
                <Row label="Min Lot Size (GRZ)" value="300–500 m² per lot" />
                <Row label="Subdivision" value={val(slm.subdivisionPotential)} />
                <div style={{ fontSize: 11, color: "#666", marginTop: 10 }}>
                  {loc.subdivisionNotes}
                </div>
              </div>

              {/* Tenant Profile */}
              <SectionHead>Tenant Profile & Demographics</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Suburb Population" value="50,298" />
                <Row label="Median Age" value="37–38 years" />
                <Row label="Key Demographic" value="Families (35–44 yr), children" />
                <Row label="Owner-Occupied" value="74.7%" />
                <Row label="Median Household Income" value="$2,084–$2,113/wk" />
                <Row label="Avg Days on Market" value="20 days (houses)" />
              </div>

              {/* 5-Year Growth */}
              {growth !== null && (
                <>
                  <SectionHead>5-Year Capital Growth Projection</SectionHead>
                  <div style={{
                    background: P.tint, border: `1px solid ${P.ink18}`,
                    borderRadius: 8, padding: "20px 22px", marginBottom: 28,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Purchase</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>{money(purchasePrice)}</div>
                      </div>
                      <div style={{ fontSize: 22, color: P.mid, fontWeight: 300, paddingTop: 8 }}>→</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>5yr Value</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: P.ink, letterSpacing: -0.5 }}>{money(Math.round(projectedValue))}</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: P.ink10, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        background: `linear-gradient(90deg, ${P.ink}, ${P.mid})`,
                        width: `${Math.min((equityGain / purchasePrice) * 100 * 3, 100)}%`,
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#666" }}>5yr growth: <strong style={{ color: P.ink }}>{growth}%</strong></span>
                      <span style={{ fontWeight: 700, color: P.ink }}>+{money(Math.round(equityGain))} equity</span>
                    </div>
                    {netRentalAnnual && (
                      <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                        Net rental (5yr): <strong style={{ color: P.ink }}>{money(Math.round(netRentalAnnual * 5))}</strong>
                        <span style={{ color: "#aaa" }}> (gross minus rates)</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Comparables */}
              {comparables.length > 0 && (
                <>
                  <SectionHead>Recent Comparable Sales</SectionHead>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 28 }}>
                    <thead>
                      <tr style={{ background: P.tint }}>
                        {["Address", "Beds", "Sold Price", "Date"].map(h => (
                          <th key={h} style={{
                            textAlign: h === "Address" ? "left" : "right",
                            padding: "8px 10px", color: P.ink60,
                            fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparables.map((c, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${P.rule}`, background: i % 2 === 0 ? "#fff" : "#faf7fd" }}>
                          <td style={{ padding: "8px 10px", color: "#333", fontWeight: 500 }}>{c.address}</td>
                          <td style={{ padding: "8px 10px", color: "#555", textAlign: "right" }}>{c.beds}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: P.ink, textAlign: "right" }}>{money(c.price)}</td>
                          <td style={{ padding: "8px 10px", color: "#999", fontSize: 11, textAlign: "right" }}>{c.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Key Features */}
              <SectionHead>Property Features</SectionHead>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 32 }}>
                <div style={{ paddingRight: 24, borderRight: `1px solid ${P.rule}` }}>
                  <Row label="Solar"            value={typeof slm.solarKw === "number" ? `${slm.solarKw}kW` : val(slm.solarKw)} />
                  <Row label="Air Conditioning" value={val(slm.airConType)} />
                  <Row label="Granny Flat"      value={val(slm.grannyFlatApproved)} />
                </div>
                <div style={{ paddingLeft: 24 }}>
                  <Row label="Pool"              value={val(slm.pool)} />
                  <Row label="Subdivision"       value={val(slm.subdivisionPotential)} />
                  <Row label="Year Built"        value={val(slm.yearBuilt)} />
                </div>
              </div>
            </>
          )}

          {/* ── OWNER OCCUPIER ──────────────────────────────── */}
          {buyerType === "owner_occupier" && (
            <>
              {/* Schools */}
              <SectionHead>Schools & Education</SectionHead>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 28 }}>
                <thead>
                  <tr style={{ background: P.tint }}>
                    {["School", "Type", "Distance", "Notes"].map(h => (
                      <th key={h} style={{
                        textAlign: "left",
                        padding: "8px 10px", color: P.ink60,
                        fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loc.schools.map((s, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${P.rule}`, background: i % 2 === 0 ? "#fff" : "#faf7fd" }}>
                      <td style={{ padding: "8px 10px", color: "#333", fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: "8px 10px", color: "#555", fontSize: 11 }}>{s.type}</td>
                      <td style={{ padding: "8px 10px", color: P.ink, fontWeight: 600, fontSize: 11 }}>{s.distance}</td>
                      <td style={{ padding: "8px 10px", color: "#888", fontSize: 11 }}>{s.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Zoning */}
              <SectionHead>Zoning & Planning</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Zoning" value={loc.zoning} accent />
                <Row label="Council" value="City of Casey" />
                <Row label="Council Rates (est.)" value={council ? money(council) : loc.councilRatesEst} />
                <Row label="Water Rates (est.)" value={water ? money(water) : "—"} />
              </div>

              {/* Transport */}
              <SectionHead>Transport & Commute</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Train Station" value={`${loc.transport.trainStation} (${loc.transport.trainDistance})`} />
                <Row label="Train Line" value={loc.transport.trainLine} />
                <Row label="Bus Routes" value={loc.transport.busRoutes} />
                <Row label="Drive to Melbourne CBD" value="35–55 min (off-peak)" />
              </div>

              {/* Amenities */}
              <SectionHead>Nearby Amenities</SectionHead>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 28 }}>
                <thead>
                  <tr style={{ background: P.tint }}>
                    {["Amenity", "Type", "Distance"].map(h => (
                      <th key={h} style={{
                        textAlign: "left",
                        padding: "8px 10px", color: P.ink60,
                        fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loc.amenities.map((a, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${P.rule}`, background: i % 2 === 0 ? "#fff" : "#faf7fd" }}>
                      <td style={{ padding: "8px 10px", color: "#333", fontWeight: 500 }}>{a.name}</td>
                      <td style={{ padding: "8px 10px", color: "#555", fontSize: 11 }}>{a.type}</td>
                      <td style={{ padding: "8px 10px", color: P.ink, fontWeight: 600, fontSize: 11 }}>{a.distance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Lifestyle Features */}
              <SectionHead>Lifestyle & Property Features</SectionHead>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 28 }}>
                <div style={{ paddingRight: 24, borderRight: `1px solid ${P.rule}` }}>
                  <Row label="Solar"            value={typeof slm.solarKw === "number" ? `${slm.solarKw}kW` : val(slm.solarKw)} />
                  <Row label="Air Conditioning" value={val(slm.airConType)} />
                  <Row label="Pool"             value={val(slm.pool)} />
                </div>
                <div style={{ paddingLeft: 24 }}>
                  <Row label="Granny Flat"      value={val(slm.grannyFlatApproved)} />
                  <Row label="Year Built"       value={val(slm.yearBuilt)} />
                  <Row label="Land Size"        value={slm.landSqm !== "TBD" ? `${val(slm.landSqm)} m²` : "—"} />
                </div>
              </div>

              {/* Suburb Snapshot */}
              <SectionHead>Suburb Snapshot</SectionHead>
              <div style={{ marginBottom: 28 }}>
                <Row label="Population" value="50,298" />
                <Row label="Median Age" value="37–38 years" />
                <Row label="Key Demographic" value="Families with children (35–44)" />
                <Row label="Owner-Occupied" value="74.7%" />
                {medianPrice !== null && <Row label="Suburb Median" value={money(medianPrice)} accent />}
                <Row label="Parks & Green Space" value="72 parks (10.3% of suburb area)" />
                <Row label="Safety Note" value={loc.crimeNote} />
              </div>

              {/* Entry Costs */}
              <SectionHead>Purchase Costs</SectionHead>
              <div style={{ marginBottom: 32 }}>
                <Row label="Price Guide"       value={`${money(guideMin)} – ${money(guideMax)}`} accent />
                <Row label="Stamp Duty (est.)" value={stampDuty ? money(stampDuty) : "—"} />
                <Row label="Deposit (10%)"     value={money(Math.round(guideMax * 0.1))} />
                {settlement !== null && <Row label="Settlement" value={`${settlement} days`} />}
              </div>
            </>
          )}

          {/* ── Agent Footer ─────────────────────────────────── */}
          <div style={{
            borderTop: `2px solid ${P.ink}`,
            paddingTop: 18,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>
                Licensed Estate Agent / Auctioneer
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                {agent.phone} · {agent.email}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 24, fontWeight: 800, color: P.ink, letterSpacing: -1.2,
                fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}>
                {agent.agency}
              </div>
              <div style={{ fontSize: 9, color: "#aaa", letterSpacing: 0.5 }}>{agent.agency.toLowerCase().replace(/\s+/g, "")}.com.au</div>
            </div>
          </div>

          <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                padding: "9px 22px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "transparent", border: `1px solid ${P.ink18}`, color: "#666",
                cursor: "pointer", fontFamily: FONT,
              }}
            >
              Close
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: "9px 22px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: P.ink, border: "none", color: "#fff",
                cursor: "pointer", fontFamily: FONT,
              }}
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase",
      color: P.mid, borderBottom: `2px solid ${P.mid}`,
      paddingBottom: 5, marginBottom: 12, marginTop: 4,
    }}>
      {children}
    </div>
  )
}
