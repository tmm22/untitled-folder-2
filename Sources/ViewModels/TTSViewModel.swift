import SwiftUI
import AVFoundation
import Combine
import UniformTypeIdentifiers
import UserNotifications

enum SnippetInsertMode {
    case replace
    case append
}

// MARK: - Voice Preview Controls
extension TTSViewModel {
    func previewVoice(_ voice: Voice) {
        if previewingVoiceID == voice.id && (isPreviewing || isPreviewLoading) {
            stopPreview()
            return
        }

        stopPreview()

        guard let providerType = TTSProviderType(rawValue: voice.provider.rawValue) else {
            errorMessage = "Preview not available for \(voice.name)."
            return
        }

        audioPlayer.pause()
        isPlaying = false
        previewingVoiceID = voice.id
        previewVoiceName = voice.name
        isPreviewLoading = true

        previewTask = Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let data = try await self.loadPreviewAudio(for: voice, providerType: providerType)
                try Task.checkCancellation()
                try await self.previewPlayer.loadAudio(from: data)
                try Task.checkCancellation()
                self.previewPlayer.setVolume(Float(self.volume))
                self.previewPlayer.play()
                self.isPreviewLoading = false
                self.isPreviewing = true
            } catch is CancellationError {
                self.resetPreviewState()
            } catch {
                self.handlePreviewError(error, voiceName: voice.name)
            }

            self.previewTask = nil
        }
    }

    func stopPreview() {
        previewTask?.cancel()
        previewTask = nil
        previewPlayer.stop()
        resetPreviewState()
    }

    func isPreviewingVoice(_ voice: Voice) -> Bool {
        previewingVoiceID == voice.id && isPreviewing
    }

    func isPreviewLoadingVoice(_ voice: Voice) -> Bool {
        previewingVoiceID == voice.id && isPreviewLoading
    }

    func canPreview(_ voice: Voice) -> Bool {
        if voice.previewURL != nil {
            return true
        }

        guard let providerType = TTSProviderType(rawValue: voice.provider.rawValue) else {
            return false
        }

        if providerType == .tightAss {
            return true
        }

        let provider = getProvider(for: providerType)
        return provider.hasValidAPIKey()
    }

    var isPreviewActive: Bool {
        previewingVoiceID != nil
    }

    var isPreviewPlaying: Bool {
        previewingVoiceID != nil && isPreviewing
    }

    var isPreviewLoadingActive: Bool {
        previewingVoiceID != nil && isPreviewLoading
    }
}

enum TranscriptFormat {
    case srt
    case vtt

    var fileExtension: String {
        switch self {
        case .srt:
            return "srt"
        case .vtt:
            return "vtt"
        }
    }

    var contentType: UTType? {
        UTType(filenameExtension: fileExtension)
    }
}

struct GenerationOutput {
    let audioData: Data
    let transcript: TranscriptBundle?
    let duration: TimeInterval
}

@MainActor
class TTSViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var inputText: String = "" {
        didSet {
            guard !isUpdatingInputFromTranslation else { return }
            if inputText.isEmpty {
                translationResult = nil
            } else if let existing = translationResult, existing.originalText != inputText {
                translationResult = nil
            }
        }
    }
    @Published var selectedProvider: TTSProviderType = .openAI
    @Published var selectedVoice: Voice?
    @Published var isGenerating: Bool = false
    @Published var isPlaying: Bool = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackSpeed: Double = 1.0
    @Published var volume: Double = 0.75
    @Published var errorMessage: String?
    @Published var availableVoices: [Voice] = []
    @Published private(set) var previewingVoiceID: Voice.ID?
    @Published private(set) var previewVoiceName: String?
    @Published private(set) var isPreviewing: Bool = false
    @Published private(set) var isPreviewLoading: Bool = false
    @Published var isLoopEnabled: Bool = false
    @Published var generationProgress: Double = 0
    @Published var isMinimalistMode: Bool = false
    @Published var recentGenerations: [GenerationHistoryItem] = []
    @Published var textSnippets: [TextSnippet] = []
    @Published var batchItems: [BatchGenerationItem] = []
    @Published var isBatchRunning: Bool = false
    @Published var batchProgress: Double = 0
    @Published var pronunciationRules: [PronunciationRule] = []
    @Published private(set) var articleSummary: ArticleImportSummary?
    @Published private(set) var isSummarizingArticle: Bool = false
    @Published private(set) var articleSummaryError: String?
    @Published var translationTargetLanguage: TranslationLanguage = .english {
        didSet {
            if translationTargetLanguage != oldValue {
                translationResult = nil
            }
        }
    }
    @Published var translationKeepOriginal: Bool = true {
        didSet {
            if translationKeepOriginal == false {
                translationResult = nil
            }
        }
    }
    @Published private(set) var translationResult: TranslationResult?
    @Published private(set) var isTranslating: Bool = false
    @Published private(set) var notificationsEnabled: Bool = false
    @Published private(set) var activeStyleControls: [ProviderStyleControl] = []
    @Published private(set) var styleValues: [String: Double] = [:] {
        didSet {
            cachedStyleValues[selectedProvider] = styleValues
            persistStyleValues()
        }
    }
    @Published var isImportingFromURL: Bool = false
    @Published var appearancePreference: AppearancePreference = .system {
        didSet {
            guard appearancePreference != oldValue else { return }
            saveSettings()
        }
    }
    @Published var selectedFormat: AudioSettings.AudioFormat = .mp3 {
        didSet {
            guard selectedFormat != oldValue else { return }
            ensureFormatSupportedForSelectedProvider()
            if audioData != nil && selectedFormat != currentAudioFormat {
                clearGeneratedAudio()
            }
            saveSettings()
        }
    }
    
    // MARK: - Services
    private let audioPlayer: AudioPlayerService
    private let previewPlayer: AudioPlayerService
    private let elevenLabs: ElevenLabsService
    private let openAI: OpenAIService
    private let googleTTS: GoogleTTSService
    private let localTTS: LocalTTSService
    private let summarizationService: TextSummarizationService
    private let keychainManager = KeychainManager()

    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private(set) var audioData: Data?  // Make it readable but not writable from outside
    private(set) var currentAudioFormat: AudioSettings.AudioFormat = .mp3
    private(set) var currentTranscript: TranscriptBundle?
    private let maxTextLength = 5000
    private let maxHistoryItems = 5
    private let snippetsKey = "textSnippets"
    private let pronunciationKey = "pronunciationRules"
    private let notificationsKey = "notificationsEnabled"
    private let styleValuesKey = "providerStyleValues"
    private let styleComparisonEpsilon = 0.0001
    private var batchTask: Task<Void, Never>?
    private let notificationCenter: UNUserNotificationCenter?
    private let urlContentLoader: URLContentLoading
    private var cachedStyleValues: [TTSProviderType: [String: Double]] = [:]
    private let translationService: TextTranslationService
    private var articleSummaryTask: Task<Void, Never>?
    private var isUpdatingInputFromTranslation = false
    private let previewDataLoader: (URL) async throws -> Data
    private let previewAudioGenerator: ((Voice, TTSProviderType, AudioSettings, [String: Double]) async throws -> Data)?
    private var previewTask: Task<Void, Never>?

    var supportedFormats: [AudioSettings.AudioFormat] {
        supportedFormats(for: selectedProvider)
    }

    var colorSchemeOverride: ColorScheme? {
        appearancePreference.colorScheme
    }

    var hasActiveStyleControls: Bool {
        !activeStyleControls.isEmpty
    }

    var canResetStyleControls: Bool {
        guard hasActiveStyleControls else { return false }
        return activeStyleControls.contains { canResetStyleControl($0) }
    }

    func canResetStyleControl(_ control: ProviderStyleControl) -> Bool {
        abs(currentStyleValue(for: control) - control.defaultValue) > styleComparisonEpsilon
    }

    var exportFormatHelpText: String? {
        switch selectedProvider {
        case .elevenLabs:
            return "ElevenLabs currently exports MP3 files only."
        case .google:
            return "Google Cloud supports MP3 or WAV output."
        case .openAI:
            return "OpenAI offers MP3, WAV, AAC, and FLAC options."
        case .tightAss:
            return "Tight Ass Mode saves audio using the system voices in WAV format."
        }
    }

    var hasBatchableSegments: Bool {
        batchSegments(from: inputText).count > 1
    }

    var pendingBatchSegmentCount: Int {
        batchSegments(from: inputText).count
    }

    var availableTranslationLanguages: [TranslationLanguage] { TranslationLanguage.supported }

    var translationTargetLanguageDisplayName: String { translationTargetLanguage.displayName }

    var translationDetectedLanguageDisplayName: String? {
        translationResult?.detectedLanguageDisplayName
    }

    var shouldShowTranslationComparison: Bool {
        translationKeepOriginal && translationResult != nil
    }

    var canTranslate: Bool {
        translationService.hasCredentials()
    }

    var canSummarizeImports: Bool {
        summarizationService.hasCredentials()
    }

    var articleSummaryPreview: String? {
        articleSummary?.summaryText?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var condensedImportPreview: String? {
        articleSummary?.condensedText?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var articleSummaryReductionDescription: String? {
        guard let summary = articleSummary,
              let condensedCount = summary.condensedWordCount,
              summary.originalWordCount > 0 else {
            return articleSummary?.wordSavingsDescription
        }

        let reduction = 1 - (Double(condensedCount) / Double(summary.originalWordCount))
        guard reduction > 0 else { return articleSummary?.wordSavingsDescription }
        let percent = Int((reduction * 100).rounded())
        return percent > 0 ? "Cuts roughly \(percent)% of the article before narration." : articleSummary?.wordSavingsDescription
    }

    var canAdoptCondensedImport: Bool {
        guard let text = condensedImportPreview else { return false }
        return !text.isEmpty
    }

    var canInsertSummaryIntoEditor: Bool {
        guard let summary = articleSummaryPreview else { return false }
        return !summary.isEmpty
    }

    var canSpeakSummary: Bool {
        canInsertSummaryIntoEditor
    }

    static func defaultPreviewLoader(url: URL) async throws -> Data {
        let (data, _) = try await URLSession.shared.data(from: url)
        return data
    }

    var costEstimate: CostEstimate {
        let profile = ProviderCostProfile.profile(for: selectedProvider)
        let characterCount = inputText.trimmingCharacters(in: .whitespacesAndNewlines).count
        return profile.estimate(for: characterCount)
    }

    var costEstimateSummary: String { costEstimate.summary }

    var costEstimateDetail: String? { costEstimate.detail }

    func binding(for control: ProviderStyleControl) -> Binding<Double> {
        Binding(
            get: { self.currentStyleValue(for: control) },
            set: { newValue in
                let clamped = control.clamp(newValue)
                if self.styleValues[control.id] != clamped {
                    self.styleValues[control.id] = clamped
                }
            }
        )
    }

    func currentStyleValue(for control: ProviderStyleControl) -> Double {
        styleValues[control.id] ?? control.defaultValue
    }

    // MARK: - Initialization
    init(notificationCenterProvider: @escaping () -> UNUserNotificationCenter? = { UNUserNotificationCenter.current() },
         urlContentLoader: URLContentLoading = URLContentService(),
         translationService: TextTranslationService = OpenAITranslationService(),
         summarizationService: TextSummarizationService = OpenAISummarizationService(),
         audioPlayer: AudioPlayerService? = nil,
         previewAudioPlayer: AudioPlayerService? = nil,
         previewDataLoader: @escaping (URL) async throws -> Data = TTSViewModel.defaultPreviewLoader,
         previewAudioGenerator: ((Voice, TTSProviderType, AudioSettings, [String: Double]) async throws -> Data)? = nil,
         elevenLabsService: ElevenLabsService = ElevenLabsService(),
         openAIService: OpenAIService = OpenAIService(),
         googleService: GoogleTTSService = GoogleTTSService(),
         localService: LocalTTSService = LocalTTSService()) {
        self.notificationCenter = notificationCenterProvider()
        self.urlContentLoader = urlContentLoader
        self.translationService = translationService
        self.summarizationService = summarizationService
        self.audioPlayer = audioPlayer ?? AudioPlayerService()
        self.previewPlayer = previewAudioPlayer ?? AudioPlayerService()
        self.previewDataLoader = previewDataLoader
        self.previewAudioGenerator = previewAudioGenerator
        self.elevenLabs = elevenLabsService
        self.openAI = openAIService
        self.googleTTS = googleService
        self.localTTS = localService
        setupAudioPlayer()
        setupPreviewPlayer()
        loadSavedSettings()
        updateAvailableVoices()
    }

    private func refreshStyleControls(for providerType: TTSProviderType) {
        let provider = getProvider(for: providerType)
        let controls = provider.styleControls
        activeStyleControls = controls

        guard !controls.isEmpty else {
            styleValues = [:]
            cachedStyleValues[providerType] = [:]
            return
        }

        let resolved = resolveStyleValues(for: controls, cached: cachedStyleValues[providerType])
        styleValues = resolved
    }

    private func resolveStyleValues(for controls: [ProviderStyleControl], cached: [String: Double]?) -> [String: Double] {
        controls.reduce(into: [:]) { partialResult, control in
            let stored = cached?[control.id] ?? control.defaultValue
            partialResult[control.id] = control.clamp(stored)
        }
    }

    private func styleValues(for providerType: TTSProviderType) -> [String: Double] {
        if providerType == selectedProvider {
            return styleValues
        }

        let provider = getProvider(for: providerType)
        let controls = provider.styleControls
        guard !controls.isEmpty else {
            cachedStyleValues[providerType] = [:]
            persistStyleValues()
            return [:]
        }
        let resolved = resolveStyleValues(for: controls, cached: cachedStyleValues[providerType])
        cachedStyleValues[providerType] = resolved
        persistStyleValues()
        return resolved
    }

    private func persistStyleValues() {
        let filtered = cachedStyleValues.reduce(into: [String: [String: Double]]()) { partialResult, element in
            guard !element.value.isEmpty else { return }
            partialResult[element.key.rawValue] = element.value
        }

        let defaults = UserDefaults.standard
        if filtered.isEmpty {
            defaults.removeObject(forKey: styleValuesKey)
            return
        }

        if let data = try? JSONEncoder().encode(filtered) {
            defaults.set(data, forKey: styleValuesKey)
        }
    }

    // MARK: - Public Methods
    func resetStyleControl(_ control: ProviderStyleControl) {
        guard hasActiveStyleControls else { return }
        guard canResetStyleControl(control) else { return }
        styleValues[control.id] = control.defaultValue
    }

    func resetStyleControls() {
        guard hasActiveStyleControls else { return }
        let defaults = activeStyleControls.reduce(into: [String: Double]()) { partialResult, control in
            partialResult[control.id] = control.defaultValue
        }
        styleValues = defaults
    }

    func translateCurrentText() async {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            errorMessage = "Please enter text to translate"
            return
        }

        guard canTranslate else {
            errorMessage = "Add an OpenAI key in Settings to translate text."
            return
        }

        isTranslating = true
        errorMessage = nil

        do {
            let result = try await translationService.translate(text: trimmed, targetLanguageCode: translationTargetLanguage.code)

            if translationKeepOriginal {
                translationResult = result
            } else {
                isUpdatingInputFromTranslation = true
                inputText = result.translatedText
                isUpdatingInputFromTranslation = false
                translationResult = nil
            }
        } catch let error as TTSError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isTranslating = false
    }

    func adoptTranslationAsInput() {
        guard let translationResult else { return }
        translationKeepOriginal = false
        isUpdatingInputFromTranslation = true
        inputText = translationResult.translatedText
        isUpdatingInputFromTranslation = false
        self.translationResult = nil
    }

    func generateSpeech() async {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            errorMessage = "Please enter some text"
            return
        }

        stopPreview()

        let providerType = selectedProvider
        let provider = getProvider(for: providerType)
        let voice = selectedVoice ?? provider.defaultVoice
        let format = currentFormatForGeneration()
        let providerLimit = characterLimit(for: providerType)

        if trimmed.count > providerLimit {
            await generateLongFormSpeech(
                text: trimmed,
                providerType: providerType,
                voice: voice,
                format: format,
                shouldAutoplay: true
            )
            return
        }

        guard trimmed.count <= maxTextLength else {
            errorMessage = "Text exceeds maximum length of \(maxTextLength) characters"
            return
        }

        isGenerating = true
        errorMessage = nil
        generationProgress = 0
        
        do {
            let preparedText = applyPronunciationRules(to: trimmed, provider: providerType)
            let output = try await performGeneration(
                text: preparedText,
                providerType: providerType,
                voice: voice,
                format: format,
                shouldAutoplay: true
            )
            currentTranscript = output.transcript
            recordGenerationHistory(
                audioData: output.audioData,
                format: format,
                text: preparedText,
                voice: voice,
                provider: providerType,
                duration: output.duration,
                transcript: output.transcript
            )
        } catch let error as TTSError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to generate speech: \(error.localizedDescription)"
        }

        isGenerating = false
        generationProgress = 0
    }

    private func generateLongFormSpeech(text: String,
                                        providerType: TTSProviderType,
                                        voice: Voice,
                                        format: AudioSettings.AudioFormat,
                                        shouldAutoplay: Bool) async {
        let limit = characterLimit(for: providerType)
        let segments = TextChunker.chunk(text: text, limit: limit)

        guard segments.count > 1 else {
            errorMessage = "Unable to automatically split the text for generation. Please shorten it and try again."
            isGenerating = false
            generationProgress = 0
            return
        }

        isGenerating = true
        errorMessage = nil
        generationProgress = 0

        var outputs: [GenerationOutput] = []
        var preparedSegments: [String] = []

        for (index, segment) in segments.enumerated() {
            let prepared = applyPronunciationRules(to: segment, provider: providerType)
            preparedSegments.append(prepared)

            do {
                let output = try await performGeneration(
                    text: prepared,
                    providerType: providerType,
                    voice: voice,
                    format: format,
                    shouldAutoplay: false,
                    loadIntoPlayer: false
                )
                outputs.append(output)
            } catch let error as TTSError {
                errorMessage = error.localizedDescription
                isGenerating = false
                generationProgress = 0
                return
            } catch {
                errorMessage = "Failed to generate segment \(index + 1): \(error.localizedDescription)"
                isGenerating = false
                generationProgress = 0
                return
            }

            generationProgress = Double(index + 1) / Double(segments.count)
        }

        do {
            let mergeResult = try await mergeAudioSegments(outputs: outputs, targetFormat: format)
            try await audioPlayer.loadAudio(from: mergeResult.data)

            audioData = mergeResult.data
            currentAudioFormat = mergeResult.format
            currentTime = 0
            duration = audioPlayer.duration

            let aggregatedText = preparedSegments.joined(separator: "\n\n")
            let transcript = TranscriptBuilder.makeTranscript(for: aggregatedText, duration: audioPlayer.duration)
            currentTranscript = transcript

            if shouldAutoplay {
                await play()
            } else {
                isPlaying = false
            }

            recordGenerationHistory(
                audioData: mergeResult.data,
                format: mergeResult.format,
                text: aggregatedText,
                voice: voice,
                provider: providerType,
                duration: audioPlayer.duration,
                transcript: transcript
            )

            generationProgress = 1.0
        } catch {
            errorMessage = "Failed to combine audio segments: \(error.localizedDescription)"
        }

        generationProgress = 0
        isGenerating = false
    }

    func startBatchGeneration() {
        let segments = batchSegments(from: inputText)

        guard segments.count > 1 else {
            Task { await generateSpeech() }
            return
        }

        stopPreview()

        let providerType = selectedProvider
        let provider = getProvider(for: providerType)
        let voice = selectedVoice ?? provider.defaultVoice
        let voiceSnapshot = BatchGenerationItem.VoiceSnapshot(id: voice.id, name: voice.name)
        let format = currentFormatForGeneration()

        batchTask?.cancel()
        batchItems = segments.enumerated().map { index, text in
            BatchGenerationItem(
                index: index + 1,
                text: text,
                provider: providerType,
                voice: voiceSnapshot
            )
        }

        batchProgress = 0
        isBatchRunning = true
        errorMessage = nil
        currentTranscript = nil

        batchTask = Task { [weak self] in
            await self?.processBatch(
                segments: segments,
                providerType: providerType,
                voice: voice,
                format: format
            )
        }
    }

    func cancelBatchGeneration() {
        guard batchTask != nil || isBatchRunning else { return }

        batchTask?.cancel()
        batchTask = nil
        isBatchRunning = false
        isGenerating = false
        generationProgress = 0
        batchProgress = 0

        batchItems = batchItems.map { item in
            var updated = item
            switch item.status {
            case .pending, .inProgress:
                updated.status = .failed("Cancelled")
            default:
                break
            }
            return updated
        }

        audioPlayer.stop()
    }
    
    func play() async {
        stopPreview()
        applyPlaybackSettings()
        audioPlayer.play()
        isPlaying = true
    }

    func pause() {
        audioPlayer.pause()
        isPlaying = false
    }

    func stop() {
        stopPreview()
        audioPlayer.stop()
        isPlaying = false
        currentTime = 0
    }
    
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            Task {
                await play()
            }
        }
    }

    func applyPlaybackSpeed(save: Bool = false) {
        let clamped = min(max(playbackSpeed, 0.5), 2.0)
        if abs(playbackSpeed - clamped) > styleComparisonEpsilon {
            playbackSpeed = clamped
        }
        audioPlayer.setPlaybackRate(Float(clamped))

        if save {
            saveSettings()
        }
    }

    func applyPlaybackVolume(save: Bool = false) {
        let clamped = min(max(volume, 0.0), 1.0)
        if abs(volume - clamped) > styleComparisonEpsilon {
            volume = clamped
        }
        audioPlayer.setVolume(Float(clamped))

        if save {
            saveSettings()
        }
    }

    func applyPlaybackSettings(save: Bool = false) {
        applyPlaybackSpeed()
        applyPlaybackVolume()

        if save {
            saveSettings()
        }
    }

    func seek(to time: TimeInterval) {
        audioPlayer.seek(to: time)
        currentTime = time
    }
    
    func skipForward(_ seconds: TimeInterval = 10) {
        let newTime = min(duration, currentTime + seconds)
        seek(to: newTime)
    }
    
    func skipBackward(_ seconds: TimeInterval = 10) {
        let newTime = max(0, currentTime - seconds)
        seek(to: newTime)
    }
    
    func exportAudio() {
        guard audioData != nil else { return }

        guard let panelChoice = configuredSavePanel(
            defaultFormat: currentAudioFormat,
            provider: selectedProvider
        ) else { return }

        let (savePanel, orderedFormats) = panelChoice

        if savePanel.runModal() == .OK, let url = savePanel.url {
            let chosenExtension = url.pathExtension.isEmpty ? currentAudioFormat.fileExtension : url.pathExtension
            let chosenFormat = AudioSettings.AudioFormat(fileExtension: chosenExtension) ?? orderedFormats.first ?? currentAudioFormat

            Task { [weak self] in
                await self?.performExport(to: url, format: chosenFormat)
            }
        }
    }

    func exportTranscript(format: TranscriptFormat) {
        guard let transcript = currentTranscript else { return }
        exportTranscriptBundle(transcript, format: format, suggestedName: "transcript")
    }

    func exportTranscript(for item: GenerationHistoryItem, format: TranscriptFormat) {
        guard let transcript = item.transcript else { return }
        let baseName = item.voice.name.replacingOccurrences(of: " ", with: "-").lowercased()
        exportTranscriptBundle(transcript, format: format, suggestedName: "transcript-\(baseName)")
    }

    func addPronunciationRule(_ rule: PronunciationRule) {
        pronunciationRules.insert(rule, at: 0)
        persistPronunciationRules()
    }

    func updatePronunciationRule(_ rule: PronunciationRule) {
        if let index = pronunciationRules.firstIndex(where: { $0.id == rule.id }) {
            pronunciationRules[index] = rule
            persistPronunciationRules()
        }
    }

    func removePronunciationRule(_ rule: PronunciationRule) {
        pronunciationRules.removeAll { $0.id == rule.id }
        persistPronunciationRules()
    }

    func importText(from urlString: String, autoGenerate: Bool) async {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            errorMessage = "Enter a URL to import content."
            return
        }

        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme) else {
            errorMessage = "URL must start with http:// or https://."
            return
        }

        isImportingFromURL = true
        errorMessage = nil
        defer { isImportingFromURL = false }

        do {
            let rawText = try await urlContentLoader.fetchPlainText(from: url)
            let normalized = normalizeImportedText(rawText)

            guard !normalized.isEmpty else {
                errorMessage = "Unable to find readable text at that address."
                articleSummary = nil
                return
            }

            let preparedText: String
            if normalized.count > maxTextLength {
                preparedText = String(normalized.prefix(maxTextLength))
                errorMessage = "Imported text exceeded 5,000 characters. The content was truncated."
            } else {
                preparedText = normalized
            }

            inputText = preparedText

            articleSummaryTask?.cancel()
            articleSummary = ArticleImportSummary.make(sourceURL: url, originalText: preparedText)
            articleSummaryError = nil

            if canSummarizeImports {
                let summarySource = preparedText
                articleSummaryTask = Task { @MainActor [weak self] in
                    guard let self else { return }
                    await self.generateArticleSummary(for: summarySource, url: url)
                    self.articleSummaryTask = nil
                }
            } else {
                articleSummaryError = "Add an OpenAI API key to enable Smart Import summaries."
            }

            if autoGenerate {
                await generateSpeech()
            }
        } catch {
            articleSummary = nil
            articleSummaryError = nil
            if let urlError = error as? URLError {
                switch urlError.code {
                case .notConnectedToInternet:
                    errorMessage = "No internet connection. Check your network and try again."
                case .timedOut:
                    errorMessage = "The request timed out. Try again in a moment."
                default:
                    errorMessage = "Failed to load the page. (\(urlError.code.rawValue))"
                }
            } else {
                errorMessage = "Failed to import content: \(error.localizedDescription)"
            }
        }

    }

    func replaceEditorWithCondensedImport() {
        guard let condensed = condensedImportPreview?.trimmingCharacters(in: .whitespacesAndNewlines),
              !condensed.isEmpty else { return }

        if condensed.count > maxTextLength {
            inputText = String(condensed.prefix(maxTextLength))
            errorMessage = "Condensed article exceeded 5,000 characters and was truncated."
        } else {
            inputText = condensed
        }
    }

    func insertSummaryIntoEditor() {
        guard let summary = articleSummaryPreview?.trimmingCharacters(in: .whitespacesAndNewlines),
              !summary.isEmpty else { return }

        if inputText.isEmpty {
            inputText = summary
            return
        }

        var builder = inputText
        if !builder.hasSuffix("\n") {
            builder += "\n\n"
        } else if !builder.hasSuffix("\n\n") {
            builder += "\n"
        }

        let composed = builder + summary

        guard composed.count <= maxTextLength else {
            errorMessage = "Summary would exceed the 5,000 character limit."
            return
        }

        inputText = composed
    }

    func speakSummaryOfImportedArticle() async {
        guard let summary = articleSummaryPreview?.trimmingCharacters(in: .whitespacesAndNewlines),
              !summary.isEmpty else { return }

        stopPreview()

        let providerType = selectedProvider
        let provider = getProvider(for: providerType)
        let voice = selectedVoice ?? provider.defaultVoice
        let format = currentFormatForGeneration()

        isGenerating = true
        errorMessage = nil
        generationProgress = 0

        do {
            let prepared = applyPronunciationRules(to: summary, provider: providerType)
            let output = try await performGeneration(
                text: prepared,
                providerType: providerType,
                voice: voice,
                format: format,
                shouldAutoplay: true
            )

            recordGenerationHistory(
                audioData: output.audioData,
                format: format,
                text: prepared,
                voice: voice,
                provider: providerType,
                duration: output.duration,
                transcript: output.transcript
            )
        } catch let error as TTSError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to generate summary audio: \(error.localizedDescription)"
        }

        isGenerating = false
        generationProgress = 0
    }

    func setNotificationsEnabled(_ enabled: Bool) {
        guard enabled != notificationsEnabled else { return }

        guard let notificationCenter else {
            notificationsEnabled = false
            saveSettings()
            return
        }

        if enabled {
            notificationCenter.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
                guard let self = self else { return }
                Task { @MainActor in
                    self.notificationsEnabled = granted
                    self.saveSettings()
                }
            }
        } else {
            notificationsEnabled = false
            saveSettings()
        }
    }

    func playHistoryItem(_ item: GenerationHistoryItem) async {
        do {
            try await loadHistoryItem(item, shouldAutoplay: true)
        } catch {
            errorMessage = "Failed to play saved audio: \(error.localizedDescription)"
        }
    }

    func exportHistoryItem(_ item: GenerationHistoryItem) {
        let savePanel = NSSavePanel()
        if let contentType = item.format.contentType {
            savePanel.allowedContentTypes = [contentType]
            savePanel.allowsOtherFileTypes = false
        }
        savePanel.canCreateDirectories = true
        savePanel.nameFieldStringValue = "speech.\(item.format.fileExtension)"
        savePanel.title = "Export Saved Audio"
        savePanel.message = "Choose where to save the audio file"

        if savePanel.runModal() == .OK, let url = savePanel.url {
            var destinationURL = url
            let expectedExtension = item.format.fileExtension

            if destinationURL.pathExtension.lowercased() != expectedExtension {
                destinationURL = url.deletingPathExtension().appendingPathExtension(expectedExtension)
            }

            do {
                try item.audioData.write(to: destinationURL, options: .atomic)
            } catch {
                errorMessage = "Failed to save audio: \(error.localizedDescription)"
            }
        }
    }

    func removeHistoryItem(_ item: GenerationHistoryItem) {
        recentGenerations.removeAll { $0.id == item.id }
    }

    func clearHistory() {
        recentGenerations.removeAll()
    }

    func saveCurrentTextAsSnippet(named name: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedContent.isEmpty else { return }

        textSnippets.removeAll { $0.name.caseInsensitiveCompare(trimmedName) == .orderedSame }

        let snippet = TextSnippet(name: trimmedName, content: trimmedContent)
        textSnippets.insert(snippet, at: 0)
        persistSnippets()
    }

    func insertSnippet(_ snippet: TextSnippet, mode: SnippetInsertMode) {
        switch mode {
        case .replace:
            inputText = snippet.content
        case .append:
            if inputText.isEmpty {
                inputText = snippet.content
            } else {
                inputText += "\n\n" + snippet.content
            }
        }
    }

    func removeSnippet(_ snippet: TextSnippet) {
        textSnippets.removeAll { $0.id == snippet.id }
        persistSnippets()
    }

    private func performExport(to url: URL, format: AudioSettings.AudioFormat) async {
        do {
            let data = try await dataForExport(using: format)
            var destinationURL = url
            let expectedExtension = format.fileExtension

            if destinationURL.pathExtension.lowercased() != expectedExtension {
                destinationURL = url.deletingPathExtension().appendingPathExtension(expectedExtension)
            }

            try data.write(to: destinationURL, options: .atomic)
        } catch let error as TTSError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to save audio: \(error.localizedDescription)"
        }
    }

    private func dataForExport(using format: AudioSettings.AudioFormat) async throws -> Data {
        if format == currentAudioFormat, let data = audioData {
            return data
        }

        guard !inputText.isEmpty else {
            throw TTSError.apiError("No text available to regenerate audio for export.")
        }

        let provider = getCurrentProvider()
        guard provider.hasValidAPIKey() else {
            throw TTSError.invalidAPIKey
        }

        let voice = selectedVoice ?? provider.defaultVoice
        let settings = AudioSettings(
            speed: playbackSpeed,
            volume: volume,
            format: format,
            sampleRate: sampleRate(for: format),
            styleValues: styleValues(for: selectedProvider)
        )

        let previousAudioData = audioData
        let previousFormat = currentAudioFormat

        isGenerating = true
        generationProgress = 0.2
        errorMessage = nil

        defer {
            isGenerating = false
            generationProgress = 0
        }

        do {
            let newData = try await provider.synthesizeSpeech(
                text: inputText,
                voice: voice,
                settings: settings
            )

            generationProgress = 0.9
            try await audioPlayer.loadAudio(from: newData)

            audioData = newData
            currentAudioFormat = format

            if selectedFormat != format {
                selectedFormat = format
            }

            return newData
        } catch let error as TTSError {
            audioData = previousAudioData
            currentAudioFormat = previousFormat

            if let previousAudioData {
                try? await audioPlayer.loadAudio(from: previousAudioData)
            } else {
                stop()
            }

            throw error
        } catch {
            audioData = previousAudioData
            currentAudioFormat = previousFormat

            if let previousAudioData {
                try? await audioPlayer.loadAudio(from: previousAudioData)
            } else {
                stop()
            }

            throw TTSError.apiError("Failed to regenerate audio: \(error.localizedDescription)")
        }
    }
    
    func clearText() {
        cancelBatchGeneration()
        inputText = ""
        stop()
        clearGeneratedAudio()
        batchItems.removeAll()
        batchProgress = 0
        translationResult = nil
        articleSummaryTask?.cancel()
        articleSummaryTask = nil
        articleSummary = nil
        articleSummaryError = nil
        isSummarizingArticle = false
    }
    
    func updateAvailableVoices() {
        let provider = getCurrentProvider()
        availableVoices = provider.availableVoices
        if let previewID = previewingVoiceID,
           !availableVoices.contains(where: { $0.id == previewID }) {
            stopPreview()
        }
        refreshStyleControls(for: selectedProvider)
        ensureFormatSupportedForSelectedProvider()

        // Select default voice if none selected
        if selectedVoice == nil || selectedVoice?.provider.rawValue != selectedProvider.rawValue {
            selectedVoice = provider.defaultVoice
        }
    }
    
    func saveAPIKey(_ key: String, for provider: TTSProviderType) {
        guard provider != .tightAss else { return }
        keychainManager.saveAPIKey(key, for: provider.rawValue)
        
        // Update the service with new key
        switch provider {
        case .elevenLabs:
            elevenLabs.updateAPIKey(key)
        case .openAI:
            openAI.updateAPIKey(key)
        case .google:
            googleTTS.updateAPIKey(key)
        case .tightAss:
            break
        }
    }
    
    func getAPIKey(for provider: TTSProviderType) -> String? {
        guard provider != .tightAss else { return nil }
        return keychainManager.getAPIKey(for: provider.rawValue)
    }
    
    // MARK: - Private Methods
    private func getCurrentProvider() -> any TTSProvider {
        getProvider(for: selectedProvider)
    }
    
    private func setupAudioPlayer() {
        audioPlayer.$currentTime
            .receive(on: DispatchQueue.main)
            .assign(to: &$currentTime)

        audioPlayer.$duration
            .receive(on: DispatchQueue.main)
            .assign(to: &$duration)

        audioPlayer.$isPlaying
            .receive(on: DispatchQueue.main)
            .assign(to: &$isPlaying)

        // Handle loop mode
        audioPlayer.didFinishPlaying = { [weak self] in
            guard let self = self else { return }
            if self.isLoopEnabled {
                Task {
                    await self.play()
                }
            }
        }
    }

    private func setupPreviewPlayer() {
        previewPlayer.$isPlaying
            .receive(on: DispatchQueue.main)
            .sink { [weak self] playing in
                guard let self else { return }
                self.isPreviewing = playing && self.previewingVoiceID != nil
            }
            .store(in: &cancellables)

        previewPlayer.$isBuffering
            .receive(on: DispatchQueue.main)
            .sink { [weak self] buffering in
                guard let self else { return }
                if self.previewingVoiceID == nil {
                    self.isPreviewLoading = false
                } else {
                    self.isPreviewLoading = buffering
                }
            }
            .store(in: &cancellables)

        previewPlayer.$error
            .compactMap { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] error in
                self?.handlePreviewError(error, voiceName: nil)
            }
            .store(in: &cancellables)

        previewPlayer.didFinishPlaying = { [weak self] in
            guard let self else { return }
            self.resetPreviewState()
        }
    }
    
    private func loadSavedSettings() {
        // Load from UserDefaults
        if let savedProvider = UserDefaults.standard.string(forKey: "selectedProvider") {
            selectedProvider = TTSProviderType(rawValue: savedProvider) ?? .openAI
        }

        playbackSpeed = UserDefaults.standard.double(forKey: "playbackSpeed")
        if playbackSpeed == 0 { playbackSpeed = 1.0 }
        
        volume = UserDefaults.standard.double(forKey: "volume")
        if volume == 0 { volume = 0.75 }
        
        isLoopEnabled = UserDefaults.standard.bool(forKey: "loopEnabled")
        isMinimalistMode = UserDefaults.standard.bool(forKey: "isMinimalistMode")
        if let savedFormat = UserDefaults.standard.string(forKey: "audioFormat"),
           let format = AudioSettings.AudioFormat(rawValue: savedFormat) {
            selectedFormat = format
        }

        if let appearanceRaw = UserDefaults.standard.string(forKey: "appearancePreference"),
           let storedPreference = AppearancePreference(rawValue: appearanceRaw) {
            appearancePreference = storedPreference
        }

        if let styleData = UserDefaults.standard.data(forKey: styleValuesKey) {
            do {
                let decoded = try JSONDecoder().decode([String: [String: Double]].self, from: styleData)
                cachedStyleValues = decoded.reduce(into: [:]) { partialResult, element in
                    guard let provider = TTSProviderType(rawValue: element.key) else { return }
                    partialResult[provider] = element.value
                }
            } catch {
                cachedStyleValues = [:]
            }
        }

        if let snippetsData = UserDefaults.standard.data(forKey: snippetsKey) {
            do {
                let decoded = try JSONDecoder().decode([TextSnippet].self, from: snippetsData)
                textSnippets = decoded
            } catch {
                textSnippets = []
            }
        }

        if let pronunciationData = UserDefaults.standard.data(forKey: pronunciationKey) {
            do {
                let decoded = try JSONDecoder().decode([PronunciationRule].self, from: pronunciationData)
                pronunciationRules = decoded
            } catch {
                pronunciationRules = []
            }
        }

        notificationsEnabled = UserDefaults.standard.bool(forKey: notificationsKey)

        if notificationCenter == nil && notificationsEnabled {
            notificationsEnabled = false
            saveSettings()
        }

        notificationCenter?.getNotificationSettings { [weak self] settings in
            guard let self = self else { return }
            Task { @MainActor in
                if settings.authorizationStatus != .authorized && self.notificationsEnabled {
                    self.notificationsEnabled = false
                    self.saveSettings()
                }
            }
        }

        applyPlaybackSettings()

        ensureFormatSupportedForSelectedProvider()

        // Load API keys from keychain
        if let elevenLabsKey = getAPIKey(for: .elevenLabs) {
            elevenLabs.updateAPIKey(elevenLabsKey)
        }
        if let openAIKey = getAPIKey(for: .openAI) {
            openAI.updateAPIKey(openAIKey)
        }
        if let googleKey = getAPIKey(for: .google) {
            googleTTS.updateAPIKey(googleKey)
        }
    }
    
    func saveSettings() {
        UserDefaults.standard.set(selectedProvider.rawValue, forKey: "selectedProvider")
        UserDefaults.standard.set(playbackSpeed, forKey: "playbackSpeed")
        UserDefaults.standard.set(volume, forKey: "volume")
        UserDefaults.standard.set(isLoopEnabled, forKey: "loopEnabled")
        UserDefaults.standard.set(isMinimalistMode, forKey: "isMinimalistMode")
        UserDefaults.standard.set(selectedFormat.rawValue, forKey: "audioFormat")
        UserDefaults.standard.set(appearancePreference.rawValue, forKey: "appearancePreference")
    }

    deinit {
        batchTask?.cancel()
        previewTask?.cancel()
        articleSummaryTask?.cancel()
    }
}

extension TTSViewModel {
    func recordGenerationHistory(audioData: Data,
                                 format: AudioSettings.AudioFormat,
                                 text: String,
                                 voice: Voice,
                                 provider: TTSProviderType,
                                 duration: TimeInterval,
                                 transcript: TranscriptBundle?) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        recentGenerations.removeAll {
            $0.matches(provider: provider, voiceID: voice.id, text: trimmedText)
        }

        let item = GenerationHistoryItem(
            provider: provider,
            voice: .init(id: voice.id, name: voice.name),
            format: format,
            text: trimmedText,
            audioData: audioData,
            duration: duration,
            transcript: transcript
        )

        recentGenerations.insert(item, at: 0)

        if recentGenerations.count > maxHistoryItems {
            recentGenerations.removeLast(recentGenerations.count - maxHistoryItems)
        }
    }

    func persistSnippets() {
        do {
            let data = try JSONEncoder().encode(textSnippets)
            UserDefaults.standard.set(data, forKey: snippetsKey)
        } catch {
            // If persistence fails, keep in-memory state for this session
        }
    }

    func persistPronunciationRules() {
        do {
            let data = try JSONEncoder().encode(pronunciationRules)
            UserDefaults.standard.set(data, forKey: pronunciationKey)
        } catch {
            // If persistence fails, keep the in-memory rules this session
        }
    }

    func batchSegments(from text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        var segments: [String] = []
        var currentLines: [String] = []

        func flushCurrentSegment() {
            let segment = currentLines
                .joined(separator: "\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !segment.isEmpty {
                segments.append(segment)
            }
            currentLines.removeAll(keepingCapacity: true)
        }

        for line in lines {
            if line.trimmingCharacters(in: .whitespaces) == "---" {
                flushCurrentSegment()
            } else {
                currentLines.append(line)
            }
        }

        flushCurrentSegment()
        return segments
    }

    func applyPronunciationRules(to text: String, provider: TTSProviderType) -> String {
        pronunciationRules.reduce(text) { current, rule in
            guard rule.applies(to: provider) else { return current }
            return replaceOccurrences(in: current, target: rule.displayText, replacement: rule.replacementText)
        }
    }

    private func replaceOccurrences(in text: String, target: String, replacement: String) -> String {
        guard !target.isEmpty else { return text }
        var result = text
        var searchRange = result.startIndex..<result.endIndex

        while let range = result.range(of: target, options: [.caseInsensitive], range: searchRange) {
            result.replaceSubrange(range, with: replacement)
            if replacement.isEmpty {
                searchRange = range.lowerBound..<result.endIndex
            } else {
                let nextIndex = result.index(range.lowerBound, offsetBy: replacement.count)
                searchRange = nextIndex..<result.endIndex
            }
        }

        return result
    }

    func sendBatchCompletionNotification(successCount: Int, failureCount: Int) {
        guard notificationsEnabled, successCount + failureCount > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Batch Generation Complete"

        if failureCount == 0 {
            content.body = "All \(successCount) segment(s) generated successfully."
        } else if successCount == 0 {
            content.body = "Batch generation failed for all \(failureCount) segment(s)."
        } else {
            content.body = "\(successCount) succeeded • \(failureCount) failed."
        }

        let request = UNNotificationRequest(
            identifier: "batch-complete-\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )

        notificationCenter?.add(request)
    }
}

private extension TTSViewModel {
    func loadPreviewAudio(for voice: Voice, providerType: TTSProviderType) async throws -> Data {
        if let previewURLString = voice.previewURL,
           let url = URL(string: previewURLString) {
            return try await previewDataLoader(url)
        }

        var settings = previewAudioSettings(for: providerType)
        let resolvedStyleValues = styleValues(for: providerType)
        settings.styleValues = resolvedStyleValues

        if let generator = previewAudioGenerator {
            return try await generator(voice, providerType, settings, resolvedStyleValues)
        }

        let provider = getProvider(for: providerType)

        if providerType != .tightAss && !provider.hasValidAPIKey() {
            throw VoicePreviewError.missingAPIKey(providerName: providerType.displayName)
        }

        return try await provider.synthesizeSpeech(
            text: previewSampleText(for: voice, providerType: providerType),
            voice: voice,
            settings: settings
        )
    }

    func resetPreviewState() {
        previewTask = nil
        previewingVoiceID = nil
        previewVoiceName = nil
        isPreviewLoading = false
        isPreviewing = false
    }

    func handlePreviewError(_ error: Error, voiceName: String?) {
        let resolvedName = voiceName ?? previewVoiceName ?? "this voice"
        errorMessage = "Unable to preview \(resolvedName): \(error.localizedDescription)"
        resetPreviewState()
    }

    func previewAudioSettings(for providerType: TTSProviderType) -> AudioSettings {
        var settings = AudioSettings()
        settings.speed = min(max(playbackSpeed, 0.5), 2.0)
        settings.pitch = 1.0
        settings.volume = min(max(volume, 0.0), 1.0)
        settings.sampleRate = providerType == .google ? 24_000 : 22_050
        settings.format = providerType == .tightAss ? .wav : .mp3
        return settings
    }

    func previewSampleText(for voice: Voice, providerType: TTSProviderType) -> String {
        "Hello, this is \(voice.name) with \(providerType.displayName). Here's a quick preview."
    }

    func normalizeImportedText(_ text: String) -> String {
        TextSanitizer.cleanImportedText(text)
    }

    func generateArticleSummary(for text: String, url: URL) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard canSummarizeImports else { return }

        isSummarizingArticle = true
        articleSummaryError = nil

        defer { isSummarizingArticle = false }

        do {
            let result = try await summarizationService.summarize(text: trimmed, sourceURL: url)
            try Task.checkCancellation()
            applySummarizationResult(result)
        } catch is CancellationError {
            // Task cancelled; silently exit
        } catch let error as TTSError {
            articleSummaryError = error.localizedDescription
        } catch {
            articleSummaryError = "Unable to summarize article: \(error.localizedDescription)"
        }
    }

    func applySummarizationResult(_ result: SummarizationResult) {
        guard var current = articleSummary else { return }

        let condensed = result.condensedArticle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !condensed.isEmpty {
            current.condensedText = condensed
            current.condensedWordCount = ArticleImportSummary.wordCount(in: condensed)
        }

        let summaryText = result.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !summaryText.isEmpty {
            current.summaryText = summaryText
        }

        current.lastUpdated = Date()
        articleSummary = current
        articleSummaryError = nil
    }

    func characterLimit(for provider: TTSProviderType) -> Int {
        switch provider {
        case .openAI:
            return 4096
        default:
            return maxTextLength
        }
    }

    func mergeAudioSegments(outputs: [GenerationOutput], targetFormat: AudioSettings.AudioFormat) async throws -> (data: Data, format: AudioSettings.AudioFormat) {
        guard !outputs.isEmpty else {
            throw TTSError.apiError("No audio segments to merge.")
        }

        let tempDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)

        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        var assets: [AVURLAsset] = []
        for (index, output) in outputs.enumerated() {
            let segmentURL = tempDirectory.appendingPathComponent("segment_\(index).\(targetFormat.fileExtension)")
            try output.audioData.write(to: segmentURL)
            let asset = AVURLAsset(url: segmentURL)
            assets.append(asset)
        }

        let composition = AVMutableComposition()
        guard let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw TTSError.apiError("Unable to prepare audio composition.")
        }

        var cursor = CMTime.zero
        for asset in assets {
            let assetTracks = try await asset.loadTracks(withMediaType: .audio)
            guard let assetTrack = assetTracks.first else { continue }
            let duration = try await asset.load(.duration)
            let timeRange = CMTimeRange(start: .zero, duration: duration)
            try track.insertTimeRange(timeRange, of: assetTrack, at: cursor)
            cursor = cursor + duration
        }

        let exportFormat: AVFileType
        let exportPreset: String
        let finalFormat: AudioSettings.AudioFormat

        if targetFormat == .wav {
            exportFormat = .wav
            exportPreset = AVAssetExportPresetPassthrough
            finalFormat = .wav
        } else {
            exportFormat = .m4a
            exportPreset = AVAssetExportPresetAppleM4A
            finalFormat = .aac
        }

        let outputURL = tempDirectory.appendingPathComponent("merged.\(finalFormat.fileExtension)")
        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        guard let exporter = AVAssetExportSession(asset: composition, presetName: exportPreset) else {
            throw TTSError.apiError("Unable to export combined audio.")
        }

        exporter.outputURL = outputURL
        exporter.outputFileType = exportFormat

        exporter.exportAsynchronously {}

        exportLoop: while true {
            switch exporter.status {
            case .completed:
                break exportLoop
            case .failed, .cancelled:
                let error = exporter.error ?? TTSError.apiError("Audio export failed")
                throw error
            case .unknown, .waiting, .exporting:
                try await Task.sleep(nanoseconds: 50_000_000)
            @unknown default:
                try await Task.sleep(nanoseconds: 50_000_000)
            }
        }

        let data = try Data(contentsOf: outputURL)
        return (data, finalFormat)
    }
}

private enum VoicePreviewError: LocalizedError {
    case missingAPIKey(providerName: String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey(let providerName):
            return "\(providerName) API key is required to preview this voice."
        }
    }
}

// MARK: - Provider Type
enum TTSProviderType: String, CaseIterable {
    case elevenLabs = "ElevenLabs"
    case openAI = "OpenAI"
    case google = "Google"
    case tightAss = "Tight Ass Mode"
    
    var displayName: String {
        return self.rawValue
    }
    
    var icon: String {
        switch self {
        case .elevenLabs:
            return "waveform"
        case .openAI:
            return "cpu"
        case .google:
            return "cloud"
        case .tightAss:
            return "internaldrive"
        }
    }
}

// MARK: - Format Helpers
private extension TTSViewModel {
    func getProvider(for type: TTSProviderType) -> any TTSProvider {
        switch type {
        case .elevenLabs:
            return elevenLabs
        case .openAI:
            return openAI
        case .google:
            return googleTTS
        case .tightAss:
            return localTTS
        }
    }

    func configuredSavePanel(defaultFormat: AudioSettings.AudioFormat,
                             provider: TTSProviderType) -> (NSSavePanel, [AudioSettings.AudioFormat])? {
        let savePanel = NSSavePanel()
        let providerFormats = supportedFormats(for: provider)
        let orderedFormats: [AudioSettings.AudioFormat]

        if let currentIndex = providerFormats.firstIndex(of: defaultFormat) {
            var formats = providerFormats
            formats.swapAt(0, currentIndex)
            orderedFormats = formats
        } else {
            orderedFormats = providerFormats
        }

        let contentTypes = orderedFormats.compactMap { $0.contentType }
        if !contentTypes.isEmpty {
            savePanel.allowedContentTypes = contentTypes
            savePanel.allowsOtherFileTypes = false
        }

        savePanel.canCreateDirectories = true
        savePanel.nameFieldStringValue = "speech.\(defaultFormat.fileExtension)"
        savePanel.title = "Export Audio"
        savePanel.message = "Choose where to save the audio file"

        return (savePanel, orderedFormats)
    }

    func exportTranscriptBundle(_ transcript: TranscriptBundle,
                                format: TranscriptFormat,
                                suggestedName: String) {
        let savePanel = NSSavePanel()
        if let contentType = format.contentType {
            savePanel.allowedContentTypes = [contentType]
            savePanel.allowsOtherFileTypes = false
        }
        savePanel.canCreateDirectories = true
        savePanel.nameFieldStringValue = "\(suggestedName).\(format.fileExtension)"
        savePanel.title = "Export Transcript"
        savePanel.message = "Choose where to save the transcript file"

        if savePanel.runModal() == .OK, let url = savePanel.url {
            var destination = url
            let expectedExtension = format.fileExtension
            if destination.pathExtension.lowercased() != expectedExtension {
                destination = url.deletingPathExtension().appendingPathExtension(expectedExtension)
            }

            let content: String = {
                switch format {
                case .srt:
                    return transcript.srt
                case .vtt:
                    return transcript.vtt
                }
            }()

            do {
                try content.data(using: .utf8)?.write(to: destination, options: .atomic)
            } catch {
                errorMessage = "Failed to save transcript: \(error.localizedDescription)"
            }
        }
    }

    @MainActor
    func processBatch(segments: [String],
                      providerType: TTSProviderType,
                      voice: Voice,
                      format: AudioSettings.AudioFormat) async {
        var successCount = 0
        var failureCount = 0

        for index in batchItems.indices {
            if Task.isCancelled { break }

            let segmentText = segments[index]
            let trimmedSegment = segmentText.trimmingCharacters(in: .whitespacesAndNewlines)
            batchItems[index].status = .inProgress
            isGenerating = true
            generationProgress = 0

            if trimmedSegment.isEmpty {
                batchItems[index].status = .failed("Segment \(index + 1) is empty.")
                batchProgress = Double(index + 1) / Double(batchItems.count)
                isGenerating = false
                generationProgress = 0
                failureCount += 1
                continue
            }

            do {
                let preparedText = applyPronunciationRules(to: trimmedSegment, provider: providerType)
                let output = try await performGeneration(
                    text: preparedText,
                    providerType: providerType,
                    voice: voice,
                    format: format,
                    shouldAutoplay: false
                )

                batchItems[index].status = .completed
                recordGenerationHistory(
                    audioData: output.audioData,
                    format: format,
                    text: preparedText,
                    voice: voice,
                    provider: providerType,
                    duration: output.duration,
                    transcript: output.transcript
                )
                currentTranscript = output.transcript
                successCount += 1
            } catch is CancellationError {
                batchItems[index].status = .failed("Cancelled")
                isGenerating = false
                generationProgress = 0
                break
            } catch let error as TTSError {
                batchItems[index].status = .failed(error.localizedDescription)
                failureCount += 1
            } catch {
                batchItems[index].status = .failed(error.localizedDescription)
                failureCount += 1
            }

            batchProgress = Double(index + 1) / Double(batchItems.count)
            isGenerating = false
            generationProgress = 0
        }

        if Task.isCancelled {
            isBatchRunning = false
            batchTask = nil
            return
        }

        batchProgress = batchItems.isEmpty ? 0 : 1
        isGenerating = false
        generationProgress = 0
        isBatchRunning = false
        batchTask = nil
        audioPlayer.stop()

        if !Task.isCancelled {
            sendBatchCompletionNotification(successCount: successCount, failureCount: failureCount)
        }
    }

    func performGeneration(text: String,
                           providerType: TTSProviderType,
                           voice: Voice,
                           format: AudioSettings.AudioFormat,
                           shouldAutoplay: Bool,
                           loadIntoPlayer: Bool = true) async throws -> GenerationOutput {
        let provider = getProvider(for: providerType)

        guard provider.hasValidAPIKey() else {
            throw TTSError.invalidAPIKey
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw TTSError.apiError("Segment text is empty.")
        }

        if trimmed.count > maxTextLength {
            throw TTSError.textTooLong(maxTextLength)
        }

        let settings = AudioSettings(
            speed: playbackSpeed,
            volume: volume,
            format: format,
            sampleRate: sampleRate(for: format),
            styleValues: styleValues(for: providerType)
        )

        if loadIntoPlayer {
            generationProgress = 0.3
        }

        let data = try await provider.synthesizeSpeech(
            text: trimmed,
            voice: voice,
            settings: settings
        )

        let duration: TimeInterval
        if loadIntoPlayer {
            generationProgress = 0.7
            try await audioPlayer.loadAudio(from: data)
            applyPlaybackSettings()
            audioData = data
            currentAudioFormat = format
            duration = audioPlayer.duration
        } else {
            let tempPlayer = try AVAudioPlayer(data: data)
            duration = tempPlayer.duration
        }

        let transcript = TranscriptBuilder.makeTranscript(for: trimmed, duration: duration)
        if loadIntoPlayer {
            currentTranscript = transcript
            generationProgress = 1.0

            if shouldAutoplay {
                await play()
            } else {
                isPlaying = false
            }
        }

        return GenerationOutput(audioData: data, transcript: transcript, duration: duration)
    }

    func loadHistoryItem(_ item: GenerationHistoryItem, shouldAutoplay: Bool) async throws {
        stopPreview()

        let previousProvider = selectedProvider
        let previousVoice = selectedVoice
        let previousFormat = selectedFormat
        let previousAudioData = audioData

        selectedProvider = item.provider
        updateAvailableVoices()

        if let matchedVoice = availableVoices.first(where: { $0.id == item.voice.id }) {
            selectedVoice = matchedVoice
        } else {
            selectedVoice = nil
        }

        selectedFormat = item.format

        do {
            try await audioPlayer.loadAudio(from: item.audioData)
            applyPlaybackSettings()
            audioData = item.audioData
            currentAudioFormat = item.format
            currentTranscript = item.transcript

            if shouldAutoplay {
                await play()
            } else {
                isPlaying = false
            }
        } catch {
            selectedProvider = previousProvider
            selectedVoice = previousVoice
            selectedFormat = previousFormat
            audioData = previousAudioData
            throw error
        }
    }

    func currentFormatForGeneration() -> AudioSettings.AudioFormat {
        let formats = supportedFormats(for: selectedProvider)
        guard formats.contains(selectedFormat) else {
            return formats.first ?? .mp3
        }
        return selectedFormat
    }

    func supportedFormats(for provider: TTSProviderType) -> [AudioSettings.AudioFormat] {
        switch provider {
        case .elevenLabs:
            return [.mp3]
        case .openAI:
            return [.mp3, .wav, .aac, .flac]
        case .google:
            return [.mp3, .wav]
        case .tightAss:
            return [.wav]
        }
    }

    func sampleRate(for format: AudioSettings.AudioFormat) -> Int {
        switch format {
        case .wav, .flac:
            return 44100
        case .aac:
            return 48000
        case .mp3:
            return 44100
        case .opus:
            return 48000
        }
    }

    func ensureFormatSupportedForSelectedProvider() {
        let formats = supportedFormats(for: selectedProvider)
        if !formats.contains(selectedFormat) {
            selectedFormat = formats.first ?? .mp3
        }
    }

    func clearGeneratedAudio() {
        audioData = nil
        currentAudioFormat = selectedFormat
        currentTranscript = nil
        stop()
    }

}
