import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var viewModel: TTSViewModel
    @State private var showingSettings = false
    @State private var showingAbout = false
    
    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                // Header with provider and voice selection
                HeaderView()
                    .padding(.horizontal, LayoutGuidance.horizontalPadding(for: proxy.size.width, isMinimalist: viewModel.isMinimalistMode))
                    .padding(.vertical, viewModel.isMinimalistMode ? 8 : 12)
                    .background(Color(NSColor.controlBackgroundColor))

                Divider()

                // Main content area
                ScrollView {
                    VStack(spacing: viewModel.isMinimalistMode ? 12 : 16) {
                        URLImportView()
                            .padding(viewModel.isMinimalistMode ? 10 : 14)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color(NSColor.controlBackgroundColor))
                            )

                        // Text Editor
                        TextEditorView()
                            .layoutPriority(1)

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

                        CostEstimateView()

                        BatchQueueView()

                        RecentGenerationsView()

                        TextSnippetsView()

                        PronunciationGlossaryView()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, LayoutGuidance.horizontalPadding(for: proxy.size.width, isMinimalist: viewModel.isMinimalistMode))
                    .padding(.vertical, viewModel.isMinimalistMode ? 12 : 16)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                Divider()

                // Playback Controls
                PlaybackControlsView()
                    .padding(.horizontal, LayoutGuidance.horizontalPadding(for: proxy.size.width, isMinimalist: viewModel.isMinimalistMode))
                    .padding(.vertical, viewModel.isMinimalistMode ? 8 : 12)
                    .background(Color(NSColor.controlBackgroundColor))

                Divider()

                ActionButtonsView(showingSettings: $showingSettings)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, LayoutGuidance.horizontalPadding(for: proxy.size.width, isMinimalist: viewModel.isMinimalistMode))
                    .padding(.vertical, viewModel.isMinimalistMode ? 8 : 12)
                    .background(Color(NSColor.windowBackgroundColor))
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .frame(minWidth: 800, minHeight: 600)
        .preferredColorScheme(viewModel.colorSchemeOverride)
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.colorSchemeOverride)
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
        ViewThatFits(in: .horizontal) {
            mainRow
            compactColumn
        }
    }
}

private extension HeaderView {
    var pickerSpacing: CGFloat {
        viewModel.isMinimalistMode ? 12 : 16
    }

    var mainRow: some View {
        HStack(spacing: viewModel.isMinimalistMode ? 12 : 20) {
            providerPicker
            voicePicker

            Spacer(minLength: viewModel.isMinimalistMode ? 8 : 16)

            controlButtons

            statusIndicator
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var compactColumn: some View {
        VStack(alignment: .leading, spacing: viewModel.isMinimalistMode ? 12 : 16) {
            HStack(spacing: pickerSpacing) {
                providerPicker
                voicePicker
                Spacer(minLength: 0)
            }

            HStack(spacing: pickerSpacing) {
                controlButtons
                Spacer(minLength: 0)
                statusIndicator
            }
        }
    }

    var providerPicker: some View {
        HStack(spacing: pickerSpacing / 2) {
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
            .frame(minWidth: 140, maxWidth: viewModel.isMinimalistMode ? 160 : 200)
            .onChange(of: viewModel.selectedProvider) { _ in
                viewModel.updateAvailableVoices()
            }
        }
    }

    var voicePicker: some View {
        HStack(spacing: pickerSpacing / 2) {
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
            .frame(minWidth: 160, maxWidth: viewModel.isMinimalistMode ? 200 : 240)
        }
    }

    var controlButtons: some View {
        HStack(spacing: pickerSpacing) {
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
        }
    }

    @ViewBuilder
    var statusIndicator: some View {
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
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: viewModel.isPlaying)
                Text("Playing")
                    .font(.caption)
                    .foregroundColor(.green)
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
        ViewThatFits(in: .horizontal) {
            horizontalLayout
            verticalLayout
        }
    }
}

private extension ActionButtonsView {
    var buttonSpacing: CGFloat {
        viewModel.isMinimalistMode ? 8 : 12
    }

    var primaryButtonWidth: CGFloat {
        viewModel.isMinimalistMode ? 0 : 96
    }

    var horizontalLayout: some View {
        HStack(spacing: buttonSpacing) {
            generateButton
            batchButton
            exportButton
            transcriptMenu
            clearButton

            Spacer(minLength: buttonSpacing)

            if !viewModel.isMinimalistMode {
                loopToggle
            }

            donateButton
            settingsButton
        }
    }

    var verticalLayout: some View {
        VStack(alignment: .leading, spacing: buttonSpacing) {
            HStack(spacing: buttonSpacing) {
                generateButton
                batchButton
                exportButton
            }

            HStack(spacing: buttonSpacing) {
                transcriptMenu
                clearButton
                if !viewModel.isMinimalistMode {
                    loopToggle
                }
            }

            HStack(spacing: buttonSpacing) {
                donateButton
                settingsButton
            }
        }
    }

    var generateButton: some View {
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
                    .frame(minWidth: primaryButtonWidth)
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(viewModel.isMinimalistMode ? .regular : .large)
        .disabled(viewModel.inputText.isEmpty || viewModel.isGenerating || viewModel.isBatchRunning)
        .keyboardShortcut(.return, modifiers: .command)
        .help("Generate speech from text (⌘↵)")
        .scaleEffect(isHoveringGenerate ? 1.05 : 1.0)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.1)) {
                isHoveringGenerate = hovering
            }
        }
    }

    var batchButton: some View {
        Button(action: viewModel.startBatchGeneration) {
            if viewModel.isMinimalistMode {
                Image(systemName: "text.badge.plus")
                    .imageScale(.large)
                    .accessibilityLabel("Generate Batch")
                    .help("Generate all segments separated by ---")
            } else {
                Label("Generate Batch", systemImage: "text.badge.plus")
                    .frame(minWidth: primaryButtonWidth + 32)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(viewModel.isMinimalistMode ? .regular : .large)
        .disabled(!viewModel.hasBatchableSegments || viewModel.isGenerating || viewModel.isBatchRunning)
        .help("Generate all segments separated by ---")
    }

    var exportButton: some View {
        Button(action: viewModel.exportAudio) {
            if viewModel.isMinimalistMode {
                Image(systemName: "square.and.arrow.down")
                    .imageScale(.large)
                    .accessibilityLabel("Export")
                    .help("Export audio file (⌘E)")
            } else {
                Label("Export", systemImage: "square.and.arrow.down")
                    .frame(minWidth: primaryButtonWidth)
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
    }

    var transcriptMenu: some View {
        Menu {
            Button("Export SRT") {
                viewModel.exportTranscript(format: .srt)
            }
            Button("Export VTT") {
                viewModel.exportTranscript(format: .vtt)
            }
        } label: {
            if viewModel.isMinimalistMode {
                Image(systemName: "doc.text")
                    .imageScale(.large)
                    .accessibilityLabel("Export Transcript")
                    .help("Export transcript as SRT or VTT")
            } else {
                Label("Transcript", systemImage: "doc.text")
                    .frame(minWidth: primaryButtonWidth + 8)
            }
        }
        .disabled(viewModel.currentTranscript == nil)
        .menuStyle(.borderlessButton)
    }

    var clearButton: some View {
        Button(action: viewModel.clearText) {
            if viewModel.isMinimalistMode {
                Image(systemName: "trash")
                    .imageScale(.large)
                    .accessibilityLabel("Clear")
                    .help("Clear text and audio (⌘K)")
            } else {
                Label("Clear", systemImage: "trash")
                    .frame(minWidth: primaryButtonWidth)
            }
        }
        .controlSize(viewModel.isMinimalistMode ? .regular : .large)
        .keyboardShortcut("k", modifiers: .command)
        .help("Clear text and audio (⌘K)")
    }

    var loopToggle: some View {
        Toggle(isOn: $viewModel.isLoopEnabled) {
            Label("Loop", systemImage: "repeat")
        }
        .toggleStyle(.button)
        .controlSize(.large)
        .help("Enable loop playback")
    }

    var donateButton: some View {
        Button(action: openDonationPage) {
            if viewModel.isMinimalistMode {
                Image(systemName: "heart.fill")
                    .imageScale(.large)
                    .accessibilityLabel("Donate")
                    .help("Support development on GitHub Sponsors")
            } else {
                Label("Donate", systemImage: "heart.fill")
                    .frame(minWidth: primaryButtonWidth)
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
    }

    var settingsButton: some View {
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
                    .frame(minWidth: primaryButtonWidth)
            }
        }
        .controlSize(viewModel.isMinimalistMode ? .regular : .large)
        .keyboardShortcut(",", modifiers: .command)
        .help("Open settings (⌘,)")
    }

    func openDonationPage() {
        guard let url = AppConfiguration.donationURL else { return }
        NSWorkspace.shared.open(url)
    }
}
