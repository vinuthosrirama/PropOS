#!/usr/bin/env node
/**
 * SMS Agent smoke test — drives the local AI loop end to end.
 *
 * Prereqs: the PropOS server is running locally with DATABASE_URL + ANTHROPIC_API_KEY
 * set (see docs/BLUEBUBBLES_SETUP.md, Stage D-local).
 *
 *   node scripts/sms-agent-smoke.mjs                 # seed + calibrate + send opener
 *   node scripts/sms-agent-smoke.mjs --base=http://localhost:3001
 *   node scripts/sms-agent-smoke.mjs --no-send       # everything except the opener send
 *   node scripts/sms-agent-smoke.mjs --samples=my-texts.txt   # calibrate from a file (one text per line)
 *
 * It prints each API response so you can screenshot the run.
 */

import { readFileSync } from "fs"

const args = process.argv.slice(2)
const BASE = (args.find(a => a.startsWith("--base="))?.split("=")[1]) || "http://localhost:3001"
const NO_SEND = args.includes("--no-send")
const samplesFile = args.find(a => a.startsWith("--samples="))?.split("=")[1]

// Default voice samples — replace with 15-20 of your real texts for a good calibration.
let SAMPLES = [
  "hey you free for a coffee this week?",
  "yeah sounds good tuesday arvo works",
  "ah nice one how'd it go",
  "all good no stress catch you then",
  "haha yeah fair enough",
  "reckon we lock in the deck before friday",
  "keen what time suits",
  "cheers for that appreciate it",
  "cant make tonight sorry next round though",
  "just sent it through let me know",
]
if (samplesFile) {
  try {
    SAMPLES = readFileSync(samplesFile, "utf-8").split("\n").map(s => s.trim()).filter(Boolean)
    console.log(`Loaded ${SAMPLES.length} samples from ${samplesFile}`)
  } catch {
    console.error(`Could not read ${samplesFile}, using defaults`)
  }
}

const log = (label, obj) => console.log(`\n── ${label} ──\n${JSON.stringify(obj, null, 2)}`)

// ── Auth (only needed when the server has DATABASE_URL set — /api/* is JWT-gated) ──
// Logs in once with the agent account and refreshes the access token on 401 using
// the refresh cookie, so a long-running smoke test survives the 15-minute expiry.
const AGENT_EMAIL = process.env.AGENT_EMAIL || "vinuth.o.srirama@gmail.com"
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "PropOS2026!"
let accessToken = null
let refreshCookie = null

function extractRefreshCookie(res) {
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) return null
  const match = setCookie.split(",").map(s => s.trim()).find(s => s.startsWith("propos_refresh="))
  return match ? match.split(";")[0] : null
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: AGENT_EMAIL, password: AGENT_PASSWORD }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.log(`  (login HTTP ${res.status}: ${json.error || "unknown error"} — continuing unauthenticated)`)
    return
  }
  accessToken = json.accessToken
  refreshCookie = extractRefreshCookie(res) || refreshCookie
}

async function refresh() {
  if (!refreshCookie) return false
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { Cookie: refreshCookie },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return false
  accessToken = json.accessToken
  refreshCookie = extractRefreshCookie(res) || refreshCookie
  return true
}

async function call(method, path, body) {
  const doFetch = () => fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let res = await doFetch()
  if (res.status === 401 && (await refresh())) {
    res = await doFetch()
  }
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) console.log(`  (HTTP ${res.status})`)
  return json
}

console.log(`\n=== SMS Agent smoke test against ${BASE} ===`)
await login()

// 0. health
try {
  const h = await fetch(`${BASE}/api/health`).then(r => r.ok).catch(() => false)
  if (!h) console.log("  (note: /api/health not OK — is the server running?)")
} catch { /* ignore */ }

// 1. seed Stage 1 contact (returns contactId; redirects to TEST_RECIPIENT_PHONE)
const seed = await call("POST", "/api/sms-agent/seed-stage1", { name: "Vinuth Test" })
log("seed-stage1", seed)
const contactId = seed.contactId
if (!contactId) {
  console.error("\nNo contactId returned. Is DATABASE_URL set and the server connected? Stopping.")
  process.exit(1)
}

// 2. calibrate voice from samples (Fable 5; falls back to default if no ANTHROPIC_API_KEY)
const cal = await call("POST", "/api/sms-agent/calibrate", { samples: SAMPLES })
log("calibrate", { ok: cal.ok, confidence: cal.confidence, samples_analysed: cal.samples_analysed })

// 3. fire the opener (Sonnet 4.6 writes it; BlueBubbles sends it to your phone)
if (NO_SEND) {
  console.log("\n--no-send: skipping the opener send. Contact is seeded and voice calibrated.")
} else {
  const opener = await call("POST", `/api/sms-agent/initiate/${contactId}`)
  log("initiate (opener)", opener)
  if (opener.sent) console.log("\n✅ Opener sent. Check your phone. Reply to it, then run: curl " + BASE + "/api/sms-agent/drafts")
  else console.log("\n⚠️  Not sent. " + (opener.message || opener.error || "See response above."))
}

console.log("")
