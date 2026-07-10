/**
 * Self-Hosted iOS Shortcut Relay
 *
 * A free replacement for TextingBlue. Runs entirely on our own server.
 * An iOS Shortcut on the agent's iPhone polls a queue endpoint every N seconds,
 * sends each pending message via native iMessage, then reports back.
 *
 * Architecture:
 *   PropOS → DB queue → GET /api/sms-shortcut/poll ← iOS Shortcut (polling)
 *                                                    ↓ Sends iMessage
 *                     POST /api/sms-shortcut/sent ← iOS Shortcut (confirms)
 *                     POST /api/sms-shortcut/reply ← iOS Shortcut (inbound)
 *
 * No Mac required. No subscription. Cost: $0.
 * Latency: depends on polling interval (30s recommended, fine for 10am batch sends).
 *
 * Setup guide in server/SMS_SETUP.md — "Method 2: Self-Hosted iOS Shortcut Relay"
 *
 * Env vars:
 *   SHORTCUT_RELAY_SECRET   — shared token (generate once: openssl rand -hex 20)
 *   SHORTCUT_RELAY_DEVICE_ID — the iPhone's device_id (set after registration)
 */

import { query, execute, isDbConnected } from "./db.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueuedMessage {
  id:       string
  to:       string
  body:     string
}

export interface ShortcutDevice {
  device_id: string
  phone:     string
  label:     string | null
  last_seen: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function shortcutRelayConfigured(): boolean {
  return !!(process.env.SHORTCUT_RELAY_SECRET?.trim() && process.env.SHORTCUT_RELAY_DEVICE_ID?.trim())
}

export function verifyShortcutSecret(secret: string): boolean {
  const expected = process.env.SHORTCUT_RELAY_SECRET?.trim()
  if (!expected) return false
  // Constant-time comparison to prevent timing attacks
  if (secret.length !== expected.length) return false
  let match = 0
  for (let i = 0; i < secret.length; i++) {
    match |= secret.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return match === 0
}

// ── Outbound queue ────────────────────────────────────────────────────────────

/**
 * Queue a message for the iOS Shortcut to pick up.
 * Returns the queue entry ID.
 */
export async function enqueueShortcutMessage(
  to: string,
  body: string,
  liveMode = false,
): Promise<{ sid: string; testMode: boolean }> {
  if (!isDbConnected()) throw new Error("shortcut-relay: database not connected")

  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const redirect   = testPhone && !liveMode
  const actualTo   = redirect ? testPhone : to
  const actualBody = redirect ? `[TEST to ${to}]\n${body}` : body
  const deviceId   = process.env.SHORTCUT_RELAY_DEVICE_ID?.trim()

  if (!deviceId) throw new Error("SHORTCUT_RELAY_DEVICE_ID not set")

  // Defensive cap only — iMessage/SMS via Messages has no 320-char limit, and
  // the old 320 slice silently cut long outreach texts off mid-sentence.
  if (actualBody.length > 2000) {
    console.warn(`[shortcut-relay] body truncated from ${actualBody.length} to 2000 chars for ${actualTo}`)
  }
  const rows = await query<{ id: string }>(
    `INSERT INTO shortcut_queue (device_id, to_phone, body)
     VALUES ($1, $2, $3) RETURNING id`,
    [deviceId, actualTo, actualBody.slice(0, 2000)],
  )

  const id = rows[0]?.id
  if (!id) throw new Error("shortcut-relay: failed to queue message")

  return { sid: id, testMode: !!redirect }
}

/**
 * Called by GET /api/sms-shortcut/poll.
 * Returns up to 10 pending messages for the device and marks them 'claimed'
 * so a retry doesn't double-send.
 */
export async function pollPending(deviceId: string): Promise<QueuedMessage[]> {
  if (!isDbConnected()) return []

  // Claim pending messages atomically — prevents double-send on concurrent polls
  const rows = await query<{ id: string; to_phone: string; body: string }>(
    `UPDATE shortcut_queue
     SET status = 'claimed', claimed_at = NOW()
     WHERE id IN (
       SELECT id FROM shortcut_queue
       WHERE device_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10
     )
     RETURNING id, to_phone, body`,
    [deviceId],
  )

  // Touch last_seen for the device
  void execute(
    `UPDATE shortcut_devices SET last_seen = NOW() WHERE device_id = $1`,
    [deviceId],
  )

  return rows.map(r => ({ id: r.id, to: r.to_phone, body: r.body }))
}

/** Mark a queued message as sent (called by Shortcut after successful send). */
export async function markSent(messageId: string): Promise<void> {
  await execute(
    `UPDATE shortcut_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
    [messageId],
  )
}

const MAX_SEND_ATTEMPTS = 3

/** Mark a queued message as failed (Shortcut couldn't send). */
export async function markFailed(messageId: string, reason?: string): Promise<void> {
  // Revert claimed → pending for retry, but cap attempts: a permanently
  // undeliverable message must not cycle forever and starve the poll batch.
  const rows = await query<{ attempts: number; status: string }>(
    `UPDATE shortcut_queue
     SET attempts   = attempts + 1,
         status     = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END,
         claimed_at = NULL
     WHERE id = $1 AND status = 'claimed'
     RETURNING attempts, status`,
    [messageId, MAX_SEND_ATTEMPTS],
  )
  const row = rows[0]
  if (row?.status === "failed") {
    console.error(`[shortcut-relay] message ${messageId} FAILED terminally after ${row.attempts} attempts${reason ? `: ${reason}` : ""}`)
  } else if (reason) {
    console.warn(`[shortcut-relay] message ${messageId} failed (attempt ${row?.attempts ?? "?"}): ${reason}`)
  }
}

// ── Stale-claim reaper ────────────────────────────────────────────────────────
// If the iPhone Shortcut claims messages then dies before confirming (iOS kills
// the automation, reboot, network drop), rows would stay 'claimed' forever and
// the message silently lost. The reaper reverts stale claims to 'pending'
// (counting the lost cycle as an attempt, so the cap still applies).

const REAPER_INTERVAL_MS  = 10 * 60 * 1_000

export async function reapStaleClaims(): Promise<void> {
  if (!isDbConnected()) return
  try {
    const rows = await query<{ id: string }>(
      `UPDATE shortcut_queue
       SET attempts   = attempts + 1,
           status     = CASE WHEN attempts + 1 >= $1 THEN 'failed' ELSE 'pending' END,
           claimed_at = NULL
       WHERE status = 'claimed' AND claimed_at < NOW() - INTERVAL '10 minutes'
       RETURNING id`,
      [MAX_SEND_ATTEMPTS],
    )
    if (rows.length > 0) {
      console.warn(`[shortcut-relay] reaper recovered ${rows.length} stale claimed message(s)`)
    }
  } catch (err) {
    console.warn(`[shortcut-relay] reaper failed: ${(err as Error).message}`)
  }
}

export function startShortcutQueueReaper(): void {
  void reapStaleClaims()
  const t = setInterval(() => { void reapStaleClaims() }, REAPER_INTERVAL_MS)
  t.unref()
  console.log("  Shortcut-relay queue reaper: started (every 10 min)")
}

// ── Device registration ───────────────────────────────────────────────────────

/** Register an iPhone device (called once from Shortcut on first use). */
export async function registerDevice(
  deviceId: string,
  phone: string,
  label?: string,
): Promise<void> {
  if (!isDbConnected()) return
  await execute(
    `INSERT INTO shortcut_devices (device_id, phone, label, last_seen)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (device_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           label = COALESCE(EXCLUDED.label, shortcut_devices.label),
           last_seen = NOW()`,
    [deviceId, phone, label ?? null],
  )
  console.log(`[shortcut-relay] device registered: ${deviceId} (${phone}${label ? `, ${label}` : ""})`)
}

/** Get device info. */
export async function getDevice(deviceId: string): Promise<ShortcutDevice | null> {
  if (!isDbConnected()) return null
  const rows = await query<ShortcutDevice>(
    `SELECT device_id, phone, label, last_seen FROM shortcut_devices WHERE device_id = $1`,
    [deviceId],
  )
  return rows[0] ?? null
}

/** Queue stats for the status endpoint. */
export async function getQueueStats(deviceId: string): Promise<{
  pending: number; claimed: number; sent24h: number; failed: number
}> {
  if (!isDbConnected()) return { pending: 0, claimed: 0, sent24h: 0, failed: 0 }

  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) AS count FROM shortcut_queue
     WHERE device_id = $1
       AND (status != 'sent' OR sent_at > NOW() - INTERVAL '24 hours')
     GROUP BY status`,
    [deviceId],
  )

  const counts = Object.fromEntries(rows.map(r => [r.status, parseInt(r.count, 10)]))
  return {
    pending:  counts.pending  ?? 0,
    claimed:  counts.claimed  ?? 0,
    sent24h:  counts.sent     ?? 0,
    failed:   counts.failed   ?? 0,
  }
}
