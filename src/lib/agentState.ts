import { authFetch } from "./authFetch"
import { apiUrl } from "./api"

/**
 * Generic per-agent persistence — backs settings/blobs that previously lived
 * only in localStorage (and were lost on a different browser/device) with
 * /api/agent-state. localStorage is kept as an instant-load cache and as the
 * fallback if the request fails.
 */

export async function loadAgentState<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await authFetch(apiUrl(`/api/agent-state/${key}`))
    const data = (await res.json()) as { value?: T | null }
    if (data.value !== null && data.value !== undefined) return data.value
  } catch {
    // fall through to fallback (e.g. localStorage-derived default)
  }
  return fallback
}

export function saveAgentState(key: string, value: unknown): void {
  authFetch(apiUrl(`/api/agent-state/${key}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  }).catch(() => { /* non-fatal — localStorage already has the value */ })
}
