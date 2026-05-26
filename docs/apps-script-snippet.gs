/**
 * PropOS — Google Apps Script snippet
 *
 * INSTRUCTIONS
 * ─────────────
 * 1. Open your bound Apps Script (Extensions → Apps Script in your Google Sheet).
 * 2. Paste this code into your existing doPost() handler (or replace it if you
 *    don't have one yet).
 * 3. Make sure a sheet tab named "Past Buyers" exists with the column layout below.
 * 4. Save + Deploy → New deployment (Web app, access: Anyone with Google account).
 * 5. Copy the new Web app URL and paste it into server/.env as SHEET_URL.
 *
 * PAST BUYERS SHEET — expected column order (row 1 = headers):
 *   A  id
 *   B  name
 *   C  phone
 *   D  email
 *   E  purchaseAddress
 *   F  suburb
 *   G  purchaseDate
 *   H  purchasePrice
 *   I  deposit
 *   J  propertyType
 *   K  beds
 *   L  baths
 *   M  land
 *   N  status
 *   O  notes
 *   P  lastContactDate
 */

// ─── Merge into your existing doPost ────────────────────────────────────────

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "invalid JSON" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var type = data.type || "";

  // ── Add a new past buyer contact ──────────────────────────────────────────
  if (type === "add_past_buyer") {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Past Buyers");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet 'Past Buyers' not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Avoid duplicates: if a row with same id already exists, skip
    var existingIds = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
    if (existingIds.indexOf(String(data.id)) !== -1) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, skipped: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.appendRow([
      data.id              || "",
      data.name            || "",
      data.phone           || "",
      data.email           || "",
      data.purchaseAddress || "",
      data.suburb          || "",
      data.purchaseDate    || "",
      data.purchasePrice   || 0,
      data.deposit         || 0,
      data.propertyType    || "House",
      data.beds            || 3,
      data.baths           || 2,
      data.land            || 0,
      data.status          || "owner-occupier",
      data.notes           || "",
      data.lastContactDate || "",
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Update last contact date ──────────────────────────────────────────────
  if (type === "update_last_contact") {
    var ss2   = SpreadsheetApp.getActiveSpreadsheet();
    var sheet2 = ss2.getSheetByName("Past Buyers");
    if (!sheet2) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet 'Past Buyers' not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow2 = sheet2.getLastRow();
    if (lastRow2 < 2) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: "no rows" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ids2 = sheet2.getRange(2, 1, lastRow2 - 1, 1).getValues().flat();
    var rowIdx2 = ids2.indexOf(String(data.id));
    if (rowIdx2 === -1) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: "not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Column P (index 16) = lastContactDate
    sheet2.getRange(rowIdx2 + 2, 16).setValue(data.lastContactDate || new Date().toISOString().slice(0, 10));

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Get all past buyers (GET action=get_past_buyers also supported) ───────
  if (type === "get_past_buyers") {
    return getPastBuyersResponse_();
  }

  // ── Fallback: unknown type ────────────────────────────────────────────────
  return ContentService.createTextOutput(JSON.stringify({ error: "unknown type: " + type }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Merge into your existing doGet ─────────────────────────────────────────

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";

  if (action === "get_past_buyers") {
    return getPastBuyersResponse_();
  }

  // ... your existing doGet cases here ...
  return ContentService.createTextOutput(JSON.stringify({ error: "unknown action: " + action }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function getPastBuyersResponse_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Past Buyers");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet 'Past Buyers' not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify({ buyers: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
  var buyers = rows
    .filter(function(r) { return r[0] || r[1]; }) // skip blank rows
    .map(function(r) {
      return {
        id:              String(r[0]  || ""),
        name:            String(r[1]  || ""),
        phone:           String(r[2]  || ""),
        email:           String(r[3]  || ""),
        purchaseAddress: String(r[4]  || ""),
        suburb:          String(r[5]  || ""),
        purchaseDate:    String(r[6]  || ""),
        purchasePrice:   Number(r[7]  || 0),
        deposit:         Number(r[8]  || 0),
        propertyType:    String(r[9]  || "House"),
        beds:            Number(r[10] || 3),
        baths:           Number(r[11] || 2),
        land:            Number(r[12] || 0),
        status:          String(r[13] || "owner-occupier"),
        notes:           String(r[14] || ""),
        lastContactDate: String(r[15] || ""),
      };
    });

  return ContentService.createTextOutput(JSON.stringify({ buyers: buyers }))
    .setMimeType(ContentService.MimeType.JSON);
}
