/**
 * PropOS Auth helpers — JWT + bcrypt
 *
 * Access token:  15 minutes, sent as Authorization: Bearer header
 * Refresh token: 7 days, sent as httpOnly cookie "refresh_token"
 */
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"

const ACCESS_SECRET  = process.env.JWT_SECRET         ?? "propos-dev-secret-change-in-prod"
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "propos-refresh-dev-change-in-prod"
const ACCESS_TTL     = 15 * 60          // 15 minutes in seconds
const REFRESH_TTL    = 7 * 24 * 60 * 60 // 7 days in seconds

export interface TokenPayload {
  agentId: number
}

/** Hash a plain-text password with bcrypt (cost 12). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

/** Compare plain-text password against stored bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Issue a short-lived access token. */
export function issueAccessToken(agentId: number): string {
  return jwt.sign({ agentId } satisfies TokenPayload, ACCESS_SECRET, { expiresIn: ACCESS_TTL })
}

/** Issue a long-lived refresh token. */
export function issueRefreshToken(agentId: number): string {
  return jwt.sign({ agentId } satisfies TokenPayload, REFRESH_SECRET, { expiresIn: REFRESH_TTL })
}

/** Issue both tokens at once. */
export function issueTokens(agentId: number): { accessToken: string; refreshToken: string } {
  return {
    accessToken:  issueAccessToken(agentId),
    refreshToken: issueRefreshToken(agentId),
  }
}

/** Verify an access token. Returns payload or null. */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload
  } catch {
    return null
  }
}

/** Verify a refresh token. Returns payload or null. */
export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as TokenPayload
  } catch {
    return null
  }
}

/** Cookie config for the refresh token. */
export const REFRESH_COOKIE = "propos_refresh"
export const REFRESH_COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === "production",
  sameSite:  "lax" as const,
  maxAge:    REFRESH_TTL * 1000,
  path:      "/api/auth",
}
