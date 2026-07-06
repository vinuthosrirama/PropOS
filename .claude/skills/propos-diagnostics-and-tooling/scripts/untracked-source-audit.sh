#!/usr/bin/env bash
# Read-only: lists modified + untracked source files. Project rule: "an uncommitted file
# might as well not exist" (cross-session continuity). Uses git ls-files because plain
# git status has misbehaved in some shells here (CLAUDE.md note).
set -u
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS" || exit 1
echo "== Modified tracked files:"
git ls-files --modified
echo ""
echo "== Untracked files (respecting .gitignore):"
git ls-files --others --exclude-standard
echo ""
echo "== Untracked SOURCE files (the dangerous subset: work that vanishes if this machine dies):"
git ls-files --others --exclude-standard | grep -E '\.(ts|tsx|sql|md)$' | grep -v '^server/public/'
echo ""
echo "Action: commit locally at session end (push stays ask-first, propos-change-control)."
