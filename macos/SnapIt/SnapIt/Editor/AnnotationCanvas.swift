import SwiftUI

struct AnnotationCanvas: View {
    @ObservedObject var state: EditorState
    @State private var dragStartLocation: CGPoint?
    @State private var lastDragLocation: CGPoint?

    var body: some View {
        ZStack(alignment: .topLeading) {
            canvas

            if state.isEditingText {
                textField
            }
        }
        .contentShape(Rectangle())
        .gesture(tapGesture)
        .gesture(dragGesture)
    }

    // MARK: - Canvas

    private var canvas: some View {
        Canvas { context, size in
            for annotation in state.annotations {
                draw(annotation, in: &context, isSelected: annotation.id == state.selectedAnnotationId)
            }
            if let inProgress = state.inProgressAnnotation, !state.isEditingText {
                draw(inProgress, in: &context, isSelected: false)
            }
        }
    }

    private func draw(_ annotation: Annotation, in context: inout GraphicsContext, isSelected: Bool) {
        let rect = annotation.normalizedRect

        switch annotation.type {
        case .rectangle:
            let path = Path(rect)
            context.stroke(path, with: .color(annotation.color), lineWidth: annotation.strokeWidth)

        case .circle:
            let path = Path(ellipseIn: rect)
            context.stroke(path, with: .color(annotation.color), lineWidth: annotation.strokeWidth)

        case .text(let string):
            guard !string.isEmpty else { return }
            let resolved = context.resolve(
                Text(string)
                    .font(.system(size: annotation.fontSize))
                    .foregroundColor(annotation.color)
            )
            context.draw(resolved, at: rect.origin, anchor: .topLeading)
        }

        if isSelected {
            let selRect = rect.insetBy(dx: -4, dy: -4)
            context.stroke(
                Path(selRect),
                with: .color(.blue),
                style: StrokeStyle(lineWidth: 1.5, dash: [6, 3])
            )

            let handles = [
                CGPoint(x: selRect.minX, y: selRect.minY),
                CGPoint(x: selRect.maxX, y: selRect.minY),
                CGPoint(x: selRect.minX, y: selRect.maxY),
                CGPoint(x: selRect.maxX, y: selRect.maxY),
            ]
            for handle in handles {
                let handleRect = CGRect(x: handle.x - 3, y: handle.y - 3, width: 6, height: 6)
                context.fill(Path(handleRect), with: .color(.white))
                context.stroke(Path(handleRect), with: .color(.blue), lineWidth: 1)
            }
        }
    }

    // MARK: - Text input

    private var textField: some View {
        let rect = state.inProgressAnnotation?.normalizedRect ?? CGRect(origin: state.textEditPosition, size: CGSize(width: 200, height: 30))
        return TextField("Type here…", text: $state.editingText)
            .textFieldStyle(.plain)
            .font(.system(size: state.fontSize))
            .foregroundColor(state.currentColor)
            .frame(width: max(rect.width, 150), height: max(rect.height, state.fontSize + 8))
            .padding(4)
            .background(Color.white.opacity(0.9))
            .cornerRadius(4)
            .position(x: rect.midX, y: rect.midY)
            .onSubmit {
                state.finalizeText()
            }
    }

    // MARK: - Gestures

    private var tapGesture: some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                let location = value.location
                switch state.currentTool {
                case .select:
                    state.selectAnnotation(at: location)
                case .text:
                    state.isEditingText = true
                    state.editingText = ""
                    state.textEditPosition = location
                    let annotation = Annotation(
                        type: .text(""),
                        origin: location,
                        size: CGSize(width: 200, height: state.fontSize + 8),
                        color: state.currentColor,
                        strokeWidth: state.strokeWidth,
                        fontSize: state.fontSize
                    )
                    state.inProgressAnnotation = annotation
                default:
                    break
                }
            }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 3)
            .onChanged { value in
                let location = value.location

                if state.currentTool == .select {
                    if dragStartLocation == nil {
                        dragStartLocation = value.startLocation
                        state.selectAnnotation(at: value.startLocation)
                        lastDragLocation = value.startLocation
                    }
                    if state.selectedAnnotationId != nil, let last = lastDragLocation {
                        let delta = CGSize(
                            width: location.x - last.x,
                            height: location.y - last.y
                        )
                        state.moveSelected(by: delta)
                    }
                    lastDragLocation = location
                } else if state.currentTool != .text {
                    if dragStartLocation == nil {
                        dragStartLocation = value.startLocation
                        state.beginDraw(at: value.startLocation)
                    }
                    state.continueDraw(to: location)
                }
            }
            .onEnded { _ in
                if state.currentTool == .select {
                    if state.selectedAnnotationId != nil {
                        state.commitMove()
                    }
                } else if state.currentTool != .text {
                    state.endDraw()
                }
                dragStartLocation = nil
                lastDragLocation = nil
            }
    }
}
