---
name: propos-change-control
description: "The gate for every PropOS change: what a session may do without asking, what needs founder approval first, per-change-class checks, and the non-negotiable rules with the incident behind each one. Load this BEFORE starting any work that touches code, config, secrets, or a send path. Triggers: 'can I push this', 'can I deploy this', 'is this safe to do without asking', 'what needs approval', 'commit this', 'end of session', 'session log', 'am I allowed to', 'is this a production change', 'do I need to ask first', 'new session starting'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Change Control

This is the approval gate for the PropOS repo. It answers one question before any other work: **can this session do the thing in front of it, or must it ask the founder (Vinuth) first.** Read this before touching code, config, secrets, or any send path. It does not cover deploy mechanics, triage steps, or incident narratives in depth, see "When NOT to use this skill" at the end.

Repo root: `/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS`. All paths below are relative to this root unless marked absolute.

---

## 1. Approval matrix

This is canon. If an action is not in the left column, treat it as ask-first by default, not as an oversight to route around.

| Allowed without asking | Ask founder first |
|---|---|
| Proactive read-only code audit (robustness, vulnerabilities, future failure modes), reported with evidence | Push to `main` on either remote (`origin` or `backup`) |
| Preview deploys: local builds, `npx tsc --noEmit`, Cloudflare Pages **preview**-branch deploys | ANY production deploy: `wrangler pages deploy dist --project-name openhome-engine` (no preview branch), `flyctl deploy`, or anything that updates propos.addvantage.site or addvantageadvisory.fly.dev |
| Read-only health checks (`curl .../api/health`) and screenshots | ANY send: SMS, iMessage, or email, even when `TEST_RECIPIENT_PHONE`/`TEST_RECIPIENT_EMAIL` redirects it (see §3.23 below) |
| Local commits (`git commit`, no push) after a verified feature | ANY paid LLM call: OpenAI or Anthropic, including a "just testing" call |
| Reading/grepping/reviewing any file in the repo | New secrets, DNS changes, or infra changes (Fly secrets, Cloudflare env vars, tunnel config) |
| | Database migrations against the production Supabase instance |

Source: founder decision, 2026-07-05 (brief §E.3). This table supersedes any older doc that implies push-and-deploy is part of the normal flow, see §4 for how this interacts with `CLAUDE.md`'s session-end steps.

If unsure which side of the table an action falls on, treat it as ask-first. The cost of a needless question is small; the cost of an unauthorized production deploy, send, or LLM spend is not (see §3's OpenAI key leak entry).

---

## 2. Change classification and gates

Classify the change before starting. Each class has its own required checks and its own approval line.

| Class | Required checks | Founder approval needed? |
|---|---|---|
| **Docs-only** (`CLAUDE.md`, `docs/*.md`, `SESSION_LOG.md`, `NEXT_SESSION.md`) | None beyond accuracy; no em-dashes, no emoji | No, for local commit. Yes to push (§1). |
| **Frontend-only** (`src/**`) | `npx tsc --noEmit` from repo root, zero new errors. Screenshot proof for any UI-visible change (see propos-validation-and-qa for the full evidence hierarchy). No inline style violations (no Tailwind, no CSS files, no `className` for styling, see §3). | No, for local commit + preview deploy. Yes for production deploy or push. |
| **Server route/lib** (`server/**`) | `npx tsc --noEmit` run from **inside `server/`** (root-level tsc only checks the frontend, this is a known gap, see `CLAUDE.md` "Known Friction Patterns"). If the change adds a new public/unauthenticated endpoint, verify it is registered **before** the `requireAuth` gate at `server/index.ts:225` (`app.use("/api", (req, res, next) => { ... requireAuth ... })`). Confirmed public routers sit at lines 179-193, anything needing no auth must land in that block, not after it. | No, for local commit. Yes for `flyctl deploy` (production) or push. |
| **DB migration** (`server/lib/db.ts`, `migrate()` function) | Follow the per-step pattern already in the file (verified `server/lib/db.ts:73-791`): each statement in its own `pool.query()` call inside the loop, never batched, so one failing step logs `[migrate] FAIL <label>: <error>` and does not block the rest. New columns on existing tables use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, never bare `CREATE TABLE IF NOT EXISTS` (that skips existing tables silently). | Yes, always, for anything that runs against the production Supabase instance. Local/dev migration testing does not need approval; applying it to prod does. |
| **Send-path / LLM-callsite** (anything that calls `server/lib/openai.ts`, `server/lib/claude.ts`, or writes to `/api/send`, `/api/generate`, `/api/vendor-generate`, `/api/slm-answer*`, `/api/market-update/send`) | Confirm the call is POST-only, behind a rate limiter (`aiLimiter`/`sendLimiter`, both registered `server/index.ts:120-127`), reachable only from a user click handler, never from page load, cron, or a deploy smoke test (§3, no-autofire rule). Confirm the em-dash triple defence is intact if you touched a prompt or generator (§3). | Yes, for any actual send or actual paid LLM invocation, even test-redirected. No approval needed to review/edit the code path itself, only to execute it. |
| **Infra/secrets** (`fly.toml`, `.github/workflows/*.yml`, Cloudflare/Fly secret values, `.env*` files, DNS, `~/Library/LaunchAgents/*`) | Read-only review is fine. Any write (new secret, new DNS record, new LaunchAgent, edited `fly.toml` health check) requires approval first. | Yes, always. |

---

## 3. Non-negotiables

Each rule exists because of a specific incident, not as a style preference. Do not treat any of these as negotiable defaults that can be relaxed for convenience.

| Rule | Rationale | Incident behind it |
|---|---|---|
| **Zero TypeScript errors before every commit** (`npx tsc --noEmit` at repo root **and** in `server/`) | Two separate tsconfigs; root tsc does not see server errors and vice versa. Committing with either dirty means the next session inherits broken code silently. | Repeated `[avoid]` entries in `CLAUDE.md`'s auto-accumulated Session Lessons: "fix needed after feat" pattern recurs when tsc is skipped before commit. |
| **No em-dashes anywhere** (code, prompts, docs, UI, commit messages) | An LLM will use em-dashes even when told not to, in either direction (the model can drift back after several turns). A single layer of defence is not enough. | Triple defence exists and is verified in-repo: (1) prompt-level instruction repeated in ~15 generator files (e.g. `server/lib/claude.ts:119,261`, `server/lib/openai.ts:76`, `server/routes/vendor-generate.ts:252`), (2) server-side `sanitiseText()` in `server/lib/sanitise.ts:77-79` (`replace(/\s*(?:—\|–\|--)\s*/g, ", ")`), (3) client-side `stripDashes()` defined independently in `src/views/DemoView.tsx` (first at line 2710) and `src/views/demo/VendorStages.tsx:4068`. All three layers must stay in sync; if you edit one, check the others still fire on the same text. |
| **Inline styles only, no CSS files, no Tailwind, no `className` for styling** | Stated directly in `CLAUDE.md` Code Rules §2. Mixing styling systems on a solo-maintained codebase creates silent specificity conflicts nobody has time to debug. | No single incident on record for PropOS; treat as a standing architectural decision, not a suggestion. |
| **Product naming: "PropOS" powered by "AddVantage AI"; never surface model names** (no "GPT-4o", "Claude", "OpenAI", "Anthropic" in anything user-facing) | The product is sold as AddVantage's own technology. Surfacing the underlying vendor undermines the pitch and the pricing. | `CLAUDE.md` Code Rules §5, stated as non-negotiable; no exceptions found in the codebase for user-facing strings. |
| **Default agent is Cameron Knoll @ Peake Real Estate, Berwick** | Cameron is the real beta user (see `CLAUDE.md` Code Rules §6, and `docs/` references). Reverting to a placeholder agent ("Simon", "Harcourts") breaks the one live relationship this product has. | `CLAUDE.md` explicitly calls out "Never revert to 'Simon' or 'Harcourts'" as a rule with a history behind it. |
| **Fly.io only, never Railway** | Founder decision; Railway was the original host and was abandoned. | Dead files remain and are still git-tracked as of 2026-07-05: `server/railway.toml`, `nixpacks.toml`, `server/Procfile` (confirmed via `git ls-files`). Do not resurrect them, do not use them as a template, and do not delete them speculatively either (removing pre-existing dead code needs a reason tied to the current task). |
| **`.env` must never be tracked** | A tracked `server/.env` leaked a real OpenAI key to the public PropOS repo; the key was used for unauthorized GPT-5 usage and drained billing. | July 2026 incident: remediated by purging history with `git-filter-repo` (266 commits rewritten), force-pushing `origin main` and `origin sms-agent`, deleting all old keys, issuing one new key. The gitignore fix landed in commit `c3507d0` ("security: add .env to gitignore, prevent credential commits"), confirmed as the current HEAD-30 log's oldest listed commit. Full narrative lives in propos-failure-archaeology; this skill owns only the resulting rule. |
| **Verify `.gitignore` still covers `.env` and `server/.env` before any commit that touches env handling** | The whole incident happened because this coverage lapsed once. | Current `.gitignore` (verified 2026-07-05) explicitly lists `.env` and `server/.env` as separate lines, both must stay present. If you ever see either missing, stop and flag it, do not commit until fixed. |
| **Never rebase or force-push across the July 2026 history-rewrite boundary** | `git-filter-repo` rewrote commit hashes for the entire history up to and including the purge. Rebasing a branch that forked before the rewrite onto anything after it will reintroduce the leaked `.env` blob or produce unresolvable conflicts. | Direct consequence of the key-leak remediation (previous row). A force-push of the `PropOS-backup` remote to catch it up post-rewrite is still a pending user action as of 2026-07-05, do not attempt this yourself; it is explicitly in the ask-first infra category (§1). |
| **No-autofire: paid LLM calls only on explicit user button click or explicit user test request** | A page-load, cron, or deploy-smoke-test LLM call is invisible spend with no human in the loop to catch it going wrong or going expensive. | Direct lesson from the OpenAI key leak: unauthorized usage was possible partly because there was no structural guarantee that generation only happens from a click. Every LLM endpoint must be POST-only, CORS-locked to own origins, rate-limited (`server/index.ts:120-127`: `aiLimiter` on `/api/generate`, `/api/vendor-generate`, `/api/slm-answer`, `/api/slm-answer-batch`; `sendLimiter` on `/api/send`, `/api/vendor-bulk-send`, `/api/market-update/send`), and reachable only from a click handler. |
| **Demo-deploy isolation**: GTM prospect demos never touch the `openhome-engine` (PropOS production) or `addvantage-advisory` (Advisory production) Cloudflare Pages projects | The founder interrupted an in-progress build specifically to draw this boundary. Prospect demos are disposable and experimental; production is not. | Hard boundary stated directly by the founder, 2026-07-05. Prospect/GTM demos deploy to isolated projects/subdomains only (see propos-run-and-operate for the actual isolated-deploy mechanics; this skill only owns the rule that they must be isolated). |
| **TEST_RECIPIENT discipline**: `TEST_RECIPIENT_PHONE`/`TEST_RECIPIENT_EMAIL` redirect every send in test mode; demo-tagged contacts redirect to the `demo_target_phone` app_setting | Prevents a test run from actually texting or emailing a real prospect or buyer. | Structural safety net, not a substitute for approval: a redirected test send still requires founder approval before executing (§1) because the redirect is a config value a bug could silently fail to apply. |
| **All prospect/external outreach is founder-sent** | A session may research, draft, and stage outreach to GTM prospects or any external party, but the founder personally reviews and sends every external message himself. For prospect outreach the answer to "can I send this" is always no; the draft is the deliverable. This is stricter than the ANY-send ask-first row in §1: approval does not convert a session into the sender. | Founder decision, stated directly 2026-07-06 (skill-library session Q&A). Previously unwritten; encoded here so no future session infers send permission from having a working transport. |
| **No real client/buyer data in demos or prospect-facing artifacts** | Demos, tests, cloned demo sites, and anything shown to a prospect must use synthetic or redirected contacts only. Real names, phones, and emails stay in the CRM. | Founder decision, stated directly 2026-07-06 (same Q&A). Note the existing `past_buyers` demo seed contains real buyer names with phones redirected to one safe number (SESSION_LOG 2026-06-19); treat that as legacy to migrate toward synthetic, and never add new real records to any demo surface. |

---

## 4. Session duties

These interact with `CLAUDE.md`'s "Session Persistence Rules" section, which was written assuming push was part of the routine flow. It is not, as of the 2026-07-05 approval matrix (§1). Follow the sequence below; where it differs from `CLAUDE.md`, this skill is the current truth (`CLAUDE.md` needs an update to match, via the change-control process in §5).

### Session start (every session, before any work)
1. `git fetch origin && git status`
2. If behind `origin/main`: `git pull --rebase origin main`, but see the rebase warning in §3 if your local branch predates the July 2026 history rewrite; if in doubt, ask before rebasing rather than risk it.
3. If the working tree has uncommitted changes from a previous session: review with `git diff`, then commit them locally with a descriptive message before starting new work. Never build on top of unsaved changes silently.
4. Read `SESSION_LOG.md` (most recent entries) and `NEXT_SESSION.md` to load what was last done and what is planned next.

### During work
- Commit **locally** after every completed, verified feature (tsc clean root + server, screenshot verified per propos-validation-and-qa). Small, frequent local commits are fine and encouraged.
- Pushing that commit to `origin main` is a separate, ask-first action (§1). Do not chain push onto commit automatically.
- Never leave new source files untracked at the end of a turn, even if they are not yet pushed.

### Session end (every session, even if work is incomplete)
1. `npx tsc --noEmit` at repo root, **and** `cd server && npx tsc --noEmit`, both must show zero new errors before committing. (Two separate checks, two separate tsconfigs; see §2's server-route row.)
2. `git add` the work. Never add `backups/`, `dist_backup_*/`, `src_snapshot_*/` (gitignored) or `skills-lock.json` (also gitignored, do not modify per brief §D.14).
3. Commit locally with a message describing what changed and why.
4. Append a dated entry to `SESSION_LOG.md`. Format (verified against the file's existing entries):
   ```
   ## YYYY-MM-DD: Short title of what this session did

   **Fixed / Built:** what changed and the root cause if it was a fix.

   **Verified (Preview screenshots):** what you saw rendered, described concretely (not "it works").

   **tsc:** root + server, clean or list the pre-existing error count if any remain untouched.

   **Deployed:** what was deployed where, or "not deployed" plus why.

   **Next:** the exact next step for the following session.
   ```
   Suffix the header with `(cont.)`, `(later)`, or `(latest)` if it is a same-day continuation of an earlier entry, matching existing style.
5. Commit `SESSION_LOG.md` locally too.
6. **Do not push** as the last automatic step. Pushing `origin main` is ask-first (§1). Tell the user the work is committed locally and ready to push on approval, rather than pushing and then reporting it.

This differs from the pre-2026-07-05 `CLAUDE.md` flow, which lists `git push origin main` as step 4 of session end unconditionally. That flow assumed push was routine; it is now gated. Update `CLAUDE.md` itself to reflect this the next time you have approval to push a docs-only change (see §5's docs-of-record map).

---

## 5. Docs of record map

One fact, one home. Update the file that owns the fact, not a copy of it elsewhere.

| File | What lives here | Update when |
|---|---|---|
| `CLAUDE.md` | Stable rules: tech stack, deploy sequence, code rules, key files, known friction patterns, session persistence rules | A rule changes permanently, a path/filename in "Key Files" goes stale, or the deploy target changes. This is the auto-loaded file every session reads first; keep it accurate over keeping it short. |
| `SESSION_LOG.md` | Per-session dated log: what was built, verified, deployed, and the next step | End of every session (§4). Append only, newest entries at the top of the file based on current ordering (verify against the last few headers before adding yours). |
| `NEXT_SESSION.md` | Ideas bank, longer-running plans, half-built feature specs (e.g. multi-agent provisioning plan) | When you park an idea, or when a plan spans more than one session and needs a durable home other than the session log. |
| `docs/*.md` (e.g. `OPS_RUNBOOK.md`, `SMS_AGENT.md`, `BLUEBUBBLES_SETUP.md`, `ADDVANTAGE_CRM.md`, `AGENTBOX_INTEGRATION.md`, `GOOGLE_SHEETS_CRM.md`, `BUILD_LOG.md`) | Deep, subsystem-specific guides | The subsystem's behaviour changes in a way that affects how a future session would operate or debug it. |
| `docs/SESSION_LESSONS.md` | Auto-appended `[avoid]`/`[win]` one-liners from the Stop hook | Never by hand in the normal flow; it is meant to be hook-written. **[OPEN]**: the hook is currently broken locally. `.claude/settings.json` (verified 2026-07-05) points the Stop hook at `bash /home/user/PropOS/.claude/hooks/session-review.sh`, a Linux path from a remote session. The script itself exists locally at `.claude/hooks/session-review.sh` (2503 bytes, present), but the settings.json path does not resolve on this Mac, so the hook silently never fires here. `CLAUDE.md`'s own "Session Lessons (auto-accumulated)" block is therefore not accumulating anything from local sessions right now; the entries currently in it are all from the period before this broke, or from remote sessions. Fixing the path is an infra/settings change: read-only review is fine without asking, but landing the fix means editing `.claude/settings.json`, which is a config change worth flagging before doing (not strictly "secrets/DNS/infra" in the ask-first list, but treat a hook-execution-path change with the same caution since it changes what gets auto-logged). |
| Skills (`.claude/skills/*/SKILL.md`) | Distilled, load-bearing institutional knowledge for zero-context sessions | A rule in this table (or any skill's table) changes, a new incident teaches a new rule, or a fact you find during work contradicts what a skill currently says. Update the owning skill, do not leave the correction only in `SESSION_LOG.md` where the next session might not read closely enough to catch it. |

---

## 6. House style

- **Commit message prefixes** (verified against `git log --oneline -30`, 2026-07-05): `feat:`, `fix:`, `chore:`, `docs:`, `security:` are all in active use (e.g. `c3507d0 security: add .env to gitignore`, `4dc4e2b docs: session log`, `81eceff chore: rebuild server/public`, `f0d914b feat: template-first outreach engine`, `3b1fd9e fix: lead counts, welcome animation timing`). `infra:` was not observed in the last 30 commits but is a reasonable extension of the pattern for Fly/Cloudflare/DNS-only changes; use it rather than overloading `chore:`.
- Message body: short, imperative, states what changed. Some existing commits still contain an em-dash after the headline (e.g. `a00022b docs: update CLAUDE.md — Chrome CLI deploy verification protocol`); this predates the current no-em-dash discipline and is not a pattern to copy. New commits should use a colon or comma to add detail after the headline, not a full paragraph, and never an em-dash.
- No em-dashes in commit messages, same rule as everywhere else in the repo (§3).
- No emoji in UI or in docs. `CLAUDE.md` Code Rules §4 permits plain Unicode `✓`, `✕`, `→` only, and explicitly bans emoji from buttons/labels/nav.

---

## 7. When NOT to use this skill

- **Deploy mechanics** (exact wrangler/flyctl commands, what deploys where, CI reality, services/tunnel/watchdog, crons, logs) → **propos-run-and-operate**. This skill tells you deploy needs approval; that skill tells you how to actually run it once approved.
- **Triage of a live symptom** (health check failing, sends not arriving, build broken) → **propos-debugging-playbook**. This skill tells you what you're allowed to do while triaging; that skill tells you the actual symptom-to-cause table.
- **Incident history in depth** (the OpenAI key leak full narrative, the Framer visibility saga, deploy drift history, SMS transport debugging story) → **propos-failure-archaeology**. This skill cites the incidents only insofar as they justify a rule; the full chronicle with evidence and status lives there.
- **Architecture invariants** (route-order design rationale beyond the one check in §2, per-step migration design rationale beyond the one check in §2, transport-chain design, Fly `auto_stop_machines` rationale) → **propos-architecture-contract**.
- **Env var catalog** (every flag, its default, prod vs experimental) → **propos-config-and-flags**.
- **Evidence hierarchy and verification protocol in full** (what counts as proof, golden checks, measurement recipes) → **propos-validation-and-qa**. This skill only points at screenshot-proof as a gate condition; that skill owns the full hierarchy and recipes.

---

## Provenance and maintenance

Every claim above was verified directly against the repo on 2026-07-05. The two founder-sent/no-real-demo-data rows in §3 were added 2026-07-06 from direct founder answers; they have no repo artifact to re-verify against, only the founder can supersede them. Re-run these to catch drift:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"

# Approval matrix / infra facts still current
cat CLAUDE.md | head -20                                   # confirm codebase location + tech stack unchanged

# Non-negotiables
cat .gitignore | grep -E "^\.env$|^server/\.env$"           # confirm both .env lines still present
git log --oneline -1                                        # confirm c3507d0-era history still intact, no new rewrite
git ls-files | grep -iE "railway|nixpacks|procfile"          # confirm dead Railway files still present/tracked as expected
grep -n "replace(/.*—.*–.*--" server/lib/sanitise.ts         # confirm server-side em-dash strip still at this pattern
grep -n "const stripDashes" src/views/DemoView.tsx src/views/demo/VendorStages.tsx  # confirm client-side fallback still defined in both files

# Route-order check
grep -n "app.use(\"/api\", (req" server/index.ts             # confirm requireAuth gate line number
grep -n "app.get(\"/api/health\"" server/index.ts             # confirm health route still before the gate

# Migration pattern
grep -n "pool.query(sql)" server/lib/db.ts                   # confirm per-step migration loop still present

# Session hook
cat .claude/settings.json                                    # confirm Stop hook path, check if it now matches this Mac's actual repo path
ls -la .claude/hooks/session-review.sh                        # confirm script still exists locally

# House style
git log --oneline -30                                         # re-derive the prefix list in §6 if conventions have shifted

# Sibling skills still exist at the names cited in §7
ls .claude/skills/ | grep -E "propos-(run-and-operate|debugging-playbook|failure-archaeology|architecture-contract|config-and-flags|validation-and-qa)"
```

If any of these diverge from what's written above, update this file directly rather than letting the skill and the repo drift apart. That divergence is exactly the failure mode this skill exists to prevent.
