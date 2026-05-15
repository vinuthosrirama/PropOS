/**
 * Approach C — AI Reply Draft Agent
 *
 * NOT registered in server/index.ts — code is complete and QA'd but not deployed.
 * To activate: add `app.use("/api/reply-agent", replyAgentRouter)` to index.ts.
 *
 * What it does:
 *   1. Receives an inbound SMS reply + the full conversation thread + lead SLM context
 *   2. Classifies the lead's intent (INTEREST / QUESTION / OBJECTION / BOOKING / OPT_OUT)
 *   3. Drafts a personalised SMS reply (max 160 chars) in the agent's voice
 *   4. Returns the draft for agent approval — nothing is sent automatically
 *
 * POST /api/reply-agent
 * Body: ReplyAgentRequest
 * Returns: ReplyAgentResponse
 */

import { Router } from "express"
import Anthropic from "@anthropic-ai/sdk"

const router = Router()

// Lazy Anthropic client
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export type ReplyIntent = "INTEREST" | "QUESTION" | "OBJECTION" | "BOOKING" | "OPT_OUT" | "UNKNOWN"

export interface ConversationMessage {
  role: "agent" | "lead"
  body: string
  ts: string
}

export interface ReplyAgentRequest {
  // Lead context
  leadName:       string
  leadPhone:      string
  propertyAddress: string

  // Agent context
  agentName:      string
  agentAgency:    string

  // Full thread (chronological)
  thread:         ConversationMessage[]

  // The latest inbound message to respond to
  latestReply:    string

  // Optional — from PropertySLM, injected as property context
  slmContext?:    string

  // Optional — auction date for BOOKING responses
  auctionDate?:   string
}

export interface ReplyAgentResponse {
  intent:      ReplyIntent
  confidence:  number            // 0-100
  draft:       string            // ready-to-send SMS draft, max 160 chars
  reasoning:   string            // why this intent was chosen (for agent review)
  autoSend:    false             // always false — agent must approve
}

// Hard cap on SMS (same rule as outbound)
function clampSMS(s: string): string {
  if (s.length <= 160) return s
  return s.slice(0, 157).trimEnd() + "..."
}

function sanitise(s: string): string {
  return s.replace(/—/g, "-").replace(/--/g, "-")
}

// Contingency frameworks — used when AI call fails or returns unparseable JSON.
// Each template is intent-specific so the message is always contextually appropriate.
const INTENT_FRAMEWORKS: Record<ReplyIntent, (ctx: {
  leadFirst:   string
  agentFirst:  string
  agentPhone?: string
  auctionDate?: string
}) => string> = {
  INTEREST:  ({ leadFirst, agentFirst }) =>
    clampSMS(`Hi ${leadFirst}, great to hear from you! When are you free for a private inspection? I can arrange a viewing at short notice. ${agentFirst}`),
  QUESTION:  ({ leadFirst, agentFirst, agentPhone }) =>
    clampSMS(`Hi ${leadFirst}, happy to answer that. Give me a call on ${agentPhone ?? "the office"} or I can arrange a walkthrough this week. ${agentFirst}`),
  OBJECTION: ({ leadFirst, agentFirst }) =>
    clampSMS(`Hi ${leadFirst}, I understand - still worth seeing it in person. I can arrange a private viewing on your terms. ${agentFirst}`),
  BOOKING:   ({ leadFirst, agentFirst, auctionDate }) =>
    clampSMS(`Hi ${leadFirst}, confirmed${auctionDate ? ` - see you ${auctionDate}` : ""}! Any questions before then, just reply here. ${agentFirst}`),
  OPT_OUT:   () => "",
  UNKNOWN:   ({ leadFirst, agentFirst }) =>
    clampSMS(`Hi ${leadFirst}, thanks for getting back to me. Happy to help - what would you like to know? ${agentFirst}`),
}

function contingencyDraft(intent: ReplyIntent, body: ReplyAgentRequest): string {
  return INTENT_FRAMEWORKS[intent]({
    leadFirst:   body.leadName.split(" ")[0],
    agentFirst:  body.agentName.split(" ")[0],
    auctionDate: body.auctionDate,
  })
}

router.post("/", async (req, res) => {
  const body = req.body as ReplyAgentRequest

  if (!body.leadName || !body.latestReply || !body.agentName) {
    return res.status(400).json({ error: "leadName, latestReply, and agentName are required" })
  }

  // No API key — return contingency framework immediately so inbox is never blank
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      intent:     "UNKNOWN",
      confidence: 0,
      draft:      contingencyDraft("UNKNOWN", body),
      reasoning:  "AI not configured - using contingency framework",
      autoSend:   false,
    } satisfies ReplyAgentResponse)
  }

  // Build thread summary (last 6 messages for context, oldest first)
  const recentThread = body.thread.slice(-6)
  const threadBlock = recentThread.length > 0
    ? recentThread.map(m => `[${m.role === "agent" ? body.agentName.split(" ")[0] : body.leadName.split(" ")[0]}]: ${m.body}`).join("\n")
    : "(no prior messages)"

  const slmBlock = body.slmContext ? `\nProperty context:\n${body.slmContext}\n` : ""
  const auctionBlock = body.auctionDate ? `\nOpen home / auction: ${body.auctionDate}` : ""

  const prompt = `You are a real estate sales assistant helping ${body.agentName} at ${body.agentAgency} draft a reply to an inbound SMS.

Lead: ${body.leadName}
Property: ${body.propertyAddress}${auctionBlock}
${slmBlock}
Conversation so far:
${threadBlock}

Latest message from ${body.leadName.split(" ")[0]}:
"${body.latestReply}"

Your job:
1. Classify the intent as exactly one of: INTEREST | QUESTION | OBJECTION | BOOKING | OPT_OUT | UNKNOWN
   - INTEREST: expressing general interest, positive response, wants to know more
   - QUESTION: asking a specific question about the property, price, or process
   - OBJECTION: raising a concern (price, timing, location, competing property)
   - BOOKING: wants to book an inspection, arrange a call, or confirm attendance
   - OPT_OUT: asking to stop receiving messages (STOP, unsubscribe, not interested)
   - UNKNOWN: unclear or ambiguous

2. Draft a reply SMS (max 160 characters) from ${body.agentName.split(" ")[0]} that:
   - Uses the lead's first name
   - Directly addresses their message — do not be vague
   - For QUESTION: answer the specific question using the property context above
   - For BOOKING: confirm the open home time and offer to meet them there or separately
   - For OBJECTION: acknowledge the concern without being pushy; offer one specific counter-point
   - For OPT_OUT: just return empty string "" — the system handles opt-out separately
   - No em-dashes. Australian tone. Warm but brief.
   - Sign off with ${body.agentName.split(" ")[0]}'s first name only

Return ONLY valid JSON (no markdown):
{
  "intent": "INTEREST|QUESTION|OBJECTION|BOOKING|OPT_OUT|UNKNOWN",
  "confidence": 0-100,
  "draft": "reply SMS here, max 160 chars",
  "reasoning": "one sentence explaining intent classification"
}`

  try {
    const message = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    let parsed: ReplyAgentResponse
    try {
      const p = JSON.parse(cleaned)
      const intent = (p.intent as ReplyIntent) ?? "UNKNOWN"
      const aiDraft = clampSMS(sanitise(p.draft ?? ""))
      parsed = {
        intent,
        confidence: p.confidence ?? 50,
        draft:      aiDraft || contingencyDraft(intent, body),
        reasoning:  p.reasoning ?? "",
        autoSend:   false,
      }
    } catch {
      parsed = {
        intent:     "UNKNOWN",
        confidence: 0,
        draft:      contingencyDraft("UNKNOWN", body),
        reasoning:  "JSON parse failed - using contingency framework",
        autoSend:   false,
      }
    }

    res.json(parsed)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Reply agent error:", msg)
    // Return contingency framework so the inbox is never blank
    res.json({
      intent:     "UNKNOWN",
      confidence: 0,
      draft:      contingencyDraft("UNKNOWN", body),
      reasoning:  "AI unavailable - using contingency framework",
      autoSend:   false,
    } satisfies ReplyAgentResponse)
  }
})

export default router
