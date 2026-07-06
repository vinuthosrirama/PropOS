---
name: propos-run-and-operate
description: "Run and deploy anatomy for PropOS: what serves propos.addvantage.site right now, the environment/deploy matrix, the release sequence, the local macOS services (cloudflared tunnel, BB watchdog), the scheduled cron inventory, logs, and artifact conventions. Load this BEFORE deploying anything, before touching a LaunchAgent or the cloudflared tunnel, before reasoning about what a cron job does or when it runs, or when asked 'is the site actually updated', 'why is CI green but nothing changed', 'what deploys where', 'restart the tunnel', 'what runs on a schedule'. Triggers: 'deploy this', 'is it live', 'push to production', 'what project does this deploy to', 'restart cloudflared', 'restart the watchdog', 'is the tunnel down', 'error 1033', 'what crons are running', 'check the logs', 'flyctl logs', 'what deployed on the last push', 'bundle hash', 'post-deploy verification'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Run and Operate

This skill is the map of what actually runs, where it runs, and how to deploy and verify it. It owns deploy truth: the gap between what CI claims and what is actually live. Read the deploy-truth box before touching any deploy command.

Repo root: `/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS`. All relative paths below are from this root.

For approval rules (what you may do unasked vs. what needs the founder), see **propos-change-control**. This skill assumes you already know the answer to "am I allowed to do this" and tells you how to do it and how to confirm it worked.

---

## DEPLOY TRUTH (read this first)

**(verified 2026-07-05)**

- `propos.addvantage.site` is served by the Cloudflare Pages project **`openhome-engine`** (custom domain CNAMEs to `openhome-engine.pages.dev`). Confirmed by bundle-hash match: the live site and `openhome-engine.pages.dev` both serve `index-DIv1vodj.js`.
- `.github/workflows/deploy.yml` runs `wrangler pages deploy dist --project-name=propos-demo --branch=main --commit-dirty=true` on every push to `main` (verified `.github/workflows/deploy.yml:34`). **`propos-demo` serves nothing that reaches `propos.addvantage.site`.** It is a dead project as far as the live domain is concerned.
- **CI green does not mean the site updated.** A merged PR with a green "Deploy to Cloudflare Pages" check has deployed to the wrong project. Never treat that checkmark as proof of a live change.
- Real frontend deploys are **manual**: `npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true`, run by hand from the repo root after a local build.
- Backend (Fly.io app `addvantageadvisory`) **never** deploys from git. There is no backend deploy workflow. `flyctl deploy` is the only path, and it is manual, ask-first (see propos-change-control).
- **Open incident**: `GET https://addvantageadvisory.fly.dev/api/health` currently returns `{"ok":true,"database":false}`. CLAUDE.md's own post-deploy verification step (CLAUDE.md line 184) expects `database:true`. Root cause not diagnosed as of this date: candidates are a missing/rotated `DATABASE_URL` Fly secret or a paused Supabase project. Full triage lives in **propos-debugging-playbook**; tracked as [OPEN] in **propos-failure-archaeology**. Do not report a deploy as "fully verified" while this is red, say so explicitly.
- **Fixing `deploy.yml` requires founder approval** (it is a CI/workflow change under change control). Until fixed, treat the workflow as a no-op for the live domain and always fall back to the manual wrangler command below.
- History, for context: a 2026-06-11 session deployed to the wrong project by hand; a 2026-06-19 session corrected `CLAUDE.md`'s stated project name to `openhome-engine` (confirmed against real deploy output); `deploy.yml` itself was never touched and still targets `propos-demo`. This is why the doc and the workflow now disagree, and why this skill exists.

---

## Environment / deploy matrix

| Layer | Project / app | Deploy command | Verify command | Approval needed |
|---|---|---|---|---|
| Frontend, production | Cloudflare Pages `openhome-engine` → `propos.addvantage.site` | `npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true` | `curl -s https://propos.addvantage.site/ \| grep -o 'index-[A-Za-z0-9_-]*\.js'` then compare to `dist/index.html` | **Ask first** (production deploy) |
| Frontend, preview | Cloudflare Pages `openhome-engine`, non-production branch | `npx wrangler pages deploy dist --project-name openhome-engine --branch=<preview-name> --commit-dirty=true` | Deploy output prints a URL of the form `https://<hash>.openhome-engine.pages.dev`; curl that URL | **Allowed autonomously** per the founder's autonomy matrix (preview branch deploys, local builds, tsc, read-only health checks and screenshots do not require asking). Command form verified against CLAUDE.md's canonical deploy command (CLAUDE.md line 46) with `--branch=<preview-name>` added; `--branch` is a real wrangler pages deploy flag, confirm your wrangler version supports it with `npx wrangler pages deploy --help` if it errors |
| Backend | Fly.io app `addvantageadvisory` | `flyctl deploy` (from repo root) | `curl -s https://addvantageadvisory.fly.dev/api/health` then `flyctl status --app addvantageadvisory` | **Ask first** (production deploy). git push does **not** deploy this, there is no backend CI |
| Secrets, Fly | Fly.io app `addvantageadvisory` | `flyctl secrets set KEY=value --app addvantageadvisory` | `flyctl secrets list --app addvantageadvisory` (names only, not values); Fly restarts the machine on secret set, so re-run the health check after | **Ask first** (new secrets / infra change) |
| Secrets, Cloudflare Pages | Pages project `openhome-engine` | `npx wrangler pages secret put KEY --project-name openhome-engine` | See needs-redeploy rule below | **Ask first** (new secrets / infra change) |
| Source backup | GitHub `vinuthosrirama/PropOS` (`origin`) + `vinuthosrirama/PropOS-backup` (`backup`) | `git push origin main` | `git log origin/main -1` | **Ask first** (push to main) |

**Cloudflare Pages secrets require a redeploy to take effect.** `wrangler pages secret put` does not affect the currently-active deployment. Run a no-op `npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true` immediately after, then test the endpoint that depends on the secret. This was learned the hard way via an `OAUTH_STATE_SECRET` 403 that looked like a code bug but was actually a stale deployment (2026-07-02). See propos-change-control for the full rule; this is the mechanical fix.

---

## The full release sequence

Run every step, in order. Do not skip the tsc checks to save time, they are cheaper than a broken deploy.

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"

# 1. TypeScript check, frontend. MUST be zero errors.
npx tsc --noEmit

# 2. TypeScript check, server. Root-level tsc only checks the frontend, the
#    server has its own tsconfig and must be checked separately.
cd server && npx tsc --noEmit && cd ..

# 3. Build the frontend. This also patches HTML (scripts/patch-html.cjs) and
#    copies dist/ to server/public/ (see package.json "build" script).
npm run build

# 4. Verify locally before touching any remote target.
#    Full-stack local testing MUST use the dev server, not vite preview:
npm run dev
#    (vite preview has NO API proxy, every /api/* call silently 404s under
#    `npm run preview`. Use `npm run dev` for anything that hits the backend.)
```

**[ASK founder]** before continuing past this point for any production target (main push, `openhome-engine` production deploy without a preview branch, `flyctl deploy`). Preview-branch Pages deploys may proceed without asking.

```bash
# 5. Commit and push (ask first for main)
git add -A
git commit -m "type: description"
git push origin main

# 6. Deploy dist/ to Cloudflare Pages (production, ask first)
npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true

# 6b. Backend only if server/ changed (ask first)
flyctl deploy
```

### Post-deploy verification

1. **Health check.** `curl -s https://addvantageadvisory.fly.dev/api/health`. Expected shape: `{"ok":true,"database":true}`. **As of 2026-07-05 this returns `{"ok":true,"database":false}`**, do not treat that as a new regression you introduced unless you changed something DB-related; it is the standing [OPEN] incident, see propos-debugging-playbook. Report the actual JSON you got, never assume the happy path.
2. **Bundle-hash match.** Confirm the live domain served the build you just pushed, not a stale cache or the wrong project:
   ```bash
   grep -o 'index-[A-Za-z0-9_-]*\.js' dist/index.html
   curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
   ```
   The two hashes must match. If they don't, you deployed to the wrong project, the deploy hasn't propagated yet (wait ~30s and recheck), or you're reading a cached response (retry with `curl -s -H 'Cache-Control: no-cache'`).
3. **Visual verification (Chrome CLI, mandatory).** Compiling and a matching hash are not proof the UI works. Use the Chrome-based MCP tools (not desktop `computer-use`, not `open`) to:
   - Navigate to `https://propos.addvantage.site/`, screenshot the login page, confirm the health dot renders.
   - Log in, screenshot the portfolio page, confirm the nav bar and listings render.
   - Read the actual rendered DOM/screenshot, not the code, not a "should work" assumption.
   Full checklist: CLAUDE.md "Post-deploy verification via Chrome CLI" section. Never report a deploy as complete without this step; a passing hash match only proves the file transferred, not that it renders.

---

## Services and daemons

Full detail, including from-scratch setup and the complete gotcha list, lives in `docs/OPS_RUNBOOK.md`. This skill indexes it; treat `docs/OPS_RUNBOOK.md` as the source of truth for exact plist contents and one-off recovery steps.

| Service | Type / label | Config | Log |
|---|---|---|---|
| cloudflared tunnel | LaunchAgent `site.addvantage.cloudflared` | `~/.cloudflared/config.yml` | `~/Library/Logs/cloudflared-bluebubbles.log` |
| BB watchdog | LaunchAgent `site.addvantage.bbwatchdog` | `~/.addvantage/bbwatchdog.conf` | `~/Library/Logs/bbwatchdog.log` |
| BlueBubbles (BB, a macOS server app that sends iMessages from the founder's real Apple ID via HTTP API) | Mac app, port 1234 | BB app → Settings → Server | BB app's own log |

All are **user** LaunchAgents under `~/Library/LaunchAgents/`, never `/Library/LaunchDaemons/`. A system daemon runs as root, whose `~` resolves to `/var/root/`, not `/Users/vinuthmacbook/`, so it silently can't find `~/.cloudflared/config.yml`. Verify placement with `launchctl list | grep addvantage` (should show entries); `sudo launchctl list | grep addvantage` should be empty.

### Cloudflared tunnel

Tunnel name `bluebubbles`, routes `bluebubbles.addvantage.site` → `localhost:1234`.

```bash
# Start
launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# Stop
launchctl unload ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# Restart
launchctl unload ~/Library/LaunchAgents/site.addvantage.cloudflared.plist
launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist
```

**Error 1033 from the tunnel URL means the cloudflared daemon is not running** (Cloudflare can't reach it; the DNS record exists but nothing answers on our end). Restart the LaunchAgent above. Do **not** start debugging BlueBubbles or the app behind the tunnel when you see 1033, the app is very likely fine.

If the DNS route needs recreating: `cloudflared tunnel route dns --overwrite-dns bluebubbles bluebubbles.addvantage.site` (the `--overwrite-dns` flag is required if the record already exists, which it usually does).

### BB watchdog

30-second poll loop that pings BlueBubbles and restarts it after 3 consecutive failures, or on an explicit reboot command written to the `system_kv` table by the app's Voice Agent view.

```bash
# Start
launchctl load -w ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist

# Stop
launchctl unload ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist

# Re-install from scratch (after editing the plist)
launchctl unload ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist 2>/dev/null
bash scripts/install-bb-watchdog.sh
```

### Quick diagnostic sequence

The full numbered sequence is in `docs/OPS_RUNBOOK.md` ("Quick Diagnostic Sequence"). The two most-used checks:

```bash
# Is the tunnel up? (note the single quotes — the password contains `!`,
# which bash history-expands inside double quotes)
curl -s 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!'
# Expected: {"status":200,"message":"Ping received!","data":"pong"}
# Error 1033 → tunnel down, see above

# Is the watchdog running at all?
launchctl list | grep bbwatchdog
# Expect a non-empty PID column
```

If both fail, check `tail -50 ~/Library/Logs/bbwatchdog.log` and `tail -50 ~/Library/Logs/cloudflared-bluebubbles.log` next, then the full doctor script: `cd server && node scripts/bb-doctor.mjs`.

---

## Scheduled work inventory

All crons are registered from `server/index.ts` inside the startup sequence (`server/index.ts:458-470`) and run **inside the single Fly.io machine**, in-process, via `node-cron`. There is no separate worker or queue service. This is why the fly.toml invariant matters:

**`auto_stop_machines = "off"` + `min_machines_running = 1` (fly.toml:22,24) is load-bearing.** If Fly scales the machine to zero, every cron below stops running, silently, until the next request wakes it (which won't happen, since nothing is polling it). Full rationale and the failure mode this prevents: see **propos-architecture-contract**.

Verified against source, 2026-07-05 (file:line for the `cron.schedule` call):

| Job | Schedule | Registered in | Does it send or call an LLM? | Gating |
|---|---|---|---|---|
| Nurture queue tick | `*/5 * * * *` | `server/lib/scheduler.ts:194` | **Sends** SMS + email (Day 7/14/30 nurture steps); may call Claude Haiku (`generateMessageHaiku`) if `ANTHROPIC_API_KEY` set, else template fallback | Runs only if DB connected. Compliance check (`checkCompliance`) gates every send; opted-out contacts are cancelled, not sent to. No explicit "ask founder" gate at the code level, this is a standing autonomous send path, not a one-off click |
| Morning brief | `0 9 * * 1-5` (weekdays, Melbourne) | `server/lib/outreachScheduler.ts:57` | Sends a PM brief email + SMS to the founder (`sendPMBriefEmail`/`sendPMBriefSMS`); queues follow-up **drafts** (does not send to leads) | Drafts only for lead-facing follow-ups; founder-facing brief send is not gated (it goes to the founder, not a lead) |
| Outreach window | `0 10 * * 1-5` (weekdays, Melbourne) | `server/lib/outreachScheduler.ts:62` | **Sends** initial SMS/email to up to `OUTREACH_DAILY_CAP` (default 5) `outreach_targets` rows, with jitter | Hard-coded guard: refuses to run at all if `TEST_RECIPIENT_PHONE` is unset (`outreachScheduler.ts:134-138`, `⛔ outreach window BLOCKED` log line). This is the safety rail, not a founder click; while `TEST_RECIPIENT_PHONE` is set, every send is redirected to that number, not a real target |
| SMS Agent daily loop | `0 7 * * 1-5` (weekdays, Melbourne) | `server/lib/smsOrchestrator.ts:202` | Queues follow-up and opener **drafts** only ("Everything is queued as drafts for Vinuth's morning approval unless auto-send is explicitly enabled", `smsOrchestrator.ts:12-13`); does not send directly | Draft-only by design; legacy direct-promote path is off by default behind `SMS_AGENT_PROMOTE_TARGETS=true` (`smsOrchestrator.ts:33-34`) |
| SMS ready-poller | `*/2 * * * *` (Melbourne) | `server/lib/smsReadyOutreach.ts:76` | Generates and saves opener **drafts** for CRM contacts flagged `ready_to_contact`; does not send | Draft-only (`saveAgentDrafts` → pending approval queue); opt-out check runs before drafting |
| Transport health monitor | Configurable, default `*/10 * * * *` via `SMS_TRANSPORT_CHECK_CRON` | `server/lib/transportHealthMonitor.ts:66` | Sends an alert **email to the founder** on a healthy↔unhealthy state transition only (not every poll) | Email-only, founder-facing, not a lead send |
| Backend health monitor | `*/5 * * * *` | `server/lib/backendHealthMonitor.ts:61` | Sends an alert **email to the founder** on DB up↔down transition only | Email-only, founder-facing |
| Prompt optimiser, weekly | `0 2 * * 0` (Sunday, Melbourne) | **Registered twice**: `server/lib/outreachScheduler.ts:67` (calls `runOptimisationCycle("outreach_system")` only) AND `server/index.ts:467-470` (calls `runOptimisationCycle("sms_rules")` **and** `runOptimisationCycle("outreach_system")`) | **Calls OpenAI** (`runOptimisationCycle` requires `OPENAI_API_KEY`, rewrites the SMS/outreach prompt) | Gated by `OPENAI_API_KEY` presence AND a minimum of 10 new signals since the last cycle (`promptOptimiser.ts:138,143`); new version only activates if it scores higher than the current one |
| Prompt optimiser, threshold trigger | Fires inline from `recordSignal()`, not a cron | `server/lib/promptOptimiser.ts:126` (`checkThresholdTrigger`) | Same OpenAI call as above, triggered immediately once **15** new signals accumulate for a version (`RECALIBRATE_THRESHOLD`-style constant, see `promptOptimiser.ts:110`) | Same `OPENAI_API_KEY` + activation-scoring gate as the weekly job |
| Gmail reply capture | `*/5 * * * *`, only if `gmailConfigured()` | `server/lib/outreachScheduler.ts:78` | Read-only (polls inbound Gmail replies) | No send/LLM risk |

**[AUDIT FLAG]**: the weekly prompt-optimiser cron fires `runOptimisationCycle("outreach_system")` from **two independent registrations** at the same Sunday 2am Melbourne time (`outreachScheduler.ts:67` and `index.ts:467`), meaning that context can run its OpenAI rewrite cycle twice back to back on a normal Sunday. This is a real duplicate-scheduling bug, not a hypothetical, confirmed by reading both call sites. It is not currently a no-autofire violation (both call sites are cron-gated by design, not user-click-gated, and this predates the no-autofire rule) but it doubles unnecessary OpenAI spend on that context every week and should be fixed by removing one of the two registrations. Flag to the founder rather than silently deleting a registration.

**[AUDIT FLAG]**: the nurture queue tick (`scheduler.ts`) and the outreach window (`outreachScheduler.ts`) are both cron-driven, unattended send paths that do not require a founder click per send, only a standing environment gate (`TEST_RECIPIENT_PHONE` set, or DB connected + compliance pass). Whether this satisfies the no-autofire rule (paid-LLM calls only on explicit click, see propos-change-control) depends on whether "explicit user test request" is read to cover "founder configured `TEST_RECIPIENT_PHONE` once and left the cron running" versus "founder must click send every time." This skill does not resolve that ambiguity, it surfaces it. The no-autofire rule's canonical text and enforcement lives in **propos-change-control**; if you are unsure whether a given cron is compliant, ask the founder rather than assuming either reading.

---

## Logs and observability

| Source | Command / location | What it shows |
|---|---|---|
| Backend (Fly.io, production) | `flyctl logs --app addvantageadvisory` | Live server stdout/stderr, all cron job console output (each job logs its own summary line, see table above) |
| Backend (local) | Console output of `npm run dev` or `npm start` | Same log lines, locally |
| BB watchdog | `~/Library/Logs/bbwatchdog.log` | Ping results, restart events |
| Cloudflared tunnel | `~/Library/Logs/cloudflared-bluebubbles.log` | Tunnel connection state, errors |
| Database console | Supabase dashboard (project `pzdcwulzteofvatjrtlh`) | Table browser, SQL editor; this is the DB console, there is no separate admin UI in this repo |
| Send results | `outreach_log` table (written by `logOutreach()`, e.g. `scheduler.ts:321`) and `sms_agent_drafts` / `nurture_queue` tables (status columns: `pending`/`sending`/`sent`/`failed`/`cancelled`) | Query via Supabase SQL editor or the app's own analytics views; there is no separate log file for sends, it is all in Postgres |

---

## Artifact conventions

| Path | What it is | Tracked in git? |
|---|---|---|
| `dist/` | Vite build output (frontend). Rebuilt by `npm run build` | **No** (`.gitignore:2`) |
| `server/public/` | Copy of `dist/` made by the build script (`package.json` "build" step) so the Express server can serve static assets directly. This is a deploy artifact but is intentionally **tracked** in git as a fallback deploy path (`.gitignore:13`, comment: "the Railway-deploy copy of dist/") | **Yes** (explicitly `!server/public` in `.gitignore:13`), despite the Railway comment being stale (Railway is banned, Fly.io only, see propos-change-control) |
| `backups/` | Timestamped full-repo snapshots taken manually before risky changes | **No** (`.gitignore:16`) |
| `dist_backup_*/` | Ad hoc dist snapshots | **No** (`.gitignore:17`) |
| `version.json` | Repo-root file with `{version, releasedAt, changes[]}`. Currently at `1.3.7`, last updated 2026-06-02. Not wired into the build or CI, appears to be updated manually and has drifted behind the actual commit history (263 commits on main vs. a changelog last touched weeks ago). Treat it as a changelog of intent, not a reliable version oracle | **Yes** |
| `SESSION_LOG.md` | Dated entries (`## YYYY-MM-DD — Title`, with `Fixed:`/`Verified:`/`Deployed:`/`Next:` subsections) written at the end of every session so the next session (possibly a different model, possibly weeks later) can resume. Append, never rewrite history | **Yes** |

**Note**: `dist/` currently contains `index-DLpKR__S.js` while the live site serves `index-DIv1vodj.js` and `server/public/index.html` references yet a third hash (`index-QncTMGgR.js`). Three different bundles exist simultaneously right now: live, local `dist/`, and the last-synced `server/public/`. This is exactly what the bundle-hash verification step above is for, never assume "I ran the build" means "the live site has this build."

After any operate/deploy session, append a dated `SESSION_LOG.md` entry per the format above (what ran, what you verified, what's still open) and commit it alongside your other changes.

---

## When NOT to use this skill

- **First-time machine setup** (fresh clone, installing dependencies, `.env` from scratch, getting `npm run dev` working for the first time) → **propos-build-and-env**.
- **Symptom-first triage** ("the SMS isn't sending", "the site looks broken", "why is `database:false`") → **propos-debugging-playbook**. This skill tells you the deploy anatomy and what should be running; the debugging playbook tells you how to find out why something isn't.
- **Approval-rule detail** (what needs founder sign-off, the full never-touch list, the no-autofire rule's exact wording and history) → **propos-change-control**. This skill assumes you already know the answer and shows you the mechanics.
- **Why the fly.toml `auto_stop_machines` setting exists, or other load-bearing design rationale** → **propos-architecture-contract**.
- **Incident narratives in full** (the deploy-drift saga's timeline, the key leak, other root-cause chronicles) → **propos-failure-archaeology**. This skill states the current facts, not the story of how they got that way.

---

## Provenance and maintenance

Re-run these before trusting any date-stamped claim above if it's more than a few weeks old:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"

# Re-check the CI deploy target (should still say propos-demo if this skill is current)
grep -n "project-name" .github/workflows/deploy.yml

# Re-check the fly.toml invariant
grep -n "auto_stop_machines\|min_machines_running" fly.toml

# Re-grep all six scheduler files for their cron expressions and registration lines
grep -n "cron.schedule" server/lib/scheduler.ts server/lib/outreachScheduler.ts \
  server/lib/smsOrchestrator.ts server/lib/smsReadyOutreach.ts \
  server/lib/transportHealthMonitor.ts server/lib/backendHealthMonitor.ts

# Re-check what index.ts actually starts (a function existing doesn't mean it runs)
grep -n "^  start\|cron.default.schedule" server/index.ts

# Re-check the health endpoint live (only do this if you are explicitly asked to
# hit production; otherwise cite the 2026-07-05 fact above)
curl -s https://addvantageadvisory.fly.dev/api/health

# Re-check the bundle hash match
grep -o 'index-[A-Za-z0-9_-]*\.js' dist/index.html
curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```
