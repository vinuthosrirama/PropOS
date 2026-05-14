# OpenHome Engine OS — Build Log

**Repo:** `vinuthosrirama/addvantageos`  
**Live URL (primary):** `https://openhome.addvantage.site`
**Live URL (fallback):** `https://openhome-engine.pages.dev`  
**Stack:** React 18 + Vite + TypeScript + Framer Motion

---

## Session 1 (completed)

### What was built

| File | Status | Notes |
|------|--------|-------|
| `index.html` | ✅ Done | AddVantage dark theme, Inter font, global CSS |
| `src/main.tsx` | ✅ Done | Clean entry point, no CSS import |
| `src/data.ts` | ✅ Done | Color tokens (C), FONT, all TypeScript types |
| `src/scoring.ts` | ✅ Done | Advanced intent scoring engine |
| `src/mock-data.ts` | ✅ Done | 22 attendees, all messages, tenant + FHB profiles |
| `src/components.tsx` | ✅ Done | Nav, EmailPreview, SMSPreview, VoiceMemoPanel, IntentScoreCard, etc. |
| `src/views.tsx` | ✅ Done | All 8 views |
| `src/App.tsx` | ✅ Done | View router + global state |
| `public/_redirects` | ✅ Done | Cloudflare Pages SPA routing |

### Build status
- `npm run build` passes with 0 errors
- Bundle: 443 KB (133 KB gzipped)

---

## Architecture

### Data flow
```
mock-data.ts  ──→  App.tsx (state)  ──→  views.tsx (each view)
scoring.ts    ──→  mock-data.ts (pre-computed scores)
data.ts       ──→  everything (types + color constants)
components.tsx ──→  views.tsx (shared UI)
```

### View routing
`App.tsx` holds `view: AppView` state. Each view is a stateless component receiving `onNavigate`, `agent`, and view-specific props.

### Key state in App.tsx
- `agent: AgentProfile` — persists across all views (customizable in View 1)
- `statuses: Record<string, MessageStatus>` — per-attendee approval state
- `scoreOverrides: Record<string, ScoreOverride>` — voice memo score boosts

---

## Scoring engine (src/scoring.ts)

**Formula:** `total = timeline + preApproval + interestLevel + engagement + velocity + RFM`

- **Timeline:** now=30, 1-3mo=20, 3-6mo=10, exploring=5
- **Pre-approval:** yes=25, in_progress=15, no=5
- **Interest:** 1-5 × 4 = max 20
- **Engagement decay:** `points × e^(-λ × daysAgo)`, λ = ln(2)/7 (half-life 7 days)
- **Velocity bonus:** 3+ events in 48hrs = +12, 2 events = +5
- **RFM:** recency (0-8) + frequency (0-8) + monetary budget overlap (0-6)
- **Grades:** A=80+, B=65-79, C=40-64, D=20-39, F=under 20
- **Tiers:** HOT, WARM, COOL, BROWSING, COLD

---

## Demo data (src/mock-data.ts)

**Featured listing:** 42 Homestead Road, Berwick VIC 3806  
4 bed / 2 bath / 2 car, 650sqm, $820,000 to $900,000

**Agent:** Simon Field, Harcourts Berwick

**22 attendees:** 4 HOT (A), 4 WARM (B), 7 COOL (C), 4 BROWSING (D), 3 COLD (F)

**Cross-listings:**
- 18 Cullen Close (3 bed, $690K to $740K)
- 7/15 Clyde Road (2 bed townhouse, $520K to $570K)
- 33 Golf Links Road (5 bed, $950K to $1.05M)

**Sold comparables (real domain.com.au data):**
- 22 Cullen Close — $778K (Apr 2026)
- 7 Sarah-Louise Place — $881K (Apr 2026)
- 74 Golf Links Road — $795K (Mar 2026)
- 21 Golf Links Road — $745K (Mar 2026)
- 4 Sunnyside Drive — $843K (Mar 2026)
- 4 Melrose Court — $775K (Mar 2026)

---

## Voice Memo feature (src/components.tsx — VoiceMemoPanel)

Uses Web Speech API (SpeechRecognition) for real recording on Chrome/Edge.  
Falls back to simulated word-by-word typing of pre-written demo script on other browsers.

After recording, calls `parseVoiceMemo()` from `scoring.ts` to extract:
- Budget (regex pattern matching)
- Timeline (keyword detection)
- Topics (school zones, solar, NBN, investment, sentiment etc.)
- Score impact (+5 to +25 based on what was said)

---

## Pending / Next session

1. Cloudflare Pages deploy (see below)
2. Custom subdomain: `openhome.addvantage.site`
3. Test full journey in browser
4. Mobile responsive check (375px, 768px, 1200px)

---

## Cloudflare Pages Deployment

### Manual steps (if wrangler is not used)

1. `npm run build` — outputs to `dist/`
2. Go to Cloudflare Pages dashboard
3. Create new project: `openhome-engine`
4. Upload `dist/` folder
5. Set custom domain: `openhome.addvantage.site`

### Wrangler CLI (preferred)

```bash
# From repo root
npm run build
npx wrangler pages deploy dist --project-name openhome-engine
```

Cloudflare API token (from existing deploy.sh):
```
<CLOUDFLARE_API_TOKEN>
```

Set env var:
```bash
export CLOUDFLARE_API_TOKEN=<CLOUDFLARE_API_TOKEN>
```

### DNS for custom subdomain

In Cloudflare DNS for `addvantage.site`:
- Add CNAME record: `openhome` → `openhome-engine.pages.dev`
- Or use existing Pages custom domain feature

---

## No em-dashes rule

Every message, AI output, email, and SMS in mock-data.ts uses:
- "to" for ranges (e.g., "$820,000 to $900,000", not "$820,000 -- $900,000")
- commas for pauses
- "and" or full stops for sentence breaks

This must be maintained in all future copy edits.

---

## Component export map

| Component | Location | Purpose |
|-----------|----------|---------|
| `Nav` | components.tsx | Sticky top nav with step indicators |
| `EmailPreview` | components.tsx | Gmail-style white email render |
| `SMSPreview` | components.tsx | iMessage-style bubble animation |
| `ComparisonPanel` | components.tsx | Generic vs AI side-by-side |
| `IntentScoreCard` | components.tsx | Attendee card with grade circle |
| `VoiceMemoPanel` | components.tsx | Voice recording + NLP + score update |
| `PropertyCard` | components.tsx | Listing info card |
| `ROICalculator` | components.tsx | Sliders + SVG GCI chart |
| `GradeBadge` | components.tsx | Grade + tier badge |
