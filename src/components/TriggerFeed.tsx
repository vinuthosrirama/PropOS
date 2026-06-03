/**
 * TriggerFeed — Market Trigger Engine UI
 *
 * Displays portfolio-level market triggers above the contact list.
 * Each card shows an event, why it matters, and which contacts it affects.
 */

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, type AgencyTheme } from "../data"
import { computeTriggers, type Trigger, type TriggerType } from "../lib/triggerEngine"
import type { PastBuyer } from "../data/pastBuyers"
import { CURRENT_VALUE_ESTIMATES } from "../data/pastBuyers"

// ── Props ─────────────────────────────────────────────────────────────────────

interface TriggerFeedProps {
  buyers: PastBuyer[]
  theme: AgencyTheme
  onSelectContact: (buyerId: number) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityColor(p: Trigger["priority"]): string {
  if (p === "urgent") return C.red ?? "#ef4444"
  if (p === "high")   return C.orange
  return C.blue
}

function priorityBg(p: Trigger["priority"]): string {
  if (p === "urgent") return "rgba(255,110,110,0.08)"
  if (p === "high")   return "rgba(255,184,100,0.08)"
  return "rgba(166,218,255,0.08)"
}

function priorityBorder(p: Trigger["priority"]): string {
  if (p === "urgent") return "rgba(255,110,110,0.25)"
  if (p === "high")   return "rgba(255,184,100,0.22)"
  return "rgba(166,218,255,0.18)"
}

const TYPE_FILTERS: { type: TriggerType | "all"; label: string }[] = [
  { type: "all",              label: "All" },
  { type: "comparable_sale",  label: "Comp sales" },
  { type: "tenant_vacancy",   label: "Tenancies" },
  { type: "life_event",       label: "Life events" },
  { type: "cgt_window",       label: "CGT" },
  { type: "rate_change",      label: "Rates" },
  { type: "dom_spike",        label: "Stale listings" },
  { type: "equity_milestone", label: "Equity" },
]

// ── Urgency Pulse Dot ─────────────────────────────────────────────────────────

function UrgencyDot({ priority }: { priority: Trigger["priority"] }) {
  const color = priorityColor(priority)
  return (
    <div style={{ position: "relative", width: 10, height: 10, flexShrink: 0 }}>
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        background: color,
        position: "absolute", inset: 0,
      }} />
      {priority === "urgent" && (
        <motion.div
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: 10, height: 10, borderRadius: "50%",
            background: color,
            position: "absolute", inset: 0,
          }}
        />
      )}
    </div>
  )
}

// ── Single Trigger Card ───────────────────────────────────────────────────────

function TriggerCard({
  trigger,
  onSelectContact,
}: {
  trigger: Trigger
  theme: AgencyTheme
  onSelectContact: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const MAX_PREVIEW = 3

  const shownContacts = expanded
    ? trigger.affectedContacts
    : trigger.affectedContacts.slice(0, MAX_PREVIEW)
  const remaining = trigger.affectedContacts.length - MAX_PREVIEW

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        borderRadius: 14,
        border: `1px solid ${priorityBorder(trigger.priority)}`,
        background: priorityBg(trigger.priority),
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      {/* Card header */}
      <div style={{ padding: "14px 16px 10px" }}>
        {/* Top row: priority dot + label + expiry */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <UrgencyDot priority={trigger.priority} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase",
            color: priorityColor(trigger.priority), fontFamily: FONT,
          }}>
            {trigger.priority === "urgent" ? "🔴 Urgent" : trigger.priority === "high" ? "🟡 High" : "🔵 Medium"}
          </span>
          <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>
            Expires in {trigger.expiresIn}
          </span>
        </div>

        {/* Title row: icon + title + data badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>{trigger.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35, marginBottom: 2, fontFamily: FONT }}>
              {trigger.title}
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: FONT }}>
              {trigger.subtitle}
            </div>
          </div>
          {/* Data badge */}
          <div style={{
            flexShrink: 0, padding: "4px 10px", borderRadius: 8,
            background: C.bg3, border: `1px solid ${C.border}`,
            fontSize: 13, fontWeight: 800, color: priorityColor(trigger.priority),
            fontFamily: FONT, whiteSpace: "nowrap",
          }}>
            {trigger.dataPoint}
          </div>
        </div>

        {/* Insight */}
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: "rgba(213,219,230,0.04)", border: `1px solid ${C.border}`,
          fontSize: 11, color: C.muted, lineHeight: 1.6, fontFamily: FONT,
        }}>
          {trigger.insight}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: `${priorityBorder(trigger.priority)}`, margin: "0 16px" }} />

      {/* Affected contacts */}
      <div style={{ padding: "10px 16px 12px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, fontFamily: FONT }}>
          {trigger.affectedContacts.length} affected contact{trigger.affectedContacts.length !== 1 ? "s" : ""}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shownContacts.map(contact => (
            <button
              key={contact.id}
              onClick={() => onSelectContact(contact.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                background: "rgba(213,219,230,0.04)",
                border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "8px 10px",
                cursor: "pointer", textAlign: "left", width: "100%",
                fontFamily: FONT,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${priorityColor(trigger.priority)}55`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              {/* Avatar initials */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: `${priorityColor(trigger.priority)}20`,
                border: `1px solid ${priorityColor(trigger.priority)}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: priorityColor(trigger.priority),
              }}>
                {contact.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>
                  {contact.name}
                  <span style={{ fontSize: 10, fontWeight: 500, color: C.faint, marginLeft: 6 }}>
                    {contact.address}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  {contact.reason}
                </div>
              </div>
              <div style={{ fontSize: 11, color: priorityColor(trigger.priority), flexShrink: 0, marginTop: 1 }}>→</div>
            </button>
          ))}
        </div>

        {/* Show more / less */}
        {remaining > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              marginTop: 6, width: "100%", padding: "7px",
              borderRadius: 8, border: `1px solid ${C.border}`,
              background: "transparent", cursor: "pointer",
              fontSize: 11, color: C.muted, fontFamily: FONT,
            }}
          >
            +{remaining} more contact{remaining !== 1 ? "s" : ""}
          </button>
        )}
        {expanded && trigger.affectedContacts.length > MAX_PREVIEW && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              marginTop: 6, width: "100%", padding: "7px",
              borderRadius: 8, border: `1px solid ${C.border}`,
              background: "transparent", cursor: "pointer",
              fontSize: 11, color: C.faint, fontFamily: FONT,
            }}
          >
            Show less ↑
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TriggerFeed({ buyers, theme, onSelectContact }: TriggerFeedProps) {
  const triggers = computeTriggers(buyers, CURRENT_VALUE_ESTIMATES)
  const [collapsed, setCollapsed] = useState(false)
  const [filterType, setFilterType] = useState<TriggerType | "all">("all")

  if (triggers.length === 0) return null

  const urgentCount = triggers.filter(t => t.priority === "urgent").length
  const highCount   = triggers.filter(t => t.priority === "high").length
  const filtered    = filterType === "all" ? triggers : triggers.filter(t => t.type === filterType)

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "transparent", border: "none", cursor: "pointer",
          padding: "0 0 12px 0", width: "100%", textAlign: "left",
          fontFamily: FONT,
        }}
      >
        {/* Live pulse indicator */}
        <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: urgentCount > 0 ? C.red : C.green, position: "absolute" }} />
          <motion.div
            animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 8, height: 8, borderRadius: "50%", background: urgentCount > 0 ? C.red : C.green, position: "absolute" }}
          />
        </div>

        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Market Triggers
        </span>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 6 }}>
          {urgentCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: "rgba(255,110,110,0.12)", border: "1px solid rgba(255,110,110,0.25)",
              color: C.red,
            }}>
              {urgentCount} urgent
            </span>
          )}
          {highCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: "rgba(255,184,100,0.12)", border: "1px solid rgba(255,184,100,0.22)",
              color: C.orange,
            }}>
              {highCount} high
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            background: C.bg3, border: `1px solid ${C.border}`,
            color: C.faint,
          }}>
            {triggers.length} total
          </span>
        </div>

        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>
          {collapsed ? "Show ↓" : "Hide ↑"}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            key="trigger-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            {/* Filter chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {TYPE_FILTERS.filter(f => f.type === "all" || triggers.some(t => t.type === f.type)).map(f => {
                const active = filterType === f.type
                return (
                  <button
                    key={f.type}
                    onClick={() => setFilterType(f.type)}
                    style={{
                      padding: "4px 12px", borderRadius: 20,
                      border: `1px solid ${active ? theme.primary : C.border}`,
                      background: active ? `${theme.primary}20` : "transparent",
                      color: active ? theme.primary : C.muted,
                      fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            {/* Trigger cards */}
            {filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint, padding: "12px 0" }}>No triggers in this category.</div>
            ) : (
              filtered.map(trigger => (
                <TriggerCard
                  key={trigger.id}
                  trigger={trigger}
                  theme={theme}
                  onSelectContact={onSelectContact}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
