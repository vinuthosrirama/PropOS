/**
 * SPAM Act 2003 (AU) compliance layer.
 * Manages opt-out registry in memory (backed by Sheets "OptOut" tab).
 * All outbound delivery must call checkCompliance() before sending.
 */

export interface OptOutEntry {
  identifier: string   // phone or email
  type: "sms" | "email" | "all"
  timestamp: string
  source: "reply" | "link" | "manual"
}

// In-memory opt-out registry — loaded from Sheets on startup
const optOutRegistry = new Map<string, OptOutEntry>()

/** Normalise phone/email to a consistent key */
function normalise(identifier: string): string {
  return identifier.trim().toLowerCase().replace(/\s+/g, "")
}

/** Load opt-outs from the Sheets "OptOut" tab on server start */
export async function loadOptOuts(): Promise<void> {
  const sheetUrl = process.env.SHEET_URL
  if (!sheetUrl) return
  try {
    const res = await fetch(`${sheetUrl}?action=getOptOuts`)
    if (!res.ok) return
    const data = await res.json() as { optOuts?: OptOutEntry[] }
    for (const entry of data.optOuts ?? []) {
      optOutRegistry.set(normalise(entry.identifier), entry)
    }
    console.log(`  Compliance: loaded ${optOutRegistry.size} opt-out entries`)
  } catch {
    // Non-fatal — opt-out sheet may not exist yet
  }
}

/** Add an identifier to the opt-out registry and persist to Sheets */
export async function addOptOut(
  identifier: string,
  type: OptOutEntry["type"],
  source: OptOutEntry["source"]
): Promise<void> {
  const entry: OptOutEntry = {
    identifier: normalise(identifier),
    type,
    source,
    timestamp: new Date().toISOString(),
  }
  optOutRegistry.set(normalise(identifier), entry)

  const sheetUrl = process.env.SHEET_URL
  if (!sheetUrl) return
  try {
    await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "opt_out",
        identifier: entry.identifier,
        optOutType: entry.type,
        source: entry.source,
        timestamp: entry.timestamp,
      }),
    })
  } catch {
    console.warn("Could not persist opt-out to Sheets")
  }
}

/** Check whether a lead can receive a message on each channel */
export function checkCompliance(phone: string, email: string): {
  smsOk: boolean
  emailOk: boolean
  reason?: string
} {
  const phoneKey = normalise(phone)
  const emailKey = normalise(email)

  const phoneEntry = optOutRegistry.get(phoneKey)
  const emailEntry = optOutRegistry.get(emailKey)

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

/** Unsubscribe footer text to append to every email body */
export function unsubscribeFooter(leadId: string): string {
  const base = process.env.BASE_URL ?? "https://propos.addvantage.site"
  return `<br/><br/><hr style="border:none;border-top:1px solid #ccc;"/><p style="font-size:11px;color:#888;">To unsubscribe from future emails, <a href="${base}/unsubscribe?token=${encodeURIComponent(leadId)}">click here</a>.</p>`
}
