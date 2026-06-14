/**
 * API base URL resolver.
 *
 * In development, Vite proxies /api/* to localhost:3001, so API_BASE is "".
 * In production (propos.addvantage.site), Cloudflare Pages serves the static
 * frontend only — API calls go to the separate API server at api.addvantage.site
 * (Fly.io). CORS on the API server allows propos.addvantage.site.
 */
const PROD_API_ORIGIN = "https://api.addvantage.site"

export const API_BASE: string =
  typeof window !== "undefined" && window.location.hostname === "propos.addvantage.site"
    ? PROD_API_ORIGIN
    : ""

/** Prepend the correct origin for the current environment. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
