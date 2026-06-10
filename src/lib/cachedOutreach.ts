/**
 * Pre-generated outreach for the most common demo paths.
 * Used as fallback when the LLM call times out or fails.
 *
 * Keys are normalised: leadName.toLowerCase() + "|" + first word of property address.
 *
 * Every entry is hand-written in Cameron's voice and pre-vetted:
 * no em-dashes, SMS under 160 chars, email 2-3 short paragraphs referencing
 * what the buyer asked at the open home, persona-correct sign-off
 * ("Kind regards" for investors, "Cheers" for everyone else).
 */

interface CachedOutreach {
  sms: string
  emailSubject: string
  emailBody: string[]
}

// Active listings: 10 Ashby Drive (key "10") and 3 Fairholme Boulevard (key "3"),
// both Berwick. Covers the five most-used demo leads against both properties.
const CACHE: Record<string, CachedOutreach> = {

  // ── James Whitfield — family buyer, asked about school zones + backyard ─────
  "james whitfield|10": {
    sms: "Hi James, Cameron here from Peake. New 4 bed on Ashby Dr, Berwick, 640sqm block. Open Sat 11am. Worth a look for the family?",
    emailSubject: "That backyard you were after, James",
    emailBody: [
      "Hi James, hope you and the family are well.",
      "You asked about school zones and backyard space at the open home. 10 Ashby Drive just hit the market, 4 bed and 2 bath on 640sqm, with a backyard the kids can actually use. Price guide is $900K to $1M.",
      "Open this Saturday at 11am, auction 14 June. Happy to walk you through before the crowd if that suits.",
      "Cheers,\nCameron",
    ],
  },
  "james whitfield|3": {
    sms: "Hi James, Cameron here from Peake. 4 bed on Fairholme Blvd, Berwick, 744sqm of yard for the kids. Open Sat 12:30pm. Keen for a look?",
    emailSubject: "Big block in Berwick, James",
    emailBody: [
      "Hi James, hope you and the family are well.",
      "You measured up the backyard at the open, so this one jumped out. 3 Fairholme Boulevard is 4 bed, 2 bath on a 744sqm block, guide $850K to $940K. Plenty of room for the kids.",
      "Open home is Saturday 12:30pm, auction 14 June. Let me know if you would like the section 32 sent over.",
      "Cheers,\nCameron",
    ],
  },

  // ── Priya Nair — first home buyer, asked about stamp duty + process ─────────
  "priya nair|10": {
    sms: "Hi Priya, Cameron here from Peake. New 4 bed on Ashby Dr, Berwick, guide from $900K. Open Sat 11am if you would like a look. No pressure at all.",
    emailSubject: "A Berwick listing worth a look, Priya",
    emailBody: [
      "Hi Priya, hope the search is going well.",
      "10 Ashby Drive just listed, 4 bed and 2 bath on 640sqm with a guide of $900K to $1M. You asked about the buying process at the open, so happy to talk you through how the auction on 14 June would work.",
      "Open home is Saturday 11am. No silly questions when it is your first, ask away.",
      "Cheers,\nCameron",
    ],
  },
  "priya nair|3": {
    sms: "Hi Priya, Cameron here from Peake. A 4 bed on Fairholme Blvd just listed, guide from $850K. Open Sat 12:30pm if you would like a look.",
    emailSubject: "A Berwick home worth a look, Priya",
    emailBody: [
      "Hi Priya, hope the house hunt is going well.",
      "You asked about stamp duty concessions at the open home. 3 Fairholme Boulevard just listed with a guide of $850K to $940K, 4 bed and 2 bath on 744sqm. Worth checking your concession eligibility at that price point.",
      "Open home is Saturday 12:30pm. Happy to answer any process questions along the way.",
      "Cheers,\nCameron",
    ],
  },

  // ── Michael Tran — investor, asked about yield + comparables ────────────────
  "michael tran|10": {
    sms: "Hi Michael, Cameron from Peake. 4 bed just listed on Ashby Dr, Berwick. Guide $900K to $1M, strong rental demand in the pocket. Want the numbers?",
    emailSubject: "Rental numbers on a new Berwick listing",
    emailBody: [
      "Hi Michael, hope things are well.",
      "You asked about yield and comparable sales when we met. 10 Ashby Drive is fresh to market, 4 bed, 2 bath on 640sqm, guide $900K to $1M. Rental appraisal sits around $620 to $650 a week and Berwick vacancy is under 1.5%.",
      "Auction is 14 June. I can send the comparable sales pack if you want to run the numbers first.",
      "Kind regards,\nCameron",
    ],
  },
  "michael tran|3": {
    sms: "Hi Michael, Cameron from Peake. New 4 bed on Fairholme Blvd, Berwick. Guide $850K to $940K on 744sqm. Solid land value play. Want the comps?",
    emailSubject: "Land value play in Berwick",
    emailBody: [
      "Hi Michael, hope things are well.",
      "3 Fairholme Boulevard just listed, 4 bed, 2 bath on a 744sqm block with a guide of $850K to $940K. At that land size the underlying value holds up well against recent Berwick sales, and rental demand in the pocket stays tight.",
      "Auction is 14 June. Happy to send the comparable sales from the last 90 days if useful.",
      "Kind regards,\nCameron",
    ],
  },

  // ── Sandra Kowalski — downsizer, wants single-level + low maintenance ───────
  "sandra kowalski|10": {
    sms: "Hi Sandra, Cameron here from Peake. I know you are after easy living. New Berwick listing worth a quick look before Saturday. Want the details?",
    emailSubject: "Thinking of your next move, Sandra",
    emailBody: [
      "Hi Sandra, hope you are both well.",
      "You mentioned selling the Pakenham home and wanting low maintenance living. 10 Ashby Drive just listed in Berwick with a guide of $900K to $1M. The layout is practical and the garden is very manageable, though it is a family size home.",
      "If it is not quite right, I have two more coming next month that may suit better. Happy to keep you posted either way.",
      "Cheers,\nCameron",
    ],
  },
  "sandra kowalski|3": {
    sms: "Hi Sandra, Cameron here from Peake. New listing on Fairholme Blvd, Berwick, easy care garden and a practical layout. Want the details?",
    emailSubject: "One to consider in Berwick, Sandra",
    emailBody: [
      "Hi Sandra, hope you are both well.",
      "You asked about single level living and being close to shops at the open. 3 Fairholme Boulevard just listed, guide $850K to $940K, with most of the living on one level and an easy care garden. Eden Rise shops are a short drive.",
      "No rush at all, but the open home is Saturday 12:30pm if you would both like a look.",
      "Cheers,\nCameron",
    ],
  },

  // ── Grace Chen — family buyer, backyard + storage + schools ─────────────────
  "grace chen|10": {
    sms: "Hi Grace, Cameron here from Peake. New 4 bed on Ashby Dr with the big backyard you wanted. Open Sat 11am. Bring the little one!",
    emailSubject: "That backyard for the toddler, Grace",
    emailBody: [
      "Hi Grace, hope you three are well.",
      "You spent most of your time in the backyard at the open, so this one jumped out. 10 Ashby Drive, 4 bed on 640sqm with plenty of lawn and good storage throughout. Guide is $900K to $1M.",
      "Open Saturday 11am. Happy to line up a private look if the weekend is tricky with the little one.",
      "Cheers,\nCameron",
    ],
  },
  "grace chen|3": {
    sms: "Hi Grace, Cameron here from Peake. 4 bed on Fairholme Blvd, Berwick, 744sqm with heaps of yard. Open Sat 12:30pm. Worth a look for you three?",
    emailSubject: "Room to grow in Berwick, Grace",
    emailBody: [
      "Hi Grace, hope you three are well.",
      "3 Fairholme Boulevard just listed and the block is a standout, 744sqm with a 4 bed, 2 bath home and good storage like you asked about. Guide is $850K to $940K.",
      "Open home is Saturday 12:30pm, auction 14 June. Let me know if you would like to walk through together.",
      "Cheers,\nCameron",
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
