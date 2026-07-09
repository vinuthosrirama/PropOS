/**
 * ListingPresentation — Full CMA + Listing Presentation
 *
 * Triggered from VendorProfilePage "Listing" tab.
 * Printable, shareable pre-listing CMA that agents take to the listing appointment.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { C, FONT, type AgentProfile, type AgencyTheme } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import {
  generateComparables, buildAppraisalRange, buildEquityScenarios,
  fmtK,
} from "../lib/appraisalEngine"
import { calculateFinancials, fmtDollar } from "../lib/vendorFinancials"
import { CURRENT_VALUE_ESTIMATES } from "../data/pastBuyers"
import type { PastBuyer } from "../data/pastBuyers"

// ── Helpers ───────────────────────────────────────────────────────────────────

function seal(n: number): string {
  // round to nearest $5K for presentation
  return fmtDollar(Math.round(n / 5000) * 5000)
}

// Campaign timeline steps
const CAMPAIGN_STEPS = [
  { week: 1, label: "Week 1", desc: "Photography + copywriting + digital launch", done: true },
  { week: 2, label: "Week 2", desc: "First open for inspection + private appointments", done: true },
  { week: 3, label: "Week 3", desc: "Second OFI + buyer feedback + price positioning", done: false },
  { week: 4, label: "Week 4", desc: "Auction / deadline sale", done: false },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface ListingPresentationProps {
  buyer: PastBuyer
  agent: AgentProfile
  theme: AgencyTheme
}

export default function ListingPresentation({ buyer, agent, theme }: ListingPresentationProps) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [activeComp, setActiveComp] = useState<number | null>(null)

  const estVal = CURRENT_VALUE_ESTIMATES[buyer.id] ?? buyer.purchasePrice * 1.35
  const fin = calculateFinancials(buyer.purchasePrice, buyer.purchaseDate, estVal, buyer.deposit)

  const comps = generateComparables({
    suburb: buyer.suburb,
    propertyType: buyer.propertyType as "House" | "Unit" | "Townhouse",
    beds: buyer.beds,
    land: buyer.land ?? 500,
    buyerId: buyer.id,
  })

  const range = buildAppraisalRange(comps, buyer.suburb)
  const scenarios = buildEquityScenarios({
    purchasePrice: buyer.purchasePrice,
    purchaseDate: buyer.purchaseDate,
    deposit: buyer.deposit ?? null,
    range,
  })

  const agentFirst = agent.name.split(" ")[0]
  const propertyDesc = `${buyer.beds}bd ${buyer.baths}ba ${buyer.propertyType}`

  return (
    <div id="listing-presentation" style={{ fontFamily: FONT, color: C.text }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.gradient[0]}18, ${theme.gradient[1]}10)`,
        border: `1px solid ${theme.primary}33`,
        borderRadius: 16, padding: "28px 28px 24px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 6 }}>
              Confidential Listing Presentation
            </div>
            <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: C.text, letterSpacing: -0.8, marginBottom: 4 }}>
              {buyer.purchaseAddress}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              {buyer.suburb} · {propertyDesc}{buyer.land ? ` · ${buyer.land}m²` : ""}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ background: C.bg3, borderRadius: 10, padding: "10px 16px", textAlign: "center", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Estimated value</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{fmtDollar(range.mid)}</div>
              </div>
              <div style={{ background: C.bg3, borderRadius: 10, padding: "10px 16px", textAlign: "center", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Range</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{seal(range.low)} – {seal(range.high)}</div>
              </div>
              <div style={{ background: C.bg3, borderRadius: 10, padding: "10px 16px", textAlign: "center", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Equity gain</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary }}>{fmtDollar(fin.equityGain)}</div>
              </div>
            </div>
          </div>

          {/* Agent badge */}
          <div style={{
            background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "14px 18px", textAlign: "center", flexShrink: 0, minWidth: 140,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: C.bg, margin: "0 auto 8px",
            }}>
              {agent.name.charAt(0)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{agent.name}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{agent.agency}</div>
            <div style={{ fontSize: 10, color: theme.primary, marginTop: 4, fontWeight: 600 }}>{agent.phone}</div>
          </div>
        </div>
      </div>

      {/* ── Comparable Sales ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader label="Comparable Recent Sales" subtitle={buyer.suburb} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
          {comps.slice(0, 3).map((comp, i) => {
            const distKm = (0.2 + (100 - comp.matchScore) / 100 * 1.2).toFixed(1)
            const isActive = activeComp === i
            return (
              <motion.div
                key={i}
                onClick={() => setActiveComp(isActive ? null : i)}
                role="button"
                tabIndex={0}
                aria-label={`View comparable sale at ${comp.address}`}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setActiveComp(isActive ? null : i) }}
                whileHover={{ scale: 1.01 }}
                style={{
                  background: isActive ? theme.dim : C.bg2,
                  border: `1px solid ${comp.matchScore >= 85 ? C.green + "44" : isActive ? theme.primary + "44" : C.border}`,
                  borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, marginRight: 8 }}>{comp.address}</div>
                  <div style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
                    background: comp.matchScore >= 85 ? C.green + "18" : C.bg3,
                    color: comp.matchScore >= 85 ? C.green : C.muted, fontWeight: 700,
                  }}>
                    {comp.matchScore}% match
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.faint, marginBottom: 8 }}>
                  {comp.suburb} · {distKm} km · {comp.soldDate}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[`${comp.beds}bd`, `${comp.baths}ba`, comp.land > 0 ? `${comp.land}m²` : null].filter(Boolean).map(c => (
                    <span key={c} style={{ fontSize: 10, color: C.muted, background: C.bg3, border: `1px solid ${C.border}`, padding: "2px 6px", borderRadius: 4 }}>{c}</span>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{fmtDollar(comp.soldPrice)}</div>
                  {comp.land > 0 && (
                    <div style={{ fontSize: 10, color: C.faint }}>{fmtK(comp.pricePerSqm)}/m²</div>
                  )}
                </div>
                {comp.agentSold && (
                  <div style={{ fontSize: 10, color: theme.primary, marginTop: 4, fontWeight: 700 }}>✓ Sold by {agentFirst}</div>
                )}
                {isActive && (
                  <div style={{ fontSize: 10, color: theme.primary, marginTop: 6, padding: "3px 7px", background: theme.primary + "14", borderRadius: 5, display: "inline-block" }}>
                    ★ Selected as key comparable
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* ── Price Positioning ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader label="Price Strategy" subtitle={range.methodNote} />
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            {[
              { label: "Conservative", val: range.low, color: "#f59e0b", desc: "Lower-end scenario" },
              { label: "Mid-range", val: range.mid, color: C.green, desc: "Most likely outcome", highlight: true },
              { label: "Optimistic", val: range.high, color: theme.primary, desc: "Strong demand scenario" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, textAlign: "center", padding: "14px 12px", borderRadius: 10,
                background: s.highlight ? s.color + "14" : C.bg3,
                border: `1px solid ${s.highlight ? s.color + "44" : C.border}`,
              }}>
                {s.highlight && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>★ Recommended</div>
                )}
                <div style={{ fontSize: 10, color: C.faint, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: s.color }}>{seal(s.val)}</div>
                <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          {/* Price bar */}
          <PriceBar low={range.low} mid={range.mid} high={range.high} theme={theme} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
            {[
              { label: "Clearance rate", value: `${range.clearanceRate}%`, sub: buyer.suburb },
              { label: "Avg days on market", value: `${range.daysOnMarket}d`, sub: "Suburb average" },
              { label: "Demand score", value: `${range.demandScore}/10`, sub: "Buyer demand" },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: "center", padding: "10px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.primary }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: C.faint, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>{stat.label}</div>
                <div style={{ fontSize: 10, color: C.faint }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Equity Scenarios ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader label="What You Walk Away With" subtitle="After agent fees, marketing and estimated CGT" />
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            {scenarios.map(s => (
              <div key={s.label} style={{
                padding: "16px", borderRadius: 10,
                background: C.bg3,
                border: `1px solid ${s.color}33`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{s.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { label: "Sale price", value: fmtDollar(s.salePrice), bold: false },
                    { label: "Selling costs", value: `−${fmtDollar(s.sellingCosts)}`, bold: false, red: true },
                    { label: "Est. CGT", value: s.estimatedCGT > 0 ? `−${fmtDollar(s.estimatedCGT)}` : "Nil", bold: false, red: s.estimatedCGT > 0 },
                    { label: "Net proceeds", value: fmtDollar(s.netProceeds), bold: true },
                    { label: "Equity released", value: fmtDollar(s.equityReleased), bold: true, green: true },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderTop: row.bold ? `1px solid ${C.border}` : "none", paddingTop: row.bold ? 6 : 0 }}>
                      <span style={{ fontSize: 11, color: row.bold ? C.muted : C.faint }}>{row.label}</span>
                      <span style={{ fontSize: row.bold ? 13 : 11, fontWeight: row.bold ? 700 : 400,
                        color: row.green ? C.green : row.red ? "#f87171" : row.bold ? C.text : C.muted }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Campaign Plan ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader label="4-Week Campaign Plan" subtitle={`${agent.agency} marketing approach`} />
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {CAMPAIGN_STEPS.map((step, i) => (
              <div key={step.week} style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                paddingBottom: i < CAMPAIGN_STEPS.length - 1 ? 16 : 0,
                marginBottom: i < CAMPAIGN_STEPS.length - 1 ? 16 : 0,
                borderBottom: i < CAMPAIGN_STEPS.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "white",
                  }}>{step.week}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{step.label}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Marketing inclusions */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Marketing inclusions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                "Professional photography", "Drone footage", "Floor plan",
                "realestate.com.au Premier", "domain.com.au Feature",
                "Social media advertising", "Database email blast",
                "For sale signboard", "Open for inspection",
              ].map(item => (
                <span key={item} style={{
                  fontSize: 11, color: C.text, background: C.bg3,
                  border: `1px solid ${C.border}`, padding: "4px 10px", borderRadius: 6,
                }}>✓ {item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent Promise ────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.gradient[0]}18, ${theme.gradient[1]}10)`,
        border: `1px solid ${theme.primary}33`, borderRadius: 14, padding: "22px 24px",
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "white",
          }}>
            {agent.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              My commitment to you, {buyer.name.split("&")[0].split(" ")[0]}
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
              I will provide weekly written updates, honest feedback from every buyer, and transparent price guidance throughout the campaign. My goal is the best possible outcome, not just a quick sale.
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { icon: "📞", label: "Weekly call updates" },
                { icon: "📊", label: "Buyer feedback reports" },
                { icon: "🔑", label: "Off-market reach" },
              ].map(p => (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{p.icon}</span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.primary}22`, textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{agent.agency} · {agent.phone}</div>
        </div>
      </div>

      {/* Print button */}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }} className="no-print">
        <button
          onClick={() => window.print()}
          style={{
            padding: "10px 20px", borderRadius: 10,
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            color: "white", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
          }}
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>{label}</div>
      {subtitle && <div style={{ fontSize: 11, color: C.faint }}>{subtitle}</div>}
    </div>
  )
}

function PriceBar({ low, mid, high, theme }: { low: number; mid: number; high: number; theme: AgencyTheme }) {
  const range = high - low
  const midPct = ((mid - low) / range) * 100
  return (
    <div style={{ position: "relative", height: 28 }}>
      {/* Track */}
      <div style={{
        position: "absolute", top: 10, left: 0, right: 0, height: 8, borderRadius: 4,
        background: `linear-gradient(90deg, #f59e0b44, ${C.green}88, ${theme.primary}66)`,
        border: `1px solid ${C.border}`,
      }} />
      {/* Mid marker */}
      <div style={{
        position: "absolute", top: 6, left: `${midPct}%`, transform: "translateX(-50%)",
        width: 16, height: 16, borderRadius: "50%",
        background: C.green, border: `2px solid ${C.bg}`,
        boxShadow: `0 0 8px ${C.green}88`,
      }} title={`Mid: ${fmtDollar(mid)}`} />
      {/* Labels */}
      <div style={{ position: "absolute", bottom: 0, left: 0, fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
        {fmtK(low)}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: `${midPct}%`, transform: "translateX(-50%)", fontSize: 10, color: C.green, fontWeight: 700 }}>
        {fmtK(mid)} ★
      </div>
      <div style={{ position: "absolute", bottom: 0, right: 0, fontSize: 10, color: theme.primary, fontWeight: 600 }}>
        {fmtK(high)}
      </div>
    </div>
  )
}
