import { Router } from "express"

const router = Router()

const SHEET_URL = process.env.SHEET_URL ?? ""

/**
 * POST /api/add-contact
 *
 * Appends a new past buyer contact to the "Past Buyers" tab in Google Sheets.
 * The Apps Script web app must handle type=add_past_buyer.
 *
 * Body: PastBuyer fields (name, phone, email, purchaseAddress, suburb,
 *       purchaseDate, purchasePrice, deposit, propertyType, beds, baths,
 *       land, status, notes)
 * Returns: { ok: true }
 */
router.post("/", async (req, res) => {
  const contact = req.body as Record<string, unknown>

  if (!contact.name || !contact.purchaseAddress) {
    return res.status(400).json({ error: "name and purchaseAddress are required" })
  }

  if (SHEET_URL) {
    try {
      await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          type: "add_past_buyer",
          id:              contact.id ?? Date.now(),
          name:            contact.name,
          phone:           contact.phone ?? "",
          email:           contact.email ?? "",
          purchaseAddress: contact.purchaseAddress,
          suburb:          contact.suburb ?? "",
          purchaseDate:    contact.purchaseDate ?? "",
          purchasePrice:   contact.purchasePrice ?? 0,
          deposit:         contact.deposit ?? 0,
          propertyType:    contact.propertyType ?? "House",
          beds:            contact.beds ?? 3,
          baths:           contact.baths ?? 2,
          land:            contact.land ?? 0,
          status:          contact.status ?? "owner-occupier",
          notes:           contact.notes ?? "",
          lastContactDate: "",
        }),
      })
    } catch (err) {
      console.error("[add-contact] Sheet write error:", err)
      // fail silently — contact is already added in frontend state
    }
  }

  console.log(`[add-contact] New contact added: ${contact.name} at ${contact.purchaseAddress}`)
  return res.json({ ok: true })
})

export default router
