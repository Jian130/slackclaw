import Foundation
import ChillClawProtocol

public struct ChillClawClientConfiguration: Sendable, Equatable {
    public var daemonURL: URL
    public var fallbackWebURL: URL

    public init(daemonURL: URL, fallbackWebURL: URL) {
        self.daemonURL = daemonURL
        self.fallbackWebURL = fallbackWebURL
    }
}

public enum ChillClawClientError: Error, LocalizedError {
    case invalidResponse
    case server(status: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "ChillClaw returned an invalid response."
        case let .server(status, message):
            return "ChillClaw request failed (\(status)): \(message)"
        }
    }
}

public final class ChillClawAPIClient: @unchecked Sendable {
    private enum RequestTimeout {
        static let longRunning: TimeInterval = 300
    }

    private let session: URLSession
    private let configurationProvider: @Sendable () async -> ChillClawClientConfiguration
    private let daemonEventStreamClient: ChillClawEventStreamClient

    public init(
        session: URLSession = .shared,
        configurationProvider: @escaping @Sendable () async -> ChillClawClientConfiguration,
        daemonEventStreamFactory: ChillClawEventStreamClient.RawEventStreamFactory? = nil
    ) {
        self.session = session
        self.configurationProvider = configurationProvider
        self.daemonEventStreamClient = ChillClawEventStreamClient(
            session: session,
            configurationProvider: configurationProvider,
            rawEventStreamFactory: daemonEventStreamFactory
        )
    }

    public func ping() async throws -> Bool {
        let _: PingResponse = try await get("/api/ping")
        return true
    }

    public func fetchOnboardingState(fresh: Bool = true) async throws -> OnboardingStateResponse {
        try await get(fresh ? "/api/onboarding/state?fresh=1" : "/api/onboarding/state")
    }

    public func navigateOnboarding(to step: OnboardingStep) async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/navigate", body: OnboardingStepNavigationRequest(step: step))
    }

    public func detectOnboardingRuntime() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/runtime/detect", body: EmptyBody())
    }

    public func installOnboardingRuntime(forceLocal: Bool = true) async throws -> SetupRunResponse {
        try await post(
            "/api/onboarding/runtime/install",
            body: InstallRequest(autoConfigure: true, forceLocal: forceLocal),
            timeout: RequestTimeout.longRunning
        )
    }

    public func reuseOnboardingRuntime() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/runtime/reuse", body: EmptyBody())
    }

    public func updateOnboardingRuntime() async throws -> SetupRunResponse {
        try await post("/api/onboarding/runtime/update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func confirmOnboardingPermissions() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/permissions/confirm", body: EmptyBody())
    }

    public func resetOnboarding() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/reset", body: EmptyBody())
    }

    public func completeOnboarding(_ request: CompleteOnboardingRequest) async throws -> CompleteOnboardingResponse {
        try await post("/api/onboarding/complete", body: request, timeout: RequestTimeout.longRunning)
    }

    public func runFirstRunSetup(forceLocal: Bool = true) async throws -> SetupRunResponse {
        try await installOnboardingRuntime(forceLocal: forceLocal)
    }

    public func fetchAppUpdate() async throws -> AppUpdateStatus {
        try await get("/api/app/update")
    }

    public func checkAppUpdate() async throws -> AppUpdateCheckResponse {
        try await post("/api/app/update/check", body: EmptyBody())
    }

    public func fetchOverview() async throws -> ProductOverview { try await get("/api/overview?fresh=1") }
    public func fetchDeploymentTargets() async throws -> DeploymentTargetsResponse { try await get("/api/deploy/targets?fresh=1") }
    public func fetchModelConfig() async throws -> ModelConfigOverview { try await get("/api/models/config?fresh=1") }
    public func fetchChannelConfig() async throws -> ChannelConfigOverview { try await get("/api/channels/config?fresh=1") }
    public func fetchPluginConfig() async throws -> PluginConfigOverview { try await get("/api/plugins/config?fresh=1") }
    public func fetchSkillsConfig() async throws -> SkillCatalogOverview { try await get("/api/skills/config?fresh=1") }
    public func fetchAITeamOverview() async throws -> AITeamOverview { try await get("/api/ai-team/overview?fresh=1") }
    public func fetchChatOverview() async throws -> ChatOverview { try await get("/api/chat/overview?fresh=1") }
    public func fetchChatThread(threadId: String) async throws -> ChatThreadDetail { try await get("/api/chat/threads/\(threadId)?fresh=1") }
    public func fetchInstalledSkillDetail(skillId: String) async throws -> InstalledSkillDetail { try await get("/api/skills/\(skillId)?fresh=1") }
    public func fetchOnboardingModelAuthSession(sessionId: String) async throws -> ModelAuthSessionResponse {
        try await get("/api/onboarding/model/auth/session/\(sessionId)?fresh=1")
    }

    public func fetchOnboardingChannelSession(sessionId: String) async throws -> ChannelSessionResponse {
        try await get("/api/onboarding/channel/session/\(sessionId)?fresh=1")
    }

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

    public func checkEngineUpdates() async throws -> [String: String] {
        try await post("/api/engine/update", body: EmptyBody())
    }

    public func createModelEntry(_ request: SaveModelEntryRequest) async throws -> ModelConfigActionResponse {
        try await post("/api/models/entries", body: request)
    }

    public func saveOnboardingModelEntry(_ request: SaveModelEntryRequest) async throws -> ModelConfigActionResponse {
        try await post("/api/onboarding/model/entries", body: request, timeout: RequestTimeout.longRunning)
    }

    public func resetOnboardingModelDraft() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/model/reset", body: EmptyBody())
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

    public func installLocalModelRuntime() async throws -> LocalModelRuntimeActionResponse {
        try await post("/api/models/local-runtime/install", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func repairLocalModelRuntime() async throws -> LocalModelRuntimeActionResponse {
        try await post("/api/models/local-runtime/repair", body: EmptyBody(), timeout: RequestTimeout.longRunning)
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

    public func submitOnboardingModelAuthInput(sessionId: String, value: String) async throws -> ModelAuthSessionResponse {
        try await post("/api/onboarding/model/auth/session/\(sessionId)/input", body: ModelAuthSessionInputRequest(value: value))
    }

    public func saveChannelEntry(entryId: String?, request: SaveChannelEntryRequest) async throws -> ChannelConfigActionResponse {
        if let entryId {
            return try await patch("/api/channels/entries/\(entryId)", body: request)
        }
        return try await post("/api/channels/entries", body: request)
    }

    public func saveOnboardingChannelEntry(entryId: String?, request: SaveChannelEntryRequest) async throws -> ChannelConfigActionResponse {
        if let entryId {
            return try await self.request(
                "/api/onboarding/channel/entries/\(entryId)",
                method: "PATCH",
                body: request,
                timeout: RequestTimeout.longRunning
            )
        }
        return try await post("/api/onboarding/channel/entries", body: request, timeout: RequestTimeout.longRunning)
    }

    public func resetOnboardingChannelDraft() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/channel/reset", body: EmptyBody())
    }

    public func deleteChannelEntry(request: RemoveChannelEntryRequest) async throws -> ChannelConfigActionResponse {
        try await delete("/api/channels/entries/\(request.entryId)", body: request)
    }

    public func installPlugin(_ pluginId: String) async throws -> PluginActionResponse {
        try await post("/api/plugins/\(pluginId)/install", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func updatePlugin(_ pluginId: String) async throws -> PluginActionResponse {
        try await post("/api/plugins/\(pluginId)/update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func removePlugin(_ pluginId: String) async throws -> PluginActionResponse {
        try await delete("/api/plugins/\(pluginId)", body: EmptyBody())
    }

    public func submitChannelSessionInput(sessionId: String, value: String) async throws -> ChannelSessionResponse {
        try await post("/api/channels/session/\(sessionId)/input", body: ChannelSessionInputRequest(value: value))
    }

    public func submitOnboardingChannelSessionInput(sessionId: String, value: String) async throws -> ChannelSessionResponse {
        try await post("/api/onboarding/channel/session/\(sessionId)/input", body: ChannelSessionInputRequest(value: value))
    }

    public func saveOnboardingEmployee(_ request: OnboardingEmployeeState) async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/employee", body: request)
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

    public func repairPresetSkillSync() async throws -> SkillCatalogActionResponse {
        try await post("/api/skills/preset-sync/repair", body: EmptyBody())
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

    public func createThread(memberId: String, mode: String = "reuse-recent") async throws -> ChatActionResponse {
        try await post("/api/chat/threads", body: CreateChatThreadRequest(memberId: memberId, mode: mode))
    }

    public func sendMessage(threadId: String, message: String, clientMessageId: String? = nil) async throws -> ChatActionResponse {
        try await post("/api/chat/threads/\(threadId)/messages", body: SendChatMessageRequest(message: message, clientMessageId: clientMessageId))
    }

    public func abortThread(threadId: String) async throws -> ChatActionResponse {
        try await post("/api/chat/threads/\(threadId)/abort", body: AbortChatRequest())
    }

    public func chatEvents() async throws -> AsyncThrowingStream<ChatStreamEvent, Error> {
        return AsyncThrowingStream { continuation in
            let task = Task {
                for await event in daemonEventStreamClient.daemonEvents() {
                    if case let .chatStream(_, _, payload) = event {
                        continuation.yield(payload)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }

    public func daemonEvents() -> AsyncStream<ChillClawEvent> {
        daemonEventStreamClient.daemonEvents()
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
            throw ChillClawClientError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let timeout {
            request.timeoutInterval = timeout
        }

        if let body {
            request.httpBody = try JSONEncoder.chillClaw.encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ChillClawClientError.invalidResponse
        }

        guard (200 ..< 300).contains(http.statusCode) else {
            let message = (try? JSONDecoder.chillClaw.decode(ErrorPayload.self, from: data).error) ?? "Unknown error"
            throw ChillClawClientError.server(status: http.statusCode, message: message)
        }

        return try JSONDecoder.chillClaw.decode(T.self, from: data)
    }
}

private struct PingResponse: Decodable, Sendable {
    let ok: Bool
}

private struct ErrorPayload: Decodable, Sendable {
    let error: String
}

private struct EmptyBody: Codable, Sendable {}
