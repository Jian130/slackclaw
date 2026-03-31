import Testing
@testable import ChillClawNative
@testable import ChillClawProtocol

struct DeploySupportTests {
    @Test
    func deployPresentationGroupsTargetsLikeReactAndDecoratesBadges() throws {
        let presentation = makeDeployPresentation(
            overview: .init(
                appName: "ChillClaw",
                appVersion: "0.1.2",
                platformTarget: "macOS first",
                firstRun: .init(introCompleted: true, setupCompleted: true),
                appService: .init(mode: .launchagent, installed: true, running: true, managedAtLogin: true, label: nil, summary: "Running", detail: "Loaded"),
                engine: .init(engine: "openclaw", installed: true, running: true, version: "2026.3.13", summary: "Ready", pendingGatewayApply: false, pendingGatewayApplySummary: nil, lastCheckedAt: "2026-03-24T00:00:00.000Z"),
                installSpec: .init(engine: "openclaw", desiredVersion: "latest", installSource: "npm-local", prerequisites: [], installPath: nil),
                capabilities: .init(engine: "openclaw", supportsInstall: true, supportsUpdate: true, supportsRecovery: true, supportsStreaming: true, runtimeModes: ["gateway"], supportedChannels: ["telegram"], starterSkillCategories: [], futureLocalModelFamilies: []),
                installChecks: [],
                channelSetup: .init(baseOnboardingCompleted: true, channels: [], nextChannelId: nil, gatewayStarted: true, gatewaySummary: "Gateway ready"),
                profiles: [],
                templates: [],
                healthChecks: [],
                recoveryActions: [],
                recentTasks: []
            ),
            targets: .init(
                checkedAt: "2026-03-24T00:00:00.000Z",
                targets: [
                    .init(
                        id: "standard",
                        title: "OpenClaw Standard",
                        description: "Reuse a compatible install.",
                        installMode: "system",
                        installed: true,
                        installable: true,
                        planned: false,
                        recommended: true,
                        active: true,
                        version: "2026.3.13",
                        desiredVersion: "latest",
                        latestVersion: "2026.3.14",
                        updateAvailable: true,
                        summary: "Installed and active.",
                        updateSummary: "One update available.",
                        requirements: ["4GB RAM", "10GB Disk"],
                        requirementsSourceUrl: "https://example.com/standard"
                    ),
                    .init(
                        id: "managed-local",
                        title: "OpenClaw Managed Local",
                        description: "ChillClaw-managed runtime.",
                        installMode: "managed-local",
                        installed: false,
                        installable: true,
                        planned: false,
                        recommended: false,
                        active: false,
                        version: nil,
                        desiredVersion: "latest",
                        latestVersion: "2026.3.14",
                        updateAvailable: false,
                        summary: "Ready to install.",
                        updateSummary: nil,
                        requirements: ["4GB RAM"],
                        requirementsSourceUrl: nil
                    ),
                    .init(
                        id: "zeroclaw",
                        title: "ZeroClaw",
                        description: "Planned future adapter.",
                        installMode: "future",
                        installed: false,
                        installable: false,
                        planned: true,
                        recommended: false,
                        active: false,
                        version: nil,
                        desiredVersion: nil,
                        latestVersion: nil,
                        updateAvailable: false,
                        summary: "Coming soon.",
                        updateSummary: nil,
                        requirements: [],
                        requirementsSourceUrl: nil
                    )
                ]
            )
        )

        #expect(presentation.installedTargets.count == 1)
        #expect(presentation.availableTargets.count == 1)
        #expect(presentation.plannedTargets.count == 1)

        let standard = try #require(presentation.installedTargets.first)
        #expect(standard.badges.contains(.installed))
        #expect(standard.badges.contains(.current))
        #expect(standard.badges.contains(.updateAvailable))
        #expect(standard.features.isEmpty == false)

        let managedLocal = try #require(presentation.availableTargets.first)
        #expect(managedLocal.badges.isEmpty)
        #expect(managedLocal.primaryAction == .install)

        let planned = try #require(presentation.plannedTargets.first)
        #expect(planned.badges.contains(.comingSoon))
        #expect(planned.primaryAction == nil)

        #expect(presentation.summaryCards.count == 3)
    }
}
