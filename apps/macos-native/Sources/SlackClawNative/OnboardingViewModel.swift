import AppKit
import Foundation
import Observation
import SlackClawClient
import SlackClawProtocol

struct SettledMutationResult<Mutation, State> {
    let mutation: Mutation
    let state: State
    let settled: Bool
}

@MainActor
@Observable
final class NativeOnboardingViewModel {
    typealias DaemonEventStreamFactory = @Sendable () -> AsyncStream<SlackClawEvent>

    private let appState: SlackClawAppState
    private let daemonEventStreamFactory: DaemonEventStreamFactory
    private var modelSessionTask: Task<Void, Never>?
    private var persistTask: Task<Void, Never>?
    private var daemonEventTask: Task<Void, Never>?
    private var isApplyingDraft = false

    var selectedLocaleIdentifier = resolveNativeOnboardingLocaleIdentifier()

    var onboardingState: OnboardingStateResponse? {
        didSet {
            let providers = resolveOnboardingModelPickerProviders(onboardingState: onboardingState)
            if !providers.isEmpty {
                lastKnownModelPickerProviders = providers
            }
            let channels = resolveOnboardingChannelPresentations(onboardingState: onboardingState)
            if !channels.isEmpty {
                lastKnownChannels = channels
            }
        }
    }
    private var lastKnownModelPickerProviders: [OnboardingModelProviderPresentation] = []
    private var lastKnownChannels: [OnboardingChannelPresentation] = []
    var pageLoading = true
    var pageError: String?
    var installBusy = false
    var permissionsNextBusy = false
    var installProgress = NativeOnboardingInstallProgressSnapshot()
    var modelBusy = ""
    var channelBusy = false
    var employeeBusy = false
    var completionBusy: OnboardingDestination?
    var channelMessage: String?
    var channelRequiresApply = false

    var providerId = ""
    var methodId = ""
    var modelKey = ""
    var modelLabel = ""
    var modelValues: [String: String] = [:]
    var modelSession: ModelAuthSession?
    var modelSessionInput = ""
    var isModelTutorialPresented = false
    var modelTutorialURLString: String?
    var isChannelTutorialPresented = false
    var channelTutorialURLString: String?

    var selectedChannelId = ""
    var channelValues: [String: String] = [
        "domain": "feishu",
        "botName": "ChillClaw Assistant",
        "pluginSpec": "@openclaw-china/wecom-app",
    ]

    var employeeName = ""
    var employeeJobTitle = ""
    var employeeAvatarPresetId = nativeOnboardingAvatarPresets[0].id
    var selectedEmployeePresetId = ""
    var memoryEnabled = true

    init(appState: SlackClawAppState, daemonEventStreamFactory: DaemonEventStreamFactory? = nil) {
        self.appState = appState
        self.daemonEventStreamFactory = daemonEventStreamFactory ?? { appState.client.daemonEvents() }
    }

    var copy: NativeOnboardingCopy {
        nativeOnboardingCopy(localeIdentifier: selectedLocaleIdentifier)
    }

    var localeOptions: [NativeOnboardingLocaleOption] {
        nativeOnboardingLocaleOptions
    }

    var currentDraft: OnboardingDraftState {
        onboardingState?.draft ?? .init(currentStep: .welcome)
    }

    var currentStep: OnboardingStep {
        currentDraft.currentStep
    }

    var currentStepIndex: Int {
        onboardingStepIndex(currentStep)
    }

    var installTarget: DeploymentTargetStatus? {
        resolveNativeOnboardingInstallTarget(overview: appState.overview, deploymentTargets: appState.deploymentTargets)
    }

    var modelPickerProviders: [OnboardingModelProviderPresentation] {
        let providers = resolveOnboardingModelPickerProviders(onboardingState: onboardingState)
        return providers.isEmpty ? lastKnownModelPickerProviders : providers
    }

    var curatedModelProviders: [NativeResolvedOnboardingModelProvider] {
        resolveOnboardingModelProviders(onboardingState: onboardingState, modelConfig: appState.modelConfig)
    }

    var selectedProviderOption: NativeResolvedOnboardingModelProvider? {
        curatedModelProviders.first(where: { $0.id == providerId })
    }

    var modelViewState: NativeOnboardingModelViewState {
        resolveNativeOnboardingModelViewState(
            providerId: providerId,
            methodId: methodId,
            modelKey: modelKey,
            providers: curatedModelProviders,
            selectedEntry: selectedModelEntry,
            draftEntryID: currentDraft.model?.entryId,
            summaryEntryID: onboardingState?.summary.model?.entryId,
            activeModelAuthSessionId: currentDraft.activeModelAuthSessionId
        )
    }

    var selectedCuratedProvider: OnboardingModelProviderPresentation? {
        selectedProviderOption?.curated ?? modelPickerProviders.first(where: { $0.id == providerId })
    }

    var selectedMethod: ModelAuthMethod? {
        selectedCuratedProvider?.authMethods.first(where: { $0.id == methodId })
    }

    var curatedChannels: [OnboardingChannelPresentation] {
        let channels = resolveOnboardingChannelPresentations(onboardingState: onboardingState)
        return channels.isEmpty ? lastKnownChannels : channels
    }

    var selectedChannelPresentation: OnboardingChannelPresentation? {
        curatedChannels.first(where: { $0.id == selectedChannelId })
    }

    var selectedChannelEntry: ConfiguredChannelEntry? {
        if let entryId = currentDraft.channel?.entryId {
            return appState.channelConfig?.entries.first(where: { $0.id == entryId })
        }
        return appState.channelConfig?.entries.first(where: { $0.channelId == selectedChannelId })
    }

    var selectedChannelSetupVariant: NativeOnboardingChannelSetupVariant? {
        resolveOnboardingChannelSetupVariant(selectedChannelPresentation?.setupKind)
    }

    var selectedModelEntry: SavedModelEntry? {
        guard let modelConfig = appState.modelConfig else { return nil }
        if let entryId = currentDraft.model?.entryId {
            return modelConfig.savedEntries.first(where: { $0.id == entryId })
        }
        if let entryId = onboardingState?.summary.model?.entryId {
            return modelConfig.savedEntries.first(where: { $0.id == entryId })
        }
        return modelConfig.savedEntries.first(where: { $0.providerId == providerId && $0.modelKey == modelKey })
    }

    var selectedBrainEntryId: String? {
        selectedModelEntry?.id ?? onboardingState?.summary.model?.entryId
    }

    var previewAvatarPreset: NativeOnboardingAvatarPreset {
        resolveOnboardingAvatarPreset(employeeAvatarPresetId)
    }

    var employeePresets: [OnboardingEmployeePresetPresentation] {
        resolveOnboardingEmployeePresets(onboardingState: onboardingState)
    }

    var selectedEmployeePreset: OnboardingEmployeePresetPresentation? {
        if employeePresets.isEmpty {
            return nil
        }

        return employeePresets.first(where: { $0.id == selectedEmployeePresetId }) ?? employeePresets.first
    }

    func selectProvider(_ provider: OnboardingModelProviderPresentation) {
        providerId = provider.id
        methodId = provider.authMethods.first?.id ?? ""
        modelKey = provider.defaultModelKey
        modelLabel = provider.label
        modelValues = [:]
        modelSession = nil
        modelSessionInput = ""
    }

    func clearProviderSelection() {
        providerId = ""
        methodId = ""
        modelKey = ""
        modelLabel = ""
        modelValues = [:]
        modelSession = nil
        modelSessionInput = ""
    }

    func updateLocale(_ localeIdentifier: String) {
        selectedLocaleIdentifier = resolveNativeOnboardingLocaleIdentifier(localeIdentifier)
        persistNativeOnboardingLocaleIdentifier(selectedLocaleIdentifier)
    }

    func bootstrap() async {
        pageLoading = true
        pageError = nil

        do {
            if appState.overview == nil {
                await appState.refreshAll()
            }

            let state = try await appState.client.fetchOnboardingState()
            onboardingState = state
            applyDraft(state.draft)

            if shouldLoadInstallDeploymentTargets(
                step: state.draft.currentStep,
                overview: appState.overview,
                install: state.draft.install
            ) {
                _ = try await readFreshDeploymentTargets()
            }

            if !(state.draft.activeModelAuthSessionId ?? "").isEmpty || state.draft.model?.entryId != nil {
                _ = try await readFreshModelConfig()
            }

            if onboardingIsCurrentOrLater(state.draft.currentStep, target: .channel) || state.draft.channel != nil {
                _ = try await readFreshChannelConfig()
            }

            if onboardingIsCurrentOrLater(state.draft.currentStep, target: .employee) || state.draft.employee != nil {
                _ = try await readFreshAITeamOverview()
            }

            if let sessionId = state.draft.activeModelAuthSessionId, !sessionId.isEmpty {
                let next = try await appState.client.fetchModelAuthSession(sessionId: sessionId)
                appState.modelConfig = next.modelConfig
                modelSession = next.session
                startModelSessionPolling(sessionId: sessionId)
            }

            if currentStep == .model && modelPickerProviders.isEmpty {
                onboardingState = try await appState.client.fetchOnboardingState(fresh: true)
                if let onboardingState {
                    applyDraft(onboardingState.draft)
                }
            }

            if currentStep == .channel && curatedChannels.isEmpty {
                onboardingState = try await appState.client.fetchOnboardingState(fresh: true)
                if let onboardingState {
                    applyDraft(onboardingState.draft)
                }
            }
        } catch {
            presentErrorUnlessCancelled(error)
        }

        pageLoading = false
        startDaemonEventsIfNeeded()
    }

    func markWelcomeStarted() async {
        await persistDraftSafely(.init(currentStep: .install))
    }

    func goToStep(_ step: OnboardingStep) async {
        await persistDraftSafely(.init(currentStep: step))
    }

    func useExistingInstall() async {
        pageError = nil

        do {
            onboardingState = try await persistDraft(buildExistingInstallAdvanceRequest(overview: appState.overview))
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func updateExistingInstall() async {
        guard let target = installTarget, target.updateAvailable else { return }

        pageError = nil
        installBusy = true
        installProgress = .init(phase: .updating, percent: 10, message: nil)
        defer { installBusy = false }

        do {
            let result = try await appState.client.updateTarget(target.id)
            async let overview = readFreshOverview()
            async let deploymentTargets = readFreshDeploymentTargets()
            _ = try await overview
            _ = try await deploymentTargets

            guard result.status == "completed" else {
                throw NativeClientError.runtime(result.message)
            }

            appState.applyBanner(result.message)
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func advancePastInstall() async {
        await persistDraftSafely(.init(currentStep: .permissions))
    }

    func advancePastPermissions() async {
        pageError = nil
        permissionsNextBusy = true
        defer { permissionsNextBusy = false }

        await persistDraftSafely(.init(currentStep: .model))
    }

    func advancePastModel() async {
        await persistDraftSafely(.init(currentStep: .channel))
    }

    func returnToModelPicker() async {
        pageError = nil
        clearProviderSelection()
        await persistDraftSafely(
            .init(
                currentStep: .model,
                model: .init(providerId: "", modelKey: "", methodId: ""),
                activeModelAuthSessionId: ""
            )
        )
    }

    func persistEmployeeDraft() {
        guard currentStep == .employee else { return }
        scheduleDraftPersistence { [employeeName, employeeJobTitle, employeeAvatarPresetId, selectedEmployeePreset, memoryEnabled] in
            .init(
                employee: .init(
                    memberId: self.currentDraft.employee?.memberId,
                    name: employeeName,
                    jobTitle: employeeJobTitle,
                    avatarPresetId: employeeAvatarPresetId,
                    presetId: selectedEmployeePreset?.id,
                    personalityTraits: [],
                    skillIds: selectedEmployeePreset?.skillIds ?? [],
                    knowledgePackIds: selectedEmployeePreset?.knowledgePackIds ?? [],
                    workStyles: selectedEmployeePreset?.workStyles ?? [],
                    memoryEnabled: memoryEnabled
                )
            )
        }
    }

    func runInstall() async {
        pageError = nil
        installBusy = true
        installProgress = .init(phase: .detecting, percent: 16, message: copy.installStageDetecting)
        defer { installBusy = false }

        do {
            let result = try await settleAfterMutation(
                mutate: { try await self.appState.client.runFirstRunSetup() },
                getProvisionalState: { $0.overview },
                applyState: { self.appState.overview = $0 },
                readFresh: { try await self.readFreshOverview() },
                isSettled: { overview, _ in overview.engine.installed }
            )

            let installState = OnboardingInstallState(
                installed: result.state.engine.installed,
                version: result.state.engine.version ?? result.mutation.install?.actualVersion ?? result.mutation.install?.existingVersion,
                disposition: installDisposition(overview: result.state, setup: result.mutation)
            )

            onboardingState = try await persistDraft(.init(currentStep: .install, install: installState))
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func saveModel() async {
        guard selectedCuratedProvider != nil, selectedMethod != nil, !modelKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            pageError = copy.chooseProvider
            return
        }

        pageError = nil
        modelBusy = "save"
        defer { if modelBusy == "save" { modelBusy = "" } }

            let request = SaveModelEntryRequest(
                label: modelLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "\((selectedCuratedProvider?.label ?? providerId)) \(modelKey.split(separator: "/").last.map(String.init) ?? modelKey)"
                : modelLabel.trimmingCharacters(in: .whitespacesAndNewlines),
                providerId: providerId,
                methodId: methodId,
            modelKey: modelKey.trimmingCharacters(in: .whitespacesAndNewlines),
            values: modelValues,
            makeDefault: true,
            useAsFallback: false
        )

        do {
            let previousEntries = appState.modelConfig?.savedEntries ?? []
            let result = try await settleAfterMutation(
                mutate: { try await self.appState.client.createModelEntry(request) },
                getProvisionalState: { $0.modelConfig },
                applyState: { self.appState.modelConfig = $0 },
                readFresh: { try await self.readFreshModelConfig() },
                isSettled: { state, mutation in
                    if mutation.authSession != nil {
                        return false
                    }

                    guard let createdEntry = findCreatedSavedEntry(previousEntries: previousEntries, nextEntries: mutation.modelConfig.savedEntries) else {
                        return false
                    }

                    let actualEntry = state.savedEntries.first(where: { $0.id == createdEntry.id })
                    return saveEntrySignature(actualEntry) == saveEntrySignature(createdEntry)
                }
            )

            if let authSession = result.mutation.authSession {
                modelSession = authSession
                onboardingState = try await persistDraft(
                    .init(
                        currentStep: .model,
                        model: .init(providerId: providerId, modelKey: modelKey.trimmingCharacters(in: .whitespacesAndNewlines), methodId: methodId),
                        activeModelAuthSessionId: authSession.id
                    )
                )
                startModelSessionPolling(sessionId: authSession.id)
                return
            }

            let savedEntry =
                findCreatedSavedEntry(previousEntries: previousEntries, nextEntries: result.state.savedEntries)
                ?? result.state.savedEntries.first(where: { $0.providerId == providerId && $0.modelKey == modelKey.trimmingCharacters(in: .whitespacesAndNewlines) })

            onboardingState = try await persistDraft(
                .init(
                    currentStep: .model,
                    model: .init(
                        providerId: providerId,
                        modelKey: modelKey.trimmingCharacters(in: .whitespacesAndNewlines),
                        methodId: methodId,
                        entryId: savedEntry?.id
                    ),
                    activeModelAuthSessionId: ""
                )
            )
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func submitModelSessionInput() async {
        guard let sessionId = modelSession?.id, !modelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        modelBusy = "input"
        defer { modelBusy = "" }

        do {
            let next = try await appState.client.submitModelAuthInput(sessionId: sessionId, value: modelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines))
            modelSession = next.session
            appState.modelConfig = next.modelConfig
            modelSessionInput = ""
            onboardingState = try await appState.client.fetchOnboardingState()
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func saveChannel() async {
        guard let selectedChannelPresentation else {
            pageError = copy.chooseChannel
            return
        }

        pageError = nil
        channelBusy = true
        defer { channelBusy = false }

        let request = SaveChannelEntryRequest(
            channelId: selectedChannelPresentation.id,
            entryId: selectedChannelEntry?.id,
            values: buildOnboardingChannelSaveValues(channelID: selectedChannelPresentation.id, values: channelValues),
            action: "save"
        )

        do {
            let previousEntries = appState.channelConfig?.entries ?? []
            let result: SettledMutationResult<ChannelConfigActionResponse, ChannelConfigOverview>
            if let selectedChannelEntry {
                result = try await settleAfterMutation(
                    mutate: { try await self.appState.client.saveChannelEntry(entryId: selectedChannelEntry.id, request: request) },
                    getProvisionalState: { $0.channelConfig },
                    applyState: { self.appState.channelConfig = $0 },
                    readFresh: { try await self.readFreshChannelConfig() },
                    isSettled: { state, mutation in
                        let expectedEntry = mutation.channelConfig.entries.first(where: { $0.id == selectedChannelEntry.id })
                        let actualEntry = state.entries.first(where: { $0.id == selectedChannelEntry.id })
                        return channelEntrySignature(actualEntry) == channelEntrySignature(expectedEntry)
                    }
                )
            } else {
                result = try await settleAfterMutation(
                    mutate: { try await self.appState.client.saveChannelEntry(entryId: nil, request: request) },
                    getProvisionalState: { $0.channelConfig },
                    applyState: { self.appState.channelConfig = $0 },
                    readFresh: { try await self.readFreshChannelConfig() },
                    isSettled: { state, mutation in
                        guard let createdEntry = findCreatedChannelEntry(previousEntries: previousEntries, nextEntries: mutation.channelConfig.entries) else {
                            return false
                        }
                        let actualEntry = state.entries.first(where: { $0.id == createdEntry.id })
                        return channelEntrySignature(actualEntry) == channelEntrySignature(createdEntry)
                    }
                )
            }

            channelMessage = result.mutation.message
            channelRequiresApply = result.mutation.requiresGatewayApply ?? false
            let savedEntry =
                (selectedChannelEntry.flatMap { selected in result.state.entries.first(where: { $0.id == selected.id }) }) ??
                findCreatedChannelEntry(previousEntries: previousEntries, nextEntries: result.state.entries) ??
                result.state.entries.first(where: { $0.channelId == selectedChannelPresentation.id })

            onboardingState = try await persistDraft(.init(currentStep: .employee, channel: .init(channelId: selectedChannelPresentation.id, entryId: savedEntry?.id)))
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func selectEmployeePreset(_ presetID: String) {
        selectedEmployeePresetId = presetID
        if let preset = employeePresets.first(where: { $0.id == presetID }), let defaultMemoryEnabled = preset.defaultMemoryEnabled {
            memoryEnabled = defaultMemoryEnabled
        }
        persistEmployeeDraft()
    }

    func createEmployee() async {
        guard
            let selectedBrainEntryId,
            let selectedEmployeePreset,
            !employeeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !employeeJobTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            pageError = "ChillClaw needs a saved model, employee name, and job title before it can create the AI employee."
            return
        }

        pageError = nil
        employeeBusy = true
        defer { employeeBusy = false }

        let draft = NativeOnboardingEmployeeDraft(
            name: employeeName,
            jobTitle: employeeJobTitle,
            avatarPresetId: employeeAvatarPresetId,
            presetId: selectedEmployeePreset.id,
            personalityTraits: [],
            skillIds: selectedEmployeePreset.skillIds,
            knowledgePackIds: selectedEmployeePreset.knowledgePackIds,
            workStyles: selectedEmployeePreset.workStyles,
            memoryEnabled: memoryEnabled,
            brainEntryId: selectedBrainEntryId
        )

        do {
            let previousMembers = appState.aiTeamOverview?.members ?? []
            let result = try await settleAfterMutation(
                mutate: { try await self.appState.client.saveMember(memberId: nil, request: buildOnboardingMemberRequest(draft)) },
                getProvisionalState: { $0.overview },
                applyState: { self.appState.aiTeamOverview = $0 },
                readFresh: { try await self.readFreshAITeamOverview() },
                isSettled: { state, mutation in
                    guard let createdMember = findCreatedMember(previousMembers: previousMembers, nextMembers: mutation.overview.members) else {
                        return false
                    }
                    return state.members.contains(where: { $0.id == createdMember.id })
                }
            )

            let createdMemberFromMutation = findCreatedMember(previousMembers: previousMembers, nextMembers: result.state.members)
            let createdMember = createdMemberFromMutation ?? result.state.members.first(where: { $0.name == draft.name && $0.jobTitle == draft.jobTitle })

            onboardingState = try await persistDraft(
                .init(
                    currentStep: .complete,
                    employee: .init(
                        memberId: createdMember?.id,
                        name: createdMember?.name ?? draft.name,
                        jobTitle: createdMember?.jobTitle ?? draft.jobTitle,
                        avatarPresetId: createdMember?.avatar.presetId ?? draft.avatarPresetId,
                        presetId: draft.presetId,
                        personalityTraits: [],
                        skillIds: draft.skillIds,
                        knowledgePackIds: draft.knowledgePackIds,
                        workStyles: draft.workStyles,
                        memoryEnabled: memoryEnabled
                    )
                )
            )
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func complete(destination: OnboardingDestination) async {
        completionBusy = destination
        pageError = nil
        defer { completionBusy = nil }

        do {
            let result = try await appState.client.completeOnboarding(.init(destination: destination))
            appState.overview = result.overview
            appState.selectedSection = onboardingDestinationSection(destination)
            await appState.refreshAll()
            await appState.chatViewModel.start()
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func openModelAuthWindow() {
        guard let launchUrl = modelSession?.launchUrl, let url = URL(string: launchUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func openModelTutorial() {
        modelTutorialURLString = selectedCuratedProvider?.tutorialVideoUrl
        isModelTutorialPresented = true
    }

    func dismissModelTutorial() {
        isModelTutorialPresented = false
    }

    func openModelDocs() {
        guard let platformUrl = selectedCuratedProvider?.platformUrl, let url = URL(string: platformUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func openChannelDocs() {
        guard let docsUrl = selectedChannelPresentation?.docsUrl, let url = URL(string: docsUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func openChannelPlatform() {
        guard let platformUrl = selectedChannelPresentation?.platformUrl, let url = URL(string: platformUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func openChannelTutorial() {
        channelTutorialURLString = selectedChannelPresentation?.tutorialVideoUrl
        isChannelTutorialPresented = true
    }

    func dismissChannelTutorial() {
        isChannelTutorialPresented = false
    }

    func returnToChannelPicker() async {
        selectedChannelId = ""
        channelValues = [
            "domain": "feishu",
            "botName": "ChillClaw Assistant",
            "pluginSpec": "@openclaw-china/wecom-app",
        ]
        channelMessage = nil
        channelRequiresApply = false
        await persistDraftSafely(.init(currentStep: .channel))
    }

    func goBackFromChannelPicker() async {
        await persistDraftSafely(.init(currentStep: .model))
    }

    func saveAndContinueChannel() async {
        await saveChannel()
    }

    func updateSelectedChannel(_ channelID: String) {
        selectedChannelId = channelID
        channelMessage = nil
        channelRequiresApply = false
        if channelID == "feishu" {
            channelValues["domain"] = channelValues["domain"] ?? "feishu"
            channelValues["botName"] = channelValues["botName"] ?? "ChillClaw Assistant"
        }
    }

    func isSelectedChannelMissingRequiredValues() -> Bool {
        switch selectedChannelSetupVariant {
        case .wechatGuided?:
            return (channelValues["corpId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (channelValues["agentId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (channelValues["secret"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .feishuGuided?:
            return (channelValues["appId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (channelValues["appSecret"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .telegramGuided?:
            return (channelValues["token"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case nil:
            return true
        }
    }

    func channelSymbol(for channelID: String) -> String {
        switch channelID {
        case "telegram":
            return "paperplane"
        case "feishu", "wechat":
            return "message"
        default:
            return "message"
        }
    }

    func channelFieldValue(_ id: String, fallback: String = "") -> String {
        let value = channelValues[id] ?? fallback
        return value
    }

    func channelPlaceholder(for fieldID: String) -> String {
        switch fieldID {
        case "corpId":
            return "ww..."
        case "agentId":
            return "1000002"
        case "secret":
            return "••••••••••••"
        case "token":
            return "123456:ABC-DEF..."
        case "appId":
            return "cli_..."
        case "appSecret":
            return "••••••••••••"
        default:
            return ""
        }
    }

    func channelFieldIsSecret(_ fieldID: String) -> Bool {
        fieldID == "secret" || fieldID == "appSecret" || fieldID == "token"
    }

    func channelSelectedSecondaryLabel() -> String? {
        selectedChannelPresentation?.secondaryLabel
    }

    private func defaultChannelValues(for channelID: String) -> [String: String] {
        switch channelID {
        case "wechat":
            return ["pluginSpec": "@openclaw-china/wecom-app"]
        case "feishu":
            return ["domain": "feishu", "botName": "ChillClaw Assistant"]
        default:
            return [:]
        }
    }

    private func channelValuesFromEntry(_ channelID: String) -> [String: String] {
        var values = defaultChannelValues(for: channelID)
        if let editableValues = selectedChannelEntry?.editableValues {
            for (key, value) in editableValues {
                values[key] = value
            }
        }
        return values
    }

    func updateModelValue(fieldId: String, value: String) {
        modelValues[fieldId] = value
    }

    func updateChannelValue(fieldId: String, value: String) {
        channelValues[fieldId] = value
    }

    private func scheduleDraftPersistence(_ patch: @escaping @MainActor () -> UpdateOnboardingStateRequest) {
        guard !isApplyingDraft else { return }
        persistTask?.cancel()
        persistTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard let self, !Task.isCancelled else { return }
            await self.persistDraftSafely(patch())
        }
    }

    func persistDraftSafely(_ patch: UpdateOnboardingStateRequest) async {
        do {
            onboardingState = try await persistDraft(patch)
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    private func persistDraft(_ patch: UpdateOnboardingStateRequest) async throws -> OnboardingStateResponse {
        let current = currentDraft
        let request = UpdateOnboardingStateRequest(
            currentStep: patch.currentStep ?? current.currentStep,
            install: patch.install ?? current.install,
            model: patch.model ?? current.model,
            channel: patch.channel ?? current.channel,
            employee: patch.employee ?? current.employee,
            activeModelAuthSessionId: patch.activeModelAuthSessionId ?? current.activeModelAuthSessionId,
            activeChannelSessionId: patch.activeChannelSessionId ?? current.activeChannelSessionId
        )

        let next = try await appState.client.updateOnboardingState(request)
        onboardingState = next
        return next
    }

    private func applyDraft(_ draft: OnboardingDraftState) {
        isApplyingDraft = true
        defer { isApplyingDraft = false }

        let resolvedProviderID = resolveOnboardingProviderID(
            currentProviderId: providerId,
            draftProviderId: draft.model?.providerId,
            providers: modelPickerProviders
        )
        providerId = resolvedProviderID

        if let model = draft.model, model.providerId == resolvedProviderID, !resolvedProviderID.isEmpty {
            modelKey = model.modelKey
            methodId = model.methodId ?? methodId
        } else if providerId.isEmpty {
            modelKey = ""
            methodId = ""
            if draft.model == nil {
                modelLabel = ""
            }
        }

        if let selectedCuratedProvider {
            if methodId.isEmpty || !selectedCuratedProvider.authMethods.contains(where: { $0.id == methodId }) {
                methodId = draft.model?.methodId ?? selectedCuratedProvider.authMethods.first?.id ?? ""
            }
            if modelKey.isEmpty {
                modelKey = draft.model?.modelKey ?? selectedCuratedProvider.defaultModelKey
            }
            if modelLabel.isEmpty, !modelKey.isEmpty {
                modelLabel = selectedCuratedProvider.label
            }
        }

        selectedChannelId = draft.channel?.channelId ?? selectedChannelId
        if let channelId = draft.channel?.channelId, !channelId.isEmpty {
            channelValues = channelValuesFromEntry(channelId)
        }

        if let employee = draft.employee {
            employeeName = employee.name
            employeeJobTitle = employee.jobTitle
            employeeAvatarPresetId = employee.avatarPresetId
            selectedEmployeePresetId = employee.presetId ?? selectedEmployeePresetId
            memoryEnabled = employee.memoryEnabled ?? memoryEnabled
        } else if selectedEmployeePresetId.isEmpty, let firstPreset = employeePresets.first {
            selectedEmployeePresetId = firstPreset.id
            if let defaultMemoryEnabled = firstPreset.defaultMemoryEnabled {
                memoryEnabled = defaultMemoryEnabled
            }
        }
    }

    private func startModelSessionPolling(sessionId: String) {
        modelSessionTask?.cancel()
        modelSessionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let nextSession = try await self.appState.client.fetchModelAuthSession(sessionId: sessionId)
                    self.modelSession = nextSession.session
                    self.appState.modelConfig = nextSession.modelConfig

                    if nextSession.session.status == "completed" {
                        let result = try await self.settleAfterMutation(
                            mutate: { nextSession },
                            getProvisionalState: { $0.modelConfig },
                            applyState: { self.appState.modelConfig = $0 },
                            readFresh: { try await self.readFreshModelConfig() },
                            isSettled: { state, mutation in
                                let entryId = mutation.session.entryId ?? self.currentDraft.model?.entryId
                                guard let entryId else { return false }
                                let expectedEntry = mutation.modelConfig.savedEntries.first(where: { $0.id == entryId })
                                let actualEntry = state.savedEntries.first(where: { $0.id == entryId })
                                return saveEntrySignature(actualEntry) == saveEntrySignature(expectedEntry)
                            }
                        )

                        let nextEntry =
                            result.state.savedEntries.first(where: { $0.id == nextSession.session.entryId }) ??
                            result.state.savedEntries.first(where: { $0.providerId == nextSession.session.providerId && $0.authMethodId == nextSession.session.methodId })

                        self.onboardingState = try await self.persistDraft(
                            .init(
                                currentStep: .model,
                                model: .init(
                                    providerId: nextEntry?.providerId ?? self.providerId,
                                    modelKey: nextEntry?.modelKey ?? self.modelKey,
                                    methodId: nextEntry?.authMethodId ?? self.methodId,
                                    entryId: nextEntry?.id ?? self.currentDraft.model?.entryId
                                ),
                                activeModelAuthSessionId: ""
                            )
                        )
                        self.modelSession = nil
                        return
                    }

                    if nextSession.session.status == "failed" {
                        self.pageError = nextSession.session.message
                        self.onboardingState = try await self.persistDraft(.init(activeModelAuthSessionId: ""))
                        return
                    }
                } catch {
                    self.presentErrorUnlessCancelled(error)
                    return
                }

                try? await Task.sleep(nanoseconds: 1_600_000_000)
            }
        }
    }

    private func readFreshOverview() async throws -> ProductOverview {
        let overview = try await appState.client.fetchOverview()
        appState.overview = overview
        return overview
    }

    private func readFreshDeploymentTargets() async throws -> DeploymentTargetsResponse {
        let deploymentTargets = try await appState.client.fetchDeploymentTargets()
        appState.deploymentTargets = deploymentTargets
        return deploymentTargets
    }

    private func readFreshModelConfig() async throws -> ModelConfigOverview {
        let modelConfig = try await appState.client.fetchModelConfig()
        appState.modelConfig = modelConfig
        return modelConfig
    }

    private func readFreshChannelConfig() async throws -> ChannelConfigOverview {
        let channelConfig = try await appState.client.fetchChannelConfig()
        appState.channelConfig = channelConfig
        return channelConfig
    }

    private func readFreshAITeamOverview() async throws -> AITeamOverview {
        let overview = try await appState.client.fetchAITeamOverview()
        appState.aiTeamOverview = overview
        return overview
    }

    private func startDaemonEventsIfNeeded() {
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

    private func applyDaemonEvent(_ event: SlackClawEvent) async {
        if onboardingState?.draft.currentStep == .install, case let .deployProgress(_, _, phase, percent, message) = event {
            installProgress = .init(phase: phase, percent: percent.map(Double.init), message: message)
        }

        guard let currentStep = onboardingState?.draft.currentStep else { return }
        guard let resource = onboardingRefreshResourceForEvent(currentStep, event) else { return }

        do {
            switch resource {
            case .installContext:
                async let overview = readFreshOverview()
                async let deploymentTargets = readFreshDeploymentTargets()
                _ = try await overview
                _ = try await deploymentTargets
            case .overview:
                _ = try await readFreshOverview()
            case .model:
                _ = try await readFreshModelConfig()
            case .channel:
                _ = try await readFreshChannelConfig()
            case .team:
                _ = try await readFreshAITeamOverview()
            }
            pageError = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    private func presentErrorUnlessCancelled(_ error: Error) {
        guard !isCancellation(error) else { return }
        pageError = error.localizedDescription
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

    private func settleAfterMutation<Mutation, State>(
        mutate: () async throws -> Mutation,
        getProvisionalState: ((Mutation) -> State)? = nil,
        applyState: @escaping (State) -> Void,
        readFresh: @escaping () async throws -> State,
        isSettled: @escaping (State, Mutation) -> Bool,
        attempts: Int = 8,
        delayNanoseconds: UInt64 = 700_000_000
    ) async throws -> SettledMutationResult<Mutation, State> {
        let mutation = try await mutate()
        if let provisional = getProvisionalState?(mutation) {
            applyState(provisional)
        }

        let retries = max(attempts, 1)
        var latestState: State?

        for attempt in 0..<retries {
            let state = try await readFresh()
            latestState = state
            applyState(state)

            if isSettled(state, mutation) {
                return .init(mutation: mutation, state: state, settled: true)
            }

            if attempt < retries - 1 {
                try? await Task.sleep(nanoseconds: delayNanoseconds)
            }
        }

        guard let latestState else {
            throw NativeClientError.runtime("ChillClaw could not verify the latest state after this action.")
        }

        return .init(mutation: mutation, state: latestState, settled: false)
    }
}

private func shouldLoadInstallDeploymentTargets(
    step: OnboardingStep,
    overview: ProductOverview?,
    install: OnboardingInstallState?
) -> Bool {
    step == .install && (overview?.engine.installed == true || install?.installed == true)
}
