# PropOS Session Log

Cross-conversation handoff file. Every Claude session appends a dated entry at the TOP (newest first) before its final push: what was built, what was verified, what is half-done, and the exact next step. Read this at session start.

---

## 2026-06-11 (later still) — pitch email embeds content, no more dead localhost links

**Built (commit `867517b`):**
- `server/lib/emailTemplate.ts`: new `buildPitchContentHtml(payload, color)` renders comparable sales table + suburb market snapshot as email-safe branded HTML; `buildEmailHTML` gained optional `contentHtml` injected after the property box.
- `server/routes/send.ts`: `/api/send` accepts optional `pitchPayload` and embeds the block in the email.
- `DemoView.tsx` `handleSendPitch`: detects localhost pitch URLs; email copy says "the full breakdown is below" (link only added on a real domain), SMS copy points to the email instead of a dead URL, `pitchPayload` passed to `/api/send`.

**Verified:** live send via Preview (SMS sid + Gmail messageId returned); sent email read back via Gmail (thread `19eb407b9d405589`) — no localhost anywhere, comps ($860K/$900K/$855K Officer sales) + market snapshot ($870K median, 26 DOM, 74% clearance, 5.8% growth) embedded, Peake purple branding and CK signature intact; rendered HTML screenshot-verified via Preview. tsc: server 0 errors, root 11 (all pre-existing).

**Deploy state:** pushed to origin/main (Railway backend auto-deploys). Cloudflare Pages deploy attempt was denied by the permission classifier (not explicitly user-authorized this session); curl confirms propos.addvantage.site still serves the previous bundle `index-CWk23ErI.js`. When authorized: `npx vite build && npx wrangler pages deploy dist --project-name propos-demo --branch main`.

---

## 2026-06-11 (later) — CRM import connector + pitch-opened call-now climax

**Built (commit `a7472d0`):**
- `server/routes/import-contacts.ts`: POST `/parse` (SheetJS XLSX to string grid), POST bulk upsert into `contacts` (single round trip, `source='import'`), GET read-back per agent. Registered behind auth; 10mb body override for workbook uploads. `xlsx` added to server deps.
- DemoView VendorPortfolioPage: file input accepts `.csv,.xlsx,.xls`; header-alias mapping extracted to `mapRowsToContacts` shared by CSV (client parse) and XLSX (server parse); **bug fixed**: first+last name merge never ran because the `name` alias contains-matched the "First Name" header; bulk import in one POST; read-back useEffect merges DB contacts into buyers on mount (dedupe by name+address).
- DemoView pitch tab: simulated view notification 9s after pitch send ("{fname} just opened your Price Update, 3 views") with "Call now" button opening a personalised Tom Panos call-script overlay (tap-to-call phone, price band from `buildAppraisalRange` low/high, "too busy" variant, attribution).

**Verified (Preview screenshots):** AgentBox-style CSV imported through the real modal — 3 contacts (Greg Hartley, Priya Nair, Sam & Elena Castellanos) appeared in the CRM with computed equity and Nearby-sale triggers, count 88→91. XLSX parse verified via curl with a real workbook. DB-less read-back graceful (`contacts: []`, `persisted:false`). Notification appeared ~9s post-send; overlay showed "Hi David, it's Cameron from Peake... $795K to $950K" fully personalised. tsc: server 0 errors; root only pre-existing (note: a SettingsView:1324 TS2352 appeared mid-session from edits outside this session).

**Deployed:** propos.addvantage.site serves `index-CWk23ErI.js` (verified via curl). Railway backend redeploys from the origin/main push.

**Context (strategy session):** competitor = Realtair (vendor-only, no AI). PropOS = BuyerOS (top of funnel) + VendorOS (middle). Demo audience: individual agents. 60-day goal: 3-5 paying betas. Identified demo gaps: open on the GCI number, live import of prospect's own data (now built), closed-loop notification moment (now built), flywheel visual (buyer becomes future vendor), leave-behind artifact per agency.

**Next step:** flywheel screen and/or per-agency leave-behind one-pager; remaining deferred Pitch Suite items (bulk generation, regenerate, Digital Intro / Listing Proposal templates, real `v_pitch_views` inbox badge).

---

## 2026-06-11 — Pitch Suite complete, Property Pitch template, deploy fix

**Built:**
- Full Pitch Suite (commit `2cdc4b4`): `pitches` DB table + migration, `server/lib/pitchGenerator.ts` (Claude cover notes, cached-first, sanitised), `server/routes/pitches.ts` (CRUD + public by-slug/view routes registered before requireAuth), `src/views/PitchView.tsx` at public `/p/:slug` with view tracking, `src/components/pitch/PriceUpdateTemplate.tsx` (conditional section rendering, Realtair parity).
- `src/components/GciCalculator.tsx` — live GCI calculator, glass-card design-system styling.
- DemoView vendor profile: three new tabs — "Price Update Pitch" (generate → preview → send via Twilio/Gmail → copy link), "Property Pitch", "GCI Calculator".
- `src/components/pitch/PropertyPitchTemplate.tsx` — Peake-branded (#3f0278 / #7B35BE) photo-hero listing showcase using SLM_DATA[101] (10 Ashby Drive, Narre Warren South) + first comparable sale (9 Arlington Place, $880,000 Feb 2026). Playfair Display serif headlines, gradient overlay hero, price-guide gradient card, lifestyle/features/comparable/agent sections. Em-dash stripping applied to all SLM-sourced text.
- CLAUDE.md: added Session Persistence Rules; created this SESSION_LOG.md; gitignored `backups/`, `dist_backup_*`, `src_snapshot_*`.

**Verified:** tsc clean (root + server, only the 10 pre-existing out-of-scope errors). Preview-screenshot verified: Property Pitch tab hero/price/stats/lifestyle/features sections, em-dash fix confirmed in rendered UI. Price Update Pitch end-to-end (slug generated, preview rendered, conditional sections correct).

**Deploy state:** `propos.addvantage.site` = Pages project `propos-demo`; the 967e2cc fix had been deployed to the WRONG project (`openhome-engine`), leaving the domain stale on `index-DNro47DU.js`. This session rebuilt dist and deployed to `propos-demo` production.

**Half-done / deferred (from PITCH_SUITE_PLAN.md):** bulk pitch generation + worker pool, regenerate (single + bulk), Digital Introduction / Listing Proposal templates, view-tracking Inbox badge (`v_pitch_views`), `property.addvantage.site` landing page (blocked on Cloudflare Pages project decision — plan open question #10), Tom Panos scripts carousel.

**Next step:** pick up the deferred Pitch Suite items above, starting with view-tracking Inbox badge or bulk generation.
