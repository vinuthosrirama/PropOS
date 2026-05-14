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
  eventType: "voice_note" | "outreach_sent" | "lead_matched" | "lead_added"
  transcript?: string
  smsText?: string
  emailSubject?: string
  emailBody?: string
  detail?: string
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
    questions:         String(row.questions ?? "").split(";").map(q => q.trim()).filter(Boolean),
  }
}

// Try one address string against the Leads tab, return null on any error.
async function fetchLeadsByAddress(address: string): Promise<SheetLead[] | null> {
  try {
    const url = `${SHEET_URL}?action=getLeads&property=${encodeURIComponent(address)}`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.leads || !Array.isArray(data.leads)) return null
    return (data.leads as Record<string, unknown>[]).map(mapLeadRow)
  } catch {
    return null
  }
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
  try {
    const url = `${SHEET_URL}?action=getAllLeads`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.leads || !Array.isArray(data.leads)) return null
    return (data.leads as Record<string, unknown>[]).map(mapLeadRow)
  } catch {
    return null
  }
}

// ── New: read a property SLM from PropertySLM tab ──────────────────────────

export async function readPropertySLMFromSheet(propertyId: number): Promise<Record<string, unknown> | null> {
  if (!SHEET_URL) return null
  try {
    const url = `${SHEET_URL}?action=getPropertySLM&propertyId=${propertyId}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.slm ?? null
  } catch {
    return null
  }
}
