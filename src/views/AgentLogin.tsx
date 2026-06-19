import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FONT, getAgencyTheme, isCamKnoll, isPasSunilchandra, isManpreetSingh, MANPREET_DEFAULT_AGENT, type AgentProfile, type AgencyTheme, type DemoMode } from "../data"
import { readAgentProfileFromSheet, sheetsConnected } from "../lib/sheet"
import { apiUrl } from "../lib/api"
import { setAccessToken } from "../lib/authFetch"
import { useBreakpoint } from "../hooks/useBreakpoint"

const AGENCIES = [
  "Peake",
  "Area Specialist",
  "Barry Plant", "Barry Plant Berwick", "Biggin & Scott", "Buxton Real Estate", "Century 21",
  "First National Real Estate", "Fletchers Real Estate", "Harcourts",
  "Jellis Craig", "Kay & Burton", "LJ Hooker", "McGrath Estate Agents",
  "Nelson Alexander", "Raine & Horne", "Ray White", "Other",
]

const SUBURBS = [
  "Berwick", "Narre Warren", "Cranbourne", "Officer", "Pakenham",
  "Beaconsfield", "Clyde", "Hampton Park", "Endeavour Hills", "Dandenong",
  "Frankston", "Mornington", "Cheltenham", "Brighton", "St Kilda",
  "South Yarra", "Richmond", "Fitzroy", "Hawthorn", "Balwyn",
  "Glen Waverley", "Box Hill", "Doncaster", "Templestowe", "Eltham",
  "Other",
]

// Peake wordmark
function PeakeLogo({ height = 18, color = "#fff" }: { height?: number; color?: string }) {
  return (
    <span style={{
      fontSize: height, fontWeight: 800, color, letterSpacing: 0.5,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      lineHeight: 1, display: "inline-block",
    }}>Peake</span>
  )
}

// ── Agency dropdown — Peake underline style ───────────────────────────────────
function AgencyDropdown({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error?: string }) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => { if (!open) setFocusedIdx(-1) }, [open])

  const selectedTheme = value ? getAgencyTheme(value) : null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setFocusedIdx(0) }
      return
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false) }
    else if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, AGENCIES.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && focusedIdx >= 0) { e.preventDefault(); onChange(AGENCIES[focusedIdx]); setOpen(false) }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `Agency: ${value}` : "Select your agency"}
        style={{
          width: "100%", background: "none", border: "none",
          borderBottom: `1px solid ${error ? "#e53e3e" : open ? "#3b1f77" : "rgba(59,31,119,.22)"}`,
          padding: "9px 4px",
          color: value ? "#3b1f77" : "rgba(59,31,119,.28)",
          fontSize: 15, fontFamily: "inherit",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
          transition: "border-color .2s", outline: "none", letterSpacing: "-.1px",
        }}
      >
        {value && selectedTheme && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedTheme.primary, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{value || "Select your agency..."}</span>
        <span style={{ color: "rgba(59,31,119,.32)", fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div ref={listRef} role="listbox" aria-label="Agency options" style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1px solid rgba(59,31,119,.12)",
          borderRadius: 10, zIndex: 200, overflow: "hidden",
          boxShadow: "0 12px 32px rgba(59,31,119,0.12)", maxHeight: 280, overflowY: "auto",
        }}>
          {AGENCIES.map((agency, idx) => {
            const t = getAgencyTheme(agency)
            const isFocused = focusedIdx === idx
            return (
              <div key={agency} role="option" aria-selected={agency === value} tabIndex={-1}
                onClick={() => { onChange(agency); setOpen(false) }}
                onMouseEnter={() => setFocusedIdx(idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", cursor: "pointer",
                  background: isFocused || agency === value ? "rgba(59,31,119,.04)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.primary, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#2c2d30" }}>{agency}</span>
                {agency === value && (
                  <span style={{ marginLeft: "auto", color: t.primary, fontSize: 11, fontWeight: 700 }}>✓</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Suburb autocomplete — Peake underline style ───────────────────────────────
function SuburbAutocomplete({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error?: string }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = query
    ? SUBURBS.filter(s => s.toLowerCase().includes(query.toLowerCase()))
    : SUBURBS

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text" value={query} placeholder="Type suburb name..."
        className="pk-input"
        style={error ? { borderBottomColor: "#e53e3e" } : undefined}
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false)
          if (e.key === "Enter" && filtered.length === 1) {
            onChange(filtered[0]); setQuery(filtered[0]); setOpen(false)
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1px solid rgba(59,31,119,.12)",
          borderRadius: 10, zIndex: 200, overflow: "hidden",
          boxShadow: "0 12px 32px rgba(59,31,119,0.12)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map(suburb => (
            <div key={suburb}
              onClick={() => { onChange(suburb); setQuery(suburb); setOpen(false) }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, color: "#2c2d30", transition: "background 0.1s",
                background: suburb === value ? "rgba(59,31,119,.04)" : "transparent" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(59,31,119,.04)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = suburb === value ? "rgba(59,31,119,.04)" : "transparent" }}
            >
              {suburb}
              {suburb === value && <span style={{ float: "right", color: "#3b1f77", fontWeight: 700, fontSize: 11 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Auth login panel — Peake style ────────────────────────────────────────────
function AuthLoginPanel({ onSuccess, mode }: {
  onSuccess: (agent: AgentProfile, theme: AgencyTheme, mode: DemoMode) => void
  mode?: DemoMode
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<"login" | "register">("login")
  const [regForm, setRegForm] = useState({ name: "", agency: "", email: "", password: "" })
  const [regError, setRegError] = useState("")
  const [regLoading, setRegLoading] = useState(false)

  const btnBg = mode === "vendor" ? "#2c2d30" : "#3b1f77"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setLoginLoading(true)
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { accessToken?: string; agent?: { name: string; agency: string; email: string; phone: string; suburb: string; tagline: string; role?: string }; error?: string }
      if (!res.ok) { setError(data.error ?? "Login failed"); setLoginLoading(false); return }
      if (data.accessToken) setAccessToken(data.accessToken)
      const a = data.agent!
      const agent: AgentProfile = {
        name: a.name, agency: a.agency, email: a.email,
        phone: a.phone ?? "", suburb: a.suburb ?? "",
        tagline: a.tagline ?? `${a.suburb ?? ""} specialist.`,
        role: (a.role === "principal" ? "principal" : "agent") as "agent" | "principal",
        voiceProfile: { greeting: "Hi", closing: "Cheers", lengthStyle: "short", formalityScore: 2, aussieIndex: 2, specificity: 3, emojiUsage: "occasional", examplesCount: 0, confidence: 0, detectedTraits: [] },
        trainingCorpus: [],
      }
      onSuccess(agent, getAgencyTheme(a.agency), "vendor")
    } catch { setError("Network error — please try again"); setLoginLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(""); setRegLoading(true)
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(regForm),
      })
      const data = await res.json() as { accessToken?: string; agent?: { name: string; agency: string; email: string; phone: string; suburb: string; tagline: string }; error?: string }
      if (!res.ok) { setRegError(data.error ?? "Registration failed"); setRegLoading(false); return }
      if (data.accessToken) setAccessToken(data.accessToken)
      const a = data.agent!
      const agent: AgentProfile = {
        name: a.name, agency: a.agency || regForm.agency, email: a.email,
        phone: a.phone ?? "", suburb: a.suburb ?? "",
        tagline: a.tagline ?? `${a.agency ?? ""} specialist.`,
        voiceProfile: { greeting: "Hi", closing: "Cheers", lengthStyle: "short", formalityScore: 2, aussieIndex: 2, specificity: 3, emojiUsage: "occasional", examplesCount: 0, confidence: 0, detectedTraits: [] },
        trainingCorpus: [],
      }
      onSuccess(agent, getAgencyTheme(a.agency || regForm.agency), "vendor")
    } catch { setRegError("Network error — please try again"); setRegLoading(false) }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(59,31,119,.10)", marginBottom: 4 }}>
        {(["login", "register"] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: "8px 16px", border: "none", background: "none",
            color: tab === t ? "#3b1f77" : "rgba(59,31,119,.35)",
            fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
            borderBottom: `2px solid ${tab === t ? "#3b1f77" : "transparent"}`,
            marginBottom: -1, letterSpacing: "-.1px",
          }}>
            {t === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {tab === "login" ? (
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label className="pk-label">Email</label>
            <input className="pk-input" type="email" placeholder="you@agency.com.au" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div><label className="pk-label">Password</label>
            <input className="pk-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          {error && <div role="alert" style={{ fontSize: 12, color: "#e53e3e" }}>{error}</div>}
          <button type="submit" disabled={loginLoading} style={{
            padding: "13px", borderRadius: 20, border: "none",
            background: btnBg, color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loginLoading ? "default" : "pointer", fontFamily: "inherit", letterSpacing: "-.1px",
          }}>
            {loginLoading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label className="pk-label">Full name</label>
            <input className="pk-input" type="text" placeholder="Cameron Knoll" value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="pk-label">Agency</label>
            <input className="pk-input" type="text" placeholder="Peake Real Estate" value={regForm.agency} onChange={e => setRegForm(f => ({ ...f, agency: e.target.value }))} /></div>
          <div><label className="pk-label">Email</label>
            <input className="pk-input" type="email" placeholder="you@agency.com.au" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} required /></div>
          <div><label className="pk-label">Password</label>
            <input className="pk-input" type="password" placeholder="Min 8 characters" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} required /></div>
          {regError && <div role="alert" style={{ fontSize: 12, color: "#e53e3e" }}>{regError}</div>}
          <button type="submit" disabled={regLoading} style={{
            padding: "13px", borderRadius: 20, border: "none",
            background: btnBg, color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: regLoading ? "default" : "pointer", fontFamily: "inherit", letterSpacing: "-.1px",
          }}>
            {regLoading ? "Creating account…" : "Create account →"}
          </button>
        </form>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onLogin: (agent: AgentProfile, theme: AgencyTheme, mode: DemoMode) => void
  productMode?: DemoMode | null
}

type Phase = "form" | "welcoming" | "done"

export default function AgentLogin({ onLogin, productMode }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [phase, setPhase] = useState<Phase>("form")
  const [mode, setMode] = useState<DemoMode>(productMode ?? "buyer")
  const [showAuth, setShowAuth] = useState(false)
  const [welcomeName, setWelcomeName] = useState("")
  const [form, setForm] = useState({
    firstName: "", lastName: "", agency: "", suburb: "", email: "", phone: "",
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  // Auto-link agency + suburb from known agent names
  useEffect(() => {
    const fn = form.firstName.toLowerCase().trim()
    const ln = form.lastName.toLowerCase().trim()
    if (fn.startsWith("cam") && ln.includes("knoll")) {
      setForm(f => ({ ...f, agency: f.agency || "Peake", suburb: f.suburb || "Berwick" }))
    } else if ((fn.includes("manpreet") || (fn.includes("manny") && ln.includes("singh"))) && ln.includes("singh")) {
      setForm(f => ({ ...f, agency: f.agency || "Barry Plant Berwick", suburb: f.suburb || "Berwick" }))
    }
  }, [form.firstName, form.lastName])

  const validate = () => {
    const e: Partial<typeof form> = {}
    if (!form.firstName.trim()) e.firstName = "Required"
    if (!form.lastName.trim())  e.lastName  = "Required"
    if (!form.agency)           e.agency    = "Required"
    if (!form.suburb)           e.suburb    = "Required"
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const normalisePhone = (p: string): string => {
    const digits = p.replace(/\D/g, "")
    if (digits.startsWith("61") && digits.length === 11) return `+${digits}`
    if (digits.startsWith("0") && digits.length === 10) return `+61${digits.slice(1)}`
    return p
  }

  const toProperCase = (s: string) => s.trim().replace(/\b\w/g, c => c.toUpperCase())

  const handleSubmit = () => {
    if (!validate()) return
    const firstName = toProperCase(form.firstName)
    const lastName  = toProperCase(form.lastName)
    setWelcomeName(firstName)
    setPhase("welcoming")
    const t = getAgencyTheme(form.agency)
    const agent: AgentProfile = {
      name:    `${firstName} ${lastName}`,
      agency:  form.agency,
      email:   form.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${form.agency.toLowerCase().replace(/\s+/g, "")}.com.au`,
      phone:   normalisePhone(form.phone),
      suburb:  form.suburb,
      tagline: `${form.suburb} specialist.`,
      voiceProfile: {
        greeting: "Hi", closing: "Cheers", lengthStyle: "short", formalityScore: 2,
        aussieIndex: 2, specificity: 3, emojiUsage: "occasional", examplesCount: 0,
        confidence: 0, detectedTraits: [],
      },
      trainingCorpus: [],
    }

    if (isCamKnoll(agent)) {
      if (!form.phone) agent.phone = "0428 762 148"
      if (!form.email) agent.email = "cameronk@peakere.com.au"
      agent.photoUrl = "https://www.peakere.com.au/our-team/cameron-knoll"
    } else if (isPasSunilchandra(agent)) {
      if (!form.phone) agent.phone = "0430 366 649"
      if (!form.email) agent.email = "pass@areaspecialist.com.au"
    } else if (isManpreetSingh(agent)) {
      if (!form.phone) agent.phone = MANPREET_DEFAULT_AGENT.phone
      if (!form.email) agent.email = MANPREET_DEFAULT_AGENT.email
      agent.tagline = MANPREET_DEFAULT_AGENT.tagline
      agent.voiceProfile = MANPREET_DEFAULT_AGENT.voiceProfile
    }

    if (sheetsConnected()) {
      readAgentProfileFromSheet(agent.name, agent.agency).then(profile => {
        if (profile) {
          if (profile.phone)   agent.phone   = profile.phone
          if (profile.email)   agent.email   = profile.email
          if (profile.tagline) agent.tagline = profile.tagline
          if (profile.suburb)  agent.suburb  = profile.suburb
        }
      }).catch(() => {})
    }

    setTimeout(() => onLogin(agent, t, mode), 2800)
  }

  // Left panel background — buyer = Peake purple, vendor = charcoal
  const leftBg = mode === "buyer" ? "#2c1b59" : "#2c2d30"
  const modeLabel = mode === "buyer" ? "BuyerOS" : "VendorOS"
  const modeSubtitle = mode === "buyer"
    ? "Re-engage open home leads and match them to new listings automatically."
    : "Turn recent sold results into new vendor listing appointments."

  // Form field — Peake underline style
  const field = (key: keyof typeof form, label: string, placeholder: string, type = "text") => (
    <div style={{ flex: 1 }}>
      <label className="pk-label" htmlFor={`field-${key}`}>
        {label}
        {errors[key] && <span role="alert" style={{ color: "#e53e3e", marginLeft: 6, fontSize: 9 }}>{errors[key]}</span>}
      </label>
      <input
        id={`field-${key}`} type={type} value={form[key]} placeholder={placeholder}
        className="pk-input"
        style={errors[key] ? { borderBottomColor: "#e53e3e" } : undefined}
        aria-invalid={!!errors[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: "" })) }}
      />
    </div>
  )

  // ── Welcoming animation — Peake purple backdrop ──────────────────────────────
  if (phase === "welcoming") {
    const t = form.agency ? getAgencyTheme(form.agency) : null
    return (
      <div style={{
        minHeight: "100vh", background: leftBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT,
      }}>
        <AnimatePresence>
          <motion.div key="welcome"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.55, times: [0, 0.6, 1] }}
              style={{
                width: 72, height: 72, borderRadius: 20,
                background: t
                  ? `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]})`
                  : "linear-gradient(135deg, #553990, #3b1f77)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5,
                marginBottom: 24,
                boxShadow: "0 0 60px rgba(59,31,119,.55), 0 16px 40px rgba(0,0,0,0.5)",
              }}
            >{t?.logo ?? "PK"}</motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}
            >
              <span style={{ fontSize: 44, color: "rgba(255,255,255,.45)", fontWeight: 300, letterSpacing: -1.5, lineHeight: 1 }}>Welcome back,</span>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, color: "#b6c2ab", lineHeight: 1 }}>{welcomeName}</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              style={{ fontSize: 13, color: "rgba(255,255,255,.42)", fontWeight: 500, marginBottom: 32 }}
            >
              {[form.agency, form.suburb].filter(Boolean).join(" · ")}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              style={{ width: 200, height: 2, background: "rgba(255,255,255,.10)", borderRadius: 2, overflow: "hidden" }}
            >
              <motion.div
                initial={{ width: "0%" }} animate={{ width: "100%" }}
                transition={{ delay: 1.5, duration: 1.2, ease: "easeInOut" }}
                style={{ height: "100%", background: "linear-gradient(90deg, #553990, #b6c2ab)", borderRadius: 2 }}
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── Form phase — Peake split panel ────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      flexDirection: isMobile ? "column" : "row",
    }}>
      {/* ── Left panel: Peake brand ──────────────────────────────────────────── */}
      {!isMobile ? (
        <motion.div
          initial={{ background: leftBg }}
          animate={{ background: leftBg }}
          transition={{ duration: 0.4 }}
          style={{
            width: "40%", minHeight: "100vh",
            display: "flex", flexDirection: "column",
            padding: "48px 40px", position: "relative", overflow: "hidden",
          }}
        >
          {/* Logo + mode badge */}
          <div style={{ marginBottom: "auto" }}>
            <PeakeLogo height={20} color="#fff" />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const }}>PropOS</span>
              <div style={{ width: 1, height: 10, background: "rgba(255,255,255,.18)" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "#b6c2ab", letterSpacing: ".04em", background: "rgba(182,194,171,.12)", padding: "2px 8px", borderRadius: 10 }}>
                {modeLabel}
              </span>
            </div>
          </div>

          {/* Main copy — vertically centred */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              <div className="pk-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#b6c2ab", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.52)", letterSpacing: ".02em" }}>
                Cameron Knoll · Peake Real Estate · Berwick
              </span>
            </div>

            <h1 style={{
              fontSize: 36, fontWeight: 800, color: "#fff",
              letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 16px",
            }}>
              Your partner<br />in property<br />success.
            </h1>

            <p style={{
              fontSize: 14, color: "rgba(255,255,255,.48)", lineHeight: 1.65,
              maxWidth: 264, margin: "0 0 40px", letterSpacing: "-.1px",
            }}>
              {modeSubtitle}
            </p>

          </div>

          <div style={{ fontSize: 9, color: "rgba(255,255,255,.22)", letterSpacing: ".06em", textTransform: "uppercase" }}>
            © 2026 Peake Real Estate
          </div>

          {/* Decorative rings */}
          <div style={{ position: "absolute", right: -80, top: "50%", transform: "translateY(-50%)", width: 280, height: 280, borderRadius: "50%", border: "1px solid rgba(255,255,255,.05)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: -140, top: "50%", transform: "translateY(-50%)", width: 420, height: 420, borderRadius: "50%", border: "1px solid rgba(255,255,255,.03)", pointerEvents: "none" }} />
        </motion.div>
      ) : (
        /* Mobile: header strip */
        <motion.div
          initial={{ background: leftBg }}
          animate={{ background: leftBg }}
          transition={{ duration: 0.4 }}
          style={{ padding: "18px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PeakeLogo height={14} color="#fff" />
            <div style={{ width: 1, height: 12, background: "rgba(255,255,255,.2)" }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,.5)", fontWeight: 700, letterSpacing: ".12em" }}>{modeLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="pk-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#b6c2ab" }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,.45)", letterSpacing: ".04em" }}>Active</span>
          </div>
        </motion.div>
      )}

      {/* ── Right panel: form ────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, background: "#fff",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: isMobile ? "28px 24px 40px" : "48px 56px",
        overflowY: "auto", minHeight: isMobile ? undefined : "100vh",
      }}>
        {/* Eyebrow */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "rgba(59,31,119,.35)", textTransform: "uppercase", marginBottom: 8 }}>
          Welcome back
        </div>

        {/* Heading + mode toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: "#2c2d30", letterSpacing: "-1px", margin: 0, lineHeight: 1.1 }}>
            Sign in to {modeLabel}
          </h2>

          {!productMode && (
            <div style={{ display: "flex", background: "#f7f7f8", borderRadius: 20, padding: 3, border: "1px solid rgba(59,31,119,.10)", flexShrink: 0 }}>
              {(["buyer", "vendor"] as DemoMode[]).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)} style={{
                  padding: "5px 14px", borderRadius: 20, border: "none",
                  background: mode === m ? (m === "buyer" ? "#2c1b59" : "#2c2d30") : "transparent",
                  color: mode === m ? "#fff" : "rgba(59,31,119,.4)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: "-.1px", transition: "all .2s",
                }}>
                  {m === "buyer" ? "BuyerOS" : "VendorOS"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick access — instant login */}
        <button type="button" onClick={async () => {
          const agent: AgentProfile = {
            name: "Vinuth Srirama", agency: "Peake",
            email: "vinuth.o.srirama@gmail.com", phone: "0415 883 354",
            suburb: "Berwick", tagline: "Berwick specialist.",
            voiceProfile: { greeting: "Hi", closing: "Cheers", lengthStyle: "short", formalityScore: 2, aussieIndex: 2, specificity: 3, emojiUsage: "occasional", examplesCount: 0, confidence: 0, detectedTraits: [] },
            trainingCorpus: [],
          }
          try {
            const r = await fetch(apiUrl("/api/auth/demo-token"), { method: "POST" })
            const d = await r.json()
            if (d.accessToken) setAccessToken(d.accessToken)
          } catch { /* non-fatal — sends will 401 but the demo UI still loads */ }
          onLogin(agent, getAgencyTheme("Peake"), mode)
        }} style={{
          width: "100%", padding: "14px 18px", borderRadius: 20, border: "none",
          background: "#3b1f77", color: "#fff",
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          letterSpacing: "-.1px", marginBottom: 10,
        }}>
          <span>Vinuth Srirama · Peake · Berwick</span>
          <span style={{ opacity: 0.55, fontSize: 12 }}>Master account →</span>
        </button>
        <button type="button" onClick={async () => {
          const agent: AgentProfile = {
            name: "Cameron Knoll", agency: "Peake",
            email: "cameronk@peakere.com.au", phone: "0428 762 148",
            suburb: "Berwick", tagline: "Berwick specialist.",
            voiceProfile: { greeting: "Hi", closing: "Cheers", lengthStyle: "short", formalityScore: 2, aussieIndex: 2, specificity: 3, emojiUsage: "occasional", examplesCount: 0, confidence: 0, detectedTraits: [] },
            trainingCorpus: [],
          }
          try {
            const r = await fetch(apiUrl("/api/auth/demo-token"), { method: "POST" })
            const d = await r.json()
            if (d.accessToken) setAccessToken(d.accessToken)
          } catch { /* non-fatal — sends will 401 but the demo UI still loads */ }
          onLogin(agent, getAgencyTheme("Peake"), mode)
        }} style={{
          width: "100%", padding: "14px 18px", borderRadius: 20, border: "none",
          background: "#2c1b59", color: "#fff",
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          letterSpacing: "-.1px", marginBottom: 20,
        }}>
          <span>Cameron Knoll · Peake · Berwick</span>
          <span style={{ opacity: 0.55, fontSize: 12 }}>Quick access →</span>
        </button>

        {/* Auth section */}
        {showAuth ? (
          <div style={{ marginBottom: 24 }}>
            <AuthLoginPanel mode={mode} onSuccess={(agent, t, m) => {
              setWelcomeName(agent.name.split(" ")[0])
              setPhase("welcoming")
              setTimeout(() => onLogin(agent, t, m), 2800)
            }} />
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <button type="button" onClick={() => setShowAuth(true)} style={{
              width: "100%", padding: "11px 16px", borderRadius: 20,
              border: "1px solid rgba(59,31,119,.13)", background: "#f7f7f8",
              color: "#2c2d30", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between", letterSpacing: "-.1px",
            }}>
              <span>Sign in with your PropOS account</span>
              <span style={{ color: "rgba(59,31,119,.3)", fontSize: 11 }}>→</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(59,31,119,.09)" }} />
              <span style={{ fontSize: 11, color: "rgba(59,31,119,.32)" }}>or continue as guest</span>
              <div style={{ flex: 1, height: 1, background: "rgba(59,31,119,.09)" }} />
            </div>
          </div>
        )}

        {!showAuth && (<>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "rgba(59,31,119,.35)", textTransform: "uppercase", marginBottom: 20 }}>
            Agent Details
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 20, flexDirection: isMobile ? "column" : "row" }}>
              {field("firstName", "First name", "Cameron")}
              {field("lastName",  "Last name",  "Knoll")}
            </div>

            <div>
              <label className="pk-label">
                Agency{errors.agency && <span role="alert" style={{ color: "#e53e3e", marginLeft: 6, fontSize: 9 }}>{errors.agency}</span>}
              </label>
              <AgencyDropdown
                value={form.agency}
                onChange={v => { setForm(f => ({ ...f, agency: v })); setErrors(er => ({ ...er, agency: "" })) }}
                error={errors.agency}
              />
            </div>

            <div>
              <label className="pk-label">
                Suburb Specialty{errors.suburb && <span role="alert" style={{ color: "#e53e3e", marginLeft: 6, fontSize: 9 }}>{errors.suburb}</span>}
              </label>
              <SuburbAutocomplete
                value={form.suburb}
                onChange={v => { setForm(f => ({ ...f, suburb: v })); setErrors(er => ({ ...er, suburb: "" })) }}
                error={errors.suburb}
              />
            </div>

            <div style={{ display: "flex", gap: 20, flexDirection: isMobile ? "column" : "row" }}>
              {field("email", "Email (optional)", "you@agency.com.au", "email")}
              {field("phone", "Mobile (optional)", "04xx xxx xxx", "tel")}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              style={{
                width: "100%", padding: "14px", borderRadius: 20, border: "none",
                background: mode === "buyer" ? "#3b1f77" : "#2c2d30",
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", letterSpacing: "-.1px", marginTop: 4,
              }}
            >
              Start Session →
            </motion.button>
          </div>
        </>)}

        {/* Footer */}
        <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 7 }}>
          <div className="pk-pulse-green" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "rgba(59,31,119,.3)", letterSpacing: ".04em" }}>
            Powered by AddVantageAI
          </span>
        </div>
      </div>
    </div>
  )
}
