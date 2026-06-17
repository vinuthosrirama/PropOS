/**
 * httpSMS Transport
 *
 * Sends SMS via the httpSMS Android app — free tier, no subscriptions.
 * Messages appear from the Android device's real SIM card number.
 * Better maintained than android-sms-gateway with a cleaner API + web dashboard.
 *
 * GitHub: https://github.com/NdoleStudio/httpsms
 * App:    https://play.google.com/store/apps/details?id=com.httpsms
 * API:    https://api.httpsms.com
 *
 * Agent setup (one-time, ~10 min):
 *   1. Install "httpSMS" from Google Play on any Android phone
 *   2. Sign up at https://app.httpsms.com with Google/GitHub
 *   3. In the app, tap "Link Phone" — register your SIM number
 *   4. Dashboard → Settings → API Key → copy key
 *   5. Dashboard → Settings → Webhook → set to:
 *        https://propos.addvantage.site/api/webhook/httpsms
 *   6. Add to Railway env vars:
 *        SMS_TRANSPORT=httpsms
 *        HTTPSMS_API_KEY=<your key>
 *        HTTPSMS_FROM=+61XXXXXXXXX    (your registered phone number)
 *
 * How it works:
 *   PropOS → HTTPS → httpSMS API → httpSMS app (push) → Android SIM → carrier → recipient
 *   No Cloudflare Tunnel needed — httpSMS cloud handles routing.
 *
 * Limitations:
 *   - Sends real SMS only (green bubble on iPhone — no iMessage)
 *   - Phone must stay on with data/Wi-Fi
 *   - Free tier: 200 messages/month (plenty for outreach campaign)
 *
 * Incoming replies:
 *   httpSMS pushes to POST /api/webhook/httpsms with:
 *   { data: { contact: "+61...", content: "reply", owner: "+61..." } }
 */

const API_BASE = "https://api.httpsms.com"
const SEND_TIMEOUT_MS = 15_000

const API_KEY = () => process.env.HTTPSMS_API_KEY?.trim() ?? ""
const FROM    = () => process.env.HTTPSMS_FROM?.trim() ?? ""

export function httpSmsConfigured(): boolean {
  return !!(API_KEY() && FROM())
}

function normalisePhone(raw: string): string {
  return raw.startsWith("+") ? raw : "+" + raw.replace(/\D/g, "")
}

/**
 * Send an SMS via httpSMS API with exponential backoff retry.
 */
export async function sendViaHttpSms(
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
      const res = await fetch(`${API_BASE}/v1/messages/send`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key":    API_KEY(),
        },
        body: JSON.stringify({
          from:    FROM(),
          to:      actualTo,
          content: actualBody,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`httpSMS HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      const json = await res.json() as { data?: { id?: string }; message?: string }
      if (!json.data?.id) throw new Error(`httpSMS: no message id in response`)

      return { sid: json.data.id, testMode: !!redirect }
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 500 * Math.pow(2, attempt - 1)  // 500ms, 1s
        console.warn(`[httpsms] attempt ${attempt} failed, retrying in ${backoff}ms:`, (err as Error).message)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastErr
}

/**
 * Parse an incoming httpSMS webhook payload.
 * Payload shape: { data: { contact, content, owner } }
 */
export interface HttpSmsIncoming {
  from:  string
  body:  string
  owner: string
}

export function parseHttpSmsWebhook(payload: unknown): HttpSmsIncoming | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  const data = p.data as Record<string, unknown> | undefined
  if (!data) return null

  const from  = String(data.contact ?? "").trim()
  const body  = String(data.content ?? "").trim()
  const owner = String(data.owner   ?? "").trim()

  if (!from || !body) return null

  const normFrom = from.startsWith("+") ? from : "+" + from.replace(/\D/g, "")
  return { from: normFrom, body, owner }
}
