# PropOS SMS Transport Setup — 4 Methods

All 4 methods send from a **real pre-existing phone number** — no Twilio, no virtual numbers.
Messages build authentic relationships because recipients see the agent's real mobile.

---

## Which method should I use?

| Situation | Method | Cost |
|-----------|--------|------|
| Have a Mac (best for iMessage) | **Method 1: BlueBubbles** | Free |
| iPhone only, no Mac | **Method 2: iOS Shortcut Relay** | Free |
| Android phone | **Method 3: Android SMS Gateway** | Free |
| Android phone, want a dashboard | **Method 4: httpSMS** | Free (200/mo) |

**Set the full cascade** so sends never drop — each transport picks up when the previous fails:
```env
SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay,httpsms,textingblue
```
Unconfigured entries are skipped automatically. The legacy pair still works
(`SMS_TRANSPORT=` + `SMS_TRANSPORT_FALLBACK=`), and if neither is set the chain
auto-builds from every configured transport in priority order.

Double handling is two-layered:
1. **Synchronous cascade** — `sendSMS()` tries each transport in order at send time; the API response includes an `attempts` array showing what happened on each.
2. **Async recovery** — if BlueBubbles accepts a message but later reports a `message-send-error` webhook, the message is automatically redispatched through the rest of the chain (once per message).

**Live health for the whole chain:**
```bash
curl https://propos.addvantage.site/api/sms-transport
# → { ..., chain: [{ transport, ok, label, detail }, ...], email: { configured } }
```

**Email redundancy:** when ALL SMS transports fail and the outreach target has an
email address, the message is sent via Gmail (GMAIL_* env vars) instead. Email
replies from targets are captured every 5 minutes and feed the same draft +
morning-brief pipeline as SMS replies.

---

## Method 1: BlueBubbles (Mac — iMessage + SMS, ~1s)

Messages appear from your real iPhone number. Sends blue bubble iMessages to iPhone
recipients, falls back to SMS automatically. Replies arrive via webhook instantly.

**GitHub:** https://github.com/BlueBubblesApp/bluebubbles-server

### Setup (~20 min)

**1. Install BlueBubbles on your Mac:**
```bash
brew install --cask bluebubbles
```
Or download from https://bluebubbles.app/downloads/

**2. Grant Full Disk Access:**
System Settings → Privacy & Security → Full Disk Access → + BlueBubbles

**3. Enable SMS Relay on iPhone:**
Settings → Messages → Text Message Forwarding → enable your Mac

**4. Expose via Cloudflare Tunnel (free, permanent URL):**
```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:1234
# Copy the generated URL: https://xxxx.trycloudflare.com
```

**5. Set Railway env vars:**
```env
SMS_TRANSPORT=bluebubbles
BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
BLUEBUBBLES_PASSWORD=your_bluebubbles_password
```

**6. Set inbound webhook in BlueBubbles:**
Server → Webhooks → Add → `https://propos.addvantage.site/api/webhook/bluebubbles`

---

## Method 2: iOS Shortcut Relay (iPhone only — iMessage + SMS, ~30s, free)

A self-hosted replacement for TextingBlue ($9/mo). Your iPhone polls the PropOS
server for pending messages and sends them via native iMessage. No Mac required.
No subscription. Latency is polling interval (set iOS automation to 10am, which
matches the outreach send window perfectly).

### Setup (~30 min)

**Step 1: Generate your secret key**
```bash
openssl rand -hex 20
# Example output: a3f8c2d1e9b7456082af1c3d5e7f9012345678ab
```

**Step 2: Set Railway env vars:**
```env
SMS_TRANSPORT=shortcut-relay
SHORTCUT_RELAY_SECRET=a3f8c2d1e9b7456082af1c3d5e7f9012345678ab
SHORTCUT_RELAY_DEVICE_ID=iphone-vinuth-1      # any label you choose
```

**Step 3: Register your device (one-time):**
```bash
curl -X POST https://propos.addvantage.site/api/sms-shortcut/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "iphone-vinuth-1",
    "phone": "+61412345678",
    "secret": "a3f8c2d1e9b7456082af1c3d5e7f9012345678ab",
    "label": "Vinuth iPhone 15 Pro"
  }'
```

**Step 4: Create the iOS Shortcut on your iPhone**

Open the Shortcuts app → New Shortcut → add these actions in order:

```
Action 1: Get contents of URL
  URL: https://propos.addvantage.site/api/sms-shortcut/poll?device_id=iphone-vinuth-1&secret=YOUR_SECRET
  Method: GET

Action 2: Repeat with each item in "Contents of URL"
  (this loops through each pending message)

  Action 2a: Send Message
    Message: Repeat Item → body
    Recipients: Repeat Item → to
    (iOS will send as iMessage if recipient has iPhone, SMS otherwise)

  Action 2b: Get contents of URL
    URL: https://propos.addvantage.site/api/sms-shortcut/sent/[Repeat Item → id]?secret=YOUR_SECRET
    Method: POST
```

**Step 5: Create iOS Automation to run Shortcut daily**

Shortcuts → Automation → + → Time of Day
- Time: 9:55 AM (5 min before the 10am send window)
- Repeat: Daily (weekdays)
- Action: Run Shortcut → [your shortcut name]
- Run Immediately: ON (no confirmation prompt)

Add a second automation at 2:00 PM for follow-up sends if needed.

**Step 6: Test it:**
```bash
# Check device is registered and queue is empty
curl "https://propos.addvantage.site/api/sms-shortcut/status?device_id=iphone-vinuth-1&secret=YOUR_SECRET"

# Manually trigger a test send (goes to TEST_RECIPIENT_PHONE if set)
curl -X POST https://propos.addvantage.site/api/outreach-targets/trigger-now \
  -H "Content-Type: application/json" -d '{"limit": 1}'

# Then trigger the Shortcut manually on iPhone — message should send
```

### Reply monitoring (optional)

To capture inbound replies via the Shortcut:
1. Create a second Shortcut: "PropOS Reply Monitor"
2. Add action: Get contents of URL
   - URL: `https://propos.addvantage.site/api/sms-shortcut/reply?secret=YOUR_SECRET`
   - Method: POST
   - Body: `{ "from": "[Shortcut Input → from]", "body": "[Shortcut Input → body]", "device_id": "iphone-vinuth-1" }`
3. Create Automation: Personal → When Messages app opens → Run Shortcut

Note: Inbound reply detection via Shortcuts has limitations. BlueBubbles (Method 1)
provides more reliable inbound webhooks if you have a Mac.

---

## Method 3: Android SMS Gateway (Android — real SIM SMS, ~1s)

Messages appear from your Android phone's real SIM number. SMS only (green bubble
on iPhone). Free, open source, works with any Android phone.

**GitHub:** https://github.com/capcom6/android-sms-gateway
**App:** https://sms-gate.app (free)

### Setup (~10 min)

1. Install "SMS Gateway for Android" from Google Play (search "sms-gate.app") or
   download APK from https://sms-gate.app

2. Open app → tap **Cloud server** → create free account → note your API credentials

3. Dashboard → Webhooks → Add:
   `https://propos.addvantage.site/api/webhook/android-gateway`

4. Set Railway env vars:
   ```env
   SMS_TRANSPORT=android-gateway
   ANDROID_GW_URL=https://api.sms-gate.app   # or your Cloudflare tunnel if using local mode
   ANDROID_GW_USER=your_username
   ANDROID_GW_PASS=your_password
   ```

Note: Carrier throttling — PropOS enforces a 22s gap between sends (~2.7/min) to
avoid SIM suspension. For the 10am batch of 5 sends, this takes ~2 minutes total.

---

## Method 4: httpSMS (Android — real SIM SMS, ~1s, free tier 200/mo)

Better than Method 3 for most Android users — cleaner API, no Cloudflare Tunnel
needed (httpSMS cloud handles routing), and includes a web dashboard at app.httpsms.com.

**GitHub:** https://github.com/NdoleStudio/httpsms
**App:** https://play.google.com/store/apps/details?id=com.httpsms

### Setup (~10 min)

1. Install "httpSMS" from Google Play

2. Sign up at https://app.httpsms.com (free, Google/GitHub login)

3. In the app, tap **Link Phone** → register your SIM number

4. Dashboard → Settings → **API Key** → copy key

5. Dashboard → Settings → **Webhook** → set to:
   `https://propos.addvantage.site/api/webhook/httpsms`

6. Set Railway env vars:
   ```env
   SMS_TRANSPORT=httpsms
   HTTPSMS_API_KEY=your_api_key
   HTTPSMS_FROM=+61412345678     # your Android phone number
   ```

Free tier: 200 messages/month. For Vinuth's 5/day outreach campaign that's ~110/month.

---

## Recommended production config

**Vinuth's Mac → outreach campaign:**
```env
SMS_TRANSPORT=bluebubbles
SMS_TRANSPORT_FALLBACK=httpsms
BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
BLUEBUBBLES_PASSWORD=your_bb_password
HTTPSMS_API_KEY=your_key
HTTPSMS_FROM=+61XXXXXXXXX
```

**iPhone-only agent (no Mac):**
```env
SMS_TRANSPORT=shortcut-relay
SMS_TRANSPORT_FALLBACK=httpsms
SHORTCUT_RELAY_SECRET=your_secret
SHORTCUT_RELAY_DEVICE_ID=iphone-agent-1
HTTPSMS_API_KEY=your_key
HTTPSMS_FROM=+61XXXXXXXXX
```

**Android agent:**
```env
SMS_TRANSPORT=httpsms
SMS_TRANSPORT_FALLBACK=android-gateway
HTTPSMS_API_KEY=your_key
HTTPSMS_FROM=+61XXXXXXXXX
ANDROID_GW_URL=https://api.sms-gate.app
ANDROID_GW_USER=user
ANDROID_GW_PASS=pass
```

---

## Health check

```bash
curl https://propos.addvantage.site/api/sms-transport
# Returns active transport, fallback, and whether each is reachable
```
