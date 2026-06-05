/**
 * OutreachQueue
 * Batch outreach review panel: approve / edit / skip contacts before sending.
 * Shown after "Generate for All" in the vendor dashboard.
 */
import { useState } from "react"
import { motion } from "framer-motion"
import { useBreakpoint } from "../hooks/useBreakpoint"

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:     "#04070d",
  bg2:    "#0a0f1a",
  bg3:    "#0e1525",
  border: "rgba(166,218,255,0.10)",
  text:   "#d8e7f2",
  muted:  "#7a91a8",
  faint:  "#3f5166",
  green:  "#64d090",
  amber:  "#f59e0b",
  red:    "#f87171",
  primary:"#4fa3e0",
}
const FONT = "'Inter', system-ui, sans-serif"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueueItem {
  id:            number
  name:          string
  pipeline:      string
  pipelineLabel: string
  suburb:        string
  sms:           string
  subject:       string
  emailBody:     string
  phone?:        string
  email?:        string
  purchaseAddress: string
  approved:      boolean
}

interface Props {
  items:           QueueItem[]
  agentName:       string
  sending:         boolean
  onSend:          (approved: QueueItem[]) => void
  onBack:          () => void
  theme:           { primary: string; gradient: [string, string] }
}

// ── Pipeline colours ──────────────────────────────────────────────────────────
const PIPELINE_COLOR: Record<string, string> = {
  "cgt-deadline":          "#f87171",
  "investor-to-seller":    "#f59e0b",
  "owner-to-seller":       "#64d090",
  "owner-to-upsizer":      "#4fa3e0",
  "owner-to-downsizer":    "#a78bfa",
  "investor-to-rebalance": "#f472b6",
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OutreachQueue({ items: initial, agentName: _agentName, sending, onSend, onBack, theme }: Props) {
  const bp = useBreakpoint()
  const [items, setItems] = useState<QueueItem[]>(initial)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const toggle = (id: number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, approved: !i.approved } : i))

  const toggleAll = () => {
    const allApproved = items.every(i => i.approved)
    setItems(prev => prev.map(i => ({ ...i, approved: !allApproved })))
  }

  const approved      = items.filter(i => i.approved)
  const approvedCount = approved.length

  const isMobile = bp === "mobile"

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: "none", border: `1px solid ${C.border}`,
          color: C.muted, borderRadius: 8, padding: "8px 14px",
          fontSize: 13, cursor: "pointer", fontFamily: FONT,
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>
            Outreach Queue
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {items.length} contacts generated · {approvedCount} approved
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={toggleAll} style={{
            background: "none", border: `1px solid ${C.border}`,
            color: C.muted, borderRadius: 8, padding: "8px 14px",
            fontSize: 12, cursor: "pointer", fontFamily: FONT,
          }}>
            {items.every(i => i.approved) ? "Deselect All" : "Select All"}
          </button>
          <motion.button
            whileHover={{ scale: approvedCount > 0 ? 1.02 : 1 }}
            whileTap={{ scale: approvedCount > 0 ? 0.98 : 1 }}
            onClick={() => approvedCount > 0 && onSend(approved)}
            disabled={approvedCount === 0 || sending}
            style={{
              background: approvedCount > 0
                ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`
                : C.bg3,
              border: "none", borderRadius: 10, color: approvedCount > 0 ? "#fff" : C.faint,
              padding: "10px 20px", fontSize: 13, fontWeight: 700,
              cursor: approvedCount > 0 ? "pointer" : "default", fontFamily: FONT,
            }}
          >
            {sending ? "Sending…" : `Send ${approvedCount} Approved →`}
          </motion.button>
        </div>
      </div>

      {/* Queue items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => {
          const pColor  = PIPELINE_COLOR[item.pipeline] ?? C.primary
          const expanded = expandedId === item.id

          return (
            <motion.div
              key={item.id}
              layout
              style={{
                background: C.bg2,
                border: `1px solid ${item.approved ? pColor + "44" : C.border}`,
                borderRadius: 14,
                overflow: "hidden",
                opacity: item.approved ? 1 : 0.5,
                transition: "opacity .15s",
              }}
            >
              {/* Row */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: isMobile ? 10 : 14,
                padding: isMobile ? "12px 14px" : "14px 18px",
              }}>
                {/* Checkbox */}
                <div
                  onClick={() => toggle(item.id)}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${item.approved ? pColor : C.faint}`,
                    background: item.approved ? pColor + "22" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {item.approved && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke={pColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                {/* Name + pipeline */}
                <div style={{ flex: isMobile ? 1 : "0 0 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: pColor, marginTop: 2, fontWeight: 600 }}>
                    {item.pipelineLabel}
                  </div>
                </div>

                {/* SMS preview (desktop) */}
                {!isMobile && (
                  <div style={{
                    flex: 1, fontSize: 12, color: C.muted,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.sms}
                  </div>
                )}

                {/* Email subject (desktop) */}
                {!isMobile && (
                  <div style={{
                    flex: "0 0 220px", fontSize: 12, color: C.faint,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.subject}
                  </div>
                )}

                {/* Expand/collapse */}
                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  style={{
                    background: "none", border: `1px solid ${C.border}`,
                    color: C.muted, borderRadius: 6, padding: "4px 10px",
                    fontSize: 11, cursor: "pointer", flexShrink: 0, fontFamily: FONT,
                  }}
                >
                  {expanded ? "Hide" : "Preview"}
                </button>
              </div>

              {/* Expanded preview */}
              {expanded && (
                <div style={{
                  padding: isMobile ? "0 14px 14px" : "0 18px 18px",
                  borderTop: `1px solid ${C.border}`,
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 14 }}>
                      SMS (160 chars)
                    </div>
                    <div style={{
                      background: C.bg3, borderRadius: 10, padding: "12px 14px",
                      fontSize: 13, color: C.text, lineHeight: 1.6,
                    }}>
                      {item.sms}
                    </div>
                    <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                      {item.sms.length}/160 chars
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 14 }}>
                      Email
                    </div>
                    <div style={{ fontSize: 12, color: C.primary, fontWeight: 600, marginBottom: 6 }}>
                      {item.subject}
                    </div>
                    <div style={{
                      background: C.bg3, borderRadius: 10, padding: "12px 14px",
                      fontSize: 12, color: C.muted, lineHeight: 1.7,
                      maxHeight: 120, overflowY: "auto",
                    }}>
                      {item.emailBody.split("\n\n").map((p, i) => (
                        <p key={i} style={{ margin: "0 0 8px" }}>{p}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Bottom send bar */}
      {approvedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: "sticky", bottom: 20, zIndex: 10,
            background: C.bg2, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: "14px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 20, backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 14, color: C.text }}>
            <strong style={{ color: theme.primary }}>{approvedCount}</strong> contact{approvedCount !== 1 ? "s" : ""} approved ·{" "}
            <span style={{ color: C.muted }}>{items.length - approvedCount} skipped</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSend(approved)}
            disabled={sending}
            style={{
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              border: "none", borderRadius: 10, color: "#fff",
              padding: "10px 24px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT,
            }}
          >
            {sending ? "Sending…" : `Send ${approvedCount} now →`}
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}
