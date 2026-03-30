import Foundation

public enum SlackClawTaskProgressStatus: String, Codable, Sendable {
    case pending
    case running
    case completed
    case failed
}

public enum SlackClawDeployPhase: String, Codable, Sendable {
    case detecting
    case reusing
    case installing
    case updating
    case uninstalling
    case verifying
    case restartingGateway = "restarting-gateway"
}

public enum SlackClawConfigResource: String, Codable, Sendable {
    case models
    case channels
    case skills
    case aiEmployees = "ai-employees"
    case onboarding
    case gateway
}

public enum SlackClawEvent: Codable, Sendable {
    case overviewUpdated(snapshot: RevisionedSnapshot<ProductOverview>)
    case aiTeamUpdated(snapshot: RevisionedSnapshot<AITeamOverview>)
    case modelConfigUpdated(snapshot: RevisionedSnapshot<ModelConfigOverview>)
    case channelConfigUpdated(snapshot: RevisionedSnapshot<ChannelConfigOverview>)
    case pluginConfigUpdated(snapshot: RevisionedSnapshot<PluginConfigOverview>)
    case skillCatalogUpdated(snapshot: RevisionedSnapshot<SkillCatalogOverview>)
    case presetSkillSyncUpdated(snapshot: RevisionedSnapshot<PresetSkillSyncOverview>)
    case deployProgress(correlationId: String, targetId: String, phase: SlackClawDeployPhase, percent: Int?, message: String)
    case deployCompleted(correlationId: String, targetId: String, status: String, message: String, engineStatus: EngineStatus)
    case gatewayStatus(reachable: Bool, pendingGatewayApply: Bool, summary: String)
    case taskProgress(taskId: String, status: SlackClawTaskProgressStatus, message: String)
    case chatStream(threadId: String, sessionKey: String, payload: ChatStreamEvent)
    case channelSessionUpdated(channelId: SupportedChannelId, session: ChannelSession)
    case configApplied(resource: SlackClawConfigResource, summary: String)

    private enum CodingKeys: String, CodingKey {
        case type
        case correlationId
        case targetId
        case phase
        case percent
        case message
        case status
        case engineStatus
        case reachable
        case pendingGatewayApply
        case summary
        case taskId
        case threadId
        case sessionKey
        case payload
        case channelId
        case session
        case resource
        case snapshot
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "overview.updated":
            self = .overviewUpdated(snapshot: try container.decode(RevisionedSnapshot<ProductOverview>.self, forKey: .snapshot))
        case "ai-team.updated":
            self = .aiTeamUpdated(snapshot: try container.decode(RevisionedSnapshot<AITeamOverview>.self, forKey: .snapshot))
        case "model-config.updated":
            self = .modelConfigUpdated(snapshot: try container.decode(RevisionedSnapshot<ModelConfigOverview>.self, forKey: .snapshot))
        case "channel-config.updated":
            self = .channelConfigUpdated(snapshot: try container.decode(RevisionedSnapshot<ChannelConfigOverview>.self, forKey: .snapshot))
        case "plugin-config.updated":
            self = .pluginConfigUpdated(snapshot: try container.decode(RevisionedSnapshot<PluginConfigOverview>.self, forKey: .snapshot))
        case "skill-catalog.updated":
            self = .skillCatalogUpdated(snapshot: try container.decode(RevisionedSnapshot<SkillCatalogOverview>.self, forKey: .snapshot))
        case "preset-skill-sync.updated":
            self = .presetSkillSyncUpdated(snapshot: try container.decode(RevisionedSnapshot<PresetSkillSyncOverview>.self, forKey: .snapshot))
        case "deploy.progress":
            self = .deployProgress(
                correlationId: try container.decode(String.self, forKey: .correlationId),
                targetId: try container.decode(String.self, forKey: .targetId),
                phase: try container.decode(SlackClawDeployPhase.self, forKey: .phase),
                percent: try container.decodeIfPresent(Int.self, forKey: .percent),
                message: try container.decode(String.self, forKey: .message)
            )
        case "deploy.completed":
            self = .deployCompleted(
                correlationId: try container.decode(String.self, forKey: .correlationId),
                targetId: try container.decode(String.self, forKey: .targetId),
                status: try container.decode(String.self, forKey: .status),
                message: try container.decode(String.self, forKey: .message),
                engineStatus: try container.decode(EngineStatus.self, forKey: .engineStatus)
            )
        case "gateway.status":
            self = .gatewayStatus(
                reachable: try container.decode(Bool.self, forKey: .reachable),
                pendingGatewayApply: try container.decode(Bool.self, forKey: .pendingGatewayApply),
                summary: try container.decode(String.self, forKey: .summary)
            )
        case "task.progress":
            self = .taskProgress(
                taskId: try container.decode(String.self, forKey: .taskId),
                status: try container.decode(SlackClawTaskProgressStatus.self, forKey: .status),
                message: try container.decode(String.self, forKey: .message)
            )
        case "chat.stream":
            self = .chatStream(
                threadId: try container.decode(String.self, forKey: .threadId),
                sessionKey: try container.decode(String.self, forKey: .sessionKey),
                payload: try container.decode(ChatStreamEvent.self, forKey: .payload)
            )
        case "channel.session.updated":
            self = .channelSessionUpdated(
                channelId: try container.decode(SupportedChannelId.self, forKey: .channelId),
                session: try container.decode(ChannelSession.self, forKey: .session)
            )
        case "config.applied":
            self = .configApplied(
                resource: try container.decode(SlackClawConfigResource.self, forKey: .resource),
                summary: try container.decode(String.self, forKey: .summary)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unsupported SlackClaw event type: \(type)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case let .overviewUpdated(snapshot):
            try container.encode("overview.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .aiTeamUpdated(snapshot):
            try container.encode("ai-team.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .modelConfigUpdated(snapshot):
            try container.encode("model-config.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .channelConfigUpdated(snapshot):
            try container.encode("channel-config.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .pluginConfigUpdated(snapshot):
            try container.encode("plugin-config.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .skillCatalogUpdated(snapshot):
            try container.encode("skill-catalog.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .presetSkillSyncUpdated(snapshot):
            try container.encode("preset-skill-sync.updated", forKey: .type)
            try container.encode(snapshot, forKey: .snapshot)
        case let .deployProgress(correlationId, targetId, phase, percent, message):
            try container.encode("deploy.progress", forKey: .type)
            try container.encode(correlationId, forKey: .correlationId)
            try container.encode(targetId, forKey: .targetId)
            try container.encode(phase, forKey: .phase)
            try container.encodeIfPresent(percent, forKey: .percent)
            try container.encode(message, forKey: .message)
        case let .deployCompleted(correlationId, targetId, status, message, engineStatus):
            try container.encode("deploy.completed", forKey: .type)
            try container.encode(correlationId, forKey: .correlationId)
            try container.encode(targetId, forKey: .targetId)
            try container.encode(status, forKey: .status)
            try container.encode(message, forKey: .message)
            try container.encode(engineStatus, forKey: .engineStatus)
        case let .gatewayStatus(reachable, pendingGatewayApply, summary):
            try container.encode("gateway.status", forKey: .type)
            try container.encode(reachable, forKey: .reachable)
            try container.encode(pendingGatewayApply, forKey: .pendingGatewayApply)
            try container.encode(summary, forKey: .summary)
        case let .taskProgress(taskId, status, message):
            try container.encode("task.progress", forKey: .type)
            try container.encode(taskId, forKey: .taskId)
            try container.encode(status, forKey: .status)
            try container.encode(message, forKey: .message)
        case let .chatStream(threadId, sessionKey, payload):
            try container.encode("chat.stream", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(sessionKey, forKey: .sessionKey)
            try container.encode(payload, forKey: .payload)
        case let .channelSessionUpdated(channelId, session):
            try container.encode("channel.session.updated", forKey: .type)
            try container.encode(channelId, forKey: .channelId)
            try container.encode(session, forKey: .session)
        case let .configApplied(resource, summary):
            try container.encode("config.applied", forKey: .type)
            try container.encode(resource, forKey: .resource)
            try container.encode(summary, forKey: .summary)
        }
    }
}
