# Narration Studio Integration Plan

_Living document tracking the unified Narration Studio (transcription ↔︎ text-to-speech) redesign._

## Wireframe Overview

- **Layout (≥1280 px)**
  - **Left Rail — Capture & Sources (320 px)**
    - Capture card: microphone button (accent-600), waveform placeholder, live timer.
    - Upload tile: dashed border drop zone with “Drop audio or browse”.
    - Imports card: URL input, recent imports list.
    - Snippets & History accordions reusing existing list styling.
  - **Central Workspace — Transcript Canvas (flex 1)**
    - Toolbar: tabs `Transcript | Script | Dual` on cream background with accent underline.
    - Status ribbon: persistent bar indicating unified pipeline stage (`Recording → Uploading → Transcribing → Cleaning → Synthesising → Exporting`).
    - Body: scrollable transcript area (cream-100) with inline editing; Dual mode displays summary/action items alongside text.
    - Cleanup preview toggle: pill control to compare raw vs polished text.
    - Footer: segment timeline chips (charcoal-200) showing HH:MM ranges, clicking syncs transcript + audio.
  - **Right Rail — Actions & Delivery (360 px)**
    - Voice & Style card: provider dropdown, voice list, style sliders.
    - Audio Output card: format, playback speed, loop toggle.
    - Cleanup & Translation card: preset pills (Australian English, Professional Tone, Meeting Minutes) plus custom textarea.
    - Summaries & Actions card: existing summary/action item UI.
    - Calendar & Export card: Google connect/reconnect, schedule form, download links.
    - Batch Queue card: existing batch list with status.
- **Header**: app logo (left), title “Narration Studio” (center), command palette hint + avatar (right).
- **Responsive behaviour**
  - ≤1024 px: left/right rails collapse into drawers; workspace remains central.
  - ≤720 px: sections stack vertically; status ribbon pins under header.
- **Empty state**: accent gradient illustration with CTA “Start recording or pick a source” plus quick action buttons.
- **Colour palette**: retain existing cream/charcoal/accent scheme throughout.

## Feasibility Spike Summary

- Introduce `useNarrationStudioState` aggregator composing existing stores (`useTransitTranscriptionStore`, `useTTSStore`, `useSnippetStore`, etc.).
  ```ts
  export const useNarrationStudioState = create<NarrationStudioState>()((set, get) => ({
    transit: useTransitTranscriptionStore.getState(),
    tts: useTTSStore.getState(),
    snippets: useSnippetStore.getState(),
    activeText: () => get().transit.transcriptText || get().tts.inputText,
    setActiveText: (value) => {
      const { stage } = get().transit;
      if (stage !== 'transcribing') {
        get().transit.actions.setTranscript?.(value);
      }
      get().tts.updateInput(value);
    },
    pipelineStage: deriveStage(get().transit, get().tts),
  }));
  ```
- `PipelineStatusBar` consumes unified `pipelineStage` enum ensuring consistent progress messaging across transcription + synthesis.
- Refactor current `TransitTranscriptionPanel` into reusable atomic panels (`CapturePanel`, `TranscriptPanel`, `SummaryPanel`, `CalendarPanel`, `TTSControlsPanel`).
- Minimal backend churn: existing API routes reused; layout change relies on shared Zustand selectors and component composition.
- Feature flag (`narrationStudioEnabled`) gates new layout, enabling incremental rollout.

## QA & Validation Plan

1. **Streaming Regression**: verify real-time segments, cleanup events, summaries appear with mocked OpenAI responses.
2. **TTS Integration**: ensure transcript edits sync to TTS input; preview/regenerate works for all providers; pronunciation overrides persist.
3. **Cleanup & Translation**: confirm preset/custom instructions generate polished outputs; Dual view comparison functions correctly.
4. **Calendar Workflow**: connect Google, schedule event using summary data, verify state persistence and error handling.
5. **Batch Queue**: add segments from workspace, validate queue retention of provider/style settings.
6. **History Load**: loading past record restores transcript, cleanup results, summaries, TTS selections, calendar metadata.
7. **Responsive Layout**: manual + automated checks at 1280/1024/768/375 widths; drawers focus trap; ribbon visibility.
8. **Accessibility**: keyboard navigation per column, command palette shortcut, ARIA live regions for pipeline updates.
9. **Performance & Telemetry**: confirm aggregator avoids duplicate fetches; status ribbon events logged for analytics.

## Stakeholder Review Plan

- **Participants**: Product (Deborah), Design lead, Engineering lead, QA, Support, Operations.
- **Artifacts**: Figma wireframes (derived from above layout), feasibility spike notes, updated QA matrix, feature flag rollout outline.
- **Agenda (45 min)**
  1. Experience walkthrough & demo (10 min)
  2. Component reuse & technical approach (10 min)
  3. QA / rollout strategy (10 min)
  4. Discussion, risks, approvals (15 min)
- **Preparation**: circulate pre-read 48 h prior; gather async feedback before meeting.
- **Outcomes**: capture decisions/action items in product tracker; confirm ship criteria and phase rollout after approval.

---

_Last updated: 2025-02-14_

## macOS Backport Snapshot

- Added a Narration Studio utility to the macOS Composer (new Transcription utility alongside URL Import/Sample Text/Chunking) with microphone capture.
- `OpenAITranscriptionService` streams Whisper transcriptions via multipart uploads using managed credentials when available.
- Transcript insights and cleanup reuse the shared OpenAI chat pipeline to deliver summaries, action items, and polished copy.
- Results sync with the existing editor—buttons insert raw or cleaned transcript into the script composer; summaries/action items render inline.
- Segments and metadata surface within the utility, mirroring the web layout.
