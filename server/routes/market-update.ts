/**
 * Market Update Routes
 *
 * POST /api/market-update/preview  — generates Market Update HTML preview (no send)
 * POST /api/market-update/send     — sends Market Update via email + optional SMS
 */

import { Router } from "express"
import { buildMarketUpdateHTML, buildMarketUpdateSMS, type CompSaleRow, type MarketUpdateParams } from "../lib/marketUpdateTemplate.js"
import { sendEmail, gmailConfigured } from "../lib/gmail.js"
import { sendSMS, smsConfigured } from "../lib/sms.js"
import { logOutreach } from "../lib/db.js"

const router = Router()

interface MarketUpdateRequest {
  // Agent
  agentName: string
  agencyName: string
  agencyColor?: string
  agentPhone?: string
  agentEmail?: string

  // Vendor contact
  vendorName: string
  vendorEmail?: string
  vendorPhone?: string
  propertyAddress: string
  suburb: string
  beds: number
  baths: number
  land: number
  buyerId: number

  // Valuation
  estimateLow: number
  estimateMid: number
  estimateHigh: number
  equityGain?: number
  annualGrowthPct: number

  // Comparable sales
  comps: CompSaleRow[]

  // Market stats
  medianHouse: number
  daysOnMarket: number
  clearanceRate: number
  demandScore: number

  // Personalised intro
  introLine?: string

  // Send options
  channel?: "email" | "sms" | "both"
}

function buildParams(body: MarketUpdateRequest, trackingId?: number): MarketUpdateParams {
  const vendorFirstName = body.vendorName.split("&")[0].split(" ")[0].trim()
  return {
    agentName: body.agentName,
    agencyName: body.agencyName,
    agencyColor: body.agencyColor ?? "#4B2E7E",
    agentPhone: body.agentPhone,
    agentEmail: body.agentEmail,
    vendorName: body.vendorName,
    vendorFirstName,
    propertyAddress: body.propertyAddress,
    suburb: body.suburb,
    beds: body.beds,
    baths: body.baths,
    land: body.land,
    estimateLow: body.estimateLow,
    estimateMid: body.estimateMid,
    estimateHigh: body.estimateHigh,
    equityGain: body.equityGain,
    annualGrowthPct: body.annualGrowthPct,
    comps: body.comps,
    medianHouse: body.medianHouse,
    daysOnMarket: body.daysOnMarket,
    clearanceRate: body.clearanceRate,
    demandScore: body.demandScore,
    introLine: body.introLine,
    trackingId,
    leadId: String(body.buyerId),
  }
}

/** POST /api/market-update/preview — returns HTML preview without sending */
router.post("/preview", async (req, res) => {
  try {
    const body = req.body as MarketUpdateRequest
    const html = buildMarketUpdateHTML(buildParams(body))
    const vendorFirstName = body.vendorName.split("&")[0].split(" ")[0].trim()
    const agentFirstName = body.agentName.split(" ")[0]
    const sms = buildMarketUpdateSMS({
      vendorFirstName,
      agentFirstName,
      suburb: body.suburb,
      estimateLow: body.estimateLow,
      estimateHigh: body.estimateHigh,
      agencyName: body.agencyName,
    })
    res.json({ ok: true, html, sms, subject: `Market update: ${body.suburb} — ${body.propertyAddress}` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

/** POST /api/market-update/send — sends email + optional SMS with tracking */
router.post("/send", async (req, res) => {
  try {
    const body = req.body as MarketUpdateRequest
    const channel = body.channel ?? "email"
    const vendorFirstName = body.vendorName.split("&")[0].split(" ")[0].trim()
    const agentFirstName = body.agentName.split(" ")[0]
    const subject = `Market update: ${body.suburb} — ${body.propertyAddress}`

    const smsText = buildMarketUpdateSMS({
      vendorFirstName,
      agentFirstName,
      suburb: body.suburb,
      estimateLow: body.estimateLow,
      estimateHigh: body.estimateHigh,
      agencyName: body.agencyName,
    })

    // Log outreach first to get tracking ID
    const trackingId = await logOutreach({
      agentId: body.agentEmail ?? "default",
      contactPhone: body.vendorPhone,
      contactEmail: body.vendorEmail,
      contactName: body.vendorName,
      channel,
      smsBody: (channel === "sms" || channel === "both") ? smsText : undefined,
      emailSubject: (channel === "email" || channel === "both") ? subject : undefined,
      emailBody: (channel === "email" || channel === "both") ? body.introLine ?? "Market update" : undefined,
      status: "pending",
      pipeline: "market-update",
      propertyAddress: body.propertyAddress,
      metadata: {
        type: "market-update",
        suburb: body.suburb,
        estimateLow: body.estimateLow,
        estimateHigh: body.estimateHigh,
        compsCount: body.comps.length,
      },
    })

    const html = buildMarketUpdateHTML(buildParams(body, trackingId))
    const results: { sms?: string; email?: string } = {}

    // Send email
    if ((channel === "email" || channel === "both") && body.vendorEmail) {
      if (!gmailConfigured()) {
        results.email = "Gmail not configured"
      } else {
        try {
          await sendEmail({
            to: body.vendorEmail,
            fromName: body.agentName,
            subject,
            htmlBody: html,
          })
          results.email = "sent"
        } catch (err: unknown) {
          results.email = `error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    // Send SMS
    if ((channel === "sms" || channel === "both") && body.vendorPhone) {
      if (!smsConfigured()) {
        results.sms = "SMS not configured"
      } else {
        try {
          await sendSMS(body.vendorPhone, smsText)
          results.sms = "sent"
        } catch (err: unknown) {
          results.sms = `error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    res.json({ ok: true, trackingId, results, subject })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
