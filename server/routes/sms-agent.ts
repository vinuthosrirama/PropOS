/**
 * Conversational SMS Agent API (Stages 1-4 — see docs/SMS_AGENT.md)
 *
 * GET  /api/sms-agent/contacts                 — list contacts (?stage= ?status=)
 * POST /api/sms-agent/contacts                 — add / update a contact
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
 * POST /api/sms-agent/run-ready                — run the CRM-triggered ready-queue poller now
 * GET  /api/sms-agent/settings                 — current toggles (e.g. { autoSend })
 * POST /api/sms-agent/settings                 — update toggles (e.g. { autoSend: true })
 *
 * Static paths are registered before dynamic ones so Express matches correctly.
 */

import { Router } from "express"
import { isDbConnected } from "../lib/db.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { addAgentMessageToThread } from "../lib/conversations.js"
import {
  listContacts, upsertContact, getContactById, markContacted, recordVoiceSignal,
  getUpcomingMeetings, canSendNow, recordAgentMessageSent, type Relationship,
} from "../lib/smsContacts.js"
import { getVoiceProfile } from "../lib/voiceProfile.js"
import { calibrateVoice, recalibrateVoice } from "../lib/voiceCalibration.js"
import {
  getPendingAgentDrafts, approveAgentDraft, rejectAgentDraft, markAgentDraftSent,
} from "../lib/smsAgentDrafts.js"
import { generateOpener, generateSuggestions } from "../lib/smsAgent.js"
import { runSmsOrchestration } from "../lib/smsOrchestrator.js"
import { runReadyOutreach } from "../lib/smsReadyOutreach.js"
import { getAgentContext } from "../lib/agentContext.js"
import { getSetting, setSetting } from "../lib/appSettings.js"
import { buildStage1TestContact, buildStage2Contact, STARTER_VOICE_SAMPLES } from "../data/smsAgentSeed.js"

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
  res.json({ contacts })
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

  if (!smsConfigured()) {
    return res.json({ ok: true, sent: false, message: "Approved but SMS not configured", body: result.body })
  }

  if (!(await canSendNow(result.contactId))) {
    return res.status(429).json({ ok: false, sent: false, error: "Send cooldown active — try again in a few seconds" })
  }

  try {
    await sendSMS(result.contactPhone, result.body)
    await addAgentMessageToThread(result.contactPhone, result.body)
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
