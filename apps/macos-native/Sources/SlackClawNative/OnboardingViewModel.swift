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
    private unowned let appState: SlackClawAppState
    private var modelSessionTask: Task<Void, Never>?
    private var persistTask: Task<Void, Never>?
    private var isApplyingDraft = false

    let copy = nativeOnboardingCopy()

    var onboardingState: OnboardingStateResponse?
    var pageLoading = true
    var pageError: String?
    var installBusy = false
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

    var selectedChannelId = ""
    var channelValues: [String: String] = [
        "domain": "feishu",
        "botName": "SlackClaw Assistant",
        "pluginSpec": "@openclaw-china/wecom-app",
    ]

    var employeeName = ""
    var employeeJobTitle = ""
    var employeeAvatarPresetId = nativeOnboardingAvatarPresets[0].id
    var selectedTraits: [String] = ["Analytical", "Detail-Oriented"]
    var selectedSkillIds: [String] = []
    var memoryEnabled = true

    init(appState: SlackClawAppState) {
        self.appState = appState
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

    var selectedProvider: ModelProviderConfig? {
        appState.modelConfig?.providers.first(where: { $0.id == providerId })
    }

    var selectedMethod: ModelAuthMethod? {
        selectedProvider?.authMethods.first(where: { $0.id == methodId })
    }

    var availableModels: [ModelCatalogEntry] {
        guard let selectedProvider, let modelConfig = appState.modelConfig else { return [] }
        let providerRefs = Set(selectedProvider.providerRefs)
        return modelConfig.models.filter { model in
            providerRefs.contains(model.key.components(separatedBy: "/").first ?? "")
                || providerRefs.contains(model.key.split(separator: "/").first.map(String.init) ?? "")
                || selectedProvider.sampleModels.contains(model.key)
        }
    }

    var availableModelKeys: [String] {
        let keys = availableModels.map(\.key)
        return keys.isEmpty ? (selectedProvider?.sampleModels ?? []) : keys
    }

    var visibleChannelCapabilities: [ChannelCapability] {
        appState.channelConfig?.capabilities.filter { nativeOnboardingChannelIDs.contains($0.id) } ?? []
    }

    var selectedChannelCapability: ChannelCapability? {
        visibleChannelCapabilities.first(where: { $0.id == selectedChannelId })
    }

    var selectedChannelEntry: ConfiguredChannelEntry? {
        if let entryId = currentDraft.channel?.entryId {
            return appState.channelConfig?.entries.first(where: { $0.id == entryId })
        }
        return appState.channelConfig?.entries.first(where: { $0.channelId == selectedChannelId })
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

    func bootstrap() async {
        pageLoading = true
        pageError = nil

        do {
            if appState.overview == nil {
                await appState.refreshAll()
            } else {
                let overview = try await appState.client.fetchOverview()
                appState.overview = overview
            }

            let state = try await appState.client.fetchOnboardingState()
            onboardingState = state
            applyDraft(state.draft)

            if onboardingIsCurrentOrLater(state.draft.currentStep, target: .model) || !(state.draft.activeModelAuthSessionId ?? "").isEmpty || state.draft.model != nil {
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
        } catch {
            pageError = error.localizedDescription
        }

        pageLoading = false
    }

    func markWelcomeStarted() async {
        await persistDraftSafely(.init(currentStep: .install))
    }

    func goToStep(_ step: OnboardingStep) async {
        await persistDraftSafely(.init(currentStep: step))
    }

    func persistModelSelection() {
        guard currentStep == .model, !providerId.isEmpty, !modelKey.isEmpty else { return }
        scheduleDraftPersistence { [providerId, modelKey, methodId] in
            .init(
                model: .init(providerId: providerId, modelKey: modelKey, methodId: methodId.isEmpty ? nil : methodId, entryId: self.currentDraft.model?.entryId)
            )
        }
    }

    func persistChannelSelection() {
        guard currentStep == .channel, !selectedChannelId.isEmpty else { return }
        scheduleDraftPersistence { [selectedChannelId] in
            .init(channel: .init(channelId: selectedChannelId, entryId: self.currentDraft.channel?.entryId))
        }
    }

    func persistEmployeeDraft() {
        guard currentStep == .employee else { return }
        scheduleDraftPersistence { [employeeName, employeeJobTitle, employeeAvatarPresetId, selectedTraits, selectedSkillIds, memoryEnabled] in
            .init(
                employee: .init(
                    memberId: self.currentDraft.employee?.memberId,
                    name: employeeName,
                    jobTitle: employeeJobTitle,
                    avatarPresetId: employeeAvatarPresetId,
                    personalityTraits: selectedTraits,
                    skillIds: selectedSkillIds,
                    memoryEnabled: memoryEnabled
                )
            )
        }
    }

    func runInstall() async {
        pageError = nil
        installBusy = true
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

            onboardingState = try await persistDraft(.init(currentStep: .model, install: installState))
        } catch {
            pageError = error.localizedDescription
        }
    }

    func saveModel() async {
        guard let selectedProvider, selectedMethod != nil, !modelKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            pageError = copy.chooseProvider
            return
        }

        pageError = nil
        modelBusy = "save"
        defer { if modelBusy == "save" { modelBusy = "" } }

        let request = SaveModelEntryRequest(
            label: modelLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "\(selectedProvider.label) \(modelKey.split(separator: "/").last.map(String.init) ?? modelKey)"
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
                    currentStep: .channel,
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
            pageError = error.localizedDescription
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
            pageError = error.localizedDescription
        }
    }

    func saveChannel() async {
        guard let selectedChannelCapability else {
            pageError = copy.chooseChannel
            return
        }

        pageError = nil
        channelBusy = true
        defer { channelBusy = false }

        let request = SaveChannelEntryRequest(channelId: selectedChannelCapability.id, entryId: selectedChannelEntry?.id, values: channelValues, action: "save")

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
                result.state.entries.first(where: { $0.channelId == selectedChannelCapability.id })

            onboardingState = try await persistDraft(.init(currentStep: .employee, channel: .init(channelId: selectedChannelCapability.id, entryId: savedEntry?.id)))
        } catch {
            pageError = error.localizedDescription
        }
    }

    func toggleTrait(_ trait: String) {
        if selectedTraits.contains(trait) {
            selectedTraits.removeAll(where: { $0 == trait })
        } else {
            selectedTraits.append(trait)
        }
        persistEmployeeDraft()
    }

    func toggleSkill(_ skillId: String) {
        if selectedSkillIds.contains(skillId) {
            selectedSkillIds.removeAll(where: { $0 == skillId })
        } else {
            selectedSkillIds.append(skillId)
        }
        persistEmployeeDraft()
    }

    func createEmployee() async {
        guard let selectedBrainEntryId, !employeeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !employeeJobTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            pageError = "SlackClaw needs a saved model, employee name, and job title before it can create the AI employee."
            return
        }

        pageError = nil
        employeeBusy = true
        defer { employeeBusy = false }

        let draft = NativeOnboardingEmployeeDraft(
            name: employeeName,
            jobTitle: employeeJobTitle,
            avatarPresetId: employeeAvatarPresetId,
            personalityTraits: selectedTraits,
            skillIds: selectedSkillIds,
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

            let createdMember =
                findCreatedMember(previousMembers: previousMembers, nextMembers: result.state.members)
                ?? result.state.members.first(where: { $0.name == draft.name && $0.jobTitle == draft.jobTitle })

            onboardingState = try await persistDraft(
                .init(
                    currentStep: .complete,
                    employee: .init(
                        memberId: createdMember?.id,
                        name: createdMember?.name ?? draft.name,
                        jobTitle: createdMember?.jobTitle ?? draft.jobTitle,
                        avatarPresetId: createdMember?.avatar.presetId ?? draft.avatarPresetId,
                        personalityTraits: selectedTraits,
                        skillIds: selectedSkillIds,
                        memoryEnabled: memoryEnabled
                    )
                )
            )
        } catch {
            pageError = error.localizedDescription
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
            pageError = error.localizedDescription
        }
    }

    func openModelAuthWindow() {
        guard let launchUrl = modelSession?.launchUrl, let url = URL(string: launchUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func openChannelDocs() {
        guard let docsUrl = selectedChannelCapability?.docsUrl, let url = URL(string: docsUrl) else { return }
        NSWorkspace.shared.open(url)
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
            pageError = error.localizedDescription
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

        if let model = draft.model {
            providerId = model.providerId
            modelKey = model.modelKey
            methodId = model.methodId ?? methodId
        } else if providerId.isEmpty, let provider = appState.modelConfig?.providers.first {
            providerId = provider.id
        }

        if let selectedProvider {
            if methodId.isEmpty || !selectedProvider.authMethods.contains(where: { $0.id == methodId }) {
                methodId = draft.model?.methodId ?? selectedProvider.authMethods.first?.id ?? ""
            }
            if modelKey.isEmpty {
                modelKey = draft.model?.modelKey ?? selectedProvider.sampleModels.first ?? availableModels.first?.key ?? ""
            }
            if modelLabel.isEmpty, !modelKey.isEmpty {
                modelLabel = "\(selectedProvider.label) \(modelKey.split(separator: "/").last.map(String.init) ?? "model")"
            }
        }

        selectedChannelId = draft.channel?.channelId ?? selectedChannelId

        if let employee = draft.employee {
            employeeName = employee.name
            employeeJobTitle = employee.jobTitle
            employeeAvatarPresetId = employee.avatarPresetId
            selectedTraits = employee.personalityTraits ?? selectedTraits
            selectedSkillIds = employee.skillIds ?? selectedSkillIds
            memoryEnabled = employee.memoryEnabled ?? memoryEnabled
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
                                currentStep: .channel,
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
                    self.pageError = error.localizedDescription
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
            throw NativeClientError.runtime("SlackClaw could not verify the latest state after this action.")
        }

        return .init(mutation: mutation, state: latestState, settled: false)
    }
}
