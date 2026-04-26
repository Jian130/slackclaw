import AppKit
import Foundation
import Observation
import ChillClawClient
import ChillClawProtocol
import ChillClawChatUI

private func nativeCommunicationLog(event: String, details: [String: String]) {
    NSLog("[ChillClaw communication] %@ %@", event, details.description)
}

struct ChillClawAppDataLoader {
    var fetchOverview: @Sendable () async throws -> ProductOverview
    var fetchDeploymentTargets: @Sendable () async throws -> DeploymentTargetsResponse
    var fetchModelConfig: @Sendable () async throws -> ModelConfigOverview
    var fetchCapabilityOverview: @Sendable () async throws -> CapabilityOverview
    var fetchToolOverview: @Sendable () async throws -> ToolOverview
    var fetchChannelConfig: @Sendable () async throws -> ChannelConfigOverview
    var fetchPluginConfig: @Sendable () async throws -> PluginConfigOverview
    var fetchSkillsConfig: @Sendable () async throws -> SkillCatalogOverview
    var fetchAITeamOverview: @Sendable () async throws -> AITeamOverview

    init(
        fetchOverview: @escaping @Sendable () async throws -> ProductOverview,
        fetchDeploymentTargets: @escaping @Sendable () async throws -> DeploymentTargetsResponse,
        fetchModelConfig: @escaping @Sendable () async throws -> ModelConfigOverview,
        fetchCapabilityOverview: @escaping @Sendable () async throws -> CapabilityOverview = { emptyNativeCapabilityOverview() },
        fetchToolOverview: @escaping @Sendable () async throws -> ToolOverview = { emptyNativeToolOverview() },
        fetchChannelConfig: @escaping @Sendable () async throws -> ChannelConfigOverview,
        fetchPluginConfig: @escaping @Sendable () async throws -> PluginConfigOverview,
        fetchSkillsConfig: @escaping @Sendable () async throws -> SkillCatalogOverview,
        fetchAITeamOverview: @escaping @Sendable () async throws -> AITeamOverview
    ) {
        self.fetchOverview = fetchOverview
        self.fetchDeploymentTargets = fetchDeploymentTargets
        self.fetchModelConfig = fetchModelConfig
        self.fetchCapabilityOverview = fetchCapabilityOverview
        self.fetchToolOverview = fetchToolOverview
        self.fetchChannelConfig = fetchChannelConfig
        self.fetchPluginConfig = fetchPluginConfig
        self.fetchSkillsConfig = fetchSkillsConfig
        self.fetchAITeamOverview = fetchAITeamOverview
    }

    static func live(client: ChillClawAPIClient) -> ChillClawAppDataLoader {
        ChillClawAppDataLoader(
            fetchOverview: { try await client.fetchOverview(fresh: false) },
            fetchDeploymentTargets: { try await client.fetchDeploymentTargets() },
            fetchModelConfig: { try await client.fetchModelConfig(fresh: false) },
            fetchCapabilityOverview: { try await client.fetchCapabilityOverview(fresh: false) },
            fetchToolOverview: { try await client.fetchToolOverview(fresh: false) },
            fetchChannelConfig: { try await client.fetchChannelConfig() },
            fetchPluginConfig: { try await client.fetchPluginConfig() },
            fetchSkillsConfig: { try await client.fetchSkillsConfig() },
            fetchAITeamOverview: { try await client.fetchAITeamOverview(fresh: false) }
        )
    }
}

private func emptyNativeCapabilityOverview() -> CapabilityOverview {
    .init(engine: "openclaw", checkedAt: "", entries: [], summary: "Capability readiness is loading.")
}

private func emptyNativeToolOverview() -> ToolOverview {
    .init(engine: "openclaw", checkedAt: "", profile: nil, allow: [], deny: [], byProvider: [:], entries: [], summary: "Tool access is loading.")
}

func shouldRefreshNativeOverviewForEvent(_ event: ChillClawEvent) -> Bool {
    switch event {
    case .overviewUpdated:
        return false
    case .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
        return false
    case .localRuntimeProgress, .localRuntimeCompleted:
        return false
    case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
        return false
    case .deployCompleted, .gatewayStatus:
        return true
    case let .taskProgress(_, status, _):
        return status != .running
    case .operationUpdated, .operationCompleted, .chatStream, .channelSessionUpdated, .configApplied, .deployProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
        return false
    }
}

func shouldRefreshNativeSectionForEvent(_ event: ChillClawEvent, selectedSection: NativeSection) -> Bool {
    switch selectedSection {
    case .dashboard:
        switch event {
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated:
            return false
        case .downloadsUpdated:
            return false
        case .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated:
            return true
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .deployCompleted, .gatewayStatus:
            return true
        case let .taskProgress(_, status, _):
            return status != .running
        case .configApplied:
            return true
        case .operationUpdated, .operationCompleted, .chatStream, .channelSessionUpdated, .deployProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .deploy:
        switch event {
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
            return false
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .deployCompleted, .gatewayStatus:
            return true
        case .operationUpdated, .operationCompleted, .chatStream, .channelSessionUpdated, .configApplied, .deployProgress, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .configuration:
        switch event {
        case .modelConfigUpdated, .channelConfigUpdated:
            return false
        case .overviewUpdated, .aiTeamUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
            return false
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .channelSessionUpdated:
            return true
        case .operationUpdated, .operationCompleted, .configApplied, .chatStream, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .plugins:
        switch event {
        case .pluginConfigUpdated:
            return false
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
            return false
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .operationUpdated, .operationCompleted, .chatStream, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .channelSessionUpdated, .configApplied, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .skills:
        switch event {
        case .skillCatalogUpdated:
            return false
        case .configApplied:
            return false
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
            return false
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .operationUpdated, .operationCompleted, .chatStream, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .channelSessionUpdated, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .members, .team, .chat:
        switch event {
        case .aiTeamUpdated, .modelConfigUpdated:
            return false
        case .configApplied:
            return false
        case .overviewUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated:
            return false
        case .localRuntimeProgress, .localRuntimeCompleted:
            return false
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return false
        case .operationUpdated, .operationCompleted, .chatStream, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .channelSessionUpdated, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return false
        }
    case .settings:
        return false
    }
}

enum NativeSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case deploy = "Deploy"
    case configuration = "Configuration"
    case plugins = "Plugins"
    case skills = "Skills Management"
    case members = "AI Members"
    case chat = "Chat"
    case team = "AI Team"
    case settings = "Settings"

    var id: String { rawValue }

    static let navigationSections: [NativeSection] = [
        .chat,
        .dashboard,
        .deploy,
        .configuration,
        .skills,
        .plugins,
        .settings
    ]
}

enum NativeClientError: Error, LocalizedError {
    case runtime(String)

    var errorDescription: String? {
        switch self {
        case let .runtime(message):
            return message
        }
    }
}

@MainActor
@Observable
final class ChillClawAppState {
    typealias DaemonEventStreamFactory = @Sendable () -> AsyncStream<ChillClawEvent>

    let client: ChillClawAPIClient
    var chatViewModel: ChillClawChatViewModel
    let endpointStore: DaemonEndpointStore
    let processManager: DaemonProcessManager
    let configuration: ChillClawClientConfiguration
    private let loader: ChillClawAppDataLoader
    private let daemonEventStreamFactory: DaemonEventStreamFactory
    private var daemonEventTask: Task<Void, Never>?
    private var sectionRefreshInFlight = false
    private var sectionRefreshPending = false

    var selectedSection: NativeSection = .dashboard
    var overview: ProductOverview?
    var deploymentTargets: DeploymentTargetsResponse?
    var modelConfig: ModelConfigOverview?
    var channelConfig: ChannelConfigOverview?
    var pluginConfig: PluginConfigOverview?
    var skillConfig: SkillCatalogOverview?
    var aiTeamOverview: AITeamOverview?
    var capabilityOverview: CapabilityOverview?
    var toolOverview: ToolOverview?
    var selectedMemberForChat: String?
    var bannerMessage: String?
    var errorMessage: String?
    var isLoading = false
    var endpointStatus: DaemonEndpointState = .unavailable("ChillClaw daemon has not been checked yet.")
    var hasBootstrapped = false

    init(
        configuration: ChillClawClientConfiguration = ChillClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        ),
        client: ChillClawAPIClient? = nil,
        endpointStore: DaemonEndpointStore? = nil,
        processManager: DaemonProcessManager? = nil,
        chatViewModel: ChillClawChatViewModel? = nil,
        loader: ChillClawAppDataLoader? = nil,
        daemonEventStreamFactory: DaemonEventStreamFactory? = nil
    ) {
        let resolvedClient = client ?? ChillClawAPIClient(
            configurationProvider: { configuration },
            communicationLogger: nativeCommunicationLog
        )
        self.configuration = configuration
        self.client = resolvedClient
        self.loader = loader ?? .live(client: resolvedClient)
        self.daemonEventStreamFactory = daemonEventStreamFactory ?? { resolvedClient.daemonEvents() }
        self.endpointStore = endpointStore ?? DaemonEndpointStore(configuration: configuration, ping: { try await resolvedClient.ping() })
        self.processManager = processManager ?? DaemonProcessManager(ping: { try await resolvedClient.ping() })
        self.chatViewModel = chatViewModel ?? ChillClawChatViewModel(transport: DaemonChatTransport(client: resolvedClient))
    }

    func bootstrap() async {
        await processManager.ensureRunning()
        await refreshDaemonState()
        do {
            try await refreshOverview()
        } catch {
            presentErrorUnlessCancelled(error)
        }
        hasBootstrapped = true
        startDaemonEventsIfNeeded()
    }

    func refreshDaemonState() async {
        await endpointStore.refresh()
        endpointStatus = await endpointStore.state
    }

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        await refreshDaemonState()

        do {
            try await refreshOverview()
            guard !requiresOnboarding else { return }
        } catch {
            presentErrorUnlessCancelled(error)
            return
        }

        await refreshCurrentSectionDataCoalesced(requiresBootstrap: false)
    }

    func refreshCurrentSectionIfNeeded() async {
        guard hasBootstrapped, !requiresOnboarding else { return }
        await refreshCurrentSectionDataCoalesced()
    }

    func applyBanner(_ message: String) {
        bannerMessage = message
    }

    func preferChatMember(_ memberId: String?) {
        guard let memberId = memberId?.trimmingCharacters(in: .whitespacesAndNewlines), !memberId.isEmpty else {
            return
        }

        selectedMemberForChat = memberId
    }

    func refreshSelectedMemberForChat() {
        updateSelectedMemberForChat()
    }

    func openPreferredChatThread() async {
        if selectedMemberForChat?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            if aiTeamOverview?.members.isEmpty != false {
                do {
                    aiTeamOverview = try await loader.fetchAITeamOverview()
                } catch {
                    presentErrorUnlessCancelled(error)
                    return
                }
            }
            updateSelectedMemberForChat()
        }

        guard let memberId = selectedMemberForChat?.trimmingCharacters(in: .whitespacesAndNewlines), !memberId.isEmpty else {
            return
        }

        await chatViewModel.start()
        await chatViewModel.openThread(memberId: memberId)
    }

    func clearBanner() {
        bannerMessage = nil
    }

    func applyOverviewSnapshot(
        _ snapshot: ProductOverview,
        allowSetupCompletedRegression: Bool = false
    ) {
        var normalized = snapshot

        if !allowSetupCompletedRegression,
           overview?.firstRun.setupCompleted == true,
           normalized.firstRun.setupCompleted == false
        {
            // Keep the onboarding gate stable if a late event arrives with stale first-run state.
            normalized.firstRun.setupCompleted = true
        }

        overview = normalized
        syncChatSendBlockReason()
    }

    func applyRuntimeManagerOverview(_ runtimeManager: RuntimeManagerOverview) {
        guard var overview else { return }
        overview.runtimeManager = runtimeManager
        applyOverviewSnapshot(overview)
    }

    var requiresOnboarding: Bool {
        guard let overview else { return false }
        return !overview.firstRun.setupCompleted
    }

    func openFallbackWeb() {
        NSWorkspace.shared.open(configuration.fallbackWebURL)
    }

    func openExternalURL(_ url: URL) {
        NSWorkspace.shared.open(url)
    }

    func checkAppUpdate() async {
        do {
            let response = try await client.checkAppUpdate()
            applyOverviewSnapshot(response.overview)
            bannerMessage = response.appUpdate.summary
            errorMessage = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func redoOnboarding() async {
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await client.resetOnboarding()
            selectedSection = .dashboard
            try await refreshOverview(allowSetupCompletedRegression: true)
            bannerMessage = "Returning to guided setup."
            errorMessage = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func startDaemonEventsIfNeeded() {
        guard daemonEventTask == nil else { return }
        daemonEventTask = Task { [weak self] in
            guard let self else { return }
            let stream = self.daemonEventStreamFactory()

            for await event in stream {
                if Task.isCancelled {
                    break
                }

                await self.applyDaemonEvent(event)
            }
        }
    }

    func applyDaemonEvent(_ event: ChillClawEvent) async {
        guard hasBootstrapped else { return }

        switch event {
        case let .overviewUpdated(snapshot):
            applyOverviewSnapshot(snapshot.data)
        case let .aiTeamUpdated(snapshot):
            aiTeamOverview = snapshot.data
            updateSelectedMemberForChat()
        case let .modelConfigUpdated(snapshot):
            modelConfig = snapshot.data
        case let .channelConfigUpdated(snapshot):
            channelConfig = snapshot.data
        case let .pluginConfigUpdated(snapshot):
            pluginConfig = snapshot.data
        case let .skillCatalogUpdated(snapshot):
            skillConfig = snapshot.data
        case .presetSkillSyncUpdated, .downloadsUpdated:
            break
        case .localRuntimeProgress, .localRuntimeCompleted:
            break
        case let .runtimeProgress(_, _, _, _, _, runtimeManager),
            let .runtimeCompleted(_, _, _, _, runtimeManager),
            let .runtimeUpdateStaged(_, _, _, runtimeManager):
            applyRuntimeManagerOverview(runtimeManager)
        case .operationUpdated, .operationCompleted, .deployProgress, .deployCompleted, .gatewayStatus, .taskProgress, .chatStream, .channelSessionUpdated, .configApplied, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            break
        }

        if shouldRefreshNativeOverviewForEvent(event) {
            do {
                try await refreshOverview()
            } catch {
                presentErrorUnlessCancelled(error)
            }
        }

        guard !requiresOnboarding else { return }
        guard shouldRefreshNativeSectionForEvent(event, selectedSection: selectedSection) else { return }

        await refreshCurrentSectionDataCoalesced()
    }

    func presentErrorUnlessCancelled(_ error: Error) {
        guard !isCancellation(error) else { return }
        errorMessage = error.localizedDescription
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        let nsError = error as NSError
        if (nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled)
            || nsError.domain == "Swift.CancellationError"
        {
            return true
        }

        if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError,
           underlying.domain == NSURLErrorDomain,
           underlying.code == NSURLErrorCancelled
        {
            return true
        }

        return false
    }

    private func isDaemonConnectionError(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorCannotConnectToHost,
                 NSURLErrorCannotFindHost,
                 NSURLErrorDNSLookupFailed,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorNotConnectedToInternet,
                 NSURLErrorTimedOut:
                return true
            default:
                break
            }
        }

        if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError {
            return isDaemonConnectionError(underlying)
        }

        return false
    }

    private func recoverDaemonConnection(after error: Error) async -> Bool {
        guard isDaemonConnectionError(error) else { return false }
        await processManager.restart()
        await refreshDaemonState()
        if case .ready = endpointStatus {
            return true
        }
        return false
    }

    private func withDaemonConnectionRecovery<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch {
            guard await recoverDaemonConnection(after: error) else {
                throw error
            }
            return try await operation()
        }
    }

    private func refreshOverview(allowSetupCompletedRegression: Bool = false) async throws {
        let snapshot = try await withDaemonConnectionRecovery {
            try await loader.fetchOverview()
        }
        applyOverviewSnapshot(snapshot, allowSetupCompletedRegression: allowSetupCompletedRegression)
        self.errorMessage = nil
    }

    private func syncChatSendBlockReason() {
        chatViewModel.sendBlockedReason =
            overview?.engine.pendingGatewayApply == true
            ? (overview?.engine.pendingGatewayApplySummary ?? "pending-gateway-apply")
            : nil
    }

    private func refreshCurrentSectionData() async throws {
        switch selectedSection {
        case .dashboard:
            let modelConfig = try await loader.fetchModelConfig()
            let aiTeamOverview = try await loader.fetchAITeamOverview()
            let capabilityOverview = try await loader.fetchCapabilityOverview()
            let toolOverview = try await loader.fetchToolOverview()
            self.modelConfig = modelConfig
            self.aiTeamOverview = aiTeamOverview
            self.capabilityOverview = capabilityOverview
            self.toolOverview = toolOverview
            updateSelectedMemberForChat()
        case .deploy:
            self.deploymentTargets = try await loader.fetchDeploymentTargets()
        case .configuration:
            let modelConfig = try await loader.fetchModelConfig()
            let channelConfig = try await loader.fetchChannelConfig()
            self.modelConfig = modelConfig
            self.channelConfig = channelConfig
        case .plugins:
            self.pluginConfig = try await loader.fetchPluginConfig()
        case .skills:
            self.skillConfig = try await loader.fetchSkillsConfig()
        case .members, .team:
            self.aiTeamOverview = try await loader.fetchAITeamOverview()
            updateSelectedMemberForChat()
        case .chat:
            self.aiTeamOverview = try await loader.fetchAITeamOverview()
            updateSelectedMemberForChat()
            await chatViewModel.start()
            await openPreferredChatThread()
        case .settings:
            break
        }
    }

    private func refreshCurrentSectionDataCoalesced(requiresBootstrap: Bool = true) async {
        if requiresBootstrap && !hasBootstrapped {
            return
        }
        guard !requiresOnboarding else { return }

        if sectionRefreshInFlight {
            sectionRefreshPending = true
            return
        }

        repeat {
            // Coalesce overlapping section refresh requests so the native shell never
            // starts the same refresh path in parallel. Overlapping refresh tasks have
            // previously triggered Swift concurrency aborts on macOS.
            sectionRefreshInFlight = true
            sectionRefreshPending = false

            do {
                try await withDaemonConnectionRecovery {
                    try await refreshCurrentSectionData()
                }
                errorMessage = nil
            } catch {
                presentErrorUnlessCancelled(error)
            }

            sectionRefreshInFlight = false
        } while sectionRefreshPending && (!requiresBootstrap || hasBootstrapped) && !requiresOnboarding
    }

    private func updateSelectedMemberForChat() {
        guard let aiTeamOverview else { return }
        let members = aiTeamOverview.members
        guard !members.isEmpty else {
            selectedMemberForChat = nil
            return
        }

        if let selectedMemberForChat, members.contains(where: { $0.id == selectedMemberForChat }) {
            return
        }

        selectedMemberForChat = members.first?.id
    }
}
