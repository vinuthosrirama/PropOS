/**
 * useVoiceMemo — reusable Web Speech API hook
 *
 * Shared by:
 *   - VoiceLearning voice recorder tab
 *   - Lead card voice notes (Intelligence view)
 *   - Open Home field mode attendee entry
 *   - Vendor Report voice dictation
 *
 * Free — uses browser-native SpeechRecognition (Google cloud in Chrome/Edge,
 * Apple on-device in Safari). No API key. No rate limit. No cost.
 *
 * Usage:
 *   const { phase, transcript, liveTranscript, seconds, start, stop, reset } = useVoiceMemo()
 *
 *   phase === "idle"      → show mic button
 *   phase === "recording" → show waveform + liveTranscript + stop button
 *   phase === "done"      → show transcript (editable), confirm/reset buttons
 */

import { useState, useRef, useEffect, useCallback } from "react"

// ── Web Speech API types (not in TS DOM lib) ──────────────────────────────────
interface SpeechRecognitionItem  { transcript: string }
interface SpeechRecognitionResult { isFinal: boolean; [i: number]: SpeechRecognitionItem }
interface SpeechRecognitionEvent  {
  resultIndex: number
  results: SpeechRecognitionResult[] & { length: number }
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance
}
interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

// Extend Window type locally to avoid `as any`
interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const getSR = (): SpeechRecognitionConstructor | null =>
  typeof window === "undefined"
    ? null
    : (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition ?? null

// ── Hook ──────────────────────────────────────────────────────────────────────

export type VoiceMemoPhase = "idle" | "recording" | "done"

export interface UseVoiceMemoOptions {
  lang?: string                   // default "en-AU"
  onTranscript?: (text: string) => void  // called when recording stops
}

export interface UseVoiceMemoResult {
  phase:           VoiceMemoPhase
  liveTranscript:  string         // updates in real time while recording
  transcript:      string         // final (editable) text after stop
  seconds:         number         // elapsed recording time
  supported:       boolean        // false if browser lacks SpeechRecognition
  permError:       string | null  // set if microphone was denied
  loading:         boolean        // true while getUserMedia is in flight
  setTranscript:   (t: string) => void  // allow user to edit after stop
  start:           () => Promise<void>
  stop:            () => void
  reset:           () => void
}

export function useVoiceMemo(options: UseVoiceMemoOptions = {}): UseVoiceMemoResult {
  const { lang = "en-AU", onTranscript } = options

  const [phase,          setPhase]          = useState<VoiceMemoPhase>("idle")
  const [liveTranscript, setLiveTranscript] = useState("")
  const [transcript,     setTranscript]     = useState("")
  const [seconds,        setSeconds]        = useState(0)
  const [loading,        setLoading]        = useState(false)
  const [permError,      setPermError]      = useState<string | null>(null)

  const recogRef      = useRef<SpeechRecognitionInstance | null>(null)
  const committedRef  = useRef("")
  const isStoppingRef = useRef(false)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  const supported = getSR() !== null

  // Permission pre-check on mount
  useEffect(() => {
    if (!navigator.permissions) return
    navigator.permissions.query({ name: "microphone" as PermissionName })
      .then(status => {
        if (status.state === "denied") {
          setPermError("Microphone access is blocked. Allow it in your browser settings.")
        }
        status.onchange = () => {
          setPermError(status.state === "denied"
            ? "Microphone access is blocked. Allow it in your browser settings."
            : null)
        }
      })
      .catch(() => {})
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      try { recogRef.current?.abort() } catch {}
    }
  }, [])

  const start = useCallback(async () => {
    setPermError(null)
    setLiveTranscript("")
    setTranscript("")
    committedRef.current  = ""
    isStoppingRef.current = false

    // Request mic
    setLoading(true)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch {
      setLoading(false)
      setPermError("Microphone access was denied. Allow it in your browser settings and try again.")
      return
    }
    setLoading(false)

    // Start SpeechRecognition
    const SR = getSR()
    if (SR) {
      const recog = new SR()
      recog.continuous      = true
      recog.interimResults  = true
      recog.lang            = lang
      recog.maxAlternatives = 1

      recog.onresult = (e: SpeechRecognitionEvent) => {
        let interim = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript
          if (e.results[i].isFinal) committedRef.current += text + " "
          else interim = text
        }
        setLiveTranscript(committedRef.current + interim)
      }

      recog.onerror = (e: { error: string }) => {
        if (e.error !== "aborted" && e.error !== "no-speech") {
          console.warn("SpeechRecognition error:", e.error)
        }
      }

      // Auto-restart on Chrome's 30–60s cutoff
      recog.onend = () => {
        if (!isStoppingRef.current) {
          try { recog.start() } catch {}
        }
      }

      try { recog.start() } catch {}
      recogRef.current = recog
    }

    // Timer
    setSeconds(0)
    setPhase("recording")
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [lang])

  const stop = useCallback(() => {
    isStoppingRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    try { recogRef.current?.stop() } catch {}

    const final = committedRef.current.trim()
    setTranscript(final)
    setPhase("done")
    if (onTranscript) onTranscript(final)
  }, [onTranscript])

  const reset = useCallback(() => {
    isStoppingRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    try { recogRef.current?.abort() } catch {}

    setPhase("idle")
    setLiveTranscript("")
    setTranscript("")
    setSeconds(0)
    setPermError(null)
    committedRef.current = ""
  }, [])

  return {
    phase, liveTranscript, transcript, seconds,
    supported, permError, loading,
    setTranscript, start, stop, reset,
  }
}

// ── Attendee field parser ─────────────────────────────────────────────────────
/**
 * Parses a spoken attendee description into lead form fields.
 * Works offline — pure regex, no AI call needed.
 *
 * Example input:
 *   "Sarah Mitchell, 0412 345 678, sarah@gmail.com,
 *    budget around 850 to 900, needs 4 bedrooms, interested in Berwick"
 *
 * Usage (Open Home field mode):
 *   const fields = parseSpokenAttendee(transcript)
 *   // pre-fill the Add Lead form with fields
 */
export interface ParsedAttendee {
  name?:    string
  phone?:   string
  email?:   string
  budgetMin?: number
  budgetMax?: number
  beds?:    number
  suburbs?: string[]
  raw:      string
}

export function parseSpokenAttendee(text: string): ParsedAttendee {
  const t = text.trim()

  // Phone — Australian mobile or landline
  const phoneMatch = t.match(/\b(04\d{2}\s*\d{3}\s*\d{3}|\(0\d\)\s*\d{4}\s*\d{4}|0\d{9})\b/)
  const phone = phoneMatch ? phoneMatch[1].replace(/\s/g, "") : undefined

  // Email
  const emailMatch = t.match(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i)
  const email = emailMatch ? emailMatch[0] : undefined

  // Budget — "budget 850 to 900", "around 1.1 million", "under 900K"
  const budgetMatch = t.match(
    /budget[^0-9]*(\d+(?:\.\d+)?)\s*[mk]?\s*(?:to|[-–])\s*(\d+(?:\.\d+)?)\s*[mk]?/i
  ) ?? t.match(/(?:around|about|up to|under)\s*(\d+(?:\.\d+)?)\s*([mk]?)/i)
  let budgetMin: number | undefined, budgetMax: number | undefined
  if (budgetMatch) {
    const scale = (n: string, suffix: string) => {
      const v = parseFloat(n)
      if (suffix.toLowerCase() === "m") return Math.round(v * 1_000_000)
      if (suffix.toLowerCase() === "k") return Math.round(v * 1_000)
      return v < 100 ? Math.round(v * 1_000_000) : Math.round(v * 1_000)  // "1.1" → 1.1M, "850" → 850K
    }
    if (budgetMatch[2] !== undefined) {
      budgetMin = scale(budgetMatch[1], budgetMatch[3] ?? "")
      budgetMax = scale(budgetMatch[2], budgetMatch[3] ?? "")
    } else {
      budgetMax = scale(budgetMatch[1], budgetMatch[2] ?? "")
    }
  }

  // Bedrooms
  const bedsMatch = t.match(/(\d)\s*(?:bed(?:room)?s?|br\b)/i)
  const beds = bedsMatch ? parseInt(bedsMatch[1]) : undefined

  // Suburbs — look for known SE Melbourne suburb names
  const SUBURBS = [
    "Berwick","Beaconsfield","Narre Warren","Pakenham","Officer","Clyde",
    "Cranbourne","Hallam","Doveton","Dandenong","Noble Park","Springvale",
    "Mulgrave","Rowville","Wheelers Hill","Glen Waverley","Wantirna",
    "Bayswater","Boronia","Ferntree Gully","Belgrave","Tecoma","Emerald",
  ]
  const suburbs = SUBURBS.filter(s => new RegExp(`\\b${s}\\b`, "i").test(t))

  // Name — first comma-separated segment before phone/email
  const beforePhone = phone ? t.split(phone)[0] : t.split(",")[0]
  const namePart = beforePhone.replace(/[^a-z\s'-]/gi, "").trim()
  const name = namePart.split(/\s+/).length <= 4 && namePart.length > 2 ? namePart : undefined

  return { name, phone, email, budgetMin, budgetMax, beds, suburbs: suburbs.length ? suburbs : undefined, raw: t }
}
