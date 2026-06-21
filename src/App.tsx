import { useState, useEffect, lazy, Suspense, Component, type CSSProperties, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  C, FONT, DEFAULT_AGENT, DEFAULT_THEME, DEFAULT_VENDOR_SETTINGS,
  DARK_CSS_VARS, LIGHT_CSS_VARS, themeTextAccent, themeLightVarOverrides,
  type AgentProfile, type AgencyTheme, type ViewId, type DemoMode, type VendorDisplaySettings,
} from "./data"
import Nav from "./components/Nav"
import BillingBanner from "./components/BillingBanner"
import { seedCorpusIfEmpty } from "./lib/voiceContext"
import { clearAccessToken } from "./lib/authFetch"

// Code-split heavy views — only loaded when needed
const AgentLogin     = lazy(() => import("./views/AgentLogin"))
const DemoView       = lazy(() => import("./views/DemoView"))
const SettingsView   = lazy(() => import("./views/SettingsView"))
const PrincipalView  = lazy(() => import("./views/PrincipalView"))
const PitchView      = lazy(() => import("./views/PitchView"))
const VendorOutreachView  = lazy(() => import("./views/VendorOutreachView"))
const VoiceAgentView   = lazy(() => import("./views/VoiceAgentView"))
const DocInsightsView  = lazy(() => import("./views/DocInsightsView"))

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, fontFamily: "'Inter', sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#2c2d30", marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "#888", maxWidth: 420, textAlign: "center", marginBottom: 24 }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#3b1f77", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

function LoadingSpinner() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading..."
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: C.bg,
      }}
    >
      <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid rgba(255,255,255,0.1)`, borderTopColor: "rgba(255,255,255,0.6)", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── URL-based product detection ───────────────────────────────────────────────
// ?product=buyeros  → BuyerOS (buyer outreach module)
// ?product=vendoros → VendorOS (vendor prospecting module)
// No param           → PropOS (full, both modes selectable)
function detectProductMode(): DemoMode | null {
  try {
    const p = new URLSearchParams(window.location.search).get("product") ?? ""
    if (p.toLowerCase().includes("buyer")) return "buyer"
    if (p.toLowerCase().includes("vendor")) return "vendor"
    // Also check hash params: /#vendor or /#buyer
    const hash = window.location.hash.replace("#", "").toLowerCase()
    if (hash === "buyer" || hash === "buyeros") return "buyer"
    if (hash === "vendor" || hash === "vendoros") return "vendor"
  } catch {}
  return null
}

export const APP_PRODUCT_MODE = detectProductMode()

// ── Public pitch page detection ───────────────────────────────────────────────
// /p/:slug → standalone, unauthenticated pitch view (Realtair-style shared link)
function detectPitchSlug(): string | null {
  try {
    const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/)
    return match ? match[1] : null
  } catch {}
  return null
}

export const APP_PITCH_SLUG = detectPitchSlug()

export function getProductLabel(mode: DemoMode | null): string {
  if (mode === "buyer") return "BuyerOS"
  if (mode === "vendor") return "VendorOS"
  return "PropOS"
}

export default function App() {
  // productMode: null = PropOS (both), "buyer" = BuyerOS only, "vendor" = VendorOS only
  const productMode = APP_PRODUCT_MODE

  const [lightMode, setLightMode] = useState<boolean>(() => {
    try { return localStorage.getItem("propos_light_mode") !== "0" } catch { return true }
  })

  // Apply CSS vars and html class whenever mode changes
  useEffect(() => {
    const root = document.documentElement
    root.style.cssText = lightMode ? LIGHT_CSS_VARS : DARK_CSS_VARS
    root.classList.toggle("light-mode", lightMode)
    try { localStorage.setItem("propos_light_mode", lightMode ? "1" : "0") } catch {}
  }, [lightMode])

  // Update page title based on product mode
  useEffect(() => {
    document.title = getProductLabel(productMode) + " by AddVantage"
  }, [productMode])

  const [loggedIn, setLoggedIn]       = useState(false)
  const [theme, setTheme]             = useState<AgencyTheme>(DEFAULT_THEME)
  const [view, setView]               = useState<ViewId>("demo")
  const [agent, setAgent]             = useState(DEFAULT_AGENT)
  const [mode, setMode]               = useState<DemoMode>(productMode ?? "buyer")
  const [sheetStatus, setSheetStatus] = useState<"idle" | "loading" | "live" | "error">("idle")
  const [demoBack, setDemoBack] = useState<{ fn: () => void } | null>(null)
  const [inboxOpen, setInboxOpen]   = useState(false)
  const [inboxBadge, setInboxBadge] = useState(0)
  const [vendorSettings, setVendorSettings] = useState<VendorDisplaySettings>(() => {
    try {
      const s = localStorage.getItem("vendorDisplaySettings")
      return s ? { ...DEFAULT_VENDOR_SETTINGS, ...JSON.parse(s) } : DEFAULT_VENDOR_SETTINGS
    } catch { return DEFAULT_VENDOR_SETTINGS }
  })

  const handleVendorSettings = (s: VendorDisplaySettings) => {
    setVendorSettings(s)
    localStorage.setItem("vendorDisplaySettings", JSON.stringify(s))
  }

  const handleLogin = (newAgent: AgentProfile, newTheme: AgencyTheme, newMode: DemoMode) => {
    setAgent(newAgent)
    setTheme(newTheme)
    setMode(newMode)
    setLoggedIn(true)
    seedCorpusIfEmpty(newAgent.name)
    // Principals land on their office dashboard, not the buyer demo
    if (newAgent.role === "principal") {
      setView("principal")
    }
  }

  const handleLogout = () => {
    clearAccessToken()
    setLoggedIn(false)
    setView("demo")
  }

  // Listen for auth expiry events dispatched by authFetch
  useEffect(() => {
    const handler = () => handleLogout()
    window.addEventListener("propos:logout", handler)
    return () => window.removeEventListener("propos:logout", handler)
  }, [])

  // Ping Sheet URL on login to drive the Nav "Sheet live" indicator
  useEffect(() => {
    if (!loggedIn) return
    const url = import.meta.env.VITE_SHEET_URL
    if (!url) return
    setSheetStatus("loading")
    fetch(url)
      .then(r => r.json())
      .then((data: { error?: string }) => {
        setSheetStatus(data.error ? "error" : "live")
      })
      .catch(() => setSheetStatus("error"))
  }, [loggedIn])

  const navigate = (v: ViewId) => { window.scrollTo({ top: 0, behavior: "smooth" }); setView(v) }

  if (APP_PITCH_SLUG) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PitchView slug={APP_PITCH_SLUG} />
      </Suspense>
    )
  }

  if (!loggedIn) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AnimatePresence mode="wait">
          <AgentLogin onLogin={handleLogin} productMode={productMode} />
        </AnimatePresence>
      </Suspense>
    )
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.text,
      "--accent":     themeTextAccent(theme),
      "--accent-dim": theme.dim,
      "--accent-glow":theme.glow,
      ...(lightMode ? themeLightVarOverrides(theme) : {}),
    } as CSSProperties & Record<`--${string}`, string>}>
      <style>{`
        @keyframes pk-pulse{0%,100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(0,230,118,.7)}70%{transform:scale(1);box-shadow:0 0 0 9px rgba(0,230,118,0)}}
        .pk-pulse{animation:pk-pulse 2.1s infinite}
        .pk-input{width:100%;border:none;border-bottom:1px solid ${themeTextAccent(theme)}33;background:none;padding:9px 4px;font-size:15px;color:${themeTextAccent(theme)};outline:none;box-sizing:border-box;transition:border-color .2s;font-family:inherit;letter-spacing:-.1px}
        .pk-input::placeholder{color:${themeTextAccent(theme)}44}
        .pk-input:focus{border-bottom-color:${themeTextAccent(theme)}}
        .pk-label{display:block;font-size:10px;font-weight:600;color:${themeTextAccent(theme)}80;letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px}
      `}</style>
      <Nav view={view} setView={navigate} agent={agent} sheetStatus={sheetStatus} theme={theme} onLogout={handleLogout} onBack={demoBack?.fn}
           onInbox={() => setInboxOpen(v => !v)} inboxBadge={inboxBadge}
           mode={mode} onSwitchMode={setMode}
           lightMode={lightMode} onToggleLightMode={() => setLightMode(m => !m)}
           productMode={productMode} showCaptureLead={vendorSettings.showCaptureLead} />
      <BillingBanner />

      <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <AnimatePresence mode="wait">
          <motion.div id="main-content" key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}>

            {view === "demo"      && <DemoView agent={agent} theme={theme} mode={mode} onSettings={() => navigate("setup")} onRegisterBack={fn => setDemoBack(fn ? { fn } : null)}
                                              showInbox={inboxOpen} onShowInboxChange={setInboxOpen} onBadgeChange={setInboxBadge}
                                              vendorSettings={vendorSettings} />}
            {view === "setup"     && <SettingsView agent={agent} vendorSettings={vendorSettings} onVendorSettingsChange={handleVendorSettings} lightMode={lightMode} onToggleLightMode={() => setLightMode(m => !m)} />}
            {view === "principal" && <PrincipalView agent={agent} theme={theme} />}
            {view === "campaign"  && <VendorOutreachView />}
            {view === "voiceagent" && <VoiceAgentView />}
            {view === "insights"   && <DocInsightsView />}
          </motion.div>
        </AnimatePresence>
      </Suspense>
      </ErrorBoundary>
    </div>
  )
}
