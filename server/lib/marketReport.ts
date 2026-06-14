import { generateChatJSON, llmConfigured } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import { getSuburbStats } from "./suburbStats.js"
import type { SmsContact } from "./smsContacts.js"
import type { AgentContext } from "./smsAgent.js"

export interface MarketReportResult {
  suburb: string
  report: string
  keyStat: string | null
  sentiment: "bullish" | "neutral" | "cautious"
  dataPoints: number
  fromSoldDb: boolean
}

function fallback(suburb: string): MarketReportResult {
  return {
    suburb,
    report: `${suburb} is showing steady buyer demand with a healthy level of new listings. Recent sales indicate strong interest from both owner-occupiers and investors. Happy to dig into specifics if useful.`,
    keyStat: null,
    sentiment: "neutral",
    dataPoints: 0,
    fromSoldDb: false,
  }
}

function formatPrice(n: number): string {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}m`
    : `$${Math.round(n / 1000)}k`
}

export async function generateMarketReport(
  suburb: string,
  contacts: SmsContact[],
  agent: AgentContext,
): Promise<MarketReportResult> {
  // Real sold data takes priority over rea_data estimates
  const soldStats = await getSuburbStats(suburb, 90)

  const rea = contacts.map(c => {
    const d = (c.rea_data ?? {}) as Record<string, unknown>
    return {
      agency:        d.agency_name as string | undefined,
      recently_sold: d.recently_sold_address as string | undefined,
      sold_price:    d.recently_sold_price as string | undefined,
      dom:           d.recently_sold_days_on_market as number | undefined,
      listing_count: d.currently_listing_count as number | undefined,
    }
  }).filter(d => d.sold_price || (d.listing_count ?? 0) > 0)

  const hasSoldData = soldStats.saleCount > 0
  const hasReaData  = rea.length > 0

  if (!llmConfigured() && !hasSoldData && !hasReaData) return fallback(suburb)

  // Build a keyStat from real data even if LLM is unavailable
  let derivedKeyStat: string | null = null
  if (hasSoldData && soldStats.medianPrice) {
    const parts = [`${formatPrice(soldStats.medianPrice)} median`]
    if (soldStats.avgDaysOnMarket) parts.push(`${soldStats.avgDaysOnMarket} days avg`)
    derivedKeyStat = parts.join(", ")
  }

  if (!llmConfigured()) {
    if (hasSoldData) {
      const s = soldStats
      return {
        suburb,
        report: `${suburb} has seen ${s.saleCount} sales in the past 90 days with a median of ${formatPrice(s.medianPrice!)}${s.avgDaysOnMarket ? ` and ${s.avgDaysOnMarket} days average on market` : ""}. ${s.minPrice && s.maxPrice ? `Sales ranged from ${formatPrice(s.minPrice)} to ${formatPrice(s.maxPrice)}.` : ""} Happy to share specifics.`,
        keyStat: derivedKeyStat,
        sentiment: s.avgDaysOnMarket && s.avgDaysOnMarket < 25 ? "bullish" : "neutral",
        dataPoints: s.saleCount,
        fromSoldDb: true,
      }
    }
    return fallback(suburb)
  }

  const contextBlocks: string[] = []

  if (hasSoldData) {
    contextBlocks.push(`SOLD_DB (last 90 days, ${soldStats.saleCount} sales):
- Median price: ${soldStats.medianPrice ? formatPrice(soldStats.medianPrice) : "unknown"}
- Avg days on market: ${soldStats.avgDaysOnMarket ?? "unknown"}
- Price range: ${soldStats.minPrice ? formatPrice(soldStats.minPrice) : "?"} – ${soldStats.maxPrice ? formatPrice(soldStats.maxPrice) : "?"}
- Recent: ${soldStats.recentSales.slice(0, 3).map(s => `${s.address} ${formatPrice(s.price)}${s.days_on_market ? ` (${s.days_on_market}d)` : ""}`).join("; ")}`)
  }

  if (hasReaData) {
    contextBlocks.push(`Agent intelligence (from contacts in this suburb):
${JSON.stringify(rea, null, 2)}`)
  }

  if (contextBlocks.length === 0) return fallback(suburb)

  const prompt = `You are ${agent.name} from ${agent.agency}, writing a market update for ${suburb}.

${contextBlocks.join("\n\n")}

Write a concise 2-3 sentence market update for ${suburb} suitable for an SMS conversation.
- Lead with the strongest data point (real sold figures if available)
- Mention supply/demand if listings data is present
- Confident and professional, not hype-y
- No em-dashes. No AI mentions. Under 220 characters total.

Return ONLY this JSON (no markdown):
{"report":"...","key_stat":"one headline e.g. $742k median or 18 days avg","sentiment":"bullish|neutral|cautious"}`

  try {
    const raw = await generateChatJSON(prompt, 350)
    const parsed = JSON.parse(raw) as { report?: string; key_stat?: string; sentiment?: string }
    return {
      suburb,
      report: sanitiseText(parsed.report ?? fallback(suburb).report),
      keyStat: parsed.key_stat ? sanitiseText(parsed.key_stat) : derivedKeyStat,
      sentiment: (parsed.sentiment as MarketReportResult["sentiment"]) ?? "neutral",
      dataPoints: soldStats.saleCount + rea.length,
      fromSoldDb: hasSoldData,
    }
  } catch {
    return fallback(suburb)
  }
}
