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
import { activeTransport, checkSmsTransport, checkTransportChain, sendSMS } from "./lib/sms.js"
import { parseBBWebhook, parseBBSendError, registerBlueBubblesWebhook } from "./lib/bluebubbles.js"
import { watchIncomingImsg } from "./lib/imsg.js"
import { parseTeleLinkWebhook, registerTeleLinkWebhook }            from "./lib/telelink.js"
import { parseTextingBlueWebhook }                                   from "./lib/textingblue.js"
import { parseAndroidGatewayWebhook, registerAndroidGatewayWebhook } from "./lib/androidgateway.js"
import { writeToSheet } from "./lib/sheets.js"
import conversationsRouter from "./routes/conversations.js"
import replyAgentRouter from "./routes/reply-agent.js"
import slmAnswerRouter from "./routes/slm-answer.js"
import slmAnswerBatchRouter from "./routes/slm-answer-batch.js"
import ragRouter from "./routes/rag.js"
import addContactRouter from "./routes/add-contact.js"
import importContactsRouter from "./routes/import-contacts.js"
import agentStateRouter from "./routes/agent-state.js"
import addLeadRouter from "./routes/add-lead.js"
import parseNotesRouter from "./routes/parse-notes.js"
import trackRouter from "./routes/track.js"
import docTrackRouter from "./routes/doc-track.js"
import gdprRouter from "./routes/gdpr.js"
import marketUpdateRouter from "./routes/market-update.js"
import { publicRouter as pitchesPublicRouter, authedRouter as pitchesAuthedRouter } from "./routes/pitches.js"
import outreachTargetsRouter from "./routes/outreach-targets.js"
import smsAgentRouter from "./routes/sms-agent.js"
import crmLeadsRouter from "./routes/crm-leads.js"
import agentboxRouter from "./routes/agentbox.js"
import demoRouter from "./routes/demo.js"
import smsShortcutRouter, { registerReplyHandler } from "./routes/sms-shortcut.js"
import { parseHttpSmsWebhook } from "./lib/httpsms.js"
import { loadConversations, addReplyToThread } from "./lib/conversations.js"
import { initDb, isDbConnected, query } from "./lib/db.js"
import { startScheduler, cancelNurtureJobs } from "./lib/scheduler.js"
import { startOutreachScheduler } from "./lib/outreachScheduler.js"
import { handleOutreachInbound } from "./lib/outreachAgent.js"
import { handleSmsAgentInbound } from "./lib/smsAgentInbound.js"
import { claimMessageGuid } from "./lib/messageDedup.js"
import { startSmsAgentScheduler } from "./lib/smsOrchestrator.js"
import { startReadyOutreachScheduler } from "./lib/smsReadyOutreach.js"
import { startTransportHealthMonitor } from "./lib/transportHealthMonitor.js"
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

// CRM workbook uploads (base64 xlsx) and bulk contact arrays exceed the global limit
app.use("/api/import-contacts", express.json({ limit: "10mb" }))
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

// Health check — MUST be before the JWT auth middleware so Railway's unauthenticated
// healthcheck probe reaches it. When DB is connected the auth guard blocks all /api/*
// requests without a Bearer token, including Railway's healthcheck.
// PT-C3: unauthenticated callers get { ok } only — full service map requires a valid JWT.
app.get("/api/health", async (req, res) => {
  const authHeader = req.headers["authorization"]
  const isAuthed = authHeader?.startsWith("Bearer ")
    ? !!verifyAccessToken(authHeader.slice(7))
    : false

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

  if (!isAuthed) {
    return res.json({ ok: true, database: dbLive })
  }

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
    testMode:  !!(process.env.TEST_RECIPIENT_PHONE?.trim() || process.env.TEST_RECIPIENT_EMAIL?.trim()),
  })
})

app.use("/api/auth",         authRouter)
app.use("/unsubscribe",      unsubscribeRouter)
app.use("/api/track",        trackRouter)
app.use("/api/doc-track",   docTrackRouter)
app.use("/api/webhook",      webhookRouter)
// iOS Shortcut relay — public, auth via SHORTCUT_RELAY_SECRET query param
app.use("/api/sms-shortcut", smsShortcutRouter)
// SLM answer routes also public (called from buyer-facing demo)
app.use("/api/slm-answer",        slmAnswerRouter)
app.use("/api/slm-answer-batch",  slmAnswerBatchRouter)
app.use("/api/rag",               ragRouter)
// Pitch view-tracking + by-slug fetch — public, accessed from /p/:slug links
app.use("/api/pitches",           pitchesPublicRouter)

// GET /api/sms-transport — full transport chain with live health (for settings UI + ops)
app.get("/api/sms-transport", async (_req: Request, res: Response) => {
  const [status, chain] = await Promise.all([checkSmsTransport(), checkTransportChain()])
  res.json({
    ...status,                    // legacy shape: primary transport + optional fallback
    chain,                        // full cascade in send order, each with live health
    email: {
      configured: gmailConfigured(),
      user: gmailConfigured() ? process.env.GMAIL_USER : undefined,
    },
  })
})

// POST /api/test-sms — fire a test SMS via the active transport, no DB required
// Body: { to?: string, message?: string }  (both optional — defaults to TEST_RECIPIENT_PHONE + "Hello World!")
app.post("/api/test-sms", express.json(), async (req: Request, res: Response) => {
  const to      = String(req.body?.to      ?? process.env.TEST_RECIPIENT_PHONE ?? "").trim()
  const message = String(req.body?.message ?? "Hello World!").trim()
  if (!to) return res.status(400).json({ error: "No 'to' phone number — set TEST_RECIPIENT_PHONE or pass { to } in body" })
  try {
    const result = await sendSMS(to, message)
    res.json({ ok: true, to, message, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
})

// ── Protected routes (require valid JWT when DB is connected) ─────────────────
// Auto-enforces when DATABASE_URL is set (production).
// No-op when DATABASE_URL is missing (demo/dev mode) so the demo runs without accounts.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  // Webhook routes have their own gate (verifyWebhookSecret, below) — never JWT-gated.
  if (req.path.startsWith("/webhook/")) return next()
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
app.use("/api/import-contacts",  importContactsRouter)
app.use("/api/crm-leads",        crmLeadsRouter)
app.use("/api/agent-state",      agentStateRouter)
app.use("/api/add-lead",         addLeadRouter)
app.use("/api/parse-notes",      parseNotesRouter)
app.use("/api/pitches",          pitchesAuthedRouter)
app.use("/api/gdpr",             gdprRouter)
app.use("/api/market-update",    marketUpdateRouter)
app.use("/api/outreach-targets", outreachTargetsRouter)
app.use("/api/sms-agent",        smsAgentRouter)
app.use("/api/agentbox",         agentboxRouter)
app.use("/api/demo",             demoRouter)

// ── Shared reply handler (all transports feed here) ──────────────────────────
async function handleIncomingReply(from: string, body: string, guid?: string): Promise<void> {
  if (guid && !(await claimMessageGuid(guid))) {
    console.log(`[reply-handler] duplicate message guid=${guid}, skipping (already processed)`)
    return
  }
  const lowerBody = body.toLowerCase().trim()
  try {
    if (["stop", "unsubscribe", "cancel", "quit", "end", "stopall"].includes(lowerBody)) {
      await addOptOut(from, "sms", "reply")
    } else {
      // 1. Store in conversation thread (buyer/vendor lead pipeline)
      await addReplyToThread(from, body)
      void writeToSheet({ type: "update_lead_status", phone: from, status: "sms_replied", detail: body.slice(0, 200) })
      await cancelNurtureJobs(from)

      // 2. Also check if this is one of our outreach targets (Vinuth self-outreach campaign)
      //    Non-fatal — runs in parallel with the lead pipeline above
      void handleOutreachInbound(from, body)

      // 3. Conversational SMS agent (sms_contacts — Stages 1-4, see docs/SMS_AGENT.md)
      //    Non-fatal — parallel with the pipelines above
      void handleSmsAgentInbound(from, body)
    }
  } catch (err) {
    console.error("[reply-handler] error:", (err as Error).message)
  }
}

// Wire iOS Shortcut relay reply handler (must be after handleIncomingReply is defined)
registerReplyHandler(handleIncomingReply)

// ── Webhook shared-secret gate ────────────────────────────────────────────────
// All SMS-transport webhooks accept a secret via ?secret= or X-Webhook-Secret.
// Enforced only when WEBHOOK_SECRET is set — unset keeps local dev frictionless.
// Constant-time compare (same pattern as verifyShortcutSecret).
function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.WEBHOOK_SECRET?.trim()
  if (!expected) return next()
  const given = String(req.query.secret ?? req.headers["x-webhook-secret"] ?? "").trim()
  let match = given.length === expected.length ? 0 : 1
  for (let i = 0; i < Math.min(given.length, expected.length); i++) {
    match |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  if (match !== 0) return res.status(401).json({ error: "invalid webhook secret" })
  return next()
}
app.use("/api/webhook", verifyWebhookSecret)

// ── BlueBubbles incoming webhook ──────────────────────────────────────────────
// POST /api/webhook/bluebubbles — receives incoming iMessage/SMS replies
// when SMS_TRANSPORT=bluebubbles. Feeds into the existing reply-agent pipeline.
// Async send-error recovery: one redispatch per failed message guid, never via
// bluebubbles again (it just failed). Set bounded to avoid unbounded growth.
const redispatchedGuids = new Set<string>()

app.post("/api/webhook/bluebubbles", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })  // ack immediately — BB retries on 4xx/5xx, not on 200

  // Handle incoming reply
  const msg = parseBBWebhook(req.body)
  if (msg && !msg.isGroup) {
    void handleIncomingReply(msg.from, msg.body, msg.guid)
    return
  }

  // Handle send-error events — redispatch via the rest of the transport chain
  const sendErr = parseBBSendError(req.body)
  if (sendErr) {
    console.warn(`[bluebubbles] delivery failure guid=${sendErr.guid}: ${sendErr.reason}`)

    if (!sendErr.to || !sendErr.body) {
      // BB's error payload often omits the original body/recipient — redispatch impossible.
      // The synchronous cascade already tried fallback transports at send time, so this
      // is expected in many cases. No further action needed.
      console.warn(`[bluebubbles] send-error guid=${sendErr.guid} — payload missing to/body, cannot redispatch (reason: ${sendErr.reason})`)
      return
    }
    if (redispatchedGuids.has(sendErr.guid)) return  // already retried once
    redispatchedGuids.add(sendErr.guid)
    if (redispatchedGuids.size > 1000) redispatchedGuids.clear()

    void sendSMS(sendErr.to, sendErr.body, ["bluebubbles"])
      .then(r => console.log(`[bluebubbles] redispatch guid=${sendErr.guid} succeeded via "${r.transport}"`))
      .catch(e => console.error(`[bluebubbles] redispatch guid=${sendErr.guid} failed on all transports: ${(e as Error).message}`))
  }
})

// ── TeleLink incoming webhook ─────────────────────────────────────────────────
app.post("/api/webhook/telelink", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })
  const msg = parseTeleLinkWebhook(req.body)
  if (!msg) return
  void handleIncomingReply(msg.from, msg.body)
})

// ── TextingBlue incoming webhook ──────────────────────────────────────────────
// POST /api/webhook/textingblue — receives iMessage replies via TextingBlue
app.post("/api/webhook/textingblue", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })
  const msg = parseTextingBlueWebhook(req.body)
  if (!msg) return
  void handleIncomingReply(msg.from, msg.body)
})

// ── Android SMS Gateway incoming webhook ─────────────────────────────────────
// POST /api/webhook/android-gateway — receives SMS replies from Android device
app.post("/api/webhook/android-gateway", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })
  const msg = parseAndroidGatewayWebhook(req.body)
  if (!msg) return
  void handleIncomingReply(msg.from, msg.body)
})

// ── httpSMS incoming webhook ──────────────────────────────────────────────────
// POST /api/webhook/httpsms — receives SMS replies via httpSMS Android app
// Payload: { data: { contact, content, owner } }
app.post("/api/webhook/httpsms", express.json(), (req: Request, res: Response) => {
  res.json({ ok: true })
  const msg = parseHttpSmsWebhook(req.body)
  if (!msg) return
  void handleIncomingReply(msg.from, msg.body)
})

// ── AVM route ─────────────────────────────────────────────────────────────────
app.get("/api/avm", async (req, res) => {
  const address = String(req.query.address ?? "").trim()
  if (!address) return res.status(400).json({ error: "address is required" })
  const estimate = await getDomainEstimate(address)
  if (!estimate) return res.json({ ok: false, estimate: null })
  return res.json({ ok: true, estimate })
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

  // 3. Start schedulers (all no-op if no DB)
  startScheduler()
  startOutreachScheduler()
  startSmsAgentScheduler()
  startReadyOutreachScheduler()
  startTransportHealthMonitor()

  // 4. Wire up transport-specific init
  // Webhook callback URLs carry ?secret= so the verifyWebhookSecret gate passes.
  const webhookSecretQS = process.env.WEBHOOK_SECRET?.trim()
    ? `?secret=${encodeURIComponent(process.env.WEBHOOK_SECRET.trim())}`
    : ""
  if (process.env.WEBHOOK_SECRET?.trim()) {
    console.log("  Webhook auth: shared secret ENFORCED on /api/webhook/*")
  } else {
    console.warn("  ⚠️  WEBHOOK_SECRET not set — /api/webhook/* accepts unauthenticated POSTs")
  }

  // Where this server receives inbound webhooks. Normally BASE_URL, but in local dev
  // BASE_URL is the public production domain (used for email links) which does NOT route
  // to this machine — so inbound replies would never arrive. Set WEBHOOK_BASE_URL to a
  // URL the SMS provider can reach this server at (e.g. http://localhost:3001 when the
  // provider runs on the same Mac, or a tunnel) to receive replies locally.
  const webhookBase = process.env.WEBHOOK_BASE_URL?.trim() || process.env.BASE_URL?.trim()

  if (smsTransport === "bluebubbles" && webhookBase) {
    // Register incoming webhook with BlueBubbles so replies flow into PropOS
    const webhookUrl = `${webhookBase}/api/webhook/bluebubbles${webhookSecretQS}`
    registerBlueBubblesWebhook(webhookUrl)
      .then(() => console.log(`  BlueBubbles webhook registered → ${webhookUrl}`))
      .catch(e => console.warn("  BlueBubbles webhook register failed:", e.message))
  }

  if (smsTransport === "android-gateway" && webhookBase) {
    const webhookUrl = `${webhookBase}/api/webhook/android-gateway${webhookSecretQS}`
    registerAndroidGatewayWebhook(webhookUrl)
      .then(() => console.log(`  AndroidGateway webhook registered → ${webhookUrl}`))
      .catch(e => console.warn("  AndroidGateway webhook register failed:", e.message))
  }

  if (smsTransport === "telelink" && webhookBase) {
    const webhookUrl = `${webhookBase}/api/webhook/telelink${webhookSecretQS}`
    registerTeleLinkWebhook(webhookUrl)
      .then(() => console.log(`  TeleLink webhook registered → ${webhookUrl}`))
      .catch(e => console.warn("  TeleLink webhook register failed:", e.message))
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
