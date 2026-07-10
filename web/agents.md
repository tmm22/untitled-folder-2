# Web Workspace Guidelines

## Project Layout
- `app/` Next.js App Router entrypoints plus API handlers that proxy through `@/lib/**` and expose feature route groups such as `studio/` and `transit/`.
- `components/` Reusable UI primitives and form controls shared between modules; keep these presentational and stateless.
- `modules/` Feature-scoped packages combining Zustand stores, hooks, and views (imports, pipelines, transit transcription, queue, etc.).
- `lib/` Typed data layer with clients, repositories, and helper utilities for Convex, billing, authentication, pipelines, transcripts, and secure fetch.
- `convex/` Convex functions and schema; edit `schema.ts` and run `bunx convex dev` to regenerate `_generated/` types before committing.
- `types/` Cross-cutting TypeScript definitions consumed by modules and API routes.
- `styles/` Tailwind entrypoints (e.g. `globals.css`) plus tokens kept in sync with `tailwind.config.ts`.
- `public/` Static assets served by Next.js; prefer hashed filenames for new media and keep large binaries out of Git.
- `src/tests/` Vitest unit, component, integration suites plus mocks and fixtures; Playwright specs live under `tests/e2e/`.

## Development Workflow
- Install dependencies with `bun install` inside `web/`; keep the text `bun.lock` checked in for reproducible builds.
- Copy `.env.local.example` to `.env.local` and fill in Clerk, Convex, billing, and Google credentials without committing real secrets.
- Launch the UI with `bun run dev`; start `bunx convex dev` in a second terminal when working against live Convex functions.
- Use `bun run build` to verify production bundles and `bun run start` to serve the output locally.
- Run `bun run lint` before sending changes; the ESLint flat config blocks warnings and enforces `next/core-web-vitals`.
- ESLint is pinned to `^9` — ESLint 10 breaks `@typescript-eslint` 8.x pulled in by `eslint-config-next`. Do not accept Dependabot bumps to eslint 10 until typescript-eslint supports it.
- Vitest 4 typing: `vi.fn<(args) => Return>()` takes a single function-type generic; the old `vi.fn<[Args], Return>` form no longer compiles. Import `type Mock` from `vitest` (the `vi.Mock` namespace type was removed).
- After changing Convex schema or functions, run `bunx convex dev --once` (or keep the watcher running) so `_generated/` stays current.

## Coding Standards

### TypeScript Best Practices
- Target ES2022 in `tsconfig.json`; strict mode is enabled and required.
- Use the `@/*` path alias consistently; avoid deep relative imports like `../../../`.
- Prefer `const` over `let`; never use `var`.
- Use strict equality (`===`, `!==`); never use loose equality (`==`, `!=`).
- Avoid `any` type; use `unknown` for untyped inputs and narrow with type guards.
- Avoid `@ts-ignore` and `@ts-nocheck`; fix the underlying type issue instead.
- Use type assertions (`as Type`) sparingly and only when TypeScript cannot infer correctly.

### React & Next.js Patterns
- Use functional components only; class components are not permitted.
- Default to Server Components under `app/`; add `'use client'` only when browser APIs are needed.
- Use `next/navigation` (App Router); never import from `next/router` (Pages Router).
- Avoid `React.FC` and `React.FunctionComponent`; use explicit prop types instead.
- Use TypeScript for prop validation; never use PropTypes.
- Compose UI with Zustand stores from the owning module for client state.

### API Route Patterns
- Define explicit `RouteContext` types for dynamic routes; never use `any` for context params.
- Always `await context.params` in App Router dynamic routes.
- Return appropriate HTTP status codes: 400 for validation, 401 for auth, 404 for not found, 500 for server errors.
- Sanitize all error messages returned to clients; log full errors server-side only.
- Validate `[provider]` params against the `ProviderType` union; reject unknown providers with 400.
- Cap unbounded user input (e.g. synthesis text is limited to 20,000 characters).

### Server API Key Policy (Critical)
- Spending a server env key (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_TTS_API_KEY`) requires a **verified identity** (`requireVerifiedIdentity`) — guest cookies are never sufficient. BYOK callers (session-encrypted or `x-provider-key`) bring their own entitlement.
- Managed (provisioned) credentials are **usage-accounting pseudo-tokens** (`tts-proxy-…`), never real vendor keys. They must never be sent upstream as bearer tokens; their presence entitles the caller to the server key. Provider adapters implement this via `ProviderContext.allowServerKey`.
- The provisioning provider registry key is `'openAI'` (matching `ProviderType`), not `'openai'` — a mismatch makes credential issuance fail silently.
- Pipelines are owner-scoped: routes pass `auth.userId` to `repository.list()` and set `ownerId` on create; `isPipelineAccessibleBy` gates get/update/delete/run (legacy ownerless pipelines stay visible to all verified users). Return 404, not 403, for other users' pipelines.

### Convex Standards
- Every Convex function must declare BOTH `args` and `returns` validators (`v.null()` when returning nothing). TypeScript enforces handler/validator agreement — run `bunx tsc --noEmit` after editing.
- `httpAction` handlers must **return** `Response` objects; a thrown `Response` becomes a generic 500. `requireAdmin` in `convex/http.ts` returns `Response | null` — check and return the failure.
- Express range bounds inside `.withIndex(...)` (e.g. `.lt('sequenceIndex', cursor)`), not in a post-index `.filter()`.
- After schema/function changes run `bunx convex codegen` (uses `CONVEX_DEPLOYMENT` from `.env.local`) so `_generated/` stays current.

### Async & Modern JavaScript
- Use `async/await` over `.then()` chains for readability.
- Use `Buffer.from()` and `Buffer.alloc()`; never use the deprecated `Buffer()` constructor.
- Use the `URL` constructor; never use deprecated `url.parse()`.
- Use optional chaining (`?.`) and nullish coalescing (`??`) where appropriate.
- Use object/array spread over `Object.assign()` and `.concat()` where cleaner.

### What NOT to Do
- Do not use `require()` or `module.exports`; use ES module imports/exports.
- Do not use `/// <reference` directives; configure in tsconfig instead.
- Do not add comments unless the code is complex enough to require explanation.
- Do not use `getServerSideProps`, `getStaticProps`, or `getInitialProps` (Pages Router patterns).
- Do not commit `console.log` for debugging; use structured logging or remove before merge.

### Styling & UI
- Tailwind CSS is the primary styling system; extend tokens in `tailwind.config.ts` rather than hard-coding ad hoc colours.
- Every workspace panel title renders exactly once — the `CollapsibleSection` header IS the title. Never add an inner `<h2 class="panel-title">`/`<h3>` repeating it.
- Never nest a `CollapsibleSection` inside another (leaf panels like `BatchPanel` already self-wrap; render them bare in the workspace, as `importPanel`/`snippetPanel` do).
- Panel drag-and-drop is gated behind the "Arrange panels" toggle in `TransitTranscriptionPanel`; drop zones and grab cursors must not render in normal use.
- `/studio` is the single workspace route (`/transit` redirects there). Deep-link to tabs with `/studio?tab=capture|transcript|calendar|narration|history|settings` — anchor fragments no longer work with the tabbed layout.
- "Clear session" (transcription/calendar state) and "Reset layout" (persisted panel arrangement) are separate actions; do not recombine them into one button.
- Keep network access inside repositories under `@/lib/**`; UI layers consume exported hooks/clients instead of calling fetch directly.
- Use `secureFetch` (or the provider-specific clients in `@/lib/providers/`) for outbound HTTP to preserve timeout, header, and credential policies.
- Mirror naming, error handling, and UI terminology with the native app so cross-platform features stay aligned.
- Colocate feature logic inside the owning module; avoid scattering related code across unrelated directories.

## Testing & QA
- Place new unit and integration tests under `src/tests/<area>` (e.g. `unit/pipelines/`); reuse shared fixtures in `src/tests/fixtures/`.
- Execute the suite with `bun run test`; for rapid feedback use `bun run test:watch` which boots Vitest with jsdom and the shared setup file.
- Mock external services via MSW and the Clerk stubs in `src/tests/mocks/`; extend those mocks instead of creating ad hoc replacements.
- Playwright end-to-end coverage lives in `tests/e2e/`; run `bun run test:e2e` and set `PLAYWRIGHT_BASE_URL` when targeting non-local hosts.
- Capture traces for flaky E2E runs—the config already retains them on failure; attach trace bundles to bug reports.
- Document new manual QA steps in the PR description when automated coverage is impractical.

## Data & Integrations
- **Polar webhooks arrive in snake_case** (`customer_id`, `product_id`, `current_period_end`, `ends_at`, `trial_end`, `customer.external_id`). `normalizeSubscription` in `src/app/api/billing/polar/events/route.ts` maps both shapes to camelCase before the mappers run — route new fields through it, never read raw camelCase off the payload.
- OpenAI has **no voice-listing endpoint**; the OpenAI adapter returns its curated `DEFAULT_OPENAI_VOICES` list (only documented voice ids). The speech API body supports only `model`, `input`, `voice`, `response_format`, `speed`, `instructions` — unknown fields are rejected with 400.
- Google TTS `audioContentType` must be derived from the chosen `audioEncoding` (`contentTypeMap`), not hardcoded to `audio/mpeg`.
- The web app reads `CONVEX_URL` (server-side) from `web/.env.local` — `NEXT_PUBLIC_CONVEX_URL` is read nowhere; without `CONVEX_URL` every Convex-backed repository silently falls back to local storage.
- Convex clients live in `@/lib/convex` and feature-specific repositories (history, pipelines, workspace layout, etc.); extend these layers instead of embedding Convex calls in UI.
- Clerk authentication flows funnel through helpers in `src/app/api/_lib/` and `@/lib/session`; thread new routes through those registries to keep cookies consistent.
- Billing logic is abstracted in `@/lib/billing/` with provider selectors keyed by `BILLING_PROVIDER`; implement new gateways behind the same interface.
- Transit transcription relies on OpenAI and Google helpers under `@/lib/transit/**`; keep API credentials server-side and proxy browser requests through Next.js routes.
- Imports, pipelines, queue, and pronunciation modules expose typed repositories for persistence; reuse these when adding features that touch the same data.
- Offline fallbacks use LocalVault, history repositories, and IndexedDB adapters; additions should encrypt data and respect existing storage paths.

## Security & Compliance

### Environment & Secrets
- Never commit populated `.env.local`; store secrets in the shared vault and rotate them when webhook URLs or provider keys change.
- Document any new environment variables in `.env.local.example` and coordinate updates with DevOps secrets stores.
- Use `WEBHOOK_REQUIRE_HMAC=1` in production to enforce HMAC signature verification on webhooks.

### Production Guards
- Dev authentication flags (`AUTH_DEV_TOKENS`, `AUTH_ASSUME_TRUST`) are automatically blocked in production.
- Billing URLs (`PAYPAL_SUCCESS_URL`, `POLAR_CHECKOUT_SUCCESS_URL`) must be configured in production; localhost fallbacks only work in development.
- Clerk publishable key (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) must be set in production; test keys only work in development.
- Always check `process.env.NODE_ENV === 'production'` before allowing dev-only fallbacks.

### Webhook Security
- Use HMAC-SHA256 signature verification for webhook endpoints; see `@/lib/pipelines/webhookAuth.ts`.
- Include timestamp headers (`X-Webhook-Timestamp`) and reject requests older than 5 minutes to prevent replay attacks.
- Use timing-safe comparison (`crypto.timingSafeEqual`) for secret lookups to prevent timing attacks.
- Parse signature headers strictly; reject malformed `X-Webhook-Signature` values.

### Error Handling
- Sanitize all error messages returned to clients; never expose stack traces, API keys, or internal paths.
- Map common errors to user-friendly messages: auth failures → "Authentication failed", rate limits → "Rate limit exceeded", timeouts → "Request timed out".
- Log full error details server-side with `console.error()` for debugging.
- Use specific HTTP status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error).

### Network & Fetch
- Enforce HTTP hygiene by routing requests through `secureFetch` or provider clients—this keeps cookies out of requests and sets 30s abort timeouts.
- Always check `response.ok` after fetch calls before processing the response.
- Clerk session cookies are managed server-side; avoid manipulating them on the client beyond the provided helpers.

### Data Protection
- Sanitize user-provided text in pipelines/imports with utilities in `@/lib/pipelines/text.ts` before persisting or rendering.
- When introducing new persistence layers, encrypt payloads with `LocalVault` and keep files within the approved `.data/` paths.
- Never log or expose user credentials, API keys, or tokens in error messages or responses.

## Deployment
- `bun run build` must pass on Node 22+ (or the pinned Bun runtime); fix lint and type errors locally before pushing.
- Deploy to Vercel (configured via `vercel.json`) or a Node-compatible host with the full env variable set: Clerk keys, Convex URL/admin key, billing provider secrets, and pipeline fallbacks where needed.
- Bump `web/package.json` using `npm version` (or manually) and document release notes in `Docs/WEB_VERSIONING.md`; bundle metadata appears in the footer badge.

## Graphite Workflow (Required)
See the root `AGENTS.md` for Graphite CLI commands. Use `gt submit` instead of `git push` or `gh pr create` for all PRs.

## Reference Material
- `web/README.md` walks through the studio feature set—update it when UI flows or dependencies shift.
- `Docs/project_maintenance_playbook.md` documents the long-term maintenance cadence, dependency workflows, and release procedures shared across the app and web workspaces.
- `web/convex/README.md` covers Convex deployment steps and schema regeneration details.
- Reuse assets from `src/tests/mocks/` and `src/tests/fixtures/` for deterministic test data; keep mocks colocated with the features they support.
- Cross-check the native app guidance in the root `AGENTS.md`, `ARCHITECTURE.md`, and `IMPLEMENTATION_GUIDE.md` when building shared functionality.

## Quick Reference

### Do
| Area | Practice |
|------|----------|
| TypeScript | ES2022 target, strict mode, `@/*` aliases, `unknown` over `any` |
| React | Functional components, Server Components by default, `next/navigation` |
| API Routes | Explicit `RouteContext` types, `await context.params`, sanitized errors |
| Security | HMAC verification, timing-safe comparison, production guards |
| Async | `async/await`, `Buffer.from()`, `URL` constructor |
| Styling | Tailwind CSS, tokens in config, no inline colours |

### Don't
| Area | Avoid |
|------|-------|
| TypeScript | `any`, `@ts-ignore`, `var`, loose equality (`==`) |
| React | Class components, `React.FC`, PropTypes, `next/router` |
| API Routes | `any` for context, exposing internal errors to clients |
| Security | Dev flags in production, hardcoded secrets, timing-unsafe comparisons |
| Legacy | `require()`, `module.exports`, `getServerSideProps`, `url.parse()` |
| Debugging | Committed `console.log`, commented-out code |
