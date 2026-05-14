import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { analyseLead, qaMessage, generateMessageClaude, generateMessageHaiku, MODEL_COSTS } from "../lib/claude.js"

const router = Router()

/**
 * POST /api/generate
 *
 * Pipeline (when both API keys present):
 *   1. Claude Haiku   → analyse lead, pick best strategy + CTA
 *   2. AddVantage AI    → write SMS + email using CTA as anchor
 *   3. Claude Sonnet  → QA review, auto-fix if issues found
 *
 * Graceful fallback:
 *   - No OPENAI_API_KEY  → template strings
 *   - No ANTHROPIC_KEY   → skip analysis + QA, AddVantage AI only
 */
router.post("/", async (req, res) => {
  const params = req.body as GenerateParams & { skipQA?: boolean }

  if (!params.lead?.name || !params.strategy) {
    return res.status(400).json({ error: "lead.name and strategy are required" })
  }

  // ── No OpenAI key: return template ──────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      sms: `Hi ${params.lead.name}, ${params.strategy} update for ${params.agentSuburb ?? "your area"} — worth a chat? When suits?`,
      email: {
        subject: `${params.strategy} — ${params.lead.name}`,
        body: [
          `Hi ${params.lead.name}, hope you are well.`,
          `I had a chance to review your situation and wanted to share a relevant update using our ${params.strategy} approach.`,
          `Would love to connect — does a quick call this week work for you?`,
        ],
      },
      meta: { pipeline: "template", analysis: null, qa: null },
    })
  }

  try {
    // ── Step 1: Claude Haiku analysis (optional, skip if no Anthropic key) ───
    let analysis = null
    let enrichedParams = { ...params }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        analysis = await analyseLead({
          name: params.lead.name,
          budget: params.lead.budget,
          timeline: params.lead.timeline,
          persona: params.lead.persona,
          notes: params.lead.notes,
          transcript: params.lead.transcript,
          questions: params.lead.questions,
        })
        // Inject Claude's recommended CTA into the lead notes for AddVantage AI
        enrichedParams = {
          ...params,
          lead: {
            ...params.lead,
            notes: `${params.lead.notes}\n[Recommended hook: ${analysis.callToAction}]`,
          },
        }
      } catch (e) {
        console.warn("Claude analysis skipped:", e)
      }
    }

    // ── Step 2: Route to model by lead grade ──────────────────────────────────
    // A → Claude Sonnet (best quality), B → GPT-4o-mini, C → Haiku, D → template
    const grade = analysis?.grade ?? "B"
    let modelUsed = "gpt-4o-mini"
    let result

    if (grade === "D") {
      modelUsed = "template"
      result = {
        sms: `Hi ${params.lead.name.split(" ")[0]}, ${params.agentName.split(" ")[0]} here. Worth a chat about your property search? When suits?`,
        email: {
          subject: `Checking in — ${params.lead.name.split(" ")[0]}`,
          body: [
            `Hi ${params.lead.name.split(" ")[0]}, hope you're well.`,
            `Wanted to touch base on your property search. Happy to help when the timing's right.`,
            `Cheers,\n${params.agentName.split(" ")[0]}`,
          ],
        },
      }
    } else if (grade === "C" && process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-haiku-4-5"
      result = await generateMessageHaiku(enrichedParams).catch(async () => {
        modelUsed = "gpt-4o-mini"
        return generateMessage(enrichedParams)
      })
    } else if (grade === "A" && process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-sonnet-4-5"
      result = await generateMessageClaude(enrichedParams).catch(async () => {
        modelUsed = "gpt-4o-mini"
        return generateMessage(enrichedParams)
      })
    } else {
      // Grade B (or fallback) — GPT-4o-mini primary
      result = await generateMessage(enrichedParams).catch(async (openAiErr) => {
        console.warn("OpenAI failed, falling back to Claude:", openAiErr)
        if (!process.env.ANTHROPIC_API_KEY) throw openAiErr
        modelUsed = "claude-sonnet-4-5"
        return generateMessageClaude(enrichedParams)
      })
    }

    // ── Step 3: Claude Sonnet QA — only for Grade A/B leads (skip C/D) ────────
    let qa = null
    if (process.env.ANTHROPIC_API_KEY && !params.skipQA && (grade === "A" || grade === "B")) {
      try {
        qa = await qaMessage({
          agentName: params.agentName,
          leadName: params.lead.name,
          sms: result.sms,
          emailSubject: result.email.subject,
          emailBody: result.email.body,
          leadNotes: params.lead.notes,
          leadTranscript: params.lead.transcript,
          leadQuestions: params.lead.questions,
          slmContext: params.slmContext,
        })
        // Auto-apply QA fixes
        if (!qa.passed) {
          if (qa.revisedSMS) result.sms = qa.revisedSMS
          if (qa.revisedSubject) result.email.subject = qa.revisedSubject
          if (qa.revisedEmailBody) result.email.body = qa.revisedEmailBody
        }
      } catch (e) {
        console.warn("Claude QA skipped:", e)
      }
    }

    const estimatedCostUsd = MODEL_COSTS[modelUsed] ?? 0
    res.json({ ...result, meta: { pipeline: "full", model_used: modelUsed, estimated_cost_usd: estimatedCostUsd, analysis, qa } })
  } catch (err) {
    console.error("Generate error:", err)
    res.status(500).json({ error: "Generation failed" })
  }
})

export default router
