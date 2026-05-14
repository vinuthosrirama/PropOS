import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { analyseLead, qaMessage, generateMessageClaude } from "../lib/claude.js"

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

    // ── Step 2: AddVantage AI writes the message (Claude fallback if OpenAI fails) ─
    let result = await generateMessage(enrichedParams).catch(async (openAiErr) => {
      console.warn("OpenAI failed, falling back to Claude:", openAiErr)
      if (!process.env.ANTHROPIC_API_KEY) throw openAiErr
      return generateMessageClaude(enrichedParams)
    })

    // ── Step 3: Claude Sonnet QA (optional) ───────────────────────────────────
    let qa = null
    if (process.env.ANTHROPIC_API_KEY && !params.skipQA) {
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

    res.json({ ...result, meta: { pipeline: "full", analysis, qa } })
  } catch (err) {
    console.error("Generate error:", err)
    res.status(500).json({ error: "Generation failed" })
  }
})

export default router
