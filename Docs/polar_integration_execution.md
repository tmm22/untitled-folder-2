# Polar Integration Execution Checklist

## Overview
- Transition the web app’s billing and subscription flows from PayPal to Polar.
- Keep Convex-backed account state and managed provisioning in sync with Polar’s lifecycle events.
- Ship customer-facing updates (copy, benefits surfacing) and operational safeguards.

## 1. Billing Core & Configuration
- [x] Implement `web/src/app/api/_lib/polarClient.ts` wrapping `@polar-sh/sdk` with organisation ID, access token, environment selection, retry/timeout defaults, and secure fetch usage.
- [x] Add `web/src/lib/billing/polar.ts` exposing `createCheckoutSession` and `createBillingPortalSession`, translating Polar errors into the current `BillingResult` shape and passing `external_customer_id` metadata.
- [x] Extend `.env.local.example` and documentation with Polar-specific configuration (`POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_ENVIRONMENT`, `POLAR_PLAN_ID_*`, `POLAR_CHECKOUT_SUCCESS_URL`, `POLAR_CUSTOMER_PORTAL_URL`, `POLAR_WEBHOOK_SECRET`); mark PayPal keys as legacy.
- [ ] Update `build.sh`/CI environment validation to assert Polar variables when `BILLING_PROVIDER=polar`.
- [x] Add feature flag handling (`BILLING_PROVIDER`) where billing helpers are resolved.

## 2. Account Lifecycle & Convex Schema
- [x] Extend Convex schema (`web/convex/schema.ts`, `web/convex/account.ts`) with Polar identifiers (customer ID, subscription ID), renewal timestamps, and optional benefit summary.
- [x] Update `web/src/lib/account/repository.ts` and related types to persist new fields and map Polar subscription status to internal `planTier`/`billingStatus`.
- [x] Build a plan resolver mapping Polar product/price IDs to internal tiers, including trial handling and downgrade scenarios.
- [x] Ensure provisioning orchestrator hooks receive Polar-mapped metadata and trigger issue/revoke flows on status changes.

## 3. API Routes & Webhooks
- [x] Switch `/api/billing/checkout` and `/api/billing/portal` to call Polar billing helpers while preserving response shapes.
- [x] Create `/api/billing/polar/events` webhook route:
  - [x] Read raw request body and validate signatures with `validateEvent` and `POLAR_WEBHOOK_SECRET`.
  - [x] Handle key events (`subscription.created`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `invoice.payment_failed` if emitted) updating the account repository.
  - [x] Implement idempotency (store processed event IDs in Convex or lightweight KV).
- [x] Log structured details and respond with 2xx/4xx appropriately.
- [x] Trigger provisioning updates (issue/revoke credentials) inside webhook handlers as account status changes.
- [x] Add alerting hooks or metrics for webhook failures/timeouts.

## 4. Frontend & UX Updates
- [ ] Refresh copy in `PremiumDashboard`, `CredentialsPanel`, onboarding flows, etc., to reference Polar and the hosted portal.
- [ ] Update CTA handlers to redirect to Polar checkout URL and customer portal session links.
- [ ] Display Polar-sourced metadata (renewal date, benefits) when available.
- [ ] Surface Polar benefit entitlements alongside provisioning status where valuable.
- [ ] Audit marketing/support docs and screenshots to ensure Polar terminology.

## 5. Testing & Quality Assurance
- [ ] Replace PayPal mocks with Polar fixtures in unit tests (`web/src/tests/unit/billingActions.test.ts`, account repository tests, provisioning orchestrator tests).
- [ ] Add webhook-focused tests covering status transitions and provisioning effects.
- [ ] Extend Convex tests (or add new ones) for the updated schema and repository logic.
- [ ] Introduce end-to-end or integration tests (Vitest/Playwright) simulating checkout + webhook flows.
- [ ] Document manual QA steps for sandbox checkout, webhook replay, credential revocation, and portal access.

## 6. Observability, Security, & Rollout
- [ ] Emit structured logs around Polar API calls (request ID, account ID, subscription ID, event type).
- [ ] Document and enforce Polar secret management (no persistence, rotation process, IP allowlists).
- [ ] Gate rollout via `BILLING_PROVIDER` flag to support staged deployment and fallback.
- [ ] Prepare migration playbook: cancel legacy PayPal subscriptions, notify customers, enable Polar checkout, monitor provisioning health.
- [ ] Update security review docs with Polar data flows and webhook infrastructure.
- [ ] Capture post-rollout monitoring checklist (webhook delivery dashboards, error rate thresholds).

## 7. Verification & Sign-off
- [ ] `npm run test` (web) and `swift test` pass with Polar integration changes.
- [ ] Sandbox checkout → webhook → Convex update → provisioning access verified end-to-end.
- [ ] Failed/canceled payments revoke provisioning access and downgrade plan state reliably.
- [ ] Documentation, support runbooks, and migration comms reviewed by stakeholders.
- [ ] Rollout checklist completed and archived for future audits.
