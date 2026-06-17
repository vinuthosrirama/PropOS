#!/bin/bash
# PropOS BlueBubbles Watchdog
#
# Polls propos.addvantage.site every 30s for:
#   1. Restart commands queued by the Reboot button in VoiceAgentView
#   2. BlueBubbles health (auto-restarts after 3 consecutive failures)
#
# Install: scripts/install-bb-watchdog.sh
# Logs:    ~/Library/Logs/bbwatchdog.log
# Config:  ~/.addvantage/bbwatchdog.conf

CONF_FILE="${HOME}/.addvantage/bbwatchdog.conf"
if [ -f "$CONF_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONF_FILE"
fi

API_URL="${PROPOS_API_URL:-https://propos.addvantage.site}"
DAEMON_SECRET="${BB_DAEMON_SECRET:-}"
BB_URL="${BLUEBUBBLES_URL:-}"
BB_PASSWORD="${BLUEBUBBLES_PASSWORD:-}"
POLL_INTERVAL="${BB_POLL_INTERVAL:-30}"
FAIL_THRESHOLD="${BB_FAIL_THRESHOLD:-3}"

if [ -z "$DAEMON_SECRET" ]; then
  echo "[$(date)] ERROR: BB_DAEMON_SECRET not set in $CONF_FILE — exiting" >&2
  exit 1
fi

fail_count=0
last_restart=0

ping_bb() {
  if [ -z "$BB_URL" ] || [ -z "$BB_PASSWORD" ]; then return 1; fi
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 6 "${BB_URL}/api/v1/ping?password=${BB_PASSWORD}")
  [ "$http_code" = "200" ]
}

do_restart() {
  local reason="$1"
  local now; now=$(date +%s)
  # Debounce: don't restart more than once every 60s
  if [ $((now - last_restart)) -lt 60 ]; then
    echo "[$(date)] Skipping restart (debounce — last restart was $((now - last_restart))s ago)"
    return
  fi
  last_restart=$now
  echo "[$(date)] Restarting BlueBubbles — reason: $reason"
  pkill -x "BlueBubbles" 2>/dev/null
  sleep 3
  open -a "BlueBubbles"
  echo "[$(date)] BlueBubbles relaunch initiated"
}

ack() {
  local action="$1" status="$2"
  curl -s -X POST "${API_URL}/api/bb/daemon/ack?secret=${DAEMON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"${action}\",\"status\":\"${status}\"}" \
    --max-time 10 > /dev/null
}

echo "[$(date)] PropOS BB Watchdog started (poll=${POLL_INTERVAL}s, fail_threshold=${FAIL_THRESHOLD})"

while true; do
  # 1. Poll server for commands
  response=$(curl -s --max-time 10 \
    "${API_URL}/api/bb/daemon/poll?secret=${DAEMON_SECRET}" 2>/dev/null)

  if echo "$response" | grep -q '"restart":true'; then
    do_restart "manual-reboot-button"
    ack "restart" "ok"
    fail_count=0
  fi

  # 2. Watchdog ping
  if ping_bb; then
    if [ "$fail_count" -gt 0 ]; then
      echo "[$(date)] BlueBubbles recovered after $((fail_count * POLL_INTERVAL))s"
      ack "watchdog" "recovered"
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    echo "[$(date)] BlueBubbles ping failed (${fail_count}/${FAIL_THRESHOLD})"
    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      do_restart "watchdog-auto"
      ack "restart" "auto"
      fail_count=0
    fi
  fi

  sleep "${POLL_INTERVAL}"
done
