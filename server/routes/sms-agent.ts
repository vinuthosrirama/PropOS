/**
 * Conversational SMS Agent API (Stages 1-4 — see docs/SMS_AGENT.md)
 *
 * GET    /api/sms-agent/contacts                 — list contacts (?stage= ?status=)
 * POST   /api/sms-agent/contacts                 — add / update a contact
 * PATCH  /api/sms-agent/contacts/:id             — merge-patch contact fields
 * GET    /api/sms-agent/suburb-stats/:suburb      — real sold stats from sold_properties (?days=90)
 * GET  /api/sms-agent/voice-profile            — current calibrated voice profile
 * POST /api/sms-agent/calibrate                — calibrate voice from { samples: [] }
 * POST /api/sms-agent/recalibrate              — recalibrate from accumulated signals
 * GET  /api/sms-agent/drafts                   — pending drafts awaiting approval
 * POST /api/sms-agent/drafts/:id/approve       — approve (+ optional edit) and send
 * POST /api/sms-agent/drafts/:id/reject        — discard draft
 * POST /api/sms-agent/initiate/:contactId      — generate + send an opener
 * GET  /api/sms-agent/meetings                 — upcoming booked meetings
 * POST /api/sms-agent/orchestrate              — run the daily orchestration now
 * POST /api/sms-agent/seed-stage1              — seed the Stage 1 test contact + voice samples
 * POST /api/sms-agent/seed-stage2              — seed a Stage 2 contact (real number, not redirected)
 * POST /api/sms-agent/contacts/:id/suggest     — AI-generate 3 message suggestions from thread history
 * POST /api/sms-agent/contacts/:id/pitch       — generate appraisal pitch link from contact's rea_data
 * POST /api/sms-agent/run-ready                — run the CRM-triggered ready-queue poller now
 * GET  /api/sms-agent/settings                 — current toggles (e.g. { autoSend })
 * POST /api/sms-agent/settings                 — update toggles (e.g. { autoSend: true })
 *
 * Static paths are registered before dynamic ones so Express matches correctly.
 */

import { Router } from "express"
import { isDbConnected, execute } from "../lib/db.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { addAgentMessageToThread } from "../lib/conversations.js"
import {
  listContacts, upsertContact, getContactById, markContacted, recordVoiceSignal,
  getUpcomingMeetings, canSendNow, recordAgentMessageSent, countSignalsSinceCalibration,
  updateContact,
  type Relationship,
} from "../lib/smsContacts.js"
import { getSuburbStats } from "../lib/suburbStats.js"
import { getVoiceProfile } from "../lib/voiceProfile.js"
import { calibrateVoice, recalibrateVoice } from "../lib/voiceCalibration.js"
import {
  getPendingAgentDrafts, approveAgentDraft, rejectAgentDraft, markAgentDraftSent, saveAgentDraft,
} from "../lib/smsAgentDrafts.js"
import { generateOpener, generateSuggestions } from "../lib/smsAgent.js"
import { runSmsOrchestration } from "../lib/smsOrchestrator.js"
import { runReadyOutreach } from "../lib/smsReadyOutreach.js"
import { getAgentContext } from "../lib/agentContext.js"
import { getSetting, setSetting } from "../lib/appSettings.js"
import { scoreContacts } from "../lib/prospectability.js"
import { generateMarketReport } from "../lib/marketReport.js"
import { buildStage1TestContact, buildStage2Contact, buildDemoPastClientPersonas, STARTER_VOICE_SAMPLES } from "../data/smsAgentSeed.js"
import { generateAppraisalPayload } from "../lib/appraisalGenerator.js"
import { randomBytes } from "crypto"

const router = Router()

function noDb(res: import("express").Response) {
  return res.status(503).json({ error: "Database not connected — set DATABASE_URL in server/.env" })
}

// ── Contacts ────────────────────────────────────────────────────────────────────

router.get("/contacts", async (req, res) => {
  if (!isDbConnected()) return res.json({ demo: true, contacts: [] })
  const stage = req.query.stage ? parseInt(String(req.query.stage), 10) : undefined
  const status = req.query.status ? String(req.query.status) as never : undefined
  const contacts = await listContacts({ stage, status })
  const scores = await scoreContacts(contacts)
  const enriched = contacts.map(c => {
    const s = scores.get(c.id)
    return { ...c, prospectability: s?.prospectability ?? 50, interest: s?.interest ?? 20, score_label: s?.label ?? "warm", score_highlights: s?.highlights ?? [] }
  })
  res.json({ contacts: enriched })
})

router.post("/contacts", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const { name, phone } = req.body ?? {}
  if (!name || !phone) return res.status(400).json({ error: "name and phone are required" })
  const id = await upsertContact({
    name: String(name),
    phone: String(phone),
    relationship: req.body.relationship as Relationship | undefined,
    stage: req.body.stage ? parseInt(String(req.body.stage), 10) : undefined,
    personalisation: req.body.personalisation,
    voice_override: req.body.voice_override,
    conversation_objective: req.body.conversation_objective,
    auto_reply: req.body.auto_reply,
    source: req.body.source,
  })
  res.json({ ok: true, id })
})

router.patch("/contacts/:id", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" })
  const { personalisation, rea_data, conversation_objective, status, follow_up_at } = req.body ?? {}
  await updateContact(id, { personalisation, rea_data, conversation_objective, status, follow_up_at })
  res.json({ ok: true })
})

router.get("/suburb-stats/:suburb", async (req, res) => {
  if (!isDbConnected()) return res.json({ suburb: req.params.suburb, saleCount: 0, medianPrice: null, fromSoldDb: false })
  const days = parseInt(String(req.query.days ?? "90"), 10)
  const stats = await getSuburbStats(req.params.suburb, isNaN(days) ? 90 : days)
  res.json(stats)
})

// ── Voice ─────────────────────────────────────────────────────────────────────

router.get("/voice-profile", async (req, res) => {
  const agentCtx = await getAgentContext((req as any).agentId)
  const vp = await getVoiceProfile(agentCtx.voiceId)
  res.json(vp)
})

router.post("/calibrate", async (req, res) => {
  const samples: string[] = Array.isArray(req.body?.samples) ? req.body.samples.map(String) : []
  if (samples.length === 0) return res.status(400).json({ error: "samples (string array) is required" })
  const agentCtx = await getAgentContext((req as any).agentId)
  const vp = await calibrateVoice(samples, agentCtx.voiceId)
  res.json({ ok: true, confidence: vp.confidence, samples_analysed: vp.samples_analysed, profile: vp.profile, voiceId: agentCtx.voiceId })
})

router.post("/recalibrate", async (req, res) => {
  const agentCtx = await getAgentContext((req as any).agentId)
  const vp = await recalibrateVoice(agentCtx.voiceId)
  if (!vp) return res.json({ ok: false, message: "Not enough signals to recalibrate yet (need 5+)" })
  res.json({ ok: true, confidence: vp.confidence, samples_analysed: vp.samples_analysed, voiceId: agentCtx.voiceId })
})

// ── Drafts (approval queue) ─────────────────────────────────────────────────────

router.get("/drafts", async (_req, res) => {
  if (!isDbConnected()) return res.json({ demo: true, drafts: [] })
  const drafts = await getPendingAgentDrafts()
  res.json({ drafts })
})

router.post("/drafts/:id/approve", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  const editedBody: string | undefined = req.body?.editedBody ? String(req.body.editedBody) : undefined

  const result = await approveAgentDraft(id, editedBody)
  if (!result) return res.status(404).json({ error: "Draft not found or already actioned" })

  // Learning signal: edited vs approved-as-is.
  await recordVoiceSignal({
    draft_body: result.draftBody,
    action: result.wasEdited ? "edited" : "approved_as_is",
    edited_body: result.wasEdited ? result.body : null,
    contact_id: result.contactId,
  })

  // Continuous voice improvement: recalibrate after every 5 signals (async, non-blocking).
  const agentCtx = await getAgentContext((req as any).agentId)
  void countSignalsSinceCalibration(agentCtx.voiceId).then(n => {
    if (n >= 5) {
      void recalibrateVoice(agentCtx.voiceId).then(vp => {
        if (vp) console.log(`[voice] auto-recalibrated ${agentCtx.voiceId} after ${n} signals (conf ${vp.confidence.toFixed(2)})`)
      }).catch(() => {})
    }
  }).catch(() => {})

  if (!smsConfigured()) {
    return res.json({ ok: true, sent: false, message: "Approved but SMS not configured", body: result.body })
  }

  if (!(await canSendNow(result.contactId))) {
    return res.status(429).json({ ok: false, sent: false, error: "Send cooldown active — try again in a few seconds" })
  }

  // Demo contacts: redirect the send to the REA agent's number being demoed.
  let sendTo = result.contactPhone
  const draftContact = await getContactById(result.contactId)
  if (draftContact?.source.startsWith("seed:demo")) {
    const demoPhone = await getSetting("demo_target_phone")
    if (demoPhone) sendTo = demoPhone
  }

  try {
    await sendSMS(sendTo, result.body)
    await addAgentMessageToThread(sendTo, result.body)
    await markContacted(result.contactId)
    await recordAgentMessageSent(result.contactId)
    await markAgentDraftSent(id)
    res.json({ ok: true, sent: true, body: result.body })
  } catch (err) {
    res.status(502).json({ ok: false, sent: false, error: (err as Error).message })
  }
})

router.post("/drafts/:id/reject", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  const result = await rejectAgentDraft(id)
  if (!result) return res.status(404).json({ error: "Draft not found or already actioned" })
  await recordVoiceSignal({ draft_body: result.draftBody, action: "rejected", contact_id: result.contactId })

  const agentCtxR = await getAgentContext((req as any).agentId)
  void countSignalsSinceCalibration(agentCtxR.voiceId).then(n => {
    if (n >= 5) {
      void recalibrateVoice(agentCtxR.voiceId).then(vp => {
        if (vp) console.log(`[voice] auto-recalibrated ${agentCtxR.voiceId} after ${n} signals (conf ${vp.confidence.toFixed(2)})`)
      }).catch(() => {})
    }
  }).catch(() => {})

  res.json({ ok: true })
})

// ── Meetings + orchestration ────────────────────────────────────────────────────

router.get("/meetings", async (_req, res) => {
  if (!isDbConnected()) return res.json({ demo: true, meetings: [] })
  const meetings = await getUpcomingMeetings(24 * 14)
  res.json({ meetings })
})

router.post("/orchestrate", async (_req, res) => {
  const summary = await runSmsOrchestration()
  res.json(summary)
})

// ── Market reports ──────────────────────────────────────────────────────────────

router.get("/market-report/:suburb", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const suburb = req.params.suburb.replace(/-/g, " ")
  const all = await listContacts({})
  const relevant = all.filter(c => {
    const subs = (c.rea_data?.target_suburbs ?? []) as string[]
    return subs.some(s => s.toLowerCase().includes(suburb.toLowerCase()))
  })
  const agentCtx = await getAgentContext((req as any).agentId)
  const report = await generateMarketReport(suburb, relevant.length > 0 ? relevant : all.slice(0, 5), agentCtx)
  res.json(report)
})

router.post("/sequences/market-report", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const contactId = req.body?.contactId ? parseInt(String(req.body.contactId), 10) : NaN
  const suburb = req.body?.suburb ? String(req.body.suburb).trim() : ""
  if (isNaN(contactId) || !suburb) return res.status(400).json({ error: "contactId and suburb required" })

  const contact = await getContactById(contactId)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  const agentCtx = await getAgentContext((req as any).agentId)
  const marketData = await generateMarketReport(suburb, [contact], agentCtx)

  const objective = `Offer ${contact.name.split(" ")[0]} a free market report for ${suburb}. Key stat: ${marketData.keyStat ?? "strong recent sales"}. Market sentiment: ${marketData.sentiment}. Sequence: (1) Brief natural opener offering the report. (2) If they say yes, send the key stat summary. (3) Offer a free appraisal of their next listing. Keep each message up to 2 segments (~300 chars), natural, not padded.`

  await upsertContact({ name: contact.name, phone: contact.phone, conversation_objective: objective })

  const updated = await getContactById(contactId)
  if (!updated) return res.status(500).json({ error: "Contact update failed" })

  const opener = await generateOpener(updated, agentCtx)
  const draftId = await saveAgentDraft({
    contactId: updated.id,
    draftBody: opener.draft,
    kind: "opener",
    reasoning: `Market report sequence — ${suburb}`,
    voiceConfidence: opener.voiceConfidence,
  })

  res.json({ ok: true, draftId, preview: opener.draft, suburb, report: marketData })
})

// ── Ready-queue (CRM-triggered auto-outreach) ───────────────────────────────────

router.post("/run-ready", async (_req, res) => {
  if (!isDbConnected()) return noDb(res)
  const results = await runReadyOutreach()
  res.json({
    queued: results.map(r => ({
      contactId: r.contactId, name: r.name, draftId: r.draftId, preview: r.preview, skipped: r.skipped,
    })),
  })
})

// ── Settings (Voice tab toggles) ────────────────────────────────────────────────

router.get("/settings", async (_req, res) => {
  if (!isDbConnected()) return res.json({ autoSend: false })
  const value = await getSetting("sms_agent_autosend")
  res.json({ autoSend: value === "true" })
})

router.post("/settings", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  if (typeof req.body?.autoSend !== "boolean") {
    return res.status(400).json({ error: "autoSend (boolean) is required" })
  }
  await setSetting("sms_agent_autosend", req.body.autoSend ? "true" : "false")
  res.json({ ok: true, autoSend: req.body.autoSend })
})

// ── Demo: Past Client Reconnection ──────────────────────────────────────────────

router.get("/demo/target", async (_req, res) => {
  if (!isDbConnected()) return res.json({ phone: null })
  const phone = await getSetting("demo_target_phone")
  res.json({ phone })
})

router.post("/demo/target", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : ""
  if (!phone) return res.status(400).json({ error: "phone (string) is required" })
  await setSetting("demo_target_phone", phone)
  res.json({ ok: true, phone })
})

router.post("/seed-demo-pastclients", async (_req, res) => {
  if (!isDbConnected()) return noDb(res)
  const ids = []
  for (const persona of buildDemoPastClientPersonas()) {
    ids.push(await upsertContact(persona))
  }
  res.json({ ok: true, ids })
})

// Generate an opener and queue it for approval (does not send).
router.post("/contacts/:id/queue-opener", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  const contact = await getContactById(id)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  const agentCtx = await getAgentContext((req as any).agentId)
  const opener = await generateOpener(contact, agentCtx)
  const draftId = await saveAgentDraft({
    contactId: contact.id,
    draftBody: opener.draft,
    kind: "opener",
    reasoning: (contact.personalisation?.scenario as string) ?? "Queued opener",
    voiceConfidence: opener.voiceConfidence,
  })
  res.json({ ok: true, draftId, preview: opener.draft })
})

// ── Seed (Stage 1 test bed) ─────────────────────────────────────────────────────

router.post("/seed-stage1", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const name = req.body?.name ? String(req.body.name) : "Test Partner"
  const contact = buildStage1TestContact(name)
  const id = await upsertContact(contact)
  // Bootstrap a low-confidence voice profile from the starter samples.
  const vp = await calibrateVoice(STARTER_VOICE_SAMPLES)
  res.json({
    ok: true,
    contactId: id,
    phone: contact.phone,
    voiceConfidence: vp.confidence,
    note: "Replace starter samples via POST /calibrate with 20+ of Vinuth's real texts. Sends redirect to TEST_RECIPIENT_PHONE.",
  })
})

// ── Seed Stage 2 contact ────────────────────────────────────────────────────────

router.post("/seed-stage2", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const name = req.body?.name ? String(req.body.name) : "Stage 2 Contact"
  const phone = req.body?.phone ? String(req.body.phone) : "+61426719845"
  const contact = buildStage2Contact(name, phone, req.body?.personalisation)
  const id = await upsertContact(contact)
  res.json({
    ok: true,
    contactId: id,
    phone: contact.phone,
    note: "Stage 2 contact added. Messages go to their REAL number (not test-redirected). Use /contacts/:id/suggest for AI recommendations.",
  })
})

// ── Suggest (AI-generated message options based on thread history) ───────────

router.post("/contacts/:id/suggest", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  const contact = await getContactById(id)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  const agentCtx = await getAgentContext((req as any).agentId)
  const result = await generateSuggestions(contact, agentCtx)
  res.json(result)
})

// ── Send (manual message typed in PropOS, delivered via iMessage) ──────────────

router.post("/contacts/:id/send", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  const body = typeof req.body?.message === "string" ? req.body.message.trim() : ""
  if (!body) return res.status(400).json({ error: "message is required" })

  const contact = await getContactById(id)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  if (!smsConfigured()) return res.status(503).json({ error: "SMS not configured" })
  if (!(await canSendNow(id))) {
    return res.status(429).json({ ok: false, sent: false, error: "Send cooldown active — try again in a few seconds" })
  }

  try {
    await sendSMS(contact.phone, body)
    await addAgentMessageToThread(contact.phone, body, { leadName: contact.name })
    await markContacted(id)
    await recordAgentMessageSent(id)
    res.json({ ok: true, sent: true })
  } catch (err) {
    res.status(502).json({ ok: false, sent: false, error: (err as Error).message })
  }
})

// ── Generate appraisal pitch link ───────────────────────────────────────────────

router.post("/contacts/:id/pitch", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" })

  const contact = await getContactById(id)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  const rd = (contact.rea_data ?? {}) as Record<string, unknown>
  const address = ((rd.recently_sold_address as string | undefined) ?? "").trim()
  const suburbs = rd.target_suburbs as string[] | undefined
  const suburb  = (suburbs?.[0] ?? "").trim()

  if (!address || !suburb) {
    return res.status(400).json({
      error: "Contact needs a last sold address and at least one target suburb to generate a pitch",
    })
  }

  const agentCtx = await getAgentContext(req.agentId ? Number(req.agentId) : null)

  let payload: Awaited<ReturnType<typeof generateAppraisalPayload>>
  try {
    payload = await generateAppraisalPayload({
      property: { address, suburb, beds: 3, baths: 2, parking: 1, propertyType: "House" },
      agent:    { name: agentCtx.name, agency: agentCtx.agency, suburb },
    })
  } catch (err) {
    return res.status(500).json({ error: `Pitch generation failed: ${(err as Error).message}` })
  }

  const slug    = randomBytes(6).toString("base64url")
  const agentId = req.agentId ? String(req.agentId) : "default"
  const base    = process.env.BASE_URL ?? "https://propos.addvantage.site"
  const url     = `${base}/p/${slug}`

  await execute(
    `INSERT INTO pitches (type, slug, agent_id, payload_json, status) VALUES ('appraisal', $1, $2, $3, 'draft')`,
    [slug, agentId, JSON.stringify(payload)],
  )

  // Merge pitch_url into personalisation so the opener prompt sees it automatically
  await updateContact(id, { personalisation: { pitch_url: url } })

  res.json({ url, slug })
})

// ── Initiate (generate + send an opener) ────────────────────────────────────────

router.post("/initiate/:contactId", async (req, res) => {
  if (!isDbConnected()) return noDb(res)
  const contactId = parseInt(req.params.contactId, 10)
  const contact = await getContactById(contactId)
  if (!contact) return res.status(404).json({ error: "Contact not found" })

  const agentCtx = await getAgentContext((req as any).agentId)
  const opener = await generateOpener(contact, agentCtx)
  if (!smsConfigured()) {
    return res.json({ ok: true, sent: false, draft: opener.draft, message: "SMS not configured — draft only" })
  }
  if (!(await canSendNow(contactId))) {
    return res.status(429).json({ ok: false, sent: false, error: "Send cooldown active — try again in a few seconds" })
  }
  try {
    await sendSMS(contact.phone, opener.draft)
    await addAgentMessageToThread(contact.phone, opener.draft, { leadName: contact.name })
    await markContacted(contactId, { incrementAttempts: true })
    await recordAgentMessageSent(contactId)
    res.json({ ok: true, sent: true, draft: opener.draft, charCount: opener.charCount })
  } catch (err) {
    res.status(502).json({ ok: false, sent: false, error: (err as Error).message })
  }
})

export default router
