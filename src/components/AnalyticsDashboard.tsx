import { useState, useEffect } from "react"
import { C, FONT } from "../data"

interface AnalyticsSummary {
  totalAuctions: number
  totalOutreachSent: number
  avgBiddersWhenPropOSUsed: number
  avgHammerVsGuidePct: number
  estimatedExtraGCI: number
  funnelTotals: {
    contacted: number
    emailOpened: number
    replied: number
    registeredToBid: number
    bidPlaced: number
  }
  bySuburb: Record<string, { auctions: number; avgBidders: number; avgHammerVsGuide: number }>
}

const kpiCard = (label: string, value: string, sub: string, color: string): React.ReactElement => (
  <div style={{
    background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
    <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
  </div>
)

interface FunnelStep { label: string; count: number; color: string }

function FunnelBar({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map(s => s.count), 1)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map(step => (
        <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 140, fontSize: 12, color: C.muted, textAlign: "right" }}>{step.label}</div>
          <div style={{ flex: 1, background: C.bg3, borderRadius: 4, height: 20, overflow: "hidden" }}>
            <div style={{
              width: `${(step.count / max) * 100}%`, height: "100%",
              background: step.color, borderRadius: 4, minWidth: step.count > 0 ? 4 : 0,
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ width: 40, fontSize: 13, fontWeight: 700, color: C.text }}>{step.count}</div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsDashboard() {
  const [data, setData]       = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch("/api/analytics")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: AnalyticsSummary) => { setData(d); setLoading(false) })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Could not load analytics (${msg.includes("HTTP") ? "server error" : "server offline?"})`)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: FONT }}>
        Loading analytics...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, color: C.muted, fontFamily: FONT, fontSize: 14 }}>
        {error || "No analytics data yet. Record your first auction outcome to get started."}
      </div>
    )
  }

  const funnelSteps: FunnelStep[] = [
    { label: "Contacted",          count: data.funnelTotals.contacted,       color: "var(--accent, rgb(166,218,255))" },
    { label: "Email opened",       count: data.funnelTotals.emailOpened,     color: C.blue },
    { label: "Replied",            count: data.funnelTotals.replied,          color: C.purple },
    { label: "Registered to bid",  count: data.funnelTotals.registeredToBid, color: C.orange },
    { label: "Bid placed",         count: data.funnelTotals.bidPlaced,        color: C.green },
  ]

  const suburbRows = Object.entries(data.bySuburb).sort((a, b) => b[1].auctions - a[1].auctions)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {kpiCard("Auctions tracked",    String(data.totalAuctions),           "with PropOS outreach",              C.text)}
        {kpiCard("Outreach sent",       String(data.totalOutreachSent),       "total messages approved",           "var(--accent, rgb(166,218,255))")}
        {kpiCard("Avg registered bidders", String(data.avgBiddersWhenPropOSUsed), "per auction (industry avg: 2.8)", C.green)}
        {kpiCard("Avg above guide",     `+${data.avgHammerVsGuidePct}%`,     "hammer price vs guide",             C.orange)}
        {kpiCard("Extra GCI generated", `$${data.estimatedExtraGCI.toLocaleString()}`, "estimated across all auctions", C.purple)}
      </div>

      {/* Funnel */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 20 }}>
          Lead → Bidder Funnel
        </div>
        {data.funnelTotals.contacted === 0 ? (
          <div style={{ fontSize: 13, color: C.muted }}>No outreach data yet. Approve your first message to start the funnel.</div>
        ) : (
          <FunnelBar steps={funnelSteps} />
        )}
      </div>

      {/* By suburb */}
      {suburbRows.length > 0 && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>
            Performance by Suburb
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Suburb", "Auctions", "Avg Bidders", "Avg vs Guide"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suburbRows.map(([suburb, stats]) => (
                <tr key={suburb} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 12px", color: C.text }}>{suburb}</td>
                  <td style={{ padding: "10px 12px", color: C.text }}>{stats.auctions}</td>
                  <td style={{ padding: "10px 12px", color: C.green }}>{stats.avgBidders.toFixed(1)}</td>
                  <td style={{ padding: "10px 12px", color: stats.avgHammerVsGuide >= 0 ? C.green : C.red }}>
                    {stats.avgHammerVsGuide >= 0 ? "+" : ""}{stats.avgHammerVsGuide.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
