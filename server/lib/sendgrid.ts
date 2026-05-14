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
}): Promise<{ messageId: string; testMode: boolean }> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

  const testEmail  = process.env.TEST_RECIPIENT_EMAIL?.trim()
  const actualTo   = testEmail ? testEmail : params.to
  const actualSubj = testEmail ? `[TEST → ${params.to}] ${params.subject}` : params.subject
  const html       = params.htmlBody + unsubscribeFooter(params.leadId)

  const [response] = await sgMail.send({
    to:      actualTo,
    from:    params.from,
    subject: actualSubj,
    html,
    trackingSettings: {
      clickTracking: { enable: true, enableText: false },
      openTracking:  { enable: true },
    },
  })

  return { messageId: response.headers["x-message-id"] as string ?? "unknown", testMode: !!testEmail }
}
