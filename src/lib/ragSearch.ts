/**
 * Client-side RAG search helper.
 *
 * Sends a buyer question + SLM Q&A candidates to the server embedding endpoint.
 * Returns the best semantic match above the confidence threshold, or null.
 *
 * Usage (in DemoView / profile stage):
 *   const match = await ragMatchQA(buyerQuestion, slm.qa)
 *   if (match) show match.a as the answer; else fall through to /api/slm-answer LLM
 */

import { apiUrl } from "./api"

export interface QACandidate {
  q: string
  a: string
}

export interface RAGMatch extends QACandidate {
  score: number
}

/** Returns the best semantic Q&A match, or null if below confidence threshold. */
export async function ragMatchQA(
  question: string,
  candidates: QACandidate[],
): Promise<RAGMatch | null> {
  if (!question.trim() || !candidates.length) return null
  try {
    const res = await fetch(apiUrl("/api/rag/match-qa"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, candidates }),
    })
    if (!res.ok) return null
    const data = await res.json() as { match?: RAGMatch | null }
    return data.match ?? null
  } catch {
    return null
  }
}
