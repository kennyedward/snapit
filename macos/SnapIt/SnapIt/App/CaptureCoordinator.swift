import AppKit
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let captureFullScreen = Self("captureFullScreen", default: .init(.s, modifiers: [.option, .shift]))
    static let captureWindow = Self("captureWindow", default: .init(.w, modifiers: [.option, .shift]))
}

/// Single entry point for capture actions, shared by the menu bar menu and the global hotkeys.
@MainActor
final class CaptureCoordinator {
    static let shared = CaptureCoordinator()

    private init() {}

    func registerHotKeys() {
        KeyboardShortcuts.onKeyUp(for: .captureFullScreen) { [weak self] in
            Task { @MainActor in await self?.captureFullScreen() }
        }
        KeyboardShortcuts.onKeyUp(for: .captureWindow) { [weak self] in
            Task { @MainActor in await self?.pickAndCaptureWindow() }
        }
    }

    func captureFullScreen() async {
        // Give the menu a moment to close so it isn't in the shot.
        try? await Task.sleep(for: .milliseconds(200))
        do {
            let image = try await CaptureManager.shared.captureFullScreen()
            EditorWindowController.shared.open(with: image)
        } catch {
            showError(error)
        }
    }

    func pickAndCaptureWindow() async {
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
                        self.showError(error)
                    }
                }
            }
            picker.show()
        } catch {
            showError(error)
        }
    }

    private func showError(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "Capture Failed"
        alert.informativeText = error.localizedDescription
        alert.alertStyle = .warning
        alert.runModal()
    }
}
