# Workspace Layout Customisation Plan

## Goals
- Make every major workspace panel movable across the three-column layout in the web Transit workspace.
- Persist each user’s preferred arrangement via the Convex backend so it loads automatically on sign-in.
- Let users reset to the default layout without losing other workspace state.

## Context
- `TransitTranscriptionPanel.tsx` now renders columns from the persisted layout snapshot, with helper renderers for each `panelId`.
- Panel content modules remain colocated with the Transit workspace but can be rearranged dynamically by the layout store.
- The Convex deployment stores user layouts in the `workspace_layouts` table. A Next.js API route (`/api/workspace-layout`) mediates access so Convex credentials stay server-side, falling back to local storage when the service is unavailable.

## Implementation Plan
1. **Persisted layout model**
   - Add a `workspace_layouts` table (`userId`, `layout`, `version`, `updatedAt`) to `convex/schema.ts`.
   - Expose Convex functions (`getWorkspaceLayout`, `saveWorkspaceLayout`, `clearWorkspaceLayout`) in a new module.
   - Represent layout as ordered columns of panel identifiers with a version number for forward compatibility.
2. **Repository and Zustand store**
   - ✅ The shared `WorkspaceLayoutRepository` abstraction supports Convex, API, local-storage, and noop implementations.
   - ✅ `useWorkspaceLayoutStore` hydrates per-user layouts, tracks pending requests to handle account switching, persists moves, and exposes reset/error handling.
   - ⏳ Consider debouncing drag-save operations if backend load becomes an issue; current implementation saves immediately after each drop.
3. **UI refactor & drag-and-drop**
   - ✅ Transit workspace renders movable panels using the persisted snapshot.
   - ✅ Drag-and-drop uses native HTML APIs with keyboard-accessible drop zones.
4. **Reset & persistence wiring**
   - ✅ Layout hydrates when the active user changes; local cache prevents stale writes when switching accounts mid-request.
   - ✅ A reset action clears both Convex and the local-cache fallback, restoring defaults.
5. **Validation & docs**
   - ✅ Vitest suites cover the API route (`workspaceLayoutRoute.test.ts`) and the store’s hydration behaviour (`workspaceLayoutStore.test.ts`).
   - ✅ Documentation (this doc, README) references the server boundary and offline behaviour.
   - ✅ `npm run test`, `npm run build`, and Convex codegen are part of the release checklist.

## Open Questions
- **Panel mobility:** All sections remain movable; revisit if UX research requests pinned “essential” panels.
- **Layout versioning:** Monitor usage metrics to determine when to bump `CURRENT_WORKSPACE_LAYOUT_VERSION` and trigger migrations.
