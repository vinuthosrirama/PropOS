/**
 * Calendar negotiation agent (Stage 3)
 *
 * When an agent-prospect (or any stage>=3 contact) replies, this classifies the
 * reply and negotiates a coffee meeting time: proposes slots, handles
 * counter-proposals, books the confirmed time. Sonnet 4.6.
 *
 * Scheduling logistics (times/places) are low-risk and auto-sendable; anything
 * substantive (questions about Vinuth/PropOS, hesitation) escalates to approval.
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import { getThread } from "./conversations.js"
import { getVoiceProfile, formatVoiceProfileForPrompt } from "./voiceProfile.js"
import { getOpenSlots, getBlockedSlots, type SmsContact } from "./smsContacts.js"

const RUNTIME_MODEL = "claude-sonnet-4-6"
const SMS_LIMIT = 160
const MELBOURNE_TZ = "Australia/Melbourne"

export type SchedClass = "YES" | "COUNTER" | "VAGUE" | "QUESTION" | "DECLINE" | "RESCHEDULE" | "OTHER"
export type SchedAction = "BOOK" | "COUNTER" | "PROPOSE" | "CONTEXT" | "DECLINE" | "RESCHEDULE" | "ESCALATE"

export interface AvailSlot { iso: string; label: string }

export interface NegotiationResult {
  classification: SchedClass
  action: SchedAction
  draft: string
  charCount: number
  autoSendable: boolean
  voiceConfidence: number
  booking: { iso: string; location: string } | null
  contactStatus: "active" | "interested" | "booked" | "declined" | "backlog"
}

// ── Availability ────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function labelFor(d: Date): string {
  const day = DAYS[d.getDay()]
  const hh = d.getHours()
  const slot = hh < 12 ? "morning" : hh < 17 ? "afternoon" : "evening"
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: MELBOURNE_TZ })
  return `${day} ${slot} (${time})`
}

/**
 * Available slots: prefer real ones from calendar_slots; otherwise synthesize a
 * sensible default (next 7 weekdays, 10am + 2pm) so negotiation works before any
 * calendar is wired up. Blocked slots are excluded.
 */
export async function proposeAvailability(contactId?: number, count = 4): Promise<AvailSlot[]> {
  const open = await getOpenSlots(contactId)
  if (open.length > 0) {
    return open.slice(0, count).map(s => ({ iso: new Date(s.proposed_time).toISOString(), label: labelFor(new Date(s.proposed_time)) }))
  }

  const blocked = await getBlockedSlots()
  const blockedDays = new Set(blocked.map(b => new Date(b.proposed_time).toDateString()))

  const slots: AvailSlot[] = []
  const now = new Date()
  for (let dayOffset = 1; dayOffset <= 12 && slots.length < count; dayOffset++) {
    const base = new Date(now)
    base.setDate(now.getDate() + dayOffset)
    const dow = base.getDay()
    if (dow === 0 || dow === 6) continue        // weekdays only
    if (blockedDays.has(base.toDateString())) continue
    for (const hour of [10, 14]) {
      if (slots.length >= count) break
      const d = new Date(base)
      d.setHours(hour, 0, 0, 0)
      slots.push({ iso: d.toISOString(), label: labelFor(d) })
    }
  }
  return slots
}

// ── Negotiation ─────────────────────────────────────────────────────────────────

function clampSMS(s: string): string {
  const t = s.trim()
  return t.length <= SMS_LIMIT ? t : t.slice(0, SMS_LIMIT - 3).trimEnd() + "..."
}
function clean(s: string): string { return sanitiseText(s.replace(/^["']|["']$/g, "")).trim() }

interface AnthropicMessage { content: Array<{ type: string; text?: string }> }
function rawText(m: AnthropicMessage): string {
  const t = m.content[0]?.type === "text" ? (m.content[0].text ?? "") : ""
  return t.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
}

async function threadBlock(contact: SmsContact): Promise<string> {
  try {
    const thread = await getThread(contact.phone)
    if (thread?.messages?.length) {
      const first = contact.name.split(" ")[0]
      return thread.messages.slice(-8).map(m => `[${m.role === "agent" ? "Vinuth" : first}]: ${m.body}`).join("\n")
    }
  } catch { /* non-fatal */ }
  return "(no prior messages)"
}

export async function negotiateMeeting(contact: SmsContact, inbound: string): Promise<NegotiationResult> {
  const first = contact.name.split(" ")[0]
  const avail = await proposeAvailability(contact.id)
  const availLabels = avail.map((s, i) => `${i + 1}. ${s.label} [${s.iso}]`).join("\n") || "(no slots free this fortnight)"

  const fallback: NegotiationResult = {
    classification: "OTHER", action: "ESCALATE",
    draft: clampSMS(`Thanks ${first}, let me check my diary and get back to you`),
    charCount: 0, autoSendable: false, voiceConfidence: 0.4, booking: null, contactStatus: "active",
  }
  fallback.charCount = fallback.draft.length

  if (!process.env.ANTHROPIC_API_KEY) return fallback

  const vp = await getVoiceProfile()
  const history = await threadBlock(contact)
  const suburb = (contact.personalisation?.suburb as string) ?? (contact.personalisation?.area as string) ?? ""

  const prompt = `You are managing a scheduling text conversation between Vinuth Srirama and ${contact.name}, a real estate agent. The goal is to book a casual coffee. This is NOT a sales pitch.

VINUTH'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

AGENT NOTES:
${JSON.stringify(contact.personalisation ?? {}, null, 2)}
${suburb ? `Agent area: ${suburb} (suggest a cafe near them, do not make them drive to you).` : ""}

VINUTH'S AVAILABLE SLOTS (propose ONE specific slot, never "when are you free"):
${availLabels}

CONVERSATION HISTORY:
${history}

AGENT'S LATEST REPLY:
"${inbound.slice(0, 500)}"

Classify the reply and pick the next action:
- YES (accepted a time) -> action BOOK, set booking to the agreed slot iso + a location.
- COUNTER (suggests another time) -> if it matches an available slot, accept it (BOOK); else propose the nearest free slot (COUNTER).
- VAGUE (keen but no commitment) -> PROPOSE one specific slot.
- QUESTION (who are you / what is this) -> CONTEXT: brief, casual, no pitch. "I'm working on some proptech stuff and keen to hear what's actually happening on the ground in [area]. Just a casual coffee."
- DECLINE (not interested) -> DECLINE, gracious exit.
- RESCHEDULE (had a time, needs to change) -> propose alternatives.

Return ONLY this JSON (no markdown):
{"classification":"YES|COUNTER|VAGUE|QUESTION|DECLINE|RESCHEDULE","action":"BOOK|COUNTER|PROPOSE|CONTEXT|DECLINE|RESCHEDULE","draft_reply":"...","voice_confidence":0.0,"booking":{"iso":"...","location":"..."} or null,"contact_status":"interested|booked|declined|backlog|active"}

HARD RULES:
- Under ${SMS_LIMIT} characters. No em-dashes. No AI tells. Match Vinuth's voice profile exactly.
- Never propose a blocked time or one already declined. Mirror informal time words ("arvo", "mid-morning") if the agent uses them.
- Booking iso MUST be copied exactly from an available slot above when action is BOOK.`

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({ model: RUNTIME_MODEL, max_tokens: 450, messages: [{ role: "user", content: prompt }] }, { signal }),
    )
    const parsed = JSON.parse(rawText(message)) as {
      classification?: SchedClass; action?: SchedAction; draft_reply?: string
      voice_confidence?: number; booking?: { iso?: string; location?: string } | null; contact_status?: string
    }
    const draft = clampSMS(clean(parsed.draft_reply ?? ""))
    if (!draft) return fallback

    const action = (parsed.action ?? "PROPOSE") as SchedAction
    const conf = parsed.voice_confidence ?? 0.6
    // Scheduling logistics auto-send; CONTEXT/ESCALATE/DECLINE-nuance require approval.
    const logistics = action === "BOOK" || action === "COUNTER" || action === "PROPOSE" || action === "RESCHEDULE"
    const autoSendable = logistics && conf >= 0.75

    let booking: NegotiationResult["booking"] = null
    if (action === "BOOK" && parsed.booking?.iso) {
      // Only trust an iso that matches an offered slot (guards against hallucinated times).
      const match = avail.find(a => a.iso === parsed.booking?.iso)
      const iso = match?.iso ?? avail[0]?.iso
      if (iso) booking = { iso, location: parsed.booking?.location ?? "a cafe near you" }
    }

    const status = (["interested", "booked", "declined", "backlog", "active"].includes(parsed.contact_status ?? "")
      ? parsed.contact_status : action === "BOOK" ? "booked" : action === "DECLINE" ? "declined" : "interested") as NegotiationResult["contactStatus"]

    return {
      classification: parsed.classification ?? "OTHER",
      action,
      draft,
      charCount: draft.length,
      autoSendable,
      voiceConfidence: conf,
      booking,
      contactStatus: status,
    }
  } catch (err) {
    console.warn("[calendarAgent] negotiate failed, using fallback:", (err as Error).message)
    return fallback
  }
}

/** Heuristic: does this inbound look like a scheduling reply (vs a substantive question)? */
export function looksLikeScheduling(body: string): boolean {
  const b = body.toLowerCase()
  const schedWords = /\b(yes|yep|sure|keen|sounds good|works|free|busy|can't|cant|morning|arvo|afternoon|evening|monday|tuesday|wednesday|thursday|friday|today|tomorrow|next week|coffee|catch up|meet|\d\s?(am|pm)|reschedule|another time|later)\b/
  return schedWords.test(b)
}
