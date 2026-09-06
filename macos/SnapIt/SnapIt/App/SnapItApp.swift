import SwiftUI
import ScreenCaptureKit

@main
struct SnapItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        MenuBarExtra("SnapIt", systemImage: "camera.viewfinder") {
            Button("Capture Full Screen") {
                Task { @MainActor in await captureFullScreen() }
            }
            .keyboardShortcut("1")

            Button("Capture Window…") {
                Task { @MainActor in await pickAndCaptureWindow() }
            }
            .keyboardShortcut("2")

            Divider()

            Button("Quit SnapIt") {
                NSApp.terminate(nil)
            }
            .keyboardShortcut("q")
        }
    }

    @MainActor
    private func captureFullScreen() async {
        try? await Task.sleep(for: .milliseconds(200))
        do {
            let image = try await CaptureManager.shared.captureFullScreen()
            EditorWindowController.shared.open(with: image)
        } catch {
            showError(error)
        }
    }

    @MainActor
    private func pickAndCaptureWindow() async {
        do {
            let windows = try await CaptureManager.shared.availableWindows()
            guard !windows.isEmpty else {
                showError(CaptureError.noDisplay)
                return
            }

            let picker = WindowPickerController(windows: windows) { selected in
                Task { @MainActor in
                    do {
                        let image = try await CaptureManager.shared.captureWindow(selected)
                        EditorWindowController.shared.open(with: image)
                    } catch {
                        showError(error)
                    }
                }
            }
            picker.show()
        } catch {
            showError(error)
        }
    }

    @MainActor
    private func showError(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "Capture Failed"
        alert.informativeText = error.localizedDescription
        alert.alertStyle = .warning
        alert.runModal()
    }
}
