# AddVantage CRM — B2B Agent Outreach

PropOS's pipeline for identifying and reaching SE Melbourne real estate agents who would benefit most from AI follow-up automation.

---

## What This Is

`AddVantage_CRM` is a Supabase table (not a contacts CRM — that's `PropOS_democontacts`). It's Vinuth's B2B sales pipeline: agents to pitch PropOS to. Each row is a prospective **agency customer**, not an end consumer.

**Current state:** 51 agents across 16 SE Melbourne agencies. Cameron Knoll and Manpreet Singh are existing beta users and are excluded.

---

## Database Schema

**Table:** `AddVantage_CRM` — Supabase project `pzdcwulzteofvatjrtlh` (ap-northeast-1)

Connection string is stored in `scripts/seed_addvantage_crm.mjs`. Do not commit passwords to this file.

```sql
CREATE TABLE "AddVantage_CRM" (
  id                  SERIAL PRIMARY KEY,
  agent_name          TEXT NOT NULL,
  agency_name         TEXT,
  agent_phone         TEXT,                        -- direct mobile preferred; office as fallback
  agent_email         TEXT,                        -- firstname.lastname@agency.com.au pattern
  rating              DECIMAL(2,1),                -- REA/Domain star rating (out of 5)
  review_count        INTEGER DEFAULT 0,           -- total reviews across platforms
  active_listings     INTEGER DEFAULT 0,           -- live listings right now
  sold_12m            INTEGER DEFAULT 0,           -- properties sold in last 12 months
  primary_suburb      TEXT,                        -- strongest suburb
  suburbs             TEXT,                        -- comma-separated coverage area
  awards              TEXT,                        -- e.g. "Premier Performer 2025/26; Elite Performer"
  rea_profile_url     TEXT,
  domain_profile_url  TEXT,
  years_experience    INTEGER,
  outreach_status     TEXT DEFAULT 'prospect',     -- prospect | contacted | replied | demo_booked | customer
  priority_score      INTEGER,                     -- 1–10, see formula below
  personalisation_hook TEXT,                       -- one-liner for cold outreach copy
  notes               TEXT,                        -- freeform conversation notes
  last_contacted_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_name, agency_name)
);
```

---

## Priority Score Formula

```
priority_score = min(8, floor(review_count / 5))
               + (1 if rating >= 4.5)
               + (1 if sold_12m >= 20)
               + (1 if active_listings >= 3)
```

Score range: 1–10. Agents scoring **8–10** are first-call targets. **5–7** are second wave. Below 5 are email-only nurture.

### Why these signals
- **Review count** — the biggest weight. Reviews reflect consistent volume and client trust. An agent with 100+ reviews has been doing this for years; they feel the pain of missed follow-ups.
- **Sold volume** — 20+ per year means regular pipeline. If PropOS saves even 3 deals/yr from better follow-up, the ROI case is obvious.
- **Active listings** — current listings = current buyer leads to convert. The AI is useful *right now*, not hypothetically.
- **Star rating** — quality-focused agents want quality tools. A 4.5★+ agent is more likely to care about professional follow-up tone and less likely to already be using generic blast-SMS tools.

---

## What to Look For When Researching New Leads

### Green flags — add them
- 15+ sold in 12 months — enough volume that follow-up gaps cost them deals
- 4.5★ or above — they're quality-focused; PropOS aligns with their brand
- Multiple suburbs covered — more buyer leads to manage, higher AI value
- Director or principal role — decision-maker, faster to close
- Awards (Premier Performer, Elite Performer, Top 100 Agent) — proven producers
- Boutique or independent agencies — less likely to have corporate CRM mandated
- Multilingual agents — servicing diverse communities, harder to automate manually
- Solo operators with no admin support — AI follow-up is pure leverage for them

### Red flags — deprioritise or skip
- Under 5 sold/yr — too small to justify PropOS cost
- Property managers (not sales agents) — different workflow, not a fit
- Large corporate branches with mandated enterprise CRM — harder sale, longer cycle
- Agents who joined < 12 months ago — too early; still building their client base
- No public phone or email anywhere — unreachable for cold outreach

---

## Where to Find Agent Data

| Source | What you get | Reliability |
|--------|-------------|-------------|
| REA individual agent profile page | ratings, reviews, sold count, active listings, suburbs | High |
| Domain individual agent profile page | same as REA | High |
| Agency website team page | full roster + direct mobiles | High — usually accessible |
| Ray White / Harcourts franchise directories | award tiers, production rankings | High |
| Elite Agent magazine rankings | Top 100 lists, state rankings, sold volume | High |
| Agent's personal website | email, bio, career history | Medium |
| Google Maps reviews | star rating, review count cross-check | Medium |
| LinkedIn | email format, career history | Low (usually no direct contact) |

### Scraping blockers (as of June 2026)
- **REA `find-agent` pages** — return a 751-byte Kasada JS challenge to headless Playwright. Blocked even with stealth UA, locale, and timezone.
- **Domain `find-agent` pages** — `__NEXT_DATA__` only returns `{statusCode, message}`.
- **Most agency office homepages** — LJ Hooker, Harcourts, OBrien, Ray White Berwick return 403.

### What still works
- **Individual REA/Domain agent profile pages** — if you have the slug URL, `__NEXT_DATA__` extraction works (same pattern as `scraper/rea.py` for listing pages).
- **Agency team pages** — Peake Real Estate, Barry Plant Berwick, Stockdale & Leggo, McGrath all return team rosters with phone numbers.
- **WebSearch + WebFetch** — search `"agent name" "agency" site:raywhite.com` or `"phone" agent suburb`. Franchise directories (raywhite.com, harcourts.net) are generally accessible.

---

## agents.json Format

The seed script (`scripts/seed_addvantage_crm.mjs`) reads `agents.json`. Each entry maps directly to CRM columns. Extra fields are silently ignored.

```json
{
  "agent_name": "Gavin Staindl",
  "agency_name": "Ray White Pakenham & Officer",
  "agent_phone": "0424 227 134",
  "agent_email": null,
  "rating": 4.9,
  "review_count": 210,
  "active_listings": 18,
  "sold_12m": 207,
  "primary_suburb": "Pakenham",
  "suburbs": "Pakenham, Officer, Beaconsfield, Clyde North",
  "awards": "Premier Business Leader 2025/26; #1 Ray White Victoria by volume",
  "rea_profile_url": "https://www.raywhite.com/gavin-staindl/...",
  "domain_profile_url": null,
  "years_experience": 15,
  "priority_score": 10,
  "personalisation_hook": "207 sold in 12 months · #1 Ray White VIC · Pakenham/Officer specialist",
  "outreach_status": "prospect"
}
```

### Seed command

```bash
# From the Claude Property scraper workspace:
node scripts/seed_addvantage_crm.mjs agents.json

# Output: inserted / updated / errors + top 10 by priority
# UNIQUE(agent_name, agency_name) makes re-runs safe — no duplicates
```

To update a single agent (new phone, refreshed sold count), edit that object in `agents.json` and re-run. It updates, not duplicates.

---

## Email Address Patterns by Agency

Most agents don't publish email publicly. These patterns are confirmed or highly likely:

| Agency | Email format | Confirmed |
|--------|-------------|-----------|
| Stockdale & Leggo | `firstname.lastname@stockdaleleggo.com.au` | Yes |
| Ray White | `firstname.lastname@raywhite.com` | Yes |
| McGrath | `firstnamelastname@mcgrath.com.au` | Yes |
| OBrien Real Estate | `firstname.lastname@obrienrealestate.com.au` | Yes |
| First National Neilson Partners | `f.lastname@neilsonpartners.com.au` | Yes |
| Harcourts | `firstname.lastname@harcourts.net` | Yes (via ZoomInfo) |
| Barry Plant Berwick | `firstname@barryplantberwick.com.au` | Unconfirmed |
| Peake Real Estate | Use office: `reception@peakere.com.au` | No individual emails public |
| Elite Agents & Partners | `firstname.lastname@eliteagents.net.au` | Unconfirmed |
| Century21 | `firstname.lastname@century21.com.au` | Yes |

---

## Current Agency Coverage (June 2026)

| Agency | Agents | Top priority |
|--------|--------|--------------|
| Peake Real Estate | 10 | Kristen Turner, Marisa Adams (Directors) |
| Barry Plant Berwick | 8 | Matt Ketteringham, Dan O'Loughlin (MDs) |
| OBrien Real Estate | 7 | Dean O'Brien, Darren Hutchings (Co-Founders) |
| Stockdale & Leggo | 5 | Keith Sloan (1,000+ career sales) |
| Elite Agents & Partners | 4 | Eddie Atahi |
| Harcourts Berwick | 3 | Katrina Bartlett (113 reviews), Brad Nicholls |
| First National Neilson Partners | 2 | Matt Clark (Director) |
| Ray White Narre Warren | 2 | Javid Zada (80 sold/yr, Elite Performer) |
| Ray White Pakenham & Officer | 2 | Gavin Staindl (207 sold/yr, #1 Ray White VIC) |
| LJ Hooker Berwick | 2 | Robert Harvey (32 years) |
| Ray White Berwick | 1 | Sam Noorbakhsh (Premier Performer 2×) |
| Agent X Real Estate | 1 | Robert Petelinek (Founder) |
| Ray White Cranbourne | 1 | Mark Guthrie (CEO, 50-agent team) |
| YPA Estate Agents Cranbourne | 1 | Saqib Khanzawar |
| McGrath Estate Agents Berwick | 1 | Ali Aboucham (Director, 20+ yrs) |
| Century21 Property Specialists | 1 | Patrick Emini |

### Suburbs with no coverage yet (next expansion)
- **Dandenong / Dandenong South** — try YPA Dandenong, Ray White Dandenong, Harcourts Dandenong
- **Clyde / Clyde North** — search Professionals, Raine & Horne, boutique agencies
- **Pakenham deeper** — Harcourts Pakenham, First National Pakenham
- **Hampton Park / Lyndhurst / Hallam** — Barry Plant Hallam, Ray White Hallam

---

## Outreach Status Lifecycle

```
prospect → contacted → replied → demo_booked → customer
```

Update after each touchpoint:

```sql
UPDATE "AddVantage_CRM"
SET outreach_status = 'contacted',
    last_contacted_at = NOW(),
    notes = 'Called 16 Jun — left voicemail'
WHERE agent_name = 'Gavin Staindl';
```

---

## Related Files

| File | Purpose |
|------|---------|
| `scraper/rea_agents.py` | Playwright agent scraper (individual profile pages work; find-agent blocked) |
| `scripts/seed_addvantage_crm.mjs` | Node.js upsert script — reads agents.json, upserts to Supabase |
| `agents.json` (in Claude Property workspace) | Source data for 51 current agents |
| `docs/ADDVANTAGE_CRM.md` | This file |
