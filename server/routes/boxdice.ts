import { Router } from "express"
import { boxdiceConfigured, getLeadsForListing, getSalesListings, createFollowUpTask } from "../lib/boxdice.js"

const router = Router()

/** GET /api/boxdice/status */
router.get("/status", (_req, res) => {
  res.json({ configured: boxdiceConfigured() })
})

/**
 * GET /api/boxdice/leads?listingId=123&listingAddress=...
 * Returns PropOS-shaped lead array for a Boxdice sales listing.
 */
router.get("/leads", async (req, res) => {
  if (!boxdiceConfigured()) {
    return res.status(503).json({ error: "Boxdice not configured" })
  }

  const listingId = parseInt(req.query.listingId as string)
  const listingAddress = (req.query.listingAddress as string) ?? ""

  if (isNaN(listingId)) {
    return res.status(400).json({ error: "listingId must be a number" })
  }

  try {
    const leads = await getLeadsForListing(listingId)
    // Stamp the inspectedProperty field now that we know the listing address
    const stamped = leads.map(l => ({ ...l, inspectedProperty: listingAddress }))
    res.json({ ok: true, leads: stamped, source: "boxdice" })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

/** GET /api/boxdice/listings */
router.get("/listings", async (_req, res) => {
  if (!boxdiceConfigured()) {
    return res.status(503).json({ error: "Boxdice not configured" })
  }

  try {
    const listings = await getSalesListings()
    res.json({ ok: true, listings })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

/**
 * POST /api/boxdice/task
 * Creates a follow-up task in Boxdice for a contact.
 */
router.post("/task", async (req, res) => {
  if (!boxdiceConfigured()) {
    return res.status(503).json({ error: "Boxdice not configured" })
  }

  const { contactId, salesListingId, subject, actionDate, kind, consultantId } = req.body

  if (!contactId || !subject || !consultantId) {
    return res.status(400).json({ error: "contactId, subject, consultantId required" })
  }

  try {
    const result = await createFollowUpTask({ contactId, salesListingId, subject, actionDate, kind: kind ?? "SMS", consultantId })
    res.json({ ok: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
