---
name: propos-research-frontier
description: "Open problems where PropOS/AddVantage could advance the state of the art, selected by the founder 2026-07-06: the autonomous outreach agent, voice fidelity + conversion, one-founder leverage, and revenue-engine breadth. For each: why current SOTA fails, this project's specific asset, the first three concrete steps, and a falsifiable milestone. Triggers: 'what should we research next', 'what makes this novel', 'long-term roadmap', 'can the SMS agent run autonomously', 'how do we prove the outreach is better than human', 'scale to more agents', 'revenue engine', 'what is the frontier'. Everything here is open/candidate unless explicitly marked shipped."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Research Frontier

Four founder-selected directions (2026-07-06). Nothing here is a promise; each item is a candidate with a falsifiable exit condition. New frontier items enter through propos-research-methodology (hypothesis predicts numbers, evidence bar), and anything that changes behavior routes through propos-change-control. The frontier never overrides the campaign: while there is no paying customer, propos-first-customer-campaign outranks all of this.

Market-context claims below are as-of-early-2026 general knowledge, not repo facts; re-check before citing externally.

---

## Direction 1: The autonomous outreach agent

**Goal:** an agent that safely runs the full follow-up loop (inbound reply → qualify → answer property questions → book the appraisal) with the founder reviewing exceptions, not every message.

**Why current SOTA fails:** proptech CRMs (AgentBox-class, Follow Up Boss-class) ship templated drip sequences and "AI reply suggestions" that a human must click; full-loop autonomy fails on (a) trust: one wrong message to a real vendor is a relationship-ending event, (b) no per-agent voice, (c) no property-grounded answers, so bots deflect questions they should answer. Nobody ships click-free loops because they cannot bound the failure cost.

**This project's asset (verified in-repo 2026-07-06):** a working 4-stage conversational agent already exists: `server/lib/smsAgent.ts`, `server/lib/smsOrchestrator.ts`, `server/routes/sms-agent.ts`, `server/routes/webhook.ts`, `docs/SMS_AGENT.md`, with autonomy flags (`SMS_AGENT_AUTOSEND` family, see propos-config-and-flags), a multi-transport send chain, per-property SLM Q&A grounding (`src/data/propertySlm.ts`, `slm-answer` routes), and a TEST_RECIPIENT redirect safety net. That is 80% of the plumbing SOTA lacks.

**The blocking gap (do this first):** the inbound webhook has NO idempotency (2026-07-03 audit finding: zero dedupe in the inbound path). A provider webhook retry can double-text a real person. Autonomy on top of a non-idempotent inbound is disqualified by definition.

**First three steps:**
1. Add inbound idempotency: dedupe on provider message id (or hash of sender+body+timestamp bucket) persisted in a table, tested with a replayed webhook payload against a local server. (PropOS: `server/routes/webhook.ts` + a migration per the per-step pattern in `server/lib/db.ts`.)
2. Build the exception funnel: define the classes the agent must NEVER answer alone (price commitments, legal/contract, complaints, opt-out) and route them to founder review; encode as tests-before-code per propos-research-methodology.
3. Shadow mode: run the agent on real inbound with autosend OFF, log what it WOULD have sent alongside what the founder actually sent, for N≥50 inbound messages. (Advisory repo tie-in: none needed; say so honestly.)
**You have a result when:** over ≥50 consecutive shadow-mode inbounds, ≥90% of agent drafts are approved unedited by the founder AND 100% of exception-class messages were correctly routed to review. Then, and only then, propose limited autosend behind the existing flag, founder-gated.

**Fences:** founder-sent rule currently applies to PROSPECT outreach absolutely; this direction concerns replies to already-engaged contacts and still requires explicit founder approval per phase. No-autofire LLM rule stands.

---

## Direction 2: Voice fidelity + conversion (measurably better than human)

**Why current SOTA fails:** generic LLM outreach reads generic; reply rates collapse. Tools do "tone presets", not a specific named agent's voice with evidence it converts. Nobody publishes agent-level A/B numbers.

**This project's asset (verified):** a per-agent voice corpus that grows on every send (`lib/sheet.ts` writes VoiceCorpus entries; Settings voice editor), the template-first outreach engine (commit `f0d914b`, cut LLM cost ~95% and made output deterministic), the triple em-dash defence and sanitisation layer, per-property SLM data, and script variants already structured for comparison (Tom Panos scripts A/B/C, NEXT_SESSION session-14 record).

**First three steps:**
1. Define the metric pipeline: reply-rate and appraisal-booked-rate per variant, computed from the events/analytics tables (verify current schema via `server/routes/analytics.ts`), not by eye.
2. Freeze a baseline: founder-written messages' historical reply rate over the last N sends (from the target list / CRM records).
3. Pre-register (write down BEFORE running) the expected delta for template-engine drafts vs founder-written, then run the comparison on the next campaign wave, founder sending both arms.
**You have a result when:** over ≥100 sends per arm, machine-drafted (founder-sent) messages match or beat the founder's own reply rate with the difference stated numerically. That number becomes a marketable claim per propos-docs-and-positioning (until then, no external claims).

---

## Direction 3: One-founder leverage (operational SOTA)

**Why current SOTA fails:** agencies scale outreach with headcount (VAs, ISAs). Software vendors scale with self-serve onboarding that real estate agents notoriously abandon. Neither gets one person to N concurrent agent-clients with quality intact.

**This project's asset (verified):** the multi-agent provisioning system (`provision-agent-demo` skill + server provision script + `AGENCY_THEMES` in `src/data.ts` + per-agent auth), concierge delivery already proven with Cameron, launchd/cron automation surfaces (propos-run-and-operate owns the inventory), and the diagnostics scripts (propos-diagnostics-and-tooling) that make health checkable in seconds.

**First three steps:**
1. Time-audit the concierge loop: measure (wall-clock) every manual step of serving Cameron for one week: CRM export processing, draft review, sends, reporting.
2. Automate the single largest measured step behind a flag; predict the minutes saved before building (methodology rule).
3. Write the "agent #2 onboarding runbook" as a dry run of provisioning a second real client end-to-end on synthetic data, and time it.
**You have a result when:** the measured founder-minutes per agent per week drops below 60 while pilot-quality metrics (Direction 2's numbers) hold, demonstrated for ≥2 concurrent agents for ≥2 weeks.

---

## Direction 4: Revenue-engine breadth

**Status: candidate, not started (as of 2026-07-06).** Design research done 2026-07-05: a 5-stream revenue portfolio with a bandit-allocator (multi-armed bandit reallocating founder time/spend across streams by measured yield). Docs live in the founder's workspace outside these repos (AddVantage Advisory / Revenue Engine); the founder was awaiting four scope answers before any build. Do not start this without those answers.

**Why current SOTA fails:** solo-founder portfolio management is folklore (gut allocation); no tooling closes the loop from per-stream revenue telemetry to time allocation.

**This project's asset:** two already-instrumented streams (PropOS, Advisory site demo funnel), shared infra (Cloudflare, Fly, Supabase), and this skill library making each stream cheap-session-operable, which is what makes multi-stream feasible for one person at all.

**First three steps:**
1. Get the founder's four scope answers recorded (blocking).
2. Define per-stream telemetry: one revenue/effort ledger with a row per stream per week (PropOS: campaign metrics from `concierge_target_list.xlsx`; Advisory: demo-form submissions from the site's functions, see the advisory-* skills in the addvantage-main-site repo).
3. Run the allocator on paper for 2 weeks (no code): does the bandit's suggested allocation differ from the founder's instinct, and by how much?
**You have a result when:** the paper allocator's recommendations, followed for one month, produce a measured revenue/hour improvement over the prior month's baseline. Until a baseline exists this direction cannot start; that is the point.

---

## Proposing a new frontier item

One page: why SOTA fails, our specific asset (file paths), first three steps, the falsifiable milestone, and the pre-registered numbers. It enters as open/candidate here, runs per propos-research-methodology, and graduates or retires with the evidence written down (retirements go to propos-failure-archaeology so they are not re-fought).

## When NOT to use this skill

- Selling to the first customer → **propos-first-customer-campaign** (outranks the frontier until revenue exists)
- How to run an experiment properly → **propos-research-methodology**
- What exists today and why → **propos-architecture-contract**
- Flag mechanics for experiments → **propos-config-and-flags**

## Provenance and maintenance

Directions selected by the founder 2026-07-06. Asset claims verified against the repo 2026-07-06. Re-verify:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
ls server/lib/smsAgent.ts server/lib/smsOrchestrator.ts server/routes/sms-agent.ts server/routes/webhook.ts
grep -rn "dedupe\|idempot" server/routes/webhook.ts server/lib/smsAgent.ts   # still no idempotency? Direction 1 step 1 still open
git log --oneline --all | grep f0d914b                                       # template-first engine commit still in history
ls .claude/skills/provision-agent-demo/SKILL.md
grep -n "VoiceCorpus" src/lib/sheet.ts 2>/dev/null || grep -rn "VoiceCorpus" src/lib/
```

Direction 4's docs are outside this repo; confirm their location with the founder before citing them.
