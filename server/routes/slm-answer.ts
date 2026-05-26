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

  const systemPrompt = `You are a knowledgeable real estate agent answering a buyer's question about ${propertyAddress ?? "this property"}. The buyer asked this question at a different property — you are now answering it in the context of this new listing.

Rules:
- Answer in 1 sentence only. Lead directly with the number, fact, or "Yes/No".
- Use ONLY the property data provided. Never infer, estimate, or guess.
- If the data doesn't contain enough to answer, respond with exactly: "Confirm at inspection."
- No em-dashes (—). No filler phrases ("it appears", "based on", "it seems", "please note").
- Be direct and conversational — like a knowledgeable agent on a phone call, not a report writer.
- If the question is about proximity (e.g. "is there a school nearby?"), only answer if the data explicitly states it.`

  const userPrompt = `Property data for ${propertyAddress}:\n${slmLines.join("\n")}\n\nBuyer's question: "${question}"\n\nAnswer (1 sentence, facts only):`

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
