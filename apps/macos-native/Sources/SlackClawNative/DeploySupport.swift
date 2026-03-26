import Foundation
import SlackClawProtocol

enum NativeDeployBadge: Hashable {
    case installed
    case current
    case updateAvailable
    case recommended
    case comingSoon
}

enum NativeDeployActionKind: Hashable {
    case install
    case update
    case uninstall
}

enum NativeDeployAccent: Hashable {
    case blue
    case green
    case purple
    case orange
}

struct NativeDeployTargetPresentation: Identifiable, Equatable {
    let id: String
    let title: String
    let description: String
    let summary: String
    let installMode: String
    let version: String?
    let latestVersion: String?
    let updateSummary: String?
    let requirements: [String]
    let requirementsSourceUrl: String?
    let icon: String
    let accent: NativeDeployAccent
    let features: [String]
    let badges: [NativeDeployBadge]
    let primaryAction: NativeDeployActionKind?
    let secondaryActions: [NativeDeployActionKind]
}

struct NativeDeploySummaryCard: Identifiable, Equatable {
    let id: String
    let title: String
    let body: String
    let symbol: String
    let accent: NativeDeployAccent
}

struct NativeDeployPresentation: Equatable {
    let installedTargets: [NativeDeployTargetPresentation]
    let availableTargets: [NativeDeployTargetPresentation]
    let plannedTargets: [NativeDeployTargetPresentation]
    let summaryCards: [NativeDeploySummaryCard]
    let lastCheckedAt: String?
}

private struct NativeDeployVariantMeta {
    let icon: String
    let accent: NativeDeployAccent
    let features: [String]
}

private let nativeDeployVariantMeta: [String: NativeDeployVariantMeta] = [
    "standard": .init(
        icon: "🦞",
        accent: .blue,
        features: [
            "Full AI capabilities",
            "Multi-model support",
            "All standard skills",
            "Complete API access"
        ]
    ),
    "managed-local": .init(
        icon: "🚀",
        accent: .green,
        features: [
            "ChillClaw-managed runtime",
            "Local isolation under app data",
            "Pinned version lifecycle",
            "Fast guided recovery"
        ]
    ),
    "zeroclaw": .init(
        icon: "🧪",
        accent: .purple,
        features: [
            "Reserved future engine slot",
            "Planned adapter-backed install path",
            "Same onboarding and config surfaces",
            "Not available in v0.1"
        ]
    ),
    "ironclaw": .init(
        icon: "🛡️",
        accent: .orange,
        features: [
            "Reserved future engine slot",
            "Adapter-ready product architecture",
            "Same deploy and config surfaces",
            "Not available in v0.1"
        ]
    )
]

func makeDeployPresentation(
    overview: ProductOverview?,
    targets: DeploymentTargetsResponse?
) -> NativeDeployPresentation {
    let decoratedTargets = (targets?.targets ?? []).map { target in
        decorateDeployTarget(target)
    }

    return NativeDeployPresentation(
        installedTargets: decoratedTargets.filter(\.isInstalledGroup),
        availableTargets: decoratedTargets.filter(\.isAvailableGroup),
        plannedTargets: decoratedTargets.filter(\.isPlannedGroup),
        summaryCards: [
            .init(
                id: "local",
                title: "Local-first runtime",
                body: "OpenClaw stays on your Mac and ChillClaw manages the setup flow for you.",
                symbol: "externaldrive.badge.checkmark",
                accent: .blue
            ),
            .init(
                id: "fast",
                title: "One-click deploy",
                body: "Detect installs, reuse compatible runtimes, and finish setup without the terminal.",
                symbol: "bolt.circle.fill",
                accent: .green
            ),
            .init(
                id: "safe",
                title: "Recovery ready",
                body: overview?.engine.pendingGatewayApply == true
                    ? "ChillClaw tracks staged changes and tells you when the gateway needs an apply."
                    : "ChillClaw checks versions, runtime health, and gateway status before reporting ready.",
                symbol: "shield.lefthalf.filled",
                accent: .purple
            )
        ],
        lastCheckedAt: targets?.checkedAt
    )
}

private func decorateDeployTarget(_ target: DeploymentTargetStatus) -> NativeDeployTargetPresentation {
    let meta = nativeDeployVariantMeta[target.id] ?? .init(icon: "🦞", accent: .blue, features: [])
    let badges = deployBadges(for: target)
    let actions = deployActions(for: target)

    return NativeDeployTargetPresentation(
        id: target.id,
        title: target.title,
        description: target.description,
        summary: target.summary,
        installMode: target.installMode,
        version: target.version,
        latestVersion: target.latestVersion ?? (!target.updateAvailable ? target.version : nil),
        updateSummary: target.updateSummary,
        requirements: target.requirements ?? [],
        requirementsSourceUrl: target.requirementsSourceUrl,
        icon: meta.icon,
        accent: meta.accent,
        features: meta.features,
        badges: badges,
        primaryAction: actions.first,
        secondaryActions: Array(actions.dropFirst())
    )
}

private func deployBadges(for target: DeploymentTargetStatus) -> [NativeDeployBadge] {
    var badges: [NativeDeployBadge] = []
    if target.installed {
        badges.append(.installed)
    }
    if target.active {
        badges.append(.current)
    }
    if target.updateAvailable {
        badges.append(.updateAvailable)
    }
    if target.recommended && !target.installed {
        badges.append(.recommended)
    }
    if target.planned {
        badges.append(.comingSoon)
    }
    return badges
}

private func deployActions(for target: DeploymentTargetStatus) -> [NativeDeployActionKind] {
    if target.planned || !target.installable {
        return []
    }

    if !target.installed {
        return [.install]
    }

    if target.id == "standard" || target.id == "managed-local" {
        return [.update, .uninstall]
    }

    return [.uninstall]
}

private extension NativeDeployTargetPresentation {
    var isInstalledGroup: Bool { badges.contains(.installed) }
    var isAvailableGroup: Bool { !badges.contains(.installed) && !badges.contains(.comingSoon) }
    var isPlannedGroup: Bool { badges.contains(.comingSoon) }
}
