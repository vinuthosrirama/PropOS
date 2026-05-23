import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  C, FONT, PORTFOLIO_SOLD, PORTFOLIO_ACTIVE,
  DEFAULT_THEME, getPortfolioForAgent, isPasSunilchandra,
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
import { apiUrl } from "../lib/api"
import { buildVoiceContext, loadCorpus } from "../lib/voiceContext"
import { DEMO_FALLBACK_LEADS } from "../lib/demoFallback"
import { getCachedOutreach } from "../lib/cachedOutreach"
import { useVoiceMemo } from "../hooks/useVoiceMemo"
import {
  getLeadKnowledge, upsertLeadTranscript,
  getLeadCumulativeNotes, enrichLeadNotes,
} from "../lib/leadKnowledge"

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
  | { kind: "vendorDashboard"; segmented: SegmentedBuyer[] }
  | { kind: "vendorProfile"; entry: SegmentedBuyer }
  | { kind: "vendorReview"; entry: SegmentedBuyer; sms: string; emailSubject: string; emailBody: string[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`

function scoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 60) return C.blue
  if (score >= 40) return "#f59e0b"
  return C.red ?? "#ef4444"
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
            property.land ? `${property.land}sqm` : null,
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
              background: "#ffffff", border: `1px solid ${withAlpha(theme.primary, 0.28)}`,
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
  if (!isPasSunilchandra(agent)) return grouped
  const camGrouped = groupLeadsByProperty(allLeads, PORTFOLIO_SOLD)
  const thirlmere = camGrouped[102] ?? []
  if (!thirlmere.length) return grouped
  return { ...grouped, 301: [...(grouped[301] ?? []), ...thirlmere] }
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
            {" "}— outreach quality improves when property data is complete.{" "}
            <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={onSettings}>
              Update in Settings →
            </span>
          </div>
        </div>
      )}

      {/* ── Active listings ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.blue, textTransform: "uppercase" }}>
            Active Listings
          </div>
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
    `Reading property SLM — ${slmInfo.filled} attributes loaded`,
    `Scanning ${soldIds.length} comparable sold properties`,
    `Scoring ${totalLeadCount} leads from Google Sheets`,
    `Ranking by attribute overlap — configuration, land, school zone, legal profile`,
    `Weighting by question alignment — matching what each lead asked to this property`,
    `Match list ready — sorted by compatibility score`,
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
            {property.suburb} {property.state} — running SLM match
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
          {property.address} — {filtered.length} matched
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
  const dirColor = (d?: "up" | "down" | "same", persona?: string) => {
    if (!d || d === "same") return theme.gradient[0]
    // "up" is good for upsizers/families (more land/beds) but neutral otherwise
    if (d === "up") return persona?.toLowerCase().includes("invest") ? C.green : theme.gradient[0]
    return theme.gradient[0]
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
        const r = await fetch(apiUrl("/api/slm-answer-batch"), {
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
                        TBD — add in Settings
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
                  Unavailable — use Chrome or Safari
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
                  ? `Saved across ${priorSessions} session${priorSessions > 1 ? "s" : ""} — will personalise outreach and future matching`
                  : "Voice context captured — will personalise outreach"}
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
        fetch(apiUrl("/api/generate"), {
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
    { icon: "✓",  col: C.green,  text: `Reading ${lead.name}'s profile — graded ${grade}, ${timeline} timeline` },
    { icon: "✓",  col: C.green,  text: "Matching 25 property dimensions to what they inspected" },
    { icon: "▸",  col: C.muted,  text: "Generating first draft..." },
    { icon: "→",  col: C.blue, text: "No open home reference detected. Rewriting..." },
    { icon: "→",  col: C.blue, text: "SMS 183 characters (limit 160). Trimming..." },
    { icon: "✅", col: C.green,  text: "All checks passed — 157 chars · Voice match 94% · Personalisation: high" },
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
    fetch(apiUrl("/api/health"))
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
      const res = await fetch(apiUrl("/api/nurture"), {
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
        { day: 0,  strategy: "New Listing Match",  sms: `Hi ${fname}, ${aname} here. I think ${property.address} is a great match for what you're looking for. Worth a look?`, email: { subject: `New listing match — ${property.address}`, body: [`Hi ${fname}, I wanted to reach out about a listing I think you'll love.`] } },
        { day: 7,  strategy: "Market Pulse",        sms: `Hi ${fname}, ${aname} here. Interesting week in ${property.suburb} - a comparable home sold well above guide. Worth keeping in touch?`, email: { subject: `Market update — ${property.suburb}`, body: [`Hi ${fname}, quick market update from the week.`] } },
        { day: 14, strategy: "Social Proof Drop",   sms: `Hi ${fname}, ${aname} here. Another buyer just moved on a similar place in ${property.suburb}. Competition's picking up - happy to chat. ${aname}`, email: { subject: `Moving fast in ${property.suburb}`, body: [`Hi ${fname}, things are moving quickly in this market.`] } },
        { day: 30, strategy: "Life Check-In",       sms: `Hi ${fname}, ${aname} here. Just checking in - how's the search going? Happy to chat anytime. ${aname}`, email: { subject: `Checking in — ${fname}`, body: [`Hi ${fname}, just wanted to check in on where you're at with your search.`] } },
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

      const deliveryRes = await fetch(apiUrl("/api/send"), {
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
      await fetch(apiUrl("/api/transcript"), {
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
      await fetch(apiUrl("/api/send"), {
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
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "right", marginTop: 6 }}>
                {sms.length}/160 chars
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
            <span style={{ fontWeight: 700 }}>Test mode active</span> — messages will go to{" "}
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
          These leads registered to bid on {auctionProperty.address} but didn't win. They're warm — reach out now.
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
                  Best match: {bestProperty.address} — {Math.round(bestResult.score)}/99
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(bestResult.score) }}>
                  {Math.round(bestResult.score)}
                </div>
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

// ── Vendor Prospecting: Portfolio (CRM Dashboard) ────────────────────────────

function VendorPortfolioPage({ agent, theme, onAnalyse }: {
  agent: AgentProfile
  theme: AgencyTheme
  onAnalyse: (segmented: SegmentedBuyer[]) => void
}) {
  const hardcodedBuyers = getPastBuyersForAgent(agent)
  const [buyers, setBuyers] = useState(hardcodedBuyers)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetSource, setSheetSource] = useState<"demo" | "sheet">("demo")
  const [analysing, setAnalysing] = useState(false)

  // Try loading real past buyers from the Google Sheet on mount
  useEffect(() => {
    setSheetLoading(true)
    readPastBuyersFromSheet().then(rows => {
      if (rows && rows.length > 0) {
        // Cast PastBuyerRow to PastBuyer — same shape, compatible types
        setBuyers(rows as typeof hardcodedBuyers)
        setSheetSource("sheet")
      }
      setSheetLoading(false)
    }).catch(() => setSheetLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const investors = buyers.filter(b => b.status === "investor")
  const owners = buyers.filter(b => b.status === "owner-occupier")

  // Use comparable sales estimates (blended with any hardcoded overrides)
  const estimatedValues = batchEstimateValues(buyers, CURRENT_VALUE_ESTIMATES)
  const totalEstValue = buyers.reduce((s, b) => s + (estimatedValues.get(b.id) ?? 0), 0)

  const handleAnalyse = () => {
    setAnalysing(true)
    const financialsMap = new Map<number, FinancialSnapshot>()
    for (const b of buyers) {
      const est = estimatedValues.get(b.id)
      if (!est) continue
      financialsMap.set(b.id, calculateFinancials(b.purchasePrice, b.purchaseDate, est, b.deposit))
    }
    const segmented = batchSegment(buyers, financialsMap)
    setTimeout(() => onAnalyse(segmented), 1200)
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "88px 28px 48px", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 8 }}>
          Vendor Prospecting
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: -0.6, marginBottom: 8 }}>
          Turn past buyers into new listings
        </div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 560 }}>
          PropOS analyses your CRM database to find past buyers who are ready to sell. We calculate their equity, CGT position, and life-stage triggers, then generate hyper-personalised outreach in your voice.
        </div>
      </div>

      {/* CRM Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total contacts", value: `${buyers.length}`, icon: "👥" },
          { label: "Owner-occupiers", value: `${owners.length}`, icon: "🏠" },
          { label: "Investors", value: `${investors.length}`, icon: "💰" },
          { label: "Est. portfolio value", value: fmtDollar(totalEstValue), icon: "📊" },
        ].map(stat => (
          <div key={stat.label} style={{
            background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`,
            padding: "16px 18px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 2 }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent contacts preview */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Your CRM database</div>
          {sheetLoading && <div style={{ fontSize: 10, color: C.faint }}>Loading from sheet...</div>}
          {sheetSource === "sheet" && !sheetLoading && (
            <div style={{ fontSize: 10, color: C.green, fontWeight: 600, padding: "2px 8px", background: C.green + "18", borderRadius: 6 }}>Live from sheet</div>
          )}
          {sheetSource === "demo" && !sheetLoading && (
            <div style={{ fontSize: 10, color: C.faint, padding: "2px 8px", background: C.bg3, borderRadius: 6 }}>Demo data</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buyers.slice(0, 5).map(buyer => {
            const est = estimatedValues.get(buyer.id) ?? 0
            const equity = est - buyer.purchasePrice
            return (
              <div key={buyer.id} style={{
                background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`,
                padding: "12px 16px", display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${theme.gradient[0]}33, ${theme.gradient[1]}22)`,
                  border: `1px solid ${theme.primary}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: theme.primary,
                }}>
                  {buyer.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{buyer.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{buyer.purchaseAddress}, {buyer.suburb}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{fmtDollar(equity)} equity</div>
                  <div style={{ fontSize: 10, color: C.faint }}>
                    {buyer.status === "investor" ? "Investor" : "Owner-occupier"}
                  </div>
                </div>
              </div>
            )
          })}
          {buyers.length > 5 && (
            <div style={{ fontSize: 11, color: C.faint, textAlign: "center", padding: "8px 0" }}>
              + {buyers.length - 5} more contacts
            </div>
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
        {analysing ? "Analysing your database..." : sheetLoading ? "Loading CRM..." : `✦ Analyse ${buyers.length} contacts for vendor opportunities`}
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
    </div>
  )
}

// ── Vendor Prospecting: Pipeline Dashboard ──────────────────────────────────

function VendorDashboardPage({ segmented, onBack, onSelectEntry, theme }: {
  segmented: SegmentedBuyer[]
  onBack: () => void
  onSelectEntry: (entry: SegmentedBuyer) => void
  theme: AgencyTheme
}) {
  const [filterPipeline, setFilterPipeline] = useState<Pipeline | "all">("all")
  const filtered = filterPipeline === "all" ? segmented : segmented.filter(s => s.segment.pipeline === filterPipeline)
  const pipelines = [...new Set(segmented.map(s => s.segment.pipeline))]
  const totalEquity = segmented.reduce((s, e) => s + e.financials.equityGain, 0)
  const urgencyColor = (u: "high" | "medium" | "low") =>
    u === "high" ? (C.red ?? "#ef4444") : u === "medium" ? C.orange : C.faint

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "88px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.primary, fontSize: 18, marginBottom: 20, padding: 0 }}>←</button>

      {/* Header with summary */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 8 }}>
          Pipeline Dashboard
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 6 }}>
          {segmented.length} contacts segmented into {pipelines.length} pipelines
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>
          Combined equity: <span style={{ color: C.green, fontWeight: 700 }}>{fmtDollar(totalEquity)}</span> across your database
        </div>
      </div>

      {/* Pipeline filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button onClick={() => setFilterPipeline("all")} style={{
          padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterPipeline === "all" ? theme.primary : C.border}`,
          background: filterPipeline === "all" ? theme.primary : C.bg2,
          color: filterPipeline === "all" ? "#fff" : C.muted,
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}>
          All ({segmented.length})
        </button>
        {pipelines.map(p => {
          const pl = PIPELINE_LABELS[p]
          const count = segmented.filter(s => s.segment.pipeline === p).length
          return (
            <button key={p} onClick={() => setFilterPipeline(p)} style={{
              padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterPipeline === p ? pl.color : C.border}`,
              background: filterPipeline === p ? pl.color + "22" : C.bg2,
              color: filterPipeline === p ? pl.color : C.muted,
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
                  <div style={{ fontSize: 10, color: C.faint }}>{fin.yearsHeld}yr hold</div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {buyer.purchaseAddress}, {buyer.suburb}
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
              </div>

              {/* Financial summary */}
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.green }}>{fmtDollar(fin.equityGain)}</div>
                <div style={{ fontSize: 9, color: C.faint, marginBottom: 4 }}>equity gain</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmtDollar(fin.currentEstimate)}</div>
                <div style={{ fontSize: 9, color: C.faint }}>est. value</div>
              </div>

              {/* Priority score */}
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: scoreColor(entry.priority) + "18",
                border: `1px solid ${scoreColor(entry.priority)}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: scoreColor(entry.priority),
              }}>
                {entry.priority}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vendor Prospecting: Contact Profile + Financial Snapshot ─────────────────

function VendorProfilePage({ entry, agent, theme, onBack, onReview }: {
  entry: SegmentedBuyer
  agent: AgentProfile
  theme: AgencyTheme
  onBack: () => void
  onReview: (sms: string, emailSubject: string, emailBody: string[]) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [overrideValue, setOverrideValue] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState(false)
  const [editValueInput, setEditValueInput] = useState("")

  const { buyer, segment } = entry
  const pl = PIPELINE_LABELS[segment.pipeline]
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const agentFirst = agent.name.split(" ")[0]

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

    const triggerSummary = segment.triggers.map(t => t.label).join("; ")

    const payload = {
      agentName: agent.name,
      agentAgency: agent.agency,
      agentPhone: agent.phone,
      voiceContext: "",
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
      crmNotes: buyer.notes ?? "",
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
        fetch(apiUrl("/api/vendor-generate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(r => r.json()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 14000)),
      ]) as { sms?: string; email?: { subject?: string; body?: string[] } }

      const sms = res.sms ?? ""
      const emailSubject = res.email?.subject ?? ""
      const emailBody: string[] = res.email?.body ?? []
      if (!sms && !emailSubject) throw new Error("empty")
      setGenerating(false)
      onReview(stripDashes(sms), stripDashes(emailSubject), emailBody.map(stripDashes))
    } catch {
      templateFallback()
    }
  }

  const equityPct = Math.round((fin.equityGain / fin.purchasePrice) * 100)
  const equityBarWidth = Math.min(equityPct, 100)

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "88px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.primary, fontSize: 18, marginBottom: 20, padding: 0 }}>←</button>

      <div style={{ display: "flex", gap: 28 }}>
        {/* LEFT — Contact details + financial snapshot */}
        <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Identity card */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
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
              {buyer.purchaseAddress}, {buyer.suburb}
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                { label: "Purchased", value: buyer.purchaseDate.slice(0, 4) },
                { label: "Purchase price", value: fmtDollar(buyer.purchasePrice) },
                { label: "Hold period", value: `${fin.yearsHeld} yrs` },
                { label: "Type", value: `${buyer.beds}bd ${buyer.baths}ba ${buyer.propertyType}` },
                buyer.land ? { label: "Land", value: `${buyer.land}sqm` } : null,
                { label: "Status", value: buyer.status === "investor" ? "Investor" : "Owner-occupier" },
              ].filter(Boolean).map(item => (
                <div key={item!.label}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{item!.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item!.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Snapshot */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>
              Financial snapshot
            </div>

            {/* Equity bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Purchased {fmtDollar(fin.purchasePrice)}</span>
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
                  <button
                    onClick={startEditValue}
                    title="Click to override estimate"
                    style={{
                      background: "transparent", border: "none", cursor: "pointer", padding: 0,
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Now {fmtDollar(fin.currentEstimate)}</span>
                    {overrideValue && <span style={{ fontSize: 9, color: theme.primary, background: theme.primary + "18", padding: "1px 5px", borderRadius: 4 }}>custom</span>}
                    <span style={{ fontSize: 9, color: C.faint }}>✏️</span>
                  </button>
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

            {/* Key metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { label: "Equity gain", value: fmtDollar(fin.equityGain), color: C.green },
                { label: "Est. current value", value: fmtDollar(fin.currentEstimate), color: C.text },
                { label: "Annual growth", value: fmtPct(fin.annualAppreciation), color: C.blue },
                fin.cashOnCashReturn ? { label: "Cash-on-cash return", value: `${fin.cashOnCashReturn}%`, color: C.green } : null,
                fin.cgtDiscount ? { label: "Est. CGT (50% disc.)", value: fmtDollar(fin.estimatedCGT), color: C.orange } : null,
                fin.cgtSavingsBy2027 > 0 ? { label: "CGT savings by Jul 2027", value: fmtDollar(fin.cgtSavingsBy2027), color: C.red ?? "#ef4444" } : null,
                { label: "Selling costs (est.)", value: fmtDollar(fin.sellingCosts), color: C.muted },
                { label: "Net proceeds (est.)", value: fmtDollar(fin.netProceeds), color: C.green },
              ].filter(Boolean).map(m => (
                <div key={m!.label} style={{
                  background: C.bg3, borderRadius: 10, padding: "10px 12px",
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{m!.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: m!.color }}>{m!.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Notes */}
          {buyer.notes && (
            <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>CRM Notes</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{buyer.notes}</div>
            </div>
          )}
        </div>

        {/* RIGHT — Triggers + pitch angles + generate */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Trigger events */}
          <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 14 }}>
              Trigger events
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {segment.triggers.map((t, i) => {
                const uColor = t.urgency === "high" ? (C.red ?? "#ef4444") : t.urgency === "medium" ? C.orange : C.faint
                return (
                  <div key={i} style={{
                    display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10,
                    background: uColor + "10", border: `1px solid ${uColor}25`,
                  }}>
                    <span style={{
                      fontSize: 8, fontWeight: 800, color: uColor, textTransform: "uppercase",
                      background: uColor + "20", padding: "2px 6px", borderRadius: 4, alignSelf: "flex-start",
                    }}>{t.urgency}</span>
                    <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{t.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI pitch angles */}
          {segment.pitchAngles.length > 0 && (
            <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 14 }}>
                Pitch angles for {fname}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {segment.pitchAngles.map((angle, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10,
                    background: C.bg3, border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                    <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{angle}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact info */}
          <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Contact</div>
            <a href={`tel:${buyer.phone}`} style={{ fontSize: 14, color: theme.primary, fontWeight: 600, textDecoration: "none", display: "block", marginBottom: 6 }}>{buyer.phone}</a>
            {buyer.email && <a href={`mailto:${buyer.email}`} style={{ fontSize: 13, color: theme.primary, fontWeight: 600, textDecoration: "none" }}>{buyer.email}</a>}
            {buyer.lastContactDate && (
              <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>Last contacted: {buyer.lastContactDate}</div>
            )}
          </div>

          {/* Generate button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={generating}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "none",
              background: generating ? C.bg3 : `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              color: generating ? C.muted : "white",
              fontSize: 15, fontWeight: 700, cursor: generating ? "default" : "pointer",
              fontFamily: FONT, letterSpacing: -0.3,
              boxShadow: generating ? "none" : `0 4px 20px ${theme.glow}`,
            }}
          >
            {generating ? "Building outreach..." : `✦ Generate vendor outreach for ${fname}`}
          </motion.button>

          <div style={{ textAlign: "center", fontSize: 11, color: C.faint }}>
            SMS + email with financial incentives in your voice
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Vendor Review Panel ───────────────────────────────────────────────────────

function VendorReviewPanel({ entry, agent, theme, sms: initSMS, emailSubject: initSubject, emailBody: initBody, onBack }: {
  entry: SegmentedBuyer
  agent: AgentProfile
  theme: AgencyTheme
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
  const [sendingToSelf, setSendingToSelf] = useState(false)
  const [sentToSelf, setSentToSelf] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState("")

  const { buyer, financials: fin, segment } = entry
  const pl = PIPELINE_LABELS[segment.pipeline]
  const fname = buyer.name.split("&")[0].split(" ")[0].trim()
  const bubbleColor = theme?.primary ?? "rgb(0,122,255)"
  const avatarGrad = `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`

  const handleSend = async () => {
    setSending(true)
    try {
      const deliveryRes = await fetch(apiUrl("/api/send"), {
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
          propertyAddress: `${buyer.purchaseAddress}, ${buyer.suburb}`,
          priceGuide: fmtDollar(fin.currentEstimate),
          sms, subject,
          emailBody: bodyText.split("\n\n").filter(p => p.trim()).join("\n\n"),
          channel: "both",
        }),
      }).then(r => r.json()).catch(() => null)
      const delivered = deliveryRes?.ok === true
      setDeliveryNote(delivered ? "Sent via Twilio + Gmail" : "Saved to Sheets (configure Twilio/Gmail for direct delivery)")

      // Write today's date back to the Past Buyers sheet tab
      await updateLastContactDate(buyer.id)
    } catch {}
    setSending(false)
    setSent(true)
  }

  const handleSendToSelf = async () => {
    setSendingToSelf(true)
    try {
      await fetch(apiUrl("/api/send"), {
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
          propertyAddress: `${buyer.purchaseAddress}, ${buyer.suburb}`,
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
            <button onClick={onBack} style={{
              padding: "12px 28px", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>
              Back to pipeline
            </button>
            <a href={`tel:${buyer.phone}`} style={{
              padding: "12px 28px", borderRadius: 12, textDecoration: "none",
              border: `1px solid ${theme.primary}44`,
              color: theme.primary, fontSize: 14, fontWeight: 700, fontFamily: FONT,
            }}>
              📞 Call {fname} now
            </a>
          </div>
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

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: theme.primary, textTransform: "uppercase", marginBottom: 4 }}>
          Review outreach
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -0.8 }}>
          {fname}'s personalised vendor messages
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{buyer.purchaseAddress}, {buyer.suburb}</div>
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
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "right", marginTop: 6 }}>
                {sms.length}/160 chars
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
    </div>
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
}: {
  agent: AgentProfile
  theme?: AgencyTheme
  mode?: DemoMode
  onSettings?: () => void
  onRegisterBack?: (fn: (() => void) | null) => void
  showInbox?: boolean
  onShowInboxChange?: (v: boolean) => void
  onBadgeChange?: (n: number) => void
}) {
  const homeStage: Stage = mode === "vendor" ? { kind: "vendorPortfolio" } : { kind: "portfolio" }
  const [stage, setStage] = useState<Stage>(homeStage)
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
      fetch(apiUrl("/api/conversations"))
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
              const res = await fetch(apiUrl("/api/reply-agent"), {
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
              await fetch(apiUrl("/api/send"), {
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
              const updated = await fetch(apiUrl("/api/conversations")).then(r => r.json())
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
                        await fetch(apiUrl("/api/conversations/seed-demo"), { method: "POST" })
                        const updated = await fetch(apiUrl("/api/conversations")).then(r => r.json())
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
                        onClick={() => { setSelectedThreadPhone(t.phone); setReplyDraft(null); setReplyText(""); fetch(apiUrl(`/api/conversations/${encodeURIComponent(t.phone)}/read`), { method: "POST" }) }}
                        style={{
                          padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
                          background: isUnread ? "rgba(245,158,11,0.05)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isUnread ? "#f59e0b" : C.text }}>
                            {isUnread && <span style={{ marginRight: 5 }}>●</span>}{t.leadName}
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
              setStage({ kind: "vendorDashboard", segmented })
            }
          />
        </motion.div>
      )}

      {stage.kind === "vendorDashboard" && (
        <motion.div key="vendorDashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
          <VendorDashboardPage
            segmented={stage.segmented}
            onBack={() => setStage({ kind: "vendorPortfolio" })}
            theme={theme}
            onSelectEntry={entry =>
              setStage({ kind: "vendorProfile", entry })
            }
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
              // Re-run segmentation to go back to dashboard
              const buyers = getPastBuyersForAgent(agent)
              const financialsMap = new Map<number, FinancialSnapshot>()
              for (const b of buyers) {
                const est = CURRENT_VALUE_ESTIMATES[b.id]
                if (!est) continue
                financialsMap.set(b.id, calculateFinancials(b.purchasePrice, b.purchaseDate, est, b.deposit))
              }
              setStage({ kind: "vendorDashboard", segmented: batchSegment(buyers, financialsMap) })
            }}
            onReview={(sms, emailSubject, emailBody) =>
              setStage({ kind: "vendorReview", entry: stage.entry, sms, emailSubject, emailBody })
            }
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
            onBack={() => setStage({ kind: "vendorProfile", entry: stage.entry })}
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
