/**
 * PropOS — Complete Google Apps Script Web App
 *
 * REPLACES your existing script entirely. Handles:
 *   Tab "Leads"       — buyer outreach CRM (patch_lead_outreach, upsert_lead)
 *   Tab "Past Buyers" — vendor prospecting CRM (get/add/update)
 *   Tab "Events"      — outreach event log
 *
 * DEPLOY: Extensions → Apps Script → Deploy → New deployment
 *   Execute as: Me
 *   Who has access: Anyone
 *   Copy the Web app URL → paste as VITE_SHEET_URL in .env.local AND SHEET_URL in server/.env
 */

// ── "Leads" tab column positions (1-indexed) ─────────────────────────────────
var COL_ID              = 1   // A
var COL_NAME            = 2   // B
var COL_PHONE           = 3   // C
var COL_EMAIL           = 4   // D
var COL_BUDGET          = 5   // E
var COL_SUBURB          = 6   // F
var COL_PROPERTY        = 7   // G
var COL_NOTES           = 8   // H
var COL_PERSONA         = 9   // I
var COL_GENERATED_SMS   = 10  // J
var COL_GENERATED_EMAIL = 11  // K
var COL_EMAIL_SUBJECT   = 12  // L
var COL_TRANSCRIPT      = 13  // M
var COL_STATUS          = 14  // N
var COL_TIMESTAMP       = 15  // O

var SHEET_NAME = "Leads"

// ── "Past Buyers" tab column positions (1-indexed) ───────────────────────────
var PB_COL_ID              = 1   // A
var PB_COL_NAME            = 2   // B
var PB_COL_PHONE           = 3   // C
var PB_COL_EMAIL           = 4   // D
var PB_COL_PURCHASE_ADDR   = 5   // E
var PB_COL_SUBURB          = 6   // F
var PB_COL_PURCHASE_DATE   = 7   // G
var PB_COL_PURCHASE_PRICE  = 8   // H
var PB_COL_DEPOSIT         = 9   // I
var PB_COL_PROPERTY_TYPE   = 10  // J
var PB_COL_BEDS            = 11  // K
var PB_COL_BATHS           = 12  // L
var PB_COL_LAND            = 13  // M
var PB_COL_STATUS          = 14  // N
var PB_COL_NOTES           = 15  // O
var PB_COL_LAST_CONTACT    = 16  // P

var PB_SHEET_NAME = "Past Buyers"

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

function findRowById(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return -1
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) return i + 2
  }
  return -1
}

function findRowByName(sheet, name) {
  if (!name || sheet.getLastRow() < 2) return -1
  var names = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues()
  var target = String(name).trim().toLowerCase()
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim().toLowerCase() === target) return i + 2
  }
  return -1
}

// ── GET ───────────────────────────────────────────────────────────────────────

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || ""

  // ── Health check (no action) ─────────────────────────────────────────────
  if (!action) {
    return json({ ok: true, service: "PropOS Sheet Sync", ts: new Date().toISOString() })
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet()

  // ── Leads: filter by property ────────────────────────────────────────────
  if (action === "getLeads") {
    var prop = e.parameter.property || ""
    var sheet = ss.getSheetByName(SHEET_NAME)
    if (!sheet) return json({ leads: [] })
    var data = sheet.getDataRange().getValues()
    var headers = data[0]
    var rows = data.slice(1)
    var idx = headers.indexOf("inspectedProperty")
    if (idx === -1) idx = COL_PROPERTY - 1
    var leads = rows
      .filter(function(r) { return String(r[idx]).trim() === prop.trim() })
      .map(function(r) { return headersToObj(headers, r) })
    return json({ leads: leads })
  }

  // ── Leads: all ───────────────────────────────────────────────────────────
  if (action === "getAllLeads") {
    var sheet2 = ss.getSheetByName(SHEET_NAME)
    if (!sheet2) return json({ leads: [] })
    var data2 = sheet2.getDataRange().getValues()
    var headers2 = data2[0]
    var rows2 = data2.slice(1).filter(function(r) { return r[0] || r[1] })
    return json({ leads: rows2.map(function(r) { return headersToObj(headers2, r) }) })
  }

  // ── PropertySLM ──────────────────────────────────────────────────────────
  if (action === "getPropertySLM") {
    var propId = String(e.parameter.propertyId || "")
    var sheet3 = ss.getSheetByName("PropertySLM")
    if (!sheet3) return json({ slm: null })
    var data3 = sheet3.getDataRange().getValues()
    var headers3 = data3[0]
    var idIdx = headers3.indexOf("propertyId")
    var row3 = data3.slice(1).find(function(r) { return String(r[idIdx]) === propId })
    if (!row3) return json({ slm: null })
    return json({ slm: headersToObj(headers3, row3) })
  }

  // ── Past Buyers: all ─────────────────────────────────────────────────────
  if (action === "getPastBuyers") {
    return getPastBuyersResponse_(ss)
  }

  // ── Voice corpus ─────────────────────────────────────────────────────────
  if (action === "getVoiceCorpus") {
    var vcSheet = ss.getSheetByName("VoiceCorpus")
    if (!vcSheet || vcSheet.getLastRow() < 2) return json({ entries: [] })
    var vcData = vcSheet.getDataRange().getValues()
    var vcHeaders = vcData[0]
    var entries = vcData.slice(1).map(function(r) { return headersToObj(vcHeaders, r) })
    return json({ entries: entries })
  }

  return json({ error: "Unknown action: " + action })
}

// ── POST ──────────────────────────────────────────────────────────────────────

function doPost(e) {
  if (!e || !e.postData) {
    return json({ ok: false, error: "No POST data — call via HTTP POST only" })
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var data

  try {
    data = JSON.parse(e.postData.contents)
  } catch (err) {
    return json({ ok: false, error: "Invalid JSON: " + err.message })
  }

  // Support both data.action and data.type for backwards compatibility
  var action = data.action || data.type || "upsert_lead"

  // ── Leads: patch outreach columns only ───────────────────────────────────
  if (action === "patch_lead_outreach") {
    return patchLeadOutreach(ss, data)
  }

  // ── Leads: full upsert ───────────────────────────────────────────────────
  if (action === "upsert_lead") {
    return upsertLead(ss, data)
  }

  // ── Past Buyers: add new contact ─────────────────────────────────────────
  if (action === "add_past_buyer") {
    return addPastBuyer(ss, data)
  }

  // ── Past Buyers: update last contact date ────────────────────────────────
  if (action === "update_past_buyer_contact" || action === "update_last_contact") {
    return updatePastBuyerContact(ss, data)
  }

  // ── Events log ───────────────────────────────────────────────────────────
  if (action === "event") {
    var evSheet = ss.getSheetByName("Events") || ss.insertSheet("Events")
    evSheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.leadId || "", data.leadName || "", data.propertyAddress || "",
      data.fromProperty || "", data.eventType || "", data.transcript || "",
      data.smsText || "", data.emailSubject || "", data.emailBody || "",
      data.detail || ""
    ])
    return json({ ok: true })
  }

  // ── Lead status update ───────────────────────────────────────────────────
  if (action === "lead_status") {
    var lsSheet = ss.getSheetByName("Events") || ss.insertSheet("Events")
    lsSheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.leadId || "", data.leadName || "", data.propertyAddress || "",
      "", "lead_status_update", "", "", "", "", data.status || data.detail || ""
    ])
    return json({ ok: true })
  }

  // ── Auction outcome ──────────────────────────────────────────────────────
  if (action === "auction_outcome") {
    var aoSheet = ss.getSheetByName("Events") || ss.insertSheet("Events")
    aoSheet.appendRow([
      data.timestamp || new Date().toISOString(),
      "", "", data.propertyAddress || "",
      "", "auction_outcome", "", "", "", "", JSON.stringify(data)
    ])
    return json({ ok: true })
  }

  // ── SLM field update ─────────────────────────────────────────────────────
  if (action === "slm_update") {
    var slmSheet = ss.getSheetByName("PropertySLM")
    if (slmSheet) {
      var slmRow = findRowById(slmSheet, data.propertyId)
      if (slmRow > 0) {
        var slmHeaders = slmSheet.getRange(1, 1, 1, slmSheet.getLastColumn()).getValues()[0]
        var colIdx = slmHeaders.indexOf(data.field)
        if (colIdx >= 0) slmSheet.getRange(slmRow, colIdx + 1).setValue(data.value || "")
      }
    }
    return json({ ok: true })
  }

  // ── Voice corpus entry ───────────────────────────────────────────────────
  if (action === "voice_corpus_entry") {
    var vcSheet2 = ss.getSheetByName("VoiceCorpus") || ss.insertSheet("VoiceCorpus")
    if (vcSheet2.getLastRow() === 0) {
      vcSheet2.appendRow(["text", "type", "channel", "ts"])
    }
    var entry = data.entry || {}
    vcSheet2.appendRow([entry.text || "", entry.type || "", entry.channel || "", entry.ts || new Date().toISOString()])
    return json({ ok: true })
  }

  // ── Legacy generic row append ─────────────────────────────────────────────
  var legacySheet = ss.getSheetByName("Sheet1") || ss.getActiveSheet()
  legacySheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.type || "", data.name || "", data.agency || "",
    data.phone || "", data.action || "", data.lead || "", data.detail || ""
  ])
  return json({ ok: true })
}

// ── Past Buyers helpers ───────────────────────────────────────────────────────

function getPastBuyersResponse_(ss) {
  var sheet = ss.getSheetByName(PB_SHEET_NAME)
  if (!sheet) return json({ error: "Sheet '" + PB_SHEET_NAME + "' not found" })
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return json({ buyers: [] })

  var rows = sheet.getRange(2, 1, lastRow - 1, PB_COL_LAST_CONTACT).getValues()
  var buyers = rows
    .filter(function(r) { return r[0] || r[1] })
    .map(function(r) {
      return {
        id:              r[PB_COL_ID - 1]             || "",
        name:            r[PB_COL_NAME - 1]            || "",
        phone:           r[PB_COL_PHONE - 1]           || "",
        email:           r[PB_COL_EMAIL - 1]           || "",
        purchaseAddress: r[PB_COL_PURCHASE_ADDR - 1]   || "",
        suburb:          r[PB_COL_SUBURB - 1]          || "",
        purchaseDate:    formatDate_(r[PB_COL_PURCHASE_DATE - 1]),
        purchasePrice:   Number(r[PB_COL_PURCHASE_PRICE - 1])  || 0,
        deposit:         Number(r[PB_COL_DEPOSIT - 1])         || 0,
        propertyType:    r[PB_COL_PROPERTY_TYPE - 1]   || "House",
        beds:            Number(r[PB_COL_BEDS - 1])    || 0,
        baths:           Number(r[PB_COL_BATHS - 1])   || 0,
        land:            Number(r[PB_COL_LAND - 1])    || 0,
        status:          r[PB_COL_STATUS - 1]          || "owner-occupier",
        notes:           r[PB_COL_NOTES - 1]           || "",
        lastContactDate: formatDate_(r[PB_COL_LAST_CONTACT - 1])
      }
    })

  return json({ buyers: buyers })
}

function addPastBuyer(ss, data) {
  var sheet = ss.getSheetByName(PB_SHEET_NAME)
  if (!sheet) return json({ error: "Sheet '" + PB_SHEET_NAME + "' not found" })

  // Skip duplicates by id
  if (data.id) {
    var existingRow = findRowById(sheet, data.id)
    if (existingRow > 0) return json({ ok: true, skipped: true, row: existingRow })
  }

  sheet.appendRow([
    data.id              || Date.now(),
    data.name            || "",
    data.phone           || "",
    data.email           || "",
    data.purchaseAddress || "",
    data.suburb          || "",
    data.purchaseDate    || "",
    data.purchasePrice   || 0,
    data.deposit         || 0,
    data.propertyType    || "House",
    data.beds            || 0,
    data.baths           || 0,
    data.land            || 0,
    data.status          || "owner-occupier",
    data.notes           || "",
    data.lastContactDate || ""
  ])

  return json({ ok: true, row: sheet.getLastRow() })
}

function updatePastBuyerContact(ss, data) {
  var sheet = ss.getSheetByName(PB_SHEET_NAME)
  if (!sheet) return json({ error: "Sheet '" + PB_SHEET_NAME + "' not found" })

  var row = findRowById(sheet, data.id)
  if (row < 0) return json({ ok: false, reason: "not found" })

  var date = data.lastContactDate || new Date().toISOString().slice(0, 10)
  sheet.getRange(row, PB_COL_LAST_CONTACT).setValue(date)
  return json({ ok: true })
}

// ── Leads helpers (unchanged from your original) ─────────────────────────────

function patchLeadOutreach(ss, data) {
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) return json({ ok: false, error: "Sheet '" + SHEET_NAME + "' not found" })

  var row = findRowById(sheet, data.leadId)
  if (row === -1) row = findRowByName(sheet, data.leadName)

  if (row === -1) {
    row = Math.max(sheet.getLastRow(), 1) + 1
    sheet.getRange(row, COL_NAME).setValue(data.leadName || "")
    sheet.getRange(row, COL_PHONE).setValue(data.phone || "")
    sheet.getRange(row, COL_PROPERTY).setValue(data.propertyAddress || "")
  }

  if (data.generatedSMS)   sheet.getRange(row, COL_GENERATED_SMS).setValue(data.generatedSMS)
  if (data.generatedEmail) sheet.getRange(row, COL_GENERATED_EMAIL).setValue(data.generatedEmail)
  if (data.emailSubject)   sheet.getRange(row, COL_EMAIL_SUBJECT).setValue(data.emailSubject)

  if (data.transcript) {
    var existing  = String(sheet.getRange(row, COL_TRANSCRIPT).getValue() || "")
    var separator = existing.length > 0 ? "\n---\n" : ""
    sheet.getRange(row, COL_TRANSCRIPT).setValue(existing + separator + data.transcript)
  }

  sheet.getRange(row, COL_TIMESTAMP).setValue(data.timestamp || new Date().toISOString())
  return json({ ok: true, action: "patch_lead_outreach", row: row })
}

function upsertLead(ss, data) {
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) return json({ ok: false, error: "Sheet '" + SHEET_NAME + "' not found" })

  var row = findRowById(sheet, data.leadId)
  if (row === -1) row = findRowByName(sheet, data.leadName)
  if (row === -1) row = Math.max(sheet.getLastRow(), 1) + 1

  sheet.getRange(row, COL_ID).setValue(data.leadId || "")
  sheet.getRange(row, COL_NAME).setValue(data.leadName || data.name || "")
  sheet.getRange(row, COL_PHONE).setValue(data.phone || "")
  sheet.getRange(row, COL_EMAIL).setValue(data.email || "")
  sheet.getRange(row, COL_BUDGET).setValue(data.budget || "")
  sheet.getRange(row, COL_SUBURB).setValue(data.suburb || "")
  sheet.getRange(row, COL_PROPERTY).setValue(data.propertyAddress || "")
  sheet.getRange(row, COL_NOTES).setValue(data.notes || "")
  sheet.getRange(row, COL_PERSONA).setValue(data.persona || "")
  sheet.getRange(row, COL_GENERATED_SMS).setValue(data.generatedSMS || "")
  sheet.getRange(row, COL_GENERATED_EMAIL).setValue(data.generatedEmail || "")
  sheet.getRange(row, COL_EMAIL_SUBJECT).setValue(data.emailSubject || "")

  if (data.transcript) {
    var existing2  = String(sheet.getRange(row, COL_TRANSCRIPT).getValue() || "")
    var separator2 = existing2.length > 0 ? "\n---\n" : ""
    sheet.getRange(row, COL_TRANSCRIPT).setValue(existing2 + separator2 + data.transcript)
  }

  sheet.getRange(row, COL_TIMESTAMP).setValue(data.timestamp || new Date().toISOString())
  return json({ ok: true, action: "upsert_lead", row: row })
}

// ── Utility ───────────────────────────────────────────────────────────────────

function headersToObj(headers, row) {
  var obj = {}
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] !== undefined ? row[i] : ""
  }
  return obj
}

function formatDate_(val) {
  if (!val) return ""
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val)
}
