import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, getAgencyTheme, isCamKnoll, isPasSunilchandra, type AgentProfile, type AgencyTheme, type DemoMode } from "../data"

// Returns true if the hex colour is perceptually dark (luminance < 128)
function isDarkHex(hex: string): boolean {
  if (!hex.startsWith("#") || hex.length !== 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

// Peake first (local Berwick agency), Area Specialist second (Pas), then alphabetical
const AGENCIES = [
  "Peake",
  "Area Specialist",
  "Barry Plant", "Biggin & Scott", "Buxton Real Estate", "Century 21",
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

// ── Agency dropdown with colour swatches ─────────────────────────────────────
function AgencyDropdown({
  value, onChange, error, accentColor,
}: { value: string; onChange: (v: string) => void; error?: string; accentColor?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectedTheme = value ? getAgencyTheme(value) : null

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: C.bg3,
          border: `1px solid ${error ? C.red + "88" : accentColor ? accentColor + "55" : C.border}`,
          borderRadius: 10, padding: "11px 14px",
          color: value ? C.text : C.faint, fontSize: 14, fontFamily: FONT,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
          transition: "border 0.15s",
        }}
      >
        {value && selectedTheme && (
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: selectedTheme.primary, flexShrink: 0,
            boxShadow: `0 0 6px ${selectedTheme.primary}88`,
          }} />
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{value || "Select your agency..."}</span>
        <span style={{ color: C.faint, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: C.bg3, border: `1px solid ${C.border}`,
          borderRadius: 10, zIndex: 200, overflow: "hidden",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)", maxHeight: 280, overflowY: "auto",
        }}>
          {AGENCIES.map(agency => {
            const t = getAgencyTheme(agency)
            return (
              <div
                key={agency}
                onClick={() => { onChange(agency); setOpen(false) }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", cursor: "pointer",
                  background: agency === value ? C.bg2 : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.bg2 }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = agency === value ? C.bg2 : "transparent" }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: t.primary, flexShrink: 0,
                  boxShadow: `0 0 5px ${t.primary}66`,
                }} />
                <span style={{ fontSize: 14, color: C.text }}>{agency}</span>
                {agency === value && (
                  <span style={{ marginLeft: "auto", color: t.primary, fontSize: 12, fontWeight: 700 }}>✓</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Suburb searchable autocomplete ────────────────────────────────────────────
function SuburbAutocomplete({
  value, onChange, error, accentColor,
}: { value: string; onChange: (v: string) => void; error?: string; accentColor?: string }) {
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
        type="text"
        value={query}
        placeholder="Type suburb name..."
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%", background: C.bg3,
          border: `1px solid ${error ? C.red + "88" : accentColor ? accentColor + "55" : C.border}`,
          borderRadius: 10, padding: "11px 14px",
          color: C.text, fontSize: 14, fontFamily: FONT,
          outline: "none", boxSizing: "border-box", transition: "border 0.15s",
        }}
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
          background: C.bg3, border: `1px solid ${C.border}`,
          borderRadius: 10, zIndex: 200, overflow: "hidden",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map(suburb => (
            <div
              key={suburb}
              onClick={() => { onChange(suburb); setQuery(suburb); setOpen(false) }}
              style={{
                padding: "10px 14px", cursor: "pointer", fontSize: 14, color: C.text,
                background: suburb === value ? C.bg2 : "transparent", transition: "background 0.1s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.bg2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = suburb === value ? C.bg2 : "transparent" }}
            >
              {suburb}
              {suburb === value && <span style={{ float: "right", color: accentColor ?? C.blue, fontWeight: 700, fontSize: 12 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onLogin: (agent: AgentProfile, theme: AgencyTheme, mode: DemoMode) => void
}

type Phase = "form" | "welcoming" | "done"

export default function AgentLogin({ onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>("form")
  const [mode, setMode] = useState<DemoMode>("buyer")
  const [form, setForm] = useState({
    firstName: "", lastName: "", agency: "", suburb: "", email: "", phone: "",
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  const theme = form.agency ? getAgencyTheme(form.agency) : null

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

  // Normalise Australian mobile to +61 format
  const normalisePhone = (p: string): string => {
    const digits = p.replace(/\D/g, "")
    if (digits.startsWith("61") && digits.length === 11) return `+${digits}`
    if (digits.startsWith("0") && digits.length === 10) return `+61${digits.slice(1)}`
    return p
  }

  const toProperCase = (s: string) => s.trim().replace(/\b\w/g, c => c.toUpperCase())

  const handleSubmit = () => {
    if (!validate()) return
    setPhase("welcoming")

    const firstName = toProperCase(form.firstName)
    const lastName  = toProperCase(form.lastName)
    const t = getAgencyTheme(form.agency)
    const agent: AgentProfile = {
      name:    `${firstName} ${lastName}`,
      agency:  form.agency,
      email:   form.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${form.agency.toLowerCase().replace(/\s+/g, "")}.com.au`,
      phone:   normalisePhone(form.phone),
      suburb:  form.suburb,
      tagline: `${form.suburb} specialist.`,
      voiceProfile: {
        greeting: "Hi", closing: "Cheers",
        lengthStyle: "short", formalityScore: 2,
        aussieIndex: 2, specificity: 3,
        emojiUsage: "occasional", examplesCount: 0,
        confidence: 0, detectedTraits: [],
      },
      trainingCorpus: [],
    }

    // Fill in known demo agent details if user left them blank
    if (isCamKnoll(agent)) {
      if (!form.phone) agent.phone = "0428 762 148"
      if (!form.email) agent.email = "cameronk@peakere.com.au"
    } else if (isPasSunilchandra(agent)) {
      if (!form.phone) agent.phone = "0430 366 649"
      if (!form.email) agent.email = "pass@areaspecialist.com.au"
    }

    setTimeout(() => onLogin(agent, t, mode), 2800)
  }

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    type = "text",
    flex?: string
  ) => (
    <div style={{ flex: flex ?? "1", display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5 }}>
        {label}{errors[key] && <span style={{ color: C.red, marginLeft: 6, fontSize: 10 }}>{errors[key]}</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: "" })) }}
        style={{
          background: C.bg3,
          border: `1px solid ${errors[key] ? C.red + "88" : C.border}`,
          borderRadius: 10, padding: "11px 14px",
          color: C.text, fontSize: 14, fontFamily: FONT,
          outline: "none", transition: "border 0.15s",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = theme?.primary ?? C.blue }}
        onBlur={e => { e.currentTarget.style.borderColor = errors[key] ? C.red + "88" : C.border }}
      />
    </div>
  )

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: "24px 16px",
    }}>
      {/* ── Form phase ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {phase === "form" && (
          <motion.div key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.35 } }}
            style={{ width: "100%", maxWidth: 480 }}
          >
            {/* Logo + branding */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <motion.div
                animate={theme ? { background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` } : {}}
                transition={{ duration: 0.5 }}
                style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: "linear-gradient(135deg, rgb(166,218,255), rgb(100,208,144))",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: C.bg, letterSpacing: -1,
                  marginBottom: 16, boxShadow: theme
                    ? `0 0 32px ${theme.glow}, 0 8px 24px rgba(0,0,0,0.4)`
                    : "0 8px 24px rgba(0,0,0,0.4)",
                  transition: "box-shadow 0.5s",
                }}
              >AV</motion.div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -0.5, marginBottom: 4 }}>
                PropOS
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                by AddVantage — Enter your details to begin
              </div>
            </div>

            {/* Form card */}
            <div style={{
              background: C.bg2, borderRadius: 18,
              border: `1px solid ${theme ? theme.primary + "22" : C.border}`,
              padding: "28px 24px",
              boxShadow: theme ? `0 0 40px ${theme.glow}` : undefined,
              transition: "border 0.4s, box-shadow 0.4s",
            }}>
              {/* Mode toggle */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5, marginBottom: 8 }}>
                  What do you want to do today?
                </div>
                <div style={{
                  display: "flex", background: C.bg3,
                  borderRadius: 10, padding: 3, gap: 0,
                  border: `1px solid ${C.border}`,
                }}>
                  {(["buyer", "vendor"] as DemoMode[]).map(m => {
                    const active = mode === m
                    const label = m === "buyer" ? "Buyer Outreach" : "Vendor Prospecting"
                    const desc  = m === "buyer" ? "Re-engage open home leads for new listings" : "Turn sold results into new vendor listings"
                    return (
                      <button key={m} onClick={() => setMode(m)} type="button" style={{
                        flex: 1, padding: "10px 12px", borderRadius: 8, border: "none",
                        cursor: "pointer", fontFamily: FONT, textAlign: "left",
                        background: active
                          ? (theme ? `linear-gradient(135deg, ${theme.gradient[0]}22, ${theme.gradient[1]}18)` : "rgba(166,218,255,0.1)")
                          : "transparent",
                        outline: active ? `1px solid ${theme?.primary ?? C.blue}44` : "none",
                        transition: "all 0.15s",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? (theme?.primary ?? C.blue) : C.muted, marginBottom: 2 }}>
                          {m === "buyer" ? "🏘" : "🏡"} {label}
                        </div>
                        <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.3 }}>{desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 }}>
                Agent Details
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Name row */}
                <div style={{ display: "flex", gap: 12 }}>
                  {field("firstName", "First Name", "Sarah")}
                  {field("lastName",  "Last Name",  "Chen")}
                </div>

                {/* Agency */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5 }}>
                    Agency{errors.agency && <span style={{ color: C.red, marginLeft: 6, fontSize: 10 }}>{errors.agency}</span>}
                  </label>
                  <AgencyDropdown
                    value={form.agency}
                    onChange={v => { setForm(f => ({ ...f, agency: v })); setErrors(er => ({ ...er, agency: "" })) }}
                    error={errors.agency}
                    accentColor={theme?.primary}
                  />
                </div>

                {/* Suburb */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5 }}>
                    Suburb Specialty{errors.suburb && <span style={{ color: C.red, marginLeft: 6, fontSize: 10 }}>{errors.suburb}</span>}
                  </label>
                  <SuburbAutocomplete
                    value={form.suburb}
                    onChange={v => { setForm(f => ({ ...f, suburb: v })); setErrors(er => ({ ...er, suburb: "" })) }}
                    error={errors.suburb}
                    accentColor={theme?.primary}
                  />
                </div>

                {/* Email + Phone */}
                <div style={{ display: "flex", gap: 12 }}>
                  {field("email", "Email (optional)", "you@agency.com.au", "email")}
                  {field("phone", "Mobile (optional)", "04xx xxx xxx", "tel")}
                </div>

                {/* Submit */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  style={{
                    width: "100%", padding: "14px",
                    borderRadius: 12, border: "none",
                    background: theme
                      ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`
                      : "linear-gradient(135deg, rgb(166,218,255), rgb(100,208,144))",
                    color: theme && isDarkHex(theme.gradient[0]) ? "#fff" : C.bg, fontSize: 15, fontWeight: 700,
                    cursor: "pointer", fontFamily: FONT,
                    marginTop: 4, letterSpacing: -0.3,
                    boxShadow: theme ? `0 4px 20px ${theme.glow}` : undefined,
                    transition: "background 0.4s, box-shadow 0.4s",
                  }}
                >
                  Start Session →
                </motion.button>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.faint }}>
              Your data stays on-device. Nothing is stored or shared.
            </div>
          </motion.div>
        )}

        {/* ── Welcome animation phase ──────────────────────────────────────── */}
        {phase === "welcoming" && (
          <motion.div key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              textAlign: "center", display: "flex",
              flexDirection: "column", alignItems: "center", gap: 0,
            }}
          >
            {/* AV logo pulse */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.55, times: [0, 0.6, 1] }}
              style={{
                width: 72, height: 72, borderRadius: 20,
                background: theme
                  ? `linear-gradient(135deg, ${theme!.gradient[0]}, ${theme!.gradient[1]})`
                  : "linear-gradient(135deg, rgb(166,218,255), rgb(100,208,144))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 800, color: C.bg, letterSpacing: -0.5,
                marginBottom: 24,
                boxShadow: theme
                  ? `0 0 60px ${theme!.primary}55, 0 16px 40px rgba(0,0,0,0.5)`
                  : "0 16px 40px rgba(0,0,0,0.5)",
              }}
            >{theme?.logo ?? "AV"}</motion.div>

            {/* "Welcome back, FirstName" — all on one line, simultaneous */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              style={{
                display: "flex", alignItems: "baseline", gap: 10,
                flexWrap: "wrap", justifyContent: "center", marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 44, color: C.muted, fontWeight: 300, letterSpacing: -1.5, lineHeight: 1 }}>
                Welcome back,
              </span>
              <span style={{
                fontSize: 44, fontWeight: 800, letterSpacing: -1.5,
                color: theme?.primary ?? C.blue,
                filter: theme ? `drop-shadow(0 0 20px ${theme!.glow})` : undefined,
                lineHeight: 1,
              }}>
                {toProperCase(form.firstName)}
              </span>
            </motion.div>

            {/* Agency name */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginBottom: 32 }}
            >
              {form.agency} · {form.suburb}
            </motion.div>

            {/* Loading bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              style={{
                width: 200, height: 2, background: C.bg3,
                borderRadius: 2, overflow: "hidden",
              }}
            >
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ delay: 1.5, duration: 1.2, ease: "easeInOut" }}
                style={{
                  height: "100%",
                  background: theme
                    ? `linear-gradient(90deg, ${theme.gradient[0]}, ${theme.gradient[1]})`
                    : `linear-gradient(90deg, ${C.blue}, ${C.green})`,
                  borderRadius: 2,
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
