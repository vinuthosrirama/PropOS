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

// Active listings: 7 Atkinson Drive (key "7") and 39 Ashbury Rise (key "39"),
// both Berwick, 4bd/2ba/2car, closest profile match to the two listings these
// entries were originally written against. Covers the five most-used demo
// leads against both properties. No land size or open-home time is quoted
// (not supplied for these listings) — only the agent-supplied price guide
// and "Listed" date are used.
const CACHE: Record<string, CachedOutreach> = {

  // ── James Whitfield — family buyer, asked about school zones + backyard ─────
  "james whitfield|7": {
    sms: "Hi James, Cameron here from Peake. New 4 bed on Atkinson Dr, Berwick. Guide $865K to $950K. Worth a look for the family?",
    emailSubject: "A new Berwick listing for the family, James",
    emailBody: [
      "Hi James, hope you and the family are well.",
      "You asked about school zones and backyard space at the open home. 7 Atkinson Drive just listed, 4 bed and 2 bath with a double garage, guide $865K to $950K.",
      "Happy to arrange a private look before the crowd if that suits.",
      "Cheers,\nCameron",
    ],
  },
  "james whitfield|39": {
    sms: "Hi James, Cameron here from Peake. 4 bed on Ashbury Rise, Berwick, guide $850K to $895K. Keen for a look?",
    emailSubject: "Room to grow in Berwick, James",
    emailBody: [
      "Hi James, hope you and the family are well.",
      "You measured up the backyard at the open, so this one jumped out. 39 Ashbury Rise is 4 bed, 2 bath with a double garage, guide $850K to $895K.",
      "Let me know if you would like the section 32 sent over.",
      "Cheers,\nCameron",
    ],
  },

  // ── Priya Nair — first home buyer, asked about stamp duty + process ─────────
  "priya nair|7": {
    sms: "Hi Priya, Cameron here from Peake. New 4 bed on Atkinson Dr, Berwick, guide $865K to $950K. No pressure at all, happy to talk you through it.",
    emailSubject: "A Berwick listing worth a look, Priya",
    emailBody: [
      "Hi Priya, hope the search is going well.",
      "7 Atkinson Drive just listed, 4 bed and 2 bath, guide $865K to $950K. You asked about the buying process at the open, so happy to talk you through how it would work.",
      "No silly questions when it is your first, ask away.",
      "Cheers,\nCameron",
    ],
  },
  "priya nair|39": {
    sms: "Hi Priya, Cameron here from Peake. A 4 bed on Ashbury Rise just listed, guide $850K to $895K. Want me to send the details?",
    emailSubject: "A Berwick home worth a look, Priya",
    emailBody: [
      "Hi Priya, hope the house hunt is going well.",
      "You asked about stamp duty concessions at the open home. 39 Ashbury Rise just listed, guide $850K to $895K, 4 bed and 2 bath. Worth checking your concession eligibility at that price point.",
      "Happy to answer any process questions along the way.",
      "Cheers,\nCameron",
    ],
  },

  // ── Michael Tran — investor, asked about yield + comparables ────────────────
  "michael tran|7": {
    sms: "Hi Michael, Cameron from Peake. 4 bed just listed on Atkinson Dr, Berwick. Guide $865K to $950K. Want the numbers?",
    emailSubject: "Rental numbers on a new Berwick listing",
    emailBody: [
      "Hi Michael, hope things are well.",
      "You asked about yield and comparable sales when we met. 7 Atkinson Drive is fresh to market, 4 bed, 2 bath, guide $865K to $950K.",
      "I can send the comparable sales pack if you want to run the numbers first.",
      "Kind regards,\nCameron",
    ],
  },
  "michael tran|39": {
    sms: "Hi Michael, Cameron from Peake. New 4 bed on Ashbury Rise, Berwick. Guide $850K to $895K. Want the comps?",
    emailSubject: "A new Berwick listing to run the numbers on",
    emailBody: [
      "Hi Michael, hope things are well.",
      "39 Ashbury Rise just listed, 4 bed, 2 bath, guide $850K to $895K. Worth comparing against recent Berwick sales for the underlying value.",
      "Happy to send the comparable sales from the last 90 days if useful.",
      "Kind regards,\nCameron",
    ],
  },

  // ── Sandra Kowalski — downsizer, wants single-level + low maintenance ───────
  "sandra kowalski|7": {
    sms: "Hi Sandra, Cameron here from Peake. I know you are after easy living. New Berwick listing worth a quick look. Want the details?",
    emailSubject: "Thinking of your next move, Sandra",
    emailBody: [
      "Hi Sandra, hope you are both well.",
      "You mentioned selling the Pakenham home and wanting low maintenance living. 7 Atkinson Drive just listed in Berwick, guide $865K to $950K.",
      "If it is not quite right, I have a few more coming up that may suit better. Happy to keep you posted either way.",
      "Cheers,\nCameron",
    ],
  },
  "sandra kowalski|39": {
    sms: "Hi Sandra, Cameron here from Peake. New listing on Ashbury Rise, Berwick, guide $850K to $895K. Want the details?",
    emailSubject: "One to consider in Berwick, Sandra",
    emailBody: [
      "Hi Sandra, hope you are both well.",
      "You asked about single level living and being close to shops at the open. 39 Ashbury Rise just listed, guide $850K to $895K. Eden Rise shops are a short drive.",
      "No rush at all, happy to arrange a look whenever suits.",
      "Cheers,\nCameron",
    ],
  },

  // ── Helen & Bruce McDonald — vendor prospect, 30 Rosewood Drive Berwick ─────
  // Hand-written per Vinuth 10 Jul 2026. Served as PRIMARY source in the vendor
  // outreach flow (checked before the LLM call) so the demo works with the
  // server down. $1.21M figure matches CURRENT_VALUE_ESTIMATES[5011].
  "helen & bruce mcdonald|30": {
    sms: "Hey Helen, hope you, Bruce and the little ones are doing well! A colleague of mine sold a property just down the road from Rosewood Drive, and I just checked out of curiosity and its sitting on a fair bit of equity to use for that townhouse you both mentioned the last time we met. Thoughts on meeting for a coffee (or tea) this week? Cheers, Cam, Peake Real Estate",
    emailSubject: "Some good news on Rosewood Drive, Helen",
    emailBody: [
      "Hey Helen, Cameron from Peake here. It's been a little while since we last connected! Hope Bruce and the little ones are doing well, you mentioned your youngest was starting uni soon!",
      "A colleague of mine sold a property just down the road from Rosewood Drive, and the suburb has grown nicely and a quick look at our internals makes your property $1.21M, representing a fair bit of equity since 2015. If you were still thinking about that townhouse, more than happy to meet and have a bit more of a discussion on what we can do!",
      "More than happy to provide a complimentary appraisal, no obligation at all. Happy to call or come by whenever suits.",
      "Cheers,\nCameron, Peake",
    ],
  },

  // ── Grace Chen — family buyer, backyard + storage + schools ─────────────────
  "grace chen|7": {
    sms: "Hi Grace, Cameron here from Peake. New 4 bed on Atkinson Dr, Berwick. Bring the little one for a look!",
    emailSubject: "A new Berwick listing for you three, Grace",
    emailBody: [
      "Hi Grace, hope you three are well.",
      "You spent most of your time in the backyard at the open, so this one jumped out. 7 Atkinson Drive, 4 bed with a double garage, guide $865K to $950K.",
      "Happy to line up a private look if the weekend is tricky with the little one.",
      "Cheers,\nCameron",
    ],
  },
  "grace chen|39": {
    sms: "Hi Grace, Cameron here from Peake. 4 bed on Ashbury Rise, Berwick. Worth a look for you three?",
    emailSubject: "Room to grow in Berwick, Grace",
    emailBody: [
      "Hi Grace, hope you three are well.",
      "39 Ashbury Rise just listed, 4 bed, 2 bath with a double garage, guide $850K to $895K.",
      "Let me know if you would like to walk through together.",
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
