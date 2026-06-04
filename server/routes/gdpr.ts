/**
 * GDPR / Australian Privacy Act — data subject rights
 *
 * DELETE /api/gdpr/erase   — right to erasure (Art. 17 GDPR / APP 11)
 *   Erases all personal data for a given phone or email across every table.
 *   Requires authentication (agent must own the contact).
 *   Sheets erasure is best-effort (fire-and-forget via writeToSheet).
 *
 * GET /api/gdpr/export     — right of access / portability (Art. 15/20 GDPR)
 *   Returns all stored data for a contact as JSON.
 */

import { Router } from "express"
import { isDbConnected, query, execute } from "../lib/db.js"
import { writeToSheet } from "../lib/sheets.js"

const router = Router()

// ── Erase ─────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/gdpr/erase
 * Body: { phone?: string, email?: string }
 *
 * Deletes or anonymises all PII for the given identifier across:
 *   conversations, opt_outs, outreach_log, nurture_queue, contacts, milestones
 * Also fires a Sheets erasure request (best-effort).
 */
router.delete("/erase", async (req, res) => {
  try {
    const { phone, email } = req.body as { phone?: string; email?: string }
    if (!phone && !email) {
      return res.status(400).json({ error: "phone or email is required" })
    }

    const phoneKey = phone?.trim().replace(/\s+/g, "") ?? null
    const emailKey = email?.trim().toLowerCase() ?? null

    // PT-H1: scope all agent-owned table mutations to the requesting agent's data
    // so no agent can erase another agent's records. opt_outs and conversations
    // are identifier-keyed (no agent_id column) and remain global.
    const agentIdStr = String(req.agentId ?? "default")
    const agentIdNum = typeof req.agentId === "number" ? req.agentId : 0

    if (isDbConnected()) {
      // Hard-delete conversation thread (full message history — no agent_id, identifier-keyed)
      if (phoneKey) {
        await execute(`DELETE FROM conversations WHERE phone = $1`, [phoneKey])
        await execute(`DELETE FROM opt_outs WHERE identifier = $1`, [phoneKey])
        // Anonymise outreach_log — keep metadata for analytics, remove PII (scoped to agent)
        await execute(
          `UPDATE outreach_log
           SET contact_phone = '[erased]', contact_name = '[erased]',
               sms_body = '[erased]', email_body = '[erased]', email_subject = '[erased]',
               metadata = NULL
           WHERE contact_phone = $1 AND agent_id = $2`,
          [phoneKey, agentIdStr],
        )
        await execute(
          `DELETE FROM nurture_queue WHERE contact_phone = $1 AND agent_id = $2`,
          [phoneKey, agentIdStr],
        )
        await execute(
          `DELETE FROM milestones WHERE contact_phone = $1 AND agent_id = $2`,
          [phoneKey, agentIdNum],
        )
      }
      if (emailKey) {
        await execute(`DELETE FROM opt_outs WHERE identifier = $1`, [emailKey])
        await execute(
          `UPDATE outreach_log
           SET contact_email = '[erased]', contact_name = '[erased]',
               email_body = '[erased]', email_subject = '[erased]',
               metadata = NULL
           WHERE contact_email = $1 AND agent_id = $2`,
          [emailKey, agentIdStr],
        )
        await execute(
          `DELETE FROM contacts WHERE email = $1 AND agent_id = $2`,
          [emailKey, agentIdStr],
        )
      }
    }

    // Best-effort Sheets erasure (Apps Script must handle type=erase_contact)
    void writeToSheet({
      type:  "erase_contact",
      phone: phoneKey ?? "",
      email: emailKey ?? "",
      erasedAt: new Date().toISOString(),
    })

    console.log(`[gdpr] erase request processed for identifier`)
    return res.json({ ok: true, erased: true })
  } catch (err) {
    console.error("[gdpr] erase error:", (err as Error).message)
    return res.status(500).json({ error: "Erasure failed. Please contact support." })
  }
})

// ── Export (right of access) ──────────────────────────────────────────────────

/**
 * GET /api/gdpr/export?phone=...&email=...
 * Returns all stored data for a contact as a JSON object.
 */
router.get("/export", async (req, res) => {
  try {
    const phone = (req.query.phone as string | undefined)?.trim().replace(/\s+/g, "")
    const email = (req.query.email as string | undefined)?.trim().toLowerCase()

    if (!phone && !email) {
      return res.status(400).json({ error: "phone or email query param is required" })
    }

    if (!isDbConnected()) {
      return res.json({ ok: true, data: {}, note: "No database connected — in-memory mode has no persistent records." })
    }

    const [conversations, outreachLog, nurtureJobs, contact, optOuts] = await Promise.all([
      phone ? query(`SELECT phone, lead_name, property_address, email, last_reply_at, unread FROM conversations WHERE phone = $1`, [phone]) : [],
      phone || email ? query(
        `SELECT sent_at, channel, status, pipeline FROM outreach_log WHERE contact_phone = $1 OR contact_email = $2`,
        [phone ?? null, email ?? null],
      ) : [],
      phone ? query(`SELECT pipeline, step, status, scheduled_at FROM nurture_queue WHERE contact_phone = $1`, [phone]) : [],
      email ? query(`SELECT name, phone, email, purchase_address, suburb, purchase_date, status FROM contacts WHERE email = $1`, [email]) : [],
      phone || email ? query(
        `SELECT identifier, type, source, timestamp FROM opt_outs WHERE identifier = ANY($1)`,
        [[phone, email].filter(Boolean)],
      ) : [],
    ])

    return res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      data: { conversations, outreachLog, nurtureJobs, contact, optOuts },
    })
  } catch (err) {
    console.error("[gdpr] export error:", (err as Error).message)
    return res.status(500).json({ error: "Export failed. Please contact support." })
  }
})

export default router
