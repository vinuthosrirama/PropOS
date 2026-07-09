/**
 * Voice Profile store (SMS Agent — Stages 1-4)
 *
 * A voice profile captures exactly how Vinuth texts: greeting style, message
 * length, vocabulary fingerprint, emoji habits, tone scores, sign-offs, and a
 * list of anti-patterns (phrases he would never use). It is produced by Fable 5
 * calibration (voiceCalibration.ts) and consumed by the Sonnet 4.6 runtime
 * (smsAgent.ts, calendarAgent.ts).
 *
 * Storage: voice_profiles table (one row per voice_id). A built-in default is
 * returned before any calibration has run, so the agent is never broken by a
 * missing profile.
 */

import { query, execute, isDbConnected } from "./db.js"

export const DEFAULT_VOICE_ID = "vinuth_personal"

/** Returns the voice_id for a specific logged-in agent (e.g. "agent_3"). */
export function getAgentVoiceId(agentId: number): string {
  return `agent_${agentId}`
}

// ── Profile shape ──────────────────────────────────────────────────────────────

export interface VoiceProfile {
  voice_id: string
  confidence: number
  samples_analysed: number
  profile: {
    greeting: {
      close_friend: string
      business: string
      family: string
      default: string
    }
    message_style: {
      avg_words_per_message: number
      multi_message_tendency: "single_block" | "rapid_fire_short"
      capitalisation: "proper" | "lowercase" | "first_word_only" | "mixed"
      end_punctuation: "periods" | "no_periods" | "mixed"
      sentence_fragments: boolean
    }
    vocabulary: {
      fingerprint_words: string[]
      australian_slang_level: "none" | "light" | "moderate" | "heavy"
      never_use: string[]
      filler_words: string[]
    }
    expression: {
      emoji_frequency: "none" | "rare" | "moderate" | "heavy"
      common_emoji: string[]
      laugh_style: "haha" | "lol" | "none"
      exclamation_frequency: "rare" | "moderate" | "heavy"
      caps_for_emphasis: boolean
    }
    tone_scores: {
      formality: number
      warmth: number
      directness: number
      humour: number
    }
    signoff: {
      close_friend: string
      business: string
      default: string
    }
    anti_patterns: string[]
    few_shot_examples: {
      casual_opener: string
      asking_a_question: string
      responding_to_good_news: string
      declining_an_invite: string
      making_a_plan: string
    }
  }
}

// ── Built-in default (used before first calibration) ────────────────────────────
//
// Conservative, low-confidence. Australian, concise, friendly-but-direct. No
// em-dashes anywhere. Recalibration replaces this with the real fingerprint.

export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  voice_id: DEFAULT_VOICE_ID,
  confidence: 0.4,
  samples_analysed: 0,
  profile: {
    greeting: {
      close_friend: "Hey",
      business: "Hey [name]",
      family: "Hey",
      default: "Hey [name]",
    },
    message_style: {
      // Relational outreach voice — multi-clause, runs to ~2 SMS segments.
      avg_words_per_message: 50,
      multi_message_tendency: "single_block",
      capitalisation: "proper",
      end_punctuation: "mixed",
      sentence_fragments: false,
    },
    vocabulary: {
      fingerprint_words: ["Hey", "more than happy", "coffee (or tea)", "no dramas", "no worries", "reach out", "cheers", "keen", "IP", "heads up"],
      australian_slang_level: "moderate",
      never_use: ["leverage", "utilise", "seamless", "robust", "synergy", "circle back", "touch base"],
      filler_words: ["just", "honestly", "as well"],
    },
    expression: {
      emoji_frequency: "rare",
      common_emoji: [":)"],
      laugh_style: "none",
      exclamation_frequency: "moderate",
      caps_for_emphasis: false,
    },
    tone_scores: {
      formality: 4,
      warmth: 8,
      directness: 6,
      humour: 4,
    },
    signoff: {
      close_friend: "Cheers, Vinuth",
      business: "Cheers, Vinuth, Peake Real Estate",
      default: "Cheers, Vinuth, Peake Real Estate",
    },
    anti_patterns: [
      "I wanted to reach out",
      "I hope this finds you well",
      "just wanted to touch base",
      "I came across your profile",
      "I'd love to connect",
      "Let me know if you have any questions",
      "em-dashes",
    ],
    few_shot_examples: {
      casual_opener: "Hey [name], I hope you have been well!",
      asking_a_question: "More than happy to meet for a coffee (or tea) to discuss?",
      responding_to_good_news: "Congratulations again, incredible result! The team and I are absolutely buzzing.",
      declining_an_invite: "Absolutely no worries! If anything changes as the market moves, feel free to reach out any time.",
      making_a_plan: "If you'd like I can organise an appraisal to be sent your way, and we could meet for a coffee (or tea)?",
    },
  },
}

// ── Load / save ─────────────────────────────────────────────────────────────────

interface ProfileRow {
  voice_id: string
  profile: VoiceProfile["profile"] | string
  confidence: string | number
  samples_analysed: number
}

/**
 * Returns the active voice profile for a voice_id, or the built-in default if
 * none has been calibrated yet (or the DB is unavailable).
 */
export async function getVoiceProfile(voiceId = DEFAULT_VOICE_ID): Promise<VoiceProfile> {
  if (!isDbConnected()) return DEFAULT_VOICE_PROFILE
  try {
    const rows = await query<ProfileRow>(
      `SELECT voice_id, profile, confidence, samples_analysed FROM voice_profiles WHERE voice_id = $1`,
      [voiceId],
    )
    const row = rows[0]
    if (!row) return DEFAULT_VOICE_PROFILE

    let profile = row.profile
    if (typeof profile === "string") {
      try { profile = JSON.parse(profile) } catch { return DEFAULT_VOICE_PROFILE }
    }
    return {
      voice_id: row.voice_id,
      confidence: typeof row.confidence === "string" ? parseFloat(row.confidence) : row.confidence,
      samples_analysed: row.samples_analysed,
      profile: profile as VoiceProfile["profile"],
    }
  } catch {
    return DEFAULT_VOICE_PROFILE
  }
}

/** Persist a calibrated voice profile (upsert by voice_id). */
export async function saveVoiceProfile(vp: VoiceProfile): Promise<void> {
  if (!isDbConnected()) return
  await execute(
    `INSERT INTO voice_profiles (voice_id, profile, confidence, samples_analysed, calibration_date, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW(), NOW())
     ON CONFLICT (voice_id) DO UPDATE SET
       profile = $2::jsonb,
       confidence = $3,
       samples_analysed = $4,
       calibration_date = NOW(),
       updated_at = NOW()`,
    [vp.voice_id, JSON.stringify(vp.profile), vp.confidence, vp.samples_analysed],
  )
}

// ── Prompt formatting ────────────────────────────────────────────────────────────

/**
 * Render the voice profile as a compact prompt block for the runtime model.
 * Kept tight to control token cost; the few-shot examples carry most of the signal.
 */
export function formatVoiceProfileForPrompt(vp: VoiceProfile): string {
  const p = vp.profile
  return JSON.stringify({
    greeting: p.greeting,
    message_style: p.message_style,
    vocabulary: p.vocabulary,
    expression: p.expression,
    tone_scores: p.tone_scores,
    signoff: p.signoff,
    anti_patterns: p.anti_patterns,
    few_shot_examples: p.few_shot_examples,
  }, null, 2)
}
