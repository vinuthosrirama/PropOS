import { Router } from "express"
import { type GenerateParams } from "../lib/openai.js"
import { generateFromTemplate } from "../lib/outreachTemplates.js"
import { queueNurtureSequence, type QueueNurtureParams } from "../lib/scheduler.js"

const router = Router()

/**
 * POST /api/nurture/queue
 * Schedule Day 7, 14, 30 follow-up jobs for a contact.
 * Called automatically by /api/send after a successful vendor or buyer outreach.
 * Can also be called manually to enrol a contact into a nurture sequence.
 */
router.post("/queue", async (req, res) => {
  const params = req.body as QueueNurtureParams
  if (!params.contactPhone || !params.contactName) {
    return res.status(400).json({ error: "contactPhone and contactName are required" })
  }
  try {
    await queueNurtureSequence(params)
    res.json({ ok: true, scheduled: 3, note: "Day 7, 14, 30 follow-ups queued" })
  } catch (err) {
    console.error("[nurture/queue]", (err as Error).message)
    res.status(500).json({ error: "Failed to queue nurture sequence" })
  }
})

const NURTURE_STRATEGIES: Array<{ day: number; strategy: string; anchor: string }> = [
  { day: 0,  strategy: "New Listing Match",     anchor: "Reference the open home they attended and introduce the new listing directly." },
  { day: 7,  strategy: "Market Pulse",          anchor: "Share a relevant suburb market stat or recent comparable sale — position as helpful intel." },
  { day: 14, strategy: "Social Proof Drop",     anchor: "Mention another buyer who just purchased a similar property, implying competition/scarcity." },
  { day: 30, strategy: "Life Check-In",         anchor: "Light touch — ask where their search is at, no pressure, just staying top of mind." },
]

/**
 * POST /api/nurture
 * Generate a 4-message drip sequence for a lead (Day 0, 7, 14, 30).
 * Reuses the same voice context + SLM context as /api/generate.
 */
router.post("/", async (req, res) => {
  const base = req.body as GenerateParams & { grade?: string }

  if (!base.lead?.name || !base.agentName) {
    return res.status(400).json({ error: "lead.name and agentName are required" })
  }

  const sequence: Array<{ day: number; strategy: string; sms: string; email: { subject: string; body: string[] } }> = []

  for (const step of NURTURE_STRATEGIES) {
    const result = generateFromTemplate({
      agentName: base.agentName,
      agentAgency: base.agentAgency,
      soldShortAddr: base.soldShortAddr,
      activeShortAddr: base.activeShortAddr,
      lead: {
        name: base.lead.name,
        notes: `${base.lead.notes ?? ""}\n[Nurture anchor — Day ${step.day}: ${step.anchor}]`.trim(),
        questions: base.lead.questions ?? "",
        persona: base.lead.persona,
        budget: base.lead.budget,
        suburb: base.lead.suburb,
      },
      strategy: step.strategy,
      channel: base.channel,
    })
    sequence.push({ day: step.day, strategy: step.strategy, ...result })
  }

  res.json({ ok: true, leadId: base.lead.name, sequence })
})

export default router
