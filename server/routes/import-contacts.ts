import { Router } from "express"
import * as XLSX from "xlsx"
import { isDbConnected, execute, query } from "../lib/db.js"

const router = Router()

/**
 * CRM import connector — AgentBox / Rex / Vault CSV+XLSX exports.
 *
 * POST /api/import-contacts/parse  { filename, dataBase64 } -> { rows: string[][] }
 *   Parses an .xlsx/.xls workbook server-side (SheetJS) and returns the first
 *   sheet as a raw string grid. The client maps headers with its existing
 *   alias table so CSV and XLSX share one mapping path.
 *
 * POST /api/import-contacts  { contacts: [...] } -> { ok, imported }
 *   Bulk upsert into the contacts table (source='import'), one round trip
 *   instead of N posts. Conflict key: (agent_id, purchase_address).
 *
 * GET /api/import-contacts -> { contacts: [...] }
 *   Read-back of this agent's imported contacts so the demo survives reloads.
 */

router.post("/parse", (req, res) => {
  const { filename, dataBase64 } = req.body as { filename?: string; dataBase64?: string }
  if (!dataBase64) return res.status(400).json({ error: "dataBase64 is required" })
  try {
    const buf = Buffer.from(dataBase64, "base64")
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return res.status(400).json({ error: "Workbook has no sheets" })
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" })
    const rows = grid.map(r => r.map(c => String(c ?? "").trim())).filter(r => r.some(c => c !== ""))
    res.json({ rows, sheet: sheetName, filename: filename ?? "" })
  } catch (err) {
    res.status(400).json({ error: `Could not parse file: ${(err as Error).message}` })
  }
})

interface ImportContact {
  name: string
  phone?: string
  email?: string
  purchaseAddress?: string
  suburb?: string
  purchaseDate?: string
  purchasePrice?: number
  deposit?: number
  propertyType?: string
  beds?: number
  baths?: number
  land?: number
  status?: string
  notes?: string
}

router.post("/", async (req, res) => {
  const contacts = (req.body as { contacts?: ImportContact[] }).contacts
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: "contacts array is required" })
  }
  if (!isDbConnected()) {
    // Demo/dev mode without a DB — client keeps contacts in local state
    return res.json({ ok: true, imported: contacts.length, persisted: false })
  }

  const agentId = String(req.agentId ?? 0)
  let imported = 0
  const errors: string[] = []
  for (const c of contacts) {
    if (!c.name) continue
    try {
      await execute(
        `INSERT INTO contacts (agent_id, name, phone, email, purchase_address, suburb,
         purchase_date, purchase_price, deposit, property_type, beds, baths, land, status, notes, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'import')
         ON CONFLICT ON CONSTRAINT contacts_agent_address_unique
         DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, email=EXCLUDED.email,
           suburb=EXCLUDED.suburb, purchase_date=EXCLUDED.purchase_date,
           purchase_price=EXCLUDED.purchase_price, property_type=EXCLUDED.property_type,
           beds=EXCLUDED.beds, baths=EXCLUDED.baths, land=EXCLUDED.land,
           status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=NOW()`,
        [
          agentId, c.name, c.phone ?? "", c.email ?? "",
          c.purchaseAddress ?? "", c.suburb ?? "",
          c.purchaseDate || null, c.purchasePrice ?? 0, c.deposit ?? 0,
          c.propertyType ?? "House", c.beds ?? 3, c.baths ?? 2, c.land ?? 0,
          c.status ?? "owner-occupier", c.notes ?? "",
        ],
      )
      imported++
    } catch (err) {
      errors.push(`${c.name}: ${(err as Error).message}`)
    }
  }
  res.json({ ok: true, imported, persisted: true, errors: errors.slice(0, 5) })
})

router.get("/", async (req, res) => {
  if (!isDbConnected()) return res.json({ contacts: [] })
  const agentId = String(req.agentId ?? 0)
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT id, name, phone, email, purchase_address, suburb, purchase_date,
              purchase_price, deposit, property_type, beds, baths, land, status, notes
       FROM contacts WHERE agent_id = $1 ORDER BY created_at ASC`,
      [agentId],
    )
    res.json({
      contacts: rows.map(r => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        phone: String(r.phone ?? ""),
        email: String(r.email ?? ""),
        purchaseAddress: String(r.purchase_address ?? ""),
        suburb: String(r.suburb ?? ""),
        purchaseDate: r.purchase_date ? String(r.purchase_date).slice(0, 10) : "",
        purchasePrice: Number(r.purchase_price ?? 0),
        deposit: Number(r.deposit ?? 0),
        propertyType: String(r.property_type ?? "House"),
        beds: Number(r.beds ?? 3),
        baths: Number(r.baths ?? 2),
        land: Number(r.land ?? 0),
        status: String(r.status ?? "owner-occupier"),
        notes: String(r.notes ?? ""),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
