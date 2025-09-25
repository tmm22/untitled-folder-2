import SwiftUI

@main
struct TextToSpeechApp: App {
    @StateObject private var viewModel = TTSViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .frame(minWidth: 800, minHeight: 600)
                .preferredColorScheme(viewModel.colorSchemeOverride)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        
        Settings {
            SettingsView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.colorSchemeOverride)
        }
    }
}
