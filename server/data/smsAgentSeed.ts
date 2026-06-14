/**
 * SMS Agent seed data (Stage 1 test bed)
 *
 * A single business-partner test contact plus a starter set of voice samples so
 * the agent can be exercised end-to-end before Vinuth pastes his real texts.
 *
 * The test contact's phone comes from SMS_AGENT_TEST_PHONE (or TEST_RECIPIENT_PHONE),
 * so every send is redirected to a number Vinuth controls. Replace the samples and
 * personalisation with the real values via POST /api/sms-agent/calibrate and
 * POST /api/sms-agent/contacts.
 */

import type { UpsertContactInput } from "../lib/smsContacts.js"

/**
 * Starter voice samples. These are placeholders in a plausible Australian,
 * concise, low-punctuation style. Replace with 20+ of Vinuth's real texts for a
 * high-confidence calibration.
 */
export const STARTER_VOICE_SAMPLES: string[] = [
  "Hey mate you free for a coffee this week?",
  "yeah sounds good, tuesday arvo works for me",
  "ah nice one, how'd the pitch go",
  "all good no stress, catch you then",
  "haha yeah fair enough",
  "reckon we should lock in the deck before friday",
  "keen, what time suits you",
  "cheers for that, really appreciate it",
  "can't make tonight sorry, next round though",
  "just sent it through, let me know what you think",
  "morning, you about today?",
  "sweet, see you at the usual spot",
  "yeah I'm thinking same, let's go with option b",
  "no worries, take your time",
  "did you end up hearing back from them",
]

/**
 * Build the Stage 1 business-partner test contact. Phone defaults to the test
 * number so nothing reaches a real person during Stage 1.
 */
export function buildStage1TestContact(name = "Test Partner"): UpsertContactInput {
  const phone =
    process.env.SMS_AGENT_TEST_PHONE?.trim() ||
    process.env.TEST_RECIPIENT_PHONE?.trim() ||
    "+61400000000"

  return {
    name,
    phone,
    relationship: "business_partner",
    stage: 1,
    auto_reply: false,            // Stage 1 = approve everything
    source: "seed:stage1",
    conversation_objective: "Catch up and see how their week is going. Mention PropOS progress casually.",
    personalisation: {
      relationship: "Business partner",
      current_projects: ["PropOS go-to-market", "investor deck"],
      recent_topics: ["weekend agent meetings"],
      things_to_ask: ["How did the demo prep go?"],
      tone: "Very casual, lots of banter, but serious about business details",
      what_we_call_each_other: "first name",
    },
    voice_override: {
      formality: -1,
      humour: 1,
    },
  }
}

/**
 * Stage 2 contact — a real person Vinuth knows, NOT test-redirected.
 * Stage 2 tests live two-way conversation with AI-suggested replies.
 */
export function buildStage2Contact(name: string, phone: string, personalisation?: Record<string, unknown>): UpsertContactInput {
  return {
    name,
    phone,
    relationship: "business_partner",
    stage: 2,
    auto_reply: false,
    source: "seed:stage2",
    conversation_objective: "Have a natural back-and-forth conversation. Test the AI suggestion quality by picking from recommended messages. Build towards a coffee catch-up.",
    personalisation: personalisation ?? {
      relationship: "Friend / business contact",
      tone: "Casual and natural, like texting a mate",
    },
    voice_override: {
      formality: -1,
      humour: 1,
    },
  }
}

/**
 * Demo: Past Client Reconnection (fictional personas for sales demos).
 *
 * Three CRM-style past-buyer records covering common "reconnect with an old
 * client" scenarios — used to show prospective REA agents how the agent
 * generates hyper-personalised reconnection texts in their own voice. Phones
 * are placeholders (never texted directly); approved drafts for these contacts
 * are redirected to whatever number is set via POST /api/sms-agent/demo/target
 * (the REA agent being demoed).
 *
 * rea_data fields follow the universal buyer-lead schema common across
 * AgentBox / Box+Dice / VaultRE / Rex / Agentpoint: purchase_history,
 * buyer_type, current_status, budget range, target suburbs, tags.
 */
export function buildDemoPastClientPersonas(): UpsertContactInput[] {
  return [
    {
      name: "Sarah Mitchell",
      phone: "+61400000101",
      relationship: "agent_prospect",
      stage: 1,
      auto_reply: false,
      source: "seed:demo_pastclient",
      conversation_objective: "Reconnect with Sarah, a first-home buyer who purchased in Berwick ~2 years ago and has since relocated to Brisbane for work, now renting the Berwick property out. Check in on how being a landlord is going and offer a free rental appraisal / market update for Berwick.",
      personalisation: {
        scenario: "FHB now landlord",
        tone: "Warm, low-pressure, checking in on a past client",
        things_to_ask: ["How's the tenant situation going?", "Has the property manager been good to deal with?"],
      },
      rea_data: {
        buyer_type: "first_home_buyer",
        current_status: "landlord",
        purchase_history: {
          address: "12 Wirraway Street, Berwick VIC 3806",
          purchase_date: "2024-08",
          purchase_price: 620000,
          property_type: "House",
          beds: 3,
          baths: 2,
        },
        current_situation: "Relocated to Brisbane for work ~6 months ago, now renting out the Berwick property",
        target_suburbs: ["Berwick"],
        tags: ["past_buyer", "now_landlord", "relocated"],
      },
    },
    {
      name: "Daniel Osei",
      phone: "+61400000102",
      relationship: "agent_prospect",
      stage: 1,
      auto_reply: false,
      source: "seed:demo_pastclient",
      conversation_objective: "Reconnect with Daniel, a first-home buyer from ~3 years ago who previously mentioned wanting to buy an investment property once he had more equity. Re-engage about investment opportunities in Pakenham/Officer given current market conditions.",
      personalisation: {
        scenario: "FHB now investor",
        tone: "Friendly, opportunity-focused but not pushy",
        things_to_ask: ["Still thinking about an investment property?"],
      },
      rea_data: {
        buyer_type: "first_home_buyer",
        current_status: "owner_occupier_considering_investment",
        purchase_history: {
          address: "8 Hampton Crescent, Hampton Park VIC 3976",
          purchase_date: "2023-11",
          purchase_price: 540000,
          property_type: "House",
          beds: 3,
          baths: 1,
        },
        budget_min: 500000,
        budget_max: 650000,
        property_type_preferences: ["house", "townhouse"],
        target_suburbs: ["Pakenham", "Officer"],
        timeline: "6_months",
        tags: ["past_buyer", "investor_interest"],
      },
    },
    {
      name: "Rebecca Tan",
      phone: "+61400000103",
      relationship: "agent_prospect",
      stage: 1,
      auto_reply: false,
      source: "seed:demo_pastclient",
      conversation_objective: "Reconnect with Rebecca, who bought in Officer about 1.5 years ago. Property values in Officer have grown noticeably since. Let her know what her place might be worth now and gauge whether she's thought about upgrading or selling.",
      personalisation: {
        scenario: "Past buyer, possible seller 1.5 years on",
        tone: "Helpful, informative, no pressure to sell",
        things_to_ask: ["Have you thought about what's next for you guys?"],
      },
      rea_data: {
        buyer_type: "owner_occupier",
        current_status: "possible_seller",
        purchase_history: {
          address: "21 Hillside Avenue, Officer VIC 3809",
          purchase_date: "2024-12",
          purchase_price: 580000,
          property_type: "House",
          beds: 4,
          baths: 2,
        },
        current_estimate: 660000,
        target_suburbs: ["Officer"],
        tags: ["past_buyer", "possible_seller", "equity_growth"],
      },
    },
  ]
}
