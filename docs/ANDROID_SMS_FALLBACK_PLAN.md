# Android (green-bubble) SMS fallback plan

> Goal: when a recipient's number is NOT on iMessage (Android, or an iPhone with
> iMessage off), the text still arrives, sent as a real green-bubble SMS from the
> agent's own number. Primary mechanism: BlueBubbles + Text Message Forwarding.
> Detection: try iMessage first, fall back to SMS on confirmed failure.
> Status: IMPLEMENTED 10 Jul 2026 across all four sending repos (section 7).
> Live verification (Phase 3 matrix) still outstanding.

---

## 1. What is already built (audited 10 Jul 2026)

The pipeline already has most of the machinery. The audit below is from reading
`server/lib/sms.ts`, `server/lib/bluebubbles.ts`, `server/index.ts` webhook
handler, `server/.env`, and Fly.io secrets.

### 1.1 Transport chain (`server/lib/sms.ts`)
- `sendSMS()` walks an ordered chain of transports until one succeeds; every
  attempt is recorded. Current chain (local `.env` AND Fly secrets):
  `SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay`.
- Splitting into 160-char segments was removed (commit `2b17903`); each send is
  one message body, one dispatch.
- Opt-out compliance guard runs before any transport.

### 1.2 BlueBubbles transport (`server/lib/bluebubbles.ts`)
- Builds `chatGuid = "<service>;-;<E.164 number>"`. The service comes from
  `BLUEBUBBLES_SERVICE`, defaulting to `"any"` (BB auto-picks iMessage vs SMS).
- Three safety nets already exist for a failed send:
  1. **Synchronous poll** (`pollDeliveryStatus`): after the HTTP 200, polls the
     message resource ~3.5s for an explicit `error` field. A confirmed failure
     throws `DeliveryConfirmedFailure`, which skips retries so `sendSMS()` falls
     through to the next transport immediately.
  2. **Async webhook backstop** (`server/index.ts:377-402`): BB's
     `message-send-error` event triggers a redispatch via
     `sendSMS(to, body, ["bluebubbles"])`, i.e. the rest of the chain. A
     send-time tracker (`trackOutbound`/`getTrackedSend`, 10-min TTL) recovers
     the recipient/body when BB's error payload omits them. Dedup via
     `redispatchedGuids`.
  3. **Retry loop**: 3 attempts with backoff for transient errors (not for
     confirmed delivery failures).
- Test-mode redirect to `TEST_RECIPIENT_PHONE` with `SMS_LIVE_ALLOWLIST` bypass.

### 1.3 Shortcut relay (already-deployed green-bubble backstop)
- `shortcut-relay` transport queues the message in the DB; an iOS Shortcut on
  device `cameron-iphone` polls and sends via the iPhone's own Messages app.
- Messages on the iPhone natively falls back to SMS for non-iMessage numbers,
  so this path ALREADY produces green bubbles, provided the Shortcut automation
  is running on the phone. It is slower (polling latency) and depends on the
  phone being awake/online.

### 1.4 Prerequisites confirmed
- Text Message Forwarding iPhone -> Mac: **ON** (confirmed by Vinuth, 10 Jul 2026).
- BlueBubbles 1.9.9 on the Mac, Private API enabled, named tunnel
  `bluebubbles.addvantage.site` (permanent URL), watchdog daemon restarts BB on
  failure (`scripts/bb-watchdog.sh`).
- `bb-doctor.mjs` diagnostic exists (`node scripts/bb-doctor.mjs --send`).

### 1.5 The gap: current config makes green bubbles impossible on the primary path
`server/.env` (and matching Fly secrets `BLUEBUBBLES_SERVICE`,
`BLUEBUBBLES_METHOD` are set, values assumed identical):

```
BLUEBUBBLES_METHOD=apple-script
BLUEBUBBLES_SERVICE=iMessage
```

Consequences:
- Every chatGuid is `iMessage;-;<number>`. An Android number has no iMessage
  handle, so the send fails every time. BB never even tries SMS.
- `apple-script` method cannot use service `"any"` (AppleScript errors -1700),
  which is presumably why `iMessage` was pinned. But AppleScript also cannot
  create NEW chats reliably; the Private API can.
- So today, an Android recipient is only reachable if (a) the iMessage send
  fails, (b) the poll or webhook catches it, and (c) the Shortcut relay picks
  it up on the phone. Three moving parts deep before a green bubble happens.

There is no history/known reason in the repo docs for why `apple-script` was
pinned over `private-api` beyond the Private API helper occasionally not being
injected (see BLUEBUBBLES_SETUP.md Stage A fix: open Messages.app, send one
manual text). This must be re-tested before changing prod config.

---

## 2. Chosen design (decisions locked 10 Jul 2026)

| Decision | Choice |
|---|---|
| Primary green-bubble mechanism | BlueBubbles + Text Message Forwarding (Mac sends SMS) |
| Detection strategy | Try iMessage first; on confirmed failure, resend as SMS |
| Backstop | Existing shortcut-relay stays in the chain, unchanged |
| Scope of this doc | Plan only; implementation in a later session |

Rationale for try-then-fallback over pre-checking iMessage availability:
BB's availability endpoint adds a round-trip per send and gives false negatives
for numbers BB has never seen; the failure path (poll + webhook) already exists
and is battle-tested from the July fixes. Cost: an Android lead's first text
arrives a few seconds later. Acceptable.

---

## 3. Implementation plan

### Phase 0: prove the mechanism manually (no code changes)
1. On the Mac, open Messages.app and send a manual text to a known Android
   number. If it sends green, Text Forwarding genuinely works end to end.
2. `node scripts/bb-doctor.mjs --send --method=private-api` to a known Android
   number (use `SMS_LIVE_ALLOWLIST` or set `TEST_RECIPIENT_PHONE` to it).
   - If this sends green: Private API + service `SMS` or `any` works; Phase 1
     is config-only.
   - If Private API is not injected: open Messages.app, send one manual text,
     retry (known fix). If it still fails, the watchdog/launchd environment may
     be stripping the helper; investigate before touching prod.
   - Verify: photo/screenshot of the green bubble arriving on the Android phone.

### Phase 1: two-step send in `sendViaBlueBubbles` (code)
Keep `BLUEBUBBLES_SERVICE=iMessage` as the first attempt (safe, current
behaviour for the 90% iPhone case), then add an explicit SMS retry:

1. Attempt 1: chatGuid `iMessage;-;<number>`, method `private-api`.
2. If `pollDeliveryStatus` returns a confirmed failure whose reason indicates
   the handle is not iMessage-capable, retry ONCE with chatGuid
   `SMS;-;<number>` (same tempGuid tracking, same poll).
3. Only if the SMS attempt also confirms failure does the transport throw, and
   `sendSMS()` falls through to shortcut-relay as today.
4. The webhook redispatch handler gets the same treatment: on a
   `message-send-error` for an `iMessage;-;` chat, first retry as `SMS;-;`
   via BlueBubbles before excluding BlueBubbles from the chain.
5. **Learned routing cache**: when a number is confirmed non-iMessage once,
   persist `sms_only = true` on the contact (new column, or a small
   `handle_service_cache` table keyed by E.164). Subsequent sends to that
   number go straight to `SMS;-;`, skipping the failed iMessage attempt, the
   3.5s poll wait, and the whole double-send exposure below. Cache entries
   expire after 90 days (numbers migrate between platforms).

New env flag `BLUEBUBBLES_SMS_FALLBACK=true` gates the behaviour so it can be
turned off instantly if the SMS service string misbehaves on this BB version.

### Phase 1.5: fix the defects in section 5 (BLOCKING before any live Android send)
The audit found six concrete defects in the current fallback machinery. Items
5.1 and 5.2 are prerequisites for the fallback path being correct at all; the
rest are prerequisites for calling it robust. Each has its fix specified in
section 5.

Verify: unit-level with a fake BB server is not meaningful here; verification
is Phase 3's live test matrix.

### Phase 2: method migration (config, riskier, separable)
Switch `BLUEBUBBLES_METHOD` from `apple-script` to `private-api` (or unset).
Private API is required for reliable NEW-chat creation, which is exactly the
Android-lead case (first outreach = no existing chat). Do this only after
Phase 0 confirms the helper stays injected across BB restarts (the watchdog
restarts BB, so the helper must survive that).

Rollback: set the two secrets back and `flyctl deploy` is NOT needed
(secrets update restarts the app). Keep old values recorded before changing.

### Phase 3: live verification matrix (the definition of done)
All sends via the real UI (VendorOS Edit & Send panel), screenshots required:

| # | Recipient | Expected | Proof |
|---|---|---|---|
| 1 | iPhone number (existing chat) | Blue bubble, one message | Screenshot on recipient phone |
| 2 | iPhone number (brand-new chat) | Blue bubble | Screenshot |
| 3 | Android number (brand-new chat) | Green bubble via BB SMS, `[sms] bluebubbles` in logs, `fallback:false` | Screenshot + Fly logs |
| 4 | Android number with Text Forwarding toggled OFF (simulated outage) | Green bubble via shortcut-relay, log shows redispatch | Screenshot + logs |
| 5 | Opted-out number | Blocked before any transport | Log line only |

### Phase 4: ops hardening
- Add a `SMS;-;` service check to `bb-doctor.mjs` (send test as forced SMS).
- OPS_RUNBOOK.md: new row in the failure table: "Android lead got nothing ->
  check Text Message Forwarding toggle, then Shortcut automation on iPhone".
- Update `.claude/skills/propos-architecture-contract` transport section in the
  same session the code lands (skill-drift rule).

---

## 4. Risks and open questions (environmental)

1. **Fly secret values assumed**: `BLUEBUBBLES_SERVICE`/`BLUEBUBBLES_METHOD`
   exist as Fly secrets but values are hashes; confirm they match local `.env`
   before reasoning about prod behaviour (`flyctl ssh console` + `printenv`).
2. **Text Forwarding silently unpairs** after iOS/macOS updates or Apple ID
   password changes. There is no API to check it. Mitigation: matrix test #4
   proves the shortcut-relay backstop covers this; consider a weekly manual
   check in the morning-brief routine.
3. **`pollDeliveryStatus` fails open**: if BB never surfaces an error object in
   the ~3.5s window, an Android send can be reported as success and no fallback
   fires until the async webhook (which BB does not always send). Residual risk
   accepted; the poll window can be lengthened for SMS attempts if matrix test
   #3 shows late failures.
4. **AU carrier SMS from Mac**: Text Forwarding sends via the iPhone's SIM, so
   normal carrier SMS rates/limits apply. Volume batch sends (20 leads) should
   be throttled; check carrier limits before enabling batch send to mixed
   iPhone/Android lists.
5. **Whose iPhone**: everything above assumes the current paired iPhone
   (vinuth.srirama@outlook.com Apple ID per bb-doctor). When Cameron's phone
   becomes the sender, the entire pairing (BB + Forwarding + Shortcut) must be
   redone on his device.

---

## 5. Failure-mode catalogue (code audit, 10 Jul 2026)

Every item below was verified by reading the current code, with file and line
references. These are defects in the EXISTING fallback machinery, i.e. the
exact paths an Android recipient depends on today. Fix before live Android
sends.

### 5.1 Shortcut relay silently truncates messages to 320 chars
`server/lib/shortcutRelay.ts:83`: `actualBody.slice(0, 320)`.
Helen's cached SMS is longer than 320 chars. Any message that fails over to
the shortcut relay arrives CUT OFF MID-SENTENCE, undoing the July one-message
fix on precisely the fallback path. In test mode it is worse: the
`[TEST to +61...]\n` prefix eats ~25 of the 320 chars.
**Fix**: remove the slice (iMessage/SMS via Messages has no such limit), or
raise it to a defensive 2,000 with a logged warning when trimming occurs.

### 5.2 Webhook redispatch drops liveMode, so live failovers go to the test phone
`server/index.ts:399`: `sendSMS(to, body, ["bluebubbles"])` omits the liveMode
argument (defaults false). A LIVE send that fails via the async webhook gets
redispatched to shortcut-relay, whose enqueue (`shortcutRelay.ts:72-75`)
redirects to `TEST_RECIPIENT_PHONE` and prepends `[TEST to ...]`. Net effect
in production: the Android lead gets nothing; Vinuth's phone gets their text.
**Fix**: persist liveMode in the outbound tracker (`trackOutbound` gains a
`liveMode` field) and pass it through the redispatch. Same for the Phase 1
in-transport SMS retry.

### 5.3 Double-send: sync poll and async webhook are not deduplicated against each other
Path A: `pollDeliveryStatus` confirms failure, `sendViaBlueBubbles` throws
`DeliveryConfirmedFailure`, `sendSMS()` chain falls through to shortcut-relay,
message queued. Path B: seconds later BlueBubbles fires `message-send-error`
for the SAME guid; `redispatchedGuids` (`index.ts:395`) only dedups
webhook-vs-webhook, so the handler queues the message AGAIN. The lead gets the
same text twice, the second one possibly minutes later. First impression for a
cold vendor lead: spam.
**Fix**: one shared dedup registry. When the sync path falls through, record
the guid (both real and tempGuid) in the same set the webhook checks. Better:
key dedup on an idempotency key (leadId + channel + body hash) stored in
`messageDedup.ts`, which already exists for cross-process claims.

### 5.4 Claimed-but-never-confirmed queue rows are silently lost forever
`shortcutRelay.ts:97-121`: polling atomically flips rows to 'claimed'. If the
iPhone Shortcut claims 10 messages then dies (iOS kills the automation, phone
reboots, network drop) before POSTing /sent or /failed, those rows stay
'claimed' permanently. No reaper, no alert, no retry. This is the top silent-
loss channel for Android leads since the relay is their backstop.
**Fix**: startup + hourly reaper: `claimed_at < NOW() - INTERVAL '10 minutes'`
reverts to 'pending' with `attempts = attempts + 1`.

### 5.5 Failed messages retry forever with no attempt cap
`shortcutRelay.ts:132-143`: `markFailed` reverts claimed rows to 'pending'
unconditionally. A permanently undeliverable number (disconnected, malformed)
cycles pending -> claimed -> failed on every 30s poll, forever, cluttering
every poll batch (LIMIT 10) and potentially starving real messages.
**Fix**: add `attempts` column; after 3 failures set status 'failed' terminally
and fire the transport-alert email (`transportHealthMonitor.ts` alert() is
reusable).

### 5.6 Triple-nested retries make timeouts a duplicate-send risk
Stack: `send.ts:15` withRetry(3) wraps `sendSMS`, whose chain wraps
`sendViaBlueBubbles`, which retries 3 times internally (`bluebubbles.ts:103`).
A 15s fetch timeout does NOT mean BlueBubbles did not send; it may have
delivered and the response was lost. Every retry layer then re-sends. Worst
case a recipient can receive the same message several times from timeouts
alone. Sends are not idempotent and nothing makes them so.
**Fix**: (a) treat timeout-after-handoff as UNKNOWN, not failed: before
retrying, query BB for a recent outbound message to that handle with the same
text; (b) drop the outer withRetry for the SMS leg (the transport chain IS the
retry); (c) idempotency key as in 5.3.

### 5.7 Deregistered-iMessage black hole (Apple-side, affects switchers)
A number that moved iPhone -> Android without deregistering iMessage can still
show an iMessage handle. The send succeeds at the protocol level, the poll
fails open (`bluebubbles.ts:196-214` returns null on ambiguity), PropOS reports
delivered, and the message evaporates. No error will EVER fire for this case.
**Fix (Phase 3+)**: for first-contact sends, check `dateDelivered` ~60s after
send (async job); if never delivered, flip the routing cache to `sms_only` and
resend via `SMS;-;` once (idempotency key prevents doubles if it did arrive).

### 5.8 Outbound tracker TTL vs late webhooks
`bluebubbles.ts:50`: 10-minute TTL. BlueBubbles error events can arrive later
than that (Mac wakes from sleep, tunnel reconnects, BB restarts and flushes).
Late webhook + payload missing to/body (the common case) = "cannot redispatch"
log line and a lost message.
**Fix**: persist tracked sends to the DB (a `sent_log` table) instead of the
in-memory map; TTL 24h. Also survives server restarts, which currently wipe
the tracker entirely.

### 5.9 Whole-chain single points of failure
- **DB down**: shortcut-relay enqueue throws (`shortcutRelay.ts:70`), so if BB
  is also failing, Android delivery is zero. The 9 Jul audit found prod running
  with the DB down, so this is not hypothetical.
- **Mac asleep**: BB unreachable; the watchdog restarts BB but cannot wake the
  Mac. Add `sudo pmset -a sleep 0 displaysleep 10` (or a caffeinate launchd
  agent) to the ops checklist, and note that the health monitor emails within
  10 min of BB going down (`transportHealthMonitor.ts`, cron `*/10 * * * *`).
- **Shortcut automation dead on the iPhone**: nothing detects it today. Add a
  queue-age check to the health monitor: any 'pending' row older than 5 min
  while BB is down (or 15 min generally) triggers the alert email. Device
  `last_seen` (`shortcut_devices`) is already recorded on every poll; alert
  when `last_seen` exceeds 5 min.

---

## 6. Hardened end-to-end routing (target state)

The full decision tree once Phases 1-2 and the 5.x fixes land. Blue bubbles to
Apple recipients, green bubbles to Android, no silent loss, no duplicates:

```
send(to, body, liveMode)
  0. compliance guard (opt-out registry)                        [exists]
  1. idempotency key = hash(leadId, channel, body)              [new, 5.3/5.6]
     if key seen in 24h -> skip, return prior result
  2. routing cache lookup for `to`                              [new, Phase 1.5]
     - known sms_only -> go to step 4
  3. BlueBubbles iMessage attempt (`iMessage;-;`)               [exists]
     - delivered (poll clean) -> DONE (blue bubble)
     - confirmed not-iMessage -> cache sms_only, step 4
     - BB unreachable/timeout -> step 5 (do NOT blind-retry, 5.6)
  4. BlueBubbles SMS attempt (`SMS;-;`)                         [new, Phase 1]
     - Mac's Text Forwarding sends via iPhone SIM -> DONE (green bubble)
     - confirmed failure or BB down -> step 5
  5. shortcut-relay queue                                       [exists, fix 5.1/5.4/5.5]
     - iPhone Messages auto-picks iMessage vs SMS natively,
       so this leg produces the correct bubble colour on its own
     - reaper + attempt cap + no truncation + liveMode honoured
  6. all legs exhausted -> alert email + surface the failure in
     the VendorOS panel (deliveryNote already renders send errors)
  async backstop: message-send-error webhook -> same dedup registry,
     same liveMode, DB-backed tracker (5.2/5.3/5.8)
  async verify (first-contact only): dateDelivered check at +60s,
     silent-void resend as SMS once (5.7)
```

Why this cannot double-send: every physical send attempt shares one
idempotency registry (step 1) that sync fallthrough, webhook redispatch, and
the +60s verifier all consult before dispatching.

Why this cannot silently lose a message: every leg either confirms delivery,
hands to the next leg, or lands in a DB queue with a reaper and an attempt cap
whose terminal state fires an email alert. The only fail-open window left is
5.7's Apple-side void, and the +60s verifier closes that for first contacts.

---

## 7. Implementation record (10 Jul 2026)

Everything below is COMMITTED code, per repo. PropOS covers VendorOS and
BuyerOS (they are views inside the same app and share /api/send).

### 7.1 PropOS (commit d74476b, repo vinuthosrirama/PropOS)
| Change | File | Defect closed |
|---|---|---|
| SMS;-; retry on confirmed iMessage failure, gated by `BLUEBUBBLES_SMS_FALLBACK` (default on) | server/lib/bluebubbles.ts `attemptService()` | Phase 1 |
| Learned `sms_only` routing cache, DB (`handle_service_cache`) + memory, 90-day TTL, fail-open | server/lib/bluebubbles.ts, server/lib/db.ts | Phase 1 step 5 |
| liveMode tracked per send; webhook redispatch passes it through | server/lib/bluebubbles.ts, server/index.ts | 5.2 |
| `markSyncHandled`/`wasSyncHandled` registry; webhook skips guids the sync poll already failed over | server/lib/bluebubbles.ts, server/index.ts | 5.3 |
| 320-char truncation removed (defensive 2000 cap + warning) | server/lib/shortcutRelay.ts | 5.1 |
| `attempts` column + cap (3) with terminal 'failed' state | server/lib/shortcutRelay.ts, server/lib/db.ts | 5.5 |
| Stale-claim reaper (10-min interval, counts as an attempt) | server/lib/shortcutRelay.ts, wired in server/index.ts | 5.4 |
| Outer `withRetry` removed from the SMS leg of /api/send | server/routes/send.ts | 5.6 |

`cd server && npx tsc --noEmit` clean. NOT yet pushed/deployed: push to main
and `flyctl deploy --app addvantageadvisory` are deploy decisions pending
founder approval. Fly secret to REMOVE at deploy time: `BLUEBUBBLES_SERVICE`
should stay `iMessage` (primary), but verify `BLUEBUBBLES_METHOD` per Phase 2
before switching to private-api.

### 7.2 ConciergeOS (commit 1a6aa54, Cloudflare Worker)
src/lib/bluebubbles.js rewritten: `sendViaService()` helper, iMessage first
then SMS on definite failure; short delivery poll (3 x 700ms, fail-open)
catches BB's silent post-200 failures; 4xx no longer retried (was an
accidental 3x loop on non-retryable errors); timeouts never trigger the SMS
retry (duplicate guard). Deploy = `npx wrangler deploy` (pending approval).

### 7.3 addvantage-main-site (commit bc0172e, Cloudflare Pages Functions)
functions/api/demo-send.js and functions/api/generate-send.js: same
iMessage-then-SMS pattern, timeout-excluded. No delivery poll here (demo
endpoints, latency-sensitive; BB HTTP errors are the realistic Android
failure with apple-script method). Push to main = production deploy of the
live business site: pending founder approval.

### 7.4 addvantage-crm (commit 15a5419, branch claude/gohighlevel-crm-clone-9hz51h)
lib/providers.js `sendIMessage()`: on non-simulated failure retries once with
service "SMS" (diag event `fallback_sms_service`). outbound/bluebubbles.py
`send()`: HTTPError on iMessage retries as SMS; timeouts do not retry.
Self-test 58/58 green.

### 7.5 Not patched (checked, no defect)
- BookingAgent app/server/lib/bluebubbles.ts: no hardcoded `iMessage;-;`
  chatGuid found; repo is the ConciergeOS predecessor, not deployed.

### 7.6 Outstanding
1. Deploys (all pending founder approval): PropOS push + flyctl deploy;
   ConciergeOS wrangler deploy; main-site push.
2. Phase 0 manual proof + Phase 3 live verification matrix (section 3).
3. Phase 2 method migration (apple-script to private-api) after Phase 0.
4. 5.7 (+60s dateDelivered verifier) and 5.8 (DB-backed send tracker):
   designed, not yet implemented.
5. 5.9 ops items: pmset/caffeinate, shortcut-queue age + device last_seen
   alerts in transportHealthMonitor.
