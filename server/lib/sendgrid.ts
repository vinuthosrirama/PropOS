import sgMail from "@sendgrid/mail"
import { unsubscribeFooter } from "./compliance.js"

export function sendgridConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY
}

export async function sendEmail(params: {
  to: string
  from: string
  subject: string
  htmlBody: string
  leadId: string
}): Promise<{ messageId: string }> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

  const html = params.htmlBody + unsubscribeFooter(params.leadId)

  const [response] = await sgMail.send({
    to: params.to,
    from: params.from,
    subject: params.subject,
    html,
    trackingSettings: {
      clickTracking: { enable: true, enableText: false },
      openTracking: { enable: true },
    },
  })

  return { messageId: response.headers["x-message-id"] as string ?? "unknown" }
}
