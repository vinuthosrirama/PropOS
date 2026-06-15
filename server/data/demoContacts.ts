/**
 * Demo contact scenarios for PropOS live demos to REA agents.
 *
 * Four buyer lifecycle stages — each maps to a realistic situation an agent
 * encounters. Phones start as placeholder numbers; the /api/demo/activate
 * route swaps one at a time to the demo recipient's real number so a live
 * iMessage fires from Vinuth's iPhone to the agent being demoed to.
 *
 * Fields cover the CRM standard across AgentBox, Box+Dice, VaultRE, Rex:
 *   personalisation  → free-form agent notes (feeds directly into opener prompt)
 *   buyer_profile    → structured CRM data (budget, history, match, life events)
 *   rea_data         → REA-specific intel (suburbs, recent sales)
 */

export const DEMO_SOURCE_PREFIX = "demo:"

export interface DemoScenario {
  key: string
  label: string
  tag: string          // short badge e.g. "FHB → Landlord"
  summary: string      // one-line shown in the UI card
  fakePhone: string
  contact: {
    name: string
    relationship: "agent_prospect"
    conversation_objective: string
    personalisation: Record<string, unknown>
    buyer_profile: Record<string, unknown>
    rea_data: Record<string, unknown>
  }
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  // ── Scenario 1: FHB now exploring investment ─────────────────────────────────
  {
    key: "fhb_landlord",
    label: "Sarah Chen",
    tag: "FHB → Landlord",
    summary: "Bought Berwick 2023 · has equity · exploring investment",
    fakePhone: "+61400000001",
    contact: {
      name: "Sarah Chen",
      relationship: "agent_prospect",
      conversation_objective:
        "Sarah mentioned at the coffee morning last month that she's thinking about investment property — she's built good equity in Berwick. We have 8 Stirling Ct Narre Warren coming to market at $519k with a strong rental appraisal. Reach out warmly and personally.",
      personalisation: {
        notes:
          "Super friendly, always replies quickly. Has two dogs — Biscuit and Marmalade. Just finished building a new deck. Very trusting of our advice.",
        how_we_met:
          "Guided her through her first home purchase in Berwick March 2023 — was very nervous at auction, we held her hand through it.",
        topics_to_reference:
          "The investment convo she flagged at the coffee morning. The new deck she just finished. Her dogs.",
      },
      buyer_profile: {
        buyer_type: "landlord_prospect",
        budget_max: 560000,
        preferred_suburbs: ["Narre Warren", "Cranbourne North", "Pakenham"],
        property_types: ["house", "townhouse"],
        bedrooms_min: 3,
        timeline: "6_months",
        lead_source: "repeat_client",
        pre_approval_status: "not_checked",
        purchase_history: [
          {
            address: "14 Magnolia Ct Berwick",
            price: 645000,
            date: "2023-03-20",
            type: "first_home",
            notes: "Auction purchase, nervous but got it done",
          },
        ],
        estimated_current_value: 720000,
        equity_estimate: 125000,
        new_listing_match: {
          address: "8 Stirling Ct Narre Warren",
          price: 519000,
          features: "3br 2ba, 580m², rental appraisal $520/wk — 5.8% gross yield",
        },
        days_known: 1180,
        engagement_score: 88,
      },
      rea_data: {
        target_suburbs: ["Narre Warren", "Cranbourne North", "Pakenham"],
        recently_sold_address: "14 Magnolia Ct Berwick",
        recently_sold_price: "$645,000",
      },
    },
  },

  // ── Scenario 2: FHB now active investor ──────────────────────────────────────
  {
    key: "fhb_investor",
    label: "James Ngo",
    tag: "FHB → Investor",
    summary: "Pre-approved $520k · researching IP · Pakenham new build ready",
    fakePhone: "+61400000002",
    contact: {
      name: "James Ngo",
      relationship: "agent_prospect",
      conversation_objective:
        "James has been actively researching investment property and told us he's ready to move this year. He has pre-approval for $520k. We have 22 Station St Pakenham coming to market at $488k — new build, 6.0% gross yield, strong rental demand. Reach out now before it goes live on portal.",
      personalisation: {
        notes:
          "Very analytical — always asks about yield, vacancy rates, depreciation schedules. Works in IT at ANZ. Likes data and specifics, not vague promises. Gets annoyed by generic messages.",
        how_we_met:
          "Bought his Cranbourne North townhouse through us April 2024 — did his own due diligence with spreadsheets.",
        topics_to_reference:
          "He mentioned at a Berwick open home he attended in Feb that he was 'ready to pull the trigger on an IP this year'. Mention the yield figure upfront.",
      },
      buyer_profile: {
        buyer_type: "investor",
        budget_min: 420000,
        budget_max: 520000,
        pre_approval_status: "approved",
        pre_approval_amount: 520000,
        preferred_suburbs: ["Pakenham", "Cranbourne North", "Officer"],
        property_types: ["house", "townhouse", "unit"],
        bedrooms_min: 3,
        timeline: "urgent",
        lead_source: "repeat_client",
        open_home_history: [
          {
            address: "14 Riverside Dr Pakenham",
            date: "2026-02-15",
            notes: "Came to browse IPs, mentioned ready to buy this year",
          },
        ],
        purchase_history: [
          {
            address: "4/22 Delphin Dr Cranbourne North",
            price: 498000,
            date: "2024-04-11",
            type: "first_home",
            notes: "Meticulous buyer, researched for 8 months",
          },
        ],
        new_listing_match: {
          address: "22 Station St Pakenham",
          price: 488000,
          features: "3br 2ba new build, rental appraisal $490/wk, 6.0% gross yield, depreciation schedule available",
        },
        days_known: 790,
        engagement_score: 82,
      },
      rea_data: {
        target_suburbs: ["Pakenham", "Cranbourne North", "Officer"],
        recently_sold_address: "4/22 Delphin Dr Cranbourne North",
        recently_sold_price: "$498,000",
      },
    },
  },

  // ── Scenario 3: Past buyer ripe to sell (18 months on) ───────────────────────
  {
    key: "buyer_to_seller",
    label: "Michael & Kate Fraser",
    tag: "Buyer → Seller?",
    summary: "Bought Officer Nov 2024 · market +12% · baby on the way",
    fakePhone: "+61400000003",
    contact: {
      name: "Michael Fraser",
      relationship: "agent_prospect",
      conversation_objective:
        "The Frasers bought 19 months ago at $735k. Officer has grown ~12% — they're sitting on roughly $90k in unrealised gain. Kate is expecting their first baby in August and they've outgrown the place. Perfect time to check in warmly, acknowledge the growth, and explore if they'd want to upsize — we'd be their agent for both the sale and the buy.",
      personalisation: {
        notes:
          "Really lovely couple — Kate is the main decision-maker, Michael is supportive. They love the street and have made friends with the neighbours. Kate is quite private so keep it warm and personal, not salesy.",
        how_we_met:
          "Helped them buy 7 Harvest Blvd Officer in a competitive auction November 2024. They were outbid twice before this one — we fought hard for them.",
        topics_to_reference:
          "Kate mentioned at a chance run-in before Christmas that they were 'thinking about starting a family'. Perfect warm check-in. Reference the market growth casually, not as a pitch.",
      },
      buyer_profile: {
        buyer_type: "potential_vendor",
        preferred_suburbs: ["Berwick", "Narre Warren South", "Harkaway"],
        property_types: ["house"],
        bedrooms_min: 4,
        bathrooms_min: 2,
        timeline: "6_months",
        lead_source: "repeat_client",
        life_events: ["expecting_first_baby_august_2026"],
        purchase_history: [
          {
            address: "7 Harvest Blvd Officer",
            price: 735000,
            date: "2024-11-08",
            type: "family_home",
            notes: "Competitive auction, outbid twice before, very relieved",
          },
        ],
        estimated_current_value: 825000,
        unrealised_gain: 90000,
        months_since_purchase: 19,
        days_known: 920,
        engagement_score: 75,
      },
      rea_data: {
        target_suburbs: ["Berwick", "Narre Warren South", "Harkaway"],
        recently_sold_address: "7 Harvest Blvd Officer",
        recently_sold_price: "$735,000",
      },
    },
  },

  // ── Scenario 4: Open home attendee → new matching listing ────────────────────
  {
    key: "open_home_match",
    label: "Priya Sharma",
    tag: "Open Home → New Listing",
    summary: "Attended 45 Wattle Rd · $640k too high · 38 Acacia Dr just listed at $618k",
    fakePhone: "+61400000004",
    contact: {
      name: "Priya Sharma",
      relationship: "agent_prospect",
      conversation_objective:
        "Priya came to the 45 Wattle Rd Berwick open home 3 weeks ago — very keen but the vendor wouldn't negotiate on $640k which was just over her limit. We just listed 38 Acacia Dr Berwick at $618k — same 4br, same school zone, north-facing yard, double garage. She needs to know about this today.",
      personalisation: {
        notes:
          "Very engaged at the open home — took notes, asked about the kitchen layout and the backyard orientation. Partner couldn't make it. Berwick Primary school zone is a hard requirement (kids starting school 2027). Hates being oversold to.",
        how_we_met:
          "Open home 45 Wattle Rd Berwick on 25 May 2026. First time meeting — introduced herself, stayed 25 min.",
        topics_to_reference:
          "The specific things she loved: north-facing yard, kitchen layout, school zone. The price frustration at 45 Wattle Rd. Keep it brief and factual — she'll appreciate directness.",
      },
      buyer_profile: {
        buyer_type: "active_buyer",
        budget_min: 580000,
        budget_max: 630000,
        pre_approval_status: "approved",
        pre_approval_amount: 630000,
        preferred_suburbs: ["Berwick", "Narre Warren"],
        property_types: ["house"],
        bedrooms_min: 4,
        bathrooms_min: 2,
        timeline: "urgent",
        lead_source: "open_home",
        must_haves: ["Berwick Primary school zone", "north-facing yard", "double garage"],
        open_home_history: [
          {
            address: "45 Wattle Rd Berwick",
            date: "2026-05-25",
            notes:
              "Loved kitchen + north yard + school zone. Very keen. Vendor wouldn't move from $640k — $10-20k over her budget. Left disappointed.",
          },
        ],
        new_listing_match: {
          address: "38 Acacia Dr Berwick",
          price: 618000,
          features: "4br 2ba double garage, north-facing yard, Berwick Primary zone — same spec as 45 Wattle Rd, $22k cheaper",
        },
        days_known: 20,
        engagement_score: 94,
      },
      rea_data: {
        target_suburbs: ["Berwick", "Narre Warren"],
        recently_sold_address: "45 Wattle Rd Berwick",
        recently_sold_price: "$640,000",
      },
    },
  },
]
