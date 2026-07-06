/**
 * Document engagement tracker hook.
 *
 * Tracks section view times, cursor position, text selections, and scroll depth.
 * Batches events and flushes every 5 seconds and on tab hide via sendBeacon.
 */

import { useRef, useEffect, useCallback } from "react"
import { apiUrl } from "./api"

// ── Types ──────────────────────────────────────────────────────────────────────

type DocEventType =
  | "open" | "section_enter" | "section_exit" | "scroll_depth"
  | "cursor_sample" | "text_select" | "tab_blur" | "tab_focus" | "session_end"
  | "print"

interface DocEvent {
  type:       DocEventType
  sectionId?: string
  data?:      Record<string, unknown>
  ts:         number
}

export interface DocTracker {
  sectionRef:  (sectionId: string) => (el: HTMLElement | null) => void
  onMouseMove: (e: { clientX: number; clientY: number }, sectionId: string) => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDocTracker(pitchId: string, pitchType: string): DocTracker {
  const sessionId      = useRef<string>(crypto.randomUUID())
  const events         = useRef<DocEvent[]>([])
  const sectionEls     = useRef<Map<string, HTMLElement>>(new Map())
  const activeSections = useRef<Map<string, number>>(new Map()) // sectionId → start timestamp
  const maxScroll      = useRef<number>(0)
  const lastMouse      = useRef<number>(0)
  const observer       = useRef<IntersectionObserver | null>(null)

  // ── Flush ──────────────────────────────────────────────────────────────────

  const flush = useCallback((asBeacon = false) => {
    if (!pitchId || events.current.length === 0) return

    const batch = {
      pitchId,
      pitchType,
      sessionId: sessionId.current,
      events: [...events.current],
    }
    events.current = []

    const url  = apiUrl("/api/doc-track")
    const body = JSON.stringify(batch)

    if (asBeacon) {
      // sendBeacon with text/plain avoids CORS preflight (simple request)
      navigator.sendBeacon(apiUrl("/api/doc-track/flush"), body)
    } else {
      fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {/* non-fatal */})
    }
  }, [pitchId, pitchType])

  // ── Push helper ───────────────────────────────────────────────────────────

  function push(ev: DocEvent) {
    events.current.push(ev)
  }

  // ── Section exit helper ───────────────────────────────────────────────────

  function recordSectionExit(sectionId: string) {
    const start = activeSections.current.get(sectionId)
    if (start == null) return
    activeSections.current.delete(sectionId)
    push({ type: "section_exit", sectionId, data: { duration_ms: Date.now() - start }, ts: Date.now() })
  }

  // ── Visibility change ──────────────────────────────────────────────────────

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        // Pause all active sections
        for (const [sectionId] of activeSections.current) {
          recordSectionExit(sectionId)
        }
        if (maxScroll.current > 0) {
          push({ type: "scroll_depth", data: { pct: maxScroll.current }, ts: Date.now() })
        }
        push({ type: "tab_blur", ts: Date.now() })
        flush(true) // sendBeacon — reliable on tab close
      } else {
        push({ type: "tab_focus", ts: Date.now() })
        // Re-detect visible sections on tab focus
        for (const [sectionId, el] of sectionEls.current) {
          const rect = el.getBoundingClientRect()
          const inView = rect.top < window.innerHeight * 0.7 && rect.bottom > 0
          if (inView && !activeSections.current.has(sectionId)) {
            activeSections.current.set(sectionId, Date.now())
            push({ type: "section_enter", sectionId, ts: Date.now() })
          }
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush])

  // ── Scroll tracking ───────────────────────────────────────────────────────

  useEffect(() => {
    function handleScroll() {
      const pct = Math.min(100, Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100,
      ))
      if (pct > maxScroll.current) maxScroll.current = pct
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // ── Text selection ────────────────────────────────────────────────────────

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout>
    function handleSelection() {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        const selected = window.getSelection()?.toString().trim()
        if (selected && selected.length > 2) {
          push({ type: "text_select", data: { text: selected.slice(0, 200) }, ts: Date.now() })
        }
      }, 500)
    }
    document.addEventListener("selectionchange", handleSelection)
    return () => {
      document.removeEventListener("selectionchange", handleSelection)
      clearTimeout(debounce)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── IntersectionObserver ──────────────────────────────────────────────────

  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const sectionId = entry.target.getAttribute("data-section")
        if (!sectionId) continue

        if (entry.isIntersecting && !activeSections.current.has(sectionId)) {
          activeSections.current.set(sectionId, Date.now())
          push({ type: "section_enter", sectionId, ts: Date.now() })
        } else if (!entry.isIntersecting && activeSections.current.has(sectionId)) {
          recordSectionExit(sectionId)
        }
      }
    }, { threshold: 0.3 })

    return () => {
      observer.current?.disconnect()
      observer.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Print / Save-PDF tracking ─────────────────────────────────────────────

  useEffect(() => {
    function handlePrint() {
      push({ type: "print", ts: Date.now() })
      flush()
    }
    window.addEventListener("beforeprint", handlePrint)
    return () => window.removeEventListener("beforeprint", handlePrint)
  }, [flush])

  // ── Auto-flush every 5 seconds ─────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      if (maxScroll.current > 0) {
        push({ type: "scroll_depth", data: { pct: maxScroll.current }, ts: Date.now() })
      }
      flush()
    }, 5000)
    return () => clearInterval(id)
  }, [flush])

  // ── Guard all flushes: never send batches with empty pitchId ─────────────

  // ── Fire "open" event once pitch ID is known ──────────────────────────────

  useEffect(() => {
    if (!pitchId) return // pitch data not yet loaded
    push({ type: "open", ts: Date.now() })
    flush() // send immediately so the agent gets the open notification fast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId])

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      for (const [sectionId] of activeSections.current) {
        recordSectionExit(sectionId)
      }
      push({ type: "session_end", ts: Date.now() })
      flush(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush])

  // ── Public API ────────────────────────────────────────────────────────────

  const sectionRef = useCallback((sectionId: string) => (el: HTMLElement | null) => {
    if (!el) {
      observer.current?.unobserve(sectionEls.current.get(sectionId) ?? el!)
      sectionEls.current.delete(sectionId)
      return
    }
    sectionEls.current.set(sectionId, el)
    el.setAttribute("data-section", sectionId)
    observer.current?.observe(el)
  }, [])

  const onMouseMove = useCallback((e: { clientX: number; clientY: number }, sectionId: string) => {
    const now = performance.now()
    if (now - lastMouse.current < 200) return
    lastMouse.current = now

    const el = sectionEls.current.get(sectionId)
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    push({
      type:      "cursor_sample",
      sectionId,
      data: {
        x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
        y: Math.round(((e.clientY - rect.top)  / rect.height) * 100),
      },
      ts: Date.now(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { sectionRef, onMouseMove }
}
