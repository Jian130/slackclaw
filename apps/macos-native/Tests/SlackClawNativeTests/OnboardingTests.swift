import Foundation
import Testing
@testable import SlackClawNative
@testable import SlackClawClient
@testable import SlackClawChatUI
@testable import SlackClawProtocol

@MainActor
@Suite(.serialized)
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
    func welcomeCopyMatchesFigmaStepOneMessage() {
        let copy = nativeOnboardingCopy(localeIdentifier: "en")

        #expect(copy.welcomeBody == "Build your OpenClaw-powered digital employee workspace in minutes")
        #expect(copy.welcomeHighlights.map(\.title) == [
            "One-Click Setup",
            "Personal AI Workspace",
            "Build Your First Digital Employee",
        ])
        #expect(copy.begin == "Get My Workspace Ready")
    }

    @Test
    func nativeOnboardingSupportsSharedLocalePickerOptions() {
        #expect(nativeOnboardingLocaleOptions.map(\.id) == ["en", "zh", "ja", "ko", "es"])
    }

    @Test
    func nativeLocalePickerResolvesSelectedOptionAndFallback() {
        #expect(nativeLocalePickerSelectedOption(localeIdentifier: "ja").id == "ja")
        #expect(nativeLocalePickerSelectedOption(localeIdentifier: "unknown").id == "en")
    }

    @Test
    func nativeOnboardingInsertsPermissionsStepAfterInstall() {
        #expect(nativeOnboardingStepOrder == [.welcome, .install, .permissions, .model, .channel, .employee, .complete])

        let copy = nativeOnboardingCopy(localeIdentifier: "en")
        #expect(copy.stepLabels == ["Welcome", "Install", "Permissions", "Model", "Channel", "AI Employee", "Complete"])
    }

    @Test
    func nativeOnboardingUsesDocumentedWindowAndLayoutRatios() {
        #expect(nativeOnboardingDefaultWindowSize.width == 1280)
        #expect(nativeOnboardingDefaultWindowSize.height == 860)
        #expect(nativeOnboardingMinimumWindowSize.width == 960)
        #expect(nativeOnboardingMinimumWindowSize.height == 720)

        #expect(nativeOnboardingContentWidth(for: 800) == 672)
        #expect(abs(nativeOnboardingContentWidth(for: 1280) - 896) < 0.001)
        #expect(abs(nativeOnboardingContentWidth(for: 1508.57) - 1056) < 0.5)
        #expect(nativeOnboardingContentWidth(for: 1600) == 1120)
        #expect(nativeOnboardingContentWidth(for: 2200) == 1120)
        #expect(nativeOnboardingContentHeight(for: 896) == 520)
        #expect(abs(nativeOnboardingContentHeight(for: 1056) - 606.89) < 0.25)
        #expect(nativeOnboardingContentHeight(for: 1120) == 616)
        #expect(nativeOnboardingHeaderWidth(for: 1056) == 768)
    }

    @Test
    func nativePermissionsCopyMatchesOpenClawCapabilitySurface() {
        let copy = nativePermissionsCopy(localeIdentifier: "en")
        let rows = nativePermissionMetadata(localeIdentifier: "en")

        #expect(copy.onboardingTitle == "Grant permissions")
        #expect(copy.sharedBody == "Allow these so ChillClaw can notify and capture when needed.")
        #expect(copy.grantButton == "Grant")
        #expect(copy.requestAccess == "Request access")

        #expect(rows.map(\.capability) == [
            .appleScript,
            .notifications,
            .accessibility,
            .screenRecording,
            .microphone,
            .speechRecognition,
            .camera,
            .location,
        ])
        #expect(rows.map(\.title) == [
            "Automation (AppleScript)",
            "Notifications",
            "Accessibility",
            "Screen Recording",
            "Microphone",
            "Speech Recognition",
            "Camera",
            "Location",
        ])
    }

    @Test
    func nativeNotificationStatusReadsNotificationCenterOnMainActor() async {
        let recorder = NotificationCenterThreadRecorder()
        NativePermissionManager.overrideNotificationRuntimeAvailableProviderForTesting { true }
        NativePermissionManager.overrideNotificationAuthorizationStatusProviderForTesting {
            recorder.calledOnMainThread = true
            return .authorized
        }
        defer {
            NativePermissionManager.resetNotificationRuntimeAvailableProviderForTesting()
            NativePermissionManager.resetNotificationAuthorizationStatusProviderForTesting()
        }

        _ = await Task.detached {
            await NativePermissionManager.status([.notifications])
        }.value

        #expect(recorder.calledOnMainThread == true)
    }

    @Test
    func nativeNotificationStatusSkipsUserNotificationsWithoutAppBundle() async {
        let recorder = NotificationCenterThreadRecorder()
        NativePermissionManager.overrideNotificationRuntimeAvailableProviderForTesting { false }
        NativePermissionManager.overrideNotificationAuthorizationStatusProviderForTesting {
            recorder.calledOnMainThread = true
            return .authorized
        }
        defer {
            NativePermissionManager.resetNotificationRuntimeAvailableProviderForTesting()
            NativePermissionManager.resetNotificationAuthorizationStatusProviderForTesting()
        }

        let status = await Task.detached {
            await NativePermissionManager.status([.notifications])
        }.value

        #expect(status[.notifications] == false)
        #expect(recorder.calledOnMainThread == false)
    }

    @Test
    func nativeOnboardingUsesCompactLayoutForNarrowContentWidths() {
        #expect(nativeOnboardingUsesCompactProgressLayout(for: 860) == true)
        #expect(nativeOnboardingUsesCompactProgressLayout(for: 1000) == false)
        #expect(nativeOnboardingUsesCompactEmployeeLayout(for: 860) == true)
        #expect(nativeOnboardingUsesCompactEmployeeLayout(for: 1000) == false)
    }

    @Test
    func nativeOnboardingUsesOneProgressHeaderStylePerWidthClassAcrossEveryStep() {
        for step in nativeOnboardingStepOrder {
            #expect(nativeOnboardingUsesInlineProgressHeader(step: step, contentWidth: 860) == true)
            #expect(nativeOnboardingUsesInlineProgressHeader(step: step, contentWidth: 1000) == false)
        }
    }

    @Test
    func nativeOnboardingActionButtonsReserveFullWidthHitTargets() {
        let primary = nativeOnboardingActionButtonLayout(variant: .primary)
        let secondary = nativeOnboardingActionButtonLayout(variant: .secondary)

        #expect(primary.expandsToContainer == true)
        #expect(primary.minHeight == nativeOnboardingCTAHeight)
        #expect(primary.usesFullHitShape == true)

        #expect(secondary.expandsToContainer == true)
        #expect(secondary.minHeight == nativeOnboardingCTAHeight)
        #expect(secondary.usesFullHitShape == true)
    }

    @Test
    func installStepUsesFigmaMissingInstallingFoundAndCompleteStates() {
        let copy = nativeOnboardingCopy(localeIdentifier: "en")

        #expect(
            resolveNativeOnboardingInstallViewState(
                overview: makeOverview(setupCompleted: false, installed: false, running: false, version: nil),
                install: nil,
                busy: false,
                progress: nil,
                copy: copy
            ).kind == .missing
        )

        #expect(
            resolveNativeOnboardingInstallViewState(
                overview: makeOverview(setupCompleted: false, installed: true, running: false, version: "2026.3.13"),
                install: nil,
                busy: false,
                progress: nil,
                copy: copy
            ).kind == .found
        )

        let installing = resolveNativeOnboardingInstallViewState(
            overview: nil,
            install: nil,
            busy: true,
            progress: .init(phase: .verifying, percent: 82, message: nil),
            copy: copy
        )
        #expect(installing.kind == .installing)
        #expect(installing.progressPercent == 82)
        #expect(installing.stageLabel == copy.installStageVerifying)

        let complete = resolveNativeOnboardingInstallViewState(
            overview: makeOverview(setupCompleted: false, installed: true, running: false, version: "2026.3.13"),
            install: .init(installed: true, version: "2026.3.13", disposition: "installed-managed"),
            busy: false,
            progress: nil,
            copy: copy
        )
        #expect(complete.kind == .complete)
        #expect(complete.version == "2026.3.13")
    }

    @Test
    func existingInstallAdvanceDraftMovesToPermissions() {
        let request = buildExistingInstallAdvanceRequest(
            overview: makeOverview(setupCompleted: false, installed: true, running: false, version: "2026.3.13")
        )

        #expect(request.currentStep == .permissions)
        #expect(request.install?.installed == true)
        #expect(request.install?.version == "2026.3.13")
        #expect(request.install?.disposition == "reused-existing")
    }

    @Test
    func advancePastInstallPersistsPermissionsStep() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch (request.httpMethod ?? "GET", url.path) {
            case ("PATCH", "/api/onboarding/state"):
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .permissions))
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badServerResponse)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13") },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )

        await viewModel.advancePastInstall()
        await waitForRecordedURLCount(recorder, expectedCount: 1)

        let request = try #require(await recorder.recordedRequests().first)
        let body = try #require(bodyData(for: request))
        let payload = try JSONDecoder.slackClaw.decode(UpdateOnboardingStateRequest.self, from: body)

        #expect(payload.currentStep == .permissions)
    }

    @Test
    func advancePastPermissionsMarksNextButtonBusyWhilePersisting() async throws {
        let recorder = NativeRequestRecorder()
        let gate = AsyncGate()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch (request.httpMethod ?? "GET", url.path) {
            case ("PATCH", "/api/onboarding/state"):
                await gate.wait()
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .model))
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badServerResponse)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13") },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .permissions)

        let task = Task {
            await viewModel.advancePastPermissions()
        }

        await waitForRecordedURLCount(recorder, expectedCount: 1)
        #expect(viewModel.permissionsNextBusy == true)

        await gate.open()
        await task.value

        #expect(viewModel.permissionsNextBusy == false)
        #expect(viewModel.currentStep == .model)
    }

    @Test
    func onboardingInstallTargetPrefersTheActiveInstalledRuntime() {
        let target = resolveNativeOnboardingInstallTarget(
            overview: makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13"),
            deploymentTargets: makeDeploymentTargetsResponse(
                targets: [
                    .init(
                        id: "standard",
                        title: "OpenClaw Standard",
                        description: "Reuse an existing OpenClaw install when available.",
                        installMode: "system",
                        installed: true,
                        installable: true,
                        planned: false,
                        recommended: true,
                        active: true,
                        version: "2026.3.13",
                        desiredVersion: "latest",
                        latestVersion: "2026.3.14",
                        updateAvailable: true,
                        summary: "System OpenClaw 2026.3.13 is installed and can be reused.",
                        updateSummary: "OpenClaw 2026.3.14 is available.",
                        requirements: ["macOS"],
                        requirementsSourceUrl: nil
                    ),
                    .init(
                        id: "managed-local",
                        title: "OpenClaw Managed Local",
                        description: "Managed runtime.",
                        installMode: "managed-local",
                        installed: true,
                        installable: true,
                        planned: false,
                        recommended: false,
                        active: false,
                        version: "2026.3.12",
                        desiredVersion: "latest",
                        latestVersion: "2026.3.12",
                        updateAvailable: false,
                        summary: "Managed OpenClaw 2026.3.12 is installed.",
                        updateSummary: nil,
                        requirements: ["macOS"],
                        requirementsSourceUrl: nil
                    )
                ]
            )
        )

        #expect(target?.id == "standard")
        #expect(target?.updateAvailable == true)
        #expect(target?.latestVersion == "2026.3.14")
    }

    @Test
    func curatedModelProvidersFollowDaemonOnboardingConfig() {
        let appState = SlackClawAppState()
        appState.modelConfig = emptyModelConfig(
            providers: [
                .init(
                    id: "anthropic",
                    label: "Anthropic",
                    description: "Anthropic",
                    docsUrl: "https://example.com/anthropic",
                    providerRefs: ["anthropic/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["anthropic/claude-opus-4-1"]
                ),
                .init(
                    id: "minimax",
                    label: "MiniMax",
                    description: "MiniMax",
                    docsUrl: "https://example.com/minimax",
                    providerRefs: ["minimax/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["minimax/minimax-m1"]
                ),
                .init(
                    id: "modelstudio",
                    label: "Model Studio",
                    description: "Model Studio",
                    docsUrl: "https://example.com/qwen",
                    providerRefs: ["modelstudio/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["modelstudio/qwen3.5-plus"]
                ),
                .init(
                    id: "openai",
                    label: "OpenAI (API + Codex)",
                    description: "OpenAI",
                    docsUrl: "https://example.com/openai",
                    providerRefs: ["openai/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["openai/gpt-5"]
                ),
            ]
        )

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .model)

        #expect(viewModel.curatedModelProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
        #expect(viewModel.curatedModelProviders.map(\.curated.label) == ["MiniMax", "Qwen (通义千问)", "ChatGPT"])
        #expect(viewModel.curatedModelProviders[1].curated.authMethods.map(\.id) == ["modelstudio-api-key-cn"])
        #expect(viewModel.curatedModelProviders[2].curated.authMethods.map(\.id) == ["openai-api-key", "openai-codex"])
    }

    @Test
    func curatedPickerProvidersRemainVisibleBeforeRuntimeProvidersLoad() {
        let appState = SlackClawAppState()
        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .model)

        #expect(viewModel.modelPickerProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
        #expect(viewModel.modelPickerProviders.map(\.label) == ["MiniMax", "Qwen (通义千问)", "ChatGPT"])
        #expect(viewModel.curatedModelProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
    }

    @Test
    func curatedChannelPickerFollowsDaemonOnboardingConfig() {
        let appState = SlackClawAppState()
        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .channel)

        #expect(viewModel.curatedChannels.map(\.id) == [.wechatWork, .wechat, .feishu, .telegram])
        #expect(viewModel.curatedChannels.map(\.label) == ["WeChat Work (WeCom)", "WeChat", "Feishu", "Telegram"])
    }

    @Test
    func buildingOnboardingWechatSaveValuesKeepsWeChatWorkCredentialOnly() {
        let values = buildOnboardingChannelSaveValues(
            channelID: .wechatWork,
            values: [
                "botId": "1000002",
                "secret": "wechat-secret",
            ]
        )

        #expect(values["botId"] == "1000002")
        #expect(values["secret"] == "wechat-secret")
        #expect(values["token"] == nil)
        #expect(values["encodingAesKey"] == nil)
    }

    @Test
    func buildingOnboardingPersonalWechatSaveValuesStaysQRFirst() {
        let values = buildOnboardingChannelSaveValues(
            channelID: .wechat,
            values: [:]
        )

        #expect(values.isEmpty)
    }

    @Test
    func openingModelTutorialUsesInAppTutorialState() {
        let appState = SlackClawAppState()
        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .model)
        viewModel.selectProvider(viewModel.modelPickerProviders[0])

        viewModel.openModelTutorial()

        #expect(viewModel.modelTutorialURLString == "https://video.example/minimax")
        #expect(viewModel.isModelTutorialPresented == true)

        viewModel.dismissModelTutorial()
        #expect(viewModel.isModelTutorialPresented == false)
    }

    @Test
    func onboardingProviderSelectionDoesNotAutoChooseFirstCuratedProvider() {
        let providers: [NativeResolvedOnboardingModelProvider] = [
            .init(
                id: "minimax",
                curated: .init(
                    id: "minimax",
                    label: "MiniMax",
                    description: "MiniMax models for onboarding.",
                    theme: "minimax",
                    platformUrl: "https://platform.minimaxi.com/login",
                    defaultModelKey: "minimax/MiniMax-M2.5",
                    authMethods: []
                ),
                provider: .init(
                    id: "minimax",
                    label: "MiniMax",
                    description: "MiniMax",
                    docsUrl: "https://example.com/minimax",
                    providerRefs: ["minimax/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["minimax/minimax-m1"]
                )
            )
        ]

        #expect(resolveOnboardingProviderID(currentProviderId: "", draftProviderId: nil, providers: providers).isEmpty)
        #expect(resolveOnboardingProviderID(currentProviderId: "anthropic", draftProviderId: nil, providers: providers).isEmpty)
        #expect(resolveOnboardingProviderID(currentProviderId: "", draftProviderId: "minimax", providers: providers) == "minimax")
    }

    @Test
    func clearedDraftProviderWinsOverStaleLocalSelection() {
        struct Provider: Identifiable {
            let id: String
        }

        let providers = [Provider(id: "minimax"), Provider(id: "openai")]

        #expect(resolveOnboardingProviderID(currentProviderId: "openai", draftProviderId: "", providers: providers).isEmpty)
        #expect(resolveOnboardingProviderID(currentProviderId: "openai", draftProviderId: "minimax", providers: providers) == "minimax")
        #expect(resolveOnboardingProviderID(currentProviderId: "openai", draftProviderId: nil, providers: providers) == "openai")
    }

    @Test
    func modelStepUsesPickerConfigureAndConnectedStates() {
        let providers: [NativeResolvedOnboardingModelProvider] = [
            .init(
                id: "openai",
                curated: .init(
                    id: "openai",
                    label: "ChatGPT",
                    description: "OpenAI ChatGPT for onboarding.",
                    theme: "chatgpt",
                    platformUrl: "https://platform.openai.com/api-keys",
                    defaultModelKey: "openai/gpt-5.1-codex",
                    authMethods: []
                ),
                provider: .init(
                    id: "openai",
                    label: "OpenAI",
                    description: "OpenAI",
                    docsUrl: "https://example.com/openai",
                    providerRefs: ["openai/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["openai/gpt-5"]
                )
            )
        ]

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "",
                methodId: "",
                modelKey: "",
                providers: providers,
                selectedEntry: nil,
                draftEntryID: nil,
                summaryEntryID: nil,
                activeModelAuthSessionId: ""
            ).kind == .picker
        )

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "openai",
                methodId: "api_key",
                modelKey: "openai/gpt-5",
                providers: providers,
                selectedEntry: nil,
                draftEntryID: nil,
                summaryEntryID: nil,
                activeModelAuthSessionId: ""
            ).kind == .configure
        )

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "openai",
                methodId: "api_key",
                modelKey: "openai/gpt-5",
                providers: providers,
                selectedEntry: .init(
                    id: "entry-1",
                    label: "ChatGPT",
                    providerId: "openai",
                    modelKey: "openai/gpt-5",
                    agentId: "",
                    authMethodId: "api_key",
                    isDefault: true,
                    isFallback: false,
                    createdAt: "2026-03-22T00:00:00.000Z",
                    updatedAt: "2026-03-22T00:00:00.000Z"
                ),
                draftEntryID: "entry-1",
                summaryEntryID: nil,
                activeModelAuthSessionId: ""
            ).kind == .connected
        )

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "openai",
                methodId: "oauth",
                modelKey: "openai/gpt-5",
                providers: providers,
                selectedEntry: .init(
                    id: "entry-1",
                    label: "ChatGPT",
                    providerId: "openai",
                    modelKey: "openai/gpt-5",
                    agentId: "",
                    authMethodId: "api_key",
                    isDefault: true,
                    isFallback: false,
                    createdAt: "2026-03-22T00:00:00.000Z",
                    updatedAt: "2026-03-22T00:00:00.000Z"
                ),
                draftEntryID: "entry-1",
                summaryEntryID: nil,
                activeModelAuthSessionId: ""
            ).kind == .configure
        )

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "openai",
                methodId: "api_key",
                modelKey: "openai/gpt-5",
                providers: providers,
                selectedEntry: .init(
                    id: "entry-1",
                    label: "ChatGPT",
                    providerId: "openai",
                    modelKey: "openai/gpt-5",
                    agentId: "",
                    authMethodId: "api_key",
                    isDefault: true,
                    isFallback: false,
                    createdAt: "2026-03-22T00:00:00.000Z",
                    updatedAt: "2026-03-22T00:00:00.000Z"
                ),
                draftEntryID: "entry-1",
                summaryEntryID: nil,
                activeModelAuthSessionId: "session-1"
            ).kind == .configure
        )
    }

    @Test
    func modelStepDoesNotReportConnectedBeforeSavedEntryPersistsIntoOnboardingState() {
        let providers: [NativeResolvedOnboardingModelProvider] = [
            .init(
                id: "openai",
                curated: .init(
                    id: "openai",
                    label: "ChatGPT",
                    description: "OpenAI ChatGPT for onboarding.",
                    theme: "chatgpt",
                    platformUrl: "https://platform.openai.com/api-keys",
                    defaultModelKey: "openai/gpt-5.1-codex",
                    authMethods: []
                ),
                provider: .init(
                    id: "openai",
                    label: "OpenAI",
                    description: "OpenAI",
                    docsUrl: "https://example.com/openai",
                    providerRefs: ["openai/"],
                    authMethods: [],
                    configured: false,
                    modelCount: 1,
                    sampleModels: ["openai/gpt-5"]
                )
            )
        ]

        #expect(
            resolveNativeOnboardingModelViewState(
                providerId: "openai",
                methodId: "api_key",
                modelKey: "openai/gpt-5",
                providers: providers,
                selectedEntry: .init(
                    id: "entry-1",
                    label: "ChatGPT",
                    providerId: "openai",
                    modelKey: "openai/gpt-5",
                    agentId: "",
                    authMethodId: "api_key",
                    isDefault: true,
                    isFallback: false,
                    createdAt: "2026-03-22T00:00:00.000Z",
                    updatedAt: "2026-03-22T00:00:00.000Z"
                ),
                draftEntryID: nil,
                summaryEntryID: nil,
                activeModelAuthSessionId: ""
            ).kind == .configure
        )
    }

    @Test
    func modelStepCopyMatchesFigmaCuratedProviderFlow() {
        let copy = nativeOnboardingCopy(localeIdentifier: "en")

        #expect(copy.modelTitle == "Choose Your AI Model")
        #expect(copy.modelBody == "Select an AI provider to power your digital employees")
        #expect(copy.providerTitle == "Select a provider to get started")
        #expect(copy.authTitle == "How would you like to connect?")
    }

    @Test
    func minimaxUsesGuidedApiKeySetupVariant() {
        #expect(resolveNativeOnboardingModelSetupVariant(providerID: "minimax", methodKind: "api-key") == .guidedMiniMaxAPIKey)
        #expect(resolveNativeOnboardingModelSetupVariant(providerID: "openai", methodKind: "api-key") == .defaultAPIKey)
        #expect(resolveNativeOnboardingModelSetupVariant(providerID: "openai", methodKind: "oauth") == .oauth)
    }

    @Test
    func authMethodChooserOnlyAppearsForMultiMethodProviders() {
        let singleMethod: [ModelAuthMethod] = [
            .init(id: "minimax-api", label: "API Key", kind: "api-key", description: "Paste a MiniMax API key.", interactive: false, fields: [])
        ]
        let multipleMethods: [ModelAuthMethod] = [
            .init(id: "openai-api-key", label: "API Key", kind: "api-key", description: "Paste an OpenAI API key.", interactive: false, fields: []),
            .init(id: "openai-codex", label: "OAuth", kind: "oauth", description: "Connect securely with your account.", interactive: true, fields: []),
        ]

        #expect(
            shouldShowNativeOnboardingAuthMethodChooser(singleMethod) == false
        )

        #expect(
            shouldShowNativeOnboardingAuthMethodChooser(multipleMethods) == true
        )
    }

    @Test
    func cancelledDraftPersistenceDoesNotSurfaceUserError() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let path = request.url?.path ?? ""
            if path == "/api/onboarding/state" {
                throw CancellationError()
            }

            throw URLError(.badServerResponse)
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .model)

        await viewModel.persistDraftSafely(.init(currentStep: .model))

        #expect(viewModel.pageError == nil)
    }

    @Test
    func modelStepDoesNotFetchRuntimeCatalogBeforeFinalSubmit() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            if url.path == "/api/onboarding/state" {
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .model))
                return (jsonResponse(url: url), body)
            }

            throw URLError(.badServerResponse)
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )

        await viewModel.bootstrap()
        viewModel.selectProvider(viewModel.modelPickerProviders[1])

        let recordedPaths = await recorder.recordedURLs()
        #expect(recordedPaths == ["http://127.0.0.1:4545/api/onboarding/state?fresh=1"])
        #expect(viewModel.providerId == "modelstudio")
        #expect(viewModel.methodId == "modelstudio-api-key-cn")
        #expect(viewModel.modelKey == "modelstudio/qwen3.5-plus")
    }

    @Test
    func buildsOnboardingMemberRequestWithDeterministicHiddenFields() {
        let request = buildOnboardingMemberRequest(
            .init(
                name: "Alex Morgan",
                jobTitle: "Research Analyst",
                avatarPresetId: "onboarding-analyst",
                presetId: "research-analyst",
                personalityTraits: [],
                presetSkillIds: ["research-brief", "status-writer"],
                knowledgePackIds: ["company-handbook", "delivery-playbook"],
                workStyles: ["Analytical", "Concise"],
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
        #expect(request.personality == "Analytical, Concise")
        #expect(request.soul == "Analytical, Concise")
        #expect(request.workStyles == ["Analytical", "Concise"])
        #expect(request.presetSkillIds == ["research-brief", "status-writer"])
        #expect(request.skillIds.isEmpty)
        #expect(request.knowledgePackIds == ["company-handbook", "delivery-playbook"])
        #expect(request.capabilitySettings.memoryEnabled == true)
        #expect(request.capabilitySettings.contextWindow == 128000)
    }

    @Test
    func onboardingAvatarResourcesResolveFromBundle() {
        for preset in nativeOnboardingAvatarPresets {
            #expect(onboardingAssetURL(preset.id) != nil)
        }
    }

    @Test
    func resolvesCuratedEmployeePresetsFromOnboardingState() {
        let presets = resolveOnboardingEmployeePresets(onboardingState: makeOnboardingStateResponse(step: .employee))

        #expect(presets.map(\.id) == ["research-analyst", "support-captain", "delivery-operator"])
        #expect(presets[0].starterSkillLabels == ["Research Brief", "Status Writer"])
        #expect(presets[1].toolLabels == ["Customer voice", "Memory"])
        #expect(presets[2].knowledgePackIds == ["delivery-playbook", "company-handbook"])
    }

    @Test
    func resolvesPresetSkillReadinessFromOnboardingState() {
        let onboardingState = makeOnboardingStateResponse(step: .employee)
        let preset = try! #require(onboardingState.config.employeePresets.first)

        let ready = resolveOnboardingEmployeePresetReadiness(preset: preset, onboardingState: onboardingState)
        #expect(ready.status == .ready)
        #expect(ready.blocking == false)

        let syncingState = OnboardingStateResponse(
            firstRun: onboardingState.firstRun,
            draft: onboardingState.draft,
            config: onboardingState.config,
            summary: onboardingState.summary,
            presetSkillSync: .init(
                targetMode: .managedLocal,
                entries: [
                    .init(
                        presetSkillId: "research-brief",
                        runtimeSlug: "research-brief",
                        targetMode: .managedLocal,
                        status: .installing,
                        updatedAt: "2026-03-27T00:00:00.000Z"
                    )
                ],
                summary: "1 preset skill is syncing on the managed-local runtime.",
                repairRecommended: true
            )
        )
        #expect(resolveOnboardingEmployeePresetReadiness(preset: preset, onboardingState: syncingState).status == .syncing)

        let failedState = OnboardingStateResponse(
            firstRun: onboardingState.firstRun,
            draft: onboardingState.draft,
            config: onboardingState.config,
            summary: onboardingState.summary,
            presetSkillSync: .init(
                targetMode: .managedLocal,
                entries: [
                    .init(
                        presetSkillId: "research-brief",
                        runtimeSlug: "research-brief",
                        targetMode: .managedLocal,
                        status: .failed,
                        lastError: "Missing skill install.",
                        updatedAt: "2026-03-27T00:00:00.000Z"
                    )
                ],
                summary: "1 preset skill needs repair on the managed-local runtime.",
                repairRecommended: true
            )
        )
        let failed = resolveOnboardingEmployeePresetReadiness(preset: preset, onboardingState: failedState)
        #expect(failed.status == .repair)
        #expect(failed.detail == "Missing skill install.")
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
                fetchPluginConfig: {
                    await loadRecorder.record("plugins")
                    return emptyPluginConfig()
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
                fetchPluginConfig: {
                    await loadRecorder.record("plugins")
                    return emptyPluginConfig()
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
        #expect(await loadRecorder.events().sorted() == ["models", "overview", "team"])
    }

    @Test
    func onboardingBootstrapReusesExistingOverviewWithoutRefetchingIt() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let path = request.url?.path ?? ""
            if path == "/api/overview" {
                throw URLError(.timedOut)
            }

            #expect(path == "/api/onboarding/state")

            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .welcome))
            return (response, body)
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: { configuration }
        )
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: DaemonEndpointStore(configuration: configuration, ping: { true }),
            processManager: DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true }),
            chatViewModel: SlackClawChatViewModel(transport: FakeChatTransport()),
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )
        appState.overview = makeOverview(setupCompleted: false)

        let emptyStream = AsyncStream<SlackClawEvent> { continuation in
            continuation.finish()
        }
        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { emptyStream }
        )
        await viewModel.bootstrap()

        #expect(viewModel.pageError == nil)
        #expect(await recorder.recordedURLs() == ["http://127.0.0.1:4545/api/onboarding/state?fresh=1"])
    }

    @Test
    func onboardingBootstrapLoadsDeploymentTargetsForInstallStepWhenOpenClawExists() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch url.path {
            case "/api/onboarding/state":
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .install))
                return (jsonResponse(url: url), body)
            case "/api/deploy/targets":
                let body = try JSONEncoder.slackClaw.encode(
                    makeDeploymentTargetsResponse(
                        targets: [
                            .init(
                                id: "standard",
                                title: "OpenClaw Standard",
                                description: "Reuse an existing OpenClaw install when available.",
                                installMode: "system",
                                installed: true,
                                installable: true,
                                planned: false,
                                recommended: true,
                                active: true,
                                version: "2026.3.13",
                                desiredVersion: "latest",
                                latestVersion: "2026.3.14",
                                updateAvailable: true,
                                summary: "System OpenClaw 2026.3.13 is installed and can be reused.",
                                updateSummary: "OpenClaw 2026.3.14 is available.",
                                requirements: ["macOS"],
                                requirementsSourceUrl: nil
                            )
                        ]
                    )
                )
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badServerResponse)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13") },
                fetchDeploymentTargets: { makeDeploymentTargetsResponse(targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )
        appState.overview = makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13")

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )

        await viewModel.bootstrap()

        let urls = await recorder.recordedURLs()
        #expect(urls.contains("http://127.0.0.1:4545/api/onboarding/state?fresh=1"))
        #expect(urls.contains("http://127.0.0.1:4545/api/deploy/targets?fresh=1"))
        #expect(resolveNativeOnboardingInstallTarget(overview: appState.overview, deploymentTargets: appState.deploymentTargets)?.id == "standard")
    }

    @Test
    func updateExistingInstallUsesTheActiveTargetAndRefreshesInstallContext() async throws {
        let recorder = NativeRequestRecorder()
        let initialTargets = makeDeploymentTargetsResponse(
            targets: [
                .init(
                    id: "standard",
                    title: "OpenClaw Standard",
                    description: "Reuse an existing OpenClaw install when available.",
                    installMode: "system",
                    installed: true,
                    installable: true,
                    planned: false,
                    recommended: true,
                    active: true,
                    version: "2026.3.13",
                    desiredVersion: "latest",
                    latestVersion: "2026.3.14",
                    updateAvailable: true,
                    summary: "System OpenClaw 2026.3.13 is installed and can be reused.",
                    updateSummary: "OpenClaw 2026.3.14 is available.",
                    requirements: ["macOS"],
                    requirementsSourceUrl: nil
                )
            ]
        )
        let refreshedTargets = makeDeploymentTargetsResponse(
            targets: [
                .init(
                    id: "standard",
                    title: "OpenClaw Standard",
                    description: "Reuse an existing OpenClaw install when available.",
                    installMode: "system",
                    installed: true,
                    installable: true,
                    planned: false,
                    recommended: true,
                    active: true,
                    version: "2026.3.14",
                    desiredVersion: "latest",
                    latestVersion: "2026.3.14",
                    updateAvailable: false,
                    summary: "System OpenClaw 2026.3.14 is installed and can be reused.",
                    updateSummary: nil,
                    requirements: ["macOS"],
                    requirementsSourceUrl: nil
                )
            ]
        )

        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch (request.httpMethod ?? "GET", url.path) {
            case ("GET", "/api/onboarding/state"):
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .install))
                return (jsonResponse(url: url), body)
            case ("GET", "/api/deploy/targets"):
                let query = url.query ?? ""
                let body = try JSONEncoder.slackClaw.encode(query.contains("fresh=1") ? refreshedTargets : initialTargets)
                return (jsonResponse(url: url), body)
            case ("POST", "/api/deploy/targets/standard/update"):
                let body = try JSONEncoder.slackClaw.encode(
                    DeploymentTargetActionResponse(
                        targetId: "standard",
                        status: "completed",
                        message: "System OpenClaw updated from 2026.3.13 to 2026.3.14.",
                        engineStatus: makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.14").engine
                    )
                )
                return (jsonResponse(url: url), body)
            case ("GET", "/api/overview"):
                let body = try JSONEncoder.slackClaw.encode(
                    makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.14")
                )
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badServerResponse)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(session: session, configurationProvider: { configuration })
        let endpointStore = DaemonEndpointStore(configuration: configuration, ping: { true })
        let processManager = DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true })
        let chatViewModel = SlackClawChatViewModel(transport: FakeChatTransport())
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: endpointStore,
            processManager: processManager,
            chatViewModel: chatViewModel,
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13") },
                fetchDeploymentTargets: { initialTargets },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )
        appState.overview = makeOverview(setupCompleted: false, installed: true, running: true, version: "2026.3.13")
        appState.deploymentTargets = initialTargets

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { AsyncStream { continuation in continuation.finish() } }
        )
        viewModel.onboardingState = makeOnboardingStateResponse(step: .install)

        await viewModel.updateExistingInstall()

        let urls = await recorder.recordedURLs()
        #expect(urls.contains("http://127.0.0.1:4545/api/deploy/targets/standard/update"))
        #expect(appState.overview?.engine.version == "2026.3.14")
        #expect(resolveNativeOnboardingInstallTarget(overview: appState.overview, deploymentTargets: appState.deploymentTargets)?.updateAvailable == false)
        #expect(viewModel.pageError == nil)
        #expect(viewModel.installBusy == false)
    }

    @Test
    func onboardingRefreshResourceMapsDaemonEventsByStep() {
        let installEvent = SlackClawEvent.deployCompleted(
            correlationId: "deploy-1",
            targetId: "managed-local",
            status: "completed",
            message: "Installed.",
            engineStatus: makeOverview(setupCompleted: true).engine
        )
        let modelEvent = SlackClawEvent.modelConfigUpdated(
            snapshot: .init(
                epoch: "epoch-1",
                revision: 1,
                data: emptyModelConfig()
            )
        )
        let channelEvent = SlackClawEvent.channelSessionUpdated(
            channelId: .wechat,
            session: .init(
                id: "session-1",
                channelId: .wechat,
                entryId: nil,
                status: "ready",
                message: "Ready",
                logs: [],
                launchUrl: nil,
                inputPrompt: nil
            )
        )
        let employeeEvent = SlackClawEvent.aiTeamUpdated(
            snapshot: .init(
                epoch: "epoch-1",
                revision: 2,
                data: emptyAITeamOverview()
            )
        )
        let presetSyncEvent = SlackClawEvent.presetSkillSyncUpdated(
            snapshot: .init(
                epoch: "epoch-1",
                revision: 1,
                data: .init(
                    targetMode: .managedLocal,
                    entries: [],
                    summary: "No preset skills selected.",
                    repairRecommended: false
                )
            )
        )
        let unrelatedEvent = SlackClawEvent.taskProgress(taskId: "task-1", status: .running, message: "Working")

        #expect(onboardingRefreshResourceForEvent(.install, installEvent) == .installContext)
        #expect(onboardingRefreshResourceForEvent(.model, modelEvent) == nil)
        #expect(onboardingRefreshResourceForEvent(.channel, channelEvent) == .channel)
        #expect(onboardingRefreshResourceForEvent(.employee, employeeEvent) == nil)
        #expect(onboardingRefreshResourceForEvent(.complete, employeeEvent) == nil)
        #expect(onboardingRefreshResourceForEvent(.employee, presetSyncEvent) == .onboarding)
        #expect(onboardingRefreshResourceForEvent(.welcome, unrelatedEvent) == nil)
        #expect(onboardingRefreshResourceForEvent(.model, unrelatedEvent) == nil)
    }

    @Test
    func onboardingDaemonEventsRefreshOnlyTheCurrentStepResource() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch url.path {
            case "/api/onboarding/state":
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .model))
                return (jsonResponse(url: url), body)
            case "/api/models/config":
                let body = try JSONEncoder.slackClaw.encode(emptyModelConfig())
                return (jsonResponse(url: url), body)
            case "/api/channels/config":
                let body = try JSONEncoder.slackClaw.encode(emptyChannelConfig())
                return (jsonResponse(url: url), body)
            case "/api/ai-team/overview":
                let body = try JSONEncoder.slackClaw.encode(emptyAITeamOverview())
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badURL)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: { configuration }
        )
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: DaemonEndpointStore(configuration: configuration, ping: { true }),
            processManager: DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true }),
            chatViewModel: SlackClawChatViewModel(transport: FakeChatTransport()),
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )
        appState.overview = makeOverview(setupCompleted: false)

        let eventStream = AsyncStream<SlackClawEvent> { continuation in
            continuation.yield(
                .modelConfigUpdated(
                    snapshot: .init(
                        epoch: "epoch-1",
                        revision: 1,
                        data: emptyModelConfig()
                    )
                )
            )
            continuation.finish()
        }

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { eventStream }
        )

        await viewModel.bootstrap()
        await waitForRecordedURLCount(recorder, expectedCount: 2)

        #expect(
            await recorder.recordedURLs() == [
                "http://127.0.0.1:4545/api/onboarding/state?fresh=1"
            ]
        )
    }

    @Test
    func onboardingDaemonEventsIgnoreIrrelevantSteps() async throws {
        let recorder = NativeRequestRecorder()
        let session = await recorder.session { request in
            let url = try #require(request.url)
            switch url.path {
            case "/api/onboarding/state":
                let body = try JSONEncoder.slackClaw.encode(makeOnboardingStateResponse(step: .channel))
                return (jsonResponse(url: url), body)
            case "/api/channels/config":
                let body = try JSONEncoder.slackClaw.encode(emptyChannelConfig())
                return (jsonResponse(url: url), body)
            case "/api/models/config":
                let body = try JSONEncoder.slackClaw.encode(emptyModelConfig())
                return (jsonResponse(url: url), body)
            case "/api/ai-team/overview":
                let body = try JSONEncoder.slackClaw.encode(emptyAITeamOverview())
                return (jsonResponse(url: url), body)
            default:
                throw URLError(.badURL)
            }
        }

        let configuration = SlackClawClientConfiguration(
            daemonURL: URL(string: "http://127.0.0.1:4545")!,
            fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: { configuration }
        )
        let appState = SlackClawAppState(
            configuration: configuration,
            client: client,
            endpointStore: DaemonEndpointStore(configuration: configuration, ping: { true }),
            processManager: DaemonProcessManager(launchAgent: FakeLaunchAgentController(), ping: { true }),
            chatViewModel: SlackClawChatViewModel(transport: FakeChatTransport()),
            loader: .init(
                fetchOverview: { makeOverview(setupCompleted: false) },
                fetchDeploymentTargets: { .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: []) },
                fetchModelConfig: { emptyModelConfig() },
                fetchChannelConfig: { emptyChannelConfig() },
                fetchPluginConfig: { emptyPluginConfig() },
                fetchSkillsConfig: { emptySkillConfig() },
                fetchAITeamOverview: { emptyAITeamOverview() }
            )
        )
        appState.overview = makeOverview(setupCompleted: false)

        let eventStream = AsyncStream<SlackClawEvent> { continuation in
            continuation.yield(.taskProgress(taskId: "task-1", status: .running, message: "Working"))
            continuation.finish()
        }

        let viewModel = NativeOnboardingViewModel(
            appState: appState,
            daemonEventStreamFactory: { eventStream }
        )

        await viewModel.bootstrap()
        await waitForRecordedURLCount(recorder, expectedCount: 2)

        let urls = await recorder.recordedURLs()
        #expect(urls.contains("http://127.0.0.1:4545/api/onboarding/state?fresh=1"))
        #expect(urls.contains("http://127.0.0.1:4545/api/channels/config?fresh=1"))
        #expect(urls.filter { $0.contains("/api/channels/config") }.count == 1)
        #expect(urls.filter { $0.contains("/api/models/config") }.isEmpty)
        #expect(urls.filter { $0.contains("/api/ai-team/overview") }.isEmpty)
    }
}

private func makeOverview(
    setupCompleted: Bool,
    installed: Bool = true,
    running: Bool = true,
    version: String? = "2026.3.13"
) -> ProductOverview {
    .init(
        appName: "SlackClaw",
        appVersion: "0.1.2",
        platformTarget: "macOS first",
        firstRun: .init(introCompleted: true, setupCompleted: setupCompleted, selectedProfileId: nil),
        appService: .init(mode: .launchagent, installed: true, running: true, managedAtLogin: true, label: nil, summary: "Running", detail: "Loaded"),
        engine: .init(engine: "openclaw", installed: installed, running: running, version: version, summary: installed ? "Ready" : "Missing", pendingGatewayApply: false, pendingGatewayApplySummary: nil, lastCheckedAt: "2026-03-20T00:00:00.000Z"),
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

private func emptyModelConfig(providers: [ModelProviderConfig] = []) -> ModelConfigOverview {
    .init(
        providers: providers,
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

private func emptyPluginConfig() -> PluginConfigOverview {
    .init(entries: [])
}

private func emptySkillConfig() -> SkillCatalogOverview {
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

private func emptyAITeamOverview() -> AITeamOverview {
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

private func makeDeploymentTargetsResponse(targets: [DeploymentTargetStatus]) -> DeploymentTargetsResponse {
    .init(checkedAt: "2026-03-20T00:00:00.000Z", targets: targets)
}

private func makeOnboardingStateResponse(step: OnboardingStep) -> OnboardingStateResponse {
    .init(
        firstRun: .init(introCompleted: true, setupCompleted: false),
        draft: .init(currentStep: step),
        config: .init(
            modelProviders: [
                .init(
                    id: "minimax",
                    label: "MiniMax",
                    description: "MiniMax models for onboarding.",
                    theme: "minimax",
                    platformUrl: "https://platform.minimaxi.com/login",
                    tutorialVideoUrl: "https://video.example/minimax",
                    defaultModelKey: "minimax/MiniMax-M2.5",
                    authMethods: [
                        .init(id: "minimax-api", label: "API Key", kind: "api-key", description: "Paste a MiniMax API key.", interactive: false, fields: [])
                    ]
                ),
                .init(
                    id: "modelstudio",
                    label: "Qwen (通义千问)",
                    description: "Qwen models for onboarding.",
                    theme: "qwen",
                    platformUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
                    defaultModelKey: "modelstudio/qwen3.5-plus",
                    authMethods: [
                        .init(id: "modelstudio-api-key-cn", label: "API Key", kind: "api-key", description: "Paste a Model Studio API key.", interactive: false, fields: [])
                    ]
                ),
                .init(
                    id: "openai",
                    label: "ChatGPT",
                    description: "OpenAI ChatGPT for onboarding.",
                    theme: "chatgpt",
                    platformUrl: "https://platform.openai.com/api-keys",
                    defaultModelKey: "openai/gpt-5.1-codex",
                    authMethods: [
                        .init(id: "openai-api-key", label: "API Key", kind: "api-key", description: "Paste an OpenAI API key.", interactive: false, fields: []),
                        .init(id: "openai-codex", label: "OAuth", kind: "oauth", description: "Connect securely with your account.", interactive: true, fields: [])
                    ]
                ),
            ],
            channels: [
                .init(
                    id: .wechatWork,
                    label: "WeChat Work (WeCom)",
                    secondaryLabel: "企业微信",
                    description: "Configure WeChat Work.",
                    theme: .wechatWork,
                    setupKind: .wechatWorkGuided,
                    docsUrl: "https://work.weixin.qq.com/"
                ),
                .init(
                    id: .wechat,
                    label: "WeChat",
                    secondaryLabel: "微信",
                    description: "Configure personal WeChat.",
                    theme: .wechat,
                    setupKind: .wechatGuided,
                    docsUrl: nil
                ),
                .init(
                    id: .feishu,
                    label: "Feishu",
                    secondaryLabel: "飞书",
                    description: "Configure Feishu.",
                    theme: .feishu,
                    setupKind: .feishuGuided,
                    platformUrl: "https://open.feishu.cn/app",
                    tutorialVideoUrl: "https://video.example/feishu"
                ),
                .init(
                    id: .telegram,
                    label: "Telegram",
                    secondaryLabel: "Telegram",
                    description: "Configure Telegram.",
                    theme: .telegram,
                    setupKind: .telegramGuided,
                    docsUrl: "https://core.telegram.org/bots/tutorial"
                )
            ],
            employeePresets: [
                .init(
                    id: "research-analyst",
                    label: "Research Analyst",
                    description: "Research quickly, write crisp summaries, and keep answers grounded in the right context.",
                    theme: "analyst",
                    starterSkillLabels: ["Research Brief", "Status Writer"],
                    toolLabels: ["Company handbook", "Delivery playbook"],
                    presetSkillIds: ["research-brief", "status-writer"],
                    knowledgePackIds: ["company-handbook", "delivery-playbook"],
                    workStyles: ["Analytical", "Concise"],
                    defaultMemoryEnabled: true
                ),
                .init(
                    id: "support-captain",
                    label: "Support Captain",
                    description: "Handle customer-facing requests with calm tone, clear follow-ups, and fast status updates.",
                    theme: "support",
                    starterSkillLabels: ["Status Writer"],
                    toolLabels: ["Customer voice", "Memory"],
                    presetSkillIds: ["status-writer"],
                    knowledgePackIds: ["customer-voice"],
                    workStyles: ["Calm", "Supportive"],
                    defaultMemoryEnabled: true
                ),
                .init(
                    id: "delivery-operator",
                    label: "Delivery Operator",
                    description: "Turn briefs into checklists, track milestones, and keep execution moving without extra setup.",
                    theme: "operator",
                    starterSkillLabels: ["Research Brief"],
                    toolLabels: ["Delivery playbook", "Company handbook"],
                    presetSkillIds: ["research-brief"],
                    knowledgePackIds: ["delivery-playbook", "company-handbook"],
                    workStyles: ["Methodical", "Action-oriented"],
                    defaultMemoryEnabled: true
                )
            ]
        ),
        summary: .init(),
        presetSkillSync: .init(
            targetMode: .managedLocal,
            entries: [
                .init(
                    presetSkillId: "research-brief",
                    runtimeSlug: "research-brief",
                    targetMode: .managedLocal,
                    status: .verified,
                    updatedAt: "2026-03-27T00:00:00.000Z"
                ),
                .init(
                    presetSkillId: "status-writer",
                    runtimeSlug: "status-writer",
                    targetMode: .managedLocal,
                    status: .verified,
                    updatedAt: "2026-03-27T00:00:00.000Z"
                )
            ],
            summary: "2 preset skills verified on the managed-local runtime.",
            repairRecommended: false
        )
    )
}

private func jsonResponse(url: URL) -> HTTPURLResponse {
    HTTPURLResponse(
        url: url,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
    )!
}

private func waitForRecordedURLCount(_ recorder: NativeRequestRecorder, expectedCount: Int) async {
    for _ in 0 ..< 50 {
        if await recorder.recordedURLs().count >= expectedCount {
            return
        }

        try? await Task.sleep(nanoseconds: 10_000_000)
    }
}

private func bodyData(for request: URLRequest) -> Data? {
    if let body = request.httpBody {
        return body
    }

    guard let stream = request.httpBodyStream else {
        return nil
    }

    stream.open()
    defer { stream.close() }

    let bufferSize = 4096
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
    defer { buffer.deallocate() }

    var data = Data()
    while stream.hasBytesAvailable {
        let read = stream.read(buffer, maxLength: bufferSize)
        if read < 0 {
            return nil
        }
        if read == 0 {
            break
        }
        data.append(buffer, count: read)
    }

    return data
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

private actor NativeRequestRecorder {
    private var requests: [URLRequest] = []

    func session(handler: @escaping @Sendable (URLRequest) async throws -> (HTTPURLResponse, Data)) async -> URLSession {
        await MainActor.run {
            NativeRecordingURLProtocol.handler = { request in
                await self.record(request)
                return try await handler(request)
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativeRecordingURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    func record(_ request: URLRequest) {
        requests.append(request)
    }

    func recordedURLs() -> [String] {
        requests.compactMap { $0.url?.absoluteString }
    }

    func recordedRequests() -> [URLRequest] {
        requests
    }
}

private actor AsyncGate {
    private var continuation: CheckedContinuation<Void, Never>?
    private var isOpen = false

    func wait() async {
        if isOpen {
            return
        }

        await withCheckedContinuation { continuation in
            self.continuation = continuation
        }
    }

    func open() {
        isOpen = true
        continuation?.resume()
        continuation = nil
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

@MainActor
private final class NotificationCenterThreadRecorder {
    var calledOnMainThread = false
}

private final class NativeRecordingURLProtocol: URLProtocol, @unchecked Sendable {
    @MainActor static var handler: (@Sendable (URLRequest) async throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Task {
            guard let client else { return }
            let handler = await MainActor.run { Self.handler }
            guard let handler else {
                client.urlProtocol(self, didFailWithError: SlackClawClientError.invalidResponse)
                return
            }

            do {
                let (response, data) = try await handler(request)
                client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client.urlProtocol(self, didLoad: data)
                client.urlProtocolDidFinishLoading(self)
            } catch {
                client.urlProtocol(self, didFailWithError: error)
            }
        }
    }

    override func stopLoading() {}
}
