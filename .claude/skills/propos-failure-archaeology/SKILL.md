---
name: propos-failure-archaeology
description: "Chronicle of every major PropOS incident, near-miss, and dead end: symptom, root cause, evidence, and current status. Load this BEFORE re-investigating something that feels familiar, before proposing a fix that sounds obvious, or when a session handoff references an incident you don't have context on. Triggers: 'has this happened before', 'why is database:false', 'why does deploy.yml still say propos-demo', 'what happened with the OpenAI key', 'why is CampaignView not shown to agents', 'is the prompt optimiser wired up', 'why did the health check fail', 'git history archaeology', 'read the incident history'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Failure Archaeology

This is the chronicle. Every entry below happened, was diagnosed, and reached a real status. Read
this before you re-diagnose something a prior session already solved, and before you propose a fix
that one of these entries already tried and found insufficient.

Format per entry: **symptom → root cause → evidence → status**, then a one-line lesson. Reverse
chronological (newest incidents first). Status values: **RESOLVED** (fixed and verified),
**MITIGATED** (defence in place but the failure class can recur), **OPEN** (unresolved, still live).

---

## When NOT to use this skill

- You are actively triaging a symptom right now (server won't start, a send failed, tsc is red) →
  use **propos-debugging-playbook** (symptom → triage table, discriminating experiments, doctor
  script). Come here only after triage to check whether your symptom already has a documented root
  cause.
- You want the rule that came out of an incident, not the incident story → use
  **propos-change-control** (approval matrix, non-negotiable rules, house style). This skill tells
  you what happened; change-control tells you what to do about it going forward.
- You want the current architecture, not the history of how it got fixed → use
  **propos-architecture-contract**.

---

## 1. OpenAI key leak → billing drain → history purge (2026-07 window)

**Symptom:** Unauthorized GPT-5 usage drained OpenAI billing. `server/.env` (containing the live
OpenAI key) was tracked in the PropOS repo, which is public on GitHub.

**Root cause:** `server/.env` was committed to git at some point in the repo's history and never
removed; `.gitignore` did not previously exclude it. The key sat in a public repo, was scraped, and
used for unauthorized generation.

**Evidence:**
- `.gitignore` (repo root) now explicitly lists `.env` and `server/.env` (verified 2026-07-05):
  ```
  .env
  server/.env
  ```
- Commit `c3507d0` (2026-07-05, HEAD of `main`): `security: add .env to gitignore -- prevent credential commits`.
- `git log --all --oneline -- server/.env` returns **zero results** on the current history — the
  file is not tracked at any reachable commit, consistent with a `git-filter-repo` purge (which
  rewrites history and drops the reflog to a single fresh entry; `git reflog` on this repo currently
  shows only `HEAD@{0}: commit: security: add .env to gitignore`, not the long reflog you'd expect
  on a 263-commit-old repo — another signature of a history rewrite).
- Two remotes exist: `origin` (`github.com/vinuthosrirama/PropOS.git`) and `backup`
  (`github.com/vinuthosrirama/PropOS-backup.git`) (verified via `git remote -v`, 2026-07-05).
- Rotation tooling: `~/Desktop/Claude/update-openai-key.sh <newkey>` updates 8 local `.env` files
  plus Cloudflare Pages secrets on `addvantage-advisory` and `peakere-demo` [UNVERIFIED path — this
  script lives outside the PropOS repo and was not read directly; cited from session notes
  2026-07-05, not from a file this skill can point you to].

**Status: RESOLVED, with one pending action.** All old keys were rotated; the new key lives only in
local `.env` files and Cloudflare Pages secrets. **Pending: `git push backup <branch> --force` to
the `PropOS-backup` remote** has not been confirmed done — the backup remote may still hold the
pre-purge history with the leaked key reachable in its objects. This is a user action requiring an
explicit force-push decision; do not run it without asking (see propos-change-control's approval
matrix for force-push).

**Lesson:** Secrets never go in git, full stop — not even in a gitignored-later `.env`, because
"later" is not soon enough. If a secret was ever tracked, rotation must happen at the credential
provider (OpenAI/Cloudflare/etc.), not just in the repo; purging git history purges evidence, not
already-scraped keys.

---

## 2. Wrong-Pages-project deploy saga (ongoing since 2026-06-11)

**Symptom:** Confusion, twice, about which Cloudflare Pages project actually serves
`propos.addvantage.site`, with the CI workflow still deploying to a dead project as of 2026-07-05.

**Root cause (two-part, direction flipped mid-saga):**
1. **2026-06-11:** A deploy of commit `967e2cc` went to Pages project `openhome-engine`, but at the
   time `propos.addvantage.site` was actually served by `propos-demo` — so the live domain stayed
   stale on an old bundle (`index-DNro47DU.js`) while the team believed the fix had shipped.
   `SESSION_LOG.md` line 158 documents this directly: *"the 967e2cc fix had been deployed to the
   WRONG project (`openhome-engine`), leaving the domain stale... This session rebuilt dist and
   deployed to `propos-demo` production."*
2. **2026-06-19:** `CLAUDE.md`'s Session Persistence Rules section had (incorrectly, per that day's
   session) named the CF Pages project `propos-demo`. That session corrected it to
   `openhome-engine`, confirmed by actual deploy output. `SESSION_LOG.md` line 223: *"CLAUDE.md
   contradiction: Session persistence rules incorrectly named the CF Pages project `propos-demo`;
   corrected to `openhome-engine` (consistent with the main Deploy section and confirmed by actual
   deploy output)."*

So the "truth" flipped direction once: first `openhome-engine` was the wrong answer (06-11), then it
became the right answer (06-19). **`.github/workflows/deploy.yml` was never updated either time** and
still deploys to `propos-demo` on every push to `main`:
```yaml
- name: Deploy to Cloudflare Pages
  run: wrangler pages deploy dist --project-name=propos-demo --branch=main --commit-dirty=true
```
(verified `.github/workflows/deploy.yml` line 34, 2026-07-05).

**Evidence (re-verified 2026-07-05, per the outgoing engineer's live-state fact pack):**
`propos.addvantage.site` and `openhome-engine.pages.dev` both serve bundle `index-DIv1vodj.js`
(identical); `propos-demo.pages.dev` serves no such bundle (a dead project). `CLAUDE.md`'s "Deploy to
propos.addvantage.site" section (top of file) is internally consistent with this: it names
`openhome-engine` as the project and gives the manual command
`npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true`.

**Status: OPEN.** CI reports green on every push to main, but the artifact it deploys is invisible
(a dead Pages project nobody visits). Real frontend deploys only happen via the manual wrangler
command above, run by a human. Fixing `deploy.yml`'s `--project-name` is an uncommitted, low-risk
one-line change but is explicitly not yet done — see propos-debugging-playbook for the triage entry
and propos-run-and-operate for full deploy-truth details.

**Lesson:** A CI workflow that deploys successfully proves nothing about where it deployed to. When
a doc correction happens, grep every file that names the target, including `.yml` workflows, not
just the doc you were editing. "Green CI" and "live site updated" are different claims and this repo
has now falsified the assumption that they're the same claim, twice.

---

## 3. Production backend database:false (discovered 2026-07-05)

**Symptom:** `GET https://addvantageadvisory.fly.dev/api/health` returns `{"ok":true,"database":false}`.

**Root cause:** Not yet diagnosed. Two live candidates, neither confirmed:
1. `DATABASE_URL` secret on the Fly.io app (`addvantageadvisory`) is missing or was rotated/expired.
2. The Supabase project (`pzdcwulzteofvatjrtlh`) is paused (Supabase free-tier projects pause after
   inactivity).

**Evidence:** Verified 2026-07-05 by the outgoing engineer (live-state fact pack §D.1). CLAUDE.md's
own Visual Verification Rule (post-deploy checklist) requires `curl .../api/health` to return
`{"ok":true,"database":true}` before a deploy can be called complete — so this is a standing
violation of the repo's own verification protocol, not a newly introduced regression necessarily;
it may have been degraded for a while without anyone re-running the full checklist.

**Status: OPEN INCIDENT.** This is the single most impactful open item in the repo: every module
that touches Postgres (contacts, outreach_log, sms_contacts, agent_state, pitches, voice_signals,
everything) silently no-ops without `DATABASE_URL` per the architecture's fail-open design (see
propos-architecture-contract). A no-op is not a crash, which is exactly why this can go unnoticed —
the server looks alive while doing nothing persistent.

**Where the fix lives:** Triage steps (check `flyctl secrets list --app addvantageadvisory`, check
Supabase dashboard project status, re-set `DATABASE_URL` if rotated) belong in
**propos-debugging-playbook**, not here. This entry exists so a future session doesn't waste time
re-discovering that database:false is a known, tracked, open problem before starting triage.

**Lesson:** Fail-open design (server boots and serves without DB) is the correct choice for
resilience, but it means a broken DB connection produces zero user-facing errors and can persist
undetected. The health endpoint's `database` field is the only signal — it must be checked after
every deploy, not assumed.

---

## 4. Webhook auth blocker: global requireAuth swallowed BlueBubbles webhooks (RESOLVED 2026-06-13)

**Symptom:** Every inbound BlueBubbles webhook POST (a reply arriving from Vinuth's real phone) was
rejected with `{"error":"Missing or invalid Authorization header"}` once `DATABASE_URL` was set.
Inbound replies were completely dead — no draft ever got generated from a real reply.

**Root cause:** `server/index.ts` registered a global `/api` middleware gate (`requireAuth`, when DB
connected) BEFORE the webhook router's own gate (`verifyWebhookSecret`). Express applies middleware
in registration order, so the global JWT gate 401'd every webhook call before
`verifyWebhookSecret` — a completely separate, correct auth mechanism for machine-to-machine calls —
ever got a chance to run.

**Evidence:** `docs/SMS_AGENT.md` "Known issues / pre-empted problems and solutions", item 1
(verified in file, 2026-06-13 dated entry). Current code confirms the fix is in place
(`server/index.ts`, verified 2026-07-05):
```ts
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  // Webhook routes have their own gate (verifyWebhookSecret, below) — never JWT-gated.
  if (req.path.startsWith("/webhook/")) return next()
  if (!isDbConnected()) return next()
  return requireAuth(req, res, next)
})
```
This exemption block sits before the webhook-specific `verifyWebhookSecret` middleware
(`app.use("/api/webhook", verifyWebhookSecret)`), which itself constant-time-compares a shared
secret via query param or `X-Webhook-Secret` header.

**Status: RESOLVED.** Verified locally 2026-06-13: unauthenticated/wrong-secret POST → 401; correct
secret → 200, payload reaches `handleSmsAgentInbound`.

**Lesson:** Two auth systems in the same app (JWT for humans, shared-secret for webhooks) need
explicit path-based routing between them, and the routing decision must be made before either gate
runs, not layered as "whichever gate is registered first wins by accident." This exact pattern (a
public-route allowlist checked before a blanket auth gate) is now a standing invariant — see
propos-architecture-contract for the full middleware order.

---

## 5. Inbound double-processing: 3 webhooks, 1 shared DB (RESOLVED 2026-06-13)

**Symptom:** After sending one synthetic inbound webhook to the local dev server, a conversation
thread ended up with TWO new rows for what should have been one inbound message: a "lead" message
and an "agent" message with **identical body text**, immediately following the genuine reply.

**Root cause:** Fixing the webhook-auth blocker (entry 4) required registering a new local
BlueBubbles webhook pointing at `http://localhost:3001`. BlueBubbles' webhook list already had TWO
pre-existing production webhooks pointing at `https://propos.addvantage.site/api/webhook/bluebubbles`.
All three registered webhooks (1 local + 2 prod) pointed at the **same Supabase `DATABASE_URL`**.
Leading hypothesis (documented, not fully proven): BlueBubbles fanned the single inbound event out
to all three webhooks; production auto-replied and wrote to the shared `conversations` table, and
BlueBubbles' own echo of that send (`isFromMe`) was then parsed back in locally as a second "lead"
message.

**Evidence:** `docs/SMS_AGENT.md`, "Known issues", item 7, includes the actual duplicated thread rows
observed:
```
4 lead   09:33:35 | yeah sounds good, keen to catch up. how about Thursday arvo?
5 lead   09:34:58 | sounds good, Thursday arvo it is. reckon we can chat about PropOS
6 agent  09:35:07 | sounds good, Thursday arvo it is. reckon we can chat about PropOS
```

**Fix:** Idempotent dedupe by BlueBubbles message GUID. New `processed_message_guids(guid PRIMARY
KEY, created_at)` table (migration step 122 in `server/lib/db.ts`'s per-step migrate list) and
`server/lib/messageDedup.ts` exporting `claimMessageGuid(guid)` — an atomic
`INSERT ... ON CONFLICT DO NOTHING RETURNING guid`. `parseBBWebhook` (`server/lib/bluebubbles.ts`)
extracts `data.guid ?? data.tempGuid`; `handleIncomingReply` (`server/index.ts`) calls
`claimMessageGuid(guid)` first and short-circuits with a log line if another process already
claimed it. Migration applied live 2026-06-13 ("[migrate] all 123 steps ok").

**Status: RESOLVED.** Only the BlueBubbles webhook path supplies a GUID; the other 5
`handleIncomingReply` call sites (other SMS transports) pass no GUID and the dedup check is a no-op
for them — acceptable because those transports don't have BlueBubbles' multi-webhook fan-out
architecture.

**Lesson:** Any webhook-based integration where local dev and production can share one database
needs message-level idempotency from day one, not as an afterthought — "it worked in the demo" does
not surface this bug, only a real fan-out (multiple registered webhook URLs) does.

---

## 6. Quick Access login had no JWT → every send silently 401'd (RESOLVED 2026-06-19)

**Symptom:** Sends appeared to succeed in the UI but showed a misleading fallback message ("Saved to
Sheets for delivery") instead of confirming an actual SMS/email send. No real message was delivered.

**Root cause:** The "Quick Access" button in `AgentLogin.tsx` called `onLogin()` directly, bypassing
`POST /api/auth/login` entirely — so no JWT was ever issued or stored. Every subsequent
`authFetch` call to `/api/*` (which enforces `requireAuth` once DB is connected) returned 401. The
send-handling code caught the 401 and fell through to a "Saved to Sheets" message that was written
for a genuinely different failure mode (no delivery configured), making a hard auth failure look
like a soft, expected fallback.

**Evidence:** `SESSION_LOG.md`, entry dated 2026-06-19 ("Quick Access JWT fix + Supabase env for live
site"): *"Sends not working (root cause: missing JWT from Quick Access login)... every `authFetch`
call returned 401 → `deliveryRes = null` → 'Saved to Sheets' fallback message."*

**Fix:** New `POST /api/auth/demo-token` endpoint — issues an `agentId=0` JWT with no credentials
required, registered before the auth middleware gate. Quick Access button now calls this endpoint
(async) before `onLogin`, storing the token via `setAccessToken`. Verified live:
`POST https://addvantageadvisory.fly.dev/api/auth/demo-token` → returns `{"accessToken":"eyJ..."}`
(2026-06-19).

**Status: RESOLVED.** Sends via Quick Access still redirect to `TEST_RECIPIENT_PHONE`/`EMAIL` in
test mode (expected, unrelated to this bug).

**Lesson:** A generic catch-and-fallback UI message can mask a completely different underlying
failure. When a "graceful degradation" message appears, verify it's actually the degradation case
you designed for, not an unrelated auth failure wearing the same UI text. Silent auth failures
masquerade as feature bugs.

---

## 7. Empty SMS bubble on partial API response (RESOLVED 2026-06-19)

**Symptom:** A generate call that returned a non-empty email but an empty SMS body (`sms: ""`)
rendered an empty iMessage bubble in the review screen instead of falling back to a template.

**Root cause:** Both `GeneratingScreen` and `VendorProfilePage` guarded with
`if (!sms && !emailSubject) throw`. This only throws (and triggers the template fallback) when
*both* fields are empty. A response with `sms: ""` and a populated `emailSubject` passes the guard
untouched, so the empty string sails through to the render layer.

**Evidence:** `SESSION_LOG.md`, entry dated 2026-06-19: *"Empty SMS bubble bug: `GeneratingScreen`
and `VendorProfilePage` both had `if (!sms && !emailSubject) throw`... Changed to `if (!sms) throw`
so the template fallback always fires when SMS is absent."*

**Status: RESOLVED.** Guard is now `if (!sms) throw` in both locations — SMS absence alone triggers
the fallback regardless of email state.

**Lesson:** A compound guard (`A && B`) that's meant to catch "neither field is usable" actually only
catches the case where BOTH are empty; if the two channels (SMS, email) can independently fail, each
needs its own guard. Partial-success API responses are a distinct failure mode from total failure and
need distinct handling.

---

## 8. Em-dash war: LLM output kept leaking em-dashes despite prompt instructions (MITIGATED, recurring class)

**Symptom:** Generated outreach text (SMS, email, pitch copy) repeatedly contained em-dashes (—)
despite explicit prompt instructions never to use them. This recurred across many sessions and many
different generation call sites, not just once.

**Root cause:** LLM output is not fully steerable by prompt instructions alone — model sampling can
still emit an em-dash even when told not to, especially under paraphrase pressure or when the model's
training-data style defaults to em-dash-heavy prose. Prompt-only enforcement is a probabilistic
defence, not a guarantee.

**Evidence (repeated fix commits across the whole history, confirming this is a recurring class, not
one bug):**
- `a86c7d5` — "Strip em-dashes from all generated outreach at output level"
- `dd23f7b`-equivalent / `dd23f7b` area — "Replace em-dashes with commas instead of hyphens"
- `7a1c25e` — "Mark no-em-dash rule as HARD CONSTRAINT in all generation prompts"
- `1051dd4` — "Fix reply-agent em-dash rule: HARD CONSTRAINT + comma replacement"
- `6311db3` — "fix: remove em-dash from generate template body"
- `d451bcf` — "fix: all 16 outreach SMS scripts now <=160 chars, no em-dashes"
- `17a5e34` — "Enforce opt-out on all self-outreach sends; unify AI-tell sanitiser"

(all verified via `git log --oneline --all`, 2026-07-05). Current defence-in-depth lives in
`server/lib/sanitise.ts` (verified 2026-07-05):
```ts
let out = s.replace(/\s*(?:—|–|--)\s*/g, ", ").replace(/ {2,}/g, " ").trim()
```
which strips em-dash, en-dash, AND double-hyphen, replacing with a comma (not silently deleting).

**Status: MITIGATED, not eliminated as a risk class.** Current triple defence: (1) prompt-level "never
use em-dashes" instruction in every generation prompt, (2) server-side `sanitiseText()` in
`server/lib/sanitise.ts` runs on every generated body before it's returned to the client, (3) any
client-side display path is expected to be safe because the server already sanitised — but a NEW
generation call site that forgets to route through `sanitiseText()` would reintroduce the bug. This
is why the fix commits span so many different files across so many months: each new generation
feature (pitch templates, vendor reports, SMS agent openers) is a fresh chance to skip the sanitiser.

**Lesson:** Never trust prompt instructions alone for a hard formatting constraint on LLM output.
Any new text-generation call site must route through `server/lib/sanitise.ts`'s `sanitiseText()` (or
equivalent) as a mandatory last step, and that should be checked in code review, not assumed from the
system prompt.

---

## 9. Railway → Fly.io migration; stale config files still in tree (RESOLVED, files are stale)

**Symptom:** `server/railway.toml`, `nixpacks.toml` (repo root), and `server/Procfile` all still
exist in the working tree, potentially confusing a future session into thinking Railway is (or was
recently) the deploy target.

**Root cause:** The backend was migrated from Railway to Fly.io (commit `732c9a8`, "Remove Twilio
entirely, migrate Railway → Fly.io"; also `7fee5a3`/`b723f00`, "Migrate API server from Railway to
Fly.io (addvantageadvisory)"). The old Railway config files were never deleted after the migration.

**Evidence:** Verified 2026-07-05: no `railway.toml` at repo root, but `server/railway.toml`,
`nixpacks.toml` (root), and `server/Procfile` all still exist on disk. `fly.toml` (repo root) is the
live config and explicitly documents the crons-need-an-always-on-machine rationale in its header
comment. `CLAUDE.md` line 76: *"Never use Railway — Fly.io is the free alternative going forward."*

**Status: RESOLVED as a deploy mechanism (Fly.io is unambiguously live and working), but the dead
files are NOT cleaned up.** Treat `server/railway.toml`, `nixpacks.toml`, and `server/Procfile` as
inert. Do not edit them expecting any effect; do not use them as a reference for how deploy works.

**Lesson:** After a platform migration, leaving the old platform's config files in the tree is
low-risk but costs a future session real time second-guessing "wait, is this still Railway?" —
worth a cleanup pass eventually, but not urgent enough that anyone has done it across several
months of subsequent work.

---

## 10. CampaignView shown to agents (B2B view misrouted into agent-facing tab) (RESOLVED + standing rule)

**Symptom:** The agent-facing "Campaign"/"Email" nav tab, when an agent (e.g. Cameron Knoll) was
using their own VendorOS demo, was at risk of rendering `CampaignView` — a view built for
AddVantage's OWN B2B pitch to acquire agents, not for an agent's outreach to their own vendors/buyers.

**Root cause / fix:** `ab6f183` ("feat: liveMode outreach routing, VendorOutreachView, BuyerOS
switch...") introduced `VendorOutreachView` specifically to replace `CampaignView` in the agent-facing
Email tab: *"Email tab in VendorOS mode now renders VendorOutreachView instead of the PropOS B2B
agent-acquisition CampaignView."*

**Evidence:** Verified 2026-07-05, `src/App.tsx` line 235: `{view === "campaign" && <VendorOutreachView />}`
— `CampaignView` is not referenced anywhere in `App.tsx`'s routing (confirmed via grep); it exists
only as its own component file (`src/views/CampaignView.tsx`, self-described in its header comment
as *"VendorOS outreach cockpit"* for the B2B AddVantage pitch, not for agent use).

**Status: RESOLVED in code, and now a standing rule.** Any future work on agent-facing Email/Campaign
tabs must route to `VendorOutreachView`, never `CampaignView`. See propos-change-control for this
rule's formal listing.

**Lesson:** When two views serve two different audiences (AddVantage pitching agents, vs. an agent
pitching their own vendors) but share a similar name/tab position, a routing mistake is easy and the
blast radius is showing internal sales collateral to a customer. Name the components so the audience
is obvious in the filename (`VendorOutreachView` reads correctly; `CampaignView` alone does not).

---

## 11. Prompt optimiser built but unwired for weeks (RESOLVED 2026-06-19)

**Symptom:** A self-improving prompt optimisation system (collects approve/reject signals, evolves
style rules, versions prompts) existed in the codebase, fully coded, but had no effect on any actual
generation call — it was dead code from the generation pipeline's point of view.

**Root cause:** `server/lib/promptOptimiser.ts` and its supporting schema were built in commit
`25b1708` ("feat: CLAUDE.md lessons, medallion DB views, self-improving prompt optimiser") on
2026-06-09, but nothing in `server/lib/openai.ts` or `server/routes/generate.ts` ever called it to
fetch evolved rules before generating, and nothing in `server/routes/send.ts` ever recorded a signal
back into it after a send. The feature existed as an island: it could theoretically run its own
optimisation cycle, but had no upstream signal in and no downstream effect out.

**Evidence:** Verified via `git log`, 2026-07-05:
- `25b1708` (2026-06-09): builds `promptOptimiser.ts`.
- `308908c` (2026-06-19): *"feat: wire prompt evolution loop (generate → send → optimise)"* — a full
  10-day gap between "built" and "wired". `SESSION_LOG.md`'s 2026-06-19 entry gives the exact wiring:
  `server/lib/openai.ts` gained `evolvedRules?: string` injected into the system prompt;
  `server/routes/generate.ts` now fetches `[versionId, evolvedRules]` from `promptOptimiser` before
  generation (and a real bug was found and fixed in the same commit: `evolvedRules` was being
  dropped because CTA enrichment spread `...params` instead of `...enrichedParams`);
  `server/routes/send.ts` now calls `recordSignal(versionId, "approved", ...)` after every successful
  send; `src/views/DemoView.tsx` threads `versionId` through the UI state.

**Status: RESOLVED.** The loop is wired end-to-end: generate fetches evolved rules → send records a
signal → weekly cron (`0 2 * * 0`, Sun 2am AEST) plus a 15-signal threshold trigger runs
`runOptimisationCycle` for both `sms_rules` and `outreach_system` contexts.

**Lesson:** Building a feature and wiring it into the live call path are two separate milestones that
can be many days apart, and "it's built" is not the same claim as "it's active." When auditing
whether a feature "exists," always trace the actual call graph from the real user-facing action
(here: generate → send) into the feature's entry point — grep for the feature's exported function
names being *called*, not just *defined*.

---

## 12. ESM env hoisting bug in transportHealthMonitor (RESOLVED)

**Symptom:** A module-level constant that read `process.env.SMS_TRANSPORT_ALERT_EMAIL` (or similar)
at import time would see an empty value even though the `.env` file genuinely had it set, because
the read happened before `dotenv.config()` ran.

**Root cause:** ES module imports are hoisted and evaluated in dependency order at process start,
before the entry file's own top-level statements (including a `dotenv.config()` call) execute. Any
`process.env.X` read at module scope (not inside a function) in an imported file captures
`undefined` permanently, because by the time that module's top-level code runs, `index.ts`'s
`dotenv.config()` hasn't fired yet.

**Evidence:** `server/lib/transportHealthMonitor.ts` now carries an explanatory comment (verified
2026-07-05):
```ts
// loads before index.ts's dotenv.config() call runs, so process.env would be empty here.
```
immediately preceding lazy function-scoped reads:
```ts
return process.env.SMS_TRANSPORT_ALERT_EMAIL?.trim() || process.env.GMAIL_USER?.trim()
```

**Status: RESOLVED.** Env reads in this module are now lazy (inside functions, called at
request/cron time), not module-scope constants.

**Lesson:** Any `server/lib/*.ts` module must read `process.env.*` lazily inside functions, never as
a top-level `const X = process.env.Y`. This is now a standing code-review check, not just a one-off
fix — see propos-architecture-contract for the general invariant and propos-config-and-flags for
the env var catalog itself.

---

## 13. Health endpoint registered after requireAuth (RESOLVED 2026-06-08, now a standing invariant)

**Symptom:** `GET /api/health` returned 401 instead of a health payload once auth middleware was
active, because the health check itself required a JWT it obviously couldn't have.

**Root cause:** Express registers and applies middleware in the order you call `app.use()`/`app.get()`.
The health route was defined in the file after the global `requireAuth` gate, so every request to
`/api/health` — including Fly.io's own automated health check — hit the auth gate first and got 401'd.

**Evidence:** Two same-day fix commits, `78daace` (2026-06-08, "fix: register /api/health before JWT
auth middleware in server/index.ts (#1)") and `f809e8a` (2026-06-08, "fix: health before auth,
outreach_log missing columns, constraint DO block"). Current `server/index.ts` confirms the health
route is registered well before the `requireAuth` gate (verified 2026-07-05, health route ~line 139,
auth gate ~line 225-229 per the repo's own architecture notes). `docs/SESSION_LESSONS.md` also
records this as an `[avoid]` entry dated 2026-06-09.

**Status: RESOLVED, and codified as a standing invariant.** `CLAUDE.md`'s "Known Friction Patterns"
section states it directly: *"Public API routes: any new endpoint that must be unauthenticated
(health, test-sms, sms-transport, webhooks) MUST be registered BEFORE the requireAuth middleware in
server/index.ts."*

**Lesson:** Any new unauthenticated route (health checks, public webhook endpoints, public pitch
pages) must be registered before the blanket auth gate, every time, with no exceptions — Fly.io's
own health check depends on this and a broken health check can make Fly.io consider the whole
machine unhealthy and restart it.

---

## 14. Feature-branch-only push did not deploy backend (RESOLVED as a friction pattern)

**Symptom:** A session pushed backend changes to a feature branch (not `main`) and expected the
Fly.io backend to reflect the change. It didn't.

**Root cause:** `flyctl deploy` is a manual, explicit command — Fly.io does not auto-deploy on any
git push, to any branch, including `main`. Pushing to a feature branch compounds the confusion
because even pushing to `main` alone would not have been sufficient.

**Evidence:** `docs/SESSION_LESSONS.md`, dated 2026-06-09: *"pushing only to a feature branch does
not deploy backend -- always push to origin/main and then run `flyctl deploy`."* `CLAUDE.md`'s
"Known Friction Patterns" section repeats this as a standing rule.

**Status: RESOLVED as a documented friction pattern.** This is not a bug to fix in code; it's an
operational fact about Fly.io that every session must remember. `flyctl deploy` from the repo root
is always a separate, manual step after any push, regardless of branch.

**Lesson:** "I pushed the code" and "the backend is deployed" are different claims for this repo, on
every branch, always. See propos-run-and-operate for the full deploy anatomy.

---

## 15. Orphaned tests: `src/__tests__` exist, no runner installed (OPEN)

**Symptom:** `src/__tests__/slm.test.ts` and `src/__tests__/smoke.test.ts` exist in the repo, but
running them does anything is not possible out of the box.

**Root cause:** Neither `package.json` (frontend, repo root) nor `server/package.json` lists
`vitest`, `jest`, or any test runner as a dependency, and neither has a `test` script. The test
files were written (presumably against an assumed future runner) but the runner was never installed
or wired.

**Evidence:** Verified 2026-07-05: `find src/__tests__` returns exactly `slm.test.ts` and
`smoke.test.ts`; `grep -iE "vitest|jest" package.json server/package.json` returns nothing;
root `package.json` scripts are `dev`, `server`, `build`, `preview`, `start` (no `test`); `server/package.json`
scripts are `dev`, `build`, `start` (no `test`).

**Status: OPEN.** Real validation regime in the meantime is `npx tsc --noEmit` at repo root AND in
`server/`, plus the Visual Verification Protocol (Preview/Chrome CLI screenshots), plus manual health
endpoint checks. See propos-validation-and-qa for the full evidence hierarchy this repo actually
relies on given no automated test suite runs.

**Lesson:** A test file sitting in the tree with no runner installed is worse than no test file — it
implies a safety net that isn't there. If you write a test in this repo today, you must also install
and wire a runner in the same change, or clearly flag in the commit message that the test cannot yet
execute.

---

## 16. Stop-hook path broken on this Mac (OPEN)

**Symptom:** `docs/SESSION_LESSONS.md`'s auto-accumulated `[avoid]`/`[win]` entries stop updating
locally, even though sessions keep ending and the mechanism is supposed to be automatic.

**Root cause:** `.claude/settings.json`'s `Stop` hook is configured to run
`bash /home/user/PropOS/.claude/hooks/session-review.sh` — an absolute path rooted at
`/home/user/PropOS`, which is a Linux path pattern from a remote/cloud session environment, not this
Mac (`/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS`). The hook simply cannot
resolve and silently fails to run locally.

**Evidence:** Verified 2026-07-05, `.claude/settings.json`:
```json
"Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bash /home/user/PropOS/.claude/hooks/session-review.sh" }] }]
```
Compare against `docs/SESSION_LESSONS.md`'s existing entries, all dated 2026-06-09 through
2026-06-11 — no entries after that, consistent with the hook having stopped firing (or never having
fired locally at all, only in whatever remote environment originally set this path).

**Status: OPEN.** The hook file itself (`.claude/hooks/session-review.sh`) does exist in this repo's
`.claude/hooks/` directory (per `.gitignore`'s explicit `!.claude/hooks/session-review.sh` exception,
which would be pointless if the file weren't tracked) — only the `Stop` hook's absolute path
reference is wrong for local runs.

**Lesson:** A hook command path should be relative to the repo root (resolved via the working
directory Claude Code starts hooks in) or otherwise portable, not hardcoded to one machine's or one
remote environment's absolute path. Fixing this is a `.claude/settings.json` edit; whether that edit
is in scope depends on the approval matrix (settings.json changes may need explicit confirmation) —
see propos-change-control.

---

## 17. GMAIL_REFRESH_TOKEN needs broader-scope re-consent (OPEN, user action)

**Symptom:** Server logs show `[gmailInbound] poll failed: Request had insufficient authentication
scopes.` on every startup.

**Root cause:** The current `GMAIL_REFRESH_TOKEN` was issued with a narrower OAuth scope set than
`gmailInbound.ts` needs to poll the inbox for replies (send-only scope, likely missing
`gmail.readonly` or `gmail.modify`).

**Evidence:** `docs/SMS_AGENT.md`, "Known issues", item 6: *"Log shows `[gmailInbound] poll failed:
Request had insufficient authentication scopes.` on every startup. Doesn't block SMS agent but means
email reply capture for the outreach campaign is broken."* Verified 2026-07-05: both
`server/lib/gmail.ts` and `server/lib/gmailInbound.ts` read `process.env.GMAIL_REFRESH_TOKEN`
directly; there is no code-level fix available here, only a token re-issue.

**Status: OPEN, blocked on a user action.** Outbound email (sending) works fine on the current
token; only inbound polling (reading replies) is broken. Fixing this requires a human to go through
Google's OAuth consent screen again with the correct scopes and update the token — not something a
session can do unattended.

**Lesson:** When a service account/OAuth token is issued, document the exact scopes granted at issue
time somewhere durable (not just "it works for X"), so a scope gap discovered later doesn't require
re-deriving what's missing from a runtime error message alone.

---

## 18. Voice calibration still on 15 placeholder samples (OPEN, blocks voice-fidelity work)

**Symptom:** All SMS agent generated text (openers, replies) is calibrated against 15 generic
Australian-casual placeholder samples, not the founder's actual texting style, at `confidence: 0.4`
(low).

**Root cause:** `STARTER_VOICE_SAMPLES` (`server/data/smsAgentSeed.ts`) were written as a bootstrap
default so the system wouldn't hard-fail pre-calibration, with the explicit expectation that they'd
be replaced once real samples were available. That replacement never happened.

**Evidence:** Verified 2026-07-05, `server/data/smsAgentSeed.ts` line 20 defines
`STARTER_VOICE_SAMPLES: string[]`; `docs/SMS_AGENT.md` line 189: *"currently running on 15
placeholder samples (confidence 0.4). Real calibration needs 20+ of Vinuth's actual texts."*; line
554 repeats: *"Voice confidence still 0.4 (15 placeholder samples) — openers are personalised but
generic in tone until `/calibrate` runs with 20+ real texts per agent."*

**Status: OPEN.** This is a founder action item, not a code task: export 20-30 real iMessage/SMS
texts (Messages.app export or copy/paste from real threads), strip sensitive info, and
`POST /api/sms-agent/calibrate` with them. No code change is required to unblock this — the
calibration endpoint already exists and works, it just hasn't been given real input.

**Why this matters beyond the SMS agent module:** this directly blocks the "voice fidelity moat"
research-frontier goal (recipients cannot tell AI outreach from the agent's own texting) — see
propos-research-frontier for how this open item gates that broader objective.

**Lesson:** A calibration/ML-adjacent feature that ships with placeholder training data will sit
that way indefinitely unless someone tracks it as an explicit open item with a concrete unblock
action, because the system "working" (producing plausible-sounding text) removes the visible
pressure to supply real data.

---

## Additional fix-after-feat stories worth remembering

These didn't make the numbered list above (each is a single self-contained fix, not an incident with
lasting open state) but are worth knowing about because they demonstrate the same lesson recurring:
**a "feat" commit followed quickly by a "fix" commit for the same area is a pattern in this repo's
history, not an anomaly.**

- **Comparable-sales map fallback (RESOLVED, 2026-06-09).** Commit `018ff0f` ("fix: comparable sales
  map -- fallback to static list after 8s tile timeout") followed the `0b43558`/`67155c4` "UX
  minimalism" feat commits from the same day. Root cause: `ComparableSalesMap.tsx`'s CartoDB tile
  layer had a `tileerror` handler (3+ failures → static fallback) but no timeout for the case where
  tiles simply never load OR error — the loading skeleton could cover the map area indefinitely.
  Fix: an 8-second `setTimeout` that calls `setFailed(true)` if no `tileload` event has fired,
  clearing the timer on either success or unmount. `docs/SESSION_LESSONS.md` records this pairing
  directly as an `[avoid]` entry. Lesson: any "loading" state driven by an external network resource
  (map tiles, third-party widgets) needs an explicit timeout-to-fallback, not just a retry-count
  fallback — a resource that neither loads nor errors is a real failure mode, not just theoretical.

- **Hero canvas overflow on the landing page (RESOLVED, 2026-06-11).** `landing/index.html`'s
  three.js particle-grid hero canvas grew to 10198px wide and caused horizontal page overflow.
  `SESSION_LOG.md`'s 2026-06-11 landing-page entry documents the root cause: `inset:0` doesn't
  stretch a replaced element (a `<canvas>`) the way it does a normal block element, so the canvas's
  internal resolution kept growing in a feedback loop against its own oversized rendered size. Fixed
  with explicit CSS 100% sizing plus measuring the actual parent element dimensions in JS rather than
  trusting `inset:0` to constrain it. Two more bugs found in the same verification pass: the
  flywheel SVG rotated around the wrong origin (fixed via GSAP's explicit `svgOrigin` instead of CSS
  `transformOrigin`), and the 3-column pipeline was too cramped at tablet width (fixed by stacking at
  ≤1024px). Lesson: `<canvas>`/`<svg>` elements do not obey CSS sizing shortcuts (`inset:0`,
  percentage-based auto-sizing) the same way normal DOM elements do; always verify replaced-element
  sizing at multiple breakpoints with a real screenshot, not just a code read.

- **Rebase conflicts after remote UX-minimalism commits landed concurrently (RESOLVED, 2026-06-09
  through 2026-06-11).** Commit `cfd29c9` ("chore: merge remote UX minimalism commits + rebuild dist
  with all current changes") and later `7699150` ("fix: post-rebase TS errors + rebuild server/public",
  following the `998cd02` "feat: bulletproof 4-method SMS cascade + Gmail redundancy + scope upsert"
  commit) show two separate sessions/machines editing overlapping files (`SettingsView.tsx` among
  them) landed concurrently, requiring a manual merge and a follow-up TypeScript-error cleanup pass.
  `docs/SESSION_LESSONS.md` records this exact pairing as an `[avoid]` (fix needed after feat) and
  also a `[win]` ("user approved after fix... approach validated, repeat it") — i.e. the
  fix-after-rebase pattern itself wasn't the problem; catching and cleaning it up promptly, verified
  by tsc, was judged the right response. Lesson: when two sessions/machines might be editing the
  same repo concurrently (this repo explicitly supports resuming on a different machine, per
  CLAUDE.md's Session Persistence Rules), a rebase producing TypeScript errors is expected
  occasionally, not a sign something is fundamentally wrong — the discipline is running `tsc --noEmit`
  immediately after and committing the fix as its own clearly-labeled commit, not silently folding it
  into the next feature commit.

---

## Provenance and maintenance

Every claim above was verified against the repo on 2026-07-05. Re-verify with these commands before
trusting a stale-looking entry:

| Claim | Re-verification command |
|---|---|
| `server/.env` not tracked in current history | `git -C "<repo>" log --all --oneline -- server/.env` (expect zero results) |
| `.gitignore` excludes both env files | `grep -n "^\.env$\|^server/\.env$" "<repo>/.gitignore"` |
| Backup remote exists, force-push status | `git -C "<repo>" remote -v \| grep backup` (existence only; push status is a live GitHub check, not local) |
| deploy.yml still targets `propos-demo` | `grep -n "project-name" "<repo>/.github/workflows/deploy.yml"` |
| CLAUDE.md names `openhome-engine` as truth | `grep -n "openhome-engine\|propos-demo" "<repo>/CLAUDE.md"` |
| Production `database:false` still open | Live check (do not run unattended per no-autofire/no-live-hits rules): `curl -s https://addvantageadvisory.fly.dev/api/health` |
| Webhook exemption still in place | `grep -n "webhook/" "<repo>/server/index.ts"` and confirm it precedes the `requireAuth` call |
| GUID dedupe table still present | `grep -n "processed_message_guids" "<repo>/server/lib/db.ts"` |
| Quick Access demo-token endpoint exists | `grep -n "demo-token" "<repo>/server/index.ts" "<repo>"/server/routes/*.ts` |
| SMS bubble guard is `if (!sms)` not compound | `grep -n "if (!sms" "<repo>/src/views/DemoView.tsx"` |
| Em-dash sanitiser still strips all three dash forms | `grep -n "em-dash rule\|replace(/" "<repo>/server/lib/sanitise.ts"` |
| Railway files still present but inert | `ls "<repo>/server/railway.toml" "<repo>/nixpacks.toml" "<repo>/server/Procfile"` |
| CampaignView still excluded from App.tsx routing | `grep -n "CampaignView" "<repo>/src/App.tsx"` (expect no match) |
| Prompt optimiser still wired (not regressed to unwired) | `grep -n "evolvedRules\|versionId" "<repo>/server/routes/generate.ts" "<repo>/server/routes/send.ts"` |
| transportHealthMonitor still reads env lazily | `grep -n "process.env" "<repo>/server/lib/transportHealthMonitor.ts"` (expect reads inside functions, not top-level `const`) |
| Health route still precedes requireAuth | `grep -n "app.get(\"/api/health\"\|requireAuth" "<repo>/server/index.ts"` and compare line numbers |
| No test runner installed | `grep -iE "vitest\|jest" "<repo>/package.json" "<repo>/server/package.json"` (expect no match) |
| Stop hook path still broken locally | `grep -n "command" "<repo>/.claude/settings.json"` under the `Stop` key |
| Gmail inbound scope error still occurring | Runtime log check only (do not trigger a live poll to test this) |
| Voice calibration still on placeholders | `grep -n "STARTER_VOICE_SAMPLES" "<repo>/server/data/smsAgentSeed.ts"` |

**When you resolve an OPEN item above:** update its status to RESOLVED or MITIGATED in this file,
add the new evidence (commit hash, file:line), and add a dated note. Do not delete the entry — the
root cause and lesson remain valuable even after the fix ships. This file's value compounds; keep it
that way.

**When you discover a new incident** with a real root cause and a resolution (not just a vague
"this seemed off"): add it at the top of the numbered list (reverse-chronological), following the
same symptom → root cause → evidence → status → lesson format, and cite the exact commit hash or
file:line you verified it against.
