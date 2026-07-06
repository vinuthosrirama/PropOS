---
name: propos-diagnostics-and-tooling
description: "Measure instead of eyeball: PropOS's diagnostic scripts with interpretation guides. Ships runnable read-only scripts (health check, live-vs-local bundle drift, route-order guard audit, em-dash scan, untracked-source audit) plus log-reading and DB-check recipes. Triggers: 'is the site actually live with my change', 'check health', 'is the deploy stale', 'CI green but nothing changed', 'audit route order', 'scan for em-dashes', 'what uncommitted work exists', 'read the fly logs', 'how many rows in the table', 'measure it'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Diagnostics and Tooling

Every question below has a measurement, not an opinion. Scripts live in this skill's `scripts/` directory; all are strictly read-only (GET requests and greps, no writes, no sends). Run with `bash <script>` (no chmod needed).

Scripts directory: `.claude/skills/propos-diagnostics-and-tooling/scripts/` (repo root: `/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS`).

**Status 2026-07-06: scripts are newly authored and [UNTESTED] as a set; on first use, if one misfires, fix the script in place and note the fix in its header.**

## 1. Master table: question → tool

| Question | Run | Good output | If bad |
|---|---|---|---|
| Is the backend healthy? | `bash scripts/health-check.sh` | `ok:true`, `database:true`, HTTP 200 + a bundle name | propos-debugging-playbook (database:false, error 1033 entries) |
| Is the live site running MY build? | `bash scripts/bundle-drift.sh` | `MATCH live==dist` | See §3 below, then propos-run-and-operate |
| Are public routes still before the auth gate? | `bash scripts/route-guard-audit.sh` | health/webhook/unsubscribe/demo-token in the BEFORE list | Move the registration; see propos-architecture-contract invariants |
| Any em-dashes sneaking in? | `bash scripts/emdash-scan.sh` | 0 new hits in files you touched | Remove them; rule in propos-change-control §3 |
| What work would vanish if this Mac died? | `bash scripts/untracked-source-audit.sh` | Empty "untracked SOURCE" list at session end | Commit locally (push stays ask-first) |
| Did my change render correctly? | Chrome CLI / Preview screenshot + DOM text read | Matches predicted text/layout | propos-validation-and-qa owns the evidence hierarchy |

## 2. health-check.sh interpretation

- `ok:true, database:true`: server and Supabase pool fine. Anything still broken is frontend or a specific route.
- `ok:true, database:false`: server up, DB unreachable: bad `DATABASE_URL`, Supabase outage, or pool exhaustion. Check `flyctl logs` for `[migrate] FAIL` or pool errors. Note: with DB down, `requireAuth` behavior changes (auth is enforced when DB is connected), so a "suddenly public" or "suddenly 401" route can be a DB symptom.
- Backend unreachable entirely: Fly app stopped or DNS/tunnel issue. `fly.toml` intentionally keeps the machine running (see propos-architecture-contract); a stopped machine is abnormal, check `flyctl status --app addvantageadvisory`.

## 3. bundle-drift.sh: the three-way matrix

| live vs dist | dist vs server/public | Meaning |
|---|---|---|
| match | match | Deployed and consistent. Done. |
| mismatch | match | Built + synced locally but never deployed to Pages, or CI deployed to the WRONG project. Known standing issue: `.github/workflows/deploy.yml` deploys to Pages project `propos-demo` while `propos.addvantage.site` is served by `openhome-engine` (verified 2026-07-06; see propos-failure-archaeology). CI being green therefore proves nothing about the live site. |
| match | mismatch | Live matches dist but `server/public/` is stale: the NEXT `flyctl deploy` would ship an old frontend on the Fly-served path. Run `npm run build` (it re-syncs). |
| mismatch | mismatch | Local tree is behind or ahead of everything; establish what deployed last via `npx wrangler pages deployment list --project-name openhome-engine`. |

## 4. Log reading (no script; commands + what to look for)

```bash
flyctl logs --app addvantageadvisory            # live tail
```
- Migration output anatomy (from `server/lib/db.ts` per-step migrate loop): each step logs individually; a failure is `[migrate] FAIL <label>: <error>` and DOES NOT stop later steps (by design). One FAIL = that feature's table/column is missing, not a dead server.
- Send-path lines: transport selection and BlueBubbles/webhook errors surface here; correlate timestamps with the UI action.
- Boot lines confirm which env keys were detected (never log values).

Cloudflare Pages deploy history:
```bash
npx wrangler pages deployment list --project-name openhome-engine   # the REAL production project
npx wrangler pages deployment list --project-name propos-demo      # where CI currently points
```

## 5. Database checks (read-only recipes)

Table names come from `server/lib/db.ts` `migrate()` (agents, leads/past_buyers, conversations, events/analytics, app_settings, and more; read the migrate list for the current census, it grows). Options, safest first:

1. Supabase dashboard SQL editor (founder-authenticated, no local creds needed): `select count(*) from past_buyers;`
2. Via the API where a route exists (e.g. analytics endpoints) with a JWT.
3. Never embed or copy connection strings into scripts, docs, or skills.

Standard checks: row counts before/after a migration (predict the delta first, per propos-research-methodology), `app_settings` values when a flag "isn't working" (DB value overrides env in several paths, see propos-config-and-flags).

## 6. Local service checks (machine-local, dated 2026-07-06)

```bash
launchctl list | grep -i -E "cloudflared|bluebubbles|addvantage"   # LaunchAgents present + running
ls ~/Library/LaunchAgents/ | grep -i -E "cloudflared|bb|addvantage" # exact label names [UNVERIFIED: enumerate on first run and record here]
```
Interpretation and restart procedures live in propos-run-and-operate (launchd user vs system gotchas are documented infra lessons). This skill only measures; it does not restart things.

## 7. Rendered-output quality (DOM text, not pixels)

For generated-text checks (voice, em-dashes, mismatched Q&A), read the DOM text via Chrome CLI / Preview eval rather than squinting at a screenshot: exact string comparison beats vision. Screenshot remains the top-level proof for layout (propos-validation-and-qa owns the hierarchy).

## When NOT to use this skill

- Interpreting a failure you have already measured → **propos-debugging-playbook**
- What counts as sufficient evidence to declare done → **propos-validation-and-qa**
- Restarting services, deploying, tunnels → **propos-run-and-operate**
- Whether you may run something state-changing at all → **propos-change-control**

## Provenance and maintenance

Authored 2026-07-06; scripts unexecuted at authoring time (marked above). Re-verify the facts the scripts depend on:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
grep -n "propos-demo" .github/workflows/deploy.yml     # CI wrong-project fact still true? If fixed, update §3 and bundle-drift.sh
grep -nE 'app\.use\("/api",\s*\(req' server/index.ts   # gate pattern still matches route-guard-audit.sh
curl -s https://addvantageadvisory.fly.dev/api/health  # endpoint shape still {ok, database}
grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1   # bundle naming convention unchanged
```
