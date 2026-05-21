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
// ── Client ────────────────────────────────────────────────────────────────────
export class BoxDiceClient {
    base;
    headers;
    constructor(config) {
        this.base = `https://${config.domain}.boxdice.com.au/ai_api`;
        this.headers = {
            "Authorization": `Api-Key token=${config.apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
    }
    // ── HTTP helpers ─────────────────────────────────────────────────────────────
    async request(method, path, body) {
        const url = `${this.base}${path}`;
        const res = await fetch(url, {
            method,
            headers: this.headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 204)
            return { status: 204, data: null }; // end of pagination
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Box+Dice API error ${res.status}: ${text}`);
        }
        const json = (await res.json());
        return { status: res.status, data: json };
    }
    /** Fetches a single page; returns { items, nextCursor } */
    async getPage(path, after) {
        const url = after ? `${path}?after=${encodeURIComponent(after)}` : path;
        const result = await this.request("GET", url);
        if (result.status === 204 || !result.data) {
            return { items: [], nextCursor: null };
        }
        // Some endpoints return array directly, others wrap in { data, next }
        if (Array.isArray(result.data)) {
            return { items: result.data, nextCursor: null };
        }
        const wrapped = result.data;
        return {
            items: wrapped.data ?? [],
            nextCursor: wrapped.next ?? null,
        };
    }
    // ── Contacts ─────────────────────────────────────────────────────────────────
    async listContacts(after) {
        return this.getPage("/contacts", after);
    }
    async getContact(id) {
        const result = await this.request("GET", `/contacts/${id}`);
        if (!result.data)
            throw new Error(`Contact ${id} not found`);
        return result.data;
    }
    async createContact(fields) {
        const result = await this.request("POST", "/contacts", fields);
        if (!result.data)
            throw new Error("Failed to create contact");
        return result.data;
    }
    async updateContact(id, fields) {
        const result = await this.request("PATCH", `/contacts/${id}`, fields);
        if (!result.data)
            throw new Error(`Failed to update contact ${id}`);
        return result.data;
    }
    async getContactOwnedProperties(contactId) {
        const result = await this.request("GET", `/contact/${contactId}/owned_properties`);
        return result.data ?? [];
    }
    async listContactBuyerNotes(contactId, after) {
        return this.getPage(`/contact/${contactId}/buyer_notes`, after);
    }
    async listContactActivities(contactId, after) {
        return this.getPage(`/contacts/${contactId}/contact_activities`, after);
    }
    async listContactTasks(contactId, after) {
        return this.getPage(`/contacts/${contactId}/tasks`, after);
    }
    // ── Listings ─────────────────────────────────────────────────────────────────
    async listSalesListings(after) {
        return this.getPage("/sales_listings", after);
    }
    async listRentalListings(after) {
        return this.getPage("/rental_listings", after);
    }
    // ── Leads / Appraisals ────────────────────────────────────────────────────────
    async listAppraisalLeads(after) {
        return this.getPage("/appraisal_leads", after);
    }
    async createAppraisalLead(fields) {
        const result = await this.request("POST", "/appraisal_leads", fields);
        if (!result.data)
            throw new Error("Failed to create appraisal lead");
        return result.data;
    }
    // ── Tasks ─────────────────────────────────────────────────────────────────────
    async listTasks(after) {
        return this.getPage("/tasks", after);
    }
    async createTask(fields) {
        const result = await this.request("POST", "/tasks", fields);
        if (!result.data)
            throw new Error("Failed to create task");
        return result.data;
    }
    // ── Consultants ───────────────────────────────────────────────────────────────
    async listConsultants(after) {
        return this.getPage("/consultants", after);
    }
    // ── Open Homes / Inspections ─────────────────────────────────────────────────
    async listInspectionAttendances(after) {
        return this.getPage("/inspection_attendances", after);
    }
    // ── Properties ────────────────────────────────────────────────────────────────
    async listProperties(after) {
        return this.getPage("/properties", after);
    }
}
