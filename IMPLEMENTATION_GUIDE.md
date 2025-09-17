# macOS Text-to-Speech App Implementation Guide

## Project Setup Instructions

### 1. Create Xcode Project
```bash
# Open Xcode and create new project
# Select: macOS > App
# Product Name: TextToSpeechApp
# Team: Your Development Team
# Organization Identifier: com.yourcompany
# Interface: SwiftUI
# Language: Swift
# Use Core Data: No
# Include Tests: Yes
```

### 2. Project Configuration

#### Info.plist Additions
```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app requires microphone access for voice recording features.</string>
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

#### Entitlements
```xml
<key>com.apple.security.network.client</key>
<true/>
<key>com.apple.security.files.user-selected.read-write</key>
<true/>
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.yourcompany.TextToSpeechApp</string>
</array>
```

## Core Implementation Files

### 1. App Entry Point
**File: TextToSpeechApp.swift**
```swift
import SwiftUI

@main
struct TextToSpeechApp: App {
    @StateObject private var viewModel = TTSViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .frame(minWidth: 800, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        
        Settings {
            SettingsView()
                .environmentObject(viewModel)
        }
    }
}
```

### 2. Main View Model
**File: ViewModels/TTSViewModel.swift**
```swift
import SwiftUI
import AVFoundation
import Combine

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
    
    // MARK: - Services
    private let audioPlayer = AudioPlayerService()
    private let elevenLabs = ElevenLabsService()
    private let openAI = OpenAIService()
    private let googleTTS = GoogleTTSService()
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private var audioData: Data?
    
    // MARK: - Initialization
    init() {
        setupAudioPlayer()
        loadSavedSettings()
    }
    
    // MARK: - Public Methods
    func generateSpeech() async {
        guard !inputText.isEmpty else {
            errorMessage = "Please enter some text"
            return
        }
        
        isGenerating = true
        errorMessage = nil
        
        do {
            let provider = getCurrentProvider()
            let settings = AudioSettings(
                speed: playbackSpeed,
                volume: volume
            )
            
            audioData = try await provider.synthesizeSpeech(
                text: inputText,
                voice: selectedVoice ?? provider.defaultVoice,
                settings: settings
            )
            
            if let audioData = audioData {
                try await audioPlayer.loadAudio(from: audioData)
                await play()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isGenerating = false
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
    
    func exportAudio() {
        guard let audioData = audioData else { return }
        
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.mp3, .wav]
        savePanel.nameFieldStringValue = "speech.mp3"
        
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
            .assign(to: &$currentTime)
        
        audioPlayer.$duration
            .assign(to: &$duration)
        
        audioPlayer.$isPlaying
            .assign(to: &$isPlaying)
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
    }
}

enum TTSProviderType: String, CaseIterable {
    case elevenLabs = "ElevenLabs"
    case openAI = "OpenAI"
    case google = "Google"
}
```

### 3. Main Content View
**File: Views/ContentView.swift**
```swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @State private var showingSettings = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HeaderView()
                .padding()
                .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            // Text Editor
            TextEditorView()
                .padding()
            
            // Character Count
            HStack {
                Text("Characters: \(viewModel.inputText.count)/5000")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding(.horizontal)
            
            Divider()
            
            // Playback Controls
            PlaybackControlsView()
                .padding()
                .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            // Action Buttons
            ActionButtonsView(showingSettings: $showingSettings)
                .padding()
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(viewModel)
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }
}

struct HeaderView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    
    var body: some View {
        HStack {
            Text("Provider:")
            Picker("", selection: $viewModel.selectedProvider) {
                ForEach(TTSProviderType.allCases, id: \.self) { provider in
                    Text(provider.rawValue).tag(provider)
                }
            }
            .pickerStyle(MenuPickerStyle())
            .frame(width: 150)
            
            Text("Voice:")
            Picker("", selection: $viewModel.selectedVoice) {
                Text("Default").tag(nil as Voice?)
                // Add available voices based on provider
            }
            .pickerStyle(MenuPickerStyle())
            .frame(width: 200)
            
            Spacer()
        }
    }
}

struct ActionButtonsView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @Binding var showingSettings: Bool
    
    var body: some View {
        HStack(spacing: 12) {
            Button(action: {
                Task {
                    await viewModel.generateSpeech()
                }
            }) {
                Label("Generate", systemImage: "waveform")
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.inputText.isEmpty || viewModel.isGenerating)
            
            Button(action: viewModel.exportAudio) {
                Label("Export", systemImage: "square.and.arrow.down")
            }
            .disabled(viewModel.audioData == nil)
            
            Button(action: {
                viewModel.inputText = ""
                viewModel.stop()
            }) {
                Label("Clear", systemImage: "trash")
            }
            
            Spacer()
            
            Button(action: {
                showingSettings = true
            }) {
                Label("Settings", systemImage: "gear")
            }
        }
    }
}
```

### 4. Text Editor View
**File: Views/TextEditorView.swift**
```swift
import SwiftUI

struct TextEditorView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @FocusState private var isFocused: Bool
    
    var body: some View {
        ScrollView {
            TextEditor(text: $viewModel.inputText)
                .font(.system(size: 14))
                .focused($isFocused)
                .frame(minHeight: 300)
                .overlay(
                    Group {
                        if viewModel.inputText.isEmpty {
                            Text("Enter text to convert to speech...")
                                .foregroundColor(.secondary)
                                .padding(8)
                                .allowsHitTesting(false)
                        }
                    },
                    alignment: .topLeading
                )
        }
        .background(Color(NSColor.textBackgroundColor))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
        .onAppear {
            isFocused = true
        }
    }
}
```

### 5. Playback Controls View
**File: Views/PlaybackControlsView.swift**
```swift
import SwiftUI

struct PlaybackControlsView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    
    var body: some View {
        VStack(spacing: 12) {
            // Playback buttons and progress
            HStack(spacing: 16) {
                Button(action: {
                    viewModel.currentTime = max(0, viewModel.currentTime - 10)
                }) {
                    Image(systemName: "gobackward.10")
                }
                .buttonStyle(.plain)
                
                Button(action: {
                    if viewModel.isPlaying {
                        viewModel.pause()
                    } else {
                        Task {
                            await viewModel.play()
                        }
                    }
                }) {
                    Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 36))
                }
                .buttonStyle(.plain)
                
                Button(action: {
                    viewModel.currentTime = min(viewModel.duration, viewModel.currentTime + 10)
                }) {
                    Image(systemName: "goforward.10")
                }
                .buttonStyle(.plain)
                
                Button(action: viewModel.stop) {
                    Image(systemName: "stop.circle")
                }
                .buttonStyle(.plain)
                
                Spacer()
                
                // Progress bar
                ProgressView(value: viewModel.currentTime, total: viewModel.duration)
                    .frame(maxWidth: 300)
                
                Text(formatTime(viewModel.currentTime) + " / " + formatTime(viewModel.duration))
                    .font(.caption)
                    .monospacedDigit()
            }
            
            // Speed and Volume controls
            HStack(spacing: 20) {
                HStack {
                    Image(systemName: "speedometer")
                    Text("Speed:")
                    Picker("", selection: $viewModel.playbackSpeed) {
                        Text("0.5x").tag(0.5)
                        Text("0.75x").tag(0.75)
                        Text("1.0x").tag(1.0)
                        Text("1.25x").tag(1.25)
                        Text("1.5x").tag(1.5)
                        Text("1.75x").tag(1.75)
                        Text("2.0x").tag(2.0)
                    }
                    .pickerStyle(MenuPickerStyle())
                    .frame(width: 80)
                }
                
                HStack {
                    Image(systemName: "speaker.wave.2")
                    Text("Volume:")
                    Slider(value: $viewModel.volume, in: 0...1)
                        .frame(width: 150)
                    Text("\(Int(viewModel.volume * 100))%")
                        .frame(width: 40)
                        .monospacedDigit()
                }
                
                Spacer()
            }
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
```

### 6. API Service Implementation Example
**File: Services/OpenAIService.swift**
```swift
import Foundation

class OpenAIService: TTSProvider {
    var name: String { "OpenAI" }
    
    var defaultVoice: Voice {
        Voice(
            id: "alloy",
            name: "Alloy",
            language: "en-US",
            gender: .neutral,
            provider: .openAI
        )
    }
    
    var availableVoices: [Voice] {
        [
            Voice(id: "alloy", name: "Alloy", language: "en-US", gender: .neutral, provider: .openAI),
            Voice(id: "echo", name: "Echo", language: "en-US", gender: .male, provider: .openAI),
            Voice(id: "fable", name: "Fable", language: "en-US", gender: .neutral, provider: .openAI),
            Voice(id: "onyx", name: "Onyx", language: "en-US", gender: .male, provider: .openAI),
            Voice(id: "nova", name: "Nova", language: "en-US", gender: .female, provider: .openAI),
            Voice(id: "shimmer", name: "Shimmer", language: "en-US", gender: .female, provider: .openAI)
        ]
    }
    
    func synthesizeSpeech(text: String, voice: Voice, settings: AudioSettings) async throws -> Data {
        guard let apiKey = KeychainManager.shared.getAPIKey(for: .openAI) else {
            throw TTSError.missingAPIKey
        }
        
        let url = URL(string: "https://api.openai.com/v1/audio/speech")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": "tts-1",
            "input": text,
            "voice": voice.id,
            "response_format": "mp3",
            "speed": settings.speed
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw TTSError.apiError("Failed to generate speech")
        }
        
        return data
    }
}
```

### 7. Audio Player Service
**File: Services/AudioPlayerService.swift**
```swift
import AVFoundation
import Combine

class AudioPlayerService: NSObject, ObservableObject {
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var isPlaying: Bool = false
    
    private var audioPlayer: AVAudioPlayer?
    private var timer: Timer?
    
    func loadAudio(from data: Data) async throws {
        audioPlayer = try AVAudioPlayer(data: data)
        audioPlayer?.delegate = self
        audioPlayer?.prepareToPlay()
        duration = audioPlayer?.duration ?? 0
    }
    
    func play() {
        audioPlayer?.play()
        isPlaying = true
        startTimer()
    }
    
    func pause() {
        audioPlayer?.pause()
        isPlaying = false
        stopTimer()
    }
    
    func stop() {
        audioPlayer?.stop()
        audioPlayer?.currentTime = 0
        currentTime = 0
        isPlaying = false
        stopTimer()
    }
    
    func setPlaybackRate(_ rate: Float) {
        audioPlayer?.rate = rate
    }
    
    func setVolume(_ volume: Float) {
        audioPlayer?.volume = volume
    }
    
    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            self.currentTime = self.audioPlayer?.currentTime ?? 0
        }
    }
    
    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}

extension AudioPlayerService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        isPlaying = false
        currentTime = 0
        stopTimer()
    }
}
```

### 8. Keychain Manager
**File: Utilities/KeychainManager.swift**
```swift
import Security
import Foundation

class KeychainManager {
    static let shared = KeychainManager()
    private init() {}
    
    private let service = "com.yourcompany.TextToSpeechApp"
    
    func saveAPIKey(_ key: String, for provider: TTSProviderType) {
        let account = provider.rawValue
        let data = key.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
    
    func getAPIKey(for provider: TTSProviderType) -> String? {
        let account = provider.rawValue
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return key
    }
    
    func deleteAPIKey(for provider: TTSProviderType) {
        let account = provider.rawValue
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}
```

## Build and Run Instructions

### 1. Install Dependencies
```bash
# In Xcode, go to File > Add Package Dependencies
# Add Sparkle for auto-updates (optional):
# https://github.com/sparkle-project/Sparkle
```

### 2. Configure API Keys
1. Run the app
2. Go to Settings (Cmd+,)
3. Enter your API keys for each provider
4. Keys are securely stored in macOS Keychain

### 3. Testing the App
```bash
# Unit Tests
xcodebuild test -scheme TextToSpeechApp -destination 'platform=macOS'

# UI Tests
xcodebuild test -scheme TextToSpeechAppUITests -destination 'platform=macOS'
```

### 4. Building for Distribution
```bash
# Archive the app
xcodebuild archive -scheme TextToSpeechApp -archivePath ./build/TextToSpeechApp.xcarchive

# Export for distribution
xcodebuild -exportArchive -archivePath ./build/TextToSpeechApp.xcarchive -exportPath ./build -exportOptionsPlist ExportOptions.plist
```

## Troubleshooting

### Common Issues

1. **API Key Not Working**
   - Verify key is correct in Settings
   - Check API quota/limits
   - Ensure network connectivity

2. **Audio Not Playing**
   - Check system volume
   - Verify audio format compatibility
   - Check AVAudioSession configuration

3. **App Crashes on Launch**
   - Check minimum macOS version
   - Verify entitlements configuration
   - Check code signing

## Next Steps

1. Implement remaining TTS providers (ElevenLabs, Google)
2. Add voice preview functionality
3. Implement text history/favorites
4. Add SSML support for advanced formatting
5. Create comprehensive test suite
6. Add localization support
7. Implement auto-update mechanism
8. Create user documentation