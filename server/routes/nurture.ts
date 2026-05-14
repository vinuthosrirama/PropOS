import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { generateMessageClaude, generateMessageHaiku } from "../lib/claude.js"

const router = Router()

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

  const grade = base.grade ?? "B"
  const sequence: Array<{ day: number; strategy: string; sms: string; email: { subject: string; body: string[] } }> = []

  for (const step of NURTURE_STRATEGIES) {
    const params: GenerateParams = {
      ...base,
      strategy: step.strategy,
      lead: {
        ...base.lead,
        notes: `${base.lead.notes ?? ""}\n[Nurture anchor — Day ${step.day}: ${step.anchor}]`.trim(),
      },
    }

    try {
      let result
      if (grade === "A" && process.env.ANTHROPIC_API_KEY) {
        result = await generateMessageClaude(params)
      } else if (grade === "C" && process.env.ANTHROPIC_API_KEY) {
        result = await generateMessageHaiku(params)
      } else if (process.env.OPENAI_API_KEY) {
        result = await generateMessage(params)
      } else {
        result = {
          sms: `Hi ${base.lead.name.split(" ")[0]}, ${base.agentName.split(" ")[0]} here. ${step.anchor}`,
          email: {
            subject: `${step.strategy} — ${base.lead.name.split(" ")[0]}`,
            body: [`Hi ${base.lead.name.split(" ")[0]}, ${step.anchor}`, `Cheers,\n${base.agentName.split(" ")[0]}`],
          },
        }
      }
      sequence.push({ day: step.day, strategy: step.strategy, ...result })
    } catch (err) {
      console.warn(`Nurture Day ${step.day} failed:`, err)
      sequence.push({
        day: step.day,
        strategy: step.strategy,
        sms: `Hi ${base.lead.name.split(" ")[0]}, ${base.agentName.split(" ")[0]} here. Checking in on your search.`,
        email: {
          subject: `Checking in — ${base.lead.name.split(" ")[0]}`,
          body: [`Hi ${base.lead.name.split(" ")[0]}, hope all is well.`, `Cheers,\n${base.agentName.split(" ")[0]}`],
        },
      })
    }
  }

  res.json({ ok: true, leadId: base.lead.name, sequence })
})

export default router
