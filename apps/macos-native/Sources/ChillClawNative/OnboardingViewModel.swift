import AppKit
import Foundation
import Observation
import ChillClawClient
import ChillClawProtocol

struct SettledMutationResult<Mutation, State> {
    let mutation: Mutation
    let state: State
    let settled: Bool
}

private let onboardingTerminalControlPattern = try! NSRegularExpression(pattern: #"\[[0-9;?]*[ -/]*[@-~]"#)
private let onboardingQRCodeGlyphs = CharacterSet(charactersIn: "█▀▄▌▐▙▟▛▜■□▓▒")
private let onboardingURLPattern = try! NSRegularExpression(pattern: #"https?://[^\s]+"#)

private func sanitizeOnboardingChannelSessionLogLines(_ lines: [String]) -> [String] {
    lines.compactMap { line in
        var sanitized = line.replacingOccurrences(of: "\r", with: "")
        sanitized = sanitized.replacingOccurrences(of: "\u{001B}", with: "")

        let range = NSRange(sanitized.startIndex..<sanitized.endIndex, in: sanitized)
        sanitized = onboardingTerminalControlPattern.stringByReplacingMatches(
            in: sanitized,
            options: [],
            range: range,
            withTemplate: ""
        )
        sanitized = String(sanitized.unicodeScalars.filter { scalar in
            scalar == "\t" || !CharacterSet.controlCharacters.contains(scalar)
        })

        let trimmed = sanitized.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == ":" {
            return nil
        }

        return sanitized
    }
}

private func displayedOnboardingChannelSessionLogText(_ session: ChannelSession?) -> String {
    sanitizeOnboardingChannelSessionLogLines(session?.logs ?? []).joined(separator: "\n")
}

private func onboardingQRCodeGlyphCount(in line: String) -> Int {
    line.unicodeScalars.reduce(into: 0) { count, scalar in
        if onboardingQRCodeGlyphs.contains(scalar) {
            count += 1
        }
    }
}

private func onboardingChannelSessionURL(in line: String) -> String? {
    let range = NSRange(line.startIndex..<line.endIndex, in: line)
    guard let match = onboardingURLPattern.firstMatch(in: line, options: [], range: range),
          let matchRange = Range(match.range, in: line) else {
        return nil
    }

    return String(line[matchRange])
}

private func displayedOnboardingChannelSessionQRCodePayload(_ session: ChannelSession?) -> String? {
    guard let session, session.channelId == .wechat else { return nil }

    if let launchUrl = session.launchUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !launchUrl.isEmpty {
        return launchUrl
    }

    for line in sanitizeOnboardingChannelSessionLogLines(session.logs) {
        guard let url = onboardingChannelSessionURL(in: line) else { continue }
        let lowercaseURL = url.lowercased()
        if lowercaseURL.contains("qrcode=") || lowercaseURL.contains("liteapp.weixin.qq.com") {
            return url
        }
    }

    return nil
}

private func displayedOnboardingChannelSessionDetailLogText(_ session: ChannelSession?) -> String {
    let qrPayload = displayedOnboardingChannelSessionQRCodePayload(session)

    return sanitizeOnboardingChannelSessionLogLines(session?.logs ?? [])
        .filter { line in
            if onboardingQRCodeGlyphCount(in: line) >= 8 {
                return false
            }

            if let qrPayload, onboardingChannelSessionURL(in: line) == qrPayload {
                return false
            }

            return true
        }
        .joined(separator: "\n")
}

private func onboardingWechatSessionHasVisibleQRCode(_ session: ChannelSession?) -> Bool {
    guard let session, session.channelId == .wechat else { return false }

    return sanitizeOnboardingChannelSessionLogLines(session.logs).contains { line in
        let lowercaseLine = line.lowercased()
        if lowercaseLine.contains("https://") || lowercaseLine.contains("http://") || lowercaseLine.contains("qrcode=") {
            return true
        }

        return onboardingQRCodeGlyphCount(in: line) >= 8
    }
}

private func onboardingWechatSessionIsAwaitingVisibleQRCode(_ session: ChannelSession?) -> Bool {
    guard let session, session.channelId == .wechat, session.inputPrompt == nil, session.status == "running" else {
        return false
    }

    return !onboardingWechatSessionHasVisibleQRCode(session)
}

private func onboardingWechatSessionIsAwaitingCompletion(_ session: ChannelSession?) -> Bool {
    guard let session, session.channelId == .wechat, session.inputPrompt == nil else {
        return false
    }

    return session.status == "running"
}

func isRecoverableOnboardingCompletionTimeout(_ error: Error) -> Bool {
    if error is CancellationError {
        return false
    }

    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorTimedOut {
        return true
    }

    if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError,
       underlying.domain == NSURLErrorDomain,
       underlying.code == NSURLErrorTimedOut
    {
        return true
    }

    let message = error.localizedDescription.lowercased()
    return message.contains("timed out") || message.contains("timeout")
}

@MainActor
@Observable
final class NativeOnboardingViewModel {
    typealias DaemonEventStreamFactory = @Sendable () -> AsyncStream<ChillClawEvent>
    typealias URLOpener = @Sendable (URL) -> Void

    private let appState: ChillClawAppState
    private let daemonEventStreamFactory: DaemonEventStreamFactory
    private let openURL: URLOpener
    private var modelSessionTask: Task<Void, Never>?
    private var channelSessionTask: Task<Void, Never>?
    private var persistTask: Task<Void, Never>?
    private var daemonEventTask: Task<Void, Never>?
    private var installProgressAnimationTask: Task<Void, Never>?
    private var employeeDraftAutosaveRevision = 0
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
    var completedOnboarding: CompleteOnboardingResponse?
    var channelMessage: String?
    var channelRequiresApply = false
    var channelSessionInput = ""

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

    var selectedChannelId: SupportedChannelId?
    var channelValues: [String: String] = [
        "domain": "feishu",
        "botName": "ChillClaw Assistant",
    ]

    var employeeName = ""
    var employeeJobTitle = ""
    var employeeAvatarPresetId = nativeOnboardingAvatarPresets[0].id
    var selectedEmployeePresetId = ""
    var memoryEnabled = true

    init(
        appState: ChillClawAppState,
        daemonEventStreamFactory: DaemonEventStreamFactory? = nil,
        openURL: URLOpener? = nil
    ) {
        self.appState = appState
        self.daemonEventStreamFactory = daemonEventStreamFactory ?? { appState.client.daemonEvents() }
        self.openURL = openURL ?? { url in
            NSWorkspace.shared.open(url)
        }
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

    var showingCompletion: Bool {
        completedOnboarding != nil
    }

    var completionSummary: OnboardingCompletionSummary {
        completedOnboarding?.summary ?? onboardingState?.summary ?? .init()
    }

    var currentStepIndex: Int {
        showingCompletion ? max(nativeOnboardingStepOrder.count - 1, 0) : onboardingStepIndex(currentStep)
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
        guard let selectedChannelId else { return nil }
        return curatedChannels.first(where: { $0.id == selectedChannelId })
    }

    var selectedChannelEntry: ConfiguredChannelEntry? {
        if let entryId = currentDraft.channel?.entryId {
            return appState.channelConfig?.entries.first(where: { $0.id == entryId })
        }
        guard let selectedChannelId else { return nil }
        return appState.channelConfig?.entries.first(where: { $0.channelId == selectedChannelId })
    }

    var activeChannelSession: ChannelSession? {
        guard let selectedChannelId else { return nil }
        guard let activeSession = appState.channelConfig?.activeSession, activeSession.channelId == selectedChannelId else {
            return nil
        }

        return activeSession
    }

    var displayedChannelSessionLogText: String {
        displayedOnboardingChannelSessionLogText(activeChannelSession)
    }

    var displayedChannelSessionQRCodePayload: String? {
        displayedOnboardingChannelSessionQRCodePayload(activeChannelSession)
    }

    var displayedChannelSessionDetailLogText: String {
        displayedOnboardingChannelSessionDetailLogText(activeChannelSession)
    }

    var channelPrimaryActionBusy: Bool {
        channelBusy || (selectedChannelSetupVariant == .wechatGuided && onboardingWechatSessionIsAwaitingCompletion(activeChannelSession))
    }

    var channelPrimaryActionLabel: String {
        if activeChannelSession?.inputPrompt != nil {
            return copy.channelSessionSubmitInput
        }

        if selectedChannelSetupVariant == .wechatGuided {
            if let activeChannelSession,
               onboardingWechatSessionIsAwaitingCompletion(activeChannelSession)
            {
                return onboardingWechatSessionIsAwaitingVisibleQRCode(activeChannelSession)
                    ? copy.channelWechatWaitingForQR
                    : copy.channelWechatWaitingForConfirmation
            }

            if channelBusy {
                return copy.channelWechatStartingLogin
            }

            return activeChannelSession == nil ? copy.channelWechatStartLogin : copy.channelWechatRestartLogin
        }

        return copy.channelSaveContinue
    }

    var selectedChannelSetupVariant: NativeOnboardingChannelSetupVariant? {
        resolveOnboardingChannelSetupVariant(selectedChannelPresentation?.setupKind)
    }

    var selectedModelEntry: SavedModelEntry? {
        guard let modelConfig = appState.modelConfig else { return nil }
        if let entryId = currentDraft.model?.entryId,
           let matched = modelConfig.savedEntries.first(where: { $0.id == entryId }) {
            return matched
        }
        if let entryId = onboardingState?.summary.model?.entryId,
           let matched = modelConfig.savedEntries.first(where: { $0.id == entryId }) {
            return matched
        }
        let fallbackProviderId = currentDraft.model?.providerId ?? onboardingState?.summary.model?.providerId ?? providerId
        let fallbackModelKey = currentDraft.model?.modelKey ?? onboardingState?.summary.model?.modelKey ?? modelKey
        guard !fallbackProviderId.isEmpty, !fallbackModelKey.isEmpty else { return nil }
        return modelConfig.savedEntries.first(where: { $0.providerId == fallbackProviderId && $0.modelKey == fallbackModelKey })
    }

    var selectedBrainEntryId: String? {
        selectedModelEntry?.id
    }

    var previewAvatarPreset: NativeOnboardingAvatarPreset {
        resolveOnboardingAvatarPreset(selectedEmployeePreset?.avatarPresetId ?? employeeAvatarPresetId)
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

    var selectedEmployeePresetReadiness: NativeOnboardingPresetReadiness? {
        guard let selectedEmployeePreset else {
            return nil
        }

        return resolveOnboardingEmployeePresetReadiness(preset: selectedEmployeePreset, onboardingState: onboardingState)
    }

    private func applyOnboardingState(_ state: OnboardingStateResponse) {
        onboardingState = state
        applyDraft(state.draft)
    }

    private func stageExistingInstall() async throws {
        let state = try await appState.client.reuseOnboardingRuntime()
        applyOnboardingState(state)
    }

    private func confirmPermissionsStep() async throws {
        let state = try await appState.client.confirmOnboardingPermissions()
        applyOnboardingState(state)
    }

    private func saveEmployeeDraftToDaemon(
        _ employee: OnboardingEmployeeState,
        autosaveRevision: Int? = nil
    ) async throws {
        let state = try await appState.client.saveOnboardingEmployee(employee)
        if let autosaveRevision, autosaveRevision != employeeDraftAutosaveRevision {
            return
        }
        applyOnboardingState(state)
    }

    private func enterDestination(_ destination: OnboardingDestination) async {
        appState.selectedSection = onboardingDestinationSection(destination)
        await appState.refreshAll()
        if destination == .chat {
            await appState.chatViewModel.start()
        }
    }

    func selectProvider(_ provider: OnboardingModelProviderPresentation) {
        pageError = nil
        providerId = provider.id
        methodId = provider.authMethods.first?.id ?? ""
        modelKey = provider.defaultModelKey
        modelLabel = provider.label
        modelValues = [:]
        clearModelAuthSessionState()
    }

    func selectModelAuthMethod(_ nextMethodId: String) {
        pageError = nil
        methodId = nextMethodId
        clearModelAuthSessionState()
    }

    func clearProviderSelection() {
        pageError = nil
        providerId = ""
        methodId = ""
        modelKey = ""
        modelLabel = ""
        modelValues = [:]
        clearModelAuthSessionState()
    }

    func updateLocale(_ localeIdentifier: String) {
        selectedLocaleIdentifier = resolveNativeOnboardingLocaleIdentifier(localeIdentifier)
        persistNativeOnboardingLocaleIdentifier(selectedLocaleIdentifier)
    }

    func bootstrap() async {
        pageLoading = true
        pageError = nil
        completedOnboarding = nil

        do {
            if appState.overview == nil {
                await appState.refreshAll()
            }

            let state = try await appState.client.fetchOnboardingState()
            applyOnboardingState(state)

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
                let next = try await appState.client.fetchOnboardingModelAuthSession(sessionId: sessionId)
                appState.modelConfig = next.modelConfig
                modelSession = next.session.status == "completed" || next.session.status == "failed" ? nil : next.session
                if let onboarding = next.onboarding {
                    applyOnboardingState(onboarding)
                }
                startModelSessionPolling(sessionId: sessionId)
            }

            if currentStep == .model && modelPickerProviders.isEmpty {
                applyOnboardingState(try await appState.client.fetchOnboardingState(fresh: true))
            }

            if currentStep == .channel && curatedChannels.isEmpty {
                applyOnboardingState(try await appState.client.fetchOnboardingState(fresh: true))
            }

            if currentStep == .channel {
                let draftChannel = onboardingState?.draft.channel
                if try await maybeAdvanceCompletedChannelSetupIfNeeded(
                    channelId: draftChannel?.channelId,
                    preferredEntryId: draftChannel?.entryId
                ) {
                    pageLoading = false
                    startDaemonEventsIfNeeded()
                    return
                }

                if let sessionId = onboardingState?.draft.activeChannelSessionId, !sessionId.isEmpty {
                    try await resumeChannelSession(sessionId: sessionId, draftChannel: draftChannel)
                }
            }
        } catch {
            presentErrorUnlessCancelled(error)
        }

        pageLoading = false
        startDaemonEventsIfNeeded()
    }

    func markWelcomeStarted() async {
        pageError = nil
        await goToStep(.install)
        do {
            applyOnboardingState(try await appState.client.detectOnboardingRuntime())
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func goToStep(_ step: OnboardingStep) async {
        do {
            applyOnboardingState(try await appState.client.navigateOnboarding(to: step))
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func useExistingInstall() async {
        pageError = nil

        do {
            try await stageExistingInstall()
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func updateExistingInstall() async {
        guard let target = installTarget, target.updateAvailable else { return }

        pageError = nil
        beginInstallProgress(.init(phase: .updating, percent: 10, message: nil))
        defer { endInstallProgress() }

        do {
            let result = try await appState.client.updateOnboardingRuntime()
            appState.overview = result.overview
            if let onboarding = result.onboarding {
                applyOnboardingState(onboarding)
            }
            _ = try await readFreshDeploymentTargets()

            guard result.status == "completed" else {
                throw NativeClientError.runtime(result.message)
            }

            appState.applyBanner(result.message)
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func advancePastInstall() async {
        await goToStep(.permissions)
    }

    func advancePastPermissions() async {
        pageError = nil
        permissionsNextBusy = true
        defer { permissionsNextBusy = false }

        do {
            try await confirmPermissionsStep()
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func advancePastModel() async {
        await goToStep(.channel)
    }

    func returnToModelPicker() async {
        pageError = nil
        clearProviderSelection()
        do {
            applyOnboardingState(try await appState.client.resetOnboardingModelDraft())
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func persistEmployeeDraft() {
        guard currentStep == .employee else { return }
        employeeDraftAutosaveRevision += 1
        let revision = employeeDraftAutosaveRevision
        scheduleEmployeeDraftPersistence(revision: revision) { [employeeName, employeeJobTitle, selectedEmployeePreset, memoryEnabled] in
            .init(
                memberId: self.currentDraft.employee?.memberId,
                name: employeeName,
                jobTitle: employeeJobTitle,
                avatarPresetId: selectedEmployeePreset?.avatarPresetId ?? self.currentDraft.employee?.avatarPresetId ?? "",
                presetId: selectedEmployeePreset?.id,
                personalityTraits: [],
                presetSkillIds: selectedEmployeePreset.map { preset in
                    resolveOnboardingPresetSkillIDs(presetSkillIDs: preset.presetSkillIds)
                },
                knowledgePackIds: selectedEmployeePreset?.knowledgePackIds ?? [],
                workStyles: selectedEmployeePreset?.workStyles ?? [],
                memoryEnabled: memoryEnabled
            )
        }
    }

    func runInstall() async {
        pageError = nil
        beginInstallProgress(.init(phase: .detecting, percent: 16, message: copy.installStageDetecting))
        defer { endInstallProgress() }

        do {
            let result = try await appState.client.installOnboardingRuntime()
            appState.overview = result.overview
            _ = try await readFreshDeploymentTargets()
            if let onboarding = result.onboarding {
                applyOnboardingState(onboarding)
            }
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
            let result = try await appState.client.saveOnboardingModelEntry(request)
            appState.modelConfig = result.modelConfig
            modelSession = result.authSession
            if let onboarding = result.onboarding {
                applyOnboardingState(onboarding)
            }

            if let authSession = result.authSession {
                startModelSessionPolling(sessionId: authSession.id)
            }
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
            let next = try await appState.client.submitOnboardingModelAuthInput(
                sessionId: sessionId,
                value: modelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            modelSession = next.session.status == "completed" || next.session.status == "failed" ? nil : next.session
            appState.modelConfig = next.modelConfig
            modelSessionInput = ""
            if let onboarding = next.onboarding {
                applyOnboardingState(onboarding)
            }
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
            channelId: selectedChannelPresentation.id.rawValue,
            entryId: selectedChannelEntry?.id,
            values: buildOnboardingChannelSaveValues(channelID: selectedChannelPresentation.id, values: channelValues),
            action: "save"
        )

        do {
            let result = try await self.appState.client.saveOnboardingChannelEntry(entryId: selectedChannelEntry?.id, request: request)
            applyChannelConfig(result.channelConfig, activeSession: result.session)

            channelMessage = result.message
            channelRequiresApply = result.requiresGatewayApply ?? false
            if result.session != nil {
                channelSessionInput = ""
            }
            if let onboarding = result.onboarding {
                applyOnboardingState(onboarding)
            }

            if let session = result.session {
                startChannelSessionPolling(
                    sessionId: session.id,
                    channelId: selectedChannelPresentation.id,
                    preferredEntryId: currentDraft.channel?.entryId ?? session.entryId
                )
                return
            }

            channelSessionTask?.cancel()
            channelSessionTask = nil
            Task { @MainActor [weak self] in
                guard let self else { return }
                _ = try? await self.readFreshChannelConfig()
            }
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func submitChannelSessionInput() async {
        guard let sessionID = activeChannelSession?.id, !channelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        channelBusy = true
        defer { channelBusy = false }

        do {
            let next = try await appState.client.submitOnboardingChannelSessionInput(
                sessionId: sessionID,
                value: channelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            applyChannelConfig(next.channelConfig, activeSession: next.session)
            channelSessionInput = ""
            if let onboarding = next.onboarding {
                applyOnboardingState(onboarding)
            }
            if try await maybeAdvanceCompletedChannelSetupIfNeeded(
                channelId: next.session.channelId,
                preferredEntryId: next.session.entryId
            ) {
                channelSessionTask = nil
                return
            }
            if next.session.status == "failed" {
                pageError = next.session.message
                channelSessionTask?.cancel()
                channelSessionTask = nil
                return
            }
            startChannelSessionPolling(
                sessionId: sessionID,
                channelId: next.session.channelId,
                preferredEntryId: next.session.entryId
            )
        } catch {
            if await handleMissingOnboardingChannelSession(error) {
                return
            }
            presentErrorUnlessCancelled(error)
        }
    }

    func selectEmployeePreset(_ presetID: String) {
        selectedEmployeePresetId = presetID
        if let preset = employeePresets.first(where: { $0.id == presetID }) {
            employeeAvatarPresetId = preset.avatarPresetId
            if let defaultMemoryEnabled = preset.defaultMemoryEnabled {
                memoryEnabled = defaultMemoryEnabled
            }
        }
    }

    func createEmployee() async {
        guard
            selectedBrainEntryId != nil,
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

        let employeeState = OnboardingEmployeeState(
            memberId: currentDraft.employee?.memberId,
            name: employeeName,
            jobTitle: employeeJobTitle,
            avatarPresetId: selectedEmployeePreset.avatarPresetId,
            presetId: selectedEmployeePreset.id,
            personalityTraits: [],
            presetSkillIds: resolveOnboardingPresetSkillIDs(presetSkillIDs: selectedEmployeePreset.presetSkillIds),
            knowledgePackIds: selectedEmployeePreset.knowledgePackIds,
            workStyles: selectedEmployeePreset.workStyles,
            memoryEnabled: memoryEnabled
        )

        do {
            try await saveEmployeeDraftToDaemon(employeeState)
            let result = try await appState.client.completeOnboarding(.init())
            appState.overview = result.overview
            completedOnboarding = result
            refreshAITeamOverviewInBackground()
        } catch {
            if await recoverOnboardingCompletionAfterTimeout(error, destination: nil) {
                return
            }
            presentErrorUnlessCancelled(error)
        }
    }

    func complete(destination: OnboardingDestination) async {
        completionBusy = destination
        pageError = nil
        defer { completionBusy = nil }

        do {
            if showingCompletion {
                await enterDestination(destination)
                return
            }

            let result = try await appState.client.completeOnboarding(.init(destination: destination))
            appState.overview = result.overview
            await enterDestination(destination)
        } catch {
            if await recoverOnboardingCompletionAfterTimeout(error, destination: destination) {
                return
            }
            presentErrorUnlessCancelled(error)
        }
    }

    func skipToDashboard() async {
        pageError = nil

        do {
            if showingCompletion {
                await enterDestination(.dashboard)
                return
            }

            let result = try await appState.client.completeOnboarding(.init(destination: .dashboard))
            appState.overview = result.overview
            await enterDestination(.dashboard)
        } catch {
            if await recoverOnboardingCompletionAfterTimeout(error, destination: .dashboard) {
                return
            }
            presentErrorUnlessCancelled(error)
        }
    }

    func openModelAuthWindow() {
        guard let launchUrl = modelSession?.launchUrl, let url = URL(string: launchUrl) else { return }
        openURL(url)
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
        openURL(url)
    }

    func openChannelDocs() {
        guard let docsUrl = selectedChannelPresentation?.docsUrl, let url = URL(string: docsUrl) else { return }
        openURL(url)
    }

    func openChannelPlatform() {
        guard let platformUrl = selectedChannelPresentation?.platformUrl, let url = URL(string: platformUrl) else { return }
        openURL(url)
    }

    func openChannelTutorial() {
        channelTutorialURLString = selectedChannelPresentation?.tutorialVideoUrl
        isChannelTutorialPresented = true
    }

    func dismissChannelTutorial() {
        isChannelTutorialPresented = false
    }

    func returnToChannelPicker() async {
        channelSessionTask?.cancel()
        channelSessionTask = nil
        selectedChannelId = nil
        channelValues = [
            "domain": "feishu",
            "botName": "ChillClaw Assistant",
        ]
        channelMessage = nil
        channelRequiresApply = false
        channelSessionInput = ""
        do {
            applyOnboardingState(try await appState.client.resetOnboardingChannelDraft())
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    func goBackFromChannelPicker() async {
        channelSessionTask?.cancel()
        channelSessionTask = nil
        await goToStep(.model)
    }

    func saveAndContinueChannel() async {
        await saveChannel()
    }

    func updateSelectedChannel(_ channelID: SupportedChannelId) {
        channelSessionTask?.cancel()
        channelSessionTask = nil
        selectedChannelId = channelID
        channelMessage = nil
        channelRequiresApply = false
        channelSessionInput = ""
        if channelID == .feishu {
            channelValues["domain"] = channelValues["domain"] ?? "feishu"
            channelValues["botName"] = channelValues["botName"] ?? "ChillClaw Assistant"
        }
    }

    private func resolvedChannelEntry(
        channelId: SupportedChannelId,
        preferredEntryId: String?,
        in channelConfig: ChannelConfigOverview? = nil
    ) -> ConfiguredChannelEntry? {
        let resolvedConfig = channelConfig ?? appState.channelConfig
        if let preferredEntryId,
           let matched = resolvedConfig?.entries.first(where: { $0.id == preferredEntryId }) {
            return matched
        }
        return resolvedConfig?.entries.first(where: { $0.channelId == channelId })
    }

    private func maybeAdvanceCompletedChannelSetupIfNeeded(
        channelId: SupportedChannelId?,
        preferredEntryId: String?
    ) async throws -> Bool {
        guard currentStep == .channel, channelId == .wechat else { return false }
        guard let resolvedChannelId = channelId,
              let entry = resolvedChannelEntry(channelId: resolvedChannelId, preferredEntryId: preferredEntryId),
              entry.status == "completed"
        else {
            return false
        }

        channelSessionInput = ""
        let next = try await appState.client.fetchOnboardingState(fresh: true)
        applyOnboardingState(next)
        return next.draft.currentStep == .employee
    }

    private func resumeChannelSession(
        sessionId: String,
        draftChannel: OnboardingChannelState?
    ) async throws {
        let next: ChannelSessionResponse
        do {
            next = try await appState.client.fetchOnboardingChannelSession(sessionId: sessionId)
        } catch {
            if await handleMissingOnboardingChannelSession(error) {
                return
            }
            throw error
        }
        applyChannelConfig(next.channelConfig, activeSession: next.session)
        if let onboarding = next.onboarding {
            applyOnboardingState(onboarding)
        }
        let channelId = draftChannel?.channelId ?? next.session.channelId
        let preferredEntryId = draftChannel?.entryId ?? next.session.entryId

        if try await maybeAdvanceCompletedChannelSetupIfNeeded(
            channelId: channelId,
            preferredEntryId: preferredEntryId
        ) {
            return
        }

        if next.session.status == "failed" {
            pageError = next.session.message
            return
        }

        startChannelSessionPolling(
            sessionId: sessionId,
            channelId: channelId,
            preferredEntryId: preferredEntryId
        )
    }

    private func startChannelSessionPolling(
        sessionId: String,
        channelId: SupportedChannelId,
        preferredEntryId: String?
    ) {
        channelSessionTask?.cancel()
        channelSessionTask = Task { @MainActor [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                do {
                    let next = try await self.appState.client.fetchOnboardingChannelSession(sessionId: sessionId)
                    self.applyChannelConfig(next.channelConfig, activeSession: next.session)
                    if let onboarding = next.onboarding {
                        self.applyOnboardingState(onboarding)
                    }

                    if try await self.maybeAdvanceCompletedChannelSetupIfNeeded(
                        channelId: channelId,
                        preferredEntryId: preferredEntryId ?? next.session.entryId
                    ) {
                        self.channelSessionTask = nil
                        return
                    }

                    if next.session.status == "failed" {
                        self.pageError = next.session.message
                        self.channelSessionTask = nil
                        return
                    }
                } catch let sessionError {
                    do {
                        _ = try await self.readFreshChannelConfig()
                        if try await self.maybeAdvanceCompletedChannelSetupIfNeeded(
                            channelId: channelId,
                            preferredEntryId: preferredEntryId
                        ) {
                            self.channelSessionTask = nil
                            return
                        }
                    } catch let refreshError {
                        self.presentErrorUnlessCancelled(refreshError)
                        self.channelSessionTask = nil
                        return
                    }

                    if await self.handleMissingOnboardingChannelSession(sessionError) {
                        self.channelSessionTask = nil
                        return
                    }

                    self.presentErrorUnlessCancelled(sessionError)
                    self.channelSessionTask = nil
                    return
                }

                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    func isSelectedChannelMissingRequiredValues() -> Bool {
        switch selectedChannelSetupVariant {
        case .wechatWorkGuided?:
            return (channelValues["botId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (channelValues["secret"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .wechatGuided?:
            return false
        case .feishuGuided?:
            return (channelValues["appId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (channelValues["appSecret"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .telegramGuided?:
            return (channelValues["token"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case nil:
            return true
        }
    }

    func channelSymbol(for channelID: SupportedChannelId) -> String {
        switch channelID {
        case .telegram:
            return "paperplane"
        case .feishu, .wechatWork, .wechat:
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
        case "botId":
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

    private func defaultChannelValues(for channelID: SupportedChannelId) -> [String: String] {
        switch channelID {
        case .feishu:
            return ["domain": "feishu", "botName": "ChillClaw Assistant"]
        default:
            return [:]
        }
    }

    private func channelValuesFromEntry(_ channelID: SupportedChannelId) -> [String: String] {
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

    private func scheduleEmployeeDraftPersistence(
        revision: Int,
        _ employee: @escaping @MainActor () -> OnboardingEmployeeState
    ) {
        guard !isApplyingDraft else { return }
        persistTask?.cancel()
        persistTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard let self, !Task.isCancelled else { return }
            do {
                try await self.saveEmployeeDraftToDaemon(employee(), autosaveRevision: revision)
            } catch {
                guard revision == self.employeeDraftAutosaveRevision else { return }
                self.presentErrorUnlessCancelled(error)
            }
        }
    }

    private func applyDraft(_ draft: OnboardingDraftState) {
        isApplyingDraft = true
        defer { isApplyingDraft = false }

        if draft.currentStep != .install {
            stopInstallProgressAnimation()
        }

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
        if let channelId = draft.channel?.channelId {
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
            employeeAvatarPresetId = firstPreset.avatarPresetId
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
                    let nextSession = try await self.appState.client.fetchOnboardingModelAuthSession(sessionId: sessionId)
                    guard self.modelSession?.id == sessionId else { return }
                    self.modelSession =
                        nextSession.session.status == "completed" || nextSession.session.status == "failed"
                        ? nil
                        : nextSession.session
                    self.appState.modelConfig = nextSession.modelConfig
                    if let onboarding = nextSession.onboarding {
                        self.applyOnboardingState(onboarding)
                    }

                    if nextSession.session.status == "completed" {
                        self.modelSession = nil
                        return
                    }

                    if nextSession.session.status == "failed" {
                        self.pageError = nextSession.session.message
                        return
                    }
                } catch {
                    guard self.modelSession?.id == sessionId else { return }
                    self.presentErrorUnlessCancelled(error)
                    return
                }

                try? await Task.sleep(nanoseconds: 1_600_000_000)
            }
        }
    }

    private func clearModelAuthSessionState() {
        modelSessionTask?.cancel()
        modelSessionTask = nil
        modelSession = nil
        modelSessionInput = ""
    }

    private func applyChannelConfig(_ channelConfig: ChannelConfigOverview, activeSession: ChannelSession?) {
        var nextConfig = channelConfig
        nextConfig.activeSession = activeSession
        appState.channelConfig = nextConfig
    }

    private func handleMissingOnboardingChannelSession(_ error: Error) async -> Bool {
        let message = error.localizedDescription
        guard message.localizedCaseInsensitiveContains("channel session not found")
            || message.localizedCaseInsensitiveContains("channel login session ended")
        else {
            return false
        }

        if var channelConfig = appState.channelConfig {
            channelConfig.activeSession = nil
            appState.channelConfig = channelConfig
        }

        channelMessage = message
        if let next = try? await appState.client.fetchOnboardingState(fresh: true) {
            applyOnboardingState(next)
        }
        return true
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

    private func refreshAITeamOverviewInBackground() {
        Task { [weak self] in
            guard let self else { return }
            _ = try? await self.readFreshAITeamOverview()
        }
    }

    private func recoverOnboardingCompletionAfterTimeout(
        _ error: Error,
        destination: OnboardingDestination?
    ) async -> Bool {
        guard isRecoverableOnboardingCompletionTimeout(error) else {
            return false
        }

        for attempt in 0..<12 {
            if let overview = try? await readFreshOverview(), overview.firstRun.setupCompleted {
                pageError = nil
                let recovered = CompleteOnboardingResponse(
                    status: "completed",
                    destination: destination,
                    summary: completionSummary,
                    overview: overview
                )
                appState.overview = overview

                if let destination {
                    await enterDestination(destination)
                } else {
                    completedOnboarding = recovered
                    refreshAITeamOverviewInBackground()
                }

                return true
            }

            if let next = try? await appState.client.fetchOnboardingState(fresh: true) {
                applyOnboardingState(next)
            }

            if attempt < 11 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }

        return false
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

    private func applyDaemonEvent(_ event: ChillClawEvent) async {
        if onboardingState?.draft.currentStep == .install, case let .deployProgress(_, _, phase, percent, message) = event {
            applyInstallProgressUpdate(phase: phase, percent: percent.map(Double.init), message: message)
        }

        switch event {
        case let .overviewUpdated(snapshot):
            appState.overview = snapshot.data
        case let .modelConfigUpdated(snapshot):
            appState.modelConfig = snapshot.data
        case let .channelConfigUpdated(snapshot):
            appState.channelConfig = snapshot.data
        case let .channelSessionUpdated(channelID, session):
            if var channelConfig = appState.channelConfig, channelConfig.activeSession?.channelId == channelID {
                channelConfig.activeSession = session
                appState.channelConfig = channelConfig
            }
        case let .aiTeamUpdated(snapshot):
            appState.aiTeamOverview = snapshot.data
        case let .presetSkillSyncUpdated(snapshot):
            if let currentOnboardingState = onboardingState {
                onboardingState = OnboardingStateResponse(
                    firstRun: currentOnboardingState.firstRun,
                    draft: currentOnboardingState.draft,
                    config: currentOnboardingState.config,
                    summary: currentOnboardingState.summary,
                    presetSkillSync: snapshot.data
                )
            }
        case .skillCatalogUpdated, .pluginConfigUpdated, .deployProgress, .deployCompleted, .gatewayStatus, .taskProgress, .chatStream, .configApplied:
            break
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
            case .onboarding:
                onboardingState = try await appState.client.fetchOnboardingState(fresh: true)
                if let onboardingState {
                    applyDraft(onboardingState.draft)
                }
            }
            pageError = nil
        } catch {
            presentErrorUnlessCancelled(error)
        }
    }

    private func beginInstallProgress(_ snapshot: NativeOnboardingInstallProgressSnapshot) {
        installBusy = true
        installProgress = snapshot
        startInstallProgressAnimationIfNeeded()
    }

    private func endInstallProgress() {
        installBusy = false
        stopInstallProgressAnimation()
    }

    private func applyInstallProgressUpdate(
        phase: ChillClawDeployPhase,
        percent: Double?,
        message: String?
    ) {
        installProgress = mergeNativeOnboardingInstallProgress(
            current: installProgress,
            phase: phase,
            percent: percent,
            message: message
        )
        startInstallProgressAnimationIfNeeded()
    }

    private func startInstallProgressAnimationIfNeeded() {
        guard installBusy else { return }
        guard installProgressAnimationTask == nil else { return }

        installProgressAnimationTask = Task { @MainActor [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard !Task.isCancelled else { break }
                guard self.installBusy else {
                    self.installProgressAnimationTask = nil
                    return
                }

                let nextProgress = advanceNativeOnboardingInstallProgress(self.installProgress)
                if nextProgress.percent != self.installProgress.percent {
                    self.installProgress = nextProgress
                }
            }

            self?.installProgressAnimationTask = nil
        }
    }

    private func stopInstallProgressAnimation() {
        installProgressAnimationTask?.cancel()
        installProgressAnimationTask = nil
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
