/**
 * Conversational SMS Agent runtime (Stages 1-2)
 *
 * Sonnet 4.6 (claude-sonnet-4-6) drafts opener and reply messages that sound
 * exactly like Vinuth, using the calibrated voice profile + per-contact
 * hyper-personalisation + relationship voice overrides + full thread history.
 *
 * Output is structured: every draft carries a voice_confidence and an
 * auto_sendable flag so the inbound handler can decide send-now vs queue.
 * All text passes through sanitiseText (em-dash / AI-tell safety net).
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import { getThread } from "./conversations.js"
import { getVoiceProfile, formatVoiceProfileForPrompt } from "./voiceProfile.js"
import type { SmsContact } from "./smsContacts.js"

const RUNTIME_MODEL = "claude-sonnet-4-6"
const SMS_LIMIT = 160

// ── Output types ─────────────────────────────────────────────────────────────

export interface OpenerResult {
  draft: string
  charCount: number
  voiceConfidence: number
  personalisationHook: string
  followUpMessage: string | null
  followUpWaitHours: number
}

export interface ReplyResult {
  draft: string | null            // null = Vinuth would not reply (natural pause)
  charCount: number
  autoSendable: boolean
  voiceConfidence: number
  reasoning: string
  personalisationUsed: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampSMS(s: string): string {
  const t = s.trim()
  if (t.length <= SMS_LIMIT) return t
  return t.slice(0, SMS_LIMIT - 3).trimEnd() + "..."
}

function clean(s: string): string {
  return sanitiseText(s.replace(/^["']|["']$/g, "")).trim()
}

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
      return thread.messages.slice(-8).map(m =>
        `[${m.role === "agent" ? "Vinuth" : first}]: ${m.body}`,
      ).join("\n")
    }
  } catch { /* non-fatal */ }
  return "(no prior messages)"
}

function relationshipLabel(r: SmsContact["relationship"]): string {
  return r === "business_partner" ? "business partner"
    : r === "close_friend" ? "close friend"
    : r === "family" ? "family member"
    : "real estate agent (professional outreach)"
}

const HARD_RULES = `HARD RULES:
- Under ${SMS_LIMIT} characters. If it must be longer, it is too long — cut it.
- Never use em-dashes. Never use any word in the profile's anti_patterns or vocabulary.never_use lists.
- Never mention AI, automation, bots, or that this is system-generated.
- Match Vinuth's EXACT capitalisation and punctuation habits from the profile. If he does not end texts with periods, do not add them.
- Australian English only (organise, colour, favourite).
- Reference personalisation naturally, at most one or two details. Do not force it.`

// ── Opener (first message in a thread) ──────────────────────────────────────────

export async function generateOpener(contact: SmsContact): Promise<OpenerResult> {
  const first = contact.name.split(" ")[0]
  const objective = contact.conversation_objective ?? "Reconnect and see how they are going."
  const fallback: OpenerResult = {
    draft: clampSMS(`Hey ${first}, ${objective.toLowerCase().includes("coffee") ? "you free for a coffee this week?" : "how's things?"}`),
    charCount: 0,
    voiceConfidence: 0.4,
    personalisationHook: "none",
    followUpMessage: null,
    followUpWaitHours: 48,
  }
  fallback.charCount = fallback.draft.length

  if (!process.env.ANTHROPIC_API_KEY) return fallback

  const vp = await getVoiceProfile()
  const prompt = `You are drafting an opening text from Vinuth Srirama to ${contact.name}, who is Vinuth's ${relationshipLabel(contact.relationship)}.

VINUTH'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

RELATIONSHIP VOICE ADJUSTMENTS (apply on top of the base profile):
${JSON.stringify(contact.voice_override ?? {})}

HYPER-PERSONALISATION NOTES:
${JSON.stringify(contact.personalisation ?? {}, null, 2)}

OBJECTIVE (this is the reason for texting — nobody texts without one):
${objective}

This is the first message in a new thread (or resuming after a gap). Give it a clear, natural reason. Reference one personalisation detail so it is specific, not "hey how are you". If the objective is to meet up, suggest a specific day rather than "sometime".

Return ONLY this JSON (no markdown):
{"draft_message":"...","voice_confidence":0.0,"personalisation_hook":"which note was referenced","follow_up_if_no_reply":{"wait_hours":48,"follow_up_message":"..."}}

${HARD_RULES}`

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: RUNTIME_MODEL, max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }, { signal }),
    )
    const parsed = JSON.parse(rawText(message)) as {
      draft_message?: string; voice_confidence?: number; personalisation_hook?: string
      follow_up_if_no_reply?: { wait_hours?: number; follow_up_message?: string }
    }
    const draft = clampSMS(clean(parsed.draft_message ?? ""))
    if (!draft) return fallback
    const fu = parsed.follow_up_if_no_reply
    return {
      draft,
      charCount: draft.length,
      voiceConfidence: parsed.voice_confidence ?? 0.6,
      personalisationHook: parsed.personalisation_hook ?? "none",
      followUpMessage: fu?.follow_up_message ? clampSMS(clean(fu.follow_up_message)) : null,
      followUpWaitHours: fu?.wait_hours ?? 48,
    }
  } catch (err) {
    console.warn("[smsAgent] generateOpener failed, using fallback:", (err as Error).message)
    return fallback
  }
}

// ── Reply (respond to an inbound message) ───────────────────────────────────────

const SIMPLE_ACK = /^(ok|okay|cool|sweet|nice|great|sounds good|sg|thanks|thank you|ta|cheers|\u{1F44D}|yep|yup|yeah|haha|lol)[.! ]*$/iu

export async function generateReply(contact: SmsContact, inbound: string): Promise<ReplyResult> {
  const first = contact.name.split(" ")[0]
  const fallback: ReplyResult = {
    draft: clampSMS(`No worries ${first}, sounds good`),
    charCount: 0,
    autoSendable: false,
    voiceConfidence: 0.4,
    reasoning: "fallback template",
    personalisationUsed: [],
  }
  fallback.charCount = (fallback.draft ?? "").length

  // A bare acknowledgement often needs no reply at all.
  if (SIMPLE_ACK.test(inbound.trim())) {
    return { draft: null, charCount: 0, autoSendable: false, voiceConfidence: 0.9,
      reasoning: "Simple acknowledgement, the conversation has reached a natural pause.", personalisationUsed: [] }
  }

  if (!process.env.ANTHROPIC_API_KEY) return fallback

  const vp = await getVoiceProfile()
  const history = await threadBlock(contact)
  const objective = contact.conversation_objective ?? "Have a natural conversation."

  const prompt = `You are texting as Vinuth Srirama from his personal phone, replying to ${contact.name}, his ${relationshipLabel(contact.relationship)}.

VINUTH'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

RELATIONSHIP VOICE ADJUSTMENTS (apply on top of base profile):
${JSON.stringify(contact.voice_override ?? {})}

HYPER-PERSONALISATION NOTES (details only Vinuth would know — use naturally):
${JSON.stringify(contact.personalisation ?? {}, null, 2)}

CONVERSATION OBJECTIVE (advance subtly, do not be robotic):
${objective}

CONVERSATION HISTORY:
${history}

INBOUND MESSAGE FROM ${first}:
"${inbound.slice(0, 500)}"

Draft a reply that sounds EXACTLY like Vinuth wrote it himself, responds to what ${first} actually said, and advances the objective subtly. If Vinuth would not reply to this (it is a natural end), return draft_reply as null.

Return ONLY this JSON (no markdown):
{"draft_reply":"... or null","auto_sendable":false,"voice_confidence":0.0,"reasoning":"one sentence","personalisation_used":[]}

AUTO-SENDABLE is true ONLY if ALL hold: the inbound is a simple factual question with an unambiguous answer available in the notes/history; the reply is under 50 chars; voice_confidence above 0.9; getting it wrong has zero consequence. Anything involving opinions, plans, emotions, or new information is NOT auto-sendable.

${HARD_RULES}`

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: RUNTIME_MODEL, max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }, { signal }),
    )
    const parsed = JSON.parse(rawText(message)) as {
      draft_reply?: string | null; auto_sendable?: boolean; voice_confidence?: number
      reasoning?: string; personalisation_used?: string[]
    }
    if (parsed.draft_reply === null || parsed.draft_reply === undefined || String(parsed.draft_reply).trim() === "" || String(parsed.draft_reply).toLowerCase() === "null") {
      return { draft: null, charCount: 0, autoSendable: false,
        voiceConfidence: parsed.voice_confidence ?? 0.8,
        reasoning: parsed.reasoning ?? "Vinuth would not reply here.", personalisationUsed: [] }
    }
    const draft = clampSMS(clean(String(parsed.draft_reply)))
    const conf = parsed.voice_confidence ?? 0.6
    // Re-derive auto-send guard rails locally (do not trust the model alone).
    const autoSendable = !!parsed.auto_sendable && conf >= 0.9 && draft.length <= 50
    return {
      draft, charCount: draft.length, autoSendable, voiceConfidence: conf,
      reasoning: parsed.reasoning ?? "", personalisationUsed: parsed.personalisation_used ?? [],
    }
  } catch (err) {
    console.warn("[smsAgent] generateReply failed, using fallback:", (err as Error).message)
    return fallback
  }
}
