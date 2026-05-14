/**
 * Conversation thread store — in-memory Map + Sheets persistence.
 * Each thread is keyed by the lead's phone number (E.164 format from Twilio).
 */

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

const threads = new Map<string, ConversationThread>()

// ── Read ─────────────────────────────────────────────────────────────────────

export function getThread(phone: string): ConversationThread | undefined {
  return threads.get(normalise(phone))
}

export function getAllThreads(): ConversationThread[] {
  return Array.from(threads.values()).sort(
    (a, b) => new Date(b.lastReplyAt).getTime() - new Date(a.lastReplyAt).getTime()
  )
}

export function getUnreadCount(): number {
  return Array.from(threads.values()).filter(t => t.unread).length
}

export function markThreadRead(phone: string): void {
  const t = threads.get(normalise(phone))
  if (t) t.unread = false
}

// ── Write ────────────────────────────────────────────────────────────────────

/** Called by webhook.ts on every inbound SMS reply from a lead */
export async function addReplyToThread(
  phone: string,
  body: string,
  meta?: { leadId?: string; leadName?: string; propertyAddress?: string; email?: string }
): Promise<void> {
  const key = normalise(phone)
  const now = new Date().toISOString()
  const existing = threads.get(key)

  const thread: ConversationThread = existing ?? {
    leadId:          meta?.leadId ?? "",
    leadName:        meta?.leadName ?? phone,
    propertyAddress: meta?.propertyAddress ?? "",
    phone:           key,
    email:           meta?.email ?? "",
    messages:        [],
    lastReplyAt:     now,
    unread:          false,
  }

  // Merge any new meta (first time a lead replies we may not have context)
  if (meta?.leadId          && !thread.leadId)          thread.leadId = meta.leadId
  if (meta?.leadName        && thread.leadName === key)  thread.leadName = meta.leadName
  if (meta?.propertyAddress && !thread.propertyAddress)  thread.propertyAddress = meta.propertyAddress
  if (meta?.email           && !thread.email)            thread.email = meta.email

  thread.messages.push({ role: "lead", body, ts: now })
  thread.lastReplyAt = now
  thread.unread = true
  threads.set(key, thread)

  await persistThread(thread)
}

/** Called by send.ts after a successful outbound SMS so threads include agent messages */
export async function addAgentMessageToThread(
  phone: string,
  body: string,
  meta?: { leadId?: string; leadName?: string; propertyAddress?: string; email?: string }
): Promise<void> {
  const key = normalise(phone)
  const now = new Date().toISOString()
  const existing = threads.get(key)

  const thread: ConversationThread = existing ?? {
    leadId:          meta?.leadId ?? "",
    leadName:        meta?.leadName ?? phone,
    propertyAddress: meta?.propertyAddress ?? "",
    phone:           key,
    email:           meta?.email ?? "",
    messages:        [],
    lastReplyAt:     now,
    unread:          false,
  }

  if (meta?.leadId          && !thread.leadId)          thread.leadId = meta.leadId
  if (meta?.leadName        && thread.leadName === key)  thread.leadName = meta.leadName
  if (meta?.propertyAddress && !thread.propertyAddress)  thread.propertyAddress = meta.propertyAddress
  if (meta?.email           && !thread.email)            thread.email = meta.email

  thread.messages.push({ role: "agent", body, ts: now })
  // Do NOT update lastReplyAt or unread — those track inbound only
  threads.set(key, thread)

  await persistThread(thread)
}

// ── Persistence (Sheets "Conversations" tab) ─────────────────────────────────

const SHEET_URL = process.env.SHEET_URL

async function persistThread(thread: ConversationThread): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify({
        type:            "upsert_conversation",
        phone:           thread.phone,
        leadId:          thread.leadId,
        leadName:        thread.leadName,
        propertyAddress: thread.propertyAddress,
        email:           thread.email,
        messages:        JSON.stringify(thread.messages),
        lastReplyAt:     thread.lastReplyAt,
        unread:          thread.unread,
      }),
    })
  } catch {
    // Non-fatal — thread is still held in memory
  }
}

/** Load existing threads from Sheets on server startup */
export async function loadConversations(): Promise<void> {
  if (!SHEET_URL) return
  try {
    const res  = await fetch(`${SHEET_URL}?action=getConversations`)
    if (!res.ok) return
    const data = await res.json() as { conversations?: ConversationThread[] }
    for (const t of data.conversations ?? []) {
      if (t.phone) {
        // Parse messages JSON string if it was stringified in Sheets
        if (typeof t.messages === "string") {
          try { t.messages = JSON.parse(t.messages) } catch { t.messages = [] }
        }
        threads.set(normalise(t.phone), t)
      }
    }
    console.log(`  Conversations: loaded ${threads.size} thread(s)`)
  } catch {
    // Sheets may not have the Conversations tab yet — non-fatal
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalise(phone: string): string {
  // Ensure consistent E.164 key regardless of how Twilio sends the number
  return phone.trim().replace(/\s+/g, "")
}
