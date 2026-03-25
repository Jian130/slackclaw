import Foundation
import SlackClawProtocol

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
    let activeTaskCount: Int
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
    aiTeamOverview: AITeamOverview?
) -> NativeDashboardPresentation {
    let readyCount = aiTeamOverview?.members.filter { $0.status == "ready" }.count ?? 0
    let busyCount = aiTeamOverview?.members.filter { $0.status == "busy" }.count ?? 0
    let activeTaskCount = aiTeamOverview?.members.reduce(0) { $0 + $1.activeTaskCount } ?? 0
    let channelReadyCount = overview.channelSetup.channels.filter { channel in
        channel.status == "completed" || channel.status == "ready"
    }.count

    let connectedModelsDetail: String = {
        guard overview.engine.installed else { return "OpenClaw is not installed." }
        if let defaultModel = modelConfig?.defaultModel, !defaultModel.isEmpty {
            return defaultModel
        }
        return "No configured models"
    }()

    let metrics = [
        NativeDashboardMetric(title: "Engine", value: overview.engine.installed ? "Installed" : "Missing", detail: overview.engine.summary),
        NativeDashboardMetric(title: "Connected Models", value: "\(modelConfig?.configuredModelKeys.count ?? 0)", detail: connectedModelsDetail),
        NativeDashboardMetric(title: "AI Members", value: "\(aiTeamOverview?.members.count ?? 0)", detail: "\(readyCount) ready / \(busyCount) busy"),
        NativeDashboardMetric(title: "Active Tasks", value: "\(activeTaskCount)", detail: "In Progress"),
        NativeDashboardMetric(title: "Channels Ready", value: "\(channelReadyCount)", detail: overview.channelSetup.gatewaySummary)
    ]

    let employeeRows = aiTeamOverview?.members.map { member in
        NativeDashboardEmployeeRow(
            id: member.id,
            name: member.name,
            jobTitle: member.jobTitle,
            status: member.status,
            activeTaskCount: member.activeTaskCount,
            currentStatus: member.currentStatus,
            avatar: member.avatar
        )
    } ?? []

    let activityRows = aiTeamOverview?.activity.map { item in
        NativeDashboardActivityRow(
            id: item.id,
            memberName: item.memberName ?? "SlackClaw",
            action: item.action,
            description: item.description,
            timestamp: item.timestamp,
            tone: dashboardTone(for: item.tone)
        )
    } ?? []

    let healthItems = [
        NativeDashboardHealthItem(title: "OpenClaw deployed", status: overview.engine.installed ? "Active" : "Missing", tone: overview.engine.installed ? .success : .warning),
        NativeDashboardHealthItem(title: "Gateway reachable", status: overview.engine.running ? "Running" : "Stopped", tone: overview.engine.running ? .success : .warning),
        NativeDashboardHealthItem(title: "Channels configured", status: channelReadyCount > 0 ? "\(channelReadyCount) ready" : "Pending", tone: channelReadyCount > 0 ? .success : .warning),
        NativeDashboardHealthItem(title: "Health blockers", status: overview.healthChecks.contains(where: { $0.severity == "error" }) ? "Review" : "Clear", tone: overview.healthChecks.contains(where: { $0.severity == "error" }) ? .warning : .success),
        NativeDashboardHealthItem(title: "AI member roster", status: "\(aiTeamOverview?.members.count ?? 0) members", tone: .info)
    ]

    return NativeDashboardPresentation(
        heroVersion: overview.engine.version ?? overview.installSpec.desiredVersion,
        metrics: metrics,
        employeeRows: employeeRows,
        activityRows: activityRows,
        healthItems: healthItems
    )
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
