import { useState, useEffect } from "react"
import { C, FONT } from "../data"
import { authFetch } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

// ── Types ─────────────────────────────────────────────────────────────────────

interface CursorSample { section: string; x: number; y: number; t: number }

interface DocSession {
  id:               number
  pitch_id:         string
  pitch_type:       string
  session_id:       string
  viewer_city?:     string
  opened_at:        string
  total_time_s:     number
  sections_viewed:  string[]
  completion_pct:   number
  scroll_depth_pct: number
  page_times_json:  Record<string, number>
  cursor_samples:   CursorSample[]
  text_selections:  string[]
  lead_score_delta: number
}

interface DocOverviewRow {
  pitch_id:      string
  type:          string
  slug:          string
  payload_json:  { propertyAddress?: string; buyerName?: string; vendorName?: string }
  status:        string
  view_count:    number
  created_at:    string
  first_viewed_at: string | null
  last_session?: DocSession
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(t: string): string {
  if (t === "appraisal")    return "VendorOS Appraisal"
  if (t === "buyer_brief")  return "BuyerOS Brief"
  if (t === "proposal")     return "Listing Proposal"
  if (t === "introduction") return "Introduction"
  return t
}

function typeAccent(t: string): string {
  if (t === "appraisal")    return C.orange
  if (t === "buyer_brief")  return C.blue
  if (t === "proposal")     return C.green
  return C.muted
}

function statusAccent(s: string): string {
  if (s === "viewed" || s === "accepted") return C.green
  if (s === "sent")   return C.orange
  return C.faint
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = C.blue }: { pct: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 5, background: C.blueDim, borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${Math.min(100, pct)}%`,
          background: color, borderRadius: 3, transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 10, color: C.muted, minWidth: 28, textAlign: "right" }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

// ── Section time breakdown ────────────────────────────────────────────────────

function SectionBreakdown({ pageTimes }: { pageTimes: Record<string, number> }) {
  const entries = Object.entries(pageTimes).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = entries[0][1]

  const accent = (id: string) => {
    if (id === "price-guide")      return C.orange
    if (id === "comparable-sales") return C.green
    if (id === "enquire")          return C.blue
    return C.blue
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      {entries.map(([id, secs]) => (
        <div key={id}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: C.muted, marginBottom: 3,
          }}>
            <span>{id}</span>
            <span style={{ color: C.text }}>{fmtTime(secs)}</span>
          </div>
          <div style={{ height: 4, background: C.blueDim, borderRadius: 2 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${(secs / max) * 100}%`,
              background: accent(id),
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Cursor Heatmap ────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  "price-guide":      "#f59e0b",
  "comparable-sales": "#64d090",
  "enquire":          "#4fa3e0",
  "cover":            "#a78bfa",
}

function CursorHeatmap({ samples }: { samples: CursorSample[] }) {
  const sections = Array.from(new Set(samples.map(s => s.section))).sort()
  const [activeSection, setActiveSection] = useState<string>(sections[0] ?? "")

  if (samples.length === 0) return null

  const filtered = activeSection ? samples.filter(s => s.section === activeSection) : samples
  const dotColor = SECTION_COLORS[activeSection] ?? C.blue

  // Count unique points near each sample (density estimate for opacity)
  const maxDensity = Math.max(1, Math.floor(filtered.length / 4))

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.10em",
        textTransform: "uppercase", color: C.blue, marginBottom: 10,
      }}>
        Cursor Heatmap
      </div>

      {/* Section tabs */}
      {sections.length > 1 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={{
              padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 10, fontWeight: 600, fontFamily: "inherit",
              background: activeSection === s ? (SECTION_COLORS[s] ?? C.blue) : C.bg3,
              color: activeSection === s ? "#fff" : C.muted,
              transition: "all 0.15s",
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* SVG canvas */}
      <div style={{
        background: C.bg3, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: 8, position: "relative", overflow: "hidden",
      }}>
        {/* Section label */}
        <div style={{
          position: "absolute", top: 10, left: 12,
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: SECTION_COLORS[activeSection] ?? C.muted,
          opacity: 0.7,
        }}>
          {activeSection || "all sections"}
        </div>

        <svg
          viewBox="0 0 100 60"
          style={{ width: "100%", height: "auto", display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="heatBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            </filter>
            <filter id="heatBlurSmall" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            </filter>
          </defs>

          {/* Background grid */}
          {[20, 40, 60, 80].map(x => (
            <line key={`vg${x}`} x1={x} y1={0} x2={x} y2={60}
              stroke={C.border} strokeWidth="0.3" strokeDasharray="1 2" opacity="0.4" />
          ))}
          {[20, 40].map(y => (
            <line key={`hg${y}`} x1={0} y1={y} x2={100} y2={y}
              stroke={C.border} strokeWidth="0.3" strokeDasharray="1 2" opacity="0.4" />
          ))}

          {/* Glow heat layer (large, blurred) */}
          <g filter="url(#heatBlur)">
            {filtered.map((s, i) => (
              <circle
                key={`h${i}`}
                cx={s.x}
                cy={s.y * 0.6}
                r={5}
                fill={dotColor}
                fillOpacity={Math.min(0.35, 0.08 + (i / maxDensity) * 0.05)}
              />
            ))}
          </g>

          {/* Sharp dot layer */}
          <g filter="url(#heatBlurSmall)">
            {filtered.map((s, i) => (
              <circle
                key={`d${i}`}
                cx={s.x}
                cy={s.y * 0.6}
                r={1.5}
                fill={dotColor}
                fillOpacity={0.6}
              />
            ))}
          </g>
        </svg>

        {/* Legend */}
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 4, padding: "0 2px",
        }}>
          <span style={{ fontSize: 8, color: C.faint }}>{filtered.length} cursor samples</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 28, height: 4, borderRadius: 2, background: `linear-gradient(to right, transparent, ${dotColor})` }} />
            <span style={{ fontSize: 8, color: C.faint }}>density</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Session detail bottom sheet ───────────────────────────────────────────────

function SessionPanel({ session, onClose }: { session: DocSession; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderRadius: "16px 16px 0 0", padding: "24px 24px 36px",
        width: "100%", maxWidth: 600,
        maxHeight: "80vh", overflowY: "auto",
        fontFamily: FONT,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Session detail</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Time spent",   value: fmtTime(session.total_time_s) },
            { label: "Score delta",  value: `+${session.lead_score_delta}` },
            { label: "Completion",   value: `${Math.round(session.completion_pct)}%` },
            { label: "Scroll depth", value: `${Math.round(session.scroll_depth_pct)}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: C.bg3, borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Section time bars */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.blue, marginBottom: 8 }}>
          Time per section
        </div>
        <SectionBreakdown pageTimes={session.page_times_json ?? {}} />

        {/* Text selections */}
        {session.text_selections?.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.blue, marginBottom: 8 }}>
              Text noted
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {session.text_selections.map((sel, i) => (
                <div key={i} style={{
                  background: C.blueDim, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "8px 12px",
                  fontSize: 12, color: C.text, fontStyle: "italic",
                }}>
                  "{sel}"
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cursor heatmap */}
        {session.cursor_samples?.length > 0 && (
          <CursorHeatmap samples={session.cursor_samples} />
        )}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function DocInsightsView() {
  const [rows, setRows]                   = useState<DocOverviewRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [selectedPitchId, setSelected]    = useState<string | null>(null)
  const [sessions, setSessions]           = useState<DocSession[]>([])
  const [sessionDetail, setDetail]        = useState<DocSession | null>(null)
  const [loadingSessions, setLoadingSess] = useState(false)
  const [filter, setFilter]               = useState<"all" | "appraisal" | "buyer_brief">("all")

  useEffect(() => {
    setLoading(true)
    authFetch(apiUrl("/api/doc-track/overview"))
      .then(r => r.json())
      .then((data: { rows: DocOverviewRow[] }) => { setRows(data.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function selectPitch(pitchId: string) {
    if (selectedPitchId === pitchId) { setSelected(null); setSessions([]); return }
    setSelected(pitchId)
    setSessions([])
    setLoadingSess(true)
    authFetch(apiUrl(`/api/doc-track/sessions/${pitchId}`))
      .then(r => r.json())
      .then((data: { sessions: DocSession[] }) => { setSessions(data.sessions ?? []); setLoadingSess(false) })
      .catch(() => setLoadingSess(false))
  }

  const filtered = filter === "all" ? rows : rows.filter(r => r.type === filter)

  const totalSent   = rows.length
  const totalViewed = rows.filter(r => r.view_count > 0).length
  const avgScore    = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.last_session?.lead_score_delta ?? 0), 0) / rows.length)
    : 0

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, fontFamily: FONT,
      color: C.text, paddingBottom: 80, paddingTop: 80,
    }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.blue, marginBottom: 8,
          }}>
            DocInsights · Engagement Intelligence
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 900, letterSpacing: -0.5,
            color: C.text, margin: 0,
          }}>
            Document Pipeline
          </h1>
        </div>

        {/* ── Stat chips ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
          {[
            { label: "Docs Sent",  value: String(totalSent),  accent: C.text },
            { label: "Opened",     value: String(totalViewed), accent: C.green },
            { label: "Open Rate",  value: totalSent > 0 ? `${Math.round((totalViewed / totalSent) * 100)}%` : "—", accent: C.orange },
            { label: "Avg Score",  value: `+${avgScore}`,      accent: C.blue },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "14px 18px", minWidth: 90,
            }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["all", "appraisal", "buyer_brief"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "5px 13px", borderRadius: 20, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: FONT,
                background: filter === f ? C.blue : C.bg2,
                color: filter === f ? C.bg : C.muted,
                transition: "all 0.15s",
              }}
            >
              {f === "all" ? "All" : f === "appraisal" ? "VendorOS" : "BuyerOS"}
            </button>
          ))}
        </div>

        {/* ── Document rows ────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>
            No documents sent yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(row => {
              const isOpen   = selectedPitchId === row.pitch_id
              const address  = row.payload_json?.propertyAddress ?? "—"
              const score    = row.last_session?.lead_score_delta ?? 0
              const timeSec  = row.last_session?.total_time_s ?? 0

              return (
                <div key={row.pitch_id}>
                  {/* Row card */}
                  <div
                    onClick={() => selectPitch(row.pitch_id)}
                    style={{
                      background: isOpen ? C.bg3 : C.bg2,
                      border: `1px solid ${isOpen ? C.blue : C.border}`,
                      borderRadius: isOpen ? "10px 10px 0 0" : 10,
                      padding: "14px 18px", cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
                          textTransform: "uppercase", color: typeAccent(row.type), marginBottom: 5,
                        }}>
                          {typeLabel(row.type)}
                        </div>
                        <div style={{
                          fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {address}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          Sent {fmtDate(row.created_at)}
                          {row.first_viewed_at ? ` · Opened ${fmtDate(row.first_viewed_at)}` : " · Unopened"}
                          {row.view_count > 1 ? ` · ${row.view_count} views` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 700,
                          color: statusAccent(row.status), textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
                          {row.status}
                        </div>
                        {score > 0 && (
                          <div style={{
                            fontSize: 10, color: C.blue,
                            background: C.blueDim,
                            border: `1px solid ${C.border}`,
                            borderRadius: 5, padding: "2px 7px",
                          }}>
                            +{score} pts
                          </div>
                        )}
                        {timeSec > 0 && <div style={{ fontSize: 10, color: C.muted }}>{fmtTime(timeSec)}</div>}
                      </div>
                    </div>

                    {/* Progress bars (only if has session) */}
                    {row.last_session && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                        <div>
                          <div style={{ fontSize: 9, color: C.faint, marginBottom: 2 }}>Completion</div>
                          <ProgressBar pct={row.last_session.completion_pct} color={C.green} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: C.faint, marginBottom: 2 }}>Scroll depth</div>
                          <ProgressBar pct={row.last_session.scroll_depth_pct} color={C.blue} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded: session list */}
                  {isOpen && (
                    <div style={{
                      background: C.bg, border: `1px solid ${C.border}`,
                      borderTop: "none", borderRadius: "0 0 10px 10px",
                      padding: "10px 18px",
                    }}>
                      {loadingSessions ? (
                        <div style={{ fontSize: 12, color: C.muted, padding: "8px 0" }}>Loading sessions…</div>
                      ) : sessions.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.faint, padding: "8px 0" }}>No sessions recorded yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.blue, marginBottom: 4 }}>
                            Sessions ({sessions.length})
                          </div>
                          {sessions.map((s, i) => (
                            <div
                              key={s.session_id}
                              onClick={() => setDetail(s)}
                              style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                background: C.bg2, border: `1px solid ${C.border}`,
                                borderRadius: 8, padding: "9px 13px", cursor: "pointer",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                                  Session {i + 1}{s.viewer_city ? ` · ${s.viewer_city}` : ""}
                                </div>
                                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                                  {fmtDate(s.opened_at)} · {fmtTime(s.total_time_s)} · {s.sections_viewed?.length ?? 0} sections
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {s.lead_score_delta > 0 && (
                                  <span style={{ fontSize: 11, color: C.blue }}>+{s.lead_score_delta}</span>
                                )}
                                <span style={{ fontSize: 14, color: C.muted }}>›</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Session detail bottom sheet */}
      {sessionDetail && <SessionPanel session={sessionDetail} onClose={() => setDetail(null)} />}
    </div>
  )
}
