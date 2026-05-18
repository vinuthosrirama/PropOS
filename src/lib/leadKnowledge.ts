/**
 * Lead Knowledge Base
 *
 * Persists voice-memo transcripts per lead so that:
 *  - The ProfilePage textarea is pre-filled with prior context on re-visit
 *  - Future outreach generation includes all cumulative notes (not just the
 *    current session) so mentions like "interested in a pool" carry through
 *  - matchLeadToListing receives enriched notes for accurate re-matching
 *    (e.g. MissedOut flow will weight pool/school/land preferences higher)
 *
 * Storage: localStorage, keyed by lead ID.  Max 50 entries per lead, no TTL.
 */

const STORE_KEY = "propOS_leadKnowledge_v1"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  timestamp: string     // ISO
  transcript: string    // raw text from voice memo / manual textarea
  interests:  string[]  // extracted interest tags (e.g. "pool", "schoolZone")
}

export interface LeadKnowledge {
  leadId:   string
  leadName: string
  entries:  KnowledgeEntry[]
}

// ── Interest extraction ────────────────────────────────────────────────────────
// Lightweight keyword matcher — no AI call, runs instantly in the browser.
// Tags are used to enrich match scoring when the lead is re-matched later.

const INTEREST_MAP: Record<string, string[]> = {
  pool:         ["pool", "swimming pool"],
  schoolZone:   ["school zone", "school catchment", "berwick primary", "casey grammar", "primary school", "zoned for"],
  landSize:     ["land", "big block", "large yard", "sqm", "square metre", "outdoor space", "backyard"],
  dining:       ["dining room", "formal dining", "separate dining"],
  alfresco:     ["alfresco", "deck", "pergola", "outdoor entertaining", "entertaining area"],
  solar:        ["solar", "solar panels", "solar system"],
  subdivision:  ["subdivide", "subdivision", "dual occ", "two lots"],
  grannyFlat:   ["granny flat", "second dwelling", "in-law", "granny"],
  garage:       ["double garage", "garage", "workshop", "car spaces"],
  storage:      ["shed", "storage"],
  renovation:   ["renovate", "fixer", "cosmetic reno", "needs work", "doer upper"],
  newBuild:     ["brand new", "new build", "just built", "newly built"],
  quietStreet:  ["quiet street", "court", "cul de sac", "no through traffic", "cul-de-sac"],
  northFacing:  ["north facing", "north-facing", "northerly", "north aspect"],
}

export function extractInterests(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(INTEREST_MAP)
    .filter(([, words]) => words.some(w => lower.includes(w)))
    .map(([key]) => key)
}

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadStore(): Record<string, LeadKnowledge> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, LeadKnowledge>) : {}
  } catch { return {} }
}

function saveStore(store: Record<string, LeadKnowledge>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getLeadKnowledge(leadId: string): LeadKnowledge | null {
  return loadStore()[leadId] ?? null
}

/**
 * Adds a new transcript entry for the lead (idempotent — skips exact duplicates).
 * Called when the agent clicks "Generate Outreach" so every recording is stored.
 */
export function upsertLeadTranscript(leadId: string, leadName: string, transcript: string): void {
  const text = transcript.trim()
  if (!text) return
  const store  = loadStore()
  const record = store[leadId] ?? { leadId, leadName, entries: [] }

  // Skip exact duplicates — re-generating with the same notes shouldn't stack
  if (!record.entries.some(e => e.transcript === text)) {
    record.entries = [...record.entries, {
      timestamp: new Date().toISOString(),
      transcript: text,
      interests:  extractInterests(text),
    }].slice(-50)  // cap at 50 entries per lead
  }

  store[leadId] = record
  saveStore(store)
}

/** All unique interest tags across every recording session for this lead */
export function getLeadInterests(leadId: string): string[] {
  const rec = getLeadKnowledge(leadId)
  if (!rec) return []
  return [...new Set(rec.entries.flatMap(e => e.interests))]
}

/**
 * Cumulative text of all stored transcripts — used to pre-fill the voice
 * textarea in ProfilePage so prior context is always visible.
 */
export function getLeadCumulativeNotes(leadId: string): string {
  const rec = getLeadKnowledge(leadId)
  if (!rec || rec.entries.length === 0) return ""
  // Most recent first so the agent sees new context at the top
  return [...rec.entries].reverse().map(e => e.transcript).join("\n\n---\n\n")
}

/**
 * Merges the Google Sheet notes field with all stored voice knowledge.
 * Pass the result as `notes` to matchLeadToListing so the matching engine
 * accounts for interests mentioned in voice memos (pool, school zone, etc.).
 */
export function enrichLeadNotes(leadId: string, sheetNotes: string | undefined): string {
  const stored = getLeadCumulativeNotes(leadId)
  const sheet  = sheetNotes ?? ""
  if (!stored) return sheet
  if (!sheet)  return stored
  return `${sheet}\n\n${stored}`
}
