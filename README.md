# macOS Text-to-Speech App

A powerful native macOS application that converts text to speech using multiple AI-powered TTS providers including ElevenLabs, OpenAI, Google Cloud Text-to-Speech, plus a local “Tight Ass Mode” that never leaves your machine.

![macOS 13.0+](https://img.shields.io/badge/macOS-13.0%2B-blue)
![Swift 5.9](https://img.shields.io/badge/Swift-5.9-orange)
![SwiftUI](https://img.shields.io/badge/SwiftUI-Framework-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

> **Latest Release:** 1.1.1 · September 26, 2025 · [Changelog](CHANGELOG.md)

## Contributor Guide

Refer to [AGENTS.md](AGENTS.md) for repository guidelines, build steps, and review expectations.


## Features

### 🎯 Core Functionality
- **Multi-Provider Support**: Choose between ElevenLabs, OpenAI, Google Cloud TTS, or the new Tight Ass Mode for local synthesis
- **Rich Text Editor**: Large text input area with provider-aware character counting
- **Voice Selection**: Multiple voice options per provider with different accents and styles
- **Instant Voice Previews**: Audition voices immediately with built-in samples or auto-generated snippets when providers lack hosted previews
- **Expressive Voice Tuning**: Emotion/style sliders appear automatically for OpenAI, ElevenLabs, and Google voices, with per-provider defaults that persist between sessions
- **Playback Controls**: Play, pause, stop, seek, and loop functionality
- **Speed Control**: Adjust playback speed from 0.5x to 2.0x
- **Volume Control**: Fine-tune audio volume with visual feedback
- **Audio Export**: Save generated speech as MP3 or WAV everywhere, with AAC and FLAC available when supported (OpenAI)
- **Recent History**: Revisit the last few generations instantly with built-in play and export actions
- **Batch Queueing**: Split scripts with `---` and generate every segment sequentially with status tracking
- **Transcript Export**: Generate SRT or VTT captions alongside every synthesis
- **Pronunciation Glossary**: Override tricky words globally or per provider
- **Web Page Import**: Paste a URL and pull the main article body straight into the editor while the importer strips navigation, promos, and share widgets
- **Inline Translation**: Detect the source language, translate on demand, and review original plus translated text side by side before generating speech
- **Smart Import Summaries**: Clean up web articles with AI, keep only the narration-ready copy, and generate a spoken gist in a couple of clicks
- **Auto-Chunks Long Scripts**: Seamlessly splits long scripts (including web imports) into provider-safe segments, adds delimiters, and stitches audio back together for you

### 🔒 Security & Privacy
- **Secure API Key Storage**: All API keys stored in macOS Keychain
- **No Data Collection**: Your text and audio never leave your device (except for API calls)
- **Local-Only Option**: Tight Ass Mode generates speech entirely on-device using the system voice set
- **Sandboxed Application**: Runs inside the macOS sandbox with only network client and user-selected file permissions
- **Ephemeral Network Sessions**: API calls use non-persistent URL sessions so credentials and payloads never hit disk caches or cookie stores
- **Strict Remote Imports**: URL previews and article imports accept only HTTP(S) sources and ignore file or custom schemes

### 🎨 User Experience
- **Native macOS Design**: Built with SwiftUI for a seamless Mac experience
- **Appearance Controls**: Follow the system theme or force Light/Dark from Settings → General
- **Responsive Layout**: Panels reflow and scroll gracefully—no more fullscreening just to reach controls
- **Adaptive Workspace**: Full-width windows shift into a three-column layout with a dedicated context rail, spacious composer, and smart inspector so large displays stay efficient
- **Keyboard Shortcuts**: Efficient workflow with built-in shortcuts (remap through macOS Keyboard settings if needed)
- **Progress Indicators**: Visual feedback during speech generation
- **Error Handling**: Clear error messages and recovery options
- **Saved Snippets**: Keep frequently used scripts handy with replace/append actions
- **Inline Cost Estimates**: See per-provider pricing hints for your current script
- **Batch Notifications**: Optional macOS alerts when queue processing completes
- **Minimalist Layout (Compact) Option**: Toggleable in Settings or via the header button; reduces chrome and moves advanced controls to a popover; preserves all functionality and persists between launches

### Provider Character Limits

The composer highlights overages based on the active provider’s per-request allowance:

| Provider | Limit (characters) |
| --- | --- |
| OpenAI | 4,096 |
| ElevenLabs | 5,000 |
| Google Cloud TTS | 5,000 |
| Tight Ass Mode (local) | 20,000 |

The app automatically chunks scripts that exceed these limits and stitches the audio back together during export.

## Web Workspace (Next.js)

The repository now includes a browser-based workspace under `web/` that will reach feature parity with the macOS build over time. It ships as a Next.js 14 + React 18 app with Tailwind styling and Zustand state management.

### Prerequisites
- Node.js 18 or newer (validated with Node 20/23)
- npm (bundled with Node)

### Getting Started
```bash
cd web
npm install

# Copy environment template and fill in Convex/Stripe keys
cp .env.local.example .env.local
# then edit .env.local with your deployment details

# Launch the development server
npm run dev
```
Visit http://localhost:3000 to use the workspace. The workspace already supports provider selection, text editing with live character counting, secure provider proxy routes (with mock synthesis fallback when keys are unavailable), playback controls, and a shared state foundation for history, batch, and glossary features.

### Quality Checks
```bash
# Lint the project
npm run lint

# Run the Vitest suite (unit + integration)
npm run test
```

### Managed Provisioning Configuration
- `CONVEX_URL` and `CONVEX_ADMIN_KEY` (optional): enable Convex-backed persistence for credentials, usage events, and account data. Implement Convex HTTP functions under `/api/provisioning/*` and `/api/account/*` that mirror the JSON payloads described in `Docs/API_PROVISIONING_SERVICE.md`.
- `PROVISIONING_DATA_PATH` (fallback): persists credentials to a JSON file when Convex is not configured; omit to run fully in memory.
- `PREMIUM_TRIAL_DAYS`: number of days to keep a new checkout in `trial` status (defaults to 14); set to `0` to mark upgrades as immediately `active`.
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_PORTAL_RETURN_URL` (optional): when provided alongside `globalThis.__appStripeClient` (see below), the billing routes create checkout and portal sessions via Stripe.

> **Stripe client bootstrap**: In your server runtime (e.g., `app/api/_lib/stripeClient.ts`), assign `globalThis.__appStripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });` so the Next.js routes can call Stripe without bundling the SDK locally. Tests stub this global automatically.

See [`Docs/WEB_ARCHITECTURE.md`](Docs/WEB_ARCHITECTURE.md) for a deeper look at the module layout, security approach, and parity roadmap.

Key areas in the current build:
- Credentials vault for encrypted provider API keys and secure session hand-off
- Batch queue panel for multi-segment scripts with progress and downloads
- History panel with audio/transcript exports and rehydrate actions
- Snippet library for reusable text
- Pronunciation glossary (regex or literal)
- Import shelf for URL/manual entries plus optional article summaries


## Minimalist Layout (Compact)

The app includes an optional Compact UI that preserves all features while reducing visual chrome.

- How to enable:
  - Settings → General → “Minimalist layout (Compact)”
  - Or click the rectangle.compress.vertical icon in the header
- What changes:
  - Icon-first header with provider and voice pickers
  - Advanced controls (Speed, Volume, Loop, Audio status) moved into a slide-over popover (slider.horizontal.3 icon)
  - Action bar switches to icon-only buttons (Generate, Export, Clear, Settings)
  - Playback controls use tighter spacing and smaller icons while keeping the full timeline and transport controls
- What stays the same:
- All functionality is available (Generate, Export, Play/Pause, Stop, Skip, Seek, Loop, Speed, Volume, Provider, Voice)
  - All keyboard shortcuts continue to work:
    - Generate: Cmd+Return
    - Play/Pause: Space
    - Stop: Cmd+.
    - Export: Cmd+E
    - Clear: Cmd+K
    - Increase Speed: Cmd+]
    - Decrease Speed: Cmd+[
  - Preference persists across launches
  - Works with both the system theme and manual appearance overrides

Tip: Use the slider.horizontal.3 button in the header to open the Advanced Controls popover in Minimalist mode.

## Screenshots

### Main Interface
```
┌─────────────────────────────────────────┐
│  Text-to-Speech Converter               │
├─────────────────────────────────────────┤
│ Provider: [OpenAI ▼] Voice: [Nova ▼]   │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Enter your text here...             │ │
│ │                                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ Characters: 0/4,096 (OpenAI)             │
├─────────────────────────────────────────┤
│ ⏮ ⏯ ⏭ 🔁  ━━━━━━━━━━━  00:00/00:00  │
│ Speed: [1.0x▼]  Volume: [━━━━━] 75%    │
├─────────────────────────────────────────┤
│ [Generate] [Export] [Clear] [Settings] │
└─────────────────────────────────────────┘
```

### Tight Ass Mode Provider
![Tight Ass Mode Provider](Docs/screenshots/tight-ass-mode.png)

> Placeholder image — capture a real screenshot after launching the app and overwrite `Docs/screenshots/tight-ass-mode.png`.

## Installation

### Prerequisites
- macOS 13.0 (Ventura) or later
- Xcode 15.0 (or the matching Command Line Tools)
- Apple Developer account only if you plan to ship notarized builds

### Option 1: Build with the automation script
1. From the repository root, run `./build.sh`.
2. The script performs a clean release build, signs it ad hoc, and places `TextToSpeechApp.app` alongside the script.
3. Launch the app by double-clicking `TextToSpeechApp.app` or by running `open TextToSpeechApp.app`.

### Option 2: Build & run with Swift Package Manager
```bash
# Build a debug binary
swift build

# or build a release binary
swift build -c release

# Run the app from the command line
swift run TextToSpeechApp
```

### Option 3: Open in Xcode
1. Run `open Package.swift` to open the Swift Package in Xcode.
2. Pick your signing team if you intend to archive the app.
3. Build and run with `Cmd+R`.

> Prebuilt downloads will be published on the repository Releases page once the packaging workflow is live. Until then, use one of the workflows above.

## Configuration

### Setting Up API Keys

1. **Open Settings**: Press `Cmd+,` or click Settings button
2. **Add API Keys**: Enter the API keys for any cloud providers you plan to use (skip this if you only need Tight Ass Mode)
3. **Save**: Keys are automatically saved to macOS Keychain

#### Tight Ass Mode (Local Voices)
- Uses the built-in macOS speech engine and voices—no account or internet required
- All audio is rendered locally to WAV format, so nothing is uploaded
- Install extra system voices under **System Settings → Accessibility → Spoken Content → System Voice** if you want more languages or accents

### Managing API Keys

- **Rotate**: Open Settings, paste the replacement key for the provider, and click **Save**. The previous credential is overwritten in Keychain immediately.
- **Remove**: Open **Keychain Access**, search for `TextToSpeechApp`, right-click the provider entry, and delete it. Restart the app if it still shows the old key cached.
- **Recover**: Use the eye button in Settings to reveal the stored key for copy/paste, or open Keychain Access and copy the value from the corresponding entry.

### Getting API Keys

#### ElevenLabs
1. Sign up at [ElevenLabs](https://elevenlabs.io)
2. Verify your email and complete any creator onboarding prompts
3. Navigate to **Profile Settings → API Keys** and create a key dedicated to this Mac
4. Confirm you have free-tier characters or an active subscription before generating audio
5. Optional: enable usage notifications to avoid exhausting your monthly allotment

> **Model access:** The app fetches ElevenLabs voices dynamically per model. Alpha releases such as *Turbo v3* and *Multilingual v3* require early-access entitlements—if your account lacks them, the app automatically falls back to the closest stable model (e.g. *Multilingual v2*) and keeps generating audio.

#### OpenAI
1. Sign up at [OpenAI](https://platform.openai.com)
2. Open **Billing → Overview** and attach a payment method or purchase credits (required for production use)
3. Go to **User → View API keys** and create a new secret key; label it for this project to allow revocation later
4. Store the key securely—OpenAI will only show it once—then paste it into the app
5. Pricing reference: ~$15 per 1M characters for `tts-1` as of May 2024

> **Voice availability:** The app refreshes OpenAI voices directly from the `/v1/audio/voices` endpoint. If your account lacks access to experimental voices, they are omitted automatically and the UI falls back to the core set (Alloy, Amber, Cobalt, Nova, Onyx, Verse).

#### Google Cloud TTS
1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable billing for the project (required even when staying within the free tier)
3. Enable the **Cloud Text-to-Speech API** under **APIs & Services → Library**
4. Create an API key via **APIs & Services → Credentials → Create credentials → API key**
5. Restrict the key to the Text-to-Speech API (and optionally to your Mac's IP for extra safety)
6. Copy the generated key and paste it into the app's Settings

## Usage

### Basic Workflow

1. **Enter Text**: Type or paste your text in the editor
2. **Select Provider**: Choose your preferred TTS provider—including Tight Ass Mode if you want to keep everything local
3. **Choose Voice**: Select a voice that suits your content
4. **Generate**: Click "Generate" to create the audio
5. **Playback**: Use controls to play, pause, or adjust speed
6. **Export**: Save the audio file for later use
   - Inputs longer than a provider allows (e.g., 4,096 characters for OpenAI) are automatically split and stitched into a single audio track

### Import From the Web

1. Paste an article URL into the URL import field above the editor
2. Click **Import** to pull the text, or **Import & Generate** to fetch and synthesize in one step
3. The Smart Import card shows the AI-cleaned article body plus a spoken summary—use the buttons to replace the editor, append the summary, or instantly speak the gist
   - When the source is a news site, the importer extracts the primary story container so only the headline and article paragraphs are kept
4. Toggle **Auto-generate after import** if you want the return key to import and immediately generate next time
5. If the article exceeds the active provider's limit, the importer now auto-splits it into `---` delimited segments so every chunk stays in bounds—generation will read them sequentially without losing content
6. Importing Reddit links now grabs the full thread (including top-level and nested comments), preserving reply depth with quoted markers like `>> u/replier:` while capping output to keep narration manageable

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Generate Speech | `Cmd+Return` |
| Play/Pause | `Space` |
| Stop | `Cmd+.` |
| Export Audio | `Cmd+E` |
| Clear Text | `Cmd+K` |
| Settings | `Cmd+,` |
| Increase Speed | `Cmd+]` |
| Decrease Speed | `Cmd+[` |

> Need a different shortcut? macOS lets you remap them via **System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts**. Add entries for `TextToSpeechApp` and choose replacements.

### Text Length Limits

- The editor enforces the provider's limit unless your text is already segmented with `---`. Chunked segments remain editable even when the combined script surpasses the per-request cap.
- OpenAI's `tts-1` currently accepts 4,096 characters; you'll still see inline warnings if any individual segment grows past that limit.
- For longer scripts, split the content with the `---` delimiter (the importer does this automatically) so each chunk stays within provider limits and can be batch generated in one pass.

### Export Formats

- Choose the export format from the Advanced Controls popover (slider icon in the header).
- MP3 and WAV exports are supported by every provider.
- AAC and FLAC exports are available when the OpenAI provider is selected.
- Switching formats clears previously generated audio to prevent mismatched file extensions—regenerate before exporting.
- Prefer WAV or FLAC for lossless editing, and MP3/AAC for lightweight distribution.

### Advanced Features

#### Voice Style Controls
- Access the style sliders from the **Voice Style** popover next to the Provider/Voice menus; the panel only appears when the provider exposes expressive metadata.
- **OpenAI** surfaces *Expressiveness* and *Warmth*; **ElevenLabs** keeps *Stability*, *Similarity Boost*, and *Style*; **Google** offers *Briskness* and *Intonation* tuned automatically for Neural2, WaveNet, and Standard voices.
- Adjust a slider to immediately influence the next generation, export, or batch run. Each slider in the popover includes its own reset button to snap back to defaults.
- The popover header offers a global reset button that restores every slider at once; both reset options disable themselves when the controls already match their defaults.
- Custom values persist per provider via UserDefaults + Keychain, so each service remembers its latest tone the next time you launch the app.

#### Inline Translation
- Trigger translation manually with the new **Translate** button; the app auto-detects the source language and uses your OpenAI credentials to produce the target output.
- Pick the destination language from the globe menu—your last choice is remembered for the current session.
- Keep the original text beside the translation (default) or toggle it off to replace the editor content instantly.
- Side-by-side cards provide copy buttons and a **Use Translation** shortcut for quick adoption before generating audio.

#### Saved Snippets
- Click **Save Current Text** in the Saved Snippets panel to capture the editor contents.
- Give the snippet a memorable name; existing names overwrite so you can keep the list tidy.
- Use **Replace** to swap the current editor text or **Append** to tack the snippet onto the end.
- Snippets persist between launches and can be removed at any time with the trash button.

#### Cost Estimates
- The Character counter area now surfaces the estimated spend per provider for the current text.
- OpenAI and Google calculations use their published $15/1M and $4/1M character rates, respectively.
- ElevenLabs reflects the 10K character monthly allowance and approximates $5 per 100K thereafter.
- Tight Ass Mode highlights that generations are free because synthesis happens on-device.
- Treat estimates as guidance—always confirm against your own plan and dashboard usage.

#### Batch Processing
Process multiple texts by separating them with `---` delimiter:
```
First text to convert
---
Second text to convert
---
Third text to convert
```

- Click **Generate Batch** once the app detects multiple segments; each entry is processed sequentially.
- Follow progress in the Batch Queue card and cancel mid-run if you need to make edits.
- Successful segments land in Recent Generations automatically for playback or export.

#### Transcript Export
- After every generation, export matching SRT or VTT captions directly from the toolbar menu.
- History entries keep their own transcripts, so you can revisit and export past runs at any time.
- Timing is inferred from the rendered audio duration and sentence lengths—review before publishing for production use.

#### Pronunciation Glossary
- Add rules in the Pronunciation Glossary card to swap words or phrases before synthesis and transcript creation.
- Rules can apply to all providers or a specific service when phonetics differ.
- Edit or remove entries at any time; replacements are case-insensitive.

#### Batch Notifications
- Enable "Notify when batch generation completes" in Settings → General.
- The app requests permission the first time; macOS delivers alerts in Notification Center.
- Notifications summarize how many segments succeeded or failed.

#### SSML Support (Google TTS)
Use SSML markup for advanced control:
```xml
<speak>
  <emphasis level="strong">Important!</emphasis>
  <break time="1s"/>
  <prosody rate="slow">This is spoken slowly.</prosody>
</speak>
```

## API Limits & Pricing

### Comparison Table

| Provider | Free Tier | Paid Pricing | Voice Quality | Languages |
|----------|-----------|--------------|---------------|-----------|
| **ElevenLabs** | 10,000 chars/month | From $5/month | Excellent | 28+ |
| **OpenAI** | No free tier | $15/1M chars | Very Good | 50+ |
| **Google** | 1M chars/month | $4-16/1M chars | Good | 40+ |
| **Tight Ass Mode** | Unlimited | Free (local synthesis) | Depends on installed macOS voices | Dozens (based on system voices) |

## Release Notes

- Track ongoing changes in [CHANGELOG.md](CHANGELOG.md).

### Rate Limits

- **ElevenLabs**: 3 requests/second (free), 10 requests/second (paid)
- **OpenAI**: 50 requests/minute
- **Google**: 1000 requests/minute

## Troubleshooting

### Common Issues

#### "API Key Invalid" Error
- Double-check your API key in Settings
- Ensure the key has proper permissions
- Verify your account is active and has available credits

#### Audio Not Playing
- Check system volume settings
- Ensure no other apps are using audio exclusively
- Try restarting the app

#### Slow Generation
- Check your internet connection
- Consider using a different provider
- Reduce text length for faster processing

#### App Won't Open
- Ensure macOS 13.0 or later is installed
- Check Security & Privacy settings
- Right-click the app and select "Open"

### Debug Mode

Enable debug logging:
```bash
defaults write com.yourcompany.TextToSpeechApp DebugMode -bool YES
```

View logs:
```bash
log show --predicate 'subsystem == "com.yourcompany.TextToSpeechApp"' --last 1h
```

## Development

### Project Structure
```
TextToSpeechApp/
├── App/                    # App lifecycle and configuration
├── Models/                 # Data models and protocols
├── Views/                  # SwiftUI views
├── ViewModels/            # View models and business logic
├── Services/              # API and audio services
├── Utilities/             # Helper functions and extensions
├── Resources/             # Assets and configuration files
└── Tests/                 # Unit and UI tests
```

### Running Tests
```bash
# Unit tests
swift test

# UI tests
xcodebuild test -scheme TextToSpeechAppUITests

# All tests with coverage
xcodebuild test -scheme TextToSpeechApp -enableCodeCoverage YES
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

We use SwiftLint for code consistency:
```bash
# Install SwiftLint
brew install swiftlint

# Run linter
swiftlint

# Auto-fix issues
swiftlint --fix
```

## Privacy Policy

### Data Collection
- **No Personal Data**: We don't collect any personal information
- **No Analytics**: No tracking or analytics are implemented
- **Local Storage**: All settings stored locally on your device
- **API Calls**: Text is sent to selected TTS provider's servers for processing

### Permissions
- **Network Access**: Required for API calls
- **File System**: For saving audio files and settings
- **Keychain**: For secure API key storage
- **Microphone**: Not requested; the app only plays generated audio

## Support

### Getting Help
- **Documentation**: Start with `AGENTS.md`, `IMPLEMENTATION_GUIDE.md`, and the inline help in Settings
- **Issues**: Use the repository's GitHub Issues tab to report bugs or request features
- **Discussions**: Until Discussions is enabled, consolidate feedback in Issues so the team has one queue
- **Donations**: Update `Sources/Utilities/AppConfiguration.swift` with your GitHub Sponsors URL to enable the in-app Donate button
- **Direct contact**: Coordinate via your team channel (Slack/Teams) until a public support alias is published

### Feature Requests
We welcome feature requests! Please:
1. Check existing issues first
2. Provide detailed description
3. Explain use case
4. Include mockups if applicable

## Roadmap

### Version 1.1 (Q1 2024)
- [ ] Voice cloning support (ElevenLabs)
- [ ] Batch processing improvements
- [ ] Text highlighting during playback
- [ ] Pronunciation dictionary

### Version 1.2 (Q2 2024)
- [ ] iOS/iPadOS companion app
- [ ] iCloud sync for settings
- [ ] Shortcuts app integration
- [ ] Widget support

### Version 2.0 (Q3 2024)
- [ ] Real-time streaming TTS
- [ ] Local offline TTS engine
- [ ] Voice training capabilities
- [ ] Multi-language UI

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Your Company

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Acknowledgments

- [ElevenLabs](https://elevenlabs.io) for their amazing voice synthesis API
- [OpenAI](https://openai.com) for their TTS API
- [Google Cloud](https://cloud.google.com) for Cloud Text-to-Speech
- [Sparkle](https://sparkle-project.org) for auto-update framework
- The Swift and SwiftUI communities for their invaluable resources

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release
- Support for ElevenLabs, OpenAI, and Google TTS
- Basic playback controls
- Audio export functionality
- Secure API key storage

### Version 0.9.0 (Beta)
- Beta testing phase
- Core functionality implemented
- UI refinements
- Bug fixes and performance improvements

---

**Made with ❤️ for the macOS community**

*If you find this app useful, please consider starring the repository and sharing it with others!*
