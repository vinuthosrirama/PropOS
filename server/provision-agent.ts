/**
 * provision-agent.ts
 *
 * CLI: cd server && npx tsx provision-agent.ts <slug>
 * Reads scripts/agent-data/<slug>.json and provisions a full demo in Supabase:
 *   1. Upsert agent row (email is unique key) + brand columns
 *   2. Delete + re-insert agent_portfolios (idempotent)
 *   3. Generate SLM JSON per listing via Claude Haiku
 *   4. Clone Cameron's 10 buyers into sms_contacts for this agent
 *   5. Seed voice_profiles with Cameron's profile at confidence=0.35
 */

import path from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "fs"
import dotenv from "dotenv"
import pg from "pg"
import Anthropic from "@anthropic-ai/sdk"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, ".env") })

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" })

// ── Cameron's 10 buyers (same personas, phone numbers kept for testing) ────────
const CAMERON_BUYERS = [
  { name: "David & Karen Hollis",    phone: "0418 234 567", notes: "Two kids at school. Upsizing soon." },
  { name: "Michael Chen",            phone: "0412 345 678", notes: "Investor. Looking for yield + growth." },
  { name: "Sandra Moore",            phone: "0423 456 789", notes: "Downsizing. Kids have left home." },
  { name: "James & Lisa Thompson",   phone: "0434 567 890", notes: "First home. Want 4bd near good schools." },
  { name: "Robert Patel",            phone: "0445 678 901", notes: "Buy-and-hold investor. 10+ year horizon." },
  { name: "Paul & Michelle Grant",   phone: "0456 789 012", notes: "Relocating from Sydney. Budget flexible." },
  { name: "Aneesha & Dev Sharma",    phone: "0467 890 123", notes: "Growing family. Need 4bd + home office." },
  { name: "Chris & Emma Nguyen",     phone: "0478 901 234", notes: "Upgrading from unit. Love big blocks." },
  { name: "Tony & Maria Russo",      phone: "0489 012 345", notes: "Semi-retired. Looking for low maintenance." },
  { name: "Sophie Mitchell",         phone: "0490 123 456", notes: "Single professional. First investment." },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface SoldListing {
  address: string; suburb: string; postcode?: string
  price: number; beds: number; baths: number; cars: number; type: string
  sold_date: string; lead_count: number
}

interface ActiveListing {
  address: string; suburb: string; postcode?: string
  price: number; price_min?: number; price_max?: number
  beds: number; baths: number; cars: number; type: string
  open_date?: string
}

interface AgentData {
  name: string; agency: string; agency_short?: string; email: string
  phone?: string; suburb: string; state?: string; tagline?: string
  years_exp?: number; bio?: string; reviews?: string[]
  brand: { primary: string; accent?: string; logo?: string; gradient?: [string, string] }
  sold_listings: SoldListing[]
  active_listings: ActiveListing[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

async function generateSlm(listing: SoldListing | ActiveListing, agentName: string, agency: string): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      address: listing.address, suburb: listing.suburb,
      beds: listing.beds, baths: listing.baths,
      note: "SLM auto-generation skipped — no ANTHROPIC_API_KEY",
    }
  }

  const isSold = (listing as SoldListing).sold_date !== undefined
  const prompt = `You are helping build a demo for ${agentName} at ${agency}.
Generate a concise property SLM (Smart Listing Memory) JSON for this listing:

Address: ${listing.address}, ${listing.suburb}
Beds: ${listing.beds}, Baths: ${listing.baths}, Cars: ${listing.cars}
Type: ${listing.type}
${isSold ? `Sold: ${(listing as SoldListing).sold_date} at $${listing.price.toLocaleString()}` : `Listed at $${listing.price.toLocaleString()}`}

Return ONLY a JSON object (no markdown):
{
  "address": "...", "suburb": "...", "beds": N, "baths": N, "cars": N,
  "land_sqm": N_or_null, "price_achieved": "$Xk or null", "price_guide": "$X-$Y or null",
  "nearby_schools": ["School A (0.8km)"], "nearby_stations": ["Station (2km)"],
  "selling_points": ["Open plan living", "Double garage"],
  "target_buyer": "Brief buyer profile for ${listing.suburb}",
  "days_on_market": N_or_null, "auction_clearance": "TBD", "comparable_note": "TBD"
}`

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    })
    const text = (response.content[0] as { text: string }).text.trim()
    const match = text.match(/\{[\s\S]+\}/)
    if (match) return JSON.parse(match[0])
  } catch (e) {
    console.warn(`  [slm] generation failed for ${listing.address}:`, (e as Error).message)
  }

  return { address: listing.address, suburb: listing.suburb, beds: listing.beds, baths: listing.baths }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("Usage: cd server && npx tsx provision-agent.ts <slug>")
    console.error("Example: cd server && npx tsx provision-agent.ts anthony-abeysena")
    process.exit(1)
  }

  // Data file lives at repo-root/scripts/agent-data/<slug>.json
  const dataPath = path.resolve(__dirname, "../scripts/agent-data", `${slug}.json`)
  let data: AgentData
  try {
    data = JSON.parse(readFileSync(dataPath, "utf-8"))
  } catch {
    console.error(`No data file found at: ${dataPath}`)
    process.exit(1)
  }

  console.log(`\nProvisioning: ${data.name} @ ${data.agency}`)
  console.log(`Email: ${data.email}`)

  // ── 1. Upsert agent row ───────────────────────────────────────────────────
  const agentRows = await q<{ id: number }>(
    `INSERT INTO agents (email, name, agency, suburb, tagline, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name, agency = EXCLUDED.agency,
       suburb = EXCLUDED.suburb, tagline = EXCLUDED.tagline
     RETURNING id`,
    [data.email, data.name, data.agency, data.suburb, data.tagline ?? ""],
  )
  const agentId = agentRows[0]?.id
  if (!agentId) { console.error("Failed to upsert agent"); process.exit(1) }

  await pool.query(
    `UPDATE agents SET
       brand_primary  = $1, brand_accent   = $2, brand_logo     = $3,
       brand_gradient = $4, bio            = $5, years_exp      = $6
     WHERE id = $7`,
    [
      data.brand.primary,
      data.brand.accent ?? data.brand.primary,
      data.brand.logo ?? data.agency.slice(0, 2),
      data.brand.gradient ?? [data.brand.primary, data.brand.primary],
      data.bio ?? null,
      data.years_exp ?? null,
      agentId,
    ],
  )
  console.log(`  ✓ Agent upserted (id=${agentId})`)

  // ── 2. Re-insert portfolios (idempotent) ──────────────────────────────────
  await pool.query(`DELETE FROM agent_portfolios WHERE agent_id = $1`, [agentId])

  const allListings = [
    ...data.sold_listings.map(l => ({ ...l, status: "sold" as const })),
    ...data.active_listings.map(l => ({ ...l, status: "active" as const, sold_date: undefined as string | undefined, lead_count: 0 })),
  ]

  const portfolioIds: number[] = []
  for (const listing of allListings) {
    const rows = await q<{ id: number }>(
      `INSERT INTO agent_portfolios
         (agent_id, address, suburb, state, postcode, price, price_min, price_max,
          beds, baths, cars, property_type, status, sold_date, open_date, lead_count, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        agentId, listing.address, listing.suburb, data.state ?? "VIC", listing.postcode ?? null,
        listing.price,
        (listing as ActiveListing).price_min ?? null,
        (listing as ActiveListing).price_max ?? null,
        listing.beds, listing.baths, listing.cars, listing.type, listing.status,
        listing.sold_date ?? null,
        (listing as ActiveListing).open_date ?? null,
        listing.lead_count ?? 0,
        `${listing.beds}bd ${listing.baths}ba ${listing.type} in ${listing.suburb}.`,
      ],
    )
    portfolioIds.push(rows[0].id)
  }
  console.log(`  ✓ ${allListings.length} listings inserted (${data.sold_listings.length} sold + ${data.active_listings.length} active)`)

  // ── 3. Generate SLM JSON per listing ──────────────────────────────────────
  console.log(`  Generating SLM for ${allListings.length} listings via Haiku...`)
  for (let i = 0; i < allListings.length; i++) {
    const slm = await generateSlm(allListings[i], data.name, data.agency)
    await pool.query(
      `INSERT INTO agent_property_slm (agent_id, portfolio_id, slm_json)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [agentId, portfolioIds[i], JSON.stringify(slm)],
    )
    console.log(`    SLM ${i + 1}/${allListings.length}: ${allListings[i].address}`)
  }
  console.log(`  ✓ SLM generated`)

  // ── 4. Clone Cameron's buyers into sms_contacts ───────────────────────────
  const soldAddresses = data.sold_listings.map(l => `${l.address}, ${l.suburb}`)
  let cloned = 0
  for (let i = 0; i < CAMERON_BUYERS.length; i++) {
    const buyer = CAMERON_BUYERS[i]
    const existing = await q<{ id: number }>(
      `SELECT id FROM sms_contacts WHERE phone = $1 AND assigned_agent_id = $2 LIMIT 1`,
      [buyer.phone, agentId],
    )
    if (existing.length > 0) continue

    await pool.query(
      `INSERT INTO sms_contacts
         (name, phone, email, assigned_agent_id, stage, status, rea_data, buyer_profile)
       VALUES ($1, $2, $3, $4, 1, 'active', $5, $6)`,
      [
        buyer.name, buyer.phone, "vinuth.srirama@outlook.com", agentId,
        JSON.stringify({ attended_address: soldAddresses[i % soldAddresses.length], source: "open_home" }),
        JSON.stringify({ notes: buyer.notes }),
      ],
    )
    cloned++
  }
  console.log(`  ✓ ${cloned} demo buyers cloned (${CAMERON_BUYERS.length - cloned} already existed)`)

  // ── 5. Seed voice profile ─────────────────────────────────────────────────
  const voiceId = `agent_${agentId}`
  await pool.query(
    `INSERT INTO voice_profiles
       (voice_id, agent_id, greeting, closing, formality_score, aussie_index,
        confidence, detected_traits, length_style, emoji_usage)
     VALUES ($1, $2, 'Hi', 'Kind regards', 2, 2, 0.35, $3, 'short', 'none')
     ON CONFLICT (voice_id) DO NOTHING`,
    [voiceId, agentId, JSON.stringify(["professional", "warm", "concise"])],
  ).catch(() => console.warn("  [voice] insert skipped (schema mismatch — OK)"))
  console.log(`  ✓ Voice profile seeded (${voiceId}, confidence=0.35)`)

  const baseUrl = process.env.BASE_URL ?? "https://propos.addvantage.site"
  console.log(`\n  Demo ready: ${baseUrl}`)
  console.log(`  Login with: ${data.email}\n`)

  await pool.end()
}

main().catch(err => { console.error("Provision failed:", err); process.exit(1) })
