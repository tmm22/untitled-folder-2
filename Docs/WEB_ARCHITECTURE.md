# Web Text-to-Speech App Architecture

## Goals
- Parity with the macOS app feature set while delivering a responsive, installable web experience.
- Reuse business rules and provider abstractions conceptually, adapting them to a browser + serverless friendly stack.
- Maintain strict separation of concerns so provider integrations, playback, and long-form imports can evolve independently.

## Technology Stack
- **Framework**: Next.js 14 (App Router) with React 18 and TypeScript 5
- **Styling**: Tailwind CSS with CSS variables for theme sync, Radix UI primitives for accessible components
- **State Management**: Zustand stores grouped per domain, persisted via IndexedDB through `idb-keyval`
- **Server Runtime**: Next.js Route Handlers running on Node.js runtime (edge-compatible where possible)
- **Networking**: `fetch` with custom SecureFetch wrapper to mirror `SecureURLSession`
- **Audio**: Web Audio API + `<audio>` element hybrid managed by a dedicated `AudioEngine` class
- **Data Storage**:
  - User preferences, snippets, and history persisted in IndexedDB (encrypted via Web Crypto AES-GCM using a derived key)
  - API credentials never stored server-side; users opt-in to local encrypted storage unlocked per session
- **Testing**: Vitest + Testing Library for UI, MSW for network mocks, Playwright (follow-up) for E2E

## Application Layout
```
web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                   # Main TTS workspace
│   └── api/
│       ├── providers/
│       │   ├── [provider]/voices/route.ts   # Voice catalog proxy
│       │   └── [provider]/synthesize/route.ts # Audio generation proxy
│       └── imports/route.ts       # Smart import pipeline
├── components/
│   ├── editor/
│   ├── playback/
│   ├── settings/
│   ├── batches/
│   └── shared/
├── lib/
│   ├── audio/AudioEngine.ts
│   ├── crypto/LocalVault.ts
│   ├── fetch/secureFetch.ts
│   ├── imports/{article,reddit}Parser.ts
│   └── providers/{elevenLabs,google,openAI}.ts
├── modules/
│   ├── account/
│   ├── history/
│   ├── imports/
│   ├── preferences/
│   ├── queue/
│   ├── snippets/
│   └── tts/
├── public/
├── styles/
│   └── globals.css
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── next.config.mjs
├── package.json
└── tsconfig.json
```

## Local Persistence Modules
- **HistoryStore** (`modules/history/store.ts`): captures serialized generation metadata, transcript pointers, and supports transcript/audio export helpers in the UI.
- **SnippetStore** (`modules/snippets/store.ts`): keeps reusable text blocks with append/replace helpers surfaced via `SnippetPanel`.
- **PronunciationStore** (`modules/pronunciation/store.ts`): persists regex/literal overrides and hydrates `useTTSStore` before each generation.
- **ImportStore** (`modules/imports/store.ts`): records URL or manual imports with summaries for later injection into the editor.
- **AccountStore** (`modules/account/store.ts`): keeps lightweight user identity, plan tier, and billing status with derived flags for premium provisioning access.


## Feature Parity Mapping
| macOS Feature | Web Strategy |
| ------------- | ------------- |
| Multi-provider synthesis (OpenAI, ElevenLabs, Google, Tight Ass Mode) | Server route handlers act as thin proxies to provider REST APIs using Vercel environment secrets. Tight Ass Mode replaced with browser `speechSynthesis` for offline fallback, and the provider selector now reflects the detected voice + engine details from `speechSynthesis`. |
| Dynamic voice catalogs with preview playback | `/api/providers/[provider]/voices` pulls fresh voice lists from OpenAI and ElevenLabs on demand (5 minute cache) and falls back to a curated default set. Preview URLs streamed via `AudioEngine`. |
| Character limits per provider with contextual warnings | Provider metadata supplies limits consumed by `useCharacterLimits` hook. |
| Playback controls (play/pause/stop/seek/speed/volume/loop) | `AudioEngine` exposes observable state; UI components bind via `useAudioEngine` hook. Web Audio API ensures speed + loop controls. |
| Queue & batch processing | `queueStore` manages an ordered list of `QueueItem`; background worker processes items sequentially with pause/cancel. |
| Pronunciation glossary per provider | `pronunciationStore` persists rules in IndexedDB; applied before synthesis via `applyPronunciationRules`. |
| Smart import (articles, Reddit, summaries) | `imports` module orchestrates article fetch, DOM sanitization via JSDOM (server side), optional OpenAI summarization. |
| History & snippets | Stored locally with encrypted IndexedDB collections (`historyStore`, `snippetStore`). Export endpoints produce transcripts + audio. |
| API key management | `LocalVault` prompts users for a passphrase, encrypts provider keys locally. Keys injected into API calls through `Authorization` header override when user chooses personal credentials. |
| Notifications | Web Notifications API with graceful fallback; requires user permission. |
| Transcript export (SRT/VTT) | `transcriptService` builds formats client-side from generation metadata. |
| Appearance controls | CSS variable based theming with `prefers-color-scheme` + manual toggle stored in preferences. |

## Credential & Session Handling
- **LocalVault (client)**: Prompts the user for a passphrase, derives a symmetric key with PBKDF2 (salted, 250k iterations), and encrypts provider API keys using AES-GCM before persisting them in IndexedDB. Vault metadata holds a version + KDF parameters so future migrations stay compatible.
- **SessionLocker (client)**: On unlock, derives an ephemeral session key (HKDF over the decrypted vault key + monotonic counter) retained in-memory only; this key encrypts credentials sent to the server for the lifetime of the tab.
- **Request Envelope (client → server)**: API routes receive `{ header: 'x-ttsauth': base64(nonce || ciphertext) }` plus a `x-ttsauth-key` carrying the session public token. Route handlers verify the token with `SessionRegistry` before decryption.
- **SessionRegistry (server)**: Persists short-lived session tokens and shared secrets via a pluggable store (Convex when `CONVEX_URL` plus `CONVEX_DEPLOYMENT_KEY`/`CONVEX_ADMIN_KEY` are set, JSON file for local dev, in-memory as a final fallback). Secrets expire after 15 minutes of inactivity and the registry still falls back to environment credentials when no session token is provided.
- **Decryption & Proxy (server)**: Handlers decrypt incoming payloads using XChaCha20-Poly1305 (via `@stablelib/xchacha20poly1305`), hydrate provider adapters with the recovered key, and forward requests with `secureFetch`. The decrypted key never leaves memory and is zeroed after the request completes.
- **Graceful Fallback**: When user keys are absent or the vault is locked, adapters default to server-side env vars (`OPENAI_API_KEY`, etc.) or the local mock synthesizer when neither is present.

## Managed Provisioning
- **ProvisioningOrchestrator (server)**: Maintains provider adapters, stores hashed credentials, and caches active tokens. When `CONVEX_URL` + `CONVEX_DEPLOYMENT_KEY` (or legacy admin key) are set, it persists via `ConvexProvisioningStore`; otherwise JSON or in-memory stores handle development builds.
- **OpenAIProvisioningProvider**: Derives scoped tokens from the master OpenAI key and hands them to the orchestrator with TTL metadata.
- **Provisioning Token Route** (`app/api/provisioning/token`): Authenticated by `x-account-id`, `x-plan-tier`, and `x-plan-status` headers; issues/rotates credentials for premium users and returns expiry hints for the client cache.
- **Client Fallback Flow**: `useCredentialStore` queries the vault first, then falls back to `AccountStore` headers and calls `ensureProvisionedCredential` to guarantee a managed token exists before hitting provider proxy routes.
- **Provider Authorization Guard**: API routes call `resolveProviderAuthorization`, which prefers session-decrypted keys, then legacy headers, and finally provisioned credentials pulled from the orchestrator; responses run through existing proxy adapters unchanged.
- **Account API Route** (`app/api/account`): Persists plan and usage data through the account repository (Convex when available, otherwise in-memory) and seeds a sticky cookie so subsequent provisioning calls share account context.
- **Billing Endpoints** (`app/api/billing/checkout`, `/portal`): Provide thin hooks for subscription flows and update account status/usage in tandem with provisioning.
- **PremiumDashboard (client)**: Visualises plan tier, billing status, usage progress, and action messages while exposing upgrade/portal CTAs; hides managed messaging when the account is on the free tier.

## Security Considerations
- Provider secrets should default to server-side env vars (`process.env.OPENAI_API_KEY`) with rate limiting and usage analytics handled later.
- When users supply their own keys, they stay client-side. Route handlers accept encrypted payloads and decrypt using ephemeral symmetric keys derived per request (XChaCha20-Poly1305 via `@stablelib`).
- All outbound requests add the `X-Forwarded-For` metadata to support auditing; responses strip cookies and cache headers.
- Content imports sanitize HTML with `sanitize-html` and run readability heuristics server-side to prevent XSS.

## Testing Strategy
- Domain stores covered by Vitest unit suites (deterministic state transitions).
- Mock provider endpoints to verify request payload shaping and error handling.
- Integration tests render the workspace and simulate key flows (text entry → synthesize → playback).
- Future E2E (Playwright) to validate transcription export and drag interactions.

## Deployment Notes
- Deployable to Vercel or any Node-capable host; requires enabling Edge-friendly polyfills (Web Crypto, fetch) for Node 18.
- Audio previews served via streaming responses; ensure `Content-Type` is forwarded.
- Keep bundle size in check by lazy-loading advanced panels (history, batch) behind Suspense boundaries.

## Roadmap Highlights
1. Scaffold Next.js project with module boundaries above.
2. Implement provider proxy routes and secure fetch wrapper.
3. Port view model logic into Zustand stores with TypeScript models mirroring Swift types.
4. Build core UI: editor, provider picker, audio controls.
5. Layer advanced features (imports, queue, glossary) incrementally, ensuring each ship with tests.
