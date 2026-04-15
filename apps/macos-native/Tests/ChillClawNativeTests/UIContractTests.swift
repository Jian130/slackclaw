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
    func nativeSidebarUsesDailyWorkflowNavigationOrder() {
        #expect(NativeSection.navigationSections == [.chat, .dashboard, .deploy, .configuration, .skills, .plugins, .settings])
        #expect(nativeSectionTitle(.deploy, localeIdentifier: "en") == "Claws")
        #expect(nativeSectionTitle(.plugins, localeIdentifier: "en") == "Tools (plugins)")
        #expect(NativeSection.navigationSections.contains(.team) == false)
        #expect(NativeSection.navigationSections.contains(.members) == false)
        #expect(NativeSection.allCases.contains(.team))
        #expect(NativeSection.allCases.contains(.deploy))
        #expect(NativeSection.allCases.contains(.members))
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
    func nativeBrandSurfacesUseTheWordlessLogoResource() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let shellSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/ChillClawNativeApp.swift"),
            encoding: .utf8
        )
        let onboardingSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/OnboardingView.swift"),
            encoding: .utf8
        )
        let brandSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/UI/NativeBrandMark.swift"),
            encoding: .utf8
        )

        #expect(shellSource.contains("NativeBrandMark(size: .sidebar)"))
        #expect(onboardingSource.contains("NativeBrandMark(size: .onboarding)"))
        #expect(brandSource.contains("nativeBrandLogoImage()"))
        #expect(brandSource.contains("Image(nsImage: logoImage)"))
    }

    @Test
    func nativeBrandImageResourcesResolveFromBundle() throws {
        #expect(Bundle.module.url(forResource: "ChillClawBrandLogo", withExtension: "png") != nil)
        #expect(Bundle.module.url(forResource: "ChillClawAppIcon", withExtension: "png") != nil)
        #expect(Bundle.module.url(forResource: "ChillClawAppIcon", withExtension: "icns") != nil)
    }

    @Test
    func nativePackagedResourceHelpersAvoidSwiftPMBundleModuleTrap() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let brandSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/UI/NativeBrandMark.swift"),
            encoding: .utf8
        )
        let onboardingSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/OnboardingSupport.swift"),
            encoding: .utf8
        )
        let launchSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/LaunchSupport.swift"),
            encoding: .utf8
        )

        #expect(!brandSource.contains("Bundle.module"))
        #expect(!onboardingSource.contains("Bundle.module"))
        #expect(!launchSource.contains("Bundle.module"))
        #expect(brandSource.contains("nativeBundledResourceURL"))
        #expect(onboardingSource.contains("nativeBundledResourceURL"))
        #expect(launchSource.contains("nativeBundledResourceURL"))
    }

    @Test
    func nativeBundledResourceURLFindsPackagedRootAndResourceBundleFiles() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("chillclaw-resource-test-\(UUID().uuidString)")
        let bundle = root.appendingPathComponent("ChillClawNative_ChillClawNative.bundle")
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let rootAsset = root.appendingPathComponent("ChillClawBrandLogo.png")
        let bundleAsset = bundle.appendingPathComponent("onboarding-guide.png")
        try Data([1]).write(to: rootAsset)
        try Data([2]).write(to: bundleAsset)

        #expect(
            nativeBundledResourceURL(forResource: "ChillClawBrandLogo", withExtension: "png", resourceRoots: [root])?
                .standardizedFileURL == rootAsset.standardizedFileURL
        )
        #expect(
            nativeBundledResourceURL(forResource: "onboarding-guide", withExtension: "png", resourceRoots: [root])?
                .standardizedFileURL == bundleAsset.standardizedFileURL
        )
    }

    @Test
    @MainActor
    func nativeBrandLogoImageLoadsFromBundledResource() throws {
        let image = try #require(nativeBrandLogoImage())

        #expect(image.size.width > 0)
        #expect(image.size.height > 0)
    }

    @Test
    func nativeBrandMarkRendersTransparentLogoWithoutContainerChrome() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let brandSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/ChillClawNative/UI/NativeBrandMark.swift"),
            encoding: .utf8
        )

        #expect(brandSource.contains("Image(nsImage: logoImage)"))
        #expect(!brandSource.contains("RoundedRectangle("))
        #expect(!brandSource.contains(".strokeBorder("))
        #expect(!brandSource.contains(".fill(Color.white"))
    }

    @Test
    func macInstallerBuilderCreatesDragAndDropDmgWithNativeIconResources() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let repoRoot = packageRoot
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let scriptSource = try String(
            contentsOf: repoRoot.appendingPathComponent("scripts/build-macos-installer.mjs"),
            encoding: .utf8
        )

        #expect(scriptSource.contains("<key>CFBundleIconFile</key>"))
        #expect(scriptSource.contains("<string>ChillClawAppIcon.icns</string>"))
        #expect(scriptSource.contains("<key>CFBundleIconName</key>"))
        #expect(scriptSource.contains("<string>ChillClawAppIcon</string>"))
        #expect(scriptSource.contains("-macOS.dmg"))
        #expect(scriptSource.contains("hdiutil"))
        #expect(scriptSource.contains("DMG_STAGING_DIR"))
        #expect(scriptSource.contains("symlink(\"/Applications\""))
        #expect(scriptSource.contains("PkgInfo"))
        #expect(scriptSource.contains("APPL????"))
        #expect(scriptSource.contains("applyInstallerFileIcon"))
        #expect(scriptSource.contains("\"sips\", [\"-i\""))
        #expect(scriptSource.contains("\"DeRez\""))
        #expect(scriptSource.contains("\"Rez\""))
        #expect(scriptSource.contains("\"SetFile\""))
    }

    @Test
    func macNativeExecutableProductUsesProductName() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let repoRoot = packageRoot
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let packageSource = try String(
            contentsOf: packageRoot.appendingPathComponent("Package.swift"),
            encoding: .utf8
        )
        let rootPackageSource = try String(
            contentsOf: repoRoot.appendingPathComponent("package.json"),
            encoding: .utf8
        )
        let scriptSource = try String(
            contentsOf: repoRoot.appendingPathComponent("scripts/build-macos-installer.mjs"),
            encoding: .utf8
        )

        #expect(packageSource.contains(#".executable(name: "ChillClaw", targets: ["ChillClawNative"])"#))
        #expect(rootPackageSource.contains(#"--product ChillClaw""#))
        #expect(scriptSource.contains(#"const NATIVE_EXECUTABLE_NAME = APP_NAME;"#))
        #expect(!rootPackageSource.contains(#"--product ChillClawNative"#))
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
