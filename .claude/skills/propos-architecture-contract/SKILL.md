---
name: propos-architecture-contract
description: "Use when you need to understand WHY PropOS is built the way it is before changing server/index.ts route order, server/lib/db.ts migrations, fly.toml, the SMS transport chain, the outreach engine, or any DB-vs-env precedence logic. Covers the system map, the invariants that must hold (with evidence and what breaks if violated), the load-bearing design decisions and their rationale, the full data model census, and the frontend contract. Triggers: 'why is this built this way', 'can I reorder routes in index.ts', 'is it safe to change this migration', 'why does fly.toml keep the machine running', 'what tables exist', 'why templates instead of LLM', 'what happens if I change route order', 'explain the architecture', 'is this DB setting or env var the source of truth'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Architecture Contract

This is the load-bearing design reference for PropOS. It documents decisions that were made for specific reasons, the invariants that depend on those decisions holding, and the places where the architecture is known to be weak. Read this before touching route order, migrations, fly.toml, the transport chain, or the settings-precedence logic. For HOW to run/deploy day-to-day, see **propos-run-and-operate**. For WHY past decisions changed (the incident stories), see **propos-failure-archaeology**.

All facts below were verified directly against source on 2026-07-05. File:line references are exact at that commit; re-verify with the commands in "Provenance and maintenance" if this file feels stale.

---

## 1. System map

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                  │
│    React 18 + Vite + TS SPA  (src/)                                      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  static assets + /api/* fetch calls
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Pages project serving propos.addvantage.site: propos-demo as of        │
│  2026-07-10 (was openhome-engine until ~9 Jul; verify via API)           │
│    Serves dist/ (built SPA)                                              │
│    functions/api/[[path]].ts: real proxy Function (NOT a stub):         │
│      catches every /api/* request, rewrites origin to                    │
│      https://addvantageadvisory.fly.dev, forwards method/headers/body,   │
│      adds Access-Control-Allow-Origin: * on the way back.                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  proxied HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Fly.io app "addvantageadvisory"  (region syd)                           │
│    Express + TS server (server/), single machine, 512MB shared-cpu-1x    │
│    server/index.ts (520 lines): routes, middleware, schedulers           │
│    server/public/: build-time copy of dist/ so Express can ALSO serve    │
│      the SPA directly (bypasses the Pages proxy for direct Fly hits;     │
│      needed because `vite preview` has no API proxy, see §3)             │
└───────┬─────────────────────────────┬───────────────────┬───────────────┘
        │ pg (DATABASE_URL)           │ HTTPS + cloudflared│ Gmail OAuth
        ▼                             ▼ tunnel             ▼
┌───────────────────┐   ┌─────────────────────────┐  ┌──────────────────┐
│ Supabase Postgres  │   │ BlueBubbles / macOS      │  │ Gmail (OAuth2)    │
│ project            │   │ server/lib/bluebubbles.ts│  │ server/lib/gmail  │
│ pzdcwulzteofvatjrtlh│  │ tunnel: bluebubbles.      │  │ .ts               │
│ 149-step migrate()  │  │ addvantage.site →         │  │ email send + read │
└───────────────────┘   │ localhost:1234            │  └──────────────────┘
                         └─────────────────────────┘
                                                        ┌──────────────────┐
                                                        │ Google Sheets     │
                                                        │ legacy CRM path   │
                                                        │ server/lib/       │
                                                        │ sheets.ts         │
                                                        │ (writeToSheet,    │
                                                        │  non-fatal void   │
                                                        │  calls)           │
                                                        └──────────────────┘
```

Key correction to the assumed shape: **`functions/api/[[path]].ts` is not a stub.** It is a complete, working Cloudflare Pages Function (verified, 38 lines) that proxies every `/api/*` call from the static Pages site to the Fly.io backend. This means the frontend can be deployed to Cloudflare Pages alone and still reach the API. The Fly server's own `server/public` static-serving (§3) is a *second, independent* path to the same SPA, used when something hits the Fly domain directly.

---

## 2. Invariants table

Each row is a rule the codebase currently depends on. Do not violate these without reading the "what breaks" column first.

| # | Invariant | Why | What breaks if violated | Evidence |
|---|---|---|---|---|
| a | `GET /api/health` and all PUBLIC routers are registered **before** the `requireAuth` gate on `/api/*` in server/index.ts | Fly.io's unauthenticated healthcheck probe must reach `/api/health` with zero auth. If the gate ran first, the healthcheck 401s and Fly considers the machine unhealthy | Fly marks the machine unhealthy and can restart/stop it, killing the node-cron jobs (see row c). Also breaks BB polling, iOS Shortcut relay, SLM answer widget, and public pitch links — all of which are unauthenticated by design | `server/index.ts:139` health route defined; public routers at lines 179-193 (`/api/auth`, `/unsubscribe`, `/api/track`, `/api/doc-track`, `/api/webhook`, `/api/sms-shortcut`, `/api/bb`, `/api/slm-answer`, `/api/slm-answer-batch`, `/api/rag`, `/api/pitches` public); `requireAuth` gate mounted at line 225-230, all `app.use("/api/...")` protected routers start at line 232. Comment at line 135-137 states the reasoning explicitly |
| b | DB migrations are a flat array of `[label, sql]` tuples inside `migrate()` (server/lib/db.ts), each run in its own `pool.query()` call inside a per-step try/catch, never batched into one multi-statement string | One malformed step must not block the other 148. A missing column on one table shouldn't stop indexes being created on a different table. Labelled errors mean `flyctl logs` shows exactly which step failed, not an opaque multi-statement error | Batching would mean one syntax error or one already-existing constraint aborts the entire migration run, silently leaving later tables/columns/indexes missing in production with no per-step diagnostic | `server/lib/db.ts:76-776` — 149 steps confirmed by direct array evaluation (see Provenance). Loop at lines 778-792: `for (const [label, sql] of steps) { try { await pool.query(sql) } catch (err) { failed++; console.error(\`[migrate] FAIL ${label}...\`) } }`. Final log line: `[migrate] all ${steps.length} steps ok` or `[migrate] ${failed}/${steps.length} step(s) failed` |
| b2 | Column additions to pre-existing tables use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, never a bare `ADD COLUMN` | The same migrate() runs on every server boot, against both fresh and long-lived databases. A bare `ADD COLUMN` throws "column already exists" on the second boot | Server would log a FAIL line on literally every restart for every column that already exists, burying real failures in noise, and — worse — a bare `ADD COLUMN` used with `NOT NULL` and no default would fail entirely against a table with existing rows | Every `ALTER TABLE` step in db.ts uses `IF NOT EXISTS`, e.g. `server/lib/db.ts:274-290` (17 contacts columns), `:292-297` (conversations), `:299-307` (nurture_queue) |
| c | fly.toml sets `auto_stop_machines = "off"` AND `min_machines_running = 1` together | node-cron jobs (2-min ready-outreach poller, 7am orchestrator, Sunday 2am prompt-optimisation cron) are in-process timers. If Fly stops the machine during a quiet period (its default cost-saving behaviour), the process dies and the cron schedule with it — there is no external scheduler to resume it | Silent loss of scheduled outreach: the ready-poller stops promoting warm leads, the 7am orchestrator never fires, prompt optimisation never runs. No error is raised anywhere — the symptom is just "nothing happens on schedule" | `fly.toml:5-7` comment: "CRITICAL: auto_stop_machines = \"off\" + min_machines_running = 1 / These TWO settings together ensure the node-cron jobs (2-min ready poller, 7am orchestrator) always run. If the machine stops, crons stop." Settings themselves at lines 22 and 24. Cron registration: `server/index.ts:466-470` (Sunday 2am) plus `startOutreachScheduler()`, `startSmsAgentScheduler()`, `startReadyOutreachScheduler()` at lines 459-461 |
| d | `server/public/` is a build-time copy of `dist/`, created by the root `build` script, so Express can serve the SPA directly | `vite preview` has no `/api/*` proxy (it only serves static files) — see propos-build-and-env for the full trap. Copying dist/ into server/public means the Express server (which DOES have all the real API routes) can serve the frontend too, so a single `node index.ts` process is a complete, correctly-proxied full-stack app with no separate proxy needed | Running `vite preview` for full-stack testing gives 404s on every `/api/*` call while the UI looks fine — a classic false-positive "it works" that silently isn't testing the backend at all | `package.json:9` build script: `vite build && node scripts/patch-html.cjs && node -e "...cpSync('dist','server/public',{recursive:true})..."`. Runtime path selection: `server/index.ts:396-399` — `existsSync(flyPublic) ? flyPublic : path.resolve(__dirname, "..", "dist")`, with inline comment explaining the tsc-compiled vs tsx-local path difference |
| e | Every LLM callsite fires only from an explicit user click, never on page load, cron, or deploy smoke test | No-autofire rule, established after the July 2026 OpenAI key-leak billing drain (see propos-change-control for the full rule and propos-failure-archaeology for the incident). Since commit f0d914b (§3), most generation paths don't call an LLM at all — templates are primary | An unattended LLM call is exactly the failure mode that caused the key-leak billing drain: cron-triggered or load-triggered generation racks up cost with no human in the loop and no ability to catch it before it compounds | Full rule + verification lives in **propos-change-control**; do not duplicate here |
| f | Every send (SMS or email) passes through the `TEST_RECIPIENT_PHONE` / `TEST_RECIPIENT_EMAIL` redirect layer when those env vars are set | Prevents accidental real sends to real leads/agents while testing. Demo-tagged contacts additionally redirect to the `demo_target_phone` app_setting | A test run that forgets this layer is disabled would message real phone numbers/emails — a compliance and trust risk given SPAM Act obligations | `server/index.ts:175` health payload reports `testMode: !!(process.env.TEST_RECIPIENT_PHONE?.trim() || process.env.TEST_RECIPIENT_EMAIL?.trim())`. `server/index.ts:210-220` `/api/test-sms` defaults `to` from `TEST_RECIPIENT_PHONE`. Full redirect mechanics belong to propos-config-and-flags — one line here per §F fact-homes |
| g | Inbound message processing is idempotent by BlueBubbles message GUID, claimed once via `claimMessageGuid()` before any handler runs | The same webhook can be retried by BlueBubbles, or a message can theoretically be redelivered by more than one transport in the cascade. Processing a "STOP" or a lead reply twice would double-fire opt-out logic, double-log to Sheets, double-trigger the SMS agent, etc | Duplicate processing: a single incoming "STOP" could be recorded twice, a single buyer reply could spawn two conflicting agent drafts, or the same guid could be redispatched more than once via the wrong transport | `server/index.ts:260-264` `handleIncomingReply()`: `if (guid && !(await claimMessageGuid(guid))) { ...skip... }`. Backing table: `server/lib/db.ts:638-642` `processed_message_guids (guid TEXT PRIMARY KEY, created_at ...)` — the PK itself is the dedup mechanism |
| h | API clients (OpenAI, Anthropic, etc.) are lazily initialised, not constructed at module import time | Constructing a client with an empty API key at import time throws before the server can even start listening — one missing env var would crash the entire process, not just disable one feature | The whole server fails to boot (not just "OpenAI features disabled") when `OPENAI_API_KEY` is unset, which is a normal state in demo/dev mode | Institutional rule from project memory (§G.18 of the authoring brief), consistent with the demo-mode-tolerant design seen throughout server/index.ts (e.g. `console.log(... "not set (demo fallback active)")` at line 431). See propos-config-and-flags for the per-client verification |
| i | JWT model: 15-minute access tokens (Bearer header), 7-day refresh tokens (httpOnly cookie), identity keyed on the `agents` table by numeric id, and a standing `agentId=0` "demo token" issued by `POST /api/auth/demo-token` for quick access (Cameron / Vinuth) | Short access-token TTL limits the blast radius of a leaked bearer token. `agentId=0` gives a working demo login without needing a real seeded agent row, while still flowing through every other invariant (auth gate, TEST_RECIPIENT redirect, etc.) exactly like a real agent would | A leaked long-lived token would stay valid far longer; removing the demo-token route would break the fastest path to a working demo session | `server/lib/auth.ts:13` `ACCESS_TTL = 15 * 60`, `:14` `REFRESH_TTL = 7 * 24 * 60 * 60`. Demo token: `server/routes/auth.ts:154-156` comment "Demo token (Cameron / Vinuth quick-access — agentId=0)" + `router.post("/demo-token", ...)`. `agentId` type is `number` throughout (`server/middleware/auth.ts:14` `agentId?: number`) |

---

## 3. Load-bearing decisions and why

### SMS transport chain (cascade design)

`server/lib/sms.ts` implements an ordered cascade, not a single provider. Resolution order (`getTransportChain()`, lines 90-110):

1. `SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay,httpsms` (explicit, comma-separated) — highest priority if set
2. `SMS_TRANSPORT` + `SMS_TRANSPORT_FALLBACK` (legacy two-slot pair) — used if (1) is unset
3. Auto-chain: every configured transport walked in `CHAIN_PRIORITY` order (`bluebubbles, shortcut-relay, android-gateway, httpsms, textingblue, imsg, telelink`) — fallback if neither (1) nor (2) is set

`sendSMS()` (lines 140-174) walks the resolved chain in order and returns on the first success, recording every attempt (success or failure) in the `attempts` array for diagnostics. This is intentional double handling: if BlueBubbles is briefly unreachable, the same send automatically retries via the next transport in the same call, with no separate retry job needed.

**Rationale: deliverability and authenticity over convenience.** BlueBubbles is the primary transport because it sends from the founder's real Apple ID / real SIM via iMessage — recipients see a message from an actual phone number they could call back, not a shortcode or virtual number. Founder decision: **never use virtual numbers**. This is a moat-relevant choice (see propos-research-frontier's "voice fidelity" frontier goal — recipients should not be able to tell AI outreach from the agent's own texting) as much as a deliverability one; virtual/VOIP numbers get filtered by carriers and read as spam by recipients.

7 transport modules exist total (`bluebubbles.ts`, `imsg.ts`, `telelink.ts`, `textingblue.ts`, `androidgateway.ts`, `httpsms.ts`, `shortcutRelay.ts`). **`server/lib/twilio.ts` does not exist** — CLAUDE.md's "Key Files" table (line 137) still lists it; that line is stale. Treat CLAUDE.md line 137 as wrong; the correct file list is the 7 above.

### Template-first outreach engine (commit f0d914b)

Commit `f0d914b` ("feat: template-first outreach engine — slash OpenAI costs ~95%", 21 Jun 2026) restructured `/api/generate` and `/api/nurture` from a 3-call LLM pipeline (analysis + generate + QA) to a template engine with regex-based personalization (keyword extraction from lead notes), with the LLM path retained only as an explicit `forceAI` opt-in for cases templates can't cover.

**Rationale:** the 3-LLM-call-per-generation pattern was the single largest OpenAI cost driver. Deterministic variant selection (hash of lead + strategy) keeps output varied without needing a model call at all. Cached/hand-written templates are also simply better for a demo: vetted, on-brand, correctly-lengthed, free of em-dashes — see propos-change-control for the full "cached beats LLM for demos" rule.

**Precedence for any new outreach feature: template/cached path is primary, LLM is fallback-only**, and even the fallback is click-gated per invariant (e) above.

### Inline-styles-only frontend with C tokens from src/data.ts

The frontend has no CSS framework or stylesheet system; every component uses inline `style={{ ... }}` objects. Colors, spacing, and other design tokens come from a single exported object `C` (`src/data.ts:7`) plus per-agency theme objects in `AGENCY_THEMES` (`src/data.ts:98-131`, keyed by agency name, with `DEFAULT_THEME = AGENCY_THEMES["Other"]` at line 132). `App.tsx` reads `theme` from login state and injects it as CSS custom properties (`--accent`, `--accent-dim`, `--accent-glow`) at the root div (`src/App.tsx:199-205`), with a separate light/dark override path (`DARK_CSS_VARS` / `LIGHT_CSS_VARS`, `themeLightVarOverrides(theme)`).

This is a load-bearing simplicity choice: no build step for styling, no class-name collisions, one place (`data.ts`) to look up every color/token in the app. The cost is that `data.ts` is now 1098 lines and growing (it also holds `DEFAULT_AGENT` at line 417 and other shared data), and per-agency branding requires editing this file rather than a themeable stylesheet.

### DB overrides beat env vars (app_settings precedence pattern)

`server/lib/appSettings.ts` is a tiny key/value store backed by the `app_settings` table (`getSetting`/`setSetting`, using `INSERT ... ON CONFLICT (key) DO UPDATE`). The precedence pattern, concretely demonstrated in `server/lib/smsAgentInbound.ts:32-36`:

```
const ENV_AUTOSEND = /^(1|true|on|yes)$/i.test(process.env.SMS_AGENT_AUTOSEND ?? "")
...
const override = await getSetting("sms_agent_autosend")
```

The env var supplies a boot-time default; a DB row in `app_settings`, when present, overrides it at runtime with no redeploy needed. This is the general pattern for any "flip a switch without redeploying" setting in PropOS — verify the exact override-resolution logic per-flag in propos-config-and-flags before assuming DB always wins; the pattern is "env sets the default, `app_settings` overrides if a row exists," not "DB is always consulted first no matter what."

### Dual tsconfig / dual tsc gates

Two independent TypeScript projects exist with two independent `noEmit` checks:

- Root `tsconfig.json` (`"include": ["src"]`, target ES2020, strict) — frontend only. Confirms the root `tsc --noEmit` gate never type-checks server code.
- `server/` has its own `tsc` build (server/package.json `"build": "tsc"`) with its own tsconfig (not shared with root).

**Consequence:** "tsc passes" at the repo root says nothing about the server compiling. Any validation regime (see propos-validation-and-qa) must run both `npx tsc --noEmit` at repo root AND inside `server/` to get full coverage — this is why that requirement exists, not an arbitrary double-check.

### snake_case API bodies

`/api/sms-shortcut/*` and its siblings use `device_id`, not `deviceId`, in both JSON request bodies and query strings (`server/routes/sms-shortcut.ts:65` `const { device_id, phone, secret, label } = req.body ?? {}`; `:94` `req.query.device_id`). This is inconsistent with idiomatic TS/JS camelCase but matches the iOS Shortcuts app's JSON output conventions, which is the actual caller for this route. **Always check the specific route's destructuring before writing a curl example** — not every route in the codebase uses snake_case, only the ones whose caller is an external non-JS client (Shortcuts, webhooks).

---

## 4. Data model census

`server/lib/db.ts` `migrate()` runs **149 steps** (verified by direct evaluation of the `steps` array, not estimated — see Provenance) in one flat array, organized into 11 phases by comment header. Below: every table actually created (`CREATE TABLE IF NOT EXISTS`), one line each on role. Columns added later via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` are folded into the owning table's row, not listed separately.

| Table | Phase | Role |
|---|---|---|
| `conversations` | 1 | SMS thread history per phone number (buyer/vendor lead pipeline), replaces an earlier in-memory Map |
| `opt_outs` | 1 | SPAM Act 2003 opt-out registry (sms/email/all, sourced from reply/link/manual) |
| `outreach_log` | 1 | Every SMS/email sent, for analytics + audit; PII auto-redacted after 90 days (Phase 7) |
| `nurture_queue` | 1 | Scheduled follow-up jobs (multi-step sequences), status-tracked with retry/attempts |
| `contacts` | 1 | Past-buyer / CRM-mirror records, one row per known contact, agent-scoped |
| `agents` | 1 | Agent identity table backing the whole auth model: email, password_hash, subscription_status, trial_ends_at, token_version (for refresh-token revocation) |
| `milestones` | 1 | Appraisal-booked / listing-won events per agent, used for progress tracking |
| `outreach_targets` | 1 | Vinuth's self-outreach campaign targets (agents to pitch PropOS to) — status flow new→contacted→replied→demo_booked→won |
| `outreach_drafts` | 1 | Draft replies awaiting approval for the outreach_targets campaign |
| `shortcut_devices` | 1 | Registered iPhones running the iOS Shortcut relay, keyed by device_id |
| `agent_state` | 1 | Generic per-agent key/value JSON blob store (agent_id, key) → value |
| `shortcut_queue` | 1 | Pending outbound messages queued for an iOS Shortcut device to poll and send |
| `prompt_versions` | 5a | Versioned prompt text per context, for the prompt-optimisation medallion pipeline |
| `prompt_evaluations` | 5a | Signals (approved/rejected/edited/replied/demo_booked) against a prompt_version, weighted |
| `pitches` | 5c | Price-update / digital-intro / listing-proposal / appraisal / vendor-report / buyer-brief documents, shared via `/p/:slug`, with view tracking and acceptance fields |
| `vendor_reports` | 5c | Weekly vendor report documents linked to a pitch |
| `system_kv` | 6 | Generic system key/value store (e.g. Gmail inbound watermark) |
| `voice_profiles` | 8 | Calibrated per-voice writing-style profile (confidence, samples_analysed) for the SMS agent |
| `sms_contacts` | 8 | Conversational SMS agent's contact list — relationship type, stage (1-4), personalisation JSON, status, auto_reply flag, assigned_agent_id for multi-agent demos |
| `sms_agent_drafts` | 8 | Drafted SMS agent replies awaiting approval, with reasoning + voice_confidence + auto_send flag |
| `voice_signals` | 8 | Approve/edit/reject signals on drafts, feeding voice-profile calibration |
| `calendar_slots` | 8 | Proposed/accepted/declined meeting times negotiated by the SMS agent |
| `processed_message_guids` | 8 | Inbound-message idempotency table — GUID as primary key (see invariant g) |
| `app_settings` | 8 | Runtime key/value override store — see §3 DB-wins-over-env pattern |
| `sold_properties` | 8 | Scraped sold-listing records (suburb, price, land size, agent/agency), unique on (address, sold_date) |
| `document_sessions` | 9 | Per-viewer engagement session for a pitch/document (VendorOS/BuyerOS document intelligence): time-on-page, scroll depth, sections viewed, computed lead_score_delta |
| `document_events` | 9 | Fine-grained event log within a document_session (event_type, section_id, arbitrary data) |
| `agent_portfolios` | 10 | Per-agent demo property listings (address, price, beds/baths, status) for multi-agent demo provisioning |
| `agent_property_slm` | 10 | Small-language-model Q&A JSON blob per portfolio property, scoped to an agent |

Two views are also created (not tables): `v_outreach_funnel` (Phase 5b, funnel counts + reply-rate % over `outreach_targets`) and `v_prompt_performance` (Phase 5b, aggregate eval stats per prompt_version), plus `v_pitch_views` (Phase 5c, per-agent pitch view counts). Views recompute on every query — there is no manual REFRESH step.

This is a substantially larger census than a first-pass read of the code might suggest: **28 tables**, not roughly a dozen. If you are adding a new table, follow the same phase-comment convention (`// ── Phase N: <name> ──`) and append your `CREATE TABLE IF NOT EXISTS` + any `ALTER` steps at the end of the array, not interleaved — the array is read top-to-bottom in order and later phases sometimes reference earlier tables via `REFERENCES`.

---

## 5. Frontend contract

- **`src/App.tsx`** (244 lines) is the router and login gate in one file. There is no separate router library — view switching is a `useState<ViewId>` plus conditional JSX (`{view === "demo" && <DemoView .../>}` etc, lines 230-237). Two special early-return paths bypass the login gate entirely: `APP_PITCH_SLUG` (URL matches `/p/:slug`, renders the standalone unauthenticated `PitchView`) and the normal `!loggedIn` path (renders `AgentLogin`). Product mode (`PropOS` / `BuyerOS` / `VendorOS`) is detected from a `?product=` query param or a `#buyer`/`#vendor` hash (`detectProductMode()`, lines 64-75), independent of login.
- **`src/data.ts`** (1098 lines) is the single data-plus-theme store: `C` (base color/spacing tokens, line 7), `AGENCY_THEMES` (per-agency theme map, line 98), `DEFAULT_THEME` (line 132), `DEFAULT_AGENT` (line 417), plus `DARK_CSS_VARS`/`LIGHT_CSS_VARS` and helper functions (`themeTextAccent`, `themeLightVarOverrides`) that App.tsx consumes directly.
- **Views inventory** (`src/views/`, one line each; all lazy-loaded in App.tsx except where noted):
  | View | Role |
  |---|---|
  | `AgentLogin.tsx` | Pre-auth login/demo-selection screen; only non-lazy-loaded view path besides PitchView |
  | `DemoView.tsx` | Main buyer/vendor demo experience — the default `view` state |
  | `SettingsView.tsx` | Agent + vendor display settings |
  | `PrincipalView.tsx` | Office-level dashboard; principals land here on login instead of DemoView |
  | `PitchView.tsx` | Standalone public pitch renderer for `/p/:slug` links, bypasses login entirely |
  | `VendorOutreachView.tsx` | B2B campaign view — **this is CampaignView's actual name in code**; per institutional rule this is B2B-only (Vinuth pitching agents), never routed to agent-facing tabs |
  | `VoiceAgentView.tsx` | SMS/voice agent conversation + draft-approval UI |
  | `DocInsightsView.tsx` | Document-intelligence dashboard reading `document_sessions`/`document_events` |
  | `demo/` (directory) | Supporting components/data for DemoView, not a standalone view |
- **DB-wins-over-hardcode pattern**: agent demo data (branding, portfolio properties, SLM Q&A) is seeded into `agents`, `agent_portfolios`, and `agent_property_slm` per §4. Where a DB row exists for the logged-in agent, it is preferred over any hardcoded default in `data.ts` (e.g. `DEFAULT_AGENT`) — this is what lets `provision-agent-demo` spin up a distinct branded demo per prospect without touching frontend code. Verify the exact fetch-and-merge logic for any specific field before assuming this holds universally; it is a pattern observed across the agent-demo provisioning flow, not a single centralized function.

---

## 6. Known-weak points, stated plainly

Each item below is real and current as of 2026-07-05. None of these are hypothetical risks — they are present-tense facts about the repo.

- **[OPEN] No test runner.** `src/__tests__/smoke.test.ts` and `src/__tests__/slm.test.ts` exist on disk but neither vitest nor jest appears in any package.json (root or server/), and there is no `test` script anywhere. These files cannot currently run. The real validation regime today is `npx tsc --noEmit` (both tsconfig projects, per §3's dual-gate point) plus manual screenshot verification plus hitting `/api/health`. Full detail in propos-validation-and-qa.
- **[OPEN INCIDENT] Production database:false.** `GET https://addvantageadvisory.fly.dev/api/health` was observed returning `{"ok":true,"database":false}` on 2026-07-05. CLAUDE.md's own verification protocol (line 184) requires `database:true`. Root cause not diagnosed at time of writing — candidates are a missing/rotated `DATABASE_URL` Fly secret or a paused Supabase project. Triage steps live in propos-debugging-playbook; full incident narrative in propos-failure-archaeology.
- **[OPEN] `.github/workflows/deploy.yml` deploys to a dead Cloudflare Pages project.** Line 30: `wrangler pages deploy dist --project-name=propos-demo --branch=main --commit-dirty=true`. The real, currently-live project is `openhome-engine` (confirmed by manual deploy history and by the fact that `propos.addvantage.site` and `openhome-engine.pages.dev` serve the identical bundle hash while `propos-demo.pages.dev` does not). CI reports green on every push to main while deploying to a project nobody looks at — a green check tells you nothing about whether the real site changed. Full detail in propos-run-and-operate.
- **[OPEN] Stale Railway artifacts.** `server/railway.toml`, `server/Procfile`, and root `nixpacks.toml` are all still present on disk. Railway is banned as a hosting target (Fly.io only, founder decision) — these three files are dead weight from before that decision and should be treated as non-functional, not as an alternate deploy path.
- **[OPEN] Broken local Stop hook.** `.claude/settings.json` registers a Stop hook: `bash /home/user/PropOS/.claude/hooks/session-review.sh` — a Linux path from a remote session. On this Mac that path does not exist, so the hook silently fails and SESSION_LESSONS auto-append never fires locally. If you're relying on this hook to capture session lessons, it isn't running; capture them manually.
- **[OPEN] Local dist is ahead of live.** Local `dist/assets/` contains `index-DLpKR__S.js` (confirmed present on disk 2026-07-05); the brief's live-state fact pack records the live site serving `index-DIv1vodj.js` at the same date. There is an undeployed local build sitting in the working tree — don't assume "the code in dist/ is what's live" without checking the live bundle hash first.
- **[OPEN] `server/index.ts` is 520 lines and accreting.** Every new route, transport, or scheduler so far has been added as another import + another `app.use(...)` line in this one file (56 route imports, 7+ transport-library imports, 8 scheduler/monitor imports, all visible at the top of the file). There is no router-splitting or module boundary being enforced. This is not yet broken, but it is the direction of travel — expect this file to keep growing until something forces a split.

---

## 7. When NOT to use this skill

- **You want to actually run, deploy, or operate PropOS** (start the dev server, deploy to Fly/Pages, read logs, understand what the cron jobs do at runtime) → use **propos-run-and-operate**. This skill explains *why* fly.toml and route order are shaped the way they are; that skill explains *how* to work the machine day to day.
- **You want to know why a past decision changed, or the story behind an incident** (why templates replaced the LLM pipeline in detail, why the OpenAI key rotated, why deploy.yml points at the wrong project) → use **propos-failure-archaeology** for the chronicle. This skill states the resulting invariant/decision as it stands today; that skill has the timeline and root-cause narrative.
- **You want the env var / feature-flag catalog** (what `SMS_TRANSPORT_CHAIN` values are valid, what `app_settings` keys exist, defaults, prod-vs-experimental status) → use **propos-config-and-flags**. This skill states that DB-overrides-env is the *pattern*; that skill has the full per-flag table.
- **You want approval rules, the never-touch list, or the no-autofire rule in full** → use **propos-change-control**. This skill cites invariant (e) and the transport/authenticity rationale; the actual approval matrix and incident-backed rules live there.
- **You're debugging a specific symptom** (health check failing, SMS not sending, migration step failing) → use **propos-debugging-playbook** for the symptom-to-triage table. This skill tells you what should be true; that skill tells you what to check when it isn't.

---

## Provenance and maintenance

Every fact above was verified against source on 2026-07-05. Re-run these before trusting this file again, especially after any refactor of server/index.ts or db.ts:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"

# Route-order invariant (a): confirm health + public routers still precede the auth gate
grep -n '"/api/health"\|requireAuth(req, res, next)\|app.use("/api/auth"' server/index.ts

# Migration step count (b): re-count precisely, don't eyeball the array
node --input-type=module -e '
import fs from "fs";
const src = fs.readFileSync("server/lib/db.ts", "utf8");
const m = src.match(/const steps: Array<\[string, string\]> = (\[[\s\S]*?\n  \])\n/);
console.log("steps.length =", eval(m[1]).length);
'

# fly.toml invariant (c): confirm the two flags are still paired
grep -n 'auto_stop_machines\|min_machines_running' fly.toml

# functions/ proxy still forwards to the current Fly origin
grep -n 'FLY_ORIGIN' functions/api/\[\[path\]\].ts

# Deploy-target drift (known-weak-point): re-check which project CI actually targets
grep -n 'project-name' .github/workflows/deploy.yml

# Dead Railway artifacts still present (or finally removed)
ls server/railway.toml server/Procfile nixpacks.toml 2>&1

# Stop hook path (still broken on this machine or fixed)
cat .claude/settings.json

# Table census (§4): re-list every CREATE TABLE to catch additions
grep -n 'CREATE TABLE IF NOT EXISTS' server/lib/db.ts

# JWT TTLs (invariant i): confirm access/refresh lifetimes haven't changed
grep -n 'ACCESS_TTL\|REFRESH_TTL' server/lib/auth.ts

# Root tsconfig still frontend-only
grep -n '"include"' tsconfig.json

# f0d914b still describes the current generate/nurture architecture
git show --stat f0d914b | head -5
```

If any of these disagree with this file, update this file via change control (see propos-change-control) rather than silently trusting the old text.
