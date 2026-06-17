import { useState, useEffect } from "react"
import { FONT, getAgencyTheme, DEFAULT_THEME } from "../../data"
import type { PitchAgentInfo, PitchCompSale } from "./PriceUpdateTemplate"
import TrackedSection from "./TrackedSection"

// ── Payload types (mirrors server/lib/pitchGenerator.ts) ──────────────────────

export interface AppraisalProperty {
  address:      string
  suburb:       string
  beds:         number
  baths:        number
  parking:      number
  landSqm?:     number
  propertyType: "House" | "Unit" | "Townhouse"
}

export interface AppraisalPriceGuide {
  low:        number
  mid:        number
  high:       number
  method:     string
  confidence: string
}

export interface AppraisalPayload {
  property:         AppraisalProperty
  priceGuide:       AppraisalPriceGuide
  comparableSales?: PitchCompSale[]
  agentCard:        PitchAgentInfo
  executiveSummary: string
  suburbStats?: {
    medianHouse:       number
    annualGrowthPct:   number
    avgDaysOnMarket:   number
    clearanceRate:     number
  }
  disclaimer:   string
  generatedAt:  string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return "$" + Math.round(n / 1000) + "K"
}

function confidenceLabel(c: string): { label: string; color: string } {
  switch (c) {
    case "high":   return { label: "High confidence",    color: "#22c55e" }
    case "medium": return { label: "Medium confidence",  color: "#f59e0b" }
    case "low":    return { label: "Indicative estimate", color: "#f97316" }
    default:       return { label: "Estimated",          color: "#9AA4B2" }
  }
}

// ── Print styles injected on mount ────────────────────────────────────────────

const PRINT_STYLE_ID = "appraisal-print-style"

function injectPrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return
  const el = document.createElement("style")
  el.id = PRINT_STYLE_ID
  el.textContent = `
    @media print {
      body { background: white !important; }
      .no-print { display: none !important; }
      .appraisal-root { box-shadow: none !important; max-width: 100% !important; }
    }
  `
  document.head.appendChild(el)
}

function removePrintStyles() {
  document.getElementById(PRINT_STYLE_ID)?.remove()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  payload:     AppraisalPayload
  pitchId?:    string
  vendorEmail?: string | null
  slug?:       string
}

export default function AppraisalView({ payload, vendorEmail, slug }: Props) {
  const { property, priceGuide, comparableSales, agentCard, executiveSummary, suburbStats, disclaimer, generatedAt } = payload
  const theme = agentCard?.agency ? getAgencyTheme(agentCard.agency) : DEFAULT_THEME

  const [copyDone, setCopyDone]       = useState(false)
  const [emailTo, setEmailTo]         = useState(vendorEmail ?? "")
  const [showEmailInput, setShowEmail] = useState(false)
  const [emailSent, setEmailSent]     = useState(false)
  const [emailError, setEmailError]   = useState<string | null>(null)

  useEffect(() => {
    injectPrintStyles()
    return removePrintStyles
  }, [])

  function handleCopy() {
    const url = slug ? `${window.location.origin}/p/${slug}` : window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    })
  }

  async function handleSendEmail() {
    if (!emailTo || !emailTo.includes("@")) return
    try {
      const res = await fetch(`/api/pitches/${payload.property.address}/send-email`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: emailTo }),
      })
      if (!res.ok) throw new Error("Send failed")
      setEmailSent(true)
      setEmailError(null)
    } catch (err) {
      setEmailError((err as Error).message)
    }
  }

  const confidence = confidenceLabel(priceGuide.confidence)
  const generatedDate = new Date(generatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })

  // Price guide bar: position mid as % between low and high
  const barRange  = priceGuide.high - priceGuide.low
  const midPct    = barRange > 0 ? ((priceGuide.mid - priceGuide.low) / barRange) * 100 : 50

  return (
    <div className="appraisal-root" style={{
      minHeight: "100vh",
      background: "#f5f5f5",
      fontFamily: FONT,
      padding: "24px 16px",
    }}>

      {/* Print/action buttons */}
      <div className="no-print" style={{
        maxWidth: 680,
        margin: "0 auto 16px",
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
      }}>
        <button
          onClick={() => window.print()}
          style={{
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: FONT, fontWeight: 600,
          }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={handleCopy}
          style={{
            background: "rgba(255,255,255,0.08)", color: "#D5DBE6",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
            padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: FONT,
          }}
        >
          {copyDone ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={() => setShowEmail(v => !v)}
          style={{
            background: "rgba(255,255,255,0.08)", color: "#D5DBE6",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
            padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: FONT,
          }}
        >
          Email to vendor
        </button>
        {showEmailInput && (
          <div style={{ display: "flex", gap: 6, width: "100%", marginTop: 4 }}>
            <input
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              placeholder="vendor@email.com"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #333",
                background: "#1a1a2e", color: "#D5DBE6", fontFamily: FONT, fontSize: 13,
              }}
            />
            <button
              onClick={handleSendEmail}
              disabled={emailSent}
              style={{
                background: "#22c55e", color: "#fff", border: "none", borderRadius: 8,
                padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: FONT, fontWeight: 600,
              }}
            >
              {emailSent ? "Sent!" : "Send"}
            </button>
          </div>
        )}
        {emailError && <div style={{ color: "#f97316", fontSize: 12, width: "100%" }}>{emailError}</div>}
      </div>

      {/* Report card */}
      <div style={{
        maxWidth: 680,
        margin: "0 auto",
        background: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
      }}>

        {/* Cover strip */}
        <TrackedSection id="cover">
        <div style={{
          background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          padding: "32px 36px",
          color: "#fff",
        }}>
          <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            Pre-Listing Appraisal
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {property.address}
          </div>
          <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 16 }}>
            {property.suburb} — {property.beds}bd {property.baths}ba {property.propertyType}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Prepared {generatedDate}
          </div>
        </div>
        </TrackedSection>

        <div style={{ padding: "32px 36px" }}>

          {/* Executive summary */}
          {executiveSummary && (
            <TrackedSection id="executive-summary" style={{ marginBottom: 32 }}>
              {executiveSummary.split("\n\n").map((para, i) => (
                <p key={i} style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.7, color: "#2d2d2d" }}>
                  {para}
                </p>
              ))}
            </TrackedSection>
          )}

          {/* Price guide */}
          <TrackedSection id="price-guide">
          <div style={{
            background: "#f9f5ff",
            borderRadius: 12,
            padding: "24px",
            marginBottom: 28,
          }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 16 }}>
              Price Guide
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>Low</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#555" }}>{fmtPrice(priceGuide.low)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>Estimated value</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: theme.gradient[0] }}>{fmtPrice(priceGuide.mid)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>High</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#555" }}>{fmtPrice(priceGuide.high)}</div>
              </div>
            </div>

            {/* Range bar */}
            <div style={{ position: "relative", height: 8, background: "#e5e7eb", borderRadius: 4, marginBottom: 12 }}>
              <div style={{
                position: "absolute",
                height: "100%",
                background: `linear-gradient(90deg, ${theme.gradient[0]}44, ${theme.gradient[0]})`,
                borderRadius: 4,
                left: 0,
                width: `${midPct}%`,
              }} />
              <div style={{
                position: "absolute",
                top: -3,
                left: `calc(${midPct}% - 7px)`,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: theme.gradient[0],
                border: "2px solid #fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: confidence.color + "22",
                color: confidence.color,
              }}>
                {confidence.label}
              </span>
              <span style={{ fontSize: 11, color: "#aaa" }}>{priceGuide.method}</span>
            </div>
          </div>
          </TrackedSection>

          {/* Suburb snapshot */}
          {suburbStats && (
            <TrackedSection id="market-overview" style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 12 }}>
                {property.suburb} Market Snapshot
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["Median House",      `$${(suburbStats.medianHouse / 1000).toFixed(0)}K`],
                  ["Annual Growth",     `${suburbStats.annualGrowthPct}%`],
                  ["Avg Days on Market", `${suburbStats.avgDaysOnMarket} days`],
                  ["Clearance Rate",    `${suburbStats.clearanceRate}%`],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    background: "#fafafa", border: "1px solid #f0f0f0",
                    borderRadius: 8, padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{value}</div>
                  </div>
                ))}
              </div>
            </TrackedSection>
          )}

          {/* Comparable sales */}
          {comparableSales && comparableSales.length > 0 && (
            <TrackedSection id="comparable-sales" style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 12 }}>
                Recent Comparable Sales
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f0f0f0" }}>
                    {["Address", "Beds", "Date", "Price"].map(h => (
                      <th key={h} style={{ padding: "8px 0", textAlign: h === "Price" ? "right" : h === "Beds" ? "center" : "left", color: "#888", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparableSales.slice(0, 5).map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "10px 0", color: "#333" }}>{c.address}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", color: "#555" }}>{c.beds}</td>
                      <td style={{ padding: "10px 0", color: "#888" }}>{c.date}</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, color: "#1a1a2e" }}>${c.price.toLocaleString("en-AU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 6 }}>Source: PropOS analysis</div>
            </TrackedSection>
          )}

          {/* Methodology */}
          <div style={{ marginBottom: 24, padding: 16, background: "#fafafa", borderRadius: 8, borderLeft: `3px solid ${theme.gradient[0]}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>Methodology</div>
            <p style={{ margin: 0, fontSize: 12, color: "#777", lineHeight: 1.6 }}>
              This estimate blends {priceGuide.method.toLowerCase()}.
              It is indicative only and should be used as a guide for discussion purposes.
            </p>
          </div>

          {/* Agent card */}
          <TrackedSection id="agent-profile">
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 16,
            background: "#f9f9f9",
            borderRadius: 12,
            marginBottom: 20,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 18, fontWeight: 700,
            }}>
              {agentCard.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>{agentCard.name}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                {agentCard.agency}{agentCard.suburb ? ` · ${agentCard.suburb}` : ""}
              </div>
              {(agentCard.phone || agentCard.email) && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 4, display: "flex", gap: 12 }}>
                  {agentCard.phone && <span>{agentCard.phone}</span>}
                  {agentCard.email && <span>{agentCard.email}</span>}
                </div>
              )}
            </div>
          </div>
          </TrackedSection>

          {/* Disclaimer */}
          <TrackedSection id="next-steps">
          <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6, margin: 0, borderTop: "1px solid #eee", paddingTop: 16 }}>
            {disclaimer}
          </p>
          </TrackedSection>
        </div>
      </div>
    </div>
  )
}
