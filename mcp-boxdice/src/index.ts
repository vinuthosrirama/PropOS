#!/usr/bin/env node
/**
 * Box+Dice MCP Server
 *
 * Exposes Box+Dice (MRI) CRM data as MCP tools so Claude can:
 * - Read and create contacts, leads, listings, tasks, open home attendees
 * - Pull pipeline data for a specific agent or office
 *
 * Config (env vars):
 *   BOXDICE_DOMAIN   — agency subdomain (e.g. "peakeagency" for peakeagency.boxdice.com.au)
 *   BOXDICE_API_KEY  — API key from Box+Dice Settings → Integrations
 *
 * Usage with Claude Desktop — add to claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "boxdice": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-boxdice/dist/index.js"],
 *       "env": {
 *         "BOXDICE_DOMAIN": "youragency",
 *         "BOXDICE_API_KEY": "your-api-key-here"
 *       }
 *     }
 *   }
 * }
 */

import { Server }               from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { BoxDiceClient }        from "./client.js"

// ── Config ────────────────────────────────────────────────────────────────────

const DOMAIN  = process.env.BOXDICE_DOMAIN
const API_KEY = process.env.BOXDICE_API_KEY

if (!DOMAIN || !API_KEY) {
  console.error("Error: BOXDICE_DOMAIN and BOXDICE_API_KEY must be set")
  process.exit(1)
}

const client = new BoxDiceClient({ domain: DOMAIN, apiKey: API_KEY })

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // ── Contacts ─────────────────────────────────────────────────────────────
  {
    name: "boxdice_list_contacts",
    description: "List contacts from Box+Dice CRM. Returns a paginated list of buyer/seller contacts. Each page returns up to 50 records. Use the nextCursor to fetch the next page.",
    inputSchema: {
      type: "object",
      properties: {
        after: {
          type: "string",
          description: "Pagination cursor from a previous response's nextCursor field. Omit for the first page.",
        },
      },
    },
  },
  {
    name: "boxdice_get_contact",
    description: "Get a single contact by ID from Box+Dice. Returns the full contact record including criteria (budget/suburb preferences), notes, and categories.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number", description: "Box+Dice contact ID" },
      },
    },
  },
  {
    name: "boxdice_create_contact",
    description: "Create a new contact in Box+Dice CRM. Use this after an open home or enquiry to add a buyer or vendor to the system.",
    inputSchema: {
      type: "object",
      required: ["first_name", "last_name"],
      properties: {
        first_name:    { type: "string" },
        last_name:     { type: "string" },
        mobile:        { type: "string", description: "Mobile in +614xx format" },
        email:         { type: "string" },
        consultant_id: { type: "number", description: "Assign to a specific agent" },
      },
    },
  },
  {
    name: "boxdice_update_contact",
    description: "Update fields on an existing Box+Dice contact (name, phone, email, permit flags, etc.).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:                    { type: "number", description: "Box+Dice contact ID" },
        first_name:            { type: "string" },
        last_name:             { type: "string" },
        mobile:                { type: "string" },
        email:                 { type: "string" },
        consultant_id:         { type: "number" },
        permit_email_campaign: { type: "boolean" },
        permit_sms:            { type: "boolean" },
        ealert_enabled:        { type: "boolean" },
      },
    },
  },
  {
    name: "boxdice_get_contact_activities",
    description: "Get the full activity history for a contact (calls, emails, SMSes, meetings).",
    inputSchema: {
      type: "object",
      required: ["contact_id"],
      properties: {
        contact_id: { type: "number" },
        after:      { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_get_contact_buyer_notes",
    description: "Get all buyer notes for a contact — notes recorded at inspections or during follow-up.",
    inputSchema: {
      type: "object",
      required: ["contact_id"],
      properties: {
        contact_id: { type: "number" },
        after:      { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_get_contact_tasks",
    description: "Get all pending tasks for a specific contact.",
    inputSchema: {
      type: "object",
      required: ["contact_id"],
      properties: {
        contact_id: { type: "number" },
        after:      { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_get_contact_owned_properties",
    description: "Get properties owned by a contact (useful for vendor/landlord records).",
    inputSchema: {
      type: "object",
      required: ["contact_id"],
      properties: {
        contact_id: { type: "number" },
      },
    },
  },

  // ── Listings ──────────────────────────────────────────────────────────────
  {
    name: "boxdice_list_sales_listings",
    description: "List all sales listings in Box+Dice. Returns address, price, beds/baths, status (current/sold/under_offer), auction details, and the agent/consultant.",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_list_rental_listings",
    description: "List all rental/property management listings in Box+Dice.",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },

  // ── Leads / Pipeline ──────────────────────────────────────────────────────
  {
    name: "boxdice_list_appraisal_leads",
    description: "List all appraisal leads (vendor/landlord pipeline) in Box+Dice. Each lead has a temperature (hot/warm/cold) and listing type (sales/rental).",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_create_appraisal_lead",
    description: "Create an appraisal lead in Box+Dice — a vendor who has expressed interest in selling or a landlord who wants a rental appraisal.",
    inputSchema: {
      type: "object",
      required: ["consultant_id", "contact_id"],
      properties: {
        consultant_id: { type: "number", description: "Assigned agent" },
        contact_id:    { type: "number", description: "The vendor/landlord contact" },
        property_id:   { type: "number", description: "The property to appraise" },
        temperature:   { type: "string", enum: ["hot", "warm", "cold"] },
        listing_type:  { type: "string", enum: ["sales", "rental"] },
        subject:       { type: "string", description: "Brief description of the lead" },
        task_date:     { type: "string", description: "Follow-up date (ISO 8601)" },
        comment:       { type: "string", description: "Notes on the lead" },
      },
    },
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  {
    name: "boxdice_list_tasks",
    description: "List all tasks/follow-ups in Box+Dice. Returns tasks across all agents and contacts.",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "boxdice_create_task",
    description: "Create a follow-up task in Box+Dice for a contact. Use this to schedule a call, SMS, meeting, or reminder.",
    inputSchema: {
      type: "object",
      properties: {
        contact_ids:       { type: "array", items: { type: "number" }, description: "Contacts this task relates to" },
        consultant_id:     { type: "number", description: "Agent responsible" },
        sales_listing_id:  { type: "number", description: "Link to a specific listing" },
        action_date:       { type: "string", description: "Due date (ISO 8601)" },
        kind:              { type: "string", description: "Task type e.g. SMS, call, email, meeting" },
        subject:           { type: "string", description: "Task description" },
      },
    },
  },

  // ── Open Homes ────────────────────────────────────────────────────────────
  {
    name: "boxdice_list_inspection_attendances",
    description: "List open home / inspection attendances from Box+Dice. Returns who attended each inspection — the core lead source after an open home.",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },

  // ── Consultants ───────────────────────────────────────────────────────────
  {
    name: "boxdice_list_consultants",
    description: "List all consultants (agents) in the Box+Dice office. Use consultant IDs when creating contacts, leads, or tasks.",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },

  // ── Properties ────────────────────────────────────────────────────────────
  {
    name: "boxdice_list_properties",
    description: "List all properties in Box+Dice (both vendor-owned and managed properties).",
    inputSchema: {
      type: "object",
      properties: {
        after: { type: "string", description: "Pagination cursor" },
      },
    },
  },
]

// ── Tool handler ──────────────────────────────────────────────────────────────

type Args = Record<string, unknown>

async function handleTool(name: string, args: Args): Promise<unknown> {
  switch (name) {

    // ── Contacts ──────────────────────────────────────────────────────────
    case "boxdice_list_contacts":
      return client.listContacts(args.after as string | undefined)

    case "boxdice_get_contact":
      return client.getContact(args.id as number)

    case "boxdice_create_contact":
      return client.createContact({
        first_name:    args.first_name    as string,
        last_name:     args.last_name     as string,
        mobile:        args.mobile        as string | undefined,
        email:         args.email         as string | undefined,
        consultant_id: args.consultant_id as number | undefined,
      })

    case "boxdice_update_contact": {
      const { id, ...fields } = args
      return client.updateContact(id as number, fields as Parameters<BoxDiceClient["updateContact"]>[1])
    }

    case "boxdice_get_contact_activities":
      return client.listContactActivities(
        args.contact_id as number,
        args.after as string | undefined,
      )

    case "boxdice_get_contact_buyer_notes":
      return client.listContactBuyerNotes(
        args.contact_id as number,
        args.after as string | undefined,
      )

    case "boxdice_get_contact_tasks":
      return client.listContactTasks(
        args.contact_id as number,
        args.after as string | undefined,
      )

    case "boxdice_get_contact_owned_properties":
      return client.getContactOwnedProperties(args.contact_id as number)

    // ── Listings ──────────────────────────────────────────────────────────
    case "boxdice_list_sales_listings":
      return client.listSalesListings(args.after as string | undefined)

    case "boxdice_list_rental_listings":
      return client.listRentalListings(args.after as string | undefined)

    // ── Leads ─────────────────────────────────────────────────────────────
    case "boxdice_list_appraisal_leads":
      return client.listAppraisalLeads(args.after as string | undefined)

    case "boxdice_create_appraisal_lead":
      return client.createAppraisalLead({
        consultant_id: args.consultant_id as number,
        contact_id:    args.contact_id    as number,
        property_id:   args.property_id   as number | undefined,
        temperature:   args.temperature   as "hot" | "warm" | "cold" | undefined,
        listing_type:  args.listing_type  as "sales" | "rental" | undefined,
        subject:       args.subject       as string | undefined,
        task_date:     args.task_date     as string | undefined,
        comment:       args.comment       as string | undefined,
      })

    // ── Tasks ─────────────────────────────────────────────────────────────
    case "boxdice_list_tasks":
      return client.listTasks(args.after as string | undefined)

    case "boxdice_create_task":
      return client.createTask({
        contact_ids:      args.contact_ids      as number[] | undefined,
        consultant_id:    args.consultant_id    as number | undefined,
        sales_listing_id: args.sales_listing_id as number | undefined,
        action_date:      args.action_date      as string | undefined,
        kind:             args.kind             as string | undefined,
        subject:          args.subject          as string | undefined,
      })

    // ── Open Homes ────────────────────────────────────────────────────────
    case "boxdice_list_inspection_attendances":
      return client.listInspectionAttendances(args.after as string | undefined)

    // ── Consultants ───────────────────────────────────────────────────────
    case "boxdice_list_consultants":
      return client.listConsultants(args.after as string | undefined)

    // ── Properties ────────────────────────────────────────────────────────
    case "boxdice_list_properties":
      return client.listProperties(args.after as string | undefined)

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mcp-boxdice", version: "1.0.0" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  try {
    const result = await handleTool(name, args as Args)
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    }
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`Box+Dice MCP server running (domain: ${DOMAIN})`)
