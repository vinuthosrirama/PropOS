import cron from "node-cron"
import { isDbConnected, query } from "./db.js"
import { sendEmail, gmailConfigured } from "./gmail.js"

function alertTo(): string | undefined {
  return process.env.BACKEND_HEALTH_ALERT_EMAIL?.trim() || process.env.GMAIL_USER?.trim()
}

let lastDbOk: boolean | null = null

async function checkOnce(): Promise<void> {
  let dbOk = false
  if (isDbConnected()) {
    try {
      const rows = await Promise.race<{ ok: number }[]>([
        query<{ ok: number }>("SELECT 1 AS ok"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DB probe timeout")), 5_000),
        ),
      ])
      dbOk = rows.length > 0
    } catch {
      dbOk = false
    }
  }

  const wasOk = lastDbOk
  lastDbOk = dbOk
  if (wasOk === null || wasOk === dbOk) return

  const now = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })
  if (!dbOk) {
    console.warn("[backendHealth] Database went DOWN")
    await alert(
      "PropOS Backend Alert: Database DOWN",
      `<p>The PropOS backend lost its database connection.</p><p>Detected at ${now}.</p><p>The login page canary will show red until connectivity is restored.</p>`,
    )
  } else {
    console.log("[backendHealth] Database recovered")
    await alert(
      "PropOS Backend Alert: Database Recovered",
      `<p>The PropOS backend database connection has been restored.</p><p>Recovered at ${now}.</p>`,
    )
  }
}

async function alert(subject: string, htmlBody: string): Promise<void> {
  const to = alertTo()
  if (!gmailConfigured() || !to) {
    console.warn("[backendHealth] alert email skipped — Gmail not configured or no recipient")
    return
  }
  try {
    await sendEmail({ to, fromName: "PropOS Monitor", subject, htmlBody })
  } catch (err) {
    console.warn("[backendHealth] alert email failed:", (err as Error).message)
  }
}

export function startBackendHealthMonitor(): void {
  cron.schedule("*/5 * * * *", () => {
    void checkOnce()
  })
  void checkOnce()
  console.log(`  Backend health monitor: started (every 5 min, alerts → ${alertTo() || "none configured"})`)
}
