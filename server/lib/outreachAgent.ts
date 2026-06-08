/**
 * PropOS Self-Outreach Agent
 *
 * OpenAI-powered reply and follow-up generator for Vinuth's campaign pitching PropOS
 * to boutique real estate agents. Separate from the main PropOS reply-agent (which
 * handles buyer/vendor lead replies on behalf of agent users).
 *
 * Flow:
 *   1. Inbound SMS from an outreach target arrives via any transport webhook
 *   2. handleOutreachInbound() matches phone to outreach_targets CRM
 *   3. CRM status updated to 'replied'
 *   4. OpenAI generates a draft reply in Vinuth's voice
 *   5. Draft saved to outreach_drafts table (status='pending')
 *   6. Vinuth reviews via GET /api/outreach-targets/drafts, approves or edits
 *   7. POST /api/outreach-targets/approve-draft/:id sends and marks 'sent'
 */

import OpenAI from "openai"
import { getThread } from "./conversations.js"
import { query, execute, isDbConnected } from "./db.js"

// ── OpenAI client (lazy) ──────────────────────────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "not-set" })
  return _client
}

// ── Vinuth's voice profile ────────────────────────────────────────────────────

const VINUTH_SYSTEM_PROMPT = `You are Vinuth, founder of AddVantage AI, following up with a real estate agent about PropOS.

What PropOS does:
- Identifies past buyers from an agent's sold listings who are still actively searching
- Sends personalised SMS to those buyers from the agent's own real phone number
- Boutique agents get AI buyer reactivation tools that franchise offices don't have access to
- Takes under 5 minutes to set up
- Proven to generate replies and appraisal bookings from cold databases

Your texting style:
- Direct, no fluff. 1-2 sentences.
- Reference specific numbers from their background (sale prices, days on market, years in area)
- Australian tone, warm but never pushy
- Never use: leverage, utilize, seamless, transformative, robust, cornerstone, holistic, actionable
- No em-dashes — use commas or periods instead
- Sign off as "Vinuth" only, nothing else after it
- Goal: get them to agree to a 5-minute demo call. Not a long sales pitch.

Intent classification:
- INTERESTED: says yes, sure, keen, sounds good, tell me more
- QUESTION: asks how it works, what it costs, how many messages
- OBJECTION: too busy, not right now, already have tools, not interested
- BOOKING: wants to book a call or demo time
- OPT_OUT: stop, no thanks, not interested (firm)`

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutreachTargetRow {
  id: number
  name: string
  agency: string
  phone: string | null
  email: string | null
  suburb: string | null
  recent_sale_address: string | null
  personal_note: string | null
  sms_script: string | null
  status: string
  notes: string | null
  last_contact_date: string | null
}

export interface OutreachDraftRow {
  id: number
  target_id: number
  target_name: string
  target_agency: string
  target_phone: string | null
  inbound_body: string
  draft_body: string
  status: string
  created_at: string
}

// ── Reply generation ──────────────────────────────────────────────────────────

function clampSMS(s: string): string {
  if (s.length <= 160) return s
  return s.slice(0, 157).trimEnd() + "..."
}

function sanitise(s: string): string {
  return s.replace(/—|–|--/g, ",").replace(/^["']|["']$/g, "").trim()
}

/**
 * Generate an AI draft reply for an inbound message from an outreach target.
 * Returns SMS draft (≤160 chars) in Vinuth's voice.
 */
export async function generateOutreachDraft(
  target: OutreachTargetRow,
  inboundMessage: string,
): Promise<string> {
  // Pull conversation history for context
  let threadBlock = "(no prior messages)"
  if (target.phone) {
    try {
      const thread = await getThread(target.phone)
      if (thread?.messages?.length) {
        const recent = thread.messages.slice(-6)
        threadBlock = recent.map(m =>
          `[${m.role === "agent" ? "Vinuth" : target.name.split(" ")[0]}]: ${m.body}`,
        ).join("\n")
      }
    } catch { /* non-fatal */ }
  }

  if (!process.env.OPENAI_API_KEY) {
    return fallbackReply(target, inboundMessage)
  }

  const prompt = `Agent: ${target.name}, ${target.agency} (${target.suburb ?? "VIC"})
Recent sale: ${target.recent_sale_address ?? "N/A"}
Background: ${target.personal_note ?? "N/A"}

Conversation:
${threadBlock}

Latest message from ${target.name.split(" ")[0]}:
"${inboundMessage.slice(0, 400)}"

Write a reply SMS (max 160 chars). Return ONLY the SMS text, no quotes, no explanation.`

  try {
    const completion = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        { role: "system", content: VINUTH_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ""
    const draft = clampSMS(sanitise(raw))
    return draft || fallbackReply(target, inboundMessage)
  } catch (err) {
    console.warn("[outreachAgent] OpenAI failed, using fallback:", (err as Error).message)
    return fallbackReply(target, inboundMessage)
  }
}

function fallbackReply(target: OutreachTargetRow, inboundMessage: string): string {
  const first = target.name.split(" ")[0]
  const lower = inboundMessage.toLowerCase()
  if (/\b(yes|sure|keen|ok|sounds|interest|tell me|go on|how|what)\b/.test(lower)) {
    return clampSMS(`Great ${first}. 5 min Zoom this week? I can walk you through a live demo on a property in your area. Vinuth`)
  }
  if (/\b(busy|later|not now|already|no|stop|unsubscribe)\b/.test(lower)) {
    return clampSMS(`No worries ${first}, appreciate the reply. Happy to circle back whenever suits. Vinuth`)
  }
  return clampSMS(`Thanks for getting back ${first}. Happy to show you how it works in 5 min. When suits? Vinuth`)
}

/**
 * Generate a follow-up message for a target who hasn't replied.
 * Uses a different angle from the initial script.
 */
export async function generateFollowUp(
  target: OutreachTargetRow,
  daysSinceContact: number,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackFollowUp(target, daysSinceContact)
  }

  const prompt = `Agent: ${target.name}, ${target.agency} (${target.suburb ?? "VIC"})
Recent sale: ${target.recent_sale_address ?? "N/A"}
Background: ${target.personal_note ?? "N/A"}
Days since initial outreach: ${daysSinceContact}

They haven't replied to the initial message. Write a brief follow-up SMS (max 160 chars) using a different angle or new information. Don't mention you already texted them. Keep it fresh and specific to their background. Sign off as "Vinuth".

Return ONLY the SMS text.`

  try {
    const completion = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        { role: "system", content: VINUTH_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ""
    const draft = clampSMS(sanitise(raw))
    return draft || fallbackFollowUp(target, daysSinceContact)
  } catch {
    return fallbackFollowUp(target, daysSinceContact)
  }
}

function fallbackFollowUp(target: OutreachTargetRow, daysSinceContact: number): string {
  const first = target.name.split(" ")[0]
  if (daysSinceContact <= 5) {
    return clampSMS(`Hi ${first}, had a boutique agent in Berwick generate 3 appraisal bookings from their old buyer database last week using PropOS. Happy to show you how in 5 min. Vinuth`)
  }
  return clampSMS(`Hi ${first}, Vinuth here. Buyers from listings you sold 12+ months ago are still searching. PropOS reactivates them automatically in your voice. Worth 5 min? Vinuth`)
}

// ── Draft management ──────────────────────────────────────────────────────────

/** Save a generated draft to the DB. Returns draft ID or null. */
export async function saveOutreachDraft(
  targetId: number,
  inboundBody: string,
  draftBody: string,
): Promise<number | null> {
  if (!isDbConnected()) return null
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO outreach_drafts (target_id, inbound_body, draft_body)
       VALUES ($1, $2, $3) RETURNING id`,
      [targetId, inboundBody.slice(0, 1000), draftBody.slice(0, 300)],
    )
    return rows[0]?.id ?? null
  } catch (err) {
    console.error("[outreachAgent] failed to save draft:", (err as Error).message)
    return null
  }
}

/** Get all pending drafts with target details. */
export async function getPendingDrafts(): Promise<OutreachDraftRow[]> {
  if (!isDbConnected()) return []
  return query<OutreachDraftRow>(
    `SELECT d.id, d.target_id, t.name AS target_name, t.agency AS target_agency,
            t.phone AS target_phone, d.inbound_body, d.draft_body, d.status, d.created_at
     FROM outreach_drafts d
     JOIN outreach_targets t ON t.id = d.target_id
     WHERE d.status = 'pending'
     ORDER BY d.created_at DESC`,
  )
}

/** Approve a draft — caller is responsible for actually sending the SMS. */
export async function approveDraft(draftId: number, editedBody?: string): Promise<string | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ id: number; draft_body: string; edited_body: string | null }>(
    `UPDATE outreach_drafts
     SET status = 'approved', edited_body = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING id, draft_body, edited_body`,
    [editedBody ?? null, draftId],
  )
  if (!rows[0]) return null
  return rows[0].edited_body ?? rows[0].draft_body
}

/** Mark a draft as sent after the SMS has been dispatched. */
export async function markDraftSent(draftId: number): Promise<void> {
  await execute(
    `UPDATE outreach_drafts SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [draftId],
  )
}

/** Reject a draft without sending. */
export async function rejectDraft(draftId: number): Promise<void> {
  await execute(
    `UPDATE outreach_drafts SET status = 'rejected', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [draftId],
  )
}

// ── Inbound handler — called from index.ts ────────────────────────────────────

/**
 * Called whenever an inbound SMS arrives. Checks if the sender is one of our
 * outreach targets. If so, updates CRM status and generates a draft reply.
 * Non-fatal — all errors are caught so the main webhook pipeline is unaffected.
 */
export async function handleOutreachInbound(from: string, body: string): Promise<void> {
  if (!isDbConnected()) return
  try {
    const targets = await query<OutreachTargetRow>(
      `SELECT * FROM outreach_targets WHERE phone = $1 LIMIT 1`,
      [from],
    )
    const target = targets[0]
    if (!target) return  // not one of our outreach targets

    // Update CRM status
    const newStatus = target.status === "new" || target.status === "contacted" ? "replied" : target.status
    await execute(
      `UPDATE outreach_targets
       SET status = $1, reply_body = $2, last_contact_date = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [newStatus, body.slice(0, 500), target.id],
    )
    console.log(`[outreachAgent] ${target.name} replied — status → ${newStatus}`)

    // Generate AI draft reply
    const draft = await generateOutreachDraft(target, body)
    const draftId = await saveOutreachDraft(target.id, body, draft)
    console.log(`[outreachAgent] draft saved (id=${draftId}) for ${target.name}: "${draft.slice(0, 60)}..."`)

  } catch (err) {
    console.error("[outreachAgent] handleOutreachInbound error:", (err as Error).message)
  }
}

// ── Morning brief ─────────────────────────────────────────────────────────────

export interface MorningBrief {
  pendingDrafts:   number
  newReplies:      Array<{ name: string; agency: string; body: string }>
  followUpsDue:    Array<{ id: number; name: string; agency: string; daysSince: number }>
  totalContacted:  number
  totalReplied:    number
  totalDemoBooked: number
}

/** Summarise overnight activity for the morning review. */
export async function getMorningBrief(): Promise<MorningBrief> {
  if (!isDbConnected()) {
    return { pendingDrafts: 0, newReplies: [], followUpsDue: [], totalContacted: 0, totalReplied: 0, totalDemoBooked: 0 }
  }

  // Safe: parseInt with default ensures this is always a valid integer, never user input
  const followupDays = Math.max(1, parseInt(process.env.OUTREACH_FOLLOWUP_DAYS ?? "3", 10))

  const [drafts, replies, followUps, stats] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM outreach_drafts WHERE status = 'pending'`),
    query<{ name: string; agency: string; reply_body: string }>(
      `SELECT name, agency, reply_body
       FROM outreach_targets
       WHERE status = 'replied' AND reply_body IS NOT NULL
         AND last_contact_date > NOW() - INTERVAL '24 hours'
       ORDER BY last_contact_date DESC`,
    ),
    query<{ id: number; name: string; agency: string; last_contact_date: string }>(
      `SELECT id, name, agency, last_contact_date
       FROM outreach_targets
       WHERE status = 'contacted'
         AND last_contact_date < NOW() - INTERVAL '${followupDays} days'
         AND last_contact_date > NOW() - INTERVAL '14 days'
       ORDER BY last_contact_date ASC`,
    ),
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM outreach_targets GROUP BY status`,
    ),
  ])

  const statusCounts = Object.fromEntries(stats.map(r => [r.status, parseInt(r.count, 10)]))

  return {
    pendingDrafts:   parseInt(drafts[0]?.count ?? "0", 10),
    newReplies:      replies.map(r => ({ name: r.name, agency: r.agency, body: r.reply_body })),
    followUpsDue:    followUps.map(r => ({
      id:        r.id,
      name:      r.name,
      agency:    r.agency,
      daysSince: Math.floor((Date.now() - new Date(r.last_contact_date).getTime()) / 86_400_000),
    })),
    totalContacted:  statusCounts.contacted  ?? 0,
    totalReplied:    statusCounts.replied    ?? 0,
    totalDemoBooked: statusCounts.demo_booked ?? 0,
  }
}
