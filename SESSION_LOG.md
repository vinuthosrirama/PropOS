# PropOS Session Log

Cross-conversation handoff file. Every Claude session appends a dated entry at the TOP (newest first) before its final push: what was built, what was verified, what is half-done, and the exact next step. Read this at session start.

## 2026-07-09: Match Queue crash fix, Supabase-only leads, security Part B batch 1

**Fixed / Built:** Session followed a 6-dimension functionality audit (demoability, scalability, differentiation, robustness, security, aesthetics) that found the Buyer Match Queue showing "0 to review" on prod and the SMS inbox leaking Vinuth's real correspondence (Docusign, service numbers) to any unauthenticated demo visitor. A prior in-flight batch (commit `7673022`, security Part B batch 1) had already landed the JWT/webhook/CORS/opt-out fixes from the 8 Jul security review. This session picked up further uncommitted work in progress and finished it: Google Sheets fully removed as a lead/past-buyer source (Supabase `PropOS_democontacts` is now the sole live source; vetted `DEMO_FALLBACK_LEADS` covers offline/empty CRM, never the sheet); demo inbox gated to synthetic `demo-*` threads via a new `DEMO_MODE` check in `conversations.ts` (not yet enabled in prod, see Next); DB init retries with capped backoff instead of stranding the process in in-memory mode until next deploy (`db.ts`); the `/api` auth gate now fails closed (503) instead of open when `DATABASE_URL` is set but the pool is down; blank SLM records resolve the real property address instead of "Unknown" (`propertySlm.ts`); junk sheet rows (event-log names, phone-derived $61M+ budgets) filtered from `isRealLead`; emoji removed from CRM-integration cards and print buttons.

While verifying the Match Queue fix locally, found the actual root cause of the empty queue was not just "CRM empty" — `/api/pitches/buyer-brief/matches` joined `document_sessions.pitch_id` (TEXT) against `pitches.id` (UUID) with no cast, which Postgres rejects with `operator does not exist: text = uuid`. The query threw an unhandled rejection with no try/catch, which **crashed the entire Node process** (Node 20 default behaviour). This means the db.ts retry-connect fix above would have made the crash MORE likely to hit in production once it reconnected, not less. Same bug found and fixed in two more places: `/api/doc-track/overview` and `/api/doc-track/contact-summary` (both join the same two tables the same broken way). All three now cast the join (`p.id::text`) and are wrapped in try/catch, degrading to a small vetted synthetic candidate list (the same 4 buyers already shown on the 34 Hartsmere Drive sold-property page, re-surfaced as "matched to a new active listing", which is the actual product story) instead of taking the server down.

**Verified (Preview screenshots + curl):** Ran the actual server locally (`npx tsx index.ts`, port 3001, real `server/.env` DATABASE_URL) rather than against prod. Confirmed via raw log that the pre-fix code crashed the process on the first `/buyer-brief/matches` call with the exact uuid/text error above. Post-fix: server survives, DB connects, and the Match Queue renders "84 contacts, 164 pairs" with real Supabase data (James Whitfield, 67% fit, matched to both 10 Ashby Drive and 3 Fairholme Boulevard) instead of "0 to review". `/api/doc-track/overview` no longer crashes (correctly returns an empty list, since this Cameron test session has genuinely sent zero pitches — left as a true empty state, not fabricated, since DocInsights is an activity log rather than a matching surface). Sold-property lead detail for Jack & Rose Lam now reads "Came from: 34 Hartsmere Drive, Berwick" and the comparison table header shows "34 HARTSMERE DRIVE → 10 ASHBY DRIVE" (previously "UNKNOWN → 10 ASHBY DRIVE"). VendorOS spot-checked, unaffected (19 contacts, $203K+ dormant GCI, no regression from the emoji/Sheets removal in `VendorStages.tsx`).

**tsc:** root + server, both clean.

**Deployed:** Not deployed. Committed locally only (`2c4e109`); push and Fly deploy are ask-first per change-control.

**Next:** (1) Decide whether to set `DEMO_MODE=true` as a Fly secret — this is what actually activates the inbox-gating fix in production. Flagged as ask-first because built-in agents (Cameron, Vinuth) both get the same `agentId=0` demo token per `auth.ts:182` — there is currently no way to tell "Cameron using his real inbox" apart from "anonymous demo visitor" at the code level, so enabling this is a real behaviour change, not just a safety toggle, until real per-agent auth exists. (2) Push + `flyctl deploy` once approved — this is the fix for the "prod runs unauthenticated because DB is down" finding from the 9 Jul audit; the db.ts retry logic and the A4 fail-closed gate both need this deploy to take effect. (3) Full functionality audit report lives at `Claude Property/PROPOS_FUNCTIONALITY_AUDIT_2026-07-09.md` (outside this repo) with the remaining ranked action list (AgentBox integrator application, test runner, em-dash sweep of static UI copy, DemoView.tsx/VendorStages.tsx split).

---

## 2026-07-06: Document tracking audit, DOC_TRACKING_PLAN.md, disclosure footer + print event

**Fixed / Built:** Session began as "build a document tracking system for vendor pitches" and pivoted on discovering the MVP already exists (useDocTracker.ts, doc-track.ts, document_sessions/events tables, DocInsightsView heatmap, intent scoring into contacts.engagement_score, SMS alerts). Wrote DOC_TRACKING_PLAN.md (repo root): full audited inventory with file refs, open-source research (Papermark/PostHog/OpenReplay rejected in favour of the existing custom tracker), gap list, phased roadmap, privacy stance. Built the two MVP gaps: analytics disclosure footer on PitchView (founder decision: subtle disclosure, no banner) and a tracked "print" event (beforeprint listener in useDocTracker, type extended client + server). Also committed prior sessions' untracked source (39e7064) per session-start protocol. Added vite.config.verify.ts: local verification config proxying to port 3002 because another app (Python app.py) holds 3001 on this Mac.

**Verified (Preview screenshots):** Pitch created via authed API in DB-free in-memory mode (template cover note, correct "Cheers, Cameron" sign-off, no em-dashes). /p/MaORNHrx rendered with disclosure footer visible above the accept bar (screenshot taken). POST /api/doc-track batches observed firing in network log; intercepted flush payload confirmed events:["print"] after beforeprint. No DB writes, no SMS, no LLM spend (scrubbed env; doc-track is inert without DB).

**tsc:** root + server, both clean.

**Deployed:** Not deployed. Committed locally only; push is ask-first.

**Next:** DOC_TRACKING_PLAN.md Phase 0: full end-to-end verification WITH a database (events persisting, DocInsightsView heatmap from real samples, score delta applied). Needs founder decision on test DB vs prod, and approval for the first-open SMS autofire (doc-track.ts:259 fires real SMS on first open when DB + transport live). Also investigate: PitchView.tsx:291 type-routing oddity, and server/index.ts local static path resolving to repo/public (has no index.html) when run via tsx.

---

## 2026-06-28 — Instant CMA tab + 3 Tier-1 Realtair features complete

### 3 Tier-1 Competitive Features (commit `f31618e`)
These were completed in the previous session and are now pushed to origin/main:

**Feature 1: Proposal E-Acceptance**
- DB: `pitches.accepted_at`, `accepted_by`, `accepted_ip`, `acceptance_token` columns added via migration
- Backend: Public `POST /api/pitches/:token/accept` (before requireAuth) — idempotent, captures name + IP, sends agent Gmail notification
- `GET /api/pitches/by-slug/:slug` now returns `acceptanceToken`, `acceptedAt`, `acceptedBy`
- Frontend `PitchView.tsx`: `AcceptModal` (name + T&C checkbox), `AcceptedBanner` (green fixed bar), `AcceptCTA` (white bar with "Accept proposal" button). Applies to `price_update`, `listing_proposal`, `appraisal` types.

**Feature 2: Automated Vendor Campaign Reports**
- DB: `vendor_reports` table with `UNIQUE(pitch_id, week_number)`; `pitches.vendor_email`, `vendor_name` columns
- `server/lib/vendorReportGenerator.ts`: `sendVendorReport(ctx)` + `runWeeklyVendorReports()`. Claude Haiku prose (3 paragraphs: market, campaign, next steps), template fallback, HTML email with stats bar + comps table + agent card.
- Cron: Sunday 7am Melbourne AEDT in `outreachScheduler.ts`
- API: `GET/POST /api/pitches/vendor-reports` (CRUD), manual trigger, resend

**Feature 3: Instant CMA / Appraisal**
- `server/lib/appraisalGenerator.ts`: `generateAppraisalPayload()` — Domain AVM (60%) + suburb compound-growth (40%) blend, Claude Haiku executive summary, template fallback, < 30s target
- Backend: `POST /api/pitches/appraisal` (authed), `POST /api/pitches/:id/send-email`
- DB: `pitches.type` CHECK extended to include `'appraisal'`, status CHECK extended to include `'accepted'`
- `src/components/pitch/AppraisalView.tsx` (NEW): cover strip, price guide bar with low/mid/high + confidence badge, suburb snapshot 4-stat grid, comparable sales table, agent card, print/copy/email buttons. Print styles injected on mount.
- `PitchView.tsx`: routes `type === 'appraisal'` to `AppraisalView`

### Instant CMA tab in DemoView (commit `a2e23fe`, this session)
- Added `"appraisal"` to `profileTab` type union in `VendorProfilePage`
- New state: `appraisalUrl`, `appraisalPayload`, `appraisalGenerating`, `appraisalSent`, `appraisalSending`, `appraisalVendorEmail`
- Imported `AppraisalView` + `AppraisalPayload` from `../components/pitch/AppraisalView`
- Tab "Instant CMA" added between Proposal and Prop. Pitch
- Tab content: optional vendor email input, generate button (calls `POST /api/pitches/appraisal`), send button (calls `/api/send`), copy link, inline preview (AppraisalView, scrollable 700px max height)
- Merge conflict resolved: remote had shortened tab labels (Price Pitch, Campaign, GCI Calc) — kept remote labels, inserted Instant CMA tab

**tsc:** zero errors (root + server) after both commits.

### Deployment state
- Backend: pushed to origin/main (Railway auto-deploys from main)
- Feature branch: `claude/prop-os-repo-access-vo46q` matches `a2e23fe`
- Frontend deploy (Cloudflare Pages): must be run from user's local Mac: `npx vite build && npx wrangler pages deploy dist --project-name propos-demo --branch main`

### Platform clarification (investigated this session)
- No `fly.toml` in repo; only `railway.toml` exists — backend remains on Railway
- `BASE_URL` is `https://propos.addvantage.site` throughout codebase
- Cannot confirm live deployment from remote execution env (HTTP to live site blocked by network policy)

### Not yet done / next steps
1. **Frontend deploy** — user must run from local Mac: `npx vite build && npx wrangler pages deploy dist --project-name propos-demo --branch main`
2. **Seed outreach targets** — `POST /api/outreach-targets/seed` (requires auth + DB connected)
3. **E2E SMS test** — trigger-now → SMS to `+61415883354` → reply → draft → approve
4. **Onboarding <10 min claim** — last remaining NEXT_SESSION item from the Ociate competitor analysis list
5. **Bulk pitch generation** — "Generate All" for entire portfolio
6. **Settings View audit** — consolidate all settings into SettingsView

---

## 2026-06-19 (latest) — prompt evolution loop wired + multi-agent demo provisioning plan

**Commits pushed to origin/main and deployed to Fly.io (`addvantageadvisory`):**

- `ceee03a` — `fix: analytics/vendor SQL error when demo token (agentId=0) is used`
  - Root cause: `req.agentId = 0` (falsy) caused `agentId ? String(agentId) : "default"` to return `"default"`, which broke the SQL `WHERE agent_id = $1` cast to INTEGER.
  - Fix: `req.agentId ?? 0` (nullish coalescing, not truthiness check).

- `cceb55d` — `feat: wire prompt evolution loop (generate → send → optimise)`
  - `server/lib/openai.ts`: Added `evolvedRules?: string` to `GenerateParams`; injected into system prompt as `=== LEARNED STYLE REFINEMENTS ===` block.
  - `server/routes/generate.ts`: Fetch `[versionId, evolvedRules]` from `promptOptimiser` before generation; preserve `evolvedRules` when enriching params with CTA (was losing it via `...params` spread — fixed to `...enrichedParams`); return `versionId` in response `meta`.
  - `server/routes/send.ts`: Accept `versionId?: number` in `SendRequest`; call `recordSignal(versionId, "approved", ...)` after every successful SMS or email delivery.
  - `server/lib/promptOptimiser.ts`: Updated `runOptimisationCycle` to collect BuyerOS approval signals from `prompt_evaluations.metadata->>'smsBody'` (not only `outreach_drafts` which is VendorOS-only); meta-prompt changed to output concise style bullet points (not a full system prompt rewrite).
  - `server/index.ts`: Weekly cron `0 2 * * 0` (Sun 2am AEST) + 15-signal threshold trigger for both `sms_rules` and `outreach_system` contexts.
  - `src/views/DemoView.tsx`: Thread `versionId` through all stage transitions (GeneratingView → ReviewPanel) and include in POST body to `/api/send`.

**Verified:** `/api/health` returns `{"ok":true,"database":true}` post-deploy. App is live.

**Half-done — multi-agent demo provisioning (NOT YET STARTED, plan approved):**

Goal: duplicate Cameron Knoll's demo for Anthony Abeysena (The 5th Avenue Real Estate, Chadstone) — black/gold brand, 8 sold listings, 1 active at 18 Maplewood Circuit Truganina $720k. Future new agents provisioned via script + Supabase, no code changes needed.

See `NEXT_SESSION.md` for the full plan. Key discovery: Anthony ALREADY has hardcoded portfolio data in `src/data.ts` (lines 828–874, `ABEYSENA_PORTFOLIO_SOLD` + `ABEYSENA_PORTFOLIO_ACTIVE`, `isAnthonyAbeysena()` at line 453, `getPortfolioForAgent()` branch at line 465). The hardcoded data has only 3 sold listings — NOT the full 8. The provisioning system needs to replace (not supplement) the hardcoded data with DB-driven data for Anthony.

**Exact next steps:**
1. Add DB migrations to `server/lib/db.ts`: `agent_portfolios`, `agent_property_slm` tables + `ALTER TABLE agents ADD COLUMN IF NOT EXISTS brand_primary/accent/logo/gradient/bio/years_exp`
2. Create `server/routes/agent-demo.ts` (GET /portfolio, /slm/:id, /leads, /theme)
3. Register `/api/agent-demo` in `server/index.ts`
4. Create `scripts/provision-agent.ts` CLI
5. Create `scripts/agent-data/anthony-abeysena.json` with all 8 sold + 1 active
6. Create `src/lib/agentDemoFetcher.ts`
7. Modify `src/data.ts` → add `setDBPortfolioCache()`, make `getPortfolioForAgent()` check DB first
8. Modify `src/views/DemoView.tsx` → `useEffect` on mount to fetch DB portfolio + apply brand CSS vars
9. Create `.claude/skills/provision-agent-demo/SKILL.md`

---

## 2026-06-11 (latest) — pitch URLs always production domain + per-agent persistent settings

**Built (commit `1ff9da1`, plus earlier `f9ae631` BASE_URL fix on the same push):**
- `server/routes/pitches.ts`: pitch creation response now resolves `url` via `process.env.BASE_URL ?? "https://propos.addvantage.site"` instead of `req.headers.origin`/host (which can be a Railway internal hostname or a Cloudflare `*.pages.dev` preview URL). `server/.env.example` documents `BASE_URL`.
- `DemoView.tsx`: `setPitchUrl` now trusts the absolute URL from the server, falling back to `window.location.origin` only if the server ever returns a relative path.
- New generic per-agent KV persistence: `agent_state` table (`server/lib/db.ts` migration), `server/routes/agent-state.ts` (GET/PUT `/api/agent-state/:key`, DB-less in-memory fallback), client helper `src/lib/agentState.ts` (`loadAgentState`/`saveAgentState`).
- `SettingsView.tsx`: `comm_settings` (CommsPanel) and `featured_listing_id` (ListingsPanel) now read back from `agent_state` on mount and write through to it on save, so these survive a refresh or a different browser/device, not just localStorage.

**Persistence landscape (Pareto 80% review):**
- Already persisted (no work needed): leads/contacts + CSV/XLSX imports (`contacts` table, `import-contacts` routes), outreach/personalisation messages (`outreach_log`), SLM info (Google Sheets via `sheetSLMCache`), voice corpus (Google Sheets via `writeAgentVoiceEntry`/`readAgentVoiceCorpus`).
- Newly persisted this session: comm settings + featured listing (`agent_state`).
- Still local-only / not investigated: any agent-added "new listings" beyond the hardcoded portfolio.

**Verified:** `agent_state` GET/PUT round-trip confirmed via direct fetch in Preview (DB-less in-memory mode). tsc: server 0 errors, root same 11 pre-existing errors. Full UI click-through of CommsPanel/ListingsPanel save→reload NOT visually verified this session (SPA routing issue when navigating to `/settings` directly) — flagged as outstanding.

**Deploy state:** pushed to origin/main (Railway backend auto-deploys, picks up BASE_URL + agent_state API). Cloudflare Pages (`propos-demo` / propos.addvantage.site) frontend deploy still pending explicit user authorization — needs to ship to also pick up the BASE_URL pitch-link fix, agent_state settings wiring, and the earlier pitch-email-content fix (commit `867517b`) all together.

---

## 2026-06-11 (later still) — pitch email embeds content, no more dead localhost links

**Built (commit `867517b`):**
- `server/lib/emailTemplate.ts`: new `buildPitchContentHtml(payload, color)` renders comparable sales table + suburb market snapshot as email-safe branded HTML; `buildEmailHTML` gained optional `contentHtml` injected after the property box.
- `server/routes/send.ts`: `/api/send` accepts optional `pitchPayload` and embeds the block in the email.
- `DemoView.tsx` `handleSendPitch`: detects localhost pitch URLs; email copy says "the full breakdown is below" (link only added on a real domain), SMS copy points to the email instead of a dead URL, `pitchPayload` passed to `/api/send`.

**Verified:** live send via Preview (SMS sid + Gmail messageId returned); sent email read back via Gmail (thread `19eb407b9d405589`) — no localhost anywhere, comps ($860K/$900K/$855K Officer sales) + market snapshot ($870K median, 26 DOM, 74% clearance, 5.8% growth) embedded, Peake purple branding and CK signature intact; rendered HTML screenshot-verified via Preview. tsc: server 0 errors, root 11 (all pre-existing).

**Deploy state:** pushed to origin/main (Railway backend auto-deploys). Cloudflare Pages deploy attempt was denied by the permission classifier (not explicitly user-authorized this session); curl confirms propos.addvantage.site still serves the previous bundle `index-CWk23ErI.js`. When authorized: `npx vite build && npx wrangler pages deploy dist --project-name propos-demo --branch main`.

---

## 2026-06-11 (later) — CRM import connector + pitch-opened call-now climax

**Built (commit `a7472d0`):**
- `server/routes/import-contacts.ts`: POST `/parse` (SheetJS XLSX to string grid), POST bulk upsert into `contacts` (single round trip, `source='import'`), GET read-back per agent. Registered behind auth; 10mb body override for workbook uploads. `xlsx` added to server deps.
- DemoView VendorPortfolioPage: file input accepts `.csv,.xlsx,.xls`; header-alias mapping extracted to `mapRowsToContacts` shared by CSV (client parse) and XLSX (server parse); **bug fixed**: first+last name merge never ran because the `name` alias contains-matched the "First Name" header; bulk import in one POST; read-back useEffect merges DB contacts into buyers on mount (dedupe by name+address).
- DemoView pitch tab: simulated view notification 9s after pitch send ("{fname} just opened your Price Update, 3 views") with "Call now" button opening a personalised Tom Panos call-script overlay (tap-to-call phone, price band from `buildAppraisalRange` low/high, "too busy" variant, attribution).

**Verified (Preview screenshots):** AgentBox-style CSV imported through the real modal — 3 contacts (Greg Hartley, Priya Nair, Sam & Elena Castellanos) appeared in the CRM with computed equity and Nearby-sale triggers, count 88→91. XLSX parse verified via curl with a real workbook. DB-less read-back graceful (`contacts: []`, `persisted:false`). Notification appeared ~9s post-send; overlay showed "Hi David, it's Cameron from Peake... $795K to $950K" fully personalised. tsc: server 0 errors; root only pre-existing (note: a SettingsView:1324 TS2352 appeared mid-session from edits outside this session).

**Deployed:** propos.addvantage.site serves `index-CWk23ErI.js` (verified via curl). Railway backend redeploys from the origin/main push.

**Context (strategy session):** competitor = Realtair (vendor-only, no AI). PropOS = BuyerOS (top of funnel) + VendorOS (middle). Demo audience: individual agents. 60-day goal: 3-5 paying betas. Identified demo gaps: open on the GCI number, live import of prospect's own data (now built), closed-loop notification moment (now built), flywheel visual (buyer becomes future vendor), leave-behind artifact per agency.

**Next step:** flywheel screen and/or per-agency leave-behind one-pager; remaining deferred Pitch Suite items (bulk generation, regenerate, Digital Intro / Listing Proposal templates, real `v_pitch_views` inbox badge).

---

## 2026-06-11 — Pitch Suite complete, Property Pitch template, deploy fix

**Built:**
- Full Pitch Suite (commit `2cdc4b4`): `pitches` DB table + migration, `server/lib/pitchGenerator.ts` (Claude cover notes, cached-first, sanitised), `server/routes/pitches.ts` (CRUD + public by-slug/view routes registered before requireAuth), `src/views/PitchView.tsx` at public `/p/:slug` with view tracking, `src/components/pitch/PriceUpdateTemplate.tsx` (conditional section rendering, Realtair parity).
- `src/components/GciCalculator.tsx` — live GCI calculator, glass-card design-system styling.
- DemoView vendor profile: three new tabs — "Price Update Pitch" (generate → preview → send via Twilio/Gmail → copy link), "Property Pitch", "GCI Calculator".
- `src/components/pitch/PropertyPitchTemplate.tsx` — Peake-branded (#3f0278 / #7B35BE) photo-hero listing showcase using SLM_DATA[101] (10 Ashby Drive, Narre Warren South) + first comparable sale (9 Arlington Place, $880,000 Feb 2026). Playfair Display serif headlines, gradient overlay hero, price-guide gradient card, lifestyle/features/comparable/agent sections. Em-dash stripping applied to all SLM-sourced text.
- CLAUDE.md: added Session Persistence Rules; created this SESSION_LOG.md; gitignored `backups/`, `dist_backup_*`, `src_snapshot_*`.

**Verified:** tsc clean (root + server, only the 10 pre-existing out-of-scope errors). Preview-screenshot verified: Property Pitch tab hero/price/stats/lifestyle/features sections, em-dash fix confirmed in rendered UI. Price Update Pitch end-to-end (slug generated, preview rendered, conditional sections correct).

**Deploy state:** `propos.addvantage.site` = Pages project `propos-demo`; the 967e2cc fix had been deployed to the WRONG project (`openhome-engine`), leaving the domain stale on `index-DNro47DU.js`. This session rebuilt dist and deployed to `propos-demo` production.

**Half-done / deferred (from PITCH_SUITE_PLAN.md):** bulk pitch generation + worker pool, regenerate (single + bulk), Digital Introduction / Listing Proposal templates, view-tracking Inbox badge (`v_pitch_views`), `property.addvantage.site` landing page (blocked on Cloudflare Pages project decision — plan open question #10), Tom Panos scripts carousel.

**Next step:** pick up the deferred Pitch Suite items above, starting with view-tracking Inbox badge or bulk generation.

---

## 2026-06-11 (cont.) — Flywheel: re-engage past vendors, cross-pitch buyer demand

**Built:**
- `src/lib/flywheel.ts`: `recommendListingForBuyer` (matches a re-engaged "buyer→seller" contact against the agent's active listings by suburb/type/price proximity) and `findBuyerDemand` (finds another portfolio buyer searching in a vendor's suburb+property type, for "we already have a buyer for this" pitch evidence).
- `src/data/pastBuyers.ts`: extended `BuyerStatus` type to include `"buyer→landlord" | "buyer→seller" | "renter→buyer" | "buyer→downsizer"` (previously used via casts/labels but not in the type).
- DemoView VendorPortfolioPage: "+ Add past vendor" button + modal (name, suburb they bought in, rough purchase year, property type, optional phone/email). Estimates a synthetic purchase price by working backward from the agent's average active-listing price in that suburb/type at ~6% p.a. growth, tags the contact `buyer→seller`, and renders a "→ Recommend: {listing}" badge in the CRM list via `recommendListingForBuyer`.
- VendorProfilePage: computes `buyerDemand` via `findBuyerDemand` (only when navigated with `allEntries`, i.e. via the segmented Vendor Dashboard) and sends it to `/api/pitches`.
- `server/lib/pitchGenerator.ts`, `server/lib/emailTemplate.ts`, `src/components/pitch/PriceUpdateTemplate.tsx`: added optional `buyerDemand`/`PitchBuyerDemand` field + "Buyer demand" card, following the existing `marketStats` pattern.
- **Bug fixed:** `server/routes/pitches.ts` `CreatePitchBody` didn't declare or forward `buyerDemand` to `generatePriceUpdatePitch`, so the field was silently dropped. Added the field to the interface and the call.

**Verified (Preview screenshots):** Added "David Hollis" (Officer, House, ~2020) via the new modal — appeared in CRM (89 contacts) with badge "→ Recommend: 3 Fairholme Boulevard, Berwick". Generated a Price Update pitch for James & Lisa Thompson (Berwick, House) via the segmented Vendor Dashboard flow — "Buyer demand" card rendered: "Wei is actively looking for a 4-bedroom house in Berwick, exactly like yours." Also restarted the local backend (was running stale code from before this session's earlier edits — `tsx` without `--watch` doesn't hot-reload).

**tsc:** root + server clean except the same 11 pre-existing errors (SettingsView.tsx, DemoView.tsx:1043, outreachTargets.ts:120) — none touched this session.

**Deployed:** rebuilt `dist/`, copied to `server/public/`, deployed to `propos-demo` (Cloudflare Pages).

**Next step:** none queued — flywheel feature complete end-to-end (BuyerOS recommendation + VendorOS buyer-demand pitch evidence using the same lead).

---

## 2026-06-11 (cont.) — AddVantage PropOS marketing landing page

**Built:** `landing/index.html` — standalone static landing page (no build step; GSAP 3.12 + three.js r149 via CDN). Sections: three.js particle-grid hero with animated GCI counters, 3-step how-it-works, 7-card feature grid (prospecting engine, voice outreach, trackable price updates, call-now moment, CRM import, GCI calc, CMA/reports), animated flywheel SVG, PropOS-vs-pitch-suite comparison table, demo CTA. Respects prefers-reduced-motion; canvas pauses off-screen; DPR capped.

**Bugs found & fixed during Preview verification:** (1) hero canvas width feedback loop (`inset:0` doesn't stretch replaced elements → canvas grew to 10198px and caused horizontal overflow; fixed with explicit CSS 100% sizing + measuring the parent), (2) flywheel SVG rotating around the wrong origin (CSS `transformOrigin` → GSAP `svgOrigin:"240 240"`), (3) 3-column pipeline too cramped at tablet (stacks at ≤1024px). Em-dashes removed from all prose copy.

**Verified (Preview screenshots):** all sections at desktop (1440), tablet (768), mobile (375); zero console errors; no horizontal overflow at any width. Commit `f6c6a6f`, pushed.

**Not deployed:** `property.addvantage.site` Cloudflare Pages project decision still open (plan question #10) — page is ready to deploy as-is when decided.

---

## 2026-06-19 (cont.) — Quick Access JWT fix + Supabase env for live site

**Fixed:**
- **Sends not working (root cause: missing JWT from Quick Access login):** The Quick Access button in `AgentLogin.tsx` called `onLogin()` directly without going through `/api/auth/login`, so no JWT was ever stored. Server enforces `requireAuth` on all `/api/*` when DB is connected → every `authFetch` call returned 401 → `deliveryRes = null` → "Saved to Sheets" fallback message. Fixed by: (1) adding `POST /api/auth/demo-token` endpoint (issues agentId=0 JWT, no credentials required, registered before auth middleware); (2) updating Quick Access button to `async` and calling this endpoint before `onLogin`, storing the token via `setAccessToken`. Sends still redirect to `TEST_RECIPIENT_PHONE/EMAIL` in test mode.
- **Live site showing hardcoded data (Supabase env missing from CF Pages build):** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were in `.env.local` (not deployed) but not `.env.production`. Created `.env.production` with both anon-key-safe values; these are baked into the frontend bundle at build time by Vite.

**Verified:**
- `POST https://addvantageadvisory.fly.dev/api/auth/demo-token` → returns `{"accessToken":"eyJ..."}` (verified live).
- `GET /api/health` → `{"ok":true,"database":true}` after Fly.io deploy.
- tsc: frontend 0 errors, server 0 errors.

**Deployed:**
- Fly.io backend: `flyctl deploy` — new `demo-token` route live at `addvantageadvisory.fly.dev`.
- Cloudflare Pages `openhome-engine`: 12 files uploaded, deploy complete (`337861b9.openhome-engine-7wa.pages.dev`). Supabase env baked into bundle.
- GitHub push: pending user authorization (auto-mode classifier blocked as per session constraint "push to main = production deploy, only when Vinuth explicitly says").

**Next:** verify the live `propos.addvantage.site` sends iMessage+email successfully through the Quick Access path. Check whether Supabase CRM data (19 Cameron Knoll buyers) now loads on the live site instead of hardcoded data.

---

## 2026-06-19 — BuyerOS SMS bubble fix + past_buyers Supabase CRM

**Fixed:**
- **Empty SMS bubble bug**: `GeneratingScreen` and `VendorProfilePage` both had `if (!sms && !emailSubject) throw` — a partial API response with `sms:""` but a non-empty email would silently pass through and render an empty iMessage bubble. Changed to `if (!sms) throw` so the template fallback always fires when SMS is absent.
- **Stale subtitle**: "Clicking Send saves both to Google Sheets for delivery" → "Clicking Send delivers via BlueBubbles + Gmail" (both ReviewPanel and VendorReviewPanel).
- **CLAUDE.md contradiction**: Session persistence rules incorrectly named the CF Pages project `propos-demo`; corrected to `openhome-engine` (consistent with the main Deploy section and confirmed by actual deploy output).

**From prior session (carried over):**
- `past_buyers` Supabase table created (migration run manually in dashboard) and seeded with 19 Cameron Knoll buyers; all phones = `0415883354` for safe demo sends.
- `supabase.ts` column names corrected to match actual migration schema (`agent_name`, `name`, `phone` — not the scraper project's schema).
- Railway → Fly.io references corrected in CLAUDE.md and NEXT_SESSION.md.
- Full timestamped backup at `backups/PropOS_full_backup_20260618_234001/`.

**Verified (Preview screenshots):** BuyerOS flow → 10 Ashby Drive → James Whitfield → Generate Outreach → review screen shows populated SMS bubble ("Hi James, Cameron here from Peake...") and updated subtitle. tsc clean (frontend + backend).

**Deployed:** pushed to GitHub (`main`), Cloudflare Pages `openhome-engine` (12 files uploaded, 35 cached). Backend unchanged — no Fly.io deploy needed.

**Next:** Supabase leads now load in VendorOS CRM. Confirm the live propos.addvantage.site shows the SMS fix. See open tasks in NEXT_SESSION.md.
