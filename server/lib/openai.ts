import OpenAI from "openai"
import fs from "fs"

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
- Never use em-dashes (-- or —)
- SMS must be under 160 characters and read like a real text message, not a marketing blast
- Email must be 2-3 short paragraphs maximum
- Always use the lead's first name at least once
- Include at least one specific detail from their notes or transcript — no generic templates
- No spam words (FREE, URGENT, ACT NOW, LIMITED TIME etc.)
- If training examples are provided above, match that exact tone and vocabulary — do not revert to formal or generic language`

  // Build lead context — transcript gets its own block because it's the richest signal
  const transcriptBlock = lead.transcript
    ? `\nVoice memo / field notes (use these specific details — this is what the agent observed):\n"${lead.transcript}"`
    : ""

  const user = `LEAD: ${lead.name}
Budget: ${lead.budget} | Timeline: ${lead.timeline} | Buyer type: ${lead.persona}
Open home notes: ${lead.notes || "none"}
Questions raised: ${lead.questions || "none"}${transcriptBlock}

STRATEGY: ${strategy}
CHANNEL: ${channel}

Write the message now. Use the specific details above — never use generic phrases like "your property search" when you have real intel.
Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2"]}}`

  const completion = await openai.chat.completions.create({
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
    return JSON.parse(raw) as GenerateResult
  } catch {
    return {
      sms: "Hi, I wanted to follow up — would love to chat about your property search. When suits?",
      email: { subject: "Following up from the open home", body: ["Hi, just wanted to touch base."] },
    }
  }
}

/** Transcribe an audio file via OpenAI Whisper */
export async function transcribeAudio(filePath: string): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "en",
  })
  return transcription.text
}
