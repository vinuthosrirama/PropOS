import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FONT, DEFAULT_THEME, type AgentProfile, type AgencyTheme, type ViewId, type DemoMode } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"

// Get product display name based on mode
function productLabel(mode: DemoMode | null): string {
  if (mode === "buyer") return "BuyerOS"
  if (mode === "vendor") return "VendorOS"
  return "PropOS"
}

export const VIEWS: { id: ViewId; label: string; short: string; principalOnly?: boolean }[] = [
  { id: "demo",       label: "Launchpad", short: "Launchpad" },
  { id: "campaign",   label: "Email",     short: "Email" },
  { id: "voiceagent", label: "Campaign",  short: "Campaign" },
  { id: "insights",   label: "Insights",  short: "Insights" },
  { id: "setup",      label: "Settings",  short: "Settings" },
  { id: "principal",  label: "Office",    short: "Office", principalOnly: true },
]

export default function Nav({
  view, setView, agent, sheetStatus = "idle", theme = DEFAULT_THEME, onLogout, onBack, onInbox, inboxBadge = 0, mode, onSwitchMode, lightMode = false, onToggleLightMode, productMode, showCaptureLead = false,
}: {
  view: ViewId
  setView: (v: ViewId) => void
  agent: AgentProfile
  sheetStatus?: "idle" | "loading" | "live" | "error"
  theme?: AgencyTheme
  onLogout?: () => void
  onBack?: () => void
  onInbox?: () => void
  inboxBadge?: number
  mode?: DemoMode
  onSwitchMode?: (m: DemoMode) => void
  lightMode?: boolean
  onToggleLightMode?: () => void
  productMode?: DemoMode | null
  showCaptureLead?: boolean
}) {
  const bp = useBreakpoint()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", h)
    return () => window.removeEventListener("scroll", h)
  }, [])

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  const currentIdx = VIEWS.findIndex(v => v.id === view)

  const navigate = (v: ViewId) => {
    setView(v)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const sheetChip = sheetStatus === "live" ? (
    <div style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(182,194,171,0.12)", border: "1px solid rgba(182,194,171,0.25)", fontSize: 10, fontWeight: 600, color: "#b6c2ab", whiteSpace: "nowrap", flexShrink: 0 }}>
      ● Sheet live
    </div>
  ) : sheetStatus === "loading" ? (
    <div style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap", flexShrink: 0 }}>
      ○ Connecting...
    </div>
  ) : null

  // Wordmark text — pick the cleanest from theme.name → agent.agencyShort → "Peake" fallback
  const rawWordmark = theme.name && theme.name !== "Other" ? theme.name : (agent.agencyShort ?? "Peake")
  // Strip leading articles + truncate long agency names to keep the bar tidy
  // e.g. "The 5th Avenue Real Estate" → "5th Avenue"
  const wordmarkClean = rawWordmark.replace(/^(The|A)\s+/i, "")
  const wordmarkShort = wordmarkClean.length > 14 ? wordmarkClean.split(/\s+/).slice(0, 2).join(" ") : wordmarkClean

  const logoBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <span style={{
        fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 0.5,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        lineHeight: 1,
      }}>{wordmarkShort}</span>
      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,.2)", flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "rgba(255,255,255,.5)", whiteSpace: "nowrap" as const }}>
        {productLabel(productMode ?? mode ?? null)}
      </span>
    </div>
  )

  // Derive nav bg from theme.gradient[1] (the darker stop) with high alpha for translucency
  const navBgHex = theme.gradient?.[1] ?? theme.primary
  const navBg     = `${navBgHex}f2`  // ~0.95 alpha when hex
  const navBgSolid = `${navBgHex}fa` // ~0.98 alpha when scrolled
  const navBorder = `${theme.accent ?? theme.primary}33`  // 20% alpha accent border

  // ── Mobile nav ──────────────────────────────────────────────────────────────
  if (bp === "mobile") {
    return (
      <>
        {/* Backdrop — closes menu on outside click */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
          />
        )}
        <nav ref={navRef} style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          height: 52, padding: "0 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: navBgSolid, backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${navBorder}`,
        }}>
          {logoBlock}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sheetChip}
            <div style={{
              fontSize: 11, color: "#b6c2ab", fontWeight: 600,
              background: "rgba(255,255,255,.12)", padding: "3px 8px", borderRadius: 12,
            }}>
              {VIEWS.find(v => v.id === view)?.short}
            </div>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                width: 36, height: 36, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0,
              }}
            >
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={menuOpen ? {
                    rotate: i === 0 ? 45 : i === 2 ? -45 : 0,
                    y: i === 0 ? 7 : i === 2 ? -7 : 0,
                    opacity: i === 1 ? 0 : 1,
                  } : { rotate: 0, y: 0, opacity: 1 }}
                  style={{ width: 22, height: 2, background: "rgba(255,255,255,.8)", borderRadius: 2 }} />
              ))}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              style={{
                position: "fixed", top: 52, left: 0, right: 0, zIndex: 99,
                background: "rgba(20,7,46,0.98)", backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(182,194,171,0.14)",
                padding: "12px 0", maxHeight: "80vh", overflowY: "auto",
              }}>
              {VIEWS.filter(v => !v.principalOnly || agent.role === "principal").map((v, i) => (
                <button key={v.id} onClick={() => navigate(v.id)}
                  aria-current={v.id === view ? "page" : undefined}
                  style={{
                    width: "100%", padding: "14px 20px",
                    display: "flex", alignItems: "center", gap: 14,
                    background: view === v.id ? "rgba(255,255,255,.08)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: FONT,
                    borderLeft: `3px solid ${view === v.id ? "#b6c2ab" : "transparent"}`,
                    transition: "background 0.15s, border-color 0.15s",
                  }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: view === v.id ? 700 : 400, color: view === v.id ? "#fff" : "rgba(255,255,255,.55)" }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>Step {i + 1}</div>
                  </div>
                  {i < currentIdx && <span style={{ marginLeft: "auto", color: "#b6c2ab", fontSize: 12 }}>✓</span>}
                </button>
              ))}
              {view === "demo" && mode === "buyer" && showCaptureLead && (
                <button onClick={() => { window.dispatchEvent(new CustomEvent("propos:captureLead")); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: "rgba(182,194,171,.1)", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid #b6c2ab",
                  borderTop: "1px solid rgba(182,194,171,.12)", marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#b6c2ab" }}>+ Capture Lead</div>
                </button>
              )}
              {onSwitchMode && mode && (
                <button onClick={() => { onSwitchMode(mode === "buyer" ? "vendor" : "buyer"); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: "rgba(255,255,255,.04)", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid rgba(255,255,255,.2)",
                  borderTop: "1px solid rgba(182,194,171,.12)", marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>
                    {mode === "buyer" ? "Switch to VendorOS" : "Switch to BuyerOS"}
                  </div>
                </button>
              )}
              {onBack && (
                <button onClick={() => { onBack(); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid rgba(255,255,255,.2)",
                  borderTop: "1px solid rgba(182,194,171,.12)", marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>← Portfolio</div>
                </button>
              )}
              {onToggleLightMode && (
                <button onClick={() => { onToggleLightMode(); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 10,
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid transparent",
                  borderTop: "1px solid rgba(182,194,171,.12)", marginTop: 4,
                }}>
                  <span style={{ fontSize: 16 }}>{lightMode ? "🌙" : "☀️"}</span>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>
                    {lightMode ? "Switch to dark mode" : "Switch to light mode"}
                  </div>
                </button>
              )}
              {onLogout && (
                <button onClick={onLogout} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid transparent",
                  borderTop: "1px solid rgba(182,194,171,.12)", marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)" }}>Switch Profile</div>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  // ── Tablet + Desktop nav ────────────────────────────────────────────────────
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: 56, padding: "0 20px",
      display: "flex", alignItems: "center", gap: 0,
      background: scrolled ? navBgSolid : navBg,
      backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${navBorder}`,
    }}>
      <div style={{ marginRight: 20, flexShrink: 0 }}>{logoBlock}</div>

      {onBack && (
        <button onClick={onBack} style={{
          marginRight: 10, flexShrink: 0,
          padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,.15)",
          background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)",
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          whiteSpace: "nowrap",
        }}>
          ← Portfolio
        </button>
      )}

      <div style={{
        display: "flex", gap: 2, overflowX: "auto", flex: 1,
        scrollbarWidth: "none", msOverflowStyle: "none",
      }}>
        {/* Nav items: Demo, Settings, Inbox (+ Office for principals) */}
        {VIEWS.filter(v => !v.principalOnly || agent.role === "principal").map((v, i) => {
          const active = v.id === view
          const past = i < currentIdx
          return (
            <button key={v.id} onClick={() => navigate(v.id)}
              aria-current={active ? "page" : undefined}
              style={{
                padding: bp === "tablet" ? "4px 8px" : "5px 12px",
                borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: bp === "tablet" ? 10 : 11,
                fontWeight: active ? 700 : 400,
                whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT,
                background: active ? "rgba(255,255,255,.16)" : "transparent",
                color: active ? "#fff" : past ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.38)",
                transition: "all 0.15s",
              }}>
              {bp === "tablet" ? v.short : v.label}
            </button>
          )
        })}

        {/* Capture Lead — only visible on Launchpad in buyer mode when enabled in Settings */}
        {view === "demo" && mode === "buyer" && showCaptureLead && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("propos:captureLead"))}
            style={{
              padding: bp === "tablet" ? "4px 8px" : "5px 12px",
              borderRadius: 7,
              border: "1px solid rgba(182,194,171,.3)",
              background: "rgba(182,194,171,.1)",
              color: "#b6c2ab",
              fontSize: bp === "tablet" ? 10 : 11,
              fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            + Capture Lead
          </button>
        )}

        {/* Mode toggle — BuyerOS / VendorOS */}
        {onSwitchMode && mode && (
          <button onClick={() => onSwitchMode(mode === "buyer" ? "vendor" : "buyer")} style={{
            padding: bp === "tablet" ? "4px 8px" : "5px 12px",
            borderRadius: 7, border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.08)",
            color: "rgba(255,255,255,.7)",
            fontSize: bp === "tablet" ? 10 : 11,
            fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT, cursor: "pointer",
            transition: "all 0.2s",
          }}>
            {mode === "buyer" ? "BuyerOS ⇄" : "VendorOS ⇄"}
          </button>
        )}

        {/* AI status pill */}
        {view === "demo" && bp === "desktop" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 20,
            background: "rgba(182,194,171,.08)", border: "1px solid rgba(182,194,171,.2)",
            flexShrink: 0,
          }}>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#b6c2ab", flexShrink: 0 }}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#b6c2ab", whiteSpace: "nowrap" }}>AI Replies: Active</span>
          </div>
        )}

        {/* Inbox */}
        {onInbox && (
          <button onClick={onInbox} style={{
            position: "relative",
            padding: bp === "tablet" ? "4px 8px" : "5px 12px",
            borderRadius: 7, border: "none", cursor: "pointer",
            fontSize: bp === "tablet" ? 10 : 11, fontWeight: 400,
            whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT,
            background: "transparent", color: "rgba(255,255,255,.38)",
            transition: "all 0.15s",
          }}>
            Inbox
            {inboxBadge > 0 && (
              <span style={{
                position: "absolute", top: 0, right: 0,
                background: "#f59e0b", color: "#fff",
                borderRadius: "50%", width: 14, height: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 800,
              }}>{inboxBadge}</span>
            )}
          </button>
        )}
      </div>

      {sheetChip && <div style={{ marginLeft: 12 }}>{sheetChip}</div>}

      {/* Agent name chip */}
      {bp === "desktop" && (
        <div style={{
          marginLeft: 12, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 7,
          padding: "4px 10px", borderRadius: 20,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.06)",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#b6c2ab" }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>
            {agent.name.split(" ")[0]} · {agent.agency}
          </span>
        </div>
      )}

      {/* Light / dark toggle */}
      {onToggleLightMode && (
        <button
          onClick={onToggleLightMode}
          title={lightMode ? "Switch to dark mode" : "Switch to light mode"}
          style={{
            marginLeft: 8, flexShrink: 0,
            padding: "4px 8px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.5)",
            fontSize: 14, cursor: "pointer", lineHeight: 1,
            transition: "color 0.15s",
          }}
          aria-label={lightMode ? "Switch to dark mode" : "Switch to light mode"}
        >
          {lightMode ? "🌙" : "☀️"}
        </button>
      )}

      {onLogout && (
        <button onClick={onLogout} title="Switch profile"
          style={{
            marginLeft: 8, flexShrink: 0,
            padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.45)",
            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            transition: "color 0.15s", whiteSpace: "nowrap",
          }}
        >
          Switch Profile
        </button>
      )}
    </nav>
  )
}
