/**
 * VoiceAgentView — SMS Agent cockpit (mobile/tablet/desktop responsive).
 *
 * New in this version:
 *  - Mobile: contacts list and thread are separate full-screen panels (back button to switch)
 *  - Tablet: narrow sidebar + full-width thread
 *  - Prospectability + interest scores on each contact card
 *  - Market Report Sequence button in the thread panel
 *  - Auto-send toggle with verbal-approval confirmation
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react"
import { C, FONT } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { authFetch, setAccessToken } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReaData {
  recently_sold_address?: string
  recently_sold_price?: string
  recently_sold_days_on_market?: number
  currently_listing_count?: number
  currently_listing?: Array<{ address: string; price_guide: string }>
  target_suburbs?: string[]
  agency_name?: string
  years_active?: number
}

interface Contact {
  id: number
  name: string
  phone: string
  relationship: string
  stage: number
  status: string
  auto_reply: boolean
  last_contact: string | null
  rea_data?: ReaData
  personalisation?: Record<string, unknown>
  conversation_objective?: string | null
  prospectability?: number
  interest?: number
  score_label?: "hot" | "warm" | "cold"
  score_highlights?: string[]
}

interface ThreadMessage { role: "agent" | "lead"; body: string; ts: string }

interface Draft {
  id: number
  contact_id: number
  contact_name: string
  contact_phone: string
  inbound_body: string
  draft_body: string
  reasoning: string
  voice_confidence: string
  kind: string
  created_at: string
}

interface VoiceProfile {
  voice_id: string
  confidence: number
  samples_analysed: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

function scoreColor(label?: "hot" | "warm" | "cold"): string {
  if (label === "hot") return C.green
  if (label === "warm") return C.orange
  return C.faint
}

function scoreDim(label?: "hot" | "warm" | "cold"): string {
  if (label === "hot") return C.greenDim
  if (label === "warm") return C.orangeDim
  return "rgba(150,150,150,0.08)"
}

function scoreEmoji(label?: "hot" | "warm" | "cold"): string {
  if (label === "hot") return "🔥"
  if (label === "warm") return "~"
  return "·"
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VoiceAgentView() {
  const bp = useBreakpoint()
  const isMobile  = bp === "mobile"
  const isTablet  = bp === "tablet"
  const isDesktop = bp === "desktop"

  // core state
  const [contacts, setContacts]     = useState<Contact[]>([])
  const [drafts, setDrafts]         = useState<Draft[]>([])
  const [voiceProfile, setVoice]    = useState<VoiceProfile | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [thread, setThread]         = useState<ThreadMessage[]>([])
  const [loading, setLoading]       = useState(true)
  const [autoSend, setAutoSend]     = useState(false)
  const [actionMsg, setActionMsg]   = useState<string | null>(null)

  // mobile nav: "list" shows contacts panel, "thread" shows conversation
  const [mobilePanel, setMobilePanel] = useState<"list" | "thread">("list")

  // compose + actions
  const [composeText, setComposeText]     = useState("")
  const [sending, setSending]             = useState(false)
  const [editingDraftId, setEditingDraft] = useState<number | null>(null)
  const [editedBody, setEditedBody]       = useState("")
  const [suggestions, setSuggestions]     = useState<Array<{ draft: string; tone: string; charCount: number }>>([])
  const [suggestCtx, setSuggestCtx]       = useState<string | null>(null)
  const [suggesting, setSuggesting]       = useState(false)

  // auth
  const [authRequired, setAuthRequired] = useState(false)
  const [loginEmail, setLoginEmail]     = useState("")
  const [loginPassword, setLoginPass]   = useState("")
  const [loggingIn, setLoggingIn]       = useState(false)

  // auto-send confirm modal
  const [confirmAutoSend, setConfirmAutoSend] = useState(false)
  const [togglingAutoSend, setTogglingAuto]   = useState(false)

  // voice calibrate
  const [calibrateOpen, setCalibrateOpen]   = useState(false)
  const [calibrateText, setCalibrateText]   = useState("")
  const [calibrating, setCalibrating]       = useState(false)

  // demo system
  const [demoOpen, setDemoOpen]             = useState(false)
  const [demoPhone, setDemoPhone]           = useState<string | null>(null)
  const [demoPhoneInput, setDemoPhoneInput] = useState("")
  const [_savingDemo, _setSavingDemo]       = useState(false)
  const [seedingDemo, setSeedingDemo]       = useState(false)
  const [queueingOpener, setQueueingOpener] = useState(false)
  const [demoContacts, setDemoContacts]     = useState<Array<{
    id: number; key: string; name: string; phone: string; fakePhone: string
    tag: string; summary: string; status: string; ready_to_contact: boolean; isActive: boolean
  }>>([])
  const [demoActivating, setDemoActivating] = useState<string | null>(null)
  const [demoResetting, setDemoResetting]   = useState(false)

  // market report sequence
  const [mrOpen, setMrOpen]         = useState(false)
  const [mrSuburb, setMrSuburb]     = useState("")
  const [mrRunning, setMrRunning]   = useState(false)
  const [mrResult, setMrResult]     = useState<string | null>(null)

  // sort
  const [sortBy, setSortBy] = useState<"score" | "recent">("score")

  // contact editor
  const [editContactOpen, setEditContactOpen] = useState(false)
  const [editForm, setEditForm] = useState({ notes: "", agency: "", suburbs: "", listingCount: "", soldAddress: "", soldPrice: "", objective: "", status: "active" })
  const [editSaving, setEditSaving] = useState(false)

  // pitch link
  const [pitchLinkGenerating, setPitchLinkGenerating] = useState(false)

  // new contact form
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newForm, setNewForm] = useState({ name: "", phone: "", relationship: "agent_prospect", agency: "", note: "" })
  const [newSaving, setNewSaving] = useState(false)

  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const selected = contacts.find(c => c.id === selectedId) ?? null

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [cRes, dRes, vRes, sRes, tRes] = await Promise.all([
        authFetch(apiUrl("/api/sms-agent/contacts")),
        authFetch(apiUrl("/api/sms-agent/drafts")),
        authFetch(apiUrl("/api/sms-agent/voice-profile")),
        authFetch(apiUrl("/api/sms-agent/settings")),
        authFetch(apiUrl("/api/sms-agent/demo/target")),
      ])
      if ([cRes, dRes, vRes].some(r => r.status === 401)) { setAuthRequired(true); return }
      setAuthRequired(false)
      const cJson = await cRes.json() as { contacts?: Contact[] }
      const dJson = await dRes.json() as { drafts?: Draft[] }
      setContacts(cJson.contacts ?? [])
      setDrafts(dJson.drafts ?? [])
      const vJson = await vRes.json() as VoiceProfile & { error?: string }
      if (!vJson.error) setVoice(vJson)
      const sJson = await sRes.json() as { autoSend?: boolean }
      setAutoSend(!!sJson.autoSend)
      const tJson = await tRes.json() as { phone?: string | null }
      setDemoPhone(tJson.phone ?? null)
      setDemoPhoneInput(tJson.phone ?? "")
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { void load() }, 10_000)
    return () => clearInterval(t)
  }, [load])

  // ── Thread ────────────────────────────────────────────────────────────────────
  const loadThread = useCallback(async (c: Contact) => {
    try {
      const res = await authFetch(apiUrl(`/api/conversations/${encodeURIComponent(c.phone)}`))
      if (res.status === 404) { setThread([]); return }
      const json = await res.json() as { thread?: { messages?: ThreadMessage[] } }
      setThread(json.thread?.messages ?? [])
    } catch { setThread([]) }
  }, [])

  useEffect(() => {
    if (!selected) return
    void loadThread(selected)
    const t = setInterval(() => { void loadThread(selected) }, 5000)
    return () => clearInterval(t)
  }, [selected, loadThread])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [thread])
  useEffect(() => {
    setSuggestions([]); setSuggestCtx(null); setMrOpen(false); setMrResult(null)
    setEditContactOpen(false)
    const c = contacts.find(x => x.id === selectedId)
    if (c) {
      setEditForm({
        notes:        String((c.personalisation as Record<string,unknown> | undefined)?.notes ?? ""),
        agency:       c.rea_data?.agency_name ?? "",
        suburbs:      (c.rea_data?.target_suburbs ?? []).join(", "),
        listingCount: String(c.rea_data?.currently_listing_count ?? ""),
        soldAddress:  c.rea_data?.recently_sold_address ?? "",
        soldPrice:    c.rea_data?.recently_sold_price ?? "",
        objective:    c.conversation_objective ?? "",
        status:       c.status ?? "active",
      })
    }
  }, [selectedId, contacts])

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const login = useCallback(async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) return
    setLoggingIn(true)
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      })
      const json = await res.json() as { accessToken?: string; error?: string }
      if (!json.accessToken) { setActionMsg(json.error ?? "Login failed"); return }
      setAccessToken(json.accessToken)
      setLoginPass("")
      setAuthRequired(false)
      setLoading(true)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setLoggingIn(false) }
  }, [loginEmail, loginPassword, load])

  // ── Auto-send toggle (confirmation required) ─────────────────────────────────
  const toggleAutoSend = useCallback(async (confirmed: boolean) => {
    if (!autoSend && !confirmed) { setConfirmAutoSend(true); return }
    setConfirmAutoSend(false)
    setTogglingAuto(true)
    try {
      const next = !autoSend
      const res = await authFetch(apiUrl("/api/sms-agent/settings"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSend: next }),
      })
      const json = await res.json() as { ok?: boolean; autoSend?: boolean; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed"); return }
      setAutoSend(!!json.autoSend)
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setTogglingAuto(false) }
  }, [autoSend])

  // ── Seed ──────────────────────────────────────────────────────────────────────
  const seed = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/seed-stage1"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed to seed"); return }
      setActionMsg("Test contact created")
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
  }, [load])

  // ── Demo system ───────────────────────────────────────────────────────────────
  const loadDemoContacts = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/api/demo/contacts"))
      const json = await res.json() as { ok?: boolean; contacts?: typeof demoContacts }
      if (json.ok) setDemoContacts(json.contacts ?? [])
    } catch { /* non-fatal */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seedDemo = useCallback(async () => {
    setSeedingDemo(true)
    try {
      const res = await authFetch(apiUrl("/api/demo/seed"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const json = await res.json() as { ok?: boolean; seeded?: unknown[]; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed to seed demo contacts"); return }
      setActionMsg(`${json.seeded?.length ?? 0} demo contacts ready`)
      await loadDemoContacts(); await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setSeedingDemo(false) }
  }, [load, loadDemoContacts])

  const activateDemo = useCallback(async (key: string) => {
    if (!demoPhoneInput.trim()) { setActionMsg("Enter the REA agent's number first"); return }
    setDemoActivating(key)
    try {
      const res = await authFetch(apiUrl(`/api/demo/activate/${key}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPhone: demoPhoneInput.trim() }),
      })
      const json = await res.json() as { ok?: boolean; activated?: { name: string; phone: string; scenario: string }; message?: string; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed to activate"); return }
      setActionMsg(json.message ?? `Activated — tick ready_to_contact to fire the opener`)
      await loadDemoContacts(); await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setDemoActivating(null) }
  }, [demoPhoneInput, load, loadDemoContacts])

  const resetDemo = useCallback(async () => {
    setDemoResetting(true)
    try {
      await authFetch(apiUrl("/api/demo/reset"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      setActionMsg("Demo reset — all contacts back to placeholder phones")
      await loadDemoContacts(); await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setDemoResetting(false) }
  }, [load, loadDemoContacts])

  useEffect(() => { if (demoOpen) void loadDemoContacts() }, [demoOpen, loadDemoContacts])

  const queueOpener = useCallback(async () => {
    if (!selected) return
    setQueueingOpener(true)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}/queue-opener`), { method: "POST" })
      const json = await res.json() as { ok?: boolean; draftId?: number | null; preview?: string; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed"); return }
      setActionMsg(`Draft queued: "${json.preview}"`)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setQueueingOpener(false) }
  }, [selected, load])

  // ── Send ──────────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!selected || !composeText.trim()) return
    setSending(true)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}/send`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: composeText.trim() }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) setActionMsg(json.error ?? "Send failed")
      else { setComposeText(""); await loadThread(selected) }
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setSending(false) }
  }, [selected, composeText, loadThread])

  // ── Draft actions ─────────────────────────────────────────────────────────────
  const draftAction = useCallback(async (d: Draft, action: "approve" | "reject", edited?: string) => {
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/drafts/${d.id}/${action}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edited ? { editedBody: edited } : {}),
      })
      const json = await res.json() as { ok?: boolean; sent?: boolean; error?: string }
      if (json.ok === false) { setActionMsg(json.error ?? "Failed"); return }
      setActionMsg(action === "approve" ? (json.sent ? "Sent" : "Approved (SMS not configured)") : "Rejected")
      setEditingDraft(null)
      await load()
      if (selected?.id === d.contact_id) await loadThread(selected)
    } catch (e) { setActionMsg((e as Error).message) }
  }, [load, loadThread, selected])

  // ── AI suggestions ────────────────────────────────────────────────────────────
  const suggest = useCallback(async () => {
    if (!selected) return
    setSuggesting(true); setSuggestions([]); setSuggestCtx(null)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}/suggest`), { method: "POST" })
      const json = await res.json() as { suggestions?: Array<{ draft: string; tone: string; charCount: number }>; context?: string; error?: string }
      if (json.error) { setActionMsg(json.error); return }
      setSuggestions(json.suggestions ?? []); setSuggestCtx(json.context ?? null)
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setSuggesting(false) }
  }, [selected])

  const generateOpener = useCallback(async () => {
    if (!selected) return
    setSending(true)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/initiate/${selected.id}`), { method: "POST" })
      const json = await res.json() as { ok?: boolean; sent?: boolean; draft?: string; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed"); return }
      setActionMsg(json.sent ? `Opener sent` : `Draft ready: "${json.draft}"`)
      await loadThread(selected)
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setSending(false) }
  }, [selected, loadThread])

  // ── Voice calibration ─────────────────────────────────────────────────────────
  const calibrate = useCallback(async () => {
    const samples = calibrateText.split("\n").map(s => s.trim()).filter(Boolean)
    if (!samples.length) return
    setCalibrating(true)
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/calibrate"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples }),
      })
      const json = await res.json() as { ok?: boolean; confidence?: number; samples_analysed?: number; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed"); return }
      setActionMsg(`Voice updated — ${Math.round((json.confidence ?? 0) * 100)}% confidence from ${json.samples_analysed} samples`)
      setCalibrateText(""); setCalibrateOpen(false); await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setCalibrating(false) }
  }, [calibrateText, load])

  // ── Market Report Sequence ────────────────────────────────────────────────────
  const runMarketReport = useCallback(async () => {
    if (!selected || !mrSuburb.trim()) return
    setMrRunning(true); setMrResult(null)
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/sequences/market-report"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selected.id, suburb: mrSuburb.trim() }),
      })
      const json = await res.json() as { ok?: boolean; preview?: string; report?: { report?: string; keyStat?: string }; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed"); return }
      setMrResult(json.preview ?? "")
      setActionMsg(`Market report sequence queued for ${mrSuburb} — draft in approval queue`)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setMrRunning(false) }
  }, [selected, mrSuburb, load])

  // ── Save contact edits ────────────────────────────────────────────────────────
  const saveContactEdit = useCallback(async () => {
    if (!selected) return
    setEditSaving(true)
    try {
      const suburbList = editForm.suburbs.split(",").map(s => s.trim()).filter(Boolean)
      const rea_data: ReaData = {}
      if (editForm.agency) rea_data.agency_name = editForm.agency
      if (suburbList.length) rea_data.target_suburbs = suburbList
      if (editForm.listingCount) rea_data.currently_listing_count = parseInt(editForm.listingCount, 10) || 0
      if (editForm.soldAddress) rea_data.recently_sold_address = editForm.soldAddress
      if (editForm.soldPrice) rea_data.recently_sold_price = editForm.soldPrice

      const body: Record<string, unknown> = {
        rea_data: Object.keys(rea_data).length ? rea_data : undefined,
        conversation_objective: editForm.objective || null,
        status: editForm.status,
      }
      if (editForm.notes !== undefined) body.personalisation = { notes: editForm.notes }

      await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}`), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setEditContactOpen(false)
      setActionMsg("Contact updated")
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setEditSaving(false) }
  }, [selected, editForm, load])

  // ── Generate pitch link ───────────────────────────────────────────────────────
  const generatePitchLink = useCallback(async () => {
    if (!selected) return
    setPitchLinkGenerating(true)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}/pitch`), { method: "POST" })
      const json = await res.json() as { url?: string; error?: string }
      if (json.error) { setActionMsg(json.error); return }
      setActionMsg(`Pitch link ready — ${json.url}`)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setPitchLinkGenerating(false) }
  }, [selected, load])

  // ── Create new contact ────────────────────────────────────────────────────────
  const createContact = useCallback(async () => {
    if (!newForm.name.trim() || !newForm.phone.trim()) return
    setNewSaving(true)
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/contacts"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newForm.name.trim(),
          phone: newForm.phone.trim(),
          relationship: newForm.relationship,
          rea_data: newForm.agency ? { agency_name: newForm.agency } : undefined,
          personalisation: newForm.note ? { notes: newForm.note } : undefined,
          source: "manual_ui",
        }),
      })
      const json = await res.json() as { ok?: boolean; id?: number; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed to create contact"); return }
      setNewContactOpen(false)
      setNewForm({ name: "", phone: "", relationship: "agent_prospect", agency: "", note: "" })
      await load()
      if (json.id) { setSelectedId(json.id); if (!isDesktop) setMobilePanel("thread") }
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setNewSaving(false) }
  }, [newForm, load, isDesktop])

  // ── Sorted contacts ───────────────────────────────────────────────────────────
  const sortedContacts = [...contacts].sort((a, b) => {
    if (sortBy === "score") return (b.prospectability ?? 50) - (a.prospectability ?? 50)
    const ta = a.last_contact ? new Date(a.last_contact).getTime() : 0
    const tb = b.last_contact ? new Date(b.last_contact).getTime() : 0
    return tb - ta
  })

  // ── Styles ────────────────────────────────────────────────────────────────────
  const card: CSSProperties = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? 14 : 18 }
  const btn: CSSProperties  = { fontSize: 11.5, fontWeight: 700, border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: FONT }
  const confPct = voiceProfile ? Math.round(voiceProfile.confidence * 100) : 0

  // ── Render helpers ────────────────────────────────────────────────────────────
  const selectContact = (id: number) => {
    setSelectedId(id)
    if (!isDesktop) setMobilePanel("thread")
  }

  // ── Auth screen ───────────────────────────────────────────────────────────────
  if (authRequired) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: "0 16px" }}>
        <div style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Voice Agent</h2>
          <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 16px" }}>Sign in with your PropOS account.</p>
          <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="Email"
            style={{ width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT, marginBottom: 8 }} />
          <input value={loginPassword} onChange={e => setLoginPass(e.target.value)} placeholder="Password" type="password"
            onKeyDown={e => { if (e.key === "Enter") void login() }}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT, marginBottom: 12 }} />
          <button onClick={() => void login()} disabled={loggingIn || !loginEmail.trim() || !loginPassword.trim()}
            style={{ ...btn, color: C.bg, background: "var(--accent)", width: "100%", padding: "10px 14px", opacity: loggingIn ? 0.5 : 1 }}>
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
          {actionMsg && <p style={{ fontSize: 11.5, color: C.red, marginTop: 8 }}>{actionMsg}</p>}
        </div>
      </div>
    )
  }

  // ── Auto-send confirm modal ───────────────────────────────────────────────────
  const AutoSendModal = confirmAutoSend ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Enable auto-send?</div>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: "0 0 16px" }}>
          Auto-send lets the AI reply without approval — but <strong>only</strong> when all of these are true:
          the message is under 50 chars, voice confidence is above 90%, and the reply is purely factual
          (e.g. "ok thanks 👍"). Everything else still goes to your approval queue.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void toggleAutoSend(true)} style={{ ...btn, color: C.bg, background: C.green, flex: 1 }}>
            Yes, enable auto-send
          </button>
          <button onClick={() => setConfirmAutoSend(false)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ── New contact modal ─────────────────────────────────────────────────────────
  const inp: CSSProperties = { width: "100%", boxSizing: "border-box" as const, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 11px", color: C.text, fontSize: 12.5, fontFamily: FONT, marginBottom: 8 }
  const NewContactModal = newContactOpen ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>New Contact</div>
        <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *" style={inp} />
        <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone e.g. 0426 719 845 *" style={inp} />
        <select value={newForm.relationship} onChange={e => setNewForm(f => ({ ...f, relationship: e.target.value }))} style={{ ...inp, marginBottom: 8 }}>
          <option value="agent_prospect">Agent prospect</option>
          <option value="business_partner">Business partner</option>
          <option value="close_friend">Close friend</option>
          <option value="family">Family</option>
        </select>
        <input value={newForm.agency} onChange={e => setNewForm(f => ({ ...f, agency: e.target.value }))} placeholder="Agency (optional)" style={inp} />
        <input value={newForm.note} onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))} placeholder="Notes (optional)" style={{ ...inp, marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void createContact()} disabled={newSaving || !newForm.name.trim() || !newForm.phone.trim()}
            style={{ ...btn, color: C.bg, background: "var(--accent)", flex: 1, opacity: newSaving || !newForm.name.trim() || !newForm.phone.trim() ? 0.5 : 1 }}>
            {newSaving ? "Saving..." : "Add contact"}
          </button>
          <button onClick={() => { setNewContactOpen(false); setNewForm({ name: "", phone: "", relationship: "agent_prospect", agency: "", note: "" }) }}
            style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  ) : null

  // ── Contacts panel ────────────────────────────────────────────────────────────
  const ContactsPanel = (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Contacts ({contacts.length})
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setNewContactOpen(true)} style={{ ...btn, fontSize: 10, padding: "3px 8px", color: "var(--accent)", background: "transparent", border: `1px solid ${"var(--accent)"}40` }}>
            + New
          </button>
          <button onClick={() => setSortBy("score")} style={{ ...btn, fontSize: 10, padding: "3px 8px", color: sortBy === "score" ? C.text : C.faint, background: sortBy === "score" ? C.bg3 : "transparent", border: `1px solid ${sortBy === "score" ? C.border : "transparent"}` }}>
            Score
          </button>
          <button onClick={() => setSortBy("recent")} style={{ ...btn, fontSize: 10, padding: "3px 8px", color: sortBy === "recent" ? C.text : C.faint, background: sortBy === "recent" ? C.bg3 : "transparent", border: `1px solid ${sortBy === "recent" ? C.border : "transparent"}` }}>
            Recent
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {sortedContacts.map(c => {
          const active = c.id === selectedId
          const sc = c.score_label
          return (
            <button key={c.id} onClick={() => selectContact(c.id)} style={{
              textAlign: "left", background: active ? C.bg3 : "transparent",
              border: `1px solid ${active ? C.borderHover : "transparent"}`,
              borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: FONT, width: "100%",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {c.prospectability !== undefined && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, borderRadius: 6, padding: "2px 6px",
                      color: scoreColor(sc), background: scoreDim(sc),
                    }}>
                      {scoreEmoji(sc)} {c.prospectability}
                    </span>
                  )}
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: c.auto_reply ? C.green : C.faint, background: c.auto_reply ? C.greenDim : "rgba(213,219,230,0.08)", borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" }}>
                    {c.auto_reply ? "auto" : "manual"}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{c.relationship.replace(/_/g, " ")}</span>
                {c.rea_data?.agency_name && <span>· {c.rea_data.agency_name}</span>}
                {c.last_contact && <span>· {timeAgo(c.last_contact)}</span>}
              </div>
              {c.score_highlights && c.score_highlights.length > 0 && (
                <div style={{ fontSize: 9.5, color: scoreColor(sc), marginTop: 3 }}>
                  {c.score_highlights.join(" · ")}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  // ── Thread panel ──────────────────────────────────────────────────────────────
  const ThreadPanel = (
    <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: isMobile ? "calc(100vh - 180px)" : 460 }}>
      {selected ? (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            {!isDesktop && (
              <button onClick={() => setMobilePanel("list")} style={{ ...btn, fontSize: 11, padding: "5px 10px", color: C.muted, background: "transparent", border: `1px solid ${C.border}`, flexShrink: 0, marginTop: 1 }}>
                ← Back
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</div>
              <div style={{ fontSize: 10.5, color: C.faint, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{selected.phone}</span>
                {selected.rea_data?.agency_name && <span>· {selected.rea_data.agency_name}</span>}
                {selected.rea_data?.currently_listing_count != null && selected.rea_data.currently_listing_count > 0 && (
                  <span style={{ color: C.green }}>· {selected.rea_data.currently_listing_count} listing{selected.rea_data.currently_listing_count > 1 ? "s" : ""}</span>
                )}
                {selected.rea_data?.target_suburbs && selected.rea_data.target_suburbs.length > 0 && (
                  <span>· {selected.rea_data.target_suburbs.slice(0, 2).join(", ")}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 4 }}>
              {selected.prospectability !== undefined && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: C.faint }}>Prospect</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(selected.score_label) }}>{selected.prospectability}</div>
                  <div style={{ fontSize: 9, color: C.faint }}>Interest {selected.interest}</div>
                </div>
              )}
              <button onClick={() => setEditContactOpen(v => !v)} style={{ ...btn, fontSize: 10, padding: "3px 8px", color: editContactOpen ? C.text : C.faint, background: editContactOpen ? C.bg3 : "transparent", border: `1px solid ${C.border}` }}>
                {editContactOpen ? "Close" : "Edit"}
              </button>
            </div>
          </div>

          {/* Inline contact editor */}
          {editContactOpen && (
            <div style={{ background: C.bg3, borderRadius: 12, padding: 12, marginBottom: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Edit Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Agency</div>
                  <input value={editForm.agency} onChange={e => setEditForm(f => ({ ...f, agency: e.target.value }))} placeholder="Harcourts Dandenong" style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Active listings</div>
                  <input value={editForm.listingCount} onChange={e => setEditForm(f => ({ ...f, listingCount: e.target.value }))} placeholder="2" type="number" style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Target suburbs (comma-separated)</div>
                <input value={editForm.suburbs} onChange={e => setEditForm(f => ({ ...f, suburbs: e.target.value }))} placeholder="Berwick, Narre Warren, Cranbourne" style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Last sold address</div>
                  <input value={editForm.soldAddress} onChange={e => setEditForm(f => ({ ...f, soldAddress: e.target.value }))} placeholder="12 Park Ave Dandenong" style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Last sold price</div>
                  <input value={editForm.soldPrice} onChange={e => setEditForm(f => ({ ...f, soldPrice: e.target.value }))} placeholder="$742,000" style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Conversation objective</div>
                <input value={editForm.objective} onChange={e => setEditForm(f => ({ ...f, objective: e.target.value }))} placeholder="Book a listing appraisal" style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 2 }}>Notes</div>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Met at open home — keen on Berwick area" rows={2}
                  style={{ ...inp, resize: "vertical" as const, marginBottom: 0 }} />
              </div>
              {/* Pitch link */}
              <div style={{ marginTop: 8, padding: "8px 10px", background: C.bg2, borderRadius: 9, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 9.5, color: C.faint, marginBottom: 6 }}>Pitch report link</div>
                {selected?.personalisation?.pitch_url ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <a href={selected.personalisation.pitch_url as string} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "var(--accent)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selected.personalisation.pitch_url as string}
                    </a>
                    <button onClick={() => {
                      void navigator.clipboard.writeText(selected.personalisation!.pitch_url as string)
                      setActionMsg("Link copied")
                    }} style={{ ...btn, fontSize: 10, padding: "3px 8px", color: C.muted, background: "transparent", border: `1px solid ${C.border}`, flexShrink: 0 }}>
                      Copy
                    </button>
                    <button onClick={() => void generatePitchLink()} disabled={pitchLinkGenerating}
                      style={{ ...btn, fontSize: 10, padding: "3px 8px", color: C.faint, background: "transparent", border: `1px solid ${C.border}`, flexShrink: 0, opacity: pitchLinkGenerating ? 0.5 : 1 }}>
                      Regen
                    </button>
                  </div>
                ) : (
                  <button onClick={() => void generatePitchLink()} disabled={pitchLinkGenerating}
                    style={{ ...btn, fontSize: 11, padding: "5px 12px", color: "var(--accent)", background: "var(--accent-dim, rgba(123,53,190,0.12))", border: `1px solid ${"var(--accent)"}40`, opacity: pitchLinkGenerating ? 0.5 : 1 }}>
                    {pitchLinkGenerating ? "Generating report..." : "Generate report link"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  style={{ ...inp, marginBottom: 0, width: "auto", flex: 1 }}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="backlog">Backlog</option>
                  <option value="completed">Completed</option>
                  <option value="opted_out">Opted out</option>
                </select>
                <button onClick={() => void saveContactEdit()} disabled={editSaving} style={{ ...btn, color: C.bg, background: "var(--accent)", opacity: editSaving ? 0.5 : 1 }}>
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Thread */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: isMobile ? "40vh" : undefined }}>
            {thread.length === 0
              ? <div style={{ fontSize: 12.5, color: C.muted }}>No messages yet.</div>
              : thread.map((msg, i) => (
                <div key={i} style={{ alignSelf: msg.role === "agent" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                  <div style={{
                    fontSize: 12.5, lineHeight: 1.5, padding: "9px 12px", borderRadius: 14,
                    background: msg.role === "agent" ? "var(--accent-dim, rgba(123,53,190,0.18))" : C.bg3,
                    color: C.text,
                    borderBottomRightRadius: msg.role === "agent" ? 4 : 14,
                    borderBottomLeftRadius: msg.role === "agent" ? 14 : 4,
                  }}>{msg.body}</div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginTop: 3, textAlign: msg.role === "agent" ? "right" : "left" }}>
                    {msg.role === "agent" ? "You" : selected.name.split(" ")[0]} · {timeAgo(msg.ts)}
                  </div>
                </div>
              ))
            }
            <div ref={threadEndRef} />
          </div>

          {/* AI suggestions */}
          {suggestions.length > 0 && (
            <div style={{ background: C.bg3, borderRadius: 12, padding: 10, marginBottom: 10 }}>
              {suggestCtx && <div style={{ fontSize: 10, color: C.faint, marginBottom: 6 }}>Context: {suggestCtx}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => { setComposeText(s.draft); setSuggestions([]) }} style={{
                    textAlign: "left", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
                    padding: "7px 10px", cursor: "pointer", fontFamily: FONT, width: "100%",
                  }}>
                    <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.4 }}>{s.draft}</div>
                    <div style={{ fontSize: 9.5, color: C.faint, marginTop: 3 }}>{s.tone} · {s.charCount} chars</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setSuggestions([])} style={{ ...btn, color: C.faint, background: "transparent", fontSize: 10, marginTop: 5, padding: "2px 6px" }}>Dismiss</button>
            </div>
          )}

          {/* Market Report Sequence panel */}
          {mrOpen && (
            <div style={{ background: C.bg3, borderRadius: 12, padding: 12, marginBottom: 10, border: `1px solid ${C.orange}40` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 8 }}>MARKET REPORT SEQUENCE</div>
              {selected.rea_data?.target_suburbs && selected.rea_data.target_suburbs.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                  {selected.rea_data.target_suburbs.map(s => (
                    <button key={s} onClick={() => setMrSuburb(s)} style={{
                      ...btn, fontSize: 11, padding: "4px 10px", fontFamily: FONT,
                      color: mrSuburb === s ? C.bg : C.orange, background: mrSuburb === s ? C.orange : "transparent",
                      border: `1px solid ${C.orange}60`,
                    }}>{s}</button>
                  ))}
                </div>
              ) : null}
              <input
                value={mrSuburb} onChange={e => setMrSuburb(e.target.value)}
                placeholder="Suburb (e.g. Berwick)"
                style={{ width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 12.5, fontFamily: FONT, marginBottom: 8 }}
              />
              {mrResult && <div style={{ fontSize: 11.5, color: C.green, marginBottom: 8 }}>Draft queued: "{mrResult}"</div>}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => void runMarketReport()} disabled={mrRunning || !mrSuburb.trim()} style={{
                  ...btn, color: C.bg, background: C.orange, opacity: mrRunning || !mrSuburb.trim() ? 0.5 : 1,
                }}>
                  {mrRunning ? "Generating..." : "Queue opener"}
                </button>
                <button onClick={() => { setMrOpen(false); setMrResult(null) }} style={{ ...btn, color: C.faint, background: "transparent", border: `1px solid ${C.border}` }}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Compose */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={composeText} onChange={e => setComposeText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="Type a message — sends via iMessage"
              style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT }}
            />
            <button onClick={() => void send()} disabled={sending || !composeText.trim()} style={{
              ...btn, color: C.bg, background: "var(--accent)", opacity: sending || !composeText.trim() ? 0.5 : 1,
            }}>{sending ? "..." : "Send"}</button>
          </div>

          {/* Action row */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => void suggest()} disabled={suggesting} style={{ ...btn, color: C.purple, background: "transparent", border: `1px solid ${C.purple}40`, opacity: suggesting ? 0.5 : 1, fontSize: 10.5 }}>
              {suggesting ? "Thinking..." : "Suggest"}
            </button>
            {thread.length === 0 && (
              <button onClick={() => void generateOpener()} disabled={sending} style={{ ...btn, color: C.green, background: "transparent", border: `1px solid ${C.green}40`, opacity: sending ? 0.5 : 1, fontSize: 10.5 }}>
                Generate opener
              </button>
            )}
            <button onClick={() => void queueOpener()} disabled={queueingOpener} style={{ ...btn, color: C.green, background: "transparent", border: `1px solid ${C.green}40`, opacity: queueingOpener ? 0.5 : 1, fontSize: 10.5 }}>
              {queueingOpener ? "Queuing..." : "Queue opener"}
            </button>
            <button onClick={() => { setMrOpen(v => !v); setMrResult(null) }} style={{ ...btn, color: C.orange, background: "transparent", border: `1px solid ${C.orange}40`, fontSize: 10.5 }}>
              {mrOpen ? "Close report" : "Market report"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted, textAlign: "center", padding: "40px 0", margin: "auto" }}>
          {isMobile ? "Tap a contact to start." : "Select a contact to start texting."}
        </div>
      )}
    </div>
  )

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: `${isDesktop ? 84 : 70}px ${isMobile ? 12 : 16}px 60px` }}>
      {AutoSendModal}
      {NewContactModal}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: -0.4 }}>Voice Agent</h1>
          {!isMobile && <p style={{ fontSize: 12, color: C.muted, margin: "3px 0 0" }}>Conversational SMS via BlueBubbles · iMessage from your real number</p>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {voiceProfile && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: "4px 9px",
              color: confPct >= 70 ? C.green : C.orange,
              background: confPct >= 70 ? C.greenDim : C.orangeDim,
              border: `1px solid ${(confPct >= 70 ? C.green : C.orange)}40`,
            }}>
              {confPct}% voice
            </span>
          )}
          <button
            onClick={() => void toggleAutoSend(false)}
            disabled={togglingAutoSend}
            title="Auto-sends only trivial replies (<50 chars, >90% confidence) without approval"
            style={{
              ...btn,
              color: autoSend ? C.green : C.muted,
              background: autoSend ? C.greenDim : "transparent",
              border: `1px solid ${autoSend ? C.green + "40" : C.border}`,
              opacity: togglingAutoSend ? 0.6 : 1,
              fontSize: isMobile ? 11 : 11.5,
            }}
          >
            Auto {autoSend ? "ON" : "OFF"}
          </button>
          <button onClick={() => setCalibrateOpen(v => !v)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, fontSize: isMobile ? 11 : 11.5 }}>
            {calibrateOpen ? "Close" : "Calibrate"}
          </button>
          <button onClick={() => setDemoOpen(v => !v)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, fontSize: isMobile ? 11 : 11.5 }}>
            {demoOpen ? "Close" : "Demo"}
          </button>
          <button onClick={() => void load()} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, fontSize: isMobile ? 11 : 11.5 }}>↻</button>
        </div>
      </div>

      {/* Action banner */}
      {actionMsg && (
        <div style={{ fontSize: 12, color: C.text, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontFamily: FONT, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Calibrate panel */}
      {calibrateOpen && (
        <div style={{ ...card, marginBottom: 16, borderColor: `${C.purple}40` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Calibrate voice</div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 8px" }}>Paste 20+ of your real texts, one per line.</p>
          <textarea
            value={calibrateText} onChange={e => setCalibrateText(e.target.value)}
            placeholder={"yeah sounds good, tuesday arvo works\nhaha yeah fair enough\ncan't make tonight sorry, next round though\n..."}
            style={{ width: "100%", minHeight: 110, resize: "vertical", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, color: C.text, fontSize: 12, fontFamily: FONT, lineHeight: 1.6, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 10.5, color: C.faint }}>{calibrateText.split("\n").map(s => s.trim()).filter(Boolean).length} samples</span>
            <button onClick={() => void calibrate()} disabled={calibrating || !calibrateText.trim()} style={{ ...btn, color: C.bg, background: C.purple, opacity: calibrating || !calibrateText.trim() ? 0.5 : 1 }}>
              {calibrating ? "Calibrating..." : "Calibrate"}
            </button>
          </div>
        </div>
      )}

      {/* Demo Mode panel */}
      {demoOpen && (
        <div style={{ ...card, marginBottom: 16, borderColor: `${C.orange}40` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Demo Mode — Live Scenarios</div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            4 buyer lifecycle scenarios. Enter the REA agent&apos;s number, then Activate a scenario — their phone will receive an iMessage from yours (via BlueBubbles) once you tick ready_to_contact.
          </p>

          {/* Recipient phone + seed/reset row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              value={demoPhoneInput} onChange={e => setDemoPhoneInput(e.target.value)}
              placeholder="REA agent's number e.g. 0426 719 845"
              style={{ flex: 1, minWidth: 180, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 12.5, fontFamily: FONT, boxSizing: "border-box" }}
            />
            <button onClick={() => void seedDemo()} disabled={seedingDemo}
              style={{ ...btn, color: C.bg, background: "var(--accent)", opacity: seedingDemo ? 0.5 : 1, flexShrink: 0 }}>
              {seedingDemo ? "Seeding..." : "Seed contacts"}
            </button>
            <button onClick={() => void resetDemo()} disabled={demoResetting}
              style={{ ...btn, color: C.faint, background: "transparent", border: `1px solid ${C.border}`, opacity: demoResetting ? 0.5 : 1, flexShrink: 0 }}>
              {demoResetting ? "Resetting..." : "Reset"}
            </button>
          </div>
          {demoPhone && <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 10 }}>Legacy demo target: {demoPhone}</div>}

          {/* Scenario cards */}
          {demoContacts.length === 0 ? (
            <div style={{ fontSize: 11.5, color: C.faint }}>No demo contacts yet — click &quot;Seed contacts&quot; to load the 4 scenarios.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {demoContacts.map(dc => (
                <div key={dc.key} style={{
                  background: dc.isActive ? `${C.green}18` : C.bg3,
                  border: `1px solid ${dc.isActive ? C.green + "60" : C.border}`,
                  borderRadius: 11, padding: "10px 12px",
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{dc.name}</span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, borderRadius: 5, padding: "1px 6px",
                        color: dc.isActive ? C.green : C.orange,
                        background: dc.isActive ? C.greenDim : C.orangeDim,
                      }}>{dc.tag}</span>
                      {dc.isActive && <span style={{ fontSize: 9.5, color: C.green }}>LIVE → {dc.phone}</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.4 }}>{dc.summary}</div>
                  </div>
                  <button
                    onClick={() => void activateDemo(dc.key)}
                    disabled={demoActivating === dc.key || !demoPhoneInput.trim()}
                    title={!demoPhoneInput.trim() ? "Enter recipient phone first" : undefined}
                    style={{
                      ...btn, flexShrink: 0, fontSize: 11,
                      color: dc.isActive ? C.faint : C.bg,
                      background: dc.isActive ? "transparent" : C.green,
                      border: dc.isActive ? `1px solid ${C.border}` : "none",
                      opacity: demoActivating === dc.key || (!dc.isActive && !demoPhoneInput.trim()) ? 0.5 : 1,
                    }}
                  >
                    {demoActivating === dc.key ? "..." : dc.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 10.5, color: C.faint, margin: "10px 0 0", lineHeight: 1.5 }}>
            After activating: go to the contact in the list, tick ready_to_contact (or use Queue opener), then approve the draft.
          </p>
        </div>
      )}

      {/* Drafts queue */}
      {drafts.length > 0 && (
        <div style={{ ...card, marginBottom: 16, borderColor: `${C.orange}40` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {drafts.length} draft{drafts.length > 1 ? "s" : ""} awaiting approval
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {drafts.map(d => (
              <div key={d.id} style={{ background: C.bg3, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 5 }}>
                  {d.inbound_body ? `${d.contact_name} said: "${d.inbound_body.slice(0, 80)}"` : `New ${d.kind} for ${d.contact_name}`}
                </div>
                {editingDraftId === d.id ? (
                  <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)}
                    style={{ width: "100%", minHeight: 60, resize: "vertical", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 13, fontFamily: FONT, lineHeight: 1.5, boxSizing: "border-box", marginBottom: 10 }} />
                ) : (
                  <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 10 }}>{d.draft_body}</div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {editingDraftId === d.id ? (
                    <>
                      <button onClick={() => void draftAction(d, "approve", editedBody)} style={{ ...btn, color: C.bg, background: C.green }}>Send edited</button>
                      <button onClick={() => setEditingDraft(null)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void draftAction(d, "approve")} style={{ ...btn, color: C.bg, background: C.green }}>Approve + send</button>
                      <button onClick={() => { setEditingDraft(d.id); setEditedBody(d.draft_body) }} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>Edit</button>
                      <button onClick={() => void draftAction(d, "reject")} style={{ ...btn, color: C.red, background: "transparent", border: `1px solid ${C.red}40` }}>Reject</button>
                    </>
                  )}
                  <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>
                    {Math.round(parseFloat(d.voice_confidence) * 100)}% · {d.kind} · {timeAgo(d.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div style={{ ...card, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>No contacts yet.</p>
          <button onClick={() => void seed()} style={{ ...btn, color: C.bg, background: "var(--accent)" }}>Create test contact</button>
        </div>
      ) : isDesktop ? (
        // Desktop: side-by-side
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
          {ContactsPanel}
          {ThreadPanel}
        </div>
      ) : isTablet ? (
        // Tablet: narrower sidebar
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
          {ContactsPanel}
          {ThreadPanel}
        </div>
      ) : (
        // Mobile: single panel, toggle between list and thread
        mobilePanel === "list" ? ContactsPanel : ThreadPanel
      )}
    </div>
  )
}
