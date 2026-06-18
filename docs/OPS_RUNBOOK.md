# PropOS Operations Runbook

Hard-won lessons and diagnostic commands. When something breaks, start here.

---

## Architecture: SMS Transport Chain

```
VoiceAgentView (Reboot button)
    │
    ▼
server/routes/bb.ts  ──→  system_kv table (Fly.io Postgres)
                               │
                               ▼
scripts/bb-watchdog.sh  ──→  GET /api/bb/daemon/poll (every 30s)
    │                              │
    ├─ restart command?  ──→  pkill + open BlueBubbles
    └─ 3× ping fails?   ──→  pkill + open BlueBubbles

BlueBubbles (localhost:1234)
    │
    ▼ cloudflared named tunnel
bluebubbles.addvantage.site  ──→  localhost:1234

SMS send path:
  server/lib/bluebubbles.ts
    └─ SMS_TRANSPORT_CHAIN=bluebubbles,shortcut-relay
         ├─ primary: POST https://bluebubbles.addvantage.site/api/v1/chat/new
         └─ fallback: DB-queued → iOS Shortcut polling /api/sms-shortcut/poll
```

---

## Service Inventory

| Service | Type | Config | Log |
|---|---|---|---|
| cloudflared tunnel | `~/Library/LaunchAgents/site.addvantage.cloudflared.plist` | `~/.cloudflared/config.yml` | `~/Library/Logs/cloudflared-bluebubbles.log` |
| BB watchdog | `~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist` | `~/.addvantage/bbwatchdog.conf` | `~/Library/Logs/bbwatchdog.log` |
| BlueBubbles | Mac app (auto-start or watchdog-managed) | BB → Settings → Server → Port 1234 | BB app log |
| iOS Shortcut Relay | iPhone Shortcuts automation | `device_id=cameron-iphone` in DB | `/api/sms-shortcut/status` |
| PropOS server | Fly.io (prod) / `tsx index.ts` (local) | `server/.env` | Fly.io dashboard |

### Key values
```
Tunnel:             bluebubbles.addvantage.site
Tunnel ID:          56b97174-d805-4a35-8d5e-1a7ff3b2512c
Creds file:         ~/.cloudflared/56b97174-d805-4a35-8d5e-1a7ff3b2512c.json
Config:             ~/.cloudflared/config.yml
BB local:           http://localhost:1234
BB password:        Aneesha123!  (in ~/.addvantage/bbwatchdog.conf and server/.env)
WEBHOOK_SECRET:     in server/.env as BB_DAEMON_SECRET in bbwatchdog.conf
SHORTCUT_RELAY_SECRET: in server/.env
```

---

## Quick Diagnostic Sequence

When iMessages aren't sending, run these in order:

```bash
# 1. Is the cloudflared tunnel up?
curl -s 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!'
# Expected: {"status":200,"message":"Ping received!","data":"pong"}
# Error 1033 = tunnel is down → see "Restart cloudflared" below

# 2. Is BlueBubbles itself up?
curl -s 'http://localhost:1234/api/v1/ping?password=Aneesha123!'
# If this works but (1) fails → tunnel is down, BB is fine

# 3. Is the watchdog running?
launchctl list | grep bbwatchdog
# Should show non-empty PID column

# 4. Check watchdog log
tail -50 ~/Library/Logs/bbwatchdog.log

# 5. Check cloudflared log
tail -50 ~/Library/Logs/cloudflared-bluebubbles.log

# 6. PropOS BB status endpoint (requires JWT)
curl -H "Authorization: Bearer <token>" https://propos.addvantage.site/api/bb/status

# 7. Full PropOS doctor
cd "server"
node scripts/bb-doctor.mjs
```

---

## Service Management

### Cloudflared tunnel

```bash
# Start
launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# Stop
launchctl unload ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# Restart (stop + start)
launchctl unload ~/Library/LaunchAgents/site.addvantage.cloudflared.plist
launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# Test manually (good for diagnosing config errors)
/opt/homebrew/bin/cloudflared --config ~/.cloudflared/config.yml tunnel run
```

### BB Watchdog

```bash
# Start
launchctl load -w ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist

# Stop
launchctl unload ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist

# Re-install from scratch (if plist was changed)
launchctl unload ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist 2>/dev/null
bash scripts/install-bb-watchdog.sh
```

### iOS Shortcut Relay — registering a device

```bash
# Register a device (snake_case device_id — NOT camelCase)
curl -X POST https://propos.addvantage.site/api/sms-shortcut/register \
  -H "Content-Type: application/json" \
  -d '{"device_id":"cameron-iphone","secret":"<SHORTCUT_RELAY_SECRET>"}'

# Poll endpoint (this is what the iPhone Shortcut calls every 60s)
curl 'https://propos.addvantage.site/api/sms-shortcut/poll?device_id=cameron-iphone&secret=<SHORTCUT_RELAY_SECRET>'
```

---

## Known Gotchas — Never Repeat

### 1. `!` in passwords breaks bash double-quotes
```bash
# WRONG — bash history expansion triggers on !
curl "https://...?password=Aneesha123!"

# CORRECT — always use single quotes for URLs/passwords with special chars
curl 'https://...?password=Aneesha123!'
```
Affected chars: `!`, backtick, `$`, `\`. Use single quotes for any shell curl containing a password.

### 2. System LaunchDaemon vs User LaunchAgent
- System daemon path: `/Library/LaunchDaemons/` — runs as **root**
- User agent path: `~/Library/LaunchAgents/` — runs as **your user**

When a system daemon runs a script that reads `~/.cloudflared/config.yml`, `~` resolves to `/var/root/` (root's home), NOT `/Users/vinuthmacbook/`. The config is never found and the service silently does nothing.

**Always use `~/Library/LaunchAgents/` for user-space services** like cloudflared and the BB watchdog. Check with:
```bash
launchctl list | grep addvantage   # shows user-level agents
sudo launchctl list | grep addvantage  # shows system-level daemons (should be empty for our services)
```

### 3. Cloudflared DNS record already exists
If `cloudflared tunnel route dns` fails with "record already exists":
```bash
cloudflared tunnel route dns --overwrite-dns bluebubbles bluebubbles.addvantage.site
```

### 4. Error 1033 from the tunnel URL
`curl` returns HTTP 1033 when the cloudflared tunnel is not running (Cloudflare can't reach the daemon). The DNS record exists but nothing is listening on our end. Start the tunnel, don't debug the BB side.

### 5. cloudflared config.yml `<TUNNEL_ID>` placeholder
If you regenerate the config template, replace `<TUNNEL_ID>` with the actual tunnel ID before saving:
```
56b97174-d805-4a35-8d5e-1a7ff3b2512c
```
Running `cloudflared tunnel run` with a literal `<TUNNEL_ID>` string creates a new tunnel or fails silently.

### 6. iOS Shortcut Relay: snake_case not camelCase
The `/api/sms-shortcut/register` and `/api/sms-shortcut/poll` endpoints use **`device_id`** (snake_case). Sending `{"deviceId":"cameron-iphone"}` returns `{"error":"device_id required"}` with no other hint.

### 7. Background polling errors must never reach the user
In React components with background `useEffect` data loaders:
```typescript
// WRONG — JSON parse errors become user-visible error banners
.catch(e => setActionMsg((e as Error).message))

// CORRECT — silent; stale data stays, user-triggered actions show errors separately
.catch(() => { /* non-fatal */ })
```
Background loaders (on-mount, interval) should never write to `actionMsg` or any user-visible error state. Only user-triggered callbacks (button clicks) should surface errors.

### 8. CampaignView is B2B only — never show it to agents
`CampaignView` is PropOS's own agent-acquisition funnel (Vinuth pitching PropOS to REA agents). It must **never** appear in the agent-facing UI. The Email/Campaign tab always uses `VendorOutreachView` (lead outreach tracker) for both BuyerOS and VendorOS modes. The routing in `App.tsx`:
```typescript
// Correct — VendorOutreachView regardless of mode
{view === "campaign" && <VendorOutreachView />}
```

### 9. `theme.primary` invisible on dark surfaces
`theme.primary = rgb(59,31,119)` (Peake dark purple) has ~1:1 contrast ratio on the dark background (`--c-bg2: #2c1b59`). Using it as a text color makes text invisible in dark mode.

Rules:
- Labels, eyebrows, section headers → `C.muted` (adapts: `rgba(255,255,255,0.52)` dark / `rgba(59,31,119,0.58)` light)
- Body text, prices → `C.text`
- Button text on a colored background → `#fff` (never `#0a0f1a`)
- Pill/badge borders on dark → `C.border` or `rgba(255,255,255,0.08)`, never `withAlpha(theme.primary, 0.14)`

### 10. BlueBubbles built-in quick tunnel vs named cloudflared tunnel
BlueBubbles has its own "Cloudflare Proxy" option in Settings → Proxy Setup. This is the ephemeral `*.trycloudflare.com` URL that changes on every restart. Once the named cloudflared tunnel is running:
- Set BB → Settings → Proxy Setup → **None** (disable the built-in proxy)
- The named tunnel (`bluebubbles.addvantage.site`) is now the only URL — it never changes and auto-reconnects via launchd

Running both simultaneously is wasteful and can cause confusion about which URL is authoritative.

---

## Setting Up the Named Cloudflared Tunnel from Scratch

If the tunnel setup needs to be recreated:

```bash
# 1. Create the tunnel (only once — already exists)
cloudflared tunnel create bluebubbles

# 2. Route DNS
cloudflared tunnel route dns --overwrite-dns bluebubbles bluebubbles.addvantage.site

# 3. Write config (use actual tunnel ID, not placeholder)
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: bluebubbles
credentials-file: /Users/vinuthmacbook/.cloudflared/56b97174-d805-4a35-8d5e-1a7ff3b2512c.json

ingress:
  - hostname: bluebubbles.addvantage.site
    service: http://localhost:1234
  - service: http_status:404
EOF

# 4. Write the user LaunchAgent plist (NOT /Library/LaunchDaemons — see gotcha #2)
cat > ~/Library/LaunchAgents/site.addvantage.cloudflared.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>site.addvantage.cloudflared</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/cloudflared</string>
    <string>--config</string>
    <string>/Users/vinuthmacbook/.cloudflared/config.yml</string>
    <string>tunnel</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key>
  <string>/Users/vinuthmacbook/Library/Logs/cloudflared-bluebubbles.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/vinuthmacbook/Library/Logs/cloudflared-bluebubbles.log</string>
</dict>
</plist>
EOF

# 5. Load
launchctl load -w ~/Library/LaunchAgents/site.addvantage.cloudflared.plist

# 6. Verify
sleep 3
curl -s 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!'
# Expected: {"status":200,"message":"Ping received!","data":"pong"}
```

---

## iOS Shortcut Relay — Build the iPhone Automation

This is the fallback when BlueBubbles is unreachable. Build this Shortcut on Vinuth's iPhone:

**Shortcut name:** "PropOS SMS Relay"

**Actions:**
1. `URL` — `https://propos.addvantage.site/api/sms-shortcut/poll?device_id=cameron-iphone&secret=<SHORTCUT_RELAY_SECRET>`
2. `Get Contents of URL` (GET)
3. `Repeat with each item in` (result → `messages` array from JSON)
   - `Send Message` → body: `Repeat Item.body`, recipient: `Repeat Item.to`
4. (Optional) `URL` — POST to `/api/sms-shortcut/ack` with sent IDs

**Automation:** Shortcuts → Automation → New → Time of Day → Every 1 Minute (or use Personal Automation with "Run Shortcut" trigger repeated via Scriptable for tighter control).

Poll endpoint response format:
```json
{ "messages": [{ "id": "...", "to": "+61412345678", "body": "Hey..." }] }
```
Empty `messages: []` means nothing queued — shortcut exits cleanly.

---

## Environment Variables Cheat Sheet

These live in `server/.env` (never committed). When re-deploying Fly.io, add each to the Fly.io dashboard.

| Variable | What it does |
|---|---|
| `BLUEBUBBLES_URL` | `https://bluebubbles.addvantage.site` (fixed URL now — never changes) |
| `BLUEBUBBLES_PASSWORD` | BB server password |
| `BB_DAEMON_SECRET` / `WEBHOOK_SECRET` | Shared secret for watchdog ↔ `/api/bb/daemon/*` endpoints |
| `SHORTCUT_RELAY_SECRET` | Auth for `/api/sms-shortcut/*` endpoints |
| `SMS_TRANSPORT_CHAIN` | `bluebubbles,shortcut-relay` |
| `SMS_LIVE_ALLOWLIST` | `+61426719845` (Aneesha only) — expand for go-live |
| `TEST_RECIPIENT_PHONE` | `+61415883354` — all sends redirect here while testing |
| `ANTHROPIC_API_KEY` | Currently empty — set to use Sonnet 4.6 for generation |

---

## Pending Items

- [ ] **Disable BB built-in quick tunnel** — BlueBubbles → Settings → Proxy Setup → None
- [ ] **Build iOS Shortcut automation** — see section above; poll every 60s
- [ ] **Set `ANTHROPIC_API_KEY`** in `server/.env` and Fly.io to activate Sonnet 4.6
- [ ] **Verify watchdog recovery** — `tail ~/Library/Logs/bbwatchdog.log` should show "recovered" now that the named tunnel is live
- [ ] **Expand `SMS_LIVE_ALLOWLIST`** when ready to message real leads
