# macOS Text-to-Speech App Architecture

## Overview
A native macOS application built with SwiftUI that provides text-to-speech functionality using multiple TTS providers (ElevenLabs, OpenAI, Google Cloud TTS) with comprehensive playback controls.

## Technology Stack
- **Platform**: macOS 13.0+
- **Language**: Swift 5.9
- **UI Framework**: SwiftUI
- **Audio Framework**: AVFoundation
- **Networking**: URLSession
- **Package Manager**: Swift Package Manager

## Core Components

### 1. Application Structure
```
TextToSpeechApp/
├── TextToSpeechApp.swift          # App entry point
├── Models/
│   └── TTSProvider.swift          # Provider protocol, voice model, and AudioSettings
├── Services/
│   ├── ElevenLabsService.swift    # ElevenLabs API integration
│   ├── OpenAIService.swift        # OpenAI TTS integration
│   ├── GoogleTTSService.swift     # Google Cloud TTS integration
│   └── AudioPlayerService.swift   # Audio playback management
├── ViewModels/
│   └── TTSViewModel.swift         # Main view model
├── Views/
│   ├── ContentView.swift          # Main UI
│   ├── TextEditorView.swift       # Text input area
│   ├── PlaybackControlsView.swift # Playback controls
│   └── SettingsView.swift         # API configuration
├── Utilities/
│   ├── AppConfiguration.swift     # URLs and static configuration
│   ├── KeychainManager.swift      # Secure API key storage
│   └── AudioFormat+Extensions.swift # File type helpers for exports
└── Resources/
    └── Info.plist                  # App configuration
```

## Key Features

### 1. Text Input
- **Multi-line text editor** sized for long-form scripts with hover/focus chrome
- **Character counter** that highlights when the 5,000-character limit is exceeded
- **Context menu shortcuts** for copy, paste, clear, and sample text insertion
- **Placeholder guidance** that disappears as soon as the user types
- **Minimalist layout support** that adapts padding and frame height

### 2. TTS Provider Integration

#### ElevenLabs API
- **Endpoint**: `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- **Features**:
  - Multiple curated voice presets selectable in-app
  - Built-in stability, similarity boost, and speaker boost defaults
  - High-quality neural voices tuned for English content
- **Authentication**: API Key in header

#### OpenAI TTS API
- **Endpoint**: `https://api.openai.com/v1/audio/speech`
- **Features**:
  - Multiple voice models (alloy, echo, fable, onyx, nova, shimmer)
  - Adjustable response formats (MP3, WAV, AAC, FLAC)
  - Speed control forwarded from the view model
- **Authentication**: Bearer token

#### Google Cloud TTS
- **Endpoint**: `https://texttospeech.googleapis.com/v1/text:synthesize`
- **Features**:
  - WaveNet voices
  - Multiple languages
  - SSML support
  - Voice pitch and speaking rate control
- **Authentication**: API Key or OAuth 2.0

### 3. Playback Controls
- **Play/Pause** toggle
- **Stop** and reset
- **Speed control**: 0.5x to 2.0x with 0.1x increments
- **Volume control**: 0-100% with visual feedback
- **Seek bar**: Navigate through audio timeline
- **Loop mode**: Repeat playback
- **Queue system**: Multiple texts in sequence

### 4. Audio Management
- **Format support**: MP3, WAV, AAC, FLAC
- **Buffering**: Progressive download for large files
- **Caching**: Local storage of generated audio
- **Export**: Save generated audio files

## Data Models

### TTSProvider Protocol
```swift
protocol TTSProvider {
    var name: String { get }
    var availableVoices: [Voice] { get }
    func synthesizeSpeech(text: String, voice: Voice, settings: AudioSettings) async throws -> Data
}
```

### AudioSettings
```swift
struct AudioSettings {
    var speed: Double = 1.0      // 0.5 to 2.0
    var pitch: Double = 1.0      // 0.5 to 2.0
    var volume: Double = 1.0     // 0.0 to 1.0
    var format: AudioFormat = .mp3
    var sampleRate: Int = 22050
}
```

### Voice Model
```swift
struct Voice {
    let id: String
    let name: String
    let language: String
    let gender: Gender
    let provider: ProviderType
    let previewURL: String?
}
```

## User Interface Design

### Main Window Layout
```
┌─────────────────────────────────────────┐
│  Text-to-Speech Converter               │
├─────────────────────────────────────────┤
│ Provider: [Dropdown] Voice: [Dropdown]  │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │     Text Input Area                 │ │
│ │     (Scrollable, Resizable)        │ │
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

### Settings Window
- API key configuration for each provider
- Default voice selection
- Audio quality preferences
- Cache management
- Keyboard shortcuts configuration

## Security Considerations

### API Key Management
- Store API keys in macOS Keychain
- Never hardcode keys in source code
- Implement key rotation reminders
- Use environment variables for development

### Network Security
- HTTPS only for API calls
- Certificate pinning for production
- Request timeout handling
- Rate limiting implementation

## Performance Optimization

### Caching Strategy
- Cache generated audio files locally
- Implement LRU cache with size limits
- Hash text content for cache keys
- Background cleanup of old cache

### Long-Form Generation
- `TextChunker` splits inputs that exceed a provider’s character budget by paragraph, sentence, and word boundaries before synthesis.
- `TTSViewModel` dispatches each chunk through the selected provider and collects the resulting `GenerationOutput` objects without loading them into the player.
- `mergeAudioSegments` concatenates the per-chunk audio using `AVMutableComposition`; WAV is preserved losslessly, other formats export as AAC (`.m4a`) to ensure a single contiguous file.
- The merged audio is handed to `AudioPlayerService`, combined into a single history entry, and a fresh transcript is generated for the full text.
- Any failures during chunk fetch or merge surface a descriptive error so the UI can prompt the user to retry or shorten the input.

### Web Article Sanitization
- `TextSanitizer` removes boilerplate (menus, “skip to content”, cookie notices, etc.) before populating the editor.
- Normalizes whitespace so imported prose flows naturally and chunking operates on clean paragraphs.

### Async Operations
- All API calls on background queues
- Progressive UI updates
- Cancellable operations
- Error recovery mechanisms

## Error Handling

### API Errors
- Network connectivity issues
- Rate limiting responses
- Invalid API keys
- Quota exceeded errors
- Voice unavailability

### User Feedback
- Clear error messages
- Retry mechanisms
- Fallback options
- Progress indicators

## Testing Strategy

### Unit Tests
- API service mocking
- Audio processing logic
- Cache management
- Settings persistence

### Integration Tests
- API endpoint validation
- Audio playback pipeline
- File import/export
- Keychain operations

### UI Tests
- Text input validation
- Control interactions
- Settings persistence
- Error state handling

## Deployment

### Build Configuration
- Code signing with Developer ID
- Notarization for Gatekeeper
- Sandboxing with appropriate entitlements
- Auto-update mechanism (Sparkle framework)

### System Requirements
- macOS 13.0 (Ventura) or later
- Apple Silicon or Intel processor
- 100 MB disk space
- Internet connection for API calls

## Future Enhancements

### Phase 2 Features
- Batch processing for multiple texts
- Voice training/cloning (ElevenLabs)
- SSML markup support
- Real-time streaming TTS
- Pronunciation dictionary
- Text highlighting during playback

### Phase 3 Features
- iOS/iPadOS companion app
- iCloud sync for settings and history
- Shortcuts app integration
- Widget for quick access
- Share extension support
- Offline mode with local TTS

## API Rate Limits & Pricing

### ElevenLabs
- Free tier: 10,000 characters/month
- Starter: $5/month for 30,000 characters
- Creator: $22/month for 100,000 characters

### OpenAI
- $15.00 per 1M characters (TTS)
- $30.00 per 1M characters (TTS HD)

### Google Cloud TTS
- First 1 million characters free/month
- WaveNet: $16.00 per 1M characters
- Standard: $4.00 per 1M characters

## Dependencies

### Swift Packages
```swift
dependencies: [
    .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.5.0"),
    .package(url: "https://github.com/kishikawakatsumi/KeychainAccess", from: "4.2.2")
]
```

## Development Workflow

### Setup
1. Clone repository
2. Open in Xcode 15+
3. Configure signing team
4. Add API keys to environment
5. Build and run

### Code Style
- SwiftLint for code consistency
- Swift Format for formatting
- Documentation comments for public APIs
- MVVM architecture pattern

## Monitoring & Analytics

### Crash Reporting
- Integration with Crashlytics or Sentry
- Automatic crash report submission
- User opt-in for analytics

### Usage Metrics
- Provider usage statistics
- Feature adoption rates
- Performance metrics
- Error frequency tracking

## Accessibility

### VoiceOver Support
- Full VoiceOver compatibility
- Keyboard navigation
- High contrast mode support
- Dynamic type support

### Localization
- Initial support for English
- Prepared for multi-language support
- RTL language consideration
- Date/time formatting

## License & Attribution
- MIT License for open-source release
- Third-party library attributions
- API provider terms compliance
- User data privacy policy
