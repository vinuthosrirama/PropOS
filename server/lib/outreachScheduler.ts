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
import { sendSMS, smsConfigured } from "./sms.js"
import { addAgentMessageToThread } from "./conversations.js"
import {
  generateFollowUp,
  getMorningBrief,
  type OutreachTargetRow,
} from "./outreachAgent.js"

// ── Config ────────────────────────────────────────────────────────────────────

const DAILY_NEW_CAP   = parseInt(process.env.OUTREACH_DAILY_CAP ?? "5", 10)
const FOLLOWUP_DAYS   = parseInt(process.env.OUTREACH_FOLLOWUP_DAYS ?? "3", 10)
const SEND_GAP_MS     = 3_000   // 3s between sends — carrier throttle buffer
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

  console.log("  OutreachScheduler: running (9am brief, 10am sends, Melbourne time, weekdays)")
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
  if (!smsConfigured()) {
    console.log("[outreachScheduler] Outreach window: no SMS transport configured — skipping")
    return
  }

  try {
    // Pick up to DAILY_NEW_CAP new targets
    const targets = await query<OutreachTargetRow>(
      `SELECT * FROM outreach_targets
       WHERE status = 'new' AND phone IS NOT NULL AND sms_script IS NOT NULL
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

async function sendOutreachMessage(target: OutreachTargetRow, message: string): Promise<void> {
  if (!target.phone) return
  try {
    const result = await sendSMS(target.phone, message)
    await execute(
      `UPDATE outreach_targets
       SET status = 'contacted', last_contact_date = NOW(),
           last_message = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'new'`,
      [message.slice(0, 300), target.id],
    )
    await addAgentMessageToThread(target.phone, message, {
      leadName:        target.name,
      propertyAddress: target.recent_sale_address ?? "",
    })
    console.log(`[outreachScheduler] sent to ${target.name} via ${result.transport}${result.testMode ? " (TEST)" : ""}`)
  } catch (err) {
    console.error(`[outreachScheduler] send failed for ${target.name}:`, (err as Error).message)
    await execute(
      `UPDATE outreach_targets SET notes = $1, updated_at = NOW() WHERE id = $2`,
      [`Send failed: ${(err as Error).message.slice(0, 200)}`, target.id],
    )
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

  const followUpMessage = await generateFollowUp(target, daysSince)

  await query(
    `INSERT INTO outreach_drafts (target_id, inbound_body, draft_body)
     VALUES ($1, '(scheduled follow-up)', $2)`,
    [targetId, followUpMessage],
  )
  console.log(`[outreachScheduler] follow-up draft queued for ${target.name}`)
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
