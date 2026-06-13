import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { C, FONT, DEFAULT_THEME, type AgentProfile, type AgencyTheme, type ViewId, type DemoMode } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { getContrastText } from "../lib/contrast"

// Get product display name based on mode
function productLabel(mode: DemoMode | null): string {
  if (mode === "buyer") return "BuyerOS"
  if (mode === "vendor") return "VendorOS"
  return "PropOS"
}

export const VIEWS: { id: ViewId; label: string; short: string; principalOnly?: boolean }[] = [
  { id: "demo",      label: "Launchpad", short: "Launchpad" },
  { id: "campaign",  label: "Campaign",  short: "Campaign" },
  { id: "voiceagent", label: "Voice Agent", short: "Voice" },
  { id: "setup",     label: "Settings",  short: "Settings" },
  { id: "principal", label: "Office",    short: "Office", principalOnly: true },
]

export default function Nav({
  view, setView, agent, sheetStatus = "idle", theme = DEFAULT_THEME, onLogout, onBack, onInbox, inboxBadge = 0, mode, onSwitchMode, lightMode = false, onToggleLightMode, productMode,
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
    <div style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(100,208,144,0.12)", border: "1px solid rgba(100,208,144,0.3)", fontSize: 10, fontWeight: 600, color: "rgb(100,208,144)", whiteSpace: "nowrap", flexShrink: 0 }}>
      ● Sheet live
    </div>
  ) : sheetStatus === "loading" ? (
    <div style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(166,218,255,0.1)", fontSize: 10, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
      ○ Connecting...
    </div>
  ) : null

  const logoBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, letterSpacing: -0.5, flexShrink: 0,
        color: getContrastText(theme.gradient[0]),
        transition: "background 0.5s",
      }}>{theme.logo}</div>
      {bp !== "mobile" && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1 }}>
            {productLabel(productMode ?? mode ?? null)}
          </div>
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.3 }}>{agent.name} · {agent.agency}</div>
        </div>
      )}
    </div>
  )

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
          background: lightMode ? "rgba(245,247,250,0.97)" : "rgba(4,7,13,0.97)", backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {logoBlock}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sheetChip}
            <div style={{
              fontSize: 11, color: lightMode ? theme.primary : "rgb(225, 205, 255)", fontWeight: 600,
              background: theme.dim, padding: "3px 8px", borderRadius: 12,
              transition: "color 0.4s, background 0.4s",
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
                  style={{ width: 22, height: 2, background: C.text, borderRadius: 2 }} />
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
                background: lightMode ? "rgba(245,247,250,0.98)" : "rgba(4,7,13,0.98)", backdropFilter: "blur(20px)",
                borderBottom: `1px solid ${C.border}`,
                padding: "12px 0", maxHeight: "80vh", overflowY: "auto",
              }}>
              {VIEWS.filter(v => !v.principalOnly || agent.role === "principal").map((v, i) => (
                <button key={v.id} onClick={() => navigate(v.id)}
                  aria-current={v.id === view ? "page" : undefined}
                  style={{
                    width: "100%", padding: "14px 20px",
                    display: "flex", alignItems: "center", gap: 14,
                    background: view === v.id ? theme.dim : "transparent",
                    border: "none", cursor: "pointer", fontFamily: FONT,
                    borderLeft: `3px solid ${view === v.id ? (lightMode ? theme.primary : "rgb(225, 205, 255)") : "transparent"}`,
                    transition: "background 0.15s, border-color 0.15s",
                  }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: view === v.id ? 700 : 400, color: view === v.id ? (lightMode ? theme.primary : "rgb(225, 205, 255)") : C.text }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 10, color: C.faint }}>Step {i + 1}</div>
                  </div>
                  {i < currentIdx && <span style={{ marginLeft: "auto", color: C.green, fontSize: 12 }}>✓</span>}
                </button>
              ))}
              {view === "demo" && mode === "buyer" && (
                <button onClick={() => { window.dispatchEvent(new CustomEvent("propos:captureLead")); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: theme.dim, border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: `3px solid ${theme.primary}`,
                  borderTop: `1px solid ${C.border}`, marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: lightMode ? theme.primary : "rgb(225,205,255)" }}>
                    + Capture Lead
                  </div>
                </button>
              )}
              {onSwitchMode && mode && (
                <button onClick={() => { onSwitchMode(mode === "buyer" ? "vendor" : "buyer"); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: mode === "vendor" ? theme.dim : "rgba(100,208,144,0.06)", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: `3px solid ${mode === "vendor" ? theme.primary : C.green}`,
                  borderTop: `1px solid ${C.border}`, marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: mode === "vendor" ? (lightMode ? theme.primary : "rgb(225,205,255)") : C.green }}>
                    {mode === "buyer" ? "Switch to Vendor mode" : "Switch to Buyer mode"}
                  </div>
                </button>
              )}
              {onBack && (
                <button onClick={() => { onBack(); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: `3px solid ${theme.primary}`,
                  borderTop: `1px solid ${C.border}`, marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>← Portfolio</div>
                </button>
              )}
              {onToggleLightMode && (
                <button onClick={() => { onToggleLightMode(); setMenuOpen(false) }} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 10,
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: FONT, borderLeft: "3px solid transparent",
                  borderTop: `1px solid ${C.border}`, marginTop: 4,
                }}>
                  <span style={{ fontSize: 16 }}>{lightMode ? "🌙" : "☀️"}</span>
                  <div style={{ fontSize: 13, color: C.muted }}>
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
                  borderTop: `1px solid ${C.border}`, marginTop: 4,
                }}>
                  <div style={{ fontSize: 13, color: C.muted }}>Switch Profile</div>
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
      background: lightMode ? (scrolled ? "rgba(245,247,250,0.97)" : "rgba(245,247,250,0.85)") : (scrolled ? "rgba(4,7,13,0.97)" : "rgba(4,7,13,0.85)"),
      backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ marginRight: 20, flexShrink: 0 }}>{logoBlock}</div>

      {onBack && (
        <button onClick={onBack} style={{
          marginRight: 10, flexShrink: 0,
          padding: "4px 10px", borderRadius: 7, border: `1px solid ${C.border}`,
          background: theme.dim, color: theme.gradient[0],
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
                padding: bp === "tablet" ? "4px 8px" : "4px 11px",
                borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: bp === "tablet" ? 10 : 11,
                fontWeight: active ? 700 : 400,
                whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT,
                background: active ? theme.dim : "transparent",
                color: active ? (lightMode ? theme.primary : "rgb(225, 205, 255)") : past ? C.muted : (lightMode ? C.faint : "rgba(200,160,255,0.45)"),
                transition: "all 0.15s",
              }}>
              {bp === "tablet" ? v.short : v.label}
            </button>
          )
        })}

        {/* Capture Lead — only visible on Launchpad in buyer mode */}
        {view === "demo" && mode === "buyer" && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("propos:captureLead"))}
            style={{
              padding: bp === "tablet" ? "4px 8px" : "4px 11px",
              borderRadius: 7,
              border: `1px solid ${theme.primary}55`,
              background: theme.dim,
              color: lightMode ? theme.primary : "rgb(225,205,255)",
              fontSize: bp === "tablet" ? 10 : 11,
              fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            + Capture Lead
          </button>
        )}

        {/* Mode toggle — Buyer / Vendor */}
        {onSwitchMode && mode && (
          <button onClick={() => onSwitchMode(mode === "buyer" ? "vendor" : "buyer")} style={{
            padding: bp === "tablet" ? "4px 8px" : "4px 11px",
            borderRadius: 7, border: `1px solid ${mode === "vendor" ? theme.primary + "55" : "rgba(100,208,144,0.3)"}`,
            background: mode === "vendor" ? theme.dim : "rgba(100,208,144,0.08)",
            color: mode === "vendor" ? (lightMode ? theme.primary : "rgb(225, 205, 255)") : C.green,
            fontSize: bp === "tablet" ? 10 : 11,
            fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT, cursor: "pointer",
            transition: "all 0.2s",
          }}>
            {mode === "buyer" ? "Buyer" : "Vendor"}
          </button>
        )}

        {/* AI Reply Agent status pill */}
        {view === "demo" && bp === "desktop" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 20,
            background: "rgba(100,208,144,0.08)", border: "1px solid rgba(100,208,144,0.2)",
            flexShrink: 0,
          }}>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green, whiteSpace: "nowrap" }}>AI Replies: Active</span>
          </div>
        )}

        {/* Inbox button — inline with nav tabs */}
        {onInbox && (
          <button onClick={onInbox} style={{
            position: "relative",
            padding: bp === "tablet" ? "4px 8px" : "4px 11px",
            borderRadius: 7, border: "none", cursor: "pointer",
            fontSize: bp === "tablet" ? 10 : 11,
            fontWeight: 400,
            whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT,
            background: "transparent",
            color: C.faint,
            transition: "all 0.15s",
          }}>
            Inbox
            {inboxBadge > 0 && (
              <span style={{
                position: "absolute", top: 0, right: 0,
                background: "#f59e0b", color: C.bg,
                borderRadius: "50%", width: 14, height: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 800,
              }}>{inboxBadge}</span>
            )}
          </button>
        )}
      </div>

      {sheetChip && <div style={{ marginLeft: 12 }}>{sheetChip}</div>}

      {/* Light / dark toggle */}
      {onToggleLightMode && (
        <button
          onClick={onToggleLightMode}
          title={lightMode ? "Switch to dark mode" : "Switch to light mode"}
          style={{
            marginLeft: 8, flexShrink: 0,
            padding: "4px 8px", borderRadius: 8,
            border: `1px solid rgba(216,231,242,0.25)`,
            background: "rgba(216,231,242,0.07)", color: C.muted,
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
            padding: "4px 10px", borderRadius: 8, border: `1px solid rgba(216,231,242,0.25)`,
            background: "rgba(216,231,242,0.07)", color: C.muted,
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
