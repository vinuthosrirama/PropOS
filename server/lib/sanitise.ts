import type { GenerateResult } from "./openai.js"

// ---------------------------------------------------------------------------
// Tier 1 AI-vocabulary replacements
// Words that appear 5–20× more often in AI text than human text.
// Applied as a runtime safety net even when prompts are obeyed.
// ---------------------------------------------------------------------------

const TIER1: ReadonlyArray<[RegExp, string]> = [
  // leverage / utilize (both spellings)
  [/\bleveraging\b/gi,  "using"],
  [/\bleveraged\b/gi,   "used"],
  [/\bleverages\b/gi,   "uses"],
  [/\bleverage\b/gi,    "use"],
  [/\butilising\b/gi,   "using"],
  [/\butilised\b/gi,    "used"],
  [/\butilises\b/gi,    "uses"],
  [/\butilise\b/gi,     "use"],
  [/\butilizing\b/gi,   "using"],
  [/\butilized\b/gi,    "used"],
  [/\butilizes\b/gi,    "uses"],
  [/\butilize\b/gi,     "use"],
  // single-word swaps
  [/\brobust\b/gi,         "solid"],
  [/\bseamlessly\b/gi,     "smoothly"],
  [/\bseamless\b/gi,       "smooth"],
  [/\bholistic\b/gi,       "complete"],
  [/\bactionable\b/gi,     "practical"],
  [/\bsynergies\b/gi,      "benefits"],
  [/\bsynergy\b/gi,        "benefit"],
  [/\bparadigm\b/gi,       "approach"],
  [/\bdelving\b/gi,        "looking"],
  [/\bdelve\b/gi,          "look"],
  [/\bshowcasing\b/gi,     "showing"],
  [/\bshowcase\b/gi,       "show"],
  [/\bcutting-edge\b/gi,   "modern"],
  [/\bpivotal\b/gi,        "key"],
  [/\btransformative\b/gi, "significant"],
  [/\belevating\b/gi,      "improving"],
  [/\belevates\b/gi,       "improves"],
  [/\belevate\b/gi,        "improve"],
  [/\bcornerstones?\b/gi,  "foundation"],
  [/\bempowering\b/gi,     "helping"],
  [/\bempower\b/gi,        "help"],
  [/\bnuanced\b/gi,        "careful"],
  [/\bmultifaceted\b/gi,   "complex"],
  [/\bparamount\b/gi,      "most important"],
  [/\bcomprehensive\b/gi,  "thorough"],
  [/\btestament to\b/gi,   "a sign of"],
]

// ---------------------------------------------------------------------------
// Hollow-phrase removal
// Zero-meaning sentence openers that add no content — strip the prefix,
// the remaining clause stands on its own.
// ---------------------------------------------------------------------------

const HOLLOW_PHRASES: ReadonlyArray<RegExp> = [
  /\bit'?s worth noting that\s+/gi,
  /\bit'?s important to note that\s+/gi,
  /\bneedless to say,?\s+/gi,
  /\bit goes without saying that\s+/gi,
  /\bI hope this (email )?finds you well\.?\s*/gi,
  /\bI hope everything is going well\.?\s*/gi,
]

// ---------------------------------------------------------------------------
// Core sanitiser
// ---------------------------------------------------------------------------

/**
 * Strip typographic dashes, Tier 1 AI vocabulary, and hollow openers.
 * The em-dash rule is a hard constraint; the rest are safety-net catches
 * for when the prompt instructions aren't followed.
 */
export function sanitiseText(s: string): string {
  // 1. Em-dash / en-dash / double-hyphen → comma (hard rule).
  //    Absorb surrounding spaces so we never leave a " , " artifact.
  let out = s.replace(/\s*(?:—|–|--)\s*/g, ", ").replace(/ {2,}/g, " ").trim()

  // 2. Strip zero-value openers
  for (const re of HOLLOW_PHRASES) {
    out = out.replace(re, "")
  }

  // 3. Tier 1 vocabulary replacements
  for (const [re, replacement] of TIER1) {
    out = out.replace(re, replacement)
  }

  return out.replace(/ {2,}/g, " ").trim()
}

/** Apply sanitiseText to every text field in a GenerateResult. */
export function sanitiseResult(r: GenerateResult): GenerateResult {
  return {
    sms: sanitiseText(r.sms),
    email: {
      subject: sanitiseText(r.email.subject),
      body: r.email.body.map(sanitiseText),
    },
  }
}
