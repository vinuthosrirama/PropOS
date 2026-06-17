---
name: crm-seed
description: "Use when asked to add agents to AddVantage_CRM, refresh CRM data, research new SE Melbourne real estate agents for PropOS outreach, update the agents.json, or seed/upsert to Supabase. Triggers: 'add agents to CRM', 'find more agents', 'update CRM', 'seed the CRM', 'research agents', 'who should we pitch PropOS to', 'expand the CRM', 'new leads for outreach'."
metadata:
  author: addvantage
  version: "1.0.0"
---

# AddVantage CRM Seed Skill

This skill manages the `AddVantage_CRM` Supabase table — PropOS's B2B outreach pipeline of real estate agents to pitch to. Read `docs/ADDVANTAGE_CRM.md` first for full schema, agency coverage, and email patterns.

---

## Core Rules

1. **Never add Cameron Knoll or Manpreet Singh.** They are existing beta users. Check with `SELECT agent_name FROM "AddVantage_CRM" WHERE agent_name ILIKE '%Cameron%' OR agent_name ILIKE '%Manpreet%'` before declaring the run clean.
2. **Never fabricate phone numbers or emails.** If you can't find a real number, leave `null`. The `personalisation_hook` and `notes` fields are where you put uncertainty.
3. **Always compute `priority_score` using the formula in the docs.** Don't eyeball it.
4. **The UNIQUE(agent_name, agency_name) constraint means re-runs are safe.** Re-seeding the same agent just updates them — no duplicates.
5. **Verify the total row count after every seed run.** Print the top-10 table. If errors > 0, fix them before reporting done.

---

## Priority Score Formula

```
priority_score = min(8, floor(review_count / 5))
               + (1 if rating >= 4.5)
               + (1 if sold_12m >= 20)
               + (1 if active_listings >= 3)
```

**Score 8–10** → First-call targets. High volume + high reviews + quality-rated.
**Score 5–7** → Second wave. Strong in one or two dimensions.
**Score 1–4** → Email-only nurture. Emerging agents or thin public data.

---

## Research Workflow

When asked to find new agents:

### Step 1 — Identify gaps
```sql
SELECT primary_suburb, COUNT(*) as n
FROM "AddVantage_CRM"
GROUP BY primary_suburb
ORDER BY n DESC;
```
Target suburbs with zero or low coverage first: Dandenong, Clyde North, Pakenham, Hampton Park.

### Step 2 — Search for agents
Use WebSearch to find agents. Best search patterns:
- `"top real estate agents" "[suburb]" site:realestate.com.au`
- `"[suburb] real estate" "sold" 2024 2025 agent reviews`
- `"Premier Performer" OR "Elite Performer" "[suburb]" Ray White`
- `"[agency name] [suburb] team"` to get full office rosters

### Step 3 — Extract data from accessible sources
Priority order for each agent:
1. Agency website team page (phone numbers usually here)
2. Individual REA/Domain profile page via `__NEXT_DATA__` extraction (if URL known)
3. Franchise directory (raywhite.com, harcourts.net, barryplant.com.au)
4. WebFetch on personal agent website
5. WebSearch for `"[agent name]" "[agency]" phone email`

### Step 4 — Qualify each agent
Apply green/red flag checklist from `docs/ADDVANTAGE_CRM.md`. Skip agents who don't meet the bar.

### Step 5 — Build the JSON entry
```json
{
  "agent_name": "Full Name",
  "agency_name": "Agency Name",
  "agent_phone": "0400 000 000",
  "agent_email": null,
  "rating": 4.8,
  "review_count": 45,
  "active_listings": 4,
  "sold_12m": 22,
  "primary_suburb": "Suburb",
  "suburbs": "Suburb, Suburb2, Suburb3",
  "awards": "Award 2025/26",
  "rea_profile_url": null,
  "domain_profile_url": null,
  "years_experience": 10,
  "priority_score": 7,
  "personalisation_hook": "One-liner for cold outreach — specific stat or hook",
  "outreach_status": "prospect"
}
```

### Step 6 — Append to agents.json and seed

agents.json lives at:
```
/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/agents.json
```

Seed script lives at:
```
/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property/scripts/seed_addvantage_crm.mjs
```

```bash
cd "/Users/vinuthmacbook/Desktop/Vinuth's FINANCIALS/Property/Claude Property"
node scripts/seed_addvantage_crm.mjs agents.json
```

---

## Refreshing Existing Agent Data

When an agent's stats need updating (new sold count, updated rating):
1. Find the agent object in `agents.json` by name
2. Update the fields with fresh data
3. Recompute `priority_score`
4. Re-run `seed_addvantage_crm.mjs` — the UNIQUE constraint ensures it updates, not duplicates
5. Check the top-10 table output to confirm the change

---

## Outreach Status Updates

When Vinuth contacts an agent, update directly via SQL:

```sql
UPDATE "AddVantage_CRM"
SET outreach_status = 'contacted',
    last_contacted_at = NOW(),
    notes = 'Called [date] — [brief summary]'
WHERE agent_name = '[name]' AND agency_name = '[agency]';
```

Status flow: `prospect → contacted → replied → demo_booked → customer`

---

## Verification Checklist

After every seed run, confirm:

- [ ] `SELECT COUNT(*) FROM "AddVantage_CRM"` matches expected total
- [ ] Zero errors in seed script output
- [ ] No Cameron Knoll / Manpreet Singh present
- [ ] Top-10 table shows sensible priority ordering (high review counts at top)
- [ ] New agents appear with correct `priority_score`
- [ ] `outreach_status = 'prospect'` for all new entries (not null)

---

## Known Scraping Blockers

**DO NOT waste time on these — they are hard-blocked as of June 2026:**
- `realestate.com.au/find-agent` — Kasada JS challenge, 751-byte response, headless Playwright fully blocked
- `domain.com.au/find-agent` — `__NEXT_DATA__` returns `{statusCode, message}` only
- Most agency office homepages — return 403 to crawlers

**These WORK:**
- Individual REA/Domain agent profile pages (if you already have the URL)
- `raywhite.com` and `harcourts.net` franchise agent directories
- `barryplant.com.au`, `mcgrath.com.au`, `stockdaleleggo.com.au` team pages
- Peake Real Estate (`peakere.com.au`) team page
- WebSearch result snippets (Google often surfaces phone + review count in the snippet)

---

## Quick Reference: Agency Email Patterns

| Agency | Format |
|--------|--------|
| Stockdale & Leggo | `firstname.lastname@stockdaleleggo.com.au` |
| Ray White | `firstname.lastname@raywhite.com` |
| McGrath | `firstnamelastname@mcgrath.com.au` |
| OBrien Real Estate | `firstname.lastname@obrienrealestate.com.au` |
| Harcourts | `firstname.lastname@harcourts.net` |
| First National Neilson Partners | `f.lastname@neilsonpartners.com.au` |
| Century21 | `firstname.lastname@century21.com.au` |
| Peake Real Estate | office only: `reception@peakere.com.au` |

---

## Improving This Skill

When you discover new data sources, new working scrape patterns, or agency email formats that work, update both:
1. `docs/ADDVANTAGE_CRM.md` — the reference doc
2. This `SKILL.md` — the operational instructions

Keep the skill tightly coupled to what actually works, not what should work in theory.
