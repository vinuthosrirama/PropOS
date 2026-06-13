/**
 * VoiceAgentView — SMS Agent cockpit (Stages 1-4, see docs/SMS_AGENT.md).
 *
 * Lets Vinuth:
 *  - Have a real iMessage conversation through PropOS (type → send via BlueBubbles,
 *    see the thread update as replies come in).
 *  - Review, edit, approve or reject AI-drafted replies.
 *  - Calibrate the voice profile from real text samples.
 *
 * All data via /api/sms-agent/* and /api/conversations/*, JWT-authed via authFetch.
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react"
import { C, FONT } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { authFetch, setAccessToken } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Contact {
  id: number
  name: string
  phone: string
  relationship: string
  stage: number
  status: string
  auto_reply: boolean
  last_contact: string | null
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
  profile?: Record<string, unknown>
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

export default function VoiceAgentView() {
  const bp = useBreakpoint()
  const isDesktop = bp === "desktop"

  const [contacts, setContacts] = useState<Contact[]>([])
  const [drafts, setDrafts]     = useState<Draft[]>([])
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)
  const [selectedId, setSelected] = useState<number | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [composeText, setComposeText] = useState("")
  const [sending, setSending] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null)
  const [editedBody, setEditedBody] = useState("")
  const [calibrateOpen, setCalibrateOpen] = useState(false)
  const [calibrateText, setCalibrateText] = useState("")
  const [calibrating, setCalibrating] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)

  const threadEndRef = useRef<HTMLDivElement | null>(null)

  const selected = contacts.find(c => c.id === selectedId) ?? null

  // ── Load contacts, drafts, voice profile ──────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [cRes, dRes, vRes] = await Promise.all([
        authFetch(apiUrl("/api/sms-agent/contacts")),
        authFetch(apiUrl("/api/sms-agent/drafts")),
        authFetch(apiUrl("/api/sms-agent/voice-profile")),
      ])
      if (cRes.status === 401 || dRes.status === 401 || vRes.status === 401) {
        setAuthRequired(true)
        return
      }
      setAuthRequired(false)
      const cJson = await cRes.json() as { contacts?: Contact[] }
      const dJson = await dRes.json() as { drafts?: Draft[] }
      setContacts(cJson.contacts ?? [])
      setDrafts(dJson.drafts ?? [])
      const vJson = await vRes.json() as VoiceProfile & { error?: string }
      if (!vJson.error) setVoiceProfile(vJson)
    } catch (e) {
      setActionMsg((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Poll every 10s so replies show up without manual refresh
  useEffect(() => {
    const t = setInterval(() => { void load() }, 10000)
    return () => clearInterval(t)
  }, [load])

  // ── Load thread for selected contact ───────────────────────────────────────────
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

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [thread])

  // ── Login (Voice Agent requires a real PropOS account, not the guest demo) ───────
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
      setLoginPassword("")
      setAuthRequired(false)
      setLoading(true)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setLoggingIn(false) }
  }, [loginEmail, loginPassword, load])

  // ── Seed a test contact if there are none ───────────────────────────────────────
  const seed = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/seed-stage1"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Failed to seed"); return }
      setActionMsg("Test contact created — sends redirect to your test phone")
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
  }, [load])

  // ── Send a typed message ────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!selected || !composeText.trim()) return
    setSending(true)
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/contacts/${selected.id}/send`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: composeText.trim() }),
      })
      const json = await res.json() as { ok?: boolean; sent?: boolean; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Send failed") }
      else {
        setComposeText("")
        await loadThread(selected)
      }
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setSending(false) }
  }, [selected, composeText, loadThread])

  // ── Draft actions ────────────────────────────────────────────────────────────────
  const draftAction = useCallback(async (d: Draft, action: "approve" | "reject", edited?: string) => {
    try {
      const res = await authFetch(apiUrl(`/api/sms-agent/drafts/${d.id}/${action}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edited ? { editedBody: edited } : {}),
      })
      const json = await res.json() as { ok?: boolean; sent?: boolean; error?: string }
      if (json.ok === false) { setActionMsg(json.error ?? "Failed"); return }
      setActionMsg(action === "approve" ? (json.sent ? "Sent" : "Approved (not sent — SMS not configured)") : "Rejected")
      setEditingDraftId(null)
      await load()
      if (selected && selected.id === d.contact_id) await loadThread(selected)
    } catch (e) { setActionMsg((e as Error).message) }
  }, [load, loadThread, selected])

  // ── Voice calibration ────────────────────────────────────────────────────────────
  const calibrate = useCallback(async () => {
    const samples = calibrateText.split("\n").map(s => s.trim()).filter(Boolean)
    if (samples.length === 0) return
    setCalibrating(true)
    try {
      const res = await authFetch(apiUrl("/api/sms-agent/calibrate"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples }),
      })
      const json = await res.json() as { ok?: boolean; confidence?: number; samples_analysed?: number; error?: string }
      if (!json.ok) { setActionMsg(json.error ?? "Calibration failed"); return }
      setActionMsg(`Voice recalibrated — confidence ${Math.round((json.confidence ?? 0) * 100)}% from ${json.samples_analysed} samples`)
      setCalibrateText("")
      setCalibrateOpen(false)
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
    finally { setCalibrating(false) }
  }, [calibrateText, load])

  // ── Styles ──────────────────────────────────────────────────────────────────────
  const card: CSSProperties = {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18,
  }
  const btn: CSSProperties = {
    fontSize: 11.5, fontWeight: 700, border: "none", borderRadius: 8, padding: "6px 14px",
    cursor: "pointer", fontFamily: FONT,
  }
  const confidencePct = voiceProfile ? Math.round(voiceProfile.confidence * 100) : 0

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: `${isDesktop ? 84 : 70}px 16px 60px` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: -0.4 }}>Voice Agent</h1>
          <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 0" }}>
            Conversational SMS/iMessage agent. Texts go through BlueBubbles to your real phone.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {voiceProfile && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: "4px 9px",
              color: confidencePct >= 70 ? C.green : C.orange,
              background: confidencePct >= 70 ? C.greenDim : C.orangeDim,
              border: `1px solid ${(confidencePct >= 70 ? C.green : C.orange)}40`,
            }}>
              Voice confidence {confidencePct}% ({voiceProfile.samples_analysed} samples)
            </span>
          )}
          <button onClick={() => setCalibrateOpen(v => !v)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>
            {calibrateOpen ? "Close" : "Calibrate voice"}
          </button>
          <button onClick={() => void load()} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>
            Refresh
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{ fontSize: 12, color: C.text, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontFamily: FONT }}>×</button>
        </div>
      )}

      {authRequired ? (
        <div style={{ ...card, maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
            Sign in with your PropOS account to use the Voice Agent.
          </p>
          <input
            value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="Email"
            style={{ width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT, marginBottom: 8 }}
          />
          <input
            value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Password" type="password"
            onKeyDown={e => { if (e.key === "Enter") void login() }}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT, marginBottom: 12 }}
          />
          <button onClick={() => void login()} disabled={loggingIn || !loginEmail.trim() || !loginPassword.trim()} style={{
            ...btn, color: C.bg, background: "var(--accent)", width: "100%", padding: "10px 14px",
            opacity: loggingIn || !loginEmail.trim() || !loginPassword.trim() ? 0.5 : 1,
          }}>
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
        </div>
      ) : (
      <>
      {/* Voice calibration panel */}
      {calibrateOpen && (
        <div style={{ ...card, marginBottom: 18, borderColor: `${C.purple}40` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Calibrate voice from real texts
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 10px" }}>
            Paste 20+ real texts you've sent, one per line. The agent analyses greeting style, length,
            slang, punctuation, sign-offs and emoji habits — and rewrites your voice profile.
          </p>
          <textarea
            value={calibrateText}
            onChange={e => setCalibrateText(e.target.value)}
            placeholder={"yeah sounds good, tuesday arvo works for me\nhaha yeah fair enough\ncan't make tonight sorry, next round though\n..."}
            style={{
              width: "100%", minHeight: 140, resize: "vertical", background: C.bg3, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 12, color: C.text, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: C.faint }}>
              {calibrateText.split("\n").map(s => s.trim()).filter(Boolean).length} sample(s)
            </span>
            <button onClick={() => void calibrate()} disabled={calibrating || !calibrateText.trim()} style={{
              ...btn, color: C.bg, background: C.purple, opacity: calibrating || !calibrateText.trim() ? 0.5 : 1,
            }}>
              {calibrating ? "Calibrating..." : "Calibrate"}
            </button>
          </div>
        </div>
      )}

      {/* Pending drafts */}
      {drafts.length > 0 && (
        <div style={{ ...card, marginBottom: 18, borderColor: `${C.orange}40` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {drafts.length} AI {drafts.length === 1 ? "draft" : "drafts"} awaiting your approval
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {drafts.map(d => (
              <div key={d.id} style={{ background: C.bg3, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>
                  {d.contact_name} said: "{d.inbound_body}"
                </div>
                {editingDraftId === d.id ? (
                  <textarea
                    value={editedBody}
                    onChange={e => setEditedBody(e.target.value)}
                    style={{
                      width: "100%", minHeight: 60, resize: "vertical", background: C.bg, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: 10, color: C.text, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.5,
                      boxSizing: "border-box", marginBottom: 12,
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 12 }}>{d.draft_body}</div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {editingDraftId === d.id ? (
                    <>
                      <button onClick={() => void draftAction(d, "approve", editedBody)} style={{ ...btn, color: C.bg, background: C.green }}>
                        Send edited
                      </button>
                      <button onClick={() => setEditingDraftId(null)} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void draftAction(d, "approve")} style={{ ...btn, color: C.bg, background: C.green }}>
                        Approve and send
                      </button>
                      <button onClick={() => { setEditingDraftId(d.id); setEditedBody(d.draft_body) }} style={{ ...btn, color: C.muted, background: "transparent", border: `1px solid ${C.border}` }}>
                        Edit
                      </button>
                      <button onClick={() => void draftAction(d, "reject")} style={{ ...btn, color: C.red, background: "transparent", border: `1px solid ${C.red}40` }}>
                        Reject
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: 10.5, color: C.faint, alignSelf: "center", marginLeft: "auto" }}>
                    conf {Math.round(parseFloat(d.voice_confidence) * 100)}% · {d.kind} · {timeAgo(d.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ ...card, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>No contacts yet.</p>
          <button onClick={() => void seed()} style={{ ...btn, color: C.bg, background: "var(--accent)" }}>
            Create test contact
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1.6fr" : "1fr", gap: 16 }}>
          {/* Contacts list */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Contacts ({contacts.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {contacts.map(c => {
                const active = c.id === selectedId
                return (
                  <button key={c.id} onClick={() => setSelected(c.id)} style={{
                    textAlign: "left", background: active ? C.bg3 : "transparent", border: `1px solid ${active ? C.borderHover : "transparent"}`,
                    borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: FONT, width: "100%",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.name}</div>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: c.auto_reply ? C.green : C.faint, background: c.auto_reply ? C.greenDim : "rgba(213,219,230,0.08)", borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: 0.3 }}>
                        {c.auto_reply ? "auto" : "manual"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      {c.relationship.replace("_", " ")} · stage {c.stage}{c.last_contact ? ` · ${timeAgo(c.last_contact)}` : ""}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conversation thread + compose */}
          <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 420 }}>
            {selected ? (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 2 }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>{selected.phone}</div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {thread.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.muted }}>No messages yet — say hi below.</div>
                  ) : (
                    thread.map((msg, i) => (
                      <div key={i} style={{ alignSelf: msg.role === "agent" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
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
                  )}
                  <div ref={threadEndRef} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={composeText}
                    onChange={e => setComposeText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }}
                    placeholder="Type a message — sends via iMessage"
                    style={{
                      flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10,
                      padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: FONT,
                    }}
                  />
                  <button onClick={() => void send()} disabled={sending || !composeText.trim()} style={{
                    ...btn, color: C.bg, background: "var(--accent)", opacity: sending || !composeText.trim() ? 0.5 : 1,
                  }}>
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: C.muted, textAlign: "center", padding: "40px 0", margin: "auto" }}>
                Select a contact to start texting.
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
