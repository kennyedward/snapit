import SwiftUI
import KeyboardShortcuts

@main
struct SnapItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        MenuBarExtra("SnapIt", systemImage: "camera.viewfinder") {
            Button("Capture Full Screen") {
                Task { @MainActor in await CaptureCoordinator.shared.captureFullScreen() }
            }
            .globalKeyboardShortcut(.captureFullScreen)

            Button("Capture Window…") {
                Task { @MainActor in await CaptureCoordinator.shared.pickAndCaptureWindow() }
            }
            .globalKeyboardShortcut(.captureWindow)

            Divider()

            SettingsLink {
                Text("Settings…")
            }
            .keyboardShortcut(",")

            Divider()

            Button("Quit SnapIt") {
                NSApp.terminate(nil)
            }
            .keyboardShortcut("q")
        }

        Settings {
            SettingsView()
        }
    }
}
