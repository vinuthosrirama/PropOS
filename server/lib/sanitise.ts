import type { GenerateResult } from "./openai.js"

/**
 * Strip typographic dashes from a single string.
 * Replaces em-dash (—), en-dash (–), and double-hyphen (--) with " - ".
 * Collapses any resulting double-spaces.
 */
export function sanitiseText(s: string): string {
  return s.replace(/—|–|--/g, " - ").replace(/ {2,}/g, " ").trim()
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
