/**
 * Google Sheet integration — reads leads via Apps Script doGet,
 * writes events/transcripts via doPost.
 *
 * Apps Script to deploy (replace the one in src/lib/sheet.ts):
 *
 * ── paste this into Extensions → Apps Script ─────────────────────────────────
 *
 * function doGet() {
 *   const ss = SpreadsheetApp.getActiveSpreadsheet()
 *   const sh = ss.getSheetByName("Leads")
 *   if (!sh) return json({ leads: [] })
 *   const [header, ...rows] = sh.getDataRange().getValues()
 *   const leads = rows
 *     .filter(row => row[0]) // skip empty rows
 *     .map(row => {
 *       const obj = {}
 *       header.forEach((h, i) => obj[h] = row[i] ?? "")
 *       return obj
 *     })
 *   return json({ leads })
 * }
 *
 * function doPost(e) {
 *   const data = JSON.parse(e.postData.contents)
 *   const ss = SpreadsheetApp.getActiveSpreadsheet()
 *
 *   if (data.type === "update_lead") {
 *     const sh = ss.getSheetByName("Leads")
 *     if (!sh) return json({ ok: false, error: "Leads sheet not found" })
 *     const vals = sh.getDataRange().getValues()
 *     const header = vals[0]
 *     const col = header.indexOf(data.field)
 *     const rowIdx = vals.findIndex((r, i) => i > 0 && String(r[0]) === String(data.id))
 *     if (rowIdx > 0 && col >= 0) sh.getRange(rowIdx + 1, col + 1).setValue(data.value)
 *     return json({ ok: true })
 *   }
 *
 *   // Default: append to Actions tab
 *   const sh = ss.getSheetByName("Actions") || ss.getActiveSheet()
 *   sh.appendRow([
 *     data.timestamp, data.type, data.name, data.agency,
 *     data.phone, data.action, data.lead, data.detail
 *   ])
 *   return json({ ok: true })
 * }
 *
 * function json(obj) {
 *   return ContentService.createTextOutput(JSON.stringify(obj))
 *     .setMimeType(ContentService.MimeType.JSON)
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Leads tab headers (Row 1):
 *   id | name | phone | email | budget | timeline | persona | notes | transcript | grade | lastContact | questions
 *
 * Actions tab headers (Row 1):
 *   Timestamp | Type | Name | Agency | Phone | Action | Lead | Detail
 */

const SHEET_URL = process.env.SHEET_URL ?? ""

export interface SheetLead {
  id: string
  name: string
  phone: string
  email: string
  budget: string
  timeline: string
  persona: string
  notes: string
  transcript: string
  grade: string
  lastContact: string
  questions: string
}

/** Fetch all leads from the Leads tab */
export async function fetchLeads(): Promise<SheetLead[]> {
  if (!SHEET_URL) return []
  try {
    const res = await fetch(SHEET_URL)
    const json = await res.json() as { leads?: SheetLead[] }
    return json.leads ?? []
  } catch {
    return []
  }
}

/** Write a transcript back to a lead row */
export async function saveTranscript(id: string, transcript: string): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ type: "update_lead", id, field: "transcript", value: transcript }),
    })
  } catch { /* fail silently */ }
}

/** Append an event row to the Actions tab */
export async function logAction(row: Record<string, string>): Promise<void> {
  if (!SHEET_URL) return
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ timestamp: new Date().toISOString(), ...row }),
    })
  } catch { /* fail silently */ }
}
