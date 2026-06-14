/**
 * PropOS PM Brief
 *
 * Emails Vinuth a Claude-generated morning brief every weekday at 9am.
 * Doubles as domain warm-up — a real, conversational email from yourpartners@
 * to Vinuth's inbox every weekday, building sending reputation.
 *
 * Recipient: PM_EMAIL env var, falling back to TEST_RECIPIENT_EMAIL.
 * Content: funnel snapshot + 3 concrete today-actions + strategic note.
 */

import { getClient } from "./claude.js"
import { sanitiseText } from "./sanitise.js"
import { sendEmail, gmailConfigured } from "./gmail.js"
import { sendViaBlueBubbles, blueBubblesConfigured } from "./bluebubbles.js"
import type { MorningBrief } from "./outreachAgent.js"

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function todayLabel(): string {
  const d = new Date()
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function buildSubject(brief: MorningBrief): string {
  const parts: string[] = []
  if (brief.newReplies.length > 0) {
    parts.push(`${brief.newReplies.length} new repl${brief.newReplies.length === 1 ? "y" : "ies"}`)
  }
  if (brief.pendingDrafts > 0) {
    parts.push(`${brief.pendingDrafts} draft${brief.pendingDrafts === 1 ? "" : "s"} to approve`)
  }
  if (brief.followUpsDue.length > 0) {
    parts.push(`${brief.followUpsDue.length} follow-up${brief.followUpsDue.length === 1 ? "" : "s"} due`)
  }
  const headline = parts.length > 0 ? parts.join(", ") : "campaign brief"
  return `PropOS PM — ${todayLabel()} — ${headline}`
}

async function generatePMText(brief: MorningBrief): Promise<string[]> {
  const replyLines = brief.newReplies.map(r =>
    `- ${r.name} (${r.agency}): "${r.body.slice(0, 80)}"`,
  ).join("\n") || "None overnight."

  const followUpLines = brief.followUpsDue.map(f =>
    `- ${f.name} (${f.agency}), ${f.daysSince} days since last contact`,
  ).join("\n") || "None."

  const data = [
    `Funnel: Contacted ${brief.totalContacted} | Replied ${brief.totalReplied} | Demo booked ${brief.totalDemoBooked}`,
    `Pending drafts to review: ${brief.pendingDrafts}`,
    `Overnight replies:\n${replyLines}`,
    `Follow-ups due:\n${followUpLines}`,
  ].join("\n")

  if (!process.env.ANTHROPIC_API_KEY) {
    return buildFallbackParagraphs(brief)
  }

  try {
    const res = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 450,
      messages: [{
        role: "user",
        content: `You are a no-nonsense startup PM briefing a solo founder (Vinuth) building PropOS, an AI outreach tool for real estate agents. Write a morning brief email body based on this data:

${data}

Rules:
- 3 short paragraphs. Plain prose, no markdown, no bullet points, no headers.
- Paragraph 1: overnight activity — who replied and what they said, drafts waiting, funnel movement. Be specific with names.
- Paragraph 2: exactly 3 concrete actions for today — imperative sentences, specific names. Start each with a number: 1. 2. 3.
- Paragraph 3: 1-2 sentences — strategic observation (what angle is working, what to double down on) or honest encouragement if slow. No fluff.
- Tone: direct, like a trusted co-founder. Not a cheerleader. Not corporate.
- No em-dashes. Short sentences.
- Last line: just the word "Vinuth" on its own line (sign-off).`,
      }],
    })
    const raw = (res.content[0] as { type: string; text: string }).text ?? ""
    return raw.split(/\n\n+/).map(p => sanitiseText(p.trim())).filter(Boolean)
  } catch (err) {
    console.warn("[pmBrief] Claude generation failed, using fallback:", (err as Error).message)
    return buildFallbackParagraphs(brief)
  }
}

function buildFallbackParagraphs(brief: MorningBrief): string[] {
  const p1 = brief.newReplies.length > 0
    ? `${brief.newReplies.map(r => r.name.split(" ")[0]).join(", ")} replied overnight. You have ${brief.pendingDrafts} draft${brief.pendingDrafts === 1 ? "" : "s"} waiting.`
    : `No new replies overnight. Funnel: ${brief.totalContacted} contacted, ${brief.totalReplied} replied, ${brief.totalDemoBooked} demo booked.`

  const actions: string[] = []
  if (brief.pendingDrafts > 0) {
    actions.push(`Review and approve the ${brief.pendingDrafts} pending draft${brief.pendingDrafts === 1 ? "" : "s"} before the 10am send window.`)
  }
  if (brief.followUpsDue.length > 0) {
    actions.push(`Queue follow-ups for ${brief.followUpsDue.slice(0, 3).map(f => f.name.split(" ")[0]).join(", ")}.`)
  }
  actions.push("Check the Campaign view and add 2 new targets to the CRM.")

  const p2 = actions.slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join(" ")

  const replyRate = brief.totalContacted > 0
    ? Math.round((brief.totalReplied / brief.totalContacted) * 100)
    : 0
  const p3 = brief.totalReplied > 0
    ? `${replyRate}% reply rate. Keep the sends tight and the tone personal.`
    : "No replies yet. That's normal in week one. Consistent daily sends matter more than overthinking the copy."

  return [p1, p2, p3, "Vinuth"]
}

function buildHTMLBody(paragraphs: string[], brief: MorningBrief): string {
  const funnelRow = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f7f7f7;border-radius:8px">
      <tr>
        <td align="center" style="padding:14px 8px;font-family:-apple-system,sans-serif">
          <span style="font-size:24px;font-weight:700;color:#111">${brief.totalContacted}</span><br>
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Contacted</span>
        </td>
        <td align="center" style="padding:14px 8px;font-family:-apple-system,sans-serif;border-left:1px solid #e5e5e5">
          <span style="font-size:24px;font-weight:700;color:#111">${brief.totalReplied}</span><br>
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Replied</span>
        </td>
        <td align="center" style="padding:14px 8px;font-family:-apple-system,sans-serif;border-left:1px solid #e5e5e5">
          <span style="font-size:24px;font-weight:700;color:#22aa66">${brief.totalDemoBooked}</span><br>
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Demo Booked</span>
        </td>
        <td align="center" style="padding:14px 8px;font-family:-apple-system,sans-serif;border-left:1px solid #e5e5e5">
          <span style="font-size:24px;font-weight:700;color:#cc4477">${brief.pendingDrafts}</span><br>
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Drafts</span>
        </td>
      </tr>
    </table>`

  const paras = paragraphs.map(p =>
    `<p style="font-family:-apple-system,sans-serif;font-size:15px;line-height:1.65;color:#222;margin:0 0 16px 0">${p.replace(/\n/g, "<br>")}</p>`,
  ).join("\n")

  return `<div style="max-width:560px;margin:0 auto;padding:28px 24px">
  <p style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin:0 0 4px 0">PropOS</p>
  <h2 style="font-family:-apple-system,sans-serif;font-size:20px;font-weight:700;color:#111;margin:0 0 4px 0">Morning Brief</h2>
  <p style="font-family:-apple-system,sans-serif;font-size:13px;color:#aaa;margin:0 0 8px 0">${todayLabel()}</p>
  ${funnelRow}
  ${paras}
  <p style="font-family:-apple-system,sans-serif;font-size:12px;color:#ccc;margin:24px 0 0 0;padding-top:14px;border-top:1px solid #eee">
    AddVantage AI &middot; <a href="https://propos.addvantage.site" style="color:#ccc;text-decoration:none">propos.addvantage.site</a>
  </p>
</div>`
}

/** Send a short iMessage morning brief to Vinuth's phone via BlueBubbles. */
export async function sendPMBriefSMS(brief: MorningBrief): Promise<void> {
  if (!blueBubblesConfigured()) return
  const to = process.env.VINUTH_PHONE?.trim() || process.env.TEST_RECIPIENT_PHONE?.trim()
  if (!to) return

  const d = new Date()
  const dateStr = `${d.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}`
  const parts: string[] = [`PropOS ${dateStr}:`]

  if (brief.newReplies.length > 0) {
    parts.push(`${brief.newReplies.length} repl${brief.newReplies.length === 1 ? "y" : "ies"}`)
  }
  if (brief.pendingDrafts > 0) {
    parts.push(`${brief.pendingDrafts} draft${brief.pendingDrafts === 1 ? "" : "s"} to approve`)
  }
  if (brief.followUpsDue.length > 0) {
    parts.push(`${brief.followUpsDue.length} follow-up${brief.followUpsDue.length === 1 ? "" : "s"} due`)
  }
  if (brief.newReplies.length === 0 && brief.pendingDrafts === 0 && brief.followUpsDue.length === 0) {
    parts.push("all quiet overnight")
  }

  let msg = parts.join(" ") + `. Funnel: ${brief.totalContacted} contacted / ${brief.totalReplied} replied / ${brief.totalDemoBooked} demo booked.`

  if (brief.newReplies.length > 0) {
    const top = brief.newReplies[0]
    const snippet = top.body?.slice(0, 50).replace(/\n/g, " ") ?? ""
    msg += ` ${top.name.split(" ")[0]}: "${snippet}${snippet.length >= 50 ? "..." : ""}"`
  }

  try {
    await sendViaBlueBubbles(to, msg)
    console.log(`[pmBrief] iMessage brief sent to ${to}`)
  } catch (err) {
    console.warn("[pmBrief] iMessage brief failed:", (err as Error).message)
  }
}

/** Send the morning PM brief to Vinuth's email. No-ops silently if Gmail isn't configured. */
export async function sendPMBriefEmail(brief: MorningBrief): Promise<void> {
  if (!gmailConfigured()) return
  const to = process.env.PM_EMAIL?.trim() || process.env.TEST_RECIPIENT_EMAIL?.trim()
  if (!to) return

  try {
    const [paragraphs, subject] = await Promise.all([
      generatePMText(brief),
      Promise.resolve(buildSubject(brief)),
    ])
    const htmlBody = buildHTMLBody(paragraphs, brief)
    await sendEmail({ to, fromName: "PropOS PM", subject, htmlBody })
    console.log(`[pmBrief] brief emailed to ${to} — "${subject}"`)
  } catch (err) {
    console.error("[pmBrief] send failed:", (err as Error).message)
  }
}
