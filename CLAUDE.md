# CLAUDE.md

Two apps share this repo: a native macOS SwiftUI TTS app (`Sources/`, `Tests/`) and a Next.js + Convex web studio (`web/`). Full conventions live in `AGENTS.md` (root, native app + repo-wide) and `web/agents.md` (web workspace) — read the matching one before editing.

## Read first
- **Environment hazards**: this checkout sits in an iCloud-synced folder that has corrupted git and source files before; the git object store lives at `~/untitled-folder-2.git` with a pointer `.git` file in the project. See "Environment Hazards" in `AGENTS.md` before doing anything with git or when files read as truncated/missing.
- **Workflow**: Graphite is required — `gt create <branch>` / `gt submit`, never `git push` or `gh pr create`.

## Web app quick facts (`web/`)
- Commands (run inside `web/`): `bun install`, `bun run dev`, `bun run lint`, `bun run test` (vitest), `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e` (Playwright).
- Convex: all functions are internal, called from Next.js with an admin token; every function needs `args` AND `returns` validators; regenerate types with `bunx convex codegen`. Server code reads `CONVEX_URL` from `web/.env.local`.
- Security doctrine: spending server API keys requires a verified identity (`requireVerifiedIdentity`); managed provisioning credentials are pseudo-tokens that must never be sent to vendors; pipelines are owner-scoped. Details in `web/agents.md` → "Server API Key Policy".
- Billing: Polar webhook payloads are snake_case and go through `normalizeSubscription`; the provisioning provider key is `'openAI'`.
- Import summaries: OpenAI only for BYOK/managed callers; free users get on-device summaries via `@/lib/summarize/onDevice` (browser AI when available, extractive fallback) — never trigger a model download.
- UI: `/studio` is the single workspace (tabs deep-linked via `?tab=…`; `/transit` redirects); panel titles render once; no nested `CollapsibleSection`s; drag-rearrange only in "Arrange panels" mode; non-capture panels are `next/dynamic` chunks.
- Audio delivery: the synthesize route streams binary audio when `Accept: audio/*` (X-Request-Id header carries the id) and serves legacy base64 JSON otherwise; clients handle `audioBlob` OR `audioBase64` via `ClientSynthesisResult`. Client fetches to auth-guarded routes need `credentials: 'same-origin'` — `secureFetch` omits cookies by default.
- Tooling pins: ESLint stays on `^9` until typescript-eslint supports 10; vitest 4 uses `vi.fn<(args) => Return>()` generics.
