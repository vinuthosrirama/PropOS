# PropOS — Security Review, Production-Readiness & Build Plan
_Last updated: 6 July 2026 — full pentest + code review of `github.com/vinuthosrirama/PropOS` (`main`)_

> This document supersedes the previous session-notes version. It records the results of a
> full security review of the repo, a production-readiness gate, and the forward build plan.
> The prior "multi-agent demo provisioning" plan is retained in **Part D, §D1**.

**Scope reviewed:** `server/` (index, middleware, `lib/`, all 37 `routes/`), `functions/api/`,
`src/`, CI (`.github/workflows/deploy.yml`), env handling, git history. No secrets are currently
committed (the July 2026 `.env` leak is fully remediated: history purged, `.env`/`server/.env`
gitignored, keys rotated). `.env.production` contains only the intentionally-public Supabase
anon key — correct.

---

## Part A — Security findings (ranked)

Severity reflects real, reachable exploits. Note the **amplifier**: `POST /api/auth/demo-token`
mints a valid 8-hour `agentId=0` JWT to **anyone with no credentials** (`routes/auth.ts:156`), and
`agent-lookup` mints a token from just name+agency strings for the built-in list. Because the global
gate (`index.ts:225-230`) treats *any* valid JWT as sufficient for *every* `/api` route, an
unauthenticated external user can self-issue a token and then reach every IDOR below. This makes the
"medium" authz gaps effectively externally reachable.

### 🔴 CRITICAL

**A1 — Inbound webhook secret gate is bypassed by route-registration order.**
`server/index.ts:183` mounts `webhookRouter` (`/api/webhook/sms`, `/api/webhook/email`) **before**
`verifyWebhookSecret` is applied at `index.ts:306`. Express runs middleware in registration order, so
those two routes respond (`res.sendStatus(200)`) before the gate is ever reached — `WEBHOOK_SECRET`
gives them **zero** protection even when set. Unauthenticated attacker can POST
`{from, body:"stop"}` to `/api/webhook/sms` to forge opt-outs for any number (`routes/webhook.ts:36`),
inject fake replies into a lead's thread (`:39`), cancel real nurture jobs (`:42`), or POST a fake
SendGrid `spamreport` to `/api/webhook/email` to opt any address out of **all** channels (`:75`). No
provider signature (Twilio/SendGrid HMAC) is verified anywhere.
**Fix:** apply `verifyWebhookSecret` *inside* `webhook.ts`'s router (or move the `app.use(..., verifyWebhookSecret)`
above line 183), and make it **fail closed** (see A4). Add real provider signature verification.

**A2 — Hardcoded JWT fallback secrets in a public repo.**
`server/lib/auth.ts:10-11`:
```ts
const ACCESS_SECRET  = process.env.JWT_SECRET         ?? "propos-dev-secret-change-in-prod"
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "propos-refresh-dev-change-in-prod"
```
If either env var is ever unset in a deploy, tokens are signed with a string that is public in source.
Anyone can `jwt.sign({agentId: N}, "propos-dev-secret-change-in-prod")` and impersonate **any** agent.
**Fix:** remove the fallbacks; throw at boot if unset when `NODE_ENV==="production"`.

### 🟠 HIGH

**A3 — Systemic IDOR / broken tenant isolation across authenticated routes.**
`requireAuth` attaches `req.agentId` but the majority of `:id`/`:slug`/`:phone` queries never filter by
it. Confirmed sites:
- `routes/crm-leads.ts:141-199` — `PATCH /:id` and `PATCH /:id/questions` update `PropOS_democontacts`
  by raw id, no ownership check → overwrite another agent's lead notes/status/questions.
- `routes/pitches.ts:363-537` — `POST /:id/send-email` (takes `to` from body), `vendor-reports/generate`,
  `vendor-reports/:id`, `vendor-reports/:id/send` fetch by raw id → send another tenant's pitch content
  via the shared Gmail sender to an attacker-supplied address (open-relay-ish).
- `routes/outreach-targets.ts:343-521` — `GET/:id`, `GET/:id/thread`, `POST/:id/reply`, `PUT/:id`,
  `POST /send/:id` — read any thread / send SMS as any campaign.
- `routes/agent-demo.ts:72-85` — `GET /slm/:portfolioId` selects by `portfolio_id` with no agent scope.
- `routes/conversations.ts:14-59` — `getAllThreads()` / `getThread(phone)` are global, unscoped.
- `routes/analytics.ts:207-215` — `officeId` from query, no membership check → read another office's
  full per-agent funnel/GCI.
**Fix:** add `AND agent_id = $N` (from `req.agentId`) to every scoped query; for phone/slug lookups,
verify the row's owning agent. Correct reference pattern already exists at `agent-demo.ts:24-27`.

**A4 — Security gates fail *open* on missing env, silently.**
Three gates no-op when their secret is unset: `verifyWebhookSecret` (`index.ts:297`), the global auth
gate when `DATABASE_URL` is missing (`index.ts:228` → whole API unauthenticated), and `UNSUB_SECRET`
(`compliance.ts:145`). A single misconfigured deploy silently exposes the system.
**Fix:** in production, refuse to boot without `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEBHOOK_SECRET`,
`UNSUBSCRIBE_SECRET`, and `DATABASE_URL`. Fail closed.

**A5 — Unauthenticated SMS-send endpoint (cost/spam abuse).**
`server/index.ts:210` `POST /api/test-sms` is mounted **before** the auth gate and takes attacker-
controlled `{to, message}` → `sendSMS(to, message)` from the agent's real number to any number. Only
`generalLimiter` (120/min) applies (`sendLimiter` is scoped to `/api/send`, not this path).
**Fix:** delete the endpoint, or gate behind `requireAuth` + `NODE_ENV!=="production"`.

### 🟡 MEDIUM

**A6 — Open CORS proxy sets `Access-Control-Allow-Origin: *` on all backend responses.**
`functions/api/[[path]].ts:31` slaps `ACAO:*` on every proxied Fly response and forwards all incoming
headers upstream unmodified. Any public API/demo-mode response becomes readable cross-origin by any
site. (Bearer-token endpoints are partially protected because `*` + credentials is blocked by browsers,
but this is still a data-exposure and best-practice failure.)
**Fix:** echo the specific Pages origin instead of `*`; consider an allow-list of proxyable subpaths.

**A7 — Weak default + 64-bit-truncated unsubscribe HMAC.**
`compliance.ts:145-149` — `UNSUB_SECRET` derives from `JWT_SECRET` (→ public fallback A2) when
`UNSUBSCRIBE_SECRET` is unset; HMAC truncated to 16 hex chars (64 bits). Verification itself is correct
(`timingSafeEqual`). **Fix:** require `UNSUBSCRIBE_SECRET` at boot; widen to full-length HMAC.

**A8 — Opt-out (SPAM Act) check is not centralised in `sendSMS`.**
`server/lib/sms.ts` `sendSMS()` has no compliance guard; several callers
(`routes/sms-agent.ts` initiate/approve/send paths) send without `smsOptOutReason`/`checkCompliance`.
An opted-out lead can still be messaged via the agent routes.
**Fix:** enforce the opt-out check inside `sendSMS` itself so every path is covered.

**A9 — `agent-demo-token` sets a cross-site refresh cookie bypassing hardened opts.**
`routes/auth.ts:172` inlines `sameSite:"none"` instead of `REFRESH_COOKIE_OPTS` (`lax`, path-scoped),
widening CSRF exposure of the refresh token.
**Fix:** use `REFRESH_COOKIE_OPTS` everywhere.

### 🟢 LOW / hygiene

- **A10** No global Express error handler (`index.ts`) → an uncaught sync throw hits Express's default
  handler, which leaks stack traces when `NODE_ENV!=="production"`. Add `app.use((err,req,res,next)=>…)`.
- **A11** `routes/ai-settings.ts` is dead code — not mounted in `index.ts`. Remove or wire it.
- **A12** Gmail refresh token lives only in `process.env` with no rotation/expiry handling
  (`lib/gmail.ts:4-9`). Acceptable for single-operator; revisit for multi-tenant.
- **A13** Prompt-injection hygiene: `openai.ts` / `claude.ts` interpolate `lead.notes`/`transcript`
  unescaped. Not currently exploitable (LLM has no tools/DB access; output is sanitised before send),
  but add delimiters when the LLM gains any tool or retrieval capability.

### ✅ Verified-good (no action)
Parameterized SQL throughout (no injection found). bcrypt cost 12; token-version revocation on logout;
generic auth errors (anti-enumeration); password length caps (CPU-DoS guard); `safeAgent()` strips
`password_hash`/`stripe_customer_id`; dedicated `authLimiter` (10/15min, `skipSuccessfulRequests`);
constant-time secret compares; 256 KB body limit; helmet with prod CSP+frameguard; `imsg.ts` validates
`IMSG_BIN` and escapes shell args; no SSRF (all outbound URLs are env-sourced); no hardcoded secrets in
source; `/api/bb` daemon auth fails **closed** (good). The "master login" is client-side demo-data
selection (`src/data.ts:isMasterAccount`), **not** a backend backdoor.

---

## Part B — Remediation plan (do these in order)

> **STATUS (applied 6 Jul 2026, working tree, NOT yet pushed — `tsc --noEmit` clean):**
> ✅ A2/A4/A7 fail-closed boot guard (`index.ts` after PORT) · ✅ A1 webhook gate moved inline at mount
> (`index.ts` `app.use("/api/webhook", verifyWebhookSecret, webhookRouter)`) · ✅ A5 `/api/test-sms`
> now `requireAuth` · ✅ A8 opt-out choke point inside `sendSMS` (`lib/sms.ts`) · ✅ A6 CORS proxy
> origin allow-list (`functions/api/[[path]].ts`) · ✅ A10 global error handler.
> **STILL PENDING (need running server+DB to verify safely):** A3 tenant scoping (largest — write
> integration tests first), A9 demo-cookie hardening (touches cross-origin demo login), A11 remove dead
> `ai-settings.ts`. **Not pushed** — push = prod deploy; deploy after DB-verified test of A3.


Each step is independently shippable. **Verify against a running server + DB before pushing** — this
repo's standard is "seen working," and these touch auth/webhooks/sends on a live Fly.io deploy. Push to
`main` = production deploy, so **confirm before pushing** (per CLAUDE.md).

1. **Fail-closed boot guard** (`server/index.ts`, top of `listen`): in production, assert
   `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, `DATABASE_URL` are set;
   `process.exit(1)` with a clear message otherwise. Closes A2, A4, A7. _Verify:_ boot with a var unset
   → server refuses to start; boot with all set → normal.
2. **Fix webhook gate** (A1): apply `verifyWebhookSecret` inside `routes/webhook.ts` (or reorder the
   `app.use`). _Verify:_ `curl -X POST /api/webhook/sms` without secret → 401; with secret → 200.
3. **Remove/gate `/api/test-sms`** (A5). _Verify:_ unauthenticated POST → 401/404.
4. **Centralise opt-out in `sendSMS`** (A8). _Verify:_ add a test number to `opt_outs`, attempt send
   via every path → all blocked with a logged reason.
5. **Tenant-scope every route** (A3) — the largest item. Add `AND agent_id = req.agentId` to each
   `:id`/`:slug`/`:phone` query in `crm-leads`, `pitches`, `outreach-targets`, `agent-demo`,
   `conversations`, `analytics`. **Write an integration test per route** (agent B cannot read/modify
   agent A's rows) before and after. This is the gate for onboarding a *second* paying agent.
6. **Lock the CORS proxy** (A6): echo the specific Pages origin.
7. **Harden cookies + add global error handler + remove dead code** (A9, A10, A11).
8. Re-run: `cd server && npx tsc --noEmit` (zero errors), full demo click-through in Preview, then
   confirm-before-push.

---

## Part C — Production / client-readiness checklist

**Blocking for multi-tenant (paid) launch:** A1, A2, A3, A4, A5 (Part B steps 1–5).
**Blocking for any public deploy:** A1, A2, A4, A5.
**Single-operator demo (current state):** already acceptable *if* all env secrets are set on Fly.io —
verify with `flyctl secrets list --app addvantageadvisory` that `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, `DATABASE_URL` all exist. If any are missing, the app is silently
running on public fallback secrets **today** — treat as an incident and rotate.

**Operational hardening (not code):**
- [ ] Confirm the 5 secrets above are set in Fly.io; rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` (forces
      re-login but invalidates any tokens forged on the fallback).
- [ ] Add basic request logging + an alert on webhook 200s from unexpected IPs.
- [ ] Add `npm audit` (or Dependabot) to CI — currently no dependency scanning.
- [ ] Confirm `NODE_ENV=production` is set on Fly.io (drives CSP, frameguard, cookie `secure`, and the
      error-handler stack-trace suppression once A10 lands).

---

## Part D — Forward build plan (natural extensions)

### D1 — Multi-agent demo provisioning _(carried over — now unblocked by A3 tenant scoping)_
Provision a new agent (e.g. Anthony Abeysena, The 5th Avenue Real Estate) in <30 min via CLI, zero code
changes. Schema (`agent_portfolios`, `agent_property_slm`, brand columns on `agents`) is in
`server/provision-agent.ts`. **Do A3 first** — provisioning a real second agent onto the current
unscoped routes would expose every agent's data to every other agent.

### D2 — Auth/authz maturity
- Real roles (`agent`, `office_admin`, `super_admin`) enforced in middleware, not just `req.agentId`.
- Replace the credential-free `demo-token` with a signed, time-boxed, single-tenant demo link.
- Per-office data boundary enforced centrally (a `scopedQuery(req, sql, params)` helper that always
  injects the tenant filter) so new routes can't forget it.

### D3 — Compliance & deliverability
- Move opt-out enforcement to a single choke point (D2's `sendSMS` guard + an email equivalent).
- Real Twilio/SendGrid webhook signature verification (A1 follow-through).
- Persist opt-outs to DB always (the in-memory fallback loses records on restart → re-contacts
  opted-out leads, a SPAM Act violation flagged by the server's own boot warning).

### D4 — Observability
- Global error handler → structured logs → an aggregator (even Fly's log drain to a cheap sink).
- Health endpoint already gates detail behind auth (good) — add DB latency + transport health to a
  private ops dashboard.

### D5 — Test coverage (currently thin)
- Integration tests for the auth flow, tenant isolation (A3), opt-out enforcement (A8), and the webhook
  gate (A1). These are the exact regressions most likely to recur.

---

## Quick reference — files touched by remediation
| Finding | File |
|---|---|
| A1 webhook gate | `server/index.ts:183,306`, `server/routes/webhook.ts` |
| A2/A4 boot guard | `server/lib/auth.ts:10-11`, `server/index.ts` (listen) |
| A3 tenant scoping | `routes/{crm-leads,pitches,outreach-targets,agent-demo,conversations,analytics}.ts` |
| A5 test-sms | `server/index.ts:210-220` |
| A6 CORS proxy | `functions/api/[[path]].ts:31` |
| A7 unsub secret | `server/lib/compliance.ts:145-149` |
| A8 opt-out choke | `server/lib/sms.ts` `sendSMS()` |
| A9 cookie opts | `server/routes/auth.ts:172` |
| A10/A11 | `server/index.ts` (error handler), `server/routes/ai-settings.ts` (dead) |
