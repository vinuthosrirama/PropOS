---
name: propos-debugging-playbook
description: "Triage table for every known PropOS failure mode: symptom, likely cause, discriminating check, fix. Use when something is broken and you don't yet know why. Triggers: 'error 1033', 'BlueBubbles not sending', 'database:false', 'health check failing', '401 error', 'endpoint returns 401', 'nothing arrives after send', 'duplicate messages', 'device_id required', 'env var is undefined', 'server crashes on start', 'JSON error in the UI', 'text is invisible', 'site looks stale after deploy', 'migration failed', 'launchd service not working', 'why is this broken', 'debug PropOS'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Debugging Playbook

This skill is a **symptom-first triage table**. Find your symptom in section 1, run the discriminating check, apply the fix. Section 2 covers the one **[OPEN INCIDENT]** in detail. Section 3 resolves lookalike causes. Section 4 is the doctor script.

Jargon, defined once:
- **BlueBubbles (BB)**: a macOS server app that sends iMessage/SMS from the founder's real Apple ID via HTTP API, normally on `localhost:1234`.
- **cloudflared**: Cloudflare's tunnel daemon. Exposes `localhost:1234` (BB) to the internet at `bluebubbles.addvantage.site` without opening a router port.
- **Fly.io**: the host for the Express backend, app `addvantageadvisory`, region `syd`.
- **launchd / LaunchAgent**: macOS's service manager. PropOS runs cloudflared and the BB watchdog as user-space LaunchAgents (`~/Library/LaunchAgents/`).

---

## 1. Symptom, cause, check, fix

| Symptom | Likely cause | Discriminating check | Fix |
|---|---|---|---|
| `curl` to `bluebubbles.addvantage.site` returns **error 1033** | cloudflared tunnel daemon is not running, so Cloudflare's edge can't reach the origin | `curl -s 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!'` returns 1033, but `curl -s 'http://localhost:1234/api/v1/ping?password=Aneesha123!'` returns `{"status":200,...}` | Restart the LaunchAgent: `launchctl unload ~/Library/LaunchAgents/site.addvantage.cloudflared.plist && launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist`. **Never debug BlueBubbles first.** 1033 is a tunnel-layer error, BB is very likely fine (docs/OPS_RUNBOOK.md gotcha #4). |
| `GET /api/health` returns `{"ok":true,"database":false}` | [OPEN INCIDENT], see section 2 | see section 2 | see section 2 |
| New endpoint you just added returns **401 Unauthorized** to every caller, including ones that should be public | Router mounted after the `requireAuth` gate in `server/index.ts` (the gate at line ~225 wraps everything mounted below it whenever `DATABASE_URL` is set) | `grep -n "app.use(\"/api\"" server/index.ts` to find the gate at line ~225 (`app.use("/api", (req,res,next)=>{...requireAuth...})`). Is your `app.use("/api/your-route", ...)` line above or below it? | Move the route registration above the gate (into the "Public routes" block, server/index.ts lines ~179 to 206) if it must be unauthenticated, or leave it below (it already is protected) if auth is intended. See propos-architecture-contract for the full route-order invariant. |
| Locally, **every** `/api/*` call 404s even though the server logs show it started fine | You ran `npm run preview` or `vite preview` instead of `npm run dev`. `vite preview` serves the built `dist/` as static files only, with no proxy config, so `/api/*` requests never reach the Express server on :3001 | `curl -sI http://localhost:4173/api/health` (preview's default port). A 404 with no JSON body confirms it; the dev server's `vite.config.ts` proxy block (`server.proxy["/api"]` to `http://localhost:3001`) is what's missing | Use `npm run dev` (Vite dev server on :3003, proxies `/api` to :3001 per `vite.config.ts`). Run `npm run server` (or `cd server && npm run dev`) alongside it so :3001 is actually listening. |
| A send "succeeds" (200 response, no thrown error) but the recipient never gets anything | Either (a) BlueBubbles/tunnel is down and a fallback transport silently absorbed it, or (b) `TEST_RECIPIENT_PHONE`/`TEST_RECIPIENT_EMAIL` is set and the message went to the test number instead of the real one | Read the JSON response body. `sendSMS()` returns `{ transport, fallback, attempts }` (server/lib/sms.ts): check which transport actually claims success, and whether `fallback:true`. Then check `GET /api/health` (authed): `testMode:true` means a `TEST_RECIPIENT_*` redirect is active. | If `fallback:true` and the working transport is `shortcut-relay`, BlueBubbles/tunnel is down; fix that chain link (see the 1033 row above) so future sends use the intended primary. If `testMode:true`, that is by design (see "TEST_RECIPIENT redirect" in propos-change-control); clear `TEST_RECIPIENT_PHONE`/`TEST_RECIPIENT_EMAIL` only with founder approval, since it is also the safety net that stops real sends during dev. |
| The same inbound reply gets processed twice, sometimes producing two outbound replies | BlueBubbles' webhook fanout is delivering the same event to more than one registered endpoint (for example both a local dev server and the Fly.io prod server are registered, and both share one Supabase DB) | `grep -n "claimMessageGuid" server/index.ts server/lib/messageDedup.ts` to confirm `handleIncomingReply()` (server/index.ts around line 260) calls `claimMessageGuid(guid)` before doing any work, and check Fly logs or local console for two `[reply-handler]` log lines with the same guid | This is already handled. `claimMessageGuid()` (server/lib/messageDedup.ts) does `INSERT INTO processed_message_guids (guid) VALUES ($1) ON CONFLICT DO NOTHING RETURNING guid`; the second caller gets zero rows back and skips. If you still see duplicates, check whether both processes have `DATABASE_URL` set to the **same** database (dedup only works cross-process because they share one DB). If either process has no DB, dedup silently becomes a no-op (`claimMessageGuid` returns `true` unconditionally when `!isDbConnected()`). |
| An iOS Shortcut Relay call returns **`{"error":"device_id required"}`** | Request sent `deviceId` (camelCase) instead of `device_id` (snake_case) | `grep -n "device_id" server/routes/sms-shortcut.ts`: every shortcut-relay endpoint destructures `device_id`, never `deviceId` | Rename the field to `device_id` in the request body or query string. This is a project-wide convention, not just this route: check the target route's own `req.body`/`req.query` destructure before writing any curl example against `/api/*`. |
| `process.env.SOME_VAR` reads as `undefined` in a module, even though it is correctly set in `.env` | ESM import hoisting: the module's top-level code (including any `const X = process.env.SOME_VAR`) runs **before** `dotenv.config()` executes in `server/index.ts`, because ES module imports are hoisted and evaluated in dependency order at load time | Find the offending line. Is it a **module-level `const`** (`const alertTo = process.env.X`) rather than a function that reads `process.env.X` when called? `server/lib/transportHealthMonitor.ts` lines 17 to 19 show the fix pattern in a comment: "Read lazily (not at module-eval time)". | Convert the module-level constant into a function that reads `process.env.X` on every call, and call that function at use-time, not at import-time. This is the same class of bug across the codebase; grep `process\.env\.` at file-scope (outside any function body) in any file you're editing. |
| Server crashes immediately on boot with an SDK constructor error (`OpenAI(...)`/`Anthropic(...)` threw) | An API client was constructed **at module import time** with an empty API key, and the SDK's constructor throws on missing/invalid key rather than deferring the error to first call | `grep -n "new OpenAI\|new Anthropic" server/lib/*.ts`. The working pattern lives in `server/lib/openai.ts:9` and `server/lib/claude.ts:10`: `if (!_openai) _openai = new OpenAI({ apiKey: ... })` inside a getter function, never at top level | Wrap any new API client construction in a lazy getter (`let _client; function getClient(){ if(!_client) _client = new Client(...); return _client }`) so the server can boot and serve `/api/health` even when that one key is missing. |
| The UI shows a raw JSON blob or `{"error": ...}` banner where a normal screen should be | A background `useEffect` data loader's `.catch()` writes the error into user-visible state (for example `setActionMsg`) instead of failing silently | `grep -n "\.catch(e =>" src/views/*.tsx src/components/*.tsx`. Any catch clause on an on-mount/interval loader that touches `setActionMsg`, `setError`, or similar user-visible state is the bug; user-triggered click handlers are allowed to do this, background loaders are not | Change the catch to `.catch(() => { /* non-fatal */ })` for any loader that runs on mount or on an interval. Stale/cached data staying on screen is the correct behaviour; only a user-triggered action (a button click) may surface an error banner (docs/OPS_RUNBOOK.md gotcha #7). |
| Some label or heading text is unreadable (near-invisible) on the dark theme, fine on light | `theme.primary` (`rgb(59,31,119)`, Peake dark purple) used directly as a text color; it has roughly 1:1 contrast against the dark background token `--c-bg2: #2c1b59` | `grep -n "color: theme.primary\|color: withAlpha(theme.primary" src/**/*.tsx` on the affected component | Use `C.muted` for labels/eyebrows/section headers, `C.text` for body text and prices, and hardcoded `#fff` for button text on a colored background (never `theme.primary` or `#0a0f1a`). See docs/OPS_RUNBOOK.md gotcha #9. |
| A logged-in session suddenly gets 401s on every request mid-use | Access token (JWT) expired. Access tokens are 15 minutes (`server/lib/auth.ts`, `ACCESS_TTL = 15 * 60`), refresh tokens are 7 days in an httpOnly cookie | Decode the bearer token's `exp` claim, or just check whether the session has been open more than 15 minutes since last refresh | The client should call the refresh endpoint (`/api/auth/refresh`, cookie-based) to mint a new access token before this happens. If you're writing a smoke-test script (for example the sms-agent smoke script), build in an auto-relogin/refresh step rather than assuming a 15-minute session is enough. |
| `propos.addvantage.site` doesn't show a change you just "deployed" | Almost certainly the wrong-Pages-project trap. `.github/workflows/deploy.yml` line 34 deploys to `--project-name=propos-demo` on every push to main and reports green, but the live domain is CNAMEd to a **different** Pages project, `openhome-engine`. CI green does not mean the live site changed. | Bundle-hash comparison: `curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` vs `ls dist/assets/ \| grep -o 'index-[A-Za-z0-9_-]*\.js'`. If they differ, local build is ahead of live (verified 2026-07-05: live serves `index-DIv1vodj.js`, local `dist/` had `index-DLpKR__S.js`) | Deploy manually: `npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true` (from repo root, after `npm run build`). Full detail and the CI-fix status live in **propos-run-and-operate**; do not duplicate that treatment here. |
| Server logs show `[migrate] FAIL <label>: <error>` for one step but the server still boots | Per-step migration design. Each schema step runs in its own `pool.query()` call (`server/lib/db.ts`, `migrate()` function, lines ~73 onward) specifically so one failing statement never blocks the others from running | `flyctl logs --app addvantageadvisory \| grep migrate` or local console output. Count `[migrate] OK` vs `[migrate] FAIL` lines against the total step count (`server/lib/db.ts` logs `X/Y step(s) failed` as a summary) | Read the specific `FAIL` line's error message, fix that one SQL statement (common cause: a column already exists without `IF NOT EXISTS`, or a `CREATE TABLE IF NOT EXISTS` that silently skips a needed `ALTER TABLE ... ADD COLUMN` on an existing table), and re-run `initDb()` (restart the server). Already-succeeded steps are idempotent (`IF NOT EXISTS` / `ON CONFLICT`) so re-running is safe. |
| Locally, writes (contacts, opt-outs, conversations) appear to succeed but nothing persists across a restart | This is intentional, not a bug. With no `DATABASE_URL` set, `initDb()` (`server/lib/db.ts`) logs `Database: not configured (in-memory mode)` and every table-backed function checks `isDbConnected()` before touching Postgres, falling back to an in-memory/no-op path | `grep -n "isDbConnected" server/lib/*.ts \| wc -l`. Many call sites guard on this; check the server boot log for the literal line `Database: not configured (in-memory mode)` | Set `DATABASE_URL` in `server/.env` (local Supabase or a dev Postgres) if you need persistence for the session you're testing. Do not "fix" the no-op guards themselves; they exist so the demo runs without a DB. |
| A bash command with a literal `!` in it (a password, a URL) hangs, errors, or corrupts the string | Bash history expansion triggers on `!` inside double-quoted strings | Does the failing command have `"...!..."` (double quotes) anywhere? | Single-quote it instead: `curl 'https://...?password=Aneesha123!'`. Never double-quote a string containing `!`, backtick, `$`, or `\` in an interactive shell (docs/OPS_RUNBOOK.md gotcha #1). |
| A LaunchAgent shows as loaded (`launchctl list` finds it) but its actual effect never happens | Either (a) it was installed as a **system LaunchDaemon** (`/Library/LaunchDaemons/`, runs as root) instead of a **user LaunchAgent** (`~/Library/LaunchAgents/`), so any `~` path inside its script resolves to `/var/root/` instead of `/Users/vinuthmacbook/` and silently finds nothing; or (b) the plist references a stale/placeholder path | `launchctl list \| grep addvantage` (user-level, should be non-empty) vs `sudo launchctl list \| grep addvantage` (system-level, should be **empty** for our services). Also check the plist's literal paths for `<TUNNEL_ID>` placeholders or `/home/user/...` Linux paths | Always install PropOS services under `~/Library/LaunchAgents/`, never `/Library/LaunchDaemons/`. Reinstall with the exact plist content in docs/OPS_RUNBOOK.md ("Setting Up the Named Cloudflared Tunnel from Scratch"). |
| A Cloudflare Pages secret was set (`wrangler pages secret put`) but the function it feeds still 403s / behaves as if unset | `wrangler pages secret put` only updates the secret store. It does **not** re-inject the secret into the currently-active deployment | Did a deploy happen strictly after the `secret put` command? If the most recent deploy predates the secret change, that's the cause. | Run a deploy (even a no-op one) after setting the secret: `npx wrangler pages deploy dist --project-name <project> --commit-dirty=true`, then re-test. Learned the hard way via the `OAUTH_STATE_SECRET` 403 mystery, 2026-07-02. |

---

## 2. [OPEN INCIDENT] `database:false` on production health check

**Symptom** (verified 2026-07-05): `GET https://addvantageadvisory.fly.dev/api/health` returns `{"ok":true,"database":false}`. The repo's own verification protocol (CLAUDE.md, "Post-deploy verification via Chrome CLI") requires `database:true`.

This is currently **unsolved**. Root cause is not yet diagnosed. Do not assume any of the candidates below without running its check.

Diagnosis tree, in the order to try:

1. **Is `DATABASE_URL` even set on Fly?**
   ```bash
   flyctl secrets list --app addvantageadvisory
   ```
   Look for `DATABASE_URL` in the name list (values are never shown by this command). If it's missing, that alone explains `database:false`: `initDb()` (server/lib/db.ts) logs `not configured` and returns early, no connection is ever attempted.

2. **If `DATABASE_URL` is set, is the Supabase project paused?** Supabase free-tier projects auto-pause after a period of inactivity. Check the Supabase dashboard for project `pzdcwulzteofvatjrtlh`. A paused project refuses new connections, which `initDb()`'s try/catch logs as `Database: connection failed, falling back to in-memory` with the underlying Postgres error message.

3. **If neither of the above, has the connection string rotated or expired?** Supabase occasionally rotates the pooler connection string. Compare the `DATABASE_URL` secret against the current connection string shown in the Supabase dashboard (Project Settings, Database).

4. **Read the actual Fly logs for the real error, rather than guessing further:**
   ```bash
   flyctl logs --app addvantageadvisory
   ```
   Find the line right after `Database:` at boot. It's either `connected (PostgreSQL)`, `not configured (in-memory mode)`, or `connection failed, falling back to in-memory <error message>`. The error message (if present) tells you which of the three candidates above is real.

**Any fix here (rotating `DATABASE_URL`, unpausing Supabase, `flyctl secrets set`) needs founder approval before you act.** It touches production secrets/infra. See propos-change-control for the approval matrix. Do the read-only diagnosis (steps 1 and 4 above, and `doctor.sh` in this skill) without asking; stop and ask before any `flyctl secrets set` or Supabase dashboard mutation.

This incident is also tracked as [OPEN] in **propos-failure-archaeology**. If you resolve it, update both that entry's status and this section.

---

## 3. Discriminating experiments: telling lookalike causes apart

Several symptoms above look identical from the outside. Run these specific experiments to tell them apart rather than guessing.

**Tunnel-down vs BlueBubbles-down** (both look like "SMS isn't sending"):
```bash
curl -s 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!'   # via tunnel
curl -s 'http://localhost:1234/api/v1/ping?password=Aneesha123!'                # direct, bypasses tunnel
```
- Both fail: BlueBubbles itself is down (open the BB app on the Mac).
- Tunnel fails, direct succeeds: the tunnel daemon is down (restart the cloudflared LaunchAgent). This is the far more common case. **Check the tunnel first.**

**"Send succeeded" but recipient got nothing, vs test-mode redirect** (both look like "message vanished"):
```bash
curl -H "Authorization: Bearer <token>" https://propos.addvantage.site/api/health
```
Read `testMode` in the authed response. `true` means every send is being redirected to `TEST_RECIPIENT_PHONE`/`TEST_RECIPIENT_EMAIL` by design; that's not a bug, it's the safety net. Only chase transport failures if `testMode` is `false`.

**"database:false is a secret problem" vs "database:false is a Supabase problem"** (both produce the identical health-check symptom):
```bash
flyctl secrets list --app addvantageadvisory   # names only, confirms DATABASE_URL exists or not
flyctl logs --app addvantageadvisory           # the actual connection error, if a secret exists but fails
```
`secrets list` tells you if the variable exists at all; `logs` tells you why the connection using it failed. Do not stop at "the secret exists": a rotated/expired connection string still produces `database:false` with a secret present.

**Deploy "worked" (CI green) vs deploy actually reached the live site** (both look identical if you only check CI):
```bash
curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
ls "dist/assets/" | grep -o 'index-[A-Za-z0-9_-]*\.js'
```
If the hashes differ, CI green was not sufficient. `.github/workflows/deploy.yml` targets a dead project (`propos-demo`). Full remediation detail belongs to **propos-run-and-operate**; this skill only teaches you to notice the drift.

**Local /api/* 404s: vite preview vs server not running** (both 404, different fix):
```bash
lsof -iTCP:3001 -sTCP:LISTEN   # is the Express server actually listening?
```
If nothing is listening on :3001, the fix is `npm run server` (or `cd server && npm run dev`), not a vite config change. If something IS listening on :3001 but you're still 404ing, check which vite command you ran: `preview` has no proxy, `dev` does.

---

## 4. doctor.sh: read-only health sweep

`scripts/doctor.sh` in this skill directory runs every check above in one pass, PASS/FAIL per line, and **mutates nothing**: no sends, no LLM calls, no deploys, no secret writes, no git writes. Safe to run any time, by anyone, including a zero-context session on their first minute in the repo.

```bash
bash "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/.claude/skills/propos-debugging-playbook/scripts/doctor.sh"
```

It checks, in order: TypeScript (root + server, report-only), git working-tree status, local-vs-live bundle hash, Fly `/api/health`, the BlueBubbles tunnel ping, launchd service presence, and `.env` file presence (never values). Read the script's own header comment for the full list before running it in an unfamiliar environment.

---

## When NOT to use this skill

- **You want the story behind an incident**: what broke, root cause investigation, evidence, current status of past failures. Use **propos-failure-archaeology** instead. This skill only gives you the fix; that one gives you the history.
- **You're doing a deploy, or need the deploy anatomy, CI reality, or service inventory in full.** Use **propos-run-and-operate**. This skill cross-references deploy-drift only far enough to diagnose it; the full deploy sequence, dead-CI-target remediation, and service inventory live there.
- **You want to know why the system is built this way** (route-order invariant, transport-chain design, per-step migration rationale, fly `auto_stop` rationale). Use **propos-architecture-contract**. This skill tells you how to detect a violation of an invariant; that one tells you why the invariant exists.
- **You need the env var catalog** (every variable, its default, prod vs experimental). Use **propos-config-and-flags**.
- **You need the approval matrix** for who can do what without asking. Use **propos-change-control**.

---

## Provenance and maintenance

Every fact in this file was verified against the repo on 2026-07-05. Re-verify with these commands before trusting a claim that may have drifted:

```bash
# Route-order gate line number
grep -n 'app.use("/api",' server/index.ts

# server/lib/twilio.ts does not exist (CLAUDE.md "Key Files" is stale on this point)
ls server/lib/twilio.ts 2>&1   # expect: No such file or directory

# Lazy-init pattern still in place
grep -n "new OpenAI\|new Anthropic" server/lib/openai.ts server/lib/claude.ts

# Access token TTL
grep -n "ACCESS_TTL" server/lib/auth.ts

# Dedup mechanism
grep -n "claimMessageGuid\|processed_message_guids" server/lib/messageDedup.ts

# Deploy CI still targets the dead project (re-check before assuming it's fixed)
grep -n "project-name" .github/workflows/deploy.yml

# device_id snake_case convention
grep -n "device_id" server/routes/sms-shortcut.ts

# theme.primary contrast rule still documented
grep -n "theme.primary" docs/OPS_RUNBOOK.md

# Stop hook path (broken locally as of 2026-07-05, check if it's since been fixed)
cat .claude/settings.json
```

If any command's output contradicts this file, treat the live repo as truth and update this SKILL.md via normal change control, not silently.
