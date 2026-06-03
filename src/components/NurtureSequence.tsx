/**
 * NurtureSequence — Multi-Touch Nurture Sequence Builder
 *
 * Shown after outreach is sent (or as a standalone tab in VendorProfilePage).
 * Builds a Day 1 / 3 / 7 / 14 / 30 sequence with pre-populated content
 * personalised to the buyer's pipeline type and equity position.
 */

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, type AgentProfile, type AgencyTheme } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { calculateFinancials, fmtDollar } from "../lib/vendorFinancials"
import { CURRENT_VALUE_ESTIMATES } from "../data/pastBuyers"
import { PIPELINE_LABELS, type Pipeline } from "../lib/vendorPipeline"
import type { PastBuyer } from "../data/pastBuyers"

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = "sms" | "email" | "call" | "email+sms"

interface TouchPoint {
  day: number
  label: string
  channel: Channel
  subject?: string
  body: string
  rationale: string
  enabled: boolean
}

type SequenceStatus = "draft" | "active" | "paused"

// ── Channel display ───────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<Channel, { icon: string; label: string; color: string }> = {
  sms: { icon: "💬", label: "SMS", color: "#34d399" },
  email: { icon: "✉️", label: "Email", color: "#a78bfa" },
  call: { icon: "📞", label: "Call", color: "#f59e0b" },
  "email+sms": { icon: "✉️💬", label: "Email + SMS", color: "#60a5fa" },
}

// ── Build sequence ────────────────────────────────────────────────────────────

function buildSequence(buyer: PastBuyer, agent: AgentProfile, pipeline: Pipeline): TouchPoint[] {
  const fn = buyer.name.split("&")[0].split(" ")[0].trim()
  const af = agent.name.split(" ")[0]
  const aa = agent.agency
  const ap = agent.phone
  const addr = buyer.purchaseAddress.split(",")[0]
  const suburb = buyer.suburb
  const yr = buyer.purchaseDate.slice(0, 4)
  const estVal = CURRENT_VALUE_ESTIMATES[buyer.id] ?? buyer.purchasePrice * 1.35
  const fin = calculateFinancials(buyer.purchasePrice, buyer.purchaseDate, estVal, buyer.deposit)
  const estStr = fmtDollar(fin.currentEstimate)
  const equityStr = fmtDollar(fin.equityGain)
  const isInvestor = buyer.status === "investor"
  const signoff = isInvestor ? "Kind regards" : "Cheers"
  const trim160 = (s: string) => s.length > 160 ? s.slice(0, 157) + "..." : s
  const nd = (s: string) => s.replace(/—|–|--/g, ",").replace(/ {2,}/g, " ").trim()

  // ── Touchpoint templates by pipeline ─────────────────────────────────────
  const T: TouchPoint[] = []

  // Day 1 — confirmation SMS (always)
  T.push({
    day: 1, label: "Day 1 — Introduction",
    channel: "sms",
    body: nd(trim160(`Hi ${fn}, ${af} here from ${aa}. Following up on the note I sent about ${addr} — happy to chat at a time that suits you. ${signoff}, ${af} ${ap}`)),
    rationale: "Same-day SMS reinforces the email and catches people who don't check email. Keep it brief.",
    enabled: true,
  })

  // Day 3 — value-add email
  T.push({
    day: 3, label: "Day 3 — Market insight",
    channel: "email",
    subject: nd(`${suburb} market update — what it means for ${addr}`),
    body: nd(`Hi ${fn},\n\n${af} from ${aa} here. Just wanted to share a quick market update for ${suburb}.\n\nThe suburb has seen ${fin.annualAppreciation > 7 ? "strong" : "steady"} growth recently, and your property at ${addr} is currently estimated around ${estStr}. That's ${equityStr} in equity since ${yr}.\n\nI'd love to have a quick 15-minute conversation to walk through your options — completely no obligation. Is this week or next week better for a call?\n\n${signoff},\n${af}\n${aa} · ${ap}`),
    rationale: "Email is ideal for sharing market data. The call-to-action is low-friction (pick a week, not a date).",
    enabled: true,
  })

  // Day 7 — follow-up (pipeline-specific)
  if (pipeline === "investor-to-seller" || pipeline === "investor-to-rebalance") {
    T.push({
      day: 7, label: "Day 7 — Portfolio review offer",
      channel: "sms",
      body: nd(trim160(`Hi ${fn}, ${af} from ${aa}. I've put together a quick equity analysis for ${addr} — happy to send it over or run through it on a call. Worth 10 mins. ${signoff}, ${af}`)),
      rationale: "Investors respond to data. Offering a tangible deliverable (equity analysis) makes the next step concrete.",
      enabled: true,
    })
  } else if (pipeline === "owner-to-downsizer") {
    T.push({
      day: 7, label: "Day 7 — Lifestyle angle",
      channel: "sms",
      body: nd(trim160(`Hi ${fn}, ${af} here. A few properties that might suit a right-size move have come up in ${suburb} recently. Happy to send through what's available if that's useful? ${signoff}, ${af}`)),
      rationale: "Downsizers are thinking about lifestyle, not just money. Connecting to available options creates forward momentum.",
      enabled: true,
    })
  } else if (pipeline === "owner-to-upsizer") {
    T.push({
      day: 7, label: "Day 7 — Equity bridge",
      channel: "sms",
      body: nd(trim160(`Hi ${fn}, ${af} from ${aa}. Just ran the numbers — the equity you've built in ${addr} could bridge a significant chunk of your next home. Worth a quick chat? ${signoff}, ${af}`)),
      rationale: "Upsizers need to see how selling funds buying. The equity bridge narrative removes the financial barrier in their mind.",
      enabled: true,
    })
  } else {
    T.push({
      day: 7, label: "Day 7 — Check-in",
      channel: "sms",
      body: nd(trim160(`Hi ${fn}, ${af} here. Just checking in on ${addr} — any questions about the market or your options? Happy to have an informal chat. ${signoff}, ${af}`)),
      rationale: "Friendly, low-pressure check-in. Shows persistence without being pushy.",
      enabled: true,
    })
  }

  // Day 14 — email with comparable sale
  T.push({
    day: 14, label: "Day 14 — Comparable sale",
    channel: "email",
    subject: nd(`A comparable property in ${suburb} just sold — here's what it means for ${addr}`),
    body: nd(`Hi ${fn},\n\nQuick update — a comparable property in ${suburb} has just sold at a strong result. Given the similarity to ${addr}, I wanted to share the details directly with you.\n\nYour property continues to be estimated around ${estStr}, and buyer demand in ${suburb} remains solid. The window for the current market conditions may not last indefinitely.\n\nWould you be open to a 20-minute appraisal? I'll come to you — no obligation, just a proper picture of where things stand.\n\n${signoff},\n${af}\n${aa} · ${ap}`),
    rationale: "A nearby sale creates urgency and relevance. It's the most natural reason to re-engage after 2 weeks.",
    enabled: true,
  })

  // Day 30 — re-engagement
  T.push({
    day: 30, label: "Day 30 — Re-engagement",
    channel: isInvestor ? "email" : "sms",
    subject: isInvestor ? nd(`Checking in on your ${suburb} position, ${fn}`) : undefined,
    body: isInvestor
      ? nd(`Hi ${fn},\n\n${af} from ${aa} here. It's been about a month since I was in touch about ${addr}.\n\nI want to check in — no pressure at all. The market in ${suburb} is still performing well and ${addr} is still sitting around ${estStr}. If the timing isn't right yet, that's completely fine. I'd rather build a relationship for when it is.\n\nLet me know if you'd ever like to talk through your options.\n\n${signoff},\n${af}\n${aa} · ${ap}`)
      : nd(trim160(`Hi ${fn}, ${af} here. Just checking in — it's been a month since I reached out about ${addr}. Still happy to have a no-pressure chat whenever the timing suits. ${signoff}, ${af}`)),
    rationale: "30 days is the right gap to re-engage without feeling pushy. Tone shifts to relationship-building over urgency.",
    enabled: pipeline !== "renter-to-buyer",  // renters less likely to convert quickly
  })

  return T
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NurtureSequenceProps {
  buyer: PastBuyer
  agent: AgentProfile
  theme: AgencyTheme
  pipeline: Pipeline
  /** Called when agent activates the sequence */
  onActivate?: () => void
}

export default function NurtureSequence({ buyer, agent, theme, pipeline, onActivate }: NurtureSequenceProps) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const pl = PIPELINE_LABELS[pipeline]
  const [sequence, setSequence] = useState<TouchPoint[]>(() => buildSequence(buyer, agent, pipeline))
  const [expandedDay, setExpandedDay] = useState<number | null>(1)
  const [status, setStatus] = useState<SequenceStatus>("draft")
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState("")

  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const enabledCount = sequence.filter(t => t.enabled).length

  const toggleEnabled = (day: number) => {
    setSequence(prev => prev.map(t => t.day === day ? { ...t, enabled: !t.enabled } : t))
  }

  const startEdit = (tp: TouchPoint) => {
    setEditingDay(tp.day)
    setEditDraft(tp.body)
    setExpandedDay(tp.day)
  }

  const commitEdit = (day: number) => {
    setSequence(prev => prev.map(t => t.day === day ? { ...t, body: editDraft } : t))
    setEditingDay(null)
  }

  const handleActivate = () => {
    setStatus("active")
    onActivate?.()
  }

  return (
    <div style={{ fontFamily: FONT, color: C.text }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.gradient[0]}18, ${theme.gradient[1]}10)`,
        border: `1px solid ${theme.primary}33`, borderRadius: 16, padding: "22px 24px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
              Multi-Touch Nurture Sequence
            </div>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 4 }}>
              {fname}'s sequence
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: pl.color + "18", color: pl.color, fontWeight: 700 }}>
                {pl.icon} {pl.label}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{enabledCount} touchpoints · 30-day window</div>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {sequence.map((tp, i) => (
              <div key={tp.day} style={{ display: "flex", alignItems: "center", flex: i < sequence.length - 1 ? "1" : "0" }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: tp.enabled ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` : C.bg3,
                  border: `1px solid ${tp.enabled ? "transparent" : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: tp.enabled ? "white" : C.faint,
                }}>
                  {tp.day}d
                </div>
                {i < sequence.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: tp.enabled ? theme.primary + "44" : C.border, margin: "0 2px" }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {sequence.map(tp => (
              <div key={tp.day} style={{ fontSize: 9, color: C.faint, textAlign: "center", flex: 1 }}>
                {CHANNEL_LABELS[tp.channel].icon}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Touchpoints ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {sequence.map((tp) => {
          const ch = CHANNEL_LABELS[tp.channel]
          const isExpanded = expandedDay === tp.day
          const isEditing = editingDay === tp.day

          return (
            <motion.div
              key={tp.day}
              layout
              style={{
                background: tp.enabled ? C.bg2 : C.bg3,
                border: `1px solid ${tp.enabled && isExpanded ? theme.primary + "55" : C.border}`,
                borderRadius: 14, overflow: "hidden",
                opacity: tp.enabled ? 1 : 0.55,
                transition: "opacity 0.2s, border-color 0.2s",
              }}
            >
              {/* Row header */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedDay(isExpanded ? null : tp.day)}
                role="button"
                tabIndex={0}
                aria-label={`${tp.label} — ${tp.enabled ? "enabled" : "disabled"}. Click to ${isExpanded ? "collapse" : "expand"}.`}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setExpandedDay(isExpanded ? null : tp.day) }}
              >
                {/* Day badge */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: tp.enabled ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` : C.bg3,
                  border: tp.enabled ? "none" : `1px solid ${C.border}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: tp.enabled ? "white" : C.faint, lineHeight: 1 }}>
                    {tp.day}
                  </span>
                  <span style={{ fontSize: 8, color: tp.enabled ? "rgba(255,255,255,0.7)" : C.faint, lineHeight: 1 }}>DAY</span>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: tp.enabled ? C.text : C.muted }}>{tp.label}</span>
                    <span style={{
                      fontSize: 10, padding: "1px 7px", borderRadius: 5, fontWeight: 700,
                      background: ch.color + "18", color: ch.color,
                    }}>{ch.icon} {ch.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.4 }}>{tp.rationale}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {/* Toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleEnabled(tp.day) }}
                    style={{
                      width: 36, height: 20, borderRadius: 10,
                      background: tp.enabled ? theme.primary : C.bg3,
                      border: `1px solid ${tp.enabled ? theme.primary : C.border}`,
                      cursor: "pointer", position: "relative", transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                    title={tp.enabled ? "Disable this touchpoint" : "Enable this touchpoint"}
                    aria-label={`${tp.enabled ? "Disable" : "Enable"} Day ${tp.day} touchpoint`}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: tp.enabled ? 18 : 2,
                      width: 14, height: 14, borderRadius: "50%",
                      background: "white", transition: "left 0.2s",
                    }} />
                  </button>
                  <span style={{ fontSize: 12, color: C.faint, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                </div>
              </div>

              {/* Expanded body */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                      {tp.subject && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Subject</div>
                          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>{tp.subject}</div>
                        </div>
                      )}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Message</div>
                        {isEditing ? (
                          <div>
                            <textarea
                              aria-label={`Edit ${tp.channel === "sms" ? "SMS" : "email"} message for Day ${tp.day}`}
                              value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              style={{
                                width: "100%", minHeight: tp.channel === "sms" ? 80 : 160,
                                background: C.bg3, border: `1px solid ${theme.primary}55`, borderRadius: 8,
                                padding: "10px 12px", color: C.text, fontSize: 12,
                                fontFamily: FONT, lineHeight: 1.55, resize: "vertical", outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button
                                onClick={() => commitEdit(tp.day)}
                                style={{
                                  padding: "6px 14px", borderRadius: 7, border: "none",
                                  background: theme.primary, color: "white",
                                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                                }}
                              >Save</button>
                              <button
                                onClick={() => setEditingDay(null)}
                                style={{
                                  padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border}`,
                                  background: "transparent", color: C.muted,
                                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
                                }}
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{tp.body}</div>
                            {tp.channel === "sms" && (
                              <div style={{ fontSize: 10, color: tp.body.length >= 160 ? "#f87171" : tp.body.length > 140 ? "#f59e0b" : C.faint, marginTop: 6, textAlign: "right" }}>
                                {tp.body.length} / 160
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(tp)}
                          style={{
                            background: "transparent", border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: "5px 12px",
                            color: theme.primary, fontSize: 11, fontWeight: 600,
                            cursor: "pointer", fontFamily: FONT,
                          }}
                        >
                          ✏️ Edit message
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* ── Activate CTA ─────────────────────────────────────────────────── */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
        <div style={{ display: "flex", gap: isMobile ? 0 : 20, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center" }}>
          <div style={{ flex: 1, marginBottom: isMobile ? 14 : 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {status === "active" ? "✓ Sequence is live" : "Ready to activate?"}
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {status === "active"
                ? `${enabledCount} touchpoints are scheduled over the next 30 days for ${fname}. PropOS will remind you at each step.`
                : `${enabledCount} touchpoints enabled. PropOS will surface reminders at Day 1, 3, 7, 14 and 30. You stay in control — nothing sends automatically.`
              }
            </div>
          </div>
          {status !== "active" ? (
            <button
              onClick={handleActivate}
              style={{
                padding: "12px 28px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT, flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              Activate sequence →
            </button>
          ) : (
            <button
              onClick={() => setStatus("paused")}
              style={{
                padding: "12px 24px", borderRadius: 12,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.muted, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT, flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              Pause
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SequenceStatus }) {
  const map: Record<SequenceStatus, { label: string; color: string; bg: string }> = {
    draft: { label: "Draft", color: "#f59e0b", bg: "#f59e0b18" },
    active: { label: "● Active", color: "#34d399", bg: "#34d39918" },
    paused: { label: "Paused", color: "#94a3b8", bg: "#94a3b818" },
  }
  const s = map[status]
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 7,
      background: s.bg, color: s.color, flexShrink: 0,
    }}>
      {s.label}
    </div>
  )
}
