import AppKit
import ScreenCaptureKit
import SwiftUI

@MainActor
final class WindowPickerController {
    private let windows: [SCWindow]
    private let onSelect: (SCWindow) -> Void
    private var panel: NSWindow?

    init(windows: [SCWindow], onSelect: @escaping (SCWindow) -> Void) {
        self.windows = windows
        self.onSelect = onSelect
    }

    func show() {
        let view = WindowPickerView(windows: windows) { [weak self] window in
            self?.panel?.close()
            self?.onSelect(window)
        }

        let hosting = NSHostingView(rootView: view)
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 500),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        panel.contentView = hosting
        panel.title = "Select a Window"
        panel.center()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.panel = panel
    }
}

private struct WindowPickerView: View {
    let windows: [SCWindow]
    let onSelect: (SCWindow) -> Void

    var body: some View {
        List(windows, id: \.windowID) { window in
            Button {
                onSelect(window)
            } label: {
                HStack {
                    Image(systemName: "macwindow")
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading) {
                        Text(window.title ?? "Untitled")
                            .lineLimit(1)
                        if let app = window.owningApplication?.applicationName {
                            Text(app)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, 4)
        }
        .frame(minWidth: 350, minHeight: 300)
    }
}
