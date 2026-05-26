import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

// Load .env from server/ directory regardless of cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, ".env") })

import express from "express"
import cors from "cors"
import compression from "compression"
import generateRouter from "./routes/generate.js"
import vendorGenerateRouter from "./routes/vendor-generate.js"
import sheetRouter from "./routes/sheet.js"
import transcriptRouter from "./routes/transcript.js"
import sendRouter from "./routes/send.js"
import webhookRouter from "./routes/webhook.js"
import unsubscribeRouter from "./routes/unsubscribe.js"
import nurtureRouter from "./routes/nurture.js"
import analyticsRouter from "./routes/analytics.js"
import boxdiceRouter from "./routes/boxdice.js"
import { loadOptOuts } from "./lib/compliance.js"
import { gmailConfigured } from "./lib/gmail.js"
import conversationsRouter from "./routes/conversations.js"
import replyAgentRouter from "./routes/reply-agent.js"
import slmAnswerRouter from "./routes/slm-answer.js"
import slmAnswerBatchRouter from "./routes/slm-answer-batch.js"
import addContactRouter from "./routes/add-contact.js"
import { loadConversations } from "./lib/conversations.js"

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: ["http://localhost:3001", "http://localhost:3003", "http://localhost:5173", "https://propos.addvantage.site", process.env.BASE_URL].filter(Boolean) as string[] }))
app.use(compression())
app.use(express.json())
// Twilio webhook sends URL-encoded body
app.use("/api/webhook/sms", express.urlencoded({ extended: false }))

app.use("/api/generate",         generateRouter)
app.use("/api/vendor-generate",  vendorGenerateRouter)
app.use("/api/sheet",            sheetRouter)
app.use("/api/transcript",  transcriptRouter)
app.use("/api/send",        sendRouter)
app.use("/api/webhook",     webhookRouter)
app.use("/unsubscribe",     unsubscribeRouter)
app.use("/api/nurture",     nurtureRouter)
app.use("/api/analytics",   analyticsRouter)
app.use("/api/boxdice",       boxdiceRouter)
app.use("/api/conversations", conversationsRouter)
app.use("/api/reply-agent",  replyAgentRouter)
app.use("/api/slm-answer",        slmAnswerRouter)
app.use("/api/slm-answer-batch",  slmAnswerBatchRouter)
app.use("/api/add-contact",       addContactRouter)

// Health check — must be before express.static so it's never shadowed by the SPA
app.get("/api/health", (_req, res) => {
  const testPhone = process.env.TEST_RECIPIENT_PHONE?.trim() || null
  const testEmail = process.env.TEST_RECIPIENT_EMAIL?.trim() || null
  res.json({
    ok: true,
    openai:     !!process.env.OPENAI_API_KEY,
    anthropic:  !!process.env.ANTHROPIC_API_KEY,
    sheet:      !!process.env.SHEET_URL,
    twilio:     !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    gmail:      gmailConfigured(),
    boxdice:    !!(process.env.BOXDICE_DOMAIN && process.env.BOXDICE_API_KEY),
    testMode:   !!(testPhone || testEmail),
    testPhone,
    testEmail,
  })
})

// Serve Vite production build — must come after all API routes
const distPath = path.resolve(__dirname, "..", "dist")

// Hashed JS/CSS/image assets — immutable, cache 1 year
app.use("/assets", express.static(path.join(distPath, "assets"), {
  maxAge: "1y",
  immutable: true,
}))

// All other static files — cache 1 week, except index.html (never cached)
app.use(express.static(distPath, {
  maxAge: "7d",
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      res.setHeader("Pragma", "no-cache")
      res.setHeader("Expires", "0")
      res.setHeader("Surrogate-Control", "no-store")
    }
  },
}))

// SPA catch-all — serve index.html for non-API routes (must be last)
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Surrogate-Control", "no-store")
  res.sendFile(path.join(distPath, "index.html"))
})

app.listen(PORT, async () => {
  console.log(`PropOS server running on http://localhost:${PORT}`)
  console.log(`  OpenAI:    ${process.env.OPENAI_API_KEY   ? "configured" : "not set (demo fallback active)"}`)
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? "configured" : "not set (skipping analysis + QA)"}`)
  console.log(`  Sheet:     ${process.env.SHEET_URL         ? "configured" : "not set (demo mode)"}`)
  console.log(`  Twilio:    ${process.env.TWILIO_ACCOUNT_SID ? "configured" : "not set (SMS disabled)"}`)
  console.log(`  Gmail:     ${gmailConfigured()              ? "configured" : "not set (email disabled)"}`)
  console.log(`  Boxdice:   ${process.env.BOXDICE_DOMAIN      ? "configured" : "not set (CRM disabled)"}`)
  if (process.env.TEST_RECIPIENT_PHONE) console.log(`  TEST SMS → ${process.env.TEST_RECIPIENT_PHONE}`)
  if (process.env.TEST_RECIPIENT_EMAIL) console.log(`  TEST Email → ${process.env.TEST_RECIPIENT_EMAIL}`)
  await loadOptOuts()
  await loadConversations()
})
