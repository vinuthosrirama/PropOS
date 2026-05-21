/**
 * BuyerPitchReport — Peake-branded property investment brief.
 *
 * On-screen modal + printable via browser Print.
 * Colours sourced from peakere.com.au: primary #3f0278.
 */

import { motion } from "framer-motion"
import { FONT, type PortfolioProperty, type AgentProfile } from "../data"
import type { PropertySLM } from "../data/propertySlm"

interface Props {
  property: PortfolioProperty
  slm:      PropertySLM
  agent:    AgentProfile
  onClose:  () => void
}

// ── Peake brand tokens ────────────────────────────────────────────────────────
const P = {
  ink:     "#3f0278",          // primary deep purple — peakere.com.au
  mid:     "#7B35BE",          // medium purple for accents / gradients
  tint:    "#f3eeff",          // very light purple background tint
  rule:    "rgba(63,2,120,0.12)",  // subtle border
  white:   "#ffffff",
  ink10:   "rgba(63,2,120,0.10)",
  ink18:   "rgba(63,2,120,0.18)",
  ink60:   "rgba(63,2,120,0.60)",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuyerPitchReport({ property, slm, agent, onClose }: Props) {
  const guideMin = property.priceMin ?? property.price * 0.95
  const guideMax = property.priceMax ?? property.price * 1.05

  // Derived financials
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

  // 5-year projection
  const purchasePrice  = property.price
  const annualGrowth   = growth ? growth / 100 : 0.05
  const projectedValue = purchasePrice * Math.pow(1 + annualGrowth / 5, 5)
  const equityGain     = projectedValue - purchasePrice
  const netRentalAnnual = annualRent && council && water ? annualRent - council - water : annualRent

  // KPI cards
  const kpiCards = [
    {
      label: "Gross Yield",
      value: grossYield ? `${grossYield}%` : "—",
      sub:   "at asking price",
    },
    {
      label: "Rental Appraisal",
      value: rentalLow && rentalHigh ? `$${rentalLow}–$${rentalHigh}/wk` : "—",
      sub:   "estimated weekly",
    },
    {
      label: "Annual Income",
      value: annualRent ? money(annualRent) : "—",
      sub:   "gross rental",
    },
  ]

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
          width: 700, maxHeight: "92vh", overflowY: "auto",
          borderRadius: 6,
          boxShadow: "0 32px 96px rgba(63,2,120,0.35), 0 4px 16px rgba(0,0,0,0.25)",
          fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
          color: "#1a1a1a",
        }}
        id="buyer-pitch-report"
      >

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          background: P.ink,
          padding: "0 0 0 0",
        }}>
          {/* Top bar: logo + agency label */}
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
              <div style={{
                width: 1, height: 20, background: "rgba(255,255,255,0.25)", margin: "0 2px",
              }} />
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 1, fontWeight: 500 }}>
                REAL ESTATE
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 }}>
                Property Investment Brief
              </div>
            </div>
          </div>

          {/* Property address block */}
          <div style={{ padding: "22px 32px 24px" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
              color: "rgba(255,255,255,0.50)", marginBottom: 8,
            }}>
              Property Investment Brief
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

            {/* Price + specs in a pill row */}
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

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ padding: "0 32px 36px" }}>

          {/* Property image */}
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

          {/* ── Investment Snapshot ──────────────────────────── */}
          <SectionHead>Investment Snapshot</SectionHead>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10, marginBottom: 28,
          }}>
            {kpiCards.map((card, i) => (
              <div key={i} style={{
                background: P.tint, border: `1px solid ${P.ink18}`,
                borderRadius: 8, padding: "16px 14px", textAlign: "center",
              }}>
                <div style={{
                  fontSize: 22, fontWeight: 800, color: P.ink,
                  letterSpacing: -0.5, lineHeight: 1, marginBottom: 4,
                }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 2 }}>{card.label}</div>
                <div style={{ fontSize: 9, color: "#888" }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Financial Detail ─────────────────────────────── */}
          <SectionHead>Financial Detail</SectionHead>
          <div style={{ marginBottom: 28 }}>
            <Row label="Price Guide"            value={`${money(guideMin)} – ${money(guideMax)}`} accent />
            <Row label="Stamp Duty (est.)"      value={stampDuty ? money(stampDuty) : "—"} />
            <Row label="Total Entry Cost"       value={stampDuty ? money(guideMax + stampDuty) : "—"} />
            <Row label="Council Rates (annual)" value={council ? money(council) : "—"} />
            <Row label="Water Rates (annual)"   value={water ? money(water) : "—"} />
            {settlement !== null && <Row label="Settlement Terms" value={`${settlement} days`} />}
            <Row label="Deposit"                value={typeof slm.depositPct === "number" ? `${slm.depositPct}%` : "10%"} />
          </div>

          {/* ── 5-Year Growth Projection ─────────────────────── */}
          {growth !== null && (
            <>
              <SectionHead>5-Year Growth Projection</SectionHead>
              <div style={{
                background: P.tint, border: `1px solid ${P.ink18}`,
                borderRadius: 8, padding: "20px 22px", marginBottom: 28,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>
                      Purchase Price
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>
                      {money(purchasePrice)}
                    </div>
                  </div>
                  <div style={{ fontSize: 22, color: P.mid, fontWeight: 300, paddingTop: 8 }}>→</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>
                      Projected Value (5yr)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: P.ink, letterSpacing: -0.5 }}>
                      {money(Math.round(projectedValue))}
                    </div>
                  </div>
                </div>

                {/* Growth progress bar */}
                <div style={{ height: 6, background: P.ink10, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: `linear-gradient(90deg, ${P.ink}, ${P.mid})`,
                    width: `${Math.min((equityGain / purchasePrice) * 100 * 3, 100)}%`,
                  }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#666" }}>
                    Suburb 5yr growth: <strong style={{ color: P.ink }}>{growth}%</strong>
                  </span>
                  <span style={{ fontWeight: 700, color: P.ink }}>
                    +{money(Math.round(equityGain))} equity gain
                  </span>
                </div>

                {netRentalAnnual && (
                  <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                    Net rental income (5yr estimate):{" "}
                    <strong style={{ color: P.ink }}>
                      {money(Math.round(netRentalAnnual * 5))}
                    </strong>
                    <span style={{ color: "#aaa" }}> (gross rent minus council + water rates)</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Location Intelligence ───────────────────────── */}
          <SectionHead>Location Intelligence</SectionHead>
          <div style={{ marginBottom: 28 }}>
            <Row label="Primary School"    value={`${val(slm.primarySchool)} (${val(slm.primarySchoolRating)})`} />
            <Row label="Secondary School"  value={`${val(slm.secondarySchool)} (${val(slm.secondarySchoolRating)})`} />
            <Row label="School Zone"       value={val(slm.schoolZoneCatchment)} />
            <Row label="Distance to Train" value={typeof slm.distanceToTrainKm === "number" ? `${slm.distanceToTrainKm}km (${val(slm.trainLine)})` : "—"} />
            <Row label="Distance to Shops" value={typeof slm.distanceToShoppingKm === "number" ? `${slm.distanceToShoppingKm}km` : "—"} />
            {medianPrice !== null && <Row label="Suburb Median" value={money(medianPrice)} accent />}
            {typeof slm.clearanceRatePct === "number" && <Row label="Clearance Rate" value={`${slm.clearanceRatePct}%`} />}
          </div>

          {/* ── Comparable Sales ─────────────────────────────── */}
          {comparables.length > 0 && (
            <>
              <SectionHead>Recent Comparable Sales</SectionHead>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 28 }}>
                <thead>
                  <tr style={{ background: P.tint }}>
                    {["Address", "Beds", "Sold Price", "Date"].map(h => (
                      <th key={h} style={{
                        textAlign: h === "Beds" || h === "Sold Price" || h === "Date" ? "right" : "left",
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

          {/* ── Key Features ─────────────────────────────────── */}
          <SectionHead>Key Features</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 32 }}>
            {/* Left column */}
            <div style={{ paddingRight: 24, borderRight: `1px solid ${P.rule}` }}>
              <Row label="Solar"                value={typeof slm.solarKw === "number" ? `${slm.solarKw}kW` : val(slm.solarKw)} />
              <Row label="Air Conditioning"     value={val(slm.airConType)} />
              <Row label="Granny Flat"          value={val(slm.grannyFlatApproved)} />
            </div>
            {/* Right column */}
            <div style={{ paddingLeft: 24 }}>
              <Row label="Pool"                  value={val(slm.pool)} />
              <Row label="Subdivision Potential" value={val(slm.subdivisionPotential)} />
              <Row label="Year Built"            value={val(slm.yearBuilt)} />
            </div>
          </div>

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

          {/* Print / Close buttons (hidden on print) */}
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

// ── SectionHead helper component ──────────────────────────────────────────────
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
