/**
 * SMS Agent contact store (Stages 1-4)
 *
 * CRUD for sms_contacts, voice_signals, and calendar_slots. All functions
 * no-op gracefully (return [] / null / undefined) when DATABASE_URL is unset.
 */

import { query, execute, isDbConnected } from "./db.js"

// ── Types ────────────────────────────────────────────────────────────────────

export type Relationship = "business_partner" | "close_friend" | "family" | "agent_prospect"
export type ContactStatus = "active" | "paused" | "completed" | "opted_out" | "backlog" | "booked"

export interface SmsContact {
  id: number
  name: string
  phone: string
  relationship: Relationship
  stage: number
  personalisation: Record<string, unknown>
  voice_override: Record<string, unknown>
  conversation_objective: string | null
  last_contact: string | null
  status: ContactStatus
  auto_reply: boolean
  follow_up_at: string | null
  attempts: number
  source: string
}

export interface VoiceSignal {
  draft_body: string
  action: "approved_as_is" | "edited" | "rejected"
  edited_body?: string | null
  edit_diff?: string | null
  contact_id?: number | null
  relationship?: string | null
}

export interface CalendarSlot {
  id: number
  contact_id: number | null
  proposed_time: string
  status: "proposed" | "accepted" | "declined" | "rescheduled" | "blocked"
  location: string | null
  notes: string | null
}

// ── Contacts ─────────────────────────────────────────────────────────────────

function normalisePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, "")
}

function rowToContact(r: Record<string, unknown>): SmsContact {
  const json = (v: unknown): Record<string, unknown> => {
    if (!v) return {}
    if (typeof v === "string") { try { return JSON.parse(v) } catch { return {} } }
    return v as Record<string, unknown>
  }
  return {
    id: r.id as number,
    name: r.name as string,
    phone: r.phone as string,
    relationship: r.relationship as Relationship,
    stage: r.stage as number,
    personalisation: json(r.personalisation),
    voice_override: json(r.voice_override),
    conversation_objective: (r.conversation_objective as string) ?? null,
    last_contact: r.last_contact ? new Date(r.last_contact as string).toISOString() : null,
    status: r.status as ContactStatus,
    auto_reply: !!r.auto_reply,
    follow_up_at: r.follow_up_at ? new Date(r.follow_up_at as string).toISOString() : null,
    attempts: (r.attempts as number) ?? 0,
    source: (r.source as string) ?? "manual",
  }
}

export async function getContactByPhone(phone: string): Promise<SmsContact | null> {
  if (!isDbConnected()) return null
  const rows = await query(`SELECT * FROM sms_contacts WHERE phone = $1 LIMIT 1`, [normalisePhone(phone)])
  return rows[0] ? rowToContact(rows[0]) : null
}

export async function getContactById(id: number): Promise<SmsContact | null> {
  if (!isDbConnected()) return null
  const rows = await query(`SELECT * FROM sms_contacts WHERE id = $1 LIMIT 1`, [id])
  return rows[0] ? rowToContact(rows[0]) : null
}

export async function listContacts(filter?: { stage?: number; status?: ContactStatus }): Promise<SmsContact[]> {
  if (!isDbConnected()) return []
  const where: string[] = []
  const params: unknown[] = []
  if (filter?.stage !== undefined) { params.push(filter.stage); where.push(`stage = $${params.length}`) }
  if (filter?.status) { params.push(filter.status); where.push(`status = $${params.length}`) }
  const sql = `SELECT * FROM sms_contacts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC`
  const rows = await query(sql, params)
  return rows.map(rowToContact)
}

export interface UpsertContactInput {
  name: string
  phone: string
  relationship?: Relationship
  stage?: number
  personalisation?: Record<string, unknown>
  voice_override?: Record<string, unknown>
  conversation_objective?: string
  auto_reply?: boolean
  source?: string
}

/** Insert or update a contact by phone. Returns the contact id, or null if no DB. */
export async function upsertContact(input: UpsertContactInput): Promise<number | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ id: number }>(
    `INSERT INTO sms_contacts
       (name, phone, relationship, stage, personalisation, voice_override, conversation_objective, auto_reply, source, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NOW())
     ON CONFLICT (phone) DO UPDATE SET
       name = EXCLUDED.name,
       relationship = EXCLUDED.relationship,
       stage = EXCLUDED.stage,
       personalisation = EXCLUDED.personalisation,
       voice_override = EXCLUDED.voice_override,
       conversation_objective = COALESCE(EXCLUDED.conversation_objective, sms_contacts.conversation_objective),
       auto_reply = EXCLUDED.auto_reply,
       updated_at = NOW()
     RETURNING id`,
    [
      input.name,
      normalisePhone(input.phone),
      input.relationship ?? "agent_prospect",
      input.stage ?? 1,
      JSON.stringify(input.personalisation ?? {}),
      JSON.stringify(input.voice_override ?? {}),
      input.conversation_objective ?? null,
      input.auto_reply ?? false,
      input.source ?? "manual",
    ],
  )
  return rows[0]?.id ?? null
}

export async function setContactStatus(id: number, status: ContactStatus): Promise<void> {
  if (!isDbConnected()) return
  await execute(`UPDATE sms_contacts SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id])
}

export async function markContacted(id: number, opts?: { followUpAt?: string; incrementAttempts?: boolean }): Promise<void> {
  if (!isDbConnected()) return
  await execute(
    `UPDATE sms_contacts
     SET last_contact = NOW(),
         follow_up_at = $2,
         attempts = attempts + $3,
         updated_at = NOW()
     WHERE id = $1`,
    [id, opts?.followUpAt ?? null, opts?.incrementAttempts ? 1 : 0],
  )
}

// ── Voice signals (learning data) ────────────────────────────────────────────

export async function recordVoiceSignal(sig: VoiceSignal): Promise<void> {
  if (!isDbConnected()) return
  await execute(
    `INSERT INTO voice_signals (draft_body, action, edited_body, edit_diff, contact_id, relationship)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sig.draft_body.slice(0, 1000), sig.action, sig.edited_body ?? null, sig.edit_diff ?? null, sig.contact_id ?? null, sig.relationship ?? null],
  )
}

export async function getRecentVoiceSignals(limit = 30): Promise<Array<VoiceSignal & { created_at: string }>> {
  if (!isDbConnected()) return []
  const rows = await query<VoiceSignal & { created_at: string }>(
    `SELECT draft_body, action, edited_body, edit_diff, contact_id, relationship, created_at
     FROM voice_signals ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows
}

/** Approved-as-is rate over the last N signals (used by the voice-degradation brake). */
export async function getApprovedAsIsRate(window = 20): Promise<{ rate: number; count: number }> {
  if (!isDbConnected()) return { rate: 1, count: 0 }
  const rows = await query<{ action: string }>(
    `SELECT action FROM voice_signals ORDER BY created_at DESC LIMIT $1`,
    [window],
  )
  if (rows.length === 0) return { rate: 1, count: 0 }
  const approved = rows.filter(r => r.action === "approved_as_is").length
  return { rate: approved / rows.length, count: rows.length }
}

/** Count signals recorded since the last voice calibration for a voice_id. */
export async function countSignalsSinceCalibration(voiceId: string): Promise<number> {
  if (!isDbConnected()) return 0
  const rows = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM voice_signals
     WHERE created_at > COALESCE(
       (SELECT calibration_date FROM voice_profiles WHERE voice_id = $1), '1970-01-01'::timestamptz)`,
    [voiceId],
  )
  return parseInt(rows[0]?.cnt ?? "0", 10)
}

// ── Calendar slots ───────────────────────────────────────────────────────────

export async function getOpenSlots(contactId?: number): Promise<CalendarSlot[]> {
  if (!isDbConnected()) return []
  const sql = contactId
    ? `SELECT * FROM calendar_slots WHERE proposed_time > NOW() AND status IN ('proposed','accepted') AND (contact_id = $1 OR contact_id IS NULL) ORDER BY proposed_time`
    : `SELECT * FROM calendar_slots WHERE proposed_time > NOW() AND status IN ('proposed','accepted') ORDER BY proposed_time`
  const rows = await query<CalendarSlot>(sql, contactId ? [contactId] : [])
  return rows
}

export async function getBlockedSlots(): Promise<CalendarSlot[]> {
  if (!isDbConnected()) return []
  return query<CalendarSlot>(
    `SELECT * FROM calendar_slots WHERE status = 'blocked' AND proposed_time > NOW() ORDER BY proposed_time`,
  )
}

export async function bookSlot(input: { contactId: number; proposedTime: string; location?: string; notes?: string }): Promise<number | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ id: number }>(
    `INSERT INTO calendar_slots (contact_id, proposed_time, status, location, notes)
     VALUES ($1, $2, 'accepted', $3, $4) RETURNING id`,
    [input.contactId, input.proposedTime, input.location ?? null, input.notes ?? null],
  )
  return rows[0]?.id ?? null
}

export async function getUpcomingMeetings(withinHours = 48): Promise<Array<CalendarSlot & { contact_name: string; contact_phone: string }>> {
  if (!isDbConnected()) return []
  return query<CalendarSlot & { contact_name: string; contact_phone: string }>(
    `SELECT cs.*, c.name AS contact_name, c.phone AS contact_phone
     FROM calendar_slots cs
     JOIN sms_contacts c ON c.id = cs.contact_id
     WHERE cs.status = 'accepted'
       AND cs.proposed_time BETWEEN NOW() AND NOW() + ($1 || ' hours')::interval
     ORDER BY cs.proposed_time`,
    [withinHours],
  )
}
