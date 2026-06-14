/**
 * Prospectability + Interest scoring for sms_contacts.
 *
 * prospectability (0-100): Should we reach out to this person soon?
 *   Driven by REA activity signals (active listings, recent sales) + contact
 *   freshness (how long since we last tried).
 *
 * interest (0-100): How engaged is this lead?
 *   Driven by conversation stage, voice-signal history (approve/edit/reject),
 *   and recency of last contact.
 */

import { query, isDbConnected } from "./db.js"
import type { SmsContact } from "./smsContacts.js"

export interface ContactScore {
  prospectability: number
  interest: number
  label: "hot" | "warm" | "cold"
  highlights: string[]
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

export function computeScore(
  contact: SmsContact,
  signals: { approved: number; edited: number; rejected: number },
): ContactScore {
  const rea = (contact.rea_data ?? {}) as Record<string, unknown>
  const highlights: string[] = []
  let p = 50
  let i = 20

  // ── Prospectability signals ───────────────────────────────────────────────
  const listing = (rea.currently_listing_count as number | undefined) ?? 0
  const yearsActive = (rea.years_active as number | undefined) ?? 0
  const dom = (rea.recently_sold_days_on_market as number | undefined) ?? null
  const suburbCount = Array.isArray(rea.target_suburbs) ? (rea.target_suburbs as string[]).length : 0
  const agencyName = rea.agency_name as string | undefined

  if (listing > 0) {
    p += listing >= 3 ? 25 : 18
    highlights.push(`${listing} active listing${listing > 1 ? "s" : ""}`)
  }
  if (yearsActive >= 5) { p += 15; highlights.push(`${yearsActive}y in market`) }
  else if (yearsActive >= 3) p += 8
  if (suburbCount >= 4) p += 12
  else if (suburbCount >= 2) p += 6
  if (dom !== null && dom <= 14) { p += 12; highlights.push(`sold in ${dom}d`) }
  else if (dom !== null && dom <= 25) p += 6
  if (agencyName) p += 5

  const lastDays = daysSince(contact.last_contact)
  if (contact.attempts === 0) { p += 15; highlights.push("not yet contacted") }
  if (lastDays === null) p += 5
  else if (lastDays > 45) { p += 12; highlights.push("45+ days — due follow-up") }
  else if (lastDays > 20) p += 6
  else if (lastDays < 5) p -= 20

  if (contact.attempts > 7) p -= 15
  else if (contact.attempts > 4) p -= 8
  if (contact.status === "opted_out" || contact.status === "completed") p -= 40
  if (contact.status === "booked") { p += 35; highlights.push("meeting booked") }
  if (contact.status === "paused") p -= 15

  // ── Interest signals ──────────────────────────────────────────────────────
  if (contact.stage === 2) i += 20
  else if (contact.stage >= 3) i += 40
  if (contact.status === "booked") i += 60

  if (lastDays !== null && lastDays < 5) i += 25
  else if (lastDays !== null && lastDays < 14) i += 12
  if (contact.attempts >= 1 && lastDays !== null) i += 8

  const netSig = signals.approved * 6 + signals.edited * 3 - signals.rejected * 6
  i += Math.max(-25, Math.min(30, netSig))

  p = Math.max(0, Math.min(100, Math.round(p)))
  i = Math.max(0, Math.min(100, Math.round(i)))

  const label: ContactScore["label"] =
    p >= 70 || i >= 70 ? "hot" :
    p >= 42 || i >= 42 ? "warm" : "cold"

  return { prospectability: p, interest: i, label, highlights: highlights.slice(0, 3) }
}

/** Fetch per-contact voice-signal counts from Supabase and score every contact. */
export async function scoreContacts(contacts: SmsContact[]): Promise<Map<number, ContactScore>> {
  const map = new Map<number, ContactScore>()
  if (contacts.length === 0) return map

  const zero = { approved: 0, edited: 0, rejected: 0 }
  const sigMap = new Map<number, typeof zero>()

  if (isDbConnected()) {
    try {
      const ids = contacts.map(c => c.id)
      const rows = await query<{ contact_id: number; action: string; cnt: number }>(
        `SELECT contact_id, action, COUNT(*)::int AS cnt
         FROM voice_signals
         WHERE contact_id = ANY($1::int[])
         GROUP BY contact_id, action`,
        [ids],
      )
      for (const r of rows) {
        if (!r.contact_id) continue
        const cur = sigMap.get(r.contact_id) ?? { ...zero }
        if (r.action === "approved_as_is") cur.approved = r.cnt
        else if (r.action === "edited")    cur.edited   = r.cnt
        else if (r.action === "rejected")  cur.rejected = r.cnt
        sigMap.set(r.contact_id, cur)
      }
    } catch { /* non-fatal */ }
  }

  for (const c of contacts) {
    map.set(c.id, computeScore(c, sigMap.get(c.id) ?? { ...zero }))
  }
  return map
}
