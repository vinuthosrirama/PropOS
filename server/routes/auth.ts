/**
 * POST /api/auth/register      — create account
 * POST /api/auth/login         — email + password
 * POST /api/auth/refresh       — refresh access token via httpOnly cookie
 * POST /api/auth/logout        — clear refresh cookie
 * POST /api/auth/agent-lookup  — name + agency → demo token (portal gating)
 * GET  /api/auth/me            — current agent (requires Bearer token)
 */
import { Router } from "express"
import { queryOne, execute } from "../lib/db.js"
import {
  hashPassword, verifyPassword,
  issueTokens, issueAccessToken, verifyRefreshToken,
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

// ── Demo token (Cameron / Vinuth quick-access — agentId=0) ───────────────────
// Issues a short-lived JWT with agentId=0. Sends are still redirected to TEST_*.
router.post("/demo-token", (_req, res) => {
  const token = issueAccessToken(0, 8 * 60 * 60)
  return res.json({ accessToken: token })
})

// ── Agent demo token (provisioned agents without a password) ──────────────────
// Called by quick-access buttons for provisioned demo agents (e.g. Anthony, David).
// Only works for agents that have NO password_hash — prevents abuse on real accounts.
router.post("/agent-demo-token", async (req, res) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email) return res.status(400).json({ error: "email required" })
    const agent = await queryOne<AgentRow>("SELECT * FROM agents WHERE LOWER(email) = $1", [email.toLowerCase()])
    if (!agent) return res.status(404).json({ error: "Agent not found" })
    if (agent.password_hash) return res.status(401).json({ error: "Use password login" })
    const { accessToken, refreshToken } = issueTokens(agent.id, agent.token_version ?? 0)
    res.cookie("refresh_token", refreshToken, { httpOnly: true, secure: true, sameSite: "none", maxAge: 7 * 24 * 60 * 60 * 1000 })
    return res.json({ agent: safeAgent(agent), accessToken })
  } catch (err) {
    console.error("[auth] agent-demo-token error:", (err as Error).message)
    return res.status(500).json({ error: "Login failed" })
  }
})

// ── Agent lookup (portal gating — name + agency → token) ─────────────────────
// Validates first name + last name + agency against known agents.
// Built-in agents (Cameron, Vinuth) get agentId=0 demo-token.
// Provisioned agents (Anthony, David, etc.) get their real agentId token.
router.post("/agent-lookup", async (req, res) => {
  try {
    const { firstName, lastName, agency } = req.body as { firstName?: string; lastName?: string; agency?: string }
    if (!firstName?.trim() || !lastName?.trim() || !agency?.trim()) {
      return res.status(400).json({ error: "First name, last name and agency are required" })
    }

    const name = `${firstName.trim()} ${lastName.trim()}`
    const agencyLower = agency.trim().toLowerCase()

    const BUILTIN = [
      { name: "Vinuth Srirama", agency: "Peake", email: "vinuth.o.srirama@gmail.com", phone: "0415 883 354", suburb: "Berwick", tagline: "Berwick specialist." },
      { name: "Cameron Knoll",  agency: "Peake", email: "cameronk@peakere.com.au",     phone: "0428 762 148", suburb: "Berwick", tagline: "Berwick specialist." },
    ]

    const builtin = BUILTIN.find(a =>
      a.name.toLowerCase() === name.toLowerCase() &&
      (agencyLower.includes(a.agency.toLowerCase()) || a.agency.toLowerCase().includes(agencyLower))
    )

    if (builtin) {
      const token = issueAccessToken(0, 8 * 60 * 60)
      return res.json({
        accessToken: token,
        agent: { name: builtin.name, agency: builtin.agency, email: builtin.email, phone: builtin.phone, suburb: builtin.suburb, tagline: builtin.tagline },
        builtIn: true,
      })
    }

    const agent = await queryOne<AgentRow>(
      "SELECT * FROM agents WHERE LOWER(name) = $1",
      [name.toLowerCase()],
    )
    if (!agent) return res.status(404).json({ error: "Agent not found. Check your name and agency." })

    const dbAgency = agent.agency.toLowerCase()
    if (!dbAgency.includes(agencyLower) && !agencyLower.includes(dbAgency)) {
      return res.status(404).json({ error: "Agency doesn't match. Check your agency name." })
    }

    if (agent.password_hash) return res.status(401).json({ error: "This account requires password login." })

    const { accessToken, refreshToken } = issueTokens(agent.id, agent.token_version ?? 0)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS)
    return res.json({ agent: safeAgent(agent), accessToken, builtIn: false })
  } catch (err) {
    console.error("[auth] agent-lookup error:", (err as Error).message)
    return res.status(500).json({ error: "Lookup failed" })
  }
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
