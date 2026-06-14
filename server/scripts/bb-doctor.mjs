#!/usr/bin/env node
/**
 * BlueBubbles Doctor — standalone connection + send diagnostic.
 *
 * Run from the PropOS server folder:
 *   node scripts/bb-doctor.mjs              # checks only (safe, sends nothing)
 *   node scripts/bb-doctor.mjs --send       # also sends a test text to TEST_RECIPIENT_PHONE
 *   node scripts/bb-doctor.mjs --send --to=+61400000000
 *   node scripts/bb-doctor.mjs --send --method=apple-script
 *
 * Reads server/.env directly (no build step). Prints a PASS/FAIL report you can
 * screenshot. Every failure includes a concrete next step.
 */

import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env (manual, no deps) ──────────────────────────────────────────────
try {
  const env = readFileSync(join(__dirname, "../.env"), "utf-8")
  for (const line of env.split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
} catch {
  console.error("Could not read server/.env — run this from the server folder.")
  process.exit(1)
}

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DO_SEND = args.includes("--send")
const TO = (args.find(a => a.startsWith("--to="))?.split("=")[1]) || process.env.TEST_RECIPIENT_PHONE || ""
const METHOD = (args.find(a => a.startsWith("--method="))?.split("=")[1]) || process.env.BLUEBUBBLES_METHOD || ""

const URL = (process.env.BLUEBUBBLES_URL || "").replace(/\/$/, "")
const PASS = process.env.BLUEBUBBLES_PASSWORD || ""

// ── Helpers ──────────────────────────────────────────────────────────────────
const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`)
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`)
const info = (m) => console.log(`  \x1b[36m····\x1b[0m  ${m}`)
const hint = (m) => console.log(`        \x1b[33m↳ ${m}\x1b[0m`)

function bbUrl(path) {
  return `${URL}${path}?password=${encodeURIComponent(PASS)}`
}

async function get(path, timeout = 8000) {
  const res = await fetch(bbUrl(path), { signal: AbortSignal.timeout(timeout) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text }
}

let failures = 0
const fail = (m) => { failures++; bad(m) }

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\n=== BlueBubbles Doctor ===\n")

console.log("Config:")
info(`BLUEBUBBLES_URL      = ${URL || "(missing)"}`)
info(`BLUEBUBBLES_PASSWORD = ${PASS ? PASS.slice(0, 2) + "***" + ` (${PASS.length} chars)` : "(missing)"}`)
info(`SMS_TRANSPORT_CHAIN  = ${process.env.SMS_TRANSPORT_CHAIN || "(unset)"}`)
info(`TEST_RECIPIENT_PHONE = ${process.env.TEST_RECIPIENT_PHONE || "(unset)"}`)
info(`BLUEBUBBLES_METHOD   = ${METHOD || "(unset — BlueBubbles default)"}`)
console.log("")

if (!URL || !PASS) {
  fail("BLUEBUBBLES_URL and/or BLUEBUBBLES_PASSWORD missing in server/.env")
  hint("Open BlueBubbles → Settings → copy the server address + password into server/.env")
  process.exit(1)
}

// Twilio guard
if ((process.env.SMS_TRANSPORT_CHAIN || "").toLowerCase().includes("twilio")) {
  fail("Twilio is still in SMS_TRANSPORT_CHAIN")
  hint("Set SMS_TRANSPORT_CHAIN=bluebubbles to use only your iPhone number")
} else {
  ok("Twilio is not in the transport chain (existing number only)")
}

console.log("\n[1/4] Reachability + auth (GET /api/v1/ping)")
try {
  const r = await get("/api/v1/ping")
  if (r.status === 401) {
    fail("Reached the server but the password is wrong (401)")
    hint("Fix BLUEBUBBLES_PASSWORD in .env to match BlueBubbles → Settings → Password")
  } else if (r.ok && (r.json?.data === "pong" || r.text.includes("pong"))) {
    ok(`Server reachable and authenticated (${URL})`)
  } else {
    fail(`Unexpected ping response: HTTP ${r.status} ${r.text.slice(0, 120)}`)
  }
} catch (e) {
  fail(`Could not reach the server: ${e.message}`)
  hint("Is BlueBubbles running? Is the Cloudflare URL current? (it changes on restart)")
  hint("Local alternative: set BLUEBUBBLES_URL=http://localhost:1234 if PropOS runs on the same Mac")
}

console.log("\n[2/4] Server info + Private API (GET /api/v1/server/info)")
let privateApi = null
try {
  const r = await get("/api/v1/server/info")
  if (r.ok && r.json?.data) {
    const d = r.json.data
    ok(`BlueBubbles ${d.server_version ?? "?"} on macOS ${d.os_version ?? "?"}`)
    privateApi = d.private_api
    if (d.private_api) ok("Private API: ENABLED (most reliable, supports new chats)")
    else {
      info("Private API: disabled — sends use AppleScript")
      hint("Fine for texting yourself / existing chats. For new contacts, enable Private API: docs.bluebubbles.app/private-api/installation")
    }
    if (d.detected_icloud) info(`Signed in as: ${d.detected_icloud}`)
    if (d.proxy_service) info(`Proxy: ${d.proxy_service}`)
    if (d.helper_connected === false) {
      info("Helper not connected (only matters if you want Private API)")
    }
  } else {
    fail(`server/info returned HTTP ${r.status}`)
  }
} catch (e) {
  fail(`server/info failed: ${e.message}`)
}

console.log("\n[3/4] Webhooks registered (GET /api/v1/webhook)")
try {
  const r = await get("/api/v1/webhook")
  const hooks = r.json?.data ?? []
  if (hooks.length === 0) {
    info("No webhooks registered yet — inbound replies will NOT reach PropOS")
    hint("PropOS auto-registers one on startup when SMS_TRANSPORT=bluebubbles + BASE_URL is set")
    hint("Or add manually in BlueBubbles → API & Webhooks → Add Webhook → <PropOS URL>/api/webhook/bluebubbles, event: new-message")
  } else {
    ok(`${hooks.length} webhook(s) registered:`)
    for (const h of hooks) info(`   → ${h.url}  events: ${JSON.stringify(h.events ?? h.event ?? "?")}`)
  }
} catch (e) {
  fail(`webhook list failed: ${e.message}`)
}

console.log("\n[4/4] Send test")
if (!DO_SEND) {
  info("Skipped (safe mode). Re-run with --send to actually send a text.")
} else if (!TO) {
  fail("No recipient — set TEST_RECIPIENT_PHONE in .env or pass --to=+61...")
} else {
  const safe = TO.startsWith("+") ? TO : "+" + TO.replace(/\D/g, "")
  const chatGuid = `any;-;${safe}`
  const tempGuid = `bbdoctor-${Date.now()}`
  const message = `PropOS BlueBubbles test ${new Date().toLocaleTimeString("en-AU")}. If you can read this, sending works.`
  const payload = { chatGuid, tempGuid, message }
  if (METHOD) payload.method = METHOD
  info(`Sending to ${safe} (chatGuid ${chatGuid}${METHOD ? `, method ${METHOD}` : ""})`)
  try {
    const res = await fetch(bbUrl("/api/v1/message/text"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    let json = null; try { json = JSON.parse(text) } catch { /* */ }
    if (res.ok && !json?.error) {
      ok(`Sent. guid=${json?.data?.guid ?? tempGuid}. Check the phone for the text.`)
    } else {
      fail(`Send failed: HTTP ${res.status} ${json?.error?.message ?? text.slice(0, 200)}`)
      hint("If 'failed to send' or AppleScript error: open Messages.app on the Mac, send yourself a text manually first")
      hint("If sending to an Android/SMS number: enable iPhone → Settings → Messages → Text Message Forwarding for this Mac")
      hint("Try forcing a method: node scripts/bb-doctor.mjs --send --method=apple-script  (or --method=private-api)")
    }
  } catch (e) {
    fail(`Send request error: ${e.message}`)
  }
}

console.log("")
if (failures === 0) {
  console.log("\x1b[32m=== ALL CHECKS PASSED ===\x1b[0m")
} else {
  console.log(`\x1b[31m=== ${failures} CHECK(S) FAILED — see ↳ hints above ===\x1b[0m`)
}
console.log("")
process.exit(failures === 0 ? 0 : 1)
