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
- [ ] **Live test with a real business partner** — pending 20 real voice samples via `/calibrate`.

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

## How another Claude Code instance continues this

1. `cd` into the PropOS repo, `git fetch && git checkout sms-agent && git pull`.
2. Read this doc's **Stage status** for the next unchecked box.
3. `cd server && npx tsc --noEmit` must be clean before any commit (repo rule).
4. No em-dashes anywhere (repo rule). All generated text already routes through `sanitiseText`.
5. Commit + `git push origin sms-agent` after each stage. Update the Stage status checkboxes.

## Env vars this agent reads

| Var | Purpose | Without it |
|---|---|---|
| `DATABASE_URL` | All persistence | Every module no-ops (returns empty) |
| `ANTHROPIC_API_KEY` | Sonnet 4.6 for generateOpener/generateReply (preferred); also needed for voice calibration + calendar agent | smsAgent.ts falls back to gpt-4o-mini via OPENAI_API_KEY; calibration/calendar modules fall back to template/defaults |
| `OPENAI_API_KEY` | Fallback model (gpt-4o-mini) for generateOpener/generateReply via generateChatJSON | smsAgent.ts returns hardcoded template replies if neither key set |
| `BLUEBUBBLES_URL` / `BLUEBUBBLES_PASSWORD` | Send + receive | No send; webhook inbound dead |
| `TEST_RECIPIENT_PHONE` | Redirect all sends in test | Sends go to the real contact |
| `SMS_AGENT_AUTOSEND` | Master switch for auto-send (default off) | Everything queues for approval |
| `BASE_URL` | BlueBubbles webhook registration | No inbound replies captured |

## Safety model

- **Approval-first.** Stage 1 = every draft queued. Auto-send unlocks per-stage and only for
  low-risk classes (simple acks, scheduling logistics), gated by `SMS_AGENT_AUTOSEND` + per-contact `auto_reply`.
- **Test redirect.** `TEST_RECIPIENT_PHONE` (already honoured in `bluebubbles.ts`) catches every send.
- **Voice-degradation brake.** If approved-as-is rate drops below 0.6, auto-send disables until recalibration.
- **Unknown numbers** are never auto-replied — flagged for Vinuth.
