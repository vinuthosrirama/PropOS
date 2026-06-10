# PropOS "Pitch Suite" — 48-Hour Build Plan
*Goal: build Realtair's Pitch product (Price Updates, Digital Introductions, Listing Proposals + view-tracking) inside PropOS, 10x'd with AI personalisation — and ship a marketing page for it on addvantage.site/property using the existing design system.*

---

## 1. The Gap — PropOS vs Realtair Pitch

| Capability | Realtair | PropOS today | Gap |
|---|---|---|---|
| Price Update / Market Update emails | Manual template, agent edits per send | We already generate market updates (cached + LLM) | We're ahead on personalisation, behind on **packaging as a shareable branded link** |
| Digital Introduction (agent intro page) | Pre-built templates, agent picks one, sends link | Not built | **Missing entirely** |
| Listing Proposal / Pitch deck | Drag-drop section builder, CoreLogic comps, stats, testimonials | We have comparable sales data + SLM, but no proposal *document* | **Missing the document/deck layer** |
| "Viewed" notification (open tracking) | Pixel/link tracking, push notification to agent | We have `v_outreach_funnel` (sent/opened/replied) but no live "client just opened it" alert | **Missing real-time view alert** |
| CRM integration / send via email+SMS | Yes (their CRM) | Yes — Gmail + Twilio already wired | We're even |
| AI personalisation | None — static templates, agent edits manually | Cameron's voice corpus + SLM + cached outreach | **We're already 10x ahead here** |
| GCI Calculator | Not part of Pitch (separate Realtair tool) | Not built | **Missing — opportunity to out-design theirs** |
| Reviews/ratings sync | RealEstate.com.au sync | Not built | Nice-to-have, not core to 48h scope |
| Marketing campaign calendar in proposal | Yes, preset templates | Not built | Phase 2 |

**Net read:** Realtair's product is a *document generator with templates*. PropOS's edge is AI that writes *in the agent's actual voice* using *real local data*. The 48-hour build closes the packaging/delivery/tracking gap (which Realtair has and we don't) while keeping our personalisation edge — that combination is the 10x.

---

## 2. The 3 Pitch Types (Realtair's model → PropOS version)

### A. Price Update (a.k.a. Market Update)
- **Realtair**: static quarterly market update PDF/page sent to past vendors.
- **PropOS 10x**: AI-written cover note in Cameron's voice (using cached outreach + Tom Panos scripts as seed templates), auto-pulls comparable sales from existing `propertySlm.ts` / scraped SOLD data, branded landing page at a unique URL, sent via Gmail/SMS through `authFetch`-backed `/api/send`.
- **Trigger**: bulk-select leads from `DEMO_LEADS` (or GSheet `Leads` tab) → "Send Price Update" → AI drafts 3 variants (Tom Panos style A/B/C) → agent picks/edits → send.

### B. Digital Introduction
- **Realtair**: agent picks a pre-designed intro template, fills in bio + past sales, sends as a link.
- **PropOS 10x**: one branded "Agent Profile" page per agent (Cameron Knoll @ Peake) — bio, headshot, recent sales stats, testimonials — auto-populated from `data.ts` (`AgentProfile`, `PORTFOLIO_SOLD`). Agent customises per-recipient with a 1-line personal note (AI-suggested based on the buyer/vendor's SLM history).
- **Use case**: first touch with a brand-new lead — "Here's who I am and why I'm the right agent."

### C. Listing Proposal (Pitch Deck)
- **Realtair**: drag-drop builder — Method of Sale, Comparable Sales, Marketing Quote, Statistics, Testimonials, Timeline.
- **PropOS 10x**: a single dynamic proposal page assembled from existing data — comparable sales (already in `propertySlm.ts`), agency stats (`AGENCY_THEMES`/`AnalyticsDashboard`), method-of-sale copy (templated, AI-tailored to vendor's property type), testimonials. No drag-drop builder needed for v1 — fixed high-quality template, AI fills the variable sections per vendor.

---

## 3. The "Viewed" Notification (Realtair's standout feature)

**Mechanism (simple, no new infra):**
1. Each pitch (Price Update / Intro / Proposal) gets a unique slug: `propos.addvantage.site/p/:pitchId`
2. New table `pitches` (Postgres, same DB as Supabase medallion): `id, type, lead_id, agent_id, payload_json, created_at, first_viewed_at, view_count, last_viewed_at`
3. Public pitch page (`/p/:pitchId`) — on mount, calls `POST /api/pitches/:id/view` (unauthenticated, registered before `requireAuth` like `/track`)
4. `/api/pitches/:id/view` updates `first_viewed_at`/`view_count`/`last_viewed_at`
5. **Notification**: simplest v1 = badge in PropOS Inbox/Nav ("3 pitches viewed today") via polling `v_pitch_views` gold view, fed by existing `/api/analytics`. Stretch goal (if time allows): browser push via existing notification permission, or SMS-to-agent via Twilio when `first_viewed_at` is set.

This reuses the exact pattern already proven for `/track` and the medallion views — **low risk, fits existing architecture**.

---

## 4. GCI Calculator (better UI than Realtair's)

Realtair doesn't actually expose a polished GCI calculator publicly — this is a chance to win on design.

**Spec:**
- Inputs: Sale Price, Commission %, (optional) Marketing/admin fee, (optional) GST toggle, Split % (agent vs agency)
- Live-updating outputs as sliders/inputs change — no "Calculate" button
- Big animated number for "Your GCI" using design-system's Instrument Serif + `#A6DAFF` glow treatment (matches "Stat/Number Cards" pattern)
- Slider components styled per design system (pill shapes, `#0099FF` track, glass card)
- Embed in two places:
  1. **addvantage.site/property landing page** — public, top-of-funnel ("see what you could earn")
  2. **PropOS DemoView** — agent-facing, used live during a listing pitch ("here's what selling at $X nets you")

---

## 5. addvantage.site/property — Marketing Page Plan

Mimic the Framer site exactly per `addvantage-design-system.md`. New page (or section) at `addvantage.site/property`.

**Section order (matching the established pattern):**
1. **Navbar** — floating frosted-glass pill, existing AddVantage nav + "Property" highlighted
2. **Hero** — Instrument Serif headline: *"Win the Listing Before You Walk in the Door."* Subhead: "AI-personalised price updates, digital introductions, and listing proposals — sent in seconds, tracked in real time." CTA: "See PropOS in Action" → demo
3. **THE OFFER** — "The Competitive AddVantage" framing: Realtair-style pitch tools, but every word written in the agent's voice by AI, using real local sales data
4. **3 Pitch Types** — feature cards for Price Update / Digital Introduction / Listing Proposal (icons in `#A6DAFF`, glass cards)
5. **"You'll know the moment they open it"** — view-tracking feature, screenshot mockup of notification
6. **GCI Calculator** — embedded live, full design-system styling
7. **Outreach scripts carousel** — Tom Panos's 3 prospecting scripts as rotating cards (credit: "Scripts by Tom Panos"), framed as "Steal these — or let AI write better ones in your voice"
8. **STATS** — reuse pattern: "10x faster than manual proposals", "Sent in <2 minutes", "Real-time view alerts"
9. **PROCESS** — Identify → Personalise → Send → Get Notified
10. **Demo section** — live form: enter a suburb/property, generate a sample Price Update on the spot
11. **Footer CTA** — "Ready to send your first AI-personalised pitch?"

All copy in design-system tone: confident, problem-first, Australian, risk-reversal ("no templates to fight with — AI writes it for you").

---

## 6. 48-Hour Build Schedule

### Hours 0–8: Data layer + Pitch document model
- [ ] DB migration: `pitches` table (id, type, lead_id, agent_id, payload_json, slug, first_viewed_at, view_count, created_at)
- [ ] `server/routes/pitches.ts`: `POST /api/pitches` (create, authed), `GET /api/pitches/:id` (public), `POST /api/pitches/:id/view` (public, registered pre-`requireAuth`)
- [ ] `src/views/PitchView.tsx` — public renderer, reads `payload_json`, renders one of 3 templates based on `type`
- [ ] tsc clean, basic smoke test in Preview

### Hours 8–18: The 3 Pitch Templates
- [ ] **Price Update template** — header, "Prepared for [Name]", comparable sales grid (reuse `propertySlm.ts` comps + portfolio sold data), agent card, Tom Panos-style cover note (AI-generated, em-dash stripped)
- [ ] **Digital Introduction template** — agent bio from `AgentProfile`, recent sales stats, testimonials, personalised 1-liner
- [ ] **Listing Proposal template** — Method of Sale (templated copy), Comparable Sales, Statistics (from `AnalyticsDashboard` data), Testimonials, agent details
- [ ] All templates styled with `AGENCY_THEMES` (Cameron/Peake purple gradient) and PropOS Code Rules (inline styles, no em-dash, no emoji)
- [ ] Verify each template in Preview with screenshots

### Hours 18–26: Send flow + AI generation
- [ ] DemoView: "Send Pitch" action on a lead → modal: pick pitch type → AI drafts content (3 variants for Price Update using Tom Panos scripts as seed prompts) → agent edits → "Create & Send"
- [ ] Wire to existing `authFetch` + `/api/send` (Gmail/SMS) with the public pitch URL inserted
- [ ] Cached-outreach-first pattern preserved: Cameron's existing cached pitches used where available, AI fallback for new combos
- [ ] Verify send end-to-end: click send, check server logs, confirm link in email/SMS body

### Hours 26–32: View tracking + notifications
- [ ] `PitchView.tsx` fires `/api/pitches/:id/view` on mount
- [ ] Inbox/Nav badge: "X pitches viewed" — query against `pitches` table or new gold view `v_pitch_views`
- [ ] (Stretch) Twilio SMS to agent on first view: "Cameron — Bob Smith just opened your Price Update for 3 Smith St"
- [ ] Verify: open a pitch link in a second tab, confirm badge/notification updates

### Hours 32–38: GCI Calculator
- [ ] `src/components/GciCalculator.tsx` — sliders for sale price, commission %, split %, GST toggle; live recalculation
- [ ] Design-system styling: glass card, Instrument Serif big number, `#A6DAFF` glow, `#0099FF` slider track
- [ ] Embed in DemoView (agent tool) and addvantage.site landing page (public)
- [ ] Verify in Preview at desktop + mobile widths

### Hours 38–46: addvantage.site/property landing page
- [ ] New static page following section order in §5, full design-system compliance (fonts, colours, spacing, glass cards)
- [ ] 3 Pitch Type cards, view-tracking feature section, GCI calculator embed, Tom Panos scripts carousel (with attribution)
- [ ] Live demo form (reuse existing `/api/generate` for sample Price Update copy)
- [ ] Build + deploy to addvantage.site (separate Cloudflare Pages project — confirm project name before deploy)

### Hours 46–48: QA pass + screenshots
- [ ] `npx tsc --noEmit` clean across both `src/` and `server/`
- [ ] Full click-through: create lead → send Price Update → open link in second tab → confirm view tracked → check GCI calculator on both pages
- [ ] Screenshot every new screen per Visual Verification Protocol
- [ ] Deploy both PropOS and addvantage.site, push to `origin/main`

---

## 7. Open Questions Before Starting

1. **addvantage.site deploy target** — is this the same Framer-exported Cloudflare Pages project, or do we need a new one for the `/property` route? (Framer sites usually can't easily add custom React routes — may need a separate subdomain like `property.addvantage.site` pointing to a small standalone Vite build using the design system.)
2. **Tom Panos attribution** — confirm wording/credit line is acceptable before publishing his scripts publicly on the marketing page.
3. **`pitches` table** — confirm it's OK to add to the existing PropOS Postgres DB (per Known Friction Patterns: use `ADD COLUMN IF NOT EXISTS` / per-step migration).
4. **GCI calculator defaults** — confirm typical commission % and split % for Cameron/Peake to set sensible slider defaults.

---

*This plan keeps every change additive — no existing PropOS routes, auth flow, or DemoView logic is modified. New table, new routes (registered pre-auth where needed for public pitch pages), new components, new marketing page.*
