const BASE_URL = process.env.BASE_URL ?? "https://propos.addvantage.site"

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
  leadId:          string
}): string {
  const unsubUrl    = `${BASE_URL}/unsubscribe?token=${encodeURIComponent(params.leadId)}`
  const color       = params.agencyColor ?? "#4B2E7E"
  const tagline     = params.agencyTagline ?? ""
  const initials    = params.agentName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const firstName   = params.agentName.split(" ")[0]
  const lastName    = params.agentName.split(" ").slice(1).join(" ")

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
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 36px;"><div style="border-top:1px solid #e8e8e8;"></div></td></tr>

        <!-- Signature -->
        <tr><td style="padding:20px 36px 24px;">
          <table cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;width:100%;max-width:440px;">
            <tr>
              <!-- Initials avatar -->
              <td width="72" style="vertical-align:top;padding-right:0;">
                <div style="width:72px;height:72px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#555;font-family:Arial,sans-serif;text-align:center;line-height:72px;">
                  ${initials}
                </div>
              </td>
              <!-- Agency banner -->
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
          ${contactLine ? `<div style="margin-top:10px;font-size:12px;color:#555;font-family:Arial,sans-serif;">${contactLine}</div>` : ""}
        </td></tr>

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
</body>
</html>`
}
