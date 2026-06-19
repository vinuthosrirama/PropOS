/**
 * authFetch — drop-in replacement for fetch() that automatically injects
 * the Authorization: Bearer header from localStorage.
 *
 * Also handles 401 (token expired) by attempting a silent refresh, then
 * retrying the original request once.
 */

const TOKEN_KEY = "propos_access_token"

// Prevent concurrent/rapid demo-token calls — one attempt per 30s max
let demoTokenPromise: Promise<string | null> | null = null
let demoTokenLastAttempt = 0
const DEMO_TOKEN_COOLDOWN_MS = 30_000

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method:      "POST",
      credentials: "include",  // sends the httpOnly refresh cookie
    })
    if (!res.ok) return null
    const data = await res.json() as { accessToken?: string }
    if (data.accessToken) {
      setAccessToken(data.accessToken)
      return data.accessToken
    }
    return null
  } catch {
    return null
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers, credentials: "include" })

  // If 401 and we haven't retried yet, try refreshing the token
  if (res.status === 401 && !retried) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      return authFetch(input, init, true)
    }
    // Refresh cookie not available (demo/guest session) — try the public demo-token
    // endpoint as a fallback so Quick Access sessions survive server restarts and
    // token expiry without kicking the user back to the login screen.
    // Debounced: at most one call per 30s to avoid flooding when multiple pollers
    // all hit 401 simultaneously.
    const now = Date.now()
    if (now - demoTokenLastAttempt > DEMO_TOKEN_COOLDOWN_MS) {
      demoTokenLastAttempt = now
      demoTokenPromise = fetch("/api/auth/demo-token", { method: "POST" })
        .then(async (demoRes) => {
          if (!demoRes.ok) return null
          const data = await demoRes.json() as { accessToken?: string }
          return data.accessToken ?? null
        })
        .catch(() => null)
        .finally(() => { demoTokenPromise = null })
    }
    if (demoTokenPromise) {
      const newDemoToken = await demoTokenPromise
      if (newDemoToken) {
        setAccessToken(newDemoToken)
        return authFetch(input, init, true)
      }
    }
    // Only a real authenticated session counts as "expired" — guests were never
    // logged in via JWT, so a 401 on a protected endpoint is expected and normal.
    if (token) {
      clearAccessToken()
      window.dispatchEvent(new CustomEvent("propos:logout"))
    }
  }

  return res
}
