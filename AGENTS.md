# Repository Guidelines

## Project Structure & Module Organization
Code lives in `Sources/` with a clear MVVM layout: `Models/`, `ViewModels/`, `Views/`, `Services/`, and `Utilities/`. Shared app configuration (`Package.swift`, `Info.plist`, `TextToSpeechApp.entitlements`) is at the repository root alongside the automation script `build.sh`. Unit tests belong in `Tests/`, where `TextToSpeechAppTests.swift` exercises models, services, and the view model. Treat the generated bundles (`TextToSpeechApp.app`, `TextToSpeechApp 2.app`) as build artefacts—recreate them instead of editing in place.

## Build, Test, and Development Commands
Use `./build.sh` for a full release build plus ad-hoc code signing; it regenerates `.build/` and prepares `TextToSpeechApp.app`. For iterative work, prefer `swift build` (debug) or `swift build -c release`. Launch the executable with `swift run` or by `open TextToSpeechApp.app` after a build. Run the XCTest suite with `swift test` and pass `--filter` to target specific cases when debugging.

## Coding Style & Naming Conventions
Follow Swift API Design Guidelines: types and protocols are UpperCamelCase, methods and properties are lowerCamelCase, and private helpers live in file extensions when practical. Match the existing four-space indentation and keep `MARK:` sections to group related functionality. Use descriptive enum case names (`case openAI`, `case elevenLabs`) and mirror provider names between UI labels and service identifiers. Avoid force unwraps; prefer optional binding or throwing errors surfaced via `errorMessage` on `TTSViewModel`.

## Testing Guidelines
All new functionality needs corresponding XCTest coverage under `Tests/`. Mirror source naming (`AudioPlayerServiceTests.swift`, etc.) and describe behaviour in the test method name: `testProviderSwitchUpdatesVoices`. Execute `swift test` locally before submitting; tests run quickly and catch regressions in provider services, keychain handling, and formatting extensions. When adding async UI logic, gate tests with `@MainActor` like the existing suite.

## Commit & Pull Request Guidelines
This workspace currently lacks Git history; once the repo is initialised, keep commit subjects concise, imperative, and ≤72 characters (e.g., `feat: add compact layout toggle`). Explain the why in the body when changes are non-trivial. Pull requests should include: summary of behaviour change, list of affected modules, test evidence (`swift test`), and screenshots or screen recordings for UI adjustments. Link related issues or product specs to keep review context intact.

## Graphite Workflow (Required)
This repository uses Graphite for stacked PRs. Agents MUST use Graphite CLI (`gt`) commands instead of standard Git/GitHub commands:

| Instead of... | Use... |
|---------------|--------|
| `git checkout -b feature` | `gt create feature` |
| `git push` | `gt submit` |
| `gh pr create` | `gt submit` (creates PR automatically) |
| `git rebase` | `gt sync` |
| `git merge` | `gt merge` |

### Key Commands
- `gt create <branch-name>` - Create a new stacked branch
- `gt submit` - Push and create/update PRs for the stack
- `gt sync` - Sync with trunk and restack branches
- `gt log` - View the current stack
- `gt checkout <branch>` - Switch branches within the stack

Never use `git push origin` or `gh pr create` directly.

## Security & Configuration Tips
Never commit real API keys—configuration lives in macOS Keychain via `KeychainManager`. When sharing sample settings, redact secrets and use obvious placeholders (`ELEVENLABS_API_KEY`). Verify new network capabilities against `TextToSpeechApp.entitlements`; request only the minimal sandbox permissions needed. Review `Info.plist` strings whenever user-facing permissions text changes.
All outbound network calls must go through the ephemeral `SecureURLSession` helper so responses and cookies stay in memory only. The sandbox entitlements are limited to `com.apple.security.network.client` and user-selected read/write access—avoid reintroducing Downloads or microphone permissions unless a feature strictly requires them.
