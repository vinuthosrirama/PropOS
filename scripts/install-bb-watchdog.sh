#!/bin/bash
# Install PropOS BlueBubbles Watchdog as a macOS launchd service.
#
# Run once from the repo root:
#   bash scripts/install-bb-watchdog.sh
#
# What it does:
#   1. Creates ~/.addvantage/bbwatchdog.conf  (credentials — never committed to git)
#   2. Copies bb-watchdog.sh to ~/.addvantage/bb-watchdog.sh
#   3. Writes a launchd plist to ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist
#   4. Loads the service (starts on login, auto-restarts on crash)
#
# To uninstall:
#   launchctl unload ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist
#   rm ~/Library/LaunchAgents/site.addvantage.bbwatchdog.plist ~/.addvantage/bb-watchdog.sh

set -e

PLIST_LABEL="site.addvantage.bbwatchdog"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
CONF_DIR="${HOME}/.addvantage"
CONF_FILE="${CONF_DIR}/bbwatchdog.conf"
SCRIPT_DEST="${CONF_DIR}/bb-watchdog.sh"
LOG_FILE="${HOME}/Library/Logs/bbwatchdog.log"

SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/bb-watchdog.sh"

if [ ! -f "$SCRIPT_SRC" ]; then
  echo "ERROR: bb-watchdog.sh not found at $SCRIPT_SRC"
  exit 1
fi

echo "=== PropOS BlueBubbles Watchdog Installer ==="
echo ""

# ── Gather credentials ──────────────────────────────────────────────────────
if [ -f "$CONF_FILE" ]; then
  echo "Existing config found at $CONF_FILE"
  read -r -p "Overwrite it? (y/N): " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Keeping existing config."
    SKIP_CONF=true
  fi
fi

if [ -z "${SKIP_CONF:-}" ]; then
  echo ""
  echo "You'll need three values from your .env / Fly secrets:"
  echo "  1. WEBHOOK_SECRET  (same key used by the server for daemon auth)"
  echo "  2. BlueBubbles URL (e.g. https://bluebubbles.addvantage.site)"
  echo "  3. BlueBubbles password (from BB Server > Settings > Password)"
  echo ""

  read -r -p "WEBHOOK_SECRET: " bb_daemon_secret
  if [ -z "$bb_daemon_secret" ]; then
    echo "ERROR: WEBHOOK_SECRET cannot be empty."
    exit 1
  fi

  read -r -p "BlueBubbles URL [https://bluebubbles.addvantage.site]: " bb_url
  bb_url="${bb_url:-https://bluebubbles.addvantage.site}"

  read -r -p "BlueBubbles password: " bb_password
  if [ -z "$bb_password" ]; then
    echo "WARNING: No BlueBubbles password set — watchdog ping will skip BB health checks."
  fi

  mkdir -p "$CONF_DIR"
  chmod 700 "$CONF_DIR"

  cat > "$CONF_FILE" <<EOF
# PropOS BlueBubbles Watchdog — credential config
# Created by install-bb-watchdog.sh on $(date)
# KEEP THIS FILE PRIVATE. Never commit to git.

PROPOS_API_URL=https://propos.addvantage.site
BB_DAEMON_SECRET=${bb_daemon_secret}
BLUEBUBBLES_URL=${bb_url}
BLUEBUBBLES_PASSWORD=${bb_password}
BB_POLL_INTERVAL=30
BB_FAIL_THRESHOLD=3
EOF
  chmod 600 "$CONF_FILE"
  echo ""
  echo "Config written to $CONF_FILE (mode 600)"
fi

# ── Install watchdog script ─────────────────────────────────────────────────
cp "$SCRIPT_SRC" "$SCRIPT_DEST"
chmod 700 "$SCRIPT_DEST"
echo "Watchdog script installed to $SCRIPT_DEST"

# ── Unload existing service if running ─────────────────────────────────────
if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
  echo "Stopping existing watchdog service..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# ── Write launchd plist ────────────────────────────────────────────────────
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DEST}</string>
  </array>

  <!-- Restart automatically if the script exits for any reason -->
  <key>KeepAlive</key>
  <true/>

  <!-- Start at login -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Throttle rapid restart loops (60s cooldown) -->
  <key>ThrottleInterval</key>
  <integer>60</integer>

  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
PLIST

echo "launchd plist written to $PLIST_PATH"

# ── Load service ───────────────────────────────────────────────────────────
launchctl load -w "$PLIST_PATH"
echo ""
echo "=== Done. Service loaded and running. ==="
echo ""
echo "Verify it started:  launchctl list | grep bbwatchdog"
echo "View live logs:     tail -f $LOG_FILE"
echo "Stop watchdog:      launchctl unload $PLIST_PATH"
echo ""
echo "The watchdog will:"
echo "  - Poll https://propos.addvantage.site/api/bb/daemon/poll every 30s"
echo "  - Auto-restart BlueBubbles after 3 consecutive BB ping failures"
echo "  - Act on Reboot commands you send from the PropOS VoiceAgent view"
