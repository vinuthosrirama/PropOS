# Session Lessons (auto-accumulated)

Newest first. Written automatically by the stop hook (`.claude/hooks/session-review.sh`) on session end: `[avoid]` when fix-after-feat or 3+ fix commits are detected, `[win]` when the transcript shows user praise/approval following a recent commit.

This file was moved out of `CLAUDE.md` (which is auto-loaded into every session's context) so the auto-appended log doesn't grow that file unbounded. `CLAUDE.md` points here; this file is not auto-loaded and only needs to be read when reviewing session history.

<!-- LESSONS_START -->
[2026-06-11] [avoid] fix needed after feat: "fix: post-rebase TS errors + rebuild server/public" followed "feat: bulletproof 4-method SMS cascade + Gmail redundancy + scope upsert"
[2026-06-11] [win] user approved after "fix: post-rebase TS errors + rebuild server/public" -- approach validated, repeat it
[2026-06-09] [avoid] fix needed after feat: "fix: comparable sales map -- fallback to static list after 8s tile timeout" followed "feat: UX minimalism — reduce visual noise across SettingsView and DemoView"
[2026-06-09] [win] per-step migration with labelled try/catch surfaced all 3 failures in one deploy rather than one per deploy cycle
[2026-06-09] [win] DB-free /api/test-sms endpoint unblocked BlueBubbles testing immediately, independent of migration state
[2026-06-09] [avoid] health endpoint placed after requireAuth blocked healthcheck — always register /api/health before the auth middleware
[2026-06-09] [avoid] pushing only to a feature branch does not deploy backend — always push to origin/main and then run `flyctl deploy`
<!-- LESSONS_END -->
