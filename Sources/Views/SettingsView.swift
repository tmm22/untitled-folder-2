import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var elevenLabsKey: String = ""
    @State private var openAIKey: String = ""
    @State private var googleKey: String = ""
    
    @State private var showElevenLabsKey = false
    @State private var showOpenAIKey = false
    @State private var showGoogleKey = false
    
    @State private var saveMessage: String?
    @State private var showingSaveAlert = false
    
    @State private var selectedTab = "api"
    
    private let keychainManager = KeychainManager()
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Spacer()
                
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding()
            
            Divider()
            
            // Tab Selection
            Picker("", selection: $selectedTab) {
                Label("API Keys", systemImage: "key.fill").tag("api")
                Label("Audio", systemImage: "speaker.wave.2.fill").tag("audio")
                Label("General", systemImage: "gear").tag("general")
                Label("About", systemImage: "info.circle.fill").tag("about")
            }
            .pickerStyle(SegmentedPickerStyle())
            .padding()
            
            // Content based on selected tab
            ScrollView {
                switch selectedTab {
                case "api":
                    APIKeysView()
                case "audio":
                    AudioSettingsView()
                case "general":
                    GeneralSettingsView()
                case "about":
                    AboutView()
                default:
                    EmptyView()
                }
            }
            
            Divider()
            
            // Footer buttons
            HStack {
                Button("Reset to Defaults") {
                    resetToDefaults()
                }
                .buttonStyle(.plain)
                
                Spacer()
                
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.escape)
                
                Button("Save") {
                    saveSettings()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return)
            }
            .padding()
        }
        .frame(width: 600, height: 500)
        .onAppear {
            loadAPIKeys()
        }
        .alert("Settings Saved", isPresented: $showingSaveAlert) {
            Button("OK") { }
        } message: {
            Text(saveMessage ?? "Your settings have been saved successfully.")
        }
    }
    
    // MARK: - API Keys View
    @ViewBuilder
    private func APIKeysView() -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("API Keys")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Your API keys are stored securely in the macOS Keychain.")
                .font(.caption)
                .foregroundColor(.secondary)
            
            // ElevenLabs
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "waveform")
                            .foregroundColor(.orange)
                        Text("ElevenLabs")
                            .fontWeight(.medium)
                        Spacer()
                        Link("Get API Key", destination: URL(string: "https://elevenlabs.io")!)
                            .font(.caption)
                    }
                    
                    HStack {
                        if showElevenLabsKey {
                            TextField("Enter your ElevenLabs API key", text: $elevenLabsKey)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            SecureField("Enter your ElevenLabs API key", text: $elevenLabsKey)
                                .textFieldStyle(.roundedBorder)
                        }
                        
                        Button(action: { showElevenLabsKey.toggle() }) {
                            Image(systemName: showElevenLabsKey ? "eye.slash" : "eye")
                        }
                        .buttonStyle(.plain)
                    }
                    
                    if !elevenLabsKey.isEmpty {
                        Text("Key: \(elevenLabsKey.maskedAPIKey)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            // OpenAI
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "cpu")
                            .foregroundColor(.green)
                        Text("OpenAI")
                            .fontWeight(.medium)
                        Spacer()
                        Link("Get API Key", destination: URL(string: "https://platform.openai.com/api-keys")!)
                            .font(.caption)
                    }
                    
                    HStack {
                        if showOpenAIKey {
                            TextField("Enter your OpenAI API key", text: $openAIKey)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            SecureField("Enter your OpenAI API key", text: $openAIKey)
                                .textFieldStyle(.roundedBorder)
                        }
                        
                        Button(action: { showOpenAIKey.toggle() }) {
                            Image(systemName: showOpenAIKey ? "eye.slash" : "eye")
                        }
                        .buttonStyle(.plain)
                    }
                    
                    if !openAIKey.isEmpty {
                        Text("Key: \(openAIKey.maskedAPIKey)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            // Google Cloud
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "cloud")
                            .foregroundColor(.blue)
                        Text("Google Cloud TTS")
                            .fontWeight(.medium)
                        Spacer()
                        Link("Get API Key", destination: URL(string: "https://console.cloud.google.com")!)
                            .font(.caption)
                    }
                    
                    HStack {
                        if showGoogleKey {
                            TextField("Enter your Google Cloud API key", text: $googleKey)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            SecureField("Enter your Google Cloud API key", text: $googleKey)
                                .textFieldStyle(.roundedBorder)
                        }
                        
                        Button(action: { showGoogleKey.toggle() }) {
                            Image(systemName: showGoogleKey ? "eye.slash" : "eye")
                        }
                        .buttonStyle(.plain)
                    }
                    
                    if !googleKey.isEmpty {
                        Text("Key: \(googleKey.maskedAPIKey)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            Spacer()
        }
        .padding()
    }
    
    // MARK: - Audio Settings View
    @ViewBuilder
    private func AudioSettingsView() -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Audio Settings")
                .font(.title2)
                .fontWeight(.semibold)
            
            GroupBox("Default Settings") {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Default Speed:")
                        Picker("", selection: $viewModel.playbackSpeed) {
                            Text("0.5×").tag(0.5)
                            Text("0.75×").tag(0.75)
                            Text("1.0×").tag(1.0)
                            Text("1.25×").tag(1.25)
                            Text("1.5×").tag(1.5)
                            Text("1.75×").tag(1.75)
                            Text("2.0×").tag(2.0)
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 100)
                        Spacer()
                    }
                    
                    HStack {
                        Text("Default Volume:")
                        Slider(value: $viewModel.volume, in: 0...1)
                            .frame(width: 200)
                        Text("\(Int(viewModel.volume * 100))%")
                            .frame(width: 50)
                            .monospacedDigit()
                        Spacer()
                    }
                    
                    Toggle("Enable Loop by Default", isOn: $viewModel.isLoopEnabled)
                }
                .padding(.vertical, 8)
            }
            
            GroupBox("Audio Quality") {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Higher quality settings may increase generation time and cost.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    // Quality settings would go here
                    Text("Quality settings vary by provider and will be applied automatically.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            
            Spacer()
        }
        .padding()
    }
    
    // MARK: - General Settings View
    @ViewBuilder
    private func GeneralSettingsView() -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("General Settings")
                .font(.title2)
                .fontWeight(.semibold)
            
            GroupBox("Appearance") {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle(isOn: $viewModel.isMinimalistMode) {
                        Text("Minimalist layout (Compact)")
                    }
                    .onChange(of: viewModel.isMinimalistMode) { _ in
                        viewModel.saveSettings()
                    }
                    .accessibilityLabel("Minimalist layout (Compact)")
                    .accessibilityHint("Reduce chrome and move advanced controls to a popover. All functionality remains available.")
                    
                    Text("Reduces chrome and moves advanced controls to a popover. All functionality remains available.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Divider()
                    
                    Text("The app follows your system appearance settings.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            
            GroupBox("Behavior") {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Show generation progress", isOn: .constant(true))
                    Toggle("Play audio automatically after generation", isOn: .constant(true))
                    Toggle("Clear text after export", isOn: .constant(false))
                }
                .padding(.vertical, 8)
            }
            
            GroupBox("Cache") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Audio cache helps speed up repeated generations.")
                        Spacer()
                    }
                    
                    HStack {
                        Text("Cache size: ~0 MB")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Spacer()
                        Button("Clear Cache") {
                            // Clear cache implementation
                        }
                    }
                }
                .padding(.vertical, 8)
            }
            
            Spacer()
        }
        .padding()
    }
    
    // MARK: - Helper Methods
    private func loadAPIKeys() {
        elevenLabsKey = keychainManager.getAPIKey(for: "ElevenLabs") ?? ""
        openAIKey = keychainManager.getAPIKey(for: "OpenAI") ?? ""
        googleKey = keychainManager.getAPIKey(for: "Google") ?? ""
    }
    
    private func saveSettings() {
        // Save API keys
        if !elevenLabsKey.isEmpty {
            viewModel.saveAPIKey(elevenLabsKey, for: .elevenLabs)
        }
        if !openAIKey.isEmpty {
            viewModel.saveAPIKey(openAIKey, for: .openAI)
        }
        if !googleKey.isEmpty {
            viewModel.saveAPIKey(googleKey, for: .google)
        }
        
        // Save other settings
        viewModel.saveSettings()
        
        saveMessage = "All settings have been saved successfully."
        showingSaveAlert = true
        
        // Dismiss after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            dismiss()
        }
    }
    
    private func resetToDefaults() {
        viewModel.playbackSpeed = 1.0
        viewModel.volume = 0.75
        viewModel.isLoopEnabled = false
    }
}

// MARK: - About View
struct AboutView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.accentColor)
            
            Text("Text-to-Speech Converter")
                .font(.title)
                .fontWeight(.bold)
            
            Text("Version 1.0.0")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Text("A powerful macOS application for converting text to natural-sounding speech using AI.")
                .multilineTextAlignment(.center)
                .frame(maxWidth: 400)
            
            Divider()
                .frame(width: 200)
            
            VStack(alignment: .leading, spacing: 8) {
                Link("Documentation", destination: URL(string: "https://github.com/yourusername/macos-tts-app")!)
                Link("Report an Issue", destination: URL(string: "https://github.com/yourusername/macos-tts-app/issues")!)
                Link("Privacy Policy", destination: URL(string: "https://github.com/yourusername/macos-tts-app#privacy")!)
            }
            
            Spacer()
            
            Text("© 2024 Your Company. All rights reserved.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// Preview
struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
            .environmentObject(TTSViewModel())
    }
}