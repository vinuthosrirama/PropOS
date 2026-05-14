# PropOS — Session Notes & Ideas Bank
_Last updated: 12 May 2026 — Session 11_

---

## Working Instructions for Future Claude Sessions

### Rule #1 — Always update this file at end of session
After completing any task, update NEXT_SESSION.md with new learnings, architectural decisions, and what was built. Commit and push so the next session picks up from the right place.

### Rule #2 — Ask clarifying questions before building
Before implementing any feature, confirm: scope, which view it lives in, whether it replaces or extends something existing, any specific UX behaviour.

### Rule #3 — Zero emoji in static UI
No emoji in buttons, labels, nav, cards, or banners. ONLY allowed in animation `animate={{ rotate: 360 }}` spinners. Plain Unicode `✓`, `✕`, `→` are fine anywhere.

### Rule #4 — Inline styles only, no Tailwind, no CSS files
All styling via React `style={{}}`. Use `C` colour tokens. Use `FONT` for font-family. Use `useBreakpoint()` for responsive behaviour. Never add media queries or CSS files.

### Rule #5 — TypeScript strict — zero errors before every commit
Always run `npx tsc --noEmit` and fix all errors before committing.

### Rule #6 — NeuralMap is a canvas animation, not SVG
NeuralMap.tsx uses HTML Canvas + requestAnimationFrame. Dense Obsidian-graph style with ~260 nodes, Gaussian cluster + outer ring, multi-colour palette. Do NOT convert back to SVG.

### Rule #7 — No em-dashes anywhere
AI-generated and static UI text must never use `—` (em-dash). Use commas, "to", or periods instead.

### Rule #8 — Agent is Cameron Knoll @ Peake Real Estate, suburb Berwick
Default agent = Cameron Knoll. Default listing = 34 Hartsmere Drive, Berwick VIC 3806. Agency theme = Peake (purple #9B6FD4). Never revert to "Simon" or "Harcourts" defaults. Data file: `src/data.ts`.

### Rule #9 — Correct codebase path
`/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS/`
The other codebase at `/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/addvantageos/` is DIFFERENT and deprecated. Always work in PropOS.
GitHub: `https://github.com/vinuthosrirama/PropOS.git`

### Rule #10 — Deploy via wrangler to openhome-engine CF Pages project
`propos.addvantage.site` CNAMEs to `openhome-engine.pages.dev`. Deploy with:
```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
npm run build
CLOUDFLARE_API_TOKEN=<CLOUDFLARE_API_TOKEN> \
  npx wrangler pages deploy dist --project-name openhome-engine --commit-dirty=true
```

### Rule #11 — Git worktree issue: use ls-files, not git status
`git status` / `git diff` fail in Bash (stale BidGenerator worktree). Use `git ls-files --modified` and `git ls-files --others --exclude-standard` instead. `git add`, `git commit`, `git push` all work normally.

### Rule #12 — PropOS branding only
Product is called PropOS. Powered by AddVantage AI (never surface model names like GPT-4o to users).

---

## Current Status — Session 11 (12 May 2026)

### What was built this session
1. **Branding cleanup** — removed all "OpenHome Engine" references; product is PropOS throughout
2. **GPT-4o hidden** — `server/routes/generate.ts` and `src/lib/voiceContext.ts` now say "AddVantage AI"
3. **Nav: "Agent Setup" renamed to "Settings"** — `src/components/Nav.tsx`
4. **Launch PropOS navigates to portfolio** — `src/App.tsx` AgentSetup `onLaunch` now goes to `"portfolio"`
5. **Agent defaults** — `DEFAULT_AGENT` set to Cameron Knoll / Peake / Berwick
6. **Featured property** — FEATURED_PROPERTY is now 34 Hartsmere Drive, Berwick VIC 3806 (4/2/2, 650sqm, $820K-$900K)
7. **All 22 demo leads updated** — SMS/email messages: "Simon from Harcourts" → "Cameron from Peake"; "42 Homestead Rd" → "34 Hartsmere Dr"
8. **`sheetRowToLead` fixed** — `agentFirst = "Cameron"`
9. **App.tsx placeholders** — "Simon Field" → "Cameron Knoll"; "Harcourts Berwick" → "Peake"
10. **Deployed to production** — dist/ built, pushed to GitHub, deployed to openhome-engine CF Pages project, live at `propos.addvantage.site`

### What was already built (Session 10)
- Login: `AgentLogin.tsx` — firstName, lastName, agency dropdown (auto-theme), suburb, email, phone
- Portfolio: `PortfolioView.tsx` — active + sold listings, first view after login
- Settings: `AgentSetup` in App.tsx — profile, voice learning, comparable sales, comms style
- Full 8-view journey: Portfolio → Property → Intelligence → Messages → Cross-Listings → Tenant → Vendor → Results
- NeuralMap canvas animation, HealthRing, DocCard, Q&A buyer checklist in PropertyView
- Voice memo + Web Speech API transcription
- iMessage-style SMS preview + Gmail-style email preview
- ROI calculator with sliders

---

## Next Session Priorities (in order)

### P1 — Settings view content audit
Move ALL of these into the Settings view (ViewId: "setup"):
- Communication style selector
- Follow-up styles (SMS drip, email sequences)
- Featured listing management (add/edit/remove listings)
- Integrations section (Google Sheets, Box+Dice, etc.)
- Comparable sales section
These should NOT appear scattered in other views.

### P2 — Login polish
- Agency dropdown: show colour swatch next to agency name
- After selecting agency, preview theme applied live to login card
- Suburb: searchable autocomplete (not static dropdown)
- Validation: email format, phone normalisation (+61)

### P3 — PortfolioView data
- PORTFOLIO_ACTIVE and PORTFOLIO_SOLD need real Berwick listing data
- Active: 34 Hartsmere Drive + 2 from CROSS_LISTINGS
- Sold: use SOLD_COMPS (22 Cullen Close, 7 Sarah-Louise Place, etc.)

### P4 — PropertyView audit
- Verify NeuralMapSection, HealthRing, DocCard, Q&A all reference 34 Hartsmere Drive
- Test full property detail flow end-to-end

### P5 — Live AI mode
- `VITE_API_BASE` env var toggle for `/api/generate` endpoint
- Default: use pre-generated DEMO_LEADS messages (current behaviour)
- "Live AI" mode: route to deployed server for real-time generation

### P6 — Mobile audit
- All 13 views at 375px viewport
- Nav hamburger: open/close/navigate
- Message queue: SMS bubbles + email preview at mobile width

---

## Architecture Reference

### Key files
```
src/
  App.tsx                    Root component, view router, login gate
  data.ts                    ALL mock data + constants (FEATURED_PROPERTY, DEMO_LEADS, AGENCY_THEMES, DEFAULT_AGENT)
  components/Nav.tsx         Sticky navbar, VIEWS array, mobile hamburger
  views/AgentLogin.tsx       Login gate (first screen)
  views/PortfolioView.tsx    Landing after login: active + sold listings
  views/PropertyView.tsx     Single listing detail (NeuralMap, HealthRing, DocCard)
  lib/voiceContext.ts        Voice profile compiler for LLM prompts
  lib/slm.ts                 Small Language Model for property Q&A
server/
  routes/generate.ts         POST /api/generate pipeline
  lib/openai.ts              OpenAI wrapper (branded AddVantage AI)
  lib/claude.ts              Anthropic Claude wrapper
```

### Color tokens
```
C.bg     = rgb(4,7,13)
C.bg2    = rgb(14,18,28)
C.bg3    = rgb(22,27,40)
C.text   = rgb(213,219,230)
C.blue   = rgb(166,218,255)
C.green  = rgb(100,208,144)
C.orange = rgb(255,184,100)
C.red    = rgb(255,100,100)
C.border = rgba(216,231,242,0.08)
```

### Deployment
- GitHub: `https://github.com/vinuthosrirama/PropOS.git` (branch: main)
- CF Pages project: `openhome-engine` → `openhome-engine.pages.dev`
- Live URL: `propos.addvantage.site` (CNAME proxied in Cloudflare)
- CF Account ID: `5c76741d68d3c6244f76c866e962e0bb`
- CF API Token: `<CLOUDFLARE_API_TOKEN>`

---

## Known Issues

1. `git status` / `git diff` fail in Bash — use `git ls-files --modified` instead
2. Build chunk size warning (539KB index.js) — normal for this SPA, not an error
3. Dynamic import warning (slm.ts) — harmless, not an error
4. Express server (`server/`) is NOT on CF Pages — API features fall back to templates in production

---

## Ideas Bank

- Live AI mode via CF Workers or Railway server deploy
- Google Sheets live sync (endpoint already wired in App.tsx)
- Box+Dice MCP integration (mcp-boxdice/ server exists, not yet wired)
- PDF vendor report download
- WhatsApp Business API preview
- Multi-listing mode (5+ active listings)
- Team mode (multiple agents, shared leads)
