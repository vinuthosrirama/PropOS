/**
 * Template-first outreach generation — zero LLM cost for 95%+ of cases.
 *
 * Architecture:
 * 1. Regex-based keyword extraction from lead notes → personalization details
 * 2. Pre-written SMS/email templates with {{slots}}
 * 3. Deterministic variant selection (hash of lead name + strategy)
 * 4. LLM only as fallback when template can't resolve
 */

import { sanitiseText } from "./sanitise.js"

export interface TemplateResult {
  sms: string
  email: { subject: string; body: string[] }
}

interface Slots {
  fn: string
  an: string
  sig: string   // closing sign-off: "{{an}}, {{agency}}" — matches the voice profile's sign-off block
  soldAddr: string
  activeAddr: string
  details: string
  cta: string
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function extractDetails(notes: string, questions: string, persona: string, budget?: string): string {
  const combined = `${notes} ${questions}`.toLowerCase()
  const details: string[] = []

  const bedMatch = combined.match(/(\d)\s*(?:bed|br|bedroom)/i)
  if (bedMatch) details.push(`${bedMatch[1]} bed`)

  const landMatch = combined.match(/(\d{3,4})\s*(?:sqm|m²|m2|square)/i)
  if (landMatch) details.push(`${landMatch[1]}sqm`)

  if (/school\s*zone|school\s*catch|primary\s*school|near\s*school/i.test(combined)) {
    details.push("school zone")
  }

  if (/pool|swimming/i.test(combined) && details.length < 3) {
    details.push("pool")
  }

  const carMatch = combined.match(/(\d)\s*(?:car|garage)/i)
  if (carMatch && details.length < 3) details.push(`${carMatch[1]} car`)

  if (/large\s*(?:yard|block|garden)|big\s*(?:yard|block)/i.test(combined) && details.length < 3) {
    if (!details.some(d => d.includes("sqm"))) details.push("big block")
  }

  if (/close\s*to\s*(?:train|station)|near\s*(?:train|station)/i.test(combined) && details.length < 3) {
    details.push("near station")
  }

  if (/quiet\s*street|cul.?de.?sac/i.test(combined) && details.length < 3) {
    details.push("quiet street")
  }

  if (details.length === 0 && budget) {
    const budgetNum = budget.replace(/[^0-9]/g, "")
    if (budgetNum && parseInt(budgetNum) > 0) {
      const k = Math.round(parseInt(budgetNum) / 1000)
      if (k > 0) details.push(`under $${k}K`)
    }
  }

  if (details.length === 0) {
    const p = persona.toLowerCase()
    if (p.includes("investor")) details.push("solid yield potential")
    else if (p.includes("first home")) details.push("move-in ready")
    else if (p.includes("family")) details.push("family-friendly layout")
    else if (p.includes("downsize")) details.push("low-maintenance")
    else details.push("ticks your boxes")
  }

  return details.slice(0, 3).join(", ")
}

function fill(template: string, slots: Slots): string {
  return template
    .replace(/\{\{fn\}\}/g, slots.fn)
    .replace(/\{\{an\}\}/g, slots.an)
    .replace(/\{\{sig\}\}/g, slots.sig)
    .replace(/\{\{soldAddr\}\}/g, slots.soldAddr)
    .replace(/\{\{activeAddr\}\}/g, slots.activeAddr)
    .replace(/\{\{details\}\}/g, slots.details)
    .replace(/\{\{cta\}\}/g, slots.cta)
}

const SMS: Record<string, string[]> = {
  "New Listing Match": [
    "Hi {{fn}}, thanks for coming to {{soldAddr}}. Got another that suits, {{details}} at {{activeAddr}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} here. After {{soldAddr}}, thought of {{activeAddr}} for you, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} from the {{soldAddr}} open. {{activeAddr}} just listed, {{details}}. {{cta}} {{sig}}",
    "Hi {{fn}}, loved chatting at {{soldAddr}}. Have one at {{activeAddr}}, {{details}}. {{cta}} Cheers, {{sig}}",
  ],
  "Market Pulse": [
    "Hi {{fn}}, {{an}} here. Market's moving, {{activeAddr}} just listed, {{details}}. Thought of you from {{soldAddr}}. {{cta}} {{sig}}",
    "Hi {{fn}}, quick one from {{an}}. Since {{soldAddr}}, new one at {{activeAddr}}, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} here. Suburb update, {{activeAddr}} just came on, {{details}}. {{cta}} Cheers, {{sig}}",
  ],
  "Price Movement Alert": [
    "Hi {{fn}}, {{an}} here. Prices shifted near {{soldAddr}}. {{activeAddr}} well-priced, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, heads up from {{an}}. {{activeAddr}} priced right, {{details}}. Similar to what you liked at {{soldAddr}}. {{cta}} {{sig}}",
  ],
  "Life Check-In": [
    "Hi {{fn}}, {{an}} here. How's the search since {{soldAddr}}? Got {{activeAddr}} coming up, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} checking in. Still looking? {{activeAddr}} just came up, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, hope you're well. {{an}} here, {{activeAddr}} just listed, {{details}}. Thought of you. {{cta}} {{sig}}",
  ],
  "Competition Signal": [
    "Hi {{fn}}, {{an}} here. {{activeAddr}} getting strong interest, {{details}}. Thought of you from {{soldAddr}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, quick one from {{an}}. {{activeAddr}} drawing buyers, {{details}}. Worth a look before Sat. {{cta}} {{sig}}",
  ],
  "Social Proof Drop": [
    "Hi {{fn}}, {{an}} here. Another buyer just purchased nearby. {{activeAddr}} still available, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} from {{soldAddr}}. Someone similar just bought in the area. {{activeAddr}}, {{details}}. {{cta}} {{sig}}",
  ],
  "Investment Angle Flip": [
    "Hi {{fn}}, {{an}} here. {{activeAddr}} stacks up as an investment, {{details}}. Thought of you from {{soldAddr}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, quick one from {{an}}. {{activeAddr}} strong rental yield, {{details}}. {{cta}} Cheers, {{sig}}",
  ],
  "SMS Drip Sequence": [
    "Hi {{fn}}, {{an}} here. Still have {{activeAddr}} on my mind for you, {{details}}. {{cta}} Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} again. {{activeAddr}} open this week, {{details}}. Worth a look? Cheers, {{sig}}",
  ],
  "Phone Script": [
    "Hi {{fn}}, {{an}} here. Tried calling, {{activeAddr}} just listed, {{details}}. Give me a buzz when free? Cheers, {{sig}}",
    "Hi {{fn}}, {{an}} here. Missed you, {{activeAddr}} came up, {{details}}. Call me back when suits? {{sig}}",
  ],
  "Vendor Advocate": [
    "Hi {{fn}}, {{an}} here. Got an off-market at {{activeAddr}}, {{details}}. Perfect for what you described at {{soldAddr}}. {{cta}} {{sig}}",
    "Hi {{fn}}, {{an}} here. Before it hits the market, {{activeAddr}}, {{details}}. Keen for first look? Cheers, {{sig}}",
  ],
}

const DEFAULT_SMS = [
  "Hi {{fn}}, {{an}} here from the {{soldAddr}} open. Got one at {{activeAddr}}, {{details}}. {{cta}} Cheers, {{sig}}",
  "Hi {{fn}}, {{an}} here. Thought of you for {{activeAddr}}, {{details}}. {{cta}} Cheers, {{sig}}",
]

const SUBJECTS: string[] = [
  "After {{soldAddr}}, {{fn}}",
  "{{activeAddr}}, {{details}}",
  "New one for you, {{fn}}",
  "Quick note from {{an}}",
]

const BODIES: Array<[string, string, string]> = [
  [
    "Hi {{fn}}, great meeting you at {{soldAddr}}. You mentioned {{details}} and I've got one that fits.",
    "{{activeAddr}} just came on. It matches what you described. Happy to send through details or arrange a private look.",
    "{{cta}} No pressure at all.\n\nCheers,\n{{sig}}",
  ],
  [
    "Hi {{fn}}, {{an}} here. Enjoyed chatting at the {{soldAddr}} open. Your requirements stuck with me.",
    "{{activeAddr}} just listed, {{details}}. Based on what you told me, worth seeing in person.",
    "{{cta}} Let me know what works.\n\nCheers,\n{{sig}}",
  ],
  [
    "Hi {{fn}}, following up from {{soldAddr}}. {{activeAddr}} has come up and matches what you were after, {{details}}.",
    "I remember your key points and this ticks the boxes. Worth seeing it for yourself.",
    "{{cta}} Happy to work around your schedule.\n\nCheers,\n{{sig}}",
  ],
  [
    "Hi {{fn}}, {{an}} here. After our chat at {{soldAddr}}, I kept an eye out for something that fits, {{details}}.",
    "{{activeAddr}} just hit the market. It lines up well with what you mentioned. Happy to walk you through it privately.",
    "{{cta}}\n\nCheers,\n{{sig}}",
  ],
]

export function generateFromTemplate(params: {
  agentName: string
  agentAgency: string
  soldShortAddr?: string
  activeShortAddr?: string
  lead: {
    name: string
    notes: string
    transcript?: string
    questions: string
    persona: string
    budget: string
    suburb?: string
  }
  strategy: string
  channel: "sms" | "email" | "both"
}): TemplateResult {
  const { agentName, agentAgency, soldShortAddr, activeShortAddr, lead, strategy } = params
  const fn = lead.name.split(" ")[0]
  const an = agentName.split(" ")[0]
  const sig = agentAgency ? `${an}, ${agentAgency}` : an
  const soldAddr = soldShortAddr || "the open home"
  const activeAddr = activeShortAddr || "the new listing"
  const allNotes = [lead.notes, lead.transcript || ""].filter(Boolean).join(" ")
  const details = extractDetails(allNotes, lead.questions, lead.persona, lead.budget)
  const cta = "Open this Sat, keen for a look?"

  const slots: Slots = { fn, an, sig, soldAddr, activeAddr, details, cta }

  const hash = simpleHash(`${lead.name}:${strategy}`)

  const smsPool = SMS[strategy] || DEFAULT_SMS
  const smsTemplate = smsPool[hash % smsPool.length]
  let sms = fill(smsTemplate, slots)
  // No style-driven cap, pure runaway safety net — see docs/VOICE_CORPUS_VINUTH.md
  if (sms.length > 700) sms = sms.slice(0, 697).trimEnd() + "..."

  const subjectIdx = hash % SUBJECTS.length
  const bodyIdx = hash % BODIES.length
  const subject = fill(SUBJECTS[subjectIdx], slots)
  const body = BODIES[bodyIdx].map(p => fill(p, slots))

  return {
    sms: sanitiseText(sms),
    email: {
      subject: sanitiseText(subject),
      body: body.map(sanitiseText),
    },
  }
}
