/**
 * Conversation thread store.
 * Uses PostgreSQL when DATABASE_URL is set, otherwise in-memory Map + Sheets.
 */

import { isDbConnected, query, execute } from "./db.js"

export interface ConversationMessage {
  role: "agent" | "lead"
  body: string
  ts: string   // ISO timestamp
}

export interface ConversationThread {
  leadId:          string
  leadName:        string
  propertyAddress: string
  phone:           string
  email:           string
  messages:        ConversationMessage[]
  lastReplyAt:     string   // ISO — last INBOUND message
  unread:          boolean
}

// In-memory fallback (used when no DATABASE_URL)
const threads = new Map<string, ConversationThread>()

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getThread(phone: string): Promise<ConversationThread | undefined> {
  const key = normalise(phone)
  if (isDbConnected()) {
    const row = await query<DbRow>(
      `SELECT * FROM conversations WHERE phone = $1`, [key],
    )
    return row[0] ? fromDbRow(row[0]) : undefined
  }
  return threads.get(key)
}

export async function getAllThreads(): Promise<ConversationThread[]> {
  if (isDbConnected()) {
    const rows = await query<DbRow>(
      `SELECT * FROM conversations ORDER BY last_reply_at DESC`,
    )
    return rows.map(fromDbRow)
  }
  return Array.from(threads.values()).sort(
    (a, b) => new Date(b.lastReplyAt).getTime() - new Date(a.lastReplyAt).getTime(),
  )
}

export async function getUnreadCount(): Promise<number> {
  if (isDbConnected()) {
    const rows = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM conversations WHERE unread = true`,
    )
    return parseInt(rows[0]?.count ?? "0", 10)
  }
  return Array.from(threads.values()).filter(t => t.unread).length
}

export async function markThreadRead(phone: string): Promise<void> {
  const key = normalise(phone)
  if (isDbConnected()) {
    await execute(
      `UPDATE conversations SET unread = false, updated_at = NOW() WHERE phone = $1`,
      [key],
    )
    return
  }
  const t = threads.get(key)
  if (t) t.unread = false
}

// ── Write ────────────────────────────────────────────────────────────────────

/** Called by webhook.ts on every inbound SMS reply from a lead */
export async function addReplyToThread(
  phone: string,
  body: string,
  meta?: { leadId?: string; leadName?: string; propertyAddress?: string; email?: string },
): Promise<void> {
  const key = normalise(phone)
  const now = new Date().toISOString()
  const msg: ConversationMessage = { role: "lead", body, ts: now }

  if (isDbConnected()) {
    // Upsert: insert or append message
    await query(
      `INSERT INTO conversations (phone, lead_id, lead_name, property_address, email, messages, last_reply_at, unread, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         lead_id = CASE WHEN conversations.lead_id = '' AND $2 != '' THEN $2 ELSE conversations.lead_id END,
         lead_name = CASE WHEN conversations.lead_name = conversations.phone AND $3 != '' THEN $3 ELSE conversations.lead_name END,
         property_address = CASE WHEN conversations.property_address = '' AND $4 != '' THEN $4 ELSE conversations.property_address END,
         email = CASE WHEN conversations.email = '' AND $5 != '' THEN $5 ELSE conversations.email END,
         messages = conversations.messages || $6::jsonb,
         last_reply_at = $7,
         unread = true,
         updated_at = NOW()`,
      [
        key,
        meta?.leadId ?? "",
        meta?.leadName ?? phone,
        meta?.propertyAddress ?? "",
        meta?.email ?? "",
        JSON.stringify([msg]),
        now,
      ],
    )
    return
  }

  // In-memory fallback
  const existing = threads.get(key)
  const thread: ConversationThread = existing ?? {
    leadId: meta?.leadId ?? "",
    leadName: meta?.leadName ?? phone,
    propertyAddress: meta?.propertyAddress ?? "",
    phone: key,
    email: meta?.email ?? "",
    messages: [],
    lastReplyAt: now,
    unread: false,
  }

  if (meta?.leadId && !thread.leadId) thread.leadId = meta.leadId
  if (meta?.leadName && thread.leadName === key) thread.leadName = meta.leadName
  if (meta?.propertyAddress && !thread.propertyAddress) thread.propertyAddress = meta.propertyAddress
  if (meta?.email && !thread.email) thread.email = meta.email

  thread.messages.push(msg)
  thread.lastReplyAt = now
  thread.unread = true
  threads.set(key, thread)
  await persistThread(thread)
}

/** Called by send.ts after a successful outbound SMS so threads include agent messages */
export async function addAgentMessageToThread(
  phone: string,
  body: string,
  meta?: { leadId?: string; leadName?: string; propertyAddress?: string; email?: string },
): Promise<void> {
  const key = normalise(phone)
  const now = new Date().toISOString()
  const msg: ConversationMessage = { role: "agent", body, ts: now }

  if (isDbConnected()) {
    await query(
      `INSERT INTO conversations (phone, lead_id, lead_name, property_address, email, messages, last_reply_at, unread, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, false, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         lead_id = CASE WHEN conversations.lead_id = '' AND $2 != '' THEN $2 ELSE conversations.lead_id END,
         lead_name = CASE WHEN conversations.lead_name = conversations.phone AND $3 != '' THEN $3 ELSE conversations.lead_name END,
         property_address = CASE WHEN conversations.property_address = '' AND $4 != '' THEN $4 ELSE conversations.property_address END,
         email = CASE WHEN conversations.email = '' AND $5 != '' THEN $5 ELSE conversations.email END,
         messages = conversations.messages || $6::jsonb,
         updated_at = NOW()`,
      [
        key,
        meta?.leadId ?? "",
        meta?.leadName ?? phone,
        meta?.propertyAddress ?? "",
        meta?.email ?? "",
        JSON.stringify([msg]),
        now,
      ],
    )
    return
  }

  // In-memory fallback
  const existing = threads.get(key)
  const thread: ConversationThread = existing ?? {
    leadId: meta?.leadId ?? "",
    leadName: meta?.leadName ?? phone,
    propertyAddress: meta?.propertyAddress ?? "",
    phone: key,
    email: meta?.email ?? "",
    messages: [],
    lastReplyAt: now,
    unread: false,
  }

  if (meta?.leadId && !thread.leadId) thread.leadId = meta.leadId
  if (meta?.leadName && thread.leadName === key) thread.leadName = meta.leadName
  if (meta?.propertyAddress && !thread.propertyAddress) thread.propertyAddress = meta.propertyAddress
  if (meta?.email && !thread.email) thread.email = meta.email

  thread.messages.push(msg)
  threads.set(key, thread)
  await persistThread(thread)
}

// ── Persistence (Sheets fallback for in-memory mode) ─────────────────────────

const SHEET_URL = process.env.SHEET_URL

async function persistThread(thread: ConversationThread): Promise<void> {
  if (isDbConnected()) return // DB handles its own persistence
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "upsert_conversation",
        phone: thread.phone,
        leadId: thread.leadId,
        leadName: thread.leadName,
        propertyAddress: thread.propertyAddress,
        email: thread.email,
        messages: JSON.stringify(thread.messages),
        lastReplyAt: thread.lastReplyAt,
        unread: thread.unread,
      }),
    })
  } catch {
    // Non-fatal — thread is still held in memory
  }
}

/** Load existing threads from Sheets on server startup (in-memory mode only) */
export async function loadConversations(): Promise<void> {
  if (isDbConnected()) {
    const rows = await query<DbRow>(`SELECT COUNT(*) as count FROM conversations`)
    const count = parseInt((rows[0] as Record<string, string>)?.count ?? "0", 10)
    console.log(`  Conversations: ${count} thread(s) in database`)
    return
  }

  if (!SHEET_URL) return
  try {
    const res = await fetch(`${SHEET_URL}?action=getConversations`)
    if (!res.ok) return
    const data = await res.json() as { conversations?: ConversationThread[] }
    for (const t of data.conversations ?? []) {
      if (t.phone) {
        if (typeof t.messages === "string") {
          try { t.messages = JSON.parse(t.messages) } catch { t.messages = [] }
        }
        threads.set(normalise(t.phone), t)
      }
    }
    console.log(`  Conversations: loaded ${threads.size} thread(s) from Sheets`)
  } catch {
    // Non-fatal
  }
}

// ── DB row mapping ──────────────────────────────────────────────────────────

interface DbRow {
  phone: string
  lead_id: string
  lead_name: string
  property_address: string
  email: string
  messages: ConversationMessage[] | string
  last_reply_at: string
  unread: boolean
}

function fromDbRow(row: DbRow): ConversationThread {
  let messages = row.messages
  if (typeof messages === "string") {
    try { messages = JSON.parse(messages) } catch { messages = [] }
  }
  return {
    leadId: row.lead_id,
    leadName: row.lead_name,
    propertyAddress: row.property_address,
    phone: row.phone,
    email: row.email,
    messages: messages as ConversationMessage[],
    lastReplyAt: typeof row.last_reply_at === "string"
      ? row.last_reply_at
      : new Date(row.last_reply_at).toISOString(),
    unread: row.unread,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalise(phone: string): string {
  return phone.trim().replace(/\s+/g, "")
}
