import Foundation
import Testing
@testable import ChillClawNative
@testable import ChillClawClient
@testable import ChillClawChatUI
@testable import ChillClawProtocol

@MainActor
struct AppStateEventTests {
    @Test
    func overviewRefreshHelperMatchesDashboardEvents() {
        #expect(
            shouldRefreshNativeOverviewForEvent(
                ChillClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Ready")
            ) == true
        )
        #expect(
            shouldRefreshNativeOverviewForEvent(
                ChillClawEvent.modelConfigUpdated(
                    snapshot: .init(
                        epoch: "epoch-1",
                        revision: 1,
                        data: emptyNativeModelConfig()
                    )
                )
            ) == false
        )
        #expect(
            shouldRefreshNativeOverviewForEvent(
                ChillClawEvent.taskProgress(taskId: "task-1", status: .completed, message: "Done")
            ) == true
        )
        #expect(
            shouldRefreshNativeOverviewForEvent(
                ChillClawEvent.taskProgress(taskId: "task-1", status: .running, message: "Working")
            ) == false
        )
    }

    @Test
    func sectionRefreshHelperScopesLiveEvents() {
        #expect(
            shouldRefreshNativeSectionForEvent(
                ChillClawEvent.channelSessionUpdated(
                    channelId: .wechat,
                    session: .init(id: "session-1", channelId: .wechat, entryId: nil, status: "ready", message: "Ready", logs: [])
                ),
                selectedSection: .configuration
            ) == true
        )
        #expect(
            shouldRefreshNativeSectionForEvent(
                ChillClawEvent.aiTeamUpdated(
                    snapshot: .init(
                        epoch: "epoch-1",
                        revision: 2,
                        data: emptyNativeAITeamOverview()
                    )
                ),
                selectedSection: .team
            ) == false
        )
        #expect(
            shouldRefreshNativeSectionForEvent(
                ChillClawEvent.skillCatalogUpdated(
                    snapshot: .init(
                        epoch: "epoch-1",
                        revision: 3,
                        data: emptyNativeSkillConfig()
                    )
                ),
                selectedSection: .members
            ) == false
        )
        #expect(
            shouldRefreshNativeSectionForEvent(
                ChillClawEvent.pluginConfigUpdated(
                    snapshot: .init(
                        epoch: "epoch-1",
                        revision: 4,
                        data: emptyNativePluginConfig()
                    )
                ),
                selectedSection: .plugins
            ) == false
        )
        #expect(
            shouldRefreshNativeSectionForEvent(
                ChillClawEvent.deployCompleted(
                    correlationId: "deploy-1",
                    targetId: "managed-local",
                    status: "completed",
                    message: "Installed.",
                    engineStatus: makeNativeOverview(setupCompleted: true).engine
                ),
                selectedSection: .deploy
            ) == true
        )
    }

    @Test
    func applyDaemonEventRefreshesOverviewAndActiveSection() async {
        let loadRecorder = NativeEventLoadRecorder()
        let appState = makeEventDrivenAppState(
            setupCompleted: true,
            selectedSection: .team,
            loader: .init(
                fetchOverview: {
                    await loadRecorder.record("overview")
                    return makeNativeOverview(setupCompleted: true)
                },
                fetchDeploymentTargets: {
                    await loadRecorder.record("deploy")
                    return .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: [])
                },
                fetchModelConfig: {
                    await loadRecorder.record("models")
                    return emptyNativeModelConfig()
                },
                fetchChannelConfig: {
                    await loadRecorder.record("channels")
                    return emptyNativeChannelConfig()
                },
                fetchPluginConfig: {
                    await loadRecorder.record("plugins")
                    return emptyNativePluginConfig()
                },
                fetchSkillsConfig: {
                    await loadRecorder.record("skills")
                    return emptyNativeSkillConfig()
                },
                fetchAITeamOverview: {
                    await loadRecorder.record("team")
                    return emptyNativeAITeamOverview()
                }
            )
        )

        await appState.applyDaemonEvent(
            ChillClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Gateway ready")
        )

        #expect(await loadRecorder.events() == ["overview"])
        #expect(appState.errorMessage == nil)
    }

    @Test
    func bootstrapStartsDaemonEventListener() async {
        let loadRecorder = NativeEventLoadRecorder()
        let appState = makeEventDrivenAppState(
            setupCompleted: true,
            selectedSection: .team,
            loader: .init(
                fetchOverview: {
                    await loadRecorder.record("overview")
                    return makeNativeOverview(setupCompleted: true)
                },
                fetchDeploymentTargets: {
                    await loadRecorder.record("deploy")
                    return .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: [])
                },
                fetchModelConfig: {
                    await loadRecorder.record("models")
                    return emptyNativeModelConfig()
                },
                fetchChannelConfig: {
                    await loadRecorder.record("channels")
                    return emptyNativeChannelConfig()
                },
                fetchPluginConfig: {
                    await loadRecorder.record("plugins")
                    return emptyNativePluginConfig()
                },
                fetchSkillsConfig: {
                    await loadRecorder.record("skills")
                    return emptyNativeSkillConfig()
                },
                fetchAITeamOverview: {
                    await loadRecorder.record("team")
                    return emptyNativeAITeamOverview()
                }
            ),
            daemonEventStreamFactory: {
                AsyncStream { continuation in
                    continuation.yield(
                        ChillClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Gateway ready")
                    )
                    continuation.finish()
                }
            }
        )
        appState.hasBootstrapped = false

        await appState.bootstrap()
        await waitForRecordedEventCount(loadRecorder, expectedCount: 2)

        #expect(await loadRecorder.events() == ["overview", "overview"])
    }

    @Test
    func refreshCurrentSectionCancellationDoesNotSurfaceAlert() async {
        let appState = makeEventDrivenAppState(
            setupCompleted: true,
            selectedSection: .deploy,
            loader: .init(
                fetchOverview: { makeNativeOverview(setupCompleted: true) },
                fetchDeploymentTargets: { throw CancellationError() },
                fetchModelConfig: { emptyNativeModelConfig() },
                fetchChannelConfig: { emptyNativeChannelConfig() },
                fetchPluginConfig: { emptyNativePluginConfig() },
                fetchSkillsConfig: { emptyNativeSkillConfig() },
                fetchAITeamOverview: { emptyNativeAITeamOverview() }
            )
        )

        await appState.refreshCurrentSectionIfNeeded()

        #expect(appState.errorMessage == nil)
    }

    @Test
    func applyDaemonEventCancellationDoesNotSurfaceAlert() async {
        let appState = makeEventDrivenAppState(
            setupCompleted: true,
            selectedSection: .deploy,
            loader: .init(
                fetchOverview: { makeNativeOverview(setupCompleted: true) },
                fetchDeploymentTargets: { throw CancellationError() },
                fetchModelConfig: { emptyNativeModelConfig() },
                fetchChannelConfig: { emptyNativeChannelConfig() },
                fetchPluginConfig: { emptyNativePluginConfig() },
                fetchSkillsConfig: { emptyNativeSkillConfig() },
                fetchAITeamOverview: { emptyNativeAITeamOverview() }
            )
        )

        await appState.applyDaemonEvent(
            ChillClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Ready")
        )

        #expect(appState.errorMessage == nil)
    }

    @Test
    func concurrentSectionRefreshesDoNotStartOverlappingLoads() async {
        let gate = NativeAsyncGate()
        let probe = NativeSectionRefreshProbe()
        let appState = makeEventDrivenAppState(
            setupCompleted: true,
            selectedSection: .configuration,
            loader: .init(
                fetchOverview: { makeNativeOverview(setupCompleted: true) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: {
                    let shouldBlock = await probe.beginModelLoad()
                    if shouldBlock {
                        await gate.wait()
                    }
                    await probe.finishModelLoad()
                    return emptyNativeModelConfig()
                },
                fetchChannelConfig: { emptyNativeChannelConfig() },
                fetchPluginConfig: { emptyNativePluginConfig() },
                fetchSkillsConfig: { emptyNativeSkillConfig() },
                fetchAITeamOverview: { emptyNativeAITeamOverview() }
            )
        )

        let firstRefresh = Task {
            await appState.refreshCurrentSectionIfNeeded()
        }
        await waitForModelLoadCallCount(probe, expectedCount: 1)

        let secondRefresh = Task {
            await appState.refreshCurrentSectionIfNeeded()
        }
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(await probe.maxConcurrentModelLoads() == 1)

        await gate.open()
        await firstRefresh.value
        await secondRefresh.value
    }
}

private actor NativeEventLoadRecorder {
    private var recordedEvents: [String] = []

    func record(_ event: String) {
        recordedEvents.append(event)
    }

    func events() -> [String] {
        recordedEvents
    }
}

private actor NativeAsyncGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen {
            return
        }

        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func open() {
        guard !isOpen else { return }
        isOpen = true
        let continuations = waiters
        waiters.removeAll()
        for continuation in continuations {
            continuation.resume()
        }
    }
}

private actor NativeSectionRefreshProbe {
    private var modelLoadCalls = 0
    private var activeModelLoads = 0
    private var maxActiveModelLoads = 0

    func beginModelLoad() -> Bool {
        modelLoadCalls += 1
        activeModelLoads += 1
        maxActiveModelLoads = max(maxActiveModelLoads, activeModelLoads)
        return modelLoadCalls == 1
    }

    func finishModelLoad() {
        activeModelLoads = max(activeModelLoads - 1, 0)
    }

    func modelLoadCallCount() -> Int {
        modelLoadCalls
    }

    func maxConcurrentModelLoads() -> Int {
        maxActiveModelLoads
    }
}

@MainActor
private func makeEventDrivenAppState(
    setupCompleted: Bool,
    selectedSection: NativeSection,
    loader: ChillClawAppDataLoader,
    daemonEventStreamFactory: ChillClawAppState.DaemonEventStreamFactory? = nil
) -> ChillClawAppState {
    let configuration = ChillClawClientConfiguration(
        daemonURL: URL(string: "http://127.0.0.1:4545")!,
        fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
    )
    let client = ChillClawAPIClient(configurationProvider: { configuration })
    let appState = ChillClawAppState(
        configuration: configuration,
        client: client,
        endpointStore: DaemonEndpointStore(configuration: configuration, ping: { true }),
        processManager: DaemonProcessManager(launchAgent: FakeEventLaunchAgentController(), ping: { true }),
        chatViewModel: ChillClawChatViewModel(transport: FakeEventChatTransport()),
        loader: loader,
        daemonEventStreamFactory: daemonEventStreamFactory
    )
    appState.selectedSection = selectedSection
    appState.overview = makeNativeOverview(setupCompleted: setupCompleted)
    appState.hasBootstrapped = true
    return appState
}

private func waitForRecordedEventCount(_ recorder: NativeEventLoadRecorder, expectedCount: Int) async {
    for _ in 0 ..< 20 {
        if await recorder.events().count >= expectedCount {
            return
        }

        try? await Task.sleep(nanoseconds: 10_000_000)
    }
}

private func waitForModelLoadCallCount(_ probe: NativeSectionRefreshProbe, expectedCount: Int) async {
    for _ in 0 ..< 20 {
        if await probe.modelLoadCallCount() >= expectedCount {
            return
        }

        try? await Task.sleep(nanoseconds: 10_000_000)
    }
}

private func makeNativeOverview(setupCompleted: Bool) -> ProductOverview {
    .init(
        appName: "ChillClaw",
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

private func emptyNativeModelConfig() -> ModelConfigOverview {
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

private func emptyNativeChannelConfig() -> ChannelConfigOverview {
    .init(
        baseOnboardingCompleted: true,
        capabilities: [],
        entries: [],
        activeSession: nil,
        gatewaySummary: "Ready"
    )
}

private func emptyNativePluginConfig() -> PluginConfigOverview {
    .init(entries: [])
}

private func emptyNativeSkillConfig() -> SkillCatalogOverview {
    .init(
        managedSkillsDir: nil,
        workspaceDir: nil,
        marketplaceAvailable: true,
        marketplaceSummary: "Ready",
        installedSkills: [],
        readiness: .init(total: 0, eligible: 0, disabled: 0, blocked: 0, missing: 0, warnings: [], summary: "Ready"),
        marketplacePreview: [],
        presetSkillSync: nil
    )
}

private func emptyNativeAITeamOverview() -> AITeamOverview {
    .init(
        teamVision: "",
        members: [],
        teams: [],
        activity: [],
        availableBrains: [],
        memberPresets: [],
        knowledgePacks: [],
        skillOptions: [],
        presetSkillSync: nil
    )
}

private actor FakeEventLaunchAgentController: LaunchAgentControlling {
    func installAndStart() async throws {}
    func stopAndRemove() async throws {}
    func restart() async throws {}

    func status() async -> LaunchAgentStatus {
        .init(installed: true, running: true, detail: "fake")
    }
}

private struct FakeEventChatTransport: ChillClawChatTransport {
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
            lastPreview: "",
            lastMessageAt: nil,
            unreadCount: 0,
            activeRunState: nil,
            historyStatus: "ready",
            composerState: .init(status: "idle", canSend: true, canAbort: false, activityLabel: nil, error: nil),
            messages: []
        )
    }

    func createThread(memberId: String) async throws -> ChatActionResponse {
        .init(status: "ok", message: "ok", overview: .init(threads: []), thread: nil)
    }

    func sendMessage(threadId: String, message: String, clientMessageId: String?) async throws -> ChatActionResponse {
        .init(status: "ok", message: "ok", overview: .init(threads: []), thread: nil)
    }

    func abort(threadId: String) async throws -> ChatActionResponse {
        .init(status: "ok", message: "ok", overview: .init(threads: []), thread: nil)
    }

    func events() async throws -> AsyncThrowingStream<ChatStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }
}
