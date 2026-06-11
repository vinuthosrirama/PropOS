import type { PriceUpdatePayload } from "./pitchGenerator.js"

const BASE_URL = process.env.BASE_URL ?? "https://propos.addvantage.site"

// ---------------------------------------------------------------------------
// Price Update content block — embeds the pitch data directly in the email
// body so the recipient sees comps + market stats without clicking a link.
// ---------------------------------------------------------------------------

export function buildPitchContentHtml(payload: PriceUpdatePayload, color: string): string {
  const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`
  const comps = payload.comparableSales ?? []
  const stats = payload.marketStats

  const compsHtml = comps.length === 0 ? "" : `
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:${color};text-transform:uppercase;font-family:Arial,sans-serif;margin:4px 0 10px;">Recent comparable sales</div>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;border:1px solid #e8e8e8;border-radius:6px;border-collapse:separate;overflow:hidden;">
      ${comps.slice(0, 3).map((c, i) => `
      <tr style="${i > 0 ? "border-top:1px solid #eee;" : ""}">
        <td style="padding:10px 14px;${i > 0 ? "border-top:1px solid #eee;" : ""}">
          <div style="font-size:13px;font-weight:600;color:#1a1a1a;font-family:Arial,sans-serif;">${c.address}</div>
          <div style="font-size:11px;color:#888;font-family:Arial,sans-serif;margin-top:2px;">${c.beds} bed &middot; Sold ${c.date}</div>
        </td>
        <td align="right" style="padding:10px 14px;font-size:14px;font-weight:800;color:${color};font-family:Arial,sans-serif;white-space:nowrap;${i > 0 ? "border-top:1px solid #eee;" : ""}">${fmt(c.price)}</td>
      </tr>`).join("")}
    </table>`

  const statCell = (label: string, value: string) => `
        <td align="center" style="padding:12px 6px;background:#f5f5f7;border-radius:6px;">
          <div style="font-size:16px;font-weight:800;color:#1a1a1a;font-family:Arial,sans-serif;">${value}</div>
          <div style="font-size:10px;color:#888;letter-spacing:0.5px;text-transform:uppercase;font-family:Arial,sans-serif;margin-top:3px;">${label}</div>
        </td>`

  const statCells = !stats ? [] : [
    stats.medianPrice ? statCell("Suburb median", fmt(stats.medianPrice)) : "",
    stats.daysOnMarket ? statCell("Days on market", String(stats.daysOnMarket)) : "",
    stats.clearanceRate ? statCell("Clearance rate", `${stats.clearanceRate}%`) : "",
    stats.annualGrowthPct ? statCell("Annual growth", `${stats.annualGrowthPct}%`) : "",
  ].filter(Boolean)

  const statsHtml = statCells.length === 0 ? "" : `
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:${color};text-transform:uppercase;font-family:Arial,sans-serif;margin:4px 0 10px;">${payload.recipient?.suburb ? `${payload.recipient.suburb} market snapshot` : "Market snapshot"}</div>
    <table cellpadding="0" cellspacing="6" width="100%" style="margin:0 0 16px -6px;">
      <tr>${statCells.join("")}</tr>
    </table>`

  const demand = payload.buyerDemand
  const demandHtml = !demand ? "" : `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;background:${color}11;border:1px solid ${color}33;border-radius:6px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:${color};text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:6px;">Buyer demand</div>
        <div style="font-size:13px;color:#333;font-family:Arial,sans-serif;line-height:1.5;">${demand.detail}</div>
      </td></tr>
    </table>`

  return demandHtml + compsHtml + statsHtml
}

// ---------------------------------------------------------------------------
// Barry Plant Signature Block
// ---------------------------------------------------------------------------

function buildBarryPlantSignature(params: {
  agentName: string
  agentPhone?: string
  agentEmail?: string
}): string {
  const nameParts = params.agentName.split(" ")
  const lastName  = nameParts.slice(1).join(" ").toUpperCase()
  const fullNameUpper = params.agentName.toUpperCase()

  return `
    <!-- ===== Barry Plant Signature ===== -->
    <table cellpadding="0" cellspacing="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;">

      <!-- Agent name + title -->
      <tr>
        <td style="padding-bottom:8px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;letter-spacing:0.3px;line-height:1.3;">${fullNameUpper}</div>
          <div style="font-size:11px;font-weight:700;color:#1a1a1a;letter-spacing:0.3px;">SALES CONSULTANT</div>
        </td>
      </tr>

      <!-- Barry Plant logo row -->
      <tr>
        <td style="padding-bottom:10px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td width="34" style="padding-right:7px;vertical-align:middle;">
                <!-- Stylised BP flame/shield in red -->
                <table cellpadding="0" cellspacing="0" width="30" height="30">
                  <tr>
                    <td style="background:#D94032;border-radius:3px;width:30px;height:30px;text-align:center;vertical-align:middle;">
                      <div style="font-size:14px;font-weight:900;color:#ffffff;line-height:30px;font-family:Georgia,serif;">&#9650;</div>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:17px;font-weight:900;color:#1A2F5E;letter-spacing:2px;font-family:Arial,sans-serif;">BARRY</span>
                <span style="font-size:17px;font-weight:400;color:#1A2F5E;letter-spacing:2px;font-family:Arial,sans-serif;">&nbsp;PLANT</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Phone numbers in brand red -->
      ${params.agentPhone ? `
      <tr>
        <td style="padding-bottom:6px;">
          <span style="font-size:12px;font-weight:600;color:#D94032;font-family:Arial,sans-serif;">03 9707 1400</span>
          <span style="font-size:12px;color:#999;font-family:Arial,sans-serif;"> | </span>
          <span style="font-size:12px;font-weight:600;color:#D94032;font-family:Arial,sans-serif;">${params.agentPhone}</span>
        </td>
      </tr>` : ""}

      <!-- Office locations -->
      <tr>
        <td style="padding-bottom:2px;font-size:11px;font-family:Arial,sans-serif;">
          <strong style="color:#1a1a1a;">Berwick</strong>
          <span style="color:#555;"> | 100 High Street Berwick </span>
          <a href="https://www.barryplant.com.au/offices/berwick" style="color:#D94032;text-decoration:underline;">VIC</a>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:2px;font-size:11px;font-family:Arial,sans-serif;">
          <strong style="color:#1a1a1a;">Pakenham</strong>
          <span style="color:#555;"> | </span>
          <a href="https://www.barryplant.com.au/offices/pakenham" style="color:#D94032;text-decoration:underline;">28 Southeast Boulevard Pakenham</a>
          <span style="color:#555;"> VIC</span>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:12px;font-size:11px;font-family:Arial,sans-serif;">
          <strong style="color:#1a1a1a;">Warragul-Drouin</strong>
          <span style="color:#555;"> | 49 Commercial Place Drouin VIC</span>
        </td>
      </tr>

      <!-- GET AN APPRAISAL CTA button -->
      <tr>
        <td style="padding-bottom:16px;">
          <a href="https://www.barryplant.com.au/appraisal"
             style="display:inline-block;background:#D94032;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:8px 22px;border-radius:20px;text-decoration:none;font-family:Arial,sans-serif;">
            GET AN APPRAISAL
          </a>
        </td>
      </tr>

      <!-- INVESTOR ADVANTAGE banner -->
      <tr>
        <td style="padding-bottom:16px;">
          <table cellpadding="0" cellspacing="0" style="background:#1A2F5E;border-radius:5px;overflow:hidden;max-width:420px;width:420px;">
            <tr>
              <!-- Copper/book panel -->
              <td width="90" style="background:linear-gradient(140deg,#7B3F1E,#A0522D);padding:0;text-align:center;vertical-align:middle;">
                <div style="padding:14px 8px;font-size:20px;font-weight:900;color:#e8c97a;font-family:Georgia,serif;letter-spacing:-1px;line-height:1.1;">I<br>A</div>
              </td>
              <!-- Text panel -->
              <td style="padding:10px 14px;vertical-align:middle;">
                <div style="font-size:13px;font-weight:900;color:#ffffff;letter-spacing:2px;font-family:Arial,sans-serif;margin-bottom:3px;">INVESTOR ADVANTAGE</div>
                <div style="font-size:9px;color:rgba(255,255,255,0.75);letter-spacing:1.2px;font-family:Arial,sans-serif;margin-bottom:8px;line-height:1.5;">
                  RENTAL INSIGHTS AND TRENDS<br>AUTUMN REPORT OUT NOW!
                </div>
                <a href="https://www.barryplant.com.au/investor-advantage"
                   style="display:inline-block;background:#D94032;color:#ffffff;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:12px;text-decoration:none;font-family:Arial,sans-serif;">
                  VIEW FREE REPORT
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Disclaimer -->
      <tr>
        <td>
          <p style="margin:0;font-size:9px;color:#777;font-style:italic;line-height:1.6;font-family:Arial,sans-serif;max-width:520px;">
            Disclaimer: This email, including any attachments, is confidential and may be privileged. If you are not the intended recipient, notify the sender and delete immediately; do not copy or disclose the contents. We may collect your personal information in the course of providing our services. For further information see our <a href="https://www.barryplant.com.au/privacy" style="color:#D94032;text-decoration:underline;">privacy policy</a>.
            Occasionally, I work outside regular hours. <strong>If this email reaches you outside your work hours, there is no expectation for you to read, act, or respond to it.</strong>
          </p>
        </td>
      </tr>

    </table>`
}

// ---------------------------------------------------------------------------
// Generic email HTML builder
// ---------------------------------------------------------------------------

export function buildEmailHTML(params: {
  agentName:       string
  agencyName:      string
  agentEmail?:     string
  agentPhone?:     string
  agencyColor?:    string
  agencyTagline?:  string
  leadFirstName:   string
  propertyAddress: string
  priceGuide?:     string
  bodyParagraphs:  string[]
  contentHtml?:    string   // pre-built rich block (e.g. pitch comps/stats) injected after the property box
  leadId:          string
  trackingId?:     number   // outreach_log id — enables open/click pixel tracking
}): string {
  const unsubUrl    = `${BASE_URL}/unsubscribe?token=${encodeURIComponent(params.leadId)}`
  const color       = params.agencyColor ?? "#4B2E7E"
  const tagline     = params.agencyTagline ?? ""
  const initials    = params.agentName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const firstName   = params.agentName.split(" ")[0]
  const lastName    = params.agentName.split(" ").slice(1).join(" ")

  // Detect Barry Plant brand
  const isBarryPlant = params.agencyName.toLowerCase().includes("barry plant")

  const paragraphsHtml = params.bodyParagraphs
    .map(p => `<p style="margin:0 0 16px 0;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Georgia,serif;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")

  const propertyBox = `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 20px 0;">
      <tr><td style="background:#f5f5f7;border-radius:6px;padding:12px 16px;border-left:3px solid ${color};">
        <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:${params.priceGuide ? "3px" : "0"};font-family:Arial,sans-serif;">&#128205;&nbsp;${params.propertyAddress}</div>
        ${params.priceGuide ? `<div style="font-size:12px;color:#666;font-family:Arial,sans-serif;">Guide: ${params.priceGuide}</div>` : ""}
      </td></tr>
    </table>`

  const contactLine = [
    params.agentPhone ? `&#128222;&nbsp;${params.agentPhone}` : "",
    params.agentEmail ? `&#9993;&nbsp;${params.agentEmail}` : "",
  ].filter(Boolean).join(`<span style="color:#ccc;margin:0 10px;">|</span>`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#f0f0f0;-webkit-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:28px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Top colour strip -->
        <tr><td style="background:${color};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 36px 8px;">
          ${paragraphsHtml}
          ${propertyBox}
          ${params.contentHtml ?? ""}
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 36px;"><div style="border-top:1px solid #e8e8e8;"></div></td></tr>

        <!-- Signature (Barry Plant or generic) -->
        <tr><td style="padding:20px 36px 24px;">
          ${isBarryPlant
            ? buildBarryPlantSignature({ agentName: params.agentName, agentPhone: params.agentPhone, agentEmail: params.agentEmail })
            : `<table cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;width:100%;max-width:440px;">
            <tr>
              <td width="72" style="vertical-align:top;padding-right:0;">
                <div style="width:72px;height:72px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#555;font-family:Arial,sans-serif;text-align:center;line-height:72px;">
                  ${initials}
                </div>
              </td>
              <td style="background:${color};padding:10px 16px;vertical-align:top;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="font-size:9px;color:rgba(255,255,255,0.65);letter-spacing:0.8px;text-transform:uppercase;font-family:Arial,sans-serif;padding-bottom:6px;">${tagline}</td>
                    <td align="right" style="font-size:15px;font-weight:900;color:#ffffff;letter-spacing:1px;font-family:Arial,sans-serif;padding-bottom:6px;">${params.agencyName.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="font-size:15px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;line-height:1.3;">
                      ${firstName}&nbsp;<span style="font-weight:400;">${lastName}</span>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="font-size:11px;color:rgba(255,255,255,0.75);font-family:Arial,sans-serif;padding-top:2px;">Licensed Estate Agent / Auctioneer</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          ${contactLine ? `<div style="margin-top:10px;font-size:12px;color:#555;font-family:Arial,sans-serif;">${contactLine}</div>` : ""}`
          }
        </td></tr>

        <!-- CTA button (shown when trackingId is set — links to tracked click endpoint) -->
        ${params.trackingId ? `
        <tr><td style="padding:8px 36px 20px;">
          <a href="${BASE_URL}/api/track/click/${params.trackingId}?url=${encodeURIComponent(`mailto:${params.agentEmail ?? ""}?subject=${encodeURIComponent("Appraisal Request – " + params.propertyAddress)}`)}"
             style="display:inline-block;padding:12px 24px;background:${params.agencyColor ?? "#4B2E7E"};color:#ffffff;font-size:13px;font-weight:700;border-radius:7px;text-decoration:none;font-family:Arial,sans-serif;letter-spacing:0.2px;">
            📅 Book a Free Appraisal
          </a>
        </td></tr>` : ""}

        <!-- Footer -->
        <tr><td style="background:#f9f9f9;border-top:1px solid #eeeeee;padding:12px 36px;">
          <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;font-family:Arial,sans-serif;">
            You received this message because you attended a recent open home.&nbsp;
            <a href="${unsubUrl}" style="color:#aaa;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
  ${params.trackingId ? `<img src="${BASE_URL}/api/track/open/${params.trackingId}" width="1" height="1" style="display:block;width:1px;height:1px;visibility:hidden;" alt="">` : ""}
</body>
</html>`
}
