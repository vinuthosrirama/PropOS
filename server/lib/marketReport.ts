/**
 * Market report generator — produces a suburb-level text snapshot from
 * rea_data stored on sms_contacts. Once SOLD_DB is pushed to Supabase this
 * can be enriched with real transaction data; for now it synthesises what
 * agents have in their contact cards.
 */

import { generateChatJSON, llmConfigured } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import type { SmsContact } from "./smsContacts.js"
import type { AgentContext } from "./smsAgent.js"

export interface MarketReportResult {
  suburb: string
  report: string          // 2-3 sentence SMS-ready summary
  keyStat: string | null  // e.g. "$742k median" — shown in the opener
  sentiment: "bullish" | "neutral" | "cautious"
  dataPoints: number      // how many rea_data entries were used
}

function fallback(suburb: string): MarketReportResult {
  return {
    suburb,
    report: `${suburb} is showing steady buyer demand with a healthy level of new listings. Recent sales indicate strong interest from both owner-occupiers and investors. Happy to dig into specifics if useful.`,
    keyStat: null,
    sentiment: "neutral",
    dataPoints: 0,
  }
}

export async function generateMarketReport(
  suburb: string,
  contacts: SmsContact[],
  agent: AgentContext,
): Promise<MarketReportResult> {
  const rea = contacts.map(c => {
    const d = (c.rea_data ?? {}) as Record<string, unknown>
    return {
      agency:          d.agency_name as string | undefined,
      recently_sold:   d.recently_sold_address as string | undefined,
      sold_price:      d.recently_sold_price as string | undefined,
      dom:             d.recently_sold_days_on_market as number | undefined,
      listing_count:   d.currently_listing_count as number | undefined,
      listings:        d.currently_listing,
      target_suburbs:  d.target_suburbs,
    }
  }).filter(d => d.sold_price || (d.listing_count ?? 0) > 0)

  if (!llmConfigured() || rea.length === 0) return fallback(suburb)

  const prompt = `You are ${agent.name} from ${agent.agency}, writing a market update for ${suburb}.

Agent data points (from active agents in this suburb):
${JSON.stringify(rea, null, 2)}

Write a concise 2-3 sentence market update for ${suburb} suitable for an SMS conversation. Requirements:
- If sold prices are present, reference the price range or a specific figure
- If listings are present, note demand/supply
- Confident but not hype-y — real professional tone
- No em-dashes. No AI mentions. Under 200 characters if possible.

Return ONLY this JSON (no markdown):
{"report":"...","key_stat":"one headline figure e.g. $742k median or 18 days on market","sentiment":"bullish|neutral|cautious"}`

  try {
    const raw = await generateChatJSON(prompt, 350)
    const parsed = JSON.parse(raw) as { report?: string; key_stat?: string; sentiment?: string }
    const report = sanitiseText(parsed.report ?? fallback(suburb).report)
    return {
      suburb,
      report,
      keyStat: parsed.key_stat ? sanitiseText(parsed.key_stat) : null,
      sentiment: (parsed.sentiment as MarketReportResult["sentiment"]) ?? "neutral",
      dataPoints: rea.length,
    }
  } catch {
    return fallback(suburb)
  }
}
