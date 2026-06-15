/**
 * Demo / lead-magnet routes.
 *
 * POST /api/demo/instant
 *   Captures a new prospect (real estate agent), upserts them into sms_contacts
 *   with ready_to_contact = true, then immediately fires the ready-outreach
 *   poller so a personalised opener lands in the Voice tab within seconds.
 *   Used by the Campaign view "Add lead" form and the public lead-magnet embed.
 *
 * Demo system routes — PropOS live demos to REA agents.
 *
 * POST /api/demo/seed          — upsert all 4 demo contacts (idempotent)
 * GET  /api/demo/contacts      — list demo contacts with current phones
 * POST /api/demo/activate/:key — swap one contact's phone to real demo recipient
 * POST /api/demo/reset         — restore all demo phones to fake placeholders
 *
 * The seed/activate/reset routes are only usable in demo/dev mode (refuse if
 * NODE_ENV=production AND no demo flag).
 */

import { Router, type Request, type Response } from "express"
import { isDbConnected, query, execute } from "../lib/db.js"
import { runReadyOutreach } from "../lib/smsReadyOutreach.js"
import { DEMO_SCENARIOS, DEMO_SOURCE_PREFIX } from "../data/demoContacts.js"

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

// ── Guard: refuse to seed/activate in production without explicit opt-in ──────
function isDemoAllowed(): boolean {
  // Always allowed in dev; in production only if DEMO_MODE=true is explicitly set
  return process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDemoContacts() {
  return query<{
    id: number; name: string; phone: string; source: string; status: string;
    ready_to_contact: boolean; buyer_profile: unknown; personalisation: unknown
  }>(
    `SELECT id, name, phone, source, status, ready_to_contact, buyer_profile, personalisation
     FROM sms_contacts WHERE source LIKE $1 ORDER BY id`,
    [`${DEMO_SOURCE_PREFIX}%`],
  )
}

// ── POST /api/demo/seed ───────────────────────────────────────────────────────

router.post("/seed", async (_req: Request, res: Response) => {
  if (!isDemoAllowed()) return res.status(403).json({ error: "Demo mode not enabled in production. Set DEMO_MODE=true." })
  if (!isDbConnected()) return res.status(503).json({ error: "Database not connected" })

  const results: Array<{ key: string; name: string; phone: string; id: number }> = []

  for (const s of DEMO_SCENARIOS) {
    const rows = await query<{ id: number }>(
      `INSERT INTO sms_contacts
         (name, phone, relationship, stage, conversation_objective, personalisation,
          voice_override, buyer_profile, rea_data, source, status, auto_reply, ready_to_contact, updated_at)
       VALUES ($1, $2, 'agent_prospect', 1, $3, $4::jsonb, '{}'::jsonb, $5::jsonb, $6::jsonb,
               $7, 'active', false, false, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         name                   = EXCLUDED.name,
         conversation_objective = EXCLUDED.conversation_objective,
         personalisation        = EXCLUDED.personalisation,
         buyer_profile          = EXCLUDED.buyer_profile,
         rea_data               = EXCLUDED.rea_data,
         source                 = EXCLUDED.source,
         updated_at             = NOW()
       RETURNING id`,
      [
        s.contact.name,
        s.fakePhone,
        s.contact.conversation_objective,
        JSON.stringify(s.contact.personalisation),
        JSON.stringify(s.contact.buyer_profile),
        JSON.stringify(s.contact.rea_data),
        `${DEMO_SOURCE_PREFIX}${s.key}`,
      ],
    )
    if (rows[0]) results.push({ key: s.key, name: s.contact.name, phone: s.fakePhone, id: rows[0].id })
  }

  res.json({ ok: true, seeded: results })
})

// ── GET /api/demo/contacts ────────────────────────────────────────────────────

router.get("/contacts", async (_req: Request, res: Response) => {
  if (!isDbConnected()) return res.json({ ok: true, contacts: [] })

  const rows = await getDemoContacts()
  const contacts = rows.map(r => {
    const scenarioKey = (r.source as string).replace(DEMO_SOURCE_PREFIX, "")
    const scenario = DEMO_SCENARIOS.find(s => s.key === scenarioKey)
    return {
      id: r.id,
      key: scenarioKey,
      name: r.name,
      phone: r.phone,
      fakePhone: scenario?.fakePhone ?? r.phone,
      tag: scenario?.tag ?? scenarioKey,
      summary: scenario?.summary ?? "",
      status: r.status,
      ready_to_contact: r.ready_to_contact,
      isActive: scenario ? r.phone !== scenario.fakePhone : false,
    }
  })

  res.json({ ok: true, contacts })
})

// ── POST /api/demo/activate/:key ─────────────────────────────────────────────
// Swaps ONE demo contact's phone to the real demo recipient (REA agent being demoed to).
// All other demo contacts are reset to their fake phones first (only one can be live at a time).

router.post("/activate/:key", async (req: Request, res: Response) => {
  if (!isDemoAllowed()) return res.status(403).json({ error: "Demo mode not enabled in production." })
  if (!isDbConnected()) return res.status(503).json({ error: "Database not connected" })

  const { key } = req.params
  const { recipientPhone } = req.body as { recipientPhone?: string }

  if (!recipientPhone?.trim()) {
    return res.status(400).json({ error: "recipientPhone is required in request body" })
  }

  const phone = recipientPhone.trim().replace(/\s/g, "")
  const e164 = phone.startsWith("+") ? phone
    : phone.startsWith("0") ? `+61${phone.slice(1)}`
    : phone.startsWith("61") ? `+${phone}` : phone

  const scenario = DEMO_SCENARIOS.find(s => s.key === key)
  if (!scenario) {
    return res.status(404).json({ error: `Unknown scenario key '${key}'. Valid: ${DEMO_SCENARIOS.map(s => s.key).join(", ")}` })
  }

  // 1. Reset ALL demo contacts to their fake phones first (avoids conflicts / stale live numbers)
  for (const s of DEMO_SCENARIOS) {
    await execute(
      `UPDATE sms_contacts SET phone = $1, updated_at = NOW() WHERE source = $2`,
      [s.fakePhone, `${DEMO_SOURCE_PREFIX}${s.key}`],
    )
  }

  // 2. Swap the target contact to the real phone
  const rows = await query<{ id: number; name: string }>(
    `UPDATE sms_contacts SET phone = $1, ready_to_contact = false, updated_at = NOW()
     WHERE source = $2 RETURNING id, name`,
    [e164, `${DEMO_SOURCE_PREFIX}${key}`],
  )

  if (!rows[0]) {
    return res.status(404).json({ error: `Demo contact '${key}' not found. Run /api/demo/seed first.` })
  }

  res.json({
    ok: true,
    activated: { id: rows[0].id, name: rows[0].name, phone: e164, scenario: scenario.tag },
    message: `${rows[0].name}'s number is now set to ${e164}. Tick ready_to_contact to fire the opener.`,
  })
})

// ── POST /api/demo/reset ──────────────────────────────────────────────────────
// Restores all demo contacts to their fake placeholder phones and clears ready_to_contact.

router.post("/reset", async (_req: Request, res: Response) => {
  if (!isDbConnected()) return res.status(503).json({ error: "Database not connected" })

  for (const s of DEMO_SCENARIOS) {
    await execute(
      `UPDATE sms_contacts SET phone = $1, ready_to_contact = false, updated_at = NOW()
       WHERE source = $2`,
      [s.fakePhone, `${DEMO_SOURCE_PREFIX}${s.key}`],
    )
  }

  res.json({ ok: true, message: "All demo contacts reset to placeholder phones." })
})

export default router
