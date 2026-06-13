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
- [ ] **Stage 1 — inbound verified** — BLOCKED by the webhook-auth bug below. Cannot confirm
  `generateReply` + draft queueing until `/api/webhook/bluebubbles` is reachable again.
- [ ] **Live test with a real business partner** — pending inbound fix + 20 real voice samples via `/calibrate`.

> All four build stages are code-complete and type-clean on the `sms-agent` branch.
> Outbound (opener generation + send) is now live-verified. Inbound (reply generation,
> conversation memory, draft approval) is blocked — see "Known issues" below.

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

**Impact:** Replies from real people never reach `generateReply`, `handleOutreachInbound`, or the
buyer/vendor conversation pipeline. The conversational agent is effectively deaf.

**Fix (1 line, pending user authorization — security-relevant change to auth middleware on a
publicly-tunneled server):**
```ts
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!isDbConnected()) return next()
  if (req.path.startsWith("/webhook/")) return next()   // ← add this line
  return requireAuth(req, res, next)
})
```
This is safe because `/api/webhook/*` is already gated by `verifyWebhookSecret` (set `WEBHOOK_SECRET`
in `.env` to enforce it — currently unset, so webhooks are unauthenticated, which is its own
pre-existing issue, see #2).

### 2. WEBHOOK_SECRET not set
**Problem:** Server log shows `⚠️ WEBHOOK_SECRET not set — /api/webhook/* accepts unauthenticated POSTs`.
Combined with issue #1's fix, this means anyone who finds `https://propos.addvantage.site/api/webhook/bluebubbles`
could POST a fake "new-message" payload and trigger `generateReply`/auto-send logic (burns OpenAI/Anthropic
credits, could pollute conversation threads).

**Fix:** Set `WEBHOOK_SECRET=<random 32+ char string>` in `server/.env` and on Railway, then configure
BlueBubbles's webhook URL with `?secret=<value>` appended. Low urgency while `SMS_AGENT_AUTOSEND` is off
(worst case is a queued draft, not a real send) but should be done before enabling auto-send.

### 3. JWT access tokens expire every 15 minutes
**Problem:** Every `/api/sms-agent/*` call now needs `Authorization: Bearer <token>`, and that token
dies after 15 minutes (`ACCESS_TTL = 15 * 60` in `server/lib/auth.ts`). The agent account created
during this session is `vinuth.o.srirama@gmail.com` (id=1) on the Supabase DB.

**Fix options:**
- For scripts/cron (orchestrator, future automation): use `/api/auth/refresh` with the httpOnly
  refresh cookie (7-day TTL), or store the password and re-login on 401.
- For a single trusted server-to-server caller (e.g. the daily 7am orchestrator running inside the
  same Node process), consider calling the underlying functions directly instead of HTTP — `smsOrchestrator.ts`
  likely already does this (it's in-process, not via fetch). Worth double-checking it doesn't hit the JWT wall.
- For convenience during dev, raise `ACCESS_TTL` locally — do NOT do this in production without
  understanding the security tradeoff (longer-lived stolen tokens).

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
`generateChatJSON` automatically prefers Anthropic when the key is present. `calendarAgent.ts` and
`voiceCalibration.ts` (Fable 5) still hard-require `ANTHROPIC_API_KEY` as of this session and have
NOT been given the OpenAI fallback — only `smsAgent.ts` (`generateOpener`/`generateReply`) was updated.
**Gap:** if Stage 3/4 testing is attempted before adding an Anthropic key, calendar negotiation and
voice recalibration will silently no-op or fall back to defaults. Worth applying the same
`generateChatJSON` pattern to `calendarAgent.ts` and `voiceCalibration.ts` if testing those stages
without an Anthropic key.

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

- **Per-contact rate limiting / cooldown** — nothing currently stops the agent from texting the same
  contact repeatedly if `smsOrchestrator.ts`'s daily cron and a manual `/initiate` overlap. Add a
  `last_agent_message_at` cooldown check before sending.
- **Dead-letter queue for failed sends** — `sendViaBlueBubbles` retries 3x then throws; if BlueBubbles
  is down for an extended period (Mac asleep, tunnel down), drafts/openers should queue rather than
  fail silently. Worth checking what `initiate`/`drafts/approve` do on a thrown error from `sendSMS`.
- **Multi-provider model routing for cost** — now that `generateChatJSON` exists, could route
  cheap/simple replies (SIMPLE_ACK-adjacent but not quite) to gpt-4o-mini and reserve Sonnet for
  openers/complex replies, regardless of which key is "primary".
- **BlueBubbles uptime monitoring** — the Mac must stay awake and the launchd tunnel must stay up.
  Consider a Railway-side health check that pings `/api/sms-transport` every few minutes and alerts
  (e.g. via the Gmail transport) if `bluebubbles.ok` flips to false.
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
