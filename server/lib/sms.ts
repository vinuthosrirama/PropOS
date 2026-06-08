/**
 * Unified SMS Transport Layer — v3
 *
 * Six transports, tried in priority order until one succeeds:
 *
 *   SMS_TRANSPORT=bluebubbles      Mac + real iPhone (iMessage/SMS), best for Mac users
 *   SMS_TRANSPORT=textingblue      iPhone shortcut (iMessage), no Mac needed — best for iPhone agents
 *   SMS_TRANSPORT=imsg             Mac + CLI (iMessage/SMS), lightweight Mac option
 *   SMS_TRANSPORT=telelink         Windows + Phone Link, real iPhone/Android number
 *   SMS_TRANSPORT=android-gateway  Android phone app (SMS), best for Android agents
 *   SMS_TRANSPORT=twilio           Cloud API, generic number — use as fallback
 *
 * Fallback chain:
 *   SMS_TRANSPORT_FALLBACK=twilio  — auto-retries with fallback on primary failure
 *
 * Example .env:
 *   # iPhone agent on Mac (best experience — iMessage + reply webhooks)
 *   SMS_TRANSPORT=bluebubbles
 *   SMS_TRANSPORT_FALLBACK=twilio
 *   BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
 *   BLUEBUBBLES_PASSWORD=secret
 *
 *   # iPhone agent, no Mac (next best — iMessage via iOS Shortcut)
 *   SMS_TRANSPORT=textingblue
 *   SMS_TRANSPORT_FALLBACK=twilio
 *   TEXTINGBLUE_API_KEY=tb_live_xxxx
 *
 *   # Android agent
 *   SMS_TRANSPORT=android-gateway
 *   SMS_TRANSPORT_FALLBACK=twilio
 *   ANDROID_GW_URL=https://xxxx.trycloudflare.com
 *   ANDROID_GW_USER=user
 *   ANDROID_GW_PASS=pass
 */

import { sendSMS as twilioSend, twilioConfigured as isTwilioConfigured }      from "./twilio.js"
import { sendViaBlueBubbles, blueBubblesConfigured, pingBlueBubbles }          from "./bluebubbles.js"
import { sendViaImsg, imsgConfigured, pingImsg }                               from "./imsg.js"
import { sendViaTeleLink, teleLinkConfigured, pingTeleLink }                   from "./telelink.js"
import { sendViaTextingBlue, textingBlueConfigured, pingTextingBlue }          from "./textingblue.js"
import { sendViaAndroidGateway, androidGatewayConfigured, pingAndroidGateway } from "./androidgateway.js"

export type SmsTransport =
  | "twilio"
  | "bluebubbles"
  | "imsg"
  | "telelink"
  | "textingblue"
  | "android-gateway"
  | "none"

export interface SmsSendResult {
  sid:       string
  testMode:  boolean
  transport: SmsTransport
  fallback:  boolean
}

// ── Transport resolution ──────────────────────────────────────────────────────

function resolveTransport(name: string): SmsTransport {
  const t = name.toLowerCase().trim()
  if (t === "bluebubbles"     && blueBubblesConfigured())    return "bluebubbles"
  if (t === "textingblue"     && textingBlueConfigured())    return "textingblue"
  if (t === "imsg"            && imsgConfigured())           return "imsg"
  if (t === "telelink"        && teleLinkConfigured())       return "telelink"
  if (t === "android-gateway" && androidGatewayConfigured()) return "android-gateway"
  if (t === "twilio"          && isTwilioConfigured())       return "twilio"
  return "none"
}

export function activeTransport(): SmsTransport {
  return resolveTransport(process.env.SMS_TRANSPORT ?? "twilio")
}

function fallbackTransport(): SmsTransport {
  const fb = process.env.SMS_TRANSPORT_FALLBACK ?? ""
  return fb ? resolveTransport(fb) : "none"
}

export function smsConfigured(): boolean {
  return activeTransport() !== "none" || fallbackTransport() !== "none"
}

/** @deprecated use smsConfigured() */
export { smsConfigured as twilioConfigured }

// ── Core dispatch ─────────────────────────────────────────────────────────────

async function dispatchSMS(
  transport: SmsTransport,
  to: string,
  body: string,
): Promise<{ sid: string; testMode: boolean }> {
  switch (transport) {
    case "bluebubbles":    return sendViaBlueBubbles(to, body)
    case "textingblue":    return sendViaTextingBlue(to, body)
    case "imsg":           return sendViaImsg(to, body)
    case "telelink":       return sendViaTeleLink(to, body)
    case "android-gateway":return sendViaAndroidGateway(to, body)
    case "twilio":         return twilioSend(to, body)
    default:               throw new Error(`Transport "${transport}" is not configured`)
  }
}

export async function sendSMS(to: string, body: string): Promise<SmsSendResult> {
  const primary  = activeTransport()
  const fallback = fallbackTransport()

  if (primary === "none" && fallback === "none") {
    throw new Error(
      "No SMS transport configured. Set SMS_TRANSPORT (and optionally SMS_TRANSPORT_FALLBACK) in server/.env"
    )
  }

  if (primary !== "none") {
    try {
      const r = await dispatchSMS(primary, to, body)
      return { ...r, transport: primary, fallback: false }
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      console.warn(`[sms] Primary "${primary}" failed: ${msg}`)

      if (fallback !== "none") {
        console.warn(`[sms] Trying fallback "${fallback}"…`)
        try {
          const r = await dispatchSMS(fallback, to, body)
          console.warn(`[sms] Fallback "${fallback}" succeeded for ${to}`)
          return { ...r, transport: fallback, fallback: true }
        } catch (fbErr) {
          const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr)
          throw new Error(
            `SMS delivery failed on both transports.\n` +
            `  Primary (${primary}): ${msg}\n` +
            `  Fallback (${fallback}): ${fbMsg}`
          )
        }
      }
      throw primaryErr
    }
  }

  const r = await dispatchSMS(fallback, to, body)
  return { ...r, transport: fallback, fallback: true }
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
        detail: ok ? `Server at ${process.env.BLUEBUBBLES_URL}` : "Server unreachable — is BlueBubbles running?" }
    }
    case "textingblue": {
      const { ok, plan, error } = await pingTextingBlue()
      return { transport, ok, label: "TextingBlue (iPhone shortcut, iMessage, no Mac needed)",
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
    case "twilio": {
      const ok = isTwilioConfigured()
      return { transport, ok, label: "Twilio (cloud, generic number)",
        detail: ok ? `From: ${process.env.TWILIO_FROM_NUMBER}` : "TWILIO_* env vars missing" }
    }
    default:
      return { transport: "none", ok: false, label: "No transport configured",
        detail: "Set SMS_TRANSPORT in server/.env" }
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
