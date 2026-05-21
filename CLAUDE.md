# PropOS — Claude Code Project Memory

> Auto-loaded by Claude Code at session start. Keep this up to date.
> For detailed session notes and ideas bank, see `NEXT_SESSION.md`.

---

## Codebase Location

```
/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/
```

The codebase at `/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/` is **deprecated**. Always work in the path above.

---

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + Framer Motion — inline styles only, no Tailwind, no CSS files
- **Backend**: Express + TypeScript in `server/` — runs on Railway, proxied via Cloudflare Pages Functions in `functions/api/`
- **Styling**: All via `style={{}}`. Use `C` tokens from `src/data.ts`. Use `FONT` for font-family.
- **State**: Local React state + `localStorage`. No Redux/Zustand.

---

## Deploy to propos.addvantage.site

The live site is hosted on **Cloudflare Pages** (project: `openhome-engine`). The custom domain `propos.addvantage.site` CNAMEs to `openhome-engine.pages.dev`.

### Full deploy sequence (run every time)

```bash
# 1. TypeScript check — MUST be zero errors before building
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
npx tsc --noEmit

# 2. Build the frontend
npm run build

# 3. Commit all changes to git
git add -A
git commit -m "your commit message"

# 4. Deploy dist/ to Cloudflare Pages
npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true

# 5. Push to GitHub (backup)
git push origin main
```

### Notes on step 4
- `--commit-dirty=true` is required — wrangler refuses to deploy if there are uncommitted changes unless this flag is set.
- The deploy takes ~10 seconds. You will see `Deployment complete!` with a preview URL.
- The live URL (`propos.addvantage.site`) updates within ~30 seconds of the deploy completing.
- CF Account ID: `5c76741d68d3c6244f76c866e962e0bb`
- The `CLOUDFLARE_API_TOKEN` env var must be set. If wrangler says "not logged in", run `npx wrangler login` or export the token: `export CLOUDFLARE_API_TOKEN=<token>`.

### What deploys where

| Layer | Where | How |
|---|---|---|
| Frontend (React SPA) | Cloudflare Pages | `npx wrangler pages deploy dist --project-name openhome-engine` |
| API proxy stub | Cloudflare Pages Functions | Auto-deployed from `functions/api/` when you run the above |
| Backend API server | Railway | Auto-deploys from `main` branch via `railway.toml` |
| Source code backup | GitHub | `git push origin main` |

### Backend API (Railway)
- `railway.toml` defines build + deploy config
- Start command: `cd server && npx tsx index.ts`
- Health check: `GET /api/health`
- Railway auto-deploys from `main` branch — pushing to GitHub triggers Railway deploy automatically
- The server handles `/api/generate`, `/api/send`, `/api/analytics`, `/api/sheet`

### Important: `vite preview` does NOT work for full-stack testing
`vite preview` serves static files only — it does NOT proxy `/api/*` requests. All API calls silently 404.
To test the full stack locally: `npm run dev` (Vite dev server, which proxies API via `vite.config.ts`).

---

## Git Workflow

```bash
# Check what changed (use ls-files — git status/diff can fail in some shells)
git ls-files --modified
git ls-files --others --exclude-standard

# Stage and commit
git add -A
git commit -m "feat/fix/chore: description"

# Push
git push origin main
```

Remotes:
- `origin` → `https://github.com/vinuthosrirama/PropOS.git` (primary)
- `backup` → `https://github.com/vinuthosrirama/PropOS-backup.git`

---

## Code Rules (non-negotiable)

1. **TypeScript zero errors** — run `npx tsc --noEmit` and fix all errors before every commit
2. **Inline styles only** — no Tailwind, no CSS files, no `className` for styling. Use `style={{}}` + `C` tokens
3. **No em-dashes** — never use `—` in AI-generated or static text. Use commas, "to", or periods
4. **No emoji in static UI** — only plain Unicode `✓`, `✕`, `→` are acceptable. No emoji in buttons/labels/nav
5. **Product name** — always "PropOS" powered by "AddVantage AI". Never surface GPT-4o, Claude, etc.
6. **Default agent** — Cameron Knoll @ Peake Real Estate, Berwick. Never revert to "Simon" or "Harcourts"

---

## Key Files

```
src/
  App.tsx                    Root, view router, login gate, lifted inbox state
  data.ts                    ALL data: C tokens, AGENCY_THEMES, AgentProfile, PortfolioProperty,
                             PORTFOLIO_SOLD/ACTIVE, PAS_PORTFOLIO_SOLD/ACTIVE, DEMO_LEADS
  views/AgentLogin.tsx       Login screen — creates AgentProfile, applies ProperCase to name
  views/DemoView.tsx         Main demo view — all stages (portfolio, leads, generate, review, inbox)
  views/SettingsView.tsx     SLM editor, voice corpus, agent settings — syncs to GSheets
  components/Nav.tsx         Header nav — Demo / Settings / Inbox tabs
  components/BuyerPitchReport.tsx   Printable PDF-ready buyer investment brief
  components/AnalyticsDashboard.tsx Auction funnel + GCI analytics
  lib/sheet.ts               GSheets integration — read/write leads, SLM, VoiceCorpus
  lib/slmMatch.ts            Lead-to-listing matching engine (hybrid vector + Q&A scoring)
  data/propertySlm.ts        SLM per-property Q&A knowledge store
server/
  index.ts                   Express server entry
  lib/openai.ts              OpenAI generate wrapper
  lib/claude.ts              Anthropic Claude generate wrapper
  lib/gmail.ts               Gmail send wrapper
  lib/twilio.ts              SMS send wrapper (Twilio)
```

---

## Agency Themes

Defined in `src/data.ts` as `AGENCY_THEMES`. Each has:
- `primary` — used for overlays and subtle backgrounds (should be dark for dark-background agencies)
- `gradient[0]` / `gradient[1]` — used for logo box, active nav tabs, CTA buttons, accent text
- `dim` / `glow` — hover effects
- `logo` — 2-char logo abbreviation

Key agents:
- **Cameron Knoll** — Peake (`primary: "#3f0278"`, `gradient: ["#7B35BE", "#3f0278"]`)
- **Pas Sunilchandra** — Area Specialist (`primary: "#1a1a1a"`, `gradient: ["#2d2d2d", "#0a0a0a"]`)

---

## GSheets Integration

- Sheet URL: `VITE_SHEET_URL` env var → Google Apps Script web app
- Tabs: `Leads`, `PropertySLM`, `Events`, `VoiceCorpus`
- `lib/sheet.ts` exports: `fetchLeads`, `writeAgentVoiceEntry`, `writeSLMFieldToSheet`, `readAgentVoiceCorpus`
- Writes happen on: send (voice corpus entry), Settings save (SLM field update)

---

## Visual Verification Rule

**Never declare a feature done without a screenshot proving it renders correctly.**
After deploying, use `open "https://propos.addvantage.site"` then take a computer-use screenshot to confirm the live site loads correctly.
