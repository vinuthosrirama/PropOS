/**
 * VendorOutreachView — Email/Campaign tab for VendorOS mode.
 * Shows outreach sent to past-buyer contacts from PropOS_democontacts.
 */

import { useState, useEffect } from "react"
import { C, FONT } from "../data"
import { authFetch } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

interface FunnelData {
  outreachSent:     number
  emailOpened:      number
  replied:          number
  appraisalsBooked: number
  listingsWon:      number
  estimatedGCI:     number
}

interface RecentContact {
  contact_name:     string
  contact_phone:    string
  contact_email:    string | null
  property_address: string | null
  pipeline:         string
  sent_at:          string
  status:           string
  email_subject:    string | null
}

interface VendorAnalytics {
  funnel:         FunnelData
  nurture:        { pending: number; sent: number }
  byPipeline:     Record<string, number>
  recentOutreach: RecentContact[]
  roi:            { monthlySubscription: number; listingsAttributed: number; revenueGenerated: number; roiMultiple: number }
}

const PIPELINE_LABELS: Record<string, string> = {
  "investor-to-seller":      "Investor → Sell",
  "owner-to-upsizer":        "Owner → Upsize",
  "owner-to-seller":         "Owner → Sell",
  "owner-to-downsizer":      "Owner → Downsize",
  "investor-to-rebalance":   "Investor → Rebalance",
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  sent:     { label: "Sent",     color: C.blue,   bg: C.blueDim },
  opened:   { label: "Opened",   color: C.green,  bg: C.greenDim },
  clicked:  { label: "Clicked",  color: C.green,  bg: C.greenDim },
  replied:  { label: "Replied",  color: C.purple, bg: C.purpleDim },
  failed:   { label: "Failed",   color: C.red,    bg: C.redDim },
}

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, color: C.muted, bg: "rgba(213,219,230,0.08)" }
}

function pipelineLabel(p: string) {
  return PIPELINE_LABELS[p] ?? p.replace(/-/g, " ")
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d === 0) return "Today"
  if (d === 1) return "Yesterday"
  if (d < 7)  return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export default function VendorOutreachView() {
  const [data, setData]       = useState<VendorAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    authFetch(apiUrl("/api/analytics/vendor"))
      .then(r => r.json())
      .then((d: VendorAnalytics) => { setData(d); setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [])

  const containerStyle: React.CSSProperties = {
    paddingTop: 80, paddingBottom: 60,
    paddingLeft: 20, paddingRight: 20,
    maxWidth: 900, margin: "0 auto",
    fontFamily: FONT, color: C.text,
  }

  if (loading) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.5)", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ ...containerStyle, color: C.muted, textAlign: "center", paddingTop: 120 }}>
        <div style={{ fontSize: 13 }}>Could not load outreach data</div>
      </div>
    )
  }

  const { funnel, nurture, byPipeline, recentOutreach, roi } = data

  const funnelSteps = [
    { label: "Sent",      value: funnel.outreachSent,     color: C.blue },
    { label: "Opened",    value: funnel.emailOpened,       color: "#60a5fa" },
    { label: "Replied",   value: funnel.replied,           color: C.green },
    { label: "Appraisal", value: funnel.appraisalsBooked,  color: C.purple },
    { label: "Listed",    value: funnel.listingsWon,        color: "#f59e0b" },
  ]
  const maxVal = Math.max(1, funnel.outreachSent)

  return (
    <div style={containerStyle}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>
          Email Outreach
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Lead Campaigns</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted }}>
          Email outreach sent to your leads — tracked in real time.
        </p>
      </div>

      {/* Funnel */}
      <div style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: "20px 24px", marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>
          Outreach Funnel
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {funnelSteps.map((step, i) => {
            const pct = Math.round((step.value / maxVal) * 100)
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: step.color }}>{step.value}</div>
                <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: step.color, transition: "width 0.6s ease" }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "center" }}>{step.label}</div>
              </div>
            )
          })}
        </div>
        {nurture.pending > 0 && (
          <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "rgba(182,194,171,0.07)", border: "1px solid rgba(182,194,171,0.15)", fontSize: 12, color: C.muted }}>
            <span style={{ color: "#b6c2ab", fontWeight: 700 }}>{nurture.pending}</span> nurture follow-ups queued · <span style={{ color: "#b6c2ab", fontWeight: 700 }}>{nurture.sent}</span> already sent
          </div>
        )}
      </div>

      {/* Two columns: pipeline breakdown + ROI */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        {/* Pipeline breakdown */}
        <div style={{
          flex: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "18px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>
            By Pipeline
          </div>
          {Object.entries(byPipeline).length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>No pipeline data yet.</div>
          ) : (
            Object.entries(byPipeline).map(([pipeline, count]) => {
              const pct = Math.round((count / Math.max(1, funnel.outreachSent)) * 100)
              return (
                <div key={pipeline} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 120, fontSize: 11, color: C.muted, flexShrink: 0 }}>{pipelineLabel(pipeline)}</div>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: C.blue }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, width: 28, textAlign: "right" }}>{count}</div>
                </div>
              )
            })
          )}
        </div>

        {/* ROI */}
        <div style={{
          flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: C.muted, textTransform: "uppercase" }}>
            Est. ROI
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>
              {roi.roiMultiple > 0 ? `${roi.roiMultiple}×` : "—"}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>return on subscription</div>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              ${roi.revenueGenerated > 0 ? roi.revenueGenerated.toLocaleString() : "0"}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>estimated GCI generated</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted }}>{roi.listingsAttributed} listing{roi.listingsAttributed !== 1 ? "s" : ""} attributed</div>
          </div>
        </div>
      </div>

      {/* Recent outreach */}
      <div style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: "18px 0",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: C.muted, textTransform: "uppercase", marginBottom: 12, paddingLeft: 20 }}>
          Recent Outreach to CRM Contacts
        </div>

        {recentOutreach.length === 0 ? (
          <div style={{ padding: "20px 20px 12px", fontSize: 13, color: C.muted }}>
            No outreach sent yet. Open the <strong style={{ color: C.text }}>Launchpad</strong> tab to send to your past buyers.
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 160px 130px 90px 80px",
              gap: 12, padding: "0 20px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              {["Contact", "Property", "Pipeline", "Sent", "Status"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</div>
              ))}
            </div>
            {recentOutreach.map((r, i) => {
              const sm = statusMeta(r.status)
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 160px 130px 90px 80px",
                  gap: 12, padding: "12px 20px",
                  borderBottom: i < recentOutreach.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.contact_name}</div>
                    {r.email_subject && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.email_subject}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.property_address ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.blue }}>{pipelineLabel(r.pipeline)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{relativeDate(r.sent_at)}</div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 20,
                      fontSize: 10, fontWeight: 700,
                      color: sm.color, background: sm.bg,
                    }}>
                      {sm.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
