/**
 * Voice Calibration (SMS Agent — Stage 1 seed, Stage 2 recalibration)
 *
 * Uses Fable 5 (claude-fable-5) for the high-stakes, one-time-ish task of turning
 * Vinuth's real text samples into a structured voice profile, and later refining
 * it from edit signals. Fable 5 is used here (not the cheaper runtime model)
 * because getting the fingerprint right is what makes every downstream reply
 * sound human.
 *
 * Public API:
 *   calibrateVoice(samples)       -> VoiceProfile        (Stage 1)
 *   recalibrateVoice(voiceId)     -> VoiceProfile | null (Stage 2, from voice_signals)
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import {
  DEFAULT_VOICE_ID, DEFAULT_VOICE_PROFILE, getVoiceProfile, saveVoiceProfile,
  type VoiceProfile,
} from "./voiceProfile.js"
import { getRecentVoiceSignals } from "./smsContacts.js"

const CALIBRATION_MODEL = "claude-fable-5"

// ── Stage 1: initial calibration from text samples ──────────────────────────────

const CALIBRATION_SYSTEM = `You are a voice calibration engine. Analyse text message samples from Vinuth Srirama and produce a voice profile that captures exactly how he texts.

Analyse: greeting style, sentence structure (avg WORDS PER MESSAGE, capitalisation, punctuation, fragments), vocabulary fingerprint (words he uses often, Australian slang level, words he would NEVER use), emoji/expression habits, tone scores (formality, warmth, directness, humour each 1-10), sign-offs, anti-patterns (phrases that sound "AI" he would never say), and context shifts (friends vs business vs family).

RULES:
- The few_shot_examples are the most important part. Make them perfect — a less capable model copies them.
- If samples are thin, set confidence below 0.7 and lean conservative.
- Pay special attention to message LENGTH. If he sends 10-word texts, never imply 50-word texts.
- Australian English spellings only (organise, colour, favourite).
- Anti-patterns MUST include "em-dashes". He never uses em-dashes.

Return ONLY a JSON object matching this exact shape (no markdown, no preamble):
{
  "voice_id": "vinuth_personal",
  "confidence": 0.0,
  "samples_analysed": 0,
  "profile": {
    "greeting": { "close_friend": "", "business": "", "family": "", "default": "" },
    "message_style": { "avg_words_per_message": 0, "multi_message_tendency": "single_block", "capitalisation": "first_word_only", "end_punctuation": "no_periods", "sentence_fragments": true },
    "vocabulary": { "fingerprint_words": [], "australian_slang_level": "moderate", "never_use": [], "filler_words": [] },
    "expression": { "emoji_frequency": "rare", "common_emoji": [], "laugh_style": "haha", "exclamation_frequency": "rare", "caps_for_emphasis": false },
    "tone_scores": { "formality": 0, "warmth": 0, "directness": 0, "humour": 0 },
    "signoff": { "close_friend": "", "business": "Vinuth", "default": "" },
    "anti_patterns": [],
    "few_shot_examples": { "casual_opener": "", "asking_a_question": "", "responding_to_good_news": "", "declining_an_invite": "", "making_a_plan": "" }
  }
}`

/**
 * Calibrate a fresh voice profile from raw text samples. Persists and returns it.
 * Falls back to the default profile (lightly annotated) if no API key / on failure.
 */
export async function calibrateVoice(
  samples: string[],
  voiceId = DEFAULT_VOICE_ID,
): Promise<VoiceProfile> {
  const clean = samples.map(s => s.trim()).filter(Boolean)
  if (clean.length === 0 || !process.env.ANTHROPIC_API_KEY) {
    const fallback = { ...DEFAULT_VOICE_PROFILE, voice_id: voiceId, samples_analysed: clean.length }
    await saveVoiceProfile(fallback)
    return fallback
  }

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: CALIBRATION_MODEL,
        max_tokens: 1600,
        system: CALIBRATION_SYSTEM,
        messages: [{
          role: "user",
          content: `SAMPLES (${clean.length} real texts from Vinuth):\n${clean.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nProduce the voice profile JSON now.`,
        }],
      }, { signal }),
    )

    const vp = parseProfile(message, voiceId, clean.length)
    if (!vp) {
      const fallback = { ...DEFAULT_VOICE_PROFILE, voice_id: voiceId, samples_analysed: clean.length }
      await saveVoiceProfile(fallback)
      return fallback
    }
    await saveVoiceProfile(vp)
    console.log(`[voiceCalibration] calibrated "${voiceId}" from ${clean.length} samples (confidence ${vp.confidence})`)
    return vp
  } catch (err) {
    console.warn("[voiceCalibration] calibrate failed, using default:", (err as Error).message)
    const fallback = { ...DEFAULT_VOICE_PROFILE, voice_id: voiceId, samples_analysed: clean.length }
    await saveVoiceProfile(fallback)
    return fallback
  }
}

// ── Stage 2: recalibration from edit signals ────────────────────────────────────

const RECALIBRATION_SYSTEM = `You are recalibrating Vinuth Srirama's voice profile based on his editing behaviour.

Each signal is a draft the system generated and what Vinuth did with it:
- "approved_as_is": the draft was perfect.
- "edited": the draft needed changes. The diff (draft vs edited) is the STRONGEST signal — it shows exactly how he really talks.
- "rejected": the draft was wrong; learn what he does NOT sound like.

RULES:
- Edits are worth 10x approvals. If he consistently makes the same edit (e.g. always removes exclamation marks), bake it into the baseline.
- Be conservative. Do not overcorrect from a small sample. Flag dimensions with under 5 data points as low confidence.
- Never invent traits unsupported by evidence. Learn from Vinuth, do not impose a voice.
- Keep "em-dashes" in anti_patterns. Australian spellings only.
- Goal: drive the approved-as-is rate up. Update few_shot_examples to reflect corrections.

Return ONLY the updated voice profile JSON in the SAME shape as the current profile (no markdown, no preamble).`

/**
 * Recalibrate the stored profile using accumulated voice_signals. Returns the
 * updated profile, or null if there is nothing to learn from / no API key.
 */
export async function recalibrateVoice(voiceId = DEFAULT_VOICE_ID): Promise<VoiceProfile | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const signals = await getRecentVoiceSignals(40)
  if (signals.length < 5) {
    console.log(`[voiceCalibration] recalibration skipped — only ${signals.length} signals (need 5)`)
    return null
  }

  const current = await getVoiceProfile(voiceId)
  const signalBlock = signals.map((s, i) => {
    if (s.action === "edited") {
      return `${i + 1}. EDITED\n   draft:  ${s.draft_body}\n   edited: ${s.edited_body ?? ""}`
    }
    return `${i + 1}. ${s.action.toUpperCase()}: ${s.draft_body}`
  }).join("\n")

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: CALIBRATION_MODEL,
        max_tokens: 1600,
        system: RECALIBRATION_SYSTEM,
        messages: [{
          role: "user",
          content: `CURRENT PROFILE:\n${JSON.stringify(current.profile, null, 2)}\n\nEDIT SIGNALS (${signals.length}):\n${signalBlock}\n\nProduce the updated voice profile JSON now.`,
        }],
      }, { signal }),
    )

    const approvedRate = signals.filter(s => s.action === "approved_as_is").length / signals.length
    const vp = parseProfile(message, voiceId, current.samples_analysed + signals.length)
    if (!vp) return null
    // Confidence nudges toward the observed approval rate, capped.
    vp.confidence = Math.min(0.95, Math.max(vp.confidence, approvedRate))
    await saveVoiceProfile(vp)
    console.log(`[voiceCalibration] recalibrated "${voiceId}" from ${signals.length} signals (approved-as-is ${Math.round(approvedRate * 100)}%)`)
    return vp
  } catch (err) {
    console.warn("[voiceCalibration] recalibrate failed:", (err as Error).message)
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface AnthropicMessage { content: Array<{ type: string; text?: string }> }

function parseProfile(message: AnthropicMessage, voiceId: string, samplesAnalysed: number): VoiceProfile | null {
  const raw = message.content[0]?.type === "text" ? (message.content[0].text ?? "") : ""
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  try {
    const parsed = JSON.parse(cleaned) as Partial<VoiceProfile>
    if (!parsed.profile) return null
    // Sanitise free-text few-shot examples so no em-dashes / AI tells leak in.
    const fs = parsed.profile.few_shot_examples
    if (fs) {
      for (const k of Object.keys(fs) as Array<keyof typeof fs>) {
        if (typeof fs[k] === "string") fs[k] = sanitiseText(fs[k])
      }
    }
    if (!parsed.profile.anti_patterns) parsed.profile.anti_patterns = []
    if (!parsed.profile.anti_patterns.includes("em-dashes")) parsed.profile.anti_patterns.push("em-dashes")
    return {
      voice_id: voiceId,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      samples_analysed: samplesAnalysed,
      profile: parsed.profile,
    }
  } catch {
    return null
  }
}
