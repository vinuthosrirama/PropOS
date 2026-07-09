# PropOS — Security Review (2026-07-08)
_Public repo github.com/vinuthosrirama/PropOS. Auth/API and webhook/messaging slices were read line-by-line and verified; the AI/data-layer slice is summarized from a targeted read. This is the source list for the **Part B remediation** to be implemented next session with a running server + DB, verifying each fix before push._

## Critical / High (fix first, in this order)

1. **CRITICAL — Hardcoded JWT signing secrets with insecure fallbacks.** `server/lib/auth.ts:10-11`. `ACCESS_SECRET`/`REFRESH_SECRET` fall back to literals (`"propos-dev-secret-change-in-prod"` / `"propos-refresh-dev-change-in-prod"`) committed to a **public repo**. If prod boots without `JWT_SECRET` set, anyone can forge a valid access token for any `agentId` and fully impersonate any agent. No startup guard rejects the fallback.
   **Fix:** delete the fallbacks; throw at boot if `JWT_SECRET`/refresh secret are unset.

2. **CRITICAL — Systemic IDOR: the global gate authenticates but does not authorize.** `server/index.ts:225-230` attaches `req.agentId`, but most routes query by a client-supplied `:id`/`:portfolioId`/`:slug`/`:phone` with no `AND agent_id = req.agentId` ownership check. Confirmed: `agent-demo.ts:72-84` (`/slm/:portfolioId`), `outreach-targets.ts:345,355,379,415,489`, `sms-agent.ts:96,143,197,330,384,397,424,473`, `conversations.ts:28,46`. Any authenticated agent enumerates integer IDs to read/modify other agents' data. Correct pattern exists at `agent-demo.ts:24-27`.
   **Fix:** route-by-route sweep adding agent scoping to every `req.params` query listed.

3. **CRITICAL — Inbound webhook auth gate is registered AFTER the webhook router.** `server/index.ts:183` mounts `webhookRouter` (`/api/webhook/sms`, `/api/webhook/email`, `routes/webhook.ts:27,55`); `verifyWebhookSecret` is only applied at `index.ts:306`, after. Express runs middleware in registration order, so those routes are effectively unauthenticated. Anyone can POST to forge opt-outs, inject fake replies, or cancel nurture jobs. No Twilio/SendGrid signature verification either.
   **Fix:** move `verifyWebhookSecret` + webhook mounts above the routers; add provider signature verification.

4. **CRITICAL — `verifyWebhookSecret` fails OPEN when `WEBHOOK_SECRET` is unset.** `server/index.ts:296-297` calls `next()` unconditionally if the secret is empty, so the inline transport webhooks (`/api/webhook/bluebubbles` `:315`, telelink, textingblue, android-gateway) accept any POST. `parseBBWebhook` trusts caller-supplied `from`/`body` → opt-out forging + thread poisoning.
   **Fix:** fail closed (reject) when the secret is unset.

5. **HIGH — Unauthenticated public SMS-send endpoint.** `server/index.ts:210-220` `POST /api/test-sms` is mounted before the auth gate (`:225`), takes arbitrary `{to, message}`, and is not under `sendLimiter` (only `generalLimiter` 120/min). Anyone can send SMS/iMessage from the agent's real number to any number — direct cost/reputation abuse.
   **Fix:** delete it, or move behind the auth gate + `sendLimiter`.

6. **HIGH — Outbound send paths skip the opt-out registry.** `sms-agent.ts` send routes (`:471-494`, `:395-418`, `:183-189`) call `sendSMS` directly; `sendSMS` (`server/lib/sms.ts:140-174`) has no compliance guard. Opt-out is only enforced in *some* callers → an opted-out lead can still be messaged (SPAM Act violation).
   **Fix:** centralize the opt-out/compliance check inside `sendSMS`.

7. **HIGH — `agentId=0` demo super-token.** `auth.ts:156-159` (`/demo-token`, unauthenticated) and `:205` mint an 8-hour JWT with `agentId=0` that passes `requireAuth`. Combined with #2, an anonymous caller can reach every protected route. This is the "master login" — a no-credential token, not a hardcoded password.
   **Fix:** scope demo tokens to demo-only data; never let `agentId=0` read real agent rows.

## Medium / Low

8. **MEDIUM — Weak default HMAC secret for unsubscribe tokens + 64-bit truncation.** `server/lib/compliance.ts:145-146,149`. `UNSUB_SECRET` falls back to `sha256("propos-dev")` (public constant) if `UNSUBSCRIBE_SECRET` unset → anyone forges unsub tokens for any `leadId`. HMAC truncated to 16 hex chars (64-bit). **Fix:** require the env secret at boot; widen the HMAC. (Verification itself is constant-time and correct.)
9. **MEDIUM — CORS `credentials:true` with localhost origins ships to prod.** `index.ts:92-95`.
10. **MEDIUM — `agent-demo-token` sets `sameSite:"none"` inline** (`auth.ts:172`) bypassing the hardened `REFRESH_COOKIE_OPTS` (`sameSite:"lax"`), widening CSRF exposure.

## AI / data-layer slice (targeted read, not exhaustive)
No hardcoded provider keys found in `server/lib/{openai,claude,db,boxdice,domainAvm,sheets,gmail}.ts` — all read from `env`. Queries reviewed are parameterized (`pg` placeholders) — **no SQL injection found** in the files checked. Two follow-ups for next session: (a) confirm no route passes a user-controlled table/column into a query string builder; (b) confirm external API calls (Boxdice/Domain AVM) never interpolate unsanitized lead input into the request URL (SSRF check) — the messaging-transport URLs were verified env-sourced and safe.

## Verified-good controls
bcrypt cost 12 with password length caps (DoS guard, `auth.ts:32-39,77`); `token_version` revocation on logout; generic login errors (no user enumeration); `safeAgent()` strips `password_hash`/`stripe_customer_id`; dedicated `authLimiter` (10/15min, skipSuccessfulRequests); constant-time webhook compare where applied (`index.ts:295-305`); 256kb body limit; helmet with prod CSP/frameguard; `/api/bb` daemon routes fail *closed* when `WEBHOOK_SECRET` empty (`bb.ts:22-31`); unsubscribe page HTML-escaped; parameterized queries throughout.

## Part B remediation order (next session, running server + DB, verify each before push)
1. #1 secrets boot-guard → 2. #3/#4 webhook ordering + fail-closed → 3. #5 kill `/api/test-sms` → 4. #6 centralize opt-out in `sendSMS` → 5. #7 scope `agentId=0` → 6. #2 IDOR route sweep (largest; do methodically) → 7. #8 unsub secret → 8. #9/#10 CORS + cookie. Push is a production deploy — hold for explicit go-ahead after you verify each fix.
