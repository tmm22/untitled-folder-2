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
    
    // MARK: - Services
    private let audioPlayer = AudioPlayerService()
    private let elevenLabs = ElevenLabsService()
    private let openAI = OpenAIService()
    private let googleTTS = GoogleTTSService()
    private let keychainManager = KeychainManager()
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private(set) var audioData: Data?  // Make it readable but not writable from outside
    private let maxTextLength = 5000
    
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
            
            let settings = AudioSettings(
                speed: playbackSpeed,
                volume: volume
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
        // Use only allowedContentTypes for macOS 12+
        savePanel.allowedContentTypes = [.mp3, .wav, .audio]
        savePanel.nameFieldStringValue = "speech.mp3"
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
        audioData = nil
    }
    
    func updateAvailableVoices() {
        let provider = getCurrentProvider()
        availableVoices = provider.availableVoices
        
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