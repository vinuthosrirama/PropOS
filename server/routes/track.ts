/**
 * Email open/click tracking
 *
 * GET /api/track/open/:id  — serves a 1×1 transparent GIF, marks outreach as opened
 * GET /api/track/click/:id — marks as clicked, redirects to ?url= param
 *
 * IDs are outreach_log row IDs from logOutreach().
 * Gracefully no-ops when no DATABASE_URL is set.
 */

import { Router } from "express"
import { updateOutreachStatus } from "../lib/db.js"

const router = Router()

// Minimal 1×1 transparent GIF (base64)
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
)

/** GET /api/track/open/:id */
router.get("/open/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!isNaN(id) && id > 0) {
    await updateOutreachStatus(id, "opened").catch(() => { /* non-fatal */ })
  }

  res.set({
    "Content-Type":  "image/gif",
    "Content-Length": String(TRANSPARENT_GIF.length),
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma":        "no-cache",
    "Expires":       "0",
  })
  res.end(TRANSPARENT_GIF)
})

/** GET /api/track/click/:id?url=<encoded-destination> */
router.get("/click/:id", async (req, res) => {
  const id  = parseInt(req.params.id, 10)
  const raw = req.query.url as string | undefined

  if (!isNaN(id) && id > 0) {
    await updateOutreachStatus(id, "clicked").catch(() => { /* non-fatal */ })
  }

  // Validate destination to prevent open redirect — only allow mailto: links or same-origin paths
  let decoded = "/"
  try { if (raw) decoded = decodeURIComponent(raw) } catch { /* malformed URI — fall through to "/" */ }
  const BASE    = process.env.BASE_URL ?? "https://propos.addvantage.site"
  const isSafe  = decoded.startsWith("mailto:") || decoded.startsWith("/") || decoded.startsWith(BASE)
  res.redirect(302, isSafe ? decoded : "/")
})

export default router
