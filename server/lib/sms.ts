/**
 * Unified SMS Transport Layer — BlueBubbles only
 *
 * Primary transport: BlueBubbles (Mac + iPhone — sends as your real number via iMessage/SMS)
 *
 * Additional transports available if needed:
 *   SMS_TRANSPORT=shortcut-relay   iPhone only, no Mac — self-hosted polling relay
 *   SMS_TRANSPORT=android-gateway  Android phone app
 *   SMS_TRANSPORT=httpsms          Android phone (httpSMS app)
 *   SMS_TRANSPORT=imsg             Mac CLI (iMessage/SMS), lightweight option
 *   SMS_TRANSPORT=telelink         Windows + Phone Link
 *   SMS_TRANSPORT=textingblue      iPhone shortcut (iMessage), paid plan required
 *
 * Cascade (double handling — each transport picks up when the previous fails):
 *   SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay,httpsms
 *
 * Example .env:
 *   SMS_TRANSPORT=bluebubbles
 *   BLUEBUBBLES_URL=https://bluebubbles.addvantage.site
 *   BLUEBUBBLES_PASSWORD=secret
 */

import { sendViaBlueBubbles, blueBubblesConfigured, pingBlueBubbles }          from "./bluebubbles.js"
import { sendViaImsg, imsgConfigured, pingImsg }                               from "./imsg.js"
import { sendViaTeleLink, teleLinkConfigured, pingTeleLink }                   from "./telelink.js"
import { sendViaTextingBlue, textingBlueConfigured, pingTextingBlue }          from "./textingblue.js"
import { sendViaAndroidGateway, androidGatewayConfigured, pingAndroidGateway } from "./androidgateway.js"
import { sendViaHttpSms, httpSmsConfigured }                                   from "./httpsms.js"
import { enqueueShortcutMessage, shortcutRelayConfigured }                     from "./shortcutRelay.js"

export type SmsTransport =
  | "bluebubbles"
  | "imsg"
  | "telelink"
  | "textingblue"
  | "android-gateway"
  | "httpsms"
  | "shortcut-relay"
  | "none"

export interface SmsAttempt {
  transport: SmsTransport
  ok:        boolean
  error?:    string
}

export interface SmsSendResult {
  sid:       string
  testMode:  boolean
  transport: SmsTransport
  fallback:  boolean
  attempts:  SmsAttempt[]
}

// ── Transport resolution ──────────────────────────────────────────────────────

function resolveTransport(name: string): SmsTransport {
  const t = name.toLowerCase().trim()
  if (t === "bluebubbles"     && blueBubblesConfigured())     return "bluebubbles"
  if (t === "shortcut-relay"  && shortcutRelayConfigured())  return "shortcut-relay"
  if (t === "android-gateway" && androidGatewayConfigured()) return "android-gateway"
  if (t === "httpsms"         && httpSmsConfigured())        return "httpsms"
  if (t === "textingblue"     && textingBlueConfigured())    return "textingblue"
  if (t === "imsg"            && imsgConfigured())           return "imsg"
  if (t === "telelink"        && teleLinkConfigured())       return "telelink"
  return "none"
}

export function activeTransport(): SmsTransport {
  return getTransportChain()[0] ?? "none"
}

function fallbackTransport(): SmsTransport {
  return getTransportChain()[1] ?? "none"
}

// Priority order when auto-building the chain
const CHAIN_PRIORITY: SmsTransport[] = [
  "bluebubbles", "shortcut-relay", "android-gateway", "httpsms",
  "textingblue", "imsg", "telelink",
]

/**
 * Ordered transport chain. Resolution order:
 *   1. SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay,httpsms  (explicit, comma-separated)
 *   2. SMS_TRANSPORT + SMS_TRANSPORT_FALLBACK                  (legacy pair)
 *   3. Every configured transport in CHAIN_PRIORITY order      (auto)
 * Unconfigured entries are dropped; duplicates removed.
 */
export function getTransportChain(): SmsTransport[] {
  const chain: SmsTransport[] = []
  const push = (t: SmsTransport) => { if (t !== "none" && !chain.includes(t)) chain.push(t) }

  const explicit = process.env.SMS_TRANSPORT_CHAIN?.trim()
  if (explicit) {
    explicit.split(",").forEach(name => push(resolveTransport(name)))
    if (chain.length > 0) return chain
  }

  const legacy = process.env.SMS_TRANSPORT?.trim()
  if (legacy) {
    push(resolveTransport(legacy))
    const fb = process.env.SMS_TRANSPORT_FALLBACK?.trim()
    if (fb) push(resolveTransport(fb))
    if (chain.length > 0) return chain
  }

  CHAIN_PRIORITY.forEach(t => push(resolveTransport(t)))
  return chain
}

export function smsConfigured(): boolean {
  return getTransportChain().length > 0
}

// ── Core dispatch ─────────────────────────────────────────────────────────────

async function dispatchSMS(
  transport: SmsTransport,
  to: string,
  body: string,
  liveMode = false,
): Promise<{ sid: string; testMode: boolean }> {
  switch (transport) {
    case "bluebubbles":     return sendViaBlueBubbles(to, body, liveMode)
    case "textingblue":     return sendViaTextingBlue(to, body, liveMode)
    case "imsg":            return sendViaImsg(to, body, liveMode)
    case "telelink":        return sendViaTeleLink(to, body, liveMode)
    case "android-gateway": return sendViaAndroidGateway(to, body, liveMode)
    case "httpsms":         return sendViaHttpSms(to, body, liveMode)
    case "shortcut-relay":  return enqueueShortcutMessage(to, body, liveMode)
    default:                throw new Error(`Transport "${transport}" is not configured`)
  }
}

/**
 * Walks the transport chain in order until one send succeeds.
 * Every transport's outcome is recorded in `attempts` for diagnostics.
 */
export async function sendSMS(
  to: string,
  body: string,
  skipTransports: SmsTransport[] = [],
  liveMode = false,
): Promise<SmsSendResult> {
  const chain = getTransportChain().filter(t => !skipTransports.includes(t))

  if (chain.length === 0) {
    throw new Error(
      "No SMS transport configured. Set SMS_TRANSPORT=bluebubbles and BLUEBUBBLES_URL in server/.env"
    )
  }

  const attempts: SmsAttempt[] = []

  for (const transport of chain) {
    try {
      const r = await dispatchSMS(transport, to, body, liveMode)
      attempts.push({ transport, ok: true })
      const usedFallback = attempts.length > 1
      if (usedFallback) console.warn(`[sms] "${transport}" succeeded for ${to} after ${attempts.length - 1} failed transport(s)`)
      return { ...r, transport, fallback: usedFallback, attempts }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      attempts.push({ transport, ok: false, error: msg })
      console.warn(`[sms] "${transport}" failed: ${msg}`)
    }
  }

  throw new Error(
    `SMS delivery failed on all ${chain.length} transport(s):\n` +
    attempts.map(a => `  ${a.transport}: ${a.error}`).join("\n")
  )
}

// ── Health check ─────────────────────────────────────────────────────────────

export interface TransportStatus {
  transport: SmsTransport
  ok:        boolean
  label:     string
  detail?:   string
  fallback?: { transport: SmsTransport; ok: boolean; label: string; detail?: string }
}

async function checkTransport(transport: SmsTransport): Promise<Omit<TransportStatus, "fallback">> {
  switch (transport) {
    case "bluebubbles": {
      const ok = await pingBlueBubbles()
      return { transport, ok, label: "BlueBubbles (iPhone, iMessage, Mac)",
        detail: ok ? `Server at ${process.env.BLUEBUBBLES_URL}` : "Server unreachable — is BlueBubbles running and Cloudflare tunnel active?" }
    }
    case "textingblue": {
      const { ok, plan, error } = await pingTextingBlue()
      return { transport, ok, label: "TextingBlue (iPhone shortcut, iMessage)",
        detail: ok ? `API key valid${plan ? `, plan: ${plan}` : ""}` : error }
    }
    case "imsg": {
      const { ok, version, error } = await pingImsg()
      return { transport, ok, label: "imsg (Messages.app, iPhone, Mac)",
        detail: ok ? `imsg ${version}` : error }
    }
    case "telelink": {
      const { ok, version, error } = await pingTeleLink()
      return { transport, ok, label: "TeleLink (Phone Link, Windows)",
        detail: ok ? `TeleLink${version ? ` v${version}` : ""} at ${process.env.TELELINK_URL}` : error }
    }
    case "android-gateway": {
      const { ok, version, error } = await pingAndroidGateway()
      return { transport, ok, label: "Android SMS Gateway (real SIM, SMS only)",
        detail: ok ? `Gateway at ${process.env.ANDROID_GW_URL}${version ? ` v${version}` : ""}` : error }
    }
    case "httpsms": {
      const ok = httpSmsConfigured()
      return { transport, ok, label: "httpSMS (Android, real SIM, SMS only)",
        detail: ok ? `From: ${process.env.HTTPSMS_FROM}` : "HTTPSMS_API_KEY or HTTPSMS_FROM missing" }
    }
    case "shortcut-relay": {
      const ok = shortcutRelayConfigured()
      const deviceId = process.env.SHORTCUT_RELAY_DEVICE_ID?.trim()
      return { transport, ok, label: "iOS Shortcut Relay (iPhone, iMessage/SMS, self-hosted)",
        detail: ok ? `Device: ${deviceId}`
                   : "SHORTCUT_RELAY_SECRET or SHORTCUT_RELAY_DEVICE_ID missing" }
    }
    default:
      return { transport: "none", ok: false, label: "No transport configured",
        detail: "Set SMS_TRANSPORT=bluebubbles in server/.env" }
  }
}

export async function checkSmsTransport(): Promise<TransportStatus> {
  const primary  = activeTransport()
  const fallback = fallbackTransport()
  const primaryStatus = await checkTransport(primary)
  if (fallback !== "none" && fallback !== primary) {
    const fallbackStatus = await checkTransport(fallback)
    return { ...primaryStatus, fallback: fallbackStatus }
  }
  return primaryStatus
}

export async function checkTransportChain(): Promise<Omit<TransportStatus, "fallback">[]> {
  const chain = getTransportChain()
  if (chain.length === 0) return [await checkTransport("none")]
  return Promise.all(chain.map(t => checkTransport(t)))
}
