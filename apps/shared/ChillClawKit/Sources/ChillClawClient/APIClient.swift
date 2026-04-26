import Foundation
import ChillClawProtocol

public typealias ChillClawCommunicationLogger = @Sendable (_ event: String, _ details: [String: String]) -> Void

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
        static let ping: TimeInterval = 2
        static let runtimeInstall: TimeInterval = 86_400
        static let longRunning: TimeInterval = 1_200
    }

    private static func pathComponent(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private let session: URLSession
    private let configurationProvider: @Sendable () async -> ChillClawClientConfiguration
    private let daemonEventStreamClient: ChillClawEventStreamClient
    private let communicationLogger: ChillClawCommunicationLogger?

    public init(
        session: URLSession = .shared,
        configurationProvider: @escaping @Sendable () async -> ChillClawClientConfiguration,
        daemonEventStreamFactory: ChillClawEventStreamClient.RawEventStreamFactory? = nil,
        communicationLogger: ChillClawCommunicationLogger? = nil
    ) {
        self.session = session
        self.configurationProvider = configurationProvider
        self.communicationLogger = communicationLogger
        self.daemonEventStreamClient = ChillClawEventStreamClient(
            session: session,
            configurationProvider: configurationProvider,
            rawEventStreamFactory: daemonEventStreamFactory,
            communicationLogger: communicationLogger
        )
    }

    public func ping() async throws -> Bool {
        let _: PingResponse = try await get("/api/ping", timeout: RequestTimeout.ping)
        return true
    }

    public func fetchOnboardingState() async throws -> OnboardingStateResponse {
        try await get("/api/onboarding/state")
    }

    public func navigateOnboarding(to step: OnboardingStep) async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/navigate", body: OnboardingStepNavigationRequest(step: step))
    }

    public func detectOnboardingRuntime() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/runtime/detect", body: EmptyBody())
    }

    public func installOnboardingRuntime(forceLocal: Bool = true) async throws -> OnboardingRuntimeOperationResponse {
        try await post(
            "/api/onboarding/runtime/install",
            body: InstallRequest(autoConfigure: true, forceLocal: forceLocal)
        )
    }

    public func reuseOnboardingRuntime() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/runtime/reuse", body: EmptyBody())
    }

    public func updateOnboardingRuntime() async throws -> OnboardingRuntimeOperationResponse {
        try await post("/api/onboarding/runtime/update", body: EmptyBody())
    }

    public func confirmOnboardingPermissions() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/permissions/confirm", body: EmptyBody())
    }

    public func resetOnboarding() async throws -> OnboardingStateResponse {
        try await post("/api/onboarding/reset", body: EmptyBody())
    }

    public func completeOnboarding(_ request: CompleteOnboardingRequest) async throws -> OnboardingCompletionOperationResponse {
        try await post("/api/onboarding/complete", body: request)
    }

    public func runFirstRunSetup(forceLocal: Bool = true) async throws -> OnboardingRuntimeOperationResponse {
        try await installOnboardingRuntime(forceLocal: forceLocal)
    }

    public func fetchAppUpdate() async throws -> AppUpdateStatus {
        try await get("/api/app/update")
    }

    public func checkAppUpdate() async throws -> AppUpdateCheckResponse {
        try await post("/api/app/update/check", body: EmptyBody())
    }

    public func fetchOverview(fresh: Bool = true) async throws -> ProductOverview { try await get(fresh ? "/api/overview?fresh=1" : "/api/overview") }
    public func fetchDownloads() async throws -> DownloadManagerOverview { try await get("/api/downloads") }
    public func fetchDownloadJob(jobId: String) async throws -> DownloadJob { try await get("/api/downloads/\(Self.pathComponent(jobId))") }
    public func fetchRuntimeResources() async throws -> RuntimeManagerOverview { try await get("/api/runtime/resources") }
    public func fetchDeploymentTargets(fresh: Bool = true) async throws -> DeploymentTargetsResponse { try await get(fresh ? "/api/deploy/targets?fresh=1" : "/api/deploy/targets") }
    public func fetchModelConfig(fresh: Bool = true) async throws -> ModelConfigOverview { try await get(fresh ? "/api/models/config?fresh=1" : "/api/models/config") }
    public func fetchCapabilityOverview(fresh: Bool = true) async throws -> CapabilityOverview { try await get(fresh ? "/api/capabilities/overview?fresh=1" : "/api/capabilities/overview") }
    public func fetchToolOverview(fresh: Bool = true) async throws -> ToolOverview { try await get(fresh ? "/api/tools/overview?fresh=1" : "/api/tools/overview") }
    public func fetchChannelConfig(fresh: Bool = true) async throws -> ChannelConfigOverview { try await get(fresh ? "/api/channels/config?fresh=1" : "/api/channels/config") }
    public func fetchPluginConfig() async throws -> PluginConfigOverview { try await get("/api/plugins/config?fresh=1") }
    public func fetchSkillsConfig() async throws -> SkillCatalogOverview { try await get("/api/skills/config?fresh=1") }
    public func fetchAITeamOverview(fresh: Bool = true) async throws -> AITeamOverview { try await get(fresh ? "/api/ai-team/overview?fresh=1" : "/api/ai-team/overview") }
    public func fetchChatOverview() async throws -> ChatOverview { try await get("/api/chat/overview?fresh=1") }
    public func fetchChatThread(threadId: String) async throws -> ChatThreadDetail { try await get("/api/chat/threads/\(threadId)?fresh=1") }
    public func fetchInstalledSkillDetail(skillId: String) async throws -> InstalledSkillDetail { try await get("/api/skills/\(skillId)?fresh=1") }
    public func fetchOnboardingModelAuthSession(sessionId: String) async throws -> ModelAuthSessionResponse {
        try await get("/api/onboarding/model/auth/session/\(sessionId)")
    }

    public func fetchOnboardingChannelSession(sessionId: String) async throws -> ChannelSessionResponse {
        try await get("/api/onboarding/channel/session/\(sessionId)")
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

    public func saveOnboardingModelEntry(_ request: SaveModelEntryRequest) async throws -> OnboardingModelOperationResponse {
        try await post("/api/onboarding/model/entries", body: request)
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
        try await post("/api/models/local-runtime/install", body: EmptyBody())
    }

    public func repairLocalModelRuntime() async throws -> LocalModelRuntimeActionResponse {
        try await post("/api/models/local-runtime/repair", body: EmptyBody())
    }

    public func pauseDownload(jobId: String) async throws -> DownloadActionResponse {
        try await post("/api/downloads/\(Self.pathComponent(jobId))/pause", body: EmptyBody())
    }

    public func resumeDownload(jobId: String) async throws -> DownloadActionResponse {
        try await post("/api/downloads/\(Self.pathComponent(jobId))/resume", body: EmptyBody())
    }

    public func cancelDownload(jobId: String) async throws -> DownloadActionResponse {
        try await post("/api/downloads/\(Self.pathComponent(jobId))/cancel", body: EmptyBody())
    }

    public func removeDownload(jobId: String) async throws -> DownloadActionResponse {
        try await delete("/api/downloads/\(Self.pathComponent(jobId))", body: EmptyBody())
    }

    public func prepareRuntimeResource(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/prepare", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func repairRuntimeResource(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/repair", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func checkRuntimeResourceUpdate(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/check-update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func stageRuntimeResourceUpdate(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/stage-update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func applyRuntimeResourceUpdate(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/apply-update", body: EmptyBody(), timeout: RequestTimeout.longRunning)
    }

    public func rollbackRuntimeResource(_ resourceId: String) async throws -> RuntimeActionResponse {
        try await post("/api/runtime/resources/\(Self.pathComponent(resourceId))/rollback", body: EmptyBody(), timeout: RequestTimeout.longRunning)
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

    public func saveOnboardingChannelEntry(entryId: String?, request: SaveChannelEntryRequest) async throws -> OnboardingChannelOperationResponse {
        if let entryId {
            return try await self.request(
                "/api/onboarding/channel/entries/\(entryId)",
                method: "PATCH",
                body: request
            )
        }
        return try await post("/api/onboarding/channel/entries", body: request)
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

    private func get<T: Decodable>(_ path: String, timeout: TimeInterval? = nil) async throws -> T {
        try await request(path, method: "GET", body: Optional<EmptyBody>.none, timeout: timeout)
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
        let startedAt = Date()
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let timeout {
            request.timeoutInterval = timeout
        }

        if let body {
            request.httpBody = try JSONEncoder.chillClaw.encode(body)
        }

        logCommunication("api.request.start", [
            "method": method,
            "path": url.path + (url.query.map { "?\($0)" } ?? ""),
            "hasBody": body == nil ? "false" : "true",
            "timeout": timeout.map { String(Int($0)) } ?? ""
        ])

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            logCommunication("api.request.failed", [
                "method": method,
                "path": url.path + (url.query.map { "?\($0)" } ?? ""),
                "durationMs": String(Int(Date().timeIntervalSince(startedAt) * 1000)),
                "error": String(describing: type(of: error))
            ])
            throw error
        }
        guard let http = response as? HTTPURLResponse else {
            logCommunication("api.request.failed", [
                "method": method,
                "path": url.path + (url.query.map { "?\($0)" } ?? ""),
                "durationMs": String(Int(Date().timeIntervalSince(startedAt) * 1000)),
                "error": "invalid-response"
            ])
            throw ChillClawClientError.invalidResponse
        }

        guard (200 ..< 300).contains(http.statusCode) else {
            let message = (try? JSONDecoder.chillClaw.decode(ErrorPayload.self, from: data).error) ?? "Unknown error"
            logCommunication("api.request.failed", [
                "method": method,
                "path": url.path + (url.query.map { "?\($0)" } ?? ""),
                "status": String(http.statusCode),
                "durationMs": String(Int(Date().timeIntervalSince(startedAt) * 1000)),
                "message": message
            ])
            throw ChillClawClientError.server(status: http.statusCode, message: message)
        }

        let decoded = try JSONDecoder.chillClaw.decode(T.self, from: data)
        logCommunication("api.request.done", [
            "method": method,
            "path": url.path + (url.query.map { "?\($0)" } ?? ""),
            "status": String(http.statusCode),
            "durationMs": String(Int(Date().timeIntervalSince(startedAt) * 1000))
        ])
        return decoded
    }

    private func logCommunication(_ event: String, _ details: [String: String]) {
        communicationLogger?(event, details)
    }
}

private struct PingResponse: Decodable, Sendable {
    let ok: Bool
}

private struct ErrorPayload: Decodable, Sendable {
    let error: String
}

private struct EmptyBody: Codable, Sendable {}
