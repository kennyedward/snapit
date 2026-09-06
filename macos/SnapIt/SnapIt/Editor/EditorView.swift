import SwiftUI

struct EditorView: View {
    @ObservedObject var state: EditorState

    var body: some View {
        VStack(spacing: 0) {
            ToolbarView(state: state)

            Divider()

            // Fit the image to the available space instead of scrolling. Annotation
            // coordinates stay in image space because SwiftUI reports gesture
            // locations in the scaled view's own coordinate system.
            GeometryReader { geo in
                let imageSize = state.image.size
                let padding: CGFloat = 20
                let available = CGSize(
                    width: max(geo.size.width - padding * 2, 1),
                    height: max(geo.size.height - padding * 2, 1)
                )
                let scale = min(1, available.width / imageSize.width, available.height / imageSize.height)

                ZStack(alignment: .topLeading) {
                    Image(nsImage: state.image)
                        .resizable()
                        .frame(width: imageSize.width, height: imageSize.height)

                    AnnotationCanvas(state: state)
                        .frame(width: imageSize.width, height: imageSize.height)
                }
                .scaleEffect(scale, anchor: .center)
                .frame(width: geo.size.width, height: geo.size.height)
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
