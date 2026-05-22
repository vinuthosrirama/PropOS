import { Router } from "express"

const router = Router()

/**
 * POST /api/slm-answer
 *
 * Called when the client-side SLM keyword matcher found no Q&A entry for a
 * buyer's question.  We send the full SLM data for the active listing + the
 * question to the LLM, which reads the SLM fields and synthesises a factual,
 * concise answer.
 *
 * Body: { question: string, slm: Record<string, unknown>, propertyAddress: string }
 * Returns: { answer: string | null, category: string }
 */
router.post("/", async (req, res) => {
  const { question, slm, propertyAddress } = req.body as {
    question?: string
    slm?: Record<string, unknown>
    propertyAddress?: string
  }

  if (!question || !slm) {
    return res.status(400).json({ error: "question and slm are required" })
  }

  const hasOpenAI    = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

  if (!hasOpenAI && !hasAnthropic) {
    return res.json({ answer: null, category: "general" })
  }

  // Build a concise SLM text block — skip nested objects (qa[]) and empty/TBD values
  const slmLines: string[] = []
  for (const [k, v] of Object.entries(slm)) {
    if (k === "qa" || k === "propertyId" || typeof v === "object" || v === null) continue
    const str = String(v).trim()
    if (!str || str === "TBD" || str === "false") continue
    slmLines.push(`${k}: ${str}`)
  }

  const systemPrompt = `You are a real estate assistant with detailed data for ${propertyAddress ?? "this property"}. \
Rules: \
- Answer in 1–2 sentences maximum. Be specific — lead with the number or fact. \
- Use ONLY the property data provided. Do not infer or estimate. \
- If a field is missing or insufficient, respond with exactly: "Confirm at inspection." \
- No em-dashes (—). No marketing language. No hedging phrases like "it appears" or "it seems". \
- If the question asks for a comparison (e.g. "is this bigger than X?"), state the actual value and let the buyer judge.`

  const userPrompt = `Property data:\n${slmLines.join("\n")}\n\nBuyer asked: "${question}"\n\nProvide a factual answer:`

  try {
    if (hasOpenAI) {
      const { default: OpenAI } = await import("openai")
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.2,
      })
      const answer = completion.choices[0]?.message?.content?.trim() ?? null
      return res.json({ answer, category: "llm" })
    }

    // Anthropic fallback
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })
    const block = msg.content[0]
    const answer = block.type === "text" ? block.text.trim() : null
    return res.json({ answer, category: "llm" })

  } catch (err) {
    console.error("[slm-answer] LLM error:", err)
    return res.json({ answer: null, category: "general" })
  }
})

export default router
