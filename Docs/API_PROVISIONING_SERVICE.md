# Auto Provisioning Service Specification

## Purpose
- Deliver a premium web add-on that grants managed access to third-party LLM providers when users lack their own API keys.
- Maintain accurate per-user usage tracking, billing alignment, and rapid key revocation to protect provider quotas.

## Scope
- Applies to the web application; native apps continue to rely on personal API keys for now.
- Supports OpenAI at launch with a pluggable path for additional providers (e.g., ElevenLabs, Google) via shared abstractions.
- Covers subscription management, usage enforcement, and operational monitoring required to run the service reliably.

## Success Criteria
- Users with premium access can synthesize speech without supplying a personal key.
- Provisioned credentials rotate automatically without user intervention or downtime.
- Administrators can audit usage, disable accounts, and respond to provider incidents within agreed SLAs.

## Personas
- **Premium End User**: Upgrades for bundled access; expects seamless usage inside the existing web UI.
- **Support Agent**: Needs tooling to investigate account issues, pause service, or trigger key resets.
- **Operations Engineer**: Monitors system health, handles provider outages, and manages secret rotation.

## High-Level Architecture
- **Identity & Account Service**: Managed auth provider (Auth0, Supabase, Clerk) issues JWTs and stores profile metadata, MFA settings, and plan tier.
- **Billing Service**: Polar (preferred) or PayPal integrations manage subscriptions, hosted checkout, and customer portal links; webhook handlers update account status, trial periods, and payment failures.
- **Provisioning Orchestrator**: Secure backend service that pulls master provider keys from the vault, mints scoped credentials, and persists hashed tokens.
- **Secure Proxy/API Gateway**: Server component that signs LLM requests on behalf of users; enforces rate limits, logs usage, and injects provisioned credentials.
- **Usage Pipeline**: Message queue (Redis Streams, SQS, or PostgreSQL logical queue) plus worker that aggregates usage by user/plan for analytics and billing reconciliation.
- **Admin Dashboard**: Restricted UI for support/ops to view accounts, usage anomalies, and manual actions (revoke, rotate, refund).

```
             +----------------------------------------------+
             |                  Web App                     |
             |  - Premium upsell / dashboard UI             |
             |  - Session token for proxy access            |
             +----------------------------+-----------------+
                                          |
                                          v
       +------------------+      +---------------------------+
       | Identity Service |<---->| Billing Webhooks Service  |
       +------------------+      +---------------------------+
                 | JWT                     |
                 v                         v
       +-----------------------------------------------+
       | Provisioning Orchestrator                     |
       | - Provider adapters                           |
       | - Credential vault integration                |
       | - Usage hooks                                  |
       +-------------+-----------------+----------------+
                     | scoped token    | usage events
                     v                 v
           +------------------+   +---------------------+
           | Secure Proxy/API |   | Usage Aggregator    |
           | - Rate limiting  |   | - Quota enforcement |
           | - Request signing|   | - Cost analytics    |
           +---------+--------+   +---------+-----------+
                     |                      |
                     v                      v
              Third-party APIs        Billing Reports
```

## Key Capabilities
- Account state machine (`trial` → `active` → `past_due` → `canceled`) drives provisioning logic.
- Token minting strategy uses short-lived credentials (per user + per provider) stored only as salted hashes.
- Proxy service injects provider-specific headers, transforms responses, and records billable units.
- Usage limits configurable per plan: requests/minute, monthly token quotas, burst limits, fraud heuristics.
- Automated rotation: cron job or serverless scheduled task re-issues tokens before expiry and invalidates prior entries.

## Provider Abstraction Layer
- `ProvisioningProvider` interface defines `issueCredential`, `revokeCredential`, `estimateCost`, and `translateUsageMetrics`.
- Provider adapters (OpenAI, ElevenLabs, Google, future) implement the interface and encapsulate provider-specific API calls.
- Shared retry, backoff, and incident failover flows wrap provider adapters to standardise error handling.

## Data Model Overview
- `users` (id, authId, email, planTier, status, mfaEnabled, createdAt, updatedAt)
- `provisioned_credentials` (id, userId, provider, tokenHash, scopes, issuedAt, expiresAt, status, lastRotatedAt)
- `usage_events` (id, userId, provider, requestId, tokensUsed, costMinorUnits, responseMs, timestamp, status)
- `invoices` (id, userId, paypalSubscriptionId, amountMinorUnits, periodStart, periodEnd, status, createdAt)
- `audit_logs` (id, actorId, action, targetType, targetId, metadataJson, createdAt)

## Core Workflows
1. **Premium Activation**
   - User completes checkout → PayPal webhook marks account `active`.
   - Provisioning orchestrator issues credential(s) and stores hashed tokens.
   - Secure proxy caches credential metadata and returns session-scoped access token to the web client.
2. **Request Execution**
   - Web client includes session token when calling `/api/tts`.
   - Proxy validates token, enforces rate limit, signs provider request, forwards payload via secure fetch.
   - Response logged; usage event enqueued with request cost metrics.
3. **Usage Aggregation & Billing Sync**
   - Worker consumes usage events, aggregates by user/period, updates analytics tables.
   - Threshold breaches trigger alerts or automated plan upgrades/downgrades.
4. **Rotation & Revocation**
   - Scheduler rotates credentials before `expiresAt` and notifies proxy to pick up new tokens.
   - Manual revoke (support/ops) invalidates credential, forces client re-auth.

## Security & Compliance Controls
- Store provider master keys exclusively in an HSM-backed secret manager (AWS KMS, HashiCorp Vault) with just-in-time session tokens.
- All credential hashes salted with per-user random values; plain tokens stay in memory only during provisioning.
- Enforce TLS for all client interactions; pin upstream certificates where supported.
- Apply anomaly detection to usage events to detect abuse or compromised accounts.
- Maintain audit log for user/administrator actions; retain for compliance windows (e.g., 1 year).

## Operational Considerations
- Implement circuit breakers so provider outages fail gracefully with status messaging.
- Expose health checks (`/healthz`, `/readyz`) that validate vault connectivity and provider heartbeat.
- Observability stack: structured logs, metrics (request rate, error rate, latency), and traces for provider calls.
- Disaster recovery plan includes rotating master keys, restoring usage data, and replaying message queues.

## Integration with Web Client
- UI updates: premium upsell modal, account dashboard with usage charts, key rotation controls.
- Client obtains JWT via auth provider; exchanges for short-lived proxy token via `/api/session` route.
- Secure fetch wrapper attaches proxy token automatically; handles 401/429 responses by prompting re-auth or plan upgrade.

## Implementation Milestones
1. Select auth + billing stack; set up PayPal sandbox and auth provider tenant.
2. Scaffold provisioning service within `web` backend (e.g., `web/app/api/provisioning`).
3. Implement provider abstraction with OpenAI adapter and vault integration.
4. Build secure proxy route with rate limiting and usage logging.
5. Create usage aggregation worker (initially cron job writing to database).
6. Ship premium dashboard UI and PayPal billing flows.
7. Add support tooling (admin dashboard, alerting).

## Prototype Snapshot (January 2025)
- **Convex Integration (optional)**: When `CONVEX_URL` and `CONVEX_DEPLOYMENT_KEY` (or legacy `CONVEX_ADMIN_KEY`) are provided, the orchestrator and account repository delegate reads/writes to Convex functions (`/api/provisioning/*`, `/api/account/*`). Ship Convex mutations that mirror the JSON payloads documented here.
- **Environment Setup**: Copy `web/.env.local.example` to `.env.local` and populate at minimum `CONVEX_URL` + `CONVEX_DEPLOYMENT_KEY` (or `CONVEX_ADMIN_KEY`), choose `BILLING_PROVIDER`, then fill the matching Polar or PayPal variables so Next.js loads the configuration automatically.
- **Fallback Persistence**: Without Convex configuration, the orchestrator uses `JsonFileProvisioningStore` when `PROVISIONING_DATA_PATH` is set, or the in-memory store for local development.
- **Token Cache**: `InMemoryProvisioningTokenCache` keeps short-lived tokens resident in memory for reuse across requests.
- **Provider Adapter**: `OpenAIProvisioningProvider` derives scoped pseudo tokens from the root OpenAI key while real vault-backed issuance is under design.
- **API Surface**:
  - `POST /api/provisioning/token` issues or rotates credentials after validating `x-account-id`, `x-plan-tier`, and `x-plan-status` headers.
  - `GET /api/account` / `PATCH /api/account` proxy through the repository (Convex when configured) to hydrate and persist plan data.
  - `POST /api/billing/checkout` and `/api/billing/portal` provide integration points for real billing flows while updating account state. Configure the PayPal credentials via environment variables so the built-in client can create subscriptions and link to account management without bundling the SDK.
- **Client Hooks**:
  - `useAccountStore` tracks plan tier, billing status, usage summary, and whether managed provisioning is allowed.
  - `useCredentialStore` falls back to `ensureProvisionedCredential` when the encrypted vault is locked or empty.
- **UI**: `PremiumDashboard` surfaces plan status, usage charts, CTA buttons, and action messages while `CredentialsPanel` highlights when managed provisioning is active.

## Dependencies & Risks
- Reliance on external auth/billing providers introduces vendor lock-in; design adapters to ease migration.
- Provider policy changes may affect credential issuance; monitor API terms and quotas closely.
- Accurate cost estimation requires timely provider metadata; build periodic sync job.

## Documentation & Runbooks
- Maintain SOPs for rotation, incident response, and billing disputes in `Docs/runbooks/`.
- Update onboarding materials to cover premium provisioning workflows and support escalation paths.
