/**
 * TextingBlue Transport
 *
 * Sends iMessages via the TextingBlue API — a hosted service that routes
 * messages through the agent's own iPhone (via iOS Shortcut + Apple ID).
 * Messages appear as real iMessages from the agent's number — blue bubbles,
 * read receipts, full iMessage experience. No Mac required.
 *
 * GitHub SDK: https://github.com/textingblue/imessage-api
 * Docs:       https://docs.texting.blue
 *
 * Agent setup (one-time, ~5 min):
 *   1. Go to https://texting.blue → sign up → get API key
 *   2. Install the TextingBlue Shortcut on your iPhone:
 *      texting.blue/shortcut → install → sign in with your API key
 *   3. iPhone must have iMessage enabled (Settings → Messages → iMessage ON)
 *   4. Add to server/.env:
 *        SMS_TRANSPORT=textingblue
 *        SMS_TRANSPORT_FALLBACK=twilio
 *        TEXTINGBLUE_API_KEY=tb_live_xxxxxxxxxxxx
 *
 * How it works:
 *   PropOS → HTTPS → TextingBlue API → iOS Shortcut push notification →
 *   iPhone → iMessage → recipient
 *
 * Pricing: Free tier = 100 messages/month. Paid plans for more volume.
 * Note: Only sends iMessages (requires recipient also has iMessage).
 * For SMS fallback (green bubble), pair with Twilio as SMS_TRANSPORT_FALLBACK.
 */

const TB_API_KEY = () => process.env.TEXTINGBLUE_API_KEY ?? ""
const TB_BASE    = "https://api.texting.blue/v1"

const SEND_TIMEOUT_MS = 20_000
const PING_TIMEOUT_MS = 6_000

export function textingBlueConfigured(): boolean {
  return process.env.SMS_TRANSPORT === "textingblue" && !!TB_API_KEY()
}

function tbHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key":    TB_API_KEY(),
  }
}

function normalisePhone(raw: string): string {
  return raw.startsWith("+") ? raw : "+" + raw.replace(/\D/g, "")
}

/**
 * Send an iMessage via TextingBlue with retry (max 3 attempts).
 * Returns { sid, testMode }.
 */
export async function sendViaTextingBlue(
  to: string,
  body: string,
): Promise<{ sid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const actualTo   = normalisePhone(testPhone ?? to)
  const actualBody = testPhone ? `[TEST to ${to}]\n${body}` : body

  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${TB_BASE}/messages/send`, {
        method:  "POST",
        headers: tbHeaders(),
        body:    JSON.stringify({
          phone:   actualTo,    // E.164 e.g. "+61412345678"
          content: actualBody,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`TextingBlue HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      const json = await res.json() as {
        id?: string; messageId?: string; success?: boolean; error?: string
      }
      if (json.error) throw new Error(`TextingBlue API error: ${json.error}`)

      const sid = json.id ?? json.messageId ?? `tb-${Date.now()}`
      return { sid, testMode: !!testPhone }
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 1_000 * Math.pow(2, attempt - 1)  // 1s, 2s
        console.warn(`[textingblue] attempt ${attempt} failed, retrying in ${backoff}ms:`, (err as Error).message)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastErr
}

/**
 * Verify the API key is valid and the account is active.
 */
export async function pingTextingBlue(): Promise<{ ok: boolean; plan?: string; error?: string }> {
  if (!TB_API_KEY()) return { ok: false, error: "TEXTINGBLUE_API_KEY not set" }
  try {
    const res = await fetch(`${TB_BASE}/account`, {
      headers: tbHeaders(),
      signal:  AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json() as { plan?: string; status?: string }
    return { ok: true, plan: json.plan }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface TextingBlueIncoming {
  from:      string
  body:      string
  messageId: string
  timestamp: string
}

/**
 * Parse a TextingBlue incoming message webhook.
 * TextingBlue pushes { from, content, messageId, timestamp } for each reply.
 */
export function parseTextingBlueWebhook(payload: unknown): TextingBlueIncoming | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>

  const from = ((p.from as string) ?? (p.sender as string) ?? "").trim()
  const body = ((p.content as string) ?? (p.message as string) ?? (p.body as string) ?? "").trim()
  const messageId = (p.messageId as string) ?? (p.id as string) ?? `tb-${Date.now()}`
  const timestamp = (p.timestamp as string) ?? new Date().toISOString()

  if (!from || !body) return null

  const normFrom = from.startsWith("+") ? from : "+" + from.replace(/\D/g, "")
  return { from: normFrom, body, messageId, timestamp }
}
