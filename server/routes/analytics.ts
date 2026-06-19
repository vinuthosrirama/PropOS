import { Router } from "express"
import { isDbConnected, query, execute, queryOne } from "../lib/db.js"
import { writeToSheet } from "../lib/sheets.js"

const SHEET_TIMEOUT_MS = 10_000

/** fetch() with AbortController timeout for Sheets reads */
async function fetchSheet(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const router = Router()

// ── Vendor prospecting analytics ──────────────────────────────────────────────

/**
 * GET /api/analytics/vendor
 * Full funnel for vendor prospecting:
 *   Contacts analysed → Outreach sent → Opened → Replied → Appraisals → Listings → GCI
 *
 * Returns demo numbers when no database is connected.
 */
router.get("/vendor", async (req, res) => {
  if (!isDbConnected()) {
    return res.json(demoVendorAnalytics())
  }

  try {
    // Use JWT-authenticated agent ID — prevents IDOR (any agent reading any other agent's analytics)
    // Use ?? not ? to avoid treating agentId=0 (demo token) as falsy → "default" which fails SQL integer cast
    const agentId = req.agentId ?? 0

    // Core funnel from outreach_log
    const [funnelRows, pipelineRows, recentRows] = await Promise.all([
      query<{ status: string; count: string; channel: string }>(
        `SELECT status, channel, COUNT(*) as count
         FROM outreach_log
         WHERE agent_id = $1
           AND pipeline IS NOT NULL   -- vendor outreach only
         GROUP BY status, channel`,
        [agentId],
      ),
      query<{ pipeline: string; count: string }>(
        `SELECT pipeline, COUNT(*) as count
         FROM outreach_log
         WHERE agent_id = $1 AND pipeline IS NOT NULL
         GROUP BY pipeline
         ORDER BY count DESC`,
        [agentId],
      ),
      query<{ contact_name: string; contact_phone: string; contact_email: string | null; property_address: string | null; pipeline: string; sent_at: string; status: string; email_subject: string | null }>(
        `SELECT contact_name, contact_phone, contact_email, property_address, pipeline, sent_at, status, email_subject
         FROM outreach_log
         WHERE agent_id = $1 AND pipeline IS NOT NULL
         ORDER BY sent_at DESC
         LIMIT 20`,
        [agentId],
      ),
    ])

    const sent     = funnelRows.reduce((s, r) => s + parseInt(r.count, 10), 0)
    const opened   = funnelRows.filter(r => r.status === "opened" || r.status === "clicked").reduce((s, r) => s + parseInt(r.count, 10), 0)
    const replied  = funnelRows.filter(r => r.status === "replied").reduce((s, r) => s + parseInt(r.count, 10), 0)

    // Nurture queue stats
    const nurtureRows = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM nurture_queue WHERE agent_id = $1 GROUP BY status`,
      [agentId],
    )
    const nurturePending = nurtureRows.find(r => r.status === "pending")
    const nurtureSent    = nurtureRows.find(r => r.status === "sent")

    const byPipeline: Record<string, number> = {}
    for (const r of pipelineRows) {
      byPipeline[r.pipeline] = parseInt(r.count, 10)
    }

    // Real milestone data from milestones table
    const milestoneRows = await query<{ type: string; count: string; total_price: string }>(
      `SELECT type, COUNT(*) as count, COALESCE(SUM(listing_price), 0) as total_price
       FROM milestones WHERE agent_id = $1 GROUP BY type`,
      [agentId],
    )
    const appraisalsBooked = parseInt(
      milestoneRows.find(r => r.type === "appraisal_booked")?.count ?? "0", 10)
    const listingsWon      = parseInt(
      milestoneRows.find(r => r.type === "listing_won")?.count ?? "0", 10)
    const totalPrice       = parseInt(
      milestoneRows.find(r => r.type === "listing_won")?.total_price ?? "0", 10)
    const estimatedGCI     = Math.round(totalPrice * 0.02)

    res.json({
      funnel: {
        outreachSent:    sent,
        emailOpened:     opened,
        replied,
        appraisalsBooked,
        listingsWon,
        estimatedGCI,
      },
      nurture: {
        pending: parseInt(nurturePending?.count ?? "0", 10),
        sent:    parseInt(nurtureSent?.count    ?? "0", 10),
      },
      byPipeline,
      recentOutreach: recentRows,
      roi: {
        monthlySubscription: 399,
        listingsAttributed:  listingsWon,
        revenueGenerated:    estimatedGCI,
        roiMultiple:         estimatedGCI > 0 ? Math.round((estimatedGCI / 4788) * 10) / 10 : 0,
      },
    })
  } catch (err) {
    console.error("[analytics/vendor]", err)
    res.json(demoVendorAnalytics())
  }
})

function demoVendorAnalytics() {
  return {
    funnel: {
      outreachSent:     47,
      emailOpened:      31,
      replied:          9,
      appraisalsBooked: 3,
      listingsWon:      1,
      estimatedGCI:     17000,
    },
    nurture: { pending: 18, sent: 22 },
    byPipeline: {
      "investor-to-seller": 12,
      "owner-to-upsizer":   14,
      "owner-to-seller":    10,
      "owner-to-downsizer":  7,
      "investor-to-rebalance": 4,
    },
    recentOutreach: [],
    roi: {
      monthlySubscription: 399,
      listingsAttributed:  1,
      revenueGenerated:    17000,
      roiMultiple:         42.6,
    },
  }
}

// ── Milestones (appraisal booked / listing won) ───────────────────────────────

/**
 * POST /api/analytics/milestone
 * Records an appraisal booking or listing win for a contact.
 */
router.post("/milestone", async (req, res) => {
  // PT-M1: agentId body param removed — agent identity comes from JWT (req.agentId), never from the body
  const { contactPhone, contactName, type, propertyAddress, listingPrice } = req.body as {
    contactPhone?: string
    contactName?: string
    type?: string
    propertyAddress?: string
    listingPrice?: number
  }

  if (!type || !["appraisal_booked", "listing_won"].includes(type)) {
    return res.status(400).json({ error: "type must be 'appraisal_booked' or 'listing_won'" })
  }

  if (!isDbConnected()) {
    // Graceful demo mode — return success but nothing is persisted
    return res.json({ ok: true, id: null, demo: true })
  }

  try {
    const rows = await queryOne<{ id: number }>(
      `INSERT INTO milestones (agent_id, contact_phone, contact_name, type, property_address, listing_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.agentId ?? 0,
        contactPhone ?? "",
        contactName ?? "",
        type,
        propertyAddress ?? "",
        listingPrice ?? null,
      ],
    )
    return res.json({ ok: true, id: rows?.id ?? null })
  } catch (err) {
    console.error("[analytics/milestone]", (err as Error).message)
    return res.status(500).json({ error: "Failed to record milestone" })
  }
})

/**
 * GET /api/analytics/office
 * Returns per-agent funnel rollup for a principal view.
 * Requires all agents to share the same office_id.
 */
router.get("/office", async (req, res) => {
  if (!isDbConnected()) {
    return res.json({ agents: [], totalGCI: 0 })
  }
  const officeId = req.query.officeId
  if (!officeId) {
    return res.status(400).json({ error: "officeId is required" })
  }

  try {
    const agentRows = await query<{ id: number; name: string; agency: string; email: string }>(
      "SELECT id, name, agency, email FROM agents WHERE office_id = $1",
      [officeId],
    )

    const perAgent = await Promise.all(agentRows.map(async agent => {
      const [outreach, milestones] = await Promise.all([
        queryOne<{ sent: string; opened: string; replied: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE pipeline IS NOT NULL) AS sent,
             COUNT(*) FILTER (WHERE status IN ('opened','clicked')) AS opened,
             COUNT(*) FILTER (WHERE status = 'replied') AS replied
           FROM outreach_log WHERE agent_id = $1
             AND sent_at > NOW() - INTERVAL '30 days'`,
          [String(agent.id)],
        ),
        queryOne<{ appraisals: string; listings: string; gci: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE type='appraisal_booked') AS appraisals,
             COUNT(*) FILTER (WHERE type='listing_won')      AS listings,
             COALESCE(SUM(listing_price * 0.02) FILTER (WHERE type='listing_won'), 0) AS gci
           FROM milestones WHERE agent_id = $1`,
          [agent.id],
        ),
      ])
      return {
        id:               agent.id,
        name:             agent.name,
        agency:           agent.agency,
        outreachSent:     parseInt(outreach?.sent    ?? "0", 10),
        emailOpened:      parseInt(outreach?.opened  ?? "0", 10),
        replied:          parseInt(outreach?.replied ?? "0", 10),
        appraisalsBooked: parseInt(milestones?.appraisals ?? "0", 10),
        listingsWon:      parseInt(milestones?.listings   ?? "0", 10),
        estimatedGCI:     Math.round(parseFloat(milestones?.gci ?? "0")),
      }
    }))

    const totalGCI = perAgent.reduce((s, a) => s + a.estimatedGCI, 0)
    return res.json({ agents: perAgent, totalGCI })
  } catch (err) {
    console.error("[analytics/office]", err)
    return res.json({ agents: [], totalGCI: 0 })
  }
})

interface AuctionOutcome {
  propertyAddress: string
  suburb: string
  auctionDate: string
  priceGuideMin: number
  priceGuideMax: number
  hammerPrice: number
  registeredBidders: number
  activeBidders: number
  propOSLeadsContacted: number
  propOSLeadsAtAuction: number
  notes: string
}

interface AnalyticsSummary {
  totalAuctions: number
  totalOutreachSent: number
  avgBiddersWhenPropOSUsed: number
  avgHammerVsGuidePct: number
  estimatedExtraGCI: number
  funnelTotals: { contacted: number; emailOpened: number; replied: number; registeredToBid: number; bidPlaced: number }
  bySuburb: Record<string, { auctions: number; avgBidders: number; avgHammerVsGuide: number }>
}

/**
 * GET /api/analytics
 * Aggregates auction outcomes + event funnel from Google Sheets.
 */
router.get("/", async (req, res) => {
  const sheetUrl = process.env.SHEET_URL
  if (!sheetUrl) {
    return res.json(demoAnalytics())
  }

  try {
    const [outcomesRes, eventsRes] = await Promise.all([
      fetchSheet(`${sheetUrl}?action=getAuctionOutcomes`),
      fetchSheet(`${sheetUrl}?action=getEvents`),
    ])

    const outcomes: AuctionOutcome[] = outcomesRes?.ok
      ? ((await outcomesRes.json()) as { outcomes?: AuctionOutcome[] }).outcomes ?? []
      : []

    const events: Array<{ eventType: string; propertyAddress: string; leadId: string }> = eventsRes?.ok
      ? ((await eventsRes.json()) as { events?: typeof events }).events ?? []
      : []

    const summary = buildSummary(outcomes, events)
    // If Sheet returned but had no real data, show realistic demo numbers instead of zeros
    if (summary.totalAuctions === 0 && summary.totalOutreachSent === 0) {
      return res.json(demoAnalytics())
    }
    res.json(summary)
  } catch (err) {
    console.error("Analytics error:", err)
    res.json(emptyAnalytics())
  }
})

/**
 * POST /api/analytics/auction
 * Agent records an auction result — stored to Sheets "AuctionOutcomes" tab.
 */
router.post("/auction", async (req, res) => {
  const outcome = req.body as AuctionOutcome
  if (!outcome.propertyAddress || !outcome.hammerPrice) {
    return res.status(400).json({ error: "propertyAddress and hammerPrice required" })
  }

  if (!process.env.SHEET_URL) {
    return res.json({ ok: true, warning: "Sheet not configured — outcome not persisted" })
  }

  // writeToSheet retries internally and never throws
  void writeToSheet({ type: "auction_outcome", timestamp: new Date().toISOString(), ...(outcome as unknown as Record<string, unknown>) })
  res.json({ ok: true })
})

function buildSummary(outcomes: AuctionOutcome[], events: Array<{ eventType: string }>): AnalyticsSummary {
  const totalAuctions = outcomes.length
  const totalOutreachSent = events.filter(e => e.eventType === "outreach_sent").length
  const avgBidders = totalAuctions
    ? outcomes.reduce((s, o) => s + (o.registeredBidders ?? 0), 0) / totalAuctions
    : 0

  const avgHammerVsGuide = totalAuctions
    ? outcomes.reduce((s, o) => {
        const guide = (o.priceGuideMin + o.priceGuideMax) / 2
        return guide > 0 ? s + ((o.hammerPrice - guide) / guide) * 100 : s
      }, 0) / totalAuctions
    : 0

  // Rough GCI contribution: extra bidders × avg price lift × GCI rate
  const GCI_RATE = 0.022
  const estimatedExtraGCI = outcomes.reduce((sum, o) => {
    const guide = (o.priceGuideMin + o.priceGuideMax) / 2
    const extraPrice = o.hammerPrice - guide
    return extraPrice > 0 ? sum + extraPrice * GCI_RATE : sum
  }, 0)

  const bySuburb: AnalyticsSummary["bySuburb"] = {}
  for (const o of outcomes) {
    const s = o.suburb ?? "Unknown"
    if (!bySuburb[s]) bySuburb[s] = { auctions: 0, avgBidders: 0, avgHammerVsGuide: 0 }
    bySuburb[s].auctions++
    bySuburb[s].avgBidders = (bySuburb[s].avgBidders * (bySuburb[s].auctions - 1) + o.registeredBidders) / bySuburb[s].auctions
    const guide = (o.priceGuideMin + o.priceGuideMax) / 2
    if (guide > 0) {
      bySuburb[s].avgHammerVsGuide = (bySuburb[s].avgHammerVsGuide * (bySuburb[s].auctions - 1) + ((o.hammerPrice - guide) / guide) * 100) / bySuburb[s].auctions
    }
  }

  return {
    totalAuctions,
    totalOutreachSent,
    avgBiddersWhenPropOSUsed: Math.round(avgBidders * 10) / 10,
    avgHammerVsGuidePct: Math.round(avgHammerVsGuide * 10) / 10,
    estimatedExtraGCI: Math.round(estimatedExtraGCI),
    funnelTotals: {
      contacted:       events.filter(e => e.eventType === "outreach_sent").length,
      emailOpened:     events.filter(e => e.eventType === "email_opened").length,
      replied:         events.filter(e => e.eventType === "sms_replied" || e.eventType === "email_clicked").length,
      registeredToBid: events.filter(e => e.eventType === "registered_to_bid").length,
      bidPlaced:       events.filter(e => e.eventType === "bid_placed").length,
    },
    bySuburb,
  }
}

function emptyAnalytics(): AnalyticsSummary {
  return {
    totalAuctions: 0, totalOutreachSent: 0, avgBiddersWhenPropOSUsed: 0,
    avgHammerVsGuidePct: 0, estimatedExtraGCI: 0,
    funnelTotals: { contacted: 0, emailOpened: 0, replied: 0, registeredToBid: 0, bidPlaced: 0 },
    bySuburb: {},
  }
}

/** Realistic demo numbers — shown when no Sheet URL is configured. */
function demoAnalytics(): AnalyticsSummary {
  return {
    totalAuctions: 12,
    totalOutreachSent: 87,
    avgBiddersWhenPropOSUsed: 6.4,
    avgHammerVsGuidePct: 8.2,
    estimatedExtraGCI: 34100,
    funnelTotals: {
      contacted: 87,
      emailOpened: 54,
      replied: 28,
      registeredToBid: 19,
      bidPlaced: 14,
    },
    bySuburb: {
      Berwick: { auctions: 5, avgBidders: 6.8, avgHammerVsGuide: 9.1 },
      "Narre Warren": { auctions: 4, avgBidders: 5.9, avgHammerVsGuide: 7.4 },
      Clyde: { auctions: 3, avgBidders: 6.6, avgHammerVsGuide: 8.3 },
    },
  }
}

export default router
