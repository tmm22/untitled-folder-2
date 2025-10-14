# Polar Payment Integration Plan

## Objectives
- Make Polar the default billing and subscription engine for the web experience, replacing the PayPal-specific implementation.
- Drive account tiers, billing status, and provisioning eligibility from Polar subscription state so the managed provisioning service remains authoritative.
- Leverage Polar’s merchant-of-record capabilities (tax handling, entitlements) while keeping credential provisioning, Convex persistence, and secure networking unchanged.

## Assumptions & Dependencies
- Polar exposes authenticated REST APIs and SDKs (`@polar-sh/sdk`) that require an access token scoped to the organisation (`payments:read`, `subscriptions:write`, etc.).
- Checkout sessions can be created via Polar’s API (checkout links or embedded checkout) and support metadata fields for `accountId` / `planTier`.
- Polar delivers lifecycle events via webhook endpoints with signatures validated using a shared secret.
- Existing Convex schemas may need additional fields for Polar subscription IDs or benefit references.
- Outbound requests must continue to flow through `secureFetchJson` (or a Polar SDK wrapper that honours the same security constraints).

## Implementation Workstreams

### 1. Billing Core & Configuration
- [ ] Introduce a Polar client helper (`web/src/app/api/_lib/polarClient.ts`) that wraps `@polar-sh/sdk` (or raw REST) with organisation ID, access token, base URL selection (sandbox vs production), and retryable fetch logic.
- [ ] Add `web/src/lib/billing/polar.ts` exporting `createCheckoutSession`, `createBillingPortalSession`, and plan ID helpers mirroring the existing PayPal contract so API routes need minimal changes.
- [ ] Extend `.env.local.example` with Polar configuration keys (`POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_ENVIRONMENT`, `POLAR_PLAN_ID_STARTER`, `POLAR_CHECKOUT_SUCCESS_URL`, `POLAR_CHECKOUT_CANCEL_URL`, `POLAR_CUSTOMER_PORTAL_URL`, `POLAR_WEBHOOK_SECRET`). Mark PayPal variables as deprecated.
- [ ] Update documentation (`README.md`, `Docs/INSTRUCTIONS_FOR_REAL_DUMMIES.md`, `Docs/API_PROVISIONING_SERVICE.md`, deployment guides) to cover Polar setup steps (obtaining tokens, organisation ID, sandbox vs production).
- [ ] Adjust `build.sh` / deployment scripts to validate presence of Polar secrets and fail fast when they are missing.

### 2. Account Lifecycle & Plan Mapping
- [ ] Define a mapping layer translating Polar product/price IDs to internal `planTier` values (`starter`, `pro`, `enterprise`, etc.) and billing states (`trial`, `active`, `past_due`, `canceled`).
- [ ] Extend Convex account schema (`web/convex/account.ts`, `schema.ts`) to persist Polar identifiers (customer ID, subscription ID, next renewal) and benefit metadata if needed.
- [ ] Update `web/src/lib/account/repository.ts` plus Convex mutations so updates triggered by Polar webhooks correctly adjust `planTier`, `billingStatus`, and `premiumExpiresAt`.
- [ ] Ensure `ProvisioningOrchestrator` consumers continue to receive accurate `planTier` / `planStatus` metadata when Polar changes occur (issue/revoke credentials as part of status transitions).
- [ ] Document migration handling for any remaining PayPal subscribers (manual import into Polar, dual-run, or grandfathering strategy).

### 3. API Surface & Webhooks
- [ ] Update `/api/billing/checkout` and `/api/billing/portal` routes to call the new Polar billing helpers while preserving response payloads consumed by `PremiumDashboard`.
- [ ] Implement Polar webhook endpoints (e.g., `/api/billing/polar/events`) that verify signatures (`POLO_WEBHOOK_SECRET` equivalent for Polar), process subscription lifecycle events, and update Convex via the account repository.
- [ ] Introduce idempotency safeguards by tracking processed webhook event IDs in Convex or a lightweight store.
- [ ] Trigger provisioning actions on webhook events: upgrade (grant provisioning access), payment failure (mark `past_due`, schedule revocation), cancellation (revoke credentials and downgrade tier).
- [ ] Add structured logging and alerting hooks for webhook success/failure to aid operations.

### 4. Frontend & UX Updates
- [ ] Refresh billing copy in `PremiumDashboard` and related components (`CredentialsPanel`, onboarding flows) to reference Polar instead of PayPal.
- [ ] Handle Polar checkout experiences (hosted link vs embedded modal). If Polar provides embeddable checkout, add a feature flag or UI path to open inline.
- [ ] Display Polar-derived plan metadata (renewal date, benefit entitlements) in the dashboard once the webhook pipeline populates them.
- [ ] Audit any PayPal-specific imagery or instructions in marketing/support content and replace with Polar equivalents.

### 5. Testing & QA
- [ ] Replace PayPal mocks with Polar-focused fixtures in unit tests (`web/src/tests/unit/billingActions.test.ts`, account repository tests, provisioning orchestrator tests).
- [ ] Add webhook contract tests to validate lifecycle transitions (`trial → active`, `active → past_due`, `past_due → active/canceled`) and ensure provisioning access toggles.
- [ ] Write integration tests or e2e scenarios (Vitest/Playwright) simulating Polar checkout + webhook callbacks, asserting the UI reflects updates and provisioning access is granted.
- [ ] Update Convex tests (if present) to cover schema changes and webhook-driven updates.
- [ ] Document manual QA steps: sandbox checkout, webhook replay, provisioning credential issuance/revocation timing, portal access confirmation.

### 6. Observability, Security, and Rollout
- [ ] Instrument Polar API usage with request/response correlation IDs, account IDs, and organisation references to aid debugging.
- [ ] Ensure Polar access tokens are injected via environment variables, rotated in secret management, and never logged or persisted.
- [ ] Add configuration gates (`BILLING_PROVIDER=polar`) to support staged rollout or dual-provider fallback during migration.
- [ ] Plan migration playbook: disable PayPal checkout, enable Polar endpoints, import historical subscribers, monitor provisioning and billing health, communicate changes to customers.
- [ ] Update security review docs to reflect Polar’s merchant-of-record role and any new data processing considerations.

## Verification Checklist
- [ ] `npm run test` (web) and `swift test` succeed with Polar mocks and updated provisioning flows.
- [ ] Sandbox checkout using Polar provisions a subscription, updates Convex account state, and grants managed provisioning access immediately.
- [ ] Failed or canceled Polar payments downgrade accounts and revoke managed credentials as expected.
- [ ] Documentation and support runbooks covering Polar setup, webhook troubleshooting, and migration steps are published.
- [ ] Environment parity (dev/staging/prod) confirmed: Polar tokens, organisation IDs, webhook URLs, and feature flags aligned.

## Open Questions & Responses
1. **Checkout API surface** — Polar’s `checkouts.create` endpoint (via `@polar-sh/sdk`) returns a hosted checkout URL and accepts fields like `external_customer_id` for account reconciliation, so we’ll adopt direct checkout session creation and pass our `accountId` as metadata ([Polar Checkout API](https://github.com/polarsource/polar/blob/main/docs/features/checkout/session.mdx)).
2. **Webhook events & verification** — Polar emits subscription lifecycle events such as `subscription.created`, `subscription.active`, `subscription.canceled`, and provides SDK helpers (`validateEvent`) that verify Standard Webhooks signatures using `POLAR_WEBHOOK_SECRET`; retries and delivery monitoring are built in ([Polar webhook delivery guide](https://github.com/polarsource/polar/blob/main/docs/integrate/webhooks/delivery.mdx)).
3. **Migration strategy** — Existing PayPal subscriptions will be canceled and customers prompted to start new Polar subscriptions, keeping a single billing provider moving forward (per product guidance).
4. **Customer portal** — Polar hosts a portal at `https://polar.sh/<org-slug>/portal` and exposes `customerSessions.create` to mint pre-authenticated links; we can deep-link without building our own portal ([Polar Customer Portal](https://github.com/polarsource/polar/blob/main/docs/features/customer-portal.mdx)).
5. **Entitlements surface** — Polar “Benefits” APIs cover license keys, file downloads, GitHub/Discord access, etc., so the dashboard should optionally surface granted benefits alongside provisioning state ([Polar Benefits SDK](https://github.com/polarsource/polar-js/blob/main/docs/sdks/benefits/README.md)).

Keep this section updated if integration details change or additional vendor clarifications arrive.
