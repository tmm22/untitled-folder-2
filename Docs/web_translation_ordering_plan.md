# Web Translation Ordering & Convex Sync Plan

> Living document tracking the work to align web translation ordering with the macOS app experience and to sync translation state across accounts via Convex.

## Status Snapshot
- [ ] Discovery complete
- [ ] Design sign-off
- [ ] Convex data model updated
- [ ] Backend/API implemented
- [ ] Web UI implemented
- [ ] macOS ↔︎ web parity verified
- [ ] Test suite passing
- [ ] Release readiness checklist

**Current stage:** Discovery  
**Next checkpoint:** Document multi-translation UX flows and timeline for web rollout.

## Recent Decisions
- Multi-translation history is in scope; ordering must support multiple saved entries.  
- Translation UI remains English-only at launch.  
- Translation history retention is unlimited per account (no caps).  
- Convex layer must handle simultaneous edits from multiple clients.  
- Mac-to-web translation sync deferred; track separately.

## Progress Log
- **2025-10-11**  
  - Audited macOS translation workflow (`Sources/ViewModels/TTSViewModel.swift`, `Sources/Views/ContentView.swift`) to confirm single-result behaviour and identify extension needs for history.  
  - Reviewed existing web pipeline translation usage (`web/src/lib/pipelines/openai.ts`, `web/src/app/api/pipelines/_lib/runner.ts`) noting stateless response handling and lack of UI exposure.  
  - Inspected current Convex schema (`web/convex/schema.ts`) and history patterns to inform translation storage approach.  
  - Drafted Convex translation schema, function contracts, and repository surface area for multi-translation history.  
  - Added `translations` table to Convex schema and generated baseline mutations/queries (`web/convex/schema.ts`, `web/convex/translations.ts`); `npx convex codegen` passes.  
  - Landed Convex translation repositories, Next.js API wiring, and client helpers (`web/src/lib/translations/repository.ts`, `web/src/app/api/translations/route.ts`, `web/src/lib/translations/client.ts`).  
  - Introduced translation history store/hooks with unit coverage and Convex mutation tests (`web/src/modules/translations/store.ts`, `web/src/tests/unit/translationsStore.test.ts`, `web/src/tests/unit/convexTranslations.test.ts`).  
  - Added translation controls and history UI aligned with macOS behaviour (`web/src/components/translations/TranslationControls.tsx`, `web/src/components/translations/TranslationHistoryPanel.tsx`) and verified via `npm test`.

## Objectives
- Mirror the macOS translation workflow (see `Sources/Views/ContentView.swift`, `Sources/ViewModels/TTSViewModel.swift`, `Sources/Services/OpenAITranslationService.swift`) inside the web client while extending it with ordered multi-translation history.  
- Persist the active translation result and its ordered history through Convex so a user’s keep/rewrite decisions and prior translations follow them across browsers and devices.  
- Maintain secure handling of API credentials: ensure OpenAI keys still live in Keychain for macOS and the existing Secrets store for web; Convex holds only translation artifacts and minimal metadata.

## Background & Current Behaviour
- **macOS app**  
  - Translation initiated from the main editor; supports `translationKeepOriginal`, target language picker, and translation preview (`TranslationComparisonView`).  
  - Ordering expectations: the app maintains only the most recent translation (`translationResult`). When `Keep original text` is toggled off, the translated text replaces the editor contents and any prior result is cleared.
  - State managed in `TTSViewModel` with `translationResult` storing detected language, translated text, and metadata.
- **web app**  
  - Translation pipeline implemented in `web/src/lib/pipelines/openai.ts` but currently treated as a stateless operation in the pipeline runner.  
  - UI lacks a dedicated translation ordering or comparison component; results are consumed inline by downstream text-to-speech steps.  
  - Convex already backs account provisioning (`web/src/app/api/account/context.ts`), pipeline runs (`web/src/app/api/pipelines/context.ts`), and session storage (`web/src/lib/session/index.ts`), but no translation collection/schema exists yet.

## Requirements & Acceptance Criteria
1. **Parity UX**  
   - Provide translation controls in the web editor mirroring macOS (target language picker, keep original toggle, translation preview panel).  
   - Translation results must surface detected source language, target language display name, and translated text; the UI must reset when the input text changes (matching `TTSViewModel` logic lines 596-621).  
   - When `Keep original` is disabled, the translated text replaces the editable content and translation preview collapses.
2. **Ordering Logic**  
   - Support ordered multi-translation history per document/pipeline run with newest entries first and the ability to promote any history item to the active slot.  
   - Preserve deterministic sorting when Convex sync returns concurrent updates (e.g., by `sequenceIndex` and `createdAt`).  
   - Define UI affordances for browsing history and choosing which translation to apply.
3. **Convex Sync**  
   - Store the active translation and full history per account/document with unlimited retention.  
   - Expose mutation functions for `createTranslation`, `promoteTranslation`, `clearTranslations`, and `replaceSourceText`.  
   - Implement queries/subscriptions returning ordered translation collections for the active session.  
   - Ensure Convex auth aligns with existing helpers (`resolveConvexAuthConfig`) and handle simultaneous edits using optimistic concurrency.
4. **Security & Compliance**  
   - No API keys or prompts stored in Convex. Persist only derived translation text, detected language code, ordering metadata, and minimal context (e.g., hashed document id).  
   - Audit logging for translation mutations should reuse pipeline logging conventions if available.  
   - Monitor storage growth given unlimited history and evaluate pruning strategies if future limits emerge.
5. **Testing**  
   - Add XCTest coverage if macOS shared logic is extracted into reusable modules.  
   - Extend Next.js unit tests (`web/src/tests/...`) to cover new Convex repository classes, React hooks/components, and API routes.  
   - Integration tests ensure translation ordering persists across simulated sessions.

## Proposed Architecture Changes

### Convex Data Model
- **New table:** `translations`
  - Fields:  
    - `accountId`: string (Convex auth subject).  
    - `documentId`: string (web editor context or pipeline id).  
    - `translationId`: string (UUID).  
    - `sequenceIndex`: number (monotonic, highest value is newest).  
    - `createdAt` / `updatedAt`: ISO timestamps.  
    - `sourceText`: string (trimmed input at translation time).  
    - `sourceLanguageCode`: string (detected).  
    - `targetLanguageCode`: string.  
    - `translatedText`: string.  
    - `keepOriginalApplied`: boolean (whether keep original toggle was ON when generated).  
    - `adoptedAt`: optional ISO timestamp if the translation replaced the editor text.  
    - `provider`: string (e.g., `openai`).  
    - `metadata`: optional object (room for UI flags, token cost, etc.).  
  - Secondary index on `(accountId, documentId)` with ordering by `sequenceIndex` descending for history retrieval.  
  - `sequenceIndex` increments monotonically per document to enforce ordering during concurrent writes.
  - Add background job hook (future) to renormalise `sequenceIndex` if values grow near JavaScript number precision limits (not expected soon but documented).
- **New functions (convex/)**  
  - `translations/getForDocument.ts`: authenticated query returning ordered history with pagination support.  
  - `translations/create.ts`: mutation to insert translation and assign next sequence index.  
  - `translations/promote.ts`: mutation to bump an existing translation to the front (renormalizes sequence indices).  
  - `translations/clearForDocument.ts`: mutation invoked when keep-original is off or document text replaced.

### Web API & Services
- Extend `web/src/app/api/pipelines/context.ts` (or add dedicated `translations` API route) to call Convex mutations and queries.  
- Create `TranslationRepository` abstraction with implementations: `ConvexTranslationRepository` (default) and `InMemoryTranslationRepository` for tests.  
- Repository surface area:  
  - `list(documentId, options)` – paginated history fetch.  
  - `create(documentId, payload)` – persist new translation + update active pointer.  
  - `promote(documentId, translationId)` – reorder history and update active pointer.  
  - `clear(documentId, options)` – delete history entries.  
  - `markAdopted(documentId, translationId)` – flag translation as applied to source.  
- Provide React hook (e.g., `useTranslationState(documentId)`) that returns the active translation plus ordered history, exposes create/promote/clear/adopt actions, and reconciles optimistic updates.  
- Introduce translation actions in the state management layer (confirm existing pattern—likely React context or Zustand inside `web/src/modules`) with conflict resolution for concurrent updates.

### UI / UX
- Add translation controls to the primary editor component (see `web/src/components` for current layout).  
- Render a comparison view similar to macOS for the active translation: two columns with original/translated text, language labels, and action buttons (`Replace source text`, `Dismiss`, `Promote`).  
- Provide a history list (sidebar or drawer) that allows selection/promotion of older translations and indicates the active entry.  
- Respect theme tokens and existing component library conventions.  
- Provide skeleton/loading state while waiting for Convex query to hydrate and optimistic placeholders during concurrent edits.

### Shared Logic Opportunities
- Extract translation result model to a shared TypeScript type aligning with `TranslationResult` from Swift (fields: `originalText`, `translatedText`, `detectedLanguageCode`, `targetLanguage`).  
- Consider generating OpenAPI/TypeScript types from Swift models via `swift build` artifacts or maintain manual alignment with `Tests/TextToSpeechAppTests.swift` expectations to keep parity.
- Capture future macOS work in a separate document covering multi-translation history parity and potential shared services.

## Implementation Plan

### 1. Discovery & Validation
- [ ] Review macOS translation UX in `ContentView.translationControl` and `TranslationComparisonView` to catalog required interactions.  
- [ ] Map macOS `TranslationResult` model fields to web equivalents.  
- [ ] Confirm how the web editor identifies the active document/pipeline run for scoping translations.  
- [ ] Verify Convex project limits and expected volume for translation history.  
- [ ] Define web UX flows for viewing and promoting multi-translation history.

### 2. Design Sign-off
- [ ] Draft UI mockups or reference screenshots demonstrating the web translation controls and comparison layout.  
- [ ] Validate data model changes with backend owners; ensure `translations` table complies with retention policies.  
- [ ] Review error states (e.g., Convex offline) and fallback behaviours with product/design.
- [ ] Finalize interaction model for the history list (pagination, promote, clear).

### 3. Backend & Infrastructure
- [x] Define Convex schema updates (`convex/schema.ts`) and regenerate `_generated` bindings.  
- [x] Implement translation query/mutation functions with authorization guards.  
- [ ] Add integration tests (Convex function tests) covering create/promote/clear flows and concurrent mutation handling.  
- [x] Update Next.js API contexts to surface translation repositories and wire environment variable configuration (`CONVEX_TRANSLATIONS_ENABLED` if gating is desired).

### 4. Web Client Implementation
- [x] Build `TranslationRepository` abstraction and React hooks for fetching/updating translations.  
- [x] Create translation controller UI component mirroring macOS controls for the active translation.  
- [x] Implement history list UI with promote/delete interactions and optimistic updates resilient to concurrent edits.  
- [ ] Ensure pipeline runner consumes the active translation when generating speech previews.

### 5. macOS Alignment (if shared logic needed)
- [ ] Identify opportunities to reuse translation state logic between macOS and web (e.g., protocol or shared service).  
- [ ] Update Swift unit tests (`Tests/TextToSpeechAppTests.swift`) if new shared behaviours are introduced.  
- [ ] Confirm no behavioural regressions via `swift test`.

### 6. Testing & QA
- [ ] Add Jest/Testing Library coverage for new React components and hooks.  
- [ ] Add API route tests ensuring Convex interactions behave under success/failure cases.  
- [ ] Add concurrency-focused tests simulating simultaneous history updates.  
- [ ] Run `npm test`, `swift test`, and Convex function tests; capture results.  
- [ ] Conduct manual QA across multiple browser sessions to verify real-time sync.

### 7. Release Preparation
- [ ] Update `README.md` and relevant docs describing the new web translation capabilities.  
- [ ] Record demo of translation sync across devices.  
- [ ] Prepare rollout checklist: feature flag strategy, monitoring, and rollback plan.  
- [ ] Update `CHANGELOG.md`.

## Open Questions / Risks
- What UI pattern best supports browsing/promoting a long translation history without overwhelming the editor?  
- Do we need batch operations (e.g., clear multiple translations) to manage unlimited history?  
- How should we communicate concurrent edits or promotion conflicts to the user?  
- When should we draft the separate macOS parity plan for multi-translation history to avoid long-term drift?

## Metrics & Observability
- Track: translation requests per account, adoption events (keep original vs replace), and Convex mutation error rates.  
- Emit structured logs for translation mutations (include accountId, documentId, latency).  
- Consider feature flagging initial rollout and collecting qualitative feedback via in-app prompts.

## Next Steps (Owner TBD)
- [ ] Assign discovery tasks and owners.  
- [ ] Schedule design review with product + design (include macOS comparison).  
- [ ] Coordinate with DevOps on Convex schema migration and environment variable rollout.  
- [ ] Outline follow-up document for macOS multi-translation history parity.

_Keep this document updated at the end of each working session: mark completed checklist items, adjust status snapshot, and append decisions/resolutions as they occur._
### Convex Function Contracts
- `translations/getForDocument(accountId, documentId, limit?, cursor?)`  
  - Returns `{ items: Translation[], nextCursor?: string }` sorted by `sequenceIndex` desc.  
  - Supports cursor-based pagination for long histories.
- `translations/create(accountId, documentId, payload)`  
  - Payload includes `sourceText`, `translatedText`, `targetLanguageCode`, `detectedLanguageCode`, `keepOriginalApplied`, `provider`.  
  - Assigns `sequenceIndex = (current max + 1)` inside a single mutation; concurrent calls serialize under Convex runtime.  
  - Returns `{ translation, historySize }`.
- `translations/promote(accountId, documentId, translationId)`  
  - Reassigns the selected translation to `sequenceIndex = current max + 1` and adjusts others using batched patches to maintain strict ordering.  
  - Returns `{ translation, reordered: true }`.
- `translations/clearForDocument(accountId, documentId, options)`  
  - Removes translations; if `options.keepLatest === true`, retains the newest entry and renormalizes sequence indices.  
  - Returns `{ deletedCount }`.
- `translations/replaceSourceText(accountId, documentId, translationId)`  
  - Marks translation as adopted (`adoptedAt = now`, `keepOriginalApplied = false`) and may trigger `clearForDocument` if design chooses to collapse history after adoption.
