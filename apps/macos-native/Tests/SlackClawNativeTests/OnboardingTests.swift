import Foundation
import Testing
@testable import SlackClawNative
@testable import SlackClawClient
@testable import SlackClawChatUI
@testable import SlackClawProtocol

@MainActor
struct OnboardingTests {
    @Test
    func appStateRequiresOnboardingWhenSetupIncomplete() {
        let appState = SlackClawAppState()
        appState.overview = makeOverview(setupCompleted: false)

        #expect(appState.requiresOnboarding == true)

        appState.overview = makeOverview(setupCompleted: true)
        #expect(appState.requiresOnboarding == false)
    }

    @Test
    func onboardingDestinationMapsToNativeSection() {
        #expect(onboardingDestinationSection(.team) == .team)
        #expect(onboardingDestinationSection(.dashboard) == .dashboard)
        #expect(onboardingDestinationSection(.chat) == .chat)
    }

    @Test
    func nativeOnboardingForcesLightAppearance() {
        #expect(nativeOnboardingPreferredColorScheme == .light)
    }

    @Test
    func buildsOnboardingMemberRequestWithDeterministicHiddenFields() {
        let request = buildOnboardingMemberRequest(
            .init(
                name: "Alex Morgan",
                jobTitle: "Research Analyst",
                avatarPresetId: "onboarding-analyst",
                personalityTraits: ["Analytical", "Detail-Oriented"],
                skillIds: ["research", "summarization"],
                memoryEnabled: true,
                brainEntryId: "brain-1"
            )
        )

        #expect(request.name == "Alex Morgan")
        #expect(request.jobTitle == "Research Analyst")
        #expect(request.avatar.presetId == "onboarding-analyst")
        #expect(request.avatar.accent == "#97b5ea")
        #expect(request.avatar.emoji == "🧠")
        #expect(request.avatar.theme == "onboarding")
        #expect(request.personality == "Analytical, Detail-Oriented")
        #expect(request.soul == "Analytical, Detail-Oriented")
        #expect(request.workStyles.isEmpty)
        #expect(request.knowledgePackIds.isEmpty)
        #expect(request.capabilitySettings.memoryEnabled == true)
        #expect(request.capabilitySettings.contextWindow == 128000)
    }

    @Test
    func bootstrapUsesOverviewGateBeforeHeavySectionLoads() async {
        let loadRecorder = NativeLoadRecorder()
        let appState = makeAppState(
            setupCompleted: false,
            selectedSection: .dashboard,
            loader: .init(
                fetchOverview: {
                    await loadRecorder.record("overview")
                    return makeOverview(setupCompleted: false)
                },
                fetchDeploymentTargets: {
                    await loadRecorder.record("deploy")
                    return .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: [])
                },
                fetchModelConfig: {
                    await loadRecorder.record("models")
                    return emptyModelConfig()
                },
                fetchChannelConfig: {
                    await loadRecorder.record("channels")
                    return emptyChannelConfig()
                },
                fetchSkillsConfig: {
                    await loadRecorder.record("skills")
                    return emptySkillConfig()
                },
                fetchAITeamOverview: {
                    await loadRecorder.record("team")
                    return emptyAITeamOverview()
                }
            )
        )

        await appState.bootstrap()

        #expect(appState.hasBootstrapped == true)
        #expect(appState.requiresOnboarding == true)
        #expect(appState.errorMessage == nil)
        #expect(await loadRecorder.events() == ["overview"])
    }

    @Test
    func refreshAllLoadsOnlyCurrentSectionData() async {
        let loadRecorder = NativeLoadRecorder()
        let appState = makeAppState(
            setupCompleted: true,
            selectedSection: .dashboard,
            loader: .init(
                fetchOverview: {
                    await loadRecorder.record("overview")
                    return makeOverview(setupCompleted: true)
                },
                fetchDeploymentTargets: {
                    await loadRecorder.record("deploy")
                    return .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: [])
                },
                fetchModelConfig: {
                    await loadRecorder.record("models")
                    return emptyModelConfig()
                },
                fetchChannelConfig: {
                    await loadRecorder.record("channels")
                    return emptyChannelConfig()
                },
                fetchSkillsConfig: {
                    await loadRecorder.record("skills")
                    return emptySkillConfig()
                },
                fetchAITeamOverview: {
                    await loadRecorder.record("team")
                    return emptyAITeamOverview()
                }
            )
        )

        await appState.refreshAll()

        #expect(appState.errorMessage == nil)
        #expect(await loadRecorder.events() == ["overview", "models", "team"])
    }
}

private func makeOverview(setupCompleted: Bool) -> ProductOverview {
    .init(
        appName: "SlackClaw",
        appVersion: "0.1.2",
        platformTarget: "macOS first",
        firstRun: .init(introCompleted: true, setupCompleted: setupCompleted, selectedProfileId: nil),
        appService: .init(mode: .launchagent, installed: true, running: true, managedAtLogin: true, label: nil, summary: "Running", detail: "Loaded"),
        engine: .init(engine: "openclaw", installed: true, running: true, version: "2026.3.13", summary: "Ready", pendingGatewayApply: false, pendingGatewayApplySummary: nil, lastCheckedAt: "2026-03-20T00:00:00.000Z"),
        installSpec: .init(engine: "openclaw", desiredVersion: "latest", installSource: "npm-local", prerequisites: ["macOS"], installPath: nil),
        capabilities: .init(engine: "openclaw", supportsInstall: true, supportsUpdate: true, supportsRecovery: true, supportsStreaming: true, runtimeModes: ["gateway"], supportedChannels: ["telegram"], starterSkillCategories: ["communication"], futureLocalModelFamilies: ["qwen"]),
        installChecks: [],
        channelSetup: .init(baseOnboardingCompleted: true, channels: [], nextChannelId: nil, gatewayStarted: true, gatewaySummary: "Running"),
        profiles: [],
        templates: [],
        healthChecks: [],
        recoveryActions: [],
        recentTasks: []
    )
}

@MainActor
private func makeAppState(
    setupCompleted: Bool,
    selectedSection: NativeSection,
    loader: SlackClawAppDataLoader
) -> SlackClawAppState {
    let configuration = SlackClawClientConfiguration(
        daemonURL: URL(string: "http://127.0.0.1:4545")!,
        fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
    )
    let client = SlackClawAPIClient(configurationProvider: { configuration })
    let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
    let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
    let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
    let appState = SlackClawAppState(
        configuration: configuration,
        client: client,
        endpointStore: endpointStore,
        processManager: processManager,
        chatViewModel: chatViewModel,
        loader: loader
    )
    appState.selectedSection = selectedSection
    appState.overview = makeOverview(setupCompleted: setupCompleted)
    return appState
}

private func emptyModelConfig() -> ModelConfigOverview {
    .init(
        providers: [],
        models: [],
        defaultModel: nil,
        configuredModelKeys: [],
        savedEntries: [],
        defaultEntryId: nil,
        fallbackEntryIds: []
    )
}

private func emptyChannelConfig() -> ChannelConfigOverview {
    .init(
        baseOnboardingCompleted: true,
        capabilities: [],
        entries: [],
        activeSession: nil,
        gatewaySummary: "Gateway ready"
    )
}

private func emptySkillConfig() -> SkillCatalogOverview {
    .init(
        managedSkillsDir: nil,
        workspaceDir: nil,
        marketplaceAvailable: true,
        marketplaceSummary: "Ready",
        installedSkills: [],
        readiness: .init(total: 0, eligible: 0, disabled: 0, blocked: 0, missing: 0, warnings: [], summary: "Ready"),
        marketplacePreview: []
    )
}

private func emptyAITeamOverview() -> AITeamOverview {
    .init(
        teamVision: "",
        members: [],
        teams: [],
        activity: [],
        availableBrains: [],
        knowledgePacks: [],
        skillOptions: []
    )
}

private actor NativeLoadRecorder {
    private var recorded: [String] = []

    func record(_ event: String) {
        recorded.append(event)
    }

    func events() -> [String] {
        recorded
    }
}

private struct FakeChatTransport: SlackClawChatTransport {
    func fetchOverview() async throws -> ChatOverview {
        .init(threads: [])
    }

    func fetchThread(threadId: String) async throws -> ChatThreadDetail {
        .init(
            id: threadId,
            memberId: "member-1",
            agentId: "agent-1",
            sessionKey: "session-1",
            title: "Thread",
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z",
            lastPreview: nil,
            lastMessageAt: nil,
            unreadCount: 0,
            activeRunState: nil,
            historyStatus: "loaded",
            composerState: .init(status: "idle", canSend: true, canAbort: false),
            messages: []
        )
    }

    func createThread(memberId: String) async throws -> ChatActionResponse {
        .init(status: "completed", message: "created", overview: .init(threads: []), thread: nil)
    }

    func sendMessage(threadId: String, message: String, clientMessageId: String?) async throws -> ChatActionResponse {
        .init(status: "completed", message: "sent", overview: .init(threads: []), thread: nil)
    }

    func abort(threadId: String) async throws -> ChatActionResponse {
        .init(status: "completed", message: "aborted", overview: .init(threads: []), thread: nil)
    }

    func events() async throws -> AsyncThrowingStream<ChatStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }
}

private actor FakeLaunchAgentController: LaunchAgentControlling {
    func installAndStart() async throws {}
    func stopAndRemove() async throws {}
    func restart() async throws {}

    func status() async -> LaunchAgentStatus {
        .init(installed: true, running: true, detail: "fake")
    }
}
