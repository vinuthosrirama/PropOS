/**
 * One-time script to get a Gmail OAuth2 refresh token.
 *
 * Setup:
 *   1. Go to console.cloud.google.com → APIs & Services → Credentials
 *   2. Create OAuth 2.0 Client ID (type: Web application)
 *   3. Add http://localhost:9999/callback as an Authorised redirect URI
 *   4. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to server/.env
 *   5. Run: npx ts-node --esm server/scripts/get-gmail-token.ts
 *   6. Copy the printed GMAIL_REFRESH_TOKEN into server/.env
 */

import "dotenv/config"
import { google } from "googleapis"
import * as http from "http"
import * as url from "url"

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     ?? ""
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET ?? ""
const REDIRECT_URI  = "http://localhost:9999/callback"

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌  Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env first")
  process.exit(1)
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope:       ["https://www.googleapis.com/auth/gmail.send"],
  prompt:      "consent",   // force refresh_token every time
})

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
console.log("  PropOS — Gmail OAuth2 Token Setup")
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
console.log("1. Open this URL in your browser:\n")
console.log("   " + authUrl)
console.log("\n2. Sign in and grant access.")
console.log("   You will be redirected to localhost:9999/callback.\n")

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url ?? "", true)
  const code   = parsed.query.code as string | undefined

  if (!code) {
    res.writeHead(400)
    res.end("No code in callback URL.")
    return
  }

  res.writeHead(200, { "Content-Type": "text/html" })
  res.end("<h2 style='font-family:sans-serif'>✅ Authorised. You can close this tab.</h2>")

  server.close()

  try {
    const { tokens } = await oAuth2Client.getToken(code)

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.log("  ✅  Success! Add these to server/.env:")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log(`GMAIL_USER=<the Gmail address you just signed in with>`)
    console.log()
  } catch (err) {
    console.error("❌  Token exchange failed:", err)
  }
})

server.listen(9999, () => {
  console.log("Waiting on http://localhost:9999/callback ...\n")
})
