/**
 * PropOS ↔ Box+Dice integration layer.
 * Reuses the BoxDiceClient from mcp-boxdice/src/client.ts via direct import.
 */

import { BoxDiceClient, type Contact, type SalesListing, type InspectionAttendance } from "../../mcp-boxdice/src/client.js"

let _client: BoxDiceClient | null = null

export function boxdiceConfigured(): boolean {
  return !!(process.env.BOXDICE_DOMAIN && process.env.BOXDICE_API_KEY)
}

function getClient(): BoxDiceClient {
  if (!_client) {
    _client = new BoxDiceClient({
      domain: process.env.BOXDICE_DOMAIN!,
      apiKey: process.env.BOXDICE_API_KEY!,
    })
  }
  return _client
}

// ── PropOS types (mirrors src/lib/sheet.ts SheetLead) ────────────────────────
export interface PropOSLead {
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
  boxdiceContactId: number
}

export interface PropOSListing {
  boxdiceId: number
  address: string
  suburb: string
  state: string
  postcode: string
  status: string
  price: number
  priceMin: number
  priceMax: number
  beds: number
  baths: number
  cars: number
  land: number
  image: string
  auctionDate?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(p: SalesListing["property"]): string {
  if (!p?.address) return "Unknown"
  const { unit, number, street_name, street_type, suburb, state, postcode } = p.address
  const street = [unit ? `${unit}/` : "", number, street_name, street_type].filter(Boolean).join(" ")
  return [street, suburb, state, postcode].filter(Boolean).join(", ")
}

function derivePersona(categories: Contact["categories"]): string {
  if (!categories?.length) return "Buyer"
  const names = categories.map(c => c.name.toLowerCase())
  if (names.some(n => n.includes("invest"))) return "Investor"
  if (names.some(n => n.includes("first"))) return "First Home Buyer"
  if (names.some(n => n.includes("down"))) return "Downsizer"
  if (names.some(n => n.includes("up"))) return "Upsizer"
  return "Family buyer"
}

function extractQuestions(notes: Contact["notes"]): string[] {
  if (!notes?.length) return []
  // Look for question-like sentences in notes
  return notes
    .flatMap(n => n.text.split(/[.!]/))
    .map(s => s.trim())
    .filter(s => s.endsWith("?") || s.toLowerCase().includes("asked about") || s.toLowerCase().includes("queried"))
    .slice(0, 5)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get all open home attendees for a sales listing, hydrated with contact data */
export async function getLeadsForListing(salesListingId: number): Promise<PropOSLead[]> {
  const client = getClient()

  // Paginate through all inspection attendances
  const attendances: InspectionAttendance[] = []
  let cursor: string | undefined
  do {
    const page = await client.listInspectionAttendances(cursor ?? undefined)
    attendances.push(...page.items.filter(a => a.sales_listing_id === salesListingId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  // Hydrate each attendance with contact details
  const leads = await Promise.all(
    attendances.map(async (a): Promise<PropOSLead | null> => {
      try {
        const contact = await client.getContact(a.contact_id)
        const notes = contact.notes ?? []
        const criteria = contact.criteria?.[0]

        // Respect contact's communication opt-ins
        if (contact.permit_email_campaign === false && contact.permit_sms === false) return null

        return {
          id: `bd-${a.id}`,
          name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
          phone: contact.mobile ?? "",
          email: contact.email ?? "",
          budget: criteria?.price_to ?? 0,
          timeline: "3 to 6 months",
          persona: derivePersona(contact.categories),
          notes: notes.map(n => n.text).join(" "),
          inspectedProperty: "",  // filled by caller who knows the listing address
          lastContact: a.inspected_at ?? a.created_at ?? "",
          questions: extractQuestions(notes),
          boxdiceContactId: contact.id,
        }
      } catch {
        return null
      }
    })
  )

  return leads.filter((l): l is PropOSLead => l !== null)
}

/** Get all active sales listings, mapped to PropOS format */
export async function getSalesListings(): Promise<PropOSListing[]> {
  const client = getClient()
  const listings: SalesListing[] = []
  let cursor: string | undefined
  do {
    const page = await client.listSalesListings(cursor ?? undefined)
    listings.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return listings
    .filter(l => l.status === "current" || l.status === "under_offer")
    .map(l => ({
      boxdiceId: l.id,
      address: formatAddress(l.property),
      suburb: l.property?.address?.suburb ?? "",
      state: l.property?.address?.state ?? "VIC",
      postcode: l.property?.address?.postcode ?? "",
      status: l.under_offer ? "under_offer" : "active",
      price: l.price_from ?? 0,
      priceMin: l.price_from ?? 0,
      priceMax: l.price_to ?? 0,
      beds: l.property?.beds ?? 0,
      baths: l.property?.baths ?? 0,
      cars: l.property?.garages ?? 0,
      land: l.property?.land_size ?? 0,
      image: l.images?.[0]?.url ?? "",
      auctionDate: l.auction_date,
    }))
}

/** Create a follow-up task in Boxdice for a contact */
export async function createFollowUpTask(params: {
  contactId: number
  salesListingId?: number
  subject: string
  actionDate: string
  kind: "SMS" | "email" | "call"
  consultantId: number
}): Promise<{ taskId: number }> {
  const task = await getClient().createTask({
    contact_ids: [params.contactId],
    sales_listing_id: params.salesListingId,
    subject: params.subject,
    action_date: params.actionDate,
    kind: params.kind,
    consultant_id: params.consultantId,
  })
  return { taskId: task.id }
}
