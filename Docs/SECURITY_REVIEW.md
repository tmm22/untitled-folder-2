# Security Review Log

## 2025-02-14 – Web App Comprehensive Audit

### Summary
- Reviewed Next.js web workspace (`web/`) with focus on authentication, provider provisioning, Convex integrations, and content import features.
- Identified critical authorization gaps that permit account impersonation, plan escalation, and managed credential abuse.
- Noted additional misconfiguration risks (Convex admin API), SSRF exposure, and insecure session cookies.

### Findings
- **Critical — Unauthenticated account takeover**  
  - *Evidence*: `src/lib/auth/identity.ts`, `src/app/api/account/route.ts`, `/api/history`, `/api/billing`, provider routes.  
  - *Impact*: Any caller can set `x-account-id`, `account_id` cookie, or `Authorization: Bearer dev:<id>` to impersonate users and read/write account data, history, billing, and synthesis endpoints.  
  - *Remediation*: Remove header/cookie fallbacks; require Clerk session (or signed service token) before returning a user id. For guest flows, issue a server-generated opaque token tied to backend state instead of trusting arbitrary identifiers. Audit all routes relying on `resolveRequestIdentity`.

- **Critical — Client-controlled plan escalation**  
  - *Evidence*: `src/app/api/account/route.ts:26-47`, `src/modules/account/store.ts`.  
  - *Impact*: Clients can PATCH `/api/account` with any `planTier`/`billingStatus`, unlocking managed provisioning and premium UX.  
  - *Remediation*: Restrict account updates to server-trusted sources (webhooks, admin tooling). Validate entitlement transitions server-side and ignore client-supplied plan state.

- **Critical — Managed credential minting bypass**  
  - *Evidence*: `src/app/api/_lib/providerAuth.ts`, `src/app/api/provisioning/token/route.ts`, `src/modules/account/store.ts`.  
  - *Impact*: Attackers can forge `x-account-id`/`x-plan-*` headers to obtain “managed” OpenAI tokens and reuse them elsewhere.  
  - *Remediation*: Bind provisioning to authenticated accounts, compute eligibility on the server, persist issued credentials without returning raw tokens to untrusted clients, and require secure storage (Vault) workflows for direct API keys.

- **High — Convex admin API fails open without configuration**  
  - *Evidence*: `convex/http.ts:31-36`.  
  - *Impact*: Missing `CONVEX_DEPLOYMENT_KEY` / `CONVEX_ADMIN_KEY` lets any request with an auth header call privileged Convex mutations/queries (accounts, history, provisioning).  
  - *Remediation*: Fail closed when admin tokens are unset; surface configuration errors at startup instead of accepting arbitrary credentials.

- **High — SSRF via content import**  
  - *Evidence*: `src/app/api/imports/route.ts`.  
  - *Impact*: `/api/imports` fetches attacker-controlled URLs, enabling server-side requests to internal services/metadata endpoints.  
  - *Remediation*: Enforce hostname/IP allowlists or block private/reserved ranges; consider an outbound proxy with strict egress rules. Limit response size and strip sensitive headers.

- **Medium — Insecure account session cookie**  
  - *Evidence*: `src/app/api/account/route.ts:22`.  
  - *Impact*: `account_id` cookie lacks `Secure`, `HttpOnly`, and integrity protection yet drives identity resolution; attackers can tamper with it via XSS or browser tooling.  
  - *Remediation*: Use signed, httpOnly, secure cookies (or remove cookie-based identity once Clerk enforcement lands).

### Recommended Next Steps
1. Lock down authentication/authorization: refactor `resolveRequestIdentity`, require Clerk auth, rotate compromised state.  
2. Redesign plan & provisioning flows with server-enforced entitlements; store managed credentials server-side.  
3. Harden Convex admin router and `/api/imports` network access patterns.  
4. Add automated regression tests for identity enforcement, provisioning authorization, and import request validation.

### Remediation Progress
- Replaced spoofable identity plumbing with signed `account_id` cookies and Clerk-first resolution (`src/lib/auth/accountCookie.ts`, `src/lib/auth/identity.ts`, `/api/account`).  
- Removed trust in client-supplied plan headers; provisioning and provider routes now consult server-side account state before issuing managed credentials (`src/app/api/_lib/providerAuth.ts`, `/api/provisioning/token`, `/api/providers/[provider]/synthesize`).  
- Updated client stores to rely on the new flow, dropping `x-account-*` headers and triggering provisioning issuance via authenticated requests only (`src/modules/account/store.ts`, `src/modules/credentials/store.ts`, `src/components/account/PremiumDashboard.tsx`).  
- Added regression coverage to reflect the new contract (billing action tests now leverage signed cookies).  
- Hardened Convex admin HTTP guard to require configured tokens and added automated coverage (`convex/http.ts`, `src/tests/unit/convexHttpAuth.test.ts`).
- Locked down `/api/imports` with hostname/IP validation, response size limits, and optional DNS bypass for tests (`src/app/api/imports/route.ts`, `src/tests/unit/importsRoute.test.ts`).
- Secured `/api/account` updates by requiring a server-held `ACCOUNT_UPDATE_SECRET` token and added targeted regression tests (`src/app/api/account/route.ts`, `src/tests/unit/accountRoute.test.ts`).
