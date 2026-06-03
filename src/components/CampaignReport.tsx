/**
 * CampaignReport — Weekly Vendor Campaign Report
 *
 * Generates a live-feeling campaign report for an active listing.
 * Shows enquiries, OFI attendance, digital stats, price feedback.
 * Data is seeded from property ID so it's deterministic / demo-safe.
 */

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, type AgentProfile, type AgencyTheme } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { fmtDollar } from "../lib/vendorFinancials"
import type { PastBuyer } from "../data/pastBuyers"
import { buildAppraisalRange, generateComparables } from "../lib/appraisalEngine"

// ── Seed-based mock data ──────────────────────────────────────────────────────

function seeded(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49979
  const t = x - Math.floor(x)
  return Math.round(min + t * (max - min))
}

interface WeekData {
  week: number
  label: string
  enquiries: number
  ofiAttendees: number
  digitalViews: number
  clickThroughs: number
  priceFeedback: { tooLow: number; onGuide: number; tooHigh: number }
  agentNote: string
}

function buildWeeks(buyer: PastBuyer, agent: AgentProfile, midPrice: number): WeekData[] {
  const s = buyer.id
  const fn = buyer.name.split("&")[0].split(" ")[0].trim()
  const af = agent.name.split(" ")[0]
  const addr = buyer.purchaseAddress.split(",")[0]
  const fmtP = (n: number) => fmtDollar(Math.round(n / 5000) * 5000)

  return [
    {
      week: 1, label: "Week 1",
      enquiries: seeded(s + 101, 14, 22),
      ofiAttendees: seeded(s + 102, 18, 32),
      digitalViews: seeded(s + 103, 1800, 3200),
      clickThroughs: seeded(s + 104, 210, 380),
      priceFeedback: { tooLow: seeded(s + 105, 2, 5), onGuide: seeded(s + 106, 7, 12), tooHigh: seeded(s + 107, 3, 7) },
      agentNote: `Strong launch for ${addr}. Digital reach was excellent with high click-through from realestate.com.au Premier listing. First OFI drew a solid group with ${seeded(s + 102, 18, 32)} attendees. Buyer feedback has been positive overall. I've identified ${seeded(s + 105, 2, 5) + seeded(s + 106, 7, 12)} genuinely interested parties from the first week. I'll be following up with the most serious buyers this week and pushing for early offers.`,
    },
    {
      week: 2, label: "Week 2",
      enquiries: seeded(s + 201, 9, 16),
      ofiAttendees: seeded(s + 202, 14, 24),
      digitalViews: seeded(s + 203, 1200, 2100),
      clickThroughs: seeded(s + 204, 140, 260),
      priceFeedback: { tooLow: seeded(s + 205, 1, 4), onGuide: seeded(s + 206, 6, 11), tooHigh: seeded(s + 207, 4, 9) },
      agentNote: `Week two showing strong sustained interest. Digital engagement has settled into its normal pattern after the initial launch spike. The OFI on Saturday had strong numbers. I'm in active negotiation with ${seeded(s + 205, 1, 4) + 1} serious buyers. Price guidance remains firm at ${fmtP(midPrice)} and feedback supports that positioning. Expecting at least one formal offer this week.`,
    },
    {
      week: 3, label: "Week 3",
      enquiries: seeded(s + 301, 6, 12),
      ofiAttendees: seeded(s + 302, 10, 18),
      digitalViews: seeded(s + 303, 800, 1400),
      clickThroughs: seeded(s + 304, 90, 180),
      priceFeedback: { tooLow: seeded(s + 305, 3, 7), onGuide: seeded(s + 306, 5, 9), tooHigh: seeded(s + 307, 2, 5) },
      agentNote: `As expected, enquiry volume has normalised in week three — this is typical for a property at this price point. The serious buyers identified in weeks one and two remain engaged. I've had ${seeded(s + 305, 3, 7) + seeded(s + 306, 5, 9)} parties request second inspections or building and pest access, which is a positive signal. We're approaching the auction/deadline date. I'll be in contact ahead of Friday to discuss strategy.`,
    },
    {
      week: 4, label: "Week 4",
      enquiries: seeded(s + 401, 4, 8),
      ofiAttendees: seeded(s + 402, 8, 14),
      digitalViews: seeded(s + 403, 400, 800),
      clickThroughs: seeded(s + 404, 50, 110),
      priceFeedback: { tooLow: seeded(s + 405, 4, 9), onGuide: seeded(s + 406, 3, 7), tooHigh: seeded(s + 407, 1, 3) },
      agentNote: `Final week. We have ${seeded(s + 405, 2, 4)} registered bidders / interested parties confirmed. Market sentiment for ${buyer.suburb} is strong and conditions favour a good result. I'm focused entirely on driving competition between the top ${seeded(s + 405, 2, 3)} buyers. ${fn}, I'll call you the evening before the auction to walk through everything. Looking forward to a great result together. — ${af}`,
    },
  ]
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden", width: "100%" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ height: "100%", background: color, borderRadius: 3 }}
      />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CampaignReportProps {
  buyer: PastBuyer
  agent: AgentProfile
  theme: AgencyTheme
}

export default function CampaignReport({ buyer, agent, theme }: CampaignReportProps) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [selectedWeek, setSelectedWeek] = useState(2)   // default to week 2 (mid-campaign)
  const [showNote, setShowNote] = useState(true)
  const [shareCopied, setShareCopied] = useState(false)

  const comps = generateComparables({
    suburb: buyer.suburb,
    propertyType: buyer.propertyType as "House" | "Unit" | "Townhouse",
    beds: buyer.beds,
    land: buyer.land ?? 500,
    buyerId: buyer.id,
  })
  const range = buildAppraisalRange(comps, buyer.suburb)
  const weeks = buildWeeks(buyer, agent, range.mid)
  const w = weeks[selectedWeek - 1]

  const totalEnquiries = weeks.reduce((acc, wk) => acc + wk.enquiries, 0)
  const totalOFI = weeks.reduce((acc, wk) => acc + wk.ofiAttendees, 0)
  const totalViews = weeks.reduce((acc, wk) => acc + wk.digitalViews, 0)

  const fname = buyer.name.split("&")[0].split(" ")[0].trim()

  const feedbackTotal = w.priceFeedback.tooLow + w.priceFeedback.onGuide + w.priceFeedback.tooHigh
  // "on guide or above" — buyers at or above guide price = positive signal for vendor
  const positiveCount = w.priceFeedback.onGuide + w.priceFeedback.tooHigh
  const onGuidePct = feedbackTotal > 0 ? Math.round((positiveCount / feedbackTotal) * 100) : 0

  return (
    <div style={{ fontFamily: FONT, color: C.text }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.gradient[0]}18, ${theme.gradient[1]}10)`,
        border: `1px solid ${theme.primary}33`, borderRadius: 16, padding: "22px 24px", marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
          Campaign Report
        </div>
        <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 2 }}>
          {buyer.purchaseAddress}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          {buyer.suburb} · {buyer.beds}bd {buyer.baths}ba {buyer.propertyType} · Listing agent: {agent.name}
        </div>

        {/* Campaign totals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "Total enquiries", value: totalEnquiries, color: theme.primary },
            { label: "OFI attendees", value: totalOFI, color: C.green },
            { label: "Digital views", value: totalViews.toLocaleString(), color: "#a78bfa" },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg3, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Week selector ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto" }}>
        {weeks.map(wk => (
          <button key={wk.week} onClick={() => setSelectedWeek(wk.week)}
            aria-pressed={selectedWeek === wk.week}
            style={{
              padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap", flexShrink: 0,
              background: selectedWeek === wk.week ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` : C.bg3,
              color: selectedWeek === wk.week ? "white" : C.muted,
              transition: "all 0.15s",
            }}
          >
            {wk.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedWeek}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {/* ── This week's stats ────────────────────────────────────────── */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>
              {w.label} · Activity snapshot
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14 }}>
              {[
                { label: "Enquiries", value: w.enquiries, max: 25, color: theme.primary },
                { label: "OFI Attendees", value: w.ofiAttendees, max: 35, color: C.green },
                { label: "Digital Views", value: w.digitalViews, max: 3500, color: "#a78bfa" },
                { label: "Click-throughs", value: w.clickThroughs, max: 400, color: "#f59e0b" },
              ].map(stat => (
                <div key={stat.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: C.faint }}>{stat.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: stat.color }}>{stat.value.toLocaleString()}</span>
                  </div>
                  <MiniBar value={stat.value} max={stat.max} color={stat.color} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Price feedback ───────────────────────────────────────────── */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Buyer price feedback
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: onGuidePct >= 55 ? C.green + "18" : "#f59e0b18",
                color: onGuidePct >= 55 ? C.green : "#f59e0b",
              }}>
                {onGuidePct}% at/above guide
              </div>
            </div>

            {/* Correct vendor-perspective colours: above guide = green (buyers paying more), below guide = amber (buyers pushing back) */}
            <div style={{ display: "flex", gap: 6, height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
              {[
                { val: w.priceFeedback.tooHigh, color: C.green, label: "Above guide" },
                { val: w.priceFeedback.onGuide, color: "#f59e0b", label: "On guide" },
                { val: w.priceFeedback.tooLow, color: "#f87171", label: "Below guide" },
              ].map((seg, i) => {
                const pct = feedbackTotal > 0 ? (seg.val / feedbackTotal) * 100 : 33.3
                return (
                  <motion.div
                    key={i}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.1, ease: "easeOut" }}
                    style={{ height: "100%", background: seg.color, borderRadius: 3 }}
                    title={`${seg.label}: ${seg.val} buyers`}
                  />
                )
              })}
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { val: w.priceFeedback.tooHigh, label: "Above guide", color: C.green },
                { val: w.priceFeedback.onGuide, label: "On guide", color: "#f59e0b" },
                { val: w.priceFeedback.tooLow, label: "Below guide", color: "#f87171" },
              ].map(seg => (
                <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{seg.val} {seg.label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>Guide range</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ background: C.bg3, borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Appraised low</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{fmtDollar(range.low)}</div>
                </div>
                <div style={{ background: C.green + "12", borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.green}44` }}>
                  <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Recommended</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{fmtDollar(range.mid)}</div>
                </div>
                <div style={{ background: C.bg3, borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>Optimistic</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.primary }}>{fmtDollar(range.high)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Agent commentary ─────────────────────────────────────────── */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
            <button
              onClick={() => setShowNote(v => !v)}
              aria-expanded={showNote}
              aria-controls="agent-commentary"
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", background: "none", border: "none", cursor: "pointer",
                padding: 0, fontFamily: FONT,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Agent commentary — {w.label}
              </div>
              <span style={{ fontSize: 12, color: C.faint, transition: "transform 0.2s", display: "block", transform: showNote ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
            </button>

            <AnimatePresence>
              {showNote && (
                <motion.div
                  id="agent-commentary"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingTop: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: "white",
                    }}>{agent.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{agent.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{agent.agency}</div>
                      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
                        {w.agentNote}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Share button */}
          <div style={{ marginTop: 16, display: "flex", gap: 10 }} className="no-print">
            <button
              onClick={() => {
                const text = `Campaign report for ${buyer.purchaseAddress} — Week ${w.week}: ${w.ofiAttendees} OFI attendees, ${w.enquiries} enquiries, ${onGuidePct}% of buyers at or above guide.`
                navigator.clipboard?.writeText(text).catch(() => {})
                setShareCopied(true)
                setTimeout(() => setShareCopied(false), 2500)
              }}
              style={{
                flex: 1, padding: "11px 20px", borderRadius: 10,
                background: shareCopied ? C.green + "cc" : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
                transition: "background 0.2s",
              }}
            >
              {shareCopied ? "✓ Copied to clipboard" : `Share with ${fname}`}
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: "11px 18px", borderRadius: 10,
                background: C.bg3, border: `1px solid ${C.border}`,
                color: C.muted, cursor: "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: FONT,
              }}
            >
              🖨 Print
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
