/**
 * SMS transport health monitor
 *
 * Periodically polls checkSmsTransport() (the same check behind GET
 * /api/sms-transport) and emails Vinuth if the primary transport (BlueBubbles)
 * goes from healthy to unhealthy. Only alerts on a state transition — does not
 * spam on every poll while still down, and re-alerts once recovered then
 * fails again.
 */

import cron from "node-cron"
import { checkSmsTransport } from "./sms.js"
import { sendEmail, gmailConfigured } from "./gmail.js"

// Read lazily (not at module-eval time) — ESM import hoisting means this module
// loads before index.ts's dotenv.config() call runs, so process.env would be empty here.
function alertTo(): string | undefined {
  return process.env.SMS_TRANSPORT_ALERT_EMAIL?.trim() || process.env.GMAIL_USER?.trim()
}
function checkIntervalCron(): string {
  return process.env.SMS_TRANSPORT_CHECK_CRON?.trim() || "*/10 * * * *"
}

let lastOk: boolean | null = null

async function checkOnce(): Promise<void> {
  let status: Awaited<ReturnType<typeof checkSmsTransport>>
  try {
    status = await checkSmsTransport()
  } catch (err) {
    console.warn("[transportHealthMonitor] check failed:", (err as Error).message)
    return
  }

  const wasOk = lastOk
  lastOk = status.ok
  if (wasOk === null || wasOk === status.ok) return  // no transition (or first run)

  if (!status.ok) {
    console.warn(`[transportHealthMonitor] ${status.transport} went DOWN: ${status.detail}`)
    await alert(`PropOS SMS transport DOWN: ${status.transport}`,
      `<p><strong>${status.label}</strong> is no longer healthy.</p><p>${status.detail ?? ""}</p>` +
      `<p>Detected at ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}.</p>`)
  } else {
    console.log(`[transportHealthMonitor] ${status.transport} recovered: ${status.detail}`)
    await alert(`PropOS SMS transport recovered: ${status.transport}`,
      `<p><strong>${status.label}</strong> is healthy again.</p><p>${status.detail ?? ""}</p>` +
      `<p>Recovered at ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}.</p>`)
  }
}

async function alert(subject: string, htmlBody: string): Promise<void> {
  const to = alertTo()
  if (!gmailConfigured() || !to) {
    console.warn("[transportHealthMonitor] alert email skipped — Gmail not configured or no recipient")
    return
  }
  try {
    await sendEmail({ to, fromName: "PropOS Monitor", subject, htmlBody })
  } catch (err) {
    console.warn("[transportHealthMonitor] alert email failed:", (err as Error).message)
  }
}

export function startTransportHealthMonitor(): void {
  cron.schedule(checkIntervalCron(), () => {
    void checkOnce()
  })
  // Establish the baseline immediately so the first real transition can be detected.
  void checkSmsTransport().then(s => { lastOk = s.ok }).catch(() => { /* leave null, retried next tick */ })
  console.log(`  SMS transport health monitor: started (${checkIntervalCron()}, alerts → ${alertTo() || "none configured"})`)
}
