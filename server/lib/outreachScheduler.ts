/**
 * PropOS Self-Outreach Scheduler
 *
 * Runs two daily cron jobs (Melbourne time) to automate Vinuth's outreach
 * campaign to boutique real estate agents:
 *
 *   9:00am AEST/AEDT  — Morning brief: log overnight replies + queue follow-ups
 *   10:00am AEST/AEDT — Outreach window: send initial messages to 'new' targets
 *                        with random ±12min jitter to appear natural
 *
 * Phone testing: set TEST_RECIPIENT_PHONE in server/.env to redirect ALL sends
 * to your own number before going live to real contacts.
 *
 * Daily caps:
 *   - Max 5 initial messages per day (stays under spam thresholds)
 *   - Follow-ups only after 3+ days of no reply
 *   - Max 1 follow-up per target per week
 */

import cron from "node-cron"
import { isDbConnected, query, execute } from "./db.js"
import { smsOptOutReason } from "./compliance.js"
import { sendSMS, smsConfigured } from "./sms.js"
import { sendEmail, gmailConfigured } from "./gmail.js"
import { pollGmailInbound } from "./gmailInbound.js"
import { addAgentMessageToThread } from "./conversations.js"
import {
  generateFollowUp,
  getMorningBrief,
  type OutreachTargetRow,
} from "./outreachAgent.js"
import { runOptimisationCycle } from "./promptOptimiser.js"
import { runWeeklyVendorReports } from "./vendorReportGenerator.js"
import { sendPMBriefEmail, sendPMBriefSMS } from "./pmBrief.js"

// ── Config ────────────────────────────────────────────────────────────────────

const DAILY_NEW_CAP   = parseInt(process.env.OUTREACH_DAILY_CAP ?? "5", 10)
const FOLLOWUP_DAYS   = parseInt(process.env.OUTREACH_FOLLOWUP_DAYS ?? "3", 10)
const SEND_GAP_MS     = 6_000   // 6s between successive SMS sends — carrier throttle buffer
const JITTER_MAX_MS   = 12 * 60 * 1_000   // ±12 minutes jitter

let started = false

// ── Public start function ─────────────────────────────────────────────────────

export function startOutreachScheduler(): void {
  if (started) return
  started = true

  if (!isDbConnected()) {
    console.log("  OutreachScheduler: no database — disabled")
    return
  }

  // 9:00am Melbourne time — morning brief
  cron.schedule("0 9 * * 1-5", () => {
    void runMorningBrief()
  }, { timezone: "Australia/Melbourne" })

  // 10:00am Melbourne time — outreach window (with jitter applied inside)
  cron.schedule("0 10 * * 1-5", () => {
    void runOutreachWindow()
  }, { timezone: "Australia/Melbourne" })

  // Sunday 2:00am Melbourne time — weekly prompt optimisation cycle
  cron.schedule("0 2 * * 0", () => {
    void runOptimisationCycle("outreach_system")
  }, { timezone: "Australia/Melbourne" })

  // Sunday 7:00am Melbourne time — weekly vendor campaign reports
  cron.schedule("0 7 * * 0", () => {
    void runWeeklyVendorReports()
  }, { timezone: "Australia/Melbourne" })

  // Every 5 minutes — capture email replies from outreach targets
  if (gmailConfigured()) {
    cron.schedule("*/5 * * * *", () => {
      void pollGmailInbound()
    })
    console.log("  OutreachScheduler: Gmail reply capture running (every 5 min)")
  }

  console.log("  OutreachScheduler: running (9am brief, 10am sends, Sunday 2am optimiser, Sunday 7am vendor reports, Melbourne time)")
}

// ── Morning brief ─────────────────────────────────────────────────────────────

async function runMorningBrief(): Promise<void> {
  try {
    const brief = await getMorningBrief()
    const testMode = !!process.env.TEST_RECIPIENT_PHONE?.trim()

    console.log("[outreachScheduler] ── Morning Brief ──────────────────────────")
    if (testMode) console.log("[outreachScheduler] TEST MODE: all sends → " + process.env.TEST_RECIPIENT_PHONE)
    console.log(`[outreachScheduler]  Pending drafts:    ${brief.pendingDrafts}`)
    console.log(`[outreachScheduler]  New replies (24h): ${brief.newReplies.length}`)
    console.log(`[outreachScheduler]  Follow-ups due:    ${brief.followUpsDue.length}`)
    console.log(`[outreachScheduler]  Contacted total:   ${brief.totalContacted}`)
    console.log(`[outreachScheduler]  Replied total:     ${brief.totalReplied}`)
    console.log(`[outreachScheduler]  Demo booked:       ${brief.totalDemoBooked}`)

    if (brief.newReplies.length > 0) {
      console.log("[outreachScheduler]  Overnight replies:")
      brief.newReplies.forEach(r => {
        console.log(`[outreachScheduler]    ${r.name} (${r.agency}): "${r.body?.slice(0, 80)}"`)
      })
    }

    if (brief.pendingDrafts > 0) {
      console.log(`[outreachScheduler]  Review drafts at: GET /api/outreach-targets/drafts`)
    }

    // Email + iMessage Vinuth the PM brief
    await Promise.all([
      sendPMBriefEmail(brief),
      sendPMBriefSMS(brief),
    ])

    // Auto-generate follow-ups for targets overdue (but don't auto-send — queue as drafts)
    if (brief.followUpsDue.length > 0) {
      console.log(`[outreachScheduler]  Queuing ${brief.followUpsDue.length} follow-up draft(s)...`)
      for (const t of brief.followUpsDue.slice(0, 3)) {
        await queueFollowUpDraft(t.id, t.daysSince)
        await new Promise(r => setTimeout(r, 500))
      }
    }

  } catch (err) {
    console.error("[outreachScheduler] morning brief error:", (err as Error).message)
  }
}

// ── Outreach window ───────────────────────────────────────────────────────────

async function runOutreachWindow(): Promise<void> {
  // Hard guard — TEST_RECIPIENT_PHONE must always be set. Sends are never directed
  // at real agents directly; every message routes through the test number first.
  if (!process.env.TEST_RECIPIENT_PHONE?.trim()) {
    console.error("[outreachScheduler] ⛔  TEST_RECIPIENT_PHONE not set — outreach window BLOCKED. All sends must route through your test number.")
    return
  }

  if (!smsConfigured() && !gmailConfigured()) {
    console.log("[outreachScheduler] Outreach window: no send channel configured — skipping")
    return
  }

  try {
    // Pick up to DAILY_NEW_CAP new targets
    const targets = await query<OutreachTargetRow>(
      `SELECT * FROM outreach_targets
       WHERE status = 'new' AND sms_script IS NOT NULL
         AND (phone IS NOT NULL OR email IS NOT NULL)
       ORDER BY id
       LIMIT $1`,
      [DAILY_NEW_CAP],
    )

    if (targets.length === 0) {
      console.log("[outreachScheduler] Outreach window: no new targets to contact today")
      return
    }

    console.log(`[outreachScheduler] Outreach window: sending to ${targets.length} new target(s)`)

    for (const target of targets) {
      // Jitter: random delay between sends to appear natural
      const jitter = Math.floor(Math.random() * JITTER_MAX_MS)
      await new Promise(r => setTimeout(r, jitter))

      await sendOutreachMessage(target, target.sms_script!)
      await new Promise(r => setTimeout(r, SEND_GAP_MS))
    }

  } catch (err) {
    console.error("[outreachScheduler] outreach window error:", (err as Error).message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Outreach email subject — short, non-salesy, complementary to the SMS ─────

function outreachEmailSubject(target: OutreachTargetRow): string {
  const first = target.name.split(" ")[0]
  if (target.recent_sale_address) {
    const street = target.recent_sale_address.split(",")[0].replace(/^\d+\s+/, "").trim()
    return `Quick question about ${street}, ${first}`
  }
  return `Quick question, ${first}`
}

async function sendOutreachMessage(target: OutreachTargetRow, message: string): Promise<void> {
  if (!target.phone && !target.email) return

  // Compliance gate on phone
  if (target.phone) {
    const optOut = await smsOptOutReason(target.phone)
    if (optOut) {
      console.log(`[outreachScheduler] suppressing ${target.name} — ${optOut}`)
      await execute(
        `UPDATE outreach_targets
         SET status = 'not_interested',
             notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || E'\\n' || $1 END,
             updated_at = NOW()
         WHERE id = $2 AND status = 'new'`,
        [`Suppressed: ${optOut}`, target.id],
      )
      return
    }
  }

  // Fire SMS and email simultaneously — neither is a fallback for the other.
  // Both channels are attempted in parallel; partial success is still logged.
  const channels: Array<Promise<string>> = []

  if (target.phone && smsConfigured()) {
    channels.push(
      sendSMS(target.phone, message)
        .then(r => `sms:${r.transport}${r.testMode ? "(TEST)" : ""}`)
        .catch((e: Error) => { throw new Error(`SMS — ${e.message}`) }),
    )
  }

  if (target.email && gmailConfigured()) {
    const htmlBody = `<div style="font-family:-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:520px">` +
      `<p style="margin:0 0 12px 0">${message.replace(/\n/g, "<br>")}</p></div>`
    channels.push(
      sendEmail({
        to:       target.email,
        fromName: "Vinuth",
        subject:  outreachEmailSubject(target),
        htmlBody,
      })
        .then(r => `email${r.testMode ? "(TEST)" : ""}`)
        .catch((e: Error) => { throw new Error(`Email — ${e.message}`) }),
    )
  }

  if (channels.length === 0) {
    console.warn(`[outreachScheduler] no send channel available for ${target.name}`)
    return
  }

  const results = await Promise.allSettled(channels)
  const ok      = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map(r => r.value)
  const errs    = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(r => (r.reason as Error).message)

  if (ok.length === 0) {
    const errNote = `Send failed: ${errs.join("; ").slice(0, 200)}`
    console.error(`[outreachScheduler] all channels failed for ${target.name}: ${errs.join("; ")}`)
    await execute(
      `UPDATE outreach_targets
       SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || E'\\n' || $1 END,
           updated_at = NOW()
       WHERE id = $2`,
      [errNote, target.id],
    )
    return
  }

  // Record the outbound message to the conversation thread (phone key, or email as fallback)
  const threadKey = target.phone || target.email!
  await addAgentMessageToThread(threadKey, message, {
    leadName:        target.name,
    propertyAddress: target.recent_sale_address ?? "",
    email:           target.email ?? "",
  })

  await execute(
    `UPDATE outreach_targets
     SET status = 'contacted', last_contact_date = NOW(),
         last_message = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'new'`,
    [message.slice(0, 300), target.id],
  )

  const summary = ok.join(" + ")
  if (errs.length > 0) {
    console.warn(`[outreachScheduler] partial delivery to ${target.name} — ok: ${summary}; failed: ${errs.join(", ")}`)
  } else {
    console.log(`[outreachScheduler] sent to ${target.name} via ${summary}`)
  }
}

async function queueFollowUpDraft(targetId: number, daysSince: number): Promise<void> {
  // Check: has a follow-up draft already been queued this week for this target?
  const existing = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM outreach_drafts
     WHERE target_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       AND inbound_body = '(scheduled follow-up)'`,
    [targetId],
  )
  if (parseInt(existing[0]?.count ?? "0", 10) > 0) return  // already queued this week

  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets WHERE id = $1 AND status = 'contacted'`,
    [targetId],
  )
  const target = targets[0]
  if (!target) return

  const { draft: followUpMessage, versionId } = await generateFollowUp(target, daysSince)

  await query(
    `INSERT INTO outreach_drafts (target_id, inbound_body, draft_body, version_id)
     VALUES ($1, '(scheduled follow-up)', $2, $3)`,
    [targetId, followUpMessage, versionId ?? null],
  )
  console.log(`[outreachScheduler] follow-up draft queued for ${target.name} (v=${versionId ?? "?"})`)
}

// ── Manual triggers ───────────────────────────────────────────────────────────

/** Manually trigger the outreach window (useful for testing). */
export async function triggerOutreachNow(limit = 1): Promise<{ sent: number; results: string[] }> {
  const targets = await query<OutreachTargetRow>(
    `SELECT * FROM outreach_targets
     WHERE status = 'new' AND phone IS NOT NULL AND sms_script IS NOT NULL
     ORDER BY id LIMIT $1`,
    [Math.min(limit, 5)],
  )

  const results: string[] = []
  for (const t of targets) {
    try {
      await sendOutreachMessage(t, t.sms_script!)
      results.push(`${t.name}: sent`)
    } catch (err) {
      results.push(`${t.name}: failed — ${(err as Error).message}`)
    }
    if (targets.indexOf(t) < targets.length - 1) await new Promise(r => setTimeout(r, SEND_GAP_MS))
  }
  return { sent: results.filter(r => r.includes("sent")).length, results }
}

/** Get the status of the outreach scheduler. */
export function getSchedulerStatus(): {
  running: boolean
  dailyCap: number
  followupAfterDays: number
  testMode: boolean
  testPhone: string | null
} {
  return {
    running:           started,
    dailyCap:          DAILY_NEW_CAP,
    followupAfterDays: FOLLOWUP_DAYS,
    testMode:          !!process.env.TEST_RECIPIENT_PHONE?.trim(),
    testPhone:         process.env.TEST_RECIPIENT_PHONE?.trim() ?? null,
  }
}
