## Overview

The web workspace powers rapid iteration on the studio UI. It includes content imports, history management, pronunciation glossaries, batch queueing, and (now) configurable automation pipelines that chain Convex actions together.

### Transit Transcription Workspace
- Record live microphone sessions or upload audio, then watch transcripts stream in with summaries and action items.
- Apply cleanup instructions (built-in presets like Australian English, professional tone, meeting minutes, or fully custom prompts) to generate polished copies alongside the raw transcript.
- Persist transcripts, summaries, and cleanup results to Convex for authenticated users or encrypted IndexedDB for guests, with Google Calendar follow-ups available once OAuth is connected.
- Arrange panels to suit your workflow. Layouts persist per-account through Convex (via `/api/workspace-layout`), with an automatic local-storage cache when Convex is unavailable. Switching accounts mid-session rehydrates the correct layout once the new user is authenticated.

## Authentication & Data Layer

The app uses Clerk for authentication and Convex (when configured) for persistent data. Without Convex the workspace falls back to JSON files or in-memory stores depending on the feature.

Set the following environment variables before running the app:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` – Clerk publishable key for client rendering.
- `CLERK_SECRET_KEY` – Clerk secret key used by server routes.
- `CONVEX_URL` – Base URL of your Convex deployment (e.g. `https://flat-moon-123.convex.cloud`).
- `CONVEX_DEPLOYMENT_KEY` or `CONVEX_ADMIN_KEY` – Token used to call Convex HTTP actions.
- `CONVEX_AUTH_SCHEME` – Optional override for the Authorization scheme (`Bearer`, `Deployment`, etc.); defaults intelligently based on the provided key.
- `PIPELINES_DATA_PATH` – Optional path to a JSON file the server uses when Convex is unavailable; omit to keep pipeline definitions in memory for the current process.
- `SESSION_DATA_PATH` – Optional JSON file path used when Convex session storage is disabled or unreachable; keeps encrypted session handshakes persistent between restarts.
- `TRANSIT_TRANSCRIPTS_PATH` – Optional encrypted JSON fallback for transit transcripts when Convex is disabled.
- `TRANSIT_CALENDAR_TOKENS_PATH` – Optional encrypted JSON fallback for Google Calendar tokens.
- `TRANSIT_GOOGLE_CLIENT_ID`, `TRANSIT_GOOGLE_CLIENT_SECRET`, `TRANSIT_GOOGLE_REDIRECT_URI` – Google OAuth 2.0 client credentials powering transit calendar scheduling.
- `TRANSIT_CALENDAR_ENCRYPTION_KEY` – Base64-encoded 32 byte key (AES-256-GCM) used to encrypt stored Google tokens.
- `TRANSIT_CALENDAR_DEFAULT_TIMEZONE` – (Optional) IANA zone identifier; defaults to `UTC` when omitted.
- `TRANSIT_CALENDAR_POST_CONNECT_REDIRECT` – (Optional) override for the OAuth callback redirect URL (defaults to `/transit`).

After changing `convex/schema.ts` run `npx convex dev` in `web/` to regenerate `_generated` types.

Signed-in users have generation history, managed provisioning state, and pipeline definitions synchronised through Convex. Guests continue to rely on browser storage, falling back to encrypted IndexedDB for history/snippets and in-memory stores for provisioning/session data. When Convex is unavailable, pipelines gracefully fall back to JSON or in-memory storage.

Workspace layout persistence follows the same pattern: Convex stores the canonical snapshot, while the client-side repository falls back to a local cache in offline or unauthorised states. Server-to-client traffic always flows through the Next.js route to keep Convex admin keys out of the browser bundle.

## Pipeline Automation

Automation pipelines let you chain multiple post-processing steps after an import (cleaning, summarising, translating, tone adjustments, chunking, and queue preparation). They can be saved, rerun, or triggered externally.

### Managing Pipelines

- Open the **Imports** panel and scroll to **Automation pipelines**.
- Create or edit a pipeline by choosing steps from the editor. Each step exposes provider-specific options:
  - **Clean & normalise** – toggles whitespace normalisation and bullet removal.
  - **Summarise / Translate / Adjust tone** – uses OpenAI when configured, with graceful fallbacks.
  - **Create segments** – defines chunking strategy and size.
  - **Queue configuration** – selects the TTS provider, voice preference, and optional segment delay.
- Attach a pipeline to an import entry via the selector and run it to push segments directly into the batch queue with voice recommendations derived from recent history.

### Webhooks & Scheduling

- Every pipeline owns a secret webhook URL surfaced in the details panel. POST JSON payloads to trigger a run remotely.
- Provide `content`, `title`, and `summary` fields to override defaults, or omit them to use the pipeline’s configured source URL.
- Rotate the webhook secret from the UI when needed; downstream callers must update to the new URL.
- Combine the webhook with external schedulers (e.g., GitHub Actions, cron) to run pipelines automatically. Use the optional cron description field in the editor to document expected schedules.

## Development

Start the dev server with:

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to load the studio. Hot reloading is enabled.

### Testing

The project uses Vitest. Run the suite with:

```bash
npm test
```

Notable new suites:
- `src/tests/unit/pipelines/pipelineRunner.test.ts`
- `src/tests/unit/pipelines/pipelineStore.test.ts`

## Deployment

The workspace is a standard Next.js application. You can deploy using Vercel or any platform that supports Node.js 18+. Ensure required environment variables and Convex credentials are available in the target environment.

## Versioning

- The web workspace follows semantic versioning; bump `web/package.json` with `npm version`.
- Build metadata appends the short git commit hash and is available through the footer badge.
- Refer to `Docs/WEB_VERSIONING.md` for the full scheme and release workflow.
