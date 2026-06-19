---
name: provision-agent-demo
description: Provision a personalised PropOS demo for a new REA agent. Parses a pasted agent profile, creates the JSON data file, runs the provision script, and prints the demo login URL.
tools: Read, Write, Edit, Bash
---

# Provision Agent Demo

Use this skill when Vinuth pastes a new real estate agent's profile and says "provision a demo for them" or similar.

## What you'll need from the user

1. Agent's **full name** and **agency name**
2. Their **sold listings** (address, suburb, price, beds/baths, sold date, lead count)
3. Their **active listing** (address, suburb, price range, beds/baths, open date if known)
4. Their **brand colours** (primary hex + accent hex, or just primary if you can look it up from their website)
5. Their **bio** (from REA profile or agency website)
6. Any **reviews** they have (from REA profile)

If anything is missing, use sensible defaults:
- Brand colour: look up their agency website and extract the dominant hex. If unavailable, use `#1a1a1a` (dark professional).
- Lead count: default 8 per sold listing
- Active listing open date: use "TBD"

## Steps

### Step 1 — Create the data file

Create `scripts/agent-data/<slug>.json` where `<slug>` is `firstname-lastname` kebab-case (e.g. `anthony-abeysena`).

Use this structure:
```json
{
  "name": "First Last",
  "agency": "Agency Name",
  "agency_short": "2-3 char abbreviation",
  "email": "firstname@agencyslug.com.au",
  "phone": null,
  "suburb": "Home suburb",
  "state": "VIC",
  "tagline": "Short tagline from profile",
  "years_exp": 5,
  "bio": "Bio text from profile",
  "reviews": ["Review 1", "Review 2", "Review 3"],
  "brand": {
    "primary": "#hex",
    "accent": "#hex",
    "logo": "2-3 chars",
    "gradient": ["#hex1", "#hex2"]
  },
  "sold_listings": [
    {
      "address": "123 Street",
      "suburb": "Suburb",
      "postcode": "3xxx",
      "price": 750000,
      "beds": 4, "baths": 2, "cars": 2,
      "type": "House",
      "sold_date": "DD Mon YYYY",
      "lead_count": 12
    }
  ],
  "active_listings": [
    {
      "address": "456 Avenue",
      "suburb": "Suburb",
      "postcode": "3xxx",
      "price": 720000,
      "price_min": 700000,
      "price_max": 740000,
      "beds": 4, "baths": 2, "cars": 2,
      "type": "House",
      "open_date": "TBD"
    }
  ]
}
```

### Step 2 — Run the provisioner

```bash
cd "/Users/vinuthmacbook/Desktop/Claude/AddVantageOS/REA Agents/PropOS"
npx tsx scripts/provision-agent.ts <slug>
```

Expected output:
```
Provisioning: First Last @ Agency Name
Email: firstname@agency.com.au
  ✓ Agent upserted (id=X)
  ✓ N listings inserted (N sold + N active)
  Generating SLM for N listings via Haiku...
    SLM 1/N: 123 Street
    ...
  ✓ SLM generated
  ✓ 10 demo buyers cloned
  ✓ Voice profile seeded

  Demo ready: https://propos.addvantage.site?agent=firstname@agency.com.au
  Login with: firstname@agency.com.au
```

### Step 3 — Verify

Tell Vinuth:
> Demo provisioned for [Name]. Log in at https://propos.addvantage.site with `firstname@agency.com.au`. You'll see their [N] sold listings, 10 demo buyers assigned to those listings, and the brand appears in [brand colour]. Voice is cloned from Cameron at 35% confidence — calibrate after the demo by pasting real texts.

## Troubleshooting

**"agent upserted but 0 buyers cloned"** — the buyers already exist for this agent. Run `npx tsx scripts/provision-agent.ts <slug>` again after deleting the sms_contacts manually, or it's fine — idempotent.

**"voice_profiles insert skipped"** — the voice_profiles table schema doesn't have all columns yet. Not fatal — the demo will use Cameron's hardcoded voice as fallback.

**"SLM generation skipped — no ANTHROPIC_API_KEY"** — add `ANTHROPIC_API_KEY` to `server/.env` for Haiku SLM generation. The demo will still work — matching just uses address/suburb/beds/baths.

## Notes on brand colours

- 5th Avenue Real Estate: `#e1b530` (gold from site CSS), dark bg `#1a1a1a`
- Peake: `#3b1f77` (purple)
- Area Specialist: `#111111` (black)
- Most boutique agencies: check their website CSS with browser devtools → inspect `.bg-primary` or `--color-primary`
