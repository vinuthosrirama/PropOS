# PropOS SMS Transport Setup

PropOS supports **four SMS transports** and a fallback chain.
Set `SMS_TRANSPORT` in `server/.env` to pick your primary, and
`SMS_TRANSPORT_FALLBACK` for automatic failover.

---

## Fallback chain (recommended for production)

```env
SMS_TRANSPORT=bluebubbles          # primary — real iPhone number
SMS_TRANSPORT_FALLBACK=twilio      # emergency backup if Mac goes offline
```

PropOS will try the primary transport first. On any network or server error it
automatically retries with the fallback — so messages always get delivered even
when the agent's Mac or Windows PC is offline.

---

## Option A: Twilio (cloud — generic number, always-on)

```env
SMS_TRANSPORT=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+61400000000
```

Cost: ~$0.07 AUD/SMS. Uses a Twilio number (not your real mobile). Best used
as `SMS_TRANSPORT_FALLBACK` rather than primary — recipients see an unknown number.

---

## Option B: BlueBubbles (Mac — real iPhone number, iMessage)

Messages appear from **your real mobile number**. iMessage is auto-detected
(blue bubble when possible, SMS fallback). Incoming replies are pushed via webhook.

### One-time Mac setup (~20 min)

1. **Install BlueBubbles:**
   ```bash
   brew install --cask bluebubbles
   ```

2. **Grant Full Disk Access:**
   System Settings → Privacy & Security → Full Disk Access → + BlueBubbles

3. **Open BlueBubbles** → complete setup wizard:
   - Firebase: skip (optional)
   - Set a **password** (this becomes `BLUEBUBBLES_PASSWORD`)
   - Proxy service: choose **Cloudflare** → note the URL `https://xxxx.trycloudflare.com`
   - Click **Start Server**

4. **Stable URL (recommended):** Cloudflare free URLs reset on Mac restart.
   Use [Tailscale](https://tailscale.com) (free) for a persistent address,
   or purchase a BlueBubbles proxy subscription.

5. **iPhone SMS relay:**
   iPhone → Settings → Messages → Text Message Forwarding → your Mac: ON

6. **Add to server/.env:**
   ```env
   SMS_TRANSPORT=bluebubbles
   SMS_TRANSPORT_FALLBACK=twilio
   BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
   BLUEBUBBLES_PASSWORD=your_password
   ```

### How it works
- PropOS calls `POST /api/v1/message/text` on your local BlueBubbles server
- BlueBubbles drives Messages.app to send from your iPhone number
- Incoming replies: BlueBubbles pushes `POST /api/webhook/bluebubbles` to PropOS
- Delivery failures: BlueBubbles pushes `message-send-error` events, PropOS logs them

### Requirements
- Mac must stay awake (screen lock OK; sleep NOT OK — use Energy Saver: never sleep when plugged in)
- Messages.app must be open and iMessage signed in

---

## Option C: TeleLink (Windows — real iPhone/Android number via Phone Link)

TeleLink bridges Microsoft Phone Link to a REST API. Messages appear from your
real mobile number. Ideal if you're on a Windows PC rather than Mac.

### One-time Windows setup (~20 min)

1. **Pair your phone with Microsoft Phone Link:**
   - iPhone: install Phone Link on Windows, scan the QR code, allow notifications
   - Android: same process, or use USB ADB mode for more reliable delivery

2. **Clone and configure TeleLink:**
   ```powershell
   git clone https://github.com/nicholasxdavis/telelink
   cd telelink
   pip install -r requirements.txt
   ```
   Copy `config.example.yaml` → `config.yaml` and edit:
   ```yaml
   messaging:
     method: auto            # auto = pywinauto UI automation
     auto_timeout_seconds: 12
   intake:
     port: 3000
     token: your_secret_token
   ```

3. **Start TeleLink:**
   ```powershell
   .\start.bat
   ```

4. **Expose via Cloudflare Tunnel:**
   ```powershell
   npx cloudflared tunnel --url http://localhost:3000
   ```
   Note the generated URL `https://xxxx.trycloudflare.com`

5. **Add to server/.env:**
   ```env
   SMS_TRANSPORT=telelink
   SMS_TRANSPORT_FALLBACK=twilio
   TELELINK_URL=https://xxxx.trycloudflare.com
   TELELINK_TOKEN=your_secret_token
   ```

### How it works
- PropOS sends `POST /intake` with `{ to, message, type: "sms" }` to TeleLink's HTTP server
- TeleLink uses pywinauto to open Phone Link, fill in the recipient and message, click Send
- Each send takes ~12 seconds (UI automation timeout)
- Bulk sends are queued and dispatched sequentially — allow ~12s per message

### Important limitations
- Windows PC must stay awake and Phone Link must be running
- Phone Link must remain active (do not background or minimise)
- iPhone requires Apple to confirm delivery (Phone Link sends via SMS relay)
- Incoming replies: TeleLink pushes `POST /api/webhook/telelink` to PropOS

### Requirements
- Windows 10/11 with Phone Link installed
- Python 3.10+, pywinauto
- Cloudflare Tunnel (free) for remote access

---

## Option D: imsg CLI (Mac — real iPhone number, lightweight)

Lighter than BlueBubbles — drives Messages.app via AppleScript. Outgoing only
(no real-time webhooks; uses 30s polling of chat.db for incoming replies).

### One-time Mac setup (~5 min)

1. **Install imsg:**
   ```bash
   brew install steipete/tap/imsg
   ```

2. **Grant Full Disk Access to Terminal:**
   System Settings → Privacy & Security → Full Disk Access → + Terminal

3. **Confirm SMS relay on iPhone:**
   Settings → Messages → Text Message Forwarding → your Mac: ON

4. **Add to server/.env:**
   ```env
   SMS_TRANSPORT=imsg
   SMS_TRANSPORT_FALLBACK=twilio
   ```

5. **Test:**
   ```bash
   /opt/homebrew/bin/imsg send "+61412345678" "Test from PropOS"
   ```

### Custom binary path (Intel Mac):
```env
IMSG_BIN=/usr/local/bin/imsg
```

---

## Switching transports

Change `SMS_TRANSPORT` in `server/.env` and restart the server. No code changes.

```env
SMS_TRANSPORT=bluebubbles    # Mac primary
SMS_TRANSPORT=telelink       # Windows primary
SMS_TRANSPORT=imsg           # Mac lightweight
SMS_TRANSPORT=twilio         # Cloud fallback
```

Check which transport is active and its health:
```bash
curl http://localhost:3001/api/sms-transport
```

---

## Transport comparison

| | Twilio | BlueBubbles | TeleLink | imsg |
|---|---|---|---|---|
| **Number shown** | Twilio code | Real iPhone | Real iPhone/Android | Real iPhone |
| **iMessage** | No | Yes (auto) | No (SMS only) | Yes (auto) |
| **Cost** | ~$0.07/msg | Free | Free | Free |
| **OS required** | None | Mac (always-on) | Windows (always-on) | Mac |
| **Incoming replies** | Twilio webhook | BB webhook | TeleLink webhook | 30s polling |
| **Send latency** | ~1s | ~1s | ~12s (UI automation) | ~2s |
| **Setup time** | 5 min | 20 min | 20 min | 5 min |
| **Bulk send** | Parallel | Parallel | Sequential (queued) | Sequential |
| **Recommended role** | Fallback | Primary (Mac) | Primary (Windows) | Lightweight alt |

---

## Testing any transport

Set `TEST_RECIPIENT_PHONE` in `.env` to redirect all sends to your own number:

```env
TEST_RECIPIENT_PHONE=+61412345678
```

Messages will be prefixed `[TEST to <original number>]` so you see exactly
what the recipient would receive. Remove this env var to go live.
