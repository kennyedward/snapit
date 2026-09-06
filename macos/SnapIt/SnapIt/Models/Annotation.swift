import SwiftUI

enum AnnotationTool: String, CaseIterable, Identifiable {
    case select = "Select"
    case rectangle = "Rectangle"
    case circle = "Circle"
    case text = "Text"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .select: "cursorarrow"
        case .rectangle: "rectangle"
        case .circle: "circle"
        case .text: "textformat"
        }
    }

    var shortcutKey: KeyEquivalent {
        switch self {
        case .select: "v"
        case .rectangle: "r"
        case .circle: "c"
        case .text: "t"
        }
    }
}

enum AnnotationType {
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
        CGRect(
            x: min(origin.x, origin.x + size.width),
            y: min(origin.y, origin.y + size.height),
            width: abs(size.width),
            height: abs(size.height)
        )
    }

    func contains(_ point: CGPoint) -> Bool {
        normalizedRect.insetBy(dx: -4, dy: -4).contains(point)
    }
}
