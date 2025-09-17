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
- **Audio Export**: Save generated speech as MP3, WAV, AAC, or FLAC files

### 🔒 Security & Privacy
- **Secure API Key Storage**: All API keys stored in macOS Keychain
- **No Data Collection**: Your text and audio never leave your device (except for API calls)
- **Sandboxed Application**: Runs in a secure environment with limited system access

### 🎨 User Experience
- **Native macOS Design**: Built with SwiftUI for a seamless Mac experience
- **Dark Mode Support**: Automatically adapts to system appearance
- **Keyboard Shortcuts**: Efficient workflow with customizable shortcuts
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

### Option 1: Download Pre-built App
1. Download the latest release from [Releases](https://github.com/yourusername/macos-tts-app/releases)
2. Open the DMG file
3. Drag the app to your Applications folder
4. Open the app (you may need to right-click and select "Open" the first time)

### Option 2: Build from Source

#### Prerequisites
- macOS 13.0 (Ventura) or later
- Xcode 15.0 or later
- Swift 5.9 or later
- Active Apple Developer account (for code signing)

#### Build Steps
```bash
# Clone the repository
git clone https://github.com/yourusername/macos-tts-app.git
cd macos-tts-app

# Open in Xcode
open TextToSpeechApp.xcodeproj

# Select your development team in project settings
# Build and run (Cmd+R)
```

## Configuration

### Setting Up API Keys

1. **Open Settings**: Press `Cmd+,` or click Settings button
2. **Add API Keys**: Enter your API keys for each provider you want to use
3. **Save**: Keys are automatically saved to macOS Keychain

### Getting API Keys

#### ElevenLabs
1. Sign up at [ElevenLabs](https://elevenlabs.io)
2. Go to Profile Settings
3. Copy your API key
4. Free tier: 10,000 characters/month

#### OpenAI
1. Sign up at [OpenAI](https://platform.openai.com)
2. Go to API Keys section
3. Create a new API key
4. Pricing: $15.00 per 1M characters

#### Google Cloud TTS
1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable Cloud Text-to-Speech API
3. Create credentials (API key)
4. Free tier: 1 million characters/month

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

## Support

### Getting Help
- **Documentation**: Check the [Wiki](https://github.com/yourusername/macos-tts-app/wiki)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/yourusername/macos-tts-app/issues)
- **Discussions**: Join our [GitHub Discussions](https://github.com/yourusername/macos-tts-app/discussions)
- **Email**: support@yourcompany.com
- **Donations**: Update `Sources/Utilities/AppConfiguration.swift` with your GitHub Sponsors URL to enable the in-app Donate button

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
