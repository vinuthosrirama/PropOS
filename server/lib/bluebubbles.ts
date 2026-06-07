/**
 * BlueBubbles Transport
 *
 * Sends iMessage/SMS via a locally-running BlueBubbles server on the agent's Mac.
 * Messages appear to come from the agent's real iPhone number — no Twilio needed.
 *
 * Setup (one-time, ~20 min):
 *   1. Install: brew install --cask bluebubbles
 *   2. Grant Full Disk Access to BlueBubbles in System Settings
 *   3. Set up Firebase (or skip — optional for push notifications)
 *   4. Start server → set a password → enable Cloudflare proxy
 *   5. Add to server/.env:
 *        SMS_TRANSPORT=bluebubbles
 *        BLUEBUBBLES_URL=https://your-cloudflare-subdomain.trycloudflare.com
 *        BLUEBUBBLES_PASSWORD=your_password
 *
 * API reference: https://docs.bluebubbles.app/api-reference
 */

const BB_URL      = () => process.env.BLUEBUBBLES_URL?.replace(/\/$/, "") ?? ""
const BB_PASSWORD = () => process.env.BLUEBUBBLES_PASSWORD ?? ""

export function blueBubblesConfigured(): boolean {
  return !!(BB_URL() && BB_PASSWORD())
}

/**
 * Send a text message via BlueBubbles.
 * Automatically routes to iMessage when possible, falls back to SMS.
 */
export async function sendViaBlueBubbles(
  to: string,
  body: string,
): Promise<{ guid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const actualTo   = testPhone ?? to
  const actualBody = testPhone ? `[TEST → ${to}]\n${body}` : body

  // chatGuid format: "any;-;+61412345678"
  // "any" lets BlueBubbles decide iMessage vs SMS automatically
  const chatGuid = `any;-;${actualTo.startsWith("+") ? actualTo : "+" + actualTo.replace(/\D/g, "")}`
  const tempGuid = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const url = `${BB_URL()}/api/v1/message/text?password=${encodeURIComponent(BB_PASSWORD())}`
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chatGuid, tempGuid, message: actualBody }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`BlueBubbles send failed (${res.status}): ${text}`)
  }

  const json = await res.json() as { data?: { guid?: string }; error?: string }
  if (json.error) throw new Error(`BlueBubbles error: ${json.error}`)

  return { guid: json.data?.guid ?? tempGuid, testMode: !!testPhone }
}

/**
 * Health check — confirm BlueBubbles server is reachable.
 */
export async function pingBlueBubbles(): Promise<boolean> {
  try {
    const url = `${BB_URL()}/api/v1/ping?password=${encodeURIComponent(BB_PASSWORD())}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Register a webhook with BlueBubbles so PropOS receives incoming replies.
 * Call this once on server start when BB is the active transport.
 *
 * Events registered: new-message, message-send-error
 */
export async function registerBlueBubblesWebhook(webhookUrl: string): Promise<void> {
  const url = `${BB_URL()}/api/v1/webhook?password=${encodeURIComponent(BB_PASSWORD())}`

  // List existing webhooks to avoid duplicates
  const existing = await fetch(url).then(r => r.json()).catch(() => ({ data: [] })) as { data: Array<{ url: string }> }
  if (existing.data?.some(w => w.url === webhookUrl)) return   // already registered

  await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ url: webhookUrl, events: ["new-message", "message-send-error"] }),
  })
}

/**
 * Parse an incoming BlueBubbles webhook payload into a normalised shape.
 * Mount this at POST /api/webhook/bluebubbles in index.ts.
 */
export interface BBIncomingMessage {
  from:    string   // phone number e.g. "+61412345678"
  body:    string
  isGroup: boolean
  chatId:  string
}

export function parseBBWebhook(payload: unknown): BBIncomingMessage | null {
  const p = payload as Record<string, unknown>
  if (p.type !== "new-message") return null

  const data = p.data as Record<string, unknown>
  if (data.isFromMe) return null   // ignore our own outgoing messages

  const handle = data.handle as Record<string, unknown> | undefined
  const from   = (handle?.address as string) ?? ""
  const body   = (data.text as string) ?? ""
  const chats  = (data.chats as Array<Record<string, unknown>>) ?? []
  const chatId = (chats[0]?.guid as string) ?? ""
  const isGroup = chatId.includes(";+;")

  if (!from || !body) return null
  return { from, body, isGroup, chatId }
}
