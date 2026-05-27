/**
 * Layer 4: Timing Intelligence
 *
 * Identifies the 1-2 strongest timing triggers for a given contact on
 * today's date. Injected into the vendor outreach prompt to give the AI
 * a genuine, time-sensitive reason to reach out — not just "thinking of you".
 *
 * Triggers evaluated (in priority order):
 *   1. CGT deadline         — seller saves CGT by acting before July 2027
 *   2. EOFY (May–June)      — investors review portfolios; CGT planning window
 *   3. Spring selling season — Sep–Oct: peak buyer activity
 *   4. Pre-summer rush       — Nov: last window before Christmas slowdown
 *   5. Interest rate signal  — if a rate cut/hold happened recently
 *   6. School holiday window — natural moving window for families
 *   7. Hold anniversary      — 5, 7, 10 year ownership milestones
 */

export interface TimingTrigger {
  label: string          // short label for analytics
  urgency: "high" | "medium" | "low"
  headline: string       // 1-line prompt injection (the "why now" sentence)
  smsFragment?: string   // short fragment for SMS (≤ 15 words)
}

// ---------------------------------------------------------------------------
// Victorian school term dates (approximate — updated annually)
// ---------------------------------------------------------------------------

interface TermDates {
  start: [number, number]  // [month (1-12), day]
  end:   [number, number]
}

// 2025 / 2026 Vic school terms
const VIC_SCHOOL_TERMS: TermDates[] = [
  { start: [1, 28], end: [3, 28] },   // Term 1 2025
  { start: [4, 14], end: [6, 20] },   // Term 2 2025
  { start: [7, 7],  end: [9, 19] },   // Term 3 2025
  { start: [10, 6], end: [12, 19] },  // Term 4 2025
  { start: [1, 27], end: [3, 27] },   // Term 1 2026
  { start: [4, 13], end: [6, 26] },   // Term 2 2026
  { start: [7, 13], end: [9, 18] },   // Term 3 2026
  { start: [10, 5], end: [12, 18] },  // Term 4 2026
]

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Returns the top 1-2 timing triggers relevant right now for this contact.
 */
export function getTimingTriggers(params: {
  purchaseDate: string       // ISO date — for hold anniversary check
  cgtSavingsBy2027: number   // if > 0, CGT trigger is relevant
  hasChildren: boolean       // affects school holiday trigger relevance
  pipeline?: string          // investor pipelines get EOFY trigger
}): TimingTrigger[] {
  const now = new Date()
  const month = now.getMonth() + 1    // 1-12
  const day = now.getDate()
  const triggers: TimingTrigger[] = []

  // 1. CGT deadline (July 2027) — high priority if meaningful savings
  if (params.cgtSavingsBy2027 > 5000) {
    const deadline = new Date("2027-07-01")
    const monthsLeft = Math.round((deadline.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000))
    if (monthsLeft > 0 && monthsLeft <= 24) {
      const urgency: TimingTrigger["urgency"] = monthsLeft <= 6 ? "high" : monthsLeft <= 12 ? "medium" : "low"
      triggers.push({
        label: "cgt_deadline",
        urgency,
        headline: `The current 50% CGT discount applies until July 2027. That's ${monthsLeft} months away. Selling before then saves approximately $${Math.round(params.cgtSavingsBy2027 / 1000)}K in tax.`,
        smsFragment: `${monthsLeft}mo left on the 50% CGT discount`,
      })
    }
  }

  // 2. EOFY — May and June (investors reviewing portfolios)
  if ((month === 5 || month === 6) &&
    (params.pipeline?.startsWith("investor") || params.pipeline === "owner-to-seller")) {
    const daysToEOFY = month === 5
      ? (30 - day) + 30   // days left in May + all of June
      : 30 - day
    triggers.push({
      label: "eofy",
      urgency: daysToEOFY < 14 ? "high" : "medium",
      headline: `With the end of financial year ${daysToEOFY < 30 ? `only ${daysToEOFY} days away` : "approaching"}, now is the prime window for investors to review their portfolio and make strategic decisions about capital gains timing.`,
      smsFragment: "EOFY is the right time to review your position",
    })
  }

  // 3. Spring selling season — September and October
  if (month === 9 || month === 10) {
    const weeksIn = month === 9 ? Math.ceil(day / 7) : Math.ceil(day / 7) + 4
    triggers.push({
      label: "spring_season",
      urgency: weeksIn <= 4 ? "high" : "medium",
      headline: `We're ${weeksIn <= 2 ? "just entering" : "well into"} the spring selling season. Melbourne's most active market window. Buyer competition is at its highest right now, which typically pushes prices 5-8% above guide.`,
      smsFragment: "Spring season = highest buyer competition of the year",
    })
  }

  // 4. Pre-summer rush — November (last window before Christmas)
  if (month === 11 && day <= 25) {
    triggers.push({
      label: "pre_summer",
      urgency: day >= 15 ? "high" : "medium",
      headline: `November is the last active selling window before Christmas. Buyers who missed out in spring are highly motivated, and there's typically 3-4 weeks of strong auction results before the market quietens.`,
      smsFragment: "Last strong selling window before Christmas",
    })
  }

  // 5. Winter buyer drought warning — July (sell before winter slows things)
  if (month === 7 && day <= 15) {
    triggers.push({
      label: "winter_warning",
      urgency: "low",
      headline: `The market typically quietens through winter. Most agents see a 15-20% drop in buyer enquiry from July onwards. Vendors who list in the next few weeks often get better outcomes than waiting until spring.`,
      smsFragment: "Act before winter slows buyer activity",
    })
  }

  // 6. School holiday window (families prefer to move during holidays)
  if (params.hasChildren) {
    const holidayWindow = getNextSchoolHolidayWindow(now)
    if (holidayWindow) {
      triggers.push({
        label: "school_holiday",
        urgency: "low",
        headline: `For families with school-age children, the ${holidayWindow} school holidays are a natural window to make a move. Minimal disruption to the kids' routines.`,
        smsFragment: `School holidays = natural moving window`,
      })
    }
  }

  // 7. Hold anniversary milestones
  if (params.purchaseDate) {
    const milestoneYears = getComingMilestone(params.purchaseDate, now)
    if (milestoneYears) {
      triggers.push({
        label: "hold_anniversary",
        urgency: "low",
        headline: `${milestoneYears} years is a significant ownership milestone. A natural time to reflect on whether the property is still working hard for you financially.`,
        smsFragment: `${milestoneYears}-year anniversary is a natural decision point`,
      })
    }
  }

  // Return top 2 by urgency (high first)
  const ranked = triggers.sort((a, b) => {
    const score = { high: 3, medium: 2, low: 1 }
    return score[b.urgency] - score[a.urgency]
  })

  return ranked.slice(0, 2)
}

// ---------------------------------------------------------------------------
// Prompt block renderer
// ---------------------------------------------------------------------------

export function renderTimingBlock(triggers: TimingTrigger[]): string {
  if (triggers.length === 0) return ""
  const lines = triggers.map(t => `• ${t.headline}`)
  return `=== TIMING TRIGGERS (why now is the right moment) ===\n${lines.join("\n")}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextSchoolHolidayWindow(now: Date): string | null {
  const month = now.getMonth() + 1
  const day = now.getDate()

  // Are we currently in holidays or about to be?
  for (const term of VIC_SCHOOL_TERMS) {
    const termEndMonth = term.end[0]
    const termEndDay = term.end[1]
    const termStartMonth = term.start[0]
    const termStartDay = term.start[1]

    // Are we within 3 weeks of end of term (about to be holidays)?
    const termEnd = new Date(now.getFullYear(), termEndMonth - 1, termEndDay)
    const daysToTermEnd = Math.round((termEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

    if (daysToTermEnd >= 0 && daysToTermEnd <= 21) {
      // Name the holiday
      if (termEndMonth >= 12) return "summer"
      if (termEndMonth >= 9 && termEndMonth <= 10) return "spring"
      if (termEndMonth >= 6 && termEndMonth <= 7) return "winter"
      return "autumn"
    }
  }
  return null
}

function getComingMilestone(purchaseDateStr: string, now: Date): number | null {
  try {
    const purchaseDate = new Date(purchaseDateStr)
    const yearsHeld = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

    // Check if a milestone (5, 7, 10, 15) is within 3 months
    for (const milestone of [5, 7, 10, 15]) {
      const milestoneDate = new Date(purchaseDate)
      milestoneDate.setFullYear(milestoneDate.getFullYear() + milestone)
      const daysToMilestone = Math.round((milestoneDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      if (daysToMilestone >= 0 && daysToMilestone <= 90) return milestone
    }
  } catch {
    // Invalid date
  }
  return null
}
