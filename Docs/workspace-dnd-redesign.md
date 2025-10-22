# Workspace Studio Drag-and-Drop Redesign

## Problem Statement

The current studio layout uses a hand-rolled drag-and-drop implementation that fails to provide reliable drop targets, has inconsistent visual feedback, and proves difficult to maintain or extend. When users drag one panel over another, the panel frequently snaps back because no drop zone is recognised. We need a robust, accessible, and maintainable drag-and-drop system that supports reordering across all workspace columns and persists layout preferences.

## Goals

- Enable predictable drag initiation, preview, and drop confirmation for every studio panel.
- Support moving panels within a column and across columns with immediate visual feedback.
- Keep the implementation maintainable, testable, and aligned with existing state management (Zustand).
- Preserve persistence semantics in `useWorkspaceLayoutStore`.

## Constraints & Considerations

- The project is a Next.js 15 (React 19) app; solution must work with server components and client islands.
- We already rely heavily on Zustand for state persistence; drag-and-drop should integrate cleanly without rewriting the store.
- Accessibility (keyboard interactions, focus management, ARIA attributes) is preferred where feasible.
- We should avoid deprecated or unmaintained packages.

## Evaluation Rubric

Each candidate approach is scored from 1 (poor) to 5 (excellent) against the following criteria:

1. **Reliability** – Consistent pointer handling, cross-browser behaviour, and minimal edge-case bugs.
2. **Accessibility** – Built-in support or achievable patterns for keyboard usage and ARIA semantics.
3. **Implementation Effort** – Relative time and complexity to integrate, including dependency footprint.
4. **Maintainability** – Alignment with existing architecture, community support, and code clarity.
5. **Testability** – Ease of writing automated tests and deterministically simulating drag behaviour.

## Candidate Approaches

### Option A – Refine Current Custom Pointer Logic

- **Description:** Continue iterating on bespoke pointer events, improving hover overlays, and expanding drop zones.
- **Pros:** No new dependencies; full control over DOM structure.
- **Cons:** High risk of subtle bugs, difficult to reach full accessibility, significant engineering time for diminishing returns.
- **Scores:** Reliability 2, Accessibility 1, Implementation Effort 2, Maintainability 2, Testability 2 → **Total 9/25**

### Option B – Integrate `@dnd-kit/core` + `@dnd-kit/sortable`

- **Description:** Adopt the modern `dnd-kit` ecosystem, using its sensors, collision detection, and sortable context to manage drag state. Zustand continues to persist layout updates triggered via `onDragEnd`.
- **Pros:** Well-maintained, highly configurable, supports accessibility patterns, strong community adoption, composable architecture that fits Next.js client components.
- **Cons:** Introduces new dependency; requires learning curve to configure sensors and item contexts.
- **Scores:** Reliability 5, Accessibility 4, Implementation Effort 3, Maintainability 5, Testability 4 → **Total 21/25**

### Option C – Use `react-beautiful-dnd`

- **Description:** Implement drag using Atlassian’s library with droppable areas per column and draggable panels.
- **Pros:** Mature API, great documentation, built-in accessibility; battle-tested for lists.
- **Cons:** Library is deprecated/archived, not React 19 ready without forks, bundle size impact.
- **Scores:** Reliability 3, Accessibility 4, Implementation Effort 3, Maintainability 1, Testability 3 → **Total 14/25**

### Option D – Wrap `sortablejs` via `react-sortablejs`

- **Description:** Use DOM-based SortableJS and hook into events to update Zustand.
- **Pros:** Lightweight, minimal API.
- **Cons:** Imperative DOM mutations conflict with React state, limited accessibility, tricky to manage complex layouts.
- **Scores:** Reliability 3, Accessibility 1, Implementation Effort 3, Maintainability 2, Testability 2 → **Total 11/25**

### Option E – Build Pointer/Keyboard Layer with React Aria & Focus Within

- **Description:** Compose low-level `react-aria` hooks to craft a custom drag and drop system with focus management.
- **Pros:** Excellent accessibility primitives, integrates with existing React stack.
- **Cons:** Requires significant groundwork (hit-testing, drag preview, collision logic); more time intensive than adopting a purpose-built library.
- **Scores:** Reliability 3, Accessibility 5, Implementation Effort 1, Maintainability 3, Testability 3 → **Total 15/25**

### Option F – Custom Pointer & Overlay System (Reimagined)

- **Description:** Build a bespoke pointer-driven drag system that captures pointer events on the drag handle, measures column/slot geometry on the fly, renders explicit overlay drop zones (including full-panel swaps), and updates Zustand atomically. Includes keyboard shortcuts for accessibility and deterministic helpers for tests.
- **Pros:** No external dependencies (works offline), full control over UX, deterministic drop calculations, can be unit-tested by simulating pointer positions.
- **Cons:** Requires careful math and DOM measurements; accessibility support must be engineered manually.
- **Scores:** Reliability 4, Accessibility 3, Implementation Effort 3, Maintainability 4, Testability 4 → **Total 18/25**

## Decision

Initially, Option B (dnd-kit) was preferred. However, the project environment blocks network access, preventing installation of new npm packages. Re-evaluating the feasible options elevates **Option F (Custom Pointer & Overlay System)** as the highest-scoring viable approach (18/25). We will implement this solution, focusing on precise geometry-based drop detection, rich visual feedback, and tight integration with the existing Zustand store.

## Implementation Plan (Option F)

1. **Pointer Event Engine**
   - Capture `pointerdown`, `pointermove`, and `pointerup` on drag handles.
   - Maintain `dragState` (active panel, origin column, pointer coordinates) in a dedicated hook.
   - Register global listeners while dragging.

2. **Geometry Sampling**
   - On each column render, collect panel bounding boxes via refs.
   - During pointer move, translate pointer coordinates into target column/index using measured midpoints.
   - Provide throttled updates to avoid layout thrashing.

3. **Visual Feedback**
   - Render floating preview following the pointer (via portal).
   - Highlight prospective drop target (panel overlay or gap bar).
   - Fade the source panel to indicate it is being dragged.

4. **Drop Handling**
   - On pointer release, commit the move through `useWorkspaceLayoutStore.actions.movePanel`.
   - Support cross-column moves by including target column metadata in drag state.
   - Reset drag state gracefully on cancel or escape key.

5. **Accessibility**
   - Add keyboard shortcuts: focus panel → press `Space` or `Enter` to enter drag mode, use arrow keys to navigate target, confirm with `Space/Enter`, cancel with `Esc`.
   - Apply `aria-grabbed`, `aria-dropeffect`, and live region updates for screen readers.

6. **Testing**
   - Extend store tests (within column, across columns).
   - Add interaction tests using synthetic pointer events to ensure correct reordering.

7. **Validation**
   - Run `npm test` and `npm run build`.
   - Manual QA: verify dragging across columns, overlay feedback, persistence, and keyboard control.

The following sections capture the implementation notes as we proceed with Option F.
