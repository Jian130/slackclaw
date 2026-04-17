import Foundation
import SwiftUI
import ChillClawProtocol
#if canImport(AppKit)
import AppKit
#endif

struct NativeOnboardingAvatarPreset: Identifiable, Sendable {
    let id: String
    let label: String
    let emoji: String
    let accent: String
    let theme: String
    let resourceName: String
}

let nativeOnboardingAvatarPresets: [NativeOnboardingAvatarPreset] = [
    .init(id: "onboarding-analyst", label: "Onboarding Analyst", emoji: "🧠", accent: "#97b5ea", theme: "onboarding", resourceName: "onboarding-analyst"),
    .init(id: "onboarding-strategist", label: "Onboarding Strategist", emoji: "🗺️", accent: "#a9bde8", theme: "onboarding", resourceName: "onboarding-strategist"),
    .init(id: "onboarding-builder", label: "Onboarding Builder", emoji: "🛠️", accent: "#9ec1ef", theme: "onboarding", resourceName: "onboarding-builder"),
    .init(id: "onboarding-guide", label: "Onboarding Guide", emoji: "✨", accent: "#a0c7ef", theme: "onboarding", resourceName: "onboarding-guide"),
    .init(id: "onboarding-visionary", label: "Onboarding Visionary", emoji: "🚀", accent: "#afc6f0", theme: "onboarding", resourceName: "onboarding-visionary"),
]

let nativeOnboardingChannelIDs: Set<SupportedChannelId> = [.wechat]
let nativeOnboardingStepOrder: [OnboardingStep] = [.welcome, .install, .model, .channel, .employee]
let nativeOnboardingPreferredColorScheme: ColorScheme = .light
let nativeOnboardingTextPrimary = Color(red: 0.09, green: 0.12, blue: 0.18)
let nativeOnboardingTextSecondary = Color(red: 0.41, green: 0.45, blue: 0.54)
let nativeOnboardingLocaleDefaultsKey = "chillclaw.locale"
let nativeOnboardingDefaultWindowSize = CGSize(width: 1280, height: 980)
let nativeOnboardingMinimumWindowSize = CGSize(width: 960, height: 820)
let nativeOnboardingContentWidthRatio: CGFloat = 0.70
let nativeOnboardingContentMinWidth: CGFloat = 672
let nativeOnboardingContentMaxWidth: CGFloat = 1120
let nativeOnboardingWelcomeCardAspectRatio: CGFloat = 1.74
let nativeOnboardingWelcomeCardMinHeight: CGFloat = 520
let nativeOnboardingWelcomeCardMaxHeight: CGFloat = 616
let nativeOnboardingHeaderWidthRatio: CGFloat = 0.73
let nativeOnboardingHeaderMaxWidth: CGFloat = 768
let nativeOnboardingCompactProgressThreshold: CGFloat = 960
let nativeOnboardingCompactEmployeeThreshold: CGFloat = 980
let nativeOnboardingOuterPanelPadding: CGFloat = 28
let nativeOnboardingInnerCardPadding: CGFloat = 24
let nativeOnboardingSectionGap: CGFloat = 24
let nativeOnboardingFeatureGap: CGFloat = 16
let nativeOnboardingOuterRadius: CGFloat = NativeUI.cardCornerRadius
let nativeOnboardingSectionRadius: CGFloat = NativeUI.panelCornerRadius
let nativeOnboardingStandardRadius: CGFloat = NativeUI.standardCornerRadius
let nativeOnboardingFeatureRadius: CGFloat = NativeUI.compactCornerRadius
let nativeOnboardingControlRadius: CGFloat = NativeUI.controlCornerRadius
let nativeOnboardingIconTileRadius: CGFloat = NativeUI.iconCornerRadius
let nativeOnboardingDisplayRadius: CGFloat = NativeUI.heroCornerRadius
let nativeOnboardingCTAHeight: CGFloat = 50
let nativeOnboardingAuthMethodCardHeight: CGFloat = 208
let nativeOnboardingModelCloudHandoffDelayNanoseconds: UInt64 = 2_000_000_000

enum NativeOnboardingActionButtonVariant: Sendable {
    case accent
    case prominent
    case primary
    case secondary
}

struct NativeOnboardingActionButtonLayout: Sendable, Equatable {
    let expandsToContainer: Bool
    let minHeight: CGFloat
    let usesFullHitShape: Bool
    let cornerRadius: CGFloat
}

struct NativeOnboardingAuthMethodCardLayout: Sendable, Equatable {
    let spacing: CGFloat
    let cardWidth: CGFloat
    let cardHeight: CGFloat
}

enum NativeOnboardingGuideTone {
    case tutorial
    case getKey
    case input

    var background: LinearGradient {
        switch self {
        case .tutorial:
            return LinearGradient(
                colors: [Color(red: 0.91, green: 0.95, blue: 1.0), Color(red: 0.95, green: 0.97, blue: 1.0)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .getKey:
            return LinearGradient(
                colors: [Color(red: 0.99, green: 0.96, blue: 1.0), Color(red: 1.0, green: 0.94, blue: 0.97)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .input:
            return LinearGradient(
                colors: [Color(red: 0.93, green: 0.99, blue: 0.96), Color(red: 0.94, green: 1.0, blue: 0.97)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    var border: Color {
        switch self {
        case .tutorial:
            return Color(red: 0.69, green: 0.82, blue: 0.99)
        case .getKey:
            return Color(red: 0.90, green: 0.77, blue: 0.98)
        case .input:
            return Color(red: 0.63, green: 0.93, blue: 0.74)
        }
    }
}

struct NativeOnboardingLocaleOption: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let flag: String
}

func nativeOnboardingContentWidth(for windowWidth: CGFloat) -> CGFloat {
    min(max(windowWidth * nativeOnboardingContentWidthRatio, nativeOnboardingContentMinWidth), nativeOnboardingContentMaxWidth)
}

func nativeOnboardingContentHeight(for contentWidth: CGFloat) -> CGFloat {
    min(
        max(contentWidth / nativeOnboardingWelcomeCardAspectRatio, nativeOnboardingWelcomeCardMinHeight),
        nativeOnboardingWelcomeCardMaxHeight
    )
}

func nativeOnboardingHeaderWidth(for contentWidth: CGFloat) -> CGFloat {
    min(nativeOnboardingHeaderMaxWidth, contentWidth * nativeOnboardingHeaderWidthRatio)
}

func nativeOnboardingUsesCompactProgressLayout(for contentWidth: CGFloat) -> Bool {
    contentWidth < nativeOnboardingCompactProgressThreshold
}

func nativeOnboardingUsesInlineProgressHeader(step: OnboardingStep, contentWidth: CGFloat) -> Bool {
    _ = step
    return nativeOnboardingUsesCompactProgressLayout(for: contentWidth)
}

func nativeOnboardingUsesCompactEmployeeLayout(for contentWidth: CGFloat) -> Bool {
    contentWidth < nativeOnboardingCompactEmployeeThreshold
}

func nativeOnboardingActionButtonLayout(
    variant: NativeOnboardingActionButtonVariant
) -> NativeOnboardingActionButtonLayout {
    _ = variant
    return .init(
        expandsToContainer: true,
        minHeight: nativeOnboardingCTAHeight,
        usesFullHitShape: true,
        cornerRadius: nativeOnboardingControlRadius
    )
}

func nativeOnboardingAuthMethodCardLayout(containerWidth: CGFloat, methodCount: Int) -> NativeOnboardingAuthMethodCardLayout {
    let count = max(methodCount, 1)
    let spacing: CGFloat = 16
    let totalSpacing = CGFloat(max(count - 1, 0)) * spacing
    let availableWidth = max(containerWidth - totalSpacing, 0)
    let cardWidth = availableWidth / CGFloat(count)

    return .init(
        spacing: spacing,
        cardWidth: cardWidth,
        cardHeight: nativeOnboardingAuthMethodCardHeight
    )
}

func nativeOnboardingActionButtonVariant(_ variant: NativeOnboardingActionButtonVariant) -> ActionButtonVariant {
    switch variant {
    case .accent:
        return .primary
    case .prominent:
        return .onboardingProminent
    case .primary:
        return .outline
    case .secondary:
        return .secondary
    }
}

func nativeOnboardingForwardActionVariant() -> NativeOnboardingActionButtonVariant {
    .prominent
}

func nativeOnboardingChannelPresentationTheme(_ theme: OnboardingChannelTheme) -> LinearGradient {
    switch theme {
    case .wechatWork, .wechat:
        return LinearGradient(colors: [Color(red: 0.87, green: 0.98, blue: 0.92), Color(red: 0.78, green: 0.96, blue: 0.88)], startPoint: .topLeading, endPoint: .bottomTrailing)
    case .telegram:
        return LinearGradient(colors: [Color(red: 0.94, green: 0.93, blue: 1.0), Color(red: 0.90, green: 0.92, blue: 0.99)], startPoint: .topLeading, endPoint: .bottomTrailing)
    case .feishu:
        fallthrough
    default:
        return LinearGradient(colors: [Color(red: 0.86, green: 0.97, blue: 1.0), Color(red: 0.76, green: 0.90, blue: 1.0)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

func nativeOnboardingChannelGuideThemeColor(_ kind: String) -> Color {
    switch kind {
    case "tutorial":
        return Color(red: 0.18, green: 0.39, blue: 0.96)
    case "platform":
        return Color(red: 0.76, green: 0.18, blue: 0.91)
    default:
        return Color(red: 0.06, green: 0.76, blue: 0.39)
    }
}

func nativeOnboardingChannelGuideStepGradient(_ kind: String) -> [Color] {
    switch kind {
    case "tutorial":
        return [Color(red: 0.22, green: 0.46, blue: 0.98), Color(red: 0.31, green: 0.22, blue: 0.95)]
    case "platform":
        return [Color(red: 0.62, green: 0.16, blue: 0.96), Color(red: 0.94, green: 0.07, blue: 0.50)]
    default:
        return [Color(red: 0.05, green: 0.74, blue: 0.37), Color(red: 0.12, green: 0.79, blue: 0.48)]
    }
}

func nativeOnboardingChannelGuideTone(_ kind: String) -> NativeOnboardingGuideTone {
    switch kind {
    case "tutorial":
        return .tutorial
    case "platform":
        return .getKey
    default:
        return .input
    }
}

func nativeChannelDisplayLabel(_ channelId: SupportedChannelId) -> String {
    switch channelId {
    case .wechatWork:
        return "WeChat Work"
    case .wechat:
        return "WeChat"
    case .feishu:
        return "Feishu"
    case .telegram:
        return "Telegram"
    case .whatsapp:
        return "WhatsApp"
    }
}

func nativePresetTheme(_ theme: String) -> LinearGradient {
    switch theme {
    case "support":
        return LinearGradient(
            colors: [Color(red: 0.93, green: 0.98, blue: 1.0), Color(red: 0.90, green: 0.97, blue: 0.99)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    case "operator":
        return LinearGradient(
            colors: [Color(red: 0.95, green: 0.96, blue: 1.0), Color(red: 0.94, green: 0.94, blue: 1.0)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    case "analyst":
        fallthrough
    default:
        return LinearGradient(
            colors: [Color(red: 0.92, green: 0.96, blue: 1.0), Color(red: 0.93, green: 0.95, blue: 1.0)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

func nativePresetAccent(_ theme: String) -> Color {
    switch theme {
    case "support":
        return Color(red: 0.04, green: 0.47, blue: 0.76)
    case "operator":
        return Color(red: 0.37, green: 0.31, blue: 0.92)
    case "analyst":
        fallthrough
    default:
        return Color(red: 0.16, green: 0.39, blue: 0.95)
    }
}

func nativePresetSymbol(_ theme: String) -> String {
    switch theme {
    case "support":
        return "person.2.fill"
    case "operator":
        return "bolt.fill"
    case "analyst":
        fallthrough
    default:
        return "brain.head.profile"
    }
}

let nativeOnboardingLocaleOptions: [NativeOnboardingLocaleOption] = [
    .init(id: "en", label: "English", flag: "🇺🇸"),
    .init(id: "zh", label: "中文", flag: "🇨🇳"),
    .init(id: "ja", label: "日本語", flag: "🇯🇵"),
    .init(id: "ko", label: "한국어", flag: "🇰🇷"),
    .init(id: "es", label: "Español", flag: "🇪🇸"),
]

func nativeLocalePickerSelectedOption(
    localeIdentifier: String,
    options: [NativeOnboardingLocaleOption] = nativeOnboardingLocaleOptions
) -> NativeOnboardingLocaleOption {
    let resolvedIdentifier = resolveNativeOnboardingLocaleIdentifier(localeIdentifier)
    return options.first(where: { $0.id == resolvedIdentifier })
        ?? nativeOnboardingLocaleOptions.first(where: { $0.id == "en" })
        ?? NativeOnboardingLocaleOption(id: "en", label: "English", flag: "🇺🇸")
}

struct NativeResolvedOnboardingModelProvider: Identifiable, Sendable {
    let id: String
    let curated: OnboardingModelProviderPresentation
    let provider: ModelProviderConfig?
}

enum NativeOnboardingChannelSetupVariant: String, Sendable {
    case wechatWorkGuided = "wechat-work-guided"
    case wechatGuided = "wechat-guided"
    case feishuGuided = "feishu-guided"
    case telegramGuided = "telegram-guided"
}

func resolveOnboardingModelPickerProviders(
    onboardingState: OnboardingStateResponse?
) -> [OnboardingModelProviderPresentation] {
    onboardingState?.config.modelProviders ?? []
}

func resolveOnboardingChannelPresentations(
    onboardingState: OnboardingStateResponse?
) -> [OnboardingChannelPresentation] {
    onboardingState?.config.channels ?? []
}

func resolveOnboardingEmployeePresets(
    onboardingState: OnboardingStateResponse?
) -> [OnboardingEmployeePresetPresentation] {
    onboardingState?.config.employeePresets ?? []
}

enum NativeOnboardingPresetReadinessStatus: Sendable {
    case ready
    case syncing
    case repair
    case install
}

struct NativeOnboardingPresetReadiness: Sendable {
    let status: NativeOnboardingPresetReadinessStatus
    let label: String
    let detail: String?
    let blocking: Bool
}

func nativeOnboardingPresetStatusTone(_ status: NativeOnboardingPresetReadinessStatus) -> NativeStatusTone {
    switch status {
    case .ready:
        return .success
    case .syncing:
        return .info
    case .repair:
        return .warning
    case .install:
        return .neutral
    }
}

func resolveOnboardingPresetSkillIDs(
    presetSkillIDs: [String]?
) -> [String] {
    (presetSkillIDs ?? []).filter { !$0.isEmpty }
}

func resolveOnboardingEmployeePresetReadiness(
    preset: OnboardingEmployeePresetPresentation,
    onboardingState: OnboardingStateResponse?
) -> NativeOnboardingPresetReadiness {
    let presetSkillIDs = resolveOnboardingPresetSkillIDs(presetSkillIDs: preset.presetSkillIds)
    if presetSkillIDs.isEmpty {
        return .init(status: .ready, label: "Ready", detail: "This preset does not need any managed skills.", blocking: false)
    }

    let entries = presetSkillIDs.compactMap { presetSkillID in
        onboardingState?.presetSkillSync?.entries.first(where: { $0.presetSkillId == presetSkillID })
    }

    if entries.count == presetSkillIDs.count, entries.allSatisfy({ $0.status == .verified }) {
        return .init(
            status: .ready,
            label: "Ready",
            detail: onboardingState?.presetSkillSync?.summary ?? "Preset skills are verified in the active runtime.",
            blocking: false
        )
    }

    if let failedEntry = entries.first(where: { $0.status == .failed }) {
        return .init(
            status: .repair,
            label: "Repair needed",
            detail: failedEntry.lastError ?? onboardingState?.presetSkillSync?.summary ?? "ChillClaw could not verify every preset skill.",
            blocking: false
        )
    }

    if entries.contains(where: { $0.status != .verified }) {
        return .init(
            status: .syncing,
            label: "Syncing",
            detail: onboardingState?.presetSkillSync?.summary ?? "ChillClaw is syncing preset skills for this employee.",
            blocking: false
        )
    }

    return .init(
        status: .install,
        label: "Prepared on finish",
        detail: "Choose this preset and ChillClaw will prepare its guided skills during final setup.",
        blocking: false
    )
}

enum OnboardingRefreshResource {
    case installContext
    case overview
    case model
    case channel
    case team
    case onboarding
}

struct NativeOnboardingEmployeeDraft: Sendable {
    var name: String
    var jobTitle: String
    var avatarPresetId: String
    var presetId: String
    var personalityTraits: [String]
    var presetSkillIds: [String]
    var knowledgePackIds: [String]
    var workStyles: [String]
    var memoryEnabled: Bool
    var brainEntryId: String
}

func resolveOnboardingAvatarPreset(_ presetId: String?) -> NativeOnboardingAvatarPreset {
    nativeOnboardingAvatarPresets.first(where: { $0.id == presetId }) ?? nativeOnboardingAvatarPresets[0]
}

func onboardingDestinationSection(_ destination: OnboardingDestination) -> NativeSection {
    switch destination {
    case .team:
        return .team
    case .chat:
        return .chat
    case .dashboard:
        return .dashboard
    }
}

func resolveNativeOnboardingInstallTarget(
    overview: ProductOverview?,
    deploymentTargets: DeploymentTargetsResponse?
) -> DeploymentTargetStatus? {
    guard overview?.engine.installed == true else {
        return nil
    }

    let installedTargets = (deploymentTargets?.targets ?? []).filter { target in
        target.installed && (target.id == "standard" || target.id == "managed-local")
    }

    if let activeTarget = installedTargets.first(where: { $0.active }) {
        return activeTarget
    }

    if let version = overview?.engine.version,
       let versionMatchedTarget = installedTargets.first(where: { $0.version == version })
    {
        return versionMatchedTarget
    }

    return installedTargets.first
}

func buildOnboardingMemberRequest(_ draft: NativeOnboardingEmployeeDraft) -> SaveAIMemberRequest {
    let preset = resolveOnboardingAvatarPreset(draft.avatarPresetId)
    let personality = draft.personalityTraits.isEmpty
        ? draft.workStyles.joined(separator: ", ")
        : draft.personalityTraits.joined(separator: ", ")

    return .init(
        name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
        jobTitle: draft.jobTitle.trimmingCharacters(in: .whitespacesAndNewlines),
        avatar: .init(
            presetId: preset.id,
            accent: preset.accent,
            emoji: preset.emoji,
            theme: preset.theme
        ),
        brainEntryId: draft.brainEntryId,
        personality: personality,
        soul: personality,
        workStyles: draft.workStyles,
        presetSkillIds: draft.presetSkillIds,
        skillIds: [],
        knowledgePackIds: draft.knowledgePackIds,
        capabilitySettings: .init(memoryEnabled: draft.memoryEnabled, contextWindow: 128000)
    )
}

func resolveOnboardingChannelSetupVariant(_ setupKind: OnboardingChannelSetupKind?) -> NativeOnboardingChannelSetupVariant {
    switch setupKind {
    case .wechatWorkGuided:
        return .wechatWorkGuided
    case .wechatGuided:
        return .wechatGuided
    case .telegramGuided:
        return .telegramGuided
    case .feishuGuided:
        fallthrough
    default:
        return .feishuGuided
    }
}

private func nonEmptyTrimmed(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
        return nil
    }

    return trimmed
}

func buildOnboardingChannelSaveValues(
    channelID: SupportedChannelId,
    values: [String: String]
) -> [String: String] {
    guard channelID == .wechatWork else {
        return values
    }

    return [
        "botId": nonEmptyTrimmed(values["botId"]) ?? nonEmptyTrimmed(values["agentId"]) ?? "",
        "secret": values["secret"] ?? "",
    ]
}

func resolveOnboardingModelProviders(
    onboardingState: OnboardingStateResponse?,
    modelConfig: ModelConfigOverview?
) -> [NativeResolvedOnboardingModelProvider] {
    guard let onboardingState else {
        return []
    }

    return onboardingState.config.modelProviders.map { curated in
        .init(id: curated.id, curated: curated, provider: modelConfig?.providers.first(where: { $0.id == curated.id }))
    }
}

func onboardingProviderGradient(_ theme: String) -> LinearGradient {
    switch theme {
    case "minimax":
        return LinearGradient(
            colors: [
                Color(red: 0.996, green: 0.941, blue: 0.886),
                Color(red: 0.996, green: 0.965, blue: 0.859),
                Color(red: 0.996, green: 0.980, blue: 0.827),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    case "qwen":
        return LinearGradient(
            colors: [
                Color(red: 0.953, green: 0.929, blue: 0.996),
                Color(red: 0.980, green: 0.922, blue: 0.996),
                Color(red: 0.933, green: 0.902, blue: 0.996),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    case "chatgpt":
        return LinearGradient(
            colors: [
                Color(red: 0.863, green: 0.980, blue: 0.918),
                Color(red: 0.820, green: 0.980, blue: 0.898),
                Color(red: 0.804, green: 0.980, blue: 0.961),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    default:
        return LinearGradient(
            colors: [Color.white.opacity(0.82), Color.white.opacity(0.76)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

func onboardingProviderAccent(_ theme: String) -> Color {
    switch theme {
    case "minimax":
        return Color(red: 0.78, green: 0.45, blue: 0.14)
    case "qwen":
        return Color(red: 0.62, green: 0.28, blue: 0.86)
    case "chatgpt":
        return Color(red: 0.05, green: 0.60, blue: 0.41)
    default:
        return Color(red: 0.24, green: 0.41, blue: 0.95)
    }
}

func onboardingAuthMethodSymbol(_ method: ModelAuthMethod) -> String {
    switch method.kind {
    case "oauth":
        return "sparkles"
    default:
        return "key.fill"
    }
}

func nativeOnboardingAuthMethodLabel(_ method: ModelAuthMethod, copy: NativeOnboardingCopy) -> String {
    let trimmed = method.label.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty {
        return trimmed
    }
    return method.kind == "oauth" ? copy.authOAuthLabel : copy.authApiKeyLabel
}

func nativeOnboardingAuthMethodBody(_ method: ModelAuthMethod, copy: NativeOnboardingCopy) -> String {
    let trimmed = method.description.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty {
        return trimmed
    }
    return method.kind == "oauth" ? copy.authOAuthBody : copy.authApiKeyBody
}

func resolveOnboardingProviderID<Provider: Identifiable>(
    currentProviderId: String,
    draftProviderId: String?,
    providers: [Provider]
) -> String where Provider.ID == String {
    if let draftProviderId {
        if providers.contains(where: { $0.id == draftProviderId }) {
            return draftProviderId
        }
        return ""
    }

    if providers.contains(where: { $0.id == currentProviderId }) {
        return currentProviderId
    }

    return ""
}

func onboardingStepIndex(_ step: OnboardingStep) -> Int {
    nativeOnboardingStepOrder.firstIndex(of: normalizeNativeOnboardingStep(step)) ?? 0
}

func normalizeNativeOnboardingStep(_ step: OnboardingStep) -> OnboardingStep {
    step == .permissions ? .model : step
}

func onboardingIsCurrentOrLater(_ step: OnboardingStep, target: OnboardingStep) -> Bool {
    onboardingStepIndex(step) >= onboardingStepIndex(target)
}

func resolveNativeOnboardingLocalRuntime(
    currentStep: OnboardingStep,
    localRuntimeSnapshot: LocalModelRuntimeOverview?,
    onboardingLocalRuntime: LocalModelRuntimeOverview?,
    modelConfigLocalRuntime: LocalModelRuntimeOverview?
) -> LocalModelRuntimeOverview? {
    if let localRuntimeSnapshot {
        return localRuntimeSnapshot
    }

    if normalizeNativeOnboardingStep(currentStep) == .model {
        return onboardingLocalRuntime ?? modelConfigLocalRuntime
    }

    return modelConfigLocalRuntime ?? onboardingLocalRuntime
}

func onboardingRefreshResourceForEvent(_ step: OnboardingStep, _ event: ChillClawEvent) -> OnboardingRefreshResource? {
    switch step {
    case .welcome:
        return nil
    case .install:
        switch event {
        case .deployCompleted, .gatewayStatus:
            return .installContext
        case .localRuntimeProgress, .localRuntimeCompleted:
            return nil
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return nil
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated,
             .chatStream, .channelSessionUpdated, .configApplied, .deployProgress, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return nil
        }
    case .permissions:
        return nil
    case .model:
        switch event {
        case .localRuntimeCompleted:
            return .onboarding
        case .localRuntimeProgress:
            return nil
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return nil
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated,
             .chatStream, .channelSessionUpdated, .configApplied, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return nil
        }
    case .channel:
        switch event {
        case .channelSessionUpdated:
            return nil
        case .localRuntimeProgress, .localRuntimeCompleted:
            return nil
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return nil
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .presetSkillSyncUpdated, .downloadsUpdated,
             .chatStream, .configApplied, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return nil
        }
    case .employee:
        switch event {
        case .presetSkillSyncUpdated:
            return nil
        case .localRuntimeProgress, .localRuntimeCompleted:
            return nil
        case .runtimeProgress, .runtimeCompleted, .runtimeUpdateStaged:
            return nil
        case .overviewUpdated, .aiTeamUpdated, .modelConfigUpdated, .channelConfigUpdated, .pluginConfigUpdated, .skillCatalogUpdated, .downloadsUpdated,
             .chatStream, .channelSessionUpdated, .configApplied, .deployCompleted, .deployProgress, .gatewayStatus, .taskProgress, .downloadProgress, .downloadStatus, .downloadCompleted, .downloadFailed, .daemonHeartbeat:
            return nil
        }
    }
}

enum NativeOnboardingInstallScreenKind: Sendable {
    case missing
    case found
    case installing
    case complete
}

struct NativeOnboardingInstallProgressSnapshot: Sendable {
    var phase: ChillClawDeployPhase?
    var percent: Double?
    var message: String?
}

struct NativeOnboardingInstallViewState: Sendable {
    var kind: NativeOnboardingInstallScreenKind
    var version: String?
    var progressPercent: Double?
    var stageLabel: String?
    var isUpdating: Bool
}

enum NativeOnboardingModelScreenKind: Sendable {
    case picker
    case configure
    case connected
}

enum NativeOnboardingModelSetupVariant: Sendable {
    case defaultAPIKey
    case guidedMiniMaxAPIKey
    case oauth
}

struct NativeOnboardingModelViewState: Sendable {
    var kind: NativeOnboardingModelScreenKind
    var provider: NativeResolvedOnboardingModelProvider?
    var entry: SavedModelEntry?
}

enum NativeOnboardingModelStepMode: Sendable, Equatable {
    case detectingLocal
    case cloudHandoff
    case localSetup
    case cloudConfig
    case connected
}

struct NativeOnboardingLocalSetupProgress: Sendable, Equatable {
    var currentStep: Int
}

private func nativeOnboardingInstallProgressFallback(_ phase: ChillClawDeployPhase?) -> Double {
    switch phase {
    case .some(.reusing):
        return 34
    case .some(.installing):
        return 58
    case .some(.updating), .some(.uninstalling):
        return 64
    case .some(.verifying):
        return 82
    case .some(.restartingGateway):
        return 94
    case .some(.detecting), .none:
        return 16
    }
}

private func nativeOnboardingInstallProgressCeiling(_ phase: ChillClawDeployPhase?) -> Double {
    switch phase {
    case .some(.detecting):
        return 28
    case .some(.reusing):
        return 42
    case .some(.installing), .some(.updating), .some(.uninstalling):
        return 76
    case .some(.verifying):
        return 90
    case .some(.restartingGateway):
        return 96
    case .none:
        return 24
    }
}

private func nativeOnboardingInstallProgressAnimationStep(_ phase: ChillClawDeployPhase?) -> Double {
    switch phase {
    case .some(.detecting):
        return 0.55
    case .some(.reusing):
        return 0.45
    case .some(.installing), .some(.updating), .some(.uninstalling):
        return 0.24
    case .some(.verifying):
        return 0.36
    case .some(.restartingGateway):
        return 0.22
    case .none:
        return 0.35
    }
}

private struct NativeOnboardingRuntimeInstallProgressRange {
    let start: Double
    let end: Double
}

private func nativeOnboardingRuntimeInstallProgressRange(
    resourceID: String
) -> NativeOnboardingRuntimeInstallProgressRange? {
    switch resourceID {
    case "node-npm-runtime":
        return .init(start: 46, end: 60)
    case "openclaw-runtime":
        return .init(start: 58, end: 76)
    default:
        return nil
    }
}

private func nativeOnboardingInstallPhaseForRuntimeAction(_ action: String) -> ChillClawDeployPhase {
    switch action {
    case "apply-update", "stage-update":
        return .updating
    default:
        return .installing
    }
}

func nativeOnboardingInstallProgressForRuntimeResource(
    resourceID: String,
    action: String,
    percent: Int?,
    message: String
) -> NativeOnboardingInstallProgressSnapshot? {
    guard let range = nativeOnboardingRuntimeInstallProgressRange(resourceID: resourceID) else {
        return nil
    }

    let runtimePercent = min(max(Double(percent ?? 55), 0), 100)
    let scaledPercent = (range.start + runtimePercent / 100 * (range.end - range.start)).rounded()
    return .init(
        phase: nativeOnboardingInstallPhaseForRuntimeAction(action),
        percent: scaledPercent,
        message: message
    )
}

func mergeNativeOnboardingInstallProgress(
    current: NativeOnboardingInstallProgressSnapshot,
    phase: ChillClawDeployPhase,
    percent: Double?,
    message: String?
) -> NativeOnboardingInstallProgressSnapshot {
    let resolvedPercent = percent ?? nativeOnboardingInstallProgressFallback(phase)
    let nextPercent = max(current.percent ?? 0, resolvedPercent)
    return .init(phase: phase, percent: nextPercent, message: message)
}

func advanceNativeOnboardingInstallProgress(
    _ progress: NativeOnboardingInstallProgressSnapshot
) -> NativeOnboardingInstallProgressSnapshot {
    let basePercent = progress.percent ?? nativeOnboardingInstallProgressFallback(progress.phase)
    let ceiling = nativeOnboardingInstallProgressCeiling(progress.phase)
    let nextPercent = min(basePercent + nativeOnboardingInstallProgressAnimationStep(progress.phase), ceiling)
    return .init(phase: progress.phase, percent: nextPercent, message: progress.message)
}

private func nativeOnboardingInstallStageLabel(
    progress: NativeOnboardingInstallProgressSnapshot?,
    copy: NativeOnboardingCopy
) -> String {
    if let message = progress?.message?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty {
        return message
    }

    switch progress?.phase {
    case .some(.reusing):
        return copy.installStageReusing
    case .some(.installing), .some(.updating), .some(.uninstalling):
        return copy.installStageInstalling
    case .some(.verifying):
        return copy.installStageVerifying
    case .some(.restartingGateway):
        return copy.installStageRestarting
    case .some(.detecting), .none:
        return copy.installStageDetecting
    }
}

func resolveNativeOnboardingInstallViewState(
    overview: ProductOverview?,
    install: OnboardingInstallState?,
    busy: Bool,
    progress: NativeOnboardingInstallProgressSnapshot?,
    copy: NativeOnboardingCopy
) -> NativeOnboardingInstallViewState {
    if busy {
        let percent = min(max(progress?.percent ?? nativeOnboardingInstallProgressFallback(progress?.phase), 8), 96)
        return .init(
            kind: .installing,
            version: nil,
            progressPercent: percent,
            stageLabel: nativeOnboardingInstallStageLabel(progress: progress, copy: copy),
            isUpdating: progress?.phase == .updating
        )
    }

    if install?.installed == true {
        return .init(
            kind: .complete,
            version: install?.version ?? overview?.engine.version,
            progressPercent: nil,
            stageLabel: nil,
            isUpdating: false
        )
    }

    if overview?.engine.installed == true {
        return .init(
            kind: .found,
            version: overview?.engine.version,
            progressPercent: nil,
            stageLabel: nil,
            isUpdating: false
        )
    }

    return .init(
        kind: .missing,
        version: overview?.engine.version,
        progressPercent: nil,
        stageLabel: nil,
        isUpdating: false
    )
}

func resolveNativeOnboardingModelViewState(
    providerId: String,
    methodId: String,
    modelKey: String,
    providers: [NativeResolvedOnboardingModelProvider],
    selectedEntry: SavedModelEntry?,
    draftEntryID: String?,
    summaryEntryID: String?,
    activeModelAuthSessionId: String?
) -> NativeOnboardingModelViewState {
    guard let provider = providers.first(where: { $0.id == providerId }) else {
        return .init(kind: .picker, provider: nil, entry: nil)
    }

    let entryMatchesSelection =
        selectedEntry?.providerId == provider.id &&
        (modelKey.isEmpty || selectedEntry?.modelKey == modelKey) &&
        (methodId.isEmpty || (selectedEntry?.authMethodId ?? "") == methodId)
    let persistedEntryMatches =
        selectedEntry != nil &&
        [draftEntryID, summaryEntryID].contains(where: { entryID in
            guard let entryID, !entryID.isEmpty else { return false }
            return entryID == selectedEntry?.id
        })

    if entryMatchesSelection, persistedEntryMatches, (activeModelAuthSessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .init(kind: .connected, provider: provider, entry: selectedEntry)
    }

    return .init(kind: .configure, provider: provider, entry: selectedEntry)
}

func resolveNativeOnboardingHasManagedModelSelection(
    draftModelEntryID: String?,
    summaryModelEntryID: String?,
    localRuntime: LocalModelRuntimeOverview?
) -> Bool {
    let hasPersistedModel =
        !(draftModelEntryID ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !(summaryModelEntryID ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasActiveLocalRuntimeSelection = localRuntime?.activeInOpenClaw == true
    return hasPersistedModel || hasActiveLocalRuntimeSelection
}

func resolveNativeOnboardingLocalRuntimeConnected(
    draftModelEntryID: String?,
    summaryModelEntryID: String?,
    localRuntime: LocalModelRuntimeOverview?
) -> Bool {
    _ = draftModelEntryID
    _ = summaryModelEntryID
    return localRuntime?.activeInOpenClaw == true
}

func resolveNativeOnboardingModelStepMode(
    bootstrapPending: Bool,
    providerId: String,
    selectedProviderPresent: Bool,
    modelViewKind: NativeOnboardingModelScreenKind,
    activeModelAuthSessionId: String?,
    draftModelEntryID: String?,
    summaryModelEntryID: String?,
    localRuntime: LocalModelRuntimeOverview?
) -> NativeOnboardingModelStepMode {
    let hasManagedModelSelection = resolveNativeOnboardingHasManagedModelSelection(
        draftModelEntryID: draftModelEntryID,
        summaryModelEntryID: summaryModelEntryID,
        localRuntime: localRuntime
    )
    let hasActiveAuthSession = !(activeModelAuthSessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasCloudFlow =
        !providerId.isEmpty ||
        selectedProviderPresent ||
        hasActiveAuthSession ||
        (modelViewKind == .configure && !hasManagedModelSelection)

    if modelViewKind == .connected || resolveNativeOnboardingLocalRuntimeConnected(
        draftModelEntryID: draftModelEntryID,
        summaryModelEntryID: summaryModelEntryID,
        localRuntime: localRuntime
    ) {
        return .connected
    }

    if hasManagedModelSelection || hasActiveAuthSession {
        return .cloudConfig
    }

    if bootstrapPending {
        return .detectingLocal
    }

    if localRuntime?.status == "unchecked" {
        return .detectingLocal
    }

    if localRuntime?.recommendation == "cloud" || localRuntime?.status == "cloud-recommended" {
        return .cloudHandoff
    }

    if localRuntime?.recommendation == "local", localRuntime?.status != "ready" {
        return .localSetup
    }

    if hasCloudFlow {
        return .cloudConfig
    }

    return .cloudConfig
}

func resolveNativeOnboardingLocalSetupProgress(
    mode: NativeOnboardingModelStepMode,
    status: String?
) -> NativeOnboardingLocalSetupProgress {
    if mode == .connected || status == "ready" {
        return .init(currentStep: 4)
    }

    switch status {
    case "installing-runtime":
        return .init(currentStep: 2)
    case "downloading-model":
        return .init(currentStep: 3)
    case "starting-runtime", "configuring-openclaw":
        return .init(currentStep: 4)
    case "idle", "degraded", "failed", "cloud-recommended", "unchecked", nil:
        return .init(currentStep: 1)
    default:
        return .init(currentStep: 1)
    }
}

struct NativeOnboardingLocalModelDownloadInfo: Sendable, Equatable {
    let modelLabel: String?
    let amountLabel: String
    let remainingLabel: String?
    let percentLabel: String?
    let progressPercent: Int?
}

private func trimNativeOnboardingText(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
        return nil
    }

    return trimmed
}

private func nativeOnboardingDownloadMessageIsTechnical(_ value: String?) -> Bool {
    (value ?? "").localizedCaseInsensitiveContains("sha256:")
}

private func formatNativeOnboardingTemplate(
    _ template: String,
    replacements: [String: String]
) -> String {
    replacements.reduce(template) { partialResult, replacement in
        partialResult.replacingOccurrences(of: "{\(replacement.key)}", with: replacement.value)
    }
}

private func formatNativeOnboardingGigabytes(_ bytes: Int, locale: Locale) -> String {
    let gigabytes = (Double(bytes) / 1_000_000_000.0 * 10).rounded() / 10
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = gigabytes.rounded() == gigabytes ? 0 : 1
    formatter.maximumFractionDigits = 1
    let value = formatter.string(from: NSNumber(value: gigabytes)) ?? String(format: "%.1f", gigabytes)
    return "\(value) GB"
}

private func normalizeNativeOnboardingModelLabel(_ modelKey: String?) -> String? {
    guard let trimmed = trimNativeOnboardingText(modelKey) else {
        return nil
    }

    guard let slashIndex = trimmed.firstIndex(of: "/") else {
        return trimmed
    }

    return String(trimmed[trimmed.index(after: slashIndex)...])
}

func describeNativeOnboardingLocalModelDownload(
    localRuntime: LocalModelRuntimeOverview?,
    copy: NativeOnboardingCopy
) -> NativeOnboardingLocalModelDownloadInfo? {
    guard let localRuntime, localRuntime.status == "downloading-model" else {
        return nil
    }

    let modelLabel = normalizeNativeOnboardingModelLabel(localRuntime.chosenModelKey)
    let locale = Locale(identifier: copy.localeIdentifier)
    if let completedBytes = localRuntime.progressCompletedBytes,
       let totalBytes = localRuntime.progressTotalBytes,
       totalBytes > 0,
       completedBytes >= 0
    {
        let clampedCompleted = min(completedBytes, totalBytes)
        let progressPercent = max(0, min(100, localRuntime.progressPercent ?? Int(round((Double(clampedCompleted) / Double(totalBytes)) * 100))))

        return .init(
            modelLabel: modelLabel,
            amountLabel: formatNativeOnboardingTemplate(
                copy.localModelDownloadAmountLabel,
                replacements: [
                    "downloaded": formatNativeOnboardingGigabytes(clampedCompleted, locale: locale),
                    "total": formatNativeOnboardingGigabytes(totalBytes, locale: locale),
                ]
            ),
            remainingLabel: formatNativeOnboardingTemplate(
                copy.localModelDownloadRemainingLabel,
                replacements: [
                    "remaining": formatNativeOnboardingGigabytes(max(totalBytes - clampedCompleted, 0), locale: locale),
                ]
            ),
            percentLabel: formatNativeOnboardingTemplate(
                copy.localModelDownloadPercentLabel,
                replacements: ["percent": String(progressPercent)]
            ),
            progressPercent: progressPercent
        )
    }

    let fallbackMessage =
        trimNativeOnboardingText(localRuntime.progressMessage) ??
        (nativeOnboardingDownloadMessageIsTechnical(localRuntime.detail) ? nil : trimNativeOnboardingText(localRuntime.detail)) ??
        (nativeOnboardingDownloadMessageIsTechnical(localRuntime.summary) ? nil : trimNativeOnboardingText(localRuntime.summary)) ??
        copy.localModelDownloadStepLabel

    return .init(
        modelLabel: modelLabel,
        amountLabel: fallbackMessage,
        remainingLabel: nil,
        percentLabel: nil,
        progressPercent: nil
    )
}

func resolveNativeOnboardingModelSetupVariant(providerID: String, methodKind: String?) -> NativeOnboardingModelSetupVariant {
    if methodKind == "oauth" {
        return .oauth
    }

    if providerID == "minimax", methodKind == "api-key" {
        return .guidedMiniMaxAPIKey
    }

    return .defaultAPIKey
}

func shouldShowNativeOnboardingAuthMethodChooser(_ methods: [ModelAuthMethod]) -> Bool {
    methods.count > 1
}

func requiredModelFieldsMissing(_ method: ModelAuthMethod?, values: [String: String]) -> Bool {
    guard let method else { return true }
    return method.fields.contains { field in
        field.required && (values[field.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct NativeOnboardingHighlight: Sendable {
    let title: String
    let body: String
}

struct NativeOnboardingCopy: Sendable {
    let localeIdentifier: String
    let brand: String
    let subtitle: String
    let skip: String
    let skipDetail: String
    let progressStep: String
    let progressComplete: String
    let stepLabels: [String]
    let welcomeEyebrow: String
    let welcomeTitle: String
    let welcomeBody: String
    let welcomeHighlights: [NativeOnboardingHighlight]
    let welcomeSupport: String
    let welcomeTiming: String
    let begin: String
    let installTitle: String
    let installBody: String
    let installDetected: String
    let installMissing: String
    let installCta: String
    let installUseExisting: String
    let installContinue: String
    let installSuccess: String
    let installFoundTitle: String
    let installFoundBody: String
    let installNotFoundTitle: String
    let installNotFoundBody: String
    let installInstallingTitle: String
    let installInstallingBody: String
    let installUpdatingTitle: String
    let installUpdatingBody: String
    let installCompleteTitle: String
    let installCompleteBody: String
    let installVersionLabel: String
    let installUpdateAvailable: String
    let installUpdateCta: String
    let installStageDetecting: String
    let installStageReusing: String
    let installStageInstalling: String
    let installStageVerifying: String
    let installStageRestarting: String
    let back: String
    let next: String
    let modelTitle: String
    let modelBody: String
    let localModelSetupTitle: String
    let localModelSetupBody: String
    let localModelDetectingTitle: String
    let localModelDetectingBody: String
    let localModelUnsupportedTitle: String
    let localModelUnsupportedBody: String
    let localModelUnsupportedCloudBody: String
    let localModelCloudFallbackCountdown: String
    let localModelDetectStepLabel: String
    let localModelPrepareStepLabel: String
    let localModelDownloadStepLabel: String
    let localModelConnectStepLabel: String
    let localModelDownloadAmountLabel: String
    let localModelDownloadRemainingLabel: String
    let localModelDownloadPercentLabel: String
    let localModelDownloadResumeNote: String
    let providerTitle: String
    let authTitle: String
    let authApiKeyLabel: String
    let authApiKeyBody: String
    let authOAuthLabel: String
    let authOAuthBody: String
    let minimaxTutorialTitle: String
    let minimaxTutorialBody: String
    let minimaxTutorialModalTitle: String
    let minimaxTutorialModalBody: String
    let minimaxTutorialFallbackTitle: String
    let minimaxTutorialFallbackBody: String
    let minimaxTutorialClose: String
    let minimaxGetKeyTitle: String
    let minimaxGetKeyBody: String
    let minimaxGetKeyCTA: String
    let minimaxEnterKeyTitle: String
    let minimaxEnterKeyBody: String
    let authProgressTitle: String
    let openAuthWindow: String
    let submitAuthInput: String
    let modelApiKeyTitle: String
    let modelApiKeyPlaceholder: String
    let modelApiKeyHelp: String
    let modelGetApiKey: String
    let modelSave: String
    let modelSaved: String
    let modelConnectedTitle: String
    let modelConnectedBody: String
    let chooseProvider: String
    let channelTitle: String
    let channelBody: String
    let channelPickerHint: String
    let channelSave: String
    let channelSaveContinue: String
    let channelSessionSubmitInput: String
    let channelWechatPairingCode: String
    let channelWechatApprovePairing: String
    let channelWechatStartLogin: String
    let channelWechatStartingLogin: String
    let channelWechatWaitingForQR: String
    let channelWechatWaitingForConfirmation: String
    let channelWechatRestartLogin: String
    let channelSaved: String
    let channelApplyHint: String
    let channelTutorialTitle: String
    let channelTutorialBody: String
    let channelTutorialModalTitle: String
    let channelTutorialModalBody: String
    let channelTutorialFallbackTitle: String
    let channelTutorialFallbackBody: String
    let channelTutorialClose: String
    let channelDocumentationCta: String
    let channelPlatformCta: String
    let channelWechatInstructionsTitle: String
    let channelWechatInstructionSteps: [String]
    let channelWechatCorpId: String
    let channelWechatAgentId: String
    let channelWechatSecret: String
    let channelTelegramInstructionsTitle: String
    let channelTelegramInstructionSteps: [String]
    let channelTelegramToken: String
    let channelFeishuTutorialTitle: String
    let channelFeishuTutorialBody: String
    let channelFeishuPlatformTitle: String
    let channelFeishuPlatformBody: String
    let channelFeishuCredentialsTitle: String
    let channelFeishuCredentialsBody: String
    let channelFeishuAppId: String
    let channelFeishuAppSecret: String
    let channelSecretHelp: String
    let chooseChannel: String
    let employeeTitle: String
    let employeeBody: String
    let employeeName: String
    let employeeRole: String
    let employeePreview: String
    let chooseAvatar: String
    let personalityTitle: String
    let skillsTitle: String
    let createEmployee: String
    let employeeSaved: String
    let memoryOn: String
    let memoryOff: String
    let completeTitle: String
    let completeBody: String
    let completionInstall: String
    let completionModel: String
    let completionChannel: String
    let completionEmployee: String
    let goTeam: String
    let goDashboard: String
    let goChat: String
    let loading: String
    let saving: String
    let required: String
    let pendingApplyTitle: String
}

private enum NativeSupportedLocale: String {
    case en
    case zh
    case ja
    case ko
    case es
}

func resolveNativeOnboardingLocaleIdentifier(_ localeIdentifier: String? = nil) -> String {
    let preferred =
        localeIdentifier ??
        UserDefaults.standard.string(forKey: nativeOnboardingLocaleDefaultsKey) ??
        Locale.preferredLanguages.first ??
        "en"
    let normalized = String(preferred.prefix(2))
    return nativeOnboardingLocaleOptions.contains(where: { $0.id == normalized }) ? normalized : "en"
}

func persistNativeOnboardingLocaleIdentifier(_ localeIdentifier: String) {
    UserDefaults.standard.set(resolveNativeOnboardingLocaleIdentifier(localeIdentifier), forKey: nativeOnboardingLocaleDefaultsKey)
}

func formatNativeOnboardingProgressStep(_ template: String, current: Int, total: Int) -> String {
    template
        .replacingOccurrences(of: "{current}", with: String(current))
        .replacingOccurrences(of: "{total}", with: String(total))
}

func nativeOnboardingCopy(localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()) -> NativeOnboardingCopy {
    let locale = NativeSupportedLocale(rawValue: resolveNativeOnboardingLocaleIdentifier(localeIdentifier)) ?? .en

    switch locale {
    case .zh:
        return .init(
            localeIdentifier: "zh",
            brand: "ChillClaw",
            subtitle: "几分钟内搭建你的 OpenClaw 数字员工工作区",
            skip: "跳过引导",
            skipDetail: "立即前往仪表盘，稍后可在配置中完成剩余设置。",
            progressStep: "第 {current} / {total} 步",
            progressComplete: "已完成",
            stepLabels: ["欢迎", "安装", "模型", "渠道", "AI 员工"],
            welcomeEyebrow: "开始使用",
            welcomeTitle: "欢迎来到 ChillClaw",
            welcomeBody: "几分钟内搭建你的 OpenClaw 数字员工工作区",
            welcomeHighlights: [
                .init(title: "一键完成设置", body: "无需终端命令或复杂技术配置，几分钟内启动 ChillClaw。"),
                .init(title: "个人 AI 工作区", body: "选择合适模型、整理技能，并为你的数字员工准备工作区。"),
                .init(title: "创建第一位数字员工", body: "创建一个具备名字、角色和技能的 AI 搭档，支持你的日常工作。"),
            ],
            welcomeSupport: "一个工作区，多位数字员工，为现代超级个体打造。",
            welcomeTiming: "大约需要 3–5 分钟。随后你将开始创建第一位数字员工。",
            begin: "开始准备我的工作区",
            installTitle: "安装 OpenClaw",
            installBody: "我们会检查 OpenClaw 是否已安装，并为你完成设置",
            installDetected: "ChillClaw 已在这台 Mac 上发现兼容的 OpenClaw 运行时。",
            installMissing: "ChillClaw 还未发现 OpenClaw 运行时，将为当前用户安装最新可用版本。",
            installCta: "安装 OpenClaw",
            installUseExisting: "使用现有 OpenClaw",
            installContinue: "下一步",
            installSuccess: "OpenClaw 已就绪，继续配置模型。",
            installFoundTitle: "已检测到兼容的 OpenClaw",
            installFoundBody: "这台 Mac 已经准备好 OpenClaw，ChillClaw 可以直接继续使用它。",
            installNotFoundTitle: "未找到 OpenClaw",
            installNotFoundBody: "别担心！我们只需几次点击就能帮你安装完成。",
            installInstallingTitle: "正在安装 OpenClaw...",
            installInstallingBody: "这大约需要 2–3 分钟。请不要关闭此窗口。",
            installUpdatingTitle: "正在更新 OpenClaw...",
            installUpdatingBody: "ChillClaw 正在下载并应用最新可用版本。请不要关闭此窗口。",
            installCompleteTitle: "安装完成！",
            installCompleteBody: "OpenClaw 已安装完毕，可以开始设置",
            installVersionLabel: "版本",
            installUpdateAvailable: "有可用更新：{version}",
            installUpdateCta: "更新 OpenClaw",
            installStageDetecting: "正在检查这台 Mac...",
            installStageReusing: "正在复用现有运行时...",
            installStageInstalling: "正在安装 OpenClaw...",
            installStageVerifying: "正在配置服务...",
            installStageRestarting: "正在启动本地服务...",
            back: "返回",
            next: "继续",
            modelTitle: "选择你的 AI 模型",
            modelBody: "选择一个 AI 供应商，为你的数字员工提供能力支持",
            localModelSetupTitle: "检测硬件并设置本地模型",
            localModelSetupBody: "我们会检查你的硬件并安装本地 AI 模型",
            localModelDetectingTitle: "正在检测硬件...",
            localModelDetectingBody: "正在分析你的系统是否适合运行本地 AI 模型",
            localModelUnsupportedTitle: "不建议使用本地模型",
            localModelUnsupportedBody: "你的硬件尚未达到流畅运行本地 AI 模型的最低要求。",
            localModelUnsupportedCloudBody: "别担心！你仍然可以改用强大的云端 AI。",
            localModelCloudFallbackCountdown: "将在 2 秒后切换到云端 AI 配置...",
            localModelDetectStepLabel: "检测硬件",
            localModelPrepareStepLabel: "准备 Ollama",
            localModelDownloadStepLabel: "下载本地模型",
            localModelConnectStepLabel: "将 ChillClaw 连接到本地 AI",
            localModelDownloadAmountLabel: "已下载 {downloaded} / {total}",
            localModelDownloadRemainingLabel: "剩余 {remaining}",
            localModelDownloadPercentLabel: "已完成 {percent}%",
            localModelDownloadResumeNote: "你可以离开此页面。如果下载中断，ChillClaw 会自动继续。",
            providerTitle: "选择一个供应商开始",
            authTitle: "你希望如何连接？",
            authApiKeyLabel: "API Key",
            authApiKeyBody: "使用 API Key 快速完成设置",
            authOAuthLabel: "OAuth",
            authOAuthBody: "使用你的账户安全连接",
            minimaxTutorialTitle: "观看教学视频",
            minimaxTutorialBody: "2 分钟内学会如何获取 API Key",
            minimaxTutorialModalTitle: "如何获取你的 API Key",
            minimaxTutorialModalBody: "观看这个快速教程",
            minimaxTutorialFallbackTitle: "视频教程即将上线",
            minimaxTutorialFallbackBody: "现在请先点击“获取 API Key”按钮访问供应商平台",
            minimaxTutorialClose: "知道了，继续",
            minimaxGetKeyTitle: "获取你的 API Key",
            minimaxGetKeyBody: "点击下面的按钮访问 MiniMax",
            minimaxGetKeyCTA: "前往 MiniMax",
            minimaxEnterKeyTitle: "在这里输入你的 API Key",
            minimaxEnterKeyBody: "粘贴你刚刚复制的 API Key",
            authProgressTitle: "认证进度",
            openAuthWindow: "打开认证窗口",
            submitAuthInput: "完成认证",
            modelApiKeyTitle: "输入你的 API Key",
            modelApiKeyPlaceholder: "在此粘贴你的 API Key",
            modelApiKeyHelp: "你的密钥会被加密并安全存储",
            modelGetApiKey: "获取 API Key",
            modelSave: "下一步",
            modelSaved: "首个 AI 模型已保存为默认引导模型。",
            modelConnectedTitle: "连接成功！",
            modelConnectedBody: "已连接到 {provider}",
            chooseProvider: "请先选择供应商",
            channelTitle: "选择沟通渠道",
            channelBody: "选择你希望如何与数字员工交流",
            channelPickerHint: "选择一个渠道开始",
            channelSave: "保存渠道",
            channelSaveContinue: "保存并继续",
            channelSessionSubmitInput: "提交会话输入",
            channelWechatPairingCode: "配对码",
            channelWechatApprovePairing: "批准配对",
            channelWechatStartLogin: "开始微信登录",
            channelWechatStartingLogin: "正在启动微信登录",
            channelWechatWaitingForQR: "正在等待二维码",
            channelWechatWaitingForConfirmation: "正在等待微信确认",
            channelWechatRestartLogin: "重新开始微信登录",
            channelSaved: "渠道配置已保存。",
            channelApplyHint: "该渠道已正确保存，待网关应用挂起变更后即可生效。",
            channelTutorialTitle: "观看教学视频",
            channelTutorialBody: "几分钟内学会如何配置这个渠道",
            channelTutorialModalTitle: "如何配置这个渠道",
            channelTutorialModalBody: "观看这个快速教程",
            channelTutorialFallbackTitle: "视频教程即将上线",
            channelTutorialFallbackBody: "现在请先使用下面的按钮打开平台或文档继续完成配置。",
            channelTutorialClose: "知道了，继续",
            channelDocumentationCta: "打开文档",
            channelPlatformCta: "前往设置",
            channelWechatInstructionsTitle: "企业微信配置说明",
            channelWechatInstructionSteps: [
                "访问企业微信管理后台：前往 https://work.weixin.qq.com 并使用管理员账户登录",
                "创建新应用：导航至“应用管理”→“应用”→“创建应用”",
                "配置应用：填写应用名称并上传图标",
                "获取 API 凭证：从应用设置中复制您的企业 ID、应用 ID 和 Secret",
            ],
            channelWechatCorpId: "Corp ID",
            channelWechatAgentId: "Bot ID",
            channelWechatSecret: "Secret",
            channelTelegramInstructionsTitle: "Telegram 配置说明",
            channelTelegramInstructionSteps: [
                "打开 Telegram 并找到 BotFather：在 Telegram 中搜索 @BotFather 并开始聊天",
                "创建新机器人：发送 /newbot 并按照提示为你的机器人命名",
                "获取机器人令牌：BotFather 会给你一个 token，格式类似 123456:ABC-DEF...",
            ],
            channelTelegramToken: "Bot Token",
            channelFeishuTutorialTitle: "观看教学视频",
            channelFeishuTutorialBody: "3 分钟内学会如何配置飞书",
            channelFeishuPlatformTitle: "开始配置",
            channelFeishuPlatformBody: "前往飞书并创建你的应用凭证",
            channelFeishuCredentialsTitle: "输入你的凭证",
            channelFeishuCredentialsBody: "粘贴你刚刚复制的 App ID 和 App Secret",
            channelFeishuAppId: "App ID",
            channelFeishuAppSecret: "App Secret",
            channelSecretHelp: "你的凭证会被加密并存储在本地",
            chooseChannel: "请先选择渠道",
            employeeTitle: "创建第一个 AI 员工",
            employeeBody: "选择头像、角色和预设技能。ChillClaw 会在后台创建真实的 OpenClaw agent 工作区。",
            employeeName: "员工名称",
            employeeRole: "职位名称",
            employeePreview: "员工预览",
            chooseAvatar: "选择头像",
            personalityTitle: "人格特征",
            skillsTitle: "预设技能组合",
            createEmployee: "创建 AI 员工",
            employeeSaved: "首位 AI 员工已准备就绪。",
            memoryOn: "已启用记忆",
            memoryOff: "已关闭记忆",
            completeTitle: "你的工作区已准备完成",
            completeBody: "ChillClaw 已完成引导设置。选择你接下来想去的页面。",
            completionInstall: "OpenClaw",
            completionModel: "模型",
            completionChannel: "渠道",
            completionEmployee: "AI 员工",
            goTeam: "进入 AI Team",
            goDashboard: "进入 Dashboard",
            goChat: "进入 Chat",
            loading: "正在加载引导流程",
            saving: "正在保存",
            required: "必填",
            pendingApplyTitle: "待应用网关变更"
        )
    case .ja:
        return .init(
            localeIdentifier: "ja",
            brand: "ChillClaw",
            subtitle: "数分で OpenClaw ベースのデジタル従業員ワークスペースを構築します",
            skip: "オンボーディングをスキップ",
            skipDetail: "今すぐダッシュボードへ進み、残りの設定はあとで構成画面から完了できます。",
            progressStep: "ステップ {current} / {total}",
            progressComplete: "完了",
            stepLabels: ["開始", "インストール", "モデル", "チャネル", "AI 社員"],
            welcomeEyebrow: "スタート",
            welcomeTitle: "ChillClaw へようこそ",
            welcomeBody: "数分で OpenClaw ベースのデジタル従業員ワークスペースを構築します",
            welcomeHighlights: [
                .init(title: "ワンクリックでセットアップ", body: "ターミナル操作や高度な技術設定なしで、数分で ChillClaw を開始できます。"),
                .init(title: "個人用 AI ワークスペース", body: "最適なモデルを選び、スキルを整理し、デジタル従業員用のワークスペースを整えます。"),
                .init(title: "最初のデジタル従業員を作成", body: "名前、役割、スキルを持つ AI チームメイトを作り、日々の仕事を支援させます。"),
            ],
            welcomeSupport: "ひとつのワークスペース。複数のデジタル従業員。現代のスーパーインディビジュアルのために。",
            welcomeTiming: "所要時間は約 3〜5 分です。その後、最初のデジタル従業員の作成に進みます。",
            begin: "ワークスペースの準備を始める",
            installTitle: "OpenClaw をインストール",
            installBody: "OpenClaw がインストール済みか確認し、必要なセットアップを行います",
            installDetected: "この Mac には既に互換性のある OpenClaw ランタイムがあります。",
            installMissing: "まだ OpenClaw ランタイムが見つかっていません。現在のユーザー向けに最新バージョンをインストールします。",
            installCta: "OpenClaw をインストール",
            installUseExisting: "既存の OpenClaw を使う",
            installContinue: "次へ",
            installSuccess: "OpenClaw の準備ができました。モデル設定へ進みます。",
            installFoundTitle: "互換性のある OpenClaw を検出しました",
            installFoundBody: "この Mac には OpenClaw がすでに用意されています。ChillClaw はそのまま使い続けられます。",
            installNotFoundTitle: "OpenClaw が見つかりません",
            installNotFoundBody: "ご安心ください。数回のクリックでインストールできます。",
            installInstallingTitle: "OpenClaw をインストールしています...",
            installInstallingBody: "2〜3 分ほどかかります。このウィンドウは閉じないでください。",
            installUpdatingTitle: "OpenClaw を更新しています...",
            installUpdatingBody: "ChillClaw が最新の利用可能バージョンをダウンロードして適用しています。このウィンドウは閉じないでください。",
            installCompleteTitle: "インストール完了！",
            installCompleteBody: "OpenClaw のインストールが完了し、セットアップを開始できます",
            installVersionLabel: "バージョン",
            installUpdateAvailable: "利用可能なアップデート: {version}",
            installUpdateCta: "OpenClaw を更新",
            installStageDetecting: "この Mac を確認しています...",
            installStageReusing: "既存のランタイムを再利用しています...",
            installStageInstalling: "OpenClaw をインストールしています...",
            installStageVerifying: "サービスを設定しています...",
            installStageRestarting: "ローカルサービスを起動しています...",
            back: "戻る",
            next: "次へ",
            modelTitle: "AI モデルを選択",
            modelBody: "デジタル従業員を支える AI プロバイダーを選択してください",
            localModelSetupTitle: "ハードウェアを検出してローカルモデルを設定",
            localModelSetupBody: "ハードウェアを確認し、ローカル AI モデルをインストールします",
            localModelDetectingTitle: "ハードウェアを検出しています...",
            localModelDetectingBody: "ローカル AI モデルを動かせるかシステム性能を確認しています",
            localModelUnsupportedTitle: "ローカルモデルは非推奨です",
            localModelUnsupportedBody: "この Mac はローカル AI モデルを快適に動かすための最低要件を満たしていません。",
            localModelUnsupportedCloudBody: "ご安心ください。代わりにクラウド AI を利用できます。",
            localModelCloudFallbackCountdown: "2 秒後にクラウド AI の設定へ切り替えます...",
            localModelDetectStepLabel: "ハードウェアを検出",
            localModelPrepareStepLabel: "Ollama を準備",
            localModelDownloadStepLabel: "ローカルモデルをダウンロード",
            localModelConnectStepLabel: "ChillClaw をローカル AI に接続",
            localModelDownloadAmountLabel: "{downloaded} / {total} をダウンロード済み",
            localModelDownloadRemainingLabel: "残り {remaining}",
            localModelDownloadPercentLabel: "{percent}% 完了",
            localModelDownloadResumeNote: "この画面を離れても大丈夫です。ダウンロードが中断しても、ChillClaw が自動で再開します。",
            providerTitle: "開始するプロバイダーを選択",
            authTitle: "どの方法で接続しますか？",
            authApiKeyLabel: "API Key",
            authApiKeyBody: "API Key を使ってすばやくセットアップ",
            authOAuthLabel: "OAuth",
            authOAuthBody: "アカウントで安全に接続",
            minimaxTutorialTitle: "チュートリアル動画を見る",
            minimaxTutorialBody: "2 分で API Key の取得方法を確認できます",
            minimaxTutorialModalTitle: "API Key の取得方法",
            minimaxTutorialModalBody: "このクイックチュートリアルをご覧ください",
            minimaxTutorialFallbackTitle: "動画チュートリアルは準備中です",
            minimaxTutorialFallbackBody: "今は「API Key を取得」ボタンからプロバイダーのサイトへ進んでください",
            minimaxTutorialClose: "了解して続行",
            minimaxGetKeyTitle: "API Key を取得する",
            minimaxGetKeyBody: "下のボタンから MiniMax にアクセスしてください",
            minimaxGetKeyCTA: "MiniMax に移動",
            minimaxEnterKeyTitle: "ここに API Key を入力",
            minimaxEnterKeyBody: "先ほどコピーした API Key を貼り付けてください",
            authProgressTitle: "認証の進行状況",
            openAuthWindow: "認証ウィンドウを開く",
            submitAuthInput: "認証を完了",
            modelApiKeyTitle: "API Key を入力",
            modelApiKeyPlaceholder: "ここに API Key を貼り付け",
            modelApiKeyHelp: "キーは暗号化され安全に保存されます",
            modelGetApiKey: "API Key を取得",
            modelSave: "次へ",
            modelSaved: "最初の AI モデルはオンボーディングの既定モデルとして保存されました。",
            modelConnectedTitle: "接続に成功しました！",
            modelConnectedBody: "{provider} に接続しました",
            chooseProvider: "先にプロバイダーを選択してください",
            channelTitle: "コミュニケーションチャネルを選択",
            channelBody: "デジタル従業員と会話する方法を選択します",
            channelPickerHint: "開始するチャネルを選択してください",
            channelSave: "チャネルを保存",
            channelSaveContinue: "保存して続行",
            channelSessionSubmitInput: "セッション入力を送信",
            channelWechatPairingCode: "ペアリングコード",
            channelWechatApprovePairing: "ペアリングを承認",
            channelWechatStartLogin: "WeChat ログインを開始",
            channelWechatStartingLogin: "WeChat ログインを開始しています",
            channelWechatWaitingForQR: "QRコードを待機中",
            channelWechatWaitingForConfirmation: "WeChat の確認を待機中",
            channelWechatRestartLogin: "WeChat ログインをやり直す",
            channelSaved: "チャネル設定を保存しました。",
            channelApplyHint: "このチャネル設定は保存済みです。保留中の変更をゲートウェイに適用すると有効になります。",
            channelTutorialTitle: "チュートリアル動画を見る",
            channelTutorialBody: "このチャネルの設定方法を数分で学びます",
            channelTutorialModalTitle: "このチャネルの設定方法",
            channelTutorialModalBody: "このクイックチュートリアルをご覧ください",
            channelTutorialFallbackTitle: "動画チュートリアルは準備中です",
            channelTutorialFallbackBody: "今は下のボタンからプラットフォームまたはドキュメントを開いてください。",
            channelTutorialClose: "了解、続けます",
            channelDocumentationCta: "ドキュメントを開く",
            channelPlatformCta: "セットアップを開く",
            channelWechatInstructionsTitle: "WeChat Work のセットアップ手順",
            channelWechatInstructionSteps: [
                "WeChat Work 管理コンソール https://work.weixin.qq.com/ を開き、管理者アカウントでログインします。",
                "アプリ管理 → アプリ → 新しいアプリを作成 を選びます。",
                "アプリ名とアイコンを設定します。",
                "設定画面から Corp ID、Agent ID、Secret をコピーします。",
            ],
            channelWechatCorpId: "Corp ID",
            channelWechatAgentId: "Bot ID",
            channelWechatSecret: "Secret",
            channelTelegramInstructionsTitle: "Telegram のセットアップ手順",
            channelTelegramInstructionSteps: [
                "Telegram を開いて @BotFather を検索し、チャットを開始します。",
                "/newbot を送信して新しいボットを作成します。",
                "BotFather から発行されたトークンをコピーします。",
            ],
            channelTelegramToken: "Bot Token",
            channelFeishuTutorialTitle: "チュートリアル動画を見る",
            channelFeishuTutorialBody: "3 分で Feishu のセットアップを学びます",
            channelFeishuPlatformTitle: "セットアップ開始",
            channelFeishuPlatformBody: "Feishu に移動してアプリ資格情報を作成します",
            channelFeishuCredentialsTitle: "資格情報を入力",
            channelFeishuCredentialsBody: "コピーした App ID と App Secret を貼り付けます",
            channelFeishuAppId: "App ID",
            channelFeishuAppSecret: "App Secret",
            channelSecretHelp: "資格情報は暗号化されてローカルに保存されます",
            chooseChannel: "先にチャネルを選択してください",
            employeeTitle: "最初の AI 社員を作成",
            employeeBody: "アバター、役割、プリセットスキルを選択します。ChillClaw が実際の OpenClaw エージェントを作成します。",
            employeeName: "社員名",
            employeeRole: "役職",
            employeePreview: "社員プレビュー",
            chooseAvatar: "アバターを選択",
            personalityTitle: "性格",
            skillsTitle: "プリセットスキルセット",
            createEmployee: "AI 社員を作成",
            employeeSaved: "最初の AI 社員の準備ができました。",
            memoryOn: "記憶を有効",
            memoryOff: "記憶を無効",
            completeTitle: "ワークスペースの準備ができました",
            completeBody: "ChillClaw のガイド設定が完了しました。次に進む先を選んでください。",
            completionInstall: "OpenClaw",
            completionModel: "モデル",
            completionChannel: "チャネル",
            completionEmployee: "AI 社員",
            goTeam: "AI Team を開く",
            goDashboard: "Dashboard を開く",
            goChat: "Chat を開く",
            loading: "オンボーディングを読み込み中",
            saving: "保存中",
            required: "必須",
            pendingApplyTitle: "ゲートウェイへの反映待ち"
        )
    case .ko:
        return .init(
            localeIdentifier: "ko",
            brand: "ChillClaw",
            subtitle: "몇 분 안에 OpenClaw 기반 디지털 직원 작업 공간을 만드세요",
            skip: "온보딩 건너뛰기",
            skipDetail: "지금 대시보드로 이동하고, 남은 설정은 나중에 구성 화면에서 마무리하세요.",
            progressStep: "{current}/{total}단계",
            progressComplete: "완료",
            stepLabels: ["시작", "설치", "모델", "채널", "AI 직원"],
            welcomeEyebrow: "시작하기",
            welcomeTitle: "ChillClaw에 오신 것을 환영합니다",
            welcomeBody: "몇 분 안에 OpenClaw 기반 디지털 직원 작업 공간을 만드세요",
            welcomeHighlights: [
                .init(title: "원클릭 설정", body: "터미널 명령이나 복잡한 기술 설정 없이 몇 분 안에 ChillClaw를 시작합니다."),
                .init(title: "개인 AI 작업 공간", body: "적절한 모델을 선택하고, 스킬을 정리하고, 디지털 직원용 작업 공간을 준비하세요."),
                .init(title: "첫 디지털 직원 만들기", body: "이름, 역할, 스킬을 갖춘 AI 팀원을 만들어 일상 업무를 지원하게 하세요."),
            ],
            welcomeSupport: "하나의 작업 공간. 여러 디지털 직원. 현대의 슈퍼 개인을 위해 설계되었습니다.",
            welcomeTiming: "약 3~5분 정도 걸립니다. 그다음 첫 디지털 직원을 만들게 됩니다.",
            begin: "내 작업 공간 준비하기",
            installTitle: "OpenClaw 설치",
            installBody: "OpenClaw가 설치되어 있는지 확인하고 필요한 설정을 진행합니다",
            installDetected: "이 Mac에서 이미 호환되는 OpenClaw 런타임을 찾았습니다.",
            installMissing: "아직 OpenClaw 런타임이 없습니다. 현재 사용자용 최신 버전을 설치합니다.",
            installCta: "OpenClaw 설치",
            installUseExisting: "기존 OpenClaw 사용",
            installContinue: "다음",
            installSuccess: "OpenClaw가 준비되었습니다. 모델 설정으로 계속합니다.",
            installFoundTitle: "호환되는 OpenClaw를 찾았습니다",
            installFoundBody: "이 Mac에는 이미 OpenClaw가 준비되어 있습니다. ChillClaw가 그대로 사용할 수 있습니다.",
            installNotFoundTitle: "OpenClaw를 찾을 수 없습니다",
            installNotFoundBody: "걱정하지 마세요. 몇 번의 클릭만으로 설치해 드립니다.",
            installInstallingTitle: "OpenClaw 설치 중...",
            installInstallingBody: "2~3분 정도 걸립니다. 이 창을 닫지 마세요.",
            installUpdatingTitle: "OpenClaw 업데이트 중...",
            installUpdatingBody: "ChillClaw가 최신 사용 가능 버전을 내려받아 적용하고 있습니다. 이 창을 닫지 마세요.",
            installCompleteTitle: "설치 완료!",
            installCompleteBody: "OpenClaw 설치가 완료되어 설정을 시작할 수 있습니다",
            installVersionLabel: "버전",
            installUpdateAvailable: "사용 가능한 업데이트: {version}",
            installUpdateCta: "OpenClaw 업데이트",
            installStageDetecting: "이 Mac을 확인하는 중...",
            installStageReusing: "기존 런타임을 재사용하는 중...",
            installStageInstalling: "OpenClaw를 설치하는 중...",
            installStageVerifying: "서비스를 구성하는 중...",
            installStageRestarting: "로컬 서비스를 시작하는 중...",
            back: "뒤로",
            next: "다음",
            modelTitle: "AI 모델 선택",
            modelBody: "디지털 직원에 사용할 AI 제공자를 선택하세요",
            localModelSetupTitle: "하드웨어를 감지하고 로컬 모델 설정",
            localModelSetupBody: "하드웨어를 확인하고 로컬 AI 모델을 설치합니다",
            localModelDetectingTitle: "하드웨어를 감지하는 중...",
            localModelDetectingBody: "로컬 AI 모델을 실행할 수 있는지 시스템 성능을 분석하고 있습니다",
            localModelUnsupportedTitle: "로컬 모델은 권장되지 않습니다",
            localModelUnsupportedBody: "이 Mac은 로컬 AI 모델을 원활하게 실행하기 위한 최소 요구 사항을 충족하지 못합니다.",
            localModelUnsupportedCloudBody: "걱정하지 마세요. 대신 강력한 클라우드 AI를 사용할 수 있습니다.",
            localModelCloudFallbackCountdown: "2초 후 클라우드 AI 설정으로 전환합니다...",
            localModelDetectStepLabel: "하드웨어 감지",
            localModelPrepareStepLabel: "Ollama 준비",
            localModelDownloadStepLabel: "로컬 모델 다운로드",
            localModelConnectStepLabel: "ChillClaw를 로컬 AI에 연결",
            localModelDownloadAmountLabel: "{downloaded} / {total} 다운로드됨",
            localModelDownloadRemainingLabel: "{remaining} 남음",
            localModelDownloadPercentLabel: "{percent}% 완료",
            localModelDownloadResumeNote: "이 화면을 떠나도 됩니다. 다운로드가 중단되면 ChillClaw가 자동으로 이어받습니다.",
            providerTitle: "시작할 제공자를 선택하세요",
            authTitle: "어떻게 연결하시겠어요?",
            authApiKeyLabel: "API Key",
            authApiKeyBody: "API Key로 빠르게 설정",
            authOAuthLabel: "OAuth",
            authOAuthBody: "계정으로 안전하게 연결",
            minimaxTutorialTitle: "튜토리얼 영상 보기",
            minimaxTutorialBody: "2분 안에 API Key를 얻는 방법을 알아보세요",
            minimaxTutorialModalTitle: "API Key 받는 방법",
            minimaxTutorialModalBody: "이 짧은 튜토리얼을 확인하세요",
            minimaxTutorialFallbackTitle: "동영상 튜토리얼 준비 중",
            minimaxTutorialFallbackBody: "지금은 \"API Key 받기\" 버튼을 눌러 공급자 사이트로 이동해 주세요",
            minimaxTutorialClose: "확인했고 계속할게요",
            minimaxGetKeyTitle: "API Key 받기",
            minimaxGetKeyBody: "아래 버튼을 눌러 MiniMax로 이동하세요",
            minimaxGetKeyCTA: "MiniMax로 이동",
            minimaxEnterKeyTitle: "여기에 API Key를 입력하세요",
            minimaxEnterKeyBody: "방금 복사한 API Key를 붙여넣으세요",
            authProgressTitle: "인증 진행 상황",
            openAuthWindow: "인증 창 열기",
            submitAuthInput: "인증 완료",
            modelApiKeyTitle: "API Key 입력",
            modelApiKeyPlaceholder: "여기에 API Key를 붙여 넣으세요",
            modelApiKeyHelp: "키는 암호화되어 안전하게 저장됩니다",
            modelGetApiKey: "API Key 받기",
            modelSave: "다음",
            modelSaved: "첫 AI 모델이 온보딩 기본 모델로 저장되었습니다.",
            modelConnectedTitle: "연결되었습니다!",
            modelConnectedBody: "{provider}에 연결됨",
            chooseProvider: "먼저 공급자를 선택하세요",
            channelTitle: "커뮤니케이션 채널 선택",
            channelBody: "디지털 직원과 대화할 방법을 선택하세요",
            channelPickerHint: "시작할 채널을 선택하세요",
            channelSave: "채널 저장",
            channelSaveContinue: "저장 후 계속",
            channelSessionSubmitInput: "세션 입력 제출",
            channelWechatPairingCode: "페어링 코드",
            channelWechatApprovePairing: "페어링 승인",
            channelWechatStartLogin: "WeChat 로그인 시작",
            channelWechatStartingLogin: "WeChat 로그인 시작 중",
            channelWechatWaitingForQR: "QR 코드 대기 중",
            channelWechatWaitingForConfirmation: "WeChat 확인 대기 중",
            channelWechatRestartLogin: "WeChat 로그인 다시 시작",
            channelSaved: "채널 구성이 저장되었습니다.",
            channelApplyHint: "이 채널은 올바르게 저장되었습니다. 게이트웨이가 대기 중인 변경을 적용하면 활성화됩니다.",
            channelTutorialTitle: "튜토리얼 영상 보기",
            channelTutorialBody: "이 채널 설정 방법을 몇 분 안에 배웁니다",
            channelTutorialModalTitle: "이 채널 설정 방법",
            channelTutorialModalBody: "빠른 튜토리얼을 확인하세요",
            channelTutorialFallbackTitle: "영상 튜토리얼 준비 중",
            channelTutorialFallbackBody: "지금은 아래 버튼으로 플랫폼 또는 문서를 열어 설정을 계속하세요.",
            channelTutorialClose: "확인, 계속",
            channelDocumentationCta: "문서 열기",
            channelPlatformCta: "설정 열기",
            channelWechatInstructionsTitle: "WeChat Work 설정 안내",
            channelWechatInstructionSteps: [
                "WeChat Work 관리 콘솔 https://work.weixin.qq.com/ 에서 관리자 계정으로 로그인하세요.",
                "애플리케이션 관리 → 애플리케이션 → 새 애플리케이션 생성으로 이동하세요.",
                "앱 이름과 아이콘을 설정하세요.",
                "설정에서 Corp ID, Agent ID, Secret을 복사하세요.",
            ],
            channelWechatCorpId: "Corp ID",
            channelWechatAgentId: "Bot ID",
            channelWechatSecret: "Secret",
            channelTelegramInstructionsTitle: "Telegram 설정 안내",
            channelTelegramInstructionSteps: [
                "Telegram에서 @BotFather를 찾아 채팅을 시작하세요.",
                "/newbot 을 보내 새 봇을 만드세요.",
                "BotFather가 제공한 토큰을 복사하세요.",
            ],
            channelTelegramToken: "Bot Token",
            channelFeishuTutorialTitle: "튜토리얼 영상 보기",
            channelFeishuTutorialBody: "3분 안에 Feishu 설정 방법을 배웁니다",
            channelFeishuPlatformTitle: "설정 시작",
            channelFeishuPlatformBody: "Feishu로 이동해 앱 자격 증명을 만드세요",
            channelFeishuCredentialsTitle: "자격 증명 입력",
            channelFeishuCredentialsBody: "복사한 App ID 와 App Secret 을 붙여넣으세요",
            channelFeishuAppId: "App ID",
            channelFeishuAppSecret: "App Secret",
            channelSecretHelp: "자격 증명은 암호화되어 로컬에 저장됩니다",
            chooseChannel: "먼저 채널을 선택하세요",
            employeeTitle: "첫 AI 직원 만들기",
            employeeBody: "아바타, 역할, 프리셋 스킬을 선택합니다. ChillClaw가 실제 OpenClaw 에이전트를 생성합니다.",
            employeeName: "직원 이름",
            employeeRole: "직무명",
            employeePreview: "직원 미리보기",
            chooseAvatar: "아바타 선택",
            personalityTitle: "성격",
            skillsTitle: "프리셋 스킬 세트",
            createEmployee: "AI 직원 만들기",
            employeeSaved: "첫 AI 직원이 준비되었습니다.",
            memoryOn: "메모리 활성화",
            memoryOff: "메모리 비활성화",
            completeTitle: "작업공간이 준비되었습니다",
            completeBody: "ChillClaw 가이드 설정이 완료되었습니다. 다음에 갈 곳을 선택하세요.",
            completionInstall: "OpenClaw",
            completionModel: "모델",
            completionChannel: "채널",
            completionEmployee: "AI 직원",
            goTeam: "AI Team 열기",
            goDashboard: "Dashboard 열기",
            goChat: "Chat 열기",
            loading: "온보딩 불러오는 중",
            saving: "저장 중",
            required: "필수",
            pendingApplyTitle: "게이트웨이 적용 대기 중"
        )
    case .es:
        return .init(
            localeIdentifier: "es",
            brand: "ChillClaw",
            subtitle: "Construye en minutos tu espacio de trabajo de empleados digitales impulsado por OpenClaw",
            skip: "Omitir onboarding",
            skipDetail: "Ve al panel ahora y termina el resto de la configuración más tarde desde Configuración.",
            progressStep: "Paso {current} de {total}",
            progressComplete: "Completado",
            stepLabels: ["Inicio", "Instalar", "Modelo", "Canal", "Empleado IA"],
            welcomeEyebrow: "Comenzar",
            welcomeTitle: "Bienvenido a ChillClaw",
            welcomeBody: "Construye en minutos tu espacio de trabajo de empleados digitales impulsado por OpenClaw",
            welcomeHighlights: [
                .init(title: "Configuración con un clic", body: "Inicia ChillClaw en minutos sin comandos de terminal ni configuración técnica compleja."),
                .init(title: "Espacio de trabajo personal con IA", body: "Elige el modelo adecuado, organiza habilidades y prepara un espacio para tus empleados digitales."),
                .init(title: "Crea tu primer empleado digital", body: "Crea un compañero de IA con nombre, rol y habilidades para apoyar tu trabajo diario."),
            ],
            welcomeSupport: "Un solo espacio de trabajo. Múltiples empleados digitales. Diseñado para superindividuos modernos.",
            welcomeTiming: "Tarda entre 3 y 5 minutos. Después comenzarás a crear tu primer empleado digital.",
            begin: "Preparar mi espacio de trabajo",
            installTitle: "Instalar OpenClaw",
            installBody: "Comprobaremos si OpenClaw ya está instalado y lo configuraremos por ti",
            installDetected: "ChillClaw ya encontró un runtime compatible de OpenClaw en este Mac.",
            installMissing: "ChillClaw aún no encontró un runtime de OpenClaw. Instalará la versión más reciente disponible para este usuario.",
            installCta: "Instalar OpenClaw",
            installUseExisting: "Usar OpenClaw existente",
            installContinue: "Siguiente",
            installSuccess: "OpenClaw está listo. Continúa con la configuración del modelo.",
            installFoundTitle: "Se detectó un OpenClaw compatible",
            installFoundBody: "Este Mac ya tiene OpenClaw listo. ChillClaw puede seguir usándolo.",
            installNotFoundTitle: "OpenClaw no encontrado",
            installNotFoundBody: "No te preocupes. Lo instalaremos por ti en solo unos clics.",
            installInstallingTitle: "Instalando OpenClaw...",
            installInstallingBody: "Esto tardará 2–3 minutos. No cierres esta ventana.",
            installUpdatingTitle: "Actualizando OpenClaw...",
            installUpdatingBody: "ChillClaw está descargando y aplicando la última versión disponible. No cierres esta ventana.",
            installCompleteTitle: "¡Instalación completa!",
            installCompleteBody: "OpenClaw está instalado y listo para configurarse",
            installVersionLabel: "Versión",
            installUpdateAvailable: "Actualización disponible: {version}",
            installUpdateCta: "Actualizar OpenClaw",
            installStageDetecting: "Comprobando este Mac...",
            installStageReusing: "Reutilizando el runtime existente...",
            installStageInstalling: "Instalando OpenClaw...",
            installStageVerifying: "Configurando servicios...",
            installStageRestarting: "Iniciando servicios locales...",
            back: "Atrás",
            next: "Siguiente",
            modelTitle: "Elige tu modelo de IA",
            modelBody: "Selecciona un proveedor de IA para impulsar a tus empleados digitales",
            localModelSetupTitle: "Detectar hardware y configurar modelo local",
            localModelSetupBody: "Comprobaremos tu hardware e instalaremos un modelo local de IA",
            localModelDetectingTitle: "Detectando hardware...",
            localModelDetectingBody: "Analizando si tu sistema puede ejecutar modelos locales de IA",
            localModelUnsupportedTitle: "No se recomienda el modelo local",
            localModelUnsupportedBody: "Tu hardware no cumple los requisitos mínimos para ejecutar modelos locales de IA con fluidez.",
            localModelUnsupportedCloudBody: "No te preocupes. En su lugar puedes usar una potente IA en la nube.",
            localModelCloudFallbackCountdown: "Cambiando a la configuración de IA en la nube en 2 segundos...",
            localModelDetectStepLabel: "Detectar hardware",
            localModelPrepareStepLabel: "Preparar Ollama",
            localModelDownloadStepLabel: "Descargar modelo local",
            localModelConnectStepLabel: "Conectar ChillClaw a la IA local",
            localModelDownloadAmountLabel: "{downloaded} de {total} descargados",
            localModelDownloadRemainingLabel: "{remaining} restantes",
            localModelDownloadPercentLabel: "{percent}% completado",
            localModelDownloadResumeNote: "Puedes salir de esta pantalla. ChillClaw reanudará la descarga automáticamente si se interrumpe.",
            providerTitle: "Selecciona un proveedor para empezar",
            authTitle: "¿Cómo te gustaría conectarte?",
            authApiKeyLabel: "API Key",
            authApiKeyBody: "Usa tu API key para una configuración rápida",
            authOAuthLabel: "OAuth",
            authOAuthBody: "Conéctate de forma segura con tu cuenta",
            minimaxTutorialTitle: "Ver video tutorial",
            minimaxTutorialBody: "Aprende a obtener tu API Key en 2 minutos",
            minimaxTutorialModalTitle: "Cómo obtener tu API Key",
            minimaxTutorialModalBody: "Mira este tutorial rápido",
            minimaxTutorialFallbackTitle: "Tutorial en video próximamente",
            minimaxTutorialFallbackBody: "Por ahora, pulsa \"Obtener API Key\" para visitar el sitio del proveedor",
            minimaxTutorialClose: "Entendido, continuar",
            minimaxGetKeyTitle: "Obtén tu API Key",
            minimaxGetKeyBody: "Haz clic en el botón de abajo para visitar MiniMax",
            minimaxGetKeyCTA: "Ir a MiniMax",
            minimaxEnterKeyTitle: "Introduce aquí tu API Key",
            minimaxEnterKeyBody: "Pega la API Key que acabas de copiar",
            authProgressTitle: "Progreso de autenticación",
            openAuthWindow: "Abrir ventana de autenticación",
            submitAuthInput: "Finalizar autenticación",
            modelApiKeyTitle: "Introduce tu API Key",
            modelApiKeyPlaceholder: "Pega tu API key aquí",
            modelApiKeyHelp: "Tu clave se cifra y almacena de forma segura",
            modelGetApiKey: "Obtener API Key",
            modelSave: "Siguiente",
            modelSaved: "Tu primer modelo IA se guardó como modelo predeterminado del onboarding.",
            modelConnectedTitle: "¡Conexión exitosa!",
            modelConnectedBody: "Conectado a {provider}",
            chooseProvider: "Primero elige un proveedor",
            channelTitle: "Elige un canal de comunicación",
            channelBody: "Selecciona cómo quieres hablar con tus empleados digitales",
            channelPickerHint: "Selecciona un canal para empezar",
            channelSave: "Guardar canal",
            channelSaveContinue: "Guardar y continuar",
            channelSessionSubmitInput: "Enviar entrada de sesión",
            channelWechatPairingCode: "Código de emparejamiento",
            channelWechatApprovePairing: "Aprobar emparejamiento",
            channelWechatStartLogin: "Iniciar inicio de sesión en WeChat",
            channelWechatStartingLogin: "Iniciando inicio de sesión en WeChat",
            channelWechatWaitingForQR: "Esperando el código QR",
            channelWechatWaitingForConfirmation: "Esperando la confirmación en WeChat",
            channelWechatRestartLogin: "Reiniciar inicio de sesión en WeChat",
            channelSaved: "Configuración del canal guardada.",
            channelApplyHint: "Este canal quedó guardado correctamente y se activará cuando el gateway aplique los cambios pendientes.",
            channelTutorialTitle: "Ver video tutorial",
            channelTutorialBody: "Aprende a configurar este canal en pocos minutos",
            channelTutorialModalTitle: "Cómo configurar este canal",
            channelTutorialModalBody: "Mira este tutorial rápido",
            channelTutorialFallbackTitle: "Video tutorial próximamente",
            channelTutorialFallbackBody: "Por ahora, abre la plataforma o la documentación con el botón de abajo.",
            channelTutorialClose: "Entendido, continuar",
            channelDocumentationCta: "Abrir documentación",
            channelPlatformCta: "Abrir configuración",
            channelWechatInstructionsTitle: "Instrucciones para WeChat Work",
            channelWechatInstructionSteps: [
                "Abre la consola de administración de WeChat Work en https://work.weixin.qq.com/ e inicia sesión como administrador.",
                "Ve a Administración de aplicaciones → Aplicaciones → Crear aplicación.",
                "Configura el nombre de la aplicación y su icono.",
                "Copia el Corp ID, Agent ID y Secret desde la configuración.",
            ],
            channelWechatCorpId: "Corp ID",
            channelWechatAgentId: "Bot ID",
            channelWechatSecret: "Secret",
            channelTelegramInstructionsTitle: "Instrucciones para Telegram",
            channelTelegramInstructionSteps: [
                "Abre Telegram y busca @BotFather.",
                "Envía /newbot para crear un nuevo bot.",
                "Copia el token que te entregue BotFather.",
            ],
            channelTelegramToken: "Bot Token",
            channelFeishuTutorialTitle: "Ver video tutorial",
            channelFeishuTutorialBody: "Aprende a configurar Feishu en 3 minutos",
            channelFeishuPlatformTitle: "Iniciar configuración",
            channelFeishuPlatformBody: "Ve a Feishu y crea las credenciales de tu app",
            channelFeishuCredentialsTitle: "Introduce tus credenciales",
            channelFeishuCredentialsBody: "Pega el App ID y el App Secret que acabas de copiar",
            channelFeishuAppId: "App ID",
            channelFeishuAppSecret: "App Secret",
            channelSecretHelp: "Tus credenciales se cifran y se guardan localmente",
            chooseChannel: "Primero elige un canal",
            employeeTitle: "Crea tu primer empleado IA",
            employeeBody: "Elige un avatar, rol y habilidades predeterminadas. ChillClaw crea un espacio real de agente OpenClaw detrás de este empleado.",
            employeeName: "Nombre del empleado",
            employeeRole: "Puesto",
            employeePreview: "Vista previa del empleado",
            chooseAvatar: "Elegir avatar",
            personalityTitle: "Personalidad",
            skillsTitle: "Conjuntos de habilidades predefinidos",
            createEmployee: "Crear empleado IA",
            employeeSaved: "Tu primer empleado IA está listo.",
            memoryOn: "Memoria activada",
            memoryOff: "Memoria desactivada",
            completeTitle: "Tu espacio de trabajo está listo",
            completeBody: "ChillClaw terminó la configuración guiada. Elige a dónde quieres ir ahora.",
            completionInstall: "OpenClaw",
            completionModel: "Modelo",
            completionChannel: "Canal",
            completionEmployee: "Empleado IA",
            goTeam: "Abrir AI Team",
            goDashboard: "Abrir Dashboard",
            goChat: "Abrir Chat",
            loading: "Cargando onboarding",
            saving: "Guardando",
            required: "Obligatorio",
            pendingApplyTitle: "Aplicación del gateway pendiente"
        )
    case .en:
        return .init(
            localeIdentifier: "en",
            brand: "ChillClaw",
            subtitle: "Build your OpenClaw-powered digital employee workspace in minutes",
            skip: "Skip onboarding",
            skipDetail: "Go to the Dashboard now and finish the remaining setup later in Configuration.",
            progressStep: "Step {current} of {total}",
            progressComplete: "Complete",
            stepLabels: ["Welcome", "Install", "Model", "Channel", "AI Employee"],
            welcomeEyebrow: "Get started",
            welcomeTitle: "Welcome to ChillClaw",
            welcomeBody: "Build your OpenClaw-powered digital employee workspace in minutes",
            welcomeHighlights: [
                .init(title: "One-Click Setup", body: "Start ChillClaw in minutes with no terminal commands or technical configuration."),
                .init(title: "Personal AI Workspace", body: "Choose the right model, organize skills, and prepare a workspace for your digital employees."),
                .init(title: "Build Your First Digital Employee", body: "Create an AI teammate with a name, role, and skills to support your daily work."),
            ],
            welcomeSupport: "One workspace. Multiple digital employees. Built for modern super individuals.",
            welcomeTiming: "Takes about 3–5 minutes. Then you'll start creating your first digital employee.",
            begin: "Get My Workspace Ready",
            installTitle: "Install OpenClaw",
            installBody: "We'll check if OpenClaw is installed and set it up for you",
            installDetected: "ChillClaw already found a compatible OpenClaw runtime on this Mac.",
            installMissing: "ChillClaw did not find an OpenClaw runtime yet. It will install the latest available version for this user.",
            installCta: "Install OpenClaw",
            installUseExisting: "Use existing OpenClaw",
            installContinue: "Next",
            installSuccess: "OpenClaw is ready. Continue to model setup.",
            installFoundTitle: "Compatible OpenClaw detected",
            installFoundBody: "This Mac already has OpenClaw ready. ChillClaw can keep using it.",
            installNotFoundTitle: "OpenClaw Not Found",
            installNotFoundBody: "Don't worry! We'll install it for you in just a few clicks.",
            installInstallingTitle: "Installing OpenClaw...",
            installInstallingBody: "This will take 2–3 minutes. Please don't close this window.",
            installUpdatingTitle: "Updating OpenClaw...",
            installUpdatingBody: "ChillClaw is downloading and applying the latest available version. Please keep this window open.",
            installCompleteTitle: "Installation Complete!",
            installCompleteBody: "OpenClaw is installed and ready for setup",
            installVersionLabel: "Version",
            installUpdateAvailable: "Update available: {version}",
            installUpdateCta: "Update OpenClaw",
            installStageDetecting: "Checking this Mac...",
            installStageReusing: "Reusing existing runtime...",
            installStageInstalling: "Installing OpenClaw...",
            installStageVerifying: "Configuring services...",
            installStageRestarting: "Starting local services...",
            back: "Back",
            next: "Next",
            modelTitle: "Choose Your AI Model",
            modelBody: "Select an AI provider to power your digital employees",
            localModelSetupTitle: "Detect Hardware & Setup Local Model",
            localModelSetupBody: "We'll check your hardware and install a local AI model",
            localModelDetectingTitle: "Detecting Hardware...",
            localModelDetectingBody: "Analyzing your system's capabilities for local AI models",
            localModelUnsupportedTitle: "Local Model Not Recommended",
            localModelUnsupportedBody: "Your hardware doesn't meet the minimum requirements for running local AI models smoothly.",
            localModelUnsupportedCloudBody: "Don't worry! You can use powerful cloud AI instead.",
            localModelCloudFallbackCountdown: "Switching to cloud AI configuration in 2 seconds...",
            localModelDetectStepLabel: "Detect hardware",
            localModelPrepareStepLabel: "Prepare Ollama",
            localModelDownloadStepLabel: "Download local model",
            localModelConnectStepLabel: "Connect ChillClaw to local AI",
            localModelDownloadAmountLabel: "{downloaded} of {total} downloaded",
            localModelDownloadRemainingLabel: "{remaining} remaining",
            localModelDownloadPercentLabel: "{percent}% complete",
            localModelDownloadResumeNote: "You can leave this screen. ChillClaw will resume automatically if the download is interrupted.",
            providerTitle: "Select a provider to get started",
            authTitle: "How would you like to connect?",
            authApiKeyLabel: "API Key",
            authApiKeyBody: "Use your API key for quick setup",
            authOAuthLabel: "OAuth",
            authOAuthBody: "Connect securely with your account",
            minimaxTutorialTitle: "Watch Tutorial Video",
            minimaxTutorialBody: "Learn how to get your API Key in 2 minutes",
            minimaxTutorialModalTitle: "How to Get Your API Key",
            minimaxTutorialModalBody: "Watch this quick tutorial",
            minimaxTutorialFallbackTitle: "Video Tutorial Coming Soon",
            minimaxTutorialFallbackBody: "For now, click \"Get API Key\" button to visit the provider's website",
            minimaxTutorialClose: "Got it, let's continue",
            minimaxGetKeyTitle: "Get Your API Key",
            minimaxGetKeyBody: "Click the button below to visit MiniMax",
            minimaxGetKeyCTA: "Go to MiniMax",
            minimaxEnterKeyTitle: "Enter Your API Key Here",
            minimaxEnterKeyBody: "Paste the API Key you just copied",
            authProgressTitle: "Authentication progress",
            openAuthWindow: "Open authentication window",
            submitAuthInput: "Finish authentication",
            modelApiKeyTitle: "Enter your API Key",
            modelApiKeyPlaceholder: "Paste your API key here",
            modelApiKeyHelp: "Your key is encrypted and stored securely",
            modelGetApiKey: "Get API Key",
            modelSave: "Next",
            modelSaved: "Your first AI model is saved as the default onboarding model.",
            modelConnectedTitle: "Connected successfully!",
            modelConnectedBody: "Connected to {provider}",
            chooseProvider: "Choose a provider first",
            channelTitle: "Choose Communication Channel",
            channelBody: "Select how you want to talk to your digital employees",
            channelPickerHint: "Select a channel to get started",
            channelSave: "Save channel",
            channelSaveContinue: "Save & Continue",
            channelSessionSubmitInput: "Submit Session Input",
            channelWechatPairingCode: "Pairing Code",
            channelWechatApprovePairing: "Approve Pairing",
            channelWechatStartLogin: "Start WeChat Login",
            channelWechatStartingLogin: "Starting WeChat Login",
            channelWechatWaitingForQR: "Waiting for QR Code",
            channelWechatWaitingForConfirmation: "Waiting for WeChat confirmation",
            channelWechatRestartLogin: "Restart WeChat Login",
            channelSaved: "Channel configuration saved.",
            channelApplyHint: "This channel is saved correctly and will become live after the gateway applies pending changes.",
            channelTutorialTitle: "Watch Tutorial Video",
            channelTutorialBody: "Learn how to set up this channel in a few minutes",
            channelTutorialModalTitle: "How to Set Up This Channel",
            channelTutorialModalBody: "Watch this quick tutorial",
            channelTutorialFallbackTitle: "Video Tutorial Coming Soon",
            channelTutorialFallbackBody: "For now, use the setup button below to open the provider platform or documentation.",
            channelTutorialClose: "Got it, let's continue",
            channelDocumentationCta: "Open Documentation",
            channelPlatformCta: "Open Setup",
            channelWechatInstructionsTitle: "Setup Instructions for WeChat Work",
            channelWechatInstructionSteps: [
                "Visit the WeChat Work admin console: https://work.weixin.qq.com/ and sign in with an admin account.",
                "Create an app: open Application Management → Applications → Create Application.",
                "Configure the app: set the application name and upload the icon.",
                "Copy your credentials: save the Corp ID, Agent ID, and Secret from the application settings.",
            ],
            channelWechatCorpId: "Corp ID",
            channelWechatAgentId: "Bot ID",
            channelWechatSecret: "Secret",
            channelTelegramInstructionsTitle: "Setup Instructions for Telegram",
            channelTelegramInstructionSteps: [
                "Open Telegram and start a chat with @BotFather.",
                "Create a new bot by sending /newbot and follow the prompts.",
                "Copy the bot token from BotFather. It looks like 123456:ABC-DEF...",
            ],
            channelTelegramToken: "Bot Token",
            channelFeishuTutorialTitle: "Watch Tutorial Video",
            channelFeishuTutorialBody: "Learn how to set up Feishu in 3 minutes",
            channelFeishuPlatformTitle: "Start Setup",
            channelFeishuPlatformBody: "Go to Feishu and create your app credentials",
            channelFeishuCredentialsTitle: "Enter Your Credentials",
            channelFeishuCredentialsBody: "Paste the App ID and App Secret you just copied",
            channelFeishuAppId: "App ID",
            channelFeishuAppSecret: "App Secret",
            channelSecretHelp: "Your credentials are encrypted and stored locally",
            chooseChannel: "Choose a channel first",
            employeeTitle: "Create your first AI employee",
            employeeBody: "Choose an avatar, role, and preset skills. ChillClaw creates a real OpenClaw agent workspace behind this employee.",
            employeeName: "Employee name",
            employeeRole: "Job title",
            employeePreview: "Employee preview",
            chooseAvatar: "Choose avatar",
            personalityTitle: "Personality",
            skillsTitle: "Preset skill sets",
            createEmployee: "Create AI employee",
            employeeSaved: "Your first AI employee is ready.",
            memoryOn: "Memory enabled",
            memoryOff: "Memory disabled",
            completeTitle: "Your workspace is ready",
            completeBody: "ChillClaw finished the guided setup. Choose where you want to go next.",
            completionInstall: "OpenClaw",
            completionModel: "Model",
            completionChannel: "Channel",
            completionEmployee: "AI employee",
            goTeam: "Open AI Team",
            goDashboard: "Open Dashboard",
            goChat: "Open Chat",
            loading: "Loading onboarding",
            saving: "Saving",
            required: "Required",
            pendingApplyTitle: "Gateway apply pending"
        )
    }
}

func onboardingAssetURL(_ presetId: String) -> URL? {
    let preset = resolveOnboardingAvatarPreset(presetId)

    return nativeBundledResourceURL(forResource: preset.resourceName, withExtensions: ["png", "jpg", "jpeg"])
}

func onboardingAssetImage(_ presetId: String) -> Image? {
#if canImport(AppKit)
    guard let url = onboardingAssetURL(presetId) else {
        return nil
    }

    if let image = NSImage(contentsOf: url) {
        return Image(nsImage: image)
    }

    guard let data = try? Data(contentsOf: url), let image = NSImage(data: data) else {
        return nil
    }
    return Image(nsImage: image)
#else
    return nil
#endif
}
