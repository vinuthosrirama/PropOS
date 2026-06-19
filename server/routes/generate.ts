import { Router } from "express"
import { generateMessage, type GenerateParams } from "../lib/openai.js"
import { analyseLead, qaMessage, generateMessageClaude, generateMessageHaiku, MODEL_COSTS } from "../lib/claude.js"

const router = Router()

// Hard-cap SMS at 160 chars — keeps messages within a single segment
function clampSMS(sms: string): string {
  if (sms.length <= 160) return sms
  return sms.slice(0, 157).trimEnd() + "..."
}

// Strip em-dashes and double-hyphens from a single string
function cleanStr(s: string): string {
  return s.replace(/—|–/g, ",").replace(/--/g, ",")
}

// Strip em-dashes from all model output — enforced after every generation path
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
    const firstName = params.lead.name.split(" ")[0]
    return res.json({
      ...sanitise({
        sms: `Hi ${firstName}, ${params.agentName.split(" ")[0]} here. Thought of you for a new listing in ${params.agentSuburb ?? "your area"}. Worth a look? When suits a chat?`,
        email: {
          subject: `New listing for you, ${firstName}`,
          body: [
            `Hi ${firstName}, hope you are well.`,
            `I had a chance to review your situation and wanted to share a relevant update using our ${params.strategy} approach.`,
            `Would love to connect. Does a quick call this week work for you?`,
          ],
        },
      }),
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
      const fn = params.lead.name.split(" ")[0]
      const an = params.agentName.split(" ")[0]
      result = {
        sms: clampSMS(`Hi ${fn}, ${an} here. Worth a chat about your property search? When suits?`),
        email: {
          subject: `Checking in, ${fn}`,
          body: [
            `Hi ${fn}, hope you're well.`,
            `Wanted to touch base on your property search. Happy to help when the timing's right.`,
            `Cheers,\n${an}`,
          ],
        },
      }
    } else if (grade === "C" && process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-haiku-4-5"
      result = sanitise(await generateMessageHaiku(enrichedParams).catch(async () => {
        modelUsed = "gpt-4o-mini"
        return generateMessage(enrichedParams)
      }))
    } else if (grade === "A" && process.env.ANTHROPIC_API_KEY) {
      modelUsed = "claude-sonnet-4-5"
      result = sanitise(await generateMessageClaude(enrichedParams).catch(async () => {
        modelUsed = "gpt-4o-mini"
        return generateMessage(enrichedParams)
      }))
    } else {
      // Grade B (or fallback) — GPT-4o-mini primary, Claude fallback, then template
      result = sanitise(await generateMessage(enrichedParams).catch(async (openAiErr) => {
        console.warn("OpenAI failed:", openAiErr.message ?? openAiErr)
        if (process.env.ANTHROPIC_API_KEY) {
          modelUsed = "claude-sonnet-4-5"
          return generateMessageClaude(enrichedParams).catch(() => null)
        }
        return null
      }).then(r => {
        if (r) return r
        // Both AI services unavailable — use personalised template
        modelUsed = "template"
        const fn = enrichedParams.lead.name.split(" ")[0]
        const an = enrichedParams.agentName.split(" ")[0]
        const suburb = enrichedParams.agentSuburb ?? enrichedParams.lead.suburb ?? "your area"
        return {
          sms: clampSMS(`Hi ${fn}, ${an} here. ${enrichedParams.strategy === "Equity Play" ? `Your home has grown significantly since you bought. Worth a quick chat?` : `Thought of you given your search in ${suburb}. Worth a look?`} Cheers, ${an}`),
          email: {
            subject: `Checking in, ${fn}`,
            body: [
              `Hi ${fn}, hope you're well.`,
              enrichedParams.strategy === "Equity Play"
                ? `Your property has built up strong equity and I wanted to make sure you have the full picture of where things stand.`
                : `I have some updates relevant to your search in ${suburb} that I think you'd find useful.`,
              `Happy to connect for a quick chat whenever suits. No pressure at all.\n\nCheers,\n${an}`,
            ],
          },
        }
      }))
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
        // Auto-apply QA fixes — use cleanStr() so —, –, and -- are all stripped
        if (!qa.passed) {
          if (qa.revisedSMS)       result.sms = clampSMS(cleanStr(qa.revisedSMS))
          if (qa.revisedSubject)   result.email.subject = cleanStr(qa.revisedSubject)
          if (qa.revisedEmailBody) result.email.body = qa.revisedEmailBody.map(cleanStr)
        }
        // Always hard-clamp SMS even if QA passed
        result.sms = clampSMS(result.sms)
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
