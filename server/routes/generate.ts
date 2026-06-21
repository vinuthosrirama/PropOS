import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { generateMessageHaiku, MODEL_COSTS } from "../lib/claude.js"
import { generateFromTemplate } from "../lib/outreachTemplates.js"

const router = Router()

function clampSMS(sms: string): string {
  if (sms.length <= 160) return sms
  return sms.slice(0, 157).trimEnd() + "..."
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
 * Cost-optimised pipeline:
 *   1. Template engine (zero cost) — pre-written templates with slot-filling
 *   2. LLM fallback (gpt-4o-mini only) — when forceAI=true or template insufficient
 *
 * No analysis step. No QA step. Templates are pre-vetted.
 * LLM is only used when explicitly requested via forceAI flag.
 */
router.post("/", async (req, res) => {
  const params = req.body as GenerateParams & { forceAI?: boolean }

  if (!params.lead?.name || !params.strategy) {
    return res.status(400).json({ error: "lead.name and strategy are required" })
  }

  // ── Primary path: template engine (zero LLM cost) ──────────────────────────
  if (!params.forceAI) {
    const result = generateFromTemplate({
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
    return res.json({
      ...result,
      meta: { pipeline: "template", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }

  // ── Fallback: LLM generation (only when forceAI=true) ─────────────────────
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    const result = generateFromTemplate({
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
    return res.json({
      ...result,
      meta: { pipeline: "template-fallback", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }

  try {
    let modelUsed = "gpt-4o-mini"
    let result

    if (process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-haiku-4-5"
      result = sanitise(await generateMessageHaiku(params).catch(async () => {
        if (process.env.OPENAI_API_KEY) {
          modelUsed = "gpt-4o-mini"
          return generateMessage(params)
        }
        throw new Error("no-llm")
      }))
    } else {
      result = sanitise(await generateMessage(params))
    }

    const estimatedCostUsd = MODEL_COSTS[modelUsed] ?? 0
    res.json({ ...result, meta: { pipeline: "llm", model_used: modelUsed, estimated_cost_usd: estimatedCostUsd, analysis: null, qa: null } })
  } catch (err) {
    console.error("Generate error:", err)
    const result = generateFromTemplate({
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
    res.json({
      ...result,
      meta: { pipeline: "template-error-fallback", model_used: "template", estimated_cost_usd: 0, analysis: null, qa: null },
    })
  }
})

export default router
