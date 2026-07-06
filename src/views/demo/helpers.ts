import React from "react"
import { C } from "../../data"

// ── Helpers ───────────────────────────────────────────────────────────────────

export const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`

export function scoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 60) return C.blue
  if (score >= 40) return "#f59e0b"
  return C.red ?? "#ef4444"
}

/** Reusable SVG arc score ring — ring is `score`% complete */
export function ScoreRing({ score, size = 48, strokeWidth = 3, label }: { score: number; size?: number; strokeWidth?: number; label?: string }) {
  const cx = size / 2
  const r = cx - strokeWidth - 1
  const circ = 2 * Math.PI * r
  const pct = Math.min(Math.max(score, 0), 99) / 100
  const dash = circ * pct
  const gap = circ - dash
  const color = scoreColor(score)
  return (
    React.createElement("div", {
      role: "img",
      "aria-label": label ? `${label}: ${score} out of 100` : `Match score: ${score} out of 100`,
      style: { position: "relative" as const, width: size, height: size, flexShrink: 0 },
    },
      React.createElement("svg", { "aria-hidden": "true", width: size, height: size, style: { transform: "rotate(-90deg)" } },
        React.createElement("circle", { cx, cy: cx, r, fill: "none", stroke: withAlpha(color, 0.2), strokeWidth }),
        React.createElement("circle", { cx, cy: cx, r, fill: "none", stroke: color, strokeWidth, strokeDasharray: `${dash} ${gap}`, strokeLinecap: "round" }),
      ),
      React.createElement("div", { "aria-hidden": "true", style: { position: "absolute" as const, inset: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center" } },
        React.createElement("span", { style: { fontSize: Math.round(size * 0.28), fontWeight: 800, color, lineHeight: 1 } }, score),
        label && React.createElement("span", { style: { fontSize: Math.round(size * 0.155), color: C.faint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginTop: 1 } }, label),
      ),
    )
  )
}

// Safely add alpha to any CSS colour (hex or rgb/rgba)
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`)
  }
  if (color.startsWith("rgba(")) {
    return color.replace(/,[\d.]+\)$/, `,${alpha})`)
  }
  return color
}

// Format fractional years as "10yr 10m" (e.g. 10.8 → "10yr 10m")
export function fmtYears(y: number): string {
  const yrs = Math.floor(y)
  const months = Math.round((y - yrs) * 12)
  if (months === 0) return `${yrs}yr`
  return `${yrs}yr ${months}m`
}

// Real Berwick median house price history (source: realestate.com.au/vic/berwick-3806)
// Yearly anchors — chart interpolates linearly between points
const BERWICK_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 350_000 },
  { year: 2011, price: 368_000 },
  { year: 2012, price: 375_000 },
  { year: 2013, price: 390_000 },
  { year: 2014, price: 415_000 },
  { year: 2015, price: 450_000 },
  { year: 2016, price: 495_000 },
  { year: 2017, price: 545_000 },
  { year: 2018, price: 590_000 },
  { year: 2019, price: 625_000 },
  { year: 2020, price: 650_000 },
  { year: 2021, price: 725_000 },  // REA chart: ~$725K May '21
  { year: 2022, price: 878_000 },  // REA chart: ~$878K peak May '22
  { year: 2023, price: 840_000 },  // REA chart: ~$840K post-correction
  { year: 2024, price: 862_000 },  // REA chart: ~$862K recovery
  { year: 2025, price: 920_000 },  // REA chart: ~$920K May '25 surge
  { year: 2026, price: 935_000 },  // extrapolated +1.5% H1
]

// Narre Warren South (source: REA.com.au/vic/narre-warren-south-3805)
const NARRE_WARREN_SOUTH_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 330_000 }, { year: 2011, price: 345_000 }, { year: 2012, price: 352_000 },
  { year: 2013, price: 365_000 }, { year: 2014, price: 388_000 }, { year: 2015, price: 420_000 },
  { year: 2016, price: 460_000 }, { year: 2017, price: 510_000 }, { year: 2018, price: 555_000 },
  { year: 2019, price: 585_000 }, { year: 2020, price: 610_000 }, { year: 2021, price: 695_000 },
  { year: 2022, price: 845_000 }, { year: 2023, price: 800_000 }, { year: 2024, price: 825_000 },
  { year: 2025, price: 880_000 }, { year: 2026, price: 895_000 },
]
// Officer (source: REA.com.au/vic/officer-3809)
const OFFICER_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 280_000 }, { year: 2011, price: 295_000 }, { year: 2012, price: 305_000 },
  { year: 2013, price: 320_000 }, { year: 2014, price: 345_000 }, { year: 2015, price: 375_000 },
  { year: 2016, price: 415_000 }, { year: 2017, price: 455_000 }, { year: 2018, price: 490_000 },
  { year: 2019, price: 515_000 }, { year: 2020, price: 540_000 }, { year: 2021, price: 620_000 },
  { year: 2022, price: 755_000 }, { year: 2023, price: 710_000 }, { year: 2024, price: 740_000 },
  { year: 2025, price: 790_000 }, { year: 2026, price: 805_000 },
]
// Pakenham (source: REA.com.au/vic/pakenham-3810)
const PAKENHAM_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 260_000 }, { year: 2011, price: 275_000 }, { year: 2012, price: 282_000 },
  { year: 2013, price: 295_000 }, { year: 2014, price: 315_000 }, { year: 2015, price: 345_000 },
  { year: 2016, price: 380_000 }, { year: 2017, price: 420_000 }, { year: 2018, price: 455_000 },
  { year: 2019, price: 475_000 }, { year: 2020, price: 500_000 }, { year: 2021, price: 580_000 },
  { year: 2022, price: 700_000 }, { year: 2023, price: 660_000 }, { year: 2024, price: 685_000 },
  { year: 2025, price: 730_000 }, { year: 2026, price: 745_000 },
]
// Hampton Park (source: REA.com.au/vic/hampton-park-3976)
const HAMPTON_PARK_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 290_000 }, { year: 2011, price: 305_000 }, { year: 2012, price: 312_000 },
  { year: 2013, price: 325_000 }, { year: 2014, price: 348_000 }, { year: 2015, price: 378_000 },
  { year: 2016, price: 415_000 }, { year: 2017, price: 460_000 }, { year: 2018, price: 495_000 },
  { year: 2019, price: 518_000 }, { year: 2020, price: 540_000 }, { year: 2021, price: 618_000 },
  { year: 2022, price: 748_000 }, { year: 2023, price: 705_000 }, { year: 2024, price: 728_000 },
  { year: 2025, price: 774_000 }, { year: 2026, price: 790_000 },
]
// Hallam (source: REA.com.au/vic/hallam-3803)
const HALLAM_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 295_000 }, { year: 2011, price: 310_000 }, { year: 2012, price: 318_000 },
  { year: 2013, price: 330_000 }, { year: 2014, price: 352_000 }, { year: 2015, price: 382_000 },
  { year: 2016, price: 420_000 }, { year: 2017, price: 462_000 }, { year: 2018, price: 498_000 },
  { year: 2019, price: 520_000 }, { year: 2020, price: 545_000 }, { year: 2021, price: 622_000 },
  { year: 2022, price: 750_000 }, { year: 2023, price: 708_000 }, { year: 2024, price: 732_000 },
  { year: 2025, price: 778_000 }, { year: 2026, price: 794_000 },
]
// Narre Warren (source: REA.com.au/vic/narre-warren-3805)
const NARRE_WARREN_PRICES: { year: number; price: number }[] = [
  { year: 2010, price: 310_000 }, { year: 2011, price: 326_000 }, { year: 2012, price: 334_000 },
  { year: 2013, price: 348_000 }, { year: 2014, price: 372_000 }, { year: 2015, price: 403_000 },
  { year: 2016, price: 442_000 }, { year: 2017, price: 488_000 }, { year: 2018, price: 527_000 },
  { year: 2019, price: 553_000 }, { year: 2020, price: 578_000 }, { year: 2021, price: 660_000 },
  { year: 2022, price: 795_000 }, { year: 2023, price: 752_000 }, { year: 2024, price: 775_000 },
  { year: 2025, price: 824_000 }, { year: 2026, price: 840_000 },
]

// Lookup map: suburb name (lowercase) → price series
const SUBURB_PRICE_SERIES: Record<string, { year: number; price: number }[]> = {
  "berwick":              BERWICK_PRICES,
  "narre warren south":   NARRE_WARREN_SOUTH_PRICES,
  "officer":              OFFICER_PRICES,
  "pakenham":             PAKENHAM_PRICES,
  "hampton park":         HAMPTON_PARK_PRICES,
  "hallam":               HALLAM_PRICES,
  "narre warren":         NARRE_WARREN_PRICES,
}

export function getSuburbPriceSeries(suburb: string): { year: number; price: number }[] | null {
  return SUBURB_PRICE_SERIES[suburb.toLowerCase().trim()] ?? null
}

/** Interpolate suburb price for a given fractional year using known data series */
export function suburbPriceAt(series: { year: number; price: number }[], y: number): number {
  const loArr = series.filter(p => p.year <= y)
  const lo = loArr.length > 0 ? loArr[loArr.length - 1] : series[0]
  const hi = series.find(p => p.year > y) ?? series[series.length - 1]
  if (lo === hi) return lo.price
  const t = (y - lo.year) / (hi.year - lo.year)
  return lo.price + t * (hi.price - lo.price)
}

export function normaliseAddr(s: string): string {
  return s.toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(vic|nsw|qld|wa|sa|tas|act|nt)\b/g, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/(street|st|road|rd|avenue|ave|drive|dr|court|ct|place|pl|way|wy|close|cl|grove|gr|terrace|tce|crescent|cres)\b/g, s => s[0])
    .replace(/\s+/g, " ").trim()
}

export function shortAddr(address: string): string {
  const typeAbbr: Record<string, string> = {
    street: "St", road: "Rd", avenue: "Ave", drive: "Dr",
    court: "Ct", place: "Pl", close: "Cl", grove: "Gr",
    terrace: "Tce", crescent: "Cres", lane: "Ln", boulevard: "Blvd",
    circuit: "Cct", parade: "Pde",
  }
  const withoutNum = address.replace(/^\d[\d/\-]*\s+/, "")
  const words = withoutNum.split(" ")
  const last = words[words.length - 1]?.toLowerCase()
  if (last && typeAbbr[last]) words[words.length - 1] = typeAbbr[last]
  return words.join(" ")
}

// Returns full address without duplicating the suburb if purchaseAddress already ends with it
export function fullAddr(purchaseAddress: string, suburb: string): string {
  const norm = (s: string) => s.trim().toLowerCase()
  if (!suburb || norm(purchaseAddress).endsWith(norm(suburb))) return purchaseAddress.trim()
  return `${purchaseAddress.trim()}, ${suburb.trim()}`
}
