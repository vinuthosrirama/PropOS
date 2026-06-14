# Conversational SMS Agent — 4-Stage Build

> Autonomous SMS/iMessage conversational agent on Vinuth's real iPhone number via BlueBubbles.
> Brain: Sonnet 4.6 (`claude-sonnet-4-6`). Voice calibration: Fable 5 (`claude-fable-5`).
> Memory: Supabase Postgres. Built INTO the PropOS server (extends existing infra).

**Branch:** `sms-agent` (push here so other laptops can `git checkout sms-agent` and continue).
Merge to `main` only when you want it live on Railway (main push = production deploy).

---

## Why it lives in PropOS

This agent reuses infrastructure that already exists and is deployed:

| Need | Reused from PropOS |
|---|---|
| Send iMessage/SMS from real number | `server/lib/bluebubbles.ts` (`sendViaBlueBubbles`) + `sms.ts` cascade |
| Inbound replies | `index.ts` `handleIncomingReply` → webhooks already wired |
| Conversation memory | `server/lib/conversations.ts` (`addReplyToThread`, `addAgentMessageToThread`, `getThread`) |
| Anthropic client | `server/lib/claude.ts` (`getClient`, `withLLMTimeout`) |
| Em-dash / AI-tell safety net | `server/lib/sanitise.ts` (`sanitiseText`) |
| DB + migrations | `server/lib/db.ts` (`query`, `execute`, `migrate` steps) |
| CRM of agents (Stage 3/4) | `outreach_targets` table |
| Voice-evolution precedent | `server/lib/promptOptimiser.ts` |

New code is additive and **guarded**: every module no-ops without `DATABASE_URL` + the relevant
env vars, so deploying it never breaks the existing server.

---

## Architecture

```
iPhone ──► BlueBubbles (Mac) ──► PropOS /api/webhook/bluebubbles ──► handleIncomingReply
                                                                          │
                              ┌───────────────────────────────────────────┤ (parallel, non-fatal)
                              ▼                          ▼                  ▼
                   addReplyToThread          handleOutreachInbound   handleSmsAgentInbound  ◄── NEW
                   (buyer/vendor)            (outreach_targets CRM)  (sms_contacts, this build)
                                                                          │
                                              ┌───────────────────────────┤
                                              ▼                           ▼
                                  smsAgent.generateReply        calendarAgent.negotiate
                                  (Sonnet 4.6, voice profile)   (Sonnet 4.6, Stage 3+)
                                              │                           │
                                              ▼                           ▼
                                  auto-send  OR  queue draft  ──► sms_agent_drafts (approval queue)
                                              │
                                              ▼
                                  voice_signals (approve/edit/reject) ──► Fable 5 recalibration
```

---

## Data model (new tables, added to `server/lib/db.ts` migrate steps)

- **`voice_profiles`** — one calibrated voice profile per `voice_id` (JSONB `profile`, `confidence`, `samples_analysed`).
- **`sms_contacts`** — people the agent texts. `relationship` (business_partner|close_friend|family|agent_prospect), `stage` (1-4), `personalisation` JSONB, `voice_override` JSONB, `conversation_objective`, `auto_reply`, `status`, `follow_up_at`, `attempts`.
- **`sms_agent_drafts`** — approval queue. `contact_id`, `inbound_body`, `draft_body`, `reasoning`, `voice_confidence`, `auto_send`, `send_at`, `status` (pending|approved|rejected|sent), `edited_body`, `channel`.
- **`voice_signals`** — learning data. `draft_body`, `action` (approved_as_is|edited|rejected), `edited_body`, `edit_diff`, `contact_id`, `relationship`.
- **`calendar_slots`** — `contact_id`, `proposed_time`, `status` (proposed|accepted|declined|rescheduled|blocked), `location`, `notes`.

---

## Modules (all under `server/lib/`)

| File | Stage | Role |
|---|---|---|
| `voiceProfile.ts` | all | Load/save/format the calibrated voice profile. Ships a sane default so nothing breaks pre-calibration. |
| `voiceCalibration.ts` | 1, 2 | Fable 5 calibration from text samples; weekly recalibration from `voice_signals`. |
| `smsContacts.ts` | all | CRUD for `sms_contacts`, `voice_signals`, `calendar_slots`. |
| `smsAgent.ts` | 1, 2 | Sonnet 4.6 runtime: `generateOpener`, `generateReply`. Structured JSON output, voice + personalisation + thread. |
| `calendarAgent.ts` | 3 | Sonnet 4.6 calendar negotiation (classify YES/COUNTER/VAGUE/QUESTION/DECLINE/RESCHEDULE → action + booking). |
| `smsAgentInbound.ts` | all | Inbound handler wired into `handleIncomingReply`. Auto-send vs queue, after-hours rule, stage routing. |
| `smsOrchestrator.ts` | 4 | Daily 7am cron: follow-ups, new outreach queue, meeting prep, voice-health check. |
| `routes/sms-agent.ts` | all | API: contacts, drafts, approve/reject, calibrate, voice-profile, initiate, seed. |
| `data/smsAgentSeed.ts` | 1 | Stage-1 test contact + voice-sample template. |

---

## Stage status (update this as you build — it is the cross-machine handoff)

- [x] **Scaffolding** — build doc, branch, DB migrations, types, contacts CRUD, voice profile store
- [x] **Stage 1 (code)** — voice calibration (Fable 5), conversational runtime (Sonnet/GPT-4o-mini), opener + reply, approval queue, webhook wiring
- [x] **Stage 2 (code)** — relationship voice overrides, auto-send criteria for simple acks, weekly voice recalibration from signals
- [x] **Stage 3 (code)** — connect `outreach_targets`, calendar negotiation + booking
- [x] **Stage 4 (code)** — daily orchestrator cron, follow-ups, meeting prep, voice-health gate
- [x] **Stage 1 — outbound verified (2026-06-13)** — `/seed-stage1` + `/initiate/:id` generated a real
  opener via `generateChatJSON` (OpenAI gpt-4o-mini fallback, no Anthropic key set) and sent it via
  BlueBubbles to Vinuth's own phone. Message: *"Hey mate, how did the demo prep go? keen to chat about
  PropOS and our plans, maybe catch up later this week?"* — recorded to the conversation thread.
- [x] **Stage 1 — inbound verified (2026-06-13)** — webhook-auth bug fixed (see issue #1, now
  resolved): `/api/webhook/*` is exempted from the global `requireAuth` middleware and gated only by
  `verifyWebhookSecret`. Locally verified: POST without `?secret=` → 401, wrong secret → 401, correct
  secret → 200 and the payload reaches `handleSmsAgentInbound` → `generateReply` → `saveAgentDraft`
  (draft id=1 appeared in `GET /api/sms-agent/drafts`, then `POST /drafts/1/reject` → `voice_signals`
  row recorded). `WEBHOOK_SECRET` is set locally (`server/.env`); BlueBubbles webhook URL registered
  on startup as `${BASE_URL}/api/webhook/bluebubbles?secret=...`.
- [x] **In-app Voice Agent UI (2026-06-13)** — new "Voice" tab in PropOS (`src/views/VoiceAgentView.tsx`,
  `server/routes/sms-agent.ts` `POST /contacts/:id/send`). Lets Vinuth type, edit, and send iMessages
  via BlueBubbles, view conversation threads, approve/edit/reject pending drafts, and run voice
  calibration — all from the browser, no terminal/curl needed. Includes an inline sign-in form
  (`authRequired` state) since `/api/sms-agent/*` requires a JWT. Verified end-to-end in Preview:
  logged in as `vinuth.o.srirama@gmail.com`, selected "Test Partner", sent a live message that
  appeared in the thread, opened the calibration panel.
- [x] **Vinuth confirmed live on his real phone (2026-06-13)** — "Testing PropOS mainframe send —
  voice agent UI working!" sent from the Voice tab arrived as a real iMessage on Vinuth's phone.
  Full send path (UI → `/api/sms-agent/contacts/:id/send` → `sendSMS` → BlueBubbles → iPhone) is
  confirmed working end-to-end, not just in the dev preview thread.
- [ ] **Live test with a real business partner** — pending 20 real voice samples via `/calibrate`.
- [x] **CRM-Triggered Auto-Outreach + per-agent learning loop (code, 2026-06-13)** — all 8 build
  items from "Planned: CRM-Triggered Auto-Outreach + MVP Hardening" below are implemented and
  `tsc --noEmit` clean (server + frontend). Migration applied live (`ready_to_contact`,
  `assigned_agent_id`, 3 new indexes — "[migrate] all 121 steps ok"), 2-min ready-poller cron
  registered ("SMS ready-poller: started (every 2 min, Melbourne)"), and `POST /run-ready` confirmed
  working end-to-end via authenticated API call. **Remaining:** items 3-7 of the Verification
  checklist below (real ticked contact → opener → approve → real send, plus the Voice-tab label
  screenshot for #7) — Vinuth authorised live verification data on 2026-06-13; run this next.
- [x] **Idempotent inbound dedup + DB-backed auto-send toggle (code + verified, 2026-06-13)** —
  fixes Known issue #7 (see above) and adds a Voice-tab "Auto-send: ON/OFF" toggle
  (`server/lib/appSettings.ts`, `server/lib/messageDedup.ts`, new `app_settings` +
  `processed_message_guids` tables). Migration applied live ("[migrate] all 123 steps ok"),
  `tsc --noEmit` clean (server + frontend), toggle screenshot-verified in the Voice tab header
  showing "Auto-send: OFF" (not switched on — would enable live auto-sends to real contacts).
- [x] **Ready-poller live test for Aneesha (2026-06-13)** — ticked `ready_to_contact` for Aneesha
  (`+61426719845`, contact id=2) and ran `runReadyOutreach()`. Poller correctly claimed and
  auto-unticked the flag, then skipped queuing a new opener because a pending draft (id=11, "how
  about a coffee catch-up? always good to chat") already existed for her — confirms the
  re-fire/dedup guard (Verification item 5) works. **Draft #11 remains pending in the Voice tab,
  not approved/sent** — needs Vinuth's review before any real iMessage goes to Aneesha.
- [x] **AgentContext + per-agent voice (code, 2026-06-13, commit d849392)** — `AgentContext`
  interface (`{ name, agency, voiceId }`) threaded through `generateOpener`, `generateReply`, and
  `voiceCalibration.ts`. Each agent's voice is keyed as `agent_<id>` in `voice_profiles`. JWT path
  and the ready-poller both call `getAgentContext(agentId?)` from `server/lib/agentContext.ts`.
  Provider selection (Sonnet 4.6 vs GPT-4o-mini) also centralised here.
- [x] **`rea_data` JSONB + seed data (code + live DB, 2026-06-14)** — added `rea_data JSONB NOT NULL DEFAULT '{}'`
  column to `sms_contacts` (db.ts migration step). Stores REA-specific fields:
  `agency_name`, `years_active`, `currently_listing`, `currently_listing_count`,
  `target_suburbs`, `recently_sold_address`, `recently_sold_price`, `recently_sold_days_on_market`.
  Merge-on-conflict (`rea_data = sms_contacts.rea_data || EXCLUDED.rea_data`) so partial updates
  preserve other keys. Seed upserted to live Supabase:
  - Aneesha: Harcourts Dandenong, 4 years, 2 active listings (Hallam + Berwick), sold $742k
    Dandenong 18 DOM, target suburbs: Dandenong/Hallam/Berwick/Narre Warren/Cranbourne.
  - Test Partner: PropOS Realty (test), 1 year, 1 listing, Clayton/Glen Waverley corridor.
- [x] **Continuous voice learning (code, 2026-06-14)** — `recalibrateVoice()` now fires after
  every ≥5 approve/reject signals (threshold check inline with approve/reject routes in
  `server/routes/sms-agent.ts` → `countSignalsSinceCalibration → if ≥5 → async recalibrateVoice`),
  not just at 7am nightly. Non-blocking async so the approve/reject HTTP response is instant.
- [x] **Prospectability + interest scoring (code, 2026-06-14)** — `server/lib/prospectability.ts`:
  - `prospectability` (0-100): base 50 + active listing bonus + years_active + DOM speed bonus +
    suburb count + never-contacted bonus + overdue bonus − recently-contacted − many-attempts − opted-out.
  - `interest` (0-100): base 20 + stage bonuses (stage 2+20, stage 3+40, booked+60) + recent-contact
    recency + net voice signals (approved − rejected).
  - Single batched SQL for signals (one query for all contacts, not N queries).
  - `GET /contacts` enriches each contact with `{ prospectability, interest, score_label, score_highlights }`.
- [x] **Market Report outreach sequence (code, 2026-06-14)** — `server/lib/marketReport.ts`
  generates a 2-3 sentence suburb snapshot from `rea_data` across matching contacts (sold prices,
  DOM, listing count), using Sonnet 4.6 / GPT-4o-mini fallback. Two new routes in `sms-agent.ts`:
  - `GET /market-report/:suburb` — generates suburb snapshot on-demand.
  - `POST /sequences/market-report` — sets `conversation_objective`, generates hyper-personalised
    opener referencing the suburb stats, queues draft. Direct equivalent of RiTA's #1 use case.
- [x] **Mobile/tablet responsive VoiceAgentView (code, 2026-06-14)** — full redesign of
  `src/views/VoiceAgentView.tsx` (~680 lines). Single-panel mobile (contact list ↔ thread with
  back button), 260px sidebar tablet, 2-col grid desktop. Score badge + highlights row on each
  contact card. Sort by prospectability (default) or last_contact. Auto-send confirm modal before
  enabling. Market Report panel with suburb chip selector. Prospectability/interest mini-widget in
  thread header.
- [x] **SOLD_DB launchd cron (live, 2026-06-14)** — macOS launchd plist at
  `~/Library/LaunchAgents/com.propos.sold_scraper.plist` runs `sold_scraper.py --pages 8` every 3
  days at 6:30am (days 1/4/7/10/13/16/19/22/25/28). Registered and confirmed in `launchctl list`.
  Logs to `~/Library/Logs/sold_scraper.log`.

> All four build stages are code-complete and type-clean on the `sms-agent` branch.
> Outbound (opener generation + send) and inbound (reply generation, conversation memory,
> draft approval, webhook auth) are both live-verified locally. Remaining work is mostly
> operational — see "Known issues" below for the few open items (Gmail OAuth scopes,
> production WEBHOOK_SECRET).

---

## What is actually built right now (plain-English summary)

**The SMS agent can currently:**
1. **Hold a "contact card" per person** (`sms_contacts` table) — name, phone, relationship type
   (business partner / close friend / family / agent prospect), personalisation notes (things only
   Vinuth would know), a per-relationship voice tweak, and a conversation objective (why we're texting them).
2. **Calibrate a voice profile** from sample texts (`voiceProfile.ts` + `voiceCalibration.ts`) — currently
   running on 15 placeholder samples (confidence 0.4). Real calibration needs 20+ of Vinuth's actual texts.
3. **Write an opening message** (`generateOpener`) that references one personalisation detail and
   suggests a concrete next step — not "hey how's it going". Verified working via gpt-4o-mini.
4. **Write a reply** (`generateReply`) that reads the last 8 messages of the thread, the inbound message,
   the voice profile, and the objective, then drafts a response in Vinuth's voice — including deciding
   when NOT to reply (bare "ok thanks" → no reply needed) and whether it's safe to auto-send.
5. **Send and receive real iMessages** from Vinuth's own number via BlueBubbles — no Twilio, no fake number.
6. **Queue drafts for approval** (`sms_agent_drafts`) rather than blindly auto-sending, with a
   confidence + length-based guardrail re-derived server-side (never trusts the model's own
   "auto_sendable: true" claim).
7. **Negotiate meeting times** (`calendarAgent.ts`, Stage 3) — classifies a reply as YES/COUNTER/VAGUE/
   QUESTION/DECLINE/RESCHEDULE and proposes/books a `calendar_slots` row.
8. **Run a daily 7am cron** (`smsOrchestrator.ts`, Stage 4) that checks follow-ups, queues new outreach,
   preps for meetings, and checks if the voice model has "drifted" (approval rate dropped).

**What it CANNOT do yet (the actual gap to a working agent):**
- It cannot **receive** a reply right now — see Known Issues. This is the single blocker.
- Voice calibration is on placeholder data, so generated text will sound generic/American-ish until
  `/calibrate` is run with real texts.
- Nobody has approved/rejected a draft yet, so `voice_signals` (the recalibration feedback loop) is empty.
- `SMS_AGENT_AUTOSEND` has never been turned on — every reply, even trivial ones, currently queues.

---

## Glossary — what the API endpoints / commands actually do

| Endpoint | What it does | When you'd call it |
|---|---|---|
| `POST /api/sms-agent/seed-stage1` | Creates one test contact (defaults to Vinuth's own number via `TEST_RECIPIENT_PHONE`) and runs voice calibration on the 15 starter samples. Idempotent-ish (re-running just upserts). | First-time setup on a new machine / fresh DB. |
| `POST /api/sms-agent/initiate/:contactId` | Generates an **opener** for that contact (`generateOpener`) and sends it via the SMS cascade if configured. Records it to the conversation thread. | Starting a new conversation with someone. |
| `GET /api/sms-agent/drafts` | Lists pending drafts in the approval queue (`sms_agent_drafts`, status=pending). | Checking what the agent wants to say next. |
| `POST /api/sms-agent/drafts/:id/approve` | Sends the draft (or an edited version) via the SMS cascade, records the outcome to `voice_signals` (approved_as_is or edited) for recalibration. | Approving a queued reply. |
| `POST /api/sms-agent/drafts/:id/reject` | Marks the draft rejected, records to `voice_signals` for recalibration (the model learns what NOT to say). | Rejecting a bad draft. |
| `POST /api/sms-agent/calibrate` | Re-runs Fable-5-style voice calibration on a new set of text samples, replacing/updating `voice_profiles`. | After collecting 20+ real texts, or weekly auto-recalibration. |
| `GET /api/sms-agent/voice-profile` | Returns the current calibrated voice profile (confidence, traits, vocabulary). | Debugging "why does it sound off". |
| `GET /api/sms-agent/contacts` | Lists all `sms_contacts`. | Checking who the agent is set up to talk to. |
| `POST /api/webhook/bluebubbles` | **Not an sms-agent endpoint** — this is the inbound webhook BlueBubbles calls when a text arrives on Vinuth's phone. Feeds `handleIncomingReply` → `handleSmsAgentInbound` → `generateReply`. | Called automatically by BlueBubbles, never by hand (except for testing). |
| `POST /api/test-sms` | Sends a raw test message via the SMS cascade to `TEST_RECIPIENT_PHONE`, bypassing the agent entirely. No DB/auth required. | Quick transport health check (used heavily during BlueBubbles setup). |
| `POST /api/auth/register` / `/api/auth/login` | Creates an agent account / issues a 15-min Bearer JWT + 7-day refresh cookie. Required for ALL `/api/sms-agent/*` calls once `DATABASE_URL` is set. | One-time per machine — token expires every 15 min, use `/refresh` or re-login. |

---

## Known issues / pre-empted problems and solutions

### 1. Webhook auth bug (CURRENT BLOCKER, not yet fixed)
**Problem:** `app.use("/api", requireAuth-if-db-connected)` at `server/index.ts:206` is registered
BEFORE `app.use("/api/webhook", verifyWebhookSecret)` at line 278. Express applies middleware in
registration order, so once `DATABASE_URL` is set, **every BlueBubbles inbound webhook call gets
401'd by `requireAuth`** before `verifyWebhookSecret` or the handler ever runs. Confirmed by sending
a synthetic webhook POST and getting `{"error":"Missing or invalid Authorization header"}`.

**RESOLVED (2026-06-13).** `server/index.ts`'s global `/api` middleware now exempts `/api/webhook/*`
before the `requireAuth` check:
```ts
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  // Webhook routes have their own gate (verifyWebhookSecret, below) — never JWT-gated.
  if (req.path.startsWith("/webhook/")) return next()
  if (!isDbConnected()) return next()
  return requireAuth(req, res, next)
})
```
Verified locally: unauthenticated/wrong-secret POSTs to `/api/webhook/bluebubbles` → 401; correct
`?secret=` → 200 and the inbound message reaches `handleSmsAgentInbound`. See Stage status above.

### 2. WEBHOOK_SECRET not set

**RESOLVED (2026-06-13) for local dev.** `WEBHOOK_SECRET` is set in `server/.env` (32-char hex) and
`registerBlueBubblesWebhook()` appends `?secret=...` to the registered webhook URL on startup
(confirmed in server logs: "Webhook auth: shared secret ENFORCED on /api/webhook/*").

**Still open:** `WEBHOOK_SECRET` is NOT set on Railway production yet. Production deploys from
`main`, which doesn't have the issue #1 fix merged — setting the secret there now wouldn't enable
anything and would require BlueBubbles' production webhook URL to be updated too. Do this as part
of merging `sms-agent` → `main` (Vinuth's call on timing).

### 3. JWT access tokens expire every 15 minutes

**RESOLVED (2026-06-13).** All in-process callers (`smsOrchestrator.ts`'s daily cron, the inbound
webhook handler) already called the underlying `lib/` functions directly — no HTTP/JWT involved, so
the 15-minute expiry never affected them. The only place tokens matter is external tooling
(`server/scripts/sms-agent-smoke.mjs`), which now logs in via `/api/auth/login` and auto-refreshes
via `/api/auth/refresh` on a 401.

### 4. Voice calibration is still on placeholder data
**Problem:** `STARTER_VOICE_SAMPLES` in `smsAgentSeed.ts` are generic Australian-casual placeholders,
not Vinuth's actual texting style. Confidence is 0.4 (low). Generated openers will be "in the ballpark"
but not indistinguishable from Vinuth.

**Fix:** Export 20-30 real iMessage/SMS texts from Vinuth's phone (Messages.app → export, or copy/paste
from a few threads with friends), strip any sensitive info, and `POST /api/sms-agent/calibrate` with them.
This directly raises `voice_confidence` on future drafts and is probably the highest-leverage next step
for "this actually sounds like me".

### 5. Anthropic key is empty — running on gpt-4o-mini
**Problem:** `ANTHROPIC_API_KEY=` (empty) means `generateChatJSON` (added this session, see
`server/lib/claude.ts`) falls through to OpenAI's `gpt-4o-mini`. This worked for the opener test, but
gpt-4o-mini is a weaker model than Sonnet 4.6 for nuanced voice-matching and the calendar-negotiation
classifier (Stage 3).

**Fix:** Add a real `ANTHROPIC_API_KEY` to `server/.env` when budget allows. No code change needed —
`generateChatJSON` automatically prefers Anthropic when the key is present.

**Update (this session):** `calendarAgent.ts` (`negotiateMeeting`) and `voiceCalibration.ts`
(`calibrateVoice`, `recalibrateVoice`) now also use the `llmConfigured()` / `generateChatJSON`
OpenAI fallback, same pattern as `smsAgent.ts`. When `ANTHROPIC_API_KEY` is set, calendar
negotiation still uses `claude-sonnet-4-6` and voice calibration still uses `claude-fable-5`
directly via `getClient()` (full quality). When only `OPENAI_API_KEY` is set, both fall back to
`gpt-4o-mini` via `generateChatJSON` — lower quality (especially for voice fingerprinting) but
no longer a hard no-op, so Stage 3 (calendar negotiation) and Stage 2 (recalibration) can now be
exercised end-to-end on gpt-4o-mini alone. `tsc --noEmit` clean.

### 6. gmailInbound poll failure (pre-existing, unrelated)
**Problem:** Log shows `[gmailInbound] poll failed: Request had insufficient authentication scopes.`
on every startup. Doesn't block SMS agent but means email reply capture for the outreach campaign
is broken.

**Fix:** Regenerate `GMAIL_REFRESH_TOKEN` with the correct Gmail API scopes (likely needs
`gmail.readonly` or `gmail.modify` in addition to `gmail.send`). Separate task, not SMS-agent-specific.

### 7. Possible double-processing of inbound replies (local + production share one DB) — FIXED (2026-06-13)

**Problem (discovered 2026-06-13):** Fixing issues #1/#2 for local dev required registering a
BlueBubbles webhook pointing at `http://localhost:3001` (the new `WEBHOOK_BASE_URL` env var, see
`server/index.ts`'s webhook-registration block, shipped in commit d849392). BlueBubbles' webhook
list (`GET /api/v1/webhook`) shows this local webhook (id=3) **alongside two pre-existing
production webhooks (id=1, id=2) pointing at `https://propos.addvantage.site/api/webhook/bluebubbles`**.
Local and production point at the **same Supabase `DATABASE_URL`**.

After sending one synthetic inbound webhook to the local server, the conversation thread ended up
with TWO new rows instead of one — a "lead" message and an "agent" message with **identical body
text**, immediately after the genuine inbound reply:

```
4 lead   09:33:35 | yeah sounds good, keen to catch up. how about Thursday arvo?
5 lead   09:34:58 | sounds good, Thursday arvo it is. reckon we can chat about PropOS
6 agent  09:35:07 | sounds good, Thursday arvo it is. reckon we can chat about PropOS
```

Local autosend is OFF (`SMS_AGENT_AUTOSEND` unset, `Test Partner.auto_reply = false`), so the local
server alone shouldn't produce message 6. Leading hypothesis: BlueBubbles fanned the same inbound
event out to all three registered webhooks; production (different `SMS_AGENT_AUTOSEND`/`auto_reply`
config there?) auto-replied and wrote to the shared `conversations` table, and BlueBubbles' own echo
of that send (`isFromMe`) was then parsed back in locally as a "lead" message by `parseBBWebhook`.

**FIXED via the recommended option (idempotent dedupe by BlueBubbles message GUID).** Added a new
`processed_message_guids(guid PRIMARY KEY, created_at)` table (`server/lib/db.ts` migration, step
122) and `server/lib/messageDedup.ts` exporting `claimMessageGuid(guid)`, which does an atomic
`INSERT ... ON CONFLICT DO NOTHING RETURNING guid`. `parseBBWebhook` (`server/lib/bluebubbles.ts`)
now extracts `data.guid ?? data.tempGuid` into `BBIncomingMessage.guid`. `handleIncomingReply`
(`server/index.ts`) takes an optional `guid` param and calls `claimMessageGuid(guid)` first — if
another process (local or production) already claimed this guid, it logs
`[reply-handler] duplicate message guid=... skipping` and returns immediately, so the same inbound
BlueBubbles webhook can safely be processed by both copies pointed at the shared DB with no
duplicate thread rows or duplicate auto-replies. Migration applied live 2026-06-13
("[migrate] all 123 steps ok"). Only the BlueBubbles webhook path supplies a `guid`; the other 5
`handleIncomingReply` call sites (other transports) pass no guid and the dedup check no-ops for them.

---

## Gap analysis: what's needed to reach a fully working Stage 2

Stage 2 (per the architecture doc) = relationship voice overrides + auto-send for simple acks +
weekly recalibration from signals. The code for all of this exists. The gap is entirely **operational**:

1. **Fix issue #1** (webhook auth) — without this, nothing inbound works, so Stage 2's auto-send
   and recalibration loop have no data to operate on.
2. **Real voice calibration** (issue #4) — recalibration from `voice_signals` only matters if the
   baseline profile is already close; right now it would be "recalibrating" from a 0.4-confidence
   generic baseline.
3. **Generate a real inbound reply and watch the full loop**: send opener → get a real reply from
   Vinuth's phone (or a test contact) → confirm `generateReply` produces a sensible draft →
   approve/edit/reject it via `/drafts/:id/approve|reject` → confirm a row lands in `voice_signals`.
4. **Turn on `SMS_AGENT_AUTOSEND`** only after step 3 has been run several times and the
   auto-sendable guardrail (`conf >= 0.9 && draft.length <= 50`) has been observed to behave sanely
   on real "ok", "yep", "what time" style inbound messages.
5. **Set `WEBHOOK_SECRET`** (issue #2) before any of the above goes near real contacts other than
   Vinuth's own test number.

Once 1-5 are done, Stage 2 is genuinely "live" — Stage 3/4 (calendar negotiation, daily orchestrator)
are already code-complete but untested and depend on an Anthropic key per issue #5.

---

## Future robustness ideas (not urgent, but worth tracking)

- **RESOLVED (2026-06-13): Per-contact rate limiting / cooldown** — `sms_contacts.last_agent_message_at`
  (new column, `server/lib/db.ts` migration) + `canSendNow()`/`recordAgentMessageSent()` in
  `smsContacts.ts` enforce a 6-second cooldown between sends to the same contact. Checked before
  every send path: `/drafts/:id/approve`, `/initiate/:contactId`, and the inbound auto-send branch
  in `smsAgentInbound.ts`. HTTP callers get a 429 if the cooldown is active.
- **Dead-letter queue for failed sends** — `sendViaBlueBubbles` retries 3x then throws; if BlueBubbles
  is down for an extended period (Mac asleep, tunnel down), drafts/openers should queue rather than
  fail silently. Worth checking what `initiate`/`drafts/approve` do on a thrown error from `sendSMS`.
- **Multi-provider model routing for cost** — now that `generateChatJSON` exists, could route
  cheap/simple replies (SIMPLE_ACK-adjacent but not quite) to gpt-4o-mini and reserve Sonnet for
  openers/complex replies, regardless of which key is "primary".
- **RESOLVED (2026-06-13): BlueBubbles uptime monitoring** — `server/lib/transportHealthMonitor.ts`
  polls `checkSmsTransport()` on a cron (`SMS_TRANSPORT_CHECK_CRON`, default every 10 min) and emails
  `SMS_TRANSPORT_ALERT_EMAIL` (falls back to `GMAIL_USER`) on a healthy↔unhealthy transition. Started
  from `index.ts` alongside the other schedulers; confirmed in logs ("SMS transport health monitor:
  started (*/10 * * * *, alerts → vinuth.o.srirama@gmail.com)").
- **Conversation thread pruning** — `threadBlock` reads "last 8 messages"; for long-running
  relationships this will eventually need pagination/summarisation so old context isn't silently dropped.

---

## Planned: CRM-Triggered Auto-Outreach + MVP Hardening (2026-06-13)

**Not yet built** — this section is the spec for the next work session (any machine: `git pull` on
`sms-agent` and start here). Goal: tick a `ready_to_contact` box on a `sms_contacts` row in Supabase
→ a hyper-personalised opener is generated automatically and lands in the Voice tab's approval
queue. Live for Aneesha + Vinuth's own number now (Stage 2); same mechanism scales to the full lead
DB at Stage 4 once `SMS_LIVE_ALLOWLIST` is widened.

### Why nothing fires today (audit)
- The daily orchestrator's "new outreach" step (`smsOrchestrator.ts` `queueNewOutreach`, ~line 76)
  reads the **old `outreach_targets` table**, not `sms_contacts` — where Aneesha, per-agent voice,
  and all Stage 1/2 work actually live. Editing a `sms_contacts` row is invisible to it.
- `queueFollowUps` (~line 51) skips any contact with no `last_contact` — i.e. every brand-new lead.
- The orchestrator only runs 7am weekdays, not "right after I edit the CRM".
- **Latent bug:** `normalisePhone()` (`smsContacts.ts:52`) only strips whitespace. `0426 719 845`
  typed into Supabase won't match the `+61426719845` BlueBubbles delivers on inbound — creates a
  duplicate contact and loses personalisation. High-likelihood the moment AU numbers are hand-entered.

### Decisions (confirmed with Vinuth)
1. Trigger = a `ready_to_contact` checkbox on `sms_contacts` (not a status string — no typo risk).
2. Allowlisted leads (Aneesha / future live DB): queue for one-tap approval — generate
   automatically, do not auto-send.
3. Non-allowlisted leads (testing): queue as draft only — same draft-time behaviour as #2.

Both (2) and (3) resolve to **tick → generate opener → queue draft**. The existing allowlist gate
(`bluebubbles.ts:53`) only matters at approve/send time and is already built — Aneesha sends real,
everyone else redirects to the test phone, on approval.

### Build items

1. **Schema** (`server/lib/db.ts`) — two new columns + index on `sms_contacts`, idempotent
   migration steps (`ADD COLUMN IF NOT EXISTS`, same `[label, sql]` pattern):
   - `ready_to_contact BOOLEAN NOT NULL DEFAULT FALSE` — the trigger.
   - `assigned_agent_id INTEGER` (nullable, references `agents.id`) — whose voice writes the
     opener; `NULL` = default (Vinuth). Live schema check (below) confirms `agents` already has
     the right shape for Stage 4 (id/email/name/agency/phone/role) — this FK is the only thing
     missing to connect a lead to an agent's voice.
   - Partial index: `CREATE INDEX ... ON sms_contacts(ready_to_contact) WHERE ready_to_contact = TRUE`.

2. **Phone normalisation → E.164** (`server/lib/smsContacts.ts`) — rewrite `normalisePhone()`:
   strip spaces/dashes/parens; `04xxxxxxxx` → `+614xxxxxxxx`; `61…` → `+61…`; keep existing `+…`.
   Apply on both write (`upsertContact`) and read (`getContactByPhone`). Existing rows are already
   `+61…`, no backfill needed — fixes all *future* hand-entered numbers.

3. **Ready-queue poller** (`server/lib/smsReadyOutreach.ts`, new) — one exported `runReadyOutreach()`:
   1. Atomic claim: `UPDATE sms_contacts SET ready_to_contact = FALSE, updated_at = NOW() WHERE
      ready_to_contact = TRUE AND status NOT IN ('opted_out') RETURNING *`, batched (e.g.
      `LIMIT 15`) — prevents double-drafting across overlapping ticks / a slow LLM call.
   2. Per claimed contact: skip if a pending draft already exists; skip if opted out (double-check
      the `opt_outs` registry beyond `status`, Spam Act safety).
   3. `getAgentContext(contact.assigned_agent_id)` → `generateOpener(contact, agentCtx)` — reads
      `personalisation` JSONB, so richer CRM detail = a more hyper-personalised opener.
   4. `saveAgentDraft({ contactId, draftBody, kind: "opener", reasoning: "CRM ready_to_contact",
      voiceConfidence })` — lands in the existing approval queue. The generator never throws
      (returns a safe template on failure), so a draft is always produced; log per-contact outcome.
   Register in `server/index.ts` as a cron, every 2 min (`*/2 * * * *`, Melbourne tz), guarded by
   `isDbConnected()`, alongside the existing 7am orchestrator.

4. **Shared agent-context helper** (`server/lib/agentContext.ts`, new) — lift `getAgentContext(agentId?)`
   out of `routes/sms-agent.ts` so both the JWT route path and the autonomous poller use one
   implementation. Queries `agents` by id → `{ name, agency, voiceId: agent_<id> }`, falls back to
   Vinuth/PropOS when null. Update the route to import it.

5. **Manual trigger for demos** (`server/routes/sms-agent.ts`) — `POST /api/sms-agent/run-ready`
   (JWT) calls `runReadyOutreach()` once immediately, returns `{ queued: [{contact, draftId, preview}] }`.
   Lets Vinuth tick a box and see the opener in seconds during a live demo instead of waiting 2 min.

6. **Single source of truth** (`server/lib/smsOrchestrator.ts`) — gate the legacy `queueNewOutreach`
   (`outreach_targets` promoter) behind `SMS_AGENT_PROMOTE_TARGETS` (default off), so the **only**
   outreach trigger is `ready_to_contact` on `sms_contacts`. Prevents duplicate drafts from two
   uncoordinated sources.

7. **Voice-tab polish** (`src/views/VoiceAgentView.tsx`) — opener drafts already render. Add:
   contact name on each draft card (already returned via join — `contact_name`); re-fetch
   `/drafts` every ~30s (and after approve/reject) so newly-queued openers appear without reload.

8. **Learning loop — per-agent nightly recalibration (addresses "gets better over time")**

   Most of this already exists and works *today* for Vinuth, no extra build needed for him:
   - Every approve/edit/reject writes a row to `voice_signals` (`draft_body`, `action`,
     `edited_body`, `contact_id`, `relationship` — `smsContacts.ts:194`). An **edited** draft
     records the human's corrected wording verbatim in `edited_body` — the highest-value signal.
   - `recalibrateVoice(voiceId)` reads accumulated signals and updates that voice's profile.
   - The nightly orchestrator (`smsOrchestrator.ts:150-156`) already calls
     `recalibrateVoice(DEFAULT_VOICE_ID)` once `countSignalsSinceCalibration >= RECALIBRATE_THRESHOLD`
     — Vinuth's voice already self-improves from his approve/edit/reject history.

   **Gap:** that nightly call is hardcoded to `DEFAULT_VOICE_ID` only. With per-agent voices
   (`agent_<id>`, commit d849392) and the new `assigned_agent_id` column (#1), other agents'
   signals accumulate in `voice_signals` but only auto-recalibrate via manual `POST /recalibrate`.
   **Fix:** in the nightly block, after the existing Vinuth check, loop `SELECT id FROM agents` and
   run the same `countSignalsSinceCalibration` / `recalibrateVoice` pair for each `agent_<id>` —
   same two functions, just called per-agent. Net effect: the more openers/replies an agent
   approves or edits, the closer future drafts match their actual voice — for every agent,
   automatically, nightly.

   **Optional polish (not blocking):** `voice_signals.edit_diff` exists in the schema and is
   accepted by `saveVoiceSignal`, but nothing currently computes a value — it's always `null`. A
   real diff (word-level diff of `draft_body` vs `edited_body`) would let recalibration learn *what*
   changed (tone? length? specific phrases?), not just *that* it changed. Worth doing once #8's
   per-agent loop is live and there's enough edited-draft volume to make the extra signal meaningful.

### CRM reality check (2026-06-13) — read-only inspection of live Supabase

Ran a read-only query against `sms_contacts` and `agents` via `server/.env`'s `DATABASE_URL`:

- **`sms_contacts` columns (17 total):** id, name, phone, relationship, stage, personalisation
  (jsonb), voice_override (jsonb), conversation_objective, last_contact, status, auto_reply,
  follow_up_at, attempts, source, created_at, updated_at, last_agent_message_at. **No
  `ready_to_contact` or `assigned_agent_id` yet** — confirms build item #1 is correctly scoped,
  nothing conflicts.
- **Rows (2 total, both Stage ≤2 as expected):**
  - `[1] Test Partner <+61415883354>` — Vinuth's own number, stage 1, source `seed:stage1`.
  - `[2] Aneesha <+61426719845>` — stage 2, source `seed:stage2`.
  - Both `personalisation` JSONB currently hold only **conversational/relationship** fields
    (`tone`, `recent_topics`, `things_to_ask`, `current_projects`, `relationship`,
    `what_we_call_each_other`) — **no real-estate fields** (recently sold, currently listing,
    suburb focus, etc.) yet.
- **`agents` table:** 1 row — `[1] vinuth.o.srirama@gmail.com | Vinuth Srirama | AddVantage |
  role=agent`. Schema already covers everything Stage 4 needs (email/name/agency/phone/role/
  office_id) — `assigned_agent_id` (#1) is the only missing link from a lead to an agent.

**Re: "include the REA's personalisation info like recently sold, currently listing, etc."** —
`personalisation` is freeform JSONB, so no schema change is needed to add these; it's a **data**
gap, not a structure gap. I did **not** write example values myself: an attempt to upsert
placeholder addresses/prices into the live CRM for Aneesha's and Vinuth's contact rows was blocked
by the permission system as fabricated data that could later be sent to real people as
"hyper-personalised" outreach once `ready_to_contact` exists — correctly so.

**Action for Vinuth (either machine, anytime):** add real values to `personalisation` for contacts
1 and/or 2 in the Supabase table editor (or paste them here and they'll be written in as
user-provided data). Suggested shape — `generateOpener` dumps this JSON raw into the prompt, so any
keys work, but these names read naturally:
```json
{
  "recent_sale": { "address": "...", "price": "...", "sold_date": "YYYY-MM-DD" },
  "current_listing": { "address": "...", "price_guide": "...", "status": "..." },
  "suburb_focus": "..."
}
```
This is additive (`personalisation || $1::jsonb` merge) — won't disturb the existing tone/topics
fields. Once present, the ready-poller (#3) has real hooks to reference in generated openers.

### Forecast — risks this plan addresses / flags

**Fixed by this plan**
- Phone-format mismatch → dup contacts / lost personalisation → E.164 normaliser (#2).
- Double-draft on poll overlap or slow LLM → atomic `RETURNING` claim (#3.1).
- Opener stacked on a pending reply → skip if pending draft exists (#3.2).
- Texting an opted-out lead → exclude `status='opted_out'` + check `opt_outs` registry (#3.2).
- LLM cost spike if many leads ticked at once → per-tick batch cap, draft-only (#3.1).
- Wrong voice in multi-agent future → `assigned_agent_id` (#1) + per-agent recalibration (#8).
- Surprise duplicate drafts from the old CRM table → legacy promoter gated off by default (#6).
- Queued openers invisible until reload → 30s draft refetch (#7).
- Voice quality stagnates → per-agent nightly recalibration from real approve/edit signals (#8).

**Flagged — decisions/ops, not code**
- `ANTHROPIC_API_KEY` still empty → generation runs on gpt-4o-mini, not Sonnet 4.6. Add key
  (locally + Railway on merge) when budget allows.
- Voice confidence still 0.4 (15 placeholder samples) — openers are personalised but generic in
  tone until `/calibrate` runs with 20+ real texts per agent.
- Hosting/uptime — the poller runs wherever the server runs; BlueBubbles needs the Mac awake + the
  Cloudflare tunnel up. Keep on the Mac until the `sms-agent` → `main` merge decision.
- Go-live ramp — widen `SMS_LIVE_ALLOWLIST` (or add `SMS_LIVE_ALL=true`) when ready for the real
  lead DB.
- **Known issue #7 above (possible local/production double-processing)** should be resolved or at
  least understood before relying on the 2-min poller + inbound auto-drafting at the same time —
  both write to the same `conversations`/`sms_agent_drafts` tables production might also touch.

### Critical files
- `server/lib/db.ts` — migration: `ready_to_contact`, `assigned_agent_id`, partial index.
- `server/lib/smsContacts.ts` — E.164 `normalisePhone`; add the two fields to `SmsContact` +
  `rowToContact`.
- `server/lib/smsReadyOutreach.ts` *(new)* — poller, atomic claim, generate, queue.
- `server/lib/agentContext.ts` *(new)* — shared `getAgentContext`.
- `server/routes/sms-agent.ts` — import shared helper; `POST /run-ready`.
- `server/lib/smsOrchestrator.ts` — gate legacy `queueNewOutreach`; per-agent recalibration loop (#8).
- `server/index.ts` — register 2-min ready-poller cron.
- `src/views/VoiceAgentView.tsx` — contact-name label + 30s draft refetch.

### Verification (end-to-end, screenshots per project rules)
1. `npx tsc --noEmit` in `server/` and frontend — both clean.
2. Restart server; logs show migration OK for the two new columns + "ready poller started (2 min)".
3. **Aneesha (allowlisted):** add a real `personalisation` detail (see CRM reality check above),
   tick `ready_to_contact`. Hit `POST /run-ready` (or wait 2 min) → box auto-unticks, an opener
   draft for Aneesha appears in the Voice tab naming her + the new detail. Approve → real iMessage
   to Aneesha's phone; thread + cooldown recorded.
4. **Test lead (non-allowlisted):** add a dummy contact, tick ready → opener draft appears.
   Approve → redirects to the test phone (+61415883354). Screenshot the received text.
5. **Re-fire guard:** run `/run-ready` twice → second run queues nothing for the same lead.
6. **Phone-format:** add a contact as `0426 719 845`; simulate inbound from `+61426719845` →
   confirms it matches the same contact (no duplicate), reply uses its personalisation.
7. **Learning loop:** edit a draft before approving → confirm a `voice_signals` row with
   `action='edited'` and the edited text lands; after enough signals, confirm
   `recalibrateVoice(agent_<id>)` runs in the nightly orchestrator log.
8. Commit + push to `sms-agent` (not `main`). No em-dashes in generated text (`sanitiseText`).

---

## Planned: Supabase + Google Sheets CRM (2026-06-14 — next session)

The full integration plan is in `docs/GOOGLE_SHEETS_CRM.md`. Summary:

1. **`sold_properties` table** — add SQL migration to `server/lib/db.ts` (schema in CRM doc).
   SOLD_DB → optional `--supabase` flag on `sold_scraper.py` to write rows here.

2. **Supabase anon + service_role keys** — get from Supabase dashboard → Project Settings → API.
   DO NOT commit either key. Anon key is read-only; service_role is write. Store service_role only
   in Apps Script `PropertiesService.getScriptProperties()`.
   **Note:** The management token Vinuth provided is NOT the service_role key — these are
   service_role key — these are different. Get service_role from the dashboard.

3. **SMS CRM tab** in sheet `1lsDviIB9guT-e9n4jKh1WJcuvBaMXGsLpXPLZNTSEBE` — new tab with
   17 columns (layout in CRM doc). Column O = `ready_to_contact` checkbox → `onEdit` fires
   PATCH to Supabase → PropOS 2-min poller picks up → draft in Voice tab.

4. **Apps Script** (`syncFromSupabase()` every 5 min + `onEdit` handler) — full pseudocode in
   CRM doc. Key: `UrlFetchApp.fetch` to Supabase REST API with service_role bearer token.

5. **End-to-end verify**: tick col O for Aneesha → Supabase `ready_to_contact=true` within 5s →
   PropOS poller generates opener → draft appears in Voice tab → approve → real iMessage.

---

## Demo: Past Client Reconnection (2026-06-14)

A self-contained demo module for showing prospective REA agents how the Voice Agent
reconnects with past buyers in their own voice. Lives entirely behind the "Demo" toggle
in the Voice tab — does not affect the real Stage 1-4 flow.

**3 fictional personas** (`server/data/smsAgentSeed.ts` → `buildDemoPastClientPersonas()`),
seeded via `POST /api/sms-agent/seed-demo-pastclients`:

- **Sarah Mitchell** (+61400000101) — FHB now landlord (relocated to Brisbane, renting out Berwick property)
- **Daniel Osei** (+61400000102) — FHB now investor-curious (Hampton Park owner, budget $500-650k in Pakenham/Officer)
- **Rebecca Tan** (+61400000103) — past buyer, possible seller 1.5 years on (Officer, equity grown $580k → $660k est.)

Each persona has a `conversation_objective` and `rea_data` (universal CRM lead schema:
`buyer_type`, `current_status`, `purchase_history`, `budget_min/max`, `target_suburbs`,
`current_estimate`, `tags`) following the AgentBox/Box+Dice/VaultRE/Rex/Agentpoint shape.
`source: "seed:demo_pastclient"` tags them for the redirect logic below.

**New endpoints** (`server/routes/sms-agent.ts`):

- `GET /api/sms-agent/demo/target` — returns `{ phone }`, the REA agent's number for this demo (from `app_settings` key `demo_target_phone`).
- `POST /api/sms-agent/demo/target` — sets the demo target phone.
- `POST /api/sms-agent/seed-demo-pastclients` — upserts the 3 personas above.
- `POST /api/sms-agent/contacts/:id/queue-opener` — runs `generateOpener` for the contact and saves the result as a pending draft (kind `"opener"`) via `saveAgentDraft`. Does not send.

**Send redirect**: in `POST /api/sms-agent/drafts/:id/approve`, after the existing cooldown
check, if the draft's contact has `source` starting with `"seed:demo"`, the send target is
swapped from the contact's placeholder phone to `demo_target_phone` (if set). Approved demo
drafts therefore land on the REA agent's real phone instead of the fake `+614000001xx` numbers.

**UI** (`src/views/VoiceAgentView.tsx`): "Demo" header button toggles a panel with a phone
input + "Save number" (writes `demo_target_phone`) and "Seed demo personas" button. Selecting
a seeded persona shows a "Queue opener" action button alongside the existing Suggest/Generate
opener/Market report buttons; queued openers appear in the normal drafts-awaiting-approval
queue and go through the same Approve+send / Edit / Reject flow.

**Demo script**: set `demo_target_phone` to the REA agent's number → seed personas → open
each persona → "Queue opener" → review the generated text → Approve + send. Verified
2026-06-14 end-to-end with `demo_target_phone` set to Vinuth's own test number.

---

## How another Claude Code instance continues this

1. `cd` into the PropOS repo, `git fetch && git checkout sms-agent && git pull`.
2. Read **Stage status** above — all four stages are code-complete. The two open build items are:
   (a) **Verification checklist** under "CRM-Triggered Auto-Outreach + MVP Hardening" (items 3-8)
   (b) **Supabase + Google Sheets CRM** (see "Planned" section directly above and `docs/GOOGLE_SHEETS_CRM.md`).
   Start with (a) to confirm the ready-poller is working end-to-end, then move to (b).
3. Vinuth authorised writing live verification data to `sms_contacts` / `sms_agent_drafts` on 2026-06-13.
4. Before relying on inbound auto-drafting in local dev (ready-poller), read Known issue #7 — confirm
   local/production double-processing is understood before running the poller on the shared DB.
5. `cd server && npx tsc --noEmit` must be clean before any commit (repo rule).
6. No em-dashes anywhere (repo rule). All generated text routes through `sanitiseText`.
7. Commit + `git push origin sms-agent` after each stage. Update the Stage status checkboxes.
8. **Never push to main** without Vinuth's explicit instruction — main = production Railway deploy.

## Env vars this agent reads

| Var | Purpose | Without it |
|---|---|---|
| `DATABASE_URL` | All persistence | Every module no-ops (returns empty) |
| `ANTHROPIC_API_KEY` | Sonnet 4.6 for generateOpener/generateReply (preferred); also needed for voice calibration + calendar agent | smsAgent.ts falls back to gpt-4o-mini via OPENAI_API_KEY; calibration/calendar modules fall back to template/defaults |
| `OPENAI_API_KEY` | Fallback model (gpt-4o-mini) for generateOpener/generateReply via generateChatJSON | smsAgent.ts returns hardcoded template replies if neither key set |
| `BLUEBUBBLES_URL` / `BLUEBUBBLES_PASSWORD` | Send + receive | No send; webhook inbound dead |
| `TEST_RECIPIENT_PHONE` | Redirect all sends in test | Sends go to the real contact |
| `SMS_AGENT_AUTOSEND` | Master switch for auto-send (default off). Overridden at runtime by the `app_settings` row `sms_agent_autosend` ("true"/"false"), which the Voice tab's "Auto-send: ON/OFF" toggle (`GET`/`POST /api/sms-agent/settings`) writes — see `server/lib/appSettings.ts`. | Everything queues for approval |
| `BASE_URL` | BlueBubbles webhook registration | No inbound replies captured |

## Safety model

- **Approval-first.** Stage 1 = every draft queued. Auto-send unlocks per-stage and only for
  low-risk classes (simple acks, scheduling logistics), gated by `SMS_AGENT_AUTOSEND` + per-contact `auto_reply`.
- **Test redirect.** `TEST_RECIPIENT_PHONE` (already honoured in `bluebubbles.ts`) catches every send.
- **Voice-degradation brake.** If approved-as-is rate drops below 0.6, auto-send disables until recalibration.
- **Unknown numbers** are never auto-replied — flagged for Vinuth.
