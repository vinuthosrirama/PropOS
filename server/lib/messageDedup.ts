/**
 * Cross-process inbound message dedup (see docs/SMS_AGENT.md, Known issue #7).
 *
 * Local dev and production share one Supabase database. If BlueBubbles fans
 * the same inbound webhook out to multiple registered endpoints, both
 * processes would otherwise run handleIncomingReply for the same message.
 * Claiming the BlueBubbles message guid here makes processing idempotent
 * regardless of which process (or how many) receive the webhook.
 */

import { query, isDbConnected } from "./db.js"

/** Returns true the first time this guid is seen (caller should process it),
 * false if another process already claimed it (caller should skip). */
export async function claimMessageGuid(guid: string): Promise<boolean> {
  if (!guid || !isDbConnected()) return true
  const rows = await query(
    `INSERT INTO processed_message_guids (guid) VALUES ($1) ON CONFLICT DO NOTHING RETURNING guid`,
    [guid],
  )
  return rows.length > 0
}
