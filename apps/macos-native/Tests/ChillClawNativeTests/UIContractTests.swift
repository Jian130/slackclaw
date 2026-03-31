import CoreGraphics
import Foundation
import Testing
@testable import ChillClawNative

struct UIContractTests {
    @Test
    func deployBadgesMapToSharedBadgeSemantics() {
        #expect(nativeDeployBadgeSemantic(.installed) == .status(.success))
        #expect(nativeDeployBadgeSemantic(.current) == .status(.info))
        #expect(nativeDeployBadgeSemantic(.updateAvailable) == .status(.warning))
        #expect(nativeDeployBadgeSemantic(.recommended) == .tag(.success))
        #expect(nativeDeployBadgeSemantic(.comingSoon) == .tag(.neutral))
    }

    @Test
    func workspaceMetricColumnsFollowSharedBreakpoints() {
        #expect(nativeWorkspaceMetricColumnCount(for: 1400) == 5)
        #expect(nativeWorkspaceMetricColumnCount(for: 1180) == 3)
        #expect(nativeWorkspaceMetricColumnCount(for: 820) == 2)
        #expect(nativeWorkspaceMetricColumnCount(for: 700) == 1)
    }

    @Test
    func operationsSummaryColumnsFollowSharedBreakpoints() {
        #expect(nativeOperationsSummaryColumnCount(for: 1400) == 3)
        #expect(nativeOperationsSummaryColumnCount(for: 980) == 2)
        #expect(nativeOperationsSummaryColumnCount(for: 720) == 1)
    }

    @Test
    func workspaceCollectionCardsUseSharedMinimumHeight() {
        #expect(nativeWorkspaceCollectionCardMinHeight == 132)
    }

    @Test
    func pageContentWidthModesMapToSharedMaxWidth() {
        #expect(nativePageContentMaxWidth(.centered) == nativeCenteredPageMaxWidth)
        #expect(nativePageContentMaxWidth(.full) == nil)
    }

    @Test
    func guidedFlowLayoutModeCentersCenteredPages() {
        #expect(nativeGuidedFlowLayoutMode(.centered) == .centered)
        #expect(nativeGuidedFlowLayoutMode(.full) == .leading)
    }

    @Test
    func successfulModelSetupAdvancesToChannelStep() {
        #expect(nativeOnboardingNextStepAfterModelSave(requiresInteraction: false) == .channel)
        #expect(nativeOnboardingNextStepAfterModelSave(requiresInteraction: true) == .model)
    }

    @Test
    func onboardingForwardActionsMapToProminentNativeCTAStyle() {
        #expect(nativeOnboardingActionButtonVariant(nativeOnboardingForwardActionVariant()) == .onboardingProminent)
    }

    @Test
    func onboardingProgressAndSelectionStatesMapToSharedSemantics() {
        #expect(nativeOnboardingProgressState(active: true, complete: false) == .active)
        #expect(nativeOnboardingProgressState(active: false, complete: true) == .complete)
        #expect(nativeOnboardingProgressState(active: false, complete: false) == .inactive)

        #expect(nativeOnboardingSelectionState(selected: true) == .selected)
        #expect(nativeOnboardingSelectionState(selected: false) == .default)
    }

    @Test
    func shellNavigationSelectionMapsToSharedSemantics() {
        #expect(nativeShellNavigationState(selected: true) == .selected)
        #expect(nativeShellNavigationState(selected: false) == .default)
    }

    @Test
    func shellSidebarCollapseHelperMapsToSharedWidths() {
        #expect(nativeShellSidebarWidth(isCollapsed: false) == 312)
        #expect(nativeShellSidebarWidth(isCollapsed: true) == 0)
    }

    @Test
    func nativeSidebarHidesAITeamFromNavigationOnly() {
        #expect(NativeSection.navigationSections.contains(.team) == false)
        #expect(NativeSection.allCases.contains(.team))
    }

    @Test
    func nativeSidebarPlacesLanguagePickerBelowStatusCard() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/ChillClawNativeApp.swift"),
            encoding: .utf8
        )

        let statusIndex = try #require(source.range(of: "SurfaceCard(title: copy.sidebarStatusTitle")?.lowerBound)
        let localeIndex = try #require(source.range(of: "NativeLocalePicker(")?.lowerBound)

        #expect(statusIndex < localeIndex)
    }

    @Test
    func nativeSidebarLocalePickerUsesFullWidthLargeShellSizing() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/LocalePicker.swift"),
            encoding: .utf8
        )

        #expect(source.contains(".frame(maxWidth: .infinity, alignment: .leading)"))
        #expect(source.contains(".font(.system(size: 18, weight: .medium))"))
    }

    @Test
    func auditedNativeViewsUseSharedCornerRadiusConstants() throws {
        let sourceFiles = [
            "Sources/ChillClawNative/UI/NativeUIPrimitives.swift",
            "Sources/ChillClawNative/OnboardingView.swift",
            "Sources/ChillClawNative/Screens.swift",
            "Sources/ChillClawNative/LocalePicker.swift",
        ]
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let rawCornerRadiusPattern = /cornerRadius:\s*\d+/

        for relativePath in sourceFiles {
            let fileURL = packageRoot.appendingPathComponent(relativePath)
            let source = try String(contentsOf: fileURL, encoding: .utf8)
            #expect(
                source.firstMatch(of: rawCornerRadiusPattern) == nil,
                "\(relativePath) should use NativeUI or onboarding radius constants"
            )
        }
    }

    @Test
    func deployScreenAvoidsUnsupportedRocketSymbol() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(
            source.contains("\"rocket\"") == false,
            "Deploy screen should avoid the unsupported 'rocket' SF Symbol"
        )
    }

    @Test
    func sharedActionButtonsUseBusyGlyphInsteadOfPlainProgressView() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/UI/NativeUIPrimitives.swift"),
            encoding: .utf8
        )

        #expect(
            source.contains("NativeBusyGlyph()"),
            "Shared native action buttons should render the branded busy glyph for slow actions"
        )
    }

    @Test
    func configurationScreenTracksPendingBusyActions() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(
            source.contains("pendingConfigurationAction"),
            "Configuration screen should keep explicit pending action state for slow buttons"
        )
    }
}
