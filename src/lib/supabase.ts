/**
 * PropOS Supabase Client
 *
 * Supabase replaces Google Sheets as the primary real-time database.
 * Google Sheets remains as a fallback for legacy demos.
 *
 * Project: pzdcwulzteofvatjrtlh (vinuthosrirama's Project)
 * Dashboard: https://supabase.com/dashboard/project/pzdcwulzteofvatjrtlh
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PastBuyer } from '../data/pastBuyers'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      ?? ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}

export function supabaseConnected(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON)
}

// ── Database row shape ────────────────────────────────────────────────────────
// Matches the actual past_buyers table schema in Supabase

interface PastBuyerRow {
  id:                        number
  rea_agent_name:            string
  rea_agency:                string | null
  lead_first_name:           string | null
  lead_last_name:            string | null
  lead_phone:                string | null
  lead_email:                string | null
  purchase_address:          string | null
  suburb:                    string | null
  purchase_date:             string | null
  purchase_price:            number | null
  deposit:                   number | null
  property_type:             string | null
  beds:                      number | null
  baths:                     number | null
  land:                      number | null
  status:                    string | null
  notes:                     string | null
  last_contact_date:         string | null
  last_message:              string | null
  personalisation_hook:      string | null
  current_estimate_override: number | null
}

// ── Row → PastBuyer mapping ───────────────────────────────────────────────────

function rowToBuyer(row: PastBuyerRow): PastBuyer {
  const name = [row.lead_first_name, row.lead_last_name].filter(Boolean).join(" ") || "Unknown"
  return {
    id:                      row.id,
    name,
    phone:                   row.lead_phone ?? "",
    email:                   row.lead_email ?? undefined,
    purchaseAddress:         row.purchase_address ?? "",
    suburb:                  row.suburb ?? "",
    purchaseDate:            row.purchase_date ?? "",
    purchasePrice:           row.purchase_price ?? 0,
    deposit:                 row.deposit ?? undefined,
    propertyType:            (row.property_type ?? "House") as PastBuyer["propertyType"],
    beds:                    row.beds ?? 0,
    baths:                   row.baths ?? 0,
    land:                    row.land ?? undefined,
    status:                  (row.status ?? "unknown") as PastBuyer["status"],
    notes:                   row.notes ?? "",
    lastContactDate:         row.last_contact_date ?? undefined,
    lastMessage:             row.last_message ?? undefined,
    personalisationHook:     row.personalisation_hook ?? undefined,
    currentEstimateOverride: row.current_estimate_override ?? undefined,
  }
}

// ── Read past buyers from Supabase ────────────────────────────────────────────

export async function readPastBuyersFromSupabase(agentName?: string): Promise<PastBuyer[] | null> {
  if (!supabaseConnected()) return null
  try {
    const client = getSupabaseClient()
    let query = client
      .from('past_buyers')
      .select('*')
      .order('id', { ascending: true })

    if (agentName) {
      query = query.eq('rea_agent_name', agentName)
    }

    const { data, error } = await query

    if (error) {
      // Table doesn't exist yet — this is expected before migration
      if (error.code === 'PGRST205' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        console.info('[supabase] past_buyers table not yet created — run supabase/migrations/20260606_create_past_buyers.sql')
        return null
      }
      console.error('[supabase] readPastBuyers error:', error.message)
      return null
    }

    if (!data || data.length === 0) return null
    return (data as PastBuyerRow[]).map(rowToBuyer)
  } catch (err) {
    console.error('[supabase] unexpected error:', err)
    return null
  }
}

// ── Write last contact date + message back to Supabase ────────────────────────

export async function updatePastBuyerInSupabase(
  id: number,
  updates: {
    lastContactDate?: string
    lastMessage?: string
    notes?: string
    personalisationHook?: string
  }
): Promise<boolean> {
  if (!supabaseConnected()) return false
  try {
    const client = getSupabaseClient()
    const { error } = await client
      .from('past_buyers')
      .update({
        ...(updates.lastContactDate && { last_contact_date: updates.lastContactDate }),
        ...(updates.lastMessage     && { last_message: updates.lastMessage }),
        ...(updates.notes           && { notes: updates.notes }),
        ...(updates.personalisationHook && { personalisation_hook: updates.personalisationHook }),
      })
      .eq('id', id)

    if (error) {
      console.error('[supabase] updatePastBuyer error:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

// ── Upsert a new contact to Supabase (from Add Contact form) ──────────────────

export async function upsertPastBuyerToSupabase(buyer: PastBuyer, agentName: string): Promise<boolean> {
  if (!supabaseConnected()) return false
  try {
    const client = getSupabaseClient()
    // Split name into first/last for the table schema
    const nameParts = buyer.name.trim().split(/\s+/)
    const lead_last_name  = nameParts.length > 1 ? nameParts.pop()! : null
    const lead_first_name = nameParts.join(" ") || buyer.name
    const { error } = await client
      .from('past_buyers')
      .upsert({
        id:               buyer.id,
        rea_agent_name:   agentName,
        lead_first_name,
        lead_last_name,
        lead_phone:       buyer.phone,
        lead_email:       buyer.email ?? null,
        purchase_address: buyer.purchaseAddress,
        suburb:           buyer.suburb,
        purchase_date:    buyer.purchaseDate,
        purchase_price:   buyer.purchasePrice,
        deposit:          buyer.deposit ?? null,
        property_type:    buyer.propertyType,
        beds:             buyer.beds,
        baths:            buyer.baths,
        land:             buyer.land ?? null,
        status:           buyer.status,
        notes:            buyer.notes,
        last_contact_date:         buyer.lastContactDate ?? null,
        personalisation_hook:      buyer.personalisationHook ?? null,
        current_estimate_override: buyer.currentEstimateOverride ?? null,
      }, { onConflict: 'id' })

    if (error) {
      console.error('[supabase] upsertPastBuyer error:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}
