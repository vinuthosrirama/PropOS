---
name: propos-config-and-flags
description: "Use when adding, removing, or debugging an environment variable, Fly secret, Cloudflare Pages build var, or DB-backed app_settings toggle in PropOS. Covers the full env var catalog (database, auth, LLM keys, email, SMS transports, webhooks, safety redirects, agent autonomy flags, frontend VITE_ build vars), where each is set per environment, and the add-a-flag checklist. Triggers: 'what env var controls X', 'add a new flag', 'is SMS_AGENT_AUTOSEND set', 'why is auto-send on/off', 'add a Fly secret', 'the webhook is rejecting everything', 'VITE_ var not baked into the build', 'what happens if ANTHROPIC_API_KEY is empty', 'app_settings table', 'DB override for env var', 'rotate the OpenAI key'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Config and Flags

The complete catalog of every environment variable and DB-backed setting that changes PropOS behavior. Built by grepping `server/` and `src/` on 2026-07-05, not by trusting docs. If a value isn't in this table and you found it in code, add a row here (see the checklist). If a var is listed here but not found in code, it is flagged `[NOT FOUND IN CODE 2026-07-05]`.

**Jargon**: "bake in" — a `VITE_*` var is inlined into the JS bundle at `vite build` time; changing it after build does nothing until you rebuild. "DB-backed setting" — a key/value row in the `app_settings` Postgres table, read/written at runtime via `getSetting`/`setSetting` in `server/lib/appSettings.ts`, so it can be flipped without a redeploy. "Lazy read" — `process.env.X` read inside a function body (safe); a module-top-level read can execute before `dotenv.config()` finishes (unsafe, see §Add-a-flag checklist).

---

## 1. Master env var table (server-side, `process.env.*`)

Verified by `grep -rn "process\.env\." server/ --include="*.ts" | grep -v node_modules | grep -v dist` (2026-07-05). Grouped by concern.

### 1.1 Database

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `DATABASE_URL` | `server/lib/db.ts:37` (`initDb`), `server/provision-agent.ts:25` | `server/.env` (local), Fly secret (prod) | `initDb()` logs "not configured (in-memory mode)" and every DB-backed feature no-ops gracefully (`isDbConnected()` returns false) | Production | SSL disabled only if the URL contains `localhost` (`db.ts:41`); otherwise `rejectUnauthorized: false`. Pool: max 10, 5s connect timeout, 15s statement timeout. |

### 1.2 Auth / JWT

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `JWT_SECRET` | `server/lib/auth.ts:10` | `server/.env`, Fly secret | Falls back to hardcoded string `"propos-dev-secret-change-in-prod"` | Production | **Safety-relevant**: if this fallback is ever live in production, every issued access token is forgeable. Verify it is actually set on Fly (`flyctl secrets list --app addvantageadvisory`) before trusting any production JWT. |
| `JWT_REFRESH_SECRET` | `server/lib/auth.ts:11` | `server/.env`, Fly secret | Falls back to `"propos-refresh-dev-change-in-prod"` | Production | Same risk as `JWT_SECRET`, for the 7-day refresh cookie. |
| `UNSUBSCRIBE_SECRET` | `server/lib/compliance.ts:145` | `server/.env`, Fly secret | Derives a fallback via `sha256(JWT_SECRET ?? "propos-dev")` (`compliance.ts:146`) | Production | Powers the HMAC unsubscribe links. If unset, its strength is only as good as `JWT_SECRET`. |

### 1.3 LLM keys

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | `server/lib/openai.ts:9`, `server/lib/claude.ts:42`, `server/routes/generate.ts`, `vendor-generate.ts`, `slm-answer.ts`, `slm-answer-batch.ts`, `rag.ts`, `parse-notes.ts`, `promptOptimiser.ts` | `server/.env`, Fly secret | Client is lazily constructed with `apiKey: "not-set"` (never crashes at import) (`openai.ts:9`); route-level guards return an explicit error JSON instead of calling out | Production | Primary generation provider in most routes (`generate.ts:100` prefers Anthropic then falls back to OpenAI — see next row for the reverse case). |
| `ANTHROPIC_API_KEY` | `server/lib/claude.ts:10,19,31`, `server/lib/lifeStageInference.ts:76`, `server/lib/pmBrief.ts:57`, `server/lib/scheduler.ts:373`, `server/lib/voiceCalibration.ts:74,149`, `server/provision-agent.ts:30,78`, `server/routes/reply-agent.ts:24`, `vendor-generate.ts:14,204` | `server/.env` (commonly **empty locally**, per `docs/OPS_RUNBOOK.md:315`), Fly secret | `generateChatJSON()` (`server/lib/claude.ts:30-53`) checks `ANTHROPIC_API_KEY` first (model `claude-haiku-4-5`); if absent, falls back to `OPENAI_API_KEY` (model `gpt-4o-mini`); if both absent, throws `"No LLM provider configured"`. `llmConfigured()` (`claude.ts:19`) is a cheap pre-flight guard used by `calendarAgent.ts`, `smsAgent.ts`, `marketReport.ts`, `voiceCalibration.ts` before calling `generateChatJSON`. | Production for SMS agent conversation; several other routes (`generate.ts`, `vendor-generate.ts`, `reply-agent.ts`) call the Anthropic SDK **directly** with their own model string, independent of `generateChatJSON` — check the specific route before assuming provider-agnostic fallback applies. | This is the "Anthropic may be empty locally, code falls back to OpenAI" behavior — but only true inside `generateChatJSON` and its 4 callers (`calendarAgent.ts`, `smsAgent.ts`, `marketReport.ts`, `voiceCalibration.ts`). Routes that call `getClient().messages.create()` directly do NOT fall back automatically; they gate on `if (process.env.ANTHROPIC_API_KEY)` and separately gate OpenAI as an explicit else-branch (e.g. `routes/generate.ts:100-103`, `routes/vendor-generate.ts:195-204`). |

### 1.4 Email (Gmail)

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `GMAIL_CLIENT_ID` | `server/lib/gmail.ts:5,14`, `gmailInbound.ts:27`, `scripts/get-gmail-token.ts:18` | `server/.env`, Fly secret | `gmailConfigured()` returns false; `sendEmail`/inbound polling silently no-op | Production | All 4 Gmail vars are required together; `gmailConfigured()` AND-checks all of them. |
| `GMAIL_CLIENT_SECRET` | same files | same | same | Production | |
| `GMAIL_REFRESH_TOKEN` | same files | same | same | Production | OAuth refresh token from `scripts/get-gmail-token.ts`. |
| `GMAIL_USER` | `gmail.ts:17,59`, `gmailInbound.ts:110`, `server/index.ts:203` | `server/.env`, Fly secret | same; also used as the alert-email fallback for `BACKEND_HEALTH_ALERT_EMAIL` and `SMS_TRANSPORT_ALERT_EMAIL` when those are unset | Production | |
| `GMAIL_SEND_AS` | `gmail.ts:59` | `server/.env`, Fly secret | Falls back to `GMAIL_USER` | Experimental | "Send as" verified alias — display name only, auth still via `GMAIL_USER`'s OAuth grant. |
| `EMAIL_LIVE_ALLOWLIST` | `gmail.ts:51` | `server/.env`, Fly secret | Empty array — no address bypasses the `TEST_RECIPIENT_EMAIL` redirect | Safety-relevant | Comma-separated, lowercased. Mirrors `SMS_LIVE_ALLOWLIST`. |
| `PM_EMAIL` | `server/lib/pmBrief.ts:196` | `server/.env`, Fly secret | Falls back to `TEST_RECIPIENT_EMAIL` | Experimental | Morning-brief recipient (founder's own inbox). |
| `BACKEND_HEALTH_ALERT_EMAIL` | `server/lib/backendHealthMonitor.ts:6` | `server/.env`, Fly secret | Falls back to `GMAIL_USER` | Production | |

### 1.5 SMS transports

`server/lib/sms.ts` resolves an ordered **transport chain** (see `propos-architecture-contract` for the full design rationale — one line here: chain order is `SMS_TRANSPORT_CHAIN` explicit list > legacy `SMS_TRANSPORT`+`SMS_TRANSPORT_FALLBACK` pair > auto-detect every configured transport in `CHAIN_PRIORITY` order, verified `sms.ts:90-110`).

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `SMS_TRANSPORT_CHAIN` | `sms.ts:94` | `server/.env`, Fly secret | Falls through to legacy pair, then auto-detect | Production | Comma-separated, e.g. `bluebubbles,shortcut-relay` (confirmed value in `docs/OPS_RUNBOOK.md:28,312`). |
| `SMS_TRANSPORT` | `sms.ts:100`, `imsg.ts:36`, `telelink.ts:52`, `textingblue.ts:38`, `androidgateway.ts:56` | `server/.env`, Fly secret | Legacy single-transport selector; each transport's own `isConfigured()` also checks `SMS_TRANSPORT === "<name>"` as a gate | Production/legacy | Superseded by `SMS_TRANSPORT_CHAIN` but still read by every transport module as a secondary gate. |
| `SMS_TRANSPORT_FALLBACK` | `sms.ts:103` | `server/.env` | No fallback transport in the legacy pair | Legacy | |
| `BLUEBUBBLES_URL` | `bluebubbles.ts:27`, `sms.ts:191` | `server/.env`, Fly secret | `isConfigured()` false; health check reports "Server unreachable" | Production | Fixed at `https://bluebubbles.addvantage.site` (never changes, per `OPS_RUNBOOK.md:308`), tunnels to `localhost:1234`. |
| `BLUEBUBBLES_PASSWORD` | `bluebubbles.ts:28` | `server/.env`, Fly secret | Same | Production | Also lives in `~/.addvantage/bbwatchdog.conf` on the Mac running the BB daemon (machine-level, outside this repo). |
| `BLUEBUBBLES_SERVICE` | `bluebubbles.ts:70` | `server/.env` | Defaults to `"any"` | Experimental | |
| `BLUEBUBBLES_METHOD` | `bluebubbles.ts:81` | `server/.env` | Uses BB's own default send method | Experimental | |
| `SMS_TEST_LABEL` | `bluebubbles.ts:51` | `server/.env` | No `[TEST]` label prefix on redirected test sends | Experimental | Set to `"true"` to visually mark test-mode SMS. |
| `SMS_LIVE_ALLOWLIST` | `bluebubbles.ts:53` | `server/.env`, Fly secret | Empty array — nobody bypasses `TEST_RECIPIENT_PHONE` redirect | Safety-relevant | Comma-separated. `+61426719845` (Aneesha only) as of `OPS_RUNBOOK.md:313`; expand deliberately for go-live. |
| `SHORTCUT_RELAY_SECRET` | `shortcutRelay.ts:44,48` | `server/.env`, Fly secret | `isConfigured()` false; `/api/sms-shortcut/*` rejects all requests (auth is via this secret as a query param, not JWT — route is public per `server/index.ts:186`) | Production | |
| `SHORTCUT_RELAY_DEVICE_ID` | `shortcutRelay.ts:44,76`, `sms.ts:220` | `server/.env`, Fly secret | `isConfigured()` false | Production | Route destructures `req.body.device_id` (snake_case), not `deviceId` — check before writing curl examples. |
| `HTTPSMS_API_KEY` | `httpsms.ts:41` | `server/.env` | `isConfigured()`-style gate fails, transport skipped in chain | Experimental | |
| `HTTPSMS_FROM` | `httpsms.ts:42`, `sms.ts:216` | `server/.env` | Same | Experimental | |
| `TEXTINGBLUE_API_KEY` | `textingblue.ts:31,38` | `server/.env` | Transport skipped | Experimental | |
| `TELELINK_URL` | `telelink.ts:43`, `sms.ts:206` | `server/.env` | Transport skipped | Experimental | Windows Phone Link bridge. |
| `TELELINK_TOKEN` | `telelink.ts:44,52` | `server/.env` | Transport skipped | Experimental | |
| `ANDROID_GW_URL` | `androidgateway.ts:43`, `sms.ts:211` | `server/.env` | Transport skipped | Experimental | |
| `ANDROID_GW_USER` | `androidgateway.ts:44` | `server/.env` | Transport skipped | Experimental | |
| `ANDROID_GW_PASS` | `androidgateway.ts:45` | `server/.env` | Transport skipped | Experimental | |
| `IMSG_BIN` | `imsg.ts:31` | `server/.env` | Defaults to `/opt/homebrew/bin/imsg` | Experimental | Local Mac binary path — only meaningful when running the server directly on the Mac, not on Fly. |
| `SMS_TRANSPORT_ALERT_EMAIL` | `transportHealthMonitor.ts:18` | `server/.env`, Fly secret | Falls back to `GMAIL_USER` | Production | Recipient for the transport-health cron's failure alerts. |
| `SMS_TRANSPORT_CHECK_CRON` | `transportHealthMonitor.ts:21` | `server/.env` | Defaults to `*/10 * * * *` (every 10 min) | Experimental | |

### 1.6 Webhooks

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `WEBHOOK_SECRET` | `server/index.ts:296,474,477,488`, `server/routes/bb.ts:24` | `server/.env`, Fly secret | **`verifyWebhookSecret()` (`index.ts:296-303`) calls `next()` unconditionally when unset** — i.e. absence does NOT reject webhooks, it disables the check entirely ("unset keeps local dev frictionless", comment at `index.ts:294`). This is the opposite of a fail-closed default. | Safety-relevant | Also referred to as `BB_DAEMON_SECRET` in `scripts/bb-watchdog.sh`, `scripts/install-bb-watchdog.sh`, and `docs/OPS_RUNBOOK.md:53,310` — **same env var, different name used for the BB-watchdog-facing docs**; there is no separate `BB_DAEMON_SECRET` var in server code (verified: `grep -rn "BB_DAEMON_SECRET" server/` returns nothing). Constant-time compare in both `index.ts` and `bb.ts:20-30`. |
| `WEBHOOK_BASE_URL` | `server/index.ts:488` | `server/.env` (local inbound testing only) | Falls back to `BASE_URL` | Local/testing | Used to construct the printed webhook-registration URL at boot; distinct from `BASE_URL` in intent (webhook registration target vs. general public base URL for email links) even though the fallback chain merges them in practice. |

### 1.7 Safety redirects (test-mode sends)

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `TEST_RECIPIENT_PHONE` | 15+ callsites incl. `server/index.ts:175,211,438`, `bluebubbles.ts:50`, `httpsms.ts:60`, `imsg.ts:47`, `telelink.ts:107`, `androidgateway.ts:85`, `shortcutRelay.ts:72`, `outreachScheduler.ts`, `pmBrief.ts:157`, `routes/send.ts:56,63,231`, `routes/conversations.ts:67`, `routes/outreach-targets.ts:132`, `routes/vendor-batch.ts:149` | `server/.env` (local/test), **absent in production** | **Every SMS send goes to the real recipient with no redirect.** This is the "test mode" master switch — its presence is what makes a build a test build. | **SAFETY-CRITICAL** | `server/index.ts:175` derives `testMode` from `TEST_RECIPIENT_PHONE \|\| TEST_RECIPIENT_EMAIL` being non-empty; this flag is surfaced in `/api/health` for authenticated callers. |
| `TEST_RECIPIENT_EMAIL` | `server/index.ts:175,211,439`, `gmail.ts:48`, `pmBrief.ts:196`, `vendor-batch.ts:150`, `vendor-bulk-send.ts:110,111` | `server/.env` (local/test), **absent in production** | Every email send goes to the real recipient | **SAFETY-CRITICAL** | `vendor-bulk-send.ts:111` also treats `!!process.env.TEST_RECIPIENT_EMAIL` as an implicit `isDemoMode` signal unless the request body explicitly sets `demoMode: false` — read that file before assuming "test env var set" and "demo mode UI toggle" are independent. |
| `SMS_AGENT_TEST_PHONE` | `server/data/smsAgentSeed.ts:44` | `server/.env` | Falls back to `TEST_RECIPIENT_PHONE` | Local/testing | Scoped override for SMS-agent demo-seed data specifically. |

### 1.8 Agent autonomy (SMS agent auto-send)

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `SMS_AGENT_AUTOSEND` | `server/lib/smsAgentInbound.ts:32,35-39` | `server/.env`, Fly secret | Regex `/^(1\|true\|on\|yes)$/i` against `""` is false, so auto-send is **off** | **SAFETY-CRITICAL** | **DB override precedence**: `autoSendEnabled()` (`smsAgentInbound.ts:35-39`) calls `getSetting("sms_agent_autosend")` first; if the DB row exists (non-null), its value (`"true"`/anything else) wins outright, and the env var is never consulted. Only when the DB has no row (null, i.e. `isDbConnected()` false or key never set) does the env var apply. See §2 for the DB side. |
| `SMS_AGENT_PROMOTE_TARGETS` | `server/lib/smsOrchestrator.ts:35` | `server/.env` | `PROMOTE_LEGACY_TARGETS` is false — the legacy `outreach_targets`-promotion cron path stays disabled | Experimental, off by default | Comment at `smsOrchestrator.ts:31-34`: the CRM-triggered `smsReadyOutreach.ts` poller is now the single source of truth for new outreach; this flag re-enables a superseded path. |
| `SMS_AGENT_DAILY_CAP` | `smsOrchestrator.ts:27` | `server/.env` | Defaults to `3` | Experimental | |
| `SMS_AGENT_FOLLOWUP_DAYS` | `smsOrchestrator.ts:28` | `server/.env` | Defaults to `3` | Experimental | |
| `SMS_AGENT_MAX_FOLLOWUPS` | `smsOrchestrator.ts:29` | `server/.env` | Defaults to `2` | Experimental | |
| `OUTREACH_DAILY_CAP` | `outreachScheduler.ts:38` | `server/.env` | Defaults to `5` | Experimental | Separate cap for the older self-outreach campaign scheduler (distinct from the SMS-agent orchestrator above — two different subsystems, don't conflate). |
| `OUTREACH_FOLLOWUP_DAYS` | `outreachScheduler.ts:39`, `outreachAgent.ts:372` | `server/.env` | Defaults to `3` | Experimental | |

### 1.9 Alerting

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `SMS_TRANSPORT_ALERT_EMAIL` | see §1.5 | `server/.env`, Fly secret | Falls back to `GMAIL_USER` | Production | Listed here again per brief grouping; canonical row is §1.5. |
| `BACKEND_HEALTH_ALERT_EMAIL` | see §1.4 | `server/.env`, Fly secret | Falls back to `GMAIL_USER` | Production | Canonical row is §1.4. |

### 1.10 Other integrations

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `SHEET_URL` | `server/index.ts:168,433`, `compliance.ts:34`, `conversations.ts:208`, `sheets.ts:66`, `routes/analytics.ts:292,333`, `routes/transcript.ts:64` | `server/.env`, Fly secret | Sheet-backed features log "not set (demo mode)"; `routes/transcript.ts:64` also accepts `VITE_SHEET_URL` as a fallback read on the server side (unusual — a `VITE_` var read server-side) | Production | Google Apps Script web app URL, distinct from the frontend's own `VITE_SHEET_URL` build var (§3). |
| `BOXDICE_DOMAIN` | `server/index.ts:172`, `boxdice.ts:11,17` | `server/.env`, Fly secret | `boxdiceConfigured()` false, CRM integration disabled | Experimental | |
| `BOXDICE_API_KEY` | same | same | same | Experimental | |
| `DOMAIN_API_KEY` | `server/index.ts:173`, `domainAvm.ts:21,25` | `server/.env`, Fly secret | `domainConfigured()` false; caller uses a hardcoded suburb model instead (`domainAvm.ts:6-7` comment) | Experimental | Free key from developer.domain.com.au. |
| `VINUTH_PHONE` | `pmBrief.ts:157` | `server/.env` | Falls back to `TEST_RECIPIENT_PHONE` | Experimental | Morning-brief SMS recipient. |

### 1.11 Platform / server

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `PORT` | `server/index.ts:78` | `server/.env` (local), `fly.toml` `[env]` (prod, fixed at `"3001"`) | Defaults to `3001` | Production | |
| `NODE_ENV` | `server/index.ts:87,89`, `auth.ts:70`, `routes/demo.ts:87` | `fly.toml` `[env]` sets `"production"`; unset locally | When not `"production"`: relaxed CSP/frameguard (`index.ts:87-90`), refresh cookie not `secure` (`auth.ts:70`), demo routes always allowed (`demo.ts:87`) | Production | |
| `BASE_URL` | `server/index.ts:93,488`, `compliance.ts:172`, `emailTemplate.ts:3`, `marketUpdateTemplate.ts:15`, `provision-agent.ts:256`, `routes/pitches.ts` (4 callsites), `routes/track.ts:51` | `server/.env`, Fly secret | Falls back to hardcoded `"https://propos.addvantage.site"` in every template/link builder | Production | Also added to the CORS `origin` allowlist at `index.ts:93` — if this doesn't match the actual frontend origin, CORS silently blocks requests from it. |
| `FRONTEND_URL` | `routes/pitches.ts:631` | `server/.env` | Falls back to `"https://propos.addvantage.site"` | Experimental | One isolated callsite; everywhere else in `pitches.ts` uses `BASE_URL` instead (`pitches.ts:178,275,357,378`) — likely drift, not a deliberate distinct var. Flag for cleanup if touching that file. |
| `DEMO_MODE` | `routes/demo.ts:87` | `server/.env`, Fly secret | `isDemoAllowed()` returns true only if `NODE_ENV !== "production"`; in production, demo seed/activate routes refuse unless `DEMO_MODE=true` is explicitly set | Safety-relevant | Guards against accidentally seeding/activating demo data on the live production database. |
| `CLOUDFLARE_API_TOKEN` | not read by app code; used by `wrangler` CLI directly (`CLAUDE.md:57,73`) | Local shell export, GitHub Actions repo secret | `wrangler` says "not logged in" | Production | `[NOT FOUND IN CODE 2026-07-05]` as a `process.env.*` read inside `server/` or `src/` — it's a wrangler CLI convention, not app code. Listed because the brief and CI config both depend on it. |

---

## 2. DB-backed settings (`app_settings` table)

Schema (verified `server/lib/db.ts:644-649`, migration name `"TABLE app_settings"`):

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Access layer: `server/lib/appSettings.ts` — `getSetting(key)` returns `string | null` (null if DB not connected or key absent); `setSetting(key, value)` upserts, no-ops if DB not connected.

All three keys found in code (`grep -rn 'getSetting("\|setSetting("' server/`, 2026-07-05 — this is exhaustive, no others exist):

| Key | Read/write endpoints | Precedence over env | Notes |
|---|---|---|---|
| `sms_agent_autosend` | `GET/POST /api/sms-agent/settings` (`routes/sms-agent.ts:288-299`); read inside `autoSendEnabled()` (`smsAgentInbound.ts:36`) | **Wins over `SMS_AGENT_AUTOSEND`** when the DB row exists (non-null); env is only consulted as a fallback when the DB has no row or is unreachable | This is the Voice tab UI toggle in the frontend. Flipping it live-enables auto-send to real contacts — see §3. |
| `demo_target_phone` | `GET/POST /api/sms-agent/demo/target` (`routes/sms-agent.ts:305-315`); read at send-time in `routes/sms-agent.ts:179` | No env equivalent exists; DB is the only source | Redirects sends for contacts whose `source` starts with `"seed:demo"` to this phone number instead of their real number. |
| `ai_features_enabled` | No dedicated HTTP route found in `server/routes/` as of 2026-07-05 (only `server/lib/aiGate.ts` reads/writes it directly — confirm with a fresh grep for `aiGate` route mounting before assuming it's unreachable from the UI) | No env equivalent; DB-only, 60-second in-process cache (`aiGate.ts:5`) | Defaults to **disabled** (`false`) if the DB key is absent or the query throws (`aiGate.ts:9-16`, fail-closed). |

---

## 3. Safety-critical flags: call-out box

**Flipping any of these without asking the founder first is a change-control violation (see `propos-change-control`, §E.3 of the authoring brief this skill was built from). Do not toggle these based on your own judgment.**

| Flag | What "on"/present means | What "off"/absent means | Ask-first because |
|---|---|---|---|
| `SMS_AGENT_AUTOSEND=true` (env) **or** `app_settings.sms_agent_autosend = "true"` (DB, wins if set) | The SMS agent sends replies to real contacts with no human approval step | Every reply is queued as a draft for founder approval | Enabling this means unreviewed AI-generated text reaches real leads' phones. This is the single highest-leverage flag in the repo. |
| `TEST_RECIPIENT_PHONE` / `TEST_RECIPIENT_EMAIL` absent | N/A (this is the "off" state) | **All sends go to the real recipient** — there is no redirect layer active | A production deploy with these unset is "live mode" for every send path in the codebase, including `/api/test-sms`. Verify these are unset only when you intend real sends to go out. |
| `WEBHOOK_SECRET` unset | N/A (this is the "off" state) | The webhook shared-secret check (`verifyWebhookSecret`, `index.ts:296-303`) is **bypassed entirely** — any caller can hit `/api/webhook/*` and the BB-daemon routes in `bb.ts` without a secret | Unlike a typical "fail closed" pattern, absence here fails **open**. Confirm it's set before treating any webhook endpoint as protected. |
| `DEMO_MODE=true` in production | Demo seed/activate routes (`routes/demo.ts`) run against the live production database | Demo routes refuse outside of `NODE_ENV !== "production"` | Seeding demo data into production risks corrupting real contact/lead records. |

---

## 4. Where secrets live physically

| Location | What goes here | How to inspect |
|---|---|---|
| `server/.env` | All server-side secrets (DB, LLM keys, Gmail OAuth, SMS transport creds, `WEBHOOK_SECRET`, `JWT_SECRET`, etc.) | `cat server/.env` locally. **Gitignored since commit `c3507d0` ("security: add .env to gitignore — prevent credential commits", 2026-07-05)** — verify with `git log --oneline -- server/.gitignore \| head -3`. History before this point was purged of a leaked copy via `git-filter-repo` (see `propos-failure-archaeology` for the incident narrative; the resulting rule lives in `propos-change-control`). |
| Fly.io secrets (`addvantageadvisory` app) | The production values for everything in `server/.env` | `flyctl secrets list --app addvantageadvisory` (lists names only, not values). Set with `flyctl secrets set KEY=value --app addvantageadvisory`. A `flyctl deploy` is NOT required to apply a new secret — Fly restarts the machine automatically — but always confirm via `/api/health` afterward. |
| `.env.local` (repo root) | Frontend `VITE_*` build vars for **local dev only** (`vite dev` reads this automatically) | `cat .env.local` — verified keys as of 2026-07-05: `VITE_SHEET_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Not gitignored by name pattern but check `.gitignore` (`*.local` matches it) before assuming it's tracked. |
| `.env.production` (repo root) | Frontend `VITE_*` build vars for **CI build only** (consumed by `npm run build` when GitHub Actions runs it) | `cat .env.production` — verified keys as of 2026-07-05: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only. **Notably does NOT include `VITE_SHEET_URL`** — that one is injected via a GitHub Actions secret instead (see below), not this file. |
| GitHub Actions secrets (`.github/workflows/deploy.yml`) | `CLOUDFLARE_API_TOKEN` (used for the whole job), `VITE_SHEET_URL` (injected as a build-step env var at `deploy.yml`'s "Build frontend" step) | `gh secret list` (requires repo admin) or check the workflow YAML for which `secrets.*` names are referenced. | 
| Cloudflare Pages project settings (`openhome-engine`, the real deploy target — see `propos-run-and-operate` for the `propos-demo` vs `openhome-engine` deploy-truth incident) | Per-project environment variables, settable via the Cloudflare dashboard or `wrangler pages secret put` | `wrangler pages secret put KEY --project-name openhome-engine`. **A Pages secret put does NOT affect the currently-live deployment** — you must run a no-op `wrangler pages deploy` afterward for it to take effect (this is a documented gotcha from the 2026-07-02 `OAUTH_STATE_SECRET` 403 incident, tracked in `propos-failure-archaeology`). |

**OpenAI key rotation**: a rotation script exists at `~/Desktop/Claude/update-openai-key.sh <newkey>` [UNVERIFIED IN THIS REPO, from session notes 2026-07-05 — the path is outside this repo and outside this skill's writable/citable scope per the authoring brief §C, so treat its exact behavior as institutional knowledge, not a repo fact]. It is reported to update 8 local `.env` files plus Cloudflare Pages secrets on `addvantage-advisory` and `peakere-demo`. If you need to rotate the PropOS server's own `OPENAI_API_KEY`, that is a Fly secret (`flyctl secrets set OPENAI_API_KEY=... --app addvantageadvisory`), which this script — as described — does not appear to touch. Confirm scope before relying on it for this repo.

---

## 5. Add-a-flag checklist

Before adding a new `process.env.X` read or `import.meta.env.VITE_X` read:

- [ ] **Read it lazily.** A module-top-level `const X = process.env.FOO` executes at import time, which can run before `dotenv.config()` finishes if the import order is wrong (this exact bug was found and fixed in `transportHealthMonitor.ts`). Read inside a function body, or inside a getter like the existing `AG_URL = () => process.env.ANDROID_GW_URL ?? ""` pattern in `androidgateway.ts:43`.
- [ ] **`dotenv.config()` runs once, early, with an explicit path.** `server/index.ts:6-7` does this correctly: `dotenv.config({ path: path.resolve(__dirname, ".env") })`, executed before any other import that might read env vars at module scope. Don't rely on the bare `import "dotenv/config"` form elsewhere in the server — it loads relative to `process.cwd()`, not the file's directory, and breaks if the process is started from a different working directory.
- [ ] **Decide default + absent behavior explicitly**, and write it down in the row you add to this table: fail closed (feature disabled), fail open (feature runs with degraded/fallback behavior), or crash (only acceptable for genuinely un-recoverable config, and even then prefer a clear startup log over a raw exception).
- [ ] **If the client that consumes the key can be constructed at import time** (e.g. `new OpenAI(...)`, `new Anthropic(...)`), lazy-init it behind a `let _client` + getter function, exactly like `server/lib/openai.ts:9` and `server/lib/claude.ts:10`. A bare `new OpenAI({ apiKey: process.env.X })` at module scope throws immediately if `X` is empty and **crashes the entire server on boot**, taking down every unrelated route with it.
- [ ] **Add a row to the table in this file (`propos-config-and-flags/SKILL.md`).** This is the one authoritative catalog — don't create a second one in `docs/`.
- [ ] **Security review** if the flag gates a send (SMS/email), a paid API call, or exposes a secret to the frontend (`VITE_*` vars are public — never put a non-publishable key behind one, see §1.4/§3 pattern of anon vs. secret Supabase keys).
- [ ] **Change-control approval** (per `propos-change-control`) if the flag changes production behavior — i.e. it isn't purely a local-dev convenience.

---

## 3 (frontend). Frontend build vars (`import.meta.env.VITE_*`)

Verified by `grep -rn "import\.meta\.env" src/ --include="*.tsx" --include="*.ts"` (2026-07-05) — exactly 3 files use it.

| Var | Read where | Set where | Absent behavior | Prod/experimental | Notes |
|---|---|---|---|---|---|
| `VITE_SHEET_URL` | `src/App.tsx:167`, `src/lib/sheet.ts:86` | `.env.local` (local dev), GitHub Actions secret `VITE_SHEET_URL` injected at CI build step (`deploy.yml`'s "Build frontend" step) | `sheet.ts:86` defaults to `""` — Sheet-backed CRM features silently return no data instead of erroring | Production | Server also has its own independent `SHEET_URL` (no `VITE_` prefix, §1.10) — these are two separate variables for two separate runtimes (browser bundle vs. Node server), verify which one a given feature actually reads before debugging. |
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts:14` | `.env.local` (local dev), `.env.production` (CI build) | Defaults to `''` — Supabase client is constructed with an empty URL and the app **silently falls back to demo data** rather than erroring | Production | **Bake-at-build rule**: this must be present at `vite build` time or it is permanently absent from that bundle; setting it as a Fly/server env var afterward does nothing for the frontend. |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.ts:15` | `.env.local`, `.env.production` | Same as above | Production | This is the anon/publishable key (verified value starts `sb_publishable_...` in `.env.production`) — safe to ship in a public JS bundle. The Supabase *secret* service-role key, if PropOS ever needs one, must go ONLY in `server/.env` + Fly secrets, never behind a `VITE_` prefix. |

---

## When NOT to use this skill

- **Deciding what a value SHOULD BE for a given environment** (e.g. "what should `SMS_AGENT_DAILY_CAP` be set to for the Cameron Knoll pilot") is a product/founder decision, not a config-catalog fact — ask the founder, or check `propos-run-and-operate` for deploy-time injection process.
- **The `app_settings` table's place in the overall DB schema**, migration ordering, or how it relates to other tables → `propos-architecture-contract`.
- **Diagnosing why `database:false` shows on `/api/health`** or other live symptom-to-root-cause triage → `propos-debugging-playbook` (this is an open incident as of 2026-07-05, tracked there and in `propos-failure-archaeology`).
- **The full transport-chain design rationale, fly.toml `auto_stop_machines` reasoning, or route-order invariant** → `propos-architecture-contract` (this skill only documents the individual env vars that feed those systems, not why the systems are shaped that way).
- **Approval matrix for who can flip a safety-critical flag, or the never-touch list** → `propos-change-control` (this skill's §3 call-out box names the flags; change-control owns the process for touching them).
- **Actually deploying with new secrets applied** → `propos-run-and-operate`.

---

## Provenance and maintenance

Regenerate the full catalog with these commands (repo root, read-only):

```bash
# Server-side env var usage — the source of truth for §1
grep -rn "process\.env\." server/ --include="*.ts" | grep -v node_modules | grep -v dist

# Frontend Vite env var usage — the source of truth for §3
grep -rn "import\.meta\.env" src/ --include="*.tsx" --include="*.ts"

# DB-backed settings — the source of truth for §2 (must stay exhaustive)
grep -rn 'getSetting("\|setSetting("' server/ --include="*.ts" | grep -v node_modules | grep -v dist

# app_settings schema
grep -n -A5 '"TABLE app_settings"' server/lib/db.ts

# Confirm .env is still gitignored and find the commit that made it so
git log --oneline -- server/.gitignore | tail -5

# Confirm which Cloudflare Pages project is the real deploy target (cross-check against propos-run-and-operate)
grep -n "project-name" .github/workflows/deploy.yml CLAUDE.md

# Confirm Fly secrets currently set (names only)
flyctl secrets list --app addvantageadvisory
```

Last full regeneration: 2026-07-05. Every row in §1-§3 was checked against the file:line cited in that row on this date. If you find a var in code that isn't in this table, add it. If a var in this table no longer appears in a fresh grep, mark its row `[STALE — not found in code <date>]` rather than deleting it silently, and note in the row what replaced it if known.
