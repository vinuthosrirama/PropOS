import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  C, FONT, PORTFOLIO_SOLD, PORTFOLIO_ACTIVE,
  DEFAULT_THEME,
  type AgentProfile, type AgencyTheme, type PortfolioProperty,
  type LeadStatus, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER,
} from "../data"
import {
  loadSLMForProperty, getSLMCompleteness,
  type PropertySLM,
} from "../data/propertySlm"
import { matchLeadToListing, matchQuestionToSLM, type MatchResult } from "../lib/slmMatch"
import {
  readLeadsFromSheet, readAllLeadsFromSheet, postEvent, sheetsConnected,
  postLeadStatus, markAttended,
  type SheetLead,
} from "../lib/sheet"
import AuctionOutcomePanel from "../components/AuctionOutcomePanel"
import { buildVoiceContext, loadCorpus } from "../lib/voiceContext"
import { DEMO_FALLBACK_LEADS } from "../lib/demoFallback"
import { getCachedOutreach } from "../lib/cachedOutreach"
import { useVoiceMemo } from "../hooks/useVoiceMemo"

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`

function initials(name: string) {
  const parts = name.split(" ")
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

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

function ActiveCard({ property, onClick, theme }: {
  property: PortfolioProperty
  onClick: () => void
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
            `${property.beds} bed`,
            `${property.baths} bath`,
            `${property.cars} car`,
            property.land ? `${property.land}sqm` : null,
          ].filter(Boolean).map(s => (
            <span key={s} style={{ fontSize: 10, color: C.faint }}>{s}</span>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>
          {property.priceMin && property.priceMax
            ? `${fmt(property.priceMin)} – ${fmt(property.priceMax)}`
            : fmt(property.price)}
        </div>
        {property.openDate && (
          <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>{property.openDate}</div>
        )}
      </div>
    </div>
  )
}

// ── SoldCard ──────────────────────────────────────────────────────────────────

function SoldCard({ property, leads, loading, theme, onClick, onRecordAuction }: {
  property: PortfolioProperty
  leads: SheetLead[]
  loading: boolean
  theme: AgencyTheme
  onClick: () => void
  onRecordAuction: (p: PortfolioProperty) => void
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
        background: "rgba(0,0,0,0.50)", backdropFilter: "blur(6px)",
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

      {/* Auction result button — top left below sold badge */}
      <button
        onClick={e => { e.stopPropagation(); onRecordAuction(property) }}
        style={{
          position: "absolute", top: 38, left: 10,
          padding: "3px 9px", borderRadius: 8,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          border: `1px solid rgba(255,255,255,0.18)`,
          color: "rgba(255,255,255,0.80)", fontSize: 9, fontWeight: 700,
          cursor: "pointer", fontFamily: FONT, zIndex: 2,
        }}
      >
        + Auction Result
      </button>

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
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>…</span>
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

function SoldLeadsPage({ soldProperty, leads, onBack, theme }: {
  soldProperty: PortfolioProperty
  leads: SheetLead[]
  onBack: () => void
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
    const bestMatch = activeSLMs
      .map(a => ({
        property: a.property,
        result: matchLeadToListing(
          { budget: lead.budget, bedsWanted, persona: lead.persona, suburbs: inferSuburbs(lead), notes: lead.notes, questions: lead.questions },
          a.slm,
          slm,
        ),
      }))
      .sort((a, b) => b.result.score - a.result.score)[0]
    return { lead, bestMatch }
  })

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "80px 28px 48px", fontFamily: FONT }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: theme.primary, fontSize: 18, fontFamily: FONT,
        display: "flex", alignItems: "center", marginBottom: 20, padding: 0, lineHeight: 1,
      }}>←</button>

      {/* Header — property info */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{ width: 80, height: 60, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
          <img src={soldProperty.image} alt={soldProperty.address} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                style={{
                  background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`,
                  padding: "16px 18px",
                }}
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
                            <circle cx={24} cy={24} r={r} fill="none" stroke={color + "22"} strokeWidth={3} />
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
function groupLeadsByProperty(allLeads: SheetLead[]): Record<number, SheetLead[]> {
  const map: Record<number, SheetLead[]> = {}
  for (const sold of PORTFOLIO_SOLD) {
    map[sold.id] = allLeads.filter(lead => leadBelongsToProperty(lead, sold))
  }
  return map
}

// ── Stage 0 — Portfolio ───────────────────────────────────────────────────────

function PortfolioPage({ onSelectActive, onSelectSold, theme }: {
  onSelectActive: (p: PortfolioProperty, soldLeads: Record<number, SheetLead[]>) => void
  onSelectSold: (p: PortfolioProperty, leads: SheetLead[]) => void
  theme: AgencyTheme
}) {
  const [soldLeads, setSoldLeads] = useState<Record<number, SheetLead[]>>({})
  const [sheetsLoading, setSheetsLoading] = useState(true)
  const [auctionPanelProperty, setAuctionPanelProperty] = useState<PortfolioProperty | null>(null)

  useEffect(() => {
    let mounted = true
    const CACHE_KEY = "propOS_leads_cache_v2"

    const applyLeads = (leads: SheetLead[], save = false) => {
      if (!mounted) return
      setSoldLeads(groupLeadsByProperty(leads))
      setSheetsLoading(false)
      if (save && leads.length > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(leads)) } catch {}
      }
    }

    // Load from localStorage cache immediately for instant display
    const cachedRaw = localStorage.getItem(CACHE_KEY)
    const cached: SheetLead[] | null = cachedRaw ? (() => { try { return JSON.parse(cachedRaw) } catch { return null } })() : null
    if (cached && cached.length > 0) applyLeads(cached)

    // If Sheets not configured, stop here — cache or fallback is sufficient
    if (!sheetsConnected()) {
      if (!cached || cached.length === 0) applyLeads(DEMO_FALLBACK_LEADS)
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
          applyLeads(allLeads, true)
          return
        }
        // Strategy 2: bulk empty — try per-property queries.
        return Promise.all(
          PORTFOLIO_SOLD.map(p => readLeadsFromSheet(p.address + ", " + p.suburb))
        ).then(results => {
          const flat = results.flatMap((leads, i) =>
            (leads ?? []).map(l => ({ ...l, _pid: PORTFOLIO_SOLD[i].id }))
          ) as SheetLead[]
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

  // SLM completeness check — warn if any active listing is below 80% complete
  const slmWarnings = PORTFOLIO_ACTIVE
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
            <span style={{ textDecoration: "underline", cursor: "pointer" }}>
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
          {PORTFOLIO_ACTIVE.map((p, i) => (
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>
            Comparable Sales
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {PORTFOLIO_SOLD.map((p, i) => (
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
                onRecordAuction={setAuctionPanelProperty}
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
        onSaved={() => setAuctionPanelProperty(null)}
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

  const totalLeadCount = PORTFOLIO_SOLD.reduce((acc, p) => acc + (soldLeads[p.id]?.length ?? 0), 0)
  const slmInfo = getSLMCompleteness(loadSLMForProperty(property.id))

  const steps = [
    `Reading property SLM — ${slmInfo.filled} attributes loaded`,
    `Scanning ${PORTFOLIO_SOLD.length} comparable sold properties`,
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
      const scoredLeads: ScoredLead[] = PORTFOLIO_SOLD.flatMap(sold => {
        const soldSLM = loadSLMForProperty(sold.id)
        const sheetLeads = soldLeads[sold.id] ?? []
        return sheetLeads.map(lead => {
          const bedsWanted = inferBedsWanted(lead)
          return {
            ...lead,
            fromPropertyId: sold.id,
            bedsWanted,
            matchResult: matchLeadToListing(
              {
                budget: lead.budget,
                bedsWanted,
                persona: lead.persona,
                suburbs: inferSuburbs(lead),
                notes: lead.notes,
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
    PORTFOLIO_SOLD.find(p => p.id === id)?.address ?? "Unknown"

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px 48px", fontFamily: FONT }}>
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
          const topFactors = lead.matchResult.matchedFactors.slice(0, 2)
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
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: scoreColor(lead.matchResult.score) + "18",
                border: `2px solid ${scoreColor(lead.matchResult.score)}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: scoreColor(lead.matchResult.score),
              }}>
                {initials(lead.name)}
              </div>

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
                      background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
                      color: "#f59e0b", fontWeight: 600,
                    }}>
                      stretch match
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  From {fromAddr} &middot; {fmt(lead.budget)} budget
                </div>
                {lead.matchResult.insight && (
                  <div style={{ fontSize: 11, color: C.faint, fontStyle: "italic", marginBottom: 4 }}>
                    {lead.matchResult.insight}
                  </div>
                )}
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

              {/* Score circle */}
              <div style={{
                width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                border: `3px solid ${scoreColor(lead.matchResult.score)}44`,
                background: scoreColor(lead.matchResult.score) + "11",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(lead.matchResult.score), lineHeight: 1 }}>
                  {lead.matchResult.score}
                </div>
                <div style={{ fontSize: 8, color: C.faint, fontWeight: 600 }}>MATCH</div>
              </div>
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
  const [manualTranscript, setManualTranscript] = useState("")
  const voice = useVoiceMemo({ onTranscript: t => setManualTranscript(prev => prev ? prev + " " + t : t) })
  const transcript = manualTranscript
  const activeSLM = loadSLMForProperty(property.id)
  const fname = lead.name.split(" ")[0]
  const shownQs = new Set<string>()

  // Use the rich comparison data from matchResult (already built with direction + persona relevance)
  const comparisons = lead.matchResult.comparisons

  const dirIcon = (d?: "up" | "down" | "same") =>
    d === "up" ? " ↑" : d === "down" ? " ↓" : ""
  const dirColor = (d?: "up" | "down" | "same", persona?: string) => {
    if (!d || d === "same") return theme.primary
    // "up" is good for upsizers/families (more land/beds) but neutral otherwise
    if (d === "up") return persona?.toLowerCase().includes("invest") ? C.green : theme.primary
    return "#f59e0b"
  }

  // Build Q&A for display
  const qaPairs: Array<{ question: string; answer: string; category: string }> = []
  for (const question of lead.questions ?? []) {
    const matched = matchQuestionToSLM(question, activeSLM, shownQs)
    if (matched) {
      shownQs.add(matched.question)
      qaPairs.push({ question, answer: matched.answer, category: matched.category })
    }
  }

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "80px 32px 48px", fontFamily: FONT }}>
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
            {lead.matchResult.insight && (
              <div style={{
                fontSize: 12, color: C.muted, fontStyle: "italic",
                paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${C.border}`,
              }}>
                {lead.matchResult.insight}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
                background: scoreColor(lead.matchResult.score) + "18",
                border: `2px solid ${scoreColor(lead.matchResult.score)}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, color: scoreColor(lead.matchResult.score),
              }}>
                {initials(lead.name)}
              </div>
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
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                border: `3px solid ${scoreColor(lead.matchResult.score)}44`,
                background: scoreColor(lead.matchResult.score) + "11",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(lead.matchResult.score), lineHeight: 1 }}>
                  {lead.matchResult.score}
                </div>
                <div style={{ fontSize: 8, color: C.faint, fontWeight: 600 }}>MATCH</div>
              </div>
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
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      {cf.label}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
                      <span style={{ color: C.text, fontWeight: 600 }}>{cf.soldValue}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      <span style={{
                        color: dirColor(cf.direction, lead.persona),
                        fontWeight: 600,
                      }}>
                        {cf.activeValue}{dirIcon(cf.direction)}
                      </span>
                    </div>
                    <div style={{
                      marginTop: 5, height: 2, borderRadius: 1,
                      background: cf.match === "exact" ? C.green + "44"
                        : cf.match === "close" ? "#f59e0b44"
                        : C.border,
                    }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Q&A */}
          {qaPairs.length > 0 && (
            <div style={{ background: C.bg2, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 24px", userSelect: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                What {fname} asked at {soldSLM.address} — answered for {property.address}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {qaPairs.map((qa, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${theme.primary}33`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{qa.question}</div>
                    {qa.answer === "TBD" ? (
                      <div style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 6,
                        background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
                        fontSize: 11, color: "#f59e0b", fontWeight: 600,
                      }}>
                        TBD — add in Settings
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{qa.answer}</div>
                    )}
                    <div style={{
                      display: "inline-block", marginTop: 4, fontSize: 9, padding: "1px 6px",
                      borderRadius: 4, background: C.bg3, color: C.faint, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: 0.4,
                    }}>
                      {qa.category}
                    </div>
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
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase" }}>
                Voice Note
              </div>
              {voice.supported && (
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
            </div>
            {voice.permError && (
              <div style={{
                marginBottom: 10, padding: "7px 10px", borderRadius: 8,
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                fontSize: 11, color: "#f59e0b", lineHeight: 1.5,
              }}>
                Microphone access denied — enable microphone access in browser settings
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
                Voice context captured — will personalise outreach
              </div>
            )}
          </div>

          {/* Generate button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onGenerate(transcript)}
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

          {/* Match factors */}
          {lead.matchResult.matchedFactors.length > 0 && (
            <div style={{ background: C.bg2, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Why this lead matches
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lead.matchResult.matchedFactors.map(f => (
                  <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                      background: f.tag === "yield" ? C.green
                        : f.tag === "school" ? C.blue
                        : f.tag === "budget" ? C.green
                        : C.muted + "88",
                    }} />
                    <div style={{ flex: 1, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: C.faint, flexShrink: 0 }}>{f.points}pt</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    const slmContext = [
      `SOLD PROPERTY (what ${lead.name.split(" ")[0]} inspected): ${soldSLM.address}`,
      `Attributes: ${soldSLMSummary}`,
      ``,
      `ACTIVE LISTING (what you're pitching): ${property.address}, ${property.suburb}`,
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

    const useFallbackOutreach = () => {
      // Try cached pre-generated outreach first
      const cached = getCachedOutreach(lead.name, property.address)
      if (cached) {
        onCompleteRef.current(cached.sms, cached.emailSubject, cached.emailBody)
        return
      }
      // Generic fallback
      const agentFirst = agent.name.split(" ")[0]
      const mockSMS = `Hey ${fname}, ${agentFirst} here. Thought of you for ${property.address.split(",")[0]} — ${activeSLM.beds !== "TBD" ? activeSLM.beds + "bd" : "similar"}/${activeSLM.baths !== "TBD" ? activeSLM.baths + "ba" : ""}${activeSLM.landSqm !== "TBD" ? ", " + activeSLM.landSqm + "sqm" : ""}. Open ${property.openDate ?? "this weekend"}. Worth a look?`
      const mockSubject = `${property.address.split(",")[0]} — worth a look, ${fname}`
      const mockBody = [
        `Hey ${fname}, hope you're well.`,
        `After you came through ${soldSLM.address}, I thought this new listing might tick some boxes. It's ${activeSLM.beds !== "TBD" ? activeSLM.beds + "-bed" : "similar"}, ${activeSLM.landSqm !== "TBD" ? activeSLM.landSqm + "sqm" : "comparable land"} — ${activeSLM.priceMin !== "TBD" && activeSLM.priceMax !== "TBD" ? "price guide " + fmt(activeSLM.priceMin as number) + " to " + fmt(activeSLM.priceMax as number) : "priced competitively"}.`,
        `${property.openDate ? "Open home is " + property.openDate + "." : "Happy to arrange a private inspection."} Let me know if you'd like the details.`,
        `Cheers,\n${agentFirst}`,
      ]
      onCompleteRef.current(mockSMS, mockSubject, mockBody)
    }

    // Race API call against 10s timeout — cached outreach activates if LLM is slow
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("generation timeout")), 10000)
    )

    Promise.race([
      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      timeoutPromise,
    ])
      .then(res => (res as Response).json())
      .then(data => {
        const sms = data.sms ?? ""
        const emailSubject = data.emailSubject ?? data.email?.subject ?? `${property.address.split(",")[0]} — worth a look, ${fname}`
        const emailBody: string[] = data.emailBody ?? data.email?.body ?? []
        onCompleteRef.current(sms, emailSubject, emailBody)
      })
      .catch(useFallbackOutreach)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: FONT,
    }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          style={{
            width: 56, height: 56, borderRadius: "50%",
            border: `3px solid ${C.border}`,
            borderTopColor: theme.primary,
            margin: "0 auto 24px",
          }}
        />
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, marginBottom: 8 }}>
          AddVantage Engine generating personalised outreach...
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>
          Analysing {lead.name.split(" ")[0]}'s profile, reading the property knowledge, and crafting personalised outreach.
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

  // Fetch server test mode config once on mount
  useEffect(() => {
    fetch("/api/health")
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
      const res = await fetch("/api/nurture", {
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

      const deliveryRes = await fetch("/api/send", {
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
      await fetch("/api/transcript", {
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
    } catch {
      // never fail the demo
    }
    setSending(false)
    setSent(true)
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
    const bedsWanted = inferBedsWanted(lead)
    const matches = otherActives
      .map(p => ({
        property: p,
        slm: loadSLMForProperty(p.id),
        result: matchLeadToListing(
          { budget: lead.budget, bedsWanted, persona: lead.persona, suburbs: inferSuburbs(lead), notes: lead.notes, questions: lead.questions },
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

// ── Main DemoView ─────────────────────────────────────────────────────────────

export default function DemoView({
  agent,
  theme = DEFAULT_THEME,
}: {
  agent: AgentProfile
  theme?: AgencyTheme
}) {
  const [stage, setStage] = useState<Stage>({ kind: "portfolio" })
  const [unreadReplies, setUnreadReplies] = useState(0)
  const [showInbox, setShowInbox] = useState(false)
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
      fetch("/api/conversations")
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
        setStage({ kind: "portfolio" })
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const isPortfolio = stage.kind === "portfolio"

  return (
    <>
      {/* Floating "← Portfolio" button — visible on all non-portfolio stages */}
      {!isPortfolio && (
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          onClick={() => setStage({ kind: "portfolio" })}
          style={{
            position: "fixed", top: 16, left: 72, zIndex: 200,
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            background: C.bg2, border: `1px solid ${C.border}`,
            color: theme.primary, fontSize: 12, fontWeight: 700,
            fontFamily: FONT, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          ← Portfolio
        </motion.button>
      )}

      {/* Reply inbox badge — top-right */}
      {(inboxThreads.length > 0 || unreadReplies > 0) && (
        <motion.button
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => { setShowInbox(!showInbox); setSelectedThreadPhone(null); setReplyDraft(null) }}
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 200,
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            background: unreadReplies > 0 ? "rgba(245,158,11,0.15)" : C.bg2,
            border: `1px solid ${unreadReplies > 0 ? "rgba(245,158,11,0.4)" : C.border}`,
            color: unreadReplies > 0 ? "#f59e0b" : C.muted,
            fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          💬 Replies
          {unreadReplies > 0 && (
            <span style={{
              background: "#f59e0b", color: C.bg,
              borderRadius: "50%", width: 18, height: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800,
            }}>{unreadReplies}</span>
          )}
        </motion.button>
      )}

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
              const res = await fetch("/api/reply-agent", {
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
              await fetch("/api/send", {
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
              const updated = await fetch("/api/conversations").then(r => r.json())
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
                        await fetch("/api/conversations/seed-demo", { method: "POST" })
                        const updated = await fetch("/api/conversations").then(r => r.json())
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
                        onClick={() => { setSelectedThreadPhone(t.phone); setReplyDraft(null); setReplyText(""); fetch(`/api/conversations/${encodeURIComponent(t.phone)}/read`, { method: "POST" }) }}
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
        <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <PortfolioPage
            onSelectActive={(property, soldLeads) =>
              setStage({ kind: "matching", property, soldLeads })
            }
            onSelectSold={(soldProperty, leads) =>
              setStage({ kind: "soldLeads", soldProperty, leads })
            }
            theme={theme}
          />
        </motion.div>
      )}

      {stage.kind === "soldLeads" && (
        <motion.div key="soldLeads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <SoldLeadsPage
            soldProperty={stage.soldProperty}
            leads={stage.leads}
            onBack={() => setStage({ kind: "portfolio" })}
            theme={theme}
          />
        </motion.div>
      )}

      {stage.kind === "matching" && (
        <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
        <motion.div key="leads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
        <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
        <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
        <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
        <motion.div key="missedOut" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
