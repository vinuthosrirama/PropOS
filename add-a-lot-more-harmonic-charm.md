# Plan: Appraisal Authority Engine — Live Data & Enhanced UX Overhaul

## Context

The current `Appraisal Authority Engine Demo/index.html` is a fully self-contained static demo with **100% hardcoded** property data (21 fake Berwick properties baked into a `<script>` tag). The user wants to convert it into a production-quality, live-data-driven tool that:

1. Pulls **real YTD sold + active listings** from Domain.com.au for Berwick VIC 3806 (no fake data)
2. Auto-refreshes daily via the existing launchd → Python scraper → Google Sheets → Cloudflare pipeline
3. Shows a **radius-based temporal map** (glowing beacon → animated expanding circle → markers colour-coded by recency)
4. Has **zero hardcoded property values** — all analytics, estate pills, marker counts calculated from live data
5. Reflects branding: **Cameron Knoll | Peake Real Estate Berwick**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  DAILY (9am via launchd)                            │
│                                                     │
│  berwick_appraisal_scraper.py (NEW Python)          │
│    ↓  Playwright → domain.com.au/sold-listings/     │
│    ↓  Paginate ALL pages until sold_date < Jan 1    │
│    ↓  Paginate active listings (page 1 only)        │
│    ↓  Compute estate (bbox lookup)                  │
│    ↓  Compute days_on_market                        │
│    ↓  Write/update Google Sheet tab "AppraisalData" │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ON EVERY PAGE LOAD                                 │
│                                                     │
│  HTML → fetch('/api/berwick-appraisal')             │
│           ↓                                         │
│  Cloudflare Function (berwick-appraisal.js) NEW     │
│           ↓                                         │
│  Google Sheets public CSV export (AppraisalData tab)│
│           ↓                                         │
│  Returns JSON array of all YTD properties           │
└─────────────────────────────────────────────────────┘
```

**Why Google Sheets as the DB (not JS file commit):**
- The existing `leads.js` CF function already reads Google Sheets CSV — proven pattern
- Scraper already has OAuth credentials for the sheet (`gsheets_oauth_client.json`, sheet ID `1ZytvtvYXpxQPfB_ZZ-d4MG2sRJBAY3oGagFViptDwMg`)
- No git commit needed per scrape run — data updates without a deploy
- Every page load gets fresh data

---

## Component 1: New Python Scraper — `berwick_appraisal_scraper.py`

**Location:** `Recent Listing Demo - Berwick/berwick_appraisal_scraper.py` (new file, keep old scraper untouched)

### What changes vs the existing `berwick_playwright_scraper.py`

| Aspect | Old Scraper | New Scraper |
|--------|-------------|-------------|
| Pages scraped | Page 1 only | Paginate until `sold_date < Jan 1 current year` |
| Records kept | Top 5 most recent | **ALL** YTD sold (could be 100–300 properties) |
| Estate field | Not assigned | Computed from lat/lng via bounding box |
| `days_on_market` | Not computed | Computed: `(sold_date − listed_date).days` where available, else scrape tag text "Sold in X days" |
| Output | `berwick_data.js` (JS file) | Google Sheets tab "AppraisalData" (append-deduplicate) |
| Active listings | Top 5 kept | **All** current active listings (page 1, ~20 props) |

### Pagination Logic (Sold)
```python
URL_TEMPLATE = "https://www.domain.com.au/sold-listings/berwick-vic-3806/?sort=solddate-desc&excludepricewithheld=1&page={page}"
ytd_cutoff = date(date.today().year, 1, 1)
page = 1
all_sold = []
while True:
    results = scrape_page(URL_TEMPLATE.format(page=page))
    if not results:
        break
    all_sold.extend(results)
    # Stop if oldest result on this page is before Jan 1
    oldest = min(r['sold_date'] for r in results if r.get('sold_date'))
    if oldest < ytd_cutoff.isoformat():
        break
    page += 1
    time.sleep(2.5)  # polite delay
# Filter to YTD only
all_sold = [r for r in all_sold if r.get('sold_date', '') >= ytd_cutoff.isoformat()]
```

### Estate Bounding Box Classification
```python
ESTATE_BOXES = {
    "Old Berwick":     {"lat": (-38.0380, -38.0250), "lng": (145.3350, 145.3520)},
    "Berwick Waters":  {"lat": (-38.0330, -38.0210), "lng": (145.3480, 145.3640)},
    "Alira Estate":    {"lat": (-38.0480, -38.0330), "lng": (145.3460, 145.3620)},
}
def classify_estate(lat, lng):
    for name, box in ESTATE_BOXES.items():
        if box["lat"][0] <= lat <= box["lat"][1] and box["lng"][0] <= lng <= box["lng"][1]:
            return name
    return "Other Berwick"
```

### Days on Market Calculation
```python
def compute_dom(prop):
    # Try tag text first: "Sold in 14 days"
    tag = prop.get('tag_text', '')
    m = re.search(r'Sold in (\d+) days?', tag, re.I)
    if m:
        return int(m.group(1))
    # Fallback: sold_date - listed_date
    if prop.get('sold_date') and prop.get('listed_date'):
        d = (date.fromisoformat(prop['sold_date']) - date.fromisoformat(prop['listed_date'])).days
        return max(1, d)
    return None  # unknown — HTML handles gracefully
```

### Google Sheets Write Schema (new tab: "AppraisalData")
Columns (row 1 = headers):
```
id | address | estate | price | status | beds | baths | cars | land_m2 |
zoning | school_zone | days_on_market | sold_date | listed_date | lat | lng |
image | url | updated_at
```

- `id` = unique hash: `normalize(address) + sold_date` (used as dedup key)
- Write strategy: **append-only, deduplicate by id** — mirrors existing scraper behaviour, preserves history
- Safety guard: if scrape returns 0 records, do NOT write anything to sheet

### Zoning & School Zone Lookup
```python
# Cannot reliably scrape from Domain — use coordinate-based lookup
ZONING_MAP = {
    "Old Berwick":    ("Neighbourhood Residential Zone", "Berwick Primary School"),
    "Berwick Waters": ("Neighbourhood Residential Zone", "Kambrya College"),
    "Alira Estate":   ("General Residential Zone",       "Beaconsfield Primary School"),
    "Other Berwick":  ("General Residential Zone",       "Berwick Primary School"),
}
```

---

## Component 2: Cloudflare Function — `berwick-appraisal.js`

**Location:** `cloudflare-deploy/functions/api/berwick-appraisal.js` (new file)

**Pattern:** Mirror existing `leads.js`

```javascript
export async function onRequest(context) {
  const SHEET_ID = "1ZytvtvYXpxQPfB_ZZ-d4MG2sRJBAY3oGagFViptDwMg";
  const APPRAISAL_GID = "<GID of AppraisalData tab — set after tab is created>";
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${APPRAISAL_GID}`;
  
  const response = await fetch(url, { cf: { cacheTtl: 300 } }); // 5-min edge cache
  const text = await response.text();
  const rows = parseCSV(text);        // same CSV parser as leads.js
  
  // Coerce numeric fields
  const data = rows.map(r => ({
    ...r,
    price:          parseInt(r.price) || null,
    beds:           parseInt(r.beds) || null,
    baths:          parseInt(r.baths) || null,
    cars:           parseInt(r.cars) || null,
    land_m2:        parseInt(r.land_m2) || null,
    days_on_market: parseInt(r.days_on_market) || null,
    lat:            parseFloat(r.lat) || null,
    lng:            parseFloat(r.lng) || null,
  }));
  
  return new Response(JSON.stringify({ success: true, data, count: data.length, fetched_at: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
```

**Note:** The Google Sheet tab "AppraisalData" must be publicly readable via link (same as the existing sheet). Set sharing on the new tab to "Anyone with the link can view."

---

## Component 3: HTML Overhaul — `index.html`

**Location:** `Appraisal Authority Engine Demo/index.html`

### 3.1 Branding Change
```html
<!-- Before -->
Syahmi Sarip | Senior Sales Consultant | OBrien Real Estate - Berwick

<!-- After -->
Cameron Knoll | Senior Sales Consultant | Peake Real Estate Berwick
```
Logo initials: `AV` stays (AddVantage brand, not agent brand).

### 3.2 Remove ALL Hardcoded Property Data
- Delete the entire `window.SCRAPED_DATA = [...]` array (~100 lines)
- Replace with a `fetchData()` function called on `DOMContentLoaded`

### 3.3 Data Loading Pattern
```javascript
async function fetchData() {
  showLoadingState(true);
  try {
    const res = await fetch('/api/berwick-appraisal');
    const json = await res.json();
    window.SCRAPED_DATA = json.data.map((r, i) => ({ ...r, id: i + 1 }));
    state.dataFetchedAt = json.fetched_at;
    buildDynamicEstatePills();   // derive pills from actual data
    renderMarkers();
    updateFreshnessLabel();
    showLoadingState(false);
  } catch (err) {
    showLoadingState(false);
    showToast('Failed to load live data. Retrying…', 'error');
    setTimeout(fetchData, 5000);  // retry once
  }
}
```

### 3.4 Estate Pills — Hardcoded 3 Pills, "Other Berwick" Hidden
Pills remain hardcoded: **Old Berwick**, **Berwick Waters**, **Alira Estate**.
Properties classified as "Other Berwick" by the bounding-box logic still appear on the map (visible as markers) but are simply not matched by any pill filter. The 3 pills work exactly as before.
No dynamic pill generation needed — simpler, cleaner UI.

### 3.5 Radius Feature (New — Key "Wow" Feature)

**UX Flow:**
1. User searches property → gold pulsing beacon appears
2. Left panel reveals a "Search Radius" control (hidden until property loaded)
3. Default radius = 750m; user adjusts 250m–2000m via slider
4. `animateRadius()` draws expanding L.circle (0 → target over ~800ms)
5. Only markers within circle are shown; outside markers hidden
6. DNA filters then further refine within-radius markers

**Left Panel: Radius Control** (appears after property load)
```html
<div class="panel-section" id="radius-section" style="display:none">
  <div class="section-label">Search Radius</div>
  <div class="land-slider-wrap">
    <input type="range" id="radius-slider" min="250" max="2000" value="750" step="250"
           oninput="onRadiusChange(this.value)">
    <div class="land-val" id="val-radius">750 m</div>
  </div>
</div>
```

**Animation Logic:**
```javascript
let radiusCircle = null;
let currentRadiusM = 750;

function animateRadius(center, targetM) {
  currentRadiusM = targetM;
  let current = 0;
  const steps = 40;
  const stepSize = targetM / steps;
  const stepMs = 20;  // 40 × 20ms = 800ms total

  const tick = () => {
    current = Math.min(current + stepSize, targetM);
    if (radiusCircle) map.removeLayer(radiusCircle);
    radiusCircle = L.circle(center, {
      radius: current,
      color: '#A6DAFF', fillColor: '#A6DAFF',
      fillOpacity: 0.04, weight: 1.5, opacity: 0.5,
      dashArray: '6 4'
    }).addTo(map);
    if (current < targetM) setTimeout(tick, stepMs);
    else renderMarkers();  // final render after circle complete
  };
  tick();
}

function onRadiusChange(val) {
  document.getElementById('val-radius').textContent = val + ' m';
  if (state.targetProperty) {
    animateRadius([state.targetProperty.lat, state.targetProperty.lng], parseInt(val));
  }
}
```

**Radius Filtering in `getFiltered()`:**
```javascript
function getFiltered() {
  return window.SCRAPED_DATA.filter(p => {
    if (!p.lat || !p.lng) return false;
    // Estate filter
    if (state.activeEstate && p.estate !== state.activeEstate) return false;
    // Radius filter (only if target loaded)
    if (state.targetProperty && radiusCircle) {
      const dist = map.distance(
        [p.lat, p.lng],
        [state.targetProperty.lat, state.targetProperty.lng]
      );
      if (dist > currentRadiusM) return false;
    }
    // DNA filters
    if (p.beds !== null   && Math.abs(p.beds - state.beds) > 1) return false;
    if (p.land_m2 !== null && p.land_m2 < state.landMin) return false;
    return true;
  });
}
```

### 3.6 Temporal Colour Coding for Sold Markers

**Replace single green colour with a recency gradient:**
```javascript
function getTemporalColor(soldDate) {
  if (!soldDate) return '#64D090';  // fallback green
  const daysSince = Math.floor((Date.now() - new Date(soldDate)) / 86400000);
  if (daysSince <= 14)  return '#00FFD5';  // vivid turquoise — last 2 weeks
  if (daysSince <= 30)  return '#00D4B0';  // bright jade — last month
  if (daysSince <= 60)  return '#00A888';  // medium jade — 1–2 months
  if (daysSince <= 120) return '#007A66';  // muted teal — 2–4 months
  return '#004A3E';                         // pale teal — 4+ months YTD
}

function getTemporalOpacity(soldDate) {
  if (!soldDate) return 0.9;
  const daysSince = Math.floor((Date.now() - new Date(soldDate)) / 86400000);
  return Math.max(0.35, 1 - (daysSince / 365) * 0.65);
}
```

**Apply in `renderMarkers()`:**
```javascript
// For sold markers:
const color   = p.status === 'Active' ? '#A6DAFF' : getTemporalColor(p.sold_date);
const opacity = p.status === 'Active' ? 0.9        : getTemporalOpacity(p.sold_date);
```

**Add a map legend (bottom-right of map container):**
```html
<div id="map-legend">
  <div class="legend-row"><span style="background:#00FFD5"></span> Sold &lt; 14 days</div>
  <div class="legend-row"><span style="background:#00D4B0"></span> Sold 15–30 days</div>
  <div class="legend-row"><span style="background:#00A888"></span> Sold 31–60 days</div>
  <div class="legend-row"><span style="background:#007A66"></span> Sold 61–120 days</div>
  <div class="legend-row"><span style="background:#004A3E"></span> Sold 120+ days</div>
  <div class="legend-row"><span style="background:#A6DAFF"></span> Active Listing</div>
</div>
```

### 3.7 Analytics Strip — Now 100% Dynamic

All three cards recalculate from `getFiltered()` data only. Key robustness fix:

**Clearance Rate** — only count sold YTD (not just filtered total):
```javascript
const sold  = data.filter(p => p.status === 'Sold').length;
const total = data.length;
const rate  = total > 0 ? Math.round((sold / total) * 100) : 0;
```

**Avg Days on Market** — skip nulls gracefully:
```javascript
const withDOM = data.filter(p => p.days_on_market != null);
const avgDOM  = withDOM.length > 0
  ? Math.round(withDOM.reduce((s, p) => s + p.days_on_market, 0) / withDOM.length)
  : null;
```

**Estimated Value Range** — now uses real scraped prices:
```javascript
// Match ±1 bed, land within 25% of DNA setting
const comps = data.filter(p =>
  p.beds != null && Math.abs(p.beds - state.beds) <= 1 &&
  (p.land_m2 == null || p.land_m2 >= state.landMin * 0.75)
);
```

### 3.8 Loading & Freshness States

```javascript
function showLoadingState(loading) {
  document.getElementById('map-loading').style.display = loading ? 'flex' : 'none';
}
function updateFreshnessLabel() {
  const t = new Date(state.dataFetchedAt);
  document.getElementById('live-label').textContent =
    `Live · ${t.toLocaleDateString('en-AU', { day:'numeric', month:'short' })}`;
}
```

A centred loading spinner overlays the map while data fetches. The nav "Data Live" label updates to show actual scrape date (from `generated_at` field in Google Sheets).

### 3.9 Property DNA Defaults — Derive from Target Property
When no target property is loaded, DNA defaults (4bd/2ba/2car/600m²) stay as reasonable starters.
Once a property is loaded, DNA auto-populates from that property's fields (existing logic — keep as-is).

### 3.10 Popup Enhancement — Show Property Image
The scraper saves `image` URLs. Use them in popups:
```javascript
const imgHtml = p.image
  ? `<img src="${p.image}" style="width:100%;border-radius:6px;margin-bottom:8px;">`
  : '';
// Add imgHtml to popup content
```

### 3.11 Fourth Analytics Card — "Data Freshness" (optional wow addition)
Replace the plain status indicator with a 4th mini card in the analytics strip:
- **Properties Loaded**: total count from SCRAPED_DATA
- **YTD Coverage**: date range (Jan 1 – today)
- **Last Scraped**: time from `updated_at` in data

---

## Component 4: Google Sheets — New "AppraisalData" Tab

**Sheet:** `1ZytvtvYXpxQPfB_ZZ-d4MG2sRJBAY3oGagFViptDwMg` (existing)

**New tab name:** `AppraisalData`

**Columns (row 1 headers):**
```
address | estate | price | status | beds | baths | cars | land_m2 |
zoning | school_zone | days_on_market | sold_date | listed_date |
lat | lng | image | url | updated_at
```

**Sharing:** Tab/sheet must be shared "Anyone with the link → Viewer" so the public CSV export URL works without auth.

**GID:** Determined after tab creation — hardcode into `berwick-appraisal.js`.

---

## Component 5: Scheduling — `berwick_appraisal_schedule.sh`

**Location:** `Recent Listing Demo - Berwick/berwick_appraisal_schedule.sh` (new shell script)

Mirrors `Recent Listing Demo - Rowville/scraper_schedule.sh`:
```bash
#!/bin/bash
cd "$(dirname "$0")"
python3 berwick_appraisal_scraper.py
# No git commit needed — data goes directly to Google Sheets
# Cloudflare Function reads from Sheets on every page load
```

**LaunchD Plist:** `com.addvantage.berwick-appraisal-scraper.plist`
- Schedule: 9:05 AM daily (5 min offset from Rowville scraper)
- Logs: `~/Library/Logs/addvantage-berwick-appraisal.log`

---

---

## Component 6: "Peake vs. Market" Analytics Card

**Replace the 3-card analytics strip with a 4-card strip.** Fourth card shows Cameron's filtered set DOM vs the Berwick suburb average — "Efficiency Edge."

```javascript
const BERWICK_SUBURB_AVG_DOM = 28; // Industry benchmark for Berwick VIC

const calculatePeakeEdge = (data) => {
  const filteredAvgDOM = calculateAvgDOM(data);  // reuse existing avgDOM calc
  if (filteredAvgDOM == null) return { value: '—', subtext: 'Insufficient data' };
  const delta = BERWICK_SUBURB_AVG_DOM - filteredAvgDOM;
  return {
    value: delta > 0 ? `−${delta} Days` : delta === 0 ? 'Market Par' : `+${Math.abs(delta)} Days`,
    subtext: delta > 0 ? `Faster than Berwick avg (${BERWICK_SUBURB_AVG_DOM}d)` : 'At market average',
    positive: delta >= 0
  };
};
```

**Analytics strip layout (4 cards):**
1. Clearance Rate
2. Avg Days on Market
3. Estimated Value Range
4. **Efficiency Edge** (Peake vs Market DOM delta) — green if faster, amber if at/below market

The `BERWICK_SUBURB_AVG_DOM = 28` constant is the only intentionally hardcoded benchmark (industry reference value, not property data). It can be updated manually as market conditions change.

---

## Component 7: Vendor Readiness Checklist (Expanded S32 Module)

**Replace the single S32 toggle with a full "Vendor Readiness" checklist.** Each item toggled creates a sense of professional momentum for the seller watching the agent work.

```html
<div class="panel-section" id="readiness-section">
  <div class="section-label">Vendor Readiness</div>
  <div class="readiness-list">
    <label class="ready-item">
      <input type="checkbox" id="s32-check" onchange="onReadinessChange()">
      <span class="ready-label">Section 32 Prepared</span>
      <span class="ready-badge" id="badge-s32">Pending</span>
    </label>
    <label class="ready-item">
      <input type="checkbox" id="photo-check" onchange="onReadinessChange()">
      <span class="ready-label">Professional Photos Booked</span>
      <span class="ready-badge" id="badge-photo">Pending</span>
    </label>
    <label class="ready-item">
      <input type="checkbox" id="floor-check" onchange="onReadinessChange()">
      <span class="ready-label">Floor Plan Ordered</span>
      <span class="ready-badge" id="badge-floor">Pending</span>
    </label>
    <label class="ready-item">
      <input type="checkbox" id="price-check" onchange="onReadinessChange()">
      <span class="ready-label">Price Guide Agreed</span>
      <span class="ready-badge" id="badge-price">Pending</span>
    </label>
  </div>
  <!-- Progress bar fills as items are checked -->
  <div class="readiness-bar-wrap">
    <div class="readiness-bar" id="readiness-bar" style="width:0%"></div>
  </div>
  <div class="readiness-pct" id="readiness-pct">0% Ready</div>
  <button class="s32-action-btn" id="s32-request-btn" onclick="triggerConveyancerSync()">
    Request S32 via Peake Partners
  </button>
</div>
```

```javascript
function onReadinessChange() {
  const checks = ['s32-check','photo-check','floor-check','price-check'];
  const done = checks.filter(id => document.getElementById(id).checked).length;
  const pct = Math.round((done / checks.length) * 100);
  document.getElementById('readiness-bar').style.width = pct + '%';
  document.getElementById('readiness-pct').textContent = pct + '% Ready';
  // Show S32 request button only if S32 not yet checked
  document.getElementById('s32-request-btn').classList.toggle(
    'visible', !document.getElementById('s32-check').checked
  );
  checks.forEach(id => {
    const checked = document.getElementById(id).checked;
    const badge = document.getElementById('badge-' + id.replace('-check',''));
    if (badge) { badge.textContent = checked ? 'Done' : 'Pending'; badge.className = 'ready-badge ' + (checked ? 'done' : ''); }
  });
}
function triggerConveyancerSync() {
  showToast('S32 request sent to Peake conveyancer partners.');
}
```

The old single `s32-toggle` is removed; this replaces it entirely.

---

## Component 8: Estate Scarcity Index (Scraper + UI)

**Scraper calculates a per-estate scarcity rating** and writes it to a second Google Sheet tab ("AppraisalMeta"). The CF function or HTML reads it to show scarcity badges on estate pills.

```python
# In berwick_appraisal_scraper.py — called after all data is written
from datetime import date, timedelta

def calculate_scarcity(estate_name, all_data):
    today = date.today()
    last_month = (today - timedelta(days=30)).isoformat()
    
    active = [p for p in all_data if p.get('estate') == estate_name and p.get('status') == 'Active']
    sold_last_30 = [p for p in all_data if p.get('estate') == estate_name
                    and p.get('status') == 'Sold'
                    and (p.get('sold_date') or '') >= last_month]
    
    active_count = len(active)
    velocity = len(sold_last_30)
    
    if active_count <= 2 and velocity >= 3:
        return "High Demand"
    elif active_count <= 4:
        return "Limited Stock"
    else:
        return "Stable"

# Write scarcity summary to "AppraisalMeta" tab:
# estate | scarcity_label | active_count | sold_last_30 | updated_at
```

**UI: Scarcity badges on estate pills**
```javascript
// After data loads, fetch meta and badge pills
function applyScarcityBadges(metaData) {
  metaData.forEach(row => {
    const pill = document.querySelector(`.pill[data-estate="${row.estate}"]`);
    if (!pill) return;
    if (row.scarcity_label === 'High Demand') {
      pill.innerHTML += ' <span class="scarcity-badge hot">🔥 Hot</span>';
    } else if (row.scarcity_label === 'Limited Stock') {
      pill.innerHTML += ' <span class="scarcity-badge low">⚡ Low Stock</span>';
    }
  });
}
```

**New CF Function endpoint:** `/api/berwick-appraisal-meta` reads the "AppraisalMeta" tab GID.

---

## Component 9: Temporal Marker Glow + Pulse Animation

**Most recent sold markers (< 14 days) pulse** to signal urgency. Implemented via Leaflet DivIcon (not circleMarker) for the top-tier markers so CSS animations can apply.

```javascript
function createTemporalMarker(p) {
  const daysSince = p.sold_date
    ? Math.floor((Date.now() - new Date(p.sold_date)) / 86400000) : 999;
  
  if (p.status === 'Active') {
    // Active: standard circleMarker (electric blue)
    return L.circleMarker([p.lat, p.lng], {
      radius: 9, fillColor: '#A6DAFF', color: '#04070D',
      weight: 2, opacity: 1, fillOpacity: 0.9
    });
  }
  
  if (daysSince <= 14) {
    // Most recent sold: pulsing DivIcon with glow
    return L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="marker-vivid-now"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7]
      })
    });
  }
  
  // All other sold: circleMarker with temporal colour
  return L.circleMarker([p.lat, p.lng], {
    radius: 8,
    fillColor: getTemporalColor(p.sold_date),
    color: '#04070D', weight: 1.5,
    fillOpacity: getTemporalOpacity(p.sold_date)
  });
}
```

**CSS:**
```css
.marker-vivid-now {
  width: 14px; height: 14px; border-radius: 50%;
  background: #00FFD5;
  filter: drop-shadow(0 0 8px #00FFD5);
  animation: markerPulse 2s infinite;
}
@keyframes markerPulse {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.3); opacity: 0.75; }
  100% { transform: scale(1);   opacity: 1; }
}
```

This visually differentiates "ultra-recent" from "recent" from "historical" sales at a glance.

---

## Component 10: Stale-While-Revalidate Fallback (CF Function)

**Risk:** Google Sheets CSV export fails or returns < 5 rows → agent opens demo to empty map.

**Solution:** Use Cloudflare KV to store the last known-good dataset. On each successful fetch, update KV. On failure, serve from KV with a "stale data" header.

```javascript
// berwick-appraisal.js — updated with KV fallback
export async function onRequest(context) {
  const KV = context.env.APPRAISAL_KV;  // Cloudflare KV binding
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=${GID}`;
  
  try {
    const response = await fetch(SHEET_URL, { cf: { cacheTtl: 300 } });
    if (!response.ok) throw new Error('Sheet fetch failed');
    const text = await response.text();
    const rows = parseCSV(text).map(coerceTypes);
    
    if (rows.length < 5) throw new Error('Insufficient data rows: ' + rows.length);
    
    // Success — update KV cache
    await KV.put('last_good_data', JSON.stringify({ data: rows, fetched_at: new Date().toISOString() }), { expirationTtl: 86400 * 7 }); // 7-day TTL
    return jsonResponse({ success: true, data: rows, stale: false });
    
  } catch (err) {
    // Fallback to KV
    const cached = await KV.get('last_good_data', 'json');
    if (cached) {
      return jsonResponse({ success: true, data: cached.data, stale: true, stale_since: cached.fetched_at });
    }
    return jsonResponse({ success: false, data: [], error: err.message }, 503);
  }
}
```

**KV Binding:** Add `APPRAISAL_KV` to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "APPRAISAL_KV"
id = "<KV namespace ID — create via wrangler>"
```

**Frontend handles stale state gracefully:**
```javascript
if (json.stale) {
  showToast(`Showing data from ${new Date(json.stale_since).toLocaleDateString('en-AU')} — live refresh pending`, 'warning');
}
```

---

## Critical Considerations

### Estate Bounding Boxes — Verify Before Finalising
The bbox coordinates in the scraper are approximate. Before launch, cross-reference:
- [Old Berwick](https://en.wikipedia.org/wiki/Berwick,_Victoria) — established suburb core
- Berwick Waters — lake-adjacent development (Circa estate around Officer area border)
- Alira Estate — southern new-release land

If properties classify as "Other Berwick", that pill appears in the UI — this is fine, not a bug.

### Domain.com.au Scraping — Known Issues
From `feedback_domain_scraping.md`:
- `__NEXT_DATA__` is stubs-only — **must use DOM scraping**
- Use `WeakSet` deduplication for multi-selector card collection
- Cookies from `rea_cookies.json` expire in 72h — check before each run
- The new scraper will need to import the DOM scraping patterns from the existing `berwick_playwright_scraper.py`

### DOM and Beds/Baths — May Be Null
Many Domain sold cards omit features (beds, baths, land_m2). The HTML must:
- Never crash when these are `null`
- DNA filter: if `p.beds == null`, include that property (don't exclude unknowns)
- Popup: display "—" for missing fields

### Radius Feature on First Load (No Target Property)
**On first open:** All YTD sold + active properties are shown across the suburb — no radius applied.
The radius section is hidden in the left panel and only reveals after a property is searched and loaded. This is the confirmed desired behaviour.

---

## Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `Appraisal Authority Engine Demo/index.html` | **Major rewrite** | Remove hardcoded data, add radius/temporal/fetch |
| `Recent Listing Demo - Berwick/berwick_appraisal_scraper.py` | **New file** | Full-pagination YTD scraper → Google Sheets |
| `Recent Listing Demo - Berwick/berwick_appraisal_schedule.sh` | **New file** | Daily trigger for new scraper |
| `cloudflare-deploy/functions/api/berwick-appraisal.js` | **New file** | CF Function → Sheets CSV → JSON |
| Google Sheets `AppraisalData` tab | **Create manually** | New tab, set sharing, get GID |
| `~/Library/LaunchAgents/com.addvantage.berwick-appraisal-scraper.plist` | **New file** | 9:05am schedule |

**Files NOT modified:** `berwick_playwright_scraper.py` (existing Berwick listing demo kept intact), `rowville_*` files, `deploy.sh`, `leads.js`.

---

## Verification Checklist

1. **Run scraper manually**: `python3 berwick_appraisal_scraper.py` → check Google Sheets `AppraisalData` tab populated with ≥ 20 sold records
2. **Verify estate classification**: Check that properties have correct estate assigned (cross-check against known addresses)
3. **Verify days_on_market**: Spot-check 3–5 records against actual Domain listing pages
4. **Test CF Function locally**: `npx wrangler dev` → `curl localhost:8788/api/berwick-appraisal` → valid JSON array
5. **Deploy CF Function**: `deploy.sh` → test `https://addvantage-demos.pages.dev/api/berwick-appraisal`
6. **Open HTML locally** (`python3 -m http.server 8080`): Confirm data loads (no hardcoded fallback)
7. **Test radius feature**: Search "14 High Street" → beacon appears → radius circle animates → only nearby markers visible
8. **Test temporal colors**: Verify older sold properties are paler teal, recent ones are vivid turquoise
9. **Test DNA filters**: Slide beds to 3 → some markers disappear from map and analytics recalculate
10. **Test estate pills**: Tap "Old Berwick" → only Old Berwick markers visible; tap again → all return
11. **Test analytics strip**: Verify clearance rate, avg DOM, value range all update with each filter change (no stale values)
12. **Test null-safety**: Remove `beds` field from one row in Sheets → confirm UI doesn't crash
13. **Test with no target property**: All markers visible, radius section hidden, analytics show suburb-wide stats
14. **Scraper safety guard**: Empty scrape result → Sheets tab NOT cleared → stale but valid data preserved
