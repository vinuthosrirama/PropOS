/**
 * Shared agent-context resolver (see docs/SMS_AGENT.md, "Planned" item 4).
 *
 * Resolves an `agents.id` to the { name, agency, voiceId } shape that
 * generateOpener/generateReply/generateSuggestions expect. Used by both the
 * JWT-authenticated route layer and the autonomous ready-poller, so a
 * contact's `assigned_agent_id` behaves identically in both paths.
 */

import { query, isDbConnected } from "./db.js"
import { getAgentVoiceId } from "./voiceProfile.js"
import { DEFAULT_AGENT, type AgentContext } from "./smsAgent.js"

export async function getAgentContext(agentId?: number | null): Promise<AgentContext> {
  if (!agentId || !isDbConnected()) return DEFAULT_AGENT
  try {
    const rows = await query<{ name: string; agency: string | null }>(
      `SELECT name, agency FROM agents WHERE id = $1 LIMIT 1`,
      [agentId],
    )
    const row = rows[0]
    if (!row?.name) return DEFAULT_AGENT
    return {
      name: row.name,
      agency: row.agency ?? DEFAULT_AGENT.agency,
      voiceId: getAgentVoiceId(agentId),
    }
  } catch {
    return DEFAULT_AGENT
  }
}
