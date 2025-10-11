# Convex HTTP Route Catalogue

| Path | Method | Purpose | Notes |
|------|--------|---------|-------|
| `/account/getOrCreate` | POST | Fetch or initialise account record for the current user. | Requires admin token; proxied by `ConvexAccountRepository`. |
| `/account/update` | POST | Update plan tier/billing status/expiry. | Same handler as `/account/updateAccount`; gated by `ACCOUNT_UPDATE_SECRET` upstream. |
| `/account/updateAccount` | POST | Alias to `/account/update`. | |
| `/account/recordUsage` | POST | Increment usage counters for a user. | |
| `/history/list` | POST | Return recent synthesis history entries. | Max 200 entries per user. |
| `/history/record` | POST | Create or update a history entry. | |
| `/history/remove` | POST | Delete a specific history entry. | |
| `/history/clear` | POST | Remove all history entries for a user. | |
| `/provisioning/save` | POST | Persist provisioned credential metadata. | |
| `/provisioning/findActive` | POST | Fetch active credential for a user/provider. | |
| `/provisioning/markRevoked` | POST | Mark a credential as revoked. | |
| `/provisioning/list` | POST | List all stored credentials. | |
| `/provisioning/recordUsage` | POST | Append usage record for billing analytics. | |
| `/provisioning/listUsage` | POST | Return usage records for a user. | |
| `/session/save` | POST | Persist encrypted session secret used by vault. | |
| `/session/get` | POST | Retrieve stored session secret. | |
| `/session/delete` | POST | Delete session secret. | |
| `/session/prune` | POST | Delete expired session secrets. | |
| `/users/ensure` | POST | Upsert Clerk profile into Convex `users` table. | Used by `/api/auth/sync`. |
| `/users/get` | POST | Fetch user profile by Clerk ID. | |
| `/pipelines/list` | POST | List saved pipeline definitions. | Sorted alphabetically by name. |
| `/pipelines/get` | POST | Fetch a pipeline by id. | Returns full definition including secret. |
| `/pipelines/findByWebhookSecret` | POST | Resolve pipeline via webhook secret. | Used by inbound webhook runner. |
| `/pipelines/create` | POST | Create pipeline definition. | Generates ids and webhook secrets server-side. |
| `/pipelines/update` | POST | Update pipeline definition. | Supports secret rotation via `rotateSecret`. |
| `/pipelines/delete` | POST | Delete pipeline definition. | Returns `{ result: boolean }`. |
| `/pipelines/recordRun` | POST | Record pipeline completion metadata. | Updates `lastRunAt`. |

All routes:
- Require `Authorization: <scheme> <token>` where the token matches `CONVEX_DEPLOYMENT_KEY` or `CONVEX_ADMIN_KEY`. Optional `x-convex-admin-key` header is supported for legacy clients.
- Return JSON payloads shaped as `{ result: ... }` when invoked directly.
- Mirror the methods used inside `ConvexAccountRepository`, `ConvexProvisioningStore`, `ConvexHistoryRepository`, `ConvexSessionStore`, and `ConvexPipelineRepository`.

## Monitoring & Alerting
- **Structured Logging**: Every HTTP action writes JSON logs (`convex_http_success`, `convex_http_failure`, `convex_http_unauthorized`, etc.) with timestamps and paths. Forward these logs to your observability stack (e.g., Datadog, CloudWatch) and alert on failure/unauthorised events.
- **Metrics**: Track request counts, error rates, and latency per path. A simple approach is to tail structured logs and emit metrics via log-based pipelines.
- **Alerting Thresholds**:
  - Unauthorized attempts (`convex_http_unauthorized`) > 5/min → security alert.
  - Failures (`convex_http_failure`) > 3/min per path → operational alert.
  - Missing admin token errors (`convex_http_missing_admin_token`) should page immediately; indicates misconfiguration.
- **Dashboards**: Visualise per-route success/failure counts, recent error messages, and traffic sources to catch regressions quickly.
