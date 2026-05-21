/**
 * API base URL resolver.
 *
 * In development, Vite proxies /api/* to localhost:3001, so API_BASE is "".
 * In production (propos.addvantage.site), Cloudflare Pages serves static files
 * only — the Pages Function proxy isn't routing correctly, so we call Railway
 * directly. Railway already allows CORS from propos.addvantage.site.
 */
const RAILWAY_ORIGIN = "https://propos-production-e9bc.up.railway.app"

export const API_BASE: string =
  typeof window !== "undefined" && window.location.hostname === "propos.addvantage.site"
    ? RAILWAY_ORIGIN
    : ""

/** Prepend the correct origin for the current environment. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
