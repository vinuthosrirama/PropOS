/**
 * SMS Agent orchestrator (Stage 4)
 *
 * Daily autonomous loop (7am Melbourne). Overnight replies are already handled
 * in real time by smsAgentInbound; this cron does the proactive work:
 *   - follow-ups for contacts who went quiet (different angle, capped)
 *   - promote new agent-prospects from outreach_targets into sms_contacts and
 *     queue an opener (respecting the daily cap)
 *   - meeting prep for bookings in the next 48h
 *   - voice-health check (recalibrate after enough signals; report approval rate)
 *
 * Everything is queued as drafts for Vinuth's morning approval unless auto-send
 * is explicitly enabled. Non-fatal throughout.
 */

import cron from "node-cron"
import { query, isDbConnected } from "./db.js"
import {
  listContacts, upsertContact, markContacted, getUpcomingMeetings,
  getApprovedAsIsRate, countSignalsSinceCalibration,
} from "./smsContacts.js"
import { generateOpener } from "./smsAgent.js"
import { saveAgentDraft } from "./smsAgentDrafts.js"
import { recalibrateVoice } from "./voiceCalibration.js"
import { DEFAULT_VOICE_ID, getAgentVoiceId } from "./voiceProfile.js"

const DAILY_OUTREACH_CAP = Math.max(0, parseInt(process.env.SMS_AGENT_DAILY_CAP ?? "3", 10))
const FOLLOWUP_AFTER_DAYS = Math.max(1, parseInt(process.env.SMS_AGENT_FOLLOWUP_DAYS ?? "3", 10))
const MAX_FOLLOWUPS = Math.max(1, parseInt(process.env.SMS_AGENT_MAX_FOLLOWUPS ?? "2", 10))
const RECALIBRATE_THRESHOLD = 15

// Legacy outreach_targets promoter — off by default. The CRM-triggered
// ready-poller (smsReadyOutreach.ts) is now the single source of truth for
// new outreach; set SMS_AGENT_PROMOTE_TARGETS=true to re-enable this path.
const PROMOTE_LEGACY_TARGETS = process.env.SMS_AGENT_PROMOTE_TARGETS === "true"

export interface OrchestrationSummary {
  followUpsQueued: number
  newOutreachQueued: number
  meetingsUpcoming: number
  approvedAsIsRate: number
  recalibrated: boolean
  actions: string[]
}

// ── Step 1: follow-ups for quiet contacts ───────────────────────────────────────

async function queueFollowUps(): Promise<{ count: number; notes: string[] }> {
  const notes: string[] = []
  // Active contacts contacted > N days ago, still under the follow-up cap, no reply since.
  const due = await listContacts({ status: "active" })
  const now = Date.now()
  let count = 0
  for (const c of due) {
    if (!c.last_contact) continue
    if (c.attempts >= MAX_FOLLOWUPS) continue
    const days = (now - new Date(c.last_contact).getTime()) / 86_400_000
    if (days < FOLLOWUP_AFTER_DAYS) continue

    const opener = await generateOpener(c)   // opener generator doubles as a fresh-angle nudge
    await saveAgentDraft({
      contactId: c.id, draftBody: opener.draft, kind: "followup",
      reasoning: `Follow-up ${c.attempts + 1}/${MAX_FOLLOWUPS}, ${Math.floor(days)} days quiet`,
      voiceConfidence: opener.voiceConfidence,
    })
    await markContacted(c.id, { incrementAttempts: true })
    notes.push(`Follow-up queued for ${c.name} (${Math.floor(days)}d quiet)`)
    count++
    if (count >= DAILY_OUTREACH_CAP) break
  }
  return { count, notes }
}

// ── Step 2: promote new agent-prospects from the CRM ────────────────────────────

interface CrmAgent {
  id: number; name: string; agency: string; phone: string | null
  suburb: string | null; recent_sale_address: string | null; personal_note: string | null
}

async function queueNewOutreach(remaining: number): Promise<{ count: number; notes: string[] }> {
  const notes: string[] = []
  if (remaining <= 0) return { count: 0, notes }

  // CRM agents never contacted, with a phone, not already an sms_contact.
  const rows = await query<CrmAgent>(
    `SELECT t.id, t.name, t.agency, t.phone, t.suburb, t.recent_sale_address, t.personal_note
     FROM outreach_targets t
     LEFT JOIN sms_contacts c ON c.phone = t.phone
     WHERE t.status = 'new' AND t.phone IS NOT NULL AND c.id IS NULL
     ORDER BY t.updated_at DESC
     LIMIT $1`,
    [remaining],
  )

  let count = 0
  for (const a of rows) {
    if (!a.phone) continue
    const personalisation: Record<string, unknown> = {
      agency: a.agency,
      suburb: a.suburb ?? "",
      recent_sale: a.recent_sale_address ?? "",
      note: a.personal_note ?? "",
    }
    const contactId = await upsertContact({
      name: a.name, phone: a.phone, relationship: "agent_prospect", stage: 3,
      personalisation,
      conversation_objective: `Invite ${a.name.split(" ")[0]} for a casual coffee to chat about the ${a.suburb ?? "local"} market. Not a pitch.`,
      source: "crm:outreach_targets",
    })
    if (!contactId) continue

    const contact = (await listContacts()).find(c => c.id === contactId)
    if (!contact) continue
    const opener = await generateOpener(contact)
    await saveAgentDraft({
      contactId, draftBody: opener.draft, kind: "opener",
      reasoning: `New outreach to ${a.agency} agent`, voiceConfidence: opener.voiceConfidence,
    })
    notes.push(`Opener queued for ${a.name} (${a.agency})`)
    count++
  }
  return { count, notes }
}

// ── Step 3: meeting prep ─────────────────────────────────────────────────────────

async function meetingPrep(): Promise<{ count: number; notes: string[] }> {
  const meetings = await getUpcomingMeetings(48)
  const notes = meetings.map(m =>
    `Meeting: ${m.contact_name} at ${new Date(m.proposed_time).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}${m.location ? ` (${m.location})` : ""}`,
  )
  return { count: meetings.length, notes }
}

// ── Main ─────────────────────────────────────────────────────────────────────────

export async function runSmsOrchestration(): Promise<OrchestrationSummary> {
  if (!isDbConnected()) {
    return { followUpsQueued: 0, newOutreachQueued: 0, meetingsUpcoming: 0, approvedAsIsRate: 1, recalibrated: false, actions: ["DB not connected"] }
  }

  const actions: string[] = []

  const followUps = await queueFollowUps()
  actions.push(...followUps.notes)

  const newOutreach = PROMOTE_LEGACY_TARGETS
    ? await queueNewOutreach(DAILY_OUTREACH_CAP - followUps.count)
    : { count: 0, notes: [] }
  actions.push(...newOutreach.notes)

  const meetings = await meetingPrep()
  actions.push(...meetings.notes)

  // Voice health
  let recalibrated = false
  const signalsSince = await countSignalsSinceCalibration(DEFAULT_VOICE_ID)
  if (signalsSince >= RECALIBRATE_THRESHOLD) {
    const result = await recalibrateVoice(DEFAULT_VOICE_ID)
    recalibrated = !!result
    if (recalibrated) actions.push(`Voice recalibrated from ${signalsSince} signals`)
  }

  // Per-agent voice health (item 8) — every agent's voice improves from their
  // own approve/edit/reject history, not just Vinuth's.
  const agents = await query<{ id: number }>(`SELECT id FROM agents`)
  for (const agent of agents) {
    const voiceId = getAgentVoiceId(agent.id)
    const sinceAgent = await countSignalsSinceCalibration(voiceId)
    if (sinceAgent >= RECALIBRATE_THRESHOLD) {
      const result = await recalibrateVoice(voiceId)
      if (result) {
        recalibrated = true
        actions.push(`Voice recalibrated for agent ${agent.id} from ${sinceAgent} signals`)
      }
    }
  }

  const brake = await getApprovedAsIsRate(20)

  const summary: OrchestrationSummary = {
    followUpsQueued: followUps.count,
    newOutreachQueued: newOutreach.count,
    meetingsUpcoming: meetings.count,
    approvedAsIsRate: brake.rate,
    recalibrated,
    actions,
  }
  console.log(`[smsOrchestrator] daily run: ${summary.followUpsQueued} follow-ups, ${summary.newOutreachQueued} new openers, ${summary.meetingsUpcoming} meetings, approved-as-is ${Math.round(brake.rate * 100)}%`)
  return summary
}

// ── Cron registration (called from index.ts) ────────────────────────────────────

export function startSmsAgentScheduler(): void {
  if (!isDbConnected()) {
    console.log("  SMS Agent scheduler: skipped (no database)")
    return
  }
  // 7:00am Melbourne, weekdays — the autonomous daily loop.
  cron.schedule("0 7 * * 1-5", () => {
    void runSmsOrchestration()
  }, { timezone: "Australia/Melbourne" })
  console.log("  SMS Agent scheduler: started (daily 7am Melbourne)")
}
