/**
 * Demo / lead-magnet routes.
 *
 * POST /api/demo/instant
 *   Captures a new prospect (real estate agent), upserts them into sms_contacts
 *   with ready_to_contact = true, then immediately fires the ready-outreach
 *   poller so a personalised opener lands in the Voice tab within seconds.
 *   Used by the Campaign view "Add lead" form and the public lead-magnet embed.
 */

import { Router } from "express"
import { isDbConnected, query } from "../lib/db.js"
import { runReadyOutreach } from "../lib/smsReadyOutreach.js"

const router = Router()

function normalisePhone(phone: string): string {
  const cleaned = phone.trim().replace(/[\s\-()]/g, "")
  if (cleaned.startsWith("+")) return cleaned
  if (cleaned.startsWith("0")) return `+61${cleaned.slice(1)}`
  if (cleaned.startsWith("61")) return `+${cleaned}`
  return cleaned
}

router.post("/instant", async (req, res) => {
  const { name, phone, email, suburb, agency, source = "lead-magnet" } = req.body as Record<string, string>

  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: "name and phone are required" })
  }

  if (!isDbConnected()) {
    return res.status(503).json({ error: "Database not connected" })
  }

  const normPhone = normalisePhone(phone)

  const rows = await query<{ id: number }>(
    `INSERT INTO sms_contacts
       (name, phone, relationship, stage, personalisation, source, ready_to_contact, updated_at)
     VALUES ($1, $2, 'agent_prospect', 1, $3::jsonb, $4, true, NOW())
     ON CONFLICT (phone) DO UPDATE SET
       name            = EXCLUDED.name,
       ready_to_contact = true,
       source          = EXCLUDED.source,
       personalisation = sms_contacts.personalisation || EXCLUDED.personalisation,
       updated_at      = NOW()
     RETURNING id`,
    [
      name.trim(),
      normPhone,
      JSON.stringify({
        email:  email?.trim()  || null,
        suburb: suburb?.trim() || null,
        agency: agency?.trim() || null,
      }),
      source,
    ],
  )

  const contactId = rows[0]?.id
  if (!contactId) return res.status(500).json({ error: "Failed to create contact" })

  // Fire opener generation in the background — respond immediately so the form feels fast
  void runReadyOutreach(1).catch((err: Error) => {
    console.error("[demo/instant] runReadyOutreach failed:", err.message)
  })

  console.log(`[demo/instant] contact ${contactId} (${name.trim()}) queued for opener`)
  return res.json({ ok: true, contactId, message: "Opener queued — check the Voice tab in ~30s" })
})

export default router
