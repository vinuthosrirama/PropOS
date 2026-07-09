import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { generateMessageHaiku, MODEL_COSTS } from "../lib/claude.js"
import { generateFromTemplate } from "../lib/outreachTemplates.js"

const router = Router()

function clampSMS(sms: string): string {
  if (sms.length <= 320) return sms          // 2 SMS segments (~320 chars)
  return sms.slice(0, 317).trimEnd() + "..."
}

function cleanStr(s: string): string {
  return s.replace(/—|–/g, ",").replace(/--/g, ",")
}

function sanitise<T extends { sms: string; email: { subject: string; body: string[] } }>(r: T): T {
  return {
    ...r,
    sms: clampSMS(cleanStr(r.sms)),
    email: {
      ...r.email,
      subject: cleanStr(r.email.subject),
      body: r.email.body.map(cleanStr),
    },
  }
}

/**
 * POST /api/generate
 *
 * LLM is PRIMARY — this fires when the agent pushes the button to create a
 * personalised preview, so it must actually sound like them (voice corpus +
 * training examples). Template engine is now opt-in only (useTemplate=true),
 * for cost-sensitive background/bulk flows, or the automatic fallback when
 * no LLM key is configured or the LLM call errors/times out.
 */
router.post("/", async (req, res) => {
  const params = req.body as GenerateParams & { forceAI?: boolean; useTemplate?: boolean }

  if (!params.lead?.name || !params.strategy) {
    return res.status(400).json({ error: "lead.name and strategy are required" })
  }

  const templateResult = () => generateFromTemplate({
    agentName: params.agentName,
    agentAgency: params.agentAgency,
    soldShortAddr: params.soldShortAddr,
    activeShortAddr: params.activeShortAddr,
    lead: {
      name: params.lead.name,
      notes: params.lead.notes,
      transcript: params.lead.transcript,
      questions: params.lead.questions,
      persona: params.lead.persona,
      budget: params.lead.budget,
      suburb: params.lead.suburb,
    },
    strategy: params.strategy,
    channel: params.channel,
  })

  // ── Explicit cost-saving opt-out (e.g. background bulk flows) ──────────────
  if (params.useTemplate) {
    return res.json({
      ...templateResult(),
      meta: { pipeline: "template", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }

  // ── No LLM key configured — template is the only option ────────────────────
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.json({
      ...templateResult(),
      meta: { pipeline: "template-fallback", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }

  try {
    let modelUsed = "gpt-4o-mini"
    let result

    // OpenAI is primary — this repo currently runs without an Anthropic key, and a
    // stray ANTHROPIC_API_KEY in any environment should never silently override that.
    // Anthropic stays available as the fallback when OpenAI is unset or errors.
    if (process.env.OPENAI_API_KEY) {
      result = sanitise(await generateMessage(params).catch(async () => {
        if (process.env.ANTHROPIC_API_KEY) {
          modelUsed = "claude-haiku-4-5"
          return generateMessageHaiku(params)
        }
        throw new Error("no-llm")
      }))
    } else if (process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-haiku-4-5"
      result = sanitise(await generateMessageHaiku(params))
    } else {
      throw new Error("no-llm")
    }

    const estimatedCostUsd = MODEL_COSTS[modelUsed] ?? 0
    res.json({ ...result, meta: { pipeline: "llm", model_used: modelUsed, estimated_cost_usd: estimatedCostUsd, analysis: null, qa: null } })
  } catch (err) {
    console.error("Generate error:", err)
    res.json({
      ...templateResult(),
      meta: { pipeline: "template-error-fallback", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }
})

export default router
