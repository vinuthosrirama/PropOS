---
name: propos-first-customer-campaign
description: "The executable, decision-gated campaign for PropOS's hardest live problem: converting a first PAYING customer (SE Melbourne real estate agents; Cameron Knoll at Peake is the live beta relationship). Load this when asked to 'work on GTM', 'get the first customer', 'draft outreach to agents', 'prepare a demo for an agent', 'follow up with Cameron', 'what is the sales plan', 'pricing for PropOS', 'pilot onboarding', 'why is nobody converting', or when a session wonders whether to build features or sell. Also load before ANY prospect-facing work so the founder-sent rule is never violated."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS First-Customer Campaign

Confirmed by the founder on 2026-07-06 as the hardest live problem: PropOS has heavy feature velocity and zero revenue. This skill is the campaign to change that. It is written so a session can execute a phase without judgment calls, and so no session ever mistakes drafting for sending.

## 0. Governance (read first, non-negotiable)

These route through propos-change-control; this skill may never be used to route around it.

1. **ALL external outreach is founder-sent** (founder decision 2026-07-06). A session researches, drafts, and stages. Vinuth personally sends every message, makes every call, attends every meeting. For "can I send this" the answer is always no. **The draft package is the deliverable** (format in §6).
2. **No real client/buyer data in demos or prospect-facing artifacts.** Synthetic or redirected contacts only (founder decision 2026-07-06).
3. **Prospect demos deploy ONLY to isolated subdomains** (pattern `demo.<slug>.addvantage.site`), never to `openhome-engine` (PropOS production) or `addvantage-advisory` (Advisory production). Founder drew this boundary explicitly on 2026-07-05.
4. No paid LLM calls, sends, pushes, or production deploys without approval (propos-change-control §1).

## 1. Mission and definition of done

**Done = money received:** a SE Melbourne agent on Tier 1 or Tier 2 (below) with the first payment cleared, or a signed Tier 2 success-fee agreement with the first tracked listing in flight. NOT done: "demo went well", "he said he loves it", "pilot started". Those are phase gates, not the finish line.

Campaign start: 2026-06-02 (founder's 20-day sprint plan). Status as of 2026-07-06: Cameron Knoll is an active unpaid beta user; no paying customer yet. Re-verify current status at P0 before acting, this line goes stale fastest.

## 2. The offer (pricing canon, Hormozi Grand Slam structure)

| Tier | Offer | Terms | Status |
|---|---|---|---|
| 0 | Free Pilot | First 3 agents, 14 days, equity report + 20 messages | Active recruiting tool |
| 1 | Founder's Rate | $199/month, first 10 agents, locked forever | Primary conversion target |
| 2 | Success Fee | $799 per listing won, no monthly | Alternative for monthly-averse agents |
| 3 | Pro | $399/month self-serve | Future, do not pitch yet |
| 4 | Agency Bundle | $299/seat/month | Parked, do not pitch |

Delivery is concierge (Wizard-of-Oz): the founder manually processes CRM exports behind the scenes until the product is self-serve. Never promise self-serve onboarding.

**Founder constraints that shape everything:** 1-2 hours/day available, 5-15 warm agent contacts, car for Melbourne meetings, bootstrap budget.

## 3. Channels (priority order, with fences)

1. **iMessage** (best): warm, personal, high open rate.
2. **Phone calls** (founder only, obviously).
3. **LinkedIn DMs.**
4. **In-person office visits** (SE Melbourne, founder drives).
5. **Referral asks** through Cameron and any pilot agent.

**FENCED OFF: cold email.** The outreach domain was not warmed as of June 2026 (2-3 weeks minimum from then). Verify warm-up status with the founder before ANY email wave; assume unusable until told otherwise.

## 4. Assets inventory (verify at P0, machine-local paths dated 2026-07-06)

| Asset | Where | Use |
|---|---|---|
| Prospect list (SOURCE OF TRUTH) | `concierge_target_list.xlsx` in the founder's Claude Property workspace (`/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/`) | Founder hard rule: read before write; every row fully populated or swapped out. All prospect state tracking lives here. |
| iMessage automation | same workspace, `agent-lead-gen/src/outreach/imessage.ts` | osascript sender, rate-limited 10/day. CLI: `npx tsx run.ts imessage --dry-run --tier A --limit 5`. **Only ever run with `--dry-run` yourself**; a live run is a send and is founder-only. |
| Message variants | `agent-lead-gen/.../variants.json` | 4 iMessage + 3 email PropOS sales variants (old buyer variants deactivated). Draft new prospect messages as additions here, not ad hoc. |
| Equity report template | `agent-lead-gen/templates/PropOS_Equity_Analysis_TEMPLATE.xlsx` | The Tier 0 pilot deliverable. |
| One-pager | `agent-lead-gen/templates/PropOS_OnePager.pdf` | Leave-behind for visits / attach for DMs. |
| Demo provisioning | this repo, `provision-agent-demo` skill + `agents.json` profiles | Personalised demo per interested agent. |
| CRM of agents | `crm-seed` skill + Supabase + `docs/ADDVANTAGE_CRM.md` | Who to target; seeding new prospects. |
| Competitive intel | Claude Property workspace `gtm/research/competitive-intel.md` | Objection handling material. |
| Marketing landing page | this repo, `landing/index.html` | Built 2026-06-11, verified, NOT deployed (project decision open). |

## 5. Phases with gates

Each phase: objective → actions → gate (expected observation) → branch if the gate fails.

### P0: State audit (every campaign session starts here, ~10 min)
- Read the last 3 SESSION_LOG.md entries and `concierge_target_list.xlsx` (or ask the founder for its current state if the workspace is unavailable).
- Establish: last outreach wave date, replies outstanding, demos promised, pilots running.
- **Gate:** you can state "N prospects contacted, M replied, K demos pending, pilot status X" with sources. If you cannot, STOP and reconstruct from the founder before drafting anything new; duplicate outreach to the same agent is a relationship-burner.

### P1: Cameron referral wave (highest-leverage single action)
- Objective: 2-3 warm referrals + Cameron's own pilot-to-paid conversation.
- Action: draft (a) a referral ask in Cameron's relationship register, and (b) the Tier 1 founder's-rate conversation script for Cameron himself. Product truth to lean on: his own feedback shaped the product (he said target VENDORS, not buyers, and the vendor-first pivot was built).
- **Gate:** founder sends; expect a reply within 3 days (iMessage norm).
- Branch: no reply in 3 days → draft a soft bump referencing something concrete (a new listing of his, an open home). No reply after bump → park 2 weeks, move to P2; do NOT escalate frequency.

### P2: Tiered prospect waves
- Objective: 5-10 drafted first-touch messages per wave, founder sends ≤10/day (matches the tooling's rate cap).
- Action: pull tier-A prospects from the target list; personalise per variant in `variants.json` (agent's suburb, a recent sold listing of theirs, dormant-GCI hook: propos-rea-domain-reference owns the GCI math). Stage with `--dry-run` output for founder review.
- **Gate:** reply rate. Expect 1-3 replies per 10 warm-ish contacts. 0 replies across 20+ sends → the message or the list is wrong: branch to the solution menu (§7), do not just send more volume.

### P3: Demo per interested agent
- Objective: an agent who replied gets a personalised demo within 48h of interest.
- Action: run `provision-agent-demo` with their profile (synthetic data only, rule §0.2); deploy to an isolated subdomain (rule §0.3); draft the demo-invite message with the URL.
- **Gate:** agent actually logs in (check analytics/events). Demo sent but never opened within 4 days → draft one nudge tying it to their named listing; still nothing → mark cold in the target list with date, recycle in 30 days.

### P4: Pilot onboarding (Tier 0)
- Objective: convert demo interest into a running 14-day pilot with defined success numbers.
- Action: draft the pilot kickoff pack: equity report for their farm suburb (template above), the 20-message allocation plan, and a WRITTEN success criterion agreed up front (e.g. "≥3 vendor replies or ≥1 appraisal booked in 14 days"). Concierge reality: founder processes their CRM export manually.
- **Gate:** the agreed numbers, measured, at day 7 and day 14. Numbers met → P5 immediately, do not let the pilot drift past day 14 unpriced. Numbers missed → diagnose honestly (message quality vs list quality vs product gap) and either fix-and-extend once (max 7 days) or close it as a documented no.

### P5: Conversion to paid
- Objective: the ask.
- Action: draft the conversion conversation: recap the pilot's measured numbers, offer Tier 1 ($199 locked) vs Tier 2 ($799/listing) explicitly, silence after the ask. Objection menu: "too busy" → concierge does the work, 0 extra workload; "price" → one dormant-GCI listing pays for years of Tier 1 (use the real GCI calculator numbers); "need approval" → offer the principal a seat at the same rate.
- **Gate:** payment received or signed Tier 2 agreement. A "yes" without payment within 7 days → draft one payment-link follow-up, then founder decides.

### P6: Post-sale referral loop
- First paying agent immediately gets the referral ask draft (one warm intro = pipeline compounding) and a case-study request. Their measured pilot numbers become the (proof-backed) claims for the next wave, per propos-docs-and-positioning claims discipline.

## 6. The draft package format (what a session hands the founder)

Every P1/P2/P3/P5 output is one message to the founder containing:
1. WHO: name, agency, suburb, tier, last-contact date (from the target list).
2. CHANNEL: which of §3 and why.
3. THE DRAFT: exact text, under 160 chars for iMessage first-touch, Cameron-voice rules per propos-rea-domain-reference, no em-dashes.
4. EXPECTED NEXT: what a reply/non-reply means and the pre-planned follow-up.
5. LIST UPDATE: the exact row/field updates to make in `concierge_target_list.xlsx` once sent.

## 7. Solution menu for stalls (ranked, with proof obligations)

| Stall | Try in order | Before trying, you must |
|---|---|---|
| No replies (P2) | 1. Swap hook to dormant-GCI with their real numbers. 2. Switch channel iMessage→LinkedIn. 3. Shrink to 3 hyper-personalised drafts/day. 4. In-person visit shortlist for founder. | Show the current variant's exact text and reply stats; predict the new expected reply rate and measure against it (propos-research-methodology). |
| Demos unopened (P3) | 1. Send at 7-8pm (agents' admin hour). 2. Video walkthrough link instead of login. 3. Print one-pager, founder drops it at the office. | Check the events table actually records opens before concluding "unopened". |
| Pilot inertia (P4) | 1. Founder does the week-1 work FOR them entirely. 2. Reduce asked-of-agent steps to zero. 3. Shorten pilot to 7 days with one concrete deliverable. | Identify which step the agent stalled at, with evidence, not vibes. |
| Price objection (P5) | 1. Tier 2 reframe (pay only on a win). 2. Pilot-extension with prepay credit. 3. Walk away politely, 60-day recycle. | Never discount below Tier 1; the founder locked that floor. |

## 8. Fenced wrong paths (do not re-litigate)

- **Cold email on the unwarmed domain** (§3). Burns the domain for months.
- **Targeting buyers instead of vendors.** Cameron's core feedback; the product pivoted to vendors. Buyer-first pitches contradict the live user's stated need.
- **Auto-sending anything.** Founder-sent rule, plus the no-autofire LLM rule (propos-change-control).
- **Building features as displacement activity.** The repo's history is months of features with zero revenue. A campaign session that ends with only code and no draft packages has failed this skill. Product changes during the campaign need a named prospect whose conversion they unblock.
- **Demoing on production projects.** §0.3.

## 9. Measurement

Track in `concierge_target_list.xlsx` (source of truth): per prospect: date contacted, channel, variant used, replied (date), demo sent/opened, pilot start/end + agreed numbers + actuals, converted tier, revenue. Campaign-level weekly line in SESSION_LOG.md: sends, replies, demos, pilots, dollars. If a number is not written down it did not happen. Success is never judged by eye (propos-validation-and-qa).

## When NOT to use this skill

- Product bugs found during demo prep → **propos-debugging-playbook**
- Deploy mechanics for the isolated demo → **propos-run-and-operate** (+ `provision-agent-demo` for the provisioning itself)
- CRM seeding mechanics → **crm-seed**
- GCI math, Cameron voice, Spam Act → **propos-rea-domain-reference**
- What may be claimed in marketing copy → **propos-docs-and-positioning**
- Whether an action needs approval → **propos-change-control** (always wins on conflict)

## Provenance and maintenance

Founder decisions dated in-line (2026-07-05 demo isolation, 2026-07-06 hardest-problem + founder-sent + no-real-data). Pricing/channels/assets from the founder's 20-day sprint plan (started 2026-06-02), embedded here 2026-07-06. Volatile facts to re-verify each campaign session:

```bash
# Assets still where this skill says (machine-local)
ls "/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/concierge_target_list.xlsx"
ls "/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/agent-lead-gen/src/outreach/imessage.ts"
# In-repo assets
ls "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/.claude/skills/provision-agent-demo/SKILL.md"
ls "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/landing/index.html"
# Campaign status (goes stale fastest): read the last 3 entries
head -60 "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/SESSION_LOG.md"
```

Ask the founder each session: email domain warm yet? pricing tiers unchanged? Cameron status? Update §1-§3 the moment an answer changes.
