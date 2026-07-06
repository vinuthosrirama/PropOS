# PropOS Document Intelligence — Tracking, Heatmaps and Intent Scoring

*Goal: send a vendor pitch as a trackable link, read every web-driven signal from the reading
session (open, dwell time, per-section time, scroll depth, cursor movement, heatmap, text
selections), convert those signals into an intent score, and use that score to raise lead warmth
and alert the agent in real time.*

*Status: written 2026-07-06. The MVP described here was found ALREADY BUILT in this repo during
the planning audit. This document therefore serves three purposes: (1) the canonical description
of the system, (2) the verification protocol it has not yet passed, and (3) the roadmap for
increasing complexity beyond the MVP.*

---

## 1. Research: what exists open source, and why we built custom

| Option | What it gives | Why not |
|---|---|---|
| [Papermark](https://github.com/papermark/papermark) (open-source DocSend alternative, AGPL) | PDF/doc sharing links, page-by-page time, visitor device/location, real-time open notifications, custom domains | Separate Next.js + Prisma + Tinybird stack running beside PropOS. Tracks PDF pages, not HTML sections. No cursor heatmaps. Its analytics would need a second integration to reach PropOS lead warmth. |
| [OpenReplay](https://openreplay.com/) (self-hosted session replay) | Full session replay, click/scroll/mouse heatmaps, ~26KB tracker | Docker Compose + S3 + ClickHouse infra for one tracked page type. Third-party script on a vendor-facing page. Replay data lives outside the CRM. |
| [PostHog](https://posthog.com/) (open-source product analytics) | Session replay, heatmaps, funnels, generous cloud free tier | Same integration-distance problem; heavyweight to self-host; cloud tier sends vendor reading behaviour to a third party. |
| **Custom in-PropOS tracker (CHOSEN, and what is built)** | Everything above scoped to exactly what we need, ~250 lines client + ~400 lines server, zero new infra, same-origin (adblock-resistant), events land directly in the PropOS Postgres next to contacts and outreach | More build effort — already paid. |

Decision confirmed by founder 2026-07-06: custom in-PropOS tracker; HTML pitch page with
optional PDF download; subtle footer disclosure (no consent banner, no silent tracking).

**Architectural fact that drives everything:** rich tracking (dwell, cursor, scroll) is only
possible on an HTML page we control. A PDF attachment yields zero signal. A PDF inside a viewer
wrapper (Papermark's model) yields page-time only. PropOS pitches render as HTML at
`/p/:slug`, which is the best-case tracking surface. The PDF path is "Print / Save PDF" from
that page — and the act of printing is itself a tracked intent signal.

---

## 2. Current state — full inventory (audited 2026-07-06, all file refs verified)

### Delivery layer (the thing the vendor receives)
- Pitch documents stored in `pitches` table (`server/lib/db.ts:442`), rendered as branded HTML
  at `propos.addvantage.site/p/:slug` by `src/views/PitchView.tsx`.
- Types: `price_update`, `digital_intro`, `listing_proposal`, `appraisal`, `buyer_brief`
  (templates in `src/components/pitch/`).
- Sent via existing Gmail/Twilio transports (`server/routes/send.ts`), link in body.
- "Print / Save PDF" button in `AppraisalView.tsx:152` with print CSS.

### Signal capture — email layer
- Open pixel: `GET /api/track/open/:id` serves a 1x1 GIF, marks `outreach_log` row opened
  (`server/routes/track.ts`). Wired into email sends via pre-logged tracking ID
  (`server/routes/send.ts:126-168`).
- Click tracking: `GET /api/track/click/:id?url=` marks clicked then redirects.
- Caveat to remember: Apple Mail Privacy Protection and Gmail image proxying inflate opens;
  the pitch-page open (below) is the trustworthy signal, the pixel is corroboration only.

### Signal capture — page layer (the core)
- Client: `src/lib/useDocTracker.ts` (246 lines). IntersectionObserver per section, cursor
  sampling, text-selection capture, scroll-depth high-water mark, tab blur/focus, 5-second
  batch flush, `navigator.sendBeacon` on tab hide. Sections declared via
  `src/components/pitch/TrackedSection.tsx` + `DocTrackerContext`.
- Event types: `open`, `section_enter`, `section_exit`, `scroll_depth`, `cursor_sample`,
  `text_select`, `tab_blur`, `tab_focus`, `session_end` (+ `print`, added 2026-07-06).
- Server: `server/routes/doc-track.ts` (394 lines), public, registered before the auth gate
  (`server/index.ts:182`). Accepts JSON batches and text/plain sendBeacon flushes. Acks
  immediately, processes async.
- Storage: `document_sessions` (one row per reading session: total time, sections viewed,
  completion %, scroll depth, per-section times JSON, last 500 cursor samples, text
  selections, viewer IP/UA) and `document_events` (raw event stream) —
  `server/lib/db.ts:674,697`.

### Intent scoring → lead warmth
- Score model in `doc-track.ts:80-106` (`computeScoreDelta`): time thresholds (30s/2min/5min),
  section coverage (50/80/100%), price-guide section opened (+3) and dwelled >30s (+4),
  comparable-sales dwell >30s (+3), any text selection (+2).
- Delta applied incrementally to `contacts.engagement_score` — reading behaviour directly
  raises lead warmth in the CRM (`doc-track.ts:247-255`).

### Real-time agent alerts
- SMS to agent on first open: "{Vendor} just opened your appraisal for {address}"
  (`doc-track.ts:274-299`).
- SMS on high-engagement threshold (score >= 10) with minutes read (`doc-track.ts:301-318`).

### Agent-facing analytics
- `src/views/DocInsightsView.tsx` (577 lines), nav view `insights` (`src/App.tsx:237`):
  session list per pitch, per-section read times, completion %, text selections, and a
  `CursorHeatmap` component rendering the sampled cursor positions (line 145).
- Contact-level rollup: `GET /api/doc-track/contact-summary` (docs sent, last opened, total
  engagement score).

---

## 3. What the audit found missing (gap list)

| # | Gap | Status |
|---|---|---|
| 1 | **End-to-end verification.** No SESSION_LOG entry shows this system proven live: pitch opened in a browser, events observed landing in Postgres, heatmap rendered from real samples. Compiling is not verification. | **Open — Phase 0, do first** |
| 2 | Footer disclosure line on the pitch page (founder decision 2026-07-06: subtle disclosure, not silent, not a banner) | Built 2026-07-06 (`PitchView.tsx` footer) |
| 3 | Print/Save-PDF is untracked — the strongest single intent action on the page was invisible | Built 2026-07-06 (`print` event via `beforeprint` listener in `useDocTracker.ts`) |
| 4 | Device/location (`viewer_ip`, `viewer_ua`) stored but not surfaced in DocInsightsView | Phase 2 |
| 5 | Return-visit alerting: re-opens create new sessions but only the FIRST open fires SMS. A vendor re-reading the proposal 3 times in one evening is the hottest possible signal and currently silent | Phase 2 |
| 6 | Forward detection: same pitch opened from multiple IPs/devices = proposal shared with spouse/other party. High-value signal, data already captured, no logic on it | Phase 2 |
| 7 | Type-routing oddity: `PitchView.tsx:291` routes `digital_intro` and `listing_proposal` to `PriceUpdateTemplate` while `introduction`/`proposal` (not in the DB CHECK constraint) route to the dedicated templates. Pre-existing; flagged, not touched | Investigate in Phase 0 |

---

## 4. Roadmap

### Phase 0 — Verify the MVP (before anything else)
1. Start server + frontend locally (`vite dev` proxies `/api`; never `vite preview` — no proxy).
2. Create a pitch via DemoView, open `/p/:slug` in a second tab.
3. Watch `document_sessions`/`document_events` rows appear; scroll, select text, print-dialog.
4. Open DocInsightsView, confirm session, per-section times, heatmap render, score delta.
5. Screenshot proof at each step per the Visual Verification Protocol.

**SMS autofire hazard:** first open of any pitch fires a real Twilio SMS to the agent's phone
(`doc-track.ts:259`). Any send needs founder approval per change control. Verification must
either use a pitch that has already been opened, run without Twilio env, or get explicit
founder approval for the test SMS first. Do not "just test it".

### Phase 1 — MVP polish (small, high-value)
- Footer disclosure (done) and print tracking (done) — verify in Phase 0 pass.
- Surface viewer device (parsed UA) and rough location in DocInsightsView session cards.
- Show return-visit count per contact ("opened 3 times") in the session list.

### Phase 2 — Intent engine v2
- Return-visit SMS: "Bob has re-opened your proposal — 3rd time today."
- Forward detection: distinct IP+UA pairs per pitch → "shared with someone" badge + score bump.
- Heatmap overlay: render cursor samples over a live iframe/screenshot of the actual pitch
  page (current heatmap is an abstract per-section canvas).
- Read-pattern classification: skimmer vs studier vs price-checker (jumped straight to price
  guide) — rule-based first, no LLM needed.
- Time-of-day and read-latency signals (sent→opened lag) into the score model.

### Phase 3 — Warmth loop closure
- Feed engagement_score into outreach prioritisation (who to call this morning: yesterday's
  readers, sorted by score).
- AI-drafted follow-up referencing what they actually read ("noticed the comparable sales
  section held your attention...") — founder-approved send, never autofire.
- Weekly digest to agent: all reading activity, hottest leads.

---

## 5. Privacy stance (founder decision 2026-07-06)
- Subtle footer disclosure on every tracked pitch page; no consent banner; no silent tracking.
- No cookies used by the tracker (session ID is per-page-load, in memory) — no cookie banner
  obligation.
- Text selections are capped at 200 chars and cursor samples at 500 per session; `outreach_log`
  PII already redacts at 90 days (`db.ts` Phase 7 pruning). Consider a matching retention rule
  for `document_events` in Phase 2.

---

## 6. Decisions log
| Date | Decision |
|---|---|
| 2026-07-06 | Custom in-PropOS tracker over Papermark / PostHog / OpenReplay |
| 2026-07-06 | HTML pitch page + optional PDF download; never PDF-first |
| 2026-07-06 | Subtle footer disclosure; no banner; no silent tracking |
| 2026-07-06 | Plan + MVP in one session; MVP found already built, session pivoted to audit + gap-fill + verification protocol |
