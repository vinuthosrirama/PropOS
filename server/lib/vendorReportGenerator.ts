/**
 * Vendor Campaign Report Generator
 *
 * Generates weekly AI-written campaign updates in the agent's voice and
 * delivers them via email. Competes with Realtair Sell's campaign reports.
 *
 * Report content:
 *   - Campaign stats (views, first/last opened)
 *   - Suburb market conditions (from suburbContext)
 *   - AI-written 3-paragraph update in agent's voice
 *   - Agent card + contact info
 *
 * Triggered by Sunday 7am AEDT cron in outreachScheduler.ts.
 */

import { getClient, withLLMTimeout } from "./claude.js"
import { getSuburbContext } from "./suburbContext.js"
import { sendEmail, gmailConfigured } from "./gmail.js"
import { getActivePrompt, getActiveVersionId, recordSignal } from "./promptOptimiser.js"
import { query, execute, isDbConnected } from "./db.js"
import { sanitiseText } from "./sanitise.js"
import type { PitchAgentInfo, PitchCompSale } from "./pitchGenerator.js"

// ── System prompt ─────────────────────────────────────────────────────────────

const VENDOR_REPORT_SYSTEM_PROMPT = `You are writing a weekly vendor campaign report on behalf of a real estate agent. Write in first person, direct and professional but warm. Never use em-dashes. Never use these AI-writing tells: leverage, utilize, robust, seamless, holistic, pivotal, transformative, elevate, cornerstone, empower, comprehensive. 3 paragraphs: (1) current market conditions in the suburb, (2) this week's campaign activity including views and enquiries, (3) recommended next steps and what to expect in the coming week. Max 220 words total. End with the agent's first name only.`

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VendorReportContext {
  pitchId:         string
  slug:            string
  propertyAddress: string
  suburb:          string
  agentCard:       PitchAgentInfo
  vendorName:      string
  vendorEmail:     string
  weekNumber:      number
  viewCount:       number
  firstViewedAt:   string | null
  lastViewedAt:    string | null
  comparableSales: PitchCompSale[]
}

export interface VendorReportRow {
  id:          string
  pitch_id:    string
  agent_id:    string
  week_number: number
  payload_json: Record<string, unknown>
  html_body:   string | null
  status:      string
  sent_at:     string | null
  error_msg:   string | null
  created_at:  string
}

// ── HTML template ─────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Not yet opened"
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
    timeZone: "Australia/Melbourne",
  })
}

function buildHtml(ctx: VendorReportContext, aiBody: string): string {
  const { agentCard, propertyAddress, suburb, vendorName, weekNumber, viewCount, firstViewedAt, lastViewedAt, comparableSales } = ctx
  const initials = agentCard.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  const compsHtml = comparableSales.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="border-bottom:2px solid #E5E7EB;">
            <th style="text-align:left;padding:8px 0;font-size:12px;color:#6B7280;">Address</th>
            <th style="text-align:center;padding:8px 0;font-size:12px;color:#6B7280;">Beds</th>
            <th style="text-align:right;padding:8px 0;font-size:12px;color:#6B7280;">Sale Price</th>
            <th style="text-align:right;padding:8px 0;font-size:12px;color:#6B7280;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${comparableSales.slice(0, 5).map(c => `
          <tr style="border-bottom:1px solid #F3F4F6;">
            <td style="padding:8px 0;font-size:13px;">${c.address}</td>
            <td style="text-align:center;padding:8px 0;font-size:13px;color:#6B7280;">${c.beds}bd</td>
            <td style="text-align:right;padding:8px 0;font-size:13px;font-weight:600;">${fmtPrice(c.price)}</td>
            <td style="text-align:right;padding:8px 0;font-size:13px;color:#6B7280;">${c.date}</td>
          </tr>`).join("")}
        </tbody>
      </table>`
    : "<p style='color:#9CA3AF;font-size:13px;'>No comparable sales on record for this campaign.</p>"

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Week ${weekNumber} Campaign Update — ${propertyAddress}</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 28px;color:#fff;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.8;margin-bottom:8px;">Week ${weekNumber} Campaign Update</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:4px;">${propertyAddress}</div>
      <div style="font-size:14px;opacity:.85;">${suburb}</div>
    </div>

    <!-- Stats bar -->
    <div style="display:flex;border-bottom:1px solid #F3F4F6;">
      <div style="flex:1;padding:16px 20px;text-align:center;border-right:1px solid #F3F4F6;">
        <div style="font-size:28px;font-weight:700;color:#1D4ED8;">${viewCount}</div>
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Total views</div>
      </div>
      <div style="flex:1;padding:16px 20px;text-align:center;border-right:1px solid #F3F4F6;">
        <div style="font-size:13px;font-weight:600;color:#111827;">${fmtDate(firstViewedAt)}</div>
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">First opened</div>
      </div>
      <div style="flex:1;padding:16px 20px;text-align:center;">
        <div style="font-size:13px;font-weight:600;color:#111827;">${fmtDate(lastViewedAt)}</div>
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Last opened</div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#111827;">Hi ${vendorName.split(" ")[0]},</p>
      ${aiBody.split("\n\n").map(para => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">${para}</p>`).join("")}

      ${comparableSales.length > 0 ? `
      <div style="margin-top:24px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;margin-bottom:8px;">Recent comparable sales</div>
        ${compsHtml}
        <div style="font-size:11px;color:#9CA3AF;margin-top:6px;">Source: PropOS analysis</div>
      </div>` : ""}

      <!-- Agent card -->
      <div style="margin-top:28px;padding:16px;background:#F9FAFB;border-radius:8px;display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1D4ED8,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#111827;">${agentCard.name}</div>
          <div style="font-size:12px;color:#6B7280;">${agentCard.agency}${agentCard.suburb ? ` · ${agentCard.suburb}` : ""}</div>
          ${agentCard.phone ? `<div style="font-size:12px;color:#374151;margin-top:2px;">${agentCard.phone}</div>` : ""}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;background:#F9FAFB;border-top:1px solid #F3F4F6;text-align:center;">
      <div style="font-size:11px;color:#9CA3AF;">
        You're receiving this because your property is listed with ${agentCard.agency}.
        Powered by PropOS by AddVantage AI.
      </div>
    </div>

  </div>
</body>
</html>`
}

// ── LLM prose generation ──────────────────────────────────────────────────────

async function generateReportProse(ctx: VendorReportContext): Promise<string> {
  const suburbCtx = getSuburbContext(ctx.suburb)
  const systemPrompt = await getActivePrompt("vendor_report_system", VENDOR_REPORT_SYSTEM_PROMPT)
  const versionId = await getActiveVersionId("vendor_report_system")

  const agentFirst = ctx.agentCard.name.split(" ")[0]
  const userPrompt = [
    `Agent: ${ctx.agentCard.name}, ${ctx.agentCard.agency}`,
    `Property: ${ctx.propertyAddress}, ${ctx.suburb}`,
    `Campaign week: ${ctx.weekNumber}`,
    `Views this period: ${ctx.viewCount}`,
    `First opened: ${ctx.firstViewedAt ? fmtDate(ctx.firstViewedAt) : "not yet"}`,
    `Last opened: ${ctx.lastViewedAt ? fmtDate(ctx.lastViewedAt) : "not yet"}`,
    suburbCtx ? `\n${suburbCtx.promptBlock}` : `Suburb: ${ctx.suburb}`,
    `\nVendor first name: ${ctx.vendorName.split(" ")[0]}`,
    `Agent first name: ${agentFirst}`,
    "\nWrite the campaign update now:",
  ].join("\n")

  try {
    const message = await withLLMTimeout(signal =>
      getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }, { signal }),
    )
    const raw = message.content[0]?.type === "text" ? message.content[0].text : ""
    const cleaned = raw.replace(/```\n?/g, "").trim()
    if (!cleaned) throw new Error("empty LLM response")

    if (versionId) void recordSignal(versionId, "approved")
    return sanitiseText(cleaned)
  } catch {
    // Template fallback — always succeeds
    const suburbName = ctx.suburb
    const viewWord = ctx.viewCount === 1 ? "view" : "views"
    return [
      `The ${suburbName} market continues to move well, with strong buyer interest across most price points. ` +
      `Properties that present well and price correctly are finding buyers quickly, which bodes well for your campaign.`,
      `This week your campaign recorded ${ctx.viewCount} ${viewWord}. ` +
      `${ctx.viewCount >= 3 ? "This is healthy traffic and shows the listing is reaching the right buyers." : "We're in the early stages of the campaign and I expect activity to build as more buyers come to market."}`,
      `Over the coming week I'll be following up with interested parties and keeping you updated. ` +
      `Please don't hesitate to reach out if you have any questions. ${agentFirst}.`,
    ].join("\n\n")
  }
}

// ── Public: generate + send a single vendor report ───────────────────────────

export async function sendVendorReport(ctx: VendorReportContext): Promise<void> {
  if (!isDbConnected()) throw new Error("database not connected")
  if (!gmailConfigured()) throw new Error("Gmail not configured")

  const aiBody = await generateReportProse(ctx)
  const htmlBody = buildHtml(ctx, aiBody)

  const subject = `Week ${ctx.weekNumber} campaign update — ${ctx.propertyAddress}`

  await sendEmail({
    to:       ctx.vendorEmail,
    fromName: ctx.agentCard.name,
    subject,
    htmlBody,
  })

  await execute(
    `INSERT INTO vendor_reports (pitch_id, agent_id, week_number, payload_json, html_body, status, sent_at)
     VALUES ($1::uuid, $2, $3, $4, $5, 'sent', NOW())
     ON CONFLICT (pitch_id, week_number) DO UPDATE
       SET status = 'sent', sent_at = NOW(), html_body = EXCLUDED.html_body, error_msg = NULL`,
    [ctx.pitchId, ctx.agentCard.name, ctx.weekNumber, JSON.stringify(ctx), htmlBody],
  )
}

// ── Public: run weekly cron pass for all eligible pitches ─────────────────────

interface PitchForReport {
  id: string
  slug: string
  agent_id: string
  payload_json: {
    recipient?: { propertyAddress?: string; suburb?: string }
    agentCard?: PitchAgentInfo
    comparableSales?: PitchCompSale[]
  }
  vendor_email: string | null
  vendor_name: string | null
  view_count: number
  first_viewed_at: string | null
  last_viewed_at: string | null
  created_at: string
}

export async function runWeeklyVendorReports(): Promise<void> {
  if (!isDbConnected() || !gmailConfigured()) return

  const pitches = await query<PitchForReport>(
    `SELECT p.id, p.slug, p.agent_id, p.payload_json, p.vendor_email, p.vendor_name,
            p.view_count, p.first_viewed_at, p.last_viewed_at, p.created_at
     FROM pitches p
     WHERE p.status IN ('sent','viewed','accepted')
       AND p.vendor_email IS NOT NULL`,
  )

  for (const pitch of pitches) {
    try {
      const refDate = pitch.first_viewed_at ?? pitch.created_at
      const daysSince = Math.max(0, Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000))
      const weekNumber = Math.max(1, Math.ceil(daysSince / 7))

      // Skip if this week's report already sent or in progress
      const existing = await query<{ status: string }>(
        `SELECT status FROM vendor_reports WHERE pitch_id = $1 AND week_number = $2`,
        [pitch.id, weekNumber],
      )
      if (existing.length > 0 && existing[0].status !== "failed") continue

      const propertyAddress = pitch.payload_json.recipient?.propertyAddress ?? "Your property"
      const suburb          = pitch.payload_json.recipient?.suburb ?? ""
      const agentCard       = pitch.payload_json.agentCard ?? { name: "Your agent", agency: "AddVantage", suburb: "" }
      const comparableSales = pitch.payload_json.comparableSales ?? []

      const ctx: VendorReportContext = {
        pitchId:         pitch.id,
        slug:            pitch.slug,
        propertyAddress,
        suburb,
        agentCard,
        vendorName:      pitch.vendor_name ?? "Valued client",
        vendorEmail:     pitch.vendor_email!,
        weekNumber,
        viewCount:       pitch.view_count,
        firstViewedAt:   pitch.first_viewed_at,
        lastViewedAt:    pitch.last_viewed_at,
        comparableSales,
      }

      await sendVendorReport(ctx)
      console.log(`[vendorReport] week ${weekNumber} sent → ${pitch.vendor_email} (${propertyAddress})`)
    } catch (err) {
      // Log failure to vendor_reports table so manual resend is possible
      await execute(
        `INSERT INTO vendor_reports (pitch_id, agent_id, week_number, payload_json, status, error_msg)
         VALUES ($1::uuid, $2, $3, $4, 'failed', $5)
         ON CONFLICT (pitch_id, week_number) DO UPDATE
           SET status = 'failed', error_msg = EXCLUDED.error_msg`,
        [pitch.id, pitch.agent_id, 0, JSON.stringify({}), (err as Error).message],
      ).catch(() => {/* non-fatal */})
      console.warn(`[vendorReport] FAILED for pitch ${pitch.id}: ${(err as Error).message}`)
    }
  }
}
