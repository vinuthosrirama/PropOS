/**
 * Stripe billing routes
 *
 * POST /api/billing/checkout  → create Stripe Checkout session → { url }
 * POST /api/billing/webhook   → handle subscription events from Stripe
 * GET  /api/billing/status    → { status, trialEndsAt, daysLeft }
 */
import { Router } from "express"
import Stripe from "stripe"
import { requireAuth } from "../middleware/auth.js"
import { queryOne, execute } from "../lib/db.js"
import type { AgentRow } from "../middleware/auth.js"
import type { Request, Response } from "express"

const router = Router()

// Lazy Stripe client
let _stripe: Stripe | null = null
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!_stripe) _stripe = new Stripe(key)
  return _stripe
}

// ── Checkout session ──────────────────────────────────────────────────────────

router.post("/checkout", requireAuth, async (req, res) => {
  const stripe = getStripe()
  if (!stripe) {
    return res.status(503).json({ error: "Billing not configured (STRIPE_SECRET_KEY missing)" })
  }

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    return res.status(503).json({ error: "STRIPE_PRICE_ID not set" })
  }

  const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
  if (!agent) return res.status(404).json({ error: "Agent not found" })

  const baseUrl = process.env.BASE_URL ?? "https://propos.addvantage.site"

  // Re-use existing Stripe customer if we already created one
  let customerId = agent.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: agent.email,
      name:  agent.name || agent.email,
      metadata: { agentId: String(agent.id) },
    })
    customerId = customer.id
    await execute("UPDATE agents SET stripe_customer_id = $1 WHERE id = $2", [customerId, agent.id])
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode:                 "subscription",
    success_url:          `${baseUrl}/?billing=success`,
    cancel_url:           `${baseUrl}/?billing=cancel`,
    metadata:             { agentId: String(agent.id) },
  })

  return res.json({ url: session.url })
})

// ── Billing status ────────────────────────────────────────────────────────────

router.get("/status", requireAuth, async (req, res) => {
  const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
  if (!agent) return res.status(404).json({ error: "Agent not found" })

  const trialEndsAt = new Date(agent.trial_ends_at)
  const now         = new Date()
  const daysLeft    = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000))

  return res.json({
    status:       agent.subscription_status,
    trialEndsAt:  trialEndsAt.toISOString(),
    daysLeft,
    isActive:     agent.subscription_status === "active" || (agent.subscription_status === "trialing" && daysLeft > 0),
  })
})

// ── Stripe webhook ────────────────────────────────────────────────────────────
// Raw body is required — wire this BEFORE express.json() in index.ts

router.post("/webhook",
  // Raw body needed for Stripe signature verification — handled inline
  async (req: Request, res: Response) => {
    const stripe = getStripe()
    if (!stripe) return res.status(200).send("ok")

    const sig     = req.headers["stripe-signature"] as string
    const secret  = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return res.status(200).send("ok")

    let event: Stripe.Event
    try {
      // req.body is raw Buffer when this route uses express.raw()
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
    } catch (err) {
      console.error("[billing/webhook] signature verification failed:", err)
      return res.status(400).send("Invalid signature")
    }

    const sub = event.data.object as Stripe.Subscription
    const agentId = sub.metadata?.agentId

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        if (agentId) {
          await execute(
            "UPDATE agents SET subscription_status = $1 WHERE id = $2",
            [sub.status, parseInt(agentId, 10)],
          )
        }
        break
      }
      case "customer.subscription.deleted": {
        if (agentId) {
          await execute(
            "UPDATE agents SET subscription_status = 'canceled' WHERE id = $1",
            [parseInt(agentId, 10)],
          )
        }
        break
      }
    }

    return res.json({ received: true })
  }
)

export default router
