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
                .macWindowAppearance()
        }
        .defaultSize(width: 1024, height: 720)
        .windowResizability(.contentSize)
        .defaultLaunchBehavior(.presented)
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        
        Settings {
            SettingsView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.colorSchemeOverride)
                .macWindowAppearance()
        }
        .defaultSize(width: 520, height: 420)
        .windowResizability(.contentSize)
        .windowStyle(.titleBar)
        .defaultLaunchBehavior(.suppressed)
    }
}

private extension View {
    func macWindowAppearance() -> some View {
        toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
            .toolbar(removing: .title)
            .windowToolbarFullScreenVisibility(.onHover)
    }
}
