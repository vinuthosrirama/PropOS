import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  C, FONT, DEFAULT_AGENT, DEFAULT_THEME,
  type AgentProfile, type AgencyTheme, type ViewId, type DemoMode,
} from "./data"
import Nav from "./components/Nav"
import AgentLogin from "./views/AgentLogin"
import DemoView from "./views/DemoView"
import SettingsView from "./views/SettingsView"
import { seedCorpusIfEmpty } from "./lib/voiceContext"

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
      <AnimatePresence mode="wait">
        <AgentLogin onLogin={handleLogin} />
      </AnimatePresence>
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
           onInbox={() => setInboxOpen(v => !v)} inboxBadge={inboxBadge} />

      <AnimatePresence mode="wait">
        <motion.div key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}>

          {view === "demo"  && <DemoView agent={agent} theme={theme} mode={mode} onSettings={() => navigate("setup")} onRegisterBack={fn => setDemoBack(fn ? { fn } : null)}
                                        showInbox={inboxOpen} onShowInboxChange={setInboxOpen} onBadgeChange={setInboxBadge} />}
          {view === "setup" && <SettingsView agent={agent} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
