/**
 * BlueBubbles Transport
 *
 * Sends iMessage/SMS via a locally-running BlueBubbles server on the agent's Mac.
 * Messages appear from the agent's real iPhone number — no Twilio needed.
 * Automatically routes to iMessage (blue bubble) when possible; falls back to SMS.
 *
 * Setup (one-time, ~20 min):
 *   1. Install: brew install --cask bluebubbles
 *   2. Grant Full Disk Access to BlueBubbles: System Settings → Privacy → Full Disk Access
 *   3. Open BlueBubbles → complete setup:
 *      - Firebase: skip (optional)
 *      - Set a password (this is your BLUEBUBBLES_PASSWORD)
 *      - Proxy: choose Cloudflare (free HTTPS URL, e.g. https://xxxx.trycloudflare.com)
 *      - Click Start Server
 *   4. Add to server/.env:
 *        SMS_TRANSPORT=bluebubbles
 *        SMS_TRANSPORT_FALLBACK=httpsms
 *        BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
 *        BLUEBUBBLES_PASSWORD=your_password
 *   5. Mac must stay awake (screen lock OK, sleep NOT OK).
 *      iPhone SMS relay: Settings → Messages → Text Message Forwarding → your Mac ON
 *
 * API reference: https://docs.bluebubbles.app/api-reference
 */

import { query, execute, isDbConnected } from "./db.js"

const BB_URL      = () => process.env.BLUEBUBBLES_URL?.replace(/\/$/, "") ?? ""
const BB_PASSWORD = () => process.env.BLUEBUBBLES_PASSWORD ?? ""

const SEND_TIMEOUT_MS = 15_000
const PING_TIMEOUT_MS = 5_000

export function blueBubblesConfigured(): boolean {
  return !!(BB_URL() && BB_PASSWORD())
}

function bbUrl(path: string): string {
  return `${BB_URL()}${path}?password=${encodeURIComponent(BB_PASSWORD())}`
}

// ── Outbound send tracking ────────────────────────────────────────────────────
// BlueBubbles' async message-send-error webhook payload often omits the
// original recipient/body (documented gap — see the webhook handler in
// index.ts), which silently defeats the fallback-transport redispatch.
// We track our own tempGuid → {to, body} so the webhook handler can recover
// the redispatch target regardless of what BlueBubbles' payload includes.
// Bounded and TTL'd so a long-running server doesn't leak memory.
interface TrackedSend { to: string; body: string; liveMode: boolean; at: number }
const outboundTracker = new Map<string, TrackedSend>()
const TRACKER_TTL_MS = 10 * 60 * 1_000   // 10 minutes — plenty for any async error to arrive

function trackOutbound(guid: string, to: string, body: string, liveMode: boolean): void {
  outboundTracker.set(guid, { to, body, liveMode, at: Date.now() })
  if (outboundTracker.size > 500) {
    // Sweep expired entries rather than let the map grow unbounded
    const cutoff = Date.now() - TRACKER_TTL_MS
    for (const [g, v] of outboundTracker) if (v.at < cutoff) outboundTracker.delete(g)
  }
}

/** Look up the original recipient/body/liveMode for a guid we sent, for webhook-driven redispatch. */
export function getTrackedSend(guid: string): { to: string; body: string; liveMode: boolean } | null {
  const entry = outboundTracker.get(guid)
  if (!entry) return null
  if (Date.now() - entry.at > TRACKER_TTL_MS) { outboundTracker.delete(guid); return null }
  return { to: entry.to, body: entry.body, liveMode: entry.liveMode }
}

// ── Sync/async dedup registry ─────────────────────────────────────────────────
// When the synchronous delivery poll confirms a failure, the transport chain
// falls through to the next transport immediately. BlueBubbles may STILL fire a
// message-send-error webhook for the same guid seconds later; without this
// registry the webhook handler would redispatch a message that was already
// re-sent, and the recipient would get it twice.
const syncHandledGuids = new Set<string>()

function markSyncHandled(...guids: string[]): void {
  for (const g of guids) if (g) syncHandledGuids.add(g)
  if (syncHandledGuids.size > 2000) syncHandledGuids.clear()
}

/** True if the sync send path already handled (failed over) this guid. */
export function wasSyncHandled(guid: string): boolean {
  return syncHandledGuids.has(guid)
}

// ── Learned service routing ───────────────────────────────────────────────────
// Once a number is confirmed non-iMessage (Android), remember it so future
// sends go straight to green-bubble SMS instead of re-failing the iMessage leg.
// DB-backed with an in-memory layer; fails open (worst case: one wasted
// iMessage attempt re-learns the fact). 90-day expiry — numbers switch platforms.
const smsOnlyMemory = new Map<string, number>()
const SMS_ONLY_TTL_MS = 90 * 24 * 60 * 60 * 1_000

async function isKnownSmsOnly(phone: string): Promise<boolean> {
  const hit = smsOnlyMemory.get(phone)
  if (hit && Date.now() - hit < SMS_ONLY_TTL_MS) return true
  if (!isDbConnected()) return false
  try {
    const rows = await query<{ phone: string }>(
      `SELECT phone FROM handle_service_cache
       WHERE phone = $1 AND sms_only = TRUE AND updated_at > NOW() - INTERVAL '90 days'`,
      [phone],
    )
    if (rows.length > 0) { smsOnlyMemory.set(phone, Date.now()); return true }
  } catch { /* fail open */ }
  return false
}

async function rememberSmsOnly(phone: string): Promise<void> {
  smsOnlyMemory.set(phone, Date.now())
  if (!isDbConnected()) return
  try {
    await execute(
      `INSERT INTO handle_service_cache (phone, sms_only, updated_at)
       VALUES ($1, TRUE, NOW())
       ON CONFLICT (phone) DO UPDATE SET sms_only = TRUE, updated_at = NOW()`,
      [phone],
    )
  } catch { /* memory layer already updated */ }
}

/**
 * Send a text message via BlueBubbles with retry (max 3 attempts, exponential backoff).
 * chatGuid prefix "any" lets BB auto-pick iMessage vs SMS.
 */
export async function sendViaBlueBubbles(
  to: string,
  body: string,
  liveMode = false,
): Promise<{ sid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const showTestLabel = process.env.SMS_TEST_LABEL === "true"
  // SMS_LIVE_ALLOWLIST: comma-separated E.164 numbers that bypass TEST_RECIPIENT_PHONE redirect.
  const allowlist  = (process.env.SMS_LIVE_ALLOWLIST ?? "").split(",").map(s => s.trim()).filter(Boolean)
  // Normalize to E.164: handles AU mobile (04xxxxxxxx → +614xxxxxxxx) and already-E164 numbers
  const norm = (n: string): string => {
    const d = n.replace(/\D/g, "")
    if (d.startsWith("61") && d.length === 11) return "+" + d
    if (d.startsWith("0") && d.length === 10)  return "+61" + d.slice(1)
    return "+" + d
  }
  const isLive     = liveMode || allowlist.some(n => norm(n) === norm(to))
  const redirect   = testPhone && !isLive
  const actualTo   = redirect ? testPhone : to
  const actualBody = (redirect && showTestLabel) ? `[TEST to ${to}]\n${body}` : body
  const safeNumber = norm(actualTo)

  // chatGuid service prefix. Default "any" lets the Private API pick iMessage/SMS.
  // BLUEBUBBLES_SERVICE=iMessage forces a real service for the AppleScript path
  // (AppleScript cannot use "any" — it errors -1700). Set this when the Private
  // API helper is not connected and you are messaging iMessage contacts.
  const configured = process.env.BLUEBUBBLES_SERVICE?.trim() || "any"
  // Learned routing: a number confirmed non-iMessage skips straight to SMS
  // (green bubble via the iPhone's Text Message Forwarding), avoiding a doomed
  // iMessage attempt + poll wait on every send.
  const primary = (configured !== "SMS" && await isKnownSmsOnly(safeNumber)) ? "SMS" : configured

  try {
    return await attemptService(primary, safeNumber, actualBody, !!redirect, isLive)
  } catch (err) {
    // BLUEBUBBLES_SMS_FALLBACK=false disables the in-transport green-bubble
    // retry (e.g. if this BB version misbehaves on the "SMS" service string).
    const smsFallback = process.env.BLUEBUBBLES_SMS_FALLBACK?.trim() !== "false"
    if (err instanceof DeliveryConfirmedFailure && primary !== "SMS" && smsFallback) {
      // Confirmed the recipient can't receive on the primary (iMessage) service —
      // almost always an Android number. Remember that, then retry once as a
      // real SMS so it lands as a green bubble from the same number.
      console.warn(`[bluebubbles] ${safeNumber} undeliverable via "${primary}" (${err.message}) — retrying as SMS`)
      void rememberSmsOnly(safeNumber)
      return await attemptService("SMS", safeNumber, actualBody, !!redirect, isLive)
    }
    throw err
  }
}

/**
 * One send attempt cycle (3 tries with backoff) against a specific BB service.
 * Throws DeliveryConfirmedFailure immediately on a poll-confirmed failure so
 * the caller can switch service or transport instead of burning retries.
 */
async function attemptService(
  service: string,
  safeNumber: string,
  actualBody: string,
  redirected: boolean,
  liveMode: boolean,
): Promise<{ sid: string; testMode: boolean }> {
  const chatGuid = `${service};-;${safeNumber}`
  const tempGuid = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  // Optional override: "private-api" (reliable, supports new chats — needs Private
  // API enabled) or "apple-script" (works for existing chats without Private API).
  // Unset lets BlueBubbles pick its default.
  const method = process.env.BLUEBUBBLES_METHOD?.trim()
  const payload: Record<string, unknown> = { chatGuid, tempGuid, message: actualBody }
  if (method) payload.method = method

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(bbUrl("/api/v1/message/text"), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(SEND_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`BlueBubbles HTTP ${res.status}: ${text.slice(0, 600)}`)
      }

      const json = await res.json() as { data?: { guid?: string }; error?: string }
      if (json.error) throw new Error(`BlueBubbles server error: ${json.error}`)

      const guid = json.data?.guid ?? tempGuid
      trackOutbound(guid, safeNumber, actualBody, liveMode)
      trackOutbound(tempGuid, safeNumber, actualBody, liveMode)   // webhook errors sometimes reference tempGuid instead

      // BlueBubbles returns HTTP 200 "Message sent!" the instant it hands the
      // message to iMessage/AppleScript — before delivery is actually attempted.
      // For a brand-new SMS-only contact this means we'd report success even
      // though the send silently fails a moment later (documented BlueBubbles
      // behavior, not a bug on our end). A short poll catches that failure
      // synchronously so the transport chain in sms.ts can fall through to the
      // next transport immediately, instead of only relying on the async
      // message-send-error webhook (which BlueBubbles doesn't always fire, and
      // whose payload doesn't always include enough to redispatch anyway).
      const deliveryCheck = await pollDeliveryStatus(guid)
      if (deliveryCheck?.failed) {
        // Confirmed delivery failure (e.g. recipient isn't iMessage-capable) — retrying
        // the same service call against BlueBubbles will fail the exact same way
        // every time, so don't burn the retry budget on it. Throw immediately so the
        // caller can switch to the SMS service or the next transport right away.
        // Mark both guids handled so the async message-send-error webhook for this
        // same failure doesn't redispatch a second copy.
        markSyncHandled(guid, tempGuid)
        throw new DeliveryConfirmedFailure(deliveryCheck.reason ?? "unknown reason")
      }

      return { sid: guid, testMode: redirected }
    } catch (err) {
      lastErr = err
      if (err instanceof DeliveryConfirmedFailure) break
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 500 * Math.pow(2, attempt - 1)   // 500ms, 1000ms
        console.warn(`[bluebubbles] ${service} attempt ${attempt} failed, retrying in ${backoff}ms:`, (err as Error).message)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastErr
}

class DeliveryConfirmedFailure extends Error {
  constructor(reason: string) {
    super(`BlueBubbles delivery failed: ${reason}`)
    this.name = "DeliveryConfirmedFailure"
  }
}

/**
 * Poll BlueBubbles for a short window to check whether a just-sent message
 * actually delivered, catching the "returns 200 immediately, fails silently
 * a moment later" case documented for brand-new SMS-only contacts.
 *
 * Fails OPEN by design: any unexpected response shape, timeout, or 404 means
 * we return null (treat as success) rather than risk blocking a genuinely
 * working iMessage send on a guess about BlueBubbles' exact field names.
 * A hard failure is only reported when the message resource explicitly
 * carries a non-empty `error` object.
 */
async function pollDeliveryStatus(guid: string): Promise<{ failed: boolean; reason?: string } | null> {
  if (guid.startsWith("temp-")) return null   // no real guid to look up yet
  const POLL_ATTEMPTS = 5
  const POLL_INTERVAL_MS = 700

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    try {
      const res = await fetch(bbUrl(`/api/v1/message/${encodeURIComponent(guid)}`), {
        signal: AbortSignal.timeout(4_000),
      })
      if (!res.ok) continue   // 404/5xx — message resource not ready yet or endpoint unsupported, keep polling
      const json = await res.json().catch(() => null) as
        | { data?: { error?: unknown; dateDelivered?: string | null; dateCreated?: string | null } }
        | null
      const data = json?.data
      if (!data) continue

      const err = data.error
      const hasError = err !== null && err !== undefined && err !== 0 &&
        !(typeof err === "object" && Object.keys(err as object).length === 0)
      if (hasError) {
        const reason = typeof err === "string" ? err : JSON.stringify(err).slice(0, 200)
        return { failed: true, reason }
      }
    } catch {
      // Network hiccup mid-poll — keep trying, fail open at the end
    }
  }
  return null
}

/**
 * Health check — confirm BlueBubbles server is reachable and authenticated.
 */
export async function pingBlueBubbles(): Promise<boolean> {
  if (!BB_URL()) return false
  try {
    const res = await fetch(bbUrl("/api/v1/ping"), { signal: AbortSignal.timeout(PING_TIMEOUT_MS) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Register a webhook with BlueBubbles so PropOS receives incoming replies.
 * Idempotent — checks for duplicate before registering.
 * Events: new-message (incoming reply), message-send-error (delivery failure).
 */
export async function registerBlueBubblesWebhook(webhookUrl: string): Promise<void> {
  try {
    const existing = await fetch(bbUrl("/api/v1/webhook"), {
      signal: AbortSignal.timeout(8_000),
    }).then(r => r.json()).catch(() => ({ data: [] })) as { data: Array<{ url: string }> }

    if (existing.data?.some(w => w.url === webhookUrl)) return  // already registered

    await fetch(bbUrl("/api/v1/webhook"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: webhookUrl, events: ["new-message", "message-send-error"] }),
      signal:  AbortSignal.timeout(8_000),
    })
  } catch (err) {
    // Non-fatal — BB may be starting up. Webhook will be re-registered on next server start.
    throw err
  }
}

// ── Webhook parsing ───────────────────────────────────────────────────────────

export interface BBIncomingMessage {
  from:    string   // phone number e.g. "+61412345678"
  body:    string
  isGroup: boolean
  chatId:  string
  guid:    string   // BlueBubbles message guid, for cross-process dedup
}

export interface BBSendError {
  guid:   string
  reason: string
  to:     string   // recipient phone if recoverable from payload, else ""
  body:   string   // original message text if present, else ""
}

/**
 * Parse an incoming BlueBubbles webhook payload.
 * Returns null for group chats, our own outgoing messages, and send-error events.
 * Handle send errors separately via parseBBSendError().
 */
export function parseBBWebhook(payload: unknown): BBIncomingMessage | null {
  const p = payload as Record<string, unknown>
  if (p.type !== "new-message") return null

  const data = p.data as Record<string, unknown>
  if (data.isFromMe) return null  // ignore our own sent messages

  const handle = data.handle as Record<string, unknown> | undefined
  const from   = (handle?.address as string) ?? ""
  const body   = (data.text as string) ?? ""
  const chats  = (data.chats as Array<Record<string, unknown>>) ?? []
  const chatId = (chats[0]?.guid as string) ?? ""
  const isGroup = chatId.includes(";+;")
  const guid   = (data.guid as string) ?? (data.tempGuid as string) ?? ""

  if (!from || !body) return null
  return { from, body, isGroup, chatId, guid }
}

/**
 * Parse a message-send-error event from BlueBubbles.
 * Log these for diagnostics — they indicate the message was not delivered.
 */
export function parseBBSendError(payload: unknown): BBSendError | null {
  const p = payload as Record<string, unknown>
  if (p.type !== "message-send-error") return null

  const data = p.data as Record<string, unknown>
  const guid = (data.guid as string) ?? (data.tempGuid as string) ?? ""
  const reason = (data.error as string) ?? (data.description as string) ?? "unknown"

  if (!guid) return null

  // Recover recipient + body for redispatch via the next transport.
  // Chat guid format: "iMessage;-;+61412345678" or "SMS;-;+61412345678"
  const body   = (data.text as string) ?? ""
  const handle = data.handle as Record<string, unknown> | undefined
  const chats  = (data.chats as Array<Record<string, unknown>>) ?? []
  const chatGuid = (chats[0]?.guid as string) ?? ""
  const to = ((handle?.address as string) || "")
    || (chatGuid.includes(";-;") ? chatGuid.split(";-;").pop() ?? "" : "")

  return { guid, reason, to, body }
}
