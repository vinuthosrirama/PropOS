# PropOS SMS Transport Setup

PropOS supports three SMS transports. Set `SMS_TRANSPORT` in `server/.env` to switch.

---

## Option A: Twilio (default — any number, cloud)

```env
SMS_TRANSPORT=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+61400000000
```

Cost: ~$0.07 AUD/SMS. Uses a dedicated Twilio number (not your real mobile).

---

## Option B: BlueBubbles (free — real iPhone number, iMessage)

Messages appear to come from **your real mobile number**. Recipients see a
real person, not a short code. Supports both iMessage (blue bubble) and SMS.

### One-time Mac setup (~20 min)

1. **Install BlueBubbles:**
   ```bash
   brew install --cask bluebubbles
   ```

2. **Grant Full Disk Access** to BlueBubbles:
   System Settings → Privacy & Security → Full Disk Access → + BlueBubbles ✓

3. **Open BlueBubbles** → complete setup wizard:
   - Firebase: skip (optional, only needed for push notifications to mobile app)
   - Set a **password** (this becomes your API key)
   - Proxy service: choose **Cloudflare** (free, auto HTTPS URL)
   - Click **Start Server** — note the generated URL e.g. `https://xxxx.trycloudflare.com`

4. **Stable URL (recommended):** Cloudflare free URLs reset on restart.
   For a persistent URL, use [Tailscale](https://tailscale.com) (free) or purchase a
   BlueBubbles proxy subscription.

5. **Add to server/.env:**
   ```env
   SMS_TRANSPORT=bluebubbles
   BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
   BLUEBUBBLES_PASSWORD=your_password_from_step_3
   ```

6. **PropOS auto-registers** its reply webhook with BlueBubbles on startup.
   Incoming vendor replies will route into PropOS's reply-agent pipeline automatically.

### How it works
- PropOS calls `POST /api/v1/message/text` on your local BlueBubbles server
- BlueBubbles drives Messages.app on your Mac to send the message
- Message appears from your real iPhone number
- When vendor replies, BlueBubbles pushes a webhook to PropOS → reply-agent handles it

### Requirements
- Mac must stay awake/running (screen lock OK, sleep NOT OK)
- Messages.app must be open and iMessage signed in
- iPhone SMS relay enabled: iPhone Settings → Messages → Text Message Forwarding → your Mac ✓

---

## Option C: imsg CLI (free — real iPhone number, Mac only)

Lighter than BlueBubbles — drives Messages.app via AppleScript directly.
No server needed, but **no incoming webhooks** (outgoing only, or polling-based).

### One-time Mac setup (~5 min)

1. **Install imsg:**
   ```bash
   brew install steipete/tap/imsg
   ```

2. **Grant Full Disk Access** to Terminal (or your Node.js process):
   System Settings → Privacy & Security → Full Disk Access → + Terminal ✓

3. **Confirm SMS relay** on iPhone:
   Settings → Messages → Text Message Forwarding → your Mac ✓

4. **Add to server/.env:**
   ```env
   SMS_TRANSPORT=imsg
   ```

5. **Test it works:**
   ```bash
   /opt/homebrew/bin/imsg send "+61412345678" "Test from PropOS"
   ```

### Custom binary path (if not on Apple Silicon):
```env
IMSG_BIN=/usr/local/bin/imsg
```

### Incoming replies (imsg)
PropOS polls `~/Library/Messages/chat.db` every 30 seconds via fs.watch.
This is less real-time than BlueBubbles webhooks — use BlueBubbles if you
need instant reply detection.

---

## Switching transports

Just change `SMS_TRANSPORT` in `server/.env` and restart the server. No code changes needed.

```env
# Pick one:
SMS_TRANSPORT=twilio
SMS_TRANSPORT=bluebubbles
SMS_TRANSPORT=imsg
```

Check which transport is active:
```bash
curl http://localhost:3001/api/sms-transport
```

---

## Transport comparison

| | Twilio | BlueBubbles | imsg |
|---|---|---|---|
| **Number shown to vendor** | Twilio short code | Your real mobile | Your real mobile |
| **iMessage (blue bubble)** | ❌ SMS only | ✅ Auto-detects | ✅ Auto-detects |
| **Cost** | ~$0.07/msg | Free | Free |
| **Mac required** | No | Yes (always-on) | Yes |
| **Incoming replies** | ✅ Twilio webhook | ✅ BB webhook | ⚠️ 30s polling |
| **Setup time** | 5 min | 20 min | 5 min |
| **Production stable** | ✅ | ✅ | ⚠️ fragile on macOS updates |
