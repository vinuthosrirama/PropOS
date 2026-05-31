#!/usr/bin/env python3
"""
PropOS — Domain.com.au Property Estimate Scraper
Scrapes current estimated value for each CRM property address.
Uses Domain property-profile pages → extracts Domain Estimate range.
"""

import json, re, time
from playwright.sync_api import sync_playwright

# ── Suburb postcodes ─────────────────────────────────────────────────────────
POSTCODES = {
    "berwick": "3806",
    "narre warren south": "3805",
    "narre warren": "3805",
    "hampton park": "3976",
    "hallam": "3803",
    "officer": "3809",
    "pakenham": "3810",
    "clyde north": "3978",
    "cranbourne": "3977",
}

# ── CRM addresses ─────────────────────────────────────────────────────────────
PROPERTIES = [
    {"id": 5001, "address": "8 Thirlmere Court",    "suburb": "Berwick"},
    {"id": 5002, "address": "14 Whitecliffe Way",   "suburb": "Berwick"},
    {"id": 5003, "address": "22 Birchwood Drive",   "suburb": "Berwick"},
    {"id": 5004, "address": "18 Ascot Rise",        "suburb": "Berwick"},
    {"id": 5005, "address": "7 Heritage Court",     "suburb": "Berwick"},
    {"id": 5006, "address": "11 Yemaya Place",      "suburb": "Berwick"},
    {"id": 5007, "address": "52 Timbertop Drive",   "suburb": "Berwick"},
    {"id": 5008, "address": "3 Sundance Boulevard", "suburb": "Narre Warren South"},
    {"id": 5009, "address": "Unit 6/88 High Street","suburb": "Berwick"},
    {"id": 5010, "address": "29 Donalds Road",      "suburb": "Narre Warren"},
    {"id": 6001, "address": "71 Broadway Street",   "suburb": "Hampton Park"},
    {"id": 6002, "address": "15 Chelmsford Drive",  "suburb": "Hampton Park"},
    {"id": 6003, "address": "45 Seattle Crescent",  "suburb": "Hallam"},
    {"id": 7001, "address": "6 Creekwood Rise",     "suburb": "Berwick"},
    {"id": 7002, "address": "17 Windward Crescent", "suburb": "Berwick"},
    {"id": 7003, "address": "42 Delfin Drive",      "suburb": "Berwick"},
    {"id": 7004, "address": "54 Jack William Way",  "suburb": "Berwick"},
    {"id": 7005, "address": "21 Hartsmere Drive",   "suburb": "Berwick"},
]

# ── URL builder ───────────────────────────────────────────────────────────────
def to_slug(address: str, suburb: str) -> str:
    """Convert address + suburb to Domain URL slug."""
    suburb_lower = suburb.lower()
    postcode = POSTCODES.get(suburb_lower, "3806")

    # Handle unit format: "Unit 6/88 High Street" → "6-88-high-street"
    addr = address.lower().strip()
    addr = re.sub(r'^unit\s+', '', addr)       # remove "unit "
    addr = re.sub(r'[/\\]', '-', addr)          # 6/88 → 6-88
    addr = re.sub(r'[^a-z0-9\-\s]', '', addr)  # strip special chars
    addr = re.sub(r'\s+', '-', addr.strip())    # spaces → hyphens

    suburb_slug = re.sub(r'\s+', '-', suburb_lower)
    return f"{addr}-{suburb_slug}-vic-{postcode}"

def domain_profile_url(address: str, suburb: str) -> str:
    return f"https://www.domain.com.au/property-profile/{to_slug(address, suburb)}"

# ── Value extractor ───────────────────────────────────────────────────────────
def parse_dollar(text: str) -> int | None:
    """Parse '$1.05M' or '$880K' → int."""
    text = text.strip().replace(',', '')
    m = re.search(r'\$?([\d.]+)\s*([MmKk]?)', text)
    if not m:
        return None
    val = float(m.group(1))
    suffix = m.group(2).upper()
    if suffix == 'M':
        return int(val * 1_000_000)
    elif suffix == 'K':
        return int(val * 1_000)
    elif val > 100_000:
        return int(val)
    return None

def midpoint(lo: int | None, hi: int | None) -> int | None:
    if lo and hi:
        return (lo + hi) // 2
    return lo or hi

def extract_estimate(page) -> dict:
    """Try multiple selectors to find Domain Estimate on the profile page."""
    result = {"low": None, "high": None, "mid": None, "raw": None, "source": None}

    # 1. Look for Domain Estimate range text: "$850K – $935K"
    range_patterns = [
        r'\$[\d,.]+[MmKk]?\s*[–\-—to]+\s*\$[\d,.]+[MmKk]?',
    ]
    page_text = page.inner_text("body")
    for pat in range_patterns:
        m = re.search(pat, page_text)
        if m:
            raw = m.group(0)
            parts = re.split(r'[–\-—to]+', raw)
            if len(parts) == 2:
                lo = parse_dollar(parts[0])
                hi = parse_dollar(parts[1])
                if lo and hi and lo > 100_000:
                    result.update({"low": lo, "high": hi, "mid": midpoint(lo, hi), "raw": raw, "source": "range"})
                    return result

    # 2. Look for single estimate like "Estimated value $920,000"
    single = re.search(r'[Ee]stimate[d\s:]*\$?([\d,.]+[MmKk]?)', page_text)
    if single:
        val = parse_dollar(single.group(1))
        if val and val > 100_000:
            result.update({"low": val, "high": val, "mid": val, "raw": single.group(0), "source": "single"})
            return result

    # 3. Look for "Domain Estimate" heading + nearby value
    try:
        estimate_els = page.query_selector_all('[data-testid*="estimate"], [class*="estimate"], [class*="Estimate"]')
        for el in estimate_els:
            txt = el.inner_text()
            val = parse_dollar(txt)
            if val and val > 100_000:
                result.update({"low": val, "high": val, "mid": val, "raw": txt.strip(), "source": "element"})
                return result
    except:
        pass

    return result

# ── Main scraper ─────────────────────────────────────────────────────────────
def scrape_all():
    results = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
            locale="en-AU",
        )
        page = context.new_page()

        # Dismiss cookie banners etc
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        for prop in PROPERTIES:
            pid   = prop["id"]
            addr  = prop["address"]
            suburb = prop["suburb"]
            url   = domain_profile_url(addr, suburb)

            print(f"\n[{pid}] {addr}, {suburb}")
            print(f"  URL: {url}")

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                time.sleep(2)  # let JS render

                # Check if we landed on a valid property profile (not 404/redirect)
                title = page.title()
                current_url = page.url

                if "not found" in title.lower() or "404" in title:
                    print(f"  ✗ 404 — trying search fallback")
                    est = search_fallback(page, addr, suburb)
                else:
                    est = extract_estimate(page)

                if est["mid"]:
                    print(f"  ✓ Estimate: {est['raw']} → mid=${est['mid']:,}")
                    results[pid] = {
                        "address": f"{addr}, {suburb}",
                        "low": est["low"],
                        "high": est["high"],
                        "mid": est["mid"],
                        "raw": est["raw"],
                        "source": est["source"],
                        "url": current_url,
                    }
                else:
                    print(f"  ✗ No estimate found (title: {title[:60]})")
                    results[pid] = {
                        "address": f"{addr}, {suburb}",
                        "low": None, "high": None, "mid": None,
                        "raw": None, "source": "not_found",
                        "url": current_url,
                    }

            except Exception as e:
                print(f"  ✗ Error: {e}")
                results[pid] = {
                    "address": f"{addr}, {suburb}",
                    "low": None, "high": None, "mid": None,
                    "raw": str(e)[:80], "source": "error",
                    "url": url,
                }

            time.sleep(1.5)  # polite delay between requests

        browser.close()

    return results

def search_fallback(page, address: str, suburb: str) -> dict:
    """Search Domain for the address if direct profile URL fails."""
    query = f"{address} {suburb} VIC"
    search_url = f"https://www.domain.com.au/sold-listings/?q={query.replace(' ', '+')}&mode=address"
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=15_000)
        time.sleep(2)
        # Try clicking first result
        first = page.query_selector('[data-testid="listing-card-wrapper-premiumplus"], [class*="listing-card"]')
        if first:
            first.click()
            time.sleep(2)
            return extract_estimate(page)
    except:
        pass
    return {"low": None, "high": None, "mid": None, "raw": None, "source": "search_failed"}

# ── Run & save ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("PropOS — Domain.com.au Property Estimate Scraper")
    print("=" * 60)

    results = scrape_all()

    # Save full results
    out_path = "scripts/estimate_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n\nFull results saved to {out_path}")

    # Print summary table
    print("\n" + "=" * 60)
    print(f"{'ID':<6} {'Address':<35} {'Estimate':<20} {'Range'}")
    print("-" * 60)
    found = 0
    for pid, data in sorted(results.items()):
        if data["mid"]:
            found += 1
            lo = f"${data['low']:,}" if data['low'] else "?"
            hi = f"${data['high']:,}" if data['high'] else "?"
            mid = f"${data['mid']:,}"
            rng = f"{lo} – {hi}" if lo != hi else ""
            print(f"{pid:<6} {data['address'][:34]:<35} {mid:<20} {rng}")
        else:
            print(f"{pid:<6} {data['address'][:34]:<35} {'(not found)':<20}")

    print(f"\n{found}/{len(results)} properties valued")

    # Generate TypeScript update for pastBuyers.ts
    print("\n\n── TypeScript CURRENT_VALUE_ESTIMATES update ──")
    print("// Paste these values into src/data/pastBuyers.ts")
    for pid, data in sorted(results.items()):
        if data["mid"]:
            note = f"  // {data['address']} — Domain estimate {data['raw']}"
            print(f"  {pid}: {data['mid']},{note}")
        else:
            print(f"  // {pid}: no estimate found for {data['address']}")
