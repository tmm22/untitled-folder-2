# macOS Text-to-Speech App

A powerful native macOS application that converts text to speech using multiple AI-powered TTS providers including ElevenLabs, OpenAI, and Google Cloud Text-to-Speech.

![macOS 13.0+](https://img.shields.io/badge/macOS-13.0%2B-blue)
![Swift 5.9](https://img.shields.io/badge/Swift-5.9-orange)
![SwiftUI](https://img.shields.io/badge/SwiftUI-Framework-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Contributor Guide

Refer to [AGENTS.md](AGENTS.md) for repository guidelines, build steps, and review expectations.


## Features

### 🎯 Core Functionality
- **Multi-Provider Support**: Choose between ElevenLabs, OpenAI, and Google Cloud TTS
- **Rich Text Editor**: Large text input area with character counting
- **Voice Selection**: Multiple voice options per provider with different accents and styles
- **Playback Controls**: Play, pause, stop, seek, and loop functionality
- **Speed Control**: Adjust playback speed from 0.5x to 2.0x
- **Volume Control**: Fine-tune audio volume with visual feedback
- **Audio Export**: Save generated speech as MP3 or WAV everywhere, with AAC and FLAC available when supported (OpenAI)

### 🔒 Security & Privacy
- **Secure API Key Storage**: All API keys stored in macOS Keychain
- **No Data Collection**: Your text and audio never leave your device (except for API calls)
- **Sandboxed Application**: Runs in a secure environment with limited system access

### 🎨 User Experience
- **Native macOS Design**: Built with SwiftUI for a seamless Mac experience
- **Dark Mode Support**: Automatically adapts to system appearance
- **Keyboard Shortcuts**: Efficient workflow with built-in shortcuts (remap through macOS Keyboard settings if needed)
- **Progress Indicators**: Visual feedback during speech generation
- **Error Handling**: Clear error messages and recovery options
- **Minimalist Layout (Compact) Option**: Toggleable in Settings or via the header button; reduces chrome and moves advanced controls to a popover; preserves all functionality and persists between launches

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
  - Works in both Light/Dark modes

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
│ Characters: 0/5000                      │
├─────────────────────────────────────────┤
│ ⏮ ⏯ ⏭ 🔁  ━━━━━━━━━━━  00:00/00:00  │
│ Speed: [1.0x▼]  Volume: [━━━━━] 75%    │
├─────────────────────────────────────────┤
│ [Generate] [Export] [Clear] [Settings] │
└─────────────────────────────────────────┘
```

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
2. **Add API Keys**: Enter your API keys for each provider you want to use
3. **Save**: Keys are automatically saved to macOS Keychain

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

#### OpenAI
1. Sign up at [OpenAI](https://platform.openai.com)
2. Open **Billing → Overview** and attach a payment method or purchase credits (required for production use)
3. Go to **User → View API keys** and create a new secret key; label it for this project to allow revocation later
4. Store the key securely—OpenAI will only show it once—then paste it into the app
5. Pricing reference: ~$15 per 1M characters for `tts-1` as of May 2024

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
2. **Select Provider**: Choose your preferred TTS provider
3. **Choose Voice**: Select a voice that suits your content
4. **Generate**: Click "Generate" to create the audio
5. **Playback**: Use controls to play, pause, or adjust speed
6. **Export**: Save the audio file for later use

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

- The editor enforces a 5,000-character ceiling, matching ElevenLabs and Google Cloud quotas.
- OpenAI's `tts-1` currently accepts 4,096 characters; the app surfaces an inline error if you exceed that while OpenAI is selected.
- For longer scripts, split the content into multiple runs or batch them with the `---` delimiter feature described below.

### Export Formats

- Choose the export format from the Advanced Controls popover (slider icon in the header).
- MP3 and WAV exports are supported by every provider.
- AAC and FLAC exports are available when the OpenAI provider is selected.
- Switching formats clears previously generated audio to prevent mismatched file extensions—regenerate before exporting.
- Prefer WAV or FLAC for lossless editing, and MP3/AAC for lightweight distribution.

### Advanced Features

#### Batch Processing
Process multiple texts by separating them with `---` delimiter:
```
First text to convert
---
Second text to convert
---
Third text to convert
```

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
