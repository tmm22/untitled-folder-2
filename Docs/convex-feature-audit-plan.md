# Web Convex Feature Audit Plan

> Goal: catalogue every feature in the Next.js web app that persists data through Convex, align documentation with the current code, and outline follow-up verification tasks. Keep the checkboxes in sync as work progresses.

## 0. Foundations
- [x] Confirm environment requirements (`CONVEX_URL`, `CONVEX_DEPLOYMENT_KEY`/`CONVEX_ADMIN_KEY`, optional `CONVEX_AUTH_SCHEME`) match README guidance (`web/README.md:3`–`web/README.md:19`).
  - [x] `CONVEX_URL`, `CONVEX_DEPLOYMENT_KEY`/`CONVEX_ADMIN_KEY` covered in `web/README.md` and root `README.md` managed provisioning section.
  - [x] `CONVEX_AUTH_SCHEME` documented in both README files with default behaviour notes.
- [x] Validate fallback storage paths for local/dev usage (`PROVISIONING_DATA_PATH`, `PIPELINES_DATA_PATH`, `SESSION_DATA_PATH`) are documented alongside Convex prerequisites.
  - [x] `PIPELINES_DATA_PATH` called out in `web/README.md`.
  - [x] `PROVISIONING_DATA_PATH` documented in root `README.md` (Managed Provisioning Configuration).
  - [x] `SESSION_DATA_PATH` now documented for web deploys (`web/README.md`, root `README.md`, `Docs/WEB_ARCHITECTURE.md`).
- [ ] Ensure Convex schema (`web/convex/schema.ts`) stays in lockstep with repositories and generated bindings (`web/convex/_generated/*`).
  - [x] `web/README.md` already instructs running `npx convex dev` after schema changes.
  - [ ] Double-check `web/convex/README.md` and other docs for consistent guidance; confirm generated files are up to date (`npx convex codegen` status TBD).

## 1. Account State & Usage Tracking
- [ ] Reconcile docs describing account persistence (`Docs/WEB_ARCHITECTURE.md:101`, `Docs/API_PROVISIONING_SERVICE.md:124`–`131`) with current behaviour.
  - [ ] `Docs/API_PROVISIONING_SERVICE.md` still references client-supplied `x-account-id`/plan headers; update to reflect server-enforced identity + `ACCOUNT_UPDATE_SECRET`.
  - [x] `Docs/SECURITY_REVIEW.md`/`DEPLOYMENT.md` document the new guard and secret requirements.
- [x] Verify Convex mutations/queries (`web/convex/account.ts`) cover get-or-create, plan updates, and usage recording with correct allowances (free/starter/pro caps confirmed).
- [x] Audit repository + context wiring (`web/src/lib/account/repository.ts`, `web/src/app/api/account/context.ts`) for URL fallback logic and in-memory failover—retry + logging observed.
- [x] Confirm API route guards (`web/src/app/api/account/route.ts`) enforce `ACCOUNT_UPDATE_SECRET` and Clerk identity before touching Convex.
- [x] Review automated coverage (`web/src/tests/unit/accountRoute.test.ts`, `web/src/tests/unit/accountRepositoryFallback.test.ts`) to ensure Convex success/failure paths are exercised.
- [ ] Capture any doc gaps or discrepancies (e.g., mismatched allowance numbers, missing entitlement notes).

## 2. Provisioning Credentials & Usage
- [ ] Cross-check provisioning flow documentation (`Docs/API_PROVISIONING_SERVICE.md`, `Docs/SECURITY_REVIEW.md`, `Docs/INSTRUCTIONS_FOR_REAL_DUMMIES.md:40`–`77`) with current Convex store expectations.
  - [ ] Docs still reference client-supplied plan headers for `/api/provisioning/token`; update to describe server-side account fetch + managed issuance.
  - [x] Security review and deployment docs capture admin guard requirements.
- [x] Inspect Convex functions (`web/convex/provisioning.ts`) for credential save, active lookup, revocation, usage logging, and list endpoints.
- [x] Validate orchestrator wiring (`web/src/app/api/provisioning/context.ts`, `web/src/lib/provisioning/storage/convexStore.ts`) including admin auth headers and fallbacks.
- [x] Ensure managed provisioning eligibility derives from Convex-backed account state (`web/src/lib/provisioning/access.ts`); errors logged but user messaging TODO when Convex offline.
- [x] Review tests (`web/src/tests/unit/provisioningOrchestrator.test.ts`, add coverage if missing) for Convex/http failure handling.
  - [x] Added `web/src/tests/unit/provisioningStoreFallback.test.ts` to verify Convex → JSON/in-memory downgrade paths.
- [ ] Document outstanding security hardening tasks called out in `Docs/SECURITY_REVIEW.md` (admin guard, token handling).

## 3. Session Vault Persistence
- [x] Align session persistence description in `Docs/WEB_ARCHITECTURE.md:91` with current implementation.
  - [x] Doc matches current fallback order (Convex → JSON → memory).
  - [x] Added explicit `SESSION_DATA_PATH` mention for JSON fallback.
- [x] Confirm Convex mutations (`web/convex/session.ts`) support save/get/delete/prune flows.
- [x] Audit store selection + fallback (`web/src/lib/session/index.ts`, `web/src/lib/session/storage/convexStore.ts`) to ensure errors downgrade gracefully to JSON/memory.
- [x] Exercise API helper resilience (`web/src/app/api/_lib/sessionRegistry.ts`) through unit tests (`web/src/tests/unit/sessionRegistry.test.ts`)—tests cover fallback path; prune failure case still TODO.
- [ ] Note operational requirements (e.g., scheduled pruning) for follow-up runbooks.

## 4. Generation History Ledger
- [x] Compare history persistence guidance in existing docs (gap spotted—add summary to `Docs/WEB_ARCHITECTURE.md` or README if missing).
  - [x] Docs now note Convex sync for signed-in users and IndexedDB fallback for guests.
- [x] Review Convex history functions (`web/convex/history.ts`) for list/record/remove/clear plus entry caps (200-per-user enforced).
- [x] Evaluate repository + API route behaviour (`web/src/lib/history/repository.ts`, `web/src/app/api/history/context.ts`, `web/src/app/api/history/route.ts`) including identity enforcement and limit handling.
- [x] Ensure client messaging (`web/src/components/account/AuthPanel.tsx`) accurately reflects Convex usage syncing (already states usage & history stored in Convex).
- [x] Extend or add regression tests covering Convex failure fallbacks and data validation (fallback path untested; add coverage).
  - [x] Added `web/src/tests/unit/historyRepositoryFallback.test.ts` to assert Convex init failures fall back to in-memory storage.

## 5. Automation Pipelines
- [x] Map documentation (`Docs/pipeline-automation-plan.md`, `web/README.md:3`, `Docs/SECURITY_REVIEW.md:6`) to implemented Convex usage.
  - [x] Docs now describe the current fallback-first approach and call out pending Convex pipeline functions.
- [x] Check pipeline repository (`web/src/lib/pipelines/repository.ts`) for Convex endpoints, fallback logic, and webhook secret handling.
- [x] Investigate absence of Convex functions under `web/convex/` for pipelines—add implementation plan (schema tables, http routes) or document intentional omission.
  - [x] Implemented Convex schema/functions (`web/convex/schema.ts`, `web/convex/pipelines.ts`) and expanded HTTP routes; design doc retained for reference.
- [x] Confirm API context fallback (`web/src/app/api/pipelines/context.ts`) and route retry strategy (`web/src/app/api/pipelines/route.ts`).
- [x] Review unit/integration coverage for Convex-backed pipeline CRUD operations; capture gaps (Convex repo implementation pending; fallback coverage lives in `pipelineRepositoryFallback.test.ts`).
  - [x] Added `web/src/tests/unit/convexPipelines.test.ts` to cover Convex path; integration/E2E remains future work.

## 6. Translation History & Ordering
- [ ] Reference translation rollout plan (`Docs/web_translation_ordering_plan.md`) to ensure checklists stay aligned.
  - [x] Plan already highlights Convex schema + UI milestones; update status column once audit results funnel back.
- [x] Validate Convex schema + mutations (`web/convex/translations.ts`) and repository (`web/src/lib/translations/repository.ts`) behaviour (pagination, promote, mark adopted, clear).
- [x] Inspect API wiring (`web/src/app/api/translations/context.ts`, `web/src/app/api/translations/route.ts`) for identity, payload validation, and fallback flows.
- [ ] Ensure UI/components (`web/src/components/translations/*`) reflect Convex-backed ordering and error states (manual QA pending).
- [x] Confirm automated tests (`web/src/tests/unit/convexTranslations.test.ts`, `web/src/tests/unit/translationsStore.test.ts`) cover Convex round-trips and concurrency cases; additional E2E coverage desirable.
  - [x] Added `web/src/tests/unit/translationRepositoryFallback.test.ts` to assert graceful downgrade when Convex is unavailable.

## 7. Clerk User Sync
- [x] Cross-check onboarding docs (`Docs/INSTRUCTIONS_FOR_REAL_DUMMIES.md`, README) to confirm Convex user synchronization steps are captured.
  - [x] Added `/api/auth/sync` walkthrough to `Docs/INSTRUCTIONS_FOR_REAL_DUMMIES.md`.
- [x] Review Convex user functions (`web/convex/users.ts`) and ensure HTTP actions enforce admin token checks (`web/convex/http.ts`).
- [x] Audit `/api/auth/sync` route (`web/src/app/api/auth/sync/route.ts`) for environment fallback, error logging, and Clerk field normalization.
- [x] Verify test coverage (`web/src/tests/unit/api/authSyncRoute.test.ts`) and expand to cover failure + retry paths if needed (tests cover success + skip path; add failure case backlog).

## 8. Convex Admin HTTP Actions & Security
- [x] Revisit security findings (`Docs/SECURITY_REVIEW.md:26`–`52`) to make sure mitigations landed in `web/convex/http.ts`.
- [x] Confirm admin guard tests exist (`web/src/tests/unit/convexHttpAuth.test.ts`) and extend for edge cases (scheme mismatches, missing tokens) — edge-case coverage present; add fallback token test backlog.
- [x] Catalogue exposed HTTP routes (account, provisioning, history, users, session) and verify README/Docs enumerate them for operators.
  - [x] Added consolidated reference at `Docs/convex-http-routes.md`.
- [x] Ensure monitoring/alerting requirements for these routes are documented (follow up in runbooks).
  - [x] Documented structured logging events and alert thresholds in `Docs/convex-http-routes.md`.

## 9. Fallbacks, Resilience, and Observability
- [ ] Inventory all fallbacks (in-memory, JSON file) across repositories/stores; verify consistency and logging.
  - [x] Account, session, provisioning, pipelines, translations contexts reviewed; history lacks explicit fallback logging.
- [ ] Document operational playbooks for Convex downtime: which features degrade, user-facing messaging, manual recovery steps.
- [x] Confirm tests simulate Convex outages where possible; add coverage for each repository/store (remaining gaps limited to future pipeline Convex implementation).
  - [x] Added fallback coverage for history, provisioning, pipelines, and translations (`historyRepositoryFallback.test.ts`, `provisioningStoreFallback.test.ts`, `pipelineRepositoryFallback.test.ts`, `translationRepositoryFallback.test.ts`).
- [x] Identify metrics/logging gaps to improve observability (e.g., add structured logging or analytics events when Convex errors occur).
  - [x] Added JSON structured logging in `web/convex/http.ts` and monitoring guidance in `Docs/convex-http-routes.md`.

## 10. Documentation & Communication Gaps
- [ ] Update/author README sections summarising Convex-backed features, prerequisites, and known limitations.
  - [ ] Add explicit callouts for history sync, managed provisioning eligibility, session storage fallback.
- [ ] Sync relevant product docs, onboarding flows, and support guidelines with new/updated Convex capabilities.
- [ ] Track unresolved questions from `Docs/API_PROVISIONING_SERVICE.md` and `Docs/API_PROVISIONING_OPEN_QUESTIONS.md` that impact Convex schema or retention.
- [ ] Prepare release notes / change log entries once audits or fixes ship (see `CHANGELOG.md` template).

## 11. Verification & Sign-off
- [ ] Run targeted unit/integration tests (`npm test`, `vitest --run`) after each Convex-related change.
- [ ] Execute end-to-end smoke tests (sign-in, provisioning issuance, history recording, pipeline CRUD, translation flow) against a Convex-enabled environment.
- [ ] Document verification evidence (logs, screenshots) for sign-off.
- [ ] Confirm stakeholders (product, ops, support) review the checklist before closure.
