import "dotenv/config"
import express from "express"
import cors from "cors"
import generateRouter from "./routes/generate.js"
import sheetRouter from "./routes/sheet.js"
import transcriptRouter from "./routes/transcript.js"
import sendRouter from "./routes/send.js"
import webhookRouter from "./routes/webhook.js"
import unsubscribeRouter from "./routes/unsubscribe.js"
import nurtureRouter from "./routes/nurture.js"
import analyticsRouter from "./routes/analytics.js"
import boxdiceRouter from "./routes/boxdice.js"
import { loadOptOuts } from "./lib/compliance.js"

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: ["http://localhost:3003", "http://localhost:5173", process.env.BASE_URL].filter(Boolean) as string[] }))
app.use(express.json())
// Twilio webhook sends URL-encoded body
app.use("/api/webhook/sms", express.urlencoded({ extended: false }))

app.use("/api/generate",    generateRouter)
app.use("/api/sheet",       sheetRouter)
app.use("/api/transcript",  transcriptRouter)
app.use("/api/send",        sendRouter)
app.use("/api/webhook",     webhookRouter)
app.use("/unsubscribe",     unsubscribeRouter)
app.use("/api/nurture",     nurtureRouter)
app.use("/api/analytics",   analyticsRouter)
app.use("/api/boxdice",     boxdiceRouter)

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openai:     !!process.env.OPENAI_API_KEY,
    anthropic:  !!process.env.ANTHROPIC_API_KEY,
    sheet:      !!process.env.SHEET_URL,
    twilio:     !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    sendgrid:   !!process.env.SENDGRID_API_KEY,
    boxdice:    !!(process.env.BOXDICE_DOMAIN && process.env.BOXDICE_API_KEY),
  })
})

app.listen(PORT, async () => {
  console.log(`PropOS server running on http://localhost:${PORT}`)
  console.log(`  OpenAI:    ${process.env.OPENAI_API_KEY   ? "configured" : "not set (demo fallback active)"}`)
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? "configured" : "not set (skipping analysis + QA)"}`)
  console.log(`  Sheet:     ${process.env.SHEET_URL         ? "configured" : "not set (demo mode)"}`)
  console.log(`  Twilio:    ${process.env.TWILIO_ACCOUNT_SID ? "configured" : "not set (SMS disabled)"}`)
  console.log(`  SendGrid:  ${process.env.SENDGRID_API_KEY   ? "configured" : "not set (email disabled)"}`)
  console.log(`  Boxdice:   ${process.env.BOXDICE_DOMAIN      ? "configured" : "not set (CRM disabled)"}`)
  await loadOptOuts()
})
