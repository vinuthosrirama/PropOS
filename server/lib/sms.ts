/**
 * Unified SMS Transport Layer — v2 with fallback chain
 *
 * Supports four transports, tried in priority order until one succeeds:
 *
 *   SMS_TRANSPORT=bluebubbles  — BlueBubbles server on Mac, real iPhone number (iMessage/SMS)
 *   SMS_TRANSPORT=imsg         — imsg CLI on Mac, Messages.app, real iPhone number
 *   SMS_TRANSPORT=telelink     — TeleLink on Windows via Phone Link, real iPhone/Android number
 *   SMS_TRANSPORT=twilio       — Twilio cloud API, generic number (always-available fallback)
 *
 * Fallback chain:
 *   Set SMS_TRANSPORT_FALLBACK=twilio (or any transport) and PropOS automatically
 *   retries with the fallback if the primary transport throws a network/server error.
 *   This ensures messages get delivered even when the agent's Mac/PC is offline.
 *
 * Example .env for primary + fallback:
 *   SMS_TRANSPORT=bluebubbles
 *   SMS_TRANSPORT_FALLBACK=twilio
 *   BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
 *   BLUEBUBBLES_PASSWORD=secret
 *   TWILIO_ACCOUNT_SID=ACxxxx
 *   TWILIO_AUTH_TOKEN=xxxx
 *   TWILIO_FROM_NUMBER=+61400000000
 */

import { sendSMS as twilioSend, twilioConfigured as isTwilioConfigured } from "./twilio.js"
import { sendViaBlueBubbles, blueBubblesConfigured, pingBlueBubbles }    from "./bluebubbles.js"
import { sendViaImsg, imsgConfigured, pingImsg }                          from "./imsg.js"
import { sendViaTeleLink, teleLinkConfigured, pingTeleLink }              from "./telelink.js"

export type SmsTransport = "twilio" | "bluebubbles" | "imsg" | "telelink" | "none"

export interface SmsSendResult {
  sid:       string
  testMode:  boolean
  transport: SmsTransport
  fallback:  boolean  // true when the primary transport failed and a fallback was used
}

// ── Transport resolution ──────────────────────────────────────────────────────

function resolveTransport(name: string): SmsTransport {
  const t = name.toLowerCase().trim()
  if (t === "bluebubbles" && blueBubblesConfigured()) return "bluebubbles"
  if (t === "imsg"        && imsgConfigured())        return "imsg"
  if (t === "telelink"    && teleLinkConfigured())    return "telelink"
  if (t === "twilio"      && isTwilioConfigured())    return "twilio"
  return "none"
}

export function activeTransport(): SmsTransport {
  const primary = process.env.SMS_TRANSPORT ?? "twilio"
  return resolveTransport(primary)
}

function fallbackTransport(): SmsTransport {
  const fb = process.env.SMS_TRANSPORT_FALLBACK ?? ""
  if (!fb) return "none"
  return resolveTransport(fb)
}

/**
 * Returns true if ANY transport (primary or fallback) is available.
 */
export function smsConfigured(): boolean {
  return activeTransport() !== "none" || fallbackTransport() !== "none"
}

/** @deprecated use smsConfigured() — kept for backwards-compat */
export { smsConfigured as twilioConfigured }

// ── Core dispatch ─────────────────────────────────────────────────────────────

async function dispatchSMS(
  transport: SmsTransport,
  to: string,
  body: string,
): Promise<{ sid: string; testMode: boolean }> {
  switch (transport) {
    case "bluebubbles": return sendViaBlueBubbles(to, body)
    case "imsg":        return sendViaImsg(to, body)
    case "telelink":    return sendViaTeleLink(to, body)
    case "twilio":      return twilioSend(to, body)
    default:            throw new Error(`Transport "${transport}" is not configured`)
  }
}

/**
 * Send an SMS via the active transport, automatically falling back to the
 * secondary transport if the primary fails with a network or server error.
 *
 * Returns extended result including which transport was ultimately used
 * and whether a fallback was triggered.
 */
export async function sendSMS(
  to: string,
  body: string,
): Promise<SmsSendResult> {
  const primary  = activeTransport()
  const fallback = fallbackTransport()

  if (primary === "none" && fallback === "none") {
    throw new Error(
      "No SMS transport configured. Set SMS_TRANSPORT (and optionally SMS_TRANSPORT_FALLBACK) in server/.env"
    )
  }

  // Try primary
  if (primary !== "none") {
    try {
      const r = await dispatchSMS(primary, to, body)
      return { ...r, transport: primary, fallback: false }
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      console.warn(`[sms] Primary transport "${primary}" failed: ${msg}`)

      if (fallback !== "none") {
        console.warn(`[sms] Attempting fallback transport "${fallback}"…`)
        try {
          const r = await dispatchSMS(fallback, to, body)
          console.warn(`[sms] Fallback "${fallback}" succeeded for ${to}`)
          return { ...r, transport: fallback, fallback: true }
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
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

  // Primary is "none" but fallback is configured — use fallback directly
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
      return {
        transport,
        ok,
        label:  "BlueBubbles (real iPhone number, iMessage)",
        detail: ok
          ? `Server at ${process.env.BLUEBUBBLES_URL}`
          : "Server unreachable — is BlueBubbles running on your Mac?",
      }
    }
    case "imsg": {
      const { ok, version, error } = await pingImsg()
      return {
        transport,
        ok,
        label:  "imsg (Messages.app, real iPhone number)",
        detail: ok ? `imsg ${version}` : error,
      }
    }
    case "telelink": {
      const { ok, version, error } = await pingTeleLink()
      return {
        transport,
        ok,
        label:  "TeleLink (Phone Link, real mobile number)",
        detail: ok
          ? `TeleLink${version ? ` v${version}` : ""} at ${process.env.TELELINK_URL}`
          : error,
      }
    }
    case "twilio": {
      const ok = isTwilioConfigured()
      return {
        transport,
        ok,
        label:  "Twilio (cloud, generic number)",
        detail: ok ? `From: ${process.env.TWILIO_FROM_NUMBER}` : "TWILIO_* env vars missing",
      }
    }
    default:
      return {
        transport: "none",
        ok:        false,
        label:     "No transport configured",
        detail:    "Set SMS_TRANSPORT in server/.env",
      }
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
