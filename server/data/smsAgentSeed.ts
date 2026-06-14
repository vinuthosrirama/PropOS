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
