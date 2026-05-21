import Anthropic from "@anthropic-ai/sdk"
import type { GenerateParams, GenerateResult } from "./openai.js"
import { sanitiseResult, sanitiseText } from "./sanitise.js"

// Lazy init — only creates the client when ANTHROPIC_API_KEY is set
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export interface LeadContext {
  name: string
  budget: string
  timeline: string
  persona: string
  notes: string
  transcript: string
  questions: string
}

export interface AnalysisResult {
  grade: "A" | "B" | "C" | "D"
  signals: string[]          // e.g. ["pre-approved", "motivated timeline", "school zone priority"]
  bestStrategy: string       // recommended reactivation strategy label
  bestChannel: "sms" | "email" | "call"
  callToAction: string       // specific hook to use in the message
  confidence: number         // 0-100
}

export interface QAResult {
  passed: boolean
  smsOk: boolean
  emailOk: boolean
  personalisationOk: boolean
  issues: string[]
  revisedSMS?: string
  revisedSubject?: string
  revisedEmailBody?: string[]
}

/**
 * Fallback outreach writer using Claude Sonnet.
 * Called when OpenAI is unavailable or returns an error.
 * Receives the same GenerateParams as generateMessage() so it has full context.
 */
export async function generateMessageClaude(params: GenerateParams): Promise<GenerateResult> {
  const { agentName, agentAgency, agentSuburb, voiceContext, slmContext, soldShortAddr, activeShortAddr, lead, strategy } = params

  const agentFirst = agentName.split(" ")[0]

  // Voice block first — strongest personalisation signal
  const voiceBlock = voiceContext
    ? voiceContext
    : "Communication style:\n- professional, warm, Australian-colloquial"

  const slmBlock = slmContext ? `\n=== PROPERTY CONTEXT ===\n${slmContext}\n` : ""

  const smsAddrGuide = soldShortAddr && activeShortAddr
    ? `Use these exact short forms in the SMS: old property = "${soldShortAddr}", new property = "${activeShortAddr}".`
    : ""

  const transcriptBlock = lead.transcript
    ? `\nVoice memo / field notes (use these specific details):\n"${lead.transcript}"`
    : ""

  const prompt = `You are ${agentName}, a real estate agent at ${agentAgency} in ${agentSuburb}.

${voiceBlock}
${slmBlock}
Hard rules:
- Write in first person as ${agentName}
- HARD CONSTRAINT: never use em-dashes (—), en-dashes (–), or double-hyphens (--). Use a comma instead.
- SMS must be under 160 characters, reads like a real text
- VOICE MATCH: SMS sign-off MUST match closing style from training examples above. If examples show "Cheers" or "Cheers ${agentFirst}", use that exactly.
- Email is 2-3 short paragraphs maximum
- Use the lead's first name at least once
- Include at least one specific detail from their notes or transcript. No generic templates.
- No spam words (FREE, URGENT, ACT NOW etc.)

LEAD: ${lead.name}
Budget: ${lead.budget} | Timeline: ${lead.timeline} | Buyer type: ${lead.persona}
Open home notes: ${lead.notes || "none"}
Questions raised: ${lead.questions || "none"}${transcriptBlock}

STRATEGY: ${strategy}

Write personalised SMS and email outreach for ${lead.name}. Rules:
- SMS: Under 160 chars. ${smsAddrGuide} Structure: greet by first name, reference seeing them at the old property (use short form), bridge with ONE specific thing they cared about from their notes/questions, introduce the new property (short form) with one matching fact, CTA, close with agent sign-off from training examples above. Example: "Hi [Name], saw you at [OldAddr] — given [their interest], [NewAddr] [matching fact]. [CTA]. Cheers [AgentFirst]!" Keep it natural.
- Email subject: Conversational, specific. Reference the old property or their question. No "New Listing" or generic subjects.
- Email body: Para 1 name the old property and one specific thing they asked/said. Para 2 answer their key question with a data point from the Q&A context (e.g. land size, school zone, price comparison). Para 3 open home date/CTA. Sign off with your name only.
- Never write generic phrases when you have real intel.

Respond ONLY with valid JSON, no markdown:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2","paragraph 3"]}}`

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
  // Strip potential markdown fences
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  try {
    return sanitiseResult(JSON.parse(cleaned) as GenerateResult)
  } catch {
    return sanitiseResult({
      sms: `Hi ${lead.name.split(" ")[0]}, ${agentName.split(" ")[0]} here from ${agentAgency}. Thought of you for a new listing, would love to share the details. When suits a quick chat?`,
      email: {
        subject: `New listing, thought of you, ${lead.name.split(" ")[0]}`,
        body: [
          `Hi ${lead.name.split(" ")[0]}, hope you're well.`,
          `I came across a new listing that made me think of you straight away. Given what you were looking for, it's worth a look. Happy to send through the details?`,
          `Cheers,\n${agentName.split(" ")[0]}`,
        ],
      },
    })
  }
}

/**
 * Analyse a lead and return scoring intel.
 * Uses claude-haiku-4-5 for speed and cost — pure logic, no writing.
 */
export async function analyseLead(lead: LeadContext): Promise<AnalysisResult> {
  const prompt = `You are a real estate sales intelligence engine. Analyse this open home lead and return a JSON object only.

Lead data:
Name: ${lead.name}
Budget: ${lead.budget}
Timeline: ${lead.timeline}
Buyer type: ${lead.persona}
Open home notes: ${lead.notes || "none"}
Voice transcript: ${lead.transcript || "none"}
Questions raised: ${lead.questions || "none"}

Return ONLY valid JSON (no markdown):
{
  "grade": "A|B|C|D",
  "signals": ["signal1","signal2","signal3"],
  "bestStrategy": "one of: Market Pulse|Price Movement Alert|New Listing Match|Life Check-In|Phone Script|Competition Signal|Vendor Advocate|SMS Drip Sequence|Investment Angle Flip|Social Proof Drop",
  "bestChannel": "sms|email|call",
  "callToAction": "specific hook sentence to use in the message",
  "confidence": 0-100
}

Grading: A=hot/motivated/pre-approved, B=interested/clear timeline, C=browsing/vague, D=unlikely/wrong budget.`

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
  try {
    return JSON.parse(raw) as AnalysisResult
  } catch {
    return {
      grade: "C", signals: [], bestStrategy: "Life Check-In",
      bestChannel: "sms", callToAction: "Would love to follow up on your property search.",
      confidence: 50,
    }
  }
}

/**
 * QA-review a drafted message against brand rules AND personalisation adequacy.
 * Uses claude-sonnet-4-5. Auto-rewrites if personalisation or rules fail.
 */
export async function qaMessage(params: {
  agentName: string
  leadName: string
  sms: string
  emailSubject: string
  emailBody: string[]
  leadNotes?: string
  leadTranscript?: string
  leadQuestions?: string
  slmContext?: string
}): Promise<QAResult> {
  const { agentName, leadName, sms, emailSubject, emailBody, leadNotes, leadTranscript, leadQuestions, slmContext } = params

  const personalisationContext = [
    leadNotes ? `Open home notes: ${leadNotes}` : "",
    leadTranscript ? `Voice transcript: ${leadTranscript}` : "",
    leadQuestions ? `Questions raised: ${leadQuestions}` : "",
    slmContext ? `\nProperty data:\n${slmContext}` : "",
  ].filter(Boolean).join("\n")

  const prompt = `You are a QA reviewer for real estate outreach. Review the messages below and return JSON only.

Agent: ${agentName}
Lead: ${leadName}

PERSONALISATION CONTEXT (what we know about this lead):
${personalisationContext || "none"}

SMS draft:
"${sms}"

Email subject: "${emailSubject}"
Email body:
${emailBody.map((p, i) => `[${i + 1}] ${p}`).join("\n")}

Rules to check:
1. SMS must be under 160 characters
2. HARD CONSTRAINT: no em-dashes (—), en-dashes (–), or double-hyphens (--) anywhere. Use a comma instead.
3. No false claims or promises
4. Agent writes in first person as ${agentName}
5. Lead's first name used at least once
6. No spam trigger words (FREE, URGENT, CLICK NOW etc.)
7. Email body must not exceed 3 paragraphs
8. Tone must be warm, Australian-colloquial, never corporate
9. PERSONALISATION: the SMS must name the old property (short street form, e.g. "Thirlmere Ct") AND the new property (short street form) with a specific buyer-interest bridge between them — generic phrases like "your property search" or "I thought of you" alone are not acceptable
10. PERSONALISATION: the email Para 1 must name the old property address specifically. Para 2 must answer at least one of the lead's actual questions using a data point from the property context (a number, zone name, or specific fact — not a vague sentence)
11. VOICE MATCH: the SMS sign-off must match the agent's closing style from the personalisation context. If the agent uses "Cheers [Name]" in examples, the SMS must end that way — not "Thanks" or "Regards"

If any rule fails, rewrite the SMS and full email body using the context above to fix the issue.

Return ONLY valid JSON (no markdown):
{
  "passed": true|false,
  "smsOk": true|false,
  "emailOk": true|false,
  "personalisationOk": true|false,
  "issues": ["issue1","issue2"],
  "revisedSMS": "corrected version if not personalisationOk or not smsOk, else omit",
  "revisedSubject": "corrected subject if not emailOk, else omit",
  "revisedEmailBody": ["paragraph 1","paragraph 2"] if not personalisationOk or not emailOk, else omit
}`

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  try {
    const result = JSON.parse(cleaned) as QAResult
    // Strip any em-dashes the QA rewriter may have introduced
    if (result.revisedSMS) result.revisedSMS = sanitiseText(result.revisedSMS)
    if (result.revisedSubject) result.revisedSubject = sanitiseText(result.revisedSubject)
    if (result.revisedEmailBody) result.revisedEmailBody = result.revisedEmailBody.map(sanitiseText)
    return result
  } catch {
    return { passed: true, smsOk: true, emailOk: true, personalisationOk: true, issues: [] }
  }
}

/**
 * Lightweight outreach writer using Claude Haiku — for Grade C leads.
 * Same interface as generateMessageClaude but uses haiku for cost efficiency.
 */
export async function generateMessageHaiku(params: GenerateParams): Promise<GenerateResult> {
  const { agentName, agentAgency, agentSuburb, lead, strategy } = params

  const prompt = `You are ${agentName}, a real estate agent at ${agentAgency} in ${agentSuburb}.
Hard rules: first person, SMS under 160 chars, HARD CONSTRAINT no em-dashes (—) or en-dashes (–) use a comma instead, 2 paragraphs max email, use lead's first name.

LEAD: ${lead.name} | Budget: ${lead.budget} | Buyer type: ${lead.persona}
Notes: ${lead.notes || "none"}
STRATEGY: ${strategy}

Respond ONLY with valid JSON:
{"sms":"...","email":{"subject":"...","body":["paragraph 1","paragraph 2"]}}`

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}"
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  try {
    return sanitiseResult(JSON.parse(cleaned) as GenerateResult)
  } catch {
    return sanitiseResult({
      sms: `Hi ${lead.name.split(" ")[0]}, ${agentName.split(" ")[0]} here. New listing worth a look, when's a good time?`,
      email: {
        subject: `New listing, ${lead.name.split(" ")[0]}`,
        body: [
          `Hi ${lead.name.split(" ")[0]}, hope you're well.`,
          `Cheers,\n${agentName.split(" ")[0]}`,
        ],
      },
    })
  }
}

// Model cost reference (USD per 1K tokens, approximate)
export const MODEL_COSTS: Record<string, number> = {
  "claude-sonnet-4-5": 0.003,
  "gpt-4o-mini":       0.0006,
  "claude-haiku-4-5":  0.00025,
  "template":          0,
}

