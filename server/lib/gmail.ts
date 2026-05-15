import { google } from "googleapis"

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return auth
}

export function gmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_USER
  )
}

function makeRaw(from: string, to: string, subject: string, html: string): string {
  const boundary = `PropOS_${Date.now()}`
  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString("base64"),
    ``,
    `--${boundary}--`,
  ].join("\r\n")
  return Buffer.from(msg).toString("base64url")
}

export async function sendEmail(params: {
  to:        string
  fromName:  string
  subject:   string
  htmlBody:  string
}): Promise<{ messageId: string; testMode: boolean }> {
  const testEmail  = process.env.TEST_RECIPIENT_EMAIL?.trim()
  const actualTo   = testEmail ?? params.to
  const actualSubj = testEmail ? `[TEST → ${params.to}] ${params.subject}` : params.subject

  const raw = makeRaw(
    `"${params.fromName}" <${process.env.GMAIL_USER}>`,
    actualTo,
    actualSubj,
    params.htmlBody,
  )

  const gmail = google.gmail({ version: "v1", auth: getAuth() })
  const res   = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  })

  return { messageId: res.data.id ?? "unknown", testMode: !!testEmail }
}
