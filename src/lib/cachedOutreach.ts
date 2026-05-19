/**
 * Pre-generated outreach for the most common demo paths.
 * Used as fallback when the LLM call times out or fails.
 *
 * Keys are normalised: leadName.toLowerCase() + "|" + first word of property address.
 */

interface CachedOutreach {
  sms: string
  emailSubject: string
  emailBody: string[]
}

const CACHE: Record<string, CachedOutreach> = {

  // ── James Whitfield → 17 Grand Arch Way ────────────────────────────────────
  "james whitfield|17": {
    sms: "Hey James, Cameron here from Peake. New one for you  - 17 Grand Arch Way, 4bd/680sqm, same Berwick Grammar catchment. Guide $1.1M-$1.25M. Open Sat 11am?",
    emailSubject: "17 Grand Arch Way  - same school zone, bigger block, Sat 11am",
    emailBody: [
      "Hey James, hope you and the family are well.",
      "When you came through 3 Thirlmere Court you asked about the school zone and the backyard dimensions  - both came to mind when this one hit the market. 17 Grand Arch Way is a 4-bedroom on 680sqm, and it sits in the same Berwick Grammar and Berwick Primary catchments you were asking about. That's 68sqm more land than Thirlmere.",
      "Price guide is $1.10M to $1.25M. Open home is this Saturday 17 May at 11am. Settlement is flexible  - I know that matters when you're coordinating a move with school timing.",
      "Happy to send through the Section 32 before Saturday if you'd like a read. Just reply here.",
      "Cheers,\nCameron",
    ],
  },

  // ── Kevin Liu → 17 Grand Arch Way ──────────────────────────────────────────
  "kevin liu|17": {
    sms: "Hey Kevin, Cameron from Peake. 17 Grand Arch Way just listed  - 680sqm, rental appraisal $540-600/wk, guide $1.1-1.25M. Same profile as Thirlmere. Open Sat 11am?",
    emailSubject: "17 Grand Arch Way  - $540-600/wk rental, ~5% gross yield, open Sat",
    emailBody: [
      "Hey Kevin, quick one on a new listing I think fits what you're looking for.",
      "17 Grand Arch Way, Berwick  - 4-bed, 2-bath on 680sqm. Rental appraisal is $540 to $600 per week, putting gross yield at around 4.9 to 5.4% at the price guide of $1.10M to $1.25M. Very similar land and configuration to 3 Thirlmere Court, which you attended in May.",
      "The school zone catchment keeps demand steady from family tenants  - Berwick runs sub-1.5% vacancy consistently. I can put together a comparable sales summary if that helps your numbers.",
      "Open home is Saturday 17 May at 11am. Happy to walk you through separately beforehand if you'd prefer a quiet look.",
      "Kind regards,\nCameron",
    ],
  },

  // ── Michael Tran → 17 Grand Arch Way ───────────────────────────────────────
  "michael tran|17": {
    sms: "Hey Michael, Cameron from Peake. 17 Grand Arch Way  - 4bd/680sqm, guide $1.1M-$1.25M. 3 comps sold $940K-$1.27M in 90 days. Open Sat 11am?",
    emailSubject: "17 Grand Arch Way + comparable sales from the last 90 days",
    emailBody: [
      "Hey Michael, following up on your visit to 3 Thirlmere Court.",
      "17 Grand Arch Way has just listed  - 4-bed, 2-bath on 680sqm in Berwick, price guide $1.10M to $1.25M. You asked about comparable sales at the open home, so here's the last 90 days: 3 sales in the street and surrounding courts ranging $940K to $1.27M, average 28 days on market.",
      "Rental appraisal for this type of property sits at $540 to $600 per week. Berwick vacancy is running below 1.5%.",
      "Open home is Saturday 17 May at 11am. Happy to run through the full numbers if you want to come through early.",
      "Kind regards,\nCameron",
    ],
  },

  // ── Claire Thompson → 17 Grand Arch Way ────────────────────────────────────
  "claire thompson|17": {
    sms: "Hey Claire, Cameron from Peake. 17 Grand Arch Way just listed  - 4bd on 680sqm, same Berwick Primary zone you asked about. Guide $1.1-1.25M. Open Sat 11am?",
    emailSubject: "17 Grand Arch Way  - Berwick Primary zone, open this Saturday",
    emailBody: [
      "Hey Claire, hope you're well.",
      "You came through 3 Thirlmere Court and asked about the primary school catchment  - 17 Grand Arch Way is in the same Berwick Primary zone. It's a 4-bedroom on 680sqm with a solid second bedroom that would work well as a nursery or kids room.",
      "Price guide is $1.10M to $1.25M. Open home is Saturday 17 May at 11am  - it's a court position so very quiet street.",
      "Let me know if you'd like any details before Saturday.",
      "Cheers,\nCameron",
    ],
  },

  // ── Simone Dubois → 17 Grand Arch Way ──────────────────────────────────────
  "simone dubois|17": {
    sms: "Hey Simone, Cameron from Peake. 17 Grand Arch Way  - 4bd/680sqm, quiet court, close to Berwick maternal health. Guide $1.1-1.25M. Open Sat 11am?",
    emailSubject: "17 Grand Arch Way  - quiet court, great nursery potential, Sat 11am",
    emailBody: [
      "Hey Simone, hope you and the family are doing well.",
      "When you came through 3 Thirlmere Court you mentioned the court position and proximity to the maternal health centre. 17 Grand Arch Way ticks both  - it's in a quiet court and the Berwick Maternal and Child Health Centre is about 1.8km away.",
      "It's a 4-bedroom on 680sqm with a good-sized second bedroom that works well as a nursery. Price guide is $1.10M to $1.25M. Open home is Saturday 17 May at 11am.",
      "Happy to send through the floor plan if you'd like to see the layout before Saturday.",
      "Cheers,\nCameron",
    ],
  },

  // ── James Whitfield → 12 Broadway Street ───────────────────────────────────
  "james whitfield|12": {
    sms: "Hey James, Cameron from Peake. 12 Broadway St just listed  - 4bd/601sqm, guide $820K-$920K, same Berwick school zone. Open Sat 12:30pm?",
    emailSubject: "12 Broadway Street  - school zone, walk to station, Sat 12:30pm",
    emailBody: [
      "Hey James, another one that came to mind after you visited Thirlmere.",
      "12 Broadway Street  - 4-bedroom on 601sqm with an updated kitchen and bathrooms. It's in the same school catchment zone you asked about, and it's walking distance to Berwick station which is a bonus for the commute.",
      "Price guide is $820K to $920K  - a bit more accessible than some of the other properties in the area. Open home is Saturday 17 May at 12:30pm.",
      "Worth a look if you're keeping options open.",
      "Cheers,\nCameron",
    ],
  },

  // ── Kevin Liu → 12 Broadway Street ─────────────────────────────────────────
  "kevin liu|12": {
    sms: "Hey Kevin, Cameron from Peake. 12 Broadway St  - 4bd, guide $820K-$920K, rental appraisal $480-520/wk. Walk to station. Open Sat 12:30pm?",
    emailSubject: "12 Broadway Street  - $480-520/wk rental yield at a lower entry point",
    emailBody: [
      "Hey Kevin, a second option alongside Grand Arch Way.",
      "12 Broadway Street is a 4-bedroom on 601sqm with a lower entry point  - guide $820K to $920K. Rental appraisal is $480 to $520 per week, and it's walking distance to Berwick station which keeps tenant demand strong.",
      "The yield profile is similar to what you'd expect from a comparable street-position property. Good option if you want exposure at a lower price point.",
      "Open home is Saturday 17 May at 12:30pm. Happy to run the numbers on both and compare.",
      "Kind regards,\nCameron",
    ],
  },
}

/**
 * Returns pre-generated outreach for a lead/property combo, or null if not cached.
 * Matching is case-insensitive and uses the first word of the property address.
 */
export function getCachedOutreach(
  leadName: string,
  propertyAddress: string,
): CachedOutreach | null {
  const firstWord = propertyAddress.trim().split(/\s+/)[0].toLowerCase()
  const key = `${leadName.toLowerCase()}|${firstWord}`
  return CACHE[key] ?? null
}
