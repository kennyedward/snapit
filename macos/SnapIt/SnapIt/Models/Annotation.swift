import SwiftUI

enum AnnotationTool: String, CaseIterable, Identifiable {
    case pen = "Pen"
    case select = "Select"
    case rectangle = "Rectangle"
    case circle = "Circle"
    case text = "Text"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .pen: "pencil.tip"
        case .select: "cursorarrow"
        case .rectangle: "rectangle"
        case .circle: "circle"
        case .text: "textformat"
        }
    }

    var shortcutKey: KeyEquivalent {
        switch self {
        case .pen: "p"
        case .select: "v"
        case .rectangle: "r"
        case .circle: "c"
        case .text: "t"
        }
    }
}

enum AnnotationType {
    case pen([CGPoint])
    case rectangle
    case circle
    case text(String)
}

struct Annotation: Identifiable {
    let id = UUID()
    var type: AnnotationType
    var origin: CGPoint
    var size: CGSize
    var color: Color = .red
    var strokeWidth: CGFloat = 3
    var fontSize: CGFloat = 18

    var rect: CGRect {
        get { CGRect(origin: origin, size: size) }
        set {
            origin = newValue.origin
            size = newValue.size
        }
    }

    var normalizedRect: CGRect {
        if case .pen(let points) = type, let first = points.first {
            var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
            for p in points {
                minX = min(minX, p.x); maxX = max(maxX, p.x)
                minY = min(minY, p.y); maxY = max(maxY, p.y)
            }
            return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        }
        return CGRect(
            x: min(origin.x, origin.x + size.width),
            y: min(origin.y, origin.y + size.height),
            width: abs(size.width),
            height: abs(size.height)
        )
    }

    func contains(_ point: CGPoint) -> Bool {
        normalizedRect.insetBy(dx: -4, dy: -4).contains(point)
    }

    mutating func translate(by delta: CGSize) {
        origin.x += delta.width
        origin.y += delta.height
        if case .pen(let points) = type {
            type = .pen(points.map { CGPoint(x: $0.x + delta.width, y: $0.y + delta.height) })
        }
    }

    /// Path for a pen stroke in image coordinates.
    var penPath: Path? {
        guard case .pen(let points) = type, let first = points.first else { return nil }
        var path = Path()
        path.move(to: first)
        for p in points.dropFirst() { path.addLine(to: p) }
        return path
    }
}
