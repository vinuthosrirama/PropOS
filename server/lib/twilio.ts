import twilio from "twilio"

let _client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!_client) {
    _client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )
  }
  return _client
}

export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
}

export async function sendSMS(to: string, body: string): Promise<{ sid: string }> {
  const webhookUrl = process.env.BASE_URL
    ? `${process.env.BASE_URL}/api/webhook/sms`
    : undefined

  const msg = await getClient().messages.create({
    to,
    from: process.env.TWILIO_FROM_NUMBER!,
    body,
    ...(webhookUrl ? { statusCallback: webhookUrl } : {}),
  })
  return { sid: msg.sid }
}
