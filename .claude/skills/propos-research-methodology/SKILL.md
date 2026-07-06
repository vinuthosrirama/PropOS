---
name: propos-research-methodology
description: "The discipline that turns a hunch into an accepted result in this project: the evidence bar (one mechanism must explain ALL observations including negatives, and survive adversarial refutation), hypothesis-predicts-numbers-before-running, the idea lifecycle from experiment flag to adopted change or documented retirement, and four worked examples from this project's real history. Triggers: 'prove it', 'how do we know that is the real cause', 'design an experiment', 'is this fix actually right', 'root cause analysis', 'the fix worked but I do not know why', 'should we adopt this approach', 'retire this idea', 'adversarial review'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Research Methodology and Proof Toolkit

"Prove it, do not just install it." This project has a long fix-after-feat history precisely because plausible-looking fixes were shipped without a mechanism. This skill is the antidote: how a hunch becomes an accepted result, with the recipes and this repo's own history as worked examples.

## 1. The evidence bar

A proposed mechanism (root cause, or claim that a change works) is accepted only when ALL of these hold:

- [ ] It explains **every** observation, including the negative ones (the things that surprisingly did NOT happen). A mechanism that explains 4 of 5 symptoms is a wrong mechanism with a coincidence attached.
- [ ] It survived an **assigned adversarial refutation** pass (§5): someone (you, in a deliberate second pass, or a second agent) actively tried to break it and failed.
- [ ] Its evidence is **written down with file:line / commit / log citations**, not remembered.
- [ ] The confirming experiment's outcome was **predicted before running** (§2).

Below this bar, the correct status word is "candidate", never "confirmed". propos-validation-and-qa owns what counts as proof-of-done for routine changes; this skill governs investigations and adopted approaches.

## 2. Hypothesis predicts numbers before running

Before any experiment, fix, or migration, write down the exact expected observation FIRST: the string, status code, count, hash, or pixel state you will see if the hypothesis is true, and what you will see if it is false.

```
Hypothesis: sends fail because no JWT is stored by Quick Access login.
Predicts: POST /api/auth/login is never called on Quick Access (network tab: 0 requests);
          every authFetch returns 401 (not 500, not timeout);
          sends via the normal login path SUCCEED.
If instead sends fail on normal login too -> hypothesis is wrong, stop patching auth.
```

If the observation diverges from the prediction, the hypothesis is wrong; the observation never is. Do not retrofit the hypothesis to the data and call it confirmed; write a new prediction and run again.

## 3. The idea lifecycle

| Stage | Artifact that records it |
|---|---|
| Idea | `NEXT_SESSION.md` ideas bank entry |
| Experiment | Behind a flag: `app_settings` DB toggle or env var (mechanics: propos-config-and-flags). Never wired into the default path. |
| Measured result | SESSION_LOG.md entry with the predicted vs observed numbers |
| Adopted | Change routes through propos-change-control gates (classification, checks, approval where required); the owning skill/doc is updated in the same session |
| Retired | An entry in propos-failure-archaeology: symptom/idea, why it failed, evidence, status:retired. This is mandatory; an undocumented retirement WILL be re-fought by a future session. |

## 4. Worked examples from this repo's history (verified in the artifacts cited)

### 4.1 Per-step migrations (the diagnostic-bandwidth win)
- **Question:** why did each deploy reveal only ONE migration failure at a time?
- **Mechanism:** multiple SQL statements batched in one `pool.query()` fail as a unit; the first error masks the rest.
- **Experiment:** split into a per-step loop with labelled try/catch (`server/lib/db.ts`, `migrate()`), predicting: one deploy will now surface every failing step.
- **Result:** all 3 latent failures surfaced in a single deploy instead of one per deploy cycle (CLAUDE.md Session Lessons, 2026-06-09 `[win]` entry). **Adopted**; now a change-control per-class check.
- **Transferable recipe:** when debugging is slow, first increase how much each run TELLS you, then debug.

### 4.2 Quick Access JWT (one mechanism explains all observations)
- **Symptom set (SESSION_LOG.md 2026-06-19):** sends "not working" but showing the "Saved to Sheets" fallback; only via the Quick Access button; normal login fine.
- **Mechanism:** Quick Access called `onLogin()` directly, never `/api/auth/login`, so no JWT stored → server enforces `requireAuth` when DB connected → every `authFetch` 401 → `deliveryRes = null` → fallback message. One chain explains: why fallback (not error), why only Quick Access, why only when DB connected.
- **Fix + proof:** `POST /api/auth/demo-token` (registered BEFORE the auth gate), verified by live curl returning `{"accessToken":"eyJ..."}` and a subsequent healthy send path.
- **Transferable recipe:** enumerate every distinct symptom first; reject any explanation that leaves one unclaimed.

### 4.3 Health endpoint behind the auth gate (discriminating check beats assumption)
- **Symptom (2026-06-09 `[avoid]` lesson):** health check failing after a deploy; the reflex hypothesis "server is down" was wrong.
- **Discriminating check:** is the failure a 401 (auth) or a connection error (down)? It was auth: the health route was registered AFTER `requireAuth`.
- **Adopted rule:** public routes register before the gate (architecture invariant; `scripts/route-guard-audit.sh` in propos-diagnostics-and-tooling now measures it).
- **Transferable recipe:** pick the one observation that CLEAVES the hypothesis space (401 vs ECONNREFUSED), before touching anything.

### 4.4 The Framer span saga (adversarial refutation, from the sibling repo)
- **Where:** addvantage-main-site `HANDOFF.md` rules 12-17, dated 2026-06-27, explicitly "3 failed attempts before finding this".
- **Symptom:** site sections rendered as visible dark boxes with invisible text; "page ends at the hero".
- **Three plausible fixes failed:** (1) JS `querySelectorAll` opacity fix: undone because Framer's async `main.mjs` runs AFTER it and resets inline styles; (2) `nudgeFramerObservers()` 1px scroll: only triggers IntersectionObserver near the viewport top, everything below the fold stays hidden; (3) hiding/showing via display toggles raced the appear animation.
- **Accepted mechanism:** 220 anonymous `<span style="opacity:0.001;transform:translateY(...)">` text spans (no class, no data attribute) hidden by Framer's split-text animation, re-applied by its JS post-hydration; only a stylesheet `!important` rule beats non-important inline styles, hence `span[style*="opacity:0.001"]{opacity:1!important;...}`. This explains all three failures (why JS fixes revert, why the nudge only helped the top, why the spans were invisible to selector-by-class approaches).
- **Transferable recipe:** each failed fix is DATA about the mechanism. Log what each failure rules out; the surviving explanation must account for why every earlier attempt failed.

## 5. Assigned adversarial refutation protocol

Before promoting candidate → confirmed, run this attack checklist deliberately (self-assign a second pass, or hand to a second agent with ONLY the claim and the evidence, not your reasoning):

- [ ] **Alternative mechanism:** name at least one other cause that fits most observations; find the observation that discriminates, and check it.
- [ ] **Stale state:** would a stale deploy, cached bundle, un-synced `server/public/`, or old `tsx` process (no watch) produce the same "confirmation"? (bundle-drift.sh exists because this one bites.)
- [ ] **Wrong environment:** did you observe prod while editing local, or vice versa? Which URL, which Pages project, which DB?
- [ ] **Config drift:** could an `app_settings` DB override or env difference explain it instead of your code change?
- [ ] **Coincidental timing:** did something else change in the window (another deploy, a cron, Supabase state)? Check git log and deploy history for the interval.

If the claim survives, record it with the checklist noted as run. If it dies, thank the process and update the hypothesis.

## 6. Where good ideas historically came from (keep these channels open)

- **The live user:** Cameron's "target vendors, not buyers" reshaped the product's direction.
- **fix-after-feat patterns:** the auto-accumulated `[avoid]`/`[win]` lessons (CLAUDE.md LESSONS block; `docs/SESSION_LESSONS.md`) are a mined vein of process improvements; read them quarterly.
- **Incidents:** the OpenAI key leak produced the no-autofire and env-hygiene rules (propos-failure-archaeology has the narrative).
- **External audits:** a 2026-07-03 two-repo audit produced most of the current hardening backlog; periodic zero-context audits find what resident sessions are blind to.

## When NOT to use this skill

- Routine symptom triage with a known playbook entry → **propos-debugging-playbook**
- Proof-of-done for a normal feature/fix → **propos-validation-and-qa**
- Choosing WHAT to research → **propos-research-frontier**
- Whether the resulting change may ship → **propos-change-control**

## Provenance and maintenance

Worked examples verified 2026-07-06 against: CLAUDE.md Session Lessons block (2026-06-09/11 entries), SESSION_LOG.md (2026-06-19 entries), `server/lib/db.ts` migrate structure, and addvantage-main-site `HANDOFF.md` rules 8-17. Re-verify:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
grep -n "per-step migration" CLAUDE.md                       # lesson entry still present
grep -n "demo-token" SESSION_LOG.md | head -2                # JWT case still documented
grep -n "3 failed attempts" "/Users/vinuthmacbook/Desktop/addvantage-main-site/HANDOFF.md"
ls docs/SESSION_LESSONS.md
```
