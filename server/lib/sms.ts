/**
 * Unified SMS Transport Layer
 *
 * Single import point for all SMS sending across PropOS.
 * Controlled by SMS_TRANSPORT env var:
 *
 *   SMS_TRANSPORT=twilio       (default) — Twilio API, any number
 *   SMS_TRANSPORT=bluebubbles  — BlueBubbles server on agent's Mac, real iPhone number
 *   SMS_TRANSPORT=imsg         — imsg CLI on Mac, real iPhone number via Messages.app
 *
 * All routes import { sendSMS, smsConfigured } from "../lib/sms.js"
 * instead of twilio directly — transport is swapped by env var alone.
 */

import { sendSMS as twilioSend, twilioConfigured as isTwilioConfigured } from "./twilio.js"
import { sendViaBlueBubbles, blueBubblesConfigured, pingBlueBubbles }    from "./bluebubbles.js"
import { sendViaImsg, imsgConfigured, pingImsg }                          from "./imsg.js"

export type SmsTransport = "twilio" | "bluebubbles" | "imsg" | "none"

export function activeTransport(): SmsTransport {
  const t = (process.env.SMS_TRANSPORT ?? "twilio").toLowerCase()
  if (t === "bluebubbles" && blueBubblesConfigured()) return "bluebubbles"
  if (t === "imsg"        && imsgConfigured())        return "imsg"
  if (isTwilioConfigured())                           return "twilio"
  return "none"
}

/**
 * Drop-in replacement for the old twilioConfigured() check.
 * Returns true if ANY transport is available.
 */
export function smsConfigured(): boolean {
  return activeTransport() !== "none"
}

/** @deprecated use smsConfigured() — kept for backwards-compat with routes that imported from twilio */
export { smsConfigured as twilioConfigured }

/**
 * Send an SMS/iMessage via whichever transport is active.
 * Returns { sid, testMode, transport } for logging.
 */
export async function sendSMS(
  to: string,
  body: string,
): Promise<{ sid: string; testMode: boolean; transport: SmsTransport }> {
  const transport = activeTransport()

  if (transport === "bluebubbles") {
    const r = await sendViaBlueBubbles(to, body)
    return { ...r, transport }
  }

  if (transport === "imsg") {
    const r = await sendViaImsg(to, body)
    return { ...r, transport }
  }

  if (transport === "twilio") {
    const r = await twilioSend(to, body)
    return { ...r, transport }
  }

  throw new Error("No SMS transport configured. Set SMS_TRANSPORT and required credentials.")
}

/**
 * Health-check the active transport.
 * Used by GET /api/health and the settings page transport indicator.
 */
export async function checkSmsTransport(): Promise<{
  transport: SmsTransport
  ok: boolean
  label: string
  detail?: string
}> {
  const transport = activeTransport()

  if (transport === "bluebubbles") {
    const ok = await pingBlueBubbles()
    return {
      transport,
      ok,
      label: "BlueBubbles (real iPhone number)",
      detail: ok ? `Server at ${process.env.BLUEBUBBLES_URL}` : "Server unreachable — is BlueBubbles running?",
    }
  }

  if (transport === "imsg") {
    const { ok, version, error } = await pingImsg()
    return {
      transport,
      ok,
      label: "imsg (Messages.app)",
      detail: ok ? `imsg ${version}` : error,
    }
  }

  if (transport === "twilio") {
    const ok = isTwilioConfigured()
    return {
      transport,
      ok,
      label: "Twilio",
      detail: ok ? `From: ${process.env.TWILIO_FROM_NUMBER}` : "TWILIO_* env vars missing",
    }
  }

  return { transport: "none", ok: false, label: "No transport configured", detail: "Set SMS_TRANSPORT in .env" }
}
