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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SHEET_URL    = process.env.SHEET_URL ?? ""
const TIMEOUT_MS   = 10_000   // Apps Script cold-starts can be slow — 10s max
const MAX_ATTEMPTS = 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sentinel error thrown when Apps Script returns a retryable HTTP status (429 / 5xx) */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = "HttpError"
  }
}

/**
 * fetch() wrapper with AbortController timeout.
 * Throws HttpError on 429 or 5xx so withRetry can catch and re-try them.
 * Other non-2xx responses (4xx client errors) are returned as-is — the
 * callers that need the body can inspect res.ok themselves.
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    // Apps Script rate-limit or server error — worth retrying
    if (res.status === 429 || res.status >= 500) {
      throw new HttpError(res.status, `HTTP ${res.status} from Sheets`)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Retry wrapper: exponential backoff, retries on:
 *  - AbortError (timeout)
 *  - Network-level fetch failures (TypeError: Failed to fetch)
 *  - HttpError with status 429 or 5xx (thrown by fetchWithTimeout above)
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const isRetryable =
        (err instanceof Error && (err.name === "AbortError" || err.name === "HttpError")) ||
        (err instanceof TypeError && err.message.toLowerCase().includes("fetch"))
      if (!isRetryable || attempt === MAX_ATTEMPTS - 1) break
      const delay = 500 * Math.pow(2, attempt)   // 500ms → 1000ms → 2000ms
      console.warn(`[sheets] ${label} attempt ${attempt + 1} failed (${(err as Error).message}), retrying in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all leads from the Leads tab */
export async function fetchLeads(): Promise<SheetLead[]> {
  if (!SHEET_URL) return []
  try {
    const res = await withRetry(
      () => fetchWithTimeout(SHEET_URL),
      "fetchLeads",
    )
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
    await withRetry(
      () => fetchWithTimeout(SHEET_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "update_lead", id, field: "transcript", value: transcript }),
      }),
      "saveTranscript",
    )
  } catch (err) {
    console.warn("[sheets] saveTranscript failed:", (err as Error).message)
  }
}

/** Append an event row to the Actions tab */
export async function logAction(row: Record<string, string>): Promise<void> {
  if (!SHEET_URL) return
  try {
    await withRetry(
      () => fetchWithTimeout(SHEET_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ timestamp: new Date().toISOString(), ...row }),
      }),
      "logAction",
    )
  } catch (err) {
    console.warn("[sheets] logAction failed:", (err as Error).message)
  }
}

/**
 * Generic write to the Sheet — used by add-lead and add-contact routes.
 * Retries automatically. Never throws (write errors are non-fatal).
 */
export async function writeToSheet(payload: Record<string, unknown>): Promise<void> {
  if (!SHEET_URL) return
  try {
    await withRetry(
      () => fetchWithTimeout(SHEET_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      }),
      `writeToSheet(${payload.type ?? "unknown"})`,
    )
  } catch (err) {
    console.warn("[sheets] writeToSheet failed:", (err as Error).message)
  }
}
