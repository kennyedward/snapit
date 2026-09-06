import SwiftUI

struct EditorView: View {
    @ObservedObject var state: EditorState

    var body: some View {
        VStack(spacing: 0) {
            ToolbarView(state: state)

            Divider()

            ScrollView([.horizontal, .vertical]) {
                ZStack(alignment: .topLeading) {
                    Image(nsImage: state.image)
                        .resizable()
                        .frame(width: state.image.size.width, height: state.image.size.height)

                    AnnotationCanvas(state: state)
                        .frame(width: state.image.size.width, height: state.image.size.height)
                }
                .padding(20)
            }
            .background(Color(nsColor: .controlBackgroundColor))
        }
        .frame(minWidth: 600, minHeight: 400)
        .onKeyPress(phases: .down) { keyPress in
            switch keyPress.key {
            case .delete:
                state.deleteSelected()
                return .handled
            case "z" where keyPress.modifiers.contains(.command) && keyPress.modifiers.contains(.shift):
                state.redo()
                return .handled
            case "z" where keyPress.modifiers.contains(.command):
                state.undo()
                return .handled
            case "v" where keyPress.modifiers.isEmpty:
                state.currentTool = .select
                return .handled
            case "r" where keyPress.modifiers.isEmpty:
                state.currentTool = .rectangle
                return .handled
            case "c" where keyPress.modifiers.isEmpty:
                state.currentTool = .circle
                return .handled
            case "t" where keyPress.modifiers.isEmpty:
                state.currentTool = .text
                return .handled
            default:
                return .ignored
            }
        }
        .focusable()
    }
}
