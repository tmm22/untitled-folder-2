# Pipeline Automation Plan

## Context
- Imports currently stop at storing raw content. There is no structured flow to clean, summarise, translate, or stage content automatically.
- Teams repeatedly perform the same steps before narrating, so we need configurable automation that reuses the existing import, history, and queue infrastructure.
- This document stays in-sync with implementation. Each step is recorded here **before any code changes** and the status is updated as we progress.

## Implementation Steps
| Step | Description | Why this matters | Status |
| --- | --- | --- | --- |
| 1 | Define shared pipeline domain types plus text utilities that both API routes and the React app can use. | Ensures client/server agree on pipeline payloads and gives us the building blocks for later steps. | Completed |
| 2 | Add server-side pipeline repository with Convex/JSON fallbacks and expose Next.js API routes for listing, creating, updating, deleting, and invoking pipelines (including webhook entry points). | We need persistent pipeline definitions and a secure place to run them, otherwise the UI has nothing to talk to and scheduled runs cannot work. | Completed |
| 3 | Implement the pipeline execution engine on the server (cleaning, summarising, translating, tone adjustments, chunking) backed by existing helpers and OpenAI-powered transforms when available. | Provides the actual post-processing logic so a saved pipeline can transform content into queue-ready segments. | Completed |
| 4 | Create client-side pipeline store and service layer to consume the API (load/save pipelines, trigger runs, surface errors). | Gives the UI reactive state that mirrors server definitions and keeps pipeline actions reusable across components. | Completed |
| 5 | Update import management UI to let users build/edit pipelines, run them against stored imports, and surface status updates. | Connects the new automation to the existing workflow so teams can execute pipelines without leaving the import panel. | Completed |
| 6 | Attach pipeline output to the batch queue with voice recommendations derived from history trends (and honour queue step settings). | Delivers the promised automation by feeding pre-segmented scripts directly into production with sensible provider/voice defaults. | Completed |
| 7 | Provide webhook scheduling UX (show cron hint, surface unique secrets) and document how to trigger pipelines externally. | Meets the requirement for reusable, scheduled runs and helps operators hook pipelines into external schedulers safely. | Completed |
| 8 | Add unit tests for the pipeline engine and client store, then run the existing test suite. | Protects regressions and proves the new behaviour works end-to-end. | Completed |

## Notes
- Update the status column (Pending → In Progress → Completed) as each step moves forward.
- Capture any deviations or follow-up work immediately below the relevant table entry.

## Convex Persistence Status
- Pipeline definitions now persist through Convex when `CONVEX_URL` + admin tokens are configured (`web/convex/schema.ts`, `web/convex/pipelines.ts`, `web/convex/http.ts`).
- The app still supports `JsonFilePipelineRepository`/`InMemoryPipelineRepository` fallbacks when Convex is offline or misconfigured, with warning logs emitted from `web/src/app/api/pipelines/context.ts`.
- Detailed schema/action design and future enhancements live in [`Docs/pipeline-convex-design.md`](pipeline-convex-design.md).
