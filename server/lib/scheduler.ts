/**
 * PropOS Nurture Scheduler
 *
 * Runs on a 5-minute cron tick (every :00 and :05 etc).
 * When DATABASE_URL is configured:
 *   - Picks up pending nurture_queue rows whose scheduled_at has passed
 *   - Generates a fresh personalised message for each
 *   - Checks SPAM Act compliance, then sends via Twilio + Gmail
 *   - Marks the row as 'sent' or 'failed'
 *
 * When no DB: logs a startup notice and does nothing (demo mode is manual-only).
 *
 * Vendor nurture anchor copy (what PropOS says at each follow-up step):
 *   Step 1 (Day 7)  — market pulse: share a relevant suburb sale that validates their equity position
 *   Step 2 (Day 14) — social proof: another owner in their suburb just listed / went to market
 *   Step 3 (Day 30) — life check-in: no-pressure, just staying top of mind
 */

import cron from "node-cron"
import { isDbConnected, query, execute } from "./db.js"
import { checkCompliance } from "./compliance.js"
import { sendSMS, smsConfigured } from "./sms.js"
import { sendEmail, gmailConfigured } from "./gmail.js"
import { buildEmailHTML } from "./emailTemplate.js"
import { addAgentMessageToThread } from "./conversations.js"
import { logOutreach } from "./db.js"
import { generateMessageHaiku } from "./claude.js"
import type { GenerateParams } from "./openai.js"

// ---------------------------------------------------------------------------
// Nurture step definitions
// ---------------------------------------------------------------------------

interface NurtureStep {
  step: number   // 1 = Day 7, 2 = Day 14, 3 = Day 30
  daysAfterInitial: number
  strategyLabel: string
  anchor: string   // injected into the generation prompt
}

export const VENDOR_NURTURE_STEPS: NurtureStep[] = [
  {
    step: 1,
    daysAfterInitial: 7,
    strategyLabel: "Market Pulse",
    anchor: "Share a relevant recent comparable sale in their suburb that validates their equity position. Keep it brief and helpful, not salesy.",
  },
  {
    step: 2,
    daysAfterInitial: 14,
    strategyLabel: "Social Proof",
    anchor: "Mention that another owner in their suburb just decided to go to market (without naming them). Creates gentle urgency — they're not alone in considering this.",
  },
  {
    step: 3,
    daysAfterInitial: 30,
    strategyLabel: "Life Check-In",
    anchor: "Light touch — no pitch, just checking in on how things are going. Ask if they've had any more thoughts. Keep it warm and short.",
  },
]

export const BUYER_NURTURE_STEPS: NurtureStep[] = [
  {
    step: 1,
    daysAfterInitial: 7,
    strategyLabel: "Market Pulse",
    anchor: "Share a relevant suburb market stat or recent comparable sale — position as helpful intel.",
  },
  {
    step: 2,
    daysAfterInitial: 14,
    strategyLabel: "Social Proof",
    anchor: "Mention another buyer who just purchased a similar property, implying competition/scarcity.",
  },
  {
    step: 3,
    daysAfterInitial: 30,
    strategyLabel: "Life Check-In",
    anchor: "Light touch — ask where their search is at, no pressure, just staying top of mind.",
  },
]

// ---------------------------------------------------------------------------
// Public API — called when outreach Day 0 is confirmed sent
// ---------------------------------------------------------------------------

/** Typed context blob passed to the nurture LLM on each follow-up step. */
export interface NurtureContext {
  agentName:     string
  agentAgency:   string
  agentEmail:    string
  agentPhone?:   string
  agentSuburb?:  string
  agencyColor?:  string
  agencyTagline?: string
  voiceContext?:  string
  pipeline?:     string
  notes?:        string
}

export interface QueueNurtureParams {
  agentId?:        string
  contactPhone:    string
  contactName:     string
  contactEmail:    string
  propertyAddress: string
  pipeline?:       string   // "vendor" | pipeline id | undefined (buyer mode)
  context: NurtureContext
}

/**
 * Schedule Day 7, 14, 30 nurture jobs for a contact.
 * Safe to call even when DB is not connected — silently no-ops.
 */
export async function queueNurtureSequence(params: QueueNurtureParams): Promise<void> {
  if (!isDbConnected()) return

  const steps = params.pipeline === "vendor" ||
    params.pipeline?.startsWith("investor") ||
    params.pipeline?.startsWith("owner")
    ? VENDOR_NURTURE_STEPS
    : BUYER_NURTURE_STEPS

  const now = new Date()
  for (const step of steps) {
    const scheduledAt = new Date(now.getTime() + step.daysAfterInitial * 24 * 60 * 60 * 1000)
    // WHERE NOT EXISTS prevents double-queuing if called twice for the same contact/step
    await execute(
      `INSERT INTO nurture_queue
         (agent_id, contact_phone, contact_name, contact_email, property_address, pipeline, step, scheduled_at, status, context)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9
       WHERE NOT EXISTS (
         SELECT 1 FROM nurture_queue
         WHERE contact_phone = $2 AND step = $7
           AND status IN ('pending', 'sending', 'sent')
       )`,
      [
        params.agentId ?? "default",
        params.contactPhone,
        params.contactName,
        params.contactEmail,
        params.propertyAddress,
        params.pipeline ?? null,
        step.step,
        scheduledAt.toISOString(),
        JSON.stringify(params.context),
      ],
    )
  }
}

/**
 * Cancel all pending nurture jobs for a contact (called when they reply).
 * Prevents further follow-ups to contacts who are already engaged.
 */
export async function cancelNurtureJobs(contactPhone: string): Promise<void> {
  if (!isDbConnected()) return
  await execute(
    `UPDATE nurture_queue SET status = 'cancelled', updated_at = NOW()
     WHERE contact_phone = $1 AND status = 'pending'`,
    [contactPhone],
  )
}

// ---------------------------------------------------------------------------
// Scheduler — runs every 5 minutes
// ---------------------------------------------------------------------------

let started = false

export function startScheduler(): void {
  if (started) return
  started = true

  if (!isDbConnected()) {
    console.log("  Scheduler: no database — automated nurture disabled (demo mode)")
    return
  }

  // Recover jobs orphaned in 'sending' by a previous crash.
  // Decrement attempts so the crash doesn't count against the retry budget.
  execute(
    `UPDATE nurture_queue
     SET status = 'pending', attempts = GREATEST(attempts - 1, 0), updated_at = NOW()
     WHERE status = 'sending'`,
  ).then(n => {
    if (n > 0) console.warn(`[scheduler] recovered ${n} orphaned job(s) from previous crash`)
  }).catch(err => console.error("[scheduler] crash-recovery query failed:", err))

  // Run immediately on startup to catch any overdue jobs (e.g. after a restart)
  runNurtureJobs().catch(err => console.error("[scheduler] startup run failed:", err))

  // Then tick every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runNurtureJobs().catch(err => console.error("[scheduler] tick failed:", err))
  })

  console.log("  Scheduler: running (nurture jobs checked every 5 minutes)")
}

// ---------------------------------------------------------------------------
// Core job runner
// ---------------------------------------------------------------------------

interface NurtureJobRow {
  id: number
  agent_id: string
  contact_phone: string
  contact_name: string
  contact_email: string
  property_address: string
  pipeline: string | null
  step: number
  context: Record<string, unknown> | string
  attempts: number
}

async function runNurtureJobs(): Promise<void> {
  if (!isDbConnected()) return

  // Lock and claim up to 20 due jobs at once
  const jobs = await query<NurtureJobRow>(
    `UPDATE nurture_queue
     SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
     WHERE id IN (
       SELECT id FROM nurture_queue
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at
       LIMIT 20
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
  )

  if (jobs.length === 0) return
  console.log(`[scheduler] processing ${jobs.length} nurture job(s)`)

  await Promise.allSettled(jobs.map(job => processJob(job)))
}

async function processJob(job: NurtureJobRow): Promise<void> {
  let ctx: NurtureContext
  try {
    ctx = (typeof job.context === "string" ? JSON.parse(job.context) : (job.context ?? {})) as NurtureContext
  } catch {
    // Corrupt context blob — fail the job immediately rather than leaving it stuck in 'sending'
    console.error(`[scheduler] job ${job.id} has unparseable context, marking failed`)
    await markJob(job.id, "failed", "context JSON parse error")
    return
  }
  const step = getStepDefinition(job.pipeline, job.step)

  try {
    // 1. Compliance check
    const compliance = await checkCompliance(job.contact_phone, job.contact_email)
    if (!compliance.smsOk && !compliance.emailOk) {
      await markJob(job.id, "cancelled")
      console.log(`[scheduler] job ${job.id} cancelled — opted out`)
      return
    }

    // 2. Generate message
    const message = await generateNurtureMessage(job, ctx, step)

    // 3. Send
    let smsSent = false
    let emailSent = false

    if (compliance.smsOk && job.contact_phone && smsConfigured()) {
      try {
        await sendSMS(job.contact_phone, message.sms)
        smsSent = true
        await addAgentMessageToThread(job.contact_phone, message.sms, {
          leadName: job.contact_name,
          propertyAddress: job.property_address,
          email: job.contact_email,
        })
      } catch (err) {
        console.warn(`[scheduler] job ${job.id} SMS failed:`, (err as Error).message)
      }
    }

    if (compliance.emailOk && job.contact_email && gmailConfigured()) {
      try {
        const agentName  = ctx.agentName  || "Agent"
        const agentEmail = ctx.agentEmail || ""
        const html = buildEmailHTML({
          agentName,
          agencyName:      ctx.agentAgency  || "",
          agentEmail,
          agentPhone:      ctx.agentPhone,
          agencyColor:     ctx.agencyColor,
          agencyTagline:   ctx.agencyTagline,
          leadFirstName:   job.contact_name.split(" ")[0],
          propertyAddress: job.property_address,
          bodyParagraphs:  message.email.body,
          leadId:          job.contact_phone,
        })
        await sendEmail({ to: job.contact_email, fromName: agentName, subject: message.email.subject, htmlBody: html })
        emailSent = true
      } catch (err) {
        console.warn(`[scheduler] job ${job.id} email failed:`, (err as Error).message)
      }
    }

    if (!smsSent && !emailSent) {
      // No delivery channel available — mark failed if past max retries
      if (job.attempts >= 3) {
        await markJob(job.id, "failed", "No delivery channel available after 3 attempts")
      } else {
        // Reschedule for 30 minutes later
        await execute(
          `UPDATE nurture_queue SET status = 'pending', scheduled_at = NOW() + INTERVAL '30 minutes', updated_at = NOW() WHERE id = $1`,
          [job.id],
        )
      }
      return
    }

    // 4. Log to outreach_log
    await logOutreach({
      agentId:         job.agent_id,
      contactPhone:    job.contact_phone,
      contactEmail:    job.contact_email,
      contactName:     job.contact_name,
      channel:         smsSent && emailSent ? "both" : smsSent ? "sms" : "email",
      smsBody:         message.sms,
      emailSubject:    message.email.subject,
      propertyAddress: job.property_address,
      pipeline:        job.pipeline ?? undefined,
      metadata:        { nurtureStep: job.step, stepLabel: step?.strategyLabel },
    })

    await markJob(job.id, "sent")
    console.log(`[scheduler] job ${job.id} sent (step ${job.step})`)

  } catch (err) {
    const msg = (err as Error).message
    console.error(`[scheduler] job ${job.id} error:`, msg)
    if (job.attempts >= 3) {
      await markJob(job.id, "failed", msg)
    } else {
      // Back to pending for retry
      await execute(
        `UPDATE nurture_queue SET status = 'pending', last_error = $1, updated_at = NOW() WHERE id = $2`,
        [msg, job.id],
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Message generation for scheduled nurture
// ---------------------------------------------------------------------------

interface NurtureMessage {
  sms: string
  email: { subject: string; body: string[] }
}

async function generateNurtureMessage(
  job: NurtureJobRow,
  ctx: NurtureContext,
  step: NurtureStep | undefined,
): Promise<NurtureMessage> {
  const firstName   = job.contact_name.split(" ")[0]
  const agentFirst  = (ctx.agentName || "Agent").split(" ")[0]
  const agentAgency = ctx.agentAgency || ""
  const fromAgency  = agentAgency ? ` from ${agentAgency}` : ""
  const anchor = step?.anchor ?? "Checking in on your situation."

  // Try LLM generation first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const params: GenerateParams = {
        agentName:    ctx.agentName   || "Agent",
        agentAgency:  ctx.agentAgency || "",
        agentSuburb:  ctx.agentSuburb ?? "",
        voiceContext: ctx.voiceContext ?? "",
        slmContext:   "",
        strategy:     step?.strategyLabel ?? "Check-In",
        channel:      "sms",
        lead: {
          name:      job.contact_name,
          budget:    "",
          timeline:  "",
          persona:   ctx.pipeline ?? "",
          notes:     `${ctx.notes ?? ""}\n[Follow-up step ${job.step} — ${anchor}]`.trim(),
          transcript: "",
          questions:  "",
        },
      }
      const result = await generateMessageHaiku(params)
      return {
        sms: result.sms,
        email: { subject: result.email.subject, body: result.email.body },
      }
    } catch {
      // Fall through to template
    }
  }

  // Template fallback
  const templates: NurtureMessage[] = [
    {
      sms: `Hi ${firstName}, ${agentFirst} here. A couple of strong sales just came through in your suburb. Happy to share the numbers if you're keen? Cheers`,
      email: {
        subject: `Recent sales in your suburb, ${firstName}`,
        body: [
          `Hi ${firstName},`,
          `A few strong results have come through in your suburb recently that are worth knowing about. They paint a pretty good picture of where your property sits right now. Happy to walk you through the numbers whenever suits.`,
          `Cheers,\n${agentFirst}`,
        ],
      },
    },
    {
      sms: `Hi ${firstName}, ${agentFirst}${fromAgency} here. Another owner nearby just decided to go to market. Timing for sellers is looking good right now. Worth a quick chat? Cheers`,
      email: {
        subject: `Thought you'd want to know, ${firstName}`,
        body: [
          `Hi ${firstName},`,
          `Another owner in your area just made the call to list. That's a decent sign of where confidence sits right now, and the same conditions apply to your place.`,
          `No pressure at all, but if you'd like to catch up for a coffee and talk through your options, I'm happy to do that.`,
          `Cheers,\n${agentFirst}`,
        ],
      },
    },
    {
      sms: `Hi ${firstName}, ${agentFirst} here. Just checking in, no particular agenda. If you've had any thoughts about your property lately, always happy to chat. Cheers`,
      email: {
        subject: `Checking in, ${firstName}`,
        body: [
          `Hi ${firstName},`,
          `No particular news, just wanted to see how things are going. If your situation has changed at all or you've been thinking about your property, I'm always happy to have a no-pressure chat.`,
          `Otherwise, hope all's going well.`,
          `Cheers,\n${agentFirst}`,
        ],
      },
    },
  ]

  return templates[Math.min(job.step - 1, templates.length - 1)]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepDefinition(pipeline: string | null, step: number): NurtureStep | undefined {
  const isVendor = pipeline === "vendor" ||
    pipeline?.startsWith("investor") ||
    pipeline?.startsWith("owner")
  const steps = isVendor ? VENDOR_NURTURE_STEPS : BUYER_NURTURE_STEPS
  return steps.find(s => s.step === step)
}

async function markJob(id: number, status: string, error?: string): Promise<void> {
  await execute(
    `UPDATE nurture_queue SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
    [status, error ?? null, id],
  )
}
