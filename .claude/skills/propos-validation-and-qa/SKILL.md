---
name: propos-validation-and-qa
description: "Use when asked to verify a PropOS change works, prove a fix, check whether the demo or production deploy is healthy, audit code quality without changing it, or design a measurement recipe (bundle hash checks, DOM text quality checks, migration verification, send-path verification, Supabase row counts, voice-fidelity A/B). Triggers: 'verify this works', 'is this actually fixed', 'prove the deploy is live', 'check the health endpoint', 'audit the code for issues', 'how do we know this is correct', 'is the outreach text good', 'did the migration run cleanly', 'QA this before we ship'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Validation and QA

This skill is both a QA gate and a proof-and-analysis toolkit. It defines what counts as evidence, what to check before calling anything "done," and worked recipes for measuring specific claims (bundle freshness, text quality, migration success, send correctness, data counts, voice fidelity). It does not fix anything it finds broken: see "When NOT to use this skill" below.

---

## 1. Evidence hierarchy

Most to least trustworthy (canon, do not invert this order when reporting "done"):

| Rank | Evidence | Why it counts |
|---|---|---|
| 1 | Rendered-UI screenshot, read pixel by pixel | Shows what the user actually sees, not what the code intends |
| 2 | DOM text read (`preview_eval`, `get_page_text`, curl'd HTML) | Confirms actual text content, catches truncation/mismatch the screenshot might miss |
| 3 | Server logs / API response body | Confirms the backend did the right thing, but not that the UI reflects it |
| 4 | `tsc --noEmit` passing | Confirms syntax and types only, zero behavioral guarantee |
| 5 | `grep` confirming a string was changed | Confirms the edit landed in the file, not that it runs or works |
| 6 | "I changed the code" | Proves nothing. Never report this as verification. |

**Screenshot-per-change rule**: if the user requested N distinct changes, produce N post-change screenshots, one per change, each showing the specific element that changed. A single screenshot covering multiple changes is not sufficient proof for a multi-change request.

---

## 2. Verification protocol

### 2.1 Local Preview-based flow (for any UI-visible change)

1. Run the app with the API proxy intact: `npm run dev` (Vite dev server, has the `/api` proxy). Never use `vite preview` for functional checks, it serves static files only and all `/api/*` calls 404 silently.
2. Take a screenshot of the changed view.
3. Read the DOM text of the changed element (not just the screenshot) to catch truncation, wrong data binding, or stray characters (em-dashes, "undefined", raw JSON).
4. If the change touches a send or generate action, click the actual button and check network requests, not just that the UI updates.
5. Repeat once per requested change (see screenshot-per-change rule above).

### 2.2 Post-deploy Chrome checklist (for anything that reached a live URL)

1. Open the live URL in a real browser tab (not curl), confirm it loads without a white screen or console error.
2. Check `GET https://addvantageadvisory.fly.dev/api/health`. Expect `{"ok":true,"database":true}`. **Open item (verified 2026-07-05): this currently returns `{"ok":true,"database":false}`.** The repo's own CLAUDE.md verification protocol requires `database:true`; do not treat `ok:true` alone as healthy. Root cause undiagnosed (candidates: missing/rotated `DATABASE_URL` Fly secret, or paused Supabase project). Escalate, do not silently work around it. See propos-debugging-playbook for the triage path.
3. Confirm the bundle hash served matches the one you just deployed (see Recipe 5a).
4. Check the browser console for errors during the actual user flow you changed, not just on page load.
5. If the change involved a send, confirm via Recipe 5d (TEST_RECIPIENT redirect), never a live send to a real contact without approval.

---

## 3. Golden checks inventory

| Check | Command / action | Expected result | Failure means | Autonomy |
|---|---|---|---|---|
| Backend health | `curl -s https://addvantageadvisory.fly.dev/api/health` | `{"ok":true,"database":true}` | `database:false` = DB not connected, see open incident above | Safe autonomous (read-only GET) |
| Local typecheck (frontend) | `cd "PropOS root" && npx tsc --noEmit` | Exits 0, no errors | Type error somewhere in `src/` | Safe autonomous |
| Local typecheck (server) | `cd server && npx tsc --noEmit` | Exits 0, no errors | Type error in `server/` | Safe autonomous |
| Local build | `npm run build` | Vite build succeeds, `scripts/patch-html.cjs` runs, `dist/` synced to `server/public/` | Build script failure, missing asset | Safe autonomous (local only, no deploy) |
| Bundle identity check | Compare `dist/assets/index-*.js` hash to the hash served by the live URL | Hashes match if you intend them to | Mismatch means local is ahead (or behind) of live, see Recipe 5a | Safe autonomous (read-only) |
| Fly logs | `flyctl logs --app addvantageadvisory` | No repeating errors, `[migrate]` lines show `all N steps ok` | Migration or runtime errors in logs | Safe autonomous (read-only) |
| Preview Cloudflare Pages deploy | `npx wrangler pages deploy dist --project-name openhome-engine --branch <preview-branch>` | Deploys to a preview URL, not production | N/A, this is a preview by construction | Safe autonomous (per brief E.3, preview deploys are pre-approved) |
| Production Cloudflare Pages deploy | `npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true` (no branch = production) | Live URL updated | N/A | **Ask first** |
| Fly production deploy | `flyctl deploy --app addvantageadvisory` | Backend redeployed | N/A | **Ask first** |
| Any send (SMS/email/iMessage) | Clicking a send button, even with `TEST_RECIPIENT` redirect active | Message delivered to the redirect target | Silent failure, wrong transport picked | **Ask first**, always, even test-redirected |
| Paid LLM call (OpenAI/Anthropic) | Any `/api/generate`, `/api/vendor-generate`, `/api/slm-answer*` call | Text returned, cost incurred | N/A | **Ask first** (no-autofire rule, brief G.1) |
| DB migration against production | Any schema change applied to the live Supabase/Postgres instance | `[migrate] all N steps ok` in logs | `[migrate] FAIL <label>: <error>` for a specific step | **Ask first** |
| Read-only code audit | Reading files, grepping for patterns, static analysis | Findings reported with evidence, no files changed | N/A | Safe autonomous (brief E.3 explicit grant) |

---

## 4. Test-runner reality

`src/__tests__/slm.test.ts` and `src/__tests__/smoke.test.ts` both exist and both `import { describe, it, expect } from "vitest"` at their top line. They are well-formed vitest suites:

- `slm.test.ts` tests `createBlankSLM` and `getSLMCompleteness` from `../data/propertySlm`: blank-SLM defaults, 0% completeness on a blank record, and correct `filled`/`pct` counting once fields are set.
- `smoke.test.ts` tests pure helpers from `../views/demo/helpers` (`fmt`, `scoreColor`, `withAlpha`, `fmtYears`, `shortAddr`, `normaliseAddr`, `fullAddr`) plus the `Stage` type and `EMPTY_FORM` shape from `../views/demo/types`. Coverage is currency formatting, color-tier thresholds, hex-to-rgba conversion, address abbreviation, and form defaults.

**Confirmed (checked 2026-07-06): neither `/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/package.json` nor `server/package.json` lists `vitest` or `jest` in dependencies or devDependencies, and neither has a `test` script.** Root `package.json` scripts are `dev`, `server`, `build`, `preview`, `start` only (no `test`). `server/package.json` scripts are `dev`, `build`, `start` only. Running these test files today fails at the import step: `vitest` is not resolvable. Do not claim "tests pass" or "tests exist and run" in any report; the correct claim is "test files exist, are well-formed, cannot currently execute."

Until vitest is installed, real validation is: `npx tsc --noEmit` (root and `server/`) plus the screenshot verification protocol (Section 2) plus the health-endpoint checks (Section 3).

### [CANDIDATE] Adopting vitest properly

Installing `vitest` as a devDependency and wiring a `test` script is a new-tooling change. Per the autonomy matrix, adding new dependencies is not a read-only or preview-deploy action, it changes what ships and what CI expects. Route this through **propos-change-control** (sibling skill, approval matrix for new deps/tooling) before installing. Minimum shape once approved: `npm i -D vitest` in root (frontend tests use `src/` imports), a `"test": "vitest run"` script, and confirm CI (`.github/workflows/deploy.yml`) either runs it or explicitly does not block deploy on it (do not silently make CI stricter without flagging it).

---

## 5. Measurement recipes

### 5a. Bundle-hash live-vs-local comparison

Verified 2026-07-05: `propos.addvantage.site` and `openhome-engine.pages.dev` both serve bundle `index-DIv1vodj.js`. `propos-demo.pages.dev` is a dead project, it serves no matching bundle at all. Local `dist/assets/` contains `index-DLpKR__S.js`, a different hash, meaning local has undeployed changes not yet on either live URL.

Recipe:
```bash
# 1. Get the bundle filename referenced by the live HTML
curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'

# 2. Get the local build's bundle filename
ls dist/assets/index-*.js

# 3. Compare. Match = live has your latest local build. Mismatch = undeployed work exists.
```
If they mismatch and you expected them to match, you have unshipped local changes: this is informational, not itself a bug. If you need them to match for a demo, that's a production deploy, ask first (Section 3).

### 5b. DOM-read for generated text quality

Any LLM-generated outreach text (SMS, email subject, email body) must be read as rendered DOM text, not assumed correct from the prompt. History: mismatched Q&A pairs have shipped before (e.g. returning a subdivision-covenant answer for a vacancy-rate question) because a keyword-matcher fallback returned "first unshown" instead of `null` when no true match existed (brief G, "never return an irrelevant answer as a fallback").

Recipe:
```
1. Trigger the generation via its real UI button (never a scripted API call, see no-autofire rule).
2. preview_eval or get_page_text to extract the exact rendered string.
3. Check character-by-character for: em-dash (—), "undefined"/"null" literals, truncation, robotic phrasing.
4. If it's a Q&A match, manually re-read the buyer's question against the returned answer: does it actually address it, or is it a plausible-sounding non-sequitur?
5. Em-dash specifically: if found, verify all three layers exist: (1) prompt says never use them,
   (2) server-side sanitiser strips them (server/lib/sanitise.ts if present), (3) client-side
   fallback replace. A single missing layer is a latent bug even if this sample passed.
```

### 5c. Migration per-step log verification

The migration invariant itself (why each step is independent, `IF NOT EXISTS` idempotency) is owned by **propos-architecture-contract**; this is the QA-side recipe for confirming a migration ran cleanly after the fact.

`server/lib/db.ts` runs `migrate()` on every server boot when `pool` is set (line 58, called from the connection setup). Each step is `[label, sql]` tuple executed independently so one failure does not block the rest (comment at line 70: "Every step logs `[migrate] OK <label>` or `[migrate] FAIL <label>: <error>`"). The actual log emission is at the end of the function: per-step failure logs `console.error(`  [migrate] FAIL ${label}: ...`)` (db.ts:784), and the summary line is either `` [migrate] ${failed}/${steps.length} step(s) failed `` (db.ts:789) or `` [migrate] all ${steps.length} steps ok `` (db.ts:791) if none failed.

Recipe:
```bash
flyctl logs --app addvantageadvisory | grep '\[migrate\]'
```
Expect a single `[migrate] all N steps ok` line and zero `FAIL` lines. Any `FAIL` line names the exact step label (e.g. "ALTER contacts: agent_id") so you know precisely which table/column to inspect, no guessing needed.

### 5d. Send-path verification with approval note

Per the autonomy matrix (brief E.3, Section 3 above): any send (SMS, email, iMessage), even one redirected through the test layer, requires founder approval first. This recipe is for use only after that approval is given.

`TEST_RECIPIENT_PHONE` / `TEST_RECIPIENT_EMAIL` env vars redirect every send in test mode; demo-tagged contacts redirect to the `demo_target_phone` app_setting (brief G.23). Recipe once approved:
```
1. Confirm TEST_RECIPIENT_PHONE / TEST_RECIPIENT_EMAIL are set in the environment you're testing against.
2. Click the actual send button in the UI (not a curl to the send endpoint).
3. Check server logs for the transport that actually fired and its response (e.g. "Sent via BlueBubbles" or the specific cascade fallback used).
4. Confirm delivery arrived at the TEST_RECIPIENT target, not the real contact.
5. Read the delivered message text itself (5b applies here too) before calling the send "verified".
```
Never confirm a send is "working" from a 200 response alone; confirm the message actually arrived with correct content.

### 5e. Supabase row-count checks

For any change that inserts, seeds, or migrates rows in Supabase tables (e.g. `AddVantage_CRM`, `contacts`, `outreach_log`), verify counts before and after:
```sql
SELECT COUNT(*) FROM "AddVantage_CRM";
```
Compare against the expected delta from the operation you ran. The seeding-specific verification checklist (duplicate checks, priority_score sanity, required-field completeness) lives in **crm-seed**; do not duplicate that checklist here, just note that any CRM row-count check should cross-reference it for the full list of what "clean" means for that table.

### 5f. [CANDIDATE] Blind A/B voice-fidelity protocol

One of the three frontier goals (brief E.2) is voice fidelity: a recipient should not be able to tell AI-generated outreach from Cameron Knoll's own texting. There is currently no formal test for this. A candidate protocol: collect N real historic messages from Cameron alongside N AI-generated messages for comparable scenarios, present them blind (labels stripped) to a panel who knows Cameron's texting style, and measure correct-identification rate; a rate near 50% (chance) indicates fidelity, a rate near 100% indicates the AI voice is detectable. This is unbuilt and unvalidated: treat as [CANDIDATE] only. Full research methodology and milestone design belongs to **propos-research-frontier** (authored 2026-07-06, see Direction 2) with the experiment discipline in **propos-research-methodology**; this skill only owns the QA-side measurement recipe once that program runs.

---

## 6. Proactive audit checklist

Per the autonomy matrix (brief E.3), read-only code audits for robustness, vulnerabilities, and future failure modes are pre-approved without asking first. Each item below is a command a session can run unsupervised and report on:

| Audit target | Command |
|---|---|
| Dead/banned deploy targets lingering | `grep -rn "railway" "PropOS root"/*.toml "PropOS root"/server/Procfile 2>/dev/null` |
| Stray env reads before dotenv loads (ESM hoisting bug class) | `grep -rn "process\.env\." server/index.ts \| head -20` then manually confirm each is inside a function, not module top-level |
| Lazy vs eager API client init (crash-on-boot risk) | `grep -n "new OpenAI(\|new Anthropic(" server/lib/*.ts` and confirm each is inside a function/lazy getter, not executed at import time |
| CORS/rate-limit coverage on LLM endpoints (no-autofire compliance) | `grep -n "aiLimiter\|cors(" server/index.ts` and confirm every `/api/generate`-style route has both |
| requireAuth gate coverage | `grep -n 'app.use("/api"' server/index.ts` and confirm the gate appears after all intended-public routers and before all intended-protected ones (verified 2026-07-06: gate is at server/index.ts:225, public routers at lines 179-193, protected routers start line 232) |
| Stale doc references to nonexistent files | `grep -n "server/lib/twilio" CLAUDE.md` (file does not exist; actual transports are `sms.ts`, `bluebubbles.ts`, `shortcutRelay.ts`, `httpsms.ts`, `textingblue.ts`, `telelink.ts`, `androidgateway.ts`, `imsg.ts`) |
| Broken Stop hook path | `cat .claude/settings.json \| grep -A2 '"Stop"'` (known to reference a Linux path from a remote session, broken locally) |
| Secrets accidentally tracked | `git ls-files \| grep -i '\.env$'` (should return nothing; history was rewritten July 2026 to purge a leaked `server/.env`) |

Report findings with file:line evidence. Do not fix what you find here, see Section 7.

---

## 7. When NOT to use this skill

- If an audit or check in this skill finds something broken and you are asked to **fix it**, hand off to **propos-change-control** for the approval matrix on what can be changed autonomously versus what needs sign-off, and for the house rules that govern the fix itself.
- If you are debugging a specific reported symptom (a feature not working, an error a user hit) rather than running a general QA pass, use **propos-debugging-playbook**, which has the symptom-to-root-cause triage table, including the `database:false` open incident's triage path.
- If the question is about deploy mechanics themselves (which project name, which command, CI green-but-useless status) rather than verifying a specific change, see **propos-run-and-operate**.
- If the question is about environment variables and their defaults, see **propos-config-and-flags**.

---

## 8. Provenance and maintenance

Re-run these to catch drift in any claim made above:

```bash
# Health endpoint status (Section 2.2, item 1)
curl -s https://addvantageadvisory.fly.dev/api/health

# Bundle hash on live vs local (Recipe 5a)
curl -s https://propos.addvantage.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
ls dist/assets/index-*.js 2>/dev/null

# vitest/jest still absent from both package.json (Section 4)
grep -i "vitest\|jest" package.json server/package.json

# requireAuth gate position (Section 6)
grep -n 'app.use("/api"' server/index.ts

# migrate() log lines still match this shape (Recipe 5c)
grep -n '\[migrate\]' server/lib/db.ts

# fly.toml auto_stop / min_machines invariant still present
grep -n "auto_stop_machines\|min_machines_running" fly.toml

# no tracked .env files
git ls-files | grep -i '\.env$'
```
