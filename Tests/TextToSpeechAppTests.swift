import XCTest
@testable import TextToSpeechApp

final class TextToSpeechAppTests: XCTestCase {
    
    // MARK: - Model Tests
    
    func testVoiceCreation() {
        let voice = Voice(
            id: "test-voice",
            name: "Test Voice",
            language: "en-US",
            gender: .female,
            provider: .openAI,
            previewURL: nil
        )
        
        XCTAssertEqual(voice.id, "test-voice")
        XCTAssertEqual(voice.name, "Test Voice")
        XCTAssertEqual(voice.language, "en-US")
        XCTAssertEqual(voice.gender, .female)
        XCTAssertEqual(voice.provider, .openAI)
        XCTAssertNil(voice.previewURL)
    }
    
    func testAudioSettingsDefaults() {
        let settings = AudioSettings()
        
        XCTAssertEqual(settings.speed, 1.0)
        XCTAssertEqual(settings.pitch, 1.0)
        XCTAssertEqual(settings.volume, 1.0)
        XCTAssertEqual(settings.format, .mp3)
        XCTAssertEqual(settings.sampleRate, 22050)
    }
    
    func testTTSErrorMessages() {
        let errors: [TTSError] = [
            .invalidAPIKey,
            .networkError("Connection failed"),
            .quotaExceeded,
            .invalidVoice,
            .textTooLong(5000),
            .unsupportedFormat,
            .apiError("Test error")
        ]
        
        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription!.isEmpty)
        }
    }
    
    // MARK: - Service Tests
    
    func testOpenAIServiceInitialization() {
        let service = OpenAIService()
        
        XCTAssertEqual(service.name, "OpenAI")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertNotNil(service.defaultVoice)
    }
    
    func testElevenLabsServiceInitialization() {
        let service = ElevenLabsService()
        
        XCTAssertEqual(service.name, "ElevenLabs")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertNotNil(service.defaultVoice)
    }
    
    func testGoogleTTSServiceInitialization() {
        let service = GoogleTTSService()
        
        XCTAssertEqual(service.name, "Google Cloud TTS")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertNotNil(service.defaultVoice)
    }
    
    // MARK: - Keychain Manager Tests
    
    func testKeychainManagerAPIKeyValidation() {
        XCTAssertTrue(KeychainManager.isValidAPIKey("sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234"))
        XCTAssertFalse(KeychainManager.isValidAPIKey(""))
        XCTAssertFalse(KeychainManager.isValidAPIKey("short"))
    }
    
    func testAPIKeyMasking() {
        let apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456"
        let masked = apiKey.maskedAPIKey
        
        XCTAssertTrue(masked.contains("•"))
        XCTAssertTrue(masked.hasPrefix("sk-a"))
        XCTAssertTrue(masked.hasSuffix("3456"))
    }
    
    // MARK: - Audio Player Tests
    
    @MainActor
    func testAudioPlayerInitialization() {
        let player = AudioPlayerService()
        
        XCTAssertEqual(player.currentTime, 0)
        XCTAssertEqual(player.duration, 0)
        XCTAssertFalse(player.isPlaying)
        XCTAssertFalse(player.isBuffering)
        XCTAssertNil(player.error)
    }
    
    @MainActor
    func testSupportedAudioFormats() {
        let formats = AudioPlayerService.supportedFormats
        
        XCTAssertTrue(formats.contains("mp3"))
        XCTAssertTrue(formats.contains("wav"))
        XCTAssertTrue(formats.contains("aac"))
        XCTAssertTrue(AudioPlayerService.isFormatSupported("mp3"))
        XCTAssertTrue(AudioPlayerService.isFormatSupported("MP3"))
    }
    
    // MARK: - View Model Tests
    
    @MainActor
    func testViewModelInitialization() {
        let viewModel = TTSViewModel()

        XCTAssertTrue(viewModel.inputText.isEmpty)
        XCTAssertEqual(viewModel.selectedProvider, .openAI)
        XCTAssertFalse(viewModel.isGenerating)
        XCTAssertFalse(viewModel.isPlaying)
        XCTAssertEqual(viewModel.playbackSpeed, 1.0)
        XCTAssertEqual(viewModel.volume, 0.75)
        XCTAssertEqual(viewModel.selectedFormat, .mp3)
        XCTAssertTrue(viewModel.supportedFormats.contains(.flac))
    }

    @MainActor
    func testViewModelProviderSwitch() {
        let viewModel = TTSViewModel()

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        XCTAssertFalse(viewModel.availableVoices.isEmpty)
        XCTAssertEqual(viewModel.supportedFormats, [.mp3])

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        XCTAssertFalse(viewModel.availableVoices.isEmpty)
        XCTAssertTrue(viewModel.supportedFormats.contains(.flac))

        viewModel.selectedProvider = .google
        viewModel.updateAvailableVoices()
        XCTAssertFalse(viewModel.availableVoices.isEmpty)
        XCTAssertEqual(viewModel.supportedFormats, [.mp3, .wav])
    }

    @MainActor
    func testFormatSelectionResetsWhenUnsupported() {
        let viewModel = TTSViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        viewModel.selectedFormat = .flac
        XCTAssertEqual(viewModel.selectedFormat, .flac)

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        XCTAssertEqual(viewModel.selectedFormat, .mp3)
    }
    
    // MARK: - Utility Tests
    
    func testTimeFormatting() {
        func formatTime(_ time: TimeInterval) -> String {
            let minutes = Int(time) / 60
            let seconds = Int(time) % 60
            return String(format: "%02d:%02d", minutes, seconds)
        }
        
        XCTAssertEqual(formatTime(0), "00:00")
        XCTAssertEqual(formatTime(30), "00:30")
        XCTAssertEqual(formatTime(60), "01:00")
        XCTAssertEqual(formatTime(90), "01:30")
        XCTAssertEqual(formatTime(3661), "61:01")
    }
    
    func testProviderTypeDisplayNames() {
        XCTAssertEqual(TTSProviderType.elevenLabs.displayName, "ElevenLabs")
        XCTAssertEqual(TTSProviderType.openAI.displayName, "OpenAI")
        XCTAssertEqual(TTSProviderType.google.displayName, "Google")
    }
    
    func testProviderTypeIcons() {
        XCTAssertEqual(TTSProviderType.elevenLabs.icon, "waveform")
        XCTAssertEqual(TTSProviderType.openAI.icon, "cpu")
        XCTAssertEqual(TTSProviderType.google.icon, "cloud")
    }
}

// MARK: - Performance Tests

extension TextToSpeechAppTests {
    
    func testTextProcessingPerformance() {
        let longText = String(repeating: "This is a test sentence. ", count: 200)
        
        measure {
            _ = longText.count
            _ = longText.prefix(5000)
        }
    }
    
    func testAPIKeyValidationPerformance() {
        let testKeys = [
            "sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234",
            "11labs_abcdefghijklmnopqrstuvwxyz123456",
            "AIzaSyAbcdefghijklmnopqrstuvwxyz123456"
        ]
        
        measure {
            for key in testKeys {
                _ = KeychainManager.isValidAPIKey(key)
                _ = key.maskedAPIKey
            }
        }
    }
}
