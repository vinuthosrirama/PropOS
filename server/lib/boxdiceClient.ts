/**
 * Box+Dice API client
 *
 * Auth:    Authorization: Api-Key token=<token>
 * Base:    https://{domain}.boxdice.com.au/ai_api/
 * Docs:    https://boxdiceaiapi.docs.apiary.io/
 *
 * Pagination: cursor-based `after` param (format: `{timestamp}_{id}`)
 *   - 200 = more pages
 *   - 204 = end of results
 * Rate limits: honour `Retry-After` header on 429
 */

export interface BoxDiceConfig {
  domain: string   // e.g. "myagency" → myagency.boxdice.com.au
  apiKey: string
}

export interface PaginatedResponse<T> {
  data: T[]
  next: string | null  // cursor for next page, null when exhausted
}

// ── Core types ────────────────────────────────────────────────────────────────

export interface Contact {
  id: number
  first_name: string
  last_name: string
  mobile?: string
  email?: string
  consultant_id?: number
  permit_email_campaign?: boolean
  permit_sms?: boolean
  ealert_enabled?: boolean
  address?: {
    unit?: string
    number?: string
    street_name?: string
    street_type?: string
    suburb?: string
    postcode?: string
    state?: string
    country?: string
  }
  categories?: Array<{ name: string; consultant_id: number; type_id: number }>
  notes?: Array<{ id: number; consultant_id: number; text: string; created_at: string; updated_at: string }>
  criteria?: Array<{
    id: number
    type: string
    suburb_ids?: number[]
    property_type_ids?: number[]
    beds_from?: number
    beds_to?: number
    baths?: number
    price_from?: number
    price_to?: number
  }>
  created_at?: string
  updated_at?: string
}

export interface SalesListing {
  id: number
  office_id: number
  status: string
  consultant_ids: number[]
  primary_consultant_id: number
  listing_type: string
  price_from?: number
  price_to?: number
  display_price?: string
  sale_price?: number
  sale_date?: string
  date_listed?: string
  auction?: boolean
  auction_date?: string
  auction_time?: string
  website_status?: string
  under_offer?: boolean
  sale_status?: string
  source?: string
  images?: Array<{ url: string }>
  property?: {
    id: number
    address: {
      unit?: string
      number?: string
      street_name?: string
      street_type?: string
      suburb?: string
      postcode?: string
      state?: string
    }
    beds?: number
    baths?: number
    garages?: number
    land_size?: number
    house_size?: number
    property_type_id?: number
  }
  created_at?: string
  updated_at?: string
}

export interface RentalListing {
  id: number
  office_id: number
  status: string
  consultant_ids: number[]
  listing_type: string
  rent?: number
  rent_period?: string
  date_listed?: string
  website_status?: string
  property?: SalesListing["property"]
  created_at?: string
  updated_at?: string
}

export interface AppraisalLead {
  id: number
  consultant_id: number
  contact_id: number
  property_id?: number
  temperature?: "hot" | "warm" | "cold"
  listing_type?: "sales" | "rental"
  subject?: string
  task_date?: string
  comment?: string
  created_at?: string
  updated_at?: string
}

export interface Task {
  id: number
  consultant_id: number
  contact_ids?: number[]
  sales_listing_id?: number
  action_date?: string
  kind?: string
  subject?: string
  completed?: boolean
  created_at?: string
  updated_at?: string
}

export interface Consultant {
  id: number
  first_name: string
  last_name: string
  email?: string
  mobile?: string
  office_id?: number
  active?: boolean
}

export interface InspectionAttendance {
  id: number
  contact_id: number
  sales_listing_id?: number
  rental_listing_id?: number
  inspected_at?: string
  created_at?: string
}

export interface ContactActivity {
  id: number
  contact_id: number
  consultant_id?: number
  activity_type_id?: number
  subject?: string
  comment?: string
  created_at?: string
}

export interface BuyerNote {
  id: number
  contact_id: number
  consultant_id?: number
  sales_listing_id?: number
  text?: string
  created_at?: string
}

// ── Client ────────────────────────────────────────────────────────────────────

export class BoxDiceClient {
  private readonly base: string
  private readonly headers: Record<string, string>

  constructor(config: BoxDiceConfig) {
    this.base    = `https://${config.domain}.boxdice.com.au/ai_api`
    this.headers = {
      "Authorization": `Api-Key token=${config.apiKey}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    }
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    const url = `${this.base}${path}`
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 204) return { status: 204, data: null }  // end of pagination

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Box+Dice API error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as T
    return { status: res.status, data: json }
  }

  /** Fetches a single page; returns { items, nextCursor } */
  private async getPage<T>(path: string, after?: string): Promise<{ items: T[]; nextCursor: string | null }> {
    const url    = after ? `${path}?after=${encodeURIComponent(after)}` : path
    const result = await this.request<{ data?: T[]; next?: string } | T[]>("GET", url)

    if (result.status === 204 || !result.data) {
      return { items: [], nextCursor: null }
    }

    // Some endpoints return array directly, others wrap in { data, next }
    if (Array.isArray(result.data)) {
      return { items: result.data, nextCursor: null }
    }

    const wrapped = result.data as { data?: T[]; next?: string }
    return {
      items:      wrapped.data ?? [],
      nextCursor: wrapped.next ?? null,
    }
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async listContacts(after?: string): Promise<{ items: Contact[]; nextCursor: string | null }> {
    return this.getPage<Contact>("/contacts", after)
  }

  async getContact(id: number): Promise<Contact> {
    const result = await this.request<Contact>("GET", `/contacts/${id}`)
    if (!result.data) throw new Error(`Contact ${id} not found`)
    return result.data
  }

  async createContact(fields: {
    first_name: string
    last_name: string
    mobile?: string
    email?: string
    consultant_id?: number
  }): Promise<Contact> {
    const result = await this.request<Contact>("POST", "/contacts", fields)
    if (!result.data) throw new Error("Failed to create contact")
    return result.data
  }

  async updateContact(id: number, fields: Partial<Contact>): Promise<Contact> {
    const result = await this.request<Contact>("PATCH", `/contacts/${id}`, fields)
    if (!result.data) throw new Error(`Failed to update contact ${id}`)
    return result.data
  }

  async getContactOwnedProperties(contactId: number): Promise<SalesListing[]> {
    const result = await this.request<SalesListing[]>("GET", `/contact/${contactId}/owned_properties`)
    return result.data ?? []
  }

  async listContactBuyerNotes(contactId: number, after?: string): Promise<{ items: BuyerNote[]; nextCursor: string | null }> {
    return this.getPage<BuyerNote>(`/contact/${contactId}/buyer_notes`, after)
  }

  async listContactActivities(contactId: number, after?: string): Promise<{ items: ContactActivity[]; nextCursor: string | null }> {
    return this.getPage<ContactActivity>(`/contacts/${contactId}/contact_activities`, after)
  }

  async listContactTasks(contactId: number, after?: string): Promise<{ items: Task[]; nextCursor: string | null }> {
    return this.getPage<Task>(`/contacts/${contactId}/tasks`, after)
  }

  // ── Listings ─────────────────────────────────────────────────────────────────

  async listSalesListings(after?: string): Promise<{ items: SalesListing[]; nextCursor: string | null }> {
    return this.getPage<SalesListing>("/sales_listings", after)
  }

  async listRentalListings(after?: string): Promise<{ items: RentalListing[]; nextCursor: string | null }> {
    return this.getPage<RentalListing>("/rental_listings", after)
  }

  // ── Leads / Appraisals ────────────────────────────────────────────────────────

  async listAppraisalLeads(after?: string): Promise<{ items: AppraisalLead[]; nextCursor: string | null }> {
    return this.getPage<AppraisalLead>("/appraisal_leads", after)
  }

  async createAppraisalLead(fields: {
    consultant_id: number
    contact_id: number
    property_id?: number
    temperature?: "hot" | "warm" | "cold"
    listing_type?: "sales" | "rental"
    subject?: string
    task_date?: string
    comment?: string
  }): Promise<AppraisalLead> {
    const result = await this.request<AppraisalLead>("POST", "/appraisal_leads", fields)
    if (!result.data) throw new Error("Failed to create appraisal lead")
    return result.data
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────────

  async listTasks(after?: string): Promise<{ items: Task[]; nextCursor: string | null }> {
    return this.getPage<Task>("/tasks", after)
  }

  async createTask(fields: {
    contact_ids?: number[]
    sales_listing_id?: number
    action_date?: string
    kind?: string
    subject?: string
    consultant_id?: number
  }): Promise<Task> {
    const result = await this.request<Task>("POST", "/tasks", fields)
    if (!result.data) throw new Error("Failed to create task")
    return result.data
  }

  // ── Consultants ───────────────────────────────────────────────────────────────

  async listConsultants(after?: string): Promise<{ items: Consultant[]; nextCursor: string | null }> {
    return this.getPage<Consultant>("/consultants", after)
  }

  // ── Open Homes / Inspections ─────────────────────────────────────────────────

  async listInspectionAttendances(after?: string): Promise<{ items: InspectionAttendance[]; nextCursor: string | null }> {
    return this.getPage<InspectionAttendance>("/inspection_attendances", after)
  }

  // ── Properties ────────────────────────────────────────────────────────────────

  async listProperties(after?: string): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    return this.getPage<Record<string, unknown>>("/properties", after)
  }
}
