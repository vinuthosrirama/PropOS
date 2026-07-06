#!/usr/bin/env bash
# Read-only: answers "is the deployed site running my local build?"
# Compares the JS bundle referenced by LIVE html vs local dist/ vs server/public/.
set -u
REPO="/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
SITE="https://propos.addvantage.site"

live=$(curl -sS --max-time 15 "$SITE" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
dist=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$REPO/dist/index.html" 2>/dev/null | head -1)
pub=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$REPO/server/public/index.html" 2>/dev/null | head -1)

echo "live:          ${live:-<none>}"
echo "dist:          ${dist:-<no local build>}"
echo "server/public: ${pub:-<not synced>}"
echo ""
if [ -n "${live:-}" ] && [ "$live" = "${dist:-x}" ]; then
  echo "MATCH live==dist: the live site runs your local build."
else
  echo "MISMATCH live!=dist: live site is NOT your local build."
  echo "  Causes: deploy not run, deployed from another machine/CI, or stale local build."
  echo "  NOTE: CI (.github/workflows/deploy.yml) deploys to Pages project 'propos-demo',"
  echo "  but propos.addvantage.site is served by project 'openhome-engine' (CLAUDE.md)."
  echo "  'CI green but site unchanged' is usually THIS. See propos-run-and-operate."
fi
[ "${dist:-x}" != "${pub:-y}" ] && echo "WARN dist!=server/public: run npm run build (it syncs them) before Fly deploy."
exit 0
