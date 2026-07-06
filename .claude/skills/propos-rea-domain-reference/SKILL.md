---
name: propos-rea-domain-reference
description: "Australian real-estate outreach domain pack for PropOS: glossary (REA, SLM, BlueBubbles, EOI, etc.), Spam Act 2003 compliance as coded, Cameron Knoll voice/copy rules, GCI math as implemented (dormant GCI, Est. GCI, GCI calculator), the buyer-to-vendor flywheel, phone/E.164 plumbing, external CRM/AVM ecosystem status, and SE Melbourne market constants. Load this when you need to understand WHY the code does something real-estate-specific, not how to run or deploy it. Triggers: 'what does SLM mean', 'explain the GCI calculation', 'is this Spam Act compliant', 'what is dormant GCI', 'how does the flywheel work', 'what's an AVM', 'CMA vs appraisal', 'why does this text sound robotic', 'what is BlueBubbles', 'AgentBox integration status', 'E.164 phone bug', 'who is Cameron Knoll'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Real Estate Domain Reference

This is the domain-theory pack a generalist engineer lacks: Australian real-estate outreach concepts AS THEY APPLY to this codebase, not a textbook. Read this before touching anything under `src/lib/slmMatch.ts`, `src/lib/flywheel.ts`, `server/lib/compliance.ts`, `src/data/propertySlm.ts`, or any GCI/commission math. It does not cover how to run, deploy, or operate the app (see §9).

---

## 1. Glossary

Defined once, in the sense this codebase uses them.

| Term | Meaning here |
|---|---|
| **REA** | Real-estate agent (the human PropOS sells to). Do NOT confuse with **REA Group**, the ASX-listed company that owns realestate.com.au, a different thing entirely. This codebase's "REA" always means the agent, e.g. `agent_prospect` relationship values in `server/data/smsAgentSeed.ts`. |
| **Vendor** | The person selling a property (the seller/client of the agent). See `VendorOutreachView.tsx`, `src/data/pastBuyers.ts` status `"buyer→seller"`. |
| **Buyer** | The person looking to purchase. `PastBuyer` type in `src/data/pastBuyers.ts`. |
| **Appraisal** | An agent's opinion of a property's likely sale price, usually free, used to win a vendor's listing. Informal, not a legal valuation. |
| **Valuation** | A formal, often licensed-valuer-produced figure, used for finance/legal purposes (e.g. bank lending, probate). PropOS does not produce valuations; it produces appraisal-grade estimates (see AVM below) for sales conversations only. |
| **CMA** | Comparative Market Analysis: a report comparing a subject property to recent comparable sales to support an appraisal. The `comparableSales` array in `PropertySLM` (`src/data/propertySlm.ts`) is the raw data a CMA is built from. |
| **AVM** | Automated Valuation Model: an algorithmic price estimate from sold-comparable data, no human appraiser. `server/lib/domainAvm.ts` wraps the Domain Group AVM API; `estimatedValues` in `DemoView.tsx`/`VendorStages.tsx` is the local equivalent when no live AVM key is set (falls back to a hardcoded suburb growth model, see §4). |
| **GCI** | Gross Commission Income: the agent's commission dollar amount on a sale, before any office/franchise split. See §4 for every formula PropOS computes. |
| **Open home** | A scheduled public inspection window for an active listing. Demo personas reference specific open-home dates and details (`server/data/demoContacts.ts`) as the seed for personalised outreach. |
| **Private treaty** | A sale negotiated directly between agent/vendor and a buyer at an asking price, no public auction. Most PropOS demo listings show `priceMin`/`priceMax` (a price range), which is a private-treaty signal; contrast with auction listings which show no fixed price. |
| **Auction** | A public, competitive-bid sale method on a set date. `AuctionOutcomePanel.tsx` and `AnalyticsDashboard.tsx`'s "auction funnel" track this method specifically; `avgBidders`, `clearanceRatePct` are auction-specific metrics. |
| **EOI** | Expressions of Interest: a sale method where buyers submit offers by a deadline, no public bidding, no fixed price. Distinct from both private treaty (has an asking price) and auction (has open bidding). Referenced conceptually in demo copy as a sale-method option; not separately modelled as a data field. |
| **SLM** | THIS codebase's term, NOT a general ML concept. Defined at `src/data/propertySlm.ts:1` as "Property SLM (Small Language Model / Property Brain)": a per-property structured Q&A knowledge store (100 data points: physical, legal, financial, location, features, planning), used to answer buyer questions accurately at `src/lib/slmMatch.ts`. It is a data structure, not a trained model. Do not architect around it as if it were an LLM. |
| **BlueBubbles (BB)** | A macOS server app (`server/lib/bluebubbles.ts`) that sends iMessages from the founder's real Apple ID via HTTP API, by relaying through an actual Mac running Messages.app. This is why outreach can appear as genuine iMessage rather than SMS from a virtual number. |
| **iMessage vs SMS** | iMessage (blue bubble, Apple-to-Apple) reads as a message from a real personal contact; SMS (green bubble, especially from a virtual/VOIP number) reads as a business blast and is more likely ignored or marked spam. In Australia, where iPhone penetration is high, landing in the blue-bubble thread materially changes trust and reply rate. This is why PropOS's SMS transport chain (`server/lib/sms.ts`) prefers BlueBubbles first and falls through to other transports (`shortcutRelay.ts`, `httpsms.ts`, `textingblue.ts`, `telelink.ts`, `androidgateway.ts`, `imsg.ts`) only when BlueBubbles is unavailable. Transport chain order is architecture, not domain theory: see **propos-architecture-contract**. |

---

## 2. Regulatory floor: Spam Act 2003 (Cth) as implemented here

The Spam Act 2003 (Commonwealth) requires, for commercial electronic messages: (a) consent, (b) accurate sender identification, (c) a functional unsubscribe facility honoured promptly. This section states what the CODE enforces (verified 2026-07-05) vs what remains operator responsibility. Do not overstate: anything not enforced in code is labelled operator duty.

### What the code enforces

| Requirement | Enforced by | Verified location |
|---|---|---|
| Opt-out registry checked before every send | `checkCompliance(phone, email)` returns `smsOk`/`emailOk`; `smsOptOutReason(phone)` is the SMS-only guard | `server/lib/compliance.ts:80-137` |
| Opt-out persists across restarts | Postgres `opt_outs` table when `DATABASE_URL` set (`ON CONFLICT (identifier) DO UPDATE`), else in-memory Map + Google Sheets mirror | `server/lib/compliance.ts:19,61-77`; table comment "SPAM Act 2003 opt-out registry" at `server/lib/db.ts:9` |
| Inbound STOP/unsubscribe keywords honoured | `["stop","unsubscribe","cancel","quit","end","stopall"]` checked on inbound SMS webhook | `server/routes/webhook.ts:35`, `server/index.ts:267` |
| SendGrid unsubscribe/group_unsubscribe events honoured | Webhook event switch handles `"unsubscribe"` and `"group_unsubscribe"` cases | `server/routes/webhook.ts:70-71` |
| Unsubscribe link is tamper-proof (can't guess adjacent lead IDs) | HMAC-SHA256 token `<leadId>.<hmac>`, verified with `crypto.timingSafeEqual` (constant-time, prevents timing attacks) | `server/lib/compliance.ts:148-168` |
| Unsubscribe route is public (works without login) | Mounted before the `requireAuth` gate | `server/index.ts:180` (`app.use("/unsubscribe", unsubscribeRouter)`) vs auth gate at `server/index.ts:~225` |
| Unsubscribe route fails safely on bad/missing token | Returns 400 with a generic message, does not leak whether a lead ID exists | `server/routes/unsubscribe.ts:10-18` |
| Unsubscribe confirmation page escapes user-controlled text | `escapeHtml()` applied before interpolation, prevents XSS via crafted message strings | `server/routes/unsubscribe.ts:34-41` |
| Email footer includes the unsubscribe link on every send | `unsubscribeFooter(leadId)` appends an HTML footer with the signed link | `server/lib/compliance.ts:171-175` |
| SMS-only compliance check fails OPEN (not closed) on a transient DB error | `smsOptOutReason` catches and returns `null` (permit) rather than blocking all sends on a DB hiccup | `server/lib/compliance.ts:128-137`, comment explains the tradeoff explicitly |

### What is operator responsibility (NOT enforced in code)

- **Consent basis**: the code does not verify or track WHY a contact is eligible for outreach (existing customer relationship, prior inquiry, etc.). It only tracks opt-OUT, not opt-IN or consent provenance. Establishing a lawful basis for the first message to any contact is the agent's/founder's job, not a runtime check.
- **Sender identification content**: the code appends an unsubscribe footer, but does not enforce that the FROM name/number/email visibly identifies the sending business in every channel. Verify manually that SMS sender ID and email FROM name are set correctly per campaign.
- **"Promptly" honouring opt-out**: the registry is checked at send time, so an opt-out is honoured on the NEXT send attempt. There is no code-level SLA on how fast a manual re-add or campaign resend cycle re-checks the registry, and if a batch job holds a stale in-memory contact list across a long run, that is an operational risk to manage, not a coded guarantee.
- **The no-autofire rule** (paid LLM generation only on explicit user click, never as a deploy smoke test or cron) is a governance rule with its own incident history, not a Spam Act requirement. Full treatment and the approval matrix live in **propos-change-control**; do not re-derive it here.
- **Real SIM cascade, not virtual numbers**: SMS transport prefers real-device relays (BlueBubbles, Android gateway apps) over virtual/VOIP SMS providers, which improves deliverability and trust but is a product decision, not something the compliance layer checks or enforces at runtime.

---

## 3. Voice and copy discipline

These are the founder's actual house rules for Cameron Knoll (Peake Real Estate, Berwick), the default/beta agent (`CLAUDE.md:112`). They are product requirements, and violating them has caused real complaints in testing.

| Rule | Detail |
|---|---|
| Sign-off | `"Kind regards,\nCameron"` for investor-toned messages, `"Cheers,\nCameron"` for family-toned messages. Never a bare `"Cameron"` with no greeting word before it. |
| SMS length | Under 160 characters. Must read like a real text a human would send, not a marketing blast. No emoji, no exclamation-heavy copy. |
| Email structure | 2-3 short paragraphs maximum. Must include at least one specific data point (a price, a suburb growth %, a comparable sale, a day-on-market figure) rather than generic claims. |
| Personalisation anchor | Reference what the buyer specifically asked or said AT THE OPEN HOME (see `server/data/demoContacts.ts` scenario notes for the pattern: e.g. "asked about the kitchen layout and the backyard orientation"). Generic "I have a property you might like" is explicitly called out as too weak. |
| Tone | Concise, polite, relationship-building. "Hope you're well" is acceptable. Overtly salesy phrasing is not. |
| No em-dashes | Never use the em-dash character in any generated or static text. This has a triple defence (prompt instruction, server-side sanitiser, client-side fallback) because prompt instructions alone are not trusted to hold. Full mechanism and the incident that justified it: see **propos-change-control**. Also stated as house rule at `CLAUDE.md:109`. |
| Product naming | Always surface the product as "PropOS" powered by "AddVantage AI". Never surface the underlying model name (GPT-4o, Claude, etc.) to an end user, in generated copy or static UI. Stated at `CLAUDE.md:111`. |
| Default agent identity | Cameron Knoll @ Peake Real Estate, Berwick, is the reference agent for all voice/tone work. Never silently revert demo copy to placeholder names like "Simon" or a placeholder agency like "Harcourts". Stated at `CLAUDE.md:112`. |

When you are asked to write or debug ANY generated outreach copy (SMS, email subject, email body), check the actual rendered text against every row of this table before calling it done. Compiling or a passing type-check proves nothing about voice quality.

---

## 4. The money math as coded

Three DIFFERENT GCI calculations exist in this codebase. They are not interchangeable and use different assumptions. Do not conflate them.

### 4.1 Dormant/sleeping GCI (portfolio-wide opportunity sizing)

```
dormantGCI = totalEstValue * 0.02 * 0.60
```
Verified at `src/views/DemoView.tsx:4566` and duplicated at `src/views/demo/VendorStages.tsx:848` (same formula, two call sites). `totalEstValue` is the sum of `estimatedValues` (per-buyer current equity estimate) across the whole past-buyer portfolio (`DemoView.tsx:4282`, `VendorStages.tsx:564`). The `0.02` and `0.60` are DEMO ASSUMPTIONS baked into the constant, not looked-up market data: they encode "2% commission rate, agent keeps 60% after office/franchise split". Rendered in the UI as "`{fmtHero(dormantGCI)}+` · dormant GCI · N contacts" (`DemoView.tsx:4585-4587`).

### 4.2 Est. GCI in OutreachQueue (per-send-batch sizing)

```
estGCI = approvedCount * 2000
```
Verified at `src/components/OutreachQueue.tsx:78-79`. A flat $2,000-per-approved-contact placeholder, unrelated to any specific property's actual price or commission rate. This is a much cruder heuristic than §4.1, used only to give the agent a rough "what's at stake" number when approving a batch of outreach messages before sending. Rendered as `{fmtGCI(estGCI)}+` in two places in the same component (`OutreachQueue.tsx:155`, `OutreachQueue.tsx:323`).

### 4.3 GciCalculator component (interactive, agent-editable inputs)

`src/components/GciCalculator.tsx`, a standalone slider UI, computes:
```
grossCommission  = salePrice * (commissionPct / 100)
gstAmount        = includesGst ? grossCommission - grossCommission / 1.1 : 0
commissionExGst  = grossCommission - gstAmount
netCommission    = max(commissionExGst - marketingFee, 0)
agentGCI         = netCommission * (splitPct / 100)
```
Defaults: `salePrice=850_000`, `commissionPct=2.2`, `marketingFee=1500`, `includesGst=true`, `splitPct=50`. Unlike §4.1 and §4.2, every input here is a slider the agent adjusts live; nothing is hardcoded into a demo scenario. GST removal uses the standard AU 1/11th-of-GST-inclusive-price method (`grossCommission / 1.1`).

### 4.4 AnalyticsDashboard ROI calculator (a fourth, scaling variant)

`src/components/AnalyticsDashboard.tsx:8-24` (`ROICalculator`) scales a recorded sample `baseGCI` (`estimatedExtraGCI` from analytics) by the agent's hypothetical volume:
```
scaledGCI = round(baseGCI * (listings / auctions) * (commission / 2.5) * (avgPrice / 880))
roiMultiplier = scaledGCI / PROPOS_ANNUAL_COST
```
This answers "what would PropOS-attributed extra GCI be at YOUR volume", not "what is dormant/at-risk GCI right now". Four different questions, four different formulas: know which one you are editing before you touch any constant.

### 4.5 Commission conventions encoded (label as demo assumptions, not market facts)

`2%` commission and `60%` agent-side split (§4.1), and `2.2%` / `50%` split defaults (§4.3), are PropOS DEMO ASSUMPTIONS for illustrative purposes. Real AU agency commission rates and splits vary by agency, franchise agreement, and negotiation; do not present these constants to a prospect as market-standard figures without the agent's own confirmation.

### 4.6 Marketing claims: NOT internally measured data

Two numbers appear as hero stats in demo UI and MUST be labelled `[MARKETING CLAIM, not internally measured]` in any future document or conversation that cites them:
- `"4-6x higher reply rate vs generic"` — `src/views/DemoView.tsx:3570-3571`, `src/components/OutreachQueue.tsx:161`.
- `"91% voice style match"` — `src/views/DemoView.tsx:3575-3576`; also rendered dynamically as `Math.round(agent.voiceProfile.confidence ?? 91)}% style match` at `DemoView.tsx:8982` and `VendorStages.tsx:5241` (the `?? 91` fallback means 91% is also the DEFAULT shown when no real confidence score exists yet, not just a hero-stat literal).

PropOS has no test runner and no measured A/B reply-rate dataset (see **propos-validation-and-qa**). These are illustrative sales-demo numbers. Never let a future session cite them as if they were internally validated metrics.

---

## 5. The flywheel concept

The core retention thesis: a BUYER today becomes a VENDOR in 5-10 years (they eventually sell the property they just bought, or sell an existing property to fund the purchase). PropOS's differentiator is staying in touch with that buyer over the full holding period so the SAME agent gets the listing when they eventually sell, instead of a competitor who reconnects first.

Implemented in `src/lib/flywheel.ts` (both exports verified present):

- **`recommendListingForBuyer(buyer, activeListings)`** (`flywheel.ts:19-49`) — for a past buyer being re-engaged, finds the best-matching CURRENT active listing to pitch them as a potential upgrade/move. Filters by same suburb first, falls back to same property type; picks the listing whose price is closest to what they paid last time (a proxy for affordability). Returns a human-readable `reason` string ("Same suburb, house like the one they bought", etc.).
- **`findBuyerDemand(buyers, vendor)`** (`flywheel.ts:58-75`) — for a CURRENT vendor being pitched a price update, searches the buyer portfolio for someone actively looking in the same suburb and property type, to use as social proof ("we already have a buyer for this"). Explicitly excludes anyone already flagged `"buyer→seller"` (i.e. doesn't recommend a vendor as a buyer for their own type of listing).

Demo personas that exercise this wedge live in `server/data/smsAgentSeed.ts` (fictional agent-prospect personas: Sarah Mitchell, Daniel Osei, Rebecca Tan, from line ~112) and `server/data/demoContacts.ts` (scenario-tagged past-client and open-home-attendee contacts with specific personalisation notes). Past-client reconnection is the wedge because it requires no new lead generation spend: the contact already trusts the agent, the data (purchase price, suburb, property type) already exists in the portfolio, and the flywheel functions above turn that into a specific, defensible pitch rather than a generic "thinking of selling?" blast.

---

## 6. Phone/identity plumbing

### The E.164 normalisation problem

Hand-entered Australian phone numbers arrive in inconsistent formats (`0426 719 845`, `+61426719845`, `61426719845`), but inbound messages from BlueBubbles always arrive pre-normalised as `+61...`. If the write-path normaliser doesn't produce the same canonical form as the read-path lookup expects, you get duplicate contacts and lost personalisation history.

**Current state (verified 2026-07-05):** `server/lib/smsContacts.ts:61-67` DOES implement E.164 conversion:
```ts
function normalisePhone(phone: string): string {
  const cleaned = phone.trim().replace(/[\s\-()]/g, "")
  if (cleaned.startsWith("+")) return cleaned
  if (cleaned.startsWith("0")) return `+61${cleaned.slice(1)}`
  if (cleaned.startsWith("61")) return `+${cleaned}`
  return cleaned
}
```
This strips whitespace/dashes/parens, converts `04xxxxxxxx` to `+614xxxxxxxx`, converts bare `61xxxxxxxxx` to `+61xxxxxxxxx`, and passes through anything already starting with `+`.

**Stale-doc contradiction:** `docs/SMS_AGENT.md:409` says "`normalisePhone()` (`smsContacts.ts:52`) only strips whitespace" and frames the E.164 fix as a not-yet-built plan item (`docs/SMS_AGENT.md:434-437`, item 2 of "Planned: CRM-Triggered Auto-Outreach + MVP Hardening"). That doc entry is STALE: the function at its CURRENT line number (61, not 52 — the file has grown since that note was written) already performs the described conversion. Verified reality on 2026-07-05 is that E.164 normalisation exists in code; treat the code as truth and update `docs/SMS_AGENT.md` via change control (do not silently re-implement a fix that already shipped).

**What remains genuinely open:** whether normalisation is applied consistently on BOTH the write path (`upsertContact`) and read path (`getContactByPhone`, called at `smsContacts.ts:99`) for every call site across the codebase, and whether any EXISTING rows written before this normaliser existed are still in a non-canonical format (no backfill migration was found). If you are debugging a duplicate-contact symptom, verify both call sites and check for legacy rows starting with `04` or bare `61` in the `sms_contacts` table before assuming the bug is fixed everywhere it could occur. Label this residual risk **[OPEN, re-verify empirically]**, not closed.

### One-number-per-contact assumption

`sms_contacts` and the SLM/CRM data model assume a single phone number per contact (a `phone` field, not an array). There is no code path found for a contact having multiple numbers (e.g. mobile + landline, or old + new mobile). If an agent's real CRM data has multi-number contacts, this is an unhandled case, not a deliberate simplification documented anywhere.

---

## 7. External data ecosystem

Status-stamped as of 2026-07-05. Do not assume any of these are live in production without checking the `/api/health` response fields (`boxdice`, `domainAvm`, `sheet`) which reflect env-var presence, not necessarily a successful live connection.

| System | Status | Evidence |
|---|---|---|
| **AgentBox CRM** (now Reapit Sales ANZ) | **[PLANNED]**, not implemented | `docs/AGENTBOX_INTEGRATION.md:3` states "Status: Design · Not yet implemented". Requires an integrator application at agentbox.com.au/integrator-application plus a 2-4 week AgentBox review before production keys are issued. Cameron Knoll's real CRM is AgentBox today; PropOS currently imports his data via Google Sheets export as a manual bridge, not a live sync. |
| **BoxDice** | **Built and wired**, requires live credentials to activate | `server/lib/boxdice.ts` + `server/lib/boxdiceClient.ts` implement a real client (reusing `mcp-boxdice/src/client.ts`); `server/routes/boxdice.ts` is mounted at `/api/boxdice` (`server/index.ts:241`); `boxdiceConfigured()` gates every route on `BOXDICE_DOMAIN` + `BOXDICE_API_KEY` being set (`server/lib/boxdice.ts:10-11`), and the top-level health check reports this as the `boxdice` boolean (`server/index.ts:172`). This is further along than AgentBox: the code exists and is reachable, but whether a real BoxDice account is currently connected in production was NOT verified live (no network calls were made per the ground-truth rules); check `GET /api/health` (authed) for the current `boxdice` value before assuming it is active. `mcp-boxdice/` is a separate MCP-server package with its own `package.json`/`SETUP.md`; treat it as the shared client library, not a duplicate integration. |
| **Domain AVM** | **Built**, requires `DOMAIN_API_KEY` | `server/lib/domainAvm.ts` wraps `api.domain.com.au/v1` (free Domain Developer API tier). `domainConfigured()` checks for the key; `domainFetch()` fails closed to `null` on any error or missing key, and the file's own header comment states the caller then falls back to "the hardcoded suburb model" (the local growth-curve data seen in `DemoView.tsx` price-history arrays). Health check exposes this as `domainAvm` boolean (`server/index.ts:173`). |
| **Google Sheets CRM** | **Legacy/bridge path, documented as a planned real-time upgrade** | Current state: `src/lib/sheet.ts` reads/writes leads, SLM fields, and voice-corpus entries via a Google Apps Script web app (`VITE_SHEET_URL`), tabs `Leads`/`PropertySLM`/`Events`/`VoiceCorpus` (`CLAUDE.md:156-161`). `docs/GOOGLE_SHEETS_CRM.md:1-2` frames a NEWER real-time two-way sync (`sms_contacts` ⟷ Sheets via 5-minute polling + `onEdit` PATCH) as "Planned 2026-06-14 ... Build when continuing from the sms-agent branch" — i.e. that specific real-time design is **[PLANNED]**, while the existing lead/SLM/voice-corpus Sheets bridge is already live and in active use. Do not conflate the two: one already ships, one is a future upgrade to a different table (`sms_contacts`). |
| **Supabase** | **System of record**, live | Project `pzdcwulzteofvatjrtlh` (see **propos-config-and-flags** for the env var). `server/lib/db.ts` is a thin Postgres layer (`pg` driver) over `DATABASE_URL`, holding `conversations`, `opt_outs`, `outreach_log`, `nurture_queue`, `contacts` (file header comment, `server/lib/db.ts:1-12`). Every server module that touches the DB is written to no-op gracefully when `DATABASE_URL` is absent (`isDbConnected()` gate pattern used throughout, e.g. `compliance.ts:88`, `27`). The CURRENT production incident (`GET /api/health` returning `database:false`) means this system-of-record is presently degraded in production; that incident's full triage lives in **propos-debugging-playbook**, do not re-diagnose it here. |

---

## 8. Market context constants

- **SE Melbourne target patch**: Berwick, Narre Warren / Narre Warren South, Officer, Clyde / Clyde North are the suburbs that recur throughout demo data (`src/data/pastBuyers.ts`, `server/data/demoContacts.ts`, price-history arrays in `DemoView.tsx`). This is the founder's chosen go-to-market geography, not an exhaustive or automatically-maintained suburb list; if you add a new suburb to demo data, there is no config file enumerating "the target patch" to update in lockstep, just consistency with the existing demo narrative.
- **Peake Real Estate + Cameron Knoll** is the default/beta agent identity baked into the product (`CLAUDE.md:112`, agency theme `primary: "#3f0278"` at `CLAUDE.md:151`). He is a real beta user, not a fictional persona; his feedback (target vendors/sellers, not buyers, as the primary outreach audience) shaped the flywheel's vendor-facing emphasis. Treat any demo content under his name as representing a real relationship, with the same care as production data even though it renders in a "demo" view.
- **Pricing tiers**: a tiered pricing canon (free pilot, a locked founder's rate for the first cohort, a success-fee tier, a future pro tier) exists as GTM decision-making canon for the FIRST-CUSTOMER CAMPAIGN. It is not encoded anywhere in this repo's source or docs as of 2026-07-05 (not found in `docs/`, `PITCH_SUITE_PLAN.md`, or `SCOPE.md`). Full detail and the numbers themselves live in **propos-first-customer-campaign**; if you need the actual dollar figures for a sales conversation, go there rather than guessing from this file.

---

## 9. When NOT to use this skill

- **Outreach send mechanics** (how the SMS transport cascade actually dispatches a message, BlueBubbles setup, `/api/health` transport fields, choosing/debugging a transport) → **propos-run-and-operate**.
- **Campaign execution** (the actual first-customer campaign plan, decision gates, demo-day readiness, pricing tier dollar figures) → **propos-first-customer-campaign**.
- **Deploy truth, CI state, which Cloudflare Pages project is really live** → **propos-run-and-operate**.
- **The autonomy matrix, approval-required actions, never-touch list, no-autofire rule mechanics** → **propos-change-control**.
- **Route-order invariants, transport-chain architecture, why `fly.toml` sets `auto_stop_machines=off`** → **propos-architecture-contract**.
- **Env var catalogue** (every flag, default, where it's read) → **propos-config-and-flags**.
- **The `database:false` incident itself, or any other open incident's root-cause triage** → **propos-debugging-playbook** (live triage) and **propos-failure-archaeology** (chronicle).
- **Evidence hierarchy / how to prove a change works** → **propos-validation-and-qa**.

This skill is domain theory only: what the real-estate terms mean, what the compliance/voice/money-math code actually computes, and what the external ecosystem's real status is. If your task is "make X work" rather than "understand what X means or computes", you are very likely in the wrong skill.

---

## Provenance and maintenance

Every claim above was verified directly against the repo on 2026-07-05. Re-verify with these commands if anything looks stale:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"

# Compliance layer still matches this description
grep -n "checkCompliance\|smsOptOutReason\|makeUnsubToken\|verifyUnsubToken" server/lib/compliance.ts

# Dormant GCI formula (both call sites)
grep -n "dormantGCI = totalEstValue" src/views/DemoView.tsx src/views/demo/VendorStages.tsx

# Est. GCI in OutreachQueue
grep -n "estGCI\s*=" src/components/OutreachQueue.tsx

# Marketing claims still rendered as hero stats (re-confirm they still need the [MARKETING CLAIM] label)
grep -n "4-6x\|91%" src/views/DemoView.tsx src/components/OutreachQueue.tsx src/views/demo/VendorStages.tsx

# Flywheel exports unchanged
grep -n "^export function" src/lib/flywheel.ts

# E.164 normaliser: re-check line number and logic haven't drifted from this doc
grep -n "function normalisePhone" -A 8 server/lib/smsContacts.ts

# SMS_AGENT.md stale-doc note: confirm whether it has been corrected yet
grep -n "only strips whitespace" docs/SMS_AGENT.md

# BoxDice wiring still mounted and gated the same way
grep -n "boxdiceConfigured\|BOXDICE_API_KEY" server/lib/boxdice.ts server/index.ts

# Domain AVM still fails closed to null
grep -n "domainConfigured\|DOMAIN_API_KEY" server/lib/domainAvm.ts server/index.ts

# Google Sheets CRM: confirm which parts are still "planned" vs shipped
head -5 docs/GOOGLE_SHEETS_CRM.md

# Product naming / default agent rules unchanged
sed -n '105,113p' CLAUDE.md

# Stale Key Files entry (twilio.ts) still present or finally fixed
grep -n "twilio.ts" CLAUDE.md; ls server/lib/twilio.ts 2>&1
```

If any of these disagree with this document, treat the repo as truth, fix this SKILL.md, and note the correction date in a comment at the top of the changed section.
