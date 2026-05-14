# OpenHome Engine — Build Plan

## Context

Building **OpenHome Engine by AddVantage Advisory** as an interactive demo in the existing repo `https://github.com/vinuthosrirama/addvantageos.git`. The demo must wow real estate agents with a single-listing journey through Berwick VIC 3806, using the established AddVantage dark theme and UI patterns from existing demos (Comparable Sales, Recent Listings, Open Home Engine).

**Key user requirements:**
1. Real Berwick agent + agency data (from Domain.com.au listings)
2. Dark theme matching existing AddVantage demos (deep navy: `rgb(4,7,13)` stack, Inter font, blue/green/orange accents)
3. Tenant-to-buyer conversion section + first-home-buyer-to-landlord section
4. Advanced intent scoring (engagement velocity, decay functions, multi-signal clustering, RFM)
5. Voice memo feature: agent talks through lead notes on phone, uploaded to cloud, Claude classifies and generates follow-up
6. Match existing SMS (iMessage style) and Gmail UI patterns from other demos
7. No em-dashes anywhere in AI-generated text
8. No Kanban drag-and-drop
9. Customizable demo showing agent voice/tone/attributes personalization
10. Startup-quality agile codebase

## Tech Stack (matching existing demos)

- **React 18 + Vite + TypeScript** (same as existing Open Home Engine demo)
- **Framer Motion** for animations
- **Inline styles** using the AddVantage color constants (same pattern as existing TSX demos)
- **No Tailwind** — raw CSS variables + inline styles (consistent with all existing demos)
- Deployed as a single SPA with view switching (no router needed for demo)

## Design System (from DEMO_BUILDING_GUIDE.md)

```
Colors: --bg: rgb(4,7,13), --bg2: rgb(14,18,28), --bg3: rgb(22,27,40)
Text: --text: rgb(213,219,230), --muted: 0.5 opacity, --faint: 0.3 opacity
Accents: --blue: rgb(166,218,255), --green: rgb(100,208,144), --orange: rgb(255,184,100)
Borders: rgba(216,231,242,0.08) default, 0.18 hover
Font: Inter, -apple-system stack
SMS: iMessage style (blue outgoing, grey incoming)
Email: Gmail white UI with agent signature in dark navy
Nav: Sticky, glass-morphism blur, 56px height
```

## Real Berwick Data Sources

**Sold properties** (from `berwick_data.js` + `sold_properties.jsonl`):
- 22 Cullen Close — $778K (sold 17 Apr 2026)
- 7 Sarah-Louise Place — $881K (sold 16 Apr 2026)  
- 86 Marisa Crescent — $1,150K (sold 16 Apr 2026)
- 74 Golf Links Road — $795K (sold 26 Mar 2026)
- 21 Golf Links Road — $745K (sold 17 Mar 2026)
- 4 Sunnyside Drive — $843K (sold 4 Mar 2026)

**Featured listing for demo** (active, fictional but realistic): 
- 42 Homestead Road, Berwick VIC 3806 — 4 bed / 2 bath / 2 car, 650sqm
- Price Guide: $820,000 to $900,000
- Agent: Real Berwick agent (we'll use a realistic agent profile from Harcourts/Ray White Berwick)

**Cross-listing properties** (use real sold addresses as "also active"):
- 18 Cullen Close, Berwick (3 bed, $690K to $740K)
- 7/15 Clyde Road, Berwick (2 bed townhouse, $520K to $570K)  
- 33 Golf Links Road, Berwick (5 bed, $950K to $1.05M)

## Build Steps

### Step 1: Repo Setup + Blueprint Upload
1. Clone `addvantageos` repo locally
2. Create `docs/PRODUCT_BLUEPRINT.md` with the full product spec
3. Initialize Vite + React + TypeScript project
4. Install dependencies: `react`, `react-dom`, `framer-motion`, `typescript`, `vite`
5. Set up the AddVantage color constants and base styles
6. Push initial scaffold

### Step 2: Core Data Layer (`src/data/`)
- `constants.ts` — Color system, font stack (matching DEMO_BUILDING_GUIDE.md exactly)
- `types.ts` — TypeScript interfaces for Agent, Property, Attendee, Message, Engagement, VendorReport
- `mock-data.ts` — All synthetic Berwick data:
  - 1 featured listing with full details
  - 3 cross-listing properties
  - 6 real sold comparables (from berwick_data.js)
  - 22 attendees with full profiles (realistic Melbourne names, +61 phones, diverse personas)
  - Pre-generated AI messages (SMS + email) for each attendee — NO em-dashes
  - Voice memo transcriptions (simulated)
  - Vendor report data
- `intent-scoring.ts` — Advanced scoring engine

### Step 3: Advanced Intent Scoring Engine
Beyond simple points, implement:
1. **Engagement Velocity** — score based on how fast interactions happen (3 actions in 48hrs > 3 in 6 weeks)
2. **Exponential Decay** — recent interactions weighted more (half-life of 7 days)
3. **Multi-Signal Clustering** — detect when 3+ weak signals fire within 48hrs (compound scoring)
4. **RFM Variant** — Recency (days since last touch), Frequency (interactions per 30 days), Monetary (budget alignment)
5. **Behavioral Micro-Signals** — scroll depth proxy, repeat property views, cross-listing interest
6. **Lead Grade** — combine into A/B/C/D/F grade with real-time update simulation
7. Tiers: A (85+) = HOT, B (65-84) = WARM, C (40-64) = COOL, D (20-39) = BROWSING, F (<20) = COLD

### Step 4: Single Listing Journey (Views)

**View 1: Landing / Agent Setup (Personalizable)**
- Agent profile setup: name, agency, suburb, email, phone, voice/tone selector
- Property selector (or enter custom)
- "Your voice" section: tone slider (formal to casual), communication style examples
- Shows this is fully customizable to the agent
- CTA: "Launch Open Home Engine"

**View 2: Open Home Just Ended**
- Property hero card (42 Homestead Road, Berwick — photo placeholder with gradient)
- "Open home completed" status with timestamp
- 22 attendees registered — animated counter
- Processing animation: "Analyzing 22 attendees... generating personalized follow-ups"
- Loading steps with check marks (matching existing demo pattern)
- Auto-transitions to View 3

**View 3: Intelligence Dashboard**
- Intent score breakdown for all 22 attendees
- Advanced scoring visualization: radar chart or heat grid showing multi-signal scores
- Color-coded attendee cards (A=hot red, B=warm orange, C=cool blue, D=grey)
- Each card shows: name, score, grade, top signals, recommended action
- "Voice Memo" button on each card (see Step 6)
- Priority actions panel: "3 buyers need a call NOW"
- Filter/sort by score, timeline, budget

**View 4: Message Approval Queue**
- Drafted messages for all 22 attendees (SMS + email pairs)
- Side-by-side: "Before" (generic Ray White template) vs "After" (AI personalized)
- Gmail-style email preview (matching existing demos' white Gmail UI)
- iMessage-style SMS preview (matching existing demos' bubble pattern)
- Actions per message: Approve / Edit / Skip / Flag for Call
- "Approve All" button
- Shows messages come FROM agent's email/phone (drafts, not auto-send)
- Agent tone calibration visible: "Written in [Agent]'s voice"

**View 5: Cross-Listing Matcher**
- Shows which attendees match other active listings
- AI-generated reasoning for each match (no em-dashes)
- "James preferred 4-bed with a study. 33 Golf Links Road has exactly that layout, $50K under his budget"
- One-click "add to follow-up queue"

**View 6: Tenant-to-Buyer Conversion** (NEW SECTION)
- Pull in rental data for Berwick (current tenants in agent's rent roll)
- AI identifies tenants who may be ready to buy:
  - Rent approaching mortgage repayment threshold
  - Lease renewal coming up
  - Duration of tenancy (stability indicator)
  - Income growth signals
- Personalized outreach: "You're paying $520/wk in rent. A 3-bed in Berwick with 5% down would be $485/wk in repayments. Want to explore?"
- First-home-buyer-to-landlord pathway:
  - Identify past FHB clients who purchased 2+ years ago
  - Equity growth calculator
  - "Your home in Berwick has grown $85K in equity. That's enough for a 20% deposit on an investment property at $425K"
  - AI-generated investor conversion message

**View 7: Vendor Report**
- Auto-generated weekly report for the vendor of 42 Homestead Road
- Shows: attendee count, active interest, hot buyers (anonymized), market context
- Berwick suburb stats: median price, days on market, clearance rate
- Professional layout matching email preview style
- Edit/approve flow

**View 8: Results & GCI Impact**
- Before/after comparison (conversion funnel)
- ROI calculator with sliders (matching existing demo pattern)
- GCI impact: projected annual uplift
- Reply rate comparison bars (generic 4% vs AddVantage 84-88%)
- Exponential GCI chart (matching existing SVG pattern)

### Step 5: Voice Memo Feature (Phone Upload)
- Each attendee card has a microphone icon button
- Click opens a "Voice Memo" panel:
  - In demo: shows a simulated voice recording waveform
  - Text area showing "transcription" appearing word-by-word (simulated)
  - Example: "John came through today, really interested in the kitchen layout. He asked about the school catchment for Berwick Primary. His wife mentioned they need to sell their place in Officer first. Budget is around 850. Seemed pretty keen, maybe 3 months out."
- After "processing", the transcription gets classified:
  - Key topics extracted: kitchen layout, school catchment, needs to sell first, $850K budget, 3-month timeline
  - Intent score updated (timeline=3mo +20pts, budget aligned +15pts, needs to sell -5pts)
  - Auto-generated follow-up drafted:
    - SMS: "Hey John, great to meet you at Homestead Rd. Berwick Primary is 800m walk, top 10% statewide. Happy to chat about timing with your Officer sale. Just text back!"
    - Email with school catchment data, Officer market insights, comparable sales
- This demonstrates minimal agent input (just talk naturally) → maximum output

### Step 6: Brand Guidelines Enforcement
- No em-dashes (--) anywhere in generated text. Use "to" for ranges, commas for pauses.
- Tone: warm, specific, Australian-colloquial
- Never: "I hope you enjoyed", "Dear Sir/Madam", generic pleasantries
- Always: reference something specific from the open home, provide data, clear next step

### Step 7: Customization Showcase
- Agent profile is editable at any point (top-right settings icon)
- Tone calibration: show 3 versions of the same message in different tones
- Agency branding: color accent (secondary to the AddVantage dark theme)
- Email signature: fully customizable
- Response timing: configurable (30min, 1hr, 2hr, 4hr)
- Auto-approve toggle: on/off with configurable delay

## Key Files

```
addvantageos/
├── docs/
│   └── PRODUCT_BLUEPRINT.md
├── src/
│   ├── main.tsx                    (App entry, global styles)
│   ├── App.tsx                     (View router, state management)
│   ├── data/
│   │   ├── constants.ts            (Colors, fonts — from DEMO_BUILDING_GUIDE)
│   │   ├── types.ts                (All TypeScript interfaces)
│   │   ├── mock-data.ts            (Berwick properties, 22 attendees, messages)
│   │   └── intent-scoring.ts       (Advanced scoring engine)
│   ├── views/
│   │   ├── AgentSetup.tsx          (View 1: personalizable agent profile)
│   │   ├── OpenHomeComplete.tsx    (View 2: processing animation)
│   │   ├── IntelligenceDashboard.tsx (View 3: attendee scores + voice memo)
│   │   ├── MessageQueue.tsx        (View 4: approve/edit/skip messages)
│   │   ├── CrossListingMatcher.tsx (View 5: property matching)
│   │   ├── TenantConversion.tsx    (View 6: tenant→buyer + FHB→landlord)
│   │   ├── VendorReport.tsx        (View 7: weekly vendor update)
│   │   └── ResultsDashboard.tsx    (View 8: ROI + GCI impact)
│   └── components/
│       ├── Nav.tsx                 (Sticky glassmorphism navbar)
│       ├── EmailPreview.tsx        (Gmail-style email render)
│       ├── SMSPreview.tsx          (iMessage-style bubbles)
│       ├── VoiceMemo.tsx           (Recording + transcription UI)
│       ├── IntentScoreCard.tsx     (Attendee card with score visualization)
│       ├── ROICalculator.tsx       (Slider-based calculator)
│       ├── ComparisonPanel.tsx     (Generic vs AI side-by-side)
│       └── PropertyCard.tsx        (Berwick property card with photo gradient)
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Verification

1. `npm run dev` — all views render, no console errors
2. Navigate full journey: Setup → Processing → Dashboard → Messages → Matching → Tenant → Vendor → Results
3. Voice memo simulation plays correctly
4. Message approval flow works (approve, edit, skip)
5. No em-dashes in any text
6. Intent scores update when voice memo is "processed"
7. All UI matches AddVantage dark theme
8. Gmail/SMS previews match existing demo patterns
9. Mobile responsive (check 375px, 768px, 1200px)
10. Agent customization persists across views
