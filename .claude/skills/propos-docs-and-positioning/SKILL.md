---
name: propos-docs-and-positioning
description: "Templates and house writing style for PropOS docs of record, plus the external positioning discipline: what may be claimed to prospects or publicly, the proof obligation per claim class, what is genuinely novel vs known, and the reproducibility standard for anything shown outside. Triggers: 'write the session log entry', 'update the docs', 'skill template', 'can we claim this', 'is this number real', 'marketing copy', 'what goes on the landing page', 'write a case study', 'pitch deck claims', 'house style', 'which file do I update'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Docs and External Positioning

Two jobs: (A) keep the docs of record uniform via templates, and (B) keep every externally visible claim honest and proof-backed. The docs-of-record MAP (which file owns which fact) and approval gates are owned by propos-change-control §5; this skill owns the templates, style rules, and claims discipline. One home per fact: on conflict, change-control wins.

## 1. Templates

### 1.1 SESSION_LOG.md entry (append, newest at top; derived from the file's real entries)

```markdown
## YYYY-MM-DD: Short title of what this session did

**Fixed / Built:** what changed; for fixes, the root cause, not just the patch.

**Verified (Preview screenshots):** what you SAW rendered, described concretely ("SMS bubble shows 'Hi James, Cameron here...'"), never "it works".

**tsc:** root + server, clean, or the pre-existing error count left untouched.

**Deployed:** what went where (project names), or "not deployed" + why.

**Next:** the exact next step for the following session.
```
Same-day continuations suffix the header with `(cont.)`, `(later)`, or `(latest)`.

### 1.2 NEXT_SESSION.md ideas-bank entry

```markdown
## IDEA: <one-line name> (added YYYY-MM-DD)
**Problem it solves:** ...
**Sketch:** files/approach in 3-5 lines.
**Status:** parked | speculative | ready-to-build (needs founder ok)
```

### 1.3 docs/*.md subsystem guide skeleton (pattern of the better existing guides like docs/SMS_AGENT.md)

```markdown
# <Subsystem> — What it is, how it works, how to operate it
## Purpose (2 lines)
## Architecture (files, data flow)
## Configuration (vars: name + purpose only, values never)
## Operating it (commands)
## Failure modes (symptom -> fix)
## History / decisions (dated)
```

### 1.4 SKILL.md skeleton (keeps the library uniform)

```markdown
---
name: <kebab-name>
description: "<when to load it, with quoted trigger phrases>"
metadata:
  author: addvantage
  version: "1.0.0"
---
# Title
<sections: imperative voice, tables, checklists>
## When NOT to use this skill  (route to siblings by name)
## Provenance and maintenance  (verification date + one-line re-check commands)
```

## 2. House writing style (each rule has a source; all enforceable)

| Rule | Applies to | Source |
|---|---|---|
| No em-dashes, ever (use comma, colon, period, "to") | Code strings, docs, commits, UI, skills, generated text | CLAUDE.md Code Rule 3; triple runtime defence exists for generated text (propos-change-control §3); docs rely on discipline + `emdash-scan.sh` |
| No emoji; plain `✓ ✕ →` only | UI, docs | CLAUDE.md Code Rule 4 |
| Product is "PropOS" powered by "AddVantage AI"; never surface GPT/Claude/OpenAI/Anthropic in anything user-facing | UI, marketing, pitches, generated text | CLAUDE.md Code Rule 5; the product is sold as AddVantage's own technology |
| Default agent: Cameron Knoll @ Peake Real Estate, Berwick; never "Simon"/"Harcourts" | Demo data, copy | CLAUDE.md Code Rule 6 |
| Australian English in user-facing copy ("sanitise", agency-appropriate phrasing) | UI, outreach | Codebase convention (e.g. `server/lib/sanitise.ts`); verify spelling choices against existing copy before "fixing" them |
| Outreach voice rules (sign-offs, SMS length, tone) | Generated/drafted outreach | Owned by propos-rea-domain-reference; do not restate here |
| Commit prefixes `feat: fix: chore: docs: security:` | Commits | propos-change-control §6 |

## 3. Skill library maintenance

- A fact changed? Update the OWNING skill in the same session that discovered it (change-control §5 rule). A correction living only in SESSION_LOG.md will be missed.
- Each skill ends with Provenance one-liners: run them when you load a skill and something feels off; fix the skill, not your memory.
- Skill edits are docs-only changes: local commit fine, push ask-first.
- New skills follow §1.4 and must name their siblings in "When NOT to use" so the routing graph stays complete.

## 4. External positioning and claims discipline

### 4.1 Claim classes and their proof obligations

| Claim class | Example | May be used externally when |
|---|---|---|
| Performance number | "18% response rate", "+3.8 rebookings" | The number traces to a measurement artifact (analytics table, campaign ledger) from OUR data, OR is explicitly labeled illustrative/industry-typical in the artifact itself. A number in the UI (e.g. the ReviewPanel response-rate line, NEXT_SESSION session 14 item 9) is a marketing surface: verify what it cites before reusing it in a pitch. No measured number exists yet for reply rates as of 2026-07-06 (see propos-research-frontier Direction 2); until then, do not state one as ours. |
| Capability | "AI answers buyer questions about your listing" | The feature is live on the demo the prospect will actually see, screenshot-verified, on synthetic data. Branch-only features do not exist for positioning purposes. |
| Identity | "powered by AddVantage AI" | Always this form; never the vendor model names (§2). |
| Compliance | "Spam Act compliant, unsubscribe honoured" | The mechanisms exist in code (`server/routes/unsubscribe.ts`, `server/routes/gdpr.ts`, opt-out handling in `server/lib/compliance.ts`); the deep law-as-coded detail is owned by propos-rea-domain-reference. State what the code does, not legal advice. |
| Comparison | "vs pitch-suite" comparison table (landing page) | Every row is checkable against the competitor's public materials; keep the receipts list with the artifact. |

### 4.2 Novel vs known (honest inventory, 2026-07-06)

| Piece | Status |
|---|---|
| Per-agent voice corpus feeding template-first generation | Novel-ish assembly; the differentiator IF Direction 2's numbers land. Until measured: "our approach", not "proven better". |
| Per-property SLM Q&A matching for buyer questions | Assembly of known parts (retrieval + matching); solid engineering, not research. Position as product capability, not breakthrough. |
| Multi-transport SMS cascade with safety redirects | Engineering robustness; positions as reliability, not innovation. |
| Autonomous reply agent | OPEN/candidate (frontier Direction 1). Never position as shipped autonomy. |
| Concierge (Wizard-of-Oz) delivery | A delivery model, invisible to positioning; never promise self-serve. |

### 4.3 Reproducibility standard for anything shown publicly

A demo shown to a prospect must be reproducible by a fresh session from `provision-agent-demo` on synthetic data only (founder rule 2026-07-06: no real client/buyer data in prospect-facing artifacts). If a demo needs hand-tweaks to look right, the tweaks go into the provisioning path or the demo is not shown.

## 5. Marketing surfaces inventory (status 2026-07-06)

| Surface | Where | Status |
|---|---|---|
| Standalone landing page | `landing/index.html` (GSAP + three.js, no build step) | Built + verified 2026-06-11; NOT deployed, hosting decision open |
| Legacy landing HTML archives | `PropOS_Landing_*.html`, `ARCHIVE_PropOS_Landing_*` (workspace + repo root artifacts) | Historical; do not extend |
| Pitch templates | `src/components/pitch/ListingProposalTemplate.tsx`, `DigitalIntroductionTemplate.tsx` | In-product, live |
| Buyer investment brief | `src/components/BuyerPitchReport.tsx` | In-product, live |
| One-pager PDF / equity report | agent-lead-gen templates (see propos-first-customer-campaign §4) | Campaign assets |
| Advisory business site | Separate repo `addvantage-main-site` (own skill library) | Live business site; its rules live in its own skills |

## When NOT to use this skill

- Which file owns a fact / approval to change docs → **propos-change-control**
- Outreach copy voice, GCI math, Spam Act detail → **propos-rea-domain-reference**
- Executing the sales campaign → **propos-first-customer-campaign**
- Engineering evidence standards → **propos-validation-and-qa**
- What is on the research roadmap → **propos-research-frontier**

## Provenance and maintenance

Verified 2026-07-06 against SESSION_LOG.md entry formats, CLAUDE.md Code Rules, route files, and NEXT_SESSION.md. Re-verify:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
grep -n "Verified (Preview screenshots)" SESSION_LOG.md | head -3   # entry format unchanged
ls server/routes/unsubscribe.ts server/routes/gdpr.ts server/lib/compliance.ts
ls landing/index.html src/components/pitch/
grep -n "Response Rate Claim" NEXT_SESSION.md                        # the UI claim surface still exists
```
Re-check §4.2 whenever a frontier direction produces a measured result: positioning upgrades only on numbers.
