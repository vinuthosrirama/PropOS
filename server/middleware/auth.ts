/**
 * Auth middleware.
 *
 * requireAuth:
 *   - Reads Authorization: Bearer <access_token>
 *   - Attaches req.agentId (number) on success
 *   - Returns 401 on missing/invalid token
 */
import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../lib/auth.js"

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
  token_version:       number
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

