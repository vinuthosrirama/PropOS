/**
 * Auth + subscription middleware.
 *
 * requireAuth:
 *   - Reads Authorization: Bearer <access_token>
 *   - Attaches req.agentId (number) on success
 *   - Returns 401 on missing/invalid token
 *
 * requireSubscription (layered on top of requireAuth):
 *   - If trial has expired AND subscription is not active, returns 402
 *   - Attaches req.agent (full agent row) for downstream use
 */
import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../lib/auth.js"
import { queryOne } from "../lib/db.js"

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      agentId?: number
      agent?: AgentRow
    }
  }
}

export interface AgentRow {
  id:                  number
  email:               string
  name:                string
  agency:              string
  phone:               string | null
  tagline:             string | null
  suburb:              string | null
  role:                string
  office_id:           number | null
  password_hash:       string | null
  stripe_customer_id:  string | null
  subscription_status: string
  trial_ends_at:       Date
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"]
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" })
  }
  const token   = header.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) {
    return res.status(401).json({ error: "Token expired or invalid" })
  }
  req.agentId = payload.agentId
  next()
}

/** Like requireAuth but also gate on subscription status. */
export async function requireSubscription(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"]
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" })
  }
  const token   = header.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) {
    return res.status(401).json({ error: "Token expired or invalid" })
  }

  const agent = await queryOne<AgentRow>(
    "SELECT * FROM agents WHERE id = $1",
    [payload.agentId],
  )
  if (!agent) {
    return res.status(401).json({ error: "Agent not found" })
  }

  req.agentId = agent.id
  req.agent   = agent

  const trialExpired  = new Date(agent.trial_ends_at) < new Date()
  const subActive     = agent.subscription_status === "active" || agent.subscription_status === "trialing"
  if (trialExpired && !subActive) {
    return res.status(402).json({
      error:      "subscription_required",
      message:    "Your free trial has ended. Please subscribe to continue.",
      checkoutUrl: `${process.env.BASE_URL ?? ""}/api/billing/checkout`,
    })
  }

  next()
}
