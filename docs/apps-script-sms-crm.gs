/**
 * PropOS — SMS CRM Google Sheets Sync
 *
 * Setup (one-time):
 * 1. Open sheet 1lsDviIB9guT-e9n4jKh1WJcuvBaMXGsLpXPLZNTSEBE
 * 2. Extensions → Apps Script → paste this file
 * 3. Run setupScriptProperties() once to store the service_role key
 * 4. Run createSmsCrmTab() once to build the tab + column headers
 * 5. Add triggers: syncFromSupabase every 5 min + onOpen
 * 6. Run syncFromSupabase() manually to populate first time
 *
 * Column layout (A–N):
 *   A  Name          B  Phone        C  Relationship   D  Stage
 *   E  Status        F  Agency       G  Suburbs        H  Listings
 *   I  Recently Sold J  Last Contact K  Attempts       L  Follow Up At
 *   M  Ready to Contact (checkbox — ticking this fires the ready-poller in PropOS)
 *   N  ID (hidden helper — do not edit)
 */

var SUPABASE_URL = 'https://pzdcwulzteofvatjrtlh.supabase.co'
var SHEET_NAME   = 'SMS CRM'
var READY_COL    = 13  // col M (1-indexed)
var ID_COL       = 14  // col N

var HEADERS = [
  'Name', 'Phone', 'Relationship', 'Stage', 'Status',
  'Agency', 'Suburbs', 'Listings', 'Recently Sold',
  'Last Contact', 'Attempts', 'Follow Up At',
  '✅ Ready to Contact', 'ID'
]

// ── One-time setup ────────────────────────────────────────────────────────────

/**
 * Run once from Apps Script editor to store the service_role key.
 * Replace the placeholder with the actual key from:
 *   Supabase dashboard → Project Settings → API → service_role secret
 * NEVER commit this key to git.
 */
function setupScriptProperties() {
  var props = PropertiesService.getScriptProperties()
  props.setProperty('SUPABASE_SERVICE_KEY', 'PASTE_SERVICE_ROLE_KEY_HERE')
  Logger.log('Service key stored. Delete it from this function now.')
}

/** Create the SMS CRM tab with frozen header row and column formatting. */
function createSmsCrmTab() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
  }

  // Header row
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length)
  headerRange.setValues([HEADERS])
  headerRange.setFontWeight('bold')
  headerRange.setBackground('#4A90D9')
  headerRange.setFontColor('#FFFFFF')
  sheet.setFrozenRows(1)

  // Column widths
  sheet.setColumnWidth(1, 140)   // Name
  sheet.setColumnWidth(2, 130)   // Phone
  sheet.setColumnWidth(3, 130)   // Relationship
  sheet.setColumnWidth(4, 55)    // Stage
  sheet.setColumnWidth(5, 90)    // Status
  sheet.setColumnWidth(6, 160)   // Agency
  sheet.setColumnWidth(7, 200)   // Suburbs
  sheet.setColumnWidth(8, 70)    // Listings
  sheet.setColumnWidth(9, 200)   // Recently Sold
  sheet.setColumnWidth(10, 100)  // Last Contact
  sheet.setColumnWidth(11, 70)   // Attempts
  sheet.setColumnWidth(12, 110)  // Follow Up At
  sheet.setColumnWidth(13, 140)  // Ready to Contact
  sheet.setColumnWidth(14, 50)   // ID (narrow, semi-hidden)

  // Protect ID column from accidental edits
  var protection = sheet.getRange(2, ID_COL, 1000, 1).protect()
  protection.setDescription('Supabase ID — do not edit')
  protection.setWarningOnly(true)

  Logger.log('SMS CRM tab created.')
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Fetch all contacts from Supabase and rewrite the sheet.
 * Called every 5 min via time-driven trigger + on sheet open.
 * Preserves the ready_to_contact checkbox state for any row currently checked
 * (so a tick that hasn't been processed yet doesn't get wiped by the sync).
 */
function syncFromSupabase() {
  var serviceKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY')
  if (!serviceKey || serviceKey === 'PASTE_SERVICE_ROLE_KEY_HERE') {
    Logger.log('SUPABASE_SERVICE_KEY not set — run setupScriptProperties() first.')
    return
  }

  var resp = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/sms_contacts' +
    '?select=id,name,phone,relationship,stage,status,rea_data,' +
    'last_contact,attempts,follow_up_at,conversation_objective,ready_to_contact' +
    '&order=id.asc',
    {
      method: 'get',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    }
  )

  if (resp.getResponseCode() !== 200) {
    Logger.log('Supabase fetch failed: ' + resp.getContentText())
    return
  }

  var contacts = JSON.parse(resp.getContentText())
  if (!contacts || contacts.length === 0) {
    Logger.log('No contacts returned.')
    return
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    createSmsCrmTab()
    sheet = ss.getSheetByName(SHEET_NAME)
  }

  // Remember which rows are currently checked (contact ID → row index)
  // so we don't wipe a checkbox the user just ticked
  var checkedIds = {}
  var lastRow = sheet.getLastRow()
  if (lastRow > 1) {
    var existingIds   = sheet.getRange(2, ID_COL,   lastRow - 1, 1).getValues()
    var existingReady = sheet.getRange(2, READY_COL, lastRow - 1, 1).getValues()
    for (var i = 0; i < existingIds.length; i++) {
      if (existingReady[i][0] === true) {
        checkedIds[existingIds[i][0]] = true
      }
    }
  }

  // Build rows
  var rows = contacts.map(function(c) {
    var rea      = c.rea_data || {}
    var suburbs  = Array.isArray(rea.target_suburbs) ? rea.target_suburbs.join(', ') : ''
    var soldText = rea.recently_sold_address
      ? rea.recently_sold_address + (rea.recently_sold_price ? ' ' + rea.recently_sold_price : '')
      : ''

    return [
      c.name        || '',
      c.phone       || '',
      c.relationship|| '',
      c.stage       || '',
      c.status      || '',
      rea.agency_name || '',
      suburbs,
      rea.currently_listing_count || '',
      soldText,
      c.last_contact   ? formatDate(c.last_contact) : '',
      c.attempts       || 0,
      c.follow_up_at   ? formatDate(c.follow_up_at) : '',
      checkedIds[c.id] ? true : false,  // preserve pending ticks
      c.id
    ]
  })

  // Clear data rows and rewrite (keep header)
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent()
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows)
  }

  // Format the Ready to Contact column as checkboxes
  if (rows.length > 0) {
    var checkRange = sheet.getRange(2, READY_COL, rows.length, 1)
    checkRange.setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    )
    // Colour: checked = green tint, unchecked = light grey
    for (var r = 0; r < rows.length; r++) {
      var cell = sheet.getRange(r + 2, READY_COL)
      cell.setBackground(rows[r][12] === true ? '#B7E1CD' : '#F8F9FA')
    }
  }

  // Hide the ID column (narrow + grey text)
  sheet.getRange(2, ID_COL, rows.length || 1, 1).setFontColor('#CCCCCC')

  Logger.log('Synced ' + contacts.length + ' contacts from Supabase.')
}

// ── onEdit trigger ────────────────────────────────────────────────────────────

/**
 * Fires on any edit. Watches column M (Ready to Contact).
 * When a checkbox is ticked → PATCH sms_contacts.ready_to_contact = true in Supabase.
 * PropOS's 2-minute ready-poller picks it up and queues a draft.
 */
function onEdit(e) {
  if (!e || !e.range) return

  var sheet = e.range.getSheet()
  if (sheet.getName() !== SHEET_NAME)    return
  if (e.range.getColumn() !== READY_COL) return
  if (e.range.getRow() < 2)             return
  if (e.value !== 'TRUE')               return  // only fire on tick, not untick

  var row       = e.range.getRow()
  var contactId = sheet.getRange(row, ID_COL).getValue()
  if (!contactId) return

  var serviceKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY')
  if (!serviceKey || serviceKey === 'PASTE_SERVICE_ROLE_KEY_HERE') return

  var result = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/sms_contacts?id=eq.' + contactId,
    {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify({ ready_to_contact: true }),
      muteHttpExceptions: true
    }
  )

  var contactName = sheet.getRange(row, 1).getValue()

  if (result.getResponseCode() === 204) {
    // Flash green confirmation
    e.range.setBackground('#34A853')
    SpreadsheetApp.flush()
    Utilities.sleep(800)
    e.range.setBackground('#B7E1CD')
    Logger.log('Queued outreach for ' + contactName + ' (id=' + contactId + ')')

    // Show toast — visible in the bottom-right corner of Sheets
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Opener will be generated within 2 min. Check the PropOS Voice tab.',
      '✅ ' + contactName + ' queued',
      6
    )
  } else {
    e.range.setBackground('#EA4335')
    SpreadsheetApp.flush()
    Utilities.sleep(800)
    e.range.setBackground(null)
    Logger.log('PATCH failed for id=' + contactId + ': ' + result.getContentText())
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Supabase update failed — check Apps Script logs.',
      '❌ Error',
      8
    )
  }
}

/** Sync on open so the sheet is always fresh when Vinuth opens it. */
function onOpen() {
  syncFromSupabase()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return ''
  var d = new Date(iso)
  return Utilities.formatDate(d, 'Australia/Melbourne', 'dd MMM yyyy')
}

// ── Trigger setup (run once from editor) ─────────────────────────────────────

/**
 * Call once to register the 5-min sync trigger.
 * (Alternatively: Apps Script UI → Triggers → Add trigger manually.)
 */
function setupTriggers() {
  // Remove any existing syncFromSupabase triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncFromSupabase') {
      ScriptApp.deleteTrigger(t)
    }
  })

  ScriptApp.newTrigger('syncFromSupabase')
    .timeBased()
    .everyMinutes(5)
    .create()

  Logger.log('5-min sync trigger registered.')
}
