/**
 * API base URL resolver.
 *
 * Always use relative paths — in dev, Vite proxies /api/* to localhost:3001;
 * in production, the Cloudflare Pages Function (functions/api/[[path]].ts)
 * proxies /api/* to the Fly.io backend. Same-origin in both cases, no CORS needed.
 */
export const API_BASE = ""

/** Prepend the correct origin for the current environment. */
export function apiUrl(path: string): string {
  return path
}
