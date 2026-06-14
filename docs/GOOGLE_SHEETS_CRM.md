# Google Sheets CRM ↔ Supabase — Real-Time Sync Plan
*Planned 2026-06-14. Build when continuing from the sms-agent branch.*

---

## Why this exists

Supabase's table editor is good for one-off edits but bad for:
- Scanning many leads at once (no colour-coding, no sorting by score, narrow columns)
- Quickly ticking ready_to_contact for several people in a row
- Sharing read-only lead visibility with Cam or another team member without giving Supabase access

Google Sheets solves all three. The plan is a **real-time mirror**: every `sms_contacts` row appears
as a sheet row. Ticking the checkbox in the sheet triggers a live PATCH to Supabase.

---

## Architecture

```
sms_contacts (Supabase Postgres)
          │
          │  REST API (every 5 min + on-open)
          ▼
Apps Script Web App  ──►  SMS CRM tab (Google Sheets)
          │                    │
          │              checkbox ticked
          └───── onEdit ──────►│── PATCH sms_contacts.ready_to_contact → Supabase REST API
```

**Key constraints:**
- Supabase REST API URL (safe to store in Apps Script): `https://pzdcwulzteofvatjrtlh.supabase.co`
- Supabase anon key (read-only, safe in Apps Script): get from Supabase project settings → API
- Supabase service_role key (write access): store in Apps Script `PropertiesService.getScriptProperties()`
  NEVER hardcode it. The key Vinuth provided (`sbp_42...`) is a management token, not the service_role
  key — get the actual service_role key from: Supabase dashboard → Project Settings → API → service_role secret.
- Google Sheet ID: `1lsDviIB9guT-e9n4jKh1WJcuvBaMXGsLpXPLZNTSEBE`
- New tab name: `SMS CRM`

---

## `sold_properties` Supabase Table

To be created as a migration step in `server/lib/db.ts`. Allows SOLD_DB data to be read from
Supabase rather than only from the local Excel file.

```sql
CREATE TABLE IF NOT EXISTS sold_properties (
  id              SERIAL PRIMARY KEY,
  address         TEXT NOT NULL,
  suburb          TEXT NOT NULL,
  price           INTEGER,            -- sale price in AUD (integer, no currency symbol)
  sold_date       DATE,
  land_size       INTEGER,            -- m²
  bedrooms        INTEGER,
  bathrooms       INTEGER,
  car_spaces      INTEGER,
  days_on_market  INTEGER,
  agent_name      TEXT,
  agency_name     TEXT,
  domain_url      TEXT,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (address, sold_date)         -- idempotent scraper upsert key
);
CREATE INDEX IF NOT EXISTS idx_sold_suburb ON sold_properties(suburb);
CREATE INDEX IF NOT EXISTS idx_sold_date   ON sold_properties(sold_date DESC);
```

**Migration label:** `"CREATE sold_properties table"` — add to db.ts migrate steps array before
deploying. The SOLD_DB scraper can optionally write to this table via `--supabase` flag (future
enhancement).

---

## SMS CRM Tab — Column Layout

| Col | Field | Type | Notes |
|---|---|---|---|
| A | Name | text | from `sms_contacts.name` |
| B | Phone | text | E.164 format |
| C | Relationship | text | business_partner / close_friend / etc. |
| D | Stage | number | 1–4 |
| E | Status | text | active / opted_out / do_not_contact |
| F | Prospectability | number | 0-100 score |
| G | Interest | number | 0-100 score |
| H | Agency | text | from `rea_data.agency_name` |
| I | Target Suburbs | text | comma-joined `rea_data.target_suburbs` |
| J | Listings | number | `rea_data.currently_listing_count` |
| K | Recently Sold | text | `rea_data.recently_sold_address` |
| L | Last Contact | date | `sms_contacts.last_contact` |
| M | Attempts | number | |
| N | Follow Up At | date | `sms_contacts.follow_up_at` |
| O | **Ready to Contact** | checkbox | ✅ = PATCH `ready_to_contact=true` → fires opener |
| P | Conversation Objective | text | |
| Q | Supabase ID | number | hidden helper; used by onEdit to know which row to PATCH |

Column O is the action column. All others are read-only mirrors (sheet is the view; Supabase is the source of truth for everything except the checkbox signal).

---

## Apps Script Design

File to create: a new Apps Script project bound to the sheet (Extensions → Apps Script).

### `syncFromSupabase()` — called every 5 minutes + on `onOpen`

```javascript
function syncFromSupabase() {
  const SUPABASE_URL = 'https://pzdcwulzteofvatjrtlh.supabase.co'
  const SERVICE_KEY  = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY')
  
  const resp = UrlFetchApp.fetch(
    `${SUPABASE_URL}/rest/v1/sms_contacts?select=id,name,phone,relationship,stage,status,last_contact,follow_up_at,attempts,conversation_objective,rea_data`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  )
  
  const contacts = JSON.parse(resp.getContentText())
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SMS CRM')
  
  // Write header row if missing
  // Clear and rewrite data rows (preserve checkbox state in col O)
  // Sort by prospectability desc (computed client-side or read from a separate scores endpoint)
  // Protect cols A-N, P-Q from direct editing (view-only)
}
```

### `onEdit(e)` — fires on any cell edit

```javascript
function onEdit(e) {
  const sheet = e.source.getActiveSheet()
  if (sheet.getName() !== 'SMS CRM') return
  if (e.range.getColumn() !== 15) return  // col O = col 15
  if (e.value !== 'TRUE') return           // only fire on checkbox tick, not untick
  
  const rowData   = sheet.getRange(e.range.getRow(), 17, 1, 1).getValues()  // col Q = id
  const contactId = rowData[0][0]
  if (!contactId) return
  
  const SUPABASE_URL = 'https://pzdcwulzteofvatjrtlh.supabase.co'
  const SERVICE_KEY  = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY')
  
  UrlFetchApp.fetch(
    `${SUPABASE_URL}/rest/v1/sms_contacts?id=eq.${contactId}`,
    {
      method: 'PATCH',
      contentType: 'application/json',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ ready_to_contact: true })
    }
  )
  
  // Visual feedback: flash the checkbox cell green for 2 sec, then restore
  e.range.setBackground('#B7E1CD')
  SpreadsheetApp.flush()
  Utilities.sleep(2000)
  e.range.setBackground(null)
  
  // The 2-min ready-poller in PropOS server will pick this up and queue a draft.
  // The checkbox will auto-untick in the next syncFromSupabase() run (Supabase sets it back to false).
}
```

### Time-driven trigger
In Apps Script → Triggers: `syncFromSupabase` every 5 minutes (time-driven trigger). Also wire 
`onOpen` to call `syncFromSupabase()` once immediately on sheet open.

---

## Setup Steps (for the next Claude Code instance)

1. **Get the service_role key**
   - Supabase dashboard → Project Settings → API → service_role (reveal and copy)
   - DO NOT commit it anywhere. Save in Apps Script:
     `PropertiesService.getScriptProperties().setProperty('SUPABASE_SERVICE_KEY', '<key>')`

2. **Create the `SMS CRM` tab** in sheet `1lsDviIB9guT-e9n4jKh1WJcuvBaMXGsLpXPLZNTSEBE`
   - Set up column headers per the layout above
   - Format column O as a checkbox column

3. **Create the Apps Script** (Extensions → Apps Script) and paste/build `syncFromSupabase` + `onEdit`

4. **Deploy as Web App** (optional, for manual triggers from PropOS) or just rely on the 5-min trigger

5. **Wire the time-driven trigger** (5 min) + `onOpen` trigger

6. **Test:** Add a new `sms_contacts` row in Supabase → wait 5 min → confirm it appears in the sheet.
   Then tick the checkbox → confirm `ready_to_contact` flips to true in Supabase within seconds → PropOS
   poller picks it up → draft appears in the Voice tab.

7. **Add `sold_properties` migration** to `server/lib/db.ts` (SQL above), then migrate via the
   server startup or direct Supabase SQL editor.

---

## Existing Apps Script (reference — the old SOLD_DB sheet)

The existing Apps Script at sheet `1R7sUTgd4AscxdQWWhCuFx8jtpMZeAVcTjfr_E5q5kfk` handles the
SOLD_DB / property radar functions. The new SMS CRM sheet is a separate project. Do NOT modify the
old sheet script — it controls the property scraper data and must remain independent.

The existing script's key functions for reference:
- `updatePropertiesSheet()` — reads property_radar_v3.xlsx row data
- `getLatestSoldData()` — fetches sold properties
- `syncToSheet()` — writes formatted rows
These patterns are reusable for the new CRM sync but are separate implementations.

---

## Security notes

- **Supabase project ref** (`pzdcwulzteofvatjrtlh`) — safe to put in code/docs. It's just an ID.
- **Supabase anon key** — read-only, rate-limited. Relatively safe but keep in Apps Script properties,
  not hardcoded in public code.
- **Supabase service_role key** — grants full DB access. Treat like a password. Only in Apps Script
  PropertiesService, never in git, never in any tracked file.
- **Supabase management token** (`sbp_42...`) — this is for CLI/API management, NOT the DB service_role.
  Different key, different purpose. Get the service_role key from the Supabase dashboard under
  Project Settings → API.

---

*To continue this work: read this doc, then build `syncFromSupabase` + `onEdit` in Apps Script
for sheet `1lsDviIB9guT-e9n4jKh1WJcuvBaMXGsLpXPLZNTSEBE`. Also add the `sold_properties`
migration to `server/lib/db.ts` so SOLD_DB data can be queried from Supabase.*
