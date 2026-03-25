import AppKit
import Foundation
import Observation
import SlackClawClient
import SlackClawProtocol
import SlackClawChatUI

struct SlackClawAppDataLoader {
    var fetchOverview: @Sendable () async throws -> ProductOverview
    var fetchDeploymentTargets: @Sendable () async throws -> DeploymentTargetsResponse
    var fetchModelConfig: @Sendable () async throws -> ModelConfigOverview
    var fetchChannelConfig: @Sendable () async throws -> ChannelConfigOverview
    var fetchSkillsConfig: @Sendable () async throws -> SkillCatalogOverview
    var fetchAITeamOverview: @Sendable () async throws -> AITeamOverview

    static func live(client: SlackClawAPIClient) -> SlackClawAppDataLoader {
        SlackClawAppDataLoader(
            fetchOverview: { try await client.fetchOverview() },
            fetchDeploymentTargets: { try await client.fetchDeploymentTargets() },
            fetchModelConfig: { try await client.fetchModelConfig() },
            fetchChannelConfig: { try await client.fetchChannelConfig() },
            fetchSkillsConfig: { try await client.fetchSkillsConfig() },
            fetchAITeamOverview: { try await client.fetchAITeamOverview() }
        )
    }
}

func shouldRefreshNativeOverviewForEvent(_ event: SlackClawEvent) -> Bool {
    switch event {
    case .deployCompleted, .gatewayStatus, .configApplied:
        return true
    case let .taskProgress(_, status, _):
        return status != .running
    case .chatStream, .channelSessionUpdated, .deployProgress:
        return false
    }
}

func shouldRefreshNativeSectionForEvent(_ event: SlackClawEvent, selectedSection: NativeSection) -> Bool {
    switch selectedSection {
    case .dashboard:
        switch event {
        case .deployCompleted, .gatewayStatus, .configApplied:
            return true
        case let .taskProgress(_, status, _):
            return status != .running
        case .chatStream, .channelSessionUpdated, .deployProgress:
            return false
        }
    case .deploy:
        switch event {
        case .deployCompleted, .gatewayStatus:
            return true
        case .chatStream, .channelSessionUpdated, .configApplied, .deployProgress, .taskProgress:
            return false
        }
    case .configuration:
        switch event {
        case .channelSessionUpdated:
            return true
        case let .configApplied(resource, _):
            return resource == .models || resource == .channels || resource == .gateway
        case .chatStream, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress:
            return false
        }
    case .skills:
        guard case let .configApplied(resource, _) = event else {
            return false
        }
        return resource == .skills
    case .members, .team, .chat:
        guard case let .configApplied(resource, _) = event else {
            return false
        }
        return resource == .aiEmployees || resource == .models || resource == .skills
    case .settings:
        return false
    }
}

enum NativeSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case deploy = "Deploy"
    case configuration = "Configuration"
    case skills = "Skills Management"
    case members = "AI Members"
    case chat = "Chat"
    case team = "AI Team"
    case settings = "Settings"

    var id: String { rawValue }
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
final class SlackClawAppState {
    typealias DaemonEventStreamFactory = @Sendable () -> AsyncStream<SlackClawEvent>

    let client: SlackClawAPIClient
    var chatViewModel: SlackClawChatViewModel
    let endpointStore: DaemonEndpointStore
    let processManager: DaemonProcessManager
    let configuration: SlackClawClientConfiguration
    private let loader: SlackClawAppDataLoader
    private let daemonEventStreamFactory: DaemonEventStreamFactory
    private var daemonEventTask: Task<Void, Never>?

    var selectedSection: NativeSection = .dashboard
    var overview: ProductOverview?
    var deploymentTargets: DeploymentTargetsResponse?
    var modelConfig: ModelConfigOverview?
    var channelConfig: ChannelConfigOverview?
    var skillConfig: SkillCatalogOverview?
    var aiTeamOverview: AITeamOverview?
    var selectedMemberForChat: String?
    var bannerMessage: String?
    var errorMessage: String?
    var isLoading = false
    var endpointStatus: DaemonEndpointState = .unavailable("SlackClaw daemon has not been checked yet.")
    var hasBootstrapped = false

    init(
        configuration: SlackClawClientConfiguration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        ),
        client: SlackClawAPIClient? = nil,
        endpointStore: DaemonEndpointStore? = nil,
        processManager: DaemonProcessManager? = nil,
        chatViewModel: SlackClawChatViewModel? = nil,
        loader: SlackClawAppDataLoader? = nil,
        daemonEventStreamFactory: DaemonEventStreamFactory? = nil
    ) {
        let resolvedClient = client ?? SlackClawAPIClient(configurationProvider: { configuration })
        self.configuration = configuration
        self.client = resolvedClient
        self.loader = loader ?? .live(client: resolvedClient)
        self.daemonEventStreamFactory = daemonEventStreamFactory ?? { resolvedClient.daemonEvents() }
        self.endpointStore = endpointStore ?? DaemonEndpointStore(configuration: configuration, ping: { try await resolvedClient.ping() })
        self.processManager = processManager ?? DaemonProcessManager(ping: { try await resolvedClient.ping() })
        self.chatViewModel = chatViewModel ?? SlackClawChatViewModel(transport: DaemonChatTransport(client: resolvedClient))
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
            try await refreshCurrentSectionData()
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func refreshCurrentSectionIfNeeded() async {
        guard hasBootstrapped, !requiresOnboarding else { return }
        do {
            try await refreshCurrentSectionData()
            errorMessage = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func applyBanner(_ message: String) {
        bannerMessage = message
    }

    func clearBanner() {
        bannerMessage = nil
    }

    var requiresOnboarding: Bool {
        guard let overview else { return false }
        return !overview.firstRun.setupCompleted
    }

    func openFallbackWeb() {
        NSWorkspace.shared.open(configuration.fallbackWebURL)
    }

    func redoOnboarding() async {
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await client.resetOnboarding()
            selectedSection = .dashboard
            try await refreshOverview()
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

    func applyDaemonEvent(_ event: SlackClawEvent) async {
        guard hasBootstrapped else { return }

        if shouldRefreshNativeOverviewForEvent(event) {
            do {
                try await refreshOverview()
            } catch {
                presentErrorUnlessCancelled(error)
            }
        }

        guard !requiresOnboarding else { return }
        guard shouldRefreshNativeSectionForEvent(event, selectedSection: selectedSection) else { return }

        do {
            try await refreshCurrentSectionData()
            errorMessage = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
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

    private func refreshOverview() async throws {
        self.overview = try await loader.fetchOverview()
        self.errorMessage = nil
    }

    private func refreshCurrentSectionData() async throws {
        switch selectedSection {
        case .dashboard:
            async let modelTask = loader.fetchModelConfig()
            async let teamTask = loader.fetchAITeamOverview()
            self.modelConfig = try await modelTask
            self.aiTeamOverview = try await teamTask
            updateSelectedMemberForChat()
        case .deploy:
            self.deploymentTargets = try await loader.fetchDeploymentTargets()
        case .configuration:
            async let modelTask = loader.fetchModelConfig()
            async let channelTask = loader.fetchChannelConfig()
            self.modelConfig = try await modelTask
            self.channelConfig = try await channelTask
        case .skills:
            self.skillConfig = try await loader.fetchSkillsConfig()
        case .members, .team:
            self.aiTeamOverview = try await loader.fetchAITeamOverview()
            updateSelectedMemberForChat()
        case .chat:
            self.aiTeamOverview = try await loader.fetchAITeamOverview()
            updateSelectedMemberForChat()
            await chatViewModel.start()
        case .settings:
            break
        }
    }

    private func updateSelectedMemberForChat() {
        if selectedMemberForChat == nil {
            selectedMemberForChat = aiTeamOverview?.members.first?.id
        }
    }
}
