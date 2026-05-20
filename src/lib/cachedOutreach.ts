/**
 * Pre-generated outreach for the most common demo paths.
 * Used as fallback when the LLM call times out or fails.
 *
 * Keys are normalised: leadName.toLowerCase() + "|" + first word of property address.
 */

interface CachedOutreach {
  sms: string
  emailSubject: string
  emailBody: string[]
}

// Cache intentionally empty — LLM is the primary (and only) outreach source.
// getCachedOutreach always returns null, forcing the system to use the LLM API.
const CACHE: Record<string, CachedOutreach> = {}

/**
 * Returns pre-generated outreach for a lead/property combo, or null if not cached.
 * Matching is case-insensitive and uses the first word of the property address.
 */
export function getCachedOutreach(
  leadName: string,
  propertyAddress: string,
): CachedOutreach | null {
  const firstWord = propertyAddress.trim().split(/\s+/)[0].toLowerCase()
  const key = `${leadName.toLowerCase()}|${firstWord}`
  return CACHE[key] ?? null
}
