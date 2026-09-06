import AppKit
import SwiftUI

@MainActor
final class EditorWindowController {
    static let shared = EditorWindowController()

    private var window: NSWindow?
    private var state: EditorState?
    private var keyMonitor: Any?

    private init() {
        installKeyMonitor()
    }

    func open(with image: NSImage) {
        close()

        let state = EditorState(image: image)
        let editorView = EditorView(state: state)
        let hostingView = NSHostingView(rootView: editorView)

        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let windowWidth = min(image.size.width + 40, screenFrame.width * 0.9)
        let windowHeight = min(image.size.height + 80, screenFrame.height * 0.9)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.title = "SnapIt Editor"
        window.center()
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.window = window
        self.state = state
    }

    /// Hide the editor but keep the capture and annotations so it can be brought back.
    func hide() {
        window?.orderOut(nil)
    }

    /// Bring back the most recent capture after `hide()`.
    func reopenLast() {
        guard let window, !window.isVisible else { return }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func close() {
        window?.close()
        window = nil
        state = nil
    }

    // MARK: - Keyboard

    private func installKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            return self.handle(event) ? nil : event
        }
    }

    /// Returns true if the event was consumed.
    private func handle(_ event: NSEvent) -> Bool {
        let editorVisible = window?.isVisible == true
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""

        // Space brings back the last capture while the app is still frontmost after Esc.
        if !editorVisible {
            if key == " ", flags.isEmpty, window != nil {
                reopenLast()
                return true
            }
            return false
        }

        guard let state else { return false }

        // Esc always hides; if a text field is active it finalizes first.
        if event.keyCode == 53 {
            if state.isEditingText { state.finalizeText() }
            hide()
            return true
        }

        // Let the text field handle typing.
        if state.isEditingText { return false }

        if flags.contains(.command) {
            switch key {
            case "z":
                if flags.contains(.shift) { state.redo() } else { state.undo() }
                return true
            default:
                return false
            }
        }

        guard flags.isEmpty else { return false }

        switch event.keyCode {
        case 51, 117: // Delete, Forward Delete
            state.deleteSelected()
            return true
        default:
            break
        }

        if let tool = AnnotationTool.allCases.first(where: { String($0.shortcutKey.character) == key }) {
            state.currentTool = tool
            return true
        }

        return false
    }
}
