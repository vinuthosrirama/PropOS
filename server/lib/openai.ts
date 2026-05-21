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
  const { agentName, agentAgency, agentSuburb, voiceContext, voiceTraits, slmContext, lead, strategy, channel } = params

  // Property knowledge block — injected first so LLM can cite specific facts
  const slmBlock = slmContext
    ? `${slmContext}\n`
    : ""

  // Voice identity block — rich context wins over simple trait list
  const voiceBlock = voiceContext
    ? voiceContext
    : (voiceTraits ?? []).length > 0
      ? `Communication style:\n${(voiceTraits ?? []).map(t => `- ${t}`).join("\n")}`
      : "Communication style:\n- professional, warm, and direct"

  const system = `You are ${agentName}, a real estate agent at ${agentAgency} in ${agentSuburb}.

${slmBlock}${voiceBlock}

Hard rules — never break these:
- Write in first person as ${agentName}
- HARD CONSTRAINT: never use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma, period, or "and" instead.
- SMS must be under 160 characters and read like a real text message, not a marketing blast
- Email must be 2-3 short paragraphs maximum
- Always use the lead's first name at least once
- CRITICAL: You have detailed notes and questions below — use them. Reference what they specifically asked or observed at the open home. Do not write generic phrases like "you might be interested" or "let me know if you want more info" when you have real intel about what matters to them.
- If the lead asked specific questions, answer at least one of them in the outreach (especially in the email).
- No spam words (FREE, URGENT, ACT NOW, LIMITED TIME etc.)
- If training examples are provided above, match that exact tone and vocabulary. Do not revert to formal or generic language.`

  // Build lead context — transcript gets its own block because it's the richest signal
  const transcriptBlock = lead.transcript
    ? `\nVoice memo / field notes (use these specific details — this is what the agent observed):\n"${lead.transcript}"`
    : ""

  const user = `LEAD: ${lead.name}
Budget: ${lead.budget} | Timeline: ${lead.timeline} | Buyer type: ${lead.persona}
Open home notes: ${lead.notes || "none"}
Questions they raised at the open home: ${lead.questions || "none"}${transcriptBlock}

STRATEGY: ${strategy}
CHANNEL: ${channel}

Write the message now. Rules:
- SMS: Reference what they specifically asked or care about. Under 160 chars.
- Email subject: Specific to this lead — mention the property and something relevant to them personally.
- Email body: Para 1 — reference something they said/asked at the open home. Para 2 — answer their key question with data from the property context above. Para 3 — specific CTA.
- NEVER write "I have a new listing that might interest you" or "let me know if you want more info" — be specific.
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
