import SwiftUI
import KeyboardShortcuts

struct SettingsView: View {
    var body: some View {
        Form {
            Section("Global Shortcuts") {
                KeyboardShortcuts.Recorder("Capture Full Screen:", name: .captureFullScreen)
                KeyboardShortcuts.Recorder("Capture Window:", name: .captureWindow)
            }

            Section {
                Button("Reset to Defaults") {
                    KeyboardShortcuts.reset(.captureFullScreen, .captureWindow)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .fixedSize()
        .onAppear {
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
