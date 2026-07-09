/**
 * Voice context store + LLM prompt compiler
 *
 * The problem this solves:
 *   VoiceProfile stores DERIVED attributes (formalityScore: 2, aussieIndex: 4).
 *   The LLM gets voiceTraits: ["warm","direct"] — bullet points, not your voice.
 *   This module stores the raw training corpus and compiles it into a rich
 *   prompt block that lets the LLM actually write like the agent.
 *
 * Usage:
 *   // When a training example is added (VoiceLearning.tsx):
 *   addCorpusEntry({ type: "voice", text, source: "Voice clip 1" })
 *
 *   // When generating a message (App.tsx → /api/generate):
 *   const voiceContext = buildVoiceContext(agent.voiceProfile, loadCorpus())
 *   // → pass to GenerateParams.voiceContext
 */

import type { VoiceProfile } from "../data"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrainingEntry {
  id:           string
  type:         "voice" | "paste" | "email" | "email_subject"
  text:         string
  timestamp:    string    // ISO date
  wordCount:    number
  source:       string    // display label e.g. "Voice clip 1"
  label?:       string    // user-supplied context e.g. "first contact investor"
  persona?:     "investor" | "family" | "downsizer" | "general"
  isAutoLearned?: boolean // true when captured automatically from a HUMAN_EDIT
}

// ── LocalStorage persistence ──────────────────────────────────────────────────

const CORPUS_KEY = "propOS_trainingCorpus_v1"

export function loadCorpus(): TrainingEntry[] {
  try {
    const raw = localStorage.getItem(CORPUS_KEY)
    return raw ? (JSON.parse(raw) as TrainingEntry[]) : []
  } catch {
    return []
  }
}

export function saveCorpus(entries: TrainingEntry[]): void {
  try {
    // Keep max 50 entries — older ones evicted (corpus stays fresh + prompt stays short)
    const trimmed = entries.slice(-50)
    localStorage.setItem(CORPUS_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function addCorpusEntry(entry: Omit<TrainingEntry, "id">): TrainingEntry {
  const newEntry: TrainingEntry = {
    ...entry,
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  }
  const existing = loadCorpus()
  saveCorpus([...existing, newEntry])
  return newEntry
}

export function clearCorpus(): void {
  localStorage.removeItem(CORPUS_KEY)
}

/**
 * Cameron Knoll's real-style outreach messages — seed corpus so the demo
 * starts with a trained voice from day one. Mix of SMS texts + email bodies.
 */
interface SeedEntry {
  type: "email" | "paste" | "email_subject"
  text: string
  source: string
  label: string
  persona: "investor" | "family" | "downsizer" | "general"
}

const CAMERON_SEED: SeedEntry[] = [
  // ── SMS examples ──────────────────────────────────────────────────────────
  {
    type: "paste",
    persona: "investor",
    label: "CGT deadline nudge",
    source: "SMS to investor: CGT angle",
    text: "Hi Michael, Cameron from Peake. Your Cedarwood place has grown to around $1.23M since 2016. Worth a look before the CGT discount window closes mid-2027. Happy to run through the numbers? Cheers, Cameron",
  },
  {
    type: "paste",
    persona: "family",
    label: "Upsizer equity nudge",
    source: "SMS to upsizer: equity angle",
    text: "Hi David, Cameron here. A similar 4-bed on Birkdale just settled at $1.08M. Your place has done really well since 2017. Might be the right time if you're thinking about that next step. Worth a chat? Cheers, Cam",
  },
  {
    type: "paste",
    persona: "downsizer",
    label: "Downsizer lifestyle pitch",
    source: "SMS to downsizer: lifestyle angle",
    text: "Hi Sandra, Cameron from Peake. Berwick's been strong lately. A comparable sold at $840K this month. If a move to something smaller is on your radar, your equity position is really good right now. Happy to have a friendly chat. Cam",
  },
  {
    type: "paste",
    persona: "general",
    label: "Market update opener",
    source: "SMS: market update",
    text: "Hi James, Cameron here from Peake. Just a quick heads up — a nearby home sold at $1.2M last week, which puts your place in a great spot. Worth a quick chat to see where you stand? No pressure at all. Cheers, Cameron",
  },
  // ── Email body examples ────────────────────────────────────────────────────
  {
    type: "email",
    persona: "investor",
    label: "Investor equity + CGT email",
    source: "Email to investor: CGT + equity",
    text: "Hi Michael, Cameron from Peake here. Quick update on Cedarwood Crescent. The Berwick market has had a strong run lately and a comparable investment property in the area recently sold above expectations. Your property has grown to approximately $1.23M since you purchased in 2016. That is $685K in equity, and with the 50% CGT discount still available if you sell before July 2027, the tax savings alone are worth understanding. I would love to run through a complimentary appraisal and show you what your options look like. No obligation at all, just a clear picture of where things stand. Happy to come to you. Cheers, Cameron",
  },
  {
    type: "email",
    persona: "family",
    label: "Upsizer equity funding email",
    source: "Email to upsizer: lifestyle + equity",
    text: "Hi David, Cameron from Peake here. Thought you would appreciate a quick market update on Thirlmere Court. A comparable property in Berwick has just settled well, and your home is now sitting at around $1.00M. That is $380K in equity since 2017. For families thinking about more space or a bigger backyard, that kind of equity position makes the next move a lot more achievable than most people expect. I would be happy to walk through the numbers with you over a coffee, no pressure and no obligation. Let me know if you are curious. Cheers, Cameron",
  },
  {
    type: "email",
    persona: "downsizer",
    label: "Downsizer release equity email",
    source: "Email to downsizer: equity release",
    text: "Hi Sandra, Cameron from Peake here. Hope you are well. Just wanted to touch base with a quick market update. A comparable Berwick home recently sold at $840K, which is really positive for your position. Your property has grown nicely since you purchased and the equity you have built up is substantial. For people thinking about right-sizing, whether it is freeing up capital, reducing maintenance, or just a fresh chapter, now is actually a really good time to understand your options. I am happy to do a no-pressure appraisal and talk through what the numbers would look like for you. Just let me know. Cheers, Cameron",
  },
  // ── Email subject lines ────────────────────────────────────────────────────
  {
    type: "email_subject",
    persona: "investor",
    label: "Subject: investor update",
    source: "Email subject: investor",
    text: "A quick update on your Berwick investment",
  },
  {
    type: "email_subject",
    persona: "general",
    label: "Subject: market update",
    source: "Email subject: general",
    text: "What's been happening in Berwick — quick update for you",
  },
]

// ── Manpreet Singh seed corpus (Barry Plant Berwick) ─────────────────────────

// ── Pas Sunilchandra seed corpus (Area Specialist, SE Melbourne) ──────────────
// Voice: concise, direct, data-forward, warm closer. Sign-off: "Cheers, Pas"

const PAS_SEED: SeedEntry[] = [
  {
    type: "paste",
    persona: "general",
    label: "Owner — equity check-in SMS",
    source: "SMS: equity nudge",
    text: "Hi Thomas, Pas from Area Specialist. Redwood Avenue is tracking around $690K now — that's $210K up since 2018. Worth a conversation if you're ever curious about your options. Cheers, Pas",
  },
  {
    type: "paste",
    persona: "owner-occupier" as unknown as "general",
    label: "Upsizer — commute motivation",
    source: "SMS: lifestyle pain point",
    text: "Hi Anna, Pas here. Gleneadie Close has come up well — sitting around $750K now. If the commute is still weighing on you both, your equity position makes a move a lot more doable than you might think. Cheers, Pas",
  },
  {
    type: "paste",
    persona: "downsizer",
    label: "Downsizer — soft check-in",
    source: "SMS: downsizer gentle approach",
    text: "Hi Chris, Pas from Area Specialist. Just wanted to check in — Saffron Drive is tracking well, up around $330K since 2016. No pressure at all, but whenever the time is right, I'm here. Cheers, Pas",
  },
  {
    type: "paste",
    persona: "general",
    label: "Market update opener",
    source: "SMS: comparable sale trigger",
    text: "Hi Thomas, Pas here. A comparable Hampton Park home just sold at $695K this week. Redwood Avenue is in the same bracket. If you'd ever like to know exactly where you sit, happy to chat. Cheers, Pas",
  },
  {
    type: "email",
    persona: "general",
    label: "Upsizer equity email — commute motivation",
    source: "Email to upsizer: lifestyle + numbers",
    text: "Hi Anna and Steve, Pas Sunilchandra from Area Specialist here. Hope you're both well. I wanted to reach out with a quick update on Gleneadie Close. Based on recent comparable sales in Hampton Park, your property is now estimated at approximately $750,000. That's around $210,000 in equity since you purchased in July 2020 — a really solid result. For anyone thinking about a move closer to the city, that kind of equity can make the transition much more affordable than people expect, even in the current market. I'd love to sit down with you both and run through what the numbers actually look like — what you'd walk away with, what a step-up property in an inner suburb might cost, and whether the timing makes sense. No pressure, just good information. Happy to come to you. Cheers, Pas",
  },
  {
    type: "email",
    persona: "downsizer",
    label: "Downsizer equity email — gentle approach",
    source: "Email to downsizer: lifestyle transition",
    text: "Hi Chris, Pas Sunilchandra from Area Specialist here. Just a quick note to check in and share some market news from Hallam. Saffron Drive is in a really strong spot right now — based on recent sales in the area, your property is sitting at around $790,000. That's approximately $330,000 in equity since 2016. For anyone thinking about a change of pace — whether that's something smaller, something closer to family, or simply less to maintain — that equity position gives you a lot of flexibility. There's absolutely no rush, and I know you'll move when the time is right. I'm just here to make sure you have the full picture whenever that day comes. Happy to put together a quiet appraisal at any stage — just say the word. Cheers, Pas",
  },
  {
    type: "email",
    persona: "general",
    label: "Straightforward equity update",
    source: "Email to owner: direct market update",
    text: "Hi Thomas, Pas Sunilchandra from Area Specialist here. Quick update on Redwood Avenue. The Hampton Park market has had some solid results lately and your property is tracking at around $690,000 — that's a $210,000 gain since you bought in 2018. I know you've mentioned the place needs some work, but the market isn't waiting on renovations at this price point — buyers are still moving on unrenovated homes in the area. Happy to put together a no-obligation appraisal if you'd like a clearer picture of where things stand. Just reply here or call me on 0430 366 649. Cheers, Pas",
  },
  {
    type: "email_subject",
    persona: "general",
    label: "Subject: comparable sale trigger",
    source: "Email subject: market update",
    text: "Hampton Park update — a comparable just sold that affects your position",
  },
  {
    type: "email_subject",
    persona: "downsizer",
    label: "Subject: downsizer check-in",
    source: "Email subject: gentle downsizer",
    text: "Checking in — Saffron Drive market update for you, Chris",
  },
]

// ── Manpreet Singh seed corpus (Barry Plant Berwick) ─────────────────────────

// ── Manpreet "Manny" Singh seed corpus (Barry Plant "BP" Berwick) ─────────────
// Voice: casual, personal, upbeat, neighbourhood-aware, low-pressure.
// Goes by "Manny". Agency short: "BP". Greeting: "Hey". Sign-off: "Cheers, Manny"
// References settlement, nearby listings, value as a positive surprise.

const MANPREET_SEED: SeedEntry[] = [
  {
    type: "paste",
    persona: "general",
    label: "Settlement reference — upsizer check-in",
    source: "SMS: post-settlement follow-up, Manny voice",
    text: "Hey Kevin, Manny from BP, hope you've been well since we settled on Van Der Haar! I was just helping with a listing on the next street and you guys are currently sitting on $758K today. Well done! If you'd ever like a chat or a free appraisal, just let me know. Cheers, Manny",
  },
  {
    type: "paste",
    persona: "investor",
    label: "CGT window — investor nudge",
    source: "SMS: investor CGT, Manny voice",
    text: "Hey Jason, Manny from BP! Hope all's well since Tilden Rise. Quick heads up — your 12-month CGT window just opened, which means any gain is now taxed at half rate. Given the market's holding up well, might be worth a quick chat. Let me know! Cheers, Manny",
  },
  {
    type: "paste",
    persona: "downsizer",
    label: "Downsizer — neighbourhood listing trigger",
    source: "SMS: downsizer, Manny neighbourhood angle",
    text: "Hey Bill and Heather, Manny from BP! Hope you're both keeping well since Royal Crescent. I was just out at an appraisal nearby and wanted to touch base. Your place is sitting well in today's market. If you ever want a no-pressure chat about your options, I'm always around. Cheers, Manny",
  },
  {
    type: "paste",
    persona: "general",
    label: "Nearby listing trigger — equity reveal",
    source: "SMS: comparable sale trigger, Manny voice",
    text: "Hey Thanh, Manny from BP! Was just helping with a listing on Tantallon and thought of you guys. You're sitting at around $837K today, well done! If you'd like to know more or just want a catch-up, happy to come over. Cheers, Manny",
  },
  {
    type: "paste",
    persona: "general",
    label: "Market pulse — light check-in",
    source: "SMS: market update, casual Manny style",
    text: "Hey Sam, Manny from BP, hope you and Rachel have settled in well at Ashfield Drive! Just a quick one — Berwick's been moving really well lately and your place is tracking up nicely. Nothing urgent, just wanted to keep you in the loop. Let me know if you ever want to chat! Cheers, Manny",
  },
  {
    type: "email",
    persona: "investor",
    label: "Investor email — CGT + personal touch",
    source: "Email: investor CGT, Manny voice",
    text: "Hey Jason, Manny from BP here. Hope you've been well since we settled on Tilden Rise! I was doing some work in Cranbourne North this week and your place came up in the numbers — sitting at around $848K now, which is a solid result since July last year. More importantly, your 12-month CGT window just opened, which means if you ever wanted to sell, any gain is taxed at half rate compared to before. I'm not pushing anything, just wanted to make sure you had the full picture. If you'd like me to put together a proper breakdown of your options, happy to do it at no cost and no obligation. Just reply here or give me a call. Cheers, Manny",
  },
  {
    type: "email",
    persona: "family",
    label: "Family email — settlement reference + value reveal",
    source: "Email: upsizer, Manny warm approach",
    text: "Hey Kevin and Amita, Manny from BP here. Hope you've all been well since we settled on Van Der Haar, and congrats again on the little one on the way! I was out doing some appraisals in the area this week and wanted to shoot you a quick note — your place is sitting at around $758K today. Well done, you've done really well since we settled. Nothing to do with it right now, but I just wanted to make sure you knew where you stood. If you ever want to chat about your options down the track, I'm always happy to come over and run through the numbers over a coffee. No rush, no pressure. Cheers, Manny",
  },
  {
    type: "email_subject",
    persona: "investor",
    label: "Subject: investor CGT timing",
    source: "Email subject: casual investor hook",
    text: "Quick one on Tilden Rise, Jason",
  },
  {
    type: "email_subject",
    persona: "family",
    label: "Subject: family value update",
    source: "Email subject: warm family check-in",
    text: "Checking in from Van Der Haar, Kevin and Amita",
  },
]

// ── Vinuth seed corpus (Peake Real Estate) ───────────────────────────────────
// Voice: warm, relational, multi-clause. Greeting "Hey"/"Hi". Sign-off block
// "Cheers/Thanks/Kind Regards, [Agent], Peake Real Estate". Signature CTA:
// "meet for a coffee (or tea) to discuss?". SMS runs up to 2 segments, do NOT
// compress to 160. Source of truth: docs/VOICE_CORPUS_VINUTH.md (raw answers).
const VINUTH_SEED: SeedEntry[] = [
  {
    type: "paste",
    persona: "investor",
    label: "Investor CGT nudge",
    source: "SMS to investor: CGT + equity, coffee CTA",
    text: "Hey Michael, I was looking through our lists, and noticed your IP on Cedarwood Drive, that you bought in 2016, is sitting on roughly ~$680-700k in equity and given the current market, it's crossing the 12-mo CGT discount window soon. If you'd like I can organise an appraisal to be sent your way, and we could meet for a coffee (or tea) to discuss? Let me know what you and Sarah are thinking, Cheers, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "family",
    label: "Upsizer, comparable sold",
    source: "SMS to upsizer: references what they told you",
    text: "Hey David, one of my colleagues sold a similar 4 bed, down the road from Thirlmere Drive, and I thought I'd reach out if you wanted to explore what Peake could do for you and Amy as well? I noticed you mentioned it was a bit cramped, the last time we spoke. More than happy to meet for a coffee (or tea) to discuss further? Thanks, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "downsizer",
    label: "Downsizer gentle check-in",
    source: "SMS to downsizer: courtesy, zero pressure",
    text: "Hey Sandra, hope you and Peter have both been well since we last spoke a few years ago at the sale at Birkdale Drive. Hoping you are settled well! A colleague of mine recently sold a similar property down the road, and wanted to give you guys a courtesy call to see what your thinking. More than happy to meet for a coffee (or tea) to see if there's anything we can help with? Thanks, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "general",
    label: "Cold database, no trigger",
    source: "SMS: low-pressure re-engagement",
    text: "Hey James, just reaching out to see if you are still actively looking for anything in the current property market. Despite the doom and gloom, there's still opportunities in the area. No dramas if not, Cheers, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "general",
    label: "Buyer follow-up after open home",
    source: "SMS to buyer: answer questions, forward S32",
    text: "Hey Priya, it was great to meet both you and Raj at Fairholme Drive on Saturday. Reaching back out to see if I can answer any more questions, or forward across the Section 32 or any docs across. Regarding the question about covenants, I have let my team know and I'll get back to you with an update. In the meantime, let me know if anything, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "investor",
    label: "Bad news honestly, market softened",
    source: "SMS: honest market softening, warm relationship",
    text: "Hey Michael, hope you and the family have been well since we last spoke. I'm sure you are familiar with the market softening across the nation, and Berwick is not immune. If there's anything we at Peake can help with, whether it's finding some new tenants, adding to the portfolio or freeing up some equity, don't hesitate to reach out. Cheers, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "general",
    label: "Not interested, keep door open",
    source: "SMS: gracious close, no pressure",
    text: "Hi David, absolutely no worries! If anything changes as the market moves, please do feel free to reach out any time, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "general",
    label: "Referral ask after a win",
    source: "SMS: celebrate result, soft referral ask",
    text: "Congratulations again Sandra, incredible result! The team and I are absolutely buzzing as well. As always if we can also make someone else's dream come true as well, just reach out. We'd be more than happy in helping out where we can. Congrats again, Vinuth, Peake Real Estate",
  },
  {
    type: "paste",
    persona: "general",
    label: "Cold reconnect, casual scheduling",
    source: "SMS: time-gap opener, parenthetical aside, real-calendar CTA",
    text: "Hi Tom, it's been a little while since we connected and the market (definitely) has changed a lot since then. Riverglen Road is sitting on a fair bit of equity since you purchased in 2016. If you're interested, I can schedule in a quick coffee chat in between meetings this or next week? Cheers, Vinuth, Peake RE",
  },
]

/**
 * Seeds the training corpus on first login.
 * Picks the right seed corpus for Cameron, Manpreet, Pas, or Vinuth.
 * Clears and re-seeds if switching agents (different prefix detected).
 */
export function seedCorpusIfEmpty(agentName?: string): TrainingEntry[] {
  const name = agentName?.toLowerCase() ?? ""

  const isManpreet = name.includes("manpreet")
  const isPas      = name.includes("pas") || name.includes("sunilchandra")
  const isCameron  = name.includes("cameron") || name.includes("knoll")

  // Vinuth is the default corpus: the Master login (and any unrecognised agent)
  // now falls through to Vinuth's voice instead of Cameron's. Cameron, Manpreet
  // and Pas are still served their own corpus when explicitly logged in.
  const seed   = isManpreet ? MANPREET_SEED : isPas ? PAS_SEED : isCameron ? CAMERON_SEED : VINUTH_SEED
  const prefix = isManpreet ? "manpreet" : isPas ? "pas" : isCameron ? "cameron" : "vinuth"

  // If corpus already has entries for this agent, leave it alone
  const existing = loadCorpus()
  if (existing.length > 0 && existing[0]?.id?.startsWith(`seed_${prefix}`)) {
    return existing
  }
  // Different agent or empty — re-seed with the right corpus
  const seeded: TrainingEntry[] = seed.map((s, i) => ({
    id:        `seed_${prefix}_${i}`,
    type:      s.type as TrainingEntry["type"],
    text:      s.text,
    timestamp: new Date(Date.now() - (seed.length - i) * 86400000).toISOString(),
    wordCount: s.text.split(/\s+/).length,
    source:    s.source,
    label:     s.label,
    persona:   s.persona as TrainingEntry["persona"],
  }))

  saveCorpus(seeded)
  return seeded
}

// ── Voice context compiler ────────────────────────────────────────────────────

/**
 * Builds a rich voice context block for LLM prompts.
 *
 * The compiled string is injected into the AddVantage AI system prompt so
 * every generated SMS/email sounds like the specific agent, not a template.
 *
 * Format (optimised for clarity + token efficiency):
 *
 *   === AGENT VOICE PROFILE ===
 *   Greeting: "Hey" | Closing: "Cheers,"
 *   Tone: Warm, casual, very Australian
 *   Length: Short, punchy sentences
 *   Data style: Backs claims with specific numbers
 *   Emoji: None
 *
 *   Training examples (write to match this style exactly):
 *   [voice · 42 words] Hey Michelle, Cameron here! School zone confirmed...
 *   [paste · 67 words] Hey Brett, just a heads up — I've got the S32 ready...
 */
export function buildVoiceContext(
  profile: VoiceProfile,
  corpus: TrainingEntry[],
): string {
  const lines: string[] = []

  lines.push("=== AGENT VOICE PROFILE ===")

  // Greeting + closing
  lines.push(`Greeting style: "${profile.greeting}" | Closing: "${profile.closing},"`)

  // Tone from formalityScore + aussieIndex
  const formalityDesc =
    profile.formalityScore <= 1 ? "Very casual, conversational" :
    profile.formalityScore <= 2 ? "Warm and friendly, not stiff" :
    profile.formalityScore <= 3 ? "Balanced, professional but approachable" :
    profile.formalityScore <= 4 ? "Polished and professional" :
                                  "Formal and structured"

  const aussieDesc =
    profile.aussieIndex >= 4 ? "Strong Australian voice, colloquial phrasing, local references" :
    profile.aussieIndex >= 3 ? "Noticeable Australian warmth" :
    profile.aussieIndex >= 2 ? "Neutral Australian tone" :
                               "Neutral, no strong regional markers"

  lines.push(`Tone: ${formalityDesc}. ${aussieDesc}.`)

  // Length + data style
  const lengthDesc =
    profile.lengthStyle === "short"    ? "Short, punchy sentences. Gets to the point." :
    profile.lengthStyle === "medium"   ? "Medium length. Enough detail without padding." :
                                         "Detailed. Includes supporting context and data."
  lines.push(`Message length: ${lengthDesc}`)

  const dataDesc =
    profile.specificity >= 4 ? "Regularly uses specific numbers, stats, and data points" :
    profile.specificity >= 3 ? "Occasionally backs claims with data" :
                               "Conversational, uses feelings and observations over data"
  lines.push(`Data use: ${dataDesc}`)

  // Emoji preference
  const emojiDesc =
    profile.emojiUsage === "frequent"   ? "Uses emojis naturally throughout" :
    profile.emojiUsage === "occasional" ? "Uses emojis sparingly for warmth" :
                                          "No emojis. Keeps it professional."
  lines.push(`Emoji: ${emojiDesc}`)

  // Detected personality traits
  if (profile.detectedTraits.length > 0) {
    lines.push(`Key traits: ${profile.detectedTraits.join(", ")}`)
  }

  // Raw training examples — most powerful signal for voice matching
  const examples = corpus.filter(e => e.text.trim().length > 20).slice(-8)  // latest 8
  if (examples.length > 0) {
    lines.push("")
    lines.push(`Training examples — write to match this style exactly:`)
    for (const entry of examples) {
      // Trim to ~120 chars for token efficiency — enough to capture voice
      const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + "..." : entry.text
      lines.push(`[${entry.type} · ${entry.wordCount}w] ${preview}`)
    }
  } else {
    lines.push("")
    lines.push("(No training examples yet — use the voice defaults above)")
  }

  return lines.join("\n")
}

// ── SLM-aware outreach prompt builder ────────────────────────────────────────

export interface SLMOutreachParams {
  agentName: string
  agentAgency: string
  voiceContext: string
  lead: {
    name: string
    budget: number
    persona: string
    notes: string
    questions: string[]
    transcript?: string
  }
  soldAddress: string
  soldSLMSummary: string
  activeAddress: string
  activeSLMSummary: string
  matchedQA: Array<{ question: string; answer: string }>
  comparisons: Array<{ label: string; soldValue: string; activeValue: string }>
  pitchAngles?: Array<{ type: "strength" | "neutral" | "warning"; text: string }>
}

/**
 * Builds the full system prompt for the outreach LLM call.
 * Injects: agent voice + lead context + sold-vs-active SLM comparison + Q&A answers.
 * The LLM uses this to write a hyper-personalised SMS + email without knowing
 * it is Claude — it is the AddVantage proprietary engine.
 */
export function buildOutreachPrompt(p: SLMOutreachParams): string {
  const fname = p.lead.name.split(" ")[0]
  const qaBlock = p.matchedQA.length > 0
    ? p.matchedQA.map(q => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n")
    : "(no answered questions available)"
  const compBlock = p.comparisons.length > 0
    ? p.comparisons.map(c => `${c.label}: ${c.soldValue} (property they saw) vs ${c.activeValue} (this property)`).join("\n")
    : "(no direct comparisons available)"
  const transcriptBlock = p.lead.transcript
    ? `VOICE TRANSCRIPT (agent notes — use for personalisation):\n"${p.lead.transcript}"`
    : "(no voice transcript)"

  const pitchBlock = p.pitchAngles && p.pitchAngles.length > 0
    ? "PITCH ANGLES (data-driven reasons this listing suits this lead — use these as your talking points):\n" +
      p.pitchAngles.map(a => `${a.type === "strength" ? "✅" : a.type === "warning" ? "⚠️" : "→"} ${a.text}`).join("\n")
    : ""

  return `${p.voiceContext}

=== OUTREACH TASK ===

You are ${p.agentName} from ${p.agentAgency}. Write in your voice above — not a generic template.

LEAD:
- Name: ${fname} (full: ${p.lead.name})
- Budget: $${p.lead.budget.toLocaleString()}
- Persona: ${p.lead.persona}
- Agent notes: ${p.lead.notes || "(none)"}
- Questions they asked at the open home: ${p.lead.questions.join("; ") || "(none recorded)"}

${transcriptBlock}

PROPERTY THEY SAW (sold): ${p.soldAddress}
${p.soldSLMSummary}

NEW LISTING (what you are pitching): ${p.activeAddress}
${p.activeSLMSummary}

SIDE-BY-SIDE COMPARISON:
${compBlock}

QUESTIONS ANSWERED FOR THIS NEW LISTING:
${qaBlock}

${pitchBlock}

WRITE:
1. An SMS (up to 2 segments, ~300 characters max — do NOT compress into one 160-char text if it costs the natural cadence) that:
   - Opens with their first name + your name
   - References one specific thing from the voice transcript or their questions
   - Names the new listing and one key similarity to what they saw
   - Has a clear call to action (open home date or "worth a look?")
   - Signs off using the voice profile's sign-off block exactly (e.g. "Cheers, [Agent], Peake Real Estate")
   - No em-dashes. Ranges use "to". Warm and Australian.

2. An email (subject line + body, 3 short paragraphs) that:
   - Para 1: Reference something specific they cared about at the sold property
   - Para 2: Directly answer 1 to 2 of their questions for this new listing using the Q&A above. Call out the comparison ("this one is 4-bed like the last, but at 680sqm vs 612sqm").
   - Para 3: Mention the open home date/time and invite them with a low-pressure CTA
   - Sign off with your name only (no agency tagline, no generic "kind regards")
   - No em-dashes. No "I hope this email finds you well." Just get into it.

Return JSON exactly:
{
  "sms": "...",
  "emailSubject": "...",
  "emailBody": ["paragraph 1", "paragraph 2", "paragraph 3", "Sign-off line"]
}`
}

/**
 * Lightweight version — just the most critical fields.
 * Used when token budget is tight (e.g. SMS-only generation).
 */
export function buildVoiceContextCompact(
  profile: VoiceProfile,
  corpus: TrainingEntry[],
): string {
  const example = corpus.slice(-1)[0]
  const exampleLine = example
    ? `\nExample: "${example.text.slice(0, 120)}${example.text.length > 120 ? "..." : ""}"`
    : ""

  return [
    `Greeting: "${profile.greeting}" | Closing: "${profile.closing},"`,
    `Tone: ${profile.formalityScore <= 2 ? "casual/warm" : "professional"}, ${profile.aussieIndex >= 3 ? "Australian" : "neutral"}`,
    `Length: ${profile.lengthStyle}${exampleLine}`,
  ].join("\n")
}
