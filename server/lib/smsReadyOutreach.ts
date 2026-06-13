/**
 * Ready-queue poller — CRM-triggered auto-outreach (see docs/SMS_AGENT.md,
 * "Planned: CRM-Triggered Auto-Outreach" item 3).
 *
 * Ticking `ready_to_contact` on a sms_contacts row queues a personalised
 * opener draft for Vinuth's approval within ~2 minutes, without waiting for
 * the 7am orchestrator. Runs as a 2-min cron (registered from index.ts) and
 * can also be triggered on demand via POST /api/sms-agent/run-ready.
 */

import cron from "node-cron"
import { isDbConnected } from "./db.js"
import { claimReadyContacts } from "./smsContacts.js"
import { generateOpener } from "./smsAgent.js"
import { saveAgentDraft, getPendingAgentDrafts } from "./smsAgentDrafts.js"
import { getAgentContext } from "./agentContext.js"
import { smsOptOutReason } from "./compliance.js"

export interface ReadyOutreachResult {
  contactId: number
  name: string
  draftId: number | null
  preview: string
  skipped?: string
}

const READY_BATCH_SIZE = 15

/** Claim ready contacts and queue a personalised opener draft for each. */
export async function runReadyOutreach(limit = READY_BATCH_SIZE): Promise<ReadyOutreachResult[]> {
  if (!isDbConnected()) return []

  const claimed = await claimReadyContacts(limit)
  if (claimed.length === 0) return []

  const pending = await getPendingAgentDrafts()
  const pendingContactIds = new Set(pending.map(d => d.contact_id))

  const results: ReadyOutreachResult[] = []
  for (const contact of claimed) {
    if (pendingContactIds.has(contact.id)) {
      results.push({ contactId: contact.id, name: contact.name, draftId: null, preview: "", skipped: "pending draft already exists" })
      continue
    }

    const optOutReason = await smsOptOutReason(contact.phone)
    if (optOutReason) {
      results.push({ contactId: contact.id, name: contact.name, draftId: null, preview: "", skipped: optOutReason })
      continue
    }

    const agentCtx = await getAgentContext(contact.assigned_agent_id)
    const opener = await generateOpener(contact, agentCtx)
    const draftId = await saveAgentDraft({
      contactId: contact.id,
      draftBody: opener.draft,
      kind: "opener",
      reasoning: "CRM ready_to_contact",
      voiceConfidence: opener.voiceConfidence,
    })
    results.push({ contactId: contact.id, name: contact.name, draftId, preview: opener.draft })
  }

  const queued = results.filter(r => r.draftId !== null).length
  console.log(`[smsReadyOutreach] claimed ${claimed.length}, queued ${queued} opener(s)`)
  return results
}

// ── Cron registration (called from index.ts) ────────────────────────────────────

export function startReadyOutreachScheduler(): void {
  if (!isDbConnected()) {
    console.log("  SMS ready-poller: skipped (no database)")
    return
  }
  cron.schedule("*/2 * * * *", () => {
    void runReadyOutreach()
  }, { timezone: "Australia/Melbourne" })
  console.log("  SMS ready-poller: started (every 2 min, Melbourne)")
}
