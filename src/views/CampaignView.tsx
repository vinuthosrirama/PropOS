/**
 * CampaignView — VendorOS outreach cockpit.
 *
 * Tracks Vinuth's self-outreach campaign to boutique RE agents (the `outreach_targets`
 * pipeline): who was texted, status funnel, reply rate, pending AI drafts to approve,
 * and the full conversation history per agent.
 *
 * Data comes from the server REST API (/api/outreach-targets, /brief, /:id/thread,
 * approve-draft, reject-draft). When the backend has no database connected (local dev
 * without DATABASE_URL), it returns demo:true and we render a synthetic campaign so the
 * cockpit is always meaningful — this doubles as the meta-test dataset.
 *
 * Honesty note: SMS has no carrier "open/read" signal. We track delivered + replied only.
 */

import { useState, useEffect, useCallback, type CSSProperties } from "react"
import { C, FONT } from "../data"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { authFetch } from "../lib/authFetch"
import { apiUrl } from "../lib/api"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Target {
  id: number
  name: string
  agency: string
  suburb: string | null
  status: string
  last_message: string | null
  last_contact_date: string | null
  reply_body: string | null
}

interface ThreadMessage { role: "agent" | "lead"; body: string; ts: string }
interface Draft { id: number; inbound_body: string; draft_body: string; status: string; created_at: string }

interface Brief {
  pendingDrafts: number
  totalContacted: number
  totalReplied: number
  totalDemoBooked: number
  scheduler?: { running: boolean; dailyCap: number; testMode: boolean; testPhone: string | null }
}

// ── Status display ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; dim: string }> = {
  new:            { label: "New",            color: C.faint,  dim: "rgba(213,219,230,0.08)" },
  contacted:      { label: "Contacted",      color: C.blue,   dim: C.blueDim },
  replied:        { label: "Replied",        color: C.green,  dim: C.greenDim },
  demo_booked:    { label: "Demo booked",    color: C.purple, dim: C.purpleDim },
  won:            { label: "Won",            color: C.green,  dim: C.greenDim },
  not_interested: { label: "Not interested", color: C.red,    dim: C.redDim },
}
const FUNNEL_ORDER = ["new", "contacted", "replied", "demo_booked", "won"] as const

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: C.muted, dim: "rgba(213,219,230,0.08)" }
}

// ── Synthetic campaign (used when the backend has no DB connected) ───────────────

const DEMO_TARGETS: Target[] = [
  { id: 1, name: "Manny Singh",   agency: "GR8 EST8 Agents",   suburb: "Narre Warren",  status: "demo_booked", last_message: "Great Manny. 5 min Zoom Thursday 2pm? I'll show a live demo on a Narre Warren property. Vinuth", last_contact_date: iso(-1), reply_body: "Yeah go on then, Thursday works" },
  { id: 2, name: "Priya Nair",    agency: "Elite Agents & Partners", suburb: "Berwick", status: "replied",     last_message: "Buyers from listings you sold 12+ months ago are still searching. PropOS reactivates them in your voice. Worth 5 min? Vinuth", last_contact_date: iso(-1), reply_body: "How much does it cost?" },
  { id: 3, name: "Daniel Cho",    agency: "Only Estate Agents", suburb: "Narre Warren", status: "contacted",   last_message: "Hi Daniel, Vinuth here. I pulled a short list of past buyers in your database likely to sell soon. Want me to send it free? Vinuth", last_contact_date: iso(-2), reply_body: null },
  { id: 4, name: "Sarah Whitlock", agency: "Kaye Charles Real Estate", suburb: "Beaconsfield", status: "contacted", last_message: "Hi Sarah, noticed your recent sale on Beaconsfield Ave. PropOS finds who in your old database is ready to sell next. 5 min? Vinuth", last_contact_date: iso(-3), reply_body: null },
  { id: 5, name: "Tom Avelar",    agency: "Uphill Real Estate",  suburb: "Officer",    status: "won",         last_message: "Locked in, welcome aboard Tom. I'll get your database imported today. Vinuth", last_contact_date: iso(-4), reply_body: "Let's do it" },
  { id: 6, name: "Jess Romano",   agency: "AgentX Real Estate",  suburb: "Berwick",    status: "new",         last_message: null, last_contact_date: null, reply_body: null },
  { id: 7, name: "Bilal Hassan",  agency: "Top Estate Agents",   suburb: "Clyde North", status: "new",        last_message: null, last_contact_date: null, reply_body: null },
  { id: 8, name: "Karen Voss",    agency: "Chandler & Co",       suburb: "Belgrave",   status: "not_interested", last_message: "No worries Karen, appreciate the reply. Happy to circle back whenever suits. Vinuth", last_contact_date: iso(-5), reply_body: "Already using something, thanks" },
]

const DEMO_THREADS: Record<number, ThreadMessage[]> = {
  1: [
    { role: "agent", body: "Hi Manny, Vinuth here. I pulled a short list of past buyers in your database likely to sell soon. Want me to send it free? Vinuth", ts: iso(-3) },
    { role: "lead",  body: "Sounds interesting, how does it work?", ts: iso(-2) },
    { role: "agent", body: "It reads your old buyer list, scores who's ready to sell on equity and hold time, and drafts the outreach in your voice. Want a quick look? Vinuth", ts: iso(-2) },
    { role: "lead",  body: "Yeah go on then, Thursday works", ts: iso(-1) },
    { role: "agent", body: "Great Manny. 5 min Zoom Thursday 2pm? I'll show a live demo on a Narre Warren property. Vinuth", ts: iso(-1) },
  ],
  2: [
    { role: "agent", body: "Buyers from listings you sold 12+ months ago are still searching. PropOS reactivates them in your voice. Worth 5 min? Vinuth", ts: iso(-1) },
    { role: "lead",  body: "How much does it cost?", ts: iso(-1) },
  ],
}

const DEMO_DRAFTS: Draft[] = [
  { id: 101, inbound_body: "How much does it cost?", draft_body: "Good question Priya. Nothing upfront, you only pay $2k when it turns into a listing appraisal. Happy to walk through it in 5 min, when suits? Vinuth", status: "pending", created_at: iso(-1) },
]

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString()
}

function timeAgo(ts: string | null): string {
  if (!ts) return ""
  const diff = Date.now() - new Date(ts).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

// ── Component ────────────────────────────────────────────────────────────────────

export default function CampaignView() {
  const bp = useBreakpoint()
  const isDesktop = bp === "desktop"

  const [targets, setTargets]   = useState<Target[]>([])
  const [brief, setBrief]       = useState<Brief | null>(null)
  const [drafts, setDrafts]     = useState<Draft[]>([])
  const [isDemo, setIsDemo]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [selectedId, setSelected] = useState<number | null>(null)
  const [thread, setThread]     = useState<ThreadMessage[]>([])
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const loadDemo = useCallback(() => {
    setIsDemo(true)
    setTargets(DEMO_TARGETS)
    setDrafts(DEMO_DRAFTS)
    setBrief({
      pendingDrafts: DEMO_DRAFTS.length,
      totalContacted: DEMO_TARGETS.filter(t => t.status === "contacted").length,
      totalReplied: DEMO_TARGETS.filter(t => t.status === "replied").length,
      totalDemoBooked: DEMO_TARGETS.filter(t => t.status === "demo_booked").length,
      scheduler: { running: true, dailyCap: 5, testMode: true, testPhone: "+61415883354" },
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, bRes, dRes] = await Promise.all([
        authFetch(apiUrl("/api/outreach-targets")),
        authFetch(apiUrl("/api/outreach-targets/brief")),
        authFetch(apiUrl("/api/outreach-targets/drafts")),
      ])
      const tJson = await tRes.json() as { targets?: Target[]; demo?: boolean }
      if (tJson.demo || !tJson.targets || tJson.targets.length === 0) { loadDemo(); return }
      setIsDemo(false)
      setTargets(tJson.targets)
      setBrief(await bRes.json() as Brief)
      const dJson = await dRes.json() as { drafts?: Draft[] }
      setDrafts(dJson.drafts ?? [])
    } catch {
      loadDemo()
    } finally {
      setLoading(false)
    }
  }, [loadDemo])

  useEffect(() => { void load() }, [load])

  // Open a target's conversation thread
  const openThread = useCallback(async (t: Target) => {
    setSelected(t.id)
    if (isDemo) { setThread(DEMO_THREADS[t.id] ?? []); return }
    try {
      const res = await authFetch(apiUrl(`/api/outreach-targets/${t.id}/thread`))
      const json = await res.json() as { thread?: { messages?: ThreadMessage[] } | null }
      setThread(json.thread?.messages ?? [])
    } catch { setThread([]) }
  }, [isDemo])

  const draftAction = useCallback(async (draftId: number, action: "approve-draft" | "reject-draft") => {
    if (isDemo) {
      setDrafts(d => d.filter(x => x.id !== draftId))
      setActionMsg(action === "approve-draft" ? "Demo: draft approved and sent" : "Demo: draft rejected")
      return
    }
    try {
      const res = await authFetch(apiUrl(`/api/outreach-targets/${action}/${draftId}`), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      setActionMsg(json.ok ? (action === "approve-draft" ? "Sent" : "Rejected") : (json.error ?? "Failed"))
      await load()
    } catch (e) { setActionMsg((e as Error).message) }
  }, [isDemo, load])

  // ── Derived funnel ──────────────────────────────────────────────────────────
  const counts: Record<string, number> = {}
  for (const t of targets) counts[t.status] = (counts[t.status] ?? 0) + 1
  const contactedPlus = targets.filter(t => t.status !== "new").length
  const repliedPlus = (counts.replied ?? 0) + (counts.demo_booked ?? 0) + (counts.won ?? 0)
  const replyRate = contactedPlus > 0 ? Math.round((repliedPlus / contactedPlus) * 100) : 0
  const selected = targets.find(t => t.id === selectedId) ?? null

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card: CSSProperties = {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18,
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: `${isDesktop ? 84 : 70}px 16px 60px` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: -0.4 }}>Outreach Campaign</h1>
          <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 0" }}>
            Agent acquisition pipeline. Delivered and replied are tracked; SMS has no read receipt.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {brief?.scheduler?.testMode && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.orange, background: C.orangeDim, border: `1px solid ${C.orange}55`, borderRadius: 8, padding: "4px 9px" }}>
              TEST MODE · {brief.scheduler.testPhone}
            </span>
          )}
          {isDemo && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.blue, background: C.blueDim, border: `1px solid ${C.blue}40`, borderRadius: 8, padding: "4px 9px" }}>
              SAMPLE DATA
            </span>
          )}
          <button onClick={() => void load()} style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer", fontFamily: FONT }}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading campaign...</div>
      ) : (
        <>
          {/* Funnel strip */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isDesktop ? 6 : 3}, 1fr)`, gap: 10, marginBottom: 18 }}>
            {FUNNEL_ORDER.map(s => {
              const m = statusMeta(s)
              return (
                <div key={s} style={{ ...card, padding: 14 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: m.color, lineHeight: 1 }}>{counts[s] ?? 0}</div>
                  <div style={{ fontSize: 10.5, color: C.faint, marginTop: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{m.label}</div>
                </div>
              )
            })}
            <div style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.green, lineHeight: 1 }}>{replyRate}%</div>
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Reply rate</div>
            </div>
          </div>

          {/* Pending drafts */}
          {drafts.length > 0 && (
            <div style={{ ...card, marginBottom: 18, borderColor: `${C.orange}40` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {drafts.length} AI {drafts.length === 1 ? "draft" : "drafts"} awaiting your approval
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {drafts.map(d => (
                  <div key={d.id} style={{ background: C.bg3, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>They said: "{d.inbound_body}"</div>
                    <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 12 }}>{d.draft_body}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => void draftAction(d.id, "approve-draft")} style={{ fontSize: 11.5, fontWeight: 700, color: C.bg, background: C.green, border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: FONT }}>
                        Approve and send
                      </button>
                      <button onClick={() => void draftAction(d.id, "reject-draft")} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: FONT }}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {actionMsg && (
            <div style={{ fontSize: 12, color: C.green, marginBottom: 14 }}>{actionMsg}</div>
          )}

          {/* Two-column: list + thread */}
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1.3fr 1fr" : "1fr", gap: 16 }}>
            {/* Targets list */}
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Contacts ({targets.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {targets.map(t => {
                  const m = statusMeta(t.status)
                  const active = t.id === selectedId
                  return (
                    <button key={t.id} onClick={() => void openThread(t)} style={{
                      textAlign: "left", background: active ? C.bg3 : "transparent", border: `1px solid ${active ? C.borderHover : "transparent"}`,
                      borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: FONT, width: "100%",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{t.name}</div>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: m.color, background: m.dim, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.3 }}>{m.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{t.agency}{t.suburb ? ` · ${t.suburb}` : ""}{t.last_contact_date ? ` · ${timeAgo(t.last_contact_date)}` : ""}</div>
                      {t.reply_body && <div style={{ fontSize: 11.5, color: C.green, marginTop: 5 }}>"{t.reply_body}"</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Conversation thread */}
            <div style={card}>
              {selected ? (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 2 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>{selected.agency}{selected.suburb ? ` · ${selected.suburb}` : ""}</div>
                  {thread.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.muted }}>No messages yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {thread.map((msg, i) => (
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
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: C.muted, textAlign: "center", padding: "40px 0" }}>
                  Select a contact to see the conversation.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
