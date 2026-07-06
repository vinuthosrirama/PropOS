#!/usr/bin/env bash
# Read-only: checks backend health and frontend availability. No writes, no sends.
set -u
API="https://addvantageadvisory.fly.dev/api/health"
SITE="https://propos.addvantage.site"

echo "== Backend: $API"
BODY=$(curl -sS --max-time 15 "$API") || { echo "FAIL: backend unreachable (tunnel/Fly down? see propos-debugging-playbook: error 1033 / health failing)"; exit 1; }
echo "$BODY"
echo "$BODY" | grep -q '"ok":true'        && echo "ok:true        -> server process healthy" || echo "ok NOT true    -> server up but unhealthy; flyctl logs --app addvantageadvisory"
echo "$BODY" | grep -q '"database":true'  && echo "database:true  -> Supabase pool connected" || echo "database:false -> DB creds/pool issue; see debugging-playbook 'database:false'"

echo ""
echo "== Frontend: $SITE"
CODE=$(curl -sS -o /tmp/propos_live.html -w "%{http_code}" --max-time 15 "$SITE")
echo "HTTP $CODE"
BUNDLE=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /tmp/propos_live.html | head -1)
echo "Live bundle: ${BUNDLE:-NOT FOUND (page broken or markup changed)}"
