import { query } from "./db.js"

export interface SuburbStats {
  suburb: string
  saleCount: number
  medianPrice: number | null
  avgDaysOnMarket: number | null
  minPrice: number | null
  maxPrice: number | null
  recentSales: Array<{
    address: string
    price: number
    sold_date: string
    days_on_market: number | null
  }>
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export async function getSuburbStats(suburb: string, daysBack = 90): Promise<SuburbStats> {
  const rows = await query<{
    address: string
    price: number | null
    sold_date: string
    days_on_market: number | null
  }>(
    `SELECT address, price, sold_date::text, days_on_market
     FROM sold_properties
     WHERE LOWER(suburb) = LOWER($1)
       AND sold_date >= CURRENT_DATE - ($2 || ' days')::interval
       AND price IS NOT NULL
     ORDER BY sold_date DESC
     LIMIT 50`,
    [suburb, String(daysBack)],
  )

  if (rows.length === 0) {
    return {
      suburb,
      saleCount: 0,
      medianPrice: null,
      avgDaysOnMarket: null,
      minPrice: null,
      maxPrice: null,
      recentSales: [],
    }
  }

  const prices = rows
    .map(r => r.price as number)
    .filter(p => p > 0)
    .sort((a, b) => a - b)

  const doms = rows
    .map(r => r.days_on_market)
    .filter((d): d is number => d !== null && d > 0)

  const avgDom =
    doms.length > 0
      ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length)
      : null

  return {
    suburb,
    saleCount: rows.length,
    medianPrice: median(prices),
    avgDaysOnMarket: avgDom,
    minPrice: prices[0] ?? null,
    maxPrice: prices[prices.length - 1] ?? null,
    recentSales: rows.slice(0, 5).map(r => ({
      address: r.address,
      price: r.price as number,
      sold_date: r.sold_date,
      days_on_market: r.days_on_market,
    })),
  }
}
