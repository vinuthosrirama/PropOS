#!/usr/bin/env bash
# Runs on Claude Code session stop.
# Detects fix-after-feat patterns in this session's commits and appends lessons to CLAUDE.md.
# Auto-commits CLAUDE.md so lessons persist across sessions.

REPO="/home/user/PropOS"
CLAUDE_MD="$REPO/CLAUDE.md"
TODAY=$(date +%Y-%m-%d)

RECENT=$(git -C "$REPO" log --oneline --since="4 hours ago" 2>/dev/null)
[ -z "$RECENT" ] && exit 0

LESSONS_ADDED=0

if echo "$RECENT" | grep -q " fix:" && echo "$RECENT" | grep -q " feat:"; then
  FIX_MSG=$(echo "$RECENT" | grep " fix:" | head -1 | sed 's/^[a-f0-9]* //')
  FEAT_MSG=$(echo "$RECENT" | grep " feat:" | head -1 | sed 's/^[a-f0-9]* //')
  LESSON="[$TODAY] [avoid] fix needed after feat: \"$FIX_MSG\" followed \"$FEAT_MSG\""
  sed -i "s|<!-- LESSONS_START -->|<!-- LESSONS_START -->\n$LESSON|" "$CLAUDE_MD"
  LESSONS_ADDED=$((LESSONS_ADDED + 1))
fi

FIX_COUNT=$(echo "$RECENT" | grep -c " fix:" 2>/dev/null || echo 0)
if [ "$FIX_COUNT" -ge 3 ]; then
  LESSON="[$TODAY] [avoid] $FIX_COUNT fix commits in one session -- review pre-flight checklist before starting next feature"
  sed -i "s|<!-- LESSONS_START -->|<!-- LESSONS_START -->\n$LESSON|" "$CLAUDE_MD"
  LESSONS_ADDED=$((LESSONS_ADDED + 1))
fi

if [ "$LESSONS_ADDED" -gt 0 ]; then
  cd "$REPO" && git add CLAUDE.md && git commit -m "chore: session lessons [auto] $TODAY" && git push origin main
fi

exit 0
