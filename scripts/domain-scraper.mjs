#!/usr/bin/env node
/**
 * Domain.com.au listing scraper for PropOS
 *
 * Usage:
 *   node scripts/domain-scraper.mjs [--agent "Cameron Knoll"] [--dry-run]
 *
 * What it does:
 *   1. Fetches current listings from Domain.com.au for the configured agent
 *   2. Compares against the stored listings snapshot (domain-listings.json)
 *   3. Detects status changes: active → sold (via auction date or sold flag)
 *   4. Outputs a diff report: new listings, status changes, removals
 *   5. Writes an updated snapshot to scripts/domain-listings.json
 *
 * Outputs:
 *   - scripts/domain-listings.json  → full listing snapshot (upsert-safe)
 *   - stdout                        → human-readable diff report
 *
 * Requirements:
 *   - No extra npm packages needed (uses built-in fetch, available in Node 18+)
 *   - Domain API key (optional — public search endpoints work without key)
 *
 * Environment:
 *   DOMAIN_API_KEY   — optional Domain developer API key for higher rate limits
 *   DOMAIN_AGENT_ID  — optional Domain agent ID to filter by agent
 */

import { readFileSync, writeFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_PATH = resolve(__dirname, "domain-listings.json")
const DRY_RUN = process.argv.includes("--dry-run")

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Target suburbs to scrape (Domain slug format)
  suburbs: [
    "berwick-vic-3806",
    "narre-warren-south-vic-3805",
    "hampton-park-vic-3976",
    "cranbourne-north-vic-3977",
    "clyde-north-vic-3978",
    "officer-vic-3809",
    "pakenham-vic-3810",
    "hallam-vic-3803",
    "endeavour-hills-vic-3802",
    "rowville-vic-3178",
  ],

  // Filter: max price in $
  maxPrice: 1_500_000,
  // Filter: min land area in sqm (0 = no filter)
  minLand: 0,
  // How many days back to consider a sold listing "recent" comparable
  recentSoldDays: 180,

  // Domain API base
  apiBase: "https://api.domain.com.au/v1",
  // Domain search base (scraping fallback — no API key needed)
  searchBase: "https://www.domain.com.au",

  // Peake agency Domain ID (update if known)
  agencyId: process.env.DOMAIN_AGENCY_ID ?? null,
  agentId: process.env.DOMAIN_AGENT_ID ?? null,
  apiKey: process.env.DOMAIN_API_KEY ?? null,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DomainListing
 * @property {string}  id               — Domain listing ID
 * @property {string}  address          — "34 Hartsmere Drive"
 * @property {string}  suburb           — "Berwick"
 * @property {string}  state            — "VIC"
 * @property {string}  postcode         — "3806"
 * @property {number}  price            — Sold price or guide midpoint
 * @property {number|null} priceMin     — Price guide min
 * @property {number|null} priceMax     — Price guide max
 * @property {number}  beds
 * @property {number}  baths
 * @property {number}  cars
 * @property {number|null} land         — sqm
 * @property {"active"|"sold"|"auction"} status
 * @property {string|null} soldDate     — ISO date if sold
 * @property {string|null} auctionDate  — ISO date if upcoming auction
 * @property {string|null} image        — primary photo URL
 * @property {string[]} images          — all photo URLs
 * @property {string}  listingUrl       — full Domain URL
 * @property {string}  scrapedAt        — ISO timestamp
 */

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchDomainAPI(path, params = {}) {
  if (!CONFIG.apiKey) return null  // Fall back to HTML scraping

  const url = new URL(`${CONFIG.apiBase}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))

  const res = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": CONFIG.apiKey,
      "Accept": "application/json",
    },
  })
  if (!res.ok) return null
  return res.json()
}

/**
 * Scrape Domain search results page (HTML parsing, no API key required).
 * Domain embeds listing data as JSON-LD and in `data-testid` attributes.
 */
async function scrapeSuburbListings(suburbSlug, status = "sale") {
  const url = `${CONFIG.searchBase}/${status}/${suburbSlug}/`
  console.log(`  Fetching: ${url}`)

  let html
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    })
    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} for ${url}`)
      return []
    }
    html = await res.text()
  } catch (err) {
    console.warn(`  ⚠ Fetch error for ${url}: ${err.message}`)
    return []
  }

  const listings = []

  // 1. Try JSON-LD extraction (most reliable)
  const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []
  for (const block of jsonLdMatches) {
    try {
      const inner = block.replace(/<script[^>]*>/, "").replace("</script>", "").trim()
      const data = JSON.parse(inner)
      if (Array.isArray(data)) {
        for (const item of data) {
          const listing = parseJsonLdListing(item, status)
          if (listing) listings.push(listing)
        }
      } else {
        const listing = parseJsonLdListing(data, status)
        if (listing) listings.push(listing)
      }
    } catch {}
  }

  // 2. Try __NEXT_DATA__ / window.__data__ extraction
  const nextDataMatch = html.match(/window\.__listing_search_data\s*=\s*(\{[\s\S]*?\});/) ??
                        html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (nextDataMatch && listings.length === 0) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const cards = extractNestedListings(data)
      listings.push(...cards.map(c => parseGenericListing(c, status)).filter(Boolean))
    } catch {}
  }

  console.log(`  → Found ${listings.length} listings in ${suburbSlug} (${status})`)
  return listings
}

function parseJsonLdListing(item, status) {
  if (!item || typeof item !== "object") return null
  if (item["@type"] !== "SingleFamilyResidence" && item["@type"] !== "House" && item["@type"] !== "Residence") {
    if (!item.address) return null
  }

  const address = item.address ?? {}
  const price = extractPrice(item.offers?.price ?? item.price ?? "")
  const now = new Date().toISOString()

  return {
    id: item.identifier ?? item["@id"] ?? `domain_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    address: [item.streetAddress, address.streetAddress].find(Boolean) ?? "",
    suburb: [item.addressLocality, address.addressLocality].find(Boolean) ?? "",
    state: [item.addressRegion, address.addressRegion].find(Boolean) ?? "VIC",
    postcode: [item.postalCode, address.postalCode].find(Boolean) ?? "",
    price: price ?? 0,
    priceMin: null,
    priceMax: null,
    beds: Number(item.numberOfRooms ?? item.numberOfBedrooms ?? 0),
    baths: Number(item.numberOfBathroomsTotal ?? 0),
    cars: Number(item.numberOfParkingSpaces ?? 0),
    land: item.floorSize?.value ? Number(item.floorSize.value) : null,
    status: status === "sold" ? "sold" : "active",
    soldDate: status === "sold" ? (item.dateSold ?? now.slice(0, 10)) : null,
    auctionDate: item.eventDate ?? null,
    image: item.image ?? (Array.isArray(item.photo) ? item.photo[0]?.url : null),
    images: Array.isArray(item.photo) ? item.photo.map(p => p.url ?? p) : [],
    listingUrl: item.url ?? "",
    scrapedAt: now,
  }
}

function parseGenericListing(item, status) {
  if (!item || !item.address) return null
  const now = new Date().toISOString()
  return {
    id: String(item.id ?? item.listingId ?? `domain_${Date.now()}`),
    address: item.address?.street ?? item.address ?? "",
    suburb: item.address?.suburb ?? item.suburb ?? "",
    state: item.address?.state ?? "VIC",
    postcode: item.address?.postcode ?? "",
    price: extractPrice(item.price ?? item.displayPrice ?? ""),
    priceMin: item.priceDetails?.lowerPrice ?? null,
    priceMax: item.priceDetails?.upperPrice ?? null,
    beds: Number(item.bedrooms ?? item.beds ?? 0),
    baths: Number(item.bathrooms ?? item.baths ?? 0),
    cars: Number(item.carspaces ?? item.cars ?? 0),
    land: item.landArea ?? null,
    status: status === "sold" ? "sold" : "active",
    soldDate: status === "sold" ? (item.soldDate ?? now.slice(0, 10)) : null,
    auctionDate: item.auctionDate ?? null,
    image: item.media?.[0]?.imageUrl ?? item.images?.[0] ?? null,
    images: (item.media ?? []).map(m => m.imageUrl ?? m).filter(s => typeof s === "string"),
    listingUrl: item.url ?? `${CONFIG.searchBase}/${item.id}`,
    scrapedAt: now,
  }
}

function extractNestedListings(data, depth = 0) {
  if (depth > 8 || !data || typeof data !== "object") return []
  if (Array.isArray(data)) return data.flatMap(d => extractNestedListings(d, depth + 1))

  // Looks like a listing if it has an id + address
  if ((data.id || data.listingId) && (data.address || data.suburb)) return [data]

  return Object.values(data).flatMap(v => extractNestedListings(v, depth + 1))
}

function extractPrice(raw) {
  if (!raw) return 0
  const clean = String(raw).replace(/[^0-9.,]/g, "").replace(/,/g, "")
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n < 1000 ? n * 1000 : n
}

// ── Domain API path (if API key available) ────────────────────────────────────

async function fetchAPIListings() {
  if (!CONFIG.apiKey) return null

  const allListings = []
  for (const suburb of CONFIG.suburbs) {
    const [name, , , postcode] = suburb.split("-")
    const data = await fetchDomainAPI("/listings/residential/_search", {
      "listingType": "Sale",
      "locations[0].state": "VIC",
      "locations[0].suburb": name,
      "locations[0].postCode": postcode,
      "pageSize": 200,
    })
    if (data?.listings) allListings.push(...data.listings.map(l => parseGenericListing(l.listing, "active")))

    const soldData = await fetchDomainAPI("/listings/residential/_search", {
      "listingType": "Sale",
      "listingStatus": "Sold",
      "locations[0].state": "VIC",
      "locations[0].suburb": name,
      "locations[0].postCode": postcode,
      "pageSize": 100,
    })
    if (soldData?.listings) allListings.push(...soldData.listings.map(l => parseGenericListing(l.listing, "sold")))
  }
  return allListings.filter(Boolean)
}

// ── Auction date → sold detection ─────────────────────────────────────────────

function detectSoldFromAuction(listing) {
  if (!listing.auctionDate) return listing
  const auctionTs = new Date(listing.auctionDate).getTime()
  const now = Date.now()
  if (auctionTs < now - 24 * 60 * 60 * 1000) {
    // Auction date is in the past — likely sold
    return {
      ...listing,
      status: "sold",
      soldDate: listing.soldDate ?? listing.auctionDate,
    }
  }
  return listing
}

// ── Diff engine ───────────────────────────────────────────────────────────────

function diffSnapshots(prev, next) {
  const prevById = Object.fromEntries(prev.map(l => [l.id, l]))
  const nextById = Object.fromEntries(next.map(l => [l.id, l]))

  const added    = next.filter(l => !prevById[l.id])
  const removed  = prev.filter(l => !nextById[l.id])
  const changed  = next.filter(l => {
    const p = prevById[l.id]
    return p && p.status !== l.status
  })

  return { added, removed, changed }
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(diff, total) {
  const { added, removed, changed } = diff
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log(`  PropOS Domain Scraper — ${new Date().toLocaleString("en-AU")}`)
  console.log(`  Total listings scraped: ${total}`)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  if (added.length) {
    console.log(`\n🆕 New listings (${added.length}):`)
    for (const l of added) {
      const price = l.price ? `$${(l.price / 1000).toFixed(0)}k` : "TBD"
      console.log(`   + ${l.address}, ${l.suburb} — ${price} [${l.status}]`)
      if (l.auctionDate) console.log(`     Auction: ${l.auctionDate}`)
    }
  }

  if (changed.length) {
    console.log(`\n🔄 Status changes (${changed.length}):`)
    for (const l of changed) {
      console.log(`   ~ ${l.address}, ${l.suburb} → now ${l.status.toUpperCase()}`)
      if (l.status === "sold" && l.soldDate) console.log(`     Sold: ${l.soldDate}`)
    }
  }

  if (removed.length) {
    console.log(`\n❌ Removed from Domain (${removed.length}):`)
    for (const l of removed) {
      console.log(`   - ${l.address}, ${l.suburb}`)
    }
  }

  if (!added.length && !changed.length && !removed.length) {
    console.log("\n✅ No changes — listings are up to date.")
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // Actionable recommendations
  const newSold = changed.filter(l => l.status === "sold")
  if (newSold.length) {
    console.log("\n📋 PropOS action items:")
    console.log("   The following listings appear to have sold and should")
    console.log("   be moved from PORTFOLIO_ACTIVE → PORTFOLIO_SOLD in data.ts:\n")
    for (const l of newSold) {
      console.log(`   • ${l.address}, ${l.suburb}  (soldDate: ${l.soldDate ?? "unknown"})`)
    }
    console.log("\n   Also add them to Comparable Sales for buyer outreach.")
  }

  const missingImages = [...added].filter(l => !l.image)
  if (missingImages.length) {
    console.log("\n⚠ Listings without images (add photos to /public/):")
    for (const l of missingImages) {
      const slug = l.address.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      console.log(`   • ${l.address} → expected filename: ${slug}.jpg`)
    }
  }
}

// ── Prop match helper (for data.ts migration guide) ───────────────────────────

function toDataTsEntry(l) {
  const slug = `/${l.address.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`
  const price = l.price ?? Math.round(((l.priceMin ?? 0) + (l.priceMax ?? 0)) / 2)
  return `  {
    id: ${Date.now() % 100000},
    address: "${l.address}",
    suburb: "${l.suburb}", state: "${l.state}", postcode: "${l.postcode}",
    price: ${price}, beds: ${l.beds}, baths: ${l.baths}, cars: ${l.cars},${l.land ? ` land: ${l.land},` : ""}
    type: "House", status: "${l.status}",${l.soldDate ? ` soldDate: "${l.soldDate}",` : ""}${l.auctionDate ? ` auctionDate: "${l.auctionDate}",` : ""}
    image: "${slug}",
    description: "",
    leadCount: 0,
  },`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏠 PropOS Domain Scraper starting…")
  if (DRY_RUN) console.log("   (DRY RUN — no files will be written)\n")

  // Load previous snapshot
  let prevListings = []
  if (existsSync(SNAPSHOT_PATH)) {
    try {
      prevListings = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"))
      console.log(`📂 Loaded ${prevListings.length} listings from previous snapshot`)
    } catch { console.warn("⚠ Could not parse previous snapshot — starting fresh") }
  }

  // Fetch fresh listings
  let freshListings = []

  // Try API first (if key is set)
  const apiListings = await fetchAPIListings()
  if (apiListings) {
    console.log(`✅ Fetched ${apiListings.length} listings via Domain API`)
    freshListings = apiListings
  } else {
    // Fall back to HTML scraping
    console.log("ℹ No API key — using HTML scraper (may be slower/rate-limited)\n")
    for (const suburb of CONFIG.suburbs) {
      const active = await scrapeSuburbListings(suburb, "sale")
      const sold   = await scrapeSuburbListings(suburb, "sold")
      freshListings.push(...active, ...sold)
      // Be polite — 1.5s between suburbs
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  // Post-process: detect sold-via-auction
  freshListings = freshListings.map(detectSoldFromAuction)

  // Apply price/land filters for active listings only
  freshListings = freshListings.filter(l => {
    if (l.status !== "active") return true  // keep all sold records
    if (CONFIG.maxPrice && l.price && l.price > CONFIG.maxPrice) return false
    if (CONFIG.minLand && l.land && l.land < CONFIG.minLand) return false
    return true
  })

  // Dedup by id
  const seen = new Set()
  freshListings = freshListings.filter(l => {
    if (seen.has(l.id)) return false
    seen.add(l.id)
    return true
  })

  // Diff
  const diff = diffSnapshots(prevListings, freshListings)
  printReport(diff, freshListings.length)

  // Print data.ts migration snippets for new listings
  if (diff.added.length) {
    console.log("\n📝 data.ts snippets for new listings (copy into PORTFOLIO_ACTIVE or PORTFOLIO_SOLD):\n")
    for (const l of diff.added.slice(0, 5)) {
      console.log(toDataTsEntry(l))
      console.log()
    }
    if (diff.added.length > 5) console.log(`   … and ${diff.added.length - 5} more (see domain-listings.json)`)
  }

  // Save snapshot
  if (!DRY_RUN) {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(freshListings, null, 2))
    console.log(`\n💾 Snapshot saved → scripts/domain-listings.json (${freshListings.length} listings)`)
  }
}

main().catch(err => {
  console.error("\n❌ Scraper failed:", err.message)
  process.exit(1)
})
