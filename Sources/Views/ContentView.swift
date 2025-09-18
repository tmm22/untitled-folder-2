import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @State private var showingSettings = false
    @State private var showingAbout = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header with provider and voice selection
            HeaderView()
                .padding(viewModel.isMinimalistMode ? 8 : 16)
                .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            // Main content area
            VStack(spacing: 16) {
                // Text Editor
                TextEditorView()
                
                // Character Count
                HStack {
                    Text("Characters: \(viewModel.inputText.count)/5000")
                        .font(.caption)
                        .foregroundColor(viewModel.inputText.count > 5000 ? .red : .secondary)
                    
                    if viewModel.isGenerating {
                        Spacer()
                        ProgressView(value: viewModel.generationProgress)
                            .frame(width: 100)
                        Text("Generating...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                }
            }
            .padding(viewModel.isMinimalistMode ? 12 : 16)
            
            Divider()
            
            // Playback Controls
            PlaybackControlsView()
                .padding(viewModel.isMinimalistMode ? 8 : 16)
                .background(Color(NSColor.controlBackgroundColor))

            Divider()

            ActionButtonsView(showingSettings: $showingSettings)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, viewModel.isMinimalistMode ? 8 : 16)
                .padding(.vertical, viewModel.isMinimalistMode ? 8 : 16)
                .background(Color(NSColor.windowBackgroundColor))
            
        }
        .frame(minWidth: 800, minHeight: 600)
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(viewModel)
        }
        .sheet(isPresented: $showingAbout) {
            AboutView()
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        // Keep global keyboard shortcuts active even in Minimalist mode
        .overlay(
            HStack(spacing: 0) {
                // Decrease speed (⌘[)
                Button(action: {
                    viewModel.playbackSpeed = max(0.5, viewModel.playbackSpeed - 0.25)
                    viewModel.saveSettings()
                }) { EmptyView() }
                .keyboardShortcut("[", modifiers: .command)

                // Increase speed (⌘])
                Button(action: {
                    viewModel.playbackSpeed = min(2.0, viewModel.playbackSpeed + 0.25)
                    viewModel.saveSettings()
                }) { EmptyView() }
                .keyboardShortcut("]", modifiers: .command)
            }
            .frame(width: 0, height: 0)
            .opacity(0.01)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
        )
        .onAppear {
            viewModel.updateAvailableVoices()
        }
    }
}

struct HeaderView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @State private var showAdvancedPopover = false
    
    var body: some View {
        HStack(spacing: viewModel.isMinimalistMode ? 12 : 20) {
            // Provider Selection
            HStack {
                Image(systemName: viewModel.selectedProvider.icon)
                    .foregroundColor(.accentColor)
                if !viewModel.isMinimalistMode {
                    Text("Provider:")
                        .fontWeight(.medium)
                }
                Picker("", selection: $viewModel.selectedProvider) {
                    ForEach(TTSProviderType.allCases, id: \.self) { provider in
                        HStack {
                            Image(systemName: provider.icon)
                            Text(provider.displayName)
                        }
                        .tag(provider)
                    }
                }
                .pickerStyle(MenuPickerStyle())
                .accessibilityLabel("Provider")
                .frame(width: 150)
                .onChange(of: viewModel.selectedProvider) { _ in
                    viewModel.updateAvailableVoices()
                }
            }
            
            // Voice Selection
            HStack {
                Image(systemName: "person.wave.2")
                    .foregroundColor(.accentColor)
                if !viewModel.isMinimalistMode {
                    Text("Voice:")
                        .fontWeight(.medium)
                }
                Picker("", selection: $viewModel.selectedVoice) {
                    Text("Default").tag(nil as Voice?)
                    
                    ForEach(viewModel.availableVoices) { voice in
                        HStack {
                            Image(systemName: voice.gender == .male ? "person.fill" : 
                                           voice.gender == .female ? "person.fill" : "person")
                            Text(voice.name)
                        }
                        .tag(voice as Voice?)
                    }
                }
                .pickerStyle(MenuPickerStyle())
                .accessibilityLabel("Voice")
                .frame(width: 200)
            }
            
            Spacer()
            
            // Minimalist mode toggle
            Button(action: {
                viewModel.isMinimalistMode.toggle()
                viewModel.saveSettings()
            }) {
                Image(systemName: "rectangle.compress.vertical")
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
            .help("Toggle Minimalist layout")
            .accessibilityLabel("Toggle Minimalist layout")
            
            // Advanced controls panel
            Button(action: { showAdvancedPopover.toggle() }) {
                Image(systemName: "slider.horizontal.3")
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
            .help("Show advanced controls")
            .accessibilityLabel("Show advanced controls")
            .popover(isPresented: $showAdvancedPopover, arrowEdge: .top) {
                AdvancedControlsPanelView()
                    .environmentObject(viewModel)
            }
            
            // Status Indicator
            if viewModel.isGenerating {
                HStack {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Generating...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            } else if viewModel.isPlaying {
                HStack {
                    Image(systemName: "speaker.wave.2.fill")
                        .foregroundColor(.green)
                        // symbolEffect requires macOS 14+, using animation instead
                        .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: viewModel.isPlaying)
                    Text("Playing")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }
        }
    }
}

struct ActionButtonsView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @Binding var showingSettings: Bool
    @State private var isHoveringGenerate = false
    @State private var isHoveringExport = false
    @State private var isHoveringDonate = false
    
    var body: some View {
        HStack(spacing: viewModel.isMinimalistMode ? 8 : 12) {
            // Generate Button
            Button(action: {
                Task {
                    await viewModel.generateSpeech()
                }
            }) {
                if viewModel.isMinimalistMode {
                    Image(systemName: "waveform")
                        .imageScale(.large)
                        .accessibilityLabel("Generate")
                        .help("Generate speech from text (⌘↵)")
                } else {
                    Label("Generate", systemImage: "waveform")
                        .frame(minWidth: 100)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(viewModel.isMinimalistMode ? .regular : .large)
            .disabled(viewModel.inputText.isEmpty || viewModel.isGenerating)
            .keyboardShortcut(.return, modifiers: .command)
            .help("Generate speech from text (⌘↵)")
            .scaleEffect(isHoveringGenerate ? 1.05 : 1.0)
            .onHover { hovering in
                withAnimation(.easeInOut(duration: 0.1)) {
                    isHoveringGenerate = hovering
                }
            }
            
            // Export Button
            Button(action: viewModel.exportAudio) {
                if viewModel.isMinimalistMode {
                    Image(systemName: "square.and.arrow.down")
                        .imageScale(.large)
                        .accessibilityLabel("Export")
                        .help("Export audio file (⌘E)")
                } else {
                    Label("Export", systemImage: "square.and.arrow.down")
                        .frame(minWidth: 100)
                }
            }
            .controlSize(viewModel.isMinimalistMode ? .regular : .large)
            .disabled(viewModel.audioData == nil)
            .keyboardShortcut("e", modifiers: .command)
            .help("Export audio file (⌘E)")
            .scaleEffect(isHoveringExport ? 1.05 : 1.0)
            .onHover { hovering in
                withAnimation(.easeInOut(duration: 0.1)) {
                    isHoveringExport = hovering
                }
            }
            
            // Clear Button
            Button(action: viewModel.clearText) {
                if viewModel.isMinimalistMode {
                    Image(systemName: "trash")
                        .imageScale(.large)
                        .accessibilityLabel("Clear")
                        .help("Clear text and audio (⌘K)")
                } else {
                    Label("Clear", systemImage: "trash")
                        .frame(minWidth: 80)
                }
            }
            .controlSize(viewModel.isMinimalistMode ? .regular : .large)
            .keyboardShortcut("k", modifiers: .command)
            .help("Clear text and audio (⌘K)")
            
            Spacer()
            
            // Loop Toggle (hidden in Minimalist mode - available in Advanced panel)
            if !viewModel.isMinimalistMode {
                Toggle(isOn: $viewModel.isLoopEnabled) {
                    Label("Loop", systemImage: "repeat")
                }
                .toggleStyle(.button)
                .controlSize(viewModel.isMinimalistMode ? .regular : .large)
                .help("Enable loop playback")
            }
            
            // Donate Button
            Button(action: openDonationPage) {
                if viewModel.isMinimalistMode {
                    Image(systemName: "heart.fill")
                        .imageScale(.large)
                        .accessibilityLabel("Donate")
                        .help("Support development on GitHub Sponsors")
                } else {
                    Label("Donate", systemImage: "heart.fill")
                        .frame(minWidth: 100)
                }
            }
            .controlSize(viewModel.isMinimalistMode ? .regular : .large)
            .help("Support development on GitHub Sponsors")
            .scaleEffect(isHoveringDonate ? 1.05 : 1.0)
            .onHover { hovering in
                withAnimation(.easeInOut(duration: 0.1)) {
                    isHoveringDonate = hovering
                }
            }
            
            // Settings Button
            Button(action: {
                showingSettings = true
            }) {
                if viewModel.isMinimalistMode {
                    Image(systemName: "gear")
                        .imageScale(.large)
                        .accessibilityLabel("Settings")
                        .help("Open settings (⌘,)")
                } else {
                    Label("Settings", systemImage: "gear")
                        .frame(minWidth: 100)
                }
            }
            .controlSize(viewModel.isMinimalistMode ? .regular : .large)
            .keyboardShortcut(",", modifiers: .command)
            .help("Open settings (⌘,)")
        }
    }
}

private extension ActionButtonsView {
    func openDonationPage() {
        guard let url = AppConfiguration.donationURL else { return }
        NSWorkspace.shared.open(url)
    }
}

// Preview
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(TTSViewModel())
            .frame(width: 900, height: 700)
    }
}
