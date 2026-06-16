/**
 * Shared LLM utility — imported by both claude.ts and openai.ts to avoid duplication.
 */

const LLM_TIMEOUT_MS = 30_000

/**
 * Wraps an LLM SDK call with a 30-second AbortController timeout.
 * If the call hangs, the Promise rejects so the caller falls through to its
 * template fallback instead of waiting forever.
 */
export function withLLMTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  return fn(controller.signal).finally(() => clearTimeout(timer))
}
