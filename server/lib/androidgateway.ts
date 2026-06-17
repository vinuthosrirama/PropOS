/**
 * Android SMS Gateway Transport
 *
 * Sends SMS via the android-sms-gateway app on any Android phone.
 * Messages appear from the Android device's real SIM card number.
 * Works for agents on Android — no Mac, no Windows, no cloud dependency.
 *
 * GitHub: https://github.com/capcom6/android-sms-gateway
 * App:    https://sms-gate.app (free download, Apache 2.0)
 *
 * Agent setup (one-time, ~10 min):
 *   1. Install "SMS Gateway for Android" from Google Play (or direct APK from sms-gate.app)
 *   2. Open the app → tap "Local server" → note the URL (e.g. http://192.168.1.x:8080)
 *      OR tap "Cloud server" to get a permanent remote URL (requires free sms-gate.app account)
 *   3. Set a username and password in the app settings
 *   4. Expose via Cloudflare Tunnel for remote access (if using local server):
 *        npx cloudflared tunnel --url http://192.168.1.x:8080
 *      Note the generated URL e.g. https://xxxx.trycloudflare.com
 *   5. Add to server/.env:
 *        SMS_TRANSPORT=android-gateway
 *        SMS_TRANSPORT_FALLBACK=httpsms
 *        ANDROID_GW_URL=https://xxxx.trycloudflare.com
 *        ANDROID_GW_USER=your_username
 *        ANDROID_GW_PASS=your_password
 *
 * How it works:
 *   PropOS → HTTPS → Cloudflare Tunnel → Android app HTTP server →
 *   Android SIM → carrier network → recipient
 *
 * Limitations:
 *   - Sends real SMS only (no iMessage — recipients with iPhone see green bubble)
 *   - Carrier throttling applies: ~3 msg/min recommended to avoid SIM suspension
 *   - Phone must stay on and connected to Wi-Fi/data
 *
 * For iPhone-to-iPhone iMessage: use BlueBubbles or TextingBlue instead.
 * Pair with SMS_TRANSPORT_FALLBACK=httpsms for delivery guarantee.
 *
 * Incoming replies:
 *   The app pushes a webhook to PropOS at POST /api/webhook/android-gateway
 *   when a reply SMS arrives on the device.
 */

const AG_URL  = () => process.env.ANDROID_GW_URL?.replace(/\/$/, "") ?? ""
const AG_USER = () => process.env.ANDROID_GW_USER ?? ""
const AG_PASS = () => process.env.ANDROID_GW_PASS ?? ""

const SEND_TIMEOUT_MS = 20_000
const PING_TIMEOUT_MS = 6_000

// android-sms-gateway rate limit: 3 messages per minute recommended
// We track sends and throttle automatically within the transport.
let _lastSendTime = 0
const MIN_SEND_GAP_MS = 22_000  // ~2.7 sends/min — safe headroom under 3/min

export function androidGatewayConfigured(): boolean {
  return process.env.SMS_TRANSPORT === "android-gateway" && !!(AG_URL() && AG_USER() && AG_PASS())
}

function basicAuth(): string {
  return "Basic " + Buffer.from(`${AG_USER()}:${AG_PASS()}`).toString("base64")
}

function agHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": basicAuth(),
  }
}

function normalisePhone(raw: string): string {
  return raw.startsWith("+") ? raw : "+" + raw.replace(/\D/g, "")
}

/**
 * Send an SMS via the Android Gateway with carrier-safe throttling and retry.
 *
 * If multiple messages are sent too quickly, we insert a small delay
 * to stay under the ~3/min carrier soft limit.
 */
export async function sendViaAndroidGateway(
  to: string,
  body: string,
  liveMode = false,
): Promise<{ sid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const redirect   = testPhone && !liveMode
  const actualTo   = normalisePhone(redirect ? testPhone : to)
  const actualBody = redirect ? `[TEST to ${to}]\n${body}` : body

  // Throttle: enforce minimum gap between sends
  const now = Date.now()
  const sinceLastSend = now - _lastSendTime
  if (_lastSendTime > 0 && sinceLastSend < MIN_SEND_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_SEND_GAP_MS - sinceLastSend))
  }

  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${AG_URL()}/message`, {
        method:  "POST",
        headers: agHeaders(),
        body:    JSON.stringify({
          message:      actualBody,
          phoneNumbers: [actualTo],
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`AndroidGateway HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      const json = await res.json() as {
        id?: string; results?: Array<{ phoneNumber: string; state: string; error?: string }>
        error?: string
      }
      if (json.error) throw new Error(`AndroidGateway error: ${json.error}`)

      // Check individual result for the recipient
      const result = json.results?.[0]
      if (result?.error) throw new Error(`Send failed for ${actualTo}: ${result.error}`)

      _lastSendTime = Date.now()
      const sid = json.id ?? `ag-${Date.now()}`
      return { sid, testMode: !!redirect }
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 2_000 * Math.pow(2, attempt - 1)  // 2s, 4s
        console.warn(`[android-gateway] attempt ${attempt} failed, retrying in ${backoff}ms:`, (err as Error).message)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastErr
}

/**
 * Health check — ping the Android gateway.
 */
export async function pingAndroidGateway(): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!AG_URL()) return { ok: false, error: "ANDROID_GW_URL not set" }
  try {
    const res = await fetch(`${AG_URL()}/health`, {
      headers: agHeaders(),
      signal:  AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json() as { status?: string; version?: string }
    return { ok: json.status === "ok" || res.ok, version: json.version }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Register a PropOS webhook with the Android Gateway so incoming SMS
 * are pushed to POST /api/webhook/android-gateway.
 * The gateway will call this URL with { from, message, timestamp } on each reply.
 */
export async function registerAndroidGatewayWebhook(webhookUrl: string): Promise<void> {
  if (!AG_URL()) return
  try {
    const res = await fetch(`${AG_URL()}/webhooks`, {
      method:  "POST",
      headers: agHeaders(),
      body:    JSON.stringify({
        url:    webhookUrl,
        event:  "sms:received",
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok && res.status !== 404) {
      console.warn(`[android-gateway] webhook register returned HTTP ${res.status}`)
    }
  } catch (err) {
    console.warn("[android-gateway] webhook registration failed:", err instanceof Error ? err.message : err)
  }
}

export interface AndroidGatewayIncoming {
  from:      string
  body:      string
  deviceId?: string
  timestamp: string
}

/**
 * Parse an incoming Android Gateway webhook payload.
 * Handles both the app's native format and the cloud relay format.
 */
export function parseAndroidGatewayWebhook(payload: unknown): AndroidGatewayIncoming | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>

  const from = (
    (p.from as string) ??
    (p.phoneNumber as string) ??
    (p.sender as string) ??
    ""
  ).trim()

  const body = (
    (p.message as string) ??
    (p.text as string) ??
    (p.body as string) ??
    ""
  ).trim()

  const timestamp = (p.receivedAt as string) ?? (p.timestamp as string) ?? new Date().toISOString()
  const deviceId  = (p.deviceId as string) ?? undefined

  if (!from || !body) return null

  const normFrom = from.startsWith("+") ? from : "+" + from.replace(/\D/g, "")
  return { from: normFrom, body, deviceId, timestamp }
}
