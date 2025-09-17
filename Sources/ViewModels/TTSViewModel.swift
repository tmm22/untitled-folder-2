import SwiftUI
import AVFoundation
import Combine
import UniformTypeIdentifiers

@MainActor
class TTSViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var inputText: String = ""
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
    @Published var isLoopEnabled: Bool = false
    @Published var generationProgress: Double = 0
    @Published var isMinimalistMode: Bool = false
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
    private let audioPlayer = AudioPlayerService()
    private let elevenLabs = ElevenLabsService()
    private let openAI = OpenAIService()
    private let googleTTS = GoogleTTSService()
    private let keychainManager = KeychainManager()

    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private(set) var audioData: Data?  // Make it readable but not writable from outside
    private(set) var currentAudioFormat: AudioSettings.AudioFormat = .mp3
    private let maxTextLength = 5000

    var supportedFormats: [AudioSettings.AudioFormat] {
        supportedFormats(for: selectedProvider)
    }

    var exportFormatHelpText: String? {
        switch selectedProvider {
        case .elevenLabs:
            return "ElevenLabs currently exports MP3 files only."
        case .google:
            return "Google Cloud supports MP3 or WAV output."
        case .openAI:
            return "OpenAI offers MP3, WAV, AAC, and FLAC options."
        }
    }
    
    // MARK: - Initialization
    init() {
        setupAudioPlayer()
        loadSavedSettings()
        updateAvailableVoices()
    }
    
    // MARK: - Public Methods
    func generateSpeech() async {
        guard !inputText.isEmpty else {
            errorMessage = "Please enter some text"
            return
        }
        
        guard inputText.count <= maxTextLength else {
            errorMessage = "Text exceeds maximum length of \(maxTextLength) characters"
            return
        }
        
        isGenerating = true
        errorMessage = nil
        generationProgress = 0
        
        do {
            let provider = getCurrentProvider()
            
            // Check API key
            guard provider.hasValidAPIKey() else {
                throw TTSError.invalidAPIKey
            }
            
            let targetFormat = currentFormatForGeneration()
            let settings = AudioSettings(
                speed: playbackSpeed,
                volume: volume,
                format: targetFormat,
                sampleRate: sampleRate(for: targetFormat)
            )
            
            // Update progress
            generationProgress = 0.3
            
            audioData = try await provider.synthesizeSpeech(
                text: inputText,
                voice: selectedVoice ?? provider.defaultVoice,
                settings: settings
            )
            
            generationProgress = 0.7
            
            if let audioData = audioData {
                try await audioPlayer.loadAudio(from: audioData)
                currentAudioFormat = targetFormat
                generationProgress = 1.0
                await play()
            }
        } catch let error as TTSError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to generate speech: \(error.localizedDescription)"
        }
        
        isGenerating = false
        generationProgress = 0
    }
    
    func play() async {
        audioPlayer.play()
        isPlaying = true
    }
    
    func pause() {
        audioPlayer.pause()
        isPlaying = false
    }
    
    func stop() {
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
        guard let audioData = audioData else { return }

        let savePanel = NSSavePanel()
        if let contentType = selectedFormat.contentType {
            savePanel.allowedContentTypes = [contentType]
        }
        savePanel.nameFieldStringValue = "speech.\(selectedFormat.fileExtension)"
        savePanel.title = "Export Audio"
        savePanel.message = "Choose where to save the audio file"

        if savePanel.runModal() == .OK {
            if let url = savePanel.url {
                do {
                    try audioData.write(to: url)
                } catch {
                    errorMessage = "Failed to save audio: \(error.localizedDescription)"
                }
            }
        }
    }
    
    func clearText() {
        inputText = ""
        stop()
        clearGeneratedAudio()
    }
    
    func updateAvailableVoices() {
        let provider = getCurrentProvider()
        availableVoices = provider.availableVoices
        ensureFormatSupportedForSelectedProvider()

        // Select default voice if none selected
        if selectedVoice == nil || selectedVoice?.provider.rawValue != selectedProvider.rawValue {
            selectedVoice = provider.defaultVoice
        }
    }
    
    func saveAPIKey(_ key: String, for provider: TTSProviderType) {
        keychainManager.saveAPIKey(key, for: provider.rawValue)
        
        // Update the service with new key
        switch provider {
        case .elevenLabs:
            elevenLabs.updateAPIKey(key)
        case .openAI:
            openAI.updateAPIKey(key)
        case .google:
            googleTTS.updateAPIKey(key)
        }
    }
    
    func getAPIKey(for provider: TTSProviderType) -> String? {
        return keychainManager.getAPIKey(for: provider.rawValue)
    }
    
    // MARK: - Private Methods
    private func getCurrentProvider() -> any TTSProvider {
        switch selectedProvider {
        case .elevenLabs:
            return elevenLabs
        case .openAI:
            return openAI
        case .google:
            return googleTTS
        }
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
    }
}

// MARK: - Provider Type
enum TTSProviderType: String, CaseIterable {
    case elevenLabs = "ElevenLabs"
    case openAI = "OpenAI"
    case google = "Google"
    
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
        }
    }
}

// MARK: - Format Helpers
private extension TTSViewModel {
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
        stop()
    }
}
