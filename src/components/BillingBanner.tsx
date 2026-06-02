/**
 * BillingBanner
 * Shown at the top of the app when the agent is in a trial or has a billing issue.
 * Hidden when subscription is active.
 */
import { useEffect, useState } from "react"
import { authFetch } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

interface BillingStatus {
  status:      string
  trialEndsAt: string
  daysLeft:    number
  isActive:    boolean
}

const C = {
  amber: "#f59e0b",
  red:   "#f87171",
  text:  "#d8e7f2",
  bg:    "rgba(245,158,11,0.08)",
  border:"rgba(245,158,11,0.2)",
}

export default function BillingBanner() {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    authFetch(apiUrl("/api/billing/status"))
      .then(r => r.ok ? r.json() : null)
      .then((d: BillingStatus | null) => { setBilling(d); setChecking(false) })
      .catch(() => setChecking(false))
  }, [])

  if (checking || !billing) return null
  if (billing.isActive && billing.status === "active") return null  // paid and active — hide

  const expired  = billing.daysLeft <= 0
  const color    = expired ? C.red : C.amber
  const bgColor  = expired ? "rgba(248,113,113,0.08)" : C.bg
  const border   = expired ? "rgba(248,113,113,0.2)" : C.border

  const handleUpgrade = async () => {
    const res = await authFetch(apiUrl("/api/billing/checkout"), { method: "POST" })
    if (res.ok) {
      const { url } = await res.json() as { url: string }
      if (url) window.open(url, "_blank")
    }
  }

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: "8px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      margin: "0 16px 0",
      fontSize: 13,
    }}>
      <span style={{ color }}>
        {expired
          ? "⚠️ Your free trial has ended — upgrade to continue using PropOS"
          : `⏳ ${billing.daysLeft} day${billing.daysLeft !== 1 ? "s" : ""} left in your free trial`}
      </span>
      <button
        onClick={handleUpgrade}
        style={{
          background: color,
          color: "#04070d",
          border: "none",
          borderRadius: 8,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Upgrade → $399/mo
      </button>
    </div>
  )
}
