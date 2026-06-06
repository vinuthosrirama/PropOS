# AgentBox CRM Integration Plan — PropOS

**Status:** Design · Not yet implemented  
**Target:** Real-time two-way sync between PropOS vendor/buyer pipeline and AgentBox CRM

---

## 1. What AgentBox Is

AgentBox (now operating as **Reapit Sales ANZ**) is Australia's most widely-deployed real estate CRM. It manages:
- Vendor and buyer contacts
- Property listings and appraisals
- Open home and inspection registrations
- Campaign activity and email/SMS history
- Auction outcomes and settlement tracking

Cameron Knoll (Peake Real Estate) uses AgentBox as his primary CRM. PropOS currently imports his contact data via Google Sheets. A native AgentBox integration would eliminate manual exports, enable real-time signals, and let PropOS write outreach events back to the CRM.

---

## 2. API Access

### Credentials Required
| Field | Source |
|---|---|
| `X-Api-Key` | Issued per agency by AgentBox |
| `X-Client-Id` | Issued per agency by AgentBox |
| `X-Office-Id` | Agency office identifier |

**Base URL:** `https://api.agentboxcrm.com.au`  
**Format:** JSON REST  
**Auth:** All requests send headers `X-Api-Key`, `X-Client-Id`, `X-Office-Id`

### How to Get Access
1. Submit integrator application at **agentbox.com.au/integrator-application**
2. Email **salessupportanz@reapit.com** to request sandbox credentials
3. AgentBox reviews the integration for QA before issuing production keys
4. Timeline: typically 2–4 weeks for approval

### Rate Limits
Not publicly documented. Assume conservative defaults:
- ~100 requests/minute
- Bulk endpoints for list operations (page + limit params)
- Implement exponential back-off on 429 responses

---

## 3. Key Endpoints

Based on the community Node.js client (`github.com/nad-au/agentbox`) and known integration patterns:

### Contacts
```
GET  /contacts              # List all contacts (paginated)
GET  /contacts/{id}         # Single contact
POST /contacts              # Create contact
PUT  /contacts/{id}         # Update contact
GET  /contacts/{id}/related # Related contacts (spouse/partner)
```

**Contact fields:** name, phone, email, address, classification (buyer/vendor/landlord/tenant), notes, status, assignedAgent, enquirySource

### Properties / Listings
```
GET  /listings              # All listings
GET  /listings/{id}         # Single listing with full details
GET  /listings/{id}/images  # Property photos
PUT  /listings/{id}         # Update listing details
```

**Listing fields:** address, suburb, status (active/sold/appraisal), price, beds, baths, land, soldDate, soldPrice, agentId, campaignStart

### Appraisals
```
GET  /appraisals            # All appraisals
GET  /appraisals/{id}       # Single appraisal
POST /appraisals            # Create appraisal record
PUT  /appraisals/{id}       # Update appraisal (price, status, notes)
```

**Appraisal fields:** propertyAddress, estimatedValue, estimatedRange, agentId, contactId, followUpDate, status (pending/completed/listed)

### Activities / Events
```
GET  /activities            # Activity log
POST /activities            # Log an activity (call, email, SMS, note)
```

**Activity fields:** type, contactId, listingId, notes, channel (sms/email/phone), outcome, scheduledDate

### Open Homes / Inspections
```
GET  /inspections           # All inspection registrations
GET  /inspections/{listingId} # Attendees for a specific listing
```

**Inspection fields:** contactId, listingId, registeredAt, attended (bool), notes, buyerStatus

---

## 4. Proposed PropOS ↔ AgentBox Sync Architecture

### 4a. Read Path (AgentBox → PropOS)

**What PropOS pulls from AgentBox:**

| AgentBox data | PropOS use |
|---|---|
| Contacts (buyers/vendors) | Populate vendor portfolio + buyer CRM |
| Listing images | Show property photos in portfolio cards |
| Sold listings | Proof-of-performance for vendor outreach |
| Inspection attendees | Lead list for buyer matching |
| Appraisals | Pre-populate SLM data fields |
| Contact notes | Voice/CRM notes in vendor profile |

**Sync strategy:** Pull on login + polling every 15 minutes. Cache in `localStorage` with TTL. The existing `readPastBuyersFromSheet()` pattern can be replaced with an AgentBox fetch.

### 4b. Write Path (PropOS → AgentBox)

**What PropOS writes back to AgentBox:**

| PropOS action | AgentBox write |
|---|---|
| Outreach sent | `POST /activities` → type: email/sms, outcome: sent |
| Appraisal booked | `POST /appraisals` → status: pending, followUpDate |
| Voice note recorded | `PUT /contacts/{id}` → append to notes field |
| Lead status updated | `PUT /contacts/{id}` → update buyerStatus field |
| Sentiment answers | `PUT /contacts/{id}` → append structured note |
| Listing won | `PUT /appraisals/{id}` → status: listed |

---

## 5. Implementation Plan

### Phase 1 — Read-only sync (2–3 days)
Build a server-side proxy to avoid CORS and keep API keys off the client.

**New server endpoint: `GET /api/agentbox/contacts`**
```typescript
// server/routes/agentbox.ts
router.get('/contacts', async (req, res) => {
  const r = await fetch('https://api.agentboxcrm.com.au/contacts?limit=200', {
    headers: {
      'X-Api-Key':    process.env.AGENTBOX_API_KEY!,
      'X-Client-Id':  process.env.AGENTBOX_CLIENT_ID!,
      'X-Office-Id':  process.env.AGENTBOX_OFFICE_ID!,
      'Accept': 'application/json',
    }
  });
  const data = await r.json();
  res.json(mapAgentBoxContactsToPastBuyers(data.response.contacts));
});
```

**Mapper function:**
```typescript
function mapAgentBoxContactsToPastBuyers(contacts: AgentBoxContact[]): PastBuyer[] {
  return contacts
    .filter(c => c.classification === 'buyer' || c.classification === 'vendor')
    .map(c => ({
      id:             c.id,
      name:           `${c.firstName} ${c.lastName}`.trim(),
      phone:          c.mobile || c.phone,
      email:          c.email,
      purchaseAddress: c.propertyAddress || '',
      suburb:         c.suburb || '',
      purchaseDate:   c.purchaseDate || '',
      purchasePrice:  c.purchasePrice || 0,
      deposit:        0,
      propertyType:   'House',
      beds:           c.bedrooms || 3,
      baths:          c.bathrooms || 2,
      land:           c.landArea || 0,
      status:         c.classification === 'investor' ? 'investor' : 'owner_occupier',
      notes:          c.notes || '',
      lastContactDate: c.lastActivityDate || '',
      agentName:      c.assignedAgent?.name || '',
    }));
}
```

**Client-side change:** Replace `readPastBuyersFromSheet()` with `fetch('/api/agentbox/contacts')` when AgentBox is configured.

### Phase 2 — Write back activities (1 day)

**New server endpoint: `POST /api/agentbox/activity`**
```typescript
router.post('/activity', async (req, res) => {
  const { contactId, type, notes, channel } = req.body;
  await fetch('https://api.agentboxcrm.com.au/activities', {
    method: 'POST',
    headers: { /* auth headers */ },
    body: JSON.stringify({
      contactId,
      type,           // 'outreach_sent' | 'note' | 'appraisal_booked'
      notes,
      channel,        // 'sms' | 'email' | 'phone'
      agentId:        process.env.AGENTBOX_AGENT_ID,
      createdAt:      new Date().toISOString(),
    })
  });
  res.json({ ok: true });
});
```

Call this after every "Approve and Send" in the vendor review panel.

### Phase 3 — Property images (1–2 days)

Pull listing images from AgentBox and use them in `PropertySelectorCard`/`ActiveCard`:

```typescript
// Fetch images for a listing
const images = await fetch(`/api/agentbox/listings/${listingId}/images`);
// Map first image URL to property.image
```

This solves the missing-images problem permanently — images come from AgentBox live rather than static files in `/public/`.

### Phase 4 — Webhooks / real-time signals (future)

Once AgentBox grants webhook access, register for:
- `contact.updated` → refresh vendor/buyer data in PropOS
- `inspection.registered` → add new buyer lead to pipeline
- `listing.sold` → trigger "sold comp" alert for nearby contacts
- `appraisal.created` → sync appraisal into PropOS SLM

Webhook endpoint to add: `POST /api/agentbox/webhook` with HMAC signature verification.

---

## 6. Settings Integration (PropOS UI)

Add an "AgentBox" section to **Settings → Integrations** with:

```
[ ] Connect to AgentBox
    API Key:    [______________]
    Client ID:  [______________]  
    Office ID:  [______________]
    Agent ID:   [______________]
    [Test Connection]  [Save]
    Status: ● Connected — 88 contacts loaded (3 min ago)
```

Store credentials server-side in `.env` (never in localStorage). The health check endpoint at `/api/health` already reports integration status — add `agentbox: boolean` to the response.

---

## 7. Environment Variables

Add to `server/.env`:
```
AGENTBOX_API_KEY=your_api_key_here
AGENTBOX_CLIENT_ID=your_client_id_here
AGENTBOX_OFFICE_ID=your_office_id_here
AGENTBOX_AGENT_ID=your_agent_id_here   # Cameron's agent record ID
```

---

## 8. Testing Without Production Keys

Use the Node.js community client for local testing:
```bash
npm install agentbox --save-dev
```

Mock the API responses in Jest/Vitest using `msw` (Mock Service Worker) against the AgentBox base URL. The mapper functions can be unit-tested independently of API access.

---

## 9. Next Steps

1. **Vinuth submits integrator application** → agentbox.com.au/integrator-application
2. **Email Cameron** → ask him to request API credentials from his AgentBox account manager
3. **Build server proxy** (Phase 1) while waiting for credentials — use mock data
4. **Replace Google Sheets read path** with AgentBox read path once credentials arrive
5. **Wire write-back** after Phase 1 is stable

**Estimated total build time:** 5–7 dev days (Phases 1–3)  
**Timeline:** Can start Phase 1 immediately; production credentials gate Phase 3+

---

*Document created: June 2026 · PropOS by AddVantage*
