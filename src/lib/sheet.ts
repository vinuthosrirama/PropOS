/**
 * Google Sheet integration via Google Apps Script web app.
 *
 * SHEET STRUCTURE — Three tabs required:
 *
 * Tab 1: "Leads"
 *   Headers: id | name | phone | email | budget | timeline | persona | notes |
 *            inspectedProperty | lastContact | questions
 *   Note: questions is semicolon-separated. inspectedProperty = full property address.
 *
 * Tab 2: "PropertySLM"
 *   Headers: propertyId | address | status | beds | baths | ... (all 100 SLM fields) |
 *            qa_1_question | qa_1_answer | ... qa_25_question | qa_25_answer
 *   One row per property (active + sold).
 *
 * Tab 3: "Events"
 *   Headers: timestamp | leadId | leadName | propertyAddress | fromProperty |
 *            eventType | transcript | smsText | emailSubject | emailBody | detail
 *
 * APPS SCRIPT — Replace your doPost + add doGet:
 *
 * function doPost(e) {
 *   const ss = SpreadsheetApp.getActiveSpreadsheet()
 *   const data = JSON.parse(e.postData.contents)
 *
 *   if (data.type === "event") {
 *     const sh = ss.getSheetByName("Events") || ss.insertSheet("Events")
 *     sh.appendRow([data.timestamp, data.leadId, data.leadName, data.propertyAddress,
 *       data.fromProperty, data.eventType, data.transcript, data.smsText,
 *       data.emailSubject, data.emailBody, data.detail])
 *   } else {
 *     const sh = ss.getSheetByName("Sheet1") || ss.getActiveSheet()
 *     sh.appendRow([data.timestamp, data.type, data.name, data.agency,
 *       data.phone, data.action, data.lead, data.detail])
 *   }
 *   return ContentService.createTextOutput(JSON.stringify({ ok: true }))
 *     .setMimeType(ContentService.MimeType.JSON)
 * }
 *
 * function doGet(e) {
 *   const ss = SpreadsheetApp.getActiveSpreadsheet()
 *   const action = e.parameter.action
 *
 *   if (action === "getLeads") {
 *     const prop = e.parameter.property
 *     const sheet = ss.getSheetByName("Leads")
 *     if (!sheet) return json({ leads: [] })
 *     const [headers, ...rows] = sheet.getDataRange().getValues()
 *     const idx = headers.indexOf("inspectedProperty")
 *     const leads = rows
 *       .filter(r => String(r[idx]).trim() === String(prop).trim())
 *       .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
 *     return json({ leads })
 *   }
 *
 *   if (action === "getAllLeads") {
 *     const sheet = ss.getSheetByName("Leads")
 *     if (!sheet) return json({ leads: [] })
 *     const [headers, ...rows] = sheet.getDataRange().getValues()
 *     const leads = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
 *     return json({ leads })
 *   }
 *
 *   if (action === "getPropertySLM") {
 *     const propId = String(e.parameter.propertyId)
 *     const sheet = ss.getSheetByName("PropertySLM")
 *     if (!sheet) return json({ slm: null })
 *     const [headers, ...rows] = sheet.getDataRange().getValues()
 *     const idIdx = headers.indexOf("propertyId")
 *     const row = rows.find(r => String(r[idIdx]) === propId)
 *     if (!row) return json({ slm: null })
 *     return json({ slm: Object.fromEntries(headers.map((h, i) => [h, row[i]])) })
 *   }
 *
 *   return json({ error: "unknown action" })
 * }
 *
 * function json(obj) {
 *   return ContentService.createTextOutput(JSON.stringify(obj))
 *     .setMimeType(ContentService.MimeType.JSON)
 * }
 */

import { apiUrl } from "./api"

const SHEET_URL: string = import.meta.env.VITE_SHEET_URL ?? ""

export function sheetsConnected(): boolean {
  return !!SHEET_URL
}

// ── Legacy write events ───────────────────────────────────────────────────────

export type SheetEvent =
  | { type: "demo_request"; name: string; agency: string; phone?: string }
  | { type: "message_approved"; lead: string; action: string; detail?: string }
  | { type: "lead_reactivated"; lead: string; strategy: string; detail?: string }

export async function postToSheet(event: SheetEvent): Promise<void> {
  if (!SHEET_URL) return
  const row: Record<string, string> = {
    timestamp: new Date().toISOString(),
    type: event.type,
    name: event.type === "demo_request" ? event.name : "",
    agency: event.type === "demo_request" ? event.agency : "",
    phone: event.type === "demo_request" ? (event.phone ?? "") : "",
    action: event.type === "message_approved" ? event.action : "",
    lead:
      event.type === "message_approved" ? event.lead
      : event.type === "lead_reactivated" ? event.lead : "",
    detail:
      event.type === "message_approved" ? (event.detail ?? "")
      : event.type === "lead_reactivated" ? event.strategy : "",
  }
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(row),
    })
  } catch {
    // fail silently
  }
}

// ── New: write a timestamped event to the Events tab ────────────────────────

export interface SheetEventV2 {
  leadId: string
  leadName: string
  propertyAddress: string   // active listing being pitched
  fromProperty: string      // sold property lead came from
  eventType:
    | "voice_note" | "outreach_sent" | "lead_matched" | "lead_added"
    | "open_home_attended" | "lead_status_update" | "auction_outcome"
    | "clipboard_copied" | "outreach_replied" | "email_opened" | "email_clicked"
  transcript?: string
  smsText?: string
  emailSubject?: string
  emailBody?: string
  detail?: string
  matchScore?: number
  leadGrade?: string
  deliveryChannel?: "sms" | "email" | "both"
  deliverySid?: string
  sendgridId?: string
  leadStatus?: string
}

export async function postEvent(event: SheetEventV2): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "event",
        timestamp: new Date().toISOString(),
        leadId: event.leadId,
        leadName: event.leadName,
        propertyAddress: event.propertyAddress,
        fromProperty: event.fromProperty,
        eventType: event.eventType,
        transcript: event.transcript ?? "",
        smsText: event.smsText ?? "",
        emailSubject: event.emailSubject ?? "",
        emailBody: event.emailBody ?? "",
        detail: event.detail ?? "",
      }),
    })
  } catch {
    // fail silently
  }
}

// ── New: read leads for a specific property from Leads tab ──────────────────

export interface SheetLead {
  id: string
  name: string
  phone: string
  email: string
  budget: number
  timeline: string
  persona: string
  notes: string
  inspectedProperty: string
  lastContact: string
  questions: string[]
  // Outreach history — written back by patch_lead_outreach, read by getAllLeads
  generatedSMS?: string
  generatedEmail?: string
  emailSubject?: string
  lastContactDate?: string  // ISO date of last outreach send
}

// Fallback questions for known demo leads — used when Sheet data is corrupted
const DEMO_FALLBACK_QUESTIONS: Record<string, string[]> = {
  // Cameron Knoll / Peake
  "james whitfield":  ["School zone?", "Backyard dimensions?", "Renovation history?"],
  "claire thompson":  ["Primary school catchment?", "Second bedroom size?", "Walk to train?"],
  "michael tran":     ["Rental yield?", "Vacancy rate in suburb?", "Comparable sales last 90 days?"],
  "kevin liu":        ["Rental appraisal?", "Gross yield at asking price?", "Body corporate fees?"],
  "simone dubois":    ["Maternal health centre nearby?", "Nursery room size?", "Quiet street?"],
  // Pas Sunilchandra / Area Specialist
  "liam o'brien":     ["School zone?", "Backyard size?", "How far to Berwick train station?"],
  "raj patel":        ["Rental yield?", "Vacancy rate in Berwick?", "Comparable sales last 90 days?"],
  "sophie nguyen":    ["School zone?", "NBN type?", "Ducted air conditioning?"],
  "david kim":        ["Rental yield?", "Vacancy rate in suburb?", "Body corporate fees?"],
  "priya sharma":     ["Primary school catchment?", "Quiet street?", "Parks nearby?"],
  "jake thompson":    ["First home buyer stamp duty?", "Comparable sales nearby?", "Solar system size?"],
  "marcus chen":      ["Rental yield?", "Comparable sales last 90 days?", "Vacancy rate in Clyde North?"],
  "anika johansson":  ["First home buyer grant?", "School zone?", "Future infrastructure nearby?"],
}

// ── Lead row mapper (shared) ──────────────────────────────────────────────────

function mapLeadRow(row: Record<string, unknown>): SheetLead {
  return {
    id:                String(row.id ?? ""),
    name:              String(row.name ?? ""),
    phone:             String(row.phone ?? ""),
    email:             String(row.email ?? ""),
    budget:            Number(row.budget ?? 0),
    timeline:          String(row.timeline ?? ""),
    persona:           String(row.persona ?? ""),
    notes:             String(row.notes ?? ""),
    inspectedProperty: String(row.inspectedProperty ?? ""),
    lastContact:       String(row.lastContact ?? ""),
    generatedSMS:      row.generatedSMS  ? String(row.generatedSMS)  : undefined,
    generatedEmail:    row.generatedEmail ? String(row.generatedEmail) : undefined,
    emailSubject:      row.emailSubject  ? String(row.emailSubject)  : undefined,
    lastContactDate:   row.lastContactDate ? String(row.lastContactDate) : undefined,
    questions:         (() => {
      const raw = String(row.questions ?? "")
      // Guard: if the questions field is suspiciously long (>200 chars), it's likely
      // corrupted with email body text from a prior /api/transcript POST. Discard it.
      if (raw.length > 200) {
        // Try to recover from demo fallback data by lead name
        const leadName = String(row.name ?? "").trim()
        const fallback = DEMO_FALLBACK_QUESTIONS[leadName.toLowerCase()]
        return fallback ?? []
      }
      return raw.split(";").map(q => q.trim()).filter(Boolean)
    })(),
  }
}

// Try one address string against the Leads tab, with one automatic retry on failure.
async function fetchLeadsByAddress(address: string): Promise<SheetLead[] | null> {
  const url = `${SHEET_URL}?action=getLeads&property=${encodeURIComponent(address)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) { if (attempt === 0) continue; return null }
      const data = await res.json()
      if (!data.leads || !Array.isArray(data.leads)) { if (attempt === 0) continue; return null }
      return (data.leads as Record<string, unknown>[]).map(mapLeadRow)
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

/**
 * Reads leads for a property from the Google Sheets "Leads" tab.
 * Tries multiple address formats to maximise match likelihood:
 *   1. Exact string as provided (e.g. "48 President Road, Narre Warren South")
 *   2. Address only, no suburb (e.g. "48 President Road")
 *   3. With VIC postcode suffix (e.g. "48 President Road, Narre Warren South VIC 3805")
 * Returns the first non-empty result, [] if all queries return empty, null on total failure.
 */
export async function readLeadsFromSheet(propertyAddress: string): Promise<SheetLead[] | null> {
  if (!SHEET_URL) return null

  // Build candidate address variants
  const candidates = [
    propertyAddress,
    propertyAddress.split(",")[0].trim(),          // address only
    propertyAddress.replace(/\s*VIC.*$/, "").trim(), // strip state/postcode
  ]
  // Deduplicate
  const unique = [...new Set(candidates)].filter(Boolean)

  for (const addr of unique) {
    const result = await fetchLeadsByAddress(addr)
    if (result && result.length > 0) return result
  }

  // All returned empty — return [] (property has no leads, not an error)
  return []
}

// ── Read ALL leads from sheet (no property filter) — for global matching ──────

export async function readAllLeadsFromSheet(): Promise<SheetLead[] | null> {
  if (!SHEET_URL) return null
  const url = `${SHEET_URL}?action=getAllLeads`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) { if (attempt === 0) continue; return null }
      const data = await res.json()
      if (!data.leads || !Array.isArray(data.leads)) { if (attempt === 0) continue; return null }
      return (data.leads as Record<string, unknown>[]).map(mapLeadRow)
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

// ── New: read a property SLM from PropertySLM tab ──────────────────────────

export async function readPropertySLMFromSheet(propertyId: number): Promise<Record<string, unknown> | null> {
  if (!SHEET_URL) return null
  const url = `${SHEET_URL}?action=getPropertySLM&propertyId=${propertyId}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) { if (attempt === 0) continue; return null }
      const data = await res.json()
      if (data.slm) return data.slm
      if (attempt === 0) continue
      return null
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

// ── Lead status update ────────────────────────────────────────────────────────

export async function postLeadStatus(params: {
  leadId: string
  leadName: string
  propertyAddress: string
  status: string
  detail?: string
}): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "lead_status",
        timestamp: new Date().toISOString(),
        ...params,
      }),
    })
  } catch { /* fail silently */ }
}

// ── Mark lead as attended an open home ───────────────────────────────────────

export async function markAttended(params: {
  leadId: string
  leadName: string
  propertyAddress: string
}): Promise<void> {
  return postLeadStatus({ ...params, status: "open_home_attended" })
}

// ── Post auction outcome ──────────────────────────────────────────────────────

export async function postAuctionOutcome(outcome: import("../data").AuctionOutcome): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "auction_outcome",
        timestamp: new Date().toISOString(),
        ...outcome,
      }),
    })
  } catch { /* fail silently */ }
}

// ── Agent Voice corpus — GSheets as source-of-truth for outreach examples ────
// Apps Script must handle: action=getVoiceCorpus → {entries:[{text,type,channel,ts}]}
// and POST type=voice_corpus_entry → appends to VoiceCorpus tab

export interface VoiceCorpusEntry {
  text: string
  type: "sms" | "email_subject" | "email_body"
  channel: "sms" | "email"
  ts: string
}

export async function readAgentVoiceCorpus(): Promise<VoiceCorpusEntry[]> {
  if (!SHEET_URL) return []
  try {
    const res = await fetch(`${SHEET_URL}?action=getVoiceCorpus`, { cache: "no-store" })
    if (!res.ok) return []
    const data = await res.json() as { entries?: VoiceCorpusEntry[] }
    return data.entries ?? []
  } catch { return [] }
}

export async function writeAgentVoiceEntry(entry: VoiceCorpusEntry): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "voice_corpus_entry", entry }),
    })
  } catch { /* fail silently */ }
}

// ── SLM two-way sync — write SLM field changes back to GSheets ───────────────
// Apps Script must handle POST type=slm_update with {propertyId, field, value}

export async function writeSLMFieldToSheet(propertyId: number, field: string, value: unknown): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "slm_update",
        timestamp: new Date().toISOString(),
        propertyId,
        field,
        value: String(value),
      }),
    })
  } catch { /* fail silently */ }
}

// ── Past Buyers tab — vendor prospecting CRM ─────────────────────────────────
//
// Apps Script must handle:
//   GET  ?action=getPastBuyers          → { buyers: PastBuyerRow[] }
//   POST type=update_past_buyer_contact → { id: number, lastContactDate: string, lastMessage?: string }
//
// "Past Buyers" tab column order (A–S):
//   A: id | B: name | C: phone | D: email | E: purchaseAddress | F: suburb
//   G: purchaseDate | H: purchasePrice | I: deposit | J: propertyType
//   K: beds | L: baths | M: land | N: status | O: notes
//   P: lastContactDate | Q: lastMessage | R: personalisationHook | S: currentEstimateOverride
//
//   personalisationHook (col R) — one-sentence hook the agent writes about this person
//     e.g. "Jason mentioned CGT discount window after the 40 Jack William Way sale"
//     When present, PropOS passes it directly to the AI outreach writer — skipping the
//     Haiku extraction step — giving the agent full control over the personalisation angle.
//
//   currentEstimateOverride (col S) — agent-entered current market value ($)
//     Overrides the PropOS auto-estimate. Use this after an appraisal visit or when
//     agent has inside knowledge of recent comparable sales.
//
// ── Agents tab — agent profile directory ──────────────────────────────────────
//
// Apps Script must also handle:
//   GET  ?action=getAgentProfile&name=...&agency=... → { profile: AgentSheetProfile }
//
// "Agents" tab column order:
//   name | agency | phone | email | tagline | suburb
//
// Apps Script doGet addition:
//   if (action === "getAgentProfile") {
//     const name   = (e.parameter.name   || "").toLowerCase().trim()
//     const agency = (e.parameter.agency || "").toLowerCase().trim()
//     const sheet  = ss.getSheetByName("Agents")
//     if (!sheet) return json({ profile: null })
//     const [headers, ...rows] = sheet.getDataRange().getValues()
//     const row = rows.find(r =>
//       String(r[0]).toLowerCase().includes(name.split(" ")[0]) &&
//       String(r[1]).toLowerCase().includes(agency.split(" ")[0])
//     )
//     if (!row) return json({ profile: null })
//     return json({ profile: Object.fromEntries(headers.map((h, i) => [h, row[i]])) })
//   }

export interface PastBuyerRow {
  id: number
  name: string
  phone: string
  email?: string
  purchaseAddress: string
  suburb: string
  purchaseDate: string
  purchasePrice: number
  deposit?: number
  propertyType: "House" | "Unit" | "Townhouse"
  beds: number
  baths: number
  land?: number
  status: "owner-occupier" | "investor" | "renter" | "buyer→landlord" | "buyer→seller" | "renter→buyer" | "buyer→downsizer" | "unknown"
  notes: string
  lastContactDate?: string
  lastMessage?: string              // col Q — last outreach snippet written back to sheet
  contractTerms?: string
  personalisationHook?: string      // col R — pre-written AI outreach hook (bypasses Haiku step)
  currentEstimateOverride?: number  // col S — agent-entered current market value
}

// ── Agent profile from Agents tab ────────────────────────────────────────────

export interface AgentSheetProfile {
  phone?:    string
  email?:    string
  tagline?:  string
  suburb?:   string
}

/**
 * Fetch an agent's profile from the "Agents" Google Sheets tab.
 * Returns null when not found or sheet not connected.
 * Used by AgentLogin to auto-fill phone/email/tagline from the sheet
 * rather than hardcoding values in the app.
 */
export async function readAgentProfileFromSheet(name: string, agency: string): Promise<AgentSheetProfile | null> {
  if (!SHEET_URL) return null
  const url = `${SHEET_URL}?action=getAgentProfile&name=${encodeURIComponent(name)}&agency=${encodeURIComponent(agency)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json() as { profile?: AgentSheetProfile | null; error?: string }
    if (data.error || !data.profile) return null
    return data.profile
  } catch { return null }
}

function mapPastBuyerRow(row: Record<string, unknown>): PastBuyerRow {
  return {
    id:              Number(row.id ?? 0),
    name:            String(row.name ?? ""),
    phone:           String(row.phone ?? ""),
    email:           row.email ? String(row.email) : undefined,
    purchaseAddress: String(row.purchaseAddress ?? ""),
    suburb:          String(row.suburb ?? ""),
    purchaseDate:    String(row.purchaseDate ?? ""),
    purchasePrice:   Number(row.purchasePrice ?? 0),
    deposit:         row.deposit ? Number(row.deposit) : undefined,
    propertyType:    (["House", "Unit", "Townhouse"].includes(String(row.propertyType))
                       ? String(row.propertyType) : "House") as PastBuyerRow["propertyType"],
    beds:            Number(row.beds ?? 0),
    baths:           Number(row.baths ?? 0),
    land:            row.land ? Number(row.land) : undefined,
    status:          (["owner-occupier", "investor", "renter", "buyer→landlord", "buyer→seller", "renter→buyer", "buyer→downsizer", "unknown"].includes(String(row.status))
                       ? String(row.status) : "unknown") as PastBuyerRow["status"],
    notes:           String(row.notes ?? ""),
    lastContactDate:          row.lastContactDate ? String(row.lastContactDate) : undefined,
    lastMessage:              row.lastMessage ? String(row.lastMessage) : undefined,
    contractTerms:            row.contractTerms ? String(row.contractTerms) : undefined,
    personalisationHook:      row.personalisationHook ? String(row.personalisationHook).trim() : undefined,
    currentEstimateOverride:  row.currentEstimateOverride ? Number(row.currentEstimateOverride) : undefined,
  }
}

/**
 * Read all rows from the "Past Buyers" sheet tab.
 * Returns null on network error, [] if the tab exists but has no data.
 */
export async function readPastBuyersFromSheet(): Promise<PastBuyerRow[] | null> {
  if (!SHEET_URL) return null
  const url = `${SHEET_URL}?action=getPastBuyers`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) { if (attempt === 0) continue; return null }
      const data = await res.json() as { buyers?: Record<string, unknown>[]; error?: string }
      if (data.error) return null
      if (!data.buyers || !Array.isArray(data.buyers)) { if (attempt === 0) continue; return null }
      return data.buyers.map(mapPastBuyerRow)
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

/**
 * Write the last contact date and (optionally) the last sent message back to
 * the Past Buyers sheet tab.  Uses POST type=update_past_buyer_contact.
 * Apps Script must handle columns P (lastContactDate) and Q (lastMessage).
 */
export async function updateLastContactDate(
  buyerId: number,
  date?: string,
  lastMessage?: string,
): Promise<void> {
  if (!SHEET_URL) return
  const lastContactDate = date ?? new Date().toISOString().slice(0, 10)
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        type: "update_past_buyer_contact",
        id: buyerId,
        lastContactDate,
        ...(lastMessage ? { lastMessage: lastMessage.slice(0, 500) } : {}),
      }),
    })
  } catch { /* fail silently */ }
}

// ── Read leads from Boxdice via server proxy (when configured) ───────────────

export async function readLeadsFromBoxdice(listingId: number, listingAddress: string): Promise<SheetLead[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/boxdice/leads?listingId=${listingId}&listingAddress=${encodeURIComponent(listingAddress)}`))
    if (!res.ok) return null
    const data = await res.json() as { ok?: boolean; leads?: SheetLead[] }
    return data.leads ?? null
  } catch {
    return null
  }
}
