# Box+Dice MCP Server

MCP server for the **Box+Dice** (MRI Software) real estate CRM. Gives Claude direct access to contacts, listings, leads, tasks, and open home attendance data from your Box+Dice account.

---

## What it does

Once connected, Claude can:

- **Read contacts** — full records with buying criteria, suburb preferences, budget range, notes
- **Create contacts** — add a new buyer/vendor directly from a conversation
- **Read & create leads** — appraisal pipeline with temperature (hot/warm/cold)
- **Read listings** — all active, under offer, and sold sales listings + rentals
- **Read open home attendees** — inspection_attendances for any listing
- **Read & create tasks** — follow-up actions for any contact
- **Read buyer notes** — notes from inspections
- **List consultants** — all agents in the office (needed for IDs when creating records)

---

## Prerequisites

1. A Box+Dice subscription (MRI Software)
2. Your agency subdomain — e.g. if your CRM is at `myagency.boxdice.com.au`, the domain is `myagency`
3. An API key — generate one inside Box+Dice: **Settings → Integrations → API Keys**

---

## Quick start (dev mode)

```bash
cd mcp-boxdice
npm install
BOXDICE_DOMAIN=youragency BOXDICE_API_KEY=your-key npm run dev
```

---

## Connect to Claude Desktop

Add this block to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "boxdice": {
      "command": "node",
      "args": ["/Users/YOUR_NAME/Desktop/Claude/AddVantageOS/REA Agents/BidGenerator/mcp-boxdice/dist/index.js"],
      "env": {
        "BOXDICE_DOMAIN": "youragency",
        "BOXDICE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Then restart Claude Desktop. You'll see the hammer icon — Box+Dice tools are live.

---

## Connect to Claude Code

Add to your project's `.mcp.json` or run:

```bash
claude mcp add boxdice -- node /path/to/mcp-boxdice/dist/index.js
```

Then set env vars in your shell before starting Claude Code:

```bash
export BOXDICE_DOMAIN=youragency
export BOXDICE_API_KEY=your-api-key
```

---

## Available tools (17 total)

| Tool | What it does |
|---|---|
| `boxdice_list_contacts` | Paginated contact list |
| `boxdice_get_contact` | Full contact by ID (incl. criteria, notes) |
| `boxdice_create_contact` | Add a new buyer/vendor |
| `boxdice_update_contact` | Update contact fields |
| `boxdice_get_contact_activities` | Call/email/SMS history for a contact |
| `boxdice_get_contact_buyer_notes` | Inspection notes for a contact |
| `boxdice_get_contact_tasks` | Pending follow-ups for a contact |
| `boxdice_get_contact_owned_properties` | Properties owned by a contact |
| `boxdice_list_sales_listings` | All sales listings (active + sold) |
| `boxdice_list_rental_listings` | All rental listings |
| `boxdice_list_appraisal_leads` | Vendor/landlord pipeline |
| `boxdice_create_appraisal_lead` | Create a new appraisal lead |
| `boxdice_list_tasks` | All office tasks |
| `boxdice_create_task` | Schedule a follow-up |
| `boxdice_list_inspection_attendances` | Open home attendees |
| `boxdice_list_consultants` | All agents (for IDs) |
| `boxdice_list_properties` | All properties |

---

## Pagination

All `list_*` tools return:

```json
{
  "items": [...],
  "nextCursor": "1520452907_37"
}
```

Pass `nextCursor` as the `after` parameter to get the next page. When `nextCursor` is `null`, you've reached the end.

---

## Rate limits

Box+Dice enforces per-endpoint rate limits and returns `429 Too Many Requests` with a `Retry-After` header. The client throws an error on 429 — Claude will back off naturally by spacing requests.

---

## PropOS integration

The Box+Dice CSV export auto-detection in `PortfolioView.tsx` (columns: `First Name`, `Last Name`, `Mobile`, `Email`, `Property Address`, `Budget`, `Stage`, `Notes`) maps directly to the contact fields this MCP returns. Future upgrade: replace CSV import with live `boxdice_list_inspection_attendances` → `boxdice_get_contact` calls so PropOS always has fresh data.
