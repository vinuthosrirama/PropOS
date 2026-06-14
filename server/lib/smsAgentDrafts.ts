/**
 * SMS Agent approval queue (sms_agent_drafts)
 *
 * Drafts the conversational agent produces but does not auto-send land here for
 * Vinuth to approve / edit / reject. Mirrors the outreach_drafts pattern but is
 * keyed to sms_contacts and carries reasoning + voice_confidence + kind.
 */

import { query, execute, isDbConnected } from "./db.js"

export type DraftKind = "opener" | "reply" | "followup" | "schedule"

export interface SmsAgentDraft {
  id: number
  contact_id: number
  contact_name: string
  contact_phone: string
  inbound_body: string
  draft_body: string
  reasoning: string | null
  voice_confidence: number
  kind: DraftKind
  channel: string
  status: string
  send_at: string | null
  created_at: string
}

export interface SaveDraftInput {
  contactId: number
  inboundBody?: string
  draftBody: string
  reasoning?: string
  voiceConfidence?: number
  kind?: DraftKind
  sendAt?: string | null
}

/** Save a draft for approval. Returns draft id, or null if no DB. */
export async function saveAgentDraft(input: SaveDraftInput): Promise<number | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ id: number }>(
    `INSERT INTO sms_agent_drafts (contact_id, inbound_body, draft_body, reasoning, voice_confidence, kind, send_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.contactId,
      (input.inboundBody ?? "").slice(0, 1000),
      input.draftBody.slice(0, 320),
      input.reasoning ?? null,
      input.voiceConfidence ?? 0,
      input.kind ?? "reply",
      input.sendAt ?? null,
    ],
  )
  return rows[0]?.id ?? null
}

/** Pending drafts, joined with contact details, newest first. */
export async function getPendingAgentDrafts(): Promise<SmsAgentDraft[]> {
  if (!isDbConnected()) return []
  return query<SmsAgentDraft>(
    `SELECT d.id, d.contact_id, c.name AS contact_name, c.phone AS contact_phone,
            d.inbound_body, d.draft_body, d.reasoning, d.voice_confidence,
            d.kind, d.channel, d.status, d.send_at, d.created_at
     FROM sms_agent_drafts d
     JOIN sms_contacts c ON c.id = d.contact_id
     WHERE d.status = 'pending'
     ORDER BY d.created_at DESC`,
  )
}

/**
 * Approve a draft atomically (only if still pending). Returns the body to send
 * (edited if provided) and the contact, or null if it was already actioned.
 */
export async function approveAgentDraft(
  draftId: number,
  editedBody?: string,
): Promise<{ body: string; contactId: number; contactPhone: string; draftBody: string; wasEdited: boolean } | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ id: number; draft_body: string; contact_id: number; phone: string }>(
    `UPDATE sms_agent_drafts d
     SET status = 'approved', edited_body = $1, updated_at = NOW()
     FROM sms_contacts c
     WHERE d.id = $2 AND d.status = 'pending' AND c.id = d.contact_id
     RETURNING d.id, d.draft_body, d.contact_id, c.phone`,
    [editedBody ?? null, draftId],
  )
  if (!rows[0]) return null
  const wasEdited = !!editedBody && editedBody.trim() !== rows[0].draft_body.trim()
  return {
    body: editedBody?.trim() || rows[0].draft_body,
    contactId: rows[0].contact_id,
    contactPhone: rows[0].phone,
    draftBody: rows[0].draft_body,
    wasEdited,
  }
}

export async function markAgentDraftSent(draftId: number): Promise<void> {
  await execute(
    `UPDATE sms_agent_drafts SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [draftId],
  )
}

export async function rejectAgentDraft(draftId: number): Promise<{ draftBody: string; contactId: number } | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ draft_body: string; contact_id: number }>(
    `UPDATE sms_agent_drafts SET status = 'rejected', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING draft_body, contact_id`,
    [draftId],
  )
  if (!rows[0]) return null
  return { draftBody: rows[0].draft_body, contactId: rows[0].contact_id }
}

/** Drafts whose scheduled send time (after-hours queue) has arrived. */
export async function getDueScheduledDrafts(): Promise<SmsAgentDraft[]> {
  if (!isDbConnected()) return []
  return query<SmsAgentDraft>(
    `SELECT d.id, d.contact_id, c.name AS contact_name, c.phone AS contact_phone,
            d.inbound_body, d.draft_body, d.reasoning, d.voice_confidence,
            d.kind, d.channel, d.status, d.send_at, d.created_at
     FROM sms_agent_drafts d
     JOIN sms_contacts c ON c.id = d.contact_id
     WHERE d.status = 'approved' AND d.send_at IS NOT NULL AND d.send_at <= NOW()
     ORDER BY d.send_at`,
  )
}
