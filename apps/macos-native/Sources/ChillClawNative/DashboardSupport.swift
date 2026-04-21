import Foundation
import ChillClawProtocol

enum NativeDashboardTone: Equatable {
    case success
    case warning
    case info
    case neutral
}

struct NativeDashboardMetric: Equatable {
    let title: String
    let value: String
    let detail: String
}

struct NativeDashboardEmployeeRow: Identifiable {
    let id: String
    let name: String
    let jobTitle: String
    let status: String
    let statusTone: NativeDashboardTone
    let activeTaskCount: Int
    let activeTaskLabel: String
    let currentStatus: String
    let avatar: MemberAvatar
}

struct NativeDashboardActivityRow: Identifiable {
    let id: String
    let memberName: String
    let action: String
    let description: String
    let timestamp: String
    let tone: NativeDashboardTone
}

struct NativeDashboardHealthItem: Equatable {
    let title: String
    let status: String
    let tone: NativeDashboardTone
}

struct NativeDashboardPresentation {
    let heroVersion: String
    let metrics: [NativeDashboardMetric]
    let employeeRows: [NativeDashboardEmployeeRow]
    let activityRows: [NativeDashboardActivityRow]
    let healthItems: [NativeDashboardHealthItem]
}

func makeDashboardPresentation(
    overview: ProductOverview,
    modelConfig: ModelConfigOverview?,
    aiTeamOverview: AITeamOverview?,
    capabilityOverview: CapabilityOverview? = nil,
    toolOverview: ToolOverview? = nil,
    localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()
) -> NativeDashboardPresentation {
    let copy = nativeDashboardCopy(localeIdentifier: localeIdentifier)
    let readyCount = aiTeamOverview?.members.filter { $0.status == "ready" }.count ?? 0
    let busyCount = aiTeamOverview?.members.filter { $0.status == "busy" }.count ?? 0
    let activeTaskCount = aiTeamOverview?.members.reduce(0) { $0 + $1.activeTaskCount } ?? 0
    let channelReadyCount = overview.channelSetup.channels.filter { channel in
        channel.status == "completed" || channel.status == "ready"
    }.count

    let connectedModelsDetail: String = {
        guard overview.engine.installed else { return copy.openClawNotInstalled }
        if overview.localRuntime?.activeInOpenClaw == true {
            return overview.localRuntime?.summary ?? copy.noConfiguredModels
        }
        if let defaultModel = modelConfig?.defaultModel, !defaultModel.isEmpty {
            return defaultModel
        }
        return copy.noConfiguredModels
    }()

    var metrics = [
        NativeDashboardMetric(title: copy.engineMetricTitle, value: overview.engine.installed ? copy.engineInstalled : copy.engineMissing, detail: overview.engine.summary),
        NativeDashboardMetric(title: copy.connectedModelsMetricTitle, value: "\(modelConfig?.configuredModelKeys.count ?? 0)", detail: connectedModelsDetail),
        NativeDashboardMetric(title: copy.aiMembersMetricTitle, value: "\(aiTeamOverview?.members.count ?? 0)", detail: copy.readyBusySummary(ready: readyCount, busy: busyCount)),
        NativeDashboardMetric(title: copy.activeTasksMetricTitle, value: "\(activeTaskCount)", detail: copy.inProgress)
    ]

    if let capabilityOverview {
        metrics.append(
            NativeDashboardMetric(
                title: copy.capabilitiesReadyMetricTitle,
                value: "\(nativeDashboardReadyCapabilityCount(capabilityOverview))",
                detail: capabilityOverview.summary
            )
        )
    }

    if let toolOverview {
        metrics.append(
            NativeDashboardMetric(
                title: copy.toolsReadyMetricTitle,
                value: "\(nativeDashboardReadyToolCount(toolOverview))",
                detail: toolOverview.summary
            )
        )
    }

    metrics.append(NativeDashboardMetric(title: copy.channelsReadyMetricTitle, value: "\(channelReadyCount)", detail: overview.channelSetup.gatewaySummary))

    let employeeRows = aiTeamOverview?.members.map { member in
        NativeDashboardEmployeeRow(
            id: member.id,
            name: member.name,
            jobTitle: member.jobTitle,
            status: copy.localizedMemberStatus(member.status),
            statusTone: member.status == "ready" ? .success : member.status == "busy" ? .info : .neutral,
            activeTaskCount: member.activeTaskCount,
            activeTaskLabel: copy.activeCountLabel(member.activeTaskCount),
            currentStatus: member.currentStatus,
            avatar: member.avatar
        )
    } ?? []

    let activityRows = aiTeamOverview?.activity.map { item in
        NativeDashboardActivityRow(
            id: item.id,
            memberName: item.memberName ?? copy.defaultActivityMemberName,
            action: item.action,
            description: item.description,
            timestamp: item.timestamp,
            tone: dashboardTone(for: item.tone)
        )
    } ?? []

    var healthItems = [
        NativeDashboardHealthItem(title: copy.openClawDeployedTitle, status: overview.engine.installed ? copy.healthActive : copy.healthMissing, tone: overview.engine.installed ? .success : .warning),
        NativeDashboardHealthItem(title: copy.gatewayReachableTitle, status: overview.engine.running ? copy.healthRunning : copy.healthStopped, tone: overview.engine.running ? .success : .warning),
        NativeDashboardHealthItem(title: copy.channelsConfiguredTitle, status: channelReadyCount > 0 ? copy.readyChannelLabel(channelReadyCount) : copy.healthPending, tone: channelReadyCount > 0 ? .success : .warning),
        NativeDashboardHealthItem(title: copy.healthBlockersTitle, status: overview.healthChecks.contains(where: { $0.severity == "error" }) ? copy.healthReview : copy.healthClear, tone: overview.healthChecks.contains(where: { $0.severity == "error" }) ? .warning : .success),
        NativeDashboardHealthItem(title: copy.aiMemberRosterTitle, status: copy.memberCountLabel(aiTeamOverview?.members.count ?? 0), tone: .info)
    ]

    if let toolOverview {
        healthItems.insert(
            NativeDashboardHealthItem(
                title: copy.toolsHealthTitle,
                status: nativeDashboardHasToolAttention(toolOverview) ? copy.healthReview : copy.healthClear,
                tone: nativeDashboardHasToolAttention(toolOverview) ? .warning : .success
            ),
            at: min(2, healthItems.count)
        )
    }

    if let capabilityOverview {
        healthItems.insert(
            NativeDashboardHealthItem(
                title: copy.capabilitiesHealthTitle,
                status: nativeDashboardHasCapabilityAttention(capabilityOverview) ? copy.healthReview : copy.healthClear,
                tone: nativeDashboardHasCapabilityAttention(capabilityOverview) ? .warning : .success
            ),
            at: min(2, healthItems.count)
        )
    }

    if let localRuntime = overview.localRuntime {
        healthItems.insert(
            NativeDashboardHealthItem(
                title: "Local AI runtime",
                status: localRuntime.status == "ready"
                    ? copy.healthActive
                    : (localRuntime.status == "degraded" || localRuntime.status == "failed")
                        ? copy.healthReview
                        : (localRuntime.recommendation == "local" ? "Available" : "Cloud"),
                tone: localRuntime.status == "ready"
                    ? .success
                    : (localRuntime.status == "degraded" || localRuntime.status == "failed")
                        ? .warning
                        : .neutral
            ),
            at: min(2, healthItems.count)
        )
    }

    return NativeDashboardPresentation(
        heroVersion: overview.engine.version ?? overview.installSpec.desiredVersion,
        metrics: metrics,
        employeeRows: employeeRows,
        activityRows: activityRows,
        healthItems: healthItems
    )
}

private func nativeDashboardReadyCapabilityCount(_ overview: CapabilityOverview) -> Int {
    overview.entries.filter { $0.status == "ready" }.count
}

private func nativeDashboardReadyToolCount(_ overview: ToolOverview) -> Int {
    overview.entries.filter { $0.status == "ready" }.count
}

private func nativeDashboardHasCapabilityAttention(_ overview: CapabilityOverview) -> Bool {
    overview.entries.contains { nativeDashboardNeedsAttention($0.status) }
}

private func nativeDashboardHasToolAttention(_ overview: ToolOverview) -> Bool {
    overview.entries.contains { nativeDashboardNeedsAttention($0.status) }
}

private func nativeDashboardNeedsAttention(_ status: String) -> Bool {
    status == "missing" || status == "disabled" || status == "blocked" || status == "error"
}

private func dashboardTone(for rawTone: String) -> NativeDashboardTone {
    switch rawTone {
    case "completed":
        return .success
    case "started", "generated":
        return .info
    case "updated":
        return .warning
    default:
        return .neutral
    }
}
