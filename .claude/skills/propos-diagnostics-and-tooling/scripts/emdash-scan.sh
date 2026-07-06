#!/usr/bin/env bash
# Read-only: static scan for literal em-dashes in source and docs. The runtime has a
# triple defence for GENERATED text, but nothing statically guards hand-written strings.
set -u
REPO="/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
cd "$REPO" || exit 1
echo "== Em-dash hits in src/, server/ (ts/tsx), docs/, *.md (excluding node_modules, dist, server/public, backups):"
grep -rn --include="*.ts" --include="*.tsx" --include="*.md" -e "—" \
  src server docs CLAUDE.md SESSION_LOG.md NEXT_SESSION.md 2>/dev/null \
  | grep -vE "node_modules|dist/|server/public|backups/" \
  | head -60
COUNT=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.md" -e "—" src server docs 2>/dev/null | grep -vcE "node_modules|dist/|server/public|backups/")
echo ""
echo "Total hits: ${COUNT:-0}. Legacy docs may contain historical em-dashes; NEW code/docs must add zero."
echo "Rule + the incident behind it: propos-change-control section 3."
