# Transit Transcription Service Plan

**Status**: Draft (living document)  
**Last Updated**: 2025-10-28  
**Owner**: Web Platform Team

## 1. Context & Objectives
- Deliver a “Transit Transcription” experience in the web workspace that captures spoken audio or uploaded files, transcribes the content through our existing OpenAI stack, and surfaces actionable summaries.
- Extend the experience with contextual Google Calendar interactions (e.g., schedule follow-up meetings) while respecting Clerk-authenticated user boundaries.
- Reuse the current provider abstractions, security posture, and state management patterns to minimise net-new surface area.

## 2. Success Criteria
- Users can start/stop microphone recordings in-browser, upload audio files (WAV/MP3/M4A), and see real-time progress + error handling.
- Transcriptions complete via OpenAI without exposing API keys and persist in history for signed-in users (Convex) and encrypted IndexedDB for guests.
- Summaries and action items appear alongside the transcript; users can trigger Google Calendar workflows when relevant.
- Users can configure cleanup instructions (presets or custom prompts) to generate polished transcripts alongside the raw capture.
- Calendar integration only activates after the user grants Google OAuth consent and stores tokens securely (Convex + encrypted refresh token handling).
- Automated tests cover the UI store, API routes, and calendar workflows; monitoring provides request latency/error metrics.

## 3. Assumptions & Dependencies
- OpenAI Whisper (`whisper-1`) remains available under the existing OpenAI provisioning key managed by Clerk/Keychain parity logic, with room to swap via `OPENAI_TRANSCRIPTION_MODEL` when new transcribe models GA.
- Convex is available for authenticated persistence; fallback JSON/IndexedDB paths remain for offline use.
- Browser supports MediaRecorder API (progressive enhancement required).
- Google Calendar integration will use OAuth 2.0 with limited scopes (`https://www.googleapis.com/auth/calendar.events`) stored via Convex secrets.
- No backend audio storage beyond transient processing; long-term retention is left to the user’s download/export actions.

## 4. User Stories
1. As a signed-in producer, I can record a conversation on the fly and receive a transcript with highlights I can edit and save.
2. As a transit operations manager, I can upload a dispatch audio log and receive a concise summary with suggested follow-up events.
3. As a user with Clerk authentication, I can connect my Google Calendar and add a meeting directly from a transcription summary.
4. As a guest, I can still record/transcribe but data remains browser-local and purges when I clear IndexedDB.

## 5. High-Level Architecture
- **Client (Next.js App Router)**
  - New `TransitTranscriptionPanel` React feature mounted under `/app/transit` (route or nested panel in workspace).
  - Zustand store `modules/transitTranscription/store.ts` managing session state (recording status, transcript, summary, calendar suggestions).
  - Cleanup instruction controls (presets plus custom textarea) wired into the store and rendered alongside transcript results.
  - Shared UI components for microphone controls, file uploader, transcript viewer, summary cards, and calendar CTA.
- **Server**
  - New route handler `app/api/transit/transcribe/route.ts` calling OpenAI transcription with streaming support.
  - Summarisation step reused from `lib/pipelines/openai.ts` (extend with `summariseTranscript` helper).
  - Cleanup pass performed via `applyTranscriptCleanup` (OpenAI chat completions) when instructions are provided, with polished text streamed back to the client.
  - Calendar integration via `app/api/transit/calendar/**` (OAuth start, callback, status, event creation) leveraging encrypted Google tokens.
- **Data stores**
  - Authenticated: Convex tables `transcripts`, `calendarTokens`.
  - Guest: Encrypted IndexedDB via `LocalVault`.
- **Third-party**
  - OpenAI (audio transcription + summarisation).
  - Google Calendar API (event creation, optional suggestions).

## 6. Detailed Feature Plan

### 6.1 Recording & Upload
- Implement `MediaRecorder` wrapper in `lib/audio/mediaRecorder.ts` mirroring `AudioEngine` conventions.
- Add file dropzone (reuse existing upload primitives or create `components/shared/FileDropzone`).
- Stream recorded audio chunks to the API route via `ReadableStream` to reduce latency; fall back to multipart upload when streaming unsupported.
- Handle unsupported browsers by gating the microphone button behind feature detection.

### 6.2 Transcription Pipeline
- API route validates Clerk session (server-side) and rejects unauthenticated calls for calendar-enabled flows.
- Convert audio to OpenAI-compatible format (PCM/WAV). Reuse `SecureFetch` to call `https://api.openai.com/v1/audio/transcriptions`.
- Structure response as `{ transcript, segments, confidence, language }`.
- Persist transcripts: push to Convex (`transcripts` table) for authed users with userId, title, createdAt; otherwise store inside IndexedDB via store hydration. Interim implementation uses encrypted JSON file fallback (`TRANSIT_TRANSCRIPTS_PATH`) with `/api/transit/transcriptions` listing for UI backfill.
- Expose progress events to client via `ReadableStream` or SSE-like chunking (phase 2 enhancement if needed).

### 6.3 Summarisation & Insights
- Leverage `summariseText` from `lib/pipelines/openai.ts`; expand prompt to produce:
  - Executive summary
  - Bullet action items with owner/time hints
  - Optional schedule recommendation metadata (`{title, startWindow, durationMinutes, participants}`)
- store summary alongside transcript; display in UI.
- Provide editing affordances for action items prior to calendar creation.

### 6.4 Cleanup & Formatting
- Introduce preset cleanup instructions (Australian English, professional tone, meeting minutes) plus a custom textarea, persisted in the store.
- Stream cleanup events from the API so the UI can show progress and preview the polished transcript as soon as it is available.
- Reuse OpenAI chat completions via `applyTranscriptCleanup` to transform the transcript while retaining the original text for auditing.
- Persist cleanup metadata (instruction, label, output) in Convex/IndexedDB and surface it in history cards.

### 6.5 Google Calendar Integration
- **Consent Flow**: Transit panel exposes a “Connect Google Calendar” CTA. Clerk session IDs are mapped to OAuth handshakes via PKCE:
  - `app/api/transit/calendar/oauth/start` issues state + code challenge, persisted for 15 minutes in the session store.
  - `app/api/transit/calendar/oauth/callback` exchanges the authorization code, encrypts refresh tokens, and redirects back to `/transit?calendar=success|error`.
- **Event Creation**:
  - UI surfaces suggested event data; users can edit fields before scheduling.
  - `app/api/transit/calendar/events/route.ts` creates events in the primary calendar using refreshed access tokens, defaulting to `TRANSIT_CALENDAR_DEFAULT_TIMEZONE` (UTC fallback).
  - Status endpoint (`.../status`) powers the connection badge; reconnect flow is supported.
- **Storage**:
  - Tokens encrypted with AES-256-GCM using `TRANSIT_CALENDAR_ENCRYPTION_KEY` and saved via file or Convex-backed store (`TRANSIT_CALENDAR_TOKENS_PATH` fallback in place).
  - Disconnection simply clears the encrypted entry.
- **Safety checks**: manual participant entry only, auto-refresh with 60s skew, descriptive error handling, and TODO rate limiting once Convex functions land.

### 6.6 Data Model Additions
- Convex schema snippet:
  ```ts
  transcripts: {
    _id: Id<'transcripts'>,
    userId: string,
    title: string,
    transcript: string,
    segments: TranscriptSegment[],
    summary: SummaryBlock,
    createdAt: number,
    source: 'microphone' | 'upload',
    durationMs: number
  }
  calendarTokens: {
    userId: string,
    encryptedRefreshToken: string,
    accessToken: string,
    expiresAt: number,
    scope: string[]
  }
  ```
- Frontend types under `modules/transitTranscription/types.ts` mirrored for store consumption.
- Interim file-backed persistence (encrypted) implemented until Convex schema ships; repository exposes `list/save/clear` and `/api/transit/transcriptions` for retrieval.

### 6.7 UI/UX Considerations
- Entry point as new tab in workspace left nav (“Transit”).
- Recording UI: timer, waveform visualization (phase 2), pause/resume, discard.
- Transcript display with inline editing, copy/export (SRT/VTT reuse).
- Summary card with emphasised action items and “Add to Calendar” button.
- Toast + inline status for API errors (OpenAI quota, Google auth failure).
- Accessibility: keyboard shortcuts for start/stop, ARIA live regions for recording status.

## 7. Security & Privacy
- All fetches use `secureFetch` (ephemeral Session) and never persist OpenAI responses server-side beyond request lifetime.
- Audio blobs purged after transcription completes; ensure temporary files/directories cleaned in route handler.
- Calendar OAuth stored encrypted (AES-256-GCM via `TRANSIT_CALENDAR_ENCRYPTION_KEY`, base64 32-byte secret) and refresh tokens refreshed server-side with 60s skew.
- Ensure microphone access prompt includes justification text; document in privacy policy.
- Rate limit transcription API (e.g., 10/min per user) to prevent abuse (TODO when Convex mutation lands).
- Environment configuration added:
  - `TRANSIT_GOOGLE_CLIENT_ID`, `TRANSIT_GOOGLE_CLIENT_SECRET`, `TRANSIT_GOOGLE_REDIRECT_URI`
  - `TRANSIT_CALENDAR_ENCRYPTION_KEY`, `TRANSIT_CALENDAR_TOKENS_PATH`, `TRANSIT_TRANSCRIPTS_PATH`
  - `TRANSIT_CALENDAR_DEFAULT_TIMEZONE`, `TRANSIT_CALENDAR_POST_CONNECT_REDIRECT`

## 8. Testing Strategy
- **Unit tests**: MediaRecorder wrapper, store reducers, OpenAI request builder, calendar payload formatter.
- **Integration tests**: API route tests using MSW to mock OpenAI/Google responses; Convex function tests.
- **UI tests**: Vitest + Testing Library for component flows; Playwright smoke test (`tests/e2e/transit.spec.ts`) exercising `/transit`.
- **Manual QA**: Browser support matrix (Chrome, Edge, Safari, Firefox), microphone permission flows, OAuth revocation.

## 13. Recent Updates (2025-10-18)
- Implemented Google Calendar OAuth with PKCE start/callback routes, encrypted token storage, and connection status endpoint.
- Calendar event creation now targets Google Calendar with automatic refresh handling and configurable timezone.
- Transit panel exposes connect/reconnect UX, disables scheduling until OAuth completes, and surfaces success/error messaging.
- Added transcript listing route backed by encrypted JSON storage ahead of Convex deployment.
- Introduced Playwright smoke coverage alongside expanded Vitest suite; documentation refreshed with new environment settings.
- Generalised transcript post-processing with cleanup presets, custom instructions, polished transcript persistence, and history surfacing.

## 9. Telemetry & Observability
- Add logging hooks to record transcription duration, size, latency (without audio payload).
- Surface metrics in existing analytics dashboard; set up alerting for elevated error rates from OpenAI or Google.
- Track calendar conversion rate to gauge feature adoption.

## 10. Rollout Plan
1. **Phase 0** – Spike: Validate OpenAI transcription via existing service wrapper, confirm audio streaming support, prototype Convex schema updates.
2. **Phase 1** – Core capture/transcription: Implement UI, API route, persistence without calendar.
3. **Phase 2** – Summaries/actions: Integrate summariser, UI polish, editing.
4. **Phase 3** – Calendar integration: OAuth, event creation, audit logs.
5. **Phase 4** – Harden & launch: Accessibility, localisation copy, telemetry, docs update.
- Beta flagging via feature flag (Convex stored) to limit rollout.

## 11. Open Questions & Decisions
- **Resolved**: Transcription uses automatic language detection by default; evaluate a manual override only if usability feedback demands it.
- **Resolved**: Calendar suggestions default to manual participant entry; we pre-fill the organiser with the authenticated user but do not auto-add additional attendees from Clerk profile data to avoid accidental invites.
- **Resolved**: Treat recordings as highly sensitive—delete raw audio immediately after transcription completes and preserve summaries/transcripts only; ensure privacy posture satisfies GDPR-style consent and retention expectations.
- **Resolved**: Streaming partial transcripts to the UI is required for GA and ships with Phase 1.

## 12. Next Steps
- Align with security team on microphone consent copy and OAuth storage approach.
- Draft product brief for calendar workflows (ownership, reminders, default durations).
- Estimate engineering effort per phase and share timeline in weekly sync.
- Update this document as decisions land and implementation progresses.
