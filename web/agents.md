# Web Workspace Guidelines

## Project Layout
- `app/` Next.js App Router entrypoints plus API handlers that proxy through `@/lib/**` and expose feature route groups such as `studio/` and `transit/`.
- `components/` Reusable UI primitives and form controls shared between modules; keep these presentational and stateless.
- `modules/` Feature-scoped packages combining Zustand stores, hooks, and views (imports, pipelines, transit transcription, queue, etc.).
- `lib/` Typed data layer with clients, repositories, and helper utilities for Convex, billing, authentication, pipelines, transcripts, and secure fetch.
- `convex/` Convex functions and schema; edit `schema.ts` and run `npx convex dev` to regenerate `_generated/` types before committing.
- `types/` Cross-cutting TypeScript definitions consumed by modules and API routes.
- `styles/` Tailwind entrypoints (e.g. `globals.css`) plus tokens kept in sync with `tailwind.config.ts`.
- `public/` Static assets served by Next.js; prefer hashed filenames for new media and keep large binaries out of Git.
- `src/tests/` Vitest unit, component, integration suites plus mocks and fixtures; Playwright specs live under `tests/e2e/`.

## Development Workflow
- Install dependencies with `npm install` inside `web/`; keep `package-lock.json` checked in for reproducible builds.
- Copy `.env.local.example` to `.env.local` and fill in Clerk, Convex, billing, and Google credentials without committing real secrets.
- Launch the UI with `npm run dev`; start `npx convex dev` in a second terminal when working against live Convex functions.
- Use `npm run build` to verify production bundles and `npm start` to serve the output locally.
- Run `npm run lint` before sending changes; the ESLint flat config blocks warnings and enforces `next/core-web-vitals`.
- After changing Convex schema or functions, run `npx convex dev --once` (or keep the watcher running) so `_generated/` stays current.

## Coding Standards
- Stick with strict TypeScript and the `@/*` path alias; colocate feature logic inside the owning module.
- Compose UI as functional components; default to server components under `app/` and mark client components only when browser APIs are needed.
- Manage client state with the module-specific Zustand stores; add persistence or devtools middleware sparingly and only where existing modules do.
- Keep network access inside repositories under `@/lib/**`; UI layers consume exported hooks/clients instead of calling fetch directly.
- Use `secureFetch` (or the provider-specific clients in `@/lib/providers/`) for outbound HTTP to preserve timeout, header, and credential policies.
- Tailwind is the primary styling system; extend tokens in `tailwind.config.ts` rather than hard-coding ad hoc colours.
- Mirror naming, error handling, and UI terminology with the native app so cross-platform features stay aligned.

## Testing & QA
- Place new unit and integration tests under `src/tests/<area>` (e.g. `unit/pipelines/`); reuse shared fixtures in `src/tests/fixtures/`.
- Execute the suite with `npm test`; for rapid feedback use `npm run test:watch` which boots Vitest with jsdom and the shared setup file.
- Mock external services via MSW and the Clerk stubs in `src/tests/mocks/`; extend those mocks instead of creating ad hoc replacements.
- Playwright end-to-end coverage lives in `tests/e2e/`; run `npm run test:e2e` and set `PLAYWRIGHT_BASE_URL` when targeting non-local hosts.
- Capture traces for flaky E2E runs—the config already retains them on failure; attach trace bundles to bug reports.
- Document new manual QA steps in the PR description when automated coverage is impractical.

## Data & Integrations
- Convex clients live in `@/lib/convex` and feature-specific repositories (history, pipelines, workspace layout, etc.); extend these layers instead of embedding Convex calls in UI.
- Clerk authentication flows funnel through helpers in `src/app/api/_lib/` and `@/lib/session`; thread new routes through those registries to keep cookies consistent.
- Billing logic is abstracted in `@/lib/billing/` with provider selectors keyed by `BILLING_PROVIDER`; implement new gateways behind the same interface.
- Transit transcription relies on OpenAI and Google helpers under `@/lib/transit/**`; keep API credentials server-side and proxy browser requests through Next.js routes.
- Imports, pipelines, queue, and pronunciation modules expose typed repositories for persistence; reuse these when adding features that touch the same data.
- Offline fallbacks use LocalVault, history repositories, and IndexedDB adapters; additions should encrypt data and respect existing storage paths.

## Security & Compliance
- Never commit populated `.env.local`; store secrets in the shared vault and rotate them when webhook URLs or provider keys change.
- Enforce HTTP hygiene by routing requests through `secureFetch` or provider clients—this keeps cookies out of requests and sets 30s abort timeouts.
- Sanitize user-provided text in pipelines/imports with utilities in `@/lib/pipelines/text.ts` before persisting or rendering.
- Clerk session cookies are managed server-side; avoid manipulating them on the client beyond the provided helpers.
- When introducing new persistence layers, encrypt payloads with `LocalVault` and keep files within the approved `.data/` paths.
- Document any new environment variables in `.env.local.example` and coordinate updates with DevOps secrets stores.

## Deployment
- `npm run build` must pass on Node 18+; fix lint and type errors locally before pushing.
- Deploy to Vercel or a Node-compatible host with the full env variable set: Clerk keys, Convex URL/admin key, billing provider secrets, and pipeline fallbacks where needed.
- Bump `web/package.json` using `npm version` and document release notes in `Docs/WEB_VERSIONING.md`; bundle metadata appears in the footer badge.

## Reference Material
- `web/README.md` walks through the studio feature set—update it when UI flows or dependencies shift.
- `web/convex/README.md` covers Convex deployment steps and schema regeneration details.
- Reuse assets from `src/tests/mocks/` and `src/tests/fixtures/` for deterministic test data; keep mocks colocated with the features they support.
- Cross-check the native app guidance in the root `AGENTS.md`, `ARCHITECTURE.md`, and `IMPLEMENTATION_GUIDE.md` when building shared functionality.
