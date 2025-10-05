# Changelog

All notable changes to this project are documented in this file. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]
### Added
- Per-slider reset controls and documentation updates for the Voice Style panel, plus a global reset affordance that surfaces whenever styles deviate from provider defaults.
- Relocated voice style controls into a dedicated popover alongside provider selection, keeping the main toolbar uncluttered while preserving per-control and global resets.
- Inline translation workflow that auto-detects the source language, translates via existing provider APIs, and surfaces a side-by-side comparison before speech generation.
- Introduced a space-efficient three-column desktop layout featuring a context rail, expanded composer column with context shelf cards, and a persistent inspector panel.
- Voice preview fallback that synthesizes a short sample when hosted preview clips are unavailable, with clearer API key guidance when credentials are required.
- Smart Import summarization that cleans web articles, surfaces an AI summary card, and lets you narrate the gist without replacing the original script.
- ElevenLabs-focused prompting workspace with selectable v3 models, a reusable prompt scratch pad, quick tag insertion, automatic fallback to stable models when alpha access is unavailable, and dynamic voice lists that match the active model.

## [1.1.1] - 2025-09-26
### Changed
- Bumped the app version to `1.1.1` (build `3`) and kept the temporary Tight Ass Mode placeholder screenshot for now.
- Updated README release banner to match the new version.

## [1.1.0] - 2025-09-26
### Added
- Tight Ass Mode local provider with `LocalTTSService` streaming macOS system voices to WAV output.
- Provider metadata, cost profile messaging, and UI copy describing on-device synthesis.
- Test coverage for the new provider plus documentation updates, screenshot placeholder, and changelog.

### Changed
- Bumped the app version to `1.1.0` with build number `2`.

## [1.0.0] - 2025-09-01
### Added
- Initial public release featuring ElevenLabs, OpenAI, and Google Cloud TTS integrations.
- SwiftUI desktop experience with batching, transcripts, saved snippets, pronunciation glossary, and cost estimates.
- Secure key management via macOS Keychain and AVFoundation playback/export pipeline.
