/**
 * Cloudflare Pages Function — API proxy
 *
 * Routes all /api/* requests from the static Cloudflare Pages site to the
 * Fly.io Express backend, preserving method, headers, and body.
 *
 * File: functions/api/[[path]].ts  (catch-all wildcard)
 */

const FLY_ORIGIN = "https://addvantageadvisory.fly.dev"

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context
  const url = new URL(request.url)

  // Rewrite origin to Fly.io, keep path + query string intact
  const upstream = new URL(url.pathname + url.search, FLY_ORIGIN)

  // Forward the request as-is
  const proxied = new Request(upstream.toString(), {
    method:  request.method,
    headers: request.headers,
    body:    ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "follow",
  })

  const response = await fetch(proxied)

  // Pass the response through, adding CORS header for safety
  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", "*")

  return new Response(response.body, {
    status:  response.status,
    headers,
  })
}
