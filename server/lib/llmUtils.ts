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

/**
 * Retries a transient-failure-prone LLM call once before giving up.
 *
 * A single dropped connection (observed locally: node-fetch + gzip
 * "Premature close" on an otherwise-healthy OpenAI account) previously meant
 * one network hiccup silently fell all the way through to the generic
 * hardcoded template, throwing away the trained voice for the whole message.
 * One retry with a short backoff turns a transient blip into a normal
 * successful call instead of a visible quality drop.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 600): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}
