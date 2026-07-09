/**
 * Shared logic for the Document Intelligence demo Pages Functions.
 * Score model mirrors PropOS server/routes/doc-track.ts computeScoreDelta.
 */

export interface DocEvent {
  type: string
  sectionId?: string
  data?: Record<string, unknown>
  ts: number
}

export interface BatchPayload {
  pitchId: string
  pitchType: string
  sessionId: string
  events: DocEvent[]
}

export interface StoredBatch extends BatchPayload {
  receivedAt: number
  ua: string
  ip: string
  city: string
  country: string
}

export interface Env {
  EVENTS: KVNamespace
}

export const TOTAL_SECTIONS = 5 // cover-note, price-guide, comparable-sales, campaign, agent-card

export function computeScore(
  totalTimeS: number,
  sectionsViewed: string[],
  pageTimes: Record<string, number>,
  textSelections: string[],
  printed: boolean,
): number {
  let score = 0
  const sectionPct = sectionsViewed.length / TOTAL_SECTIONS

  if (totalTimeS > 30) score += 1
  if (totalTimeS > 120) score += 2
  if (totalTimeS > 300) score += 3

  if (sectionPct > 0.5) score += 2
  if (sectionPct > 0.8) score += 3
  if (sectionPct >= 1) score += 4

  if (sectionsViewed.includes("price-guide")) score += 3
  if ((pageTimes["price-guide"] ?? 0) > 30) score += 4
  if ((pageTimes["comparable-sales"] ?? 0) > 30) score += 3

  if (textSelections.length > 0) score += 2
  if (printed) score += 4

  return score
}

export async function storeBatch(request: Request, env: Env): Promise<Response> {
  let batch: BatchPayload
  try {
    batch = await request.json() as BatchPayload
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }
  if (!batch?.pitchId || !batch.sessionId || !Array.isArray(batch.events) || batch.events.length === 0) {
    return json({ error: "Invalid payload" }, 400)
  }
  if (batch.events.length > 500) batch.events = batch.events.slice(0, 500)

  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {}
  const stored: StoredBatch = {
    pitchId: String(batch.pitchId).slice(0, 64),
    pitchType: String(batch.pitchType ?? "price_update").slice(0, 32),
    sessionId: String(batch.sessionId).slice(0, 64),
    events: batch.events,
    receivedAt: Date.now(),
    ua: (request.headers.get("user-agent") ?? "").slice(0, 256),
    ip: request.headers.get("cf-connecting-ip") ?? "",
    city: String(cf.city ?? ""),
    country: String(cf.country ?? ""),
  }

  const key = `batch:${stored.sessionId}:${String(stored.receivedAt).padStart(15, "0")}:${Math.random().toString(36).slice(2, 8)}`
  await env.EVENTS.put(key, JSON.stringify(stored), { expirationTtl: 60 * 60 * 24 * 30 })
  return json({ ok: true })
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
