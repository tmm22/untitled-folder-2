import XCTest
import SwiftUI
@testable import TextToSpeechApp

final class TextToSpeechAppTests: XCTestCase {
    private func resetPersistedSettings() {
        let defaults = UserDefaults.standard
        [
            "selectedProvider",
            "playbackSpeed",
            "volume",
            "loopEnabled",
            "isMinimalistMode",
            "audioFormat",
            "appearancePreference",
            "textSnippets",
            "providerStyleValues"
        ].forEach { defaults.removeObject(forKey: $0) }
    }

    private struct StubURLContentLoader: URLContentLoading {
        let result: Result<String, Error>

        func fetchPlainText(from url: URL) async throws -> String {
            switch result {
            case .success(let value):
                return value
            case .failure(let error):
                throw error
            }
        }
    }

    private struct StubTranslationService: TextTranslationService {
        var translatedText: String = ""
        var detectedLanguage: String = "en"
        var credentialAvailable: Bool = true
        var error: Error?

        func translate(text: String, targetLanguageCode: String) async throws -> TranslationResult {
            if let error {
                throw error
            }
            return TranslationResult(
                originalText: text,
                translatedText: translatedText.isEmpty ? "translated-\(text)" : translatedText,
                detectedLanguageCode: detectedLanguage,
                targetLanguageCode: targetLanguageCode
            )
        }

        func hasCredentials() -> Bool {
            credentialAvailable
        }
    }

    private struct StubSummarizationService: TextSummarizationService {
        var condensed: String = ""
        var summary: String = ""
        var credentialAvailable: Bool = true
        var error: Error?

        func hasCredentials() -> Bool {
            credentialAvailable
        }

        func summarize(text: String, sourceURL: URL?) async throws -> SummarizationResult {
            if let error {
                throw error
            }
            let condensedText = condensed.isEmpty ? text : condensed
            let summaryText = summary.isEmpty ? "summary: \(text.prefix(80))" : summary
            return SummarizationResult(condensedArticle: condensedText, summary: summaryText)
        }
    }

    @MainActor
    private final class StubPreviewAudioPlayer: AudioPlayerService {
        override func loadAudio(from data: Data) async throws {
            isBuffering = true
            isBuffering = false
        }

        override func play() {
            isPlaying = true
        }

        override func stop() {
            isPlaying = false
        }
    }

    @MainActor
    private final class SpyAudioPlayerService: AudioPlayerService {
        var recordedRate: Float?
        var recordedVolume: Float?
        var loadCallCount = 0

        override func loadAudio(from data: Data) async throws {
            loadCallCount += 1
            duration = 1.0
        }

        override func setPlaybackRate(_ rate: Float) {
            recordedRate = rate
        }

        override func setVolume(_ volume: Float) {
            recordedVolume = volume
        }

        override func play() {
            isPlaying = true
        }
    }

    @MainActor
    private func waitUntil(_ predicate: @escaping () -> Bool, timeout: TimeInterval = 1.0) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !predicate() && Date() < deadline {
            await Task.yield()
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    @MainActor
    private func makeTestViewModel(urlContentResult: Result<String, Error> = .success(""),
                                   translationService: TextTranslationService = StubTranslationService(),
                                   summarizationService: TextSummarizationService = StubSummarizationService(),
                                   audioPlayer: AudioPlayerService? = nil,
                                   previewPlayer: AudioPlayerService? = nil,
                                   previewLoader: @escaping (URL) async throws -> Data = TTSViewModel.defaultPreviewLoader,
                                   previewGenerator: ((Voice, TTSProviderType, AudioSettings, [String: Double]) async throws -> Data)? = nil,
                                   elevenLabsService: ElevenLabsService = ElevenLabsService(),
                                   openAIService: OpenAIService = OpenAIService(),
                                   googleService: GoogleTTSService = GoogleTTSService(),
                                   localService: LocalTTSService = LocalTTSService()) -> TTSViewModel {
        let loader = StubURLContentLoader(result: urlContentResult)
        return TTSViewModel(notificationCenterProvider: { nil },
                            urlContentLoader: loader,
                            translationService: translationService,
                            summarizationService: summarizationService,
                            audioPlayer: audioPlayer,
                            previewAudioPlayer: previewPlayer,
                            previewDataLoader: previewLoader,
                            previewAudioGenerator: previewGenerator,
                            elevenLabsService: elevenLabsService,
                            openAIService: openAIService,
                            googleService: googleService,
                            localService: localService)
    }
    
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

    func testTextSanitizerRemovesBoilerplate() {
        let raw = "Skip to content\nMenu\nArticle heading\nThis is the body.\nSign in\nFooter navigation"
        let cleaned = TextSanitizer.cleanImportedText(raw)
        XCTAssertEqual(cleaned, "Article heading This is the body.")
    }

    func testTextChunkerRespectsLimits() {
        let text = Array(repeating: "Sentence one. Sentence two.", count: 20).joined(separator: " ")
        let chunks = TextChunker.chunk(text: text, limit: 60)
        XCTAssertGreaterThan(chunks.count, 1)
        XCTAssertTrue(chunks.allSatisfy { $0.count <= 60 })
    }

    func testAudioSettingsDefaults() {
        let settings = AudioSettings()
        
        XCTAssertEqual(settings.speed, 1.0)
        XCTAssertEqual(settings.pitch, 1.0)
        XCTAssertEqual(settings.volume, 1.0)
        XCTAssertEqual(settings.format, .mp3)
        XCTAssertEqual(settings.sampleRate, 22050)
        XCTAssertTrue(settings.styleValues.isEmpty)
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
        XCTAssertFalse(service.styleControls.isEmpty)
    }
    
    func testElevenLabsServiceInitialization() {
        let service = ElevenLabsService()

        XCTAssertEqual(service.name, "ElevenLabs")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertNotNil(service.defaultVoice)
        XCTAssertFalse(service.styleControls.isEmpty)
    }
    
    func testGoogleTTSServiceInitialization() {
        let service = GoogleTTSService()
        
        XCTAssertEqual(service.name, "Google Cloud TTS")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertNotNil(service.defaultVoice)
        XCTAssertFalse(service.styleControls.isEmpty)
    }

    func testLocalTTSServiceInitialization() {
        let service = LocalTTSService()

        XCTAssertEqual(service.name, "Tight Ass Mode")
        XCTAssertFalse(service.availableVoices.isEmpty)
        XCTAssertEqual(service.defaultVoice.provider, .tightAss)
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

    @MainActor
    func testVoicePreviewRequiresAPIKeyShowsMessage() async {
        let viewModel = makeTestViewModel()
        let voice = Voice(id: "no-preview",
                          name: "No Preview",
                          language: "en-US",
                          gender: .female,
                          provider: .openAI,
                          previewURL: nil)

        viewModel.previewVoice(voice)

        await Task.yield()
        await Task.yield()

        XCTAssertEqual(viewModel.errorMessage, "Unable to preview No Preview: OpenAI API key is required to preview this voice.")
        XCTAssertNil(viewModel.previewingVoiceID)
        XCTAssertFalse(viewModel.isPreviewActive)
        XCTAssertFalse(viewModel.isPreviewLoadingActive)
    }

    @MainActor
    func testVoicePreviewFailureResetsState() async {
        struct PreviewFailure: LocalizedError {
            var errorDescription: String? { "Preview failed" }
        }

        let previewPlayer = StubPreviewAudioPlayer()
        let loader: (URL) async throws -> Data = { _ in throw PreviewFailure() }
        let viewModel = makeTestViewModel(previewPlayer: previewPlayer, previewLoader: loader)
        let voice = Voice(id: "failing-preview",
                          name: "Error Voice",
                          language: "en-US",
                          gender: .female,
                          provider: .openAI,
                          previewURL: "https://example.com/preview.mp3")

        viewModel.previewVoice(voice)

        await Task.yield()
        await Task.yield()

        XCTAssertEqual(viewModel.errorMessage, "Unable to preview Error Voice: Preview failed")
        XCTAssertNil(viewModel.previewingVoiceID)
        XCTAssertFalse(viewModel.isPreviewActive)
        XCTAssertFalse(viewModel.isPreviewLoadingActive)
    }

    @MainActor
    func testStopPreviewResetsState() async {
        let previewPlayer = StubPreviewAudioPlayer()
        let loader: (URL) async throws -> Data = { _ in Data() }
        let viewModel = makeTestViewModel(previewPlayer: previewPlayer, previewLoader: loader)
        let voice = Voice(id: "preview-voice",
                          name: "Preview Voice",
                          language: "en-US",
                          gender: .female,
                          provider: .openAI,
                          previewURL: "https://example.com/sample.mp3")

        viewModel.previewVoice(voice)

        await Task.yield()
        await Task.yield()

        XCTAssertEqual(viewModel.previewingVoiceID, voice.id)
        XCTAssertTrue(viewModel.isPreviewActive)
        XCTAssertTrue(viewModel.isPreviewPlaying || viewModel.isPreviewLoadingActive)

        viewModel.stopPreview()

        await Task.yield()

        XCTAssertNil(viewModel.previewingVoiceID)
        XCTAssertFalse(viewModel.isPreviewActive)
        XCTAssertFalse(viewModel.isPreviewLoadingActive)
        XCTAssertFalse(viewModel.isPreviewing)
    }

    @MainActor
    func testVoicePreviewFallsBackToSynthesisWhenURLMissing() async {
        resetPersistedSettings()
        let previewPlayer = StubPreviewAudioPlayer()
        let sampleData = Data([0x00, 0x01])

        let viewModel = makeTestViewModel(previewPlayer: previewPlayer,
                                          previewGenerator: { _, providerType, settings, styleValues in
                                              XCTAssertEqual(providerType, .openAI)
                                              XCTAssertEqual(settings.styleValues, styleValues)
                                              return sampleData
                                          })

        guard let voice = viewModel.availableVoices.first(where: { $0.provider.rawValue == TTSProviderType.openAI.rawValue }) else {
            XCTFail("Expected an OpenAI voice")
            return
        }

        viewModel.previewVoice(voice)

        await Task.yield()
        await Task.yield()

        XCTAssertNil(viewModel.errorMessage)
        XCTAssertEqual(viewModel.previewingVoiceID, voice.id)
        XCTAssertTrue(viewModel.isPreviewActive)
        XCTAssertTrue(viewModel.isPreviewPlaying || viewModel.isPreviewLoadingActive)
    }

    @MainActor
    func testApplyPlaybackSettingsUpdatesAudioPlayer() throws {
        let audioSpy = SpyAudioPlayerService()
        let viewModel = makeTestViewModel(audioPlayer: audioSpy)

        viewModel.playbackSpeed = 1.5
        viewModel.volume = 0.4

        viewModel.applyPlaybackSettings()

        let rate = try XCTUnwrap(audioSpy.recordedRate)
        XCTAssertEqual(rate, 1.5, accuracy: 0.0001)

        let volume = try XCTUnwrap(audioSpy.recordedVolume)
        XCTAssertEqual(volume, 0.4, accuracy: 0.0001)
    }

    func testAudioFormatInitializationFromFileExtension() {
        XCTAssertEqual(AudioSettings.AudioFormat(fileExtension: "MP3"), .mp3)
        XCTAssertEqual(AudioSettings.AudioFormat(fileExtension: "wav"), .wav)
        XCTAssertEqual(AudioSettings.AudioFormat(fileExtension: "m4a"), .aac)
        XCTAssertEqual(AudioSettings.AudioFormat(fileExtension: "ogg"), .opus)
        XCTAssertEqual(AudioSettings.AudioFormat(fileExtension: "flac"), .flac)
        XCTAssertNil(AudioSettings.AudioFormat(fileExtension: "txt"))
    }
    
    // MARK: - View Model Tests
    
    @MainActor
    func testViewModelInitialization() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

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
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

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

        viewModel.selectedProvider = .tightAss
        viewModel.updateAvailableVoices()
        XCTAssertFalse(viewModel.availableVoices.isEmpty)
        XCTAssertEqual(viewModel.supportedFormats, [.wav])
    }

    @MainActor
    func testStyleControlsTrackProviderCapabilities() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        XCTAssertTrue(viewModel.hasActiveStyleControls)
        XCTAssertFalse(viewModel.activeStyleControls.isEmpty)
        XCTAssertFalse(viewModel.styleValues.isEmpty)
        let openAIValues = viewModel.styleValues

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()

        XCTAssertTrue(viewModel.hasActiveStyleControls)
        XCTAssertFalse(viewModel.activeStyleControls.isEmpty)
        XCTAssertFalse(viewModel.styleValues.isEmpty)

        let initialValues = viewModel.styleValues

        viewModel.selectedProvider = .google
        viewModel.updateAvailableVoices()

        XCTAssertTrue(viewModel.hasActiveStyleControls)
        XCTAssertFalse(viewModel.activeStyleControls.isEmpty)
        XCTAssertFalse(viewModel.styleValues.isEmpty)
        let googleValues = viewModel.styleValues

        viewModel.selectedProvider = .tightAss
        viewModel.updateAvailableVoices()

        XCTAssertFalse(viewModel.hasActiveStyleControls)
        XCTAssertTrue(viewModel.activeStyleControls.isEmpty)
        XCTAssertTrue(viewModel.styleValues.isEmpty)

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        XCTAssertEqual(viewModel.styleValues, initialValues)

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        XCTAssertEqual(viewModel.styleValues, openAIValues)

        viewModel.selectedProvider = .google
        viewModel.updateAvailableVoices()
        XCTAssertEqual(viewModel.styleValues, googleValues)
    }

    @MainActor
    func testResetStyleControlsRestoresDefaults() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()

        XCTAssertTrue(viewModel.hasActiveStyleControls)
        XCTAssertFalse(viewModel.canResetStyleControls)

        guard let control = viewModel.activeStyleControls.first else {
            XCTFail("Expected OpenAI to expose style controls")
            return
        }

        viewModel.binding(for: control).wrappedValue = control.range.upperBound

        XCTAssertTrue(viewModel.canResetStyleControls)
        let adjustedValue = viewModel.currentStyleValue(for: control)
        XCTAssertGreaterThan(abs(adjustedValue - control.defaultValue), 0.0001)

        viewModel.resetStyleControls()

        XCTAssertFalse(viewModel.canResetStyleControls)
        XCTAssertEqual(viewModel.currentStyleValue(for: control), control.defaultValue, accuracy: 0.0001)
    }

    @MainActor
    func testResetSingleStyleControlOnlyTouchesTarget() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()

        guard viewModel.activeStyleControls.count >= 1 else {
            XCTFail("Expected style controls for OpenAI")
            return
        }

        let primaryControl = viewModel.activeStyleControls[0]
        viewModel.binding(for: primaryControl).wrappedValue = primaryControl.range.upperBound

        var secondaryControl: ProviderStyleControl?
        if viewModel.activeStyleControls.count > 1 {
            secondaryControl = viewModel.activeStyleControls[1]
            if let secondaryControl {
                viewModel.binding(for: secondaryControl).wrappedValue = secondaryControl.range.lowerBound
            }
        }

        XCTAssertTrue(viewModel.canResetStyleControl(primaryControl))
        viewModel.resetStyleControl(primaryControl)

        XCTAssertEqual(viewModel.currentStyleValue(for: primaryControl), primaryControl.defaultValue, accuracy: 0.0001)

        if let secondaryControl {
            XCTAssertNotEqual(viewModel.currentStyleValue(for: secondaryControl), secondaryControl.defaultValue, accuracy: 0.0001)
        }

        XCTAssertEqual(viewModel.canResetStyleControls, secondaryControl != nil)
    }

    @MainActor
    func testTranslateKeepsOriginalWhenToggleOn() async {
        resetPersistedSettings()
        var translationService = StubTranslationService()
        translationService.translatedText = "Hola mundo"
        translationService.detectedLanguage = "en"

        let viewModel = makeTestViewModel(translationService: translationService)
        viewModel.inputText = "Hello world"
        viewModel.translationTargetLanguage = .supported.first(where: { $0.code == "es" }) ?? .english
        viewModel.translationKeepOriginal = true

        await viewModel.translateCurrentText()

        XCTAssertEqual(viewModel.translationResult?.translatedText, "Hola mundo")
        XCTAssertEqual(viewModel.inputText, "Hello world")
        XCTAssertTrue(viewModel.shouldShowTranslationComparison)
        XCTAssertFalse(viewModel.isTranslating)
    }

    @MainActor
    func testTranslateReplacesEditorWhenKeepOriginalDisabled() async {
        resetPersistedSettings()
        var translationService = StubTranslationService()
        translationService.translatedText = "Bonjour le monde"
        translationService.detectedLanguage = "en"

        let viewModel = makeTestViewModel(translationService: translationService)
        viewModel.inputText = "Hello world"
        viewModel.translationTargetLanguage = .supported.first(where: { $0.code == "fr" }) ?? .english
        viewModel.translationKeepOriginal = false

        await viewModel.translateCurrentText()

        XCTAssertEqual(viewModel.inputText, "Bonjour le monde")
        XCTAssertNil(viewModel.translationResult)
        XCTAssertFalse(viewModel.shouldShowTranslationComparison)
    }

    @MainActor
    func testAdoptTranslationClearsComparison() async {
        resetPersistedSettings()
        var translationService = StubTranslationService()
        translationService.translatedText = "Hallo Welt"
        translationService.detectedLanguage = "en"

        let viewModel = makeTestViewModel(translationService: translationService)
        viewModel.inputText = "Hello world"
        viewModel.translationTargetLanguage = .supported.first(where: { $0.code == "de" }) ?? .english
        viewModel.translationKeepOriginal = true

        await viewModel.translateCurrentText()
        XCTAssertNotNil(viewModel.translationResult)

        viewModel.adoptTranslationAsInput()

        XCTAssertEqual(viewModel.inputText, "Hallo Welt")
        XCTAssertNil(viewModel.translationResult)
        XCTAssertFalse(viewModel.translationKeepOriginal)
    }

    func testGoogleVoiceTuningAdaptsPerVoiceFamily() {
        let service = GoogleTTSService()

        let neural = service.tuningParameters(for: "en-US-Neural2-F")
        let wavenet = service.tuningParameters(for: "en-US-Wavenet-D")
        let standard = service.tuningParameters(for: "en-US-Standard-A")

        XCTAssertLessThan(neural.minRate, neural.maxRate)
        XCTAssertLessThan(wavenet.minPitch, wavenet.maxPitch)
        XCTAssertLessThan(standard.minRate, standard.maxRate)

        XCTAssertLessThan(neural.rateSpread, standard.rateSpread)
        XCTAssertGreaterThan(wavenet.rateSpread, neural.rateSpread)
        XCTAssertGreaterThan(standard.pitchSpread, neural.pitchSpread)
    }

    @MainActor
    func testStyleValuesPersistAcrossSessions() {
        resetPersistedSettings()
        var viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()

        guard let openAIControl = viewModel.activeStyleControls.first else {
            XCTFail("Expected OpenAI to expose style controls")
            return
        }

        let openAIControlID = openAIControl.id
        viewModel.binding(for: openAIControl).wrappedValue = 0.7

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()

        guard let elevenControl = viewModel.activeStyleControls.first else {
            XCTFail("Expected ElevenLabs to expose style controls")
            return
        }

        let elevenControlID = elevenControl.id
        viewModel.binding(for: elevenControl).wrappedValue = 0.55

        viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        let restoredOpenAI = viewModel.styleValues[openAIControlID]
        XCTAssertNotNil(restoredOpenAI)
        XCTAssertEqual(restoredOpenAI ?? 0, 0.7, accuracy: 0.0001)

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        let restoredEleven = viewModel.styleValues[elevenControlID]
        XCTAssertNotNil(restoredEleven)
        XCTAssertEqual(restoredEleven ?? 0, 0.55, accuracy: 0.0001)

        resetPersistedSettings()
    }

    @MainActor
    func testAppearancePreferencePersistence() {
        resetPersistedSettings()
        var viewModel = makeTestViewModel()
        XCTAssertNil(viewModel.colorSchemeOverride)

        viewModel.appearancePreference = .dark

        // Reinitialize to confirm persistence
        viewModel = makeTestViewModel()
        XCTAssertEqual(viewModel.appearancePreference, .dark)
        XCTAssertEqual(viewModel.colorSchemeOverride, .dark)

        viewModel.appearancePreference = .light
        XCTAssertEqual(viewModel.colorSchemeOverride, .light)

        resetPersistedSettings()
    }

    @MainActor
    func testFormatSelectionResetsWhenUnsupported() {
        let viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        viewModel.selectedFormat = .flac
        XCTAssertEqual(viewModel.selectedFormat, .flac)

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        XCTAssertEqual(viewModel.selectedFormat, .mp3)
    }

    @MainActor
    func testImportTextFromURLPopulatesEditor() async {
        let raw = "Skip to content\nMenu\nHello world article content.\nRead more"
        let viewModel = makeTestViewModel(urlContentResult: .success(raw))

        await viewModel.importText(from: "https://example.com/post", autoGenerate: false)

        XCTAssertEqual(viewModel.inputText, "Hello world article content.")
        XCTAssertFalse(viewModel.isImportingFromURL)
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testImportTextTruncatesLongContent() async {
        let longText = String(repeating: "A", count: 6000)
        let viewModel = makeTestViewModel(urlContentResult: .success(longText))

        await viewModel.importText(from: "https://example.com/long", autoGenerate: false)

        XCTAssertEqual(viewModel.inputText.count, 5000)
        XCTAssertEqual(viewModel.errorMessage, "Imported text exceeded 5,000 characters. The content was truncated.")
    }

    @MainActor
    func testImportTextProducesArticleSummary() async {
        let summarizer = StubSummarizationService(condensed: "Condensed body", summary: "Concise takeaway.")
        let viewModel = makeTestViewModel(urlContentResult: .success("Headline\nBody paragraph."),
                                          summarizationService: summarizer)

        await viewModel.importText(from: "https://example.com/article", autoGenerate: false)
        await waitUntil { viewModel.articleSummaryPreview != nil }

        XCTAssertEqual(viewModel.articleSummaryPreview, "Concise takeaway.")
        XCTAssertEqual(viewModel.condensedImportPreview, "Condensed body")
    }

    @MainActor
    func testReplaceEditorUsesCondensedArticle() async {
        let summarizer = StubSummarizationService(condensed: "Condensed body", summary: "Summary line.")
        let viewModel = makeTestViewModel(urlContentResult: .success("Original article body."),
                                          summarizationService: summarizer)

        await viewModel.importText(from: "https://example.com/article", autoGenerate: false)
        await waitUntil { viewModel.canAdoptCondensedImport }

        viewModel.replaceEditorWithCondensedImport()

        XCTAssertEqual(viewModel.inputText, "Condensed body")
    }

    @MainActor
    func testInsertSummaryAppendsToEditor() async {
        let summarizer = StubSummarizationService(condensed: "Condensed body", summary: "Summary line.")
        let viewModel = makeTestViewModel(urlContentResult: .success("Original article body."),
                                          summarizationService: summarizer)

        await viewModel.importText(from: "https://example.com/article", autoGenerate: false)
        await waitUntil { viewModel.canInsertSummaryIntoEditor }

        viewModel.insertSummaryIntoEditor()

        XCTAssertTrue(viewModel.inputText.contains("Original article body."))
        XCTAssertTrue(viewModel.inputText.contains("Summary line."))
    }

    @MainActor
    func testClearTextRemovesArticleSummary() async {
        let summarizer = StubSummarizationService(condensed: "Condensed body", summary: "Summary line.")
        let viewModel = makeTestViewModel(urlContentResult: .success("Original article body."),
                                          summarizationService: summarizer)

        await viewModel.importText(from: "https://example.com/article", autoGenerate: false)
        await waitUntil { viewModel.articleSummary != nil }

        viewModel.clearText()

        XCTAssertNil(viewModel.articleSummary)
        XCTAssertNil(viewModel.articleSummaryPreview)
        XCTAssertFalse(viewModel.isSummarizingArticle)
    }

    @MainActor
    func testImportTextRejectsInvalidURL() async {
        let viewModel = makeTestViewModel()

        await viewModel.importText(from: "ftp://example.com", autoGenerate: false)

        XCTAssertEqual(viewModel.errorMessage, "URL must start with http:// or https://.")
        XCTAssertFalse(viewModel.isImportingFromURL)
    }

    @MainActor
    func testRecentHistoryMaintainsOrderAndLimit() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        let voice = Voice(
            id: "voice-test",
            name: "History Voice",
            language: "en-US",
            gender: .neutral,
            provider: .openAI,
            previewURL: nil
        )

        (0..<6).forEach { index in
            let text = "Sample text \(index)"
            let audio = Data(repeating: UInt8(index), count: 10)
            viewModel.recordGenerationHistory(
                audioData: audio,
                format: .mp3,
                text: text,
                voice: voice,
                provider: .openAI,
                duration: TimeInterval(index + 1),
                transcript: nil
            )
        }

        XCTAssertEqual(viewModel.recentGenerations.count, 5)
        XCTAssertEqual(viewModel.recentGenerations.first?.text, "Sample text 5")
        XCTAssertEqual(viewModel.recentGenerations.last?.text, "Sample text 1")
    }

    @MainActor
    func testRecentHistoryDeduplicatesByProviderVoiceAndText() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        let voice = Voice(
            id: "voice-test",
            name: "History Voice",
            language: "en-US",
            gender: .neutral,
            provider: .openAI,
            previewURL: nil
        )

        viewModel.recordGenerationHistory(
            audioData: Data(repeating: 1, count: 10),
            format: .mp3,
            text: "Repeated",
            voice: voice,
            provider: .openAI,
            duration: 2,
            transcript: nil
        )

        viewModel.recordGenerationHistory(
            audioData: Data(repeating: 2, count: 10),
            format: .wav,
            text: "Repeated",
            voice: voice,
            provider: .openAI,
            duration: 3,
            transcript: nil
        )

        XCTAssertEqual(viewModel.recentGenerations.count, 1)
        XCTAssertEqual(viewModel.recentGenerations.first?.format, .wav)
        XCTAssertEqual(viewModel.recentGenerations.first?.audioData, Data(repeating: 2, count: 10))
    }

    @MainActor
    func testRemovingHistoryItems() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        let voice = Voice(
            id: "voice-test",
            name: "History Voice",
            language: "en-US",
            gender: .neutral,
            provider: .openAI,
            previewURL: nil
        )

        viewModel.recordGenerationHistory(
            audioData: Data(repeating: 1, count: 10),
            format: .mp3,
            text: "First",
            voice: voice,
            provider: .openAI,
            duration: 2,
            transcript: nil
        )

        viewModel.recordGenerationHistory(
            audioData: Data(repeating: 2, count: 10),
            format: .mp3,
            text: "Second",
            voice: voice,
            provider: .openAI,
            duration: 2,
            transcript: nil
        )

        XCTAssertEqual(viewModel.recentGenerations.count, 2)

        if let firstItem = viewModel.recentGenerations.first {
            viewModel.removeHistoryItem(firstItem)
        }

        XCTAssertEqual(viewModel.recentGenerations.count, 1)
        viewModel.clearHistory()
        XCTAssertTrue(viewModel.recentGenerations.isEmpty)
    }

    @MainActor
    func testSavingSnippetReplacesExistingName() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.inputText = "Hello World"
        viewModel.saveCurrentTextAsSnippet(named: "Greeting")
        XCTAssertEqual(viewModel.textSnippets.count, 1)

        viewModel.inputText = "Updated Greeting"
        viewModel.saveCurrentTextAsSnippet(named: "Greeting")
        XCTAssertEqual(viewModel.textSnippets.count, 1)
        XCTAssertEqual(viewModel.textSnippets.first?.content, "Updated Greeting")
    }

    @MainActor
    func testInsertSnippetModes() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.inputText = "Original"
        let snippet = TextSnippet(name: "Sample", content: "Snippet Content")

        viewModel.insertSnippet(snippet, mode: .append)
        XCTAssertTrue(viewModel.inputText.contains("Snippet Content"))
        XCTAssertTrue(viewModel.inputText.contains("Original"))

        viewModel.insertSnippet(snippet, mode: .replace)
        XCTAssertEqual(viewModel.inputText, "Snippet Content")
    }

    @MainActor
    func testRemoveSnippet() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.inputText = "Content"
        viewModel.saveCurrentTextAsSnippet(named: "Keep")
        XCTAssertEqual(viewModel.textSnippets.count, 1)

        if let snippet = viewModel.textSnippets.first {
            viewModel.removeSnippet(snippet)
        }
        XCTAssertTrue(viewModel.textSnippets.isEmpty)
    }

    @MainActor
    func testBatchSegmentsSplitOnDelimiter() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.inputText = "Intro\n---\nMiddle section\n---\nConclusion"

        let segments = viewModel.batchSegments(from: viewModel.inputText)

        XCTAssertEqual(segments.count, 3)
        XCTAssertTrue(viewModel.hasBatchableSegments)
        XCTAssertEqual(segments[1], "Middle section")
    }

    @MainActor
    func testBatchSegmentsIgnoreEmptyEntries() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.inputText = "---\nFirst\n---\n\n---\nSecond"

        let segments = viewModel.batchSegments(from: viewModel.inputText)

        XCTAssertEqual(segments.count, 2)
        XCTAssertEqual(segments.first, "First")
        XCTAssertEqual(segments.last, "Second")
        XCTAssertTrue(viewModel.hasBatchableSegments)
    }

    @MainActor
    func testApplyPronunciationRulesRespectsScope() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()
        viewModel.pronunciationRules = [
            PronunciationRule(displayText: "GIF", replacementText: "jiff", scope: .global),
            PronunciationRule(displayText: "data", replacementText: "day-ta", scope: .provider(.openAI))
        ]

        let openAIResult = viewModel.applyPronunciationRules(to: "GIF data", provider: .openAI)
        let elevenLabsResult = viewModel.applyPronunciationRules(to: "GIF data", provider: .elevenLabs)

        XCTAssertEqual(openAIResult, "jiff day-ta")
        XCTAssertEqual(elevenLabsResult, "jiff data")
    }

    func testTranscriptBuilderProducesStructuredOutput() {
        let text = "Hello world. This is a transcript test."
        let duration: TimeInterval = 6

        let transcript = TranscriptBuilder.makeTranscript(for: text, duration: duration)

        XCTAssertNotNil(transcript)
        XCTAssertTrue(transcript?.srt.contains("1") == true)
        XCTAssertTrue(transcript?.vtt.contains("WEBVTT") == true)
    }

    @MainActor
    func testCostEstimatesPerProvider() {
        resetPersistedSettings()
        let viewModel = makeTestViewModel()

        viewModel.selectedProvider = .openAI
        viewModel.updateAvailableVoices()
        viewModel.inputText = String(repeating: "a", count: 2000)
        XCTAssertTrue(viewModel.costEstimateSummary.contains("$0.03"))

        viewModel.selectedProvider = .google
        viewModel.updateAvailableVoices()
        viewModel.inputText = String(repeating: "a", count: 500_000)
        XCTAssertTrue(viewModel.costEstimateSummary.contains("free tier") || viewModel.costEstimateSummary.contains("Free"))

        viewModel.selectedProvider = .elevenLabs
        viewModel.updateAvailableVoices()
        viewModel.inputText = String(repeating: "a", count: 20_000)
        XCTAssertTrue(viewModel.costEstimateSummary.contains("$0.50"))

        viewModel.selectedProvider = .tightAss
        viewModel.updateAvailableVoices()
        viewModel.inputText = String(repeating: "a", count: 1_000)
        XCTAssertTrue(viewModel.costEstimateSummary.localizedCaseInsensitiveContains("no usage fees"))
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
        XCTAssertEqual(TTSProviderType.tightAss.displayName, "Tight Ass Mode")
    }
    
    func testProviderTypeIcons() {
        XCTAssertEqual(TTSProviderType.elevenLabs.icon, "waveform")
        XCTAssertEqual(TTSProviderType.openAI.icon, "cpu")
        XCTAssertEqual(TTSProviderType.google.icon, "cloud")
        XCTAssertEqual(TTSProviderType.tightAss.icon, "internaldrive")
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
