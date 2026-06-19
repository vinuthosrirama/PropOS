# PropOS — Session Notes & Ideas Bank
_Last updated: 19 June 2026 — Session 16 (prompt loop + multi-agent provisioning plan)_

---

## TOP PRIORITY — Multi-Agent Demo Provisioning (NOT YET IMPLEMENTED)

### Goal
Duplicate the Cameron Knoll demo for Anthony Abeysena (The 5th Avenue Real Estate, Chadstone). Future agents provisioned in <30 min via a CLI script — zero code changes.

### Why it matters
PropOS pitch to each new agent shows THEIR sold listings, THEIR active listing, THEIR name in messaging, THEIR brand colours. Currently only Cameron Knoll is fully wired. Anthony has 3 hardcoded sold listings (needs 8).

### Anthony Abeysena data (source: REA profile scraped by Vinuth)
```
Agency: The 5th Avenue Real Estate — Chadstone VIC
Brand: primary #1a1a1a, accent #D4AF37 (gold), logo "5A"
Email (demo): anthony@5thavenuere.com.au
Sold listings (8):
  1. 18 Straun Road, Mickleham        $730k  4bd 2ba  22 May 2026  14 leads
  2. 5 Glenisla Way, Berwick          $940k  4bd 2ba  18 Mar 2026  19 leads
  3. 9 Sugarloaf Grove, Werribee      $685k  4bd 2ba  06 Mar 2026  11 leads
  4. 2 Chow Walk, Officer             $720k  4bd 2ba  05 Mar 2026   9 leads
  5. 21 Ashton Road, Ferntree Gully   $880k  3bd 1ba  14 Jan 2026   7 leads
  6. 21 Mountain Way, Doreen          $951k  4bd 3ba  12 Jan 2026  16 leads
  7. 8 Cubbie Way, Clyde North        $850k  4bd 2ba  25 Dec 2025  12 leads
  8. 33 Nugget Way, Cranbourne East   $540k  3bd 2ba  06 Oct 2025   8 leads
Active listing (1):
  18 Maplewood Circuit, Truganina    $700k–$740k  4bd 2ba  open TBD
Demo leads: clone Cameron's 10 buyers, keep phones/email=vinuth.srirama@outlook.com
Voice: clone Cameron's VoiceProfile (confidence 0.35 — placeholder)
```

### Files to create/modify (in order)

**Step 1 — DB migrations** (`server/lib/db.ts`):
```sql
CREATE TABLE IF NOT EXISTS agent_portfolios (
  id SERIAL PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  address TEXT NOT NULL, suburb TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'VIC', postcode TEXT,
  price INTEGER NOT NULL, price_min INTEGER, price_max INTEGER,
  beds INTEGER NOT NULL, baths INTEGER NOT NULL, cars INTEGER NOT NULL DEFAULT 0, land_sqm INTEGER,
  property_type TEXT NOT NULL DEFAULT 'House',
  status TEXT NOT NULL DEFAULT 'sold' CHECK (status IN ('sold','active','under_offer')),
  sold_date TEXT, open_date TEXT, lead_count INTEGER NOT NULL DEFAULT 8,
  image_url TEXT, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agent_property_slm (
  id SERIAL PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  portfolio_id INTEGER NOT NULL REFERENCES agent_portfolios(id) ON DELETE CASCADE,
  slm_json JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brand_primary TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brand_accent TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brand_logo TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brand_gradient TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS years_exp INTEGER;
```

**Step 2** — `server/routes/agent-demo.ts` (NEW): GET /portfolio, /slm/:id, /leads, /theme — all use `req.agentId`; return HTTP 204 if no DB data (frontend falls back to hardcode).

**Step 3** — Register in `server/index.ts`: `app.use("/api/agent-demo", agentDemoRouter)` — must go BEFORE `requireAuth` or use its own auth check.

**Step 4** — `scripts/agent-data/anthony-abeysena.json` (NEW): all 8 sold + 1 active, brand, bio, reviews.

**Step 5** — `scripts/provision-agent.ts` (NEW): reads JSON → upserts agent row → deletes+reinserts agent_portfolios → generates SLM JSON via Claude Haiku per property → clones Cameron's buyers into sms_contacts with `assigned_agent_id=agentId` → seeds voice_profiles with Cameron's profile at confidence=0.35.

**Step 6** — `src/lib/agentDemoFetcher.ts` (NEW): `fetchAgentPortfolio()`, `fetchAgentTheme()`, `fetchAgentLeads()` — call `/api/agent-demo/*`, cache in sessionStorage.

**Step 7** — `src/data.ts`: add `let _dbPortfolioCache = null`, `export function setDBPortfolioCache(data)`, modify `getPortfolioForAgent()` to check `_dbPortfolioCache` first (DB wins over hardcoded Anthony data).

**Step 8** — `src/views/DemoView.tsx`: add `useEffect` on mount: fetch portfolio + theme; call `setDBPortfolioCache(p)` + apply CSS vars `--c-brand` / `--c-brand-accent`.

**Step 9** — `.claude/skills/provision-agent-demo/SKILL.md`: Claude skill that parses pasted REA profile → creates JSON → runs provisioner → prints demo URL.

### Key decisions already made
- Anthony's existing 3 hardcoded listings in `src/data.ts` (lines 828–874) stay as fallback; DB wins
- Demo leads: randomly assign Cameron's 10 buyers to Anthony's sold listings (same phones, email=vinuth.srirama@outlook.com)
- Voice: clone Cameron's profile, confidence=0.35
- SLM per property: Haiku-generated from listing data (cheap, ~$0.001 each)
- Provisioning is idempotent (re-run safe)

---

## Session 15 Summary — What Was Built (19 June 2026)

### 1. Analytics SQL Fix (`ceee03a`)
- `server/routes/analytics.ts`: demo JWT sends `agentId=0`; `0 ? ... : "default"` returned `"default"` which failed SQL integer cast. Fixed with `??` (nullish coalescing).

### 2. Prompt Evolution Loop — Fully Wired (`cceb55d`)
Previously `promptOptimiser.ts` existed but was completely unwired. Now:
- **Generation**: `evolvedRules` fetched from DB and injected into every LLM generation call
- **Threading**: `versionId` flows from `/api/generate` → DemoView stages → `/api/send` payload
- **Signal recording**: every successful delivery calls `recordSignal(versionId, "approved")`
- **Optimisation cycle**: reads both VendorOS (outreach_drafts) and BuyerOS (metadata.smsBody) signals
- **Triggers**: weekly cron Sun 2am AEST + immediate trigger at 15 signals

### Git state
- Pushed 2 commits to `origin/main`: `ceee03a` + `cceb55d`
- Deployed to Fly.io — health check confirmed `{"ok":true,"database":true}`
- Frontend NOT re-deployed (DemoView changes are minor threading, no visible UI change)

---

## Session 14 Summary — What Was Built (12 June 2026)

### Fable Plan — All Items Completed

#### 1. Listing Proposal Pitch Template (`src/components/pitch/ListingProposalTemplate.tsx`)
Full-page vendor pitch with: agency badge, property address + estimated range, method of sale card (auction/private sale/EOI with emoji + description), comparable sales table, 2x2 agency stats grid, marketing plan items, 4-week campaign timeline with vertical line/dots, testimonials carousel, CTA buttons (call + email). Routed via `/p/:slug` when `pitch.type === "proposal"`.

#### 2. Digital Introduction Template (`src/components/pitch/DigitalIntroductionTemplate.tsx`)
Already built in previous sessions. Routing re-applied after rebase in PitchView.tsx.

#### 3. Sleeping GCI Hero Stat (DemoView — VendorPortfolioPage)
Animated card above CRM stats strip: "DORMANT GCI IN YOUR CRM" with pulsing `$992K+` figure, computed from `totalEstValue * 0.02 * 0.60`. "Find my listings →" CTA button.

#### 4. AI Reply Agent Badge (`src/components/Nav.tsx`)
Green pulsing pill on desktop in demo view: "AI Replies: Active". Uses `motion.div` with `opacity` keyframe animation. Uses `bp === "desktop"` (not `bp !== "mobile"`) because Nav early-returns for mobile.

#### 5. Voice Confidence Badge (DemoView — Price Update tab)
After `pitchSent` state: pulsing purple dot + "Drafted in Cameron's voice — 91% style match" badge.

#### 6. Tom Panos Scripts A/B/C
Script C added: "Warm check-in after pitch send" — references the pitch sent and asks if they've seen it.

#### 7. GCI Calculator (`src/components/GciCalculator.tsx`)
Already existed (175 lines). Verified working.

#### 8. Mass Send Scale Counter (`src/components/OutreachQueue.tsx`)
Animated strip between header and queue items showing: pulsing green dot + "Sending to N contacts", Est. GCI $Xk+ (computed as `approvedCount * 2000`), and "4-6x higher response rate". Also added Est. GCI line to bottom sticky send bar.

#### 9. Response Rate Claim (DemoView — ReviewPanel)
Stats bar above "Approve and Send" button: "4-6x higher reply rate vs generic" | "91% voice style match" | "160 char SMS, personalised". Uses `theme.primary` for accent colours.

#### 10. Appraisal Booking Loop Milestone (DemoView — ReviewPanel sent state)
3-step progress indicator after send: "Outreach sent ✓ → Reply received → Inspection booked". Steps light up as `leadStatus` advances. Shows on the sent confirmation screen.

### Git / Deployment
- Resolved 3-way merge conflict in `SettingsView.tsx` (rebase mid-session)
- Removed duplicate `IntegrationsPanel` export (replaced by `ConnectionsPanel`)
- Re-applied `PitchView.tsx` DigitalIntroduction + ListingProposal routing after rebase
- Backend: pushed to GitHub + deployed via `flyctl deploy`
- Frontend: `npx wrangler pages deploy dist --project-name propos-demo`

---

## Outstanding Todos (after Session 14)

### PropOS Product Improvements
1. **Onboarding <10 min claim** — prominent setup time counter in agent onboarding screen
2. **Bulk pitch generation** — "Generate All" button to create pitch pages for entire portfolio
3. **Settings View Audit** — move ALL settings into Settings view: communication style selector, follow-up styles, featured listing management, integrations section, comparable sales section
4. **`property.addvantage.site` landing page** — deploy to Cloudflare Pages (blocked on CF Pages decision)
5. **Mass send — "Generate All" button** — trigger pitch generation for all contacts in OutreachQueue before sending

### Self-Outreach Campaign (Vinuth's outbound to RE agents)
See Session 13 checklist for Railway env vars setup, seeding, and testing steps.

---

## Working Instructions for Future Claude Sessions

### Rule #1 — Always update this file at end of session
After completing any task, update NEXT_SESSION.md with new learnings, architectural decisions, and what was built. Commit and push so the next session picks up from the right place.

### Rule #2 — Ask clarifying questions before building
Before implementing any feature, confirm: scope, which view it lives in, whether it replaces or extends something existing, any specific UX behaviour.

### Rule #3 — Zero emoji in static UI
No emoji in buttons, labels, nav, cards, or banners. ONLY allowed in animation spinners. Plain Unicode `✓`, `✕`, `→` are fine anywhere.

### Rule #4 — Inline styles only, no Tailwind, no CSS files
All styling via React `style={{}}`. Use `C` colour tokens. Use `FONT` for font-family. Use `useBreakpoint()` for responsive behaviour.

### Rule #5 — TypeScript strict — zero errors before every commit
Run `npx tsc --noEmit` and fix all errors before committing. Server-only check: `cd server && npx tsc --noEmit`.

### Rule #6 — No em-dashes anywhere
Never use `—` in AI-generated or static text. Use commas, "to", or periods.

### Rule #7 — Default agent is Cameron Knoll @ Peake Real Estate, Berwick
Never revert to "Simon" or "Harcourts". See `src/data.ts` for agent/theme config.

### Rule #8 — Product branding
Product = PropOS. Powered by = AddVantage AI. Never surface GPT-4o, Claude, Anthropic, etc.

### Rule #9 — Git workflow on local Mac
```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
git ls-files --modified          # check changes (git status may hang)
git add -A && git commit -m "..."
git push origin main             # GitHub backup — does NOT deploy backend
npm run build
npx wrangler pages deploy dist --project-name propos-demo --branch main  # frontend → propos.addvantage.site
flyctl deploy                    # backend → Fly.io (addvantageadvisory, region syd)
```

### Rule #10 — Deploy targets
- Frontend: Cloudflare Pages (`propos-demo` project) → propos.addvantage.site
- Backend: **Fly.io** app `addvantageadvisory` — deploy via `flyctl deploy` (NOT auto on git push)
- DB: Supabase PostgreSQL (`DATABASE_URL` in Fly.io secrets, NOT Railway)
- **Never use Railway** — Fly.io is the free alternative going forward

---

## Session 13 Summary — What Was Built (8 June 2026)

### Complete Self-Outreach AI Agent — End-to-End

#### 1. Outreach Agent (`server/lib/outreachAgent.ts`) — NEW
Claude-powered reply and follow-up generator for Vinuth's campaign pitching PropOS to RE agents.

- `generateOutreachDraft(target, inboundMessage)` — Claude haiku generates a reply in Vinuth's voice (<=160 chars, no em-dashes)
- `generateFollowUp(target, daysSince)` — generates a fresh follow-up angle for non-replied targets
- `handleOutreachInbound(from, body)` — called from the inbound webhook; matches phone to outreach_targets, updates CRM status, saves draft
- `getMorningBrief()` — returns overnight replies, pending drafts, follow-ups due, CRM stats
- `saveOutreachDraft/getPendingDrafts/approveDraft/markDraftSent/rejectDraft` — full draft lifecycle

Vinuth's voice profile embedded as Claude system prompt:
- Direct, 1-2 sentences, references specific sale prices/data
- Australian tone, no corporate speak, signs off as "Vinuth"
- Moves every conversation toward a 5-min demo call

#### 2. Outreach Scheduler (`server/lib/outreachScheduler.ts`) — NEW
Cron-based daily automation:
- 9:00am Melbourne (weekdays): morning brief logged to console + follow-up drafts queued
- 10:00am Melbourne (weekdays): sends up to 5 initial messages to 'new' targets with ±12min jitter
- Hardened: test mode (TEST_RECIPIENT_PHONE), daily cap (OUTREACH_DAILY_CAP=5), carrier throttle gaps
- `triggerOutreachNow(limit)` — manual trigger for testing
- `getSchedulerStatus()` — returns running state, caps, test mode info

#### 3. outreach_drafts table (`server/lib/db.ts` update)
New DB table auto-created on startup:
- Stores AI-generated reply drafts with status: pending/approved/rejected/sent
- Linked to outreach_targets via target_id
- Indexes on target_id and status for fast inbox queries

#### 4. New API Endpoints (`server/routes/outreach-targets.ts` additions)
```
GET  /api/outreach-targets/brief              — morning summary (drafts, replies, follow-ups)
GET  /api/outreach-targets/drafts             — pending AI drafts awaiting approval
POST /api/outreach-targets/approve-draft/:id  — approve (+ optional edit) + send immediately
POST /api/outreach-targets/reject-draft/:id   — discard draft
POST /api/outreach-targets/trigger-now        — manually fire today's sends (test)
GET  /api/outreach-targets/:id/thread         — full conversation thread + drafts for one target
POST /api/outreach-targets/:id/reply          — manually send custom reply
POST /api/outreach-targets/:id/generate-draft — on-demand AI draft generation
```

#### 5. Inbound Routing (`server/index.ts` update)
`handleIncomingReply` now runs both pipelines in parallel:
1. Existing: addReplyToThread + cancelNurtureJobs (buyer/vendor lead pipeline)
2. New: handleOutreachInbound (self-outreach CRM pipeline — non-fatal, void)

#### 6. Product Scope Document (`PROPTECH_SCOPE.md`) — NEW
Complete product vision, architecture diagram, daily workflow, all API endpoints,
environment variable reference, CRM status flow, roadmap P0-P2, and competitor context.
This is the source of truth for future sessions.

#### 7. SMS Script Fixes (`server/data/outreachTargetsSeed.ts`)
All 16 outreach SMS scripts fixed: each now <=160 chars, zero em-dashes, full personalisation retained.
Simulation test confirms: all scripts 143-158 chars.

---

## Session 13 — P0 Launch Checklist (on your Mac)

### Step 1: Merge and deploy
```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
git fetch origin
git checkout main
git merge claude/prop-os-repo-access-vo46q
git push origin main
npm run build
npx wrangler pages deploy dist --project-name propos-demo --branch main  # frontend
flyctl deploy                                                              # backend (Fly.io)
```

### Step 2: Set server env vars on Fly.io
```bash
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-... --app addvantageadvisory
flyctl secrets set TEST_RECIPIENT_PHONE=+61XXXXXXXXX --app addvantageadvisory
flyctl secrets set OUTREACH_DAILY_CAP=5 --app addvantageadvisory
flyctl secrets set OUTREACH_FOLLOWUP_DAYS=3 --app addvantageadvisory
```
Plus whichever SMS transport you're using (see PROPTECH_SCOPE.md).

### Step 3: Seed outreach targets
```bash
curl -X POST https://propos.addvantage.site/api/outreach-targets/seed
# Expected: {"ok":true,"total":16,"upserted":16}
```

### Step 4: Test the full loop on YOUR number
```bash
# Fire one send to yourself (TEST_RECIPIENT_PHONE)
curl -X POST https://propos.addvantage.site/api/outreach-targets/trigger-now \
  -H "Content-Type: application/json" -d '{"limit":1}'

# Text yourself a fake reply (simulates what happens when an agent replies)
# The system will auto-generate a Claude draft for your approval

# Check pending drafts
curl https://propos.addvantage.site/api/outreach-targets/drafts

# Approve the draft and send it back to yourself
curl -X POST https://propos.addvantage.site/api/outreach-targets/approve-draft/1
```

### Step 5: Go live
Once the loop works end-to-end on your own number, REMOVE TEST_RECIPIENT_PHONE from Fly.io secrets: `flyctl secrets unset TEST_RECIPIENT_PHONE --app addvantageadvisory`. The scheduler will start sending to real targets at 10am the next business day.

---

## Session 12 Summary — What Was Built (8 June 2026)

This was a remote cloud session. All changes are on branch:
`claude/prop-os-repo-access-vo46q`

**To pick up on your Mac:**
```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
git fetch origin
git checkout claude/prop-os-repo-access-vo46q
# Review, then merge to main:
git checkout main
git merge claude/prop-os-repo-access-vo46q
git push origin main
# Then deploy to Cloudflare + Railway (see Rule #9)
```

### What was built this session

#### 1. SMS Transport Layer — Complete Rewrite (6 transports)
**Files:** `server/lib/sms.ts`, `server/SMS_SETUP.md`

PropOS now supports 6 SMS transports with automatic fallback chain:

| Transport | `SMS_TRANSPORT=` | Requires | iMessage? | Speed |
|---|---|---|---|---|
| BlueBubbles | `bluebubbles` | Mac (always-on) | Yes (blue bubble) | ~1s |
| TextingBlue | `textingblue` | iPhone shortcut only | Yes (blue bubble) | ~2s |
| imsg CLI | `imsg` | Mac + CLI tool | Yes | ~2s |
| TeleLink | `telelink` | Windows PC + Phone Link | SMS relay | ~12s |
| Android Gateway | `android-gateway` | Android phone + free app | SMS only | ~3s |
| Twilio | `twilio` | Cloud API key | SMS only | ~1s |

Fallback chain: set `SMS_TRANSPORT_FALLBACK=twilio` — if primary fails, auto-retries with fallback.

#### 2. BlueBubbles — Hardened (`server/lib/bluebubbles.ts`)
- 3-attempt retry with 500ms/1s exponential backoff
- 15s per-attempt timeout
- `parseBBSendError()` — parse `message-send-error` webhook events
- Return type normalised: `{ sid }` (was `{ guid }`)

#### 3. TeleLink Transport (`server/lib/telelink.ts`)
Windows/Phone Link bridge. Uses `POST /intake` on TeleLink's local HTTP server. pywinauto automats the Phone Link UI (~12s per send). 3-attempt retry, 30s timeout.
**GitHub:** https://github.com/nicholasxdavis/telelink

#### 4. TextingBlue Transport (`server/lib/textingblue.ts`)
Best option for iPhone agents who don't have a Mac. Agent installs iOS Shortcut → PropOS sends real iMessages from their Apple ID.
**API:** `POST https://api.texting.blue/v1/messages/send` with `x-api-key` header.
**GitHub:** https://github.com/textingblue/imessage-api
**Free tier:** 100 messages/month. Paid plans available.

#### 5. Android SMS Gateway (`server/lib/androidgateway.ts`)
Best option for Android agents. Installs free app (`sms-gate.app`) on Android device, exposes REST API, sends real carrier SMS from SIM.
**GitHub:** https://github.com/capcom6/android-sms-gateway
**Built-in throttle:** 22s gap between sends (~2.7/min, under carrier limits)
**Webhook:** `POST /api/webhook/android-gateway`

#### 6. Outreach Targets — DB + API (`server/routes/outreach-targets.ts`, `server/lib/db.ts`)
PropOS self-demo campaign infrastructure. Stores real estate agents we want to pitch.

**DB table:** `outreach_targets` (auto-created in `server/lib/db.ts` migrate())
- Fields: name, agency, phone, email, suburb, recent_sale_address, personal_note, sms_script, status
- Status flow: `new` → `contacted` → `replied` → `demo_booked` → `won`

**API endpoints:**
```
POST /api/outreach-targets/seed       # upsert all 16 seed agents
GET  /api/outreach-targets            # list all (optional ?status=new)
GET  /api/outreach-targets/:id        # single agent
PUT  /api/outreach-targets/:id        # update status/notes/reply
POST /api/outreach-targets/send/:id   # fire SMS to one agent
POST /api/outreach-targets/send-batch # fire up to 20/day to all 'new'
```

#### 7. 16-Agent Seed List (`server/data/outreachTargetsSeed.ts`)
Scraped boutique agencies in Berwick, Ferntree Gully, and surrounding VIC suburbs. All have <20 agents. Includes personalised SMS script for each referencing a specific recent sale.

**Agencies covered:**
- Chandler & Co Real Estate (Belgrave) — 6 agents
- Fletchers Yarra Ranges (Tecoma/Olinda) — 9 agents
- GR8 EST8 Agents (Narre Warren) — 10 agents
- Only Estate Agents (Narre Warren) — 4 agents
- Elite Agents & Partners (Berwick) — 5 agents
- AgentX Real Estate (Narre Warren/Berwick) — 5 agents
- Kaye Charles Real Estate (Beaconsfield) — 4 agents
- Uphill Real Estate (Officer) — 5 agents
- Top Estate Agents (Clyde North) — ~20 agents (borderline)

#### 8. Supabase Outreach Client (`src/lib/outreachTargets.ts`)
Frontend-side Supabase CRUD for outreach_targets: upsert, fetch, markContacted, recordReply, markDemoBooked.
Also: `supabase/migrations/20260608_create_outreach_targets.sql`

---

## Session 12 — Next Steps on Laptop (in priority order)

### P1 — Merge and Deploy (30 min)
```bash
git merge claude/prop-os-repo-access-vo46q
git push origin main
npm run build
npx wrangler pages deploy dist --project-name propos-demo --branch main
flyctl deploy   # backend → Fly.io (addvantageadvisory)
```

### P2 — Configure SMS Transport (choose one based on your device)

**If you have a Mac in office with iPhone:**
```env
# server/.env
SMS_TRANSPORT=bluebubbles
SMS_TRANSPORT_FALLBACK=twilio
BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
BLUEBUBBLES_PASSWORD=your_password
```

**If you only have an iPhone (no Mac):**
1. Sign up at https://texting.blue → get API key
2. Install the TextingBlue iOS Shortcut on your iPhone
```env
SMS_TRANSPORT=textingblue
SMS_TRANSPORT_FALLBACK=twilio
TEXTINGBLUE_API_KEY=tb_live_xxxx
```

**If you have an Android phone:**
1. Install "SMS Gateway for Android" from Google Play (or https://sms-gate.app)
2. Start local server in app → expose via Cloudflare Tunnel
```env
SMS_TRANSPORT=android-gateway
SMS_TRANSPORT_FALLBACK=twilio
ANDROID_GW_URL=https://xxxx.trycloudflare.com
ANDROID_GW_USER=user
ANDROID_GW_PASS=pass
```

### P3 — Set TEST_RECIPIENT_PHONE First (critical before any live sends)
```env
# server/.env — redirects ALL sends to your own number for testing
TEST_RECIPIENT_PHONE=+61XXXXXXXXX
```
Remove this line only when ready to go live to real agent contacts.

### P4 — Seed Outreach Targets to Supabase
```bash
# Once Railway is deployed and DATABASE_URL is set:
curl -X POST https://propos.addvantage.site/api/outreach-targets/seed
# Verify:
curl https://propos.addvantage.site/api/outreach-targets | jq '.total'
# Expected: 16
```

### P5 — Test Fire One SMS
```bash
# Send to yourself first (TEST_RECIPIENT_PHONE must be set):
curl -X POST https://propos.addvantage.site/api/outreach-targets/send/1 \
  -H "Content-Type: application/json"
```

### P6 — Run the Live Campaign
Once TEST_RECIPIENT_PHONE is removed from .env:
```bash
# Send to up to 20 agents (2s gap between each)
curl -X POST https://propos.addvantage.site/api/outreach-targets/send-batch \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### P7 — Track Responses
```bash
# See who replied:
curl "https://propos.addvantage.site/api/outreach-targets?status=replied"
# Mark a demo booked:
curl -X PUT https://propos.addvantage.site/api/outreach-targets/3 \
  -H "Content-Type: application/json" \
  -d '{"status":"demo_booked","notes":"Called back, keen, demo Fri 2pm"}'
```

---

## Outstanding Todos from Previous Sessions

### PropOS Product Improvements (from Ociate competitor analysis)
1. **Sleeping GCI Hero stat** — show "You have 247 contacts. Est. dormant GCI: $340k+" on portfolio screen
2. **AI Reply Agent badge** — surface `server/routes/reply-agent.ts` as "● AI Replies: Active" pill in Nav
3. **Mass send scale counter** — in OutreachQueue, show "Sending to 34 contacts / Est. GCI: $68k+"
4. **Voice confidence badge** — after generation: "Drafted in Cameron's voice — 91% style match"
5. **Response rate claim** — add "4-6x higher response rates" stat in review/send stage
6. **Appraisal booking loop** — show "Sent → Reply received → Appraisal booked ✓" milestone in demo
7. **Onboarding <10 min claim** — prominent setup time counter in agent onboarding screen

### Settings View Audit (from Session 11)
Move ALL into Settings view: communication style selector, follow-up styles, featured listing management, integrations section, comparable sales section.

---

## Architecture Reference

### SMS Transport Decision Tree
```
Agent device?
├── Mac in office           → SMS_TRANSPORT=bluebubbles (iMessage, real number, best)
├── iPhone only (no Mac)    → SMS_TRANSPORT=textingblue (iMessage via iOS shortcut)
├── Android phone           → SMS_TRANSPORT=android-gateway (real SIM SMS)
├── Windows PC              → SMS_TRANSPORT=telelink (Phone Link, ~12s/msg)
└── No devices              → SMS_TRANSPORT=twilio (fallback, generic number)

Always add: SMS_TRANSPORT_FALLBACK=twilio
```

### Webhook URLs (all mounted in server/index.ts)
```
POST /api/webhook/sms              ← Twilio incoming
POST /api/webhook/bluebubbles      ← BlueBubbles incoming + send errors
POST /api/webhook/telelink         ← TeleLink incoming
POST /api/webhook/textingblue      ← TextingBlue incoming
POST /api/webhook/android-gateway  ← Android Gateway incoming
```

### Key .env Variables (server/.env)
```
# Core AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Database
DATABASE_URL=                        # Supabase PostgreSQL connection string
SUPABASE_URL=                        # Also set VITE_SUPABASE_URL in root .env

# SMS — pick primary + fallback
SMS_TRANSPORT=bluebubbles
SMS_TRANSPORT_FALLBACK=twilio
BLUEBUBBLES_URL=
BLUEBUBBLES_PASSWORD=
TEXTINGBLUE_API_KEY=
ANDROID_GW_URL=
ANDROID_GW_USER=
ANDROID_GW_PASS=
TELELINK_URL=
TELELINK_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Testing (remove before live sends)
TEST_RECIPIENT_PHONE=+61XXXXXXXXX

# Server
BASE_URL=https://propos.addvantage.site
PORT=3001
```

### Fly.io Deploy Config (`fly.toml`)
- App: `addvantageadvisory`, region: `syd`
- Deploy: `flyctl deploy` from repo root
- Secrets: `flyctl secrets set KEY=value --app addvantageadvisory`
- Logs: `flyctl logs --app addvantageadvisory`

---

## Competitor Context (Ociate.ai)
- Ociate = bulk SMS blast to 3,000+ contacts, AI learns agent style, 24/7 auto-replies, lead scoring, appointment booking
- Their claim: 6x response rates, <10 min setup
- PropOS differentiator: SLM-scored matching (right buyer to right listing), voice corpus training, BuyerOS/VendorOS split, real phone number via BlueBubbles/TextingBlue
- Positioning: "Ociate sends 3,000 generic messages. PropOS sends 40 perfectly matched, personalised messages that convert."

---

## GitHub
- Repo: https://github.com/vinuthosrirama/PropOS.git
- Feature branch: `claude/prop-os-repo-access-vo46q`
- Main: push to GitHub, then `flyctl deploy` for backend (Fly.io does NOT auto-deploy on push)
