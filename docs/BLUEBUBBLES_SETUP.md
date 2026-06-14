# BlueBubbles — Test Send + AI Loop (staged, with contingencies)

> Goal: send personalised, AI-written texts from your real iPhone number to
> yourself / your business partner, via BlueBubbles. No Twilio, no new number.

The diagnostic `server/scripts/bb-doctor.mjs` is your friend at every stage.
Run it, screenshot it, and the output tells you exactly what is wrong.

```
cd server
node scripts/bb-doctor.mjs          # safe checks only
node scripts/bb-doctor.mjs --send   # also sends a test text to TEST_RECIPIENT_PHONE
```

---

## What is already done (verified by the doctor)

- BlueBubbles 1.9.9 running, signed in as vinuth.srirama@outlook.com
- Private API ENABLED, Cloudflare proxy up
- Server reachable + authenticated at the URL in `.env`
- A webhook is registered (currently to `https://propos.addvantage.site/...`)
- Twilio removed from the chain (`SMS_TRANSPORT_CHAIN=bluebubbles`)

So "link BlueBubbles to the phone" is **complete**. What remains is proving the
send, then wiring the AI loop.

---

## The one moving part to respect: the Cloudflare URL changes on restart

`*.trycloudflare.com` URLs are **ephemeral** — every time BlueBubbles (or the
tunnel) restarts you get a NEW URL, and `BLUEBUBBLES_URL` must be updated to match.

- During a test session: **do not restart BlueBubbles.**
- If a previously-working setup suddenly cannot reach the server, the URL changed.
  Re-run the doctor; if it fails reachability, copy the current URL from
  BlueBubbles → Settings into `.env` (and into Railway, if testing production).
- Permanent fix (later): a **named Cloudflare tunnel** or the Mac's LAN URL
  (`http://<mac-LAN-ip>:1234`) for a stable address.

---

## Stage A — Prove the raw send (no PropOS, no DB, no AI)  ← DO THIS FIRST

This proves the iPhone can send, end to end, in 10 seconds.

```
cd server
node scripts/bb-doctor.mjs --send
```

Expected: a text arrives on the phone at `TEST_RECIPIENT_PHONE` (+61415883354).

**If it fails:**
1. `Send failed ... AppleScript` or `private-api` error → the Private API helper
   may not be injected. Either:
   - open **Messages.app** on the Mac, send yourself one manual text, then retry; or
   - force AppleScript: `node scripts/bb-doctor.mjs --send --method=apple-script`
2. `Could not reach the server` → BlueBubbles not running, or the Cloudflare URL
   changed. Update `BLUEBUBBLES_URL`. Local alternative: `http://localhost:1234`.
3. Sending to an **Android / non-iMessage** number → on the iPhone enable
   Settings → Messages → Text Message Forwarding for this Mac (lets it send green-bubble SMS).

Once a text lands: Stage A passes.

---

## Stage B — Prove PropOS can send through BlueBubbles

Run the PropOS server locally and send via its API.

```
cd server
node_modules/.bin/tsx index.ts      # boots on PORT (3001)
```

In another terminal:
```
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"to":"+61415883354","message":"Stage B: PropOS to BlueBubbles works"}'
```

Expected: text arrives; server log shows `[sms] bluebubbles ...`. All sends
redirect to `TEST_RECIPIENT_PHONE` while it is set, so nothing reaches a real
person. (Startup log line `SMS: bluebubbles transport active` confirms the chain.)

---

## Stage C — Prove inbound replies reach PropOS

The registered webhook currently points to **production**
(`https://propos.addvantage.site`). Pick ONE:

**C-local (test on this Mac):** point the webhook at the local server.
1. In `.env` set `BASE_URL=http://localhost:3001` (temporarily) and restart the
   local server — it will register `http://localhost:3001/api/webhook/bluebubbles`.
   (BlueBubbles and PropOS are on the same Mac, so localhost works.)
2. Reply to the Stage A/B text from the phone.
3. Watch the local server log for `[reply-handler]` / `[smsAgentInbound]`.

**C-prod (test on Railway):** leave `BASE_URL=https://propos.addvantage.site`.
Replies hit production. Use this only with Stage D-prod below.

Revert `BASE_URL` afterwards.

---

## Stage D — The AI loop (personalised, AI-written texts)

This needs two things the raw send does not: a database (to hold the contact +
drafts) and an Anthropic key (to write in your voice). The SMS-agent endpoints
live on the `sms-agent` branch, so production only has them after a merge+deploy.

Pick the path:

### D-local (no production deploy)
1. Add to `server/.env`:
   ```
   DATABASE_URL=<your Supabase connection string>
   ANTHROPIC_API_KEY=<your Anthropic key>     # currently empty in .env
   ```
2. Restart the local server (`tsx index.ts`). Log should show `Database: connected`.
3. Seed + calibrate + send the first AI opener:
   ```
   BASE=http://localhost:3001
   curl -X POST $BASE/api/sms-agent/seed-stage1 -H "Content-Type: application/json" -d '{"name":"Vinuth Test"}'
   # paste 15-20 of your real texts to calibrate your voice:
   curl -X POST $BASE/api/sms-agent/calibrate -H "Content-Type: application/json" \
     -d '{"samples":["hey you free for a coffee this week?","yeah sounds good tuesday arvo","ah nice one how did it go"]}'
   # find the contact id, then fire the opener (AI writes it, BB sends it):
   curl $BASE/api/sms-agent/contacts
   curl -X POST $BASE/api/sms-agent/initiate/<contactId>
   ```
4. Reply from the phone → within a second a draft appears:
   ```
   curl $BASE/api/sms-agent/drafts
   curl -X POST $BASE/api/sms-agent/drafts/<draftId>/approve   # sends the AI reply
   ```

### D-prod (deploy first)
1. Merge `sms-agent` → `main` (production deploy on Railway).
2. In Railway env: confirm `ANTHROPIC_API_KEY` set, `DATABASE_URL` set,
   `SMS_TRANSPORT_CHAIN=bluebubbles`, and `BLUEBUBBLES_URL` = the CURRENT
   Cloudflare URL (this is the one that drifts — check it).
3. Same curl sequence as D-local but `BASE=https://propos.addvantage.site`.

Either way: the opener and the reply are written by Sonnet 4.6 in your calibrated
voice, sent from your iPhone number, and (in Stage 1) every draft waits for your
approval before sending.

---

## Quick troubleshooting matrix

| Symptom | Cause | Fix |
|---|---|---|
| doctor: could not reach server | BB off / URL changed | Start BB; copy current URL to `.env`; or use `http://localhost:1234` |
| doctor: 401 | wrong password | Match `BLUEBUBBLES_PASSWORD` to BB → Settings |
| send fails, private-api error | helper not injected | Send a manual text in Messages.app, retry; or `--method=apple-script` |
| send to Android fails | SMS forwarding off | iPhone → Settings → Messages → Text Message Forwarding → this Mac ON |
| no inbound replies | webhook points elsewhere | Stage C: set `BASE_URL` to where your server runs, restart |
| AI loop returns templates | `ANTHROPIC_API_KEY` empty | Set the key; restart |
| `/api/sms-agent/*` 404 on prod | branch not merged | Merge `sms-agent` → main, or test D-local |
| contact not recognised on reply | no `DATABASE_URL` | Set it; seed the contact |

Run `node scripts/bb-doctor.mjs` after any change and screenshot the result.
