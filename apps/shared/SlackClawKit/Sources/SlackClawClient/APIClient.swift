import Foundation
import SlackClawProtocol

public struct SlackClawClientConfiguration: Sendable, Equatable {
    public var daemonURL: URL
    public var fallbackWebURL: URL

    public init(daemonURL: URL, fallbackWebURL: URL) {
        self.daemonURL = daemonURL
        self.fallbackWebURL = fallbackWebURL
    }
}

public enum SlackClawClientError: Error, LocalizedError {
    case invalidResponse
    case server(status: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "SlackClaw returned an invalid response."
        case let .server(status, message):
            return "SlackClaw request failed (\(status)): \(message)"
        }
    }
}

public final class SlackClawAPIClient: @unchecked Sendable {
    public typealias EventStreamFactory = @Sendable (_ url: URL) async throws -> AsyncThrowingStream<String, Error>

    private enum RequestTimeout {
        static let longRunning: TimeInterval = 300
    }

    private let session: URLSession
    private let configurationProvider: @Sendable () async -> SlackClawClientConfiguration
    private let eventStreamFactory: EventStreamFactory

    public init(
        session: URLSession = .shared,
        configurationProvider: @escaping @Sendable () async -> SlackClawClientConfiguration,
        eventStreamFactory: EventStreamFactory? = nil
    ) {
        self.session = session
        self.configurationProvider = configurationProvider
        self.eventStreamFactory = eventStreamFactory ?? { url in
            let (bytes, response) = try await session.bytes(from: url)
            guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
                throw SlackClawClientError.invalidResponse
            }

            let parser = SSEParser()
            return AsyncThrowingStream { continuation in
                let task = Task {
                    do {
                        for try await line in bytes.lines {
                            let payloads = parser.feed(line + "\n")
                            for payload in payloads {
                                continuation.yield(payload)
                            }
                        }
                        continuation.finish()
                    } catch {
                        continuation.finish(throwing: error)
                    }
                }
                continuation.onTermination = { @Sendable _ in task.cancel() }
            }
        }
    }

    public func ping() async throws -> Bool {
        let _: PingResponse = try await get("/api/ping")
        return true
    }

    public func fetchOnboardingState(fresh: Bool = true) async throws -> OnboardingStateResponse {
        try await get(fresh ? "/api/onboarding/state?fresh=1" : "/api/onboarding/state")
    }

    public func updateOnboardingState(_ request: UpdateOnboardingStateRequest) async throws -> OnboardingStateResponse {
        try await patch("/api/onboarding/state", body: request)
    }

    public func completeOnboarding(_ request: CompleteOnboardingRequest) async throws -> CompleteOnboardingResponse {
        try await post("/api/onboarding/complete", body: request)
    }

    public func runFirstRunSetup(forceLocal: Bool = false) async throws -> SetupRunResponse {
        try await post(
            "/api/first-run/setup",
            body: InstallRequest(autoConfigure: true, forceLocal: forceLocal),
            timeout: RequestTimeout.longRunning
        )
    }

    public func fetchOverview() async throws -> ProductOverview { try await get("/api/overview?fresh=1") }
    public func fetchDeploymentTargets() async throws -> DeploymentTargetsResponse { try await get("/api/deploy/targets?fresh=1") }
    public func fetchModelConfig() async throws -> ModelConfigOverview { try await get("/api/models/config?fresh=1") }
    public func fetchChannelConfig() async throws -> ChannelConfigOverview { try await get("/api/channels/config?fresh=1") }
    public func fetchSkillsConfig() async throws -> SkillCatalogOverview { try await get("/api/skills/config?fresh=1") }
    public func fetchAITeamOverview() async throws -> AITeamOverview { try await get("/api/ai-team/overview?fresh=1") }
    public func fetchChatOverview() async throws -> ChatOverview { try await get("/api/chat/overview?fresh=1") }
    public func fetchChatThread(threadId: String) async throws -> ChatThreadDetail { try await get("/api/chat/threads/\(threadId)?fresh=1") }
    public func fetchInstalledSkillDetail(skillId: String) async throws -> InstalledSkillDetail { try await get("/api/skills/\(skillId)?fresh=1") }
    public func fetchModelAuthSession(sessionId: String) async throws -> ModelAuthSessionResponse { try await get("/api/models/auth/session/\(sessionId)?fresh=1") }
    public func fetchChannelSession(sessionId: String) async throws -> ChannelSessionResponse { try await get("/api/channels/session/\(sessionId)?fresh=1") }

    public func installTarget(_ targetId: String) async throws -> DeploymentTargetActionResponse {
        try await post("/api/deploy/targets/\(targetId)/install", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func updateTarget(_ targetId: String) async throws -> DeploymentTargetActionResponse {
        try await post("/api/deploy/targets/\(targetId)/update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func uninstallTarget(_ targetId: String) async throws -> DeploymentTargetActionResponse {
        try await post("/api/deploy/targets/\(targetId)/uninstall", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func restartGateway() async throws -> GatewayActionResponse {
        try await post("/api/deploy/gateway/restart", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func createModelEntry(_ request: SaveModelEntryRequest) async throws -> ModelConfigActionResponse {
        try await post("/api/models/entries", body: request)
    }

    public func updateModelEntry(entryId: String, request: SaveModelEntryRequest) async throws -> ModelConfigActionResponse {
        try await patch("/api/models/entries/\(entryId)", body: request)
    }

    public func deleteModelEntry(entryId: String) async throws -> ModelConfigActionResponse {
        try await delete("/api/models/entries/\(entryId)", body: EmptyBody())
    }

    public func setDefaultModelEntry(entryId: String) async throws -> ModelConfigActionResponse {
        try await post("/api/models/default-entry", body: SetDefaultModelEntryRequest(entryId: entryId))
    }

    public func replaceFallbackModels(entryIds: [String]) async throws -> ModelConfigActionResponse {
        try await post("/api/models/fallbacks", body: ReplaceFallbackModelEntriesRequest(entryIds: entryIds))
    }

    public func authenticateModel(request: ModelAuthRequest) async throws -> ModelConfigActionResponse {
        try await post("/api/models/auth", body: request)
    }

    public func submitModelAuthInput(sessionId: String, value: String) async throws -> ModelAuthSessionResponse {
        try await post("/api/models/auth/session/\(sessionId)/input", body: ModelAuthSessionInputRequest(value: value))
    }

    public func saveChannelEntry(entryId: String?, request: SaveChannelEntryRequest) async throws -> ChannelConfigActionResponse {
        if let entryId {
            return try await patch("/api/channels/entries/\(entryId)", body: request)
        }
        return try await post("/api/channels/entries", body: request)
    }

    public func deleteChannelEntry(request: RemoveChannelEntryRequest) async throws -> ChannelConfigActionResponse {
        try await delete("/api/channels/entries/\(request.entryId)", body: request)
    }

    public func submitChannelSessionInput(sessionId: String, value: String) async throws -> ChannelSessionResponse {
        try await post("/api/channels/session/\(sessionId)/input", body: ChannelSessionInputRequest(value: value))
    }

    public func installSkill(slug: String) async throws -> SkillCatalogActionResponse {
        try await post("/api/skills/install", body: InstallSkillRequest(slug: slug, version: nil))
    }

    public func saveCustomSkill(skillId: String?, request: SaveCustomSkillRequest) async throws -> SkillCatalogActionResponse {
        if let skillId {
            return try await patch("/api/skills/\(skillId)", body: UpdateSkillRequest(action: "edit-custom", version: nil, name: request.name, description: request.description, instructions: request.instructions, homepage: request.homepage))
        }
        return try await post("/api/skills/custom", body: request)
    }

    public func updateSkill(skillId: String, action: String, version: String? = nil) async throws -> SkillCatalogActionResponse {
        try await patch("/api/skills/\(skillId)", body: UpdateSkillRequest(action: action, version: version, name: nil, description: nil, instructions: nil, homepage: nil))
    }

    public func removeSkill(skillId: String) async throws -> SkillCatalogActionResponse {
        try await delete("/api/skills/\(skillId)", body: RemoveSkillRequest())
    }

    public func saveMember(memberId: String?, request: SaveAIMemberRequest) async throws -> AITeamActionResponse {
        if let memberId {
            return try await patch("/api/ai-members/\(memberId)", body: request)
        }
        return try await post("/api/ai-members", body: request)
    }

    public func deleteMember(memberId: String, deleteMode: String) async throws -> AITeamActionResponse {
        try await delete("/api/ai-members/\(memberId)", body: DeleteAIMemberRequest(deleteMode: deleteMode))
    }

    public func bindMemberChannel(memberId: String, binding: String) async throws -> AITeamActionResponse {
        try await post("/api/ai-members/\(memberId)/bindings", body: BindAIMemberChannelRequest(binding: binding))
    }

    public func unbindMemberChannel(memberId: String, binding: String) async throws -> AITeamActionResponse {
        try await delete("/api/ai-members/\(memberId)/bindings", body: BindAIMemberChannelRequest(binding: binding))
    }

    public func saveTeam(teamId: String?, request: SaveTeamRequest) async throws -> AITeamActionResponse {
        if let teamId {
            return try await patch("/api/teams/\(teamId)", body: request)
        }
        return try await post("/api/teams", body: request)
    }

    public func deleteTeam(teamId: String) async throws -> AITeamActionResponse {
        try await delete("/api/teams/\(teamId)", body: EmptyBody())
    }

    public func createThread(memberId: String, mode: String = "new") async throws -> ChatActionResponse {
        try await post("/api/chat/threads", body: CreateChatThreadRequest(memberId: memberId, mode: mode))
    }

    public func sendMessage(threadId: String, message: String, clientMessageId: String? = nil) async throws -> ChatActionResponse {
        try await post("/api/chat/threads/\(threadId)/messages", body: SendChatMessageRequest(message: message, clientMessageId: clientMessageId))
    }

    public func abortThread(threadId: String) async throws -> ChatActionResponse {
        try await post("/api/chat/threads/\(threadId)/abort", body: AbortChatRequest())
    }

    public func chatEvents() async throws -> AsyncThrowingStream<ChatStreamEvent, Error> {
        let config = await configurationProvider()
        let url = config.daemonURL.appending(path: "/api/chat/events")
        let rawStream = try await eventStreamFactory(url)

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await payload in rawStream {
                        guard let data = payload.data(using: .utf8) else { continue }
                        if let event = try? JSONDecoder.slackClaw.decode(ChatStreamEvent.self, from: data) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET", body: Optional<EmptyBody>.none)
    }

    private func post<Body: Encodable, T: Decodable>(_ path: String, body: Body, timeout: TimeInterval? = nil) async throws -> T {
        try await request(path, method: "POST", body: body, timeout: timeout)
    }

    private func patch<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        try await request(path, method: "PATCH", body: body)
    }

    private func delete<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        try await request(path, method: "DELETE", body: body)
    }

    private func request<Body: Encodable, T: Decodable>(
        _ path: String,
        method: String,
        body: Body?,
        timeout: TimeInterval? = nil
    ) async throws -> T {
        let config = await configurationProvider()
        guard let url = URL(string: path, relativeTo: config.daemonURL)?.absoluteURL else {
            throw SlackClawClientError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let timeout {
            request.timeoutInterval = timeout
        }

        if let body {
            request.httpBody = try JSONEncoder.slackClaw.encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SlackClawClientError.invalidResponse
        }

        guard (200 ..< 300).contains(http.statusCode) else {
            let message = (try? JSONDecoder.slackClaw.decode(ErrorPayload.self, from: data).error) ?? "Unknown error"
            throw SlackClawClientError.server(status: http.statusCode, message: message)
        }

        return try JSONDecoder.slackClaw.decode(T.self, from: data)
    }
}

private struct PingResponse: Decodable, Sendable {
    let ok: Bool
}

private struct ErrorPayload: Decodable, Sendable {
    let error: String
}

private struct EmptyBody: Codable, Sendable {}
