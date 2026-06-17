/**
 * TeleLink Transport
 *
 * Sends SMS via TeleLink — a Python/pywinauto Windows bridge that automates
 * Microsoft Phone Link to send messages from the agent's real iPhone/Android number.
 *
 * GitHub: https://github.com/nicholasxdavis/telelink
 *
 * Architecture:
 *   PropOS → HTTPS → Cloudflare Tunnel → TeleLink HTTP server (localhost:3000) →
 *   pywinauto → Phone Link (Windows) → iPhone SMS relay → recipient
 *
 * Important operational constraints:
 *   - Windows PC must be awake (no sleep), Phone Link must be running
 *   - iPhone must be on the same Wi-Fi/BT or connected via USB
 *   - Each send takes ~12s (pywinauto UI automation timeout)
 *   - Bulk sends are queued and dispatched sequentially by TeleLink
 *
 * Setup (one-time, ~20 min):
 *   1. On Windows: install Phone Link, pair your iPhone or Android
 *      iPhone: Settings > Apps > Phone Link > Allow notifications
 *   2. Clone TeleLink:
 *        git clone https://github.com/nicholasxdavis/telelink
 *        cd telelink && pip install -r requirements.txt
 *   3. Edit config.example.yaml → config.yaml:
 *        messaging:
 *          method: auto
 *          auto_timeout_seconds: 12
 *        intake:
 *          port: 3000
 *          token: your_secret_token
 *   4. Start TeleLink: .\start.bat (or python telelink/server.py)
 *   5. Expose via Cloudflare Tunnel (free):
 *        npx cloudflared tunnel --url http://localhost:3000
 *      Note the generated URL, e.g. https://xxxx.trycloudflare.com
 *   6. Add to server/.env:
 *        SMS_TRANSPORT=telelink
 *        TELELINK_URL=https://xxxx.trycloudflare.com
 *        TELELINK_TOKEN=your_secret_token
 *        SMS_TRANSPORT_FALLBACK=httpsms
 */

const TL_URL   = () => process.env.TELELINK_URL?.replace(/\/$/, "") ?? ""
const TL_TOKEN = () => process.env.TELELINK_TOKEN ?? ""

// TeleLink UI automation takes ~12s per message + network overhead.
// We give 30s to allow for a slow PC but avoid hanging indefinitely.
const SEND_TIMEOUT_MS = 30_000
const PING_TIMEOUT_MS = 6_000

export function teleLinkConfigured(): boolean {
  return process.env.SMS_TRANSPORT === "telelink" && !!(TL_URL() && TL_TOKEN())
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = TL_TOKEN()
  if (token) {
    // TeleLink accepts both header formats; send both for compatibility
    headers["Authorization"]    = `Bearer ${token}`
    headers["X-Telelink-Token"] = token
  }
  return headers
}

function normalisePhone(raw: string): string {
  return raw.startsWith("+") ? raw : "+" + raw.replace(/\D/g, "")
}

/**
 * Internal: try a single send attempt via POST /intake.
 * TeleLink's intake server accepts { to, message } JSON and
 * queues the message for Phone Link UI automation.
 */
async function tryOnce(to: string, body: string): Promise<{ id: string }> {
  // TeleLink uses POST /intake for all inbound data (file or SMS queue)
  const url = `${TL_URL()}/intake`
  const res = await fetch(url, {
    method:  "POST",
    headers: buildHeaders(),
    body:    JSON.stringify({ to, message: body, type: "sms" }),
    signal:  AbortSignal.timeout(SEND_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`TeleLink intake HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json().catch(() => ({})) as {
    ok?: boolean; id?: string; sid?: string; queued?: boolean; error?: string
  }
  if (json.error) throw new Error(`TeleLink error: ${json.error}`)

  return { id: json.id ?? json.sid ?? `tl-${Date.now()}` }
}

/**
 * Send an SMS/iMessage via TeleLink with exponential-backoff retry (max 3 attempts).
 * Messages appear from the agent's real mobile number via Phone Link.
 */
export async function sendViaTeleLink(
  to: string,
  body: string,
  liveMode = false,
): Promise<{ sid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const redirect   = testPhone && !liveMode
  const actualTo   = normalisePhone(redirect ? testPhone : to)
  const actualBody = redirect ? `[TEST to ${to}]\n${body}` : body

  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { id } = await tryOnce(actualTo, actualBody)
      return { sid: id, testMode: !!redirect }
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 1_000 * Math.pow(2, attempt - 1)   // 1s, 2s
        console.warn(`[telelink] attempt ${attempt} failed, retrying in ${backoff}ms:`, (err as Error).message)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastErr
}

/**
 * Health check — confirm TeleLink server is reachable and responding.
 */
export async function pingTeleLink(): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!TL_URL()) return { ok: false, error: "TELELINK_URL not set" }
  try {
    const res = await fetch(`${TL_URL()}/health`, {
      headers: buildHeaders(),
      signal:  AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json().catch(() => ({}) as Record<string, unknown>)
    return { ok: true, version: json.version as string | undefined }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Register a PropOS webhook with TeleLink so incoming replies are pushed to
 * POST /api/webhook/telelink. TeleLink calls this URL with { from, message, timestamp }.
 * Non-fatal — TeleLink may run an older version without dynamic webhook registration.
 */
export async function registerTeleLinkWebhook(webhookUrl: string): Promise<void> {
  if (!TL_URL()) return
  try {
    const res = await fetch(`${TL_URL()}/api/webhook`, {
      method:  "POST",
      headers: buildHeaders(),
      body:    JSON.stringify({ url: webhookUrl, events: ["message:received", "sms:received"] }),
      signal:  AbortSignal.timeout(8_000),
    })
    // 404 = TeleLink version doesn't support webhooks — non-fatal
    if (!res.ok && res.status !== 404) {
      console.warn(`[telelink] webhook registration returned HTTP ${res.status}`)
    }
  } catch (err) {
    // Network error during optional registration — log, don't throw
    console.warn("[telelink] webhook registration failed:", err instanceof Error ? err.message : err)
  }
}

// ── Incoming message parsing ──────────────────────────────────────────────────

export interface TeleLinkIncoming {
  from:      string  // phone number e.g. "+61412345678"
  body:      string
  timestamp: string
}

/**
 * Parse an incoming TeleLink webhook payload.
 * TeleLink pushes a variety of shapes depending on version — we try all known formats.
 */
export function parseTeleLinkWebhook(payload: unknown): TeleLinkIncoming | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>

  // Normalise: TeleLink sends from/sender/phone and message/body/text
  const from = (
    (p.from as string) ??
    (p.sender as string) ??
    (p.phone as string) ??
    ""
  ).trim()

  const body = (
    (p.message as string) ??
    (p.body as string) ??
    (p.text as string) ??
    (p.content as string) ??
    ""
  ).trim()

  const timestamp = (p.timestamp as string) ?? (p.time as string) ?? new Date().toISOString()

  if (!from || !body) return null

  // Normalise phone to E.164
  const normFrom = from.startsWith("+") ? from : "+" + from.replace(/\D/g, "")

  return { from: normFrom, body, timestamp }
}
