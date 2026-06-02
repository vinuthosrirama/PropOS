/**
 * POST /api/auth/register  — create account
 * POST /api/auth/login     — email + password
 * POST /api/auth/refresh   — refresh access token via httpOnly cookie
 * POST /api/auth/logout    — clear refresh cookie
 * GET  /api/auth/me        — current agent (requires Bearer token)
 */
import { Router } from "express"
import { queryOne, execute } from "../lib/db.js"
import {
  hashPassword, verifyPassword,
  issueTokens, verifyRefreshToken,
  REFRESH_COOKIE, REFRESH_COOKIE_OPTS,
} from "../lib/auth.js"
import { requireAuth } from "../middleware/auth.js"
import type { AgentRow } from "../middleware/auth.js"

const router = Router()

// ── Register ─────────────────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const { email, password, name, agency, phone } = req.body as {
    email?: string; password?: string; name?: string; agency?: string; phone?: string
  }

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" })
  }

  const existing = await queryOne("SELECT id FROM agents WHERE email = $1", [email.toLowerCase()])
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" })
  }

  const hash = await hashPassword(password)
  const rows = await queryOne<AgentRow>(
    `INSERT INTO agents (email, name, agency, phone, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [email.toLowerCase(), name ?? "", agency ?? "", phone ?? null, hash],
  )
  if (!rows) {
    return res.status(500).json({ error: "Failed to create account" })
  }

  const { accessToken, refreshToken } = issueTokens(rows.id)
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
  return res.status(201).json({ agent: safeAgent(rows), accessToken })
})

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" })
  }

  const agent = await queryOne<AgentRow>(
    "SELECT * FROM agents WHERE email = $1",
    [email.toLowerCase()],
  )
  if (!agent || !agent.password_hash) {
    return res.status(401).json({ error: "Invalid email or password" })
  }

  const ok = await verifyPassword(password, agent.password_hash)
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" })
  }

  const { accessToken, refreshToken } = issueTokens(agent.id)
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
  return res.json({ agent: safeAgent(agent), accessToken })
})

// ── Refresh ───────────────────────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (!token) {
    return res.status(401).json({ error: "No refresh token" })
  }
  const payload = verifyRefreshToken(token)
  if (!payload) {
    return res.status(401).json({ error: "Refresh token expired or invalid" })
  }

  const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [payload.agentId])
  if (!agent) {
    return res.status(401).json({ error: "Agent not found" })
  }

  const { accessToken, refreshToken } = issueTokens(agent.id)
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
  return res.json({ accessToken })
})

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" })
  res.json({ ok: true })
})

// ── Me ────────────────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
  if (!agent) return res.status(404).json({ error: "Agent not found" })
  return res.json({ agent: safeAgent(agent) })
})

// ── Update profile ────────────────────────────────────────────────────────────

router.patch("/profile", requireAuth, async (req, res) => {
  const { name, agency, phone, tagline, suburb } = req.body as Record<string, string>
  await execute(
    `UPDATE agents SET name=$1, agency=$2, phone=$3, tagline=$4, suburb=$5
     WHERE id = $6`,
    [name ?? "", agency ?? "", phone ?? null, tagline ?? null, suburb ?? null, req.agentId],
  )
  const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
  return res.json({ agent: agent ? safeAgent(agent) : null })
})

// ── Helper ────────────────────────────────────────────────────────────────────

function safeAgent(a: AgentRow) {
  // Never return password_hash or stripe_customer_id to the client
  const { password_hash: _ph, stripe_customer_id: _sc, ...safe } = a as AgentRow & { password_hash?: string; stripe_customer_id?: string }
  return safe
}

export default router
