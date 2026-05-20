/**
 * VendorPitchSlide — Peake-branded one-pager for vendor listing pitches.
 *
 * Shows the agent's PropOS-powered auction stats in a printable format
 * that Cameron can use in his next listing presentation.
 */

import { motion } from "framer-motion"
import { FONT, type AgentProfile, type AgencyTheme } from "../data"

interface AnalyticsData {
  totalAuctions: number
  avgBiddersWhenPropOSUsed: number
  avgHammerVsGuidePct: number
  estimatedExtraGCI: number
}

interface Props {
  data:    AnalyticsData
  agent:   AgentProfile
  theme:   AgencyTheme
  onClose: () => void
}

export default function VendorPitchSlide({ data, agent, theme, onClose }: Props) {
  const kpis = [
    {
      value: data.avgBiddersWhenPropOSUsed.toFixed(1),
      label: "avg registered bidders per auction",
      sub:   "(industry avg: 2.8)",
    },
    {
      value: `+${data.avgHammerVsGuidePct}%`,
      label: "above guide price",
      sub:   "hammer vs reserve",
    },
    {
      value: `$${data.estimatedExtraGCI.toLocaleString()}`,
      label: "estimated extra GCI earned",
      sub:   `last ${data.totalAuctions} auctions`,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(10,0,20,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720,
          background: "white", borderRadius: 16, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          fontFamily: FONT, color: "#1a1a1a",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {/* Header bar */}
        <div style={{
          background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
          padding: "24px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "white",
            }}>
              {theme.logo}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{agent.agency}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{agent.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer",
              color: "white", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "32px 36px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: -0.5, marginBottom: 8 }}>
            How I bring more bidders to your auction
          </div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 28 }}>
            My AddVantage AI system personally contacts every relevant buyer in my database,
            not a generic email blast, but a hand-crafted message that references exactly what
            they said at the open home.
          </div>

          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {kpis.map(kpi => (
              <div key={kpi.label} style={{
                background: "#f8f6fc", borderRadius: 12, padding: "20px 16px",
                textAlign: "center", border: `1px solid ${theme.primary}18`,
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: theme.primary, letterSpacing: -1 }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#333", marginTop: 6 }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Vendor quote */}
          <div style={{
            background: "#fafafa", borderRadius: 12, padding: "20px 24px",
            borderLeft: `4px solid ${theme.primary}`,
            marginBottom: 28,
          }}>
            <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6, fontStyle: "italic", marginBottom: 8 }}>
              "{agent.name.split(" ")[0]}'s system brought 3 extra registered bidders to our auction.
              We sold $42,000 above reserve."
            </div>
            <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
              J. Miller, vendor
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: "1px solid #eee", paddingTop: 20,
          }}>
            <button
              onClick={() => window.print()}
              style={{
                padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
                color: "white", fontSize: 13, fontWeight: 700, fontFamily: FONT,
              }}
            >
              Print / Save PDF
            </button>
            <div style={{ fontSize: 12, color: "#888" }}>
              {agent.name} · {agent.agency}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
