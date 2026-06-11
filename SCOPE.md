# PropOS — Build Scope & User-Defined Requirements

**Repository:** https://github.com/vinuthosrirama/PropOS.git  
**Last updated:** 2026-05-12 (Session 11)
**Built with:** Claude Code (Sonnet 4.5/4.6) + AddVantage AI  
**Stack:** React 18 + Vite + TypeScript + Framer Motion + Express + OpenAI + Anthropic Claude
**Live URL:** https://propos.addvantage.site
**GitHub:** https://github.com/vinuthosrirama/PropOS.git

---

## Product Overview

PropOS is a real estate agent productivity SPA built for Berwick, VIC agents (primary persona: Simon Field @ Peake Real Estate). It combines a property-specific Small Language Model (SLM), AI-generated outreach in the agent's voice, and a live demo flow — all wired to Google Sheets as the backend.

---

## User-Defined Requests & Build History

### Session 1 — Core Architecture
**Request:** Design and build OpenHome Engine BidGenerator — a single SPA for real estate agents at open homes.

**Scope defined:**
- Full responsive layout (mobile / tablet / laptop)
- Leads system: CSV import, blank new-lead form, similar-lead matching dropdown, pre-filled lead library
- Voice Learning Module replacing tone slider — agent uploads texts/emails/records voice, system builds a voice profile
- Lead Reactivation Engine with 6+ strategies including phone scripts, SMS drip sequences, market triggers, vendor-side reactivation
- Stack: React 18 + Vite + TypeScript + Framer Motion, inline styles only (no Tailwind), AddVantage dark theme
- Single SPA, no backend at this stage, all data mock/synthetic

---

### Session 2 — Agent Voice + Sheet Integration
**Request:** Wire agent voice profile into LLM generation so every SMS and email sounds like the specific agent.

**Scope defined:**
- `useVoiceMemo` hook using Web Speech API (browser-native, no API key required)
- `buildVoiceContext(profile, corpus)` function builds a prompt block from recorded voice corpus
- `loadCorpus()` reads training corpus from localStorage
- Express server (`server/`) with routes: `/api/generate`, `/api/message`, `/api/analyse`
- Claude Haiku → analyse lead → GPT-4o-mini → write message → Claude Sonnet → QA pass
- Google Sheets integration via Apps Script `doPost()` — POST leads, read leads, cache Claude responses

---

### Session 3 — Portfolio View + 4 Sold Properties (Berwick)
**Request:** Add a portfolio view showing 4 sold Peake properties from a screenshot. Hardcode the Berwick data.

**Scope defined:**
- `PORTFOLIO_SOLD`: 4 sold properties — 3 Thirlmere Court ($941K), 5 Ascot Rise ($1.30M), 47 Premier Drive ($1.00M), 11 Coach House Lane ($2.11M), plus additional properties
- `PORTFOLIO_ACTIVE`: 3 active listings — 17 Grand Arch Way, 12 Broadway Street, 5 Ashfield Drive
- Each property: address, suburb, postcode, beds/baths/cars/land, price, status, image URL (Domain/REA sourced)
- `pipelineLeads?: CrossPropertyLead[]` on each property — leads attached per property
- Portfolio stats: pipeline count, grade A buyers, match score %, GCI opportunity estimate

---

### Session 4 — Property SLM (Small Language Model) View
**Request:** Add a "Property" view (Step 4 in nav) where agents upload property documents to build a Small Language Model for that listing.

**Scope defined:**
- Nav label: "Property" (not "Property SLM")
- Demo property: "3 Thirlmere Court, Berwick VIC 3806" — pre-populated from portfolio ($941K, 4/2/612sqm)
- 8 document card types:
  1. Section 32 (PDF accepted) — vendor statement, title, zoning
  2. Title Document (PDF accepted) — certificate of title
  3. Easements — drainage, sewerage, right-of-way
  4. Rental Appraisal — weekly rent, yield, vacancy rate
  5. Vendor Emails — key correspondence, motivation, timeline
  6. Vendor Requirements — settlement terms, price expectations
  7. Comparable Sales — pre-populated with 6 recent Berwick sales
  8. Negotiation Strategy — walk-away point, competition, opening offer
- Each empty card shows 3 prompting questions guiding the agent what to type
- Toggle: "Paste Text" | "Upload PDF" per card
- PDF extraction: dynamic `import("pdfjs-dist")` with CDN worker
- SLM health ring: SVG stroke-dasharray animation, 0–100% score, color-coded (red/amber/blue/green)
- "NeuralMapSection" animation — grows with each document added (node count = 180 + docs.length × 12)
- localStorage persistence: `propOS_slm_v1`
- Auto-populate comparable sales on first load from SOLD_COMPS data

---

### Session 5 — Buyer Q&A / Vendor Checklist
**Request:** Property view should prompt the agent to answer common buyer questions — serves as both a Q&A bank for truthful answers to bidders AND a checklist of questions to ask the vendor.

**Scope defined:**
- 17 pre-populated questions across 4 categories:
  - Property & Building (5 Qs): build age, inclusions, pest inspection, defects, roof/HWS age
  - Legal & Title (4 Qs): caveats/easements, zoning/overlays, settlement period, tenancy
  - Financial (4 Qs): council rates, body corporate, rental appraisal, compliance notices
  - Access & Lifestyle (4 Qs): parking, shared driveways, NBN speed, planned developments
- Each Q: checkbox ("Asked vendor?" in blue when ticked) + answer textarea
- Counters: "X/17 answered" and "X/17 asked vendor" shown in header
- Storage: `propOS_qa_v1` in localStorage
- Answered Q&A injected into SLM context via `buildQAContext()` when generating outreach

---

### Session 6 — Demo View (Step 13, final nav step)
**Request:** Add a "Demo" view as the final nav step — a 5-stage live demo flow showing the full pipeline.

**Scope defined:**

**Stage 1 — Property select:**
- ALL properties (PORTFOLIO_SOLD + PORTFOLIO_ACTIVE) shown as grid cards
- SLM health badge on 3 Thirlmere Court ("🧠 13% SLM")
- SLM status banner showing loaded document count
- Click property → go to lead list

**Stage 2 — Lead select:**
- Leads filtered from `property.pipelineLeads`
- Each lead card: name, grade badge, persona, budget, notes
- Personalisation ring (SVG %) based on: budget, timeline, persona, notes, questions, transcript
- Click lead → go to recording panel

**Stage 3 — Recording panel:**
- Split layout: left = lead context card, right = recording panel
- `useVoiceMemo` hook — browser Web Speech API, no API key
- 7-bar animated waveform while recording
- Editable transcript textarea (live update while recording)
- SLM chip strip showing which doc types will be injected
- "Generate Outreach" button → calls `/api/generate` with `slmContext`
- "Skip recording and generate now" fallback button

**Stage 4 — Generating screen:**
- Spinner with "Claude Sonnet is writing in [Agent]'s voice..."
- Shows SLM chip badges for injected doc types

**Stage 5 — Review panel:**
- iMessage-style SMS preview (dark bubble UI, agent colour)
- Gmail-style email compose UI (white card, agent signature)
- Edit toggles for both SMS and email before approving
- "Approve and Send" → POST `/api/transcript` → saves to Google Sheets
- Saves: `generatedSMS` and `generatedEmail` as new columns on the lead row (for Twilio/Gmail firing later)

---

### Session 7 — Nav Extension (11 → 13 steps)
**Request:** Extend nav from 11 to 13 steps. Add "Property" at step 4 and "Demo" at step 13.

**Nav order (final):**
1. Portfolio
2. Agent Setup
3. Leads
4. Property ← NEW
5. Open Home
6. Intelligence
7. Messages
8. Cross-Listings
9. Reactivation
10. Convert
11. Vendor Report
12. Results
13. Demo ← NEW

---

### Session 8 — AI Generation Rules
**Request:** Ensure all generated outreach follows personal tone guidelines.

**Hard rules injected into every system prompt:**
- No AI text mannerisms (no "I hope this finds you well", "I wanted to reach out", "I trust you're doing well")
- No em-dashes (—) in generated text
- No bullet points or formal structure in SMS/email
- Written in agent's personal, conversational tone
- Grounded in property-specific SLM data — no generic real estate talk
- Short sentences, casual Australian phrasing

---

### Session 9 — Server Routes
**Request:** Wire server to support the Demo flow's outreach generation and Sheet saving.

**Server changes:**
- `server/lib/openai.ts`: Added `slmContext?: string` to `GenerateParams` — injected BEFORE voice context in system prompt
- `server/routes/transcript.ts` (NEW): POST `/api/transcript` — saves generated SMS + email to Sheet row
  - Body: `{ leadId, leadName, phone, propertyAddress, transcript, generatedSMS, generatedEmail, emailSubject, timestamp }`
  - POSTs to `VITE_SHEET_URL` with `action: "upsert_lead"`
  - Never fails the demo — catches all errors, returns `{ ok: true, warning? }`
- `server/index.ts`: Registered transcript router

---

### Session 14 — Bulletproof Multi-Transport Outreach (2026-06-11)
**Request:** Build a bulletproof, multi-redundant system to text real estate agents from PRE-EXISTING phone numbers, with email (Gmail OAuth) redundancy, full CRM in Supabase, morning reply workflow, and an evolving voice — without expensive SaaS plans.

**Hard requirements (standing — apply to all future sessions):**
- **Never use new/virtual phone numbers.** Always send from pre-existing real SIM numbers the recipient may recognise — relationship preservation is the whole point.
- **No expensive monthly or per-message plans.** Self-hosted / free tiers only. Code leverage over subscriptions.
- **4 send methods with double handling** — when one transport fails the next picks up automatically, both synchronously (cascade at send time) and asynchronously (delivery-failure webhooks redispatch).
- **Test phone:** all sends redirect to `TEST_RECIPIENT_PHONE` (+61415883354) until go-live.
- Natural send times (10am coffee-break window, ±12 min jitter), personal tone referencing the agent's recent sale/listing/suburb.
- Every conversation tracked in Supabase (`outreach_targets`, `outreach_drafts`, `conversations`); morning brief at 9am; replies drafted in Vinuth's voice for approve/edit/send.
- Voice evolves via the prompt-optimisation loop (approved/rejected/edited/demo_booked signals → weekly + threshold-triggered self-rewrite).

**Research findings (2026-06-11):**
- **TextingBlu / TextBlu.ai mechanism reverse-engineered:** their product is an iOS Shortcut installed on YOUR OWN iPhone that polls their cloud queue and sends via the native Send Message action — your number, their $9+/mo queue. PropOS's `shortcutRelay.ts` + `/api/sms-shortcut/*` is a self-hosted clone of exactly this: $0, no message caps.
- **telelink (nicholasxdavis/telelink):** Windows-only — drives Microsoft Phone Link via pywinauto UI automation. Ruled out as primary (we're Mac-based) but transport exists in code if a Windows box appears.
- **Email-to-SMS carrier gateways in Australia are discontinued** (Telstra Desktop Messaging dead, Optus/Vodafone gone). Ruled out permanently.
- **Sendblue** = managed Apple device fleet with dedicated numbers — violates the pre-existing-number rule. Ruled out.

**The 4 active methods (send order):**
1. **BlueBubbles** (Mac + own Apple ID) — iMessage native + SMS via Text Forwarding, webhook replies, named Cloudflare tunnel `bluebubbles.addvantage.site`
2. **iOS Shortcut Relay** (own iPhone, no Mac needed) — DB-backed queue polled by a personal automation, self-hosted TextingBlu clone
3. **Android SMS Gateway / httpSMS** (any spare Android + SIM) — REST + webhooks
4. **TextingBlue free tier** (100 msgs/mo) — zero-ops cloud fallback, still sends from own number

**Built this session:**
- `server/lib/sms.ts`: full cascade — `SMS_TRANSPORT_CHAIN` env var (comma-separated, ordered), legacy `SMS_TRANSPORT`+`FALLBACK` pair still works, auto-chain from all configured transports otherwise. `sendSMS()` walks the chain until success and returns per-transport `attempts`. `getTransportChain()`, `checkTransportChain()` exported.
- `server/index.ts`: BlueBubbles `message-send-error` webhook now redispatches the failed message through the remaining chain (once per guid). `GET /api/sms-transport` returns full chain health + gmail status.
- `server/lib/gmailInbound.ts` (NEW): polls Gmail every 5 min, matches senders against `outreach_targets.email`, feeds replies into the same inbound pipeline as SMS (drafts + morning brief), watermark in `system_kv`.
- `server/lib/outreachScheduler.ts`: when ALL SMS transports fail and the target has an email, the outreach message is delivered via Gmail instead.
- `server/lib/db.ts`: `system_kv` table; `outreach_log.transport` column.

---

## Data Architecture

### Key Types (`src/data.ts`)
```typescript
export type DocType =
  | "section32" | "title" | "easement" | "rental_appraisal"
  | "vendor_email" | "vendor_requirements" | "comparable_sales" | "negotiation_strategy"

export interface PropertyDocument {
  id: string; type: DocType; label: string; text: string
  fileName?: string; addedAt: string; wordCount: number
}

export type ViewId =
  | "portfolio" | "setup" | "leads" | "property" | "processing"
  | "dashboard" | "messages" | "crosslisting" | "reactivation"
  | "tenants" | "vendor" | "results" | "demo"

export interface CrossPropertyLead {
  name: string; phone: string; email?: string; budget: number
  persona: string; bedsWanted: number; suburbs: string[]; notes: string
  grade: Grade; fromProperty: string; matchScore: number
  questions?: string[]; transcript?: string
}
```

### SLM Library (`src/lib/slm.ts`)
- `DOC_CONFIG` — 8 doc types with label, icon, description, PDF flag, prompting questions
- `loadSLM() / saveSLM() / addSLMDocument() / removeSLMDocument() / clearSLM()` — localStorage CRUD
- `getSLMHealth(docs)` → `{ score, color, label, populated, total }` — 0–100% ring score
- `getLeadPersonalisation(lead)` → `{ score, color, label, factors }` — 6-factor profile ring
- `buildSLMContext(docs, relevantTypes?)` — LLM-ready property knowledge block
- `buildQAContext(items)` — LLM-ready Q&A block from answered questions
- `selectRelevantDocTypes(persona, questions, docs)` — client-side doc relevance selector
- `loadQA() / saveQA() / clearQA()` — Q&A localStorage CRUD
- `DEFAULT_QA` — 17 pre-seeded buyer questions

---

## Google Sheets Integration

**Apps Script `doPost()` handlers needed:**

### Existing: `action: "upsert"` — save lead
Already in Apps Script — writes full lead row.

### NEW: `action: "upsert_lead"` — save generated outreach
```javascript
if (action === "upsert_lead") {
  const sheet = ss.getSheetByName("Leads") || ss.getSheetByName("REA Leads")
  const d = JSON.parse(e.postData.contents)
  // Find row by leadId (name match), write generatedSMS + generatedEmail to new columns
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  let smsCol = headers.indexOf("Generated SMS") + 1
  let emailCol = headers.indexOf("Generated Email") + 1
  if (smsCol === 0) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue("Generated SMS"); smsCol = sheet.getLastColumn() }
  if (emailCol === 0) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue("Generated Email"); emailCol = sheet.getLastColumn() }
  // Find matching row by name
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i].some(cell => String(cell).includes(d.leadName))) {
      sheet.getRange(i + 1, smsCol).setValue(d.generatedSMS)
      sheet.getRange(i + 1, emailCol).setValue(d.generatedEmail)
      break
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON)
}
```

---

## AddVantage Brand Assets

**Website:** https://www.addvantage.site  
**Logo (light mode):** `https://framerusercontent.com/images/qj6o5G3u5J6YJ8vyJKFl6RSFHw.png`  
**Logo (dark mode):** `https://framerusercontent.com/images/7gmEwojj8Vv8lmgm6LA95xVndU.png`  
**Apple touch icon:** `https://framerusercontent.com/images/992NTrPq9LxwSm4WXfW76oKT7AU.png`  
**OG/Social image:** `https://framerusercontent.com/images/KpbhecEzWQ4dFSutqcW3lQOGNk.png`

---

## Future Ideas (Backlog — Do Not Build Yet)

1. **Multi-property SLM** — one SLM context shared across a suburb
2. **Bidder tracking** — log registered bidders pre/post SLM to prove ROI with data
3. **Twilio + Gmail automation** — auto-fire approved messages from Sheets (data already structured for this)
4. **SLM health leaderboard** — dashboard across agency showing each listing's readiness
5. **Vendor-facing SLM report** — show vendor which buyer questions have been pre-answered
6. **Comparable sales auto-pull** — scrape Domain/REA instead of manual entry
7. **Cross-property Q&A reuse** — answer "NBN speed" once, pre-fill for next listing on same street
8. **Box+Dice CRM integration** — import leads directly (MCP server partially scaffolded)
9. **Multi-agent mode** — principal can see all agents' SLMs and outreach performance
10. **Buyer Q&A voice input** — record vendor's answer by voice instead of typing

---

## Pricing Model (Hormozi-Inspired)

**Core Offer: "Property Brain Guarantee"**

| Scenario | Price |
|---|---|
| Setup | $0 |
| Property sells at/below reserve, fewer than 3 bidders | $0 |
| Property sells above guide with 3+ registered bidders | $499/listing |
| Performance Share (agent's choice) | 5% of GCI at settlement |
| Agency Seat (whole team, unlimited listings) | $299/agent/month |

**Pitch:** *"We build the full SLM for free. You only pay $499 if we helped bring more bidders. One extra bid at $900K is worth $15K to your vendor — you're paying 3% of the value we created."*

---

## Environment Variables

```
VITE_SHEET_URL=<Google Apps Script deployment URL>
OPENAI_API_KEY=<OpenAI key for GPT-4o-mini generation>
ANTHROPIC_API_KEY=<Anthropic key for Claude Haiku analysis + Sonnet QA>
```

---

## Local Development

```bash
npm install
npm run dev        # Vite frontend on :5173
npm run server     # Express backend on :3001
```

*Frontend proxies `/api/*` to the Express server via `vite.config.ts`.*
