import { Router } from "express"

const router = Router()

/**
 * POST /api/slm-answer-batch
 *
 * Batches multiple unmatched buyer questions into a single LLM call.
 * Much cheaper than N separate /api/slm-answer requests.
 *
 * Body: { questions: string[], slm: Record<string, unknown>, propertyAddress: string }
 * Returns: { answers: Array<{ question: string; answer: string | null; category: string }> }
 */
router.post("/", async (req, res) => {
  const { questions, slm, propertyAddress } = req.body as {
    questions?: string[]
    slm?: Record<string, unknown>
    propertyAddress?: string
  }

  if (!questions || !Array.isArray(questions) || !slm) {
    return res.status(400).json({ error: "questions (array) and slm are required" })
  }

  const validQs = questions.filter(q => typeof q === "string" && q.trim())
  if (validQs.length === 0) {
    return res.json({ answers: [] })
  }

  const hasOpenAI    = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

  if (!hasOpenAI && !hasAnthropic) {
    return res.json({ answers: validQs.map(q => ({ question: q, answer: null, category: "general" })) })
  }

  // Build SLM text block — skip nested objects and empty values
  const slmLines: string[] = []
  for (const [k, v] of Object.entries(slm)) {
    if (k === "qa" || k === "propertyId" || typeof v === "object" || v === null) continue
    const str = String(v).trim()
    if (!str || str === "TBD" || str === "false") continue
    slmLines.push(`${k}: ${str}`)
  }

  const numberedQs = validQs.map((q, i) => `${i + 1}. ${q}`).join("\n")

  const systemPrompt = `You are a real estate assistant with detailed data for ${propertyAddress ?? "this property"}. Answer each question in 1-2 sentences maximum. Be specific — lead with the number or fact. Use ONLY the property data provided. Do not infer or estimate. If a field is missing or insufficient, respond with exactly: "Confirm at inspection." No em-dashes (—). No marketing language. No hedging phrases like "it appears" or "it seems".`

  const userPrompt = `Property data:\n${slmLines.join("\n")}\n\nBuyer questions:\n${numberedQs}\n\nRespond ONLY with valid JSON array, no markdown:\n[{"q":1,"answer":"..."},{"q":2,"answer":"..."},...]`

  try {
    let rawText = ""

    if (hasOpenAI) {
      const { default: OpenAI } = await import("openai")
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.2,
      })
      rawText = completion.choices[0]?.message?.content?.trim() ?? "[]"
    } else {
      // Anthropic fallback
      const Anthropic = (await import("@anthropic-ai/sdk")).default
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      })
      const block = msg.content[0]
      rawText = block.type === "text" ? block.text.trim() : "[]"
    }

    // Parse JSON array of { q: number, answer: string }
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned) as Array<{ q: number; answer: string }>

    const answers = validQs.map((question, idx) => {
      const match = parsed.find(p => p.q === idx + 1)
      return {
        question,
        answer: match?.answer?.trim() ?? null,
        category: "llm",
      }
    })

    return res.json({ answers })
  } catch (err) {
    console.error("[slm-answer-batch] error:", err)
    return res.json({ answers: validQs.map(q => ({ question: q, answer: null, category: "general" })) })
  }
})

export default router
