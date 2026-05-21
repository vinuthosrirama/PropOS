import { Router } from "express"
import { logAction } from "../lib/sheets.js"

const router = Router()

/**
 * POST /api/sheet
 * Body: { type, name?, agency?, phone?, action?, lead?, detail? }
 * Logs an event to the Actions tab in Google Sheet
 */
router.post("/", async (req, res) => {
  const { type, name, agency, phone, action, lead, detail } = req.body as Record<string, string>
  if (!type) return res.status(400).json({ error: "type is required" })

  try {
    await logAction({ type, name: name ?? "", agency: agency ?? "", phone: phone ?? "", action: action ?? "", lead: lead ?? "", detail: detail ?? "" })
  } catch (err) {
    console.error("[sheet POST]", err)
    // fail silently — logging should never block the client
  }
  res.json({ ok: true })
})

export default router
