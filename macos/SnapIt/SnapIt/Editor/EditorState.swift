import SwiftUI

@MainActor
final class EditorState: ObservableObject {
    let image: NSImage

    @Published var annotations: [Annotation] = []
    @Published var currentTool: AnnotationTool = .rectangle
    @Published var currentColor: Color = .red
    @Published var strokeWidth: CGFloat = 3
    @Published var fontSize: CGFloat = 18
    @Published var selectedAnnotationId: UUID?
    @Published var inProgressAnnotation: Annotation?
    @Published var isEditingText = false
    @Published var editingText = ""
    @Published var textEditPosition: CGPoint = .zero

    private var undoStack: [[Annotation]] = []
    private var redoStack: [[Annotation]] = []

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    init(image: NSImage) {
        self.image = image
    }

    // MARK: - Annotation CRUD

    func addAnnotation(_ annotation: Annotation) {
        pushUndo()
        annotations.append(annotation)
    }

    func updateAnnotation(_ id: UUID, transform: (inout Annotation) -> Void) {
        guard let index = annotations.firstIndex(where: { $0.id == id }) else { return }
        pushUndo()
        transform(&annotations[index])
    }

    func deleteSelected() {
        guard let id = selectedAnnotationId else { return }
        pushUndo()
        annotations.removeAll { $0.id == id }
        selectedAnnotationId = nil
    }

    // MARK: - Selection

    func selectAnnotation(at point: CGPoint) {
        selectedAnnotationId = annotations.last(where: { $0.contains(point) })?.id
    }

    // MARK: - Drawing

    func beginDraw(at point: CGPoint) {
        guard currentTool != .select else { return }
        var annotation = Annotation(
            type: currentTool == .circle ? .circle : .rectangle,
            origin: point,
            size: .zero,
            color: currentColor,
            strokeWidth: strokeWidth,
            fontSize: fontSize
        )
        if currentTool == .text {
            annotation.type = .text("")
        }
        inProgressAnnotation = annotation
    }

    func continueDraw(to point: CGPoint) {
        guard var annotation = inProgressAnnotation else { return }
        annotation.size = CGSize(
            width: point.x - annotation.origin.x,
            height: point.y - annotation.origin.y
        )
        inProgressAnnotation = annotation
    }

    func endDraw() {
        guard var annotation = inProgressAnnotation else { return }
        inProgressAnnotation = nil

        let rect = annotation.normalizedRect
        guard rect.width > 4 || rect.height > 4 else { return }

        annotation.origin = rect.origin
        annotation.size = rect.size

        if case .text = annotation.type {
            isEditingText = true
            editingText = ""
            textEditPosition = annotation.origin
            let pending = annotation
            DispatchQueue.main.async { [weak self] in
                self?.inProgressAnnotation = pending
            }
            return
        }

        addAnnotation(annotation)
    }

    func finalizeText() {
        guard var annotation = inProgressAnnotation, !editingText.isEmpty else {
            inProgressAnnotation = nil
            isEditingText = false
            return
        }
        annotation.type = .text(editingText)
        inProgressAnnotation = nil
        isEditingText = false
        addAnnotation(annotation)
    }

    // MARK: - Move

    func moveSelected(by delta: CGSize) {
        guard let id = selectedAnnotationId,
              let index = annotations.firstIndex(where: { $0.id == id }) else { return }
        annotations[index].origin.x += delta.width
        annotations[index].origin.y += delta.height
    }

    func commitMove() {
        pushUndo()
    }

    // MARK: - Undo / Redo

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(annotations)
        annotations = previous
        selectedAnnotationId = nil
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(annotations)
        annotations = next
        selectedAnnotationId = nil
    }

    private func pushUndo() {
        undoStack.append(annotations)
        redoStack.removeAll()
    }

    // MARK: - Export

    func renderFinalImage() -> NSImage {
        let size = image.size
        let output = NSImage(size: size)
        output.lockFocus()

        image.draw(in: CGRect(origin: .zero, size: size))

        guard let context = NSGraphicsContext.current?.cgContext else {
            output.unlockFocus()
            return output
        }

        // Flip coordinate system (CoreGraphics is bottom-left origin)
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)

        for annotation in annotations {
            let rect = annotation.normalizedRect
            let nsColor = NSColor(annotation.color)
            context.setStrokeColor(nsColor.cgColor)
            context.setLineWidth(annotation.strokeWidth)

            switch annotation.type {
            case .rectangle:
                context.stroke(rect)

            case .circle:
                context.strokeEllipse(in: rect)

            case .text(let string):
                context.saveGState()
                // Un-flip for text drawing (NSString.draw expects top-left origin)
                context.scaleBy(x: 1, y: -1)
                let drawPoint = NSPoint(x: rect.origin.x, y: -rect.origin.y - annotation.fontSize)
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: NSFont.systemFont(ofSize: annotation.fontSize),
                    .foregroundColor: nsColor
                ]
                (string as NSString).draw(at: drawPoint, withAttributes: attrs)
                context.restoreGState()
            }
        }

        output.unlockFocus()
        return output
    }

    func saveToDisk() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "SnapIt-\(dateStamp()).png"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        let rendered = renderFinalImage()
        guard let tiff = rendered.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: url)
    }

    func copyToClipboard() {
        let rendered = renderFinalImage()
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.writeObjects([rendered])
    }

    private func dateStamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd-HHmmss"
        return f.string(from: Date())
    }
}
