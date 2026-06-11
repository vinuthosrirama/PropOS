/**
 * Outreach Targets — Supabase CRUD
 *
 * Manages the `outreach_targets` table: real estate agents we are pitching
 * PropOS to. The self-demo campaign uses the same SMS transport layer
 * to send personalised outreach to these agents.
 */

import { getSupabaseClient, supabaseConnected } from './supabase'

export interface OutreachTarget {
  id?:               number
  name:              string
  agency:            string
  phone?:            string
  email?:            string
  suburb?:           string
  state?:            string
  recentSaleAddress?: string
  yearsInArea?:      number
  agencySizeEst?:    number
  personalNote?:     string
  source?:           string
  status?:           OutreachStatus
  lastContactDate?:  string
  lastMessage?:      string
  replyBody?:        string
  demoBookedAt?:     string
  notes?:            string
}

export type OutreachStatus =
  | "new"
  | "contacted"
  | "replied"
  | "demo_booked"
  | "won"
  | "not_interested"

interface OutreachTargetRow {
  id:                  number
  name:                string
  agency:              string
  phone:               string | null
  email:               string | null
  suburb:              string | null
  state:               string | null
  recent_sale_address: string | null
  years_in_area:       number | null
  agency_size_est:     number | null
  personal_note:       string | null
  source:              string | null
  status:              string | null
  last_contact_date:   string | null
  last_message:        string | null
  reply_body:          string | null
  demo_booked_at:      string | null
  notes:               string | null
  created_at:          string
  updated_at:          string
}

function rowToTarget(r: OutreachTargetRow): OutreachTarget {
  return {
    id:               r.id,
    name:             r.name,
    agency:           r.agency,
    phone:            r.phone ?? undefined,
    email:            r.email ?? undefined,
    suburb:           r.suburb ?? undefined,
    state:            r.state ?? undefined,
    recentSaleAddress: r.recent_sale_address ?? undefined,
    yearsInArea:      r.years_in_area ?? undefined,
    agencySizeEst:    r.agency_size_est ?? undefined,
    personalNote:     r.personal_note ?? undefined,
    source:           r.source ?? undefined,
    status:           (r.status ?? "new") as OutreachStatus,
    lastContactDate:  r.last_contact_date ?? undefined,
    lastMessage:      r.last_message ?? undefined,
    replyBody:        r.reply_body ?? undefined,
    demoBookedAt:     r.demo_booked_at ?? undefined,
    notes:            r.notes ?? undefined,
  }
}

/**
 * Upsert a batch of outreach targets.
 * Idempotent: uses phone (or email) as the unique key.
 * Returns the number of rows upserted.
 */
export async function upsertOutreachTargets(targets: OutreachTarget[]): Promise<number> {
  if (!supabaseConnected()) {
    console.warn('[outreachTargets] Supabase not connected — upsert skipped')
    return 0
  }
  const client = getSupabaseClient()

  const rows = targets.map(t => ({
    name:                t.name,
    agency:              t.agency,
    phone:               t.phone ?? null,
    email:               t.email ?? null,
    suburb:              t.suburb ?? null,
    state:               t.state ?? 'VIC',
    recent_sale_address: t.recentSaleAddress ?? null,
    years_in_area:       t.yearsInArea ?? null,
    agency_size_est:     t.agencySizeEst ?? null,
    personal_note:       t.personalNote ?? null,
    source:              t.source ?? 'manual',
    status:              t.status ?? 'new',
    notes:               t.notes ?? null,
  }))

  const { error, count } = await client
    .from('outreach_targets')
    .upsert(rows, {
      onConflict: 'phone',
      ignoreDuplicates: false,
      count: 'exact',
    })
    .select('id')

  if (error) {
    console.error('[outreachTargets] upsert error:', error.message)
    return 0
  }

  return count ?? rows.length
}

/**
 * Fetch all outreach targets, optionally filtered by status.
 */
export async function fetchOutreachTargets(status?: OutreachStatus): Promise<OutreachTarget[]> {
  if (!supabaseConnected()) return []
  const client = getSupabaseClient()

  let q = client.from('outreach_targets').select('*').order('id', { ascending: true })
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) {
    console.error('[outreachTargets] fetch error:', error.message)
    return []
  }
  return (data as OutreachTargetRow[]).map(rowToTarget)
}

/**
 * Mark an outreach target as contacted after sending a message.
 */
export async function markOutreachTargetContacted(
  id: number,
  message: string,
): Promise<void> {
  if (!supabaseConnected()) return
  const client = getSupabaseClient()
  await client
    .from('outreach_targets')
    .update({
      status:            'contacted',
      last_contact_date: new Date().toISOString(),
      last_message:      message,
    })
    .eq('id', id)
}

/**
 * Record an inbound reply from an outreach target.
 */
export async function recordOutreachReply(phone: string, replyBody: string): Promise<void> {
  if (!supabaseConnected()) return
  const client = getSupabaseClient()
  await client
    .from('outreach_targets')
    .update({ status: 'replied', reply_body: replyBody })
    .eq('phone', phone)
}

/**
 * Mark a demo as booked.
 */
export async function markDemoBooked(id: number): Promise<void> {
  if (!supabaseConnected()) return
  const client = getSupabaseClient()
  await client
    .from('outreach_targets')
    .update({ status: 'demo_booked', demo_booked_at: new Date().toISOString() })
    .eq('id', id)
}
