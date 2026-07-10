import OpenAI from "openai"
import fs from "fs"
import { sanitiseResult } from "./sanitise.js"
import { withLLMTimeout, withRetry } from "./llmUtils.js"

// Lazy init — only creates the client when actually called (avoids crash when key is empty)
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "not-set" })
  return _openai
}

// Exported for cross-module reuse (e.g. claude.ts's provider-agnostic JSON helper)
export const getOpenAIClient = getOpenAI

export interface GenerateParams {
  agentName: string
  agentAgency: string
  agentSuburb: string
  voiceContext?: string       // compiled voice profile + training corpus (preferred)
  voiceTraits?: string[]      // fallback: simple trait list (legacy)
  slmContext?: string         // property knowledge from Property SLM (injected before voice)
  soldShortAddr?: string      // e.g. "Thirlmere Ct" — for SMS old-property reference
  activeShortAddr?: string    // e.g. "Grand Arch Way" — for SMS new-property reference
  evolvedRules?: string       // DB-evolved style rules injected by promptOptimiser loop
  lead: {
    name: string
    budget: string
    timeline: string
    persona: string           // "family", "investor", "first home buyer", etc.
    notes: string             // open home notes
    transcript: string        // voice memo transcript (open home field notes)
    questions: string         // questions raised at open home
    suburb?: string           // optional — used in template fallback copy
  }
  strategy: string            // e.g. "Market Pulse", "SMS Drip Sequence"
  channel: "sms" | "email" | "both"
}

export interface GenerateResult {
  sms: string
  email: { subject: string; body: string[] }
}

export async function generateMessage(params: GenerateParams): Promise<GenerateResult> {
  const { agentName, agentAgency, agentSuburb, voiceContext, voiceTraits, slmContext, soldShortAddr, activeShortAddr, lead, strategy, channel } = params

  const agentFirst = agentName.split(" ")[0]

  // Voice identity block comes FIRST — it is the most important signal
  const voiceBlock = voiceContext
    ? voiceContext
    : (voiceTraits ?? []).length > 0
      ? `Communication style:\n${(voiceTraits ?? []).map(t => `- ${t}`).join("\n")}`
      : "Communication style:\n- professional, warm, and direct"

  // Property knowledge block — injected after voice so LLM stays in voice
  const slmBlock = slmContext
    ? `\n=== PROPERTY CONTEXT ===\n${slmContext}\n`
    : ""

  const smsAddrGuide = soldShortAddr && activeShortAddr
    ? `Use these exact short forms in the SMS: old property = "${soldShortAddr}", new property = "${activeShortAddr}".`
    : ""

  const evolvedBlock = params.evolvedRules?.trim()
    ? `\n=== LEARNED STYLE REFINEMENTS ===\n${params.evolvedRules}\n`
    : ""

  const system = `You are ${agentName}, a real estate agent at ${agentAgency} in ${agentSuburb}.

${voiceBlock}
${slmBlock}${evolvedBlock}
Hard rules — never break these:
- Write in first person as ${agentName} — use "I" throughout. This is a personal message from the agent to someone they already know.
- HARD CONSTRAINT: never use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma, period, or "and" instead.
- SMS has no strict length cap. Match the length of the training examples above naturally, do not compress or pad. Read like a real text message, not a marketing blast.
- Your identity appears ONCE in the SMS: the sign-off. Never also introduce yourself by name at the start; the recipient already knows you.
- VOICE MATCH: Your sign-off in the SMS MUST match the closing style from the training examples above. If examples show "Cheers" or "Cheers ${agentFirst}", use that. Do not default to "Thanks" or "Regards" if the training shows otherwise.
- Email must be 2-3 short paragraphs maximum
- Always use the lead's first name at least once
- CRITICAL: Use the detailed notes and questions below. Reference what they specifically asked or observed. No generic phrases.
- If the lead asked specific questions, answer at least one of them with a real data point from the property context.
- No spam words (FREE, URGENT, ACT NOW, LIMITED TIME etc.)
- Match the exact tone and vocabulary from training examples above.
- NEVER use these AI-writing tells — they make messages sound robotic: leverage, utilize, robust, seamless, holistic, actionable, synergy, paradigm, delve, showcasing, cutting-edge, pivotal, "testament to", transformative, elevate, cornerstone, empower, nuanced, multifaceted, paramount, comprehensive. Use plain everyday words.
- NO hollow openers: never start with "I wanted to reach out", "I hope this finds you well", "I wanted to let you know", "just wanted to touch base", "I wanted to share", or "I came across". Get straight to the point.`

  const transcriptBlock = lead.transcript
    ? `\nVoice memo / field notes (use these specific details):\n"${lead.transcript}"`
    : ""

  const user = `LEAD: ${lead.name}
Budget: ${lead.budget} | Timeline: ${lead.timeline} | Buyer type: ${lead.persona}
Open home notes: ${lead.notes || "none"}
Questions they raised at the open home: ${lead.questions || "none"}${transcriptBlock}

STRATEGY: ${strategy}
CHANNEL: ${channel}

Write the message now:
- SMS: no strict length cap, match the training examples' natural length. ${smsAddrGuide} Structure: (1) Greet by first name + thank them for coming to the old property, "Hi [Name], thanks for coming to [OldAddr]". (2) Natural bridge: "I actually have another property that fits your profile" or similar, then name 2-3 specific matching attributes pulled from their notes (beds, land size, school zone, yard, etc.) + the new property address. (3) Soft CTA, open home date/time if known, or "keen for a look?" or "call me anytime". (4) Sign off using the voice profile's sign-off block exactly (e.g. "Cheers, [Agent], Peake Real Estate"). Example: "Hi James, thanks for coming to 3 Thirlmere. Got another that suits, 4 bed, 744sqm, same school zone at 3 Fairholme. Open Sat 12:30. Keen? Cheers, Cameron" (warm, personal, not a marketing blast).
- Email subject: Conversational, specific to this lead. Reference the old property address or their question. No "[TEST", "New Listing", or generic subjects.
- Email body: Para 1, name the old property and one specific thing they said/asked there. Para 2, directly answer their key question using a data point from the Q&A context above (e.g. "land here is 650sqm vs the 612sqm at [old addr]"). Para 3, open home date/time with a low-pressure CTA. Sign off with your name only.
- NEVER write "I have a new listing that might interest you" or "let me know if you want more info".
Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2","paragraph 3"]}}`

  const completion = await withRetry(() => withLLMTimeout(signal =>
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }, { signal }),
  ))

  const raw = completion.choices[0]?.message?.content ?? "{}"
  try {
    return sanitiseResult(JSON.parse(raw) as GenerateResult)
  } catch {
    return sanitiseResult({
      sms: "Hi, saw you through the open home. Got something I think suits you, worth a look. When's a good time? Cheers",
      email: { subject: "From the open home", body: ["Hi, great meeting you at the open home.", "Got a property I think you'd like given what you were after. Happy to send through the details when suits."] },
    })
  }
}

/** Transcribe an audio file via OpenAI Whisper */
export async function transcribeAudio(filePath: string): Promise<string> {
  const transcription = await getOpenAI().audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "en",
  })
  return transcription.text
}
