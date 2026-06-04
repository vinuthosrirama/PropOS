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
  try {
    const { email, password, name, agency, phone } = req.body as {
      email?: string; password?: string; name?: string; agency?: string; phone?: string
    }

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" })
    }
    // PT-C2: bcrypt silently truncates at 72 bytes — cap here to prevent confusion
    // and protect against long-password CPU DoS attacks
    if (password.length > 72) {
      return res.status(400).json({ error: "Password must be 72 characters or fewer" })
    }

    const existing = await queryOne("SELECT id FROM agents WHERE email = $1", [email.toLowerCase()])
    if (existing) {
      // PT-H2: return 409 but use generic message to limit email enumeration signal
      return res.status(409).json({ error: "Registration failed. Please try a different email or sign in." })
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

    const { accessToken, refreshToken } = issueTokens(rows.id, rows.token_version ?? 0)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return res.status(201).json({ agent: safeAgent(rows), accessToken })
  } catch (err) {
    console.error("[auth] register error:", (err as Error).message)
    return res.status(500).json({ error: "Registration failed. Please try again." })
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" })
    }
    // PT-C2: reject oversized passwords before bcrypt — prevents CPU DoS
    if (password.length > 72) {
      return res.status(401).json({ error: "Invalid email or password" })
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

    const { accessToken, refreshToken } = issueTokens(agent.id, agent.token_version ?? 0)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return res.json({ agent: safeAgent(agent), accessToken })
  } catch (err) {
    console.error("[auth] login error:", (err as Error).message)
    return res.status(500).json({ error: "Login failed. Please try again." })
  }
})

// ── Refresh ───────────────────────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  try {
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

    // PT-H3: reject if token was issued before the last logout (version mismatch)
    if ((payload.tokenVersion ?? 0) !== (agent.token_version ?? 0)) {
      return res.status(401).json({ error: "Refresh token has been revoked. Please log in again." })
    }

    const { accessToken, refreshToken } = issueTokens(agent.id, agent.token_version ?? 0)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return res.json({ accessToken })
  } catch (err) {
    console.error("[auth] refresh error:", (err as Error).message)
    return res.status(500).json({ error: "Token refresh failed. Please log in again." })
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", async (req, res) => {
  // PT-H3: increment token_version so any outstanding refresh tokens are invalidated server-side.
  // Non-fatal — cookie is always cleared even if the DB increment fails.
  const cookie = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (cookie) {
    const payload = verifyRefreshToken(cookie)
    if (payload) {
      await execute(
        "UPDATE agents SET token_version = token_version + 1 WHERE id = $1",
        [payload.agentId],
      ).catch(() => { /* best-effort — cookie still cleared */ })
    }
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" })
  res.json({ ok: true })
})

// ── Me ────────────────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  try {
    const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
    if (!agent) return res.status(404).json({ error: "Agent not found" })
    return res.json({ agent: safeAgent(agent) })
  } catch (err) {
    console.error("[auth] me error:", (err as Error).message)
    return res.status(500).json({ error: "Failed to load profile" })
  }
})

// ── Update profile ────────────────────────────────────────────────────────────

router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const { name, agency, phone, tagline, suburb } = req.body as Record<string, string>
    await execute(
      `UPDATE agents SET name=$1, agency=$2, phone=$3, tagline=$4, suburb=$5
       WHERE id = $6`,
      [name ?? "", agency ?? "", phone ?? null, tagline ?? null, suburb ?? null, req.agentId],
    )
    const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE id = $1", [req.agentId])
    return res.json({ agent: agent ? safeAgent(agent) : null })
  } catch (err) {
    console.error("[auth] profile update error:", (err as Error).message)
    return res.status(500).json({ error: "Failed to update profile" })
  }
})

// ── Helper ────────────────────────────────────────────────────────────────────

function safeAgent(a: AgentRow) {
  // Never return password_hash or stripe_customer_id to the client
  const { password_hash: _ph, stripe_customer_id: _sc, ...safe } = a as AgentRow & { password_hash?: string; stripe_customer_id?: string }
  return safe
}

export default router
