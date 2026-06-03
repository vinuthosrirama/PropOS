/**
 * SPAM Act 2003 (AU) compliance layer.
 * Uses PostgreSQL when DATABASE_URL is set, otherwise in-memory + Sheets.
 * All outbound delivery MUST call checkCompliance() before sending.
 */

import { isDbConnected, query, execute } from "./db.js"
import { writeToSheet } from "./sheets.js"

export interface OptOutEntry {
  identifier: string   // phone or email
  type: "sms" | "email" | "all"
  timestamp: string
  source: "reply" | "link" | "manual"
}

// In-memory fallback
const optOutRegistry = new Map<string, OptOutEntry>()

function normalise(identifier: string): string {
  return identifier.trim().toLowerCase().replace(/\s+/g, "")
}

/** Load opt-outs from DB or Sheets on server start */
export async function loadOptOuts(): Promise<void> {
  if (isDbConnected()) {
    const rows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM opt_outs`)
    const count = parseInt(rows[0]?.count ?? "0", 10)
    console.log(`  Compliance: ${count} opt-out entries in database`)
    return
  }

  const sheetUrl = process.env.SHEET_URL
  if (!sheetUrl) return
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(`${sheetUrl}?action=getOptOuts`, { signal: controller.signal })
      .finally(() => clearTimeout(timer))
    if (!res.ok) return
    const data = await res.json() as { optOuts?: OptOutEntry[] }
    for (const entry of data.optOuts ?? []) {
      optOutRegistry.set(normalise(entry.identifier), entry)
    }
    console.log(`  Compliance: loaded ${optOutRegistry.size} opt-out entries`)
  } catch {
    // Non-fatal
  }
}

/** Add an identifier to the opt-out registry and persist */
export async function addOptOut(
  identifier: string,
  type: OptOutEntry["type"],
  source: OptOutEntry["source"],
): Promise<void> {
  const key = normalise(identifier)
  const timestamp = new Date().toISOString()

  if (isDbConnected()) {
    await execute(
      `INSERT INTO opt_outs (identifier, type, source, timestamp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (identifier) DO UPDATE SET type = $2, source = $3, timestamp = $4`,
      [key, type, source, timestamp],
    )
    return
  }

  // In-memory + Sheets fallback
  const entry: OptOutEntry = { identifier: key, type, source, timestamp }
  optOutRegistry.set(key, entry)

  // writeToSheet retries internally, has a 10s timeout, and never throws
  void writeToSheet({ type: "opt_out", identifier: key, optOutType: type, source, timestamp })
}

/** Check whether a contact can receive messages on each channel */
export async function checkCompliance(phone: string, email: string): Promise<{
  smsOk: boolean
  emailOk: boolean
  reason?: string
}> {
  const phoneKey = normalise(phone)
  const emailKey = normalise(email)

  if (isDbConnected()) {
    const rows = await query<OptOutEntry>(
      `SELECT identifier, type FROM opt_outs WHERE identifier = ANY($1)`,
      [[phoneKey, emailKey]],
    )
    const phoneEntry = rows.find(r => r.identifier === phoneKey)
    const emailEntry = rows.find(r => r.identifier === emailKey)
    return buildResult(phoneEntry, emailEntry)
  }

  // In-memory fallback
  const phoneEntry = optOutRegistry.get(phoneKey)
  const emailEntry = optOutRegistry.get(emailKey)
  return buildResult(phoneEntry, emailEntry)
}

function buildResult(
  phoneEntry: Pick<OptOutEntry, "type"> | undefined,
  emailEntry: Pick<OptOutEntry, "type"> | undefined,
): { smsOk: boolean; emailOk: boolean; reason?: string } {
  const smsBlocked = phoneEntry && (phoneEntry.type === "sms" || phoneEntry.type === "all")
  const emailBlocked = emailEntry && (emailEntry.type === "email" || emailEntry.type === "all")
  return {
    smsOk: !smsBlocked,
    emailOk: !emailBlocked,
    reason: smsBlocked && emailBlocked
      ? "opted out of all communications"
      : smsBlocked
      ? "opted out of SMS"
      : emailBlocked
      ? "opted out of email"
      : undefined,
  }
}

/** Unsubscribe footer for emails */
export function unsubscribeFooter(leadId: string): string {
  const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
  return `<br/><br/><hr style="border:none;border-top:1px solid #ccc;"/><p style="font-size:11px;color:#888;">To unsubscribe from future emails, <a href="${base}/unsubscribe?token=${encodeURIComponent(leadId)}">click here</a>.</p>`
}
