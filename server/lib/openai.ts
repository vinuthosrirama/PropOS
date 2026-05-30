import OpenAI from "openai"
import fs from "fs"
import { sanitiseResult } from "./sanitise.js"

// Lazy init — only creates the client when actually called (avoids crash when key is empty)
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "not-set" })
  return _openai
}

export interface GenerateParams {
  agentName: string
  agentAgency: string
  agentSuburb: string
  voiceContext?: string       // compiled voice profile + training corpus (preferred)
  voiceTraits?: string[]      // fallback: simple trait list (legacy)
  slmContext?: string         // property knowledge from Property SLM (injected before voice)
  soldShortAddr?: string      // e.g. "Thirlmere Ct" — for SMS old-property reference
  activeShortAddr?: string    // e.g. "Grand Arch Way" — for SMS new-property reference
  lead: {
    name: string
    budget: string
    timeline: string
    persona: string           // "family", "investor", "first home buyer", etc.
    notes: string             // open home notes
    transcript: string        // voice memo transcript (open home field notes)
    questions: string         // questions raised at open home
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

  const system = `You are ${agentName}, a real estate agent at ${agentAgency} in ${agentSuburb}.

${voiceBlock}
${slmBlock}
Hard rules — never break these:
- Write in first person as ${agentName}
- HARD CONSTRAINT: never use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma, period, or "and" instead.
- SMS must be under 160 characters and read like a real text message, not a marketing blast
- VOICE MATCH: Your sign-off in the SMS MUST match the closing style from the training examples above. If examples show "Cheers" or "Cheers ${agentFirst}", use that. Do not default to "Thanks" or "Regards" if the training shows otherwise.
- Email must be 2-3 short paragraphs maximum
- Always use the lead's first name at least once
- CRITICAL: Use the detailed notes and questions below. Reference what they specifically asked or observed. No generic phrases.
- If the lead asked specific questions, answer at least one of them with a real data point from the property context.
- No spam words (FREE, URGENT, ACT NOW, LIMITED TIME etc.)
- Match the exact tone and vocabulary from training examples above.`

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
- SMS: Under 160 chars. ${smsAddrGuide} Structure: greet by first name, reference seeing them at the old property (use short form), bridge with ONE specific thing they cared about from their notes or questions, introduce the new property (short form) with one matching fact (land, school zone, beds), give a CTA (open home time or "worth a look?"), close with agent sign-off from training examples. Example rhythm: "Hi [Name], saw you at OldAddr. Given [their specific interest], [NewAddr] has [matching fact]. [CTA]. [Sign-off]!" Keep it natural, not a fill-in-the-blank.
- Email subject: Conversational, specific to this lead. Reference the old property address or their question. No "[TEST", "New Listing", or generic subjects.
- Email body: Para 1, name the old property and one specific thing they said/asked there. Para 2, directly answer their key question using a data point from the Q&A context above (e.g. "land here is 650sqm vs the 612sqm at [old addr]"). Para 3, open home date/time with a low-pressure CTA. Sign off with your name only.
- NEVER write "I have a new listing that might interest you" or "let me know if you want more info".
Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2","paragraph 3"]}}`

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    max_tokens: 600,
    response_format: { type: "json_object" },
  })

  const raw = completion.choices[0]?.message?.content ?? "{}"
  try {
    return sanitiseResult(JSON.parse(raw) as GenerateResult)
  } catch {
    return sanitiseResult({
      sms: "Hi, I wanted to follow up, would love to chat about your property search. When suits?",
      email: { subject: "Following up from the open home", body: ["Hi, just wanted to touch base."] },
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
