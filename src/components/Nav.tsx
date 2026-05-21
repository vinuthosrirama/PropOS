import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { C, FONT, DEFAULT_THEME, type AgentProfile, type AgencyTheme, type ViewId } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"

export const VIEWS: { id: ViewId; label: string; short: string }[] = [
  { id: "demo",  label: "Demo",     short: "Demo" },
  { id: "setup", label: "Settings", short: "Settings" },
]

export default function Nav({
  view, setView, agent, sheetStatus = "idle", theme = DEFAULT_THEME, onLogout,
}: {
  view: ViewId
  setView: (v: ViewId) => void
  agent: AgentProfile
  sheetStatus?: "idle" | "loading" | "live" | "error"
  theme?: AgencyTheme
  onLogout?: () => void
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
  ) : sheetStatus === "error" ? (
    <div style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(255,80,80,0.08)", fontSize: 10, color: C.red, whiteSpace: "nowrap", flexShrink: 0 }}>
      ○ Demo mode
    </div>
  ) : null

  const logoBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: C.bg, letterSpacing: -0.5, flexShrink: 0,
        transition: "background 0.5s",
      }}>{theme.logo}</div>
      {bp !== "mobile" && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1 }}>PropOS</div>
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
          background: "rgba(4,7,13,0.97)", backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {logoBlock}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sheetChip}
            <div style={{
              fontSize: 11, color: theme.primary, fontWeight: 600,
              background: theme.dim, padding: "3px 8px", borderRadius: 12,
              transition: "color 0.4s, background 0.4s",
            }}>
              {VIEWS.find(v => v.id === view)?.short}
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              width: 36, height: 36, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0,
            }}>
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
                background: "rgba(4,7,13,0.98)", backdropFilter: "blur(20px)",
                borderBottom: `1px solid ${C.border}`,
                padding: "12px 0", maxHeight: "80vh", overflowY: "auto",
              }}>
              {VIEWS.map((v, i) => (
                <button key={v.id} onClick={() => navigate(v.id)} style={{
                  width: "100%", padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                  background: view === v.id ? theme.dim : "transparent",
                  border: "none", cursor: "pointer", fontFamily: FONT,
                  borderLeft: `3px solid ${view === v.id ? theme.primary : "transparent"}`,
                  transition: "background 0.15s, border-color 0.15s",
                }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: view === v.id ? 700 : 400, color: view === v.id ? theme.primary : C.text }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 10, color: C.faint }}>Step {i + 1} of {VIEWS.length}</div>
                  </div>
                  {i < currentIdx && <span style={{ marginLeft: "auto", color: C.green, fontSize: 12 }}>✓</span>}
                </button>
              ))}
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
      background: scrolled ? "rgba(4,7,13,0.97)" : "rgba(4,7,13,0.85)",
      backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ marginRight: 20, flexShrink: 0 }}>{logoBlock}</div>

      <div style={{
        display: "flex", gap: 2, overflowX: "auto", flex: 1,
        scrollbarWidth: "none", msOverflowStyle: "none",
      }}>
        {VIEWS.map((v, i) => {
          const active = v.id === view
          const past = i < currentIdx
          return (
            <button key={v.id} onClick={() => navigate(v.id)} style={{
              padding: bp === "tablet" ? "4px 8px" : "4px 11px",
              borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: bp === "tablet" ? 10 : 11,
              fontWeight: active ? 700 : 400,
              whiteSpace: "nowrap", flexShrink: 0, fontFamily: FONT,
              background: active ? theme.dim : "transparent",
              color: active ? theme.primary : past ? C.muted : C.faint,
              transition: "all 0.15s",
            }}>
              {bp === "tablet" ? v.short : v.label}
            </button>
          )
        })}
      </div>

      {sheetChip && <div style={{ marginLeft: 12 }}>{sheetChip}</div>}

      {onLogout && (
        <button
          onClick={onLogout}
          title="Switch profile — go back to login"
          style={{
            marginLeft: 8, marginRight: 100, flexShrink: 0,
            padding: "4px 10px", borderRadius: 8, border: `1px solid rgba(216,231,242,0.25)`,
            background: "rgba(216,231,242,0.07)", color: C.muted,
            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            transition: "color 0.15s, border-color 0.15s, background 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.color = C.text
            b.style.borderColor = "rgba(216,231,242,0.45)"
            b.style.background = "rgba(216,231,242,0.12)"
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.color = C.muted
            b.style.borderColor = "rgba(216,231,242,0.25)"
            b.style.background = "rgba(216,231,242,0.07)"
          }}
        >
          Switch Profile
        </button>
      )}
    </nav>
  )
}
