/**
 * SLM Embedding Cache
 *
 * Generates and caches text-embedding-3-small vectors for SLM Q&A pairs and
 * property facts. Used by the RAG match endpoint to do semantic search against
 * a buyer's question — much faster and cheaper than a full LLM call.
 *
 * Cache is in-memory (Map keyed by text). Clears on server restart, which is
 * fine — re-embedding the same small corpus takes <100ms per property.
 */

import OpenAI from "openai"

const EMBEDDING_MODEL = "text-embedding-3-small"

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// In-memory embedding cache: text → unit-normalised float32 vector
const _cache = new Map<string, number[]>()

/** Fetch embedding for a single string. Returns cached result if available. */
export async function embed(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase()
  if (_cache.has(key)) return _cache.get(key)!

  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: key,
    encoding_format: "float",
  })

  const vec = unitNorm(res.data[0].embedding)
  _cache.set(key, vec)
  return vec
}

/** Batch-embed multiple strings. Skips already-cached. */
export async function embedBatch(texts: string[]): Promise<Map<string, number[]>> {
  const unique = [...new Set(texts.map(t => t.trim().toLowerCase()))]
  const missing = unique.filter(t => !_cache.has(t))

  if (missing.length > 0) {
    const res = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: missing,
      encoding_format: "float",
    })
    res.data.forEach((item, i) => {
      const vec = unitNorm(item.embedding)
      _cache.set(missing[i], vec)
    })
  }

  const result = new Map<string, number[]>()
  unique.forEach(t => { const v = _cache.get(t); if (v) result.set(t, v) })
  return result
}

/** Cosine similarity of two unit-normalised vectors (dot product). */
export function cosineSim(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return Math.min(1, Math.max(-1, sum))
}

function unitNorm(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return mag > 0 ? vec.map(v => v / mag) : vec
}

export function cacheSize(): number {
  return _cache.size
}
