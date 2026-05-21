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

  const systemPrompt = `You are a knowledgeable real estate assistant for PropOS. \
You have access to detailed property data for the listing at ${propertyAddress ?? "the property"}. \
Answer the buyer's question factually and concisely (1–3 sentences) using ONLY the data provided. \
If the data does not contain enough information to answer, say "Confirm at inspection." \
Never use em-dashes (—). Use plain language, not marketing speak.`

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
