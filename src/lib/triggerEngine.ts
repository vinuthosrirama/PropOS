/**
 * Market Trigger Engine
 *
 * Computes portfolio-level market triggers from a buyer database.
 * Pure computation — no React, no side effects.
 *
 * Each trigger is a market event with a list of affected contacts
 * and a personalised reason for each contact.
 */

import type { PastBuyer } from "../data/pastBuyers"

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerType =
  | "comparable_sale"
  | "rate_change"
  | "cgt_window"
  | "tenant_vacancy"
  | "life_event"
  | "dom_spike"
  | "vacancy_alert"
  | "equity_milestone"

export type TriggerPriority = "urgent" | "high" | "medium"

export interface TriggerContact {
  id: number
  name: string
  address: string
  phone: string
  reason: string
}

export interface Trigger {
  id: string
  type: TriggerType
  priority: TriggerPriority
  icon: string
  label: string
  title: string
  subtitle: string
  insight: string
  dataPoint: string
  affectedContacts: TriggerContact[]
  suggestedAction: string
  actionLabel: string
  triggeredAt: string   // ISO date string
  expiresIn: string
  suburb?: string
}

// ── Seeded demo data ──────────────────────────────────────────────────────────

const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().slice(0, 10)

interface SuburbSale {
  address: string
  suburb: string
  beds: number
  propertyType: "House" | "Unit" | "Townhouse"
  soldPrice: number
  soldDate: string
  daysAgo: number
}

const RECENT_SUBURB_SALES: SuburbSale[] = [
  {
    address: "38 Banksia Road",
    suburb: "Berwick",
    beds: 4,
    propertyType: "House",
    soldPrice: 1_080_000,
    soldDate: "2026-05-30",
    daysAgo: 4,
  },
  {
    address: "5 Hartsmere Rise",
    suburb: "Berwick",
    beds: 5,
    propertyType: "House",
    soldPrice: 1_240_000,
    soldDate: "2026-05-28",
    daysAgo: 6,
  },
  {
    address: "7 Rosewood Court",
    suburb: "Narre Warren South",
    beds: 4,
    propertyType: "House",
    soldPrice: 940_000,
    soldDate: "2026-05-26",
    daysAgo: 8,
  },
]

interface StaleListing {
  address: string
  suburb: string
  beds: number
  propertyType: "House" | "Unit" | "Townhouse"
  listPrice: number
  dom: number
  priceReductions: number
}

const STALE_LISTINGS: StaleListing[] = [
  {
    address: "14 Cranbourne-Berwick Road",
    suburb: "Berwick",
    beds: 3,
    propertyType: "House",
    listPrice: 875_000,
    dom: 54,
    priceReductions: 2,
  },
]

const SUBURB_VACANCY: Record<string, number> = {
  "Berwick": 0.9,
  "Narre Warren South": 1.1,
  "Hallam": 1.4,
  "Hampton Park": 1.8,
  "Narre Warren": 1.3,
}

const RATE_EVENT = {
  date: "2026-05-07",
  cutBps: 25,
  newRate: 3.85,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function yearsSince(dateStr: string): number {
  const d = new Date(dateStr)
  return (TODAY.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${(n / 1_000).toFixed(0)}K`
}

function firstName(name: string): string {
  return name.split("&")[0].split(" ")[0].trim()
}

const PRIORITY_ORDER: Record<TriggerPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
}

// ── Trigger computers ─────────────────────────────────────────────────────────

function computeComparableSaleTriggers(buyers: PastBuyer[]): Trigger[] {
  const triggers: Trigger[] = []

  for (const sale of RECENT_SUBURB_SALES) {
    const contacts: TriggerContact[] = []

    for (const b of buyers) {
      if (b.suburb.toLowerCase() !== sale.suburb.toLowerCase()) continue
      if (b.propertyType !== sale.propertyType) continue
      // Within 2 beds of the sold property
      if (Math.abs(b.beds - sale.beds) > 2) continue

      const held = yearsSince(b.purchaseDate)
      const fn = firstName(b.name)

      let reason: string
      if (b.status === "investor") {
        reason = `${sale.address} sold for ${fmtPrice(sale.soldPrice)} — ${b.beds}bd/${sale.beds}bd comp sets a strong benchmark for ${b.purchaseAddress}`
      } else if (b.beds <= sale.beds) {
        reason = `Comparable ${sale.beds}bd in ${sale.suburb} just hit ${fmtPrice(sale.soldPrice)} — ${fn}'s ${b.beds}bd is likely worth more than they think (${Math.round(held)}yr hold)`
      } else {
        reason = `${sale.address} at ${fmtPrice(sale.soldPrice)} gives ${fn} a live price anchor — ${held.toFixed(1)}yr hold creates urgency`
      }

      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason,
      })
    }

    if (contacts.length === 0) continue

    triggers.push({
      id: `comparable_sale_${sale.suburb.replace(/\s/g, "_").toLowerCase()}_${sale.soldDate}`,
      type: "comparable_sale",
      priority: sale.daysAgo <= 5 ? "high" : "medium",
      icon: "🏡",
      label: "New comparable sale",
      title: `${sale.address} sold for ${fmtPrice(sale.soldPrice)}`,
      subtitle: `${sale.suburb} · ${sale.beds}bd house · ${sale.daysAgo} days ago`,
      insight: `A strong comparable result in ${sale.suburb} gives ${contacts.length} of your contacts a live price anchor — the perfect conversation starter.`,
      dataPoint: fmtPrice(sale.soldPrice),
      affectedContacts: contacts,
      suggestedAction: `Reference this sale to reopen the conversation about their property's current value.`,
      actionLabel: "Generate comp outreach",
      triggeredAt: sale.soldDate,
      expiresIn: "14 days",
      suburb: sale.suburb,
    })
  }

  return triggers
}

function computeRateChangeTrigger(buyers: PastBuyer[]): Trigger | null {
  // Affects investors (cash flow improvement) and owners who might upgrade
  const contacts: TriggerContact[] = []

  for (const b of buyers) {
    if (b.status === "investor") {
      const fn = firstName(b.name)
      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `Rate cut improves ${fn}'s net yield — ideal time to discuss whether to hold or sell before further rate moves`,
      })
    } else if (b.status === "owner-occupier") {
      const fn = firstName(b.name)
      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `Lower rates expand ${fn}'s buying power for an upgrade — reduces hesitation about carrying two mortgages`,
      })
    }
  }

  if (contacts.length === 0) return null

  return {
    id: `rate_change_${RATE_EVENT.date}`,
    type: "rate_change",
    priority: "high",
    icon: "📉",
    label: "RBA rate cut",
    title: `RBA cut rates ${RATE_EVENT.cutBps}bps — now ${RATE_EVENT.newRate}%`,
    subtitle: `Announced ${RATE_EVENT.date} · Borrowing power up ~${RATE_EVENT.cutBps * 8 / 1000}% for your contacts`,
    insight: `Rate cuts increase buyer activity within 6-8 weeks. Your vendor contacts who've been hesitant about selling into a soft market now have a stronger pool of motivated buyers.`,
    dataPoint: `${RATE_EVENT.newRate}% p.a.`,
    affectedContacts: contacts,
    suggestedAction: "Reach out while rate sentiment is positive — buyers are re-entering the market.",
    actionLabel: "Generate rate outreach",
    triggeredAt: RATE_EVENT.date,
    expiresIn: "6 weeks",
  }
}

function computeCgtWindowTrigger(buyers: PastBuyer[]): Trigger | null {
  // CGT discount potentially changing July 2027 — investors and long-hold owners
  const contacts: TriggerContact[] = []

  for (const b of buyers) {
    const held = yearsSince(b.purchaseDate)
    if (held < 1) continue  // hasn't hit 12-month discount threshold yet

    const fn = firstName(b.name)
    const mentionsCgt = /cgt|capital gains|discount|2027/i.test(b.notes)

    if (b.status === "investor") {
      let reason: string
      if (mentionsCgt) {
        reason = `${fn} has already asked about CGT — ${held.toFixed(1)}yr hold means the discount applies now. The July 2027 deadline is 13 months away.`
      } else {
        reason = `${fn}'s ${held.toFixed(1)}yr hold qualifies for the 50% CGT discount. If the discount changes in 2027, selling now maximises their tax saving.`
      }
      contacts.push({ id: b.id, name: b.name, address: b.purchaseAddress, phone: b.phone, reason })
    } else if (b.status === "owner-occupier" && held >= 5) {
      // Long-hold owners have CGT exposure if they have a home office or investment component
      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s ${Math.floor(held)}-year hold means significant equity — a timely conversation about the 2027 CGT change could unlock a decision.`,
      })
    }
  }

  if (contacts.length === 0) return null

  return {
    id: "cgt_window_2027",
    type: "cgt_window",
    priority: "high",
    icon: "⏱️",
    label: "CGT deadline",
    title: "50% CGT discount window closes July 2027",
    subtitle: "13 months to help investors lock in the discount",
    insight: "Proposed changes to the CGT 50% discount may take effect July 2027. Investors who sell before then lock in the current regime — a potential saving of $20K–$80K for typical SE Melbourne properties.",
    dataPoint: "July 2027",
    affectedContacts: contacts,
    suggestedAction: "Send a personalised CGT analysis. Numbers close deals — estimate their specific saving.",
    actionLabel: "Generate CGT outreach",
    triggeredAt: TODAY_STR,
    expiresIn: "13 months",
  }
}

function computeTenantVacancyTrigger(buyers: PastBuyer[]): Trigger | null {
  const urgentContacts: TriggerContact[] = []
  const upcomingContacts: TriggerContact[] = []

  for (const b of buyers) {
    if (b.status !== "investor") continue
    const fn = firstName(b.name)
    const notes = b.notes.toLowerCase()

    // Month-to-month — urgent
    if (/month-to-month|month to month/.test(notes)) {
      urgentContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s tenant is month-to-month — no re-lease commitment. This is the lowest-friction window to sell with vacant possession.`,
      })
      continue
    }

    // Lease expires this month or next — urgent
    const leaseExpiresSoon = /lease expires june 2026|lease expires july 2026|tenant.*due.*june|tenant.*vacate.*june/i.test(b.notes)
    if (leaseExpiresSoon) {
      urgentContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s tenant lease expires this month — a vacant property sells faster and to a wider buyer pool. Timing is perfect.`,
      })
      continue
    }

    // Lease expires within 6 months
    const leaseSoon = /lease expires (august|september|october|november|december) 2026|lease expires (jan|feb|mar) 2027/i.test(b.notes)
    if (leaseSoon) {
      const match = b.notes.match(/lease expires (\w+ \d{4})/i)
      const when = match ? match[1] : "later this year"
      upcomingContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s lease expires ${when} — a 6-week campaign started now would align settlement with vacant possession.`,
      })
    }
  }

  const allContacts = [...urgentContacts, ...upcomingContacts]
  if (allContacts.length === 0) return null

  return {
    id: "tenant_vacancy_jun2026",
    type: "tenant_vacancy",
    priority: urgentContacts.length > 0 ? "urgent" : "high",
    icon: "🔑",
    label: "Tenant vacancy",
    title: urgentContacts.length > 0
      ? `${urgentContacts.length} investor${urgentContacts.length > 1 ? "s" : ""} with vacant or expiring tenancies`
      : "Upcoming tenant vacancies",
    subtitle: urgentContacts.length > 0
      ? "Vacant possession = wider buyer pool, faster sale"
      : "Lease renewals due — prime window to discuss selling",
    insight: "Properties with vacant possession typically sell 8–12% faster and attract owner-occupier buyers who pay a premium. Lease expiry is the #1 catalyst for investor sales.",
    dataPoint: `${urgentContacts.length} now · ${upcomingContacts.length} upcoming`,
    affectedContacts: allContacts,
    suggestedAction: "Contact now — before the lease renews. Once re-leased, motivation drops for 12+ months.",
    actionLabel: "Generate vacancy outreach",
    triggeredAt: TODAY_STR,
    expiresIn: urgentContacts.length > 0 ? "2 weeks" : "6 weeks",
  }
}

function computeLifeEventTrigger(buyers: PastBuyer[]): Trigger | null {
  const urgentContacts: TriggerContact[] = []
  const upcomingContacts: TriggerContact[] = []

  for (const b of buyers) {
    const fn = firstName(b.name)
    const notes = b.notes.toLowerCase()

    // Baby already arrived, already cramped
    const babyRecent = /baby.*(\d+) months|(\d+) months.*baby|newborn|infant.*month/i.test(b.notes)
    if (babyRecent) {
      const monthsMatch = b.notes.match(/(\d+)\s*months?/i)
      const months = monthsMatch ? monthsMatch[1] : "a few"
      urgentContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s baby is ${months} months old and they're already running out of room — the pain is real and recent. Act now before they find another agent.`,
      })
      continue
    }

    // Baby due within 3 months (urgency)
    const babyDueUrgent = /baby due (june|july|august) 2026|due.*in.*weeks/i.test(b.notes)
    if (babyDueUrgent) {
      urgentContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s baby is due within 3 months — the window to move before the birth is closing fast. A 4-bed with settlement in time is the goal.`,
      })
      continue
    }

    // Baby due 3–9 months away
    const babyDueSoon = /baby due (september|october|november|december) 2026|baby (number|three|#3).*due|due (jan|feb|mar) 2027/i.test(b.notes)
    if (babyDueSoon) {
      const match = b.notes.match(/baby due (\w+ \d{4})/i)
      const when = match ? match[1] : "later this year"
      upcomingContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn} has baby due ${when} — starting the conversation now means they can move without the stress of a newborn. School zone is a key motivator.`,
      })
      continue
    }

    // Kids growing up — empty nester approaching or recently empty
    const emptyNester = /kids.*moved out|children.*left|house.*big|too.*big|son.*sydney|daughter.*london|kids.*done.*school/i.test(notes)
    if (emptyNester) {
      upcomingContacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${fn}'s kids have left home — a 4–5 bed house is now too large. Downsizing frees capital and reduces maintenance stress.`,
      })
    }
  }

  const allContacts = [...urgentContacts, ...upcomingContacts]
  if (allContacts.length === 0) return null

  return {
    id: "life_event_2026",
    type: "life_event",
    priority: urgentContacts.length > 0 ? "urgent" : "high",
    icon: "👨‍👩‍👧",
    label: "Life stage change",
    title: urgentContacts.length > 0
      ? "Growing families need more space — now"
      : "Life-stage changes driving upsizing demand",
    subtitle: urgentContacts.length > 0
      ? "Babies arriving, current homes already too small"
      : "Family size changes creating real motivation to move",
    insight: "Life-stage triggers are the #1 reason owner-occupiers sell. A new baby typically drives a transaction within 6 months — the most time-sensitive buyer motivation in the market.",
    dataPoint: `${urgentContacts.length} urgent · ${upcomingContacts.length} upcoming`,
    affectedContacts: allContacts,
    suggestedAction: "These contacts have real urgency. Lead with empathy, not sales — offer to show them what they could upgrade to.",
    actionLabel: "Generate family outreach",
    triggeredAt: TODAY_STR,
    expiresIn: urgentContacts.length > 0 ? "3 weeks" : "3 months",
  }
}

function computeDomSpikeTrigger(buyers: PastBuyer[]): Trigger | null {
  const listing = STALE_LISTINGS[0]

  // DOM spike = a competitor's listing is struggling — opportunity to position against it
  // Targets: buyers in the same suburb who are owner-occupiers and might be watching the market
  const contacts: TriggerContact[] = []

  for (const b of buyers) {
    if (b.suburb.toLowerCase() !== listing.suburb.toLowerCase()) continue
    if (b.propertyType !== listing.propertyType) continue
    // Their property is similar size to the stale listing
    if (Math.abs(b.beds - listing.beds) > 1) continue

    const fn = firstName(b.name)
    contacts.push({
      id: b.id,
      name: b.name,
      address: b.purchaseAddress,
      phone: b.phone,
      reason: `${fn} has a ${b.beds}bd house in ${b.suburb} — they're watching the market. ${listing.dom} DOM on a comparable nearby listing shows why agent choice and pricing strategy matters.`,
    })
  }

  if (contacts.length === 0) return null

  return {
    id: `dom_spike_${listing.address.replace(/\s/g, "_").toLowerCase()}`,
    type: "dom_spike",
    priority: "medium",
    icon: "📊",
    label: "Stale listing nearby",
    title: `${listing.address} stuck at ${listing.dom} days on market`,
    subtitle: `${listing.suburb} · ${listing.beds}bd · ${listing.priceReductions} price reductions`,
    insight: `A comparable ${listing.beds}bd in ${listing.suburb} has been sitting for ${listing.dom} days with ${listing.priceReductions} price cuts. Your contacts who are watching the market will have noticed — position yourself as the agent who gets it right first time.`,
    dataPoint: `${listing.dom} DOM`,
    affectedContacts: contacts,
    suggestedAction: `Use this as a gentle conversation opener: "I've been watching the market closely — there's a lesson in what's happening on Cranbourne-Berwick Rd right now."`,
    actionLabel: "Generate market update",
    triggeredAt: TODAY_STR,
    expiresIn: "3 weeks",
    suburb: listing.suburb,
  }
}

function computeVacancyAlertTrigger(buyers: PastBuyer[]): Trigger | null {
  const investors = buyers.filter(b => b.status === "investor")
  if (investors.length === 0) return null

  const contacts: TriggerContact[] = []

  for (const b of investors) {
    const vacancy = SUBURB_VACANCY[b.suburb]
    if (!vacancy) continue
    const fn = firstName(b.name)

    if (vacancy <= 1.0) {
      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${b.suburb} vacancy is ${vacancy}% — finding a quality tenant after ${fn}'s current one leaves will be easy, but this tightness also means buyer demand is strong if they want to sell.`,
      })
    } else {
      contacts.push({
        id: b.id,
        name: b.name,
        address: b.purchaseAddress,
        phone: b.phone,
        reason: `${b.suburb} vacancy at ${vacancy}% is rising — ${fn} may face longer vacancy periods at next lease renewal. Worth discussing whether to sell while sentiment is still positive.`,
      })
    }
  }

  if (contacts.length === 0) return null

  const tightSuburbs = Object.entries(SUBURB_VACANCY).filter(([, v]) => v <= 1.0).map(([s]) => s)

  return {
    id: "vacancy_alert_jun2026",
    type: "vacancy_alert",
    priority: "medium",
    icon: "📍",
    label: "Vacancy rate alert",
    title: `${tightSuburbs.join(", ")} vacancy at record low ${Math.min(...Object.values(SUBURB_VACANCY))}%`,
    subtitle: "Tight rental supply means strong buyer demand — ideal conditions to list",
    insight: "Vacancy rates below 1% signal a landlord's market for rentals — but also strong owner-occupier demand. Investors can sell into a motivated buyer pool while rental income is maximised.",
    dataPoint: `${Math.min(...Object.values(SUBURB_VACANCY))}% vacancy`,
    affectedContacts: contacts,
    suggestedAction: "Frame the market conditions positively: low vacancy = high buyer demand = best time to sell if they're considering it.",
    actionLabel: "Generate vacancy outreach",
    triggeredAt: TODAY_STR,
    expiresIn: "4 weeks",
  }
}

function computeEquityMilestoneTrigger(buyers: PastBuyer[], valueEstimates: Record<number, number>): Trigger | null {
  const MILESTONE_THRESHOLDS = [250_000, 500_000, 750_000, 1_000_000]
  const contacts: TriggerContact[] = []

  for (const b of buyers) {
    const est = valueEstimates[b.id]
    if (!est) continue

    const equity = est - b.purchasePrice
    if (equity <= 0) continue

    const fn = firstName(b.name)

    // Check if they're approaching a milestone (within 5%)
    for (const milestone of MILESTONE_THRESHOLDS) {
      const pctToMilestone = equity / milestone
      if (pctToMilestone >= 0.92 && pctToMilestone < 1.0) {
        contacts.push({
          id: b.id,
          name: b.name,
          address: b.purchaseAddress,
          phone: b.phone,
          reason: `${fn} is ${Math.round((milestone - equity) / 1000)}K away from $${milestone >= 1_000_000 ? (milestone / 1_000_000).toFixed(1) + "M" : (milestone / 1_000).toFixed(0) + "K"} equity — a powerful psychological anchor for a conversation about what that capital could do for them.`,
        })
        break
      }
    }
  }

  if (contacts.length === 0) return null

  return {
    id: "equity_milestone_jun2026",
    type: "equity_milestone",
    priority: "medium",
    icon: "💰",
    label: "Equity milestone",
    title: `${contacts.length} contact${contacts.length > 1 ? "s" : ""} approaching an equity milestone`,
    subtitle: "Round-number equity goals are powerful decision triggers",
    insight: "Research shows homeowners are significantly more likely to sell when they can frame equity in round numbers. Approaching $500K or $1M is a natural psychological catalyst.",
    dataPoint: `${contacts.length} approaching milestone`,
    affectedContacts: contacts,
    suggestedAction: "Lead with their specific number: 'You're $X away from $500K in equity — that's the deposit for your next move.'",
    actionLabel: "Generate equity outreach",
    triggeredAt: TODAY_STR,
    expiresIn: "ongoing",
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

// Pass CURRENT_VALUE_ESTIMATES optionally for equity milestone computation
export function computeTriggers(
  buyers: PastBuyer[],
  valueEstimates: Record<number, number> = {},
): Trigger[] {
  const raw: (Trigger | Trigger[] | null)[] = [
    computeComparableSaleTriggers(buyers),
    computeRateChangeTrigger(buyers),
    computeCgtWindowTrigger(buyers),
    computeTenantVacancyTrigger(buyers),
    computeLifeEventTrigger(buyers),
    computeDomSpikeTrigger(buyers),
    computeVacancyAlertTrigger(buyers),
    computeEquityMilestoneTrigger(buyers, valueEstimates),
  ]

  const flat: Trigger[] = raw.flatMap(r => {
    if (!r) return []
    if (Array.isArray(r)) return r
    return [r]
  })

  return flat
    .filter(t => t.affectedContacts.length > 0)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority]
      const pb = PRIORITY_ORDER[b.priority]
      if (pa !== pb) return pa - pb
      return b.affectedContacts.length - a.affectedContacts.length
    })
}

export type { PastBuyer }
