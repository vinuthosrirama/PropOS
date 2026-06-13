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
- [x] **Stage 1** — voice calibration (Fable 5), conversational runtime (Sonnet), opener + reply, approval queue, webhook wiring
- [x] **Stage 2** — relationship voice overrides, auto-send criteria for simple acks, weekly voice recalibration from signals
- [x] **Stage 3** — connect `outreach_targets`, calendar negotiation + booking
- [x] **Stage 4** — daily orchestrator cron, follow-ups, meeting prep, voice-health gate
- [ ] **Live test** — Stage 1 end-to-end with business partner (real BlueBubbles send/receive), screenshots

> All five build stages are code-complete and type-clean on the `sms-agent` branch.
> What remains is the live BlueBubbles smoke test (needs the Mac relay running + env vars set) and
> merge-to-main when you want it on Railway.

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
| `ANTHROPIC_API_KEY` | Sonnet/Fable calls | Falls back to template replies |
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
