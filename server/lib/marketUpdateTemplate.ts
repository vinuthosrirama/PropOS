/**
 * Market Update Email Template
 *
 * Generates a branded one-pager showing:
 *   - Vendor's property with estimated current value
 *   - 6 comparable recent sales in the area
 *   - Market stats (median, growth, days on market, clearance rate)
 *   - CTA to book a free appraisal
 *   - Open/click tracking pixel
 *
 * This is PropOS's answer to Realtair's "Market Updates" —
 * but AI-personalized and with richer data.
 */

const BASE_URL = process.env.BASE_URL ?? "https://propos.addvantage.site"

export interface CompSaleRow {
  address: string
  beds: number
  baths: number
  land: number
  soldPrice: number
  soldDate: string
  matchScore: number
}

export interface MarketUpdateParams {
  // Agent
  agentName: string
  agencyName: string
  agencyColor: string
  agentPhone?: string
  agentEmail?: string

  // Vendor's property
  vendorName: string
  vendorFirstName: string
  propertyAddress: string
  suburb: string
  beds: number
  baths: number
  land: number

  // Valuation
  estimateLow: number
  estimateMid: number
  estimateHigh: number
  equityGain?: number
  annualGrowthPct: number

  // Comparable sales (up to 6)
  comps: CompSaleRow[]

  // Market stats
  medianHouse: number
  daysOnMarket: number
  clearanceRate: number
  demandScore: number

  // Personalised intro (AI-generated or cached)
  introLine?: string

  // Tracking
  trackingId?: number
  leadId: string
}

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${(n / 1_000).toFixed(0)}K`
}

function fmtFull(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

export function buildMarketUpdateHTML(params: MarketUpdateParams): string {
  const color = params.agencyColor || "#4B2E7E"
  const firstName = params.agentName.split(" ")[0]
  const initials = params.agentName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const unsubUrl = `${BASE_URL}/unsubscribe?token=${encodeURIComponent(params.leadId)}`

  const intro = params.introLine
    || `Here's your latest market snapshot for ${params.suburb}. Some interesting activity in your area recently.`

  const compsHTML = params.comps.slice(0, 6).map(c => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;font-family:Arial,sans-serif;">
        ${c.address}
        <div style="font-size:11px;color:#888;margin-top:2px;">${c.beds}bd ${c.baths}ba${c.land ? ` · ${c.land}m²` : ""}</div>
      </td>
      <td style="padding:8px 12px;font-size:14px;font-weight:700;color:#1a1a1a;border-bottom:1px solid #f0f0f0;text-align:right;font-family:Arial,sans-serif;white-space:nowrap;">
        ${fmtFull(c.soldPrice)}
      </td>
      <td style="padding:8px 12px;font-size:11px;color:#888;border-bottom:1px solid #f0f0f0;text-align:right;font-family:Arial,sans-serif;white-space:nowrap;">
        ${c.soldDate}
      </td>
    </tr>
  `).join("")

  const ctaHref = params.trackingId
    ? `${BASE_URL}/api/track/click/${params.trackingId}?url=${encodeURIComponent(`mailto:${params.agentEmail ?? ""}?subject=${encodeURIComponent("Appraisal Request - " + params.propertyAddress)}`)}`
    : `mailto:${params.agentEmail ?? ""}?subject=${encodeURIComponent("Appraisal Request - " + params.propertyAddress)}`

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
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header banner -->
        <tr><td style="background:${color};padding:28px 36px 24px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">MARKET UPDATE</div>
                <div style="font-size:22px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;line-height:1.2;">
                  ${params.propertyAddress}
                </div>
                <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;font-family:Arial,sans-serif;">
                  ${params.suburb} · ${params.beds} bed · ${params.baths} bath${params.land ? ` · ${params.land}m²` : ""}
                </div>
              </td>
              <td width="80" align="right" style="vertical-align:top;">
                <div style="width:56px;height:56px;border-radius:28px;background:rgba(255,255,255,0.15);text-align:center;line-height:56px;font-size:20px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;">
                  ${initials}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Estimated value box -->
        <tr><td style="padding:24px 36px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f8fa;border-radius:10px;border:1px solid #e8e8ec;">
            <tr>
              <td style="padding:18px 20px;text-align:center;">
                <div style="font-size:10px;font-weight:700;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">ESTIMATED VALUE</div>
                <div style="font-size:28px;font-weight:900;color:${color};font-family:Arial,sans-serif;letter-spacing:-0.5px;">
                  ${fmtPrice(params.estimateLow)} – ${fmtPrice(params.estimateHigh)}
                </div>
                <div style="font-size:12px;color:#888;margin-top:4px;font-family:Arial,sans-serif;">
                  Based on ${params.comps.length} comparable sales in ${params.suburb}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Market stats row -->
        <tr><td style="padding:16px 36px 0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="25%" style="text-align:center;padding:8px;">
                <div style="font-size:20px;font-weight:800;color:${color};font-family:Arial,sans-serif;">${params.annualGrowthPct}%</div>
                <div style="font-size:10px;color:#888;font-family:Arial,sans-serif;">Annual growth</div>
              </td>
              <td width="25%" style="text-align:center;padding:8px;">
                <div style="font-size:20px;font-weight:800;color:${color};font-family:Arial,sans-serif;">${fmtPrice(params.medianHouse)}</div>
                <div style="font-size:10px;color:#888;font-family:Arial,sans-serif;">Median house</div>
              </td>
              <td width="25%" style="text-align:center;padding:8px;">
                <div style="font-size:20px;font-weight:800;color:${color};font-family:Arial,sans-serif;">${params.daysOnMarket}d</div>
                <div style="font-size:10px;color:#888;font-family:Arial,sans-serif;">Days on market</div>
              </td>
              <td width="25%" style="text-align:center;padding:8px;">
                <div style="font-size:20px;font-weight:800;color:${color};font-family:Arial,sans-serif;">${params.clearanceRate}%</div>
                <div style="font-size:10px;color:#888;font-family:Arial,sans-serif;">Clearance rate</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Personalised intro -->
        <tr><td style="padding:20px 36px 8px;">
          <p style="margin:0;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Georgia,serif;">
            Hi ${params.vendorFirstName},
          </p>
          <p style="margin:12px 0 0 0;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Georgia,serif;">
            ${intro}
          </p>
        </td></tr>

        <!-- Comparable sales table -->
        <tr><td style="padding:16px 36px;">
          <div style="font-size:10px;font-weight:700;color:${color};letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;">RECENT SALES NEAR YOU</div>
          <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e8e8ec;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8f8fa;">
              <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif;">Property</td>
              <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:right;font-family:Arial,sans-serif;">Sold</td>
              <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:right;font-family:Arial,sans-serif;">Date</td>
            </tr>
            ${compsHTML}
          </table>
        </td></tr>

        ${params.equityGain && params.equityGain > 0 ? `
        <!-- Equity callout -->
        <tr><td style="padding:0 36px 16px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,${color}08,${color}15);border-radius:10px;border:1px solid ${color}25;">
            <tr><td style="padding:16px 20px;text-align:center;">
              <div style="font-size:11px;color:#666;font-family:Arial,sans-serif;">Your estimated equity gain since purchase</div>
              <div style="font-size:24px;font-weight:900;color:#22c55e;font-family:Arial,sans-serif;margin-top:4px;">+${fmtFull(params.equityGain)}</div>
            </td></tr>
          </table>
        </td></tr>` : ""}

        <!-- CTA -->
        <tr><td style="padding:8px 36px 24px;text-align:center;">
          <a href="${ctaHref}"
             style="display:inline-block;padding:14px 32px;background:${color};color:#ffffff;font-size:14px;font-weight:700;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;letter-spacing:0.3px;">
            Book a Free Appraisal
          </a>
          <div style="font-size:11px;color:#aaa;margin-top:8px;font-family:Arial,sans-serif;">
            No obligation. Takes 15 minutes.
          </div>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 36px;"><div style="border-top:1px solid #e8e8e8;"></div></td></tr>

        <!-- Agent signature -->
        <tr><td style="padding:20px 36px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td width="48" style="vertical-align:top;padding-right:12px;">
                <div style="width:44px;height:44px;border-radius:22px;background:${color};text-align:center;line-height:44px;font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">
                  ${initials}
                </div>
              </td>
              <td style="vertical-align:top;">
                <div style="font-size:14px;font-weight:700;color:#1a1a1a;font-family:Arial,sans-serif;">${params.agentName}</div>
                <div style="font-size:12px;color:#666;font-family:Arial,sans-serif;">${params.agencyName}</div>
                ${params.agentPhone ? `<div style="font-size:12px;color:#888;font-family:Arial,sans-serif;margin-top:2px;">${params.agentPhone}</div>` : ""}
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9f9f9;border-top:1px solid #eeeeee;padding:12px 36px;">
          <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;font-family:Arial,sans-serif;">
            This market update is for informational purposes only. Estimated values are based on recent comparable sales and may differ from a formal appraisal.&nbsp;
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

export function buildMarketUpdateSMS(params: {
  vendorFirstName: string
  agentFirstName: string
  suburb: string
  estimateLow: number
  estimateHigh: number
  agencyName: string
}): string {
  return `Hi ${params.vendorFirstName}, ${params.agentFirstName} from ${params.agencyName}. Quick market update for ${params.suburb}: comparable homes selling ${fmtPrice(params.estimateLow)}-${fmtPrice(params.estimateHigh)}. Worth a chat about your position? ${params.agentFirstName}`
}
