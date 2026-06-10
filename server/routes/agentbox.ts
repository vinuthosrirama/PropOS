import { Router } from "express"

const router = Router()

const AGENTBOX_BASE = "https://api.agentboxcrm.com.au"
const API_VERSION   = "2"

/**
 * POST /api/agentbox/test
 *
 * Server-side proxy for the AgentBox connection test. The browser cannot call
 * api.agentboxcrm.com.au directly (no CORS headers for our origin), and
 * proxying also keeps the API key out of third-party network calls.
 *
 * Body: { clientId: string, apiKey: string }
 * Returns: { ok: true, contactCount } | { ok: false, error }
 */
router.post("/test", async (req, res) => {
  const clientId = String(req.body?.clientId ?? "").trim()
  const apiKey   = String(req.body?.apiKey   ?? "").trim()
  if (!clientId || !apiKey) {
    return res.status(400).json({ ok: false, error: "clientId and apiKey are required" })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const upstream = await fetch(
      `${AGENTBOX_BASE}/contacts?limit=1&version=${API_VERSION}`,
      {
        headers: {
          "X-Client-ID": clientId,
          "X-API-Key":   apiKey,
          "Accept":      "application/json",
        },
        signal: ctrl.signal,
      },
    )
    clearTimeout(timer)

    if (!upstream.ok) {
      const status = upstream.status
      const error = status === 401 || status === 403
        ? "Invalid API key or Client ID"
        : `AgentBox returned HTTP ${status}`
      return res.status(200).json({ ok: false, error })
    }

    const data = await upstream.json() as {
      response?: { items?: string; totalItems?: string; contacts?: unknown[] }
    }
    // AgentBox wraps results as { response: { totalItems, contacts: [...] } }
    const contactCount =
      Number(data?.response?.totalItems) ||
      (Array.isArray(data?.response?.contacts) ? data.response.contacts.length : null)

    return res.json({ ok: true, contactCount })
  } catch (err) {
    const aborted = (err as Error).name === "AbortError"
    return res.status(200).json({
      ok: false,
      error: aborted ? "AgentBox did not respond within 10s" : (err as Error).message,
    })
  }
})

export default router
