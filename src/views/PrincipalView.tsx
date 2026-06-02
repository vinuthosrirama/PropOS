/**
 * PrincipalView
 * Office-level dashboard — shows all agents' pipeline, outreach, and GCI.
 * Only visible to users with role = "principal".
 */
import { useState, useEffect } from "react"
import { C, FONT, type AgentProfile, type AgencyTheme } from "../data"
import { apiUrl } from "../lib/api"
import { authFetch } from "../lib/authFetch"

interface AgentRollup {
  agentId:       number
  agentName:     string
  agentEmail:    string
  outreachSent:  number
  replied:       number
  appraisals:    number
  listings:      number
  gci:           number
}

interface OfficeData {
  agents:       AgentRollup[]
  totalSent:    number
  totalAppraisals: number
  totalListings: number
  totalGCI:     number
}

// ── Demo data shown while loading ─────────────────────────────────────────────
const DEMO_OFFICE: OfficeData = {
  agents: [
    { agentId: 1, agentName: "Cameron Knoll",      agentEmail: "cameronk@peakere.com.au",   outreachSent: 47, replied: 9,  appraisals: 3, listings: 1, gci: 17000 },
    { agentId: 2, agentName: "Pas Sunilchandra",   agentEmail: "pass@areaspecialist.com.au", outreachSent: 31, replied: 5,  appraisals: 2, listings: 1, gci: 17000 },
    { agentId: 3, agentName: "Manpreet Singh",     agentEmail: "msingh@agency.com.au",       outreachSent: 22, replied: 3,  appraisals: 1, listings: 0, gci: 0 },
  ],
  totalSent: 100, totalAppraisals: 6, totalListings: 2, totalGCI: 34000,
}

function fmtDollar(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrincipalView({ agent, theme }: { agent: AgentProfile; theme: AgencyTheme }) {
  const [data, setData] = useState<OfficeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch(apiUrl("/api/analytics/office"))
      .then(r => r.ok ? r.json() as Promise<OfficeData> : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const d = data ?? DEMO_OFFICE
  const roiMultiple = d.totalGCI > 0 ? Math.round(d.totalGCI / (399 * d.agents.length) * 10) / 10 : 0

  const officeRollup = [
    { label: "Outreach Sent",  value: d.totalSent,        color: "#4fa3e0" },
    { label: "Appraisals",     value: d.totalAppraisals,  color: "#f59e0b" },
    { label: "Listings Won",   value: d.totalListings,    color: "#64d090" },
    { label: "Total GCI",      value: fmtDollar(d.totalGCI), color: theme.primary },
    { label: "ROI Multiple",   value: roiMultiple > 0 ? `${roiMultiple}×` : "–", color: theme.primary },
  ]

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "96px 24px 48px", fontFamily: FONT }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.primary, textTransform: "uppercase", marginBottom: 8 }}>
          Office Dashboard
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: -0.5, marginBottom: 4 }}>
          {agent.agency}
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>
          {d.agents.length} agent{d.agents.length !== 1 ? "s" : ""} · {loading ? "Loading live data…" : data ? "Live data" : "Demo data"}
        </div>
      </div>

      {/* Office summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
        {officeRollup.map(({ label, value, color }) => (
          <div key={label} style={{
            background: C.bg2, borderRadius: 14, padding: "16px 18px",
            border: `1px solid ${color}22`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per-agent table */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 14 }}>
        Agent Breakdown
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {d.agents.map(a => {
          const replyRate = a.outreachSent > 0 ? Math.round((a.replied / a.outreachSent) * 100) : 0
          return (
            <div key={a.agentId} style={{
              background: C.bg2, borderRadius: 14, padding: "16px 20px",
              border: `1px solid ${C.border}`,
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 80px 80px 100px",
              alignItems: "center",
              gap: 12,
            }}>
              {/* Agent name */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{a.agentName}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{a.agentEmail}</div>
              </div>
              {/* Outreach sent */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#4fa3e0" }}>{a.outreachSent}</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase" }}>Sent</div>
              </div>
              {/* Reply rate */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: a.replied > 0 ? C.green : C.faint }}>{replyRate}%</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase" }}>Replies</div>
              </div>
              {/* Appraisals */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>{a.appraisals}</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase" }}>Appraisals</div>
              </div>
              {/* Listings */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{a.listings}</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase" }}>Listings</div>
              </div>
              {/* GCI */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.primary }}>{a.gci > 0 ? fmtDollar(a.gci) : "—"}</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: "uppercase" }}>GCI</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* PropOS ROI summary */}
      {d.totalGCI > 0 && (
        <div style={{
          marginTop: 24, padding: "20px 24px", borderRadius: 16,
          background: `linear-gradient(135deg, ${theme.gradient[0]}10, ${theme.gradient[1]}08)`,
          border: `1px solid ${theme.primary}30`,
        }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
            PropOS has generated <strong style={{ color: C.green }}>{fmtDollar(d.totalGCI)}</strong> in estimated GCI this period
            across {d.agents.length} agents at <strong style={{ color: theme.primary }}>{fmtDollar(399 * d.agents.length)}/month</strong>.
          </div>
          {roiMultiple > 0 && (
            <div style={{ fontSize: 22, fontWeight: 900, color: theme.primary, marginTop: 4 }}>
              {roiMultiple}× ROI
            </div>
          )}
        </div>
      )}
    </div>
  )
}
