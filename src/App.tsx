import { useState, useEffect, lazy, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  C, FONT, DEFAULT_AGENT, DEFAULT_THEME, DEFAULT_VENDOR_SETTINGS,
  type AgentProfile, type AgencyTheme, type ViewId, type DemoMode, type VendorDisplaySettings,
} from "./data"
import Nav from "./components/Nav"
import { seedCorpusIfEmpty } from "./lib/voiceContext"

// Code-split heavy views — only loaded when needed
const AgentLogin   = lazy(() => import("./views/AgentLogin"))
const DemoView     = lazy(() => import("./views/DemoView"))
const SettingsView = lazy(() => import("./views/SettingsView"))

function LoadingSpinner() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.bg,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid rgba(255,255,255,0.1)`, borderTopColor: "rgba(255,255,255,0.6)", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function App() {
  const [loggedIn, setLoggedIn]       = useState(false)
  const [theme, setTheme]             = useState<AgencyTheme>(DEFAULT_THEME)
  const [view, setView]               = useState<ViewId>("demo")
  const [agent, setAgent]             = useState(DEFAULT_AGENT)
  const [mode, setMode]               = useState<DemoMode>("buyer")
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
    seedCorpusIfEmpty()
  }

  const handleLogout = () => {
    setLoggedIn(false)
    setView("demo")
  }

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

  if (!loggedIn) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AnimatePresence mode="wait">
          <AgentLogin onLogin={handleLogin} />
        </AnimatePresence>
      </Suspense>
    )
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.text,
      ["--accent" as string]:      theme.primary,
      ["--accent-dim" as string]:  theme.dim,
      ["--accent-glow" as string]: theme.glow,
    }}>
      <Nav view={view} setView={navigate} agent={agent} sheetStatus={sheetStatus} theme={theme} onLogout={handleLogout} onBack={demoBack?.fn}
           onInbox={() => setInboxOpen(v => !v)} inboxBadge={inboxBadge}
           mode={mode} onSwitchMode={setMode} />

      <Suspense fallback={<LoadingSpinner />}>
        <AnimatePresence mode="wait">
          <motion.div key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}>

            {view === "demo"  && <DemoView agent={agent} theme={theme} mode={mode} onSettings={() => navigate("setup")} onRegisterBack={fn => setDemoBack(fn ? { fn } : null)}
                                          showInbox={inboxOpen} onShowInboxChange={setInboxOpen} onBadgeChange={setInboxBadge}
                                          vendorSettings={vendorSettings} />}
            {view === "setup" && <SettingsView agent={agent} vendorSettings={vendorSettings} onVendorSettingsChange={handleVendorSettings} />}
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </div>
  )
}
