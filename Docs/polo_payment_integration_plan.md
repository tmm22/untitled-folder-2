# Polo Payment Integration Plan

## Objectives
- Replace the existing PayPal-backed billing flows with Polo Payment System so Polo becomes the default payment option for the web experience.
- Ensure Polo drives account lifecycle (plan tier, billing status, premium expiry) so provisioning decisions continue to reflect the correct entitlements.
- Preserve managed provisioning behaviour for OpenAI (and future providers) while routing all billing, plan management, and renewal paths through Polo.

## Assumptions & Dependencies
- Official Polo Payment System API docs are pending. Initial research via external references did not surface published REST guides, so we must obtain credentials, endpoint specifications, and webhook schemas directly from Polo.
- Polo must expose subscription-style products, the ability to attach metadata (e.g., `accountId`, `planTier`), and webhook events for activation, renewal, cancellation, and payment failures.
- All outbound Polo calls must continue to use the hardened fetch layer (`secureFetchJson`) to keep tokens ephemeral and in-memory only.
- Convex remains the source of truth for accounts and provisioning usage. We will propagate Polo events into Convex via existing repositories.

## Implementation Workstreams

### 1. Billing Core & Configuration
- [ ] Introduce a Polo client helper (`web/src/app/api/_lib/poloClient.ts`) modelled after the PayPal client, encapsulating OAuth/API-key auth, base URL selection, and typed request/response models.
- [ ] Add `web/src/lib/billing/polo.ts` with the public functions `createCheckoutSession`, `createBillingPortalSession`, plus helpers for plan resolution and error handling. Preserve the `BillingResult` contract currently returned by the API routes.
- [ ] Extend `.env.local.example` with Polo variables (e.g., `POLO_API_KEY`, `POLO_ENVIRONMENT`, `POLO_PLAN_ID_STARTER`, `POLO_WEBHOOK_SECRET`, portal URLs). Flag PayPal entries as deprecated.
- [ ] Update configuration docs (`README.md`, `Docs/INSTRUCTIONS_FOR_REAL_DUMMIES.md`, `Docs/API_PROVISIONING_SERVICE.md`) to describe required Polo secrets, environment toggles, QA sandbox usage, and rollout guidance.
- [ ] Modify `build.sh` and any deployment scripts to surface the new environment variables or fail fast when they are missing in release builds.

### 2. Account Lifecycle & Plan Mapping
- [ ] Align plan tier constants in `web/src/lib/provisioning/types.ts` and `web/src/lib/account/types.ts` with Polo product catalogue (confirm if new tiers are needed or if existing `starter`, `pro`, `enterprise` align).
- [ ] Add a Polo plan resolver that maps Polo product/price identifiers to internal `planTier` and `billingStatus` values, including handling for trials, downgrades, and legacy PayPal subscribers.
- [ ] Adjust `web/src/lib/account/repository.ts` and Convex mutations (`web/convex/account.ts`) to accept plan changes triggered by Polo webhooks, including new metadata (e.g., Polo customer ID, renewal dates).
- [ ] Introduce persistence for Polo customer identifiers and subscription references inside Convex (extend the `accounts` table schema if Polo metadata must be stored).
- [ ] Ensure `ProvisioningOrchestrator` metadata (`planStatus`, `planTier`) reflects the Polo-driven state so managed credentials gate correctly.

### 3. API Surface & Webhooks
- [ ] Update `/api/billing/checkout` and `/api/billing/portal` routes to call the Polo billing helpers and return Polo URLs/messages. Keep response shape stable for the dashboard.
- [ ] Scaffold Polo webhook endpoints under `/api/billing/polo/*` (e.g., `subscription-created`, `subscription-updated`, `payment-failed`) that validate `POLO_WEBHOOK_SECRET`, translate events into account repository updates, and record audit logs.
- [ ] Implement idempotency within webhook handlers (persist last processed event ID in Convex or a lightweight KV) to protect against retries.
- [ ] Ensure webhook handlers update `billingStatus`, `premiumExpiresAt`, and plan tier, then instruct the provisioning orchestrator to revoke or issue credentials when status changes (`past_due`, `canceled`).
- [ ] Add secure logging and alert hooks for webhook failures so ops can intervene quickly.

### 4. Frontend & UX Updates
- [ ] Refresh copy in `PremiumDashboard` (`web/src/components/account/PremiumDashboard.tsx`) and any billing CTAs to reference Polo instead of PayPal, including portal messaging.
- [ ] Update billing CTA logic to handle cases where Polo returns an in-app hosted checkout vs. external URL (e.g., show inline modal if Polo provides one).
- [ ] Surface plan type and renewal dates sourced from Polo within the dashboard so users see accurate entitlement information.
- [ ] Provide UI affordances for managing plan changes if Polo supports upgrades/downgrades directly from the app.
- [ ] Audit other components (`web/src/components/settings/CredentialsPanel.tsx`, account stores, onboarding) for PayPal-specific language and replace with Polo terminology.

### 5. Testing & QA
- [ ] Replace PayPal mocks in unit tests (`web/src/tests/unit/billingActions.test.ts`, `web/src/tests/unit/accountStore.test.ts`, provisioning orchestrator tests) with Polo-specific fixtures.
- [ ] Add webhook contract tests covering status transitions (`trial` → `active`, `active` → `past_due`, `past_due` → `canceled`) to ensure account repository updates propagate to provisioning access.
- [ ] Write integration tests (Vitest or Playwright) to simulate the checkout flow end-to-end, stubbing Polo API responses and confirming the UI updates.
- [ ] Update Convex unit tests (or add new ones) to verify schema changes and webhook-driven mutations.
- [ ] Document manual QA steps: sandbox checkout, webhook replay, provisioning access validation, credential revocation timing.

### 6. Observability, Security, and Rollout
- [ ] Instrument Polo requests with structured logging (request ID, account ID, Polo correlation ID) and integrate with existing monitoring pipelines.
- [ ] Confirm Polo tokens are stored only in environment variables and rotated via the secret management workflow. Avoid persisting raw tokens anywhere in Convex or logs.
- [ ] Add feature flagging (if needed) to allow dual-run of PayPal and Polo during migration, configured via an env gate (e.g., `BILLING_PROVIDER=polo`).
- [ ] Plan data migration for existing PayPal subscribers: export current subscription state, recreate subscriptions in Polo, and sync their plan tiers via the new webhook handler.
- [ ] Schedule cutover steps (freeze PayPal checkout, enable Polo, monitor provisioning health, announce change to users).

## Verification Checklist
- [ ] `swift test` / `npm run test` (web) succeed locally with Polo mocks.
- [ ] Manual sandbox checkout generates a Polo subscription, updates Convex account, and grants provisioning tokens instantly.
- [ ] Cancelled or failed payments trigger credential revocation and downgrade plan state.
- [ ] Documentation shipped alongside release; support runbooks updated with Polo escalation paths.
- [ ] Environment parity confirmed across development, staging, and production (secrets, webhook URLs, portal links).

## Open Questions
1. What are the exact Polo API endpoints, authentication scheme, and webhook payloads? Need direct vendor documentation.
2. Does Polo provide hosted billing portal URLs or do we embed a management UI? Impacts dashboard copy and CTA wiring.
3. How should existing PayPal subscribers be migrated or grandfathered? Need guidance on overlap period and invoicing reconciliation.
4. Are there additional plan tiers or regional pricing models that must be reflected in `planTier` enumerations?

Resolving these questions is required before development begins. Document findings in this plan file and update the relevant workstream tasks accordingly.

