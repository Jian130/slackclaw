import Foundation
import Testing
@testable import SlackClawNative
@testable import SlackClawClient
@testable import SlackClawChatUI
@testable import SlackClawProtocol

@MainActor
struct AppStateEventTests {
    @Test
    func overviewRefreshHelperMatchesDashboardEvents() {
        #expect(
            shouldRefreshNativeOverviewForEvent(
                SlackClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Ready")
            ) == true
        )
        #expect(
            shouldRefreshNativeOverviewForEvent(
                SlackClawEvent.modelConfigUpdated(
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
                SlackClawEvent.taskProgress(taskId: "task-1", status: .completed, message: "Done")
            ) == true
        )
        #expect(
            shouldRefreshNativeOverviewForEvent(
                SlackClawEvent.taskProgress(taskId: "task-1", status: .running, message: "Working")
            ) == false
        )
    }

    @Test
    func sectionRefreshHelperScopesLiveEvents() {
        #expect(
            shouldRefreshNativeSectionForEvent(
                SlackClawEvent.channelSessionUpdated(
                    channelId: .wechat,
                    session: .init(id: "session-1", channelId: .wechat, entryId: nil, status: "ready", message: "Ready", logs: [])
                ),
                selectedSection: .configuration
            ) == true
        )
        #expect(
            shouldRefreshNativeSectionForEvent(
                SlackClawEvent.aiTeamUpdated(
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
                SlackClawEvent.skillCatalogUpdated(
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
                SlackClawEvent.pluginConfigUpdated(
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
                SlackClawEvent.deployCompleted(
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
            SlackClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Gateway ready")
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
                        SlackClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Gateway ready")
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
            SlackClawEvent.gatewayStatus(reachable: true, pendingGatewayApply: false, summary: "Ready")
        )

        #expect(appState.errorMessage == nil)
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

@MainActor
private func makeEventDrivenAppState(
    setupCompleted: Bool,
    selectedSection: NativeSection,
    loader: SlackClawAppDataLoader,
    daemonEventStreamFactory: SlackClawAppState.DaemonEventStreamFactory? = nil
) -> SlackClawAppState {
    let configuration = SlackClawClientConfiguration(
        daemonURL: URL(string: "http://127.0.0.1:4545")!,
        fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
    )
    let client = SlackClawAPIClient(configurationProvider: { configuration })
    let appState = SlackClawAppState(
        configuration: configuration,
        client: client,
        endpointStore: DaemonEndpointStore(configuration: configuration, ping: { true }),
        processManager: DaemonProcessManager(launchAgent: FakeEventLaunchAgentController(), ping: { true }),
        chatViewModel: SlackClawChatViewModel(transport: FakeEventChatTransport()),
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

private func makeNativeOverview(setupCompleted: Bool) -> ProductOverview {
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

private struct FakeEventChatTransport: SlackClawChatTransport {
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
