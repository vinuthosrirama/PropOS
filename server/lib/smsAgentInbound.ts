/**
 * SMS Agent inbound handler (wired into index.ts handleIncomingReply)
 *
 * Decides, for every inbound reply from a known sms_contact, whether to:
 *   - auto-send a reply (only when the master switch + per-contact flag + the
 *     model's auto_sendable + the voice-degradation brake all agree), or
 *   - queue a draft for Vinuth's approval.
 *
 * Stage routing: stage>=3 scheduling replies go through the calendar agent;
 * everything else goes through the conversational agent. Non-fatal throughout —
 * any error is swallowed so the main webhook pipeline is never affected.
 */

import { sendSMS, smsConfigured } from "./sms.js"
import { addAgentMessageToThread } from "./conversations.js"
import {
  getContactByPhone, setContactStatus, bookSlot, getApprovedAsIsRate, markContacted,
  canSendNow, recordAgentMessageSent,
} from "./smsContacts.js"
import { generateReply } from "./smsAgent.js"
import { negotiateMeeting, looksLikeScheduling } from "./calendarAgent.js"
import { saveAgentDraft, type DraftKind } from "./smsAgentDrafts.js"
import { isDbConnected } from "./db.js"

const MELBOURNE_TZ = "Australia/Melbourne"
const VOICE_BRAKE_FLOOR = 0.6   // below this approved-as-is rate, auto-send disables

function autoSendEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.SMS_AGENT_AUTOSEND ?? "")
}

function melbourneHour(): number {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: MELBOURNE_TZ, hour: "2-digit", hour12: false }).formatToParts(new Date())
  const h = parts.find(p => p.type === "hour")?.value ?? "12"
  const n = parseInt(h, 10)
  return n === 24 ? 0 : n
}

function isAfterHours(): boolean {
  const h = melbourneHour()
  return h < 8 || h >= 20
}

/**
 * Main entry. Called in parallel (void) from handleIncomingReply. The inbound
 * body has already been appended to the conversation thread by the caller.
 */
export async function handleSmsAgentInbound(from: string, body: string): Promise<void> {
  if (!isDbConnected()) return
  try {
    const contact = await getContactByPhone(from)
    if (!contact) return                  // not one of our SMS-agent contacts
    if (contact.status === "opted_out") return

    const first = contact.name.split(" ")[0]

    // ── Route: scheduling (stage 3+) vs conversational ──────────────────────────
    let draft: string | null
    let autoSendable: boolean
    let voiceConfidence: number
    let kind: DraftKind
    let reasoning = ""

    if (contact.stage >= 3 && looksLikeScheduling(body)) {
      const neg = await negotiateMeeting(contact, body)
      draft = neg.draft
      autoSendable = neg.autoSendable
      voiceConfidence = neg.voiceConfidence
      kind = "schedule"
      reasoning = `${neg.classification} -> ${neg.action}`

      // Apply CRM-side effects from the negotiation.
      if (neg.action === "BOOK" && neg.booking) {
        await bookSlot({ contactId: contact.id, proposedTime: neg.booking.iso, location: neg.booking.location, notes: `Booked from SMS: "${body.slice(0, 120)}"` })
        await setContactStatus(contact.id, "booked")
      } else if (neg.contactStatus === "declined") {
        await setContactStatus(contact.id, "backlog")
      } else if (neg.contactStatus === "backlog") {
        await setContactStatus(contact.id, "backlog")
      }
    } else {
      const rep = await generateReply(contact, body)
      draft = rep.draft
      autoSendable = rep.autoSendable
      voiceConfidence = rep.voiceConfidence
      kind = "reply"
      reasoning = rep.reasoning
      if (contact.status === "active" || contact.status === "paused") {
        // a reply keeps the thread warm; clear any pending follow-up
        await markContacted(contact.id)
      }
    }

    // The model decided no reply is warranted (natural pause).
    if (draft === null || draft.trim() === "") {
      console.log(`[smsAgentInbound] ${contact.name}: no reply needed (${reasoning})`)
      return
    }

    // ── Voice-degradation brake ─────────────────────────────────────────────────
    const brake = await getApprovedAsIsRate(20)
    const brakeOk = brake.count < 5 || brake.rate >= VOICE_BRAKE_FLOOR

    // ── Auto-send vs queue ──────────────────────────────────────────────────────
    const afterHoursBlock = isAfterHours() && kind !== "schedule"   // scheduling: they just texted, they are awake
    const canAutoSend =
      autoSendEnabled() &&
      contact.auto_reply &&
      autoSendable &&
      brakeOk &&
      !afterHoursBlock &&
      smsConfigured() &&
      await canSendNow(contact.id)

    if (canAutoSend) {
      try {
        await sendSMS(contact.phone, draft)
        await addAgentMessageToThread(contact.phone, draft, { leadName: contact.name })
        await markContacted(contact.id)
        await recordAgentMessageSent(contact.id)
        console.log(`[smsAgentInbound] auto-sent ${kind} to ${first} (conf ${voiceConfidence}): "${draft.slice(0, 60)}"`)
        return
      } catch (err) {
        console.warn(`[smsAgentInbound] auto-send failed for ${first}, queueing draft instead:`, (err as Error).message)
        // fall through to queue
      }
    }

    const draftId = await saveAgentDraft({
      contactId: contact.id,
      inboundBody: body,
      draftBody: draft,
      reasoning,
      voiceConfidence,
      kind,
    })
    console.log(`[smsAgentInbound] queued ${kind} draft (id=${draftId}) for ${first}: "${draft.slice(0, 60)}"`)
  } catch (err) {
    console.error("[smsAgentInbound] error:", (err as Error).message)
  }
}
