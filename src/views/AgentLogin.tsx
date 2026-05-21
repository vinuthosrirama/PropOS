import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, getAgencyTheme, type AgentProfile, type AgencyTheme } from "../data"

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

interface Props {
  onLogin: (agent: AgentProfile, theme: AgencyTheme) => void
}

type Phase = "form" | "welcoming" | "done"

export default function AgentLogin({ onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>("form")
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
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    setPhase("welcoming")

    const t = getAgencyTheme(form.agency)
    const agent: AgentProfile = {
      name:    `${form.firstName} ${form.lastName}`,
      agency:  form.agency,
      email:   form.email || `${form.firstName.toLowerCase()}.${form.lastName.toLowerCase()}@${form.agency.toLowerCase().replace(/\s+/g, "")}.com.au`,
      phone:   form.phone || "04xx xxx xxx",
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

    setTimeout(() => onLogin(agent, t), 2800)
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
                  <div style={{ position: "relative" }}>
                    <select
                      value={form.agency}
                      onChange={e => { setForm(f => ({ ...f, agency: e.target.value })); setErrors(er => ({ ...er, agency: "" })) }}
                      style={{
                        width: "100%", background: C.bg3,
                        border: `1px solid ${errors.agency ? C.red + "88" : C.border}`,
                        borderRadius: 10, padding: "11px 14px",
                        color: form.agency ? C.text : C.faint,
                        fontSize: 14, fontFamily: FONT, outline: "none",
                        cursor: "pointer", appearance: "none", transition: "border 0.15s",
                      }}
                    >
                      <option value="" disabled>Select your agency...</option>
                      {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.faint, fontSize: 10 }}>▼</div>
                  </div>
                </div>

                {/* Suburb */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5 }}>
                    Suburb Specialty{errors.suburb && <span style={{ color: C.red, marginLeft: 6, fontSize: 10 }}>{errors.suburb}</span>}
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={form.suburb}
                      onChange={e => { setForm(f => ({ ...f, suburb: e.target.value })); setErrors(er => ({ ...er, suburb: "" })) }}
                      style={{
                        width: "100%", background: C.bg3,
                        border: `1px solid ${errors.suburb ? C.red + "88" : C.border}`,
                        borderRadius: 10, padding: "11px 14px",
                        color: form.suburb ? C.text : C.faint,
                        fontSize: 14, fontFamily: FONT, outline: "none",
                        cursor: "pointer", appearance: "none",
                      }}
                    >
                      <option value="" disabled>Select suburb...</option>
                      {SUBURBS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.faint, fontSize: 10 }}>▼</div>
                  </div>
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
                    color: C.bg, fontSize: 15, fontWeight: 700,
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
                {form.firstName}
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
