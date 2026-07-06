#!/usr/bin/env bash
#
# PropOS doctor.sh — read-only health sweep.
#
# Safe to run at any time, by anyone, including a zero-context session on its
# first minute in the repo. This script:
#   - NEVER sends an SMS/iMessage/email
#   - NEVER calls a paid LLM API (OpenAI/Anthropic)
#   - NEVER deploys, pushes, commits, or writes a secret
#   - NEVER prints the contents of any .env file (existence only)
#
# It only reads: local TypeScript compiler output, git status, local build
# output, and public HTTP endpoints (GET requests only).
#
# Usage:
#   bash "<repo>/.claude/skills/propos-debugging-playbook/scripts/doctor.sh"
#
# Part of the propos-debugging-playbook skill. See ../SKILL.md section 4.

set -u

# ── Resolve repo root (this script lives at <repo>/.claude/skills/propos-debugging-playbook/scripts/doctor.sh) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

PASS=0
FAIL=0
WARN=0

pass() { printf 'PASS  %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf 'FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf 'WARN  %s\n' "$1"; WARN=$((WARN+1)); }
info() { printf '      %s\n' "$1"; }

echo "PropOS doctor — read-only health sweep"
echo "Repo root: $REPO_ROOT"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── TypeScript (root — frontend, src/) ────────────────────────────────────"
# Root tsconfig.json already sets noEmit:true; --noEmit is explicit here anyway
# so this stays a dry check even if tsconfig ever changes.
if [ -d "$REPO_ROOT/node_modules" ]; then
  if (cd "$REPO_ROOT" && npx tsc --noEmit > /tmp/propos_doctor_tsc_root.log 2>&1); then
    pass "root tsc --noEmit — zero errors"
  else
    fail "root tsc --noEmit — errors found (see below, report-only, nothing was changed)"
    info "$(tail -n 20 /tmp/propos_doctor_tsc_root.log)"
  fi
else
  warn "root node_modules/ missing — run 'npm install' first, skipping tsc check"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── TypeScript (server/) ──────────────────────────────────────────────────"
# server/tsconfig.json has no noEmit — pass --noEmit explicitly so this is a
# dry compile check, matching CLAUDE.md's session-end convention.
if [ -d "$REPO_ROOT/server/node_modules" ]; then
  if (cd "$REPO_ROOT/server" && npx tsc --noEmit > /tmp/propos_doctor_tsc_server.log 2>&1); then
    pass "server tsc --noEmit — zero errors"
  else
    fail "server tsc --noEmit — errors found (see below, report-only, nothing was changed)"
    info "$(tail -n 20 /tmp/propos_doctor_tsc_server.log)"
  fi
else
  warn "server/node_modules/ missing — run 'npm install' inside server/ first, skipping tsc check"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── git status ────────────────────────────────────────────────────────────"
if command -v git > /dev/null 2>&1 && [ -d "$REPO_ROOT/.git" ]; then
  MODIFIED_COUNT=$(cd "$REPO_ROOT" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$MODIFIED_COUNT" -eq 0 ]; then
    pass "git status — working tree clean"
  else
    warn "git status — $MODIFIED_COUNT changed/untracked path(s), expected 0 for a clean session start"
    info "$(cd "$REPO_ROOT" && git status --porcelain 2>/dev/null | head -n 10)"
  fi
  CURRENT_BRANCH=$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
  info "current branch: $CURRENT_BRANCH (expected: main, unless you deliberately switched)"
else
  warn "not a git repo or git not installed — skipping git status check"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── Bundle hash: live vs local dist/ ──────────────────────────────────────"
# Detects the wrong-Pages-project deploy trap (SKILL.md row: "Live site stale after deploy").
LIVE_JS=$(curl -s --max-time 10 'https://propos.addvantage.site/' 2>/dev/null | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -n1)
if [ -d "$REPO_ROOT/dist/assets" ]; then
  LOCAL_JS=$(ls "$REPO_ROOT/dist/assets" 2>/dev/null | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -n1)
else
  LOCAL_JS=""
fi

if [ -z "$LIVE_JS" ]; then
  warn "could not read a bundle hash from https://propos.addvantage.site/ (network issue or page changed shape)"
elif [ -z "$LOCAL_JS" ]; then
  info "no local dist/assets/ build present — nothing to compare against (expected: index-XXXXXXXX.js, live has $LIVE_JS)"
else
  if [ "$LIVE_JS" = "$LOCAL_JS" ]; then
    pass "bundle hash match — live and local dist/ agree ($LIVE_JS)"
  else
    warn "bundle hash MISMATCH — live=$LIVE_JS local=$LOCAL_JS. Local build is undeployed, or CI deployed to the wrong project (see SKILL.md 'Live site stale after deploy' row)."
  fi
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── Fly.io backend health ─────────────────────────────────────────────────"
HEALTH_JSON=$(curl -s --max-time 10 'https://addvantageadvisory.fly.dev/api/health' 2>/dev/null)
if [ -z "$HEALTH_JSON" ]; then
  fail "GET https://addvantageadvisory.fly.dev/api/health — no response (backend down or unreachable)"
else
  info "response: $HEALTH_JSON"
  if echo "$HEALTH_JSON" | grep -q '"ok":true'; then
    pass "backend responds — ok:true"
  else
    fail "backend responds but ok is not true"
  fi
  if echo "$HEALTH_JSON" | grep -q '"database":true'; then
    pass "database:true"
  else
    warn "database:false — this is the known [OPEN INCIDENT], see SKILL.md section 2. Do not attempt a fix without founder approval (flyctl secrets set, Supabase dashboard changes)."
  fi
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── BlueBubbles tunnel ping ────────────────────────────────────────────────"
# Ping endpoint and password per docs/OPS_RUNBOOK.md "Quick Diagnostic Sequence".
# Single-quoted URL — the password contains '!' which triggers bash history
# expansion inside double quotes (docs/OPS_RUNBOOK.md gotcha #1).
TUNNEL_PING=$(curl -s --max-time 10 'https://bluebubbles.addvantage.site/api/v1/ping?password=Aneesha123!' 2>/dev/null)
if echo "$TUNNEL_PING" | grep -q '"status":200'; then
  pass "tunnel ping — bluebubbles.addvantage.site reachable, BB responding"
elif [ -z "$TUNNEL_PING" ]; then
  fail "tunnel ping — no response from bluebubbles.addvantage.site (tunnel likely down: error 1033). See SKILL.md row 1 — restart the cloudflared LaunchAgent, do not debug BlueBubbles first."
else
  warn "tunnel ping — unexpected response: $TUNNEL_PING"
fi

# Direct localhost check only makes sense when doctor.sh runs on the Mac that
# hosts BlueBubbles. Off that Mac this will correctly fail to connect — that's
# expected, not a problem, so it's reported as info, not FAIL.
LOCAL_PING=$(curl -s --max-time 3 'http://localhost:1234/api/v1/ping?password=Aneesha123!' 2>/dev/null)
if echo "$LOCAL_PING" | grep -q '"status":200'; then
  pass "direct localhost:1234 ping — BlueBubbles itself is up on this machine"
elif [ -n "$TUNNEL_PING" ] && echo "$TUNNEL_PING" | grep -q '"status":200'; then
  info "direct localhost:1234 ping skipped/failed — fine if this doctor run is not on the BB host Mac"
else
  info "direct localhost:1234 ping failed too — if this IS the BB host Mac, BlueBubbles itself is down, not just the tunnel"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── launchd services ──────────────────────────────────────────────────────"
if command -v launchctl > /dev/null 2>&1; then
  AGENT_LIST=$(launchctl list 2>/dev/null | grep addvantage)
  if [ -n "$AGENT_LIST" ]; then
    pass "launchctl list | grep addvantage — found user-level agent(s):"
    info "$AGENT_LIST"
  else
    warn "launchctl list | grep addvantage — no user-level agents found (cloudflared / bbwatchdog not loaded, or not this machine)"
  fi
  SYSTEM_AGENT_LIST=$(sudo -n launchctl list 2>/dev/null | grep addvantage)
  if [ -n "$SYSTEM_AGENT_LIST" ]; then
    warn "sudo launchctl list | grep addvantage — found SYSTEM-level daemon(s); these should not exist (docs/OPS_RUNBOOK.md gotcha #2 — system daemons resolve ~ to /var/root and silently fail):"
    info "$SYSTEM_AGENT_LIST"
  else
    info "no system-level daemons found (expected — sudo check skipped silently if it requires a password prompt)"
  fi
else
  info "launchctl not available on this machine (not macOS?) — skipping"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── .env file presence (values never printed) ─────────────────────────────"
for envfile in ".env" ".env.local" ".env.production" "server/.env"; do
  if [ -f "$REPO_ROOT/$envfile" ]; then
    pass "$envfile — present"
  else
    warn "$envfile — missing"
  fi
done
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "── Summary ────────────────────────────────────────────────────────────────"
echo "PASS: $PASS   WARN: $WARN   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
