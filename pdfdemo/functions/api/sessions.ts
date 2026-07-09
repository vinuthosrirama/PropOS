import { computeScore, json, TOTAL_SECTIONS, type Env, type StoredBatch } from "./_shared"

interface SessionSummary {
  sessionId: string
  pitchId: string
  openedAt: number
  lastActiveAt: number
  totalTimeS: number
  sectionsViewed: string[]
  completionPct: number
  scrollDepthPct: number
  pageTimes: Record<string, number>
  cursorSamples: Array<{ section: string; x: number; y: number }>
  textSelections: string[]
  printed: boolean
  returnFocusCount: number
  score: number
  device: string
  location: string
}

function deviceFromUa(ua: string): string {
  if (/iPhone|Android.*Mobile/i.test(ua)) return "Mobile"
  if (/iPad|Tablet/i.test(ua)) return "Tablet"
  if (/Macintosh/i.test(ua)) return "Mac"
  if (/Windows/i.test(ua)) return "Windows"
  return "Desktop"
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const sessions = new Map<string, SessionSummary>()

  let cursor: string | undefined
  do {
    const page = await env.EVENTS.list({ prefix: "batch:", cursor, limit: 1000 })
    cursor = page.list_complete ? undefined : page.cursor

    for (const key of page.keys) {
      const raw = await env.EVENTS.get(key.name)
      if (!raw) continue
      let batch: StoredBatch
      try { batch = JSON.parse(raw) as StoredBatch } catch { continue }

      let s = sessions.get(batch.sessionId)
      if (!s) {
        s = {
          sessionId: batch.sessionId,
          pitchId: batch.pitchId,
          openedAt: batch.receivedAt,
          lastActiveAt: batch.receivedAt,
          totalTimeS: 0,
          sectionsViewed: [],
          completionPct: 0,
          scrollDepthPct: 0,
          pageTimes: {},
          cursorSamples: [],
          textSelections: [],
          printed: false,
          returnFocusCount: 0,
          score: 0,
          device: deviceFromUa(batch.ua),
          location: [batch.city, batch.country].filter(Boolean).join(", "),
        }
        sessions.set(batch.sessionId, s)
      }
      s.openedAt = Math.min(s.openedAt, batch.receivedAt)
      s.lastActiveAt = Math.max(s.lastActiveAt, batch.receivedAt)

      for (const ev of batch.events) {
        if (ev.type === "section_exit" && ev.sectionId && ev.data?.duration_ms) {
          const dS = Math.max(0, Math.round(Number(ev.data.duration_ms) / 1000))
          s.totalTimeS += dS
          s.pageTimes[ev.sectionId] = (s.pageTimes[ev.sectionId] ?? 0) + dS
        }
        if (ev.type === "section_enter" && ev.sectionId && !s.sectionsViewed.includes(ev.sectionId)) {
          s.sectionsViewed.push(ev.sectionId)
        }
        if (ev.type === "scroll_depth" && ev.data?.pct) {
          s.scrollDepthPct = Math.max(s.scrollDepthPct, Math.min(100, Number(ev.data.pct)))
        }
        if (ev.type === "cursor_sample" && ev.sectionId && ev.data?.x != null && ev.data?.y != null) {
          if (s.cursorSamples.length < 800) {
            s.cursorSamples.push({ section: ev.sectionId, x: Number(ev.data.x), y: Number(ev.data.y) })
          }
        }
        if (ev.type === "text_select" && ev.data?.text) {
          const t = String(ev.data.text).trim().slice(0, 200)
          if (t.length > 1 && !s.textSelections.includes(t)) s.textSelections.push(t)
        }
        if (ev.type === "print") s.printed = true
        if (ev.type === "tab_focus") s.returnFocusCount += 1
      }
    }
  } while (cursor)

  const rows = [...sessions.values()]
  for (const s of rows) {
    s.completionPct = Math.min(100, Math.round((s.sectionsViewed.length / TOTAL_SECTIONS) * 100))
    s.score = computeScore(s.totalTimeS, s.sectionsViewed, s.pageTimes, s.textSelections, s.printed)
  }
  rows.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  return json({ sessions: rows.slice(0, 50) })
}

// DELETE clears all demo data, so each prospect demo starts clean.
export const onRequestDelete: PagesFunction<Env> = async ({ env }) => {
  let cursor: string | undefined
  let deleted = 0
  do {
    const page = await env.EVENTS.list({ prefix: "batch:", cursor, limit: 1000 })
    cursor = page.list_complete ? undefined : page.cursor
    for (const key of page.keys) {
      await env.EVENTS.delete(key.name)
      deleted += 1
    }
  } while (cursor)
  return json({ ok: true, deleted })
}
