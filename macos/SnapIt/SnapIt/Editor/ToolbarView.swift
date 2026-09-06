import SwiftUI

struct ToolbarView: View {
    @ObservedObject var state: EditorState

    var body: some View {
        HStack(spacing: 12) {
            toolButtons
            Divider().frame(height: 20)
            colorAndStroke
            Divider().frame(height: 20)
            undoRedoDelete
            Spacer()
            exportButtons
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    // MARK: - Tool buttons

    private var toolButtons: some View {
        HStack(spacing: 4) {
            ForEach(AnnotationTool.allCases) { tool in
                Button {
                    state.currentTool = tool
                } label: {
                    Image(systemName: tool.icon)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.bordered)
                .tint(state.currentTool == tool ? .accentColor : nil)
                .help(Text("\(tool.rawValue) (\(String(tool.shortcutKey.character)))"))
            }
        }
    }

    // MARK: - Color & stroke

    private var colorAndStroke: some View {
        HStack(spacing: 8) {
            ColorPicker("", selection: $state.currentColor, supportsOpacity: false)
                .labelsHidden()
                .help("Annotation color")

            HStack(spacing: 4) {
                Image(systemName: "lineweight")
                    .foregroundStyle(.secondary)
                Slider(value: $state.strokeWidth, in: 1...12, step: 1)
                    .frame(width: 80)
            }
            .help("Stroke width")

            if state.currentTool == .text {
                HStack(spacing: 4) {
                    Image(systemName: "textformat.size")
                        .foregroundStyle(.secondary)
                    Slider(value: $state.fontSize, in: 10...72, step: 2)
                        .frame(width: 80)
                }
                .help("Font size")
            }
        }
    }

    // MARK: - Undo/Redo/Delete

    private var undoRedoDelete: some View {
        HStack(spacing: 4) {
            Button { state.undo() } label: {
                Image(systemName: "arrow.uturn.backward")
            }
            .disabled(!state.canUndo)
            .help("Undo (⌘Z)")

            Button { state.redo() } label: {
                Image(systemName: "arrow.uturn.forward")
            }
            .disabled(!state.canRedo)
            .help("Redo (⇧⌘Z)")

            Button { state.deleteSelected() } label: {
                Image(systemName: "trash")
            }
            .disabled(state.selectedAnnotationId == nil)
            .help("Delete selected (⌫)")
        }
    }

    // MARK: - Export

    private var exportButtons: some View {
        HStack(spacing: 8) {
            Button {
                state.copyToClipboard()
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            .help("Copy to clipboard")

            Button {
                state.saveToDisk()
            } label: {
                Label("Save", systemImage: "square.and.arrow.down")
            }
            .help("Save as PNG")
        }
        .buttonStyle(.bordered)
    }
}

