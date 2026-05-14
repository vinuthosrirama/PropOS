/**
 * Voice context store + LLM prompt compiler
 *
 * The problem this solves:
 *   VoiceProfile stores DERIVED attributes (formalityScore: 2, aussieIndex: 4).
 *   The LLM gets voiceTraits: ["warm","direct"] — bullet points, not your voice.
 *   This module stores the raw training corpus and compiles it into a rich
 *   prompt block that lets the LLM actually write like the agent.
 *
 * Usage:
 *   // When a training example is added (VoiceLearning.tsx):
 *   addCorpusEntry({ type: "voice", text, source: "Voice clip 1" })
 *
 *   // When generating a message (App.tsx → /api/generate):
 *   const voiceContext = buildVoiceContext(agent.voiceProfile, loadCorpus())
 *   // → pass to GenerateParams.voiceContext
 */

import type { VoiceProfile } from "../data"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrainingEntry {
  id:        string
  type:      "voice" | "paste" | "email"
  text:      string
  timestamp: string    // ISO date
  wordCount: number
  source:    string    // display label e.g. "Voice clip 1"
}

// ── LocalStorage persistence ──────────────────────────────────────────────────

const CORPUS_KEY = "propOS_trainingCorpus_v1"

export function loadCorpus(): TrainingEntry[] {
  try {
    const raw = localStorage.getItem(CORPUS_KEY)
    return raw ? (JSON.parse(raw) as TrainingEntry[]) : []
  } catch {
    return []
  }
}

export function saveCorpus(entries: TrainingEntry[]): void {
  try {
    // Keep max 20 entries — older ones evicted (corpus stays fresh + prompt stays short)
    const trimmed = entries.slice(-20)
    localStorage.setItem(CORPUS_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function addCorpusEntry(entry: Omit<TrainingEntry, "id">): TrainingEntry {
  const newEntry: TrainingEntry = {
    ...entry,
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  }
  const existing = loadCorpus()
  saveCorpus([...existing, newEntry])
  return newEntry
}

export function clearCorpus(): void {
  localStorage.removeItem(CORPUS_KEY)
}

// ── Voice context compiler ────────────────────────────────────────────────────

/**
 * Builds a rich voice context block for LLM prompts.
 *
 * The compiled string is injected into the AddVantage AI system prompt so
 * every generated SMS/email sounds like the specific agent, not a template.
 *
 * Format (optimised for clarity + token efficiency):
 *
 *   === AGENT VOICE PROFILE ===
 *   Greeting: "Hey" | Closing: "Cheers,"
 *   Tone: Warm, casual, very Australian
 *   Length: Short, punchy sentences
 *   Data style: Backs claims with specific numbers
 *   Emoji: None
 *
 *   Training examples (write to match this style exactly):
 *   [voice · 42 words] Hey Michelle, Simon here! School zone confirmed...
 *   [paste · 67 words] Hey Brett, just a heads up — I've got the S32 ready...
 */
export function buildVoiceContext(
  profile: VoiceProfile,
  corpus: TrainingEntry[],
): string {
  const lines: string[] = []

  lines.push("=== AGENT VOICE PROFILE ===")

  // Greeting + closing
  lines.push(`Greeting style: "${profile.greeting}" | Closing: "${profile.closing},"`)

  // Tone from formalityScore + aussieIndex
  const formalityDesc =
    profile.formalityScore <= 1 ? "Very casual, conversational" :
    profile.formalityScore <= 2 ? "Warm and friendly, not stiff" :
    profile.formalityScore <= 3 ? "Balanced — professional but approachable" :
    profile.formalityScore <= 4 ? "Polished and professional" :
                                  "Formal and structured"

  const aussieDesc =
    profile.aussieIndex >= 4 ? "Strong Australian voice — colloquial phrasing, local references" :
    profile.aussieIndex >= 3 ? "Noticeable Australian warmth" :
    profile.aussieIndex >= 2 ? "Neutral Australian tone" :
                               "Neutral, no strong regional markers"

  lines.push(`Tone: ${formalityDesc}. ${aussieDesc}.`)

  // Length + data style
  const lengthDesc =
    profile.lengthStyle === "short"    ? "Short, punchy sentences — gets to the point" :
    profile.lengthStyle === "medium"   ? "Medium length — enough detail without padding" :
                                         "Detailed — includes supporting context and data"
  lines.push(`Message length: ${lengthDesc}`)

  const dataDesc =
    profile.specificity >= 4 ? "Regularly uses specific numbers, stats, and data points" :
    profile.specificity >= 3 ? "Occasionally backs claims with data" :
                               "Conversational — uses feelings and observations over data"
  lines.push(`Data use: ${dataDesc}`)

  // Emoji preference
  const emojiDesc =
    profile.emojiUsage === "frequent"   ? "Uses emojis naturally throughout" :
    profile.emojiUsage === "occasional" ? "Uses emojis sparingly for warmth" :
                                          "No emojis — keeps it professional"
  lines.push(`Emoji: ${emojiDesc}`)

  // Detected personality traits
  if (profile.detectedTraits.length > 0) {
    lines.push(`Key traits: ${profile.detectedTraits.join(", ")}`)
  }

  // Raw training examples — most powerful signal for voice matching
  const examples = corpus.filter(e => e.text.trim().length > 20).slice(-5)  // latest 5
  if (examples.length > 0) {
    lines.push("")
    lines.push(`Training examples — write to match this style exactly:`)
    for (const entry of examples) {
      // Trim to ~120 chars for token efficiency — enough to capture voice
      const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + "..." : entry.text
      lines.push(`[${entry.type} · ${entry.wordCount}w] ${preview}`)
    }
  } else {
    lines.push("")
    lines.push("(No training examples yet — use the voice defaults above)")
  }

  return lines.join("\n")
}

// ── SLM-aware outreach prompt builder ────────────────────────────────────────

export interface SLMOutreachParams {
  agentName: string
  agentAgency: string
  voiceContext: string
  lead: {
    name: string
    budget: number
    persona: string
    notes: string
    questions: string[]
    transcript?: string
  }
  soldAddress: string
  soldSLMSummary: string
  activeAddress: string
  activeSLMSummary: string
  matchedQA: Array<{ question: string; answer: string }>
  comparisons: Array<{ label: string; soldValue: string; activeValue: string }>
  pitchAngles?: Array<{ type: "strength" | "neutral" | "warning"; text: string }>
}

/**
 * Builds the full system prompt for the outreach LLM call.
 * Injects: agent voice + lead context + sold-vs-active SLM comparison + Q&A answers.
 * The LLM uses this to write a hyper-personalised SMS + email without knowing
 * it is Claude — it is the AddVantage proprietary engine.
 */
export function buildOutreachPrompt(p: SLMOutreachParams): string {
  const fname = p.lead.name.split(" ")[0]
  const qaBlock = p.matchedQA.length > 0
    ? p.matchedQA.map(q => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n")
    : "(no answered questions available)"
  const compBlock = p.comparisons.length > 0
    ? p.comparisons.map(c => `${c.label}: ${c.soldValue} (property they saw) vs ${c.activeValue} (this property)`).join("\n")
    : "(no direct comparisons available)"
  const transcriptBlock = p.lead.transcript
    ? `VOICE TRANSCRIPT (agent notes — use for personalisation):\n"${p.lead.transcript}"`
    : "(no voice transcript)"

  const pitchBlock = p.pitchAngles && p.pitchAngles.length > 0
    ? "PITCH ANGLES (data-driven reasons this listing suits this lead — use these as your talking points):\n" +
      p.pitchAngles.map(a => `${a.type === "strength" ? "✅" : a.type === "warning" ? "⚠️" : "→"} ${a.text}`).join("\n")
    : ""

  return `${p.voiceContext}

=== OUTREACH TASK ===

You are ${p.agentName} from ${p.agentAgency}. Write in your voice above — not a generic template.

LEAD:
- Name: ${fname} (full: ${p.lead.name})
- Budget: $${p.lead.budget.toLocaleString()}
- Persona: ${p.lead.persona}
- Agent notes: ${p.lead.notes || "(none)"}
- Questions they asked at the open home: ${p.lead.questions.join("; ") || "(none recorded)"}

${transcriptBlock}

PROPERTY THEY SAW (sold): ${p.soldAddress}
${p.soldSLMSummary}

NEW LISTING (what you are pitching): ${p.activeAddress}
${p.activeSLMSummary}

SIDE-BY-SIDE COMPARISON:
${compBlock}

QUESTIONS ANSWERED FOR THIS NEW LISTING:
${qaBlock}

${pitchBlock}

WRITE:
1. An SMS (strictly under 160 characters) that:
   - Opens with their first name + your name
   - References one specific thing from the voice transcript or their questions
   - Names the new listing and one key similarity to what they saw
   - Has a clear call to action (open home date or "worth a look?")
   - No em-dashes. Ranges use "to". Warm and Australian.

2. An email (subject line + body, 3 short paragraphs) that:
   - Para 1: Reference something specific they cared about at the sold property
   - Para 2: Directly answer 1 to 2 of their questions for this new listing using the Q&A above. Call out the comparison ("this one is 4-bed like the last, but at 680sqm vs 612sqm").
   - Para 3: Mention the open home date/time and invite them with a low-pressure CTA
   - Sign off with your name only (no agency tagline, no generic "kind regards")
   - No em-dashes. No "I hope this email finds you well." Just get into it.

Return JSON exactly:
{
  "sms": "...",
  "emailSubject": "...",
  "emailBody": ["paragraph 1", "paragraph 2", "paragraph 3", "Sign-off line"]
}`
}

/**
 * Lightweight version — just the most critical fields.
 * Used when token budget is tight (e.g. SMS-only generation).
 */
export function buildVoiceContextCompact(
  profile: VoiceProfile,
  corpus: TrainingEntry[],
): string {
  const example = corpus.slice(-1)[0]
  const exampleLine = example
    ? `\nExample: "${example.text.slice(0, 120)}${example.text.length > 120 ? "..." : ""}"`
    : ""

  return [
    `Greeting: "${profile.greeting}" | Closing: "${profile.closing},"`,
    `Tone: ${profile.formalityScore <= 2 ? "casual/warm" : "professional"}, ${profile.aussieIndex >= 3 ? "Australian" : "neutral"}`,
    `Length: ${profile.lengthStyle}${exampleLine}`,
  ].join("\n")
}
