import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

// Load .env from server/ directory regardless of cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, ".env") })

import express, { type Request, type Response, type NextFunction } from "express"
import cors from "cors"
import compression from "compression"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import helmet from "helmet"
import generateRouter from "./routes/generate.js"
import vendorGenerateRouter from "./routes/vendor-generate.js"
import vendorBulkSendRouter from "./routes/vendor-bulk-send.js"
import vendorBatchRouter from "./routes/vendor-batch.js"
import sheetRouter from "./routes/sheet.js"
import transcriptRouter from "./routes/transcript.js"
import sendRouter from "./routes/send.js"
import webhookRouter from "./routes/webhook.js"
import unsubscribeRouter from "./routes/unsubscribe.js"
import nurtureRouter from "./routes/nurture.js"
import analyticsRouter from "./routes/analytics.js"
import boxdiceRouter from "./routes/boxdice.js"
import authRouter from "./routes/auth.js"
import { loadOptOuts, addOptOut } from "./lib/compliance.js"
import { gmailConfigured } from "./lib/gmail.js"
import { activeTransport, checkSmsTransport } from "./lib/sms.js"
import { parseBBWebhook, registerBlueBubblesWebhook } from "./lib/bluebubbles.js"
import { watchIncomingImsg } from "./lib/imsg.js"
import { writeToSheet } from "./lib/sheets.js"
import conversationsRouter from "./routes/conversations.js"
import replyAgentRouter from "./routes/reply-agent.js"
import slmAnswerRouter from "./routes/slm-answer.js"
import slmAnswerBatchRouter from "./routes/slm-answer-batch.js"
import addContactRouter from "./routes/add-contact.js"
import addLeadRouter from "./routes/add-lead.js"
import parseNotesRouter from "./routes/parse-notes.js"
import trackRouter from "./routes/track.js"
import gdprRouter from "./routes/gdpr.js"
import marketUpdateRouter from "./routes/market-update.js"
import { loadConversations, addReplyToThread } from "./lib/conversations.js"
import { initDb, isDbConnected, query } from "./lib/db.js"
import { startScheduler, cancelNurtureJobs } from "./lib/scheduler.js"
import { requireAuth } from "./middleware/auth.js"
import { verifyAccessToken } from "./lib/auth.js"
import { getDomainEstimate } from "./lib/domainAvm.js"

const app = express()
const PORT = process.env.PORT ?? 3001

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  // CSP relaxed for Vite HMR in dev and inline styles (React inline style objects)
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  // Allow embedding in iframes for demo preview tools only in dev
  frameguard: process.env.NODE_ENV === "production" ? { action: "deny" } : false,
}))

app.use(cors({
  origin: ["http://localhost:3001", "http://localhost:3003", "http://localhost:5173", "https://propos.addvantage.site", process.env.BASE_URL].filter(Boolean) as string[],
  credentials: true,   // needed for httpOnly refresh-token cookie
}))
app.use(compression())
app.use(cookieParser())

// 256 KB body limit — prevents large-payload DoS; no legitimate request exceeds this
app.use(express.json({ limit: "256kb" }))
// Twilio webhook sends URL-encoded body
app.use("/api/webhook/sms", express.urlencoded({ extended: false, limit: "16kb" }))

// ── Rate limiting ─────────────────────────────────────────────────────────────

const generalLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." } })
const aiLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "AI generation rate limit reached. Please wait a moment." } })
const sendLimiter = rateLimit({ windowMs: 60_000, max: 50, standardHeaders: true, legacyHeaders: false,
  message: { error: "Send rate limit reached" } })
// PT-C1: dedicated auth limiter — 10 attempts/15min per IP prevents brute-force and account-spam
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait 15 minutes." },
  skipSuccessfulRequests: true,   // only counts failures — legit logins don't eat quota
})

app.use("/api", generalLimiter)
app.use("/api/generate",         aiLimiter)
app.use("/api/vendor-generate",  aiLimiter)
app.use("/api/slm-answer",       aiLimiter)
app.use("/api/slm-answer-batch", aiLimiter)
app.use("/api/send",             sendLimiter)
app.use("/api/vendor-bulk-send", sendLimiter)
app.use("/api/market-update/send", sendLimiter)
// Auth routes — tighter limit applied before the router mounts
app.use("/api/auth/login",    authLimiter)
app.use("/api/auth/register", authLimiter)
app.use("/api/auth/refresh",  authLimiter)

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use("/api/auth",        authRouter)
app.use("/unsubscribe",     unsubscribeRouter)
app.use("/api/track",       trackRouter)
app.use("/api/webhook",     webhookRouter)
// SLM answer routes also public (called from buyer-facing demo)
app.use("/api/slm-answer",        slmAnswerRouter)
app.use("/api/slm-answer-batch",  slmAnswerBatchRouter)

// ── Protected routes (require valid JWT when DB is connected) ─────────────────
// Auto-enforces when DATABASE_URL is set (production).
// No-op when DATABASE_URL is missing (demo/dev mode) so the demo runs without accounts.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!isDbConnected()) return next()
  return requireAuth(req, res, next)
})

app.use("/api/generate",         generateRouter)
app.use("/api/vendor-generate",  vendorGenerateRouter)
app.use("/api/vendor-bulk-send", vendorBulkSendRouter)
app.use("/api/vendor-batch",     vendorBatchRouter)
app.use("/api/sheet",            sheetRouter)
app.use("/api/transcript",       transcriptRouter)
app.use("/api/send",             sendRouter)
app.use("/api/nurture",          nurtureRouter)
app.use("/api/analytics",        analyticsRouter)
app.use("/api/boxdice",          boxdiceRouter)
app.use("/api/conversations",    conversationsRouter)
app.use("/api/reply-agent",      replyAgentRouter)
app.use("/api/add-contact",      addContactRouter)
app.use("/api/add-lead",         addLeadRouter)
app.use("/api/parse-notes",      parseNotesRouter)
app.use("/api/gdpr",             gdprRouter)
app.use("/api/market-update",    marketUpdateRouter)

// ── Shared reply handler (BlueBubbles + imsg use the same pipeline as Twilio) ──
async function handleIncomingReply(from: string, body: string): Promise<void> {
  const lowerBody = body.toLowerCase().trim()
  try {
    if (["stop", "unsubscribe", "cancel", "quit", "end", "stopall"].includes(lowerBody)) {
      await addOptOut(from, "sms", "reply")
    } else {
      await addReplyToThread(from, body)
      void writeToSheet({ type: "update_lead_status", phone: from, status: "sms_replied", detail: body.slice(0, 200) })
      await cancelNurtureJobs(from)
    }
  } catch (err) {
    console.error("[reply-handler] error:", (err as Error).message)
  }
}

// ── BlueBubbles incoming webhook ──────────────────────────────────────────────
// POST /api/webhook/bluebubbles — receives incoming iMessage/SMS replies
// when SMS_TRANSPORT=bluebubbles. Feeds into the existing reply-agent pipeline.
app.post("/api/webhook/bluebubbles", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })  // ack immediately — BB retries on 4xx/5xx, not on 200
  const msg = parseBBWebhook(req.body)
  if (!msg || msg.isGroup) return
  void handleIncomingReply(msg.from, msg.body)
})

// GET /api/sms-transport — returns which transport is active (for settings UI)
app.get("/api/sms-transport", async (_req: Request, res: Response) => {
  const status = await checkSmsTransport()
  res.json(status)
})

// ── AVM route ─────────────────────────────────────────────────────────────────
app.get("/api/avm", async (req, res) => {
  const address = String(req.query.address ?? "").trim()
  if (!address) return res.status(400).json({ error: "address is required" })
  const estimate = await getDomainEstimate(address)
  if (!estimate) return res.json({ ok: false, estimate: null })
  return res.json({ ok: true, estimate })
})

// Health check — must be before express.static so it's never shadowed by the SPA
// PT-C3: unauthenticated callers get { ok } only — full service map requires a valid JWT
// so attackers cannot fingerprint the stack before mounting targeted attacks.
app.get("/api/health", async (req, res) => {
  // Determine if caller is authenticated (Bearer token present and valid)
  const authHeader = req.headers["authorization"]
  const isAuthed = authHeader?.startsWith("Bearer ")
    ? !!verifyAccessToken(authHeader.slice(7))
    : false

  // Live DB probe — 3s timeout so this endpoint stays fast
  let dbLive = false
  if (isDbConnected()) {
    try {
      const rows = await Promise.race<{ ok: number }[]>([
        query<{ ok: number }>("SELECT 1 AS ok"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DB probe timeout")), 3_000),
        ),
      ])
      dbLive = rows.length > 0
    } catch {
      dbLive = false
    }
  }

  // Unauthenticated: bare liveness signal only
  if (!isAuthed) {
    return res.json({ ok: true, database: dbLive })
  }

  // Authenticated (internal dashboard / monitoring): full service map
  res.json({
    ok:        true,
    openai:    !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    sheet:     !!process.env.SHEET_URL,
    twilio:    !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    smsTransport: activeTransport(),
    gmail:     gmailConfigured(),
    boxdice:   !!(process.env.BOXDICE_DOMAIN && process.env.BOXDICE_API_KEY),
    domainAvm: !!process.env.DOMAIN_API_KEY,
    database:  dbLive,
    // testMode is a boolean flag only — never expose actual contact values
    testMode:  !!(process.env.TEST_RECIPIENT_PHONE?.trim() || process.env.TEST_RECIPIENT_EMAIL?.trim()),
  })
})

// Serve Vite production build — must come after all API routes
// On Railway, Nixpacks snapshots server/ only, so frontend is pre-built into server/public/.
// In local dev, dist/ lives one level up (repo root).
import { existsSync } from "fs"
// When compiled by tsc: __dirname=/app/dist/, so ../public = /app/public/ (server/public pre-built)
// When running tsx locally: __dirname=/repo/server/, so ../public = /repo/public/ (doesn't exist, falls through to dist/)
const railwayPublic = path.resolve(__dirname, "..", "public")
const distPath = existsSync(railwayPublic) ? railwayPublic : path.resolve(__dirname, "..", "dist")

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
  const smsTransport = activeTransport()
  console.log(`  SMS:       ${smsTransport === "none" ? "not set (SMS disabled)" : smsTransport + " transport active"}`)
  console.log(`  Gmail:     ${gmailConfigured()              ? "configured" : "not set (email disabled)"}`)
  console.log(`  Boxdice:   ${process.env.BOXDICE_DOMAIN      ? "configured" : "not set (CRM disabled)"}`)
  if (process.env.TEST_RECIPIENT_PHONE) console.log(`  TEST SMS  → ${process.env.TEST_RECIPIENT_PHONE}`)
  if (process.env.TEST_RECIPIENT_EMAIL) console.log(`  TEST Email → ${process.env.TEST_RECIPIENT_EMAIL}`)

  // 1. Connect to database (non-fatal if DATABASE_URL not set)
  await initDb()

  // 2. Load compliance + conversation state
  await loadOptOuts()
  await loadConversations()

  // CHAOS GUARD: warn loudly when running without a DB.
  // In-memory opt-outs are lost on every restart — a restarted server will
  // re-contact opted-out leads, which violates the AU SPAM Act 2003.
  if (!isDbConnected()) {
    console.warn("  ⚠️  WARNING: No DATABASE_URL — opt-outs held in memory only.")
    console.warn("  ⚠️  A server restart will lose all opt-out records.")
    console.warn("  ⚠️  Set DATABASE_URL before enabling the nurture scheduler in production.")
  }

  // 3. Start nurture scheduler (no-ops if no DB)
  startScheduler()

  // 4. Wire up transport-specific init
  if (smsTransport === "bluebubbles" && process.env.BASE_URL) {
    // Register incoming webhook with BlueBubbles so replies flow into PropOS
    const webhookUrl = `${process.env.BASE_URL}/api/webhook/bluebubbles`
    registerBlueBubblesWebhook(webhookUrl)
      .then(() => console.log(`  BlueBubbles webhook registered → ${webhookUrl}`))
      .catch(e => console.warn("  BlueBubbles webhook register failed:", e.message))
  }

  if (smsTransport === "imsg") {
    // Watch chat.db for incoming replies — routes into same pipeline as Twilio/BB
    watchIncomingImsg((msg) => {
      console.log(`  [imsg] Incoming from ${msg.from}: ${msg.body.slice(0, 60)}`)
      void handleIncomingReply(msg.from, msg.body)
    })
    console.log("  imsg watcher started (polling chat.db for replies)")
  }
})
