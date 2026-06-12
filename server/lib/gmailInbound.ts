/**
 * Gmail Reply Capture
 *
 * Polls the Gmail inbox (same OAuth client as gmail.ts sends) every 5 minutes
 * and feeds replies from outreach targets into the same inbound pipeline as
 * SMS replies — so email answers appear in drafts and the morning brief.
 *
 * Watermark: the newest processed message's internalDate is persisted in
 * system_kv ("gmail_inbound_watermark") so restarts never reprocess history.
 * Only messages from known outreach_targets emails are marked read; the rest
 * of the inbox is untouched.
 */

import { google } from "googleapis"
import { gmailConfigured } from "./gmail.js"
import { isDbConnected, query, execute } from "./db.js"
import { handleOutreachInbound, generateOutreachDraft, saveOutreachDraft } from "./outreachAgent.js"
import { addReplyToThread } from "./conversations.js"

const WATERMARK_KEY = "gmail_inbound_watermark"

// In-memory guard for messages processed in this process (same-millisecond ties)
const processedIds = new Set<string>()

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return auth
}

async function getWatermark(): Promise<number> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM system_kv WHERE key = $1`, [WATERMARK_KEY],
    )
    return parseInt(rows[0]?.value ?? "0", 10) || Date.now() - 24 * 60 * 60 * 1000
  } catch {
    return Date.now() - 24 * 60 * 60 * 1000
  }
}

async function setWatermark(ms: number): Promise<void> {
  try {
    await execute(
      `INSERT INTO system_kv (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [WATERMARK_KEY, String(ms)],
    )
  } catch (err) {
    console.warn("[gmailInbound] watermark save failed:", (err as Error).message)
  }
}

/** Extract the bare email address from a "Name <addr>" header value. */
function extractAddress(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/)
  return (m ? m[1] : fromHeader).trim().toLowerCase()
}

/** Decode the plain-text body (first text/plain part, else snippet). */
function extractBody(payload: Record<string, any> | undefined, snippet: string): string {
  if (!payload) return snippet
  const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8")
  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data)
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data)
    const nested: string = extractBody(part, "")
    if (nested) return nested
  }
  return snippet
}

/** One poll pass. Exported for manual triggering in tests. */
export async function pollGmailInbound(): Promise<void> {
  if (!gmailConfigured() || !isDbConnected()) return

  try {
    const gmail = google.gmail({ version: "v1", auth: getAuth() })
    const watermark = await getWatermark()

    // Gmail's after: operator requires YYYY/MM/DD — epoch seconds are not accepted.
    // The internalDate check below provides precise dedup within the day.
    const afterDate = new Date(watermark).toISOString().slice(0, 10).replace(/-/g, "/")
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `in:inbox after:${afterDate}`,
      maxResults: 20,
    })

    const ids = (list.data.messages ?? []).map(m => m.id!).filter(id => !processedIds.has(id))
    if (ids.length === 0) return

    let maxInternal = watermark

    for (const id of ids) {
      processedIds.add(id)
      if (processedIds.size > 2000) processedIds.clear()

      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" })
      const internal = parseInt(msg.data.internalDate ?? "0", 10)
      if (internal <= watermark) continue
      if (internal > maxInternal) maxInternal = internal

      const headers = msg.data.payload?.headers ?? []
      const fromHeader = headers.find(h => h.name?.toLowerCase() === "from")?.value ?? ""
      const fromEmail = extractAddress(fromHeader)
      if (!fromEmail || fromEmail === process.env.GMAIL_USER?.toLowerCase()) continue

      // Is this sender one of our outreach targets?
      const targets = await query<{ id: number; phone: string | null; email: string }>(
        `SELECT id, phone, email FROM outreach_targets WHERE LOWER(email) = $1 LIMIT 1`,
        [fromEmail],
      )
      const target = targets[0]
      if (!target) continue

      const body = extractBody(msg.data.payload as Record<string, any>, msg.data.snippet ?? "").trim()
      if (!body) continue

      console.log(`[gmailInbound] reply from outreach target ${fromEmail} — feeding inbound pipeline`)

      // Feed the same inbound pipeline as SMS replies.
      // For targets with a phone, handleOutreachInbound handles CRM + draft + conversation.
      // For email-only targets, we do the same steps manually and key the thread on email.
      if (target.phone) {
        await handleOutreachInbound(target.phone, body.slice(0, 2000))
        // Also record the inbound message keyed by email so the thread is reachable either way
        await addReplyToThread(target.phone, body.slice(0, 2000), {
          leadName: fromEmail,
          email:    fromEmail,
        }).catch(() => { /* non-fatal */ })
      } else {
        // Email-only target — update CRM, log to thread, generate draft
        await execute(
          `UPDATE outreach_targets
           SET status = CASE WHEN status IN ('new','contacted') THEN 'replied' ELSE status END,
               reply_body = $1, last_contact_date = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [body.slice(0, 500), target.id],
        )
        // Store in conversation thread keyed by email address
        await addReplyToThread(fromEmail, body.slice(0, 2000), {
          leadName: fromEmail,
          email:    fromEmail,
        }).catch(() => { /* non-fatal */ })
        try {
          const fullTarget = (await query<import("./outreachAgent.js").OutreachTargetRow>(
            `SELECT * FROM outreach_targets WHERE id = $1`, [target.id],
          ))[0]
          if (fullTarget) {
            const { draft, versionId } = await generateOutreachDraft(fullTarget, body.slice(0, 2000))
            await saveOutreachDraft(target.id, body.slice(0, 1000), draft, versionId)
            console.log(`[gmailInbound] draft generated for email-only target ${fromEmail}`)
          }
        } catch (draftErr) {
          console.warn("[gmailInbound] draft generation failed for email-only target:", (draftErr as Error).message)
        }
      }

      // Mark read so it doesn't clutter the inbox unread count
      await gmail.users.messages.modify({
        userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] },
      }).catch(() => { /* non-fatal */ })
    }

    if (maxInternal > watermark) await setWatermark(maxInternal)
  } catch (err) {
    console.warn("[gmailInbound] poll failed:", (err as Error).message)
  }
}
