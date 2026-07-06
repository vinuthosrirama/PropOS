---
name: propos-build-and-env
description: "Recreate the PropOS development environment from scratch and build/run it locally: prerequisites, the two-package install, the two-tsconfig reality, local dev servers and ports, the build pipeline anatomy, env file layout, and the known traps that repeatedly burn sessions. Triggers: 'set up the repo', 'fresh clone', 'npm install fails', 'how do I run this locally', 'vite preview shows 404 on /api', 'env var is undefined locally', 'tsc passes but server is broken', 'server not picking up code changes', 'what node version', 'where does .env go', 'run the tests'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# PropOS Build and Environment

How to go from a bare machine to a running local PropOS, and how the build actually works. Deploy mechanics live in propos-run-and-operate; this skill stops at the edge of localhost.

Repo root: `/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS`. All paths relative to this root. Facts verified 2026-07-06 unless dated otherwise.

---

## 1. Prerequisites

| Requirement | Version | Evidence |
|---|---|---|
| Node.js | 22 (CI standard) | `.github/workflows/deploy.yml` uses `node-version: 22`. No `.nvmrc` and no `engines` field exist, so nothing enforces this locally; match CI to avoid surprise diffs in `package-lock.json`. |
| npm | bundled with Node 22 | Lockfiles are npm format (`package-lock.json` at root and in `server/`). |
| Nothing else | | No Docker needed locally (the `Dockerfile` is for Fly.io). No global installs needed; wrangler and flyctl matter only at deploy time (propos-run-and-operate). |

---

## 2. Install: TWO packages, not one

This repo is two npm packages in one git repo. Installing only the root is the classic half-setup.

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
npm ci           # frontend: react, vite, framer-motion, leaflet, supabase-js
cd server
npm ci           # backend: express, pg, openai, @anthropic-ai/sdk, googleapis, tsx, xlsx...
```

- `server/package.json` is its own package (`openhome-engine-server`) with its own `node_modules` and its own lockfile.
- **Known open issue (status as of 2026-07-03 audit):** `xlsx@0.18.5` in `server/package.json` has two unpatched advisories (prototype pollution + ReDoS) and parses user-uploaded files in `server/routes/import-contacts.ts`. The npm registry version is frozen; the planned fix is moving to the SheetJS CDN build. Do not "npm audit fix" your way past this, it cannot be fixed from the registry. Treat as open until the import is swapped.

---

## 3. The two-tsconfig reality (mandatory before every commit)

There are two independent TypeScript projects. Each check sees only its own half.

```bash
# Frontend check (from repo root; uses tsconfig.json -> tsconfig.app.json/tsconfig.node.json)
npx tsc --noEmit

# Backend check (SEPARATE; root tsc does NOT see these files)
cd server && npx tsc --noEmit
```

Both must be clean (zero NEW errors) before any commit; this is a propos-change-control non-negotiable because CI does not type-check (deploy.yml runs only `npm run build`). As of the 2026-07-05 session log there were 11 pre-existing errors being carried (SettingsView.tsx, DemoView.tsx, outreachTargets.ts); the rule is zero NEW errors, and note the pre-existing count in your SESSION_LOG entry. Re-run both checks yourself rather than trusting this paragraph, the count drifts.

---

## 4. Running locally

| What | Command | Port | Notes |
|---|---|---|---|
| Frontend dev server | `npm run dev` (root) | 3003 | Vite with HMR. Proxies `/api` to `http://localhost:3001` per `vite.config.ts` (`server.proxy`). This is the ONLY local mode where frontend + API work together. |
| Backend dev server | `npm run server` (root) or `cd server && npm run dev` | 3001 | Runs `tsx watch index.ts`: auto-reloads on change. |
| Backend without watch | `cd server && npx tsx index.ts` | 3001 | **Trap:** plain `tsx` does NOT hot-reload. A 2026-07 session debugged "stale behavior" for a while because the server was running pre-edit code (SESSION_LOG). Use `npm run dev` in server/ during development. |
| Full production-like | `npm run build` then `cd server && npx tsx index.ts` | 3001 | Express serves the built frontend from `server/public/` plus all `/api/*` routes on one port. |

**Trap (documented in CLAUDE.md, cost real time):** `vite preview` serves static files ONLY. It has no `/api` proxy. Every API call silently 404s. Never use `vite preview` to test anything involving the backend.

---

## 5. Build pipeline anatomy

`npm run build` (root) is three steps in one script (see `package.json`):

1. `vite build` → emits `dist/` (chunk-split per `vite.config.ts` manualChunks: vendor-react, vendor-framer).
2. `node scripts/patch-html.cjs` → adds `data-cfasync="false"` to every `<script type="module">` in `dist/index.html`. **Why:** Cloudflare Rocket Loader on the addvantage.site zone mangles `type="module"` into a random hash string and breaks Vite ES modules. Removing this step resurfaces a blank-page production bug.
3. Inline node script → wipes `server/public/` and copies `dist/` into it, so the Express server serves the same build. `server/public/` IS tracked in git (see `.gitignore`: `!server/public`), so a build changes tracked files; commit them with the feature (`chore: rebuild server/public...` is the existing pattern).

`__APP_VERSION__` is injected at build time from `package.json` version (vite `define`).

---

## 6. Env files: where they live, how they load

| File | Scope | Tracked? | Loaded by |
|---|---|---|---|
| `.env.local` (root) | Frontend dev (`VITE_*` vars: Supabase URL/anon key, sheet URL) | No (`*.local` gitignored) | Vite, dev only |
| `.env.production` (root) | Frontend build-time `VITE_*` vars, baked into the bundle | Check before assuming; `VITE_*` values here are anon-key-safe by design | Vite at `npm run build` |
| `server/.env` | ALL backend secrets (DB, LLM keys, SMS transports, JWT, Gmail) | **NEVER** (gitignored as `server/.env`; also root `.env`) | `server/index.ts` |
| `server/.env.example` | Documented template of every backend var | Yes | Humans only |

Rules that exist because of incidents:

- **The dotenv path trap is already fixed in code; do not regress it.** `server/index.ts:1-7` loads dotenv with `dotenv.config({ path: path.resolve(__dirname, ".env") })`, i.e. always from `server/` regardless of cwd. The naive `import "dotenv/config"` loads from `process.cwd()` and silently finds nothing when you launch from the repo root. If env vars are mysteriously undefined, check nobody replaced this block.
- **Lazy client init is load-bearing.** `server/lib/openai.ts` and `server/lib/claude.ts` construct their SDK clients on first use, not at import (`if (!_client) _client = new ...`). This is why the server boots cleanly with no LLM keys set. `claude.ts` prefers Anthropic when `ANTHROPIC_API_KEY` is set, falls back to OpenAI, and throws "No LLM provider configured" only at call time. Never move client construction to module top-level.
- **A tracked `.env` leaked a real OpenAI key from this public repo in July 2026** (history rewritten with git-filter-repo; see propos-failure-archaeology). Before any commit touching env handling, confirm `.gitignore` still contains both the `.env` and `server/.env` lines.
- The full variable catalog (what each var does, defaults, prod vs experimental) is owned by propos-config-and-flags. Never echo secret values into logs, docs, or skills.

---

## 7. Test reality (honest status, 2026-07-06)

`src/__tests__/slm.test.ts` and `src/__tests__/smoke.test.ts` exist (currently untracked) but **no test runner is installed**: neither `package.json` has vitest, jest, or mocha. The tests are not currently runnable with any documented command. Until a runner lands (a propos-change-control gated change), evidence for correctness comes from the hierarchy in propos-validation-and-qa (screenshots, DOM checks, curl proofs). If you add a runner, wire it into CI in the same change and update this section.

---

## 8. Known traps summary

| Symptom | Cause | Fix |
|---|---|---|
| `/api/*` all 404 locally | Used `vite preview` | Use `npm run dev` (proxy) or serve the build via Express |
| Env vars undefined in server | dotenv loaded from cwd, not `server/` | Keep the `__dirname`-based `dotenv.config` block at the very top of `server/index.ts` |
| Server crashes at boot with missing key | Someone made an SDK client top-level | Restore lazy init in `server/lib/openai.ts` / `claude.ts` |
| Server ignores code edits | Ran `tsx index.ts` without watch | `cd server && npm run dev` (`tsx watch`) |
| tsc clean but backend broken (or vice versa) | Only one of the two tsconfig projects checked | Run both checks (section 3) |
| Frontend build missing Supabase data live | `VITE_*` vars absent at build time | `VITE_*` vars must be present in the env used by `vite build` (they are baked in, not runtime) |
| npm audit noise about xlsx | Frozen upstream package | Known open issue; needs the CDN-build swap, not an npm command |

---

## When NOT to use this skill

- Deploying, Cloudflare/Fly mechanics, tunnels, crons, logs → **propos-run-and-operate**
- What an env var means, full flag catalog, adding a flag → **propos-config-and-flags**
- Something is broken and you do not know why → **propos-debugging-playbook**
- What counts as proof a change works → **propos-validation-and-qa**
- Whether you may commit/push/deploy at all → **propos-change-control**

---

## Provenance and maintenance

Verified against the repo 2026-07-06. Re-verify with:

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
grep -n "node-version" .github/workflows/deploy.yml        # Node version still 22
grep -n "proxy" -A4 vite.config.ts                          # dev proxy still /api -> :3001, port 3003
head -8 server/index.ts                                     # dotenv __dirname block still first
grep -n "_openai\|_client" server/lib/openai.ts server/lib/claude.ts   # lazy init intact
grep -n '"build"' package.json                              # 3-step build chain unchanged
grep -cE "^\.env$|^server/\.env$" .gitignore                # must print 2
grep -n "vitest\|jest" package.json server/package.json    # still no runner? update §7 if this changes
grep -n '"xlsx"' server/package.json                        # xlsx still 0.18.5? update §2 when swapped
```
