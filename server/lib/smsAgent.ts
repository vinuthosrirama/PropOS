/**
 * Conversational SMS Agent runtime (Stages 1-2)
 *
 * Sonnet 4.6 (preferred, via ANTHROPIC_API_KEY) or gpt-4o-mini (fallback, via
 * OPENAI_API_KEY) drafts opener and reply messages that sound exactly like
 * Vinuth, using the calibrated voice profile + per-contact hyper-personalisation
 * + relationship voice overrides + full thread history. See generateChatJSON
 * in claude.ts for the provider-selection logic.
 *
 * Output is structured: every draft carries a voice_confidence and an
 * auto_sendable flag so the inbound handler can decide send-now vs queue.
 * All text passes through sanitiseText (em-dash / AI-tell safety net).
 */

import { generateChatJSON, llmConfigured } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import { getThread } from "./conversations.js"
import { getVoiceProfile, DEFAULT_VOICE_ID, formatVoiceProfileForPrompt } from "./voiceProfile.js"
import type { SmsContact } from "./smsContacts.js"

// No style-driven cap — Vinuth's real SMS answers run 138-455 chars (see
// docs/VOICE_CORPUS_VINUTH.md). This is a pure runaway-generation safety net.
const SMS_LIMIT = 700

// ── Agent context (who is logged in sending these messages) ──────────────────
export interface AgentContext {
  name: string      // e.g. "Cameron Knoll"
  agency: string    // e.g. "Peake Real Estate"
  voiceId: string   // e.g. "agent_3" — which voice profile to load
}

export const DEFAULT_AGENT: AgentContext = {
  name: "Vinuth Srirama",
  agency: "PropOS",
  voiceId: DEFAULT_VOICE_ID,
}

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

async function threadBlock(contact: SmsContact, agentFirstName = "Vinuth"): Promise<string> {
  try {
    const thread = await getThread(contact.phone)
    if (thread?.messages?.length) {
      const first = contact.name.split(" ")[0]
      return thread.messages.slice(-8).map(m =>
        `[${m.role === "agent" ? agentFirstName : first}]: ${m.body}`,
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

export async function generateOpener(contact: SmsContact, agent: AgentContext = DEFAULT_AGENT): Promise<OpenerResult> {
  const first = contact.name.split(" ")[0]
  const agentFirst = agent.name.split(" ")[0]
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

  if (!llmConfigured()) return fallback

  const vp = await getVoiceProfile(agent.voiceId)
  const prompt = `You are drafting an opening text from ${agent.name} (${agent.agency}) to ${contact.name}, who is ${agentFirst}'s ${relationshipLabel(contact.relationship)}.

AGENT SENDING THIS TEXT: ${agent.name} from ${agent.agency}. Sign off as ${agentFirst}. Never mention AI or that this is automated.

${agentFirst.toUpperCase()}'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

RELATIONSHIP VOICE ADJUSTMENTS (apply on top of the base profile):
${JSON.stringify(contact.voice_override ?? {})}

CRM PROFILE (structured data — budget, history, property match, life events):
${JSON.stringify(contact.buyer_profile && Object.keys(contact.buyer_profile).length ? contact.buyer_profile : null, null, 2)}

AGENT'S PERSONAL NOTES (specific things ${agentFirst} knows about ${contact.name.split(" ")[0]}):
${JSON.stringify(contact.personalisation ?? {}, null, 2)}

OBJECTIVE (this is the reason for texting — nobody texts without one):
${objective}

This is the first message in a new thread (or resuming after a gap). Give it a clear, natural reason. If buyer_profile has a new_listing_match, reference the property specifically. Reference one personal detail from the agent's notes so it reads human. If the objective is to meet up, suggest a specific day rather than "sometime".

Return ONLY this JSON (no markdown):
{"draft_message":"...","voice_confidence":0.0,"personalisation_hook":"which note was referenced","follow_up_if_no_reply":{"wait_hours":48,"follow_up_message":"..."}}

${HARD_RULES.replace("Vinuth", agentFirst)}`

  try {
    const raw = await generateChatJSON(prompt, 400)
    const parsed = JSON.parse(raw) as {
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

// ── Suggestions (3 options for Vinuth to pick from) ─────────────────────────────

export interface SuggestionResult {
  suggestions: Array<{
    draft: string
    tone: string       // e.g. "casual", "direct", "warm"
    charCount: number
  }>
  context: string      // one-line summary of what the AI picked up on
}

export async function generateSuggestions(contact: SmsContact, agent: AgentContext = DEFAULT_AGENT): Promise<SuggestionResult> {
  const first = contact.name.split(" ")[0]
  const agentFirst = agent.name.split(" ")[0]
  const fallback: SuggestionResult = {
    suggestions: [
      { draft: `Hey ${first}, how's things?`, tone: "casual", charCount: 0 },
      { draft: `${first} you free for a catch up this week?`, tone: "direct", charCount: 0 },
      { draft: `Hey ${first}, been meaning to reach out. How are you going?`, tone: "warm", charCount: 0 },
    ],
    context: "No LLM available, using templates",
  }
  fallback.suggestions.forEach(s => { s.charCount = s.draft.length })

  if (!llmConfigured()) return fallback

  const vp = await getVoiceProfile(agent.voiceId)
  const history = await threadBlock(contact)
  const objective = contact.conversation_objective ?? "Have a natural conversation."

  const prompt = `You are drafting 3 different text message options for ${agent.name} (${agent.agency}) to send to ${contact.name}, ${agentFirst}'s ${relationshipLabel(contact.relationship)}.

AGENT SENDING: ${agent.name} from ${agent.agency}. All drafts must sound like ${agentFirst} wrote them personally.

${agentFirst.toUpperCase()}'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

RELATIONSHIP VOICE ADJUSTMENTS:
${JSON.stringify(contact.voice_override ?? {})}

HYPER-PERSONALISATION NOTES (specific things ${agentFirst} knows about ${first}):
${JSON.stringify(contact.personalisation ?? {}, null, 2)}

CONVERSATION OBJECTIVE:
${objective}

CONVERSATION HISTORY (most recent messages at bottom):
${history}

Draft exactly 3 DIFFERENT text message options. Requirements for each:
- Sound EXACTLY like ${agentFirst} personally wrote it — match the voice profile precisely
- Be directly relevant to what ${first} last said (if there is history) OR to a specific personalisation detail (if no history)
- Each option takes a genuinely different approach (e.g. one asks a question, one makes a plan, one references something specific)
- None should feel like a generic "hey how are you" — each must earn its relevance
- Sign off consistent with the voice profile sign-off style

Return ONLY this JSON (no markdown, no extra fields):
{"suggestions":[{"draft":"...","tone":"casual"},{"draft":"...","tone":"direct"},{"draft":"...","tone":"warm"}],"context":"one sentence: what you noticed from the history or notes that shaped these options"}

The "tone" field must be a SINGLE word from: casual, direct, warm, playful, professional.

${HARD_RULES.replace("Vinuth", agentFirst)}`

  try {
    const raw = await generateChatJSON(prompt, 600)
    const parsed = JSON.parse(raw) as SuggestionResult
    if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) return fallback
    parsed.suggestions = parsed.suggestions.slice(0, 3).map(s => ({
      draft: clampSMS(clean(s.draft ?? "")),
      tone: s.tone ?? "casual",
      charCount: 0,
    }))
    parsed.suggestions.forEach(s => { s.charCount = s.draft.length })
    parsed.suggestions = parsed.suggestions.filter(s => s.draft.length > 0)
    if (parsed.suggestions.length === 0) return fallback
    return parsed
  } catch (err) {
    console.warn("[smsAgent] generateSuggestions failed, using fallback:", (err as Error).message)
    return fallback
  }
}

// ── Reply (respond to an inbound message) ───────────────────────────────────────

const SIMPLE_ACK = /^(ok|okay|cool|sweet|nice|great|sounds good|sg|thanks|thank you|ta|cheers|\u{1F44D}|yep|yup|yeah|haha|lol)[.! ]*$/iu

export async function generateReply(contact: SmsContact, inbound: string, agent: AgentContext = DEFAULT_AGENT): Promise<ReplyResult> {
  const first = contact.name.split(" ")[0]
  const agentFirst = agent.name.split(" ")[0]
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

  if (!llmConfigured()) return fallback

  const vp = await getVoiceProfile(agent.voiceId)
  const history = await threadBlock(contact, agentFirst)
  const objective = contact.conversation_objective ?? "Have a natural conversation."

  const prompt = `You are texting as ${agent.name} (${agent.agency}) from their personal phone, replying to ${contact.name}, ${agentFirst}'s ${relationshipLabel(contact.relationship)}.

AGENT REPLYING: ${agent.name} from ${agent.agency}. Sign off as ${agentFirst} if a sign-off is needed. Never mention AI or automation.

${agentFirst.toUpperCase()}'S VOICE PROFILE:
${formatVoiceProfileForPrompt(vp)}

RELATIONSHIP VOICE ADJUSTMENTS (apply on top of base profile):
${JSON.stringify(contact.voice_override ?? {})}

HYPER-PERSONALISATION NOTES (details only ${agentFirst} would know — use naturally):
${JSON.stringify(contact.personalisation ?? {}, null, 2)}

CONVERSATION OBJECTIVE (advance subtly, do not be robotic):
${objective}

CONVERSATION HISTORY (most recent messages at bottom):
${history}

INBOUND MESSAGE FROM ${first}:
"${inbound.slice(0, 500)}"

Draft a reply that sounds EXACTLY like ${agentFirst} wrote it personally, responds directly to what ${first} actually said, and advances the objective subtly. If ${agentFirst} would not reply to this (natural conversation end), return draft_reply as null.

Return ONLY this JSON (no markdown):
{"draft_reply":"... or null","auto_sendable":false,"voice_confidence":0.0,"reasoning":"one sentence","personalisation_used":[]}

AUTO-SENDABLE is true ONLY if ALL hold: the inbound is a simple factual question with an unambiguous answer available in the notes/history; the reply is under 50 chars; voice_confidence above 0.9; getting it wrong has zero consequence. Anything involving opinions, plans, emotions, or new information is NOT auto-sendable.

${HARD_RULES.replace("Vinuth", agentFirst)}`

  try {
    const raw = await generateChatJSON(prompt, 400)
    const parsed = JSON.parse(raw) as {
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
