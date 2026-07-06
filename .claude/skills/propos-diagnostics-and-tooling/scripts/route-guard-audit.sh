#!/usr/bin/env bash
# Read-only static check: public routes must be registered BEFORE the requireAuth gate
# in server/index.ts. Prints registrations relative to the gate line. Structural grep,
# no hardcoded line numbers, survives drift.
set -u
F="/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/server/index.ts"
GATE=$(grep -nE 'app\.use\("/api",\s*\(req' "$F" | head -1 | cut -d: -f1)
if [ -z "${GATE:-}" ]; then echo "FAIL: requireAuth gate pattern not found in $F (pattern drifted; update this script)"; exit 1; fi
echo "requireAuth gate at $F:$GATE"
echo ""
echo "== Route registrations BEFORE the gate (public, intended):"
grep -nE 'app\.(use|get|post)\("/api' "$F" | awk -F: -v g="$GATE" '$1 < g {print}'
echo ""
echo "== Route registrations AFTER the gate (auth-required):"
grep -nE 'app\.(use|get|post)\("/api' "$F" | awk -F: -v g="$GATE" '$1 > g {print}'
echo ""
echo "Interpretation: health, webhooks, unsubscribe, demo-token, sms-transport MUST appear"
echo "in the BEFORE list. A needed-public route in the AFTER list reproduces the 2026-06-09"
echo "healthcheck-blocked incident (see propos-failure-archaeology)."
