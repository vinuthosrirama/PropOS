/**
 * POST /api/rag/match-qa
 *
 * Semantic Q&A matcher using text-embedding-3-small + cosine similarity.
 * The client sends a buyer question + an array of SLM Q&A candidates.
 * We embed everything and return the closest semantic match.
 *
 * Designed as a fast, cheap pre-filter BEFORE the full LLM slm-answer fallback:
 *   buyer question → RAG match (< 50ms cached) → if score > threshold, done
 *   otherwise → /api/slm-answer (LLM, ~500ms, more expensive)
 *
 * Body:
 *   { question: string, candidates: Array<{ q: string; a: string }> }
 * Response:
 *   { match: { q: string; a: string; score: number } | null }
 */

import { Router } from "express"
import { embed, embedBatch, cosineSim, cacheSize } from "../lib/slmEmbeddings.js"

const router = Router()

const CONFIDENCE_THRESHOLD = 0.72  // cosine similarity cutoff for a "confident" match

router.post("/match-qa", async (req, res) => {
  const { question, candidates } = req.body as {
    question?: string
    candidates?: Array<{ q: string; a: string }>
  }

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "question is required" })
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.json({ match: null })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ match: null, reason: "no-key" })
  }

  try {
    // Embed all candidate questions + the buyer question in one batch request
    const candidateTexts = candidates.map(c => c.q)
    const allTexts = [question, ...candidateTexts]

    await embedBatch(allTexts)

    const queryVec = await embed(question)

    let bestScore = -1
    let bestIdx   = -1

    for (let i = 0; i < candidates.length; i++) {
      const candVec = await embed(candidates[i].q)
      const score   = cosineSim(queryVec, candVec)
      if (score > bestScore) {
        bestScore = score
        bestIdx   = i
      }
    }

    if (bestScore >= CONFIDENCE_THRESHOLD && bestIdx >= 0) {
      return res.json({
        match: { ...candidates[bestIdx], score: bestScore },
        cacheSize: cacheSize(),
      })
    }

    return res.json({ match: null, bestScore, cacheSize: cacheSize() })
  } catch (err) {
    console.error("[rag] embed error:", err)
    return res.json({ match: null, reason: "embed-error" })
  }
})

export default router
