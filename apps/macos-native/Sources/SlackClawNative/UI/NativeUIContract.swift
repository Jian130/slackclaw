import CoreGraphics
import SwiftUI

enum NativeStatusTone: Equatable {
    case neutral
    case info
    case success
    case warning
    case danger
}

enum NativeTagTone: Equatable {
    case neutral
    case info
    case success
    case warning
    case accent
}

enum NativeBadgeSemantic: Equatable {
    case status(NativeStatusTone)
    case tag(NativeTagTone)
}

enum SurfaceCardTone: Equatable {
    case standard
    case muted
    case accent
    case danger
}

enum ActionButtonVariant: Equatable {
    case primary
    case secondary
    case outline
    case ghost
    case destructive
}

enum NativeInfoBannerAccent: Equatable {
    case blue
    case green
    case orange
    case purple
    case red
}

enum NativeSelectionState: Equatable {
    case `default`
    case selected
}

enum NativeProgressStepState: Equatable {
    case inactive
    case active
    case complete
}

enum NativePageContentWidth: Equatable {
    case centered
    case full
}

enum NativeGuidedFlowLayoutMode: Equatable {
    case leading
    case centered
}

typealias NativeShellNavigationState = NativeSelectionState

struct NativeSurfacePalette {
    let fill: AnyShapeStyle
    let stroke: Color
    let shadowColor: Color
    let shadowRadius: CGFloat
    let shadowY: CGFloat
}

struct NativeBadgePalette {
    let background: Color
    let foreground: Color
}

struct NativeSelectionPalette {
    let tone: SurfaceCardTone
    let stroke: Color
    let lineWidth: CGFloat
}

struct NativeShellNavigationPalette {
    let fill: Color
    let foreground: Color
}

enum NativeUI {
    static let pagePadding: CGFloat = 24
    static let sectionGap: CGFloat = 20
    static let centeredPageMaxWidth: CGFloat = 1200
    static let iconCornerRadius: CGFloat = 12
    static let controlCornerRadius: CGFloat = 14
    static let cardCornerRadius: CGFloat = 24
    static let compactCornerRadius: CGFloat = 16
    static let mediumCornerRadius: CGFloat = 18
    static let standardCornerRadius: CGFloat = 20
    static let panelCornerRadius: CGFloat = 22
    static let heroCornerRadius: CGFloat = 28
    static let showcaseCornerRadius: CGFloat = 32
}

let nativeCenteredPageMaxWidth: CGFloat = NativeUI.centeredPageMaxWidth
let nativeDashboardContentWidth: NativePageContentWidth = .full

let nativeWorkspaceCollectionCardMinHeight: CGFloat = 132

func nativePageContentMaxWidth(_ contentWidth: NativePageContentWidth) -> CGFloat? {
    switch contentWidth {
    case .centered:
        return nativeCenteredPageMaxWidth
    case .full:
        return nil
    }
}

func nativeGuidedFlowLayoutMode(_ contentWidth: NativePageContentWidth) -> NativeGuidedFlowLayoutMode {
    switch contentWidth {
    case .centered:
        return .centered
    case .full:
        return .leading
    }
}

func nativeWorkspaceMetricColumnCount(for width: CGFloat) -> Int {
    if width >= 1340 {
        return 5
    }
    if width >= 1100 {
        return 3
    }
    if width >= 760 {
        return 2
    }
    return 1
}

func nativeWorkspaceMetricColumns(for width: CGFloat) -> [GridItem] {
    let count = nativeWorkspaceMetricColumnCount(for: width)
    let minimum: CGFloat

    switch count {
    case 5:
        minimum = 160
    case 3:
        minimum = 180
    case 2:
        minimum = 200
    default:
        minimum = 220
    }

    return Array(repeating: GridItem(.flexible(minimum: minimum), spacing: 16), count: count)
}

func nativeOperationsSummaryColumnCount(for width: CGFloat) -> Int {
    if width >= 1260 {
        return 3
    }
    if width >= 860 {
        return 2
    }
    return 1
}

func nativeOperationsSummaryColumns(for width: CGFloat) -> [GridItem] {
    let count = nativeOperationsSummaryColumnCount(for: width)
    let minimum: CGFloat = count == 1 ? 240 : 220
    return Array(repeating: GridItem(.flexible(minimum: minimum), spacing: 16), count: count)
}

func nativeStatusTone(from dashboardTone: NativeDashboardTone) -> NativeStatusTone {
    switch dashboardTone {
    case .success:
        return .success
    case .warning:
        return .warning
    case .info:
        return .info
    case .neutral:
        return .neutral
    }
}

func nativeDeployBadgeSemantic(_ badge: NativeDeployBadge) -> NativeBadgeSemantic {
    switch badge {
    case .installed:
        return .status(.success)
    case .current:
        return .status(.info)
    case .updateAvailable:
        return .status(.warning)
    case .recommended:
        return .tag(.success)
    case .comingSoon:
        return .tag(.neutral)
    }
}

func nativeOnboardingProgressState(active: Bool, complete: Bool) -> NativeProgressStepState {
    if complete {
        return .complete
    }
    if active {
        return .active
    }
    return .inactive
}

func nativeOnboardingSelectionState(selected: Bool) -> NativeSelectionState {
    selected ? .selected : .default
}

func nativeShellNavigationState(selected: Bool) -> NativeShellNavigationState {
    nativeOnboardingSelectionState(selected: selected)
}

func nativeSurfacePalette(_ tone: SurfaceCardTone) -> NativeSurfacePalette {
    switch tone {
    case .standard:
        return NativeSurfacePalette(
            fill: AnyShapeStyle(Color.white),
            stroke: Color(red: 0.87, green: 0.9, blue: 0.96),
            shadowColor: Color.black.opacity(0.05),
            shadowRadius: 24,
            shadowY: 14
        )
    case .muted:
        return NativeSurfacePalette(
            fill: AnyShapeStyle(Color.white.opacity(0.78)),
            stroke: Color(red: 0.9, green: 0.93, blue: 0.97),
            shadowColor: Color.black.opacity(0.04),
            shadowRadius: 18,
            shadowY: 12
        )
    case .accent:
        return NativeSurfacePalette(
            fill: AnyShapeStyle(
                LinearGradient(
                    colors: [
                        Color.blue.opacity(0.16),
                        Color.green.opacity(0.08),
                        Color.purple.opacity(0.1)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            ),
            stroke: Color.blue.opacity(0.18),
            shadowColor: Color.blue.opacity(0.08),
            shadowRadius: 22,
            shadowY: 14
        )
    case .danger:
        return NativeSurfacePalette(
            fill: AnyShapeStyle(Color.red.opacity(0.08)),
            stroke: Color.red.opacity(0.18),
            shadowColor: Color.red.opacity(0.06),
            shadowRadius: 20,
            shadowY: 12
        )
    }
}

func nativeSelectionPalette(_ state: NativeSelectionState) -> NativeSelectionPalette {
    switch state {
    case .selected:
        return NativeSelectionPalette(
            tone: .accent,
            stroke: Color.blue.opacity(0.26),
            lineWidth: 2
        )
    case .default:
        return NativeSelectionPalette(
            tone: .muted,
            stroke: Color.black.opacity(0.08),
            lineWidth: 1
        )
    }
}

func nativeBadgePalette(_ semantic: NativeBadgeSemantic) -> NativeBadgePalette {
    switch semantic {
    case .status(.success):
        return NativeBadgePalette(background: Color.green.opacity(0.14), foreground: .green)
    case .status(.warning):
        return NativeBadgePalette(background: Color.orange.opacity(0.16), foreground: .orange)
    case .status(.info):
        return NativeBadgePalette(background: Color.blue.opacity(0.14), foreground: .blue)
    case .status(.neutral):
        return NativeBadgePalette(background: Color.primary.opacity(0.08), foreground: .primary)
    case .status(.danger):
        return NativeBadgePalette(background: Color.red.opacity(0.14), foreground: .red)
    case .tag(.success):
        return NativeBadgePalette(background: .green, foreground: .white)
    case .tag(.info):
        return NativeBadgePalette(background: Color.blue.opacity(0.14), foreground: .blue)
    case .tag(.warning):
        return NativeBadgePalette(background: Color.orange.opacity(0.16), foreground: .orange)
    case .tag(.accent):
        return NativeBadgePalette(background: Color.purple.opacity(0.16), foreground: .purple)
    case .tag(.neutral):
        return NativeBadgePalette(background: Color.primary.opacity(0.08), foreground: .primary)
    }
}

func nativeProgressBadgePalette(_ state: NativeProgressStepState) -> NativeBadgePalette {
    switch state {
    case .complete:
        return nativeBadgePalette(.status(.success))
    case .active:
        return nativeBadgePalette(.status(.info))
    case .inactive:
        return NativeBadgePalette(background: Color.white.opacity(0.86), foreground: nativeOnboardingTextSecondary)
    }
}

func nativeShellNavigationPalette(_ state: NativeShellNavigationState) -> NativeShellNavigationPalette {
    switch state {
    case .selected:
        return NativeShellNavigationPalette(
            fill: Color.blue.opacity(0.12),
            foreground: .blue
        )
    case .default:
        return NativeShellNavigationPalette(
            fill: .clear,
            foreground: Color(red: 0.22, green: 0.28, blue: 0.4)
        )
    }
}

func nativeBannerAccentColor(_ accent: NativeInfoBannerAccent) -> Color {
    switch accent {
    case .blue:
        return .blue
    case .green:
        return .green
    case .orange:
        return .orange
    case .purple:
        return .purple
    case .red:
        return .red
    }
}

func nativeBrandMarkGradient() -> LinearGradient {
    LinearGradient(
        colors: [
            Color.blue,
            Color.purple
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

func nativeAccentColor(_ accent: NativeDeployAccent) -> Color {
    switch accent {
    case .blue:
        return .blue
    case .green:
        return .green
    case .purple:
        return .purple
    case .orange:
        return .orange
    }
}

func nativeShellBackgroundStyle() -> LinearGradient {
    LinearGradient(
        colors: [
            Color.blue.opacity(0.05),
            Color.white
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

func colorFromHex(_ hex: String) -> Color? {
    var sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    sanitized = sanitized.replacingOccurrences(of: "#", with: "")

    guard sanitized.count == 6, let value = Int(sanitized, radix: 16) else {
        return nil
    }

    let red = Double((value >> 16) & 0xFF) / 255.0
    let green = Double((value >> 8) & 0xFF) / 255.0
    let blue = Double(value & 0xFF) / 255.0
    return Color(red: red, green: green, blue: blue)
}
