import Foundation

public enum AppServiceMode: String, Codable, Sendable {
    case launchagent
    case adhoc
    case unmanaged
}

public struct FirstRunState: Codable, Sendable {
    public var introCompleted: Bool
    public var setupCompleted: Bool
    public var selectedProfileId: String?

    public init(introCompleted: Bool, setupCompleted: Bool, selectedProfileId: String? = nil) {
        self.introCompleted = introCompleted
        self.setupCompleted = setupCompleted
        self.selectedProfileId = selectedProfileId
    }
}

public struct RevisionedSnapshot<Payload: Codable & Sendable>: Codable, Sendable {
    public var epoch: String
    public var revision: Int
    public var data: Payload

    public init(epoch: String, revision: Int, data: Payload) {
        self.epoch = epoch
        self.revision = revision
        self.data = data
    }
}

public enum OnboardingStep: String, Codable, Sendable {
    case welcome
    case install
    case permissions
    case model
    case channel
    case employee
}

public enum OnboardingDestination: String, Codable, Sendable {
    case team
    case dashboard
    case chat
}

public enum SupportedChannelId: String, Codable, Sendable {
    case telegram
    case whatsapp
    case feishu
    case wechatWork = "wechat-work"
    case wechat
}

public enum OnboardingChannelTheme: String, Codable, Sendable {
    case wechatWork = "wechat-work"
    case wechat
    case feishu
    case telegram
}

public enum OnboardingChannelSetupKind: String, Codable, Sendable {
    case wechatWorkGuided = "wechat-work-guided"
    case wechatGuided = "wechat-guided"
    case feishuGuided = "feishu-guided"
    case telegramGuided = "telegram-guided"
}

public struct OnboardingInstallState: Codable, Sendable {
    public var installed: Bool
    public var version: String?
    public var disposition: String?
    public var updateAvailable: Bool?
    public var latestVersion: String?
    public var updateSummary: String?

    public init(
        installed: Bool,
        version: String? = nil,
        disposition: String? = nil,
        updateAvailable: Bool? = nil,
        latestVersion: String? = nil,
        updateSummary: String? = nil
    ) {
        self.installed = installed
        self.version = version
        self.disposition = disposition
        self.updateAvailable = updateAvailable
        self.latestVersion = latestVersion
        self.updateSummary = updateSummary
    }
}

public struct OnboardingPermissionsState: Codable, Sendable {
    public var confirmed: Bool
    public var confirmedAt: String?

    public init(confirmed: Bool, confirmedAt: String? = nil) {
        self.confirmed = confirmed
        self.confirmedAt = confirmedAt
    }
}

public struct OnboardingModelState: Codable, Sendable {
    public var providerId: String
    public var modelKey: String
    public var methodId: String?
    public var entryId: String?

    public init(providerId: String, modelKey: String, methodId: String? = nil, entryId: String? = nil) {
        self.providerId = providerId
        self.modelKey = modelKey
        self.methodId = methodId
        self.entryId = entryId
    }
}

public struct OnboardingChannelState: Codable, Sendable {
    public var channelId: SupportedChannelId
    public var entryId: String?

    public init(channelId: SupportedChannelId, entryId: String? = nil) {
        self.channelId = channelId
        self.entryId = entryId
    }
}

public enum OnboardingChannelProgressStatus: String, Codable, Sendable {
    case idle
    case capturing
    case staged
}

public struct OnboardingChannelProgressState: Codable, Sendable {
    public var status: OnboardingChannelProgressStatus
    public var sessionId: String?
    public var message: String?
    public var requiresGatewayApply: Bool?

    public init(
        status: OnboardingChannelProgressStatus,
        sessionId: String? = nil,
        message: String? = nil,
        requiresGatewayApply: Bool? = nil
    ) {
        self.status = status
        self.sessionId = sessionId
        self.message = message
        self.requiresGatewayApply = requiresGatewayApply
    }
}

public struct OnboardingEmployeeState: Codable, Sendable {
    public var memberId: String?
    public var name: String
    public var jobTitle: String
    public var avatarPresetId: String
    public var presetId: String?
    public var personalityTraits: [String]?
    public var presetSkillIds: [String]?
    public var knowledgePackIds: [String]?
    public var workStyles: [String]?
    public var memoryEnabled: Bool?

    public init(
        memberId: String? = nil,
        name: String,
        jobTitle: String,
        avatarPresetId: String,
        presetId: String? = nil,
        personalityTraits: [String]? = nil,
        presetSkillIds: [String]? = nil,
        knowledgePackIds: [String]? = nil,
        workStyles: [String]? = nil,
        memoryEnabled: Bool? = nil
    ) {
        self.memberId = memberId
        self.name = name
        self.jobTitle = jobTitle
        self.avatarPresetId = avatarPresetId
        self.presetId = presetId
        self.personalityTraits = personalityTraits
        self.presetSkillIds = presetSkillIds
        self.knowledgePackIds = knowledgePackIds
        self.workStyles = workStyles
        self.memoryEnabled = memoryEnabled
    }
}

public struct OnboardingDraftState: Codable, Sendable {
    public var currentStep: OnboardingStep
    public var install: OnboardingInstallState?
    public var permissions: OnboardingPermissionsState?
    public var model: OnboardingModelState?
    public var channel: OnboardingChannelState?
    public var channelProgress: OnboardingChannelProgressState?
    public var employee: OnboardingEmployeeState?
    public var activeModelAuthSessionId: String?
    public var activeChannelSessionId: String?

    public init(
        currentStep: OnboardingStep,
        install: OnboardingInstallState? = nil,
        permissions: OnboardingPermissionsState? = nil,
        model: OnboardingModelState? = nil,
        channel: OnboardingChannelState? = nil,
        channelProgress: OnboardingChannelProgressState? = nil,
        employee: OnboardingEmployeeState? = nil,
        activeModelAuthSessionId: String? = nil,
        activeChannelSessionId: String? = nil
    ) {
        self.currentStep = currentStep
        self.install = install
        self.permissions = permissions
        self.model = model
        self.channel = channel
        self.channelProgress = channelProgress
        self.employee = employee
        self.activeModelAuthSessionId = activeModelAuthSessionId
        self.activeChannelSessionId = activeChannelSessionId
    }
}

public struct OnboardingCompletionSummary: Codable, Sendable {
    public var install: OnboardingInstallState?
    public var model: OnboardingModelState?
    public var channel: OnboardingChannelState?
    public var employee: OnboardingEmployeeState?

    public init(
        install: OnboardingInstallState? = nil,
        model: OnboardingModelState? = nil,
        channel: OnboardingChannelState? = nil,
        employee: OnboardingEmployeeState? = nil
    ) {
        self.install = install
        self.model = model
        self.channel = channel
        self.employee = employee
    }
}

public struct OnboardingModelProviderPresentation: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var theme: String
    public var platformUrl: String
    public var tutorialVideoUrl: String?
    public var defaultModelKey: String
    public var authMethods: [ModelAuthMethod]

    public init(
        id: String,
        label: String,
        description: String,
        theme: String,
        platformUrl: String,
        tutorialVideoUrl: String? = nil,
        defaultModelKey: String,
        authMethods: [ModelAuthMethod]
    ) {
        self.id = id
        self.label = label
        self.description = description
        self.theme = theme
        self.platformUrl = platformUrl
        self.tutorialVideoUrl = tutorialVideoUrl
        self.defaultModelKey = defaultModelKey
        self.authMethods = authMethods
    }
}

public struct OnboardingChannelPresentation: Codable, Sendable, Identifiable {
    public var id: SupportedChannelId
    public var label: String
    public var secondaryLabel: String?
    public var description: String
    public var theme: OnboardingChannelTheme
    public var setupKind: OnboardingChannelSetupKind
    public var platformUrl: String?
    public var docsUrl: String?
    public var tutorialVideoUrl: String?

    public init(
        id: SupportedChannelId,
        label: String,
        secondaryLabel: String? = nil,
        description: String,
        theme: OnboardingChannelTheme,
        setupKind: OnboardingChannelSetupKind,
        platformUrl: String? = nil,
        docsUrl: String? = nil,
        tutorialVideoUrl: String? = nil
    ) {
        self.id = id
        self.label = label
        self.secondaryLabel = secondaryLabel
        self.description = description
        self.theme = theme
        self.setupKind = setupKind
        self.platformUrl = platformUrl
        self.docsUrl = docsUrl
        self.tutorialVideoUrl = tutorialVideoUrl
    }
}

public struct OnboardingEmployeePresetPresentation: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var theme: String
    public var avatarPresetId: String
    public var starterSkillLabels: [String]
    public var toolLabels: [String]
    public var presetSkillIds: [String]?
    public var knowledgePackIds: [String]
    public var workStyles: [String]
    public var defaultMemoryEnabled: Bool?

    public init(
        id: String,
        label: String,
        description: String,
        theme: String,
        avatarPresetId: String,
        starterSkillLabels: [String],
        toolLabels: [String],
        presetSkillIds: [String]? = nil,
        knowledgePackIds: [String],
        workStyles: [String],
        defaultMemoryEnabled: Bool? = nil
    ) {
        self.id = id
        self.label = label
        self.description = description
        self.theme = theme
        self.avatarPresetId = avatarPresetId
        self.starterSkillLabels = starterSkillLabels
        self.toolLabels = toolLabels
        self.presetSkillIds = presetSkillIds
        self.knowledgePackIds = knowledgePackIds
        self.workStyles = workStyles
        self.defaultMemoryEnabled = defaultMemoryEnabled
    }
}

public struct OnboardingUIConfig: Codable, Sendable {
    public var modelProviders: [OnboardingModelProviderPresentation]
    public var channels: [OnboardingChannelPresentation]
    public var employeePresets: [OnboardingEmployeePresetPresentation]

    public init(
        modelProviders: [OnboardingModelProviderPresentation],
        channels: [OnboardingChannelPresentation],
        employeePresets: [OnboardingEmployeePresetPresentation]
    ) {
        self.modelProviders = modelProviders
        self.channels = channels
        self.employeePresets = employeePresets
    }
}

public struct OnboardingStateResponse: Codable, Sendable {
    public var firstRun: FirstRunState
    public var draft: OnboardingDraftState
    public var config: OnboardingUIConfig
    public var summary: OnboardingCompletionSummary
    public var presetSkillSync: PresetSkillSyncOverview?

    public init(
        firstRun: FirstRunState,
        draft: OnboardingDraftState,
        config: OnboardingUIConfig,
        summary: OnboardingCompletionSummary,
        presetSkillSync: PresetSkillSyncOverview? = nil
    ) {
        self.firstRun = firstRun
        self.draft = draft
        self.config = config
        self.summary = summary
        self.presetSkillSync = presetSkillSync
    }
}

public struct CompleteOnboardingResponse: Codable, Sendable {
    public var status: String
    public var destination: OnboardingDestination?
    public var summary: OnboardingCompletionSummary
    public var overview: ProductOverview
    public var warmupTaskId: String?

    public init(
        status: String,
        destination: OnboardingDestination? = nil,
        summary: OnboardingCompletionSummary,
        overview: ProductOverview,
        warmupTaskId: String? = nil
    ) {
        self.status = status
        self.destination = destination
        self.summary = summary
        self.overview = overview
        self.warmupTaskId = warmupTaskId
    }
}

public struct AppServiceStatus: Codable, Sendable {
    public var mode: AppServiceMode
    public var installed: Bool
    public var running: Bool
    public var managedAtLogin: Bool
    public var label: String?
    public var summary: String
    public var detail: String
}

public struct AppUpdateStatus: Codable, Sendable {
    public var status: String
    public var supported: Bool
    public var currentVersion: String
    public var latestVersion: String?
    public var downloadUrl: String?
    public var releaseUrl: String?
    public var publishedAt: String?
    public var checkedAt: String
    public var summary: String
    public var detail: String

    public init(
        status: String,
        supported: Bool,
        currentVersion: String,
        latestVersion: String? = nil,
        downloadUrl: String? = nil,
        releaseUrl: String? = nil,
        publishedAt: String? = nil,
        checkedAt: String,
        summary: String,
        detail: String
    ) {
        self.status = status
        self.supported = supported
        self.currentVersion = currentVersion
        self.latestVersion = latestVersion
        self.downloadUrl = downloadUrl
        self.releaseUrl = releaseUrl
        self.publishedAt = publishedAt
        self.checkedAt = checkedAt
        self.summary = summary
        self.detail = detail
    }

    public static func unsupported(currentVersion: String = "0.0.0") -> AppUpdateStatus {
        AppUpdateStatus(
            status: "unsupported",
            supported: false,
            currentVersion: currentVersion,
            checkedAt: "",
            summary: "App updates are available from the packaged macOS app.",
            detail: "ChillClaw can only check GitHub release updates from the packaged macOS app."
        )
    }
}

public struct EngineStatus: Codable, Sendable {
    public var engine: String
    public var installed: Bool
    public var running: Bool
    public var version: String?
    public var summary: String
    public var pendingGatewayApply: Bool?
    public var pendingGatewayApplySummary: String?
    public var lastCheckedAt: String
}

public struct EngineInstallSpec: Codable, Sendable {
    public var engine: String
    public var desiredVersion: String
    public var installSource: String
    public var prerequisites: [String]
    public var installPath: String?
}

public struct EngineCapabilities: Codable, Sendable {
    public var engine: String
    public var supportsInstall: Bool
    public var supportsUpdate: Bool
    public var supportsRecovery: Bool
    public var supportsStreaming: Bool
    public var runtimeModes: [String]
    public var supportedChannels: [String]
    public var starterSkillCategories: [String]
    public var futureLocalModelFamilies: [String]
}

public struct InstallCheck: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var status: String
    public var detail: String
}

public struct ChannelSetupState: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var officialSupport: Bool
    public var status: String
    public var summary: String
    public var detail: String
    public var lastUpdatedAt: String?
    public var logs: [String]?
}

public struct ChannelSetupOverview: Codable, Sendable {
    public var baseOnboardingCompleted: Bool
    public var channels: [ChannelSetupState]
    public var nextChannelId: String?
    public var gatewayStarted: Bool
    public var gatewaySummary: String
}

public struct UserProfile: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String
    public var defaultTemplateIds: [String]
}

public struct TaskTemplate: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var category: String
    public var description: String
    public var promptHint: String
}

public struct HealthCheckResult: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var severity: String
    public var summary: String
    public var detail: String
    public var remediationActionIds: [String]
}

public struct RecoveryAction: Codable, Sendable, Identifiable {
    public var id: String
    public var type: String
    public var title: String
    public var description: String
    public var safetyLevel: String
    public var expectedImpact: String
}

public struct LocalModelRuntimeOverview: Codable, Sendable {
    public var supported: Bool
    public var recommendation: String
    public var supportCode: String
    public var status: String
    public var runtimeInstalled: Bool
    public var runtimeReachable: Bool
    public var modelDownloaded: Bool
    public var activeInOpenClaw: Bool
    public var recommendedTier: String?
    public var requiredDiskGb: Double?
    public var totalMemoryGb: Double?
    public var freeDiskGb: Double?
    public var chosenModelKey: String?
    public var managedEntryId: String?
    public var summary: String
    public var detail: String
    public var lastError: String?
    public var activeAction: String?
    public var activePhase: String?
    public var progressMessage: String?
    public var progressDigest: String?
    public var progressCompletedBytes: Int?
    public var progressTotalBytes: Int?
    public var progressPercent: Int?
    public var lastProgressAt: String?
    public var recoveryHint: String?

    public init(
        supported: Bool,
        recommendation: String,
        supportCode: String,
        status: String,
        runtimeInstalled: Bool,
        runtimeReachable: Bool,
        modelDownloaded: Bool,
        activeInOpenClaw: Bool,
        recommendedTier: String? = nil,
        requiredDiskGb: Double? = nil,
        totalMemoryGb: Double? = nil,
        freeDiskGb: Double? = nil,
        chosenModelKey: String? = nil,
        managedEntryId: String? = nil,
        summary: String,
        detail: String,
        lastError: String? = nil,
        activeAction: String? = nil,
        activePhase: String? = nil,
        progressMessage: String? = nil,
        progressDigest: String? = nil,
        progressCompletedBytes: Int? = nil,
        progressTotalBytes: Int? = nil,
        progressPercent: Int? = nil,
        lastProgressAt: String? = nil,
        recoveryHint: String? = nil
    ) {
        self.supported = supported
        self.recommendation = recommendation
        self.supportCode = supportCode
        self.status = status
        self.runtimeInstalled = runtimeInstalled
        self.runtimeReachable = runtimeReachable
        self.modelDownloaded = modelDownloaded
        self.activeInOpenClaw = activeInOpenClaw
        self.recommendedTier = recommendedTier
        self.requiredDiskGb = requiredDiskGb
        self.totalMemoryGb = totalMemoryGb
        self.freeDiskGb = freeDiskGb
        self.chosenModelKey = chosenModelKey
        self.managedEntryId = managedEntryId
        self.summary = summary
        self.detail = detail
        self.lastError = lastError
        self.activeAction = activeAction
        self.activePhase = activePhase
        self.progressMessage = progressMessage
        self.progressDigest = progressDigest
        self.progressCompletedBytes = progressCompletedBytes
        self.progressTotalBytes = progressTotalBytes
        self.progressPercent = progressPercent
        self.lastProgressAt = lastProgressAt
        self.recoveryHint = recoveryHint
    }
}

public struct SetupStepResult: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var status: String
    public var detail: String

    public init(id: String, title: String, status: String, detail: String) {
        self.id = id
        self.title = title
        self.status = status
        self.detail = detail
    }
}

public struct EngineTaskStep: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var status: String
}

public struct EngineTaskResult: Codable, Sendable, Identifiable {
    public var taskId: String
    public var title: String
    public var status: String
    public var summary: String
    public var output: String
    public var nextActions: [String]
    public var startedAt: String
    public var finishedAt: String?
    public var steps: [EngineTaskStep]

    public var id: String { taskId }
}

public struct ProductOverview: Codable, Sendable {
    public var appName: String
    public var appVersion: String
    public var platformTarget: String
    public var appUpdate: AppUpdateStatus
    public var firstRun: FirstRunState
    public var appService: AppServiceStatus
    public var engine: EngineStatus
    public var installSpec: EngineInstallSpec
    public var capabilities: EngineCapabilities
    public var installChecks: [InstallCheck]
    public var channelSetup: ChannelSetupOverview
    public var localRuntime: LocalModelRuntimeOverview?
    public var profiles: [UserProfile]
    public var templates: [TaskTemplate]
    public var healthChecks: [HealthCheckResult]
    public var recoveryActions: [RecoveryAction]
    public var recentTasks: [EngineTaskResult]

    public init(
        appName: String,
        appVersion: String,
        platformTarget: String,
        appUpdate: AppUpdateStatus = .unsupported(),
        firstRun: FirstRunState,
        appService: AppServiceStatus,
        engine: EngineStatus,
        installSpec: EngineInstallSpec,
        capabilities: EngineCapabilities,
        installChecks: [InstallCheck],
        channelSetup: ChannelSetupOverview,
        localRuntime: LocalModelRuntimeOverview? = nil,
        profiles: [UserProfile],
        templates: [TaskTemplate],
        healthChecks: [HealthCheckResult],
        recoveryActions: [RecoveryAction],
        recentTasks: [EngineTaskResult]
    ) {
        self.appName = appName
        self.appVersion = appVersion
        self.platformTarget = platformTarget
        self.appUpdate = appUpdate
        self.firstRun = firstRun
        self.appService = appService
        self.engine = engine
        self.installSpec = installSpec
        self.capabilities = capabilities
        self.installChecks = installChecks
        self.channelSetup = channelSetup
        self.localRuntime = localRuntime
        self.profiles = profiles
        self.templates = templates
        self.healthChecks = healthChecks
        self.recoveryActions = recoveryActions
        self.recentTasks = recentTasks
    }

    enum CodingKeys: String, CodingKey {
        case appName
        case appVersion
        case platformTarget
        case appUpdate
        case firstRun
        case appService
        case engine
        case installSpec
        case capabilities
        case installChecks
        case channelSetup
        case localRuntime
        case profiles
        case templates
        case healthChecks
        case recoveryActions
        case recentTasks
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let appName = try container.decode(String.self, forKey: .appName)
        let appVersion = try container.decode(String.self, forKey: .appVersion)

        self.init(
            appName: appName,
            appVersion: appVersion,
            platformTarget: try container.decode(String.self, forKey: .platformTarget),
            appUpdate: try container.decodeIfPresent(AppUpdateStatus.self, forKey: .appUpdate) ?? .unsupported(currentVersion: appVersion),
            firstRun: try container.decode(FirstRunState.self, forKey: .firstRun),
            appService: try container.decode(AppServiceStatus.self, forKey: .appService),
            engine: try container.decode(EngineStatus.self, forKey: .engine),
            installSpec: try container.decode(EngineInstallSpec.self, forKey: .installSpec),
            capabilities: try container.decode(EngineCapabilities.self, forKey: .capabilities),
            installChecks: try container.decode([InstallCheck].self, forKey: .installChecks),
            channelSetup: try container.decode(ChannelSetupOverview.self, forKey: .channelSetup),
            localRuntime: try container.decodeIfPresent(LocalModelRuntimeOverview.self, forKey: .localRuntime),
            profiles: try container.decode([UserProfile].self, forKey: .profiles),
            templates: try container.decode([TaskTemplate].self, forKey: .templates),
            healthChecks: try container.decode([HealthCheckResult].self, forKey: .healthChecks),
            recoveryActions: try container.decode([RecoveryAction].self, forKey: .recoveryActions),
            recentTasks: try container.decode([EngineTaskResult].self, forKey: .recentTasks)
        )
    }
}

public struct AppUpdateCheckResponse: Codable, Sendable {
    public var appUpdate: AppUpdateStatus
    public var overview: ProductOverview

    public init(appUpdate: AppUpdateStatus, overview: ProductOverview) {
        self.appUpdate = appUpdate
        self.overview = overview
    }
}

public struct InstallResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var engineStatus: EngineStatus
    public var disposition: String?
    public var changed: Bool?
    public var hadExisting: Bool?
    public var pinnedVersion: String?
    public var existingVersion: String?
    public var actualVersion: String?

    public init(
        status: String,
        message: String,
        engineStatus: EngineStatus,
        disposition: String? = nil,
        changed: Bool? = nil,
        hadExisting: Bool? = nil,
        pinnedVersion: String? = nil,
        existingVersion: String? = nil,
        actualVersion: String? = nil
    ) {
        self.status = status
        self.message = message
        self.engineStatus = engineStatus
        self.disposition = disposition
        self.changed = changed
        self.hadExisting = hadExisting
        self.pinnedVersion = pinnedVersion
        self.existingVersion = existingVersion
        self.actualVersion = actualVersion
    }
}

public struct SetupRunResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var steps: [SetupStepResult]
    public var overview: ProductOverview
    public var install: InstallResponse?
    public var onboarding: OnboardingStateResponse?

    public init(
        status: String,
        message: String,
        steps: [SetupStepResult],
        overview: ProductOverview,
        install: InstallResponse? = nil,
        onboarding: OnboardingStateResponse? = nil
    ) {
        self.status = status
        self.message = message
        self.steps = steps
        self.overview = overview
        self.install = install
        self.onboarding = onboarding
    }
}

public struct DeploymentTargetStatus: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var description: String
    public var installMode: String
    public var installed: Bool
    public var installable: Bool
    public var planned: Bool
    public var recommended: Bool
    public var active: Bool
    public var version: String?
    public var desiredVersion: String?
    public var latestVersion: String?
    public var updateAvailable: Bool
    public var summary: String
    public var updateSummary: String?
    public var requirements: [String]?
    public var requirementsSourceUrl: String?
}

public struct DeploymentTargetsResponse: Codable, Sendable {
    public var checkedAt: String
    public var targets: [DeploymentTargetStatus]

    public init(checkedAt: String, targets: [DeploymentTargetStatus]) {
        self.checkedAt = checkedAt
        self.targets = targets
    }
}

public struct DeploymentTargetActionResponse: Codable, Sendable {
    public var targetId: String
    public var status: String
    public var message: String
    public var engineStatus: EngineStatus
}

public struct GatewayActionResponse: Codable, Sendable {
    public var action: String
    public var status: String
    public var message: String
    public var engineStatus: EngineStatus
}

public struct ModelAuthField: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var required: Bool
    public var secret: Bool?
    public var placeholder: String?
}

public struct ModelAuthMethod: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var kind: String
    public var description: String
    public var interactive: Bool
    public var fields: [ModelAuthField]
}

public struct ModelCatalogEntry: Codable, Sendable, Identifiable {
    public var key: String
    public var name: String
    public var input: String
    public var contextWindow: Int
    public var local: Bool
    public var available: Bool
    public var tags: [String]
    public var missing: Bool

    public var id: String { key }
}

public struct ModelProviderConfig: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var docsUrl: String
    public var providerRefs: [String]
    public var authMethods: [ModelAuthMethod]
    public var exampleModels: [String]?
    public var authEnvVars: [String]?
    public var setupNotes: [String]?
    public var warnings: [String]?
    public var providerType: String?
    public var supportsNoAuth: Bool?
    public var configured: Bool
    public var modelCount: Int
    public var sampleModels: [String]
}

public struct SavedModelEntry: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var providerId: String
    public var modelKey: String
    public var agentId: String
    public var authMethodId: String?
    public var authModeLabel: String?
    public var profileLabel: String?
    public var isDefault: Bool
    public var isFallback: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct ModelConfigOverview: Codable, Sendable {
    public var providers: [ModelProviderConfig]
    public var models: [ModelCatalogEntry]
    public var defaultModel: String?
    public var configuredModelKeys: [String]
    public var savedEntries: [SavedModelEntry]
    public var defaultEntryId: String?
    public var fallbackEntryIds: [String]
    public var localRuntime: LocalModelRuntimeOverview?
}

public struct ModelAuthSession: Codable, Sendable, Identifiable {
    public var id: String
    public var providerId: String
    public var methodId: String
    public var entryId: String?
    public var status: String
    public var message: String
    public var logs: [String]
    public var launchUrl: String?
    public var inputPrompt: String?
}

public struct ModelConfigActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var modelConfig: ModelConfigOverview
    public var authSession: ModelAuthSession?
    public var requiresGatewayApply: Bool?
    public var onboarding: OnboardingStateResponse?
}

public struct LocalModelRuntimeActionResponse: Codable, Sendable {
    public var epoch: String
    public var revision: Int
    public var settled: Bool
    public var action: String
    public var status: String
    public var message: String
    public var localRuntime: LocalModelRuntimeOverview
    public var modelConfig: ModelConfigOverview
    public var overview: ProductOverview
}

public struct ModelAuthSessionResponse: Codable, Sendable {
    public var session: ModelAuthSession
    public var modelConfig: ModelConfigOverview
    public var onboarding: OnboardingStateResponse?
}

public struct ChannelFieldOption: Codable, Sendable {
    public var value: String
    public var label: String
}

public struct ChannelFieldDefinition: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var required: Bool
    public var kind: String?
    public var secret: Bool?
    public var placeholder: String?
    public var helpText: String?
    public var options: [ChannelFieldOption]?
}

public struct ChannelCapability: Codable, Sendable, Identifiable {
    public var id: SupportedChannelId
    public var label: String
    public var description: String
    public var officialSupport: Bool
    public var iconKey: String
    public var docsUrl: String?
    public var fieldDefs: [ChannelFieldDefinition]
    public var supportsEdit: Bool
    public var supportsRemove: Bool
    public var supportsPairing: Bool
    public var supportsLogin: Bool
    public var guidedSetupKind: String?
}

public struct ChannelFieldSummary: Codable, Sendable, Identifiable {
    public var label: String
    public var value: String
    public var id: String { label }
}

public struct ConfiguredChannelEntry: Codable, Sendable, Identifiable {
    public var id: String
    public var channelId: SupportedChannelId
    public var label: String
    public var status: String
    public var summary: String
    public var detail: String
    public var maskedConfigSummary: [ChannelFieldSummary]
    public var editableValues: [String: String]
    public var pairingRequired: Bool
    public var lastUpdatedAt: String?
}

public struct ChannelSession: Codable, Sendable, Identifiable {
    public var id: String
    public var channelId: SupportedChannelId
    public var entryId: String?
    public var status: String
    public var message: String
    public var logs: [String]
    public var launchUrl: String?
    public var inputPrompt: String?
}

public struct ChannelConfigOverview: Codable, Sendable {
    public var baseOnboardingCompleted: Bool
    public var capabilities: [ChannelCapability]
    public var entries: [ConfiguredChannelEntry]
    public var activeSession: ChannelSession?
    public var gatewaySummary: String
}

public struct ManagedPluginDependency: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var kind: String
    public var active: Bool
    public var summary: String
}

public struct ManagedPluginEntry: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var packageSpec: String
    public var runtimePluginId: String
    public var configKey: String
    public var status: String
    public var summary: String
    public var detail: String
    public var enabled: Bool
    public var installed: Bool
    public var hasUpdate: Bool
    public var hasError: Bool
    public var activeDependentCount: Int
    public var dependencies: [ManagedPluginDependency]
}

public struct PluginConfigOverview: Codable, Sendable {
    public var entries: [ManagedPluginEntry]
}

public struct ChannelConfigActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var channelConfig: ChannelConfigOverview
    public var session: ChannelSession?
    public var requiresGatewayApply: Bool?
    public var onboarding: OnboardingStateResponse?
}

public struct ChannelSessionResponse: Codable, Sendable {
    public var session: ChannelSession
    public var channelConfig: ChannelConfigOverview
    public var onboarding: OnboardingStateResponse?
}

public struct PluginActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var pluginConfig: PluginConfigOverview
}

public struct SkillRequirementSummary: Codable, Sendable {
    public var bins: [String]
    public var anyBins: [String]
    public var env: [String]
    public var config: [String]
    public var os: [String]
}

public struct InstalledSkillEntry: Codable, Sendable, Identifiable {
    public var id: String
    public var slug: String?
    public var name: String
    public var description: String
    public var source: String
    public var bundled: Bool
    public var eligible: Bool
    public var disabled: Bool
    public var blockedByAllowlist: Bool
    public var readiness: String
    public var missing: SkillRequirementSummary
    public var homepage: String?
    public var version: String?
    public var managedBy: String
    public var editable: Bool
    public var removable: Bool
    public var updatable: Bool
}

public struct InstalledSkillDetail: Codable, Sendable {
    public var id: String
    public var slug: String?
    public var name: String
    public var description: String
    public var source: String
    public var bundled: Bool
    public var eligible: Bool
    public var disabled: Bool
    public var blockedByAllowlist: Bool
    public var readiness: String
    public var missing: SkillRequirementSummary
    public var homepage: String?
    public var version: String?
    public var managedBy: String
    public var editable: Bool
    public var removable: Bool
    public var updatable: Bool
    public var filePath: String?
    public var baseDir: String?
    public var contentPreview: String?
}

public struct SkillMarketplaceEntry: Codable, Sendable, Identifiable {
    public var slug: String
    public var name: String
    public var summary: String
    public var latestVersion: String?
    public var updatedLabel: String?
    public var ownerHandle: String?
    public var downloads: Int?
    public var stars: Int?
    public var installed: Bool
    public var curated: Bool

    public var id: String { slug }
}

public struct SkillMarketplaceDetail: Codable, Sendable {
    public var slug: String
    public var name: String
    public var summary: String
    public var latestVersion: String?
    public var updatedLabel: String?
    public var ownerHandle: String?
    public var downloads: Int?
    public var stars: Int?
    public var installed: Bool
    public var curated: Bool
    public var ownerDisplayName: String?
    public var ownerImageUrl: String?
    public var changelog: String?
    public var license: String?
    public var installsCurrent: Int?
    public var installsAllTime: Int?
    public var versions: Int?
    public var filePreview: String?
    public var homepage: String?
}

public struct SkillReadinessSummary: Codable, Sendable {
    public var total: Int
    public var eligible: Int
    public var disabled: Int
    public var blocked: Int
    public var missing: Int
    public var warnings: [String]
    public var summary: String
}

public enum PresetSkillInstallSource: String, Codable, Sendable {
    case bundled
    case clawhub
}

public enum PresetSkillTargetMode: String, Codable, Sendable {
    case managedLocal = "managed-local"
    case reusedInstall = "reused-install"
}

public enum PresetSkillSyncStatus: String, Codable, Sendable {
    case pending
    case installing
    case installed
    case verified
    case failed
}

public struct PresetSkillDefinition: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var onboardingSafe: Bool
    public var runtimeSlug: String
    public var installSource: PresetSkillInstallSource
    public var pinnedVersion: String?
    public var bundledAssetPath: String?
}

public struct PresetSkillSyncEntry: Codable, Sendable, Identifiable {
    public var presetSkillId: String
    public var runtimeSlug: String
    public var targetMode: PresetSkillTargetMode
    public var status: PresetSkillSyncStatus
    public var installedVersion: String?
    public var lastError: String?
    public var updatedAt: String

    public var id: String { presetSkillId }
}

public struct PresetSkillSyncOverview: Codable, Sendable {
    public var targetMode: PresetSkillTargetMode
    public var entries: [PresetSkillSyncEntry]
    public var summary: String
    public var repairRecommended: Bool
}

public struct SkillCatalogOverview: Codable, Sendable {
    public var managedSkillsDir: String?
    public var workspaceDir: String?
    public var marketplaceAvailable: Bool
    public var marketplaceSummary: String
    public var installedSkills: [InstalledSkillEntry]
    public var readiness: SkillReadinessSummary
    public var marketplacePreview: [SkillMarketplaceEntry]
    public var presetSkillSync: PresetSkillSyncOverview?
}

public struct SkillCatalogActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var skillConfig: SkillCatalogOverview
    public var requiresGatewayApply: Bool?
}

public struct MemberAvatar: Codable, Sendable {
    public var presetId: String
    public var accent: String
    public var emoji: String
    public var theme: String?

    public init(presetId: String, accent: String, emoji: String, theme: String? = nil) {
        self.presetId = presetId
        self.accent = accent
        self.emoji = emoji
        self.theme = theme
    }
}

public struct BrainAssignment: Codable, Sendable {
    public var entryId: String
    public var label: String
    public var providerId: String
    public var modelKey: String
}

public struct MemberCapabilitySettings: Codable, Sendable {
    public var memoryEnabled: Bool
    public var contextWindow: Int

    public init(memoryEnabled: Bool, contextWindow: Int) {
        self.memoryEnabled = memoryEnabled
        self.contextWindow = contextWindow
    }
}

public struct KnowledgePack: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var content: String
}

public struct SkillOption: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
}

public struct MemberBindingSummary: Codable, Sendable, Identifiable {
    public var id: String
    public var target: String
}

public struct AIMemberSummary: Codable, Sendable, Identifiable {
    public var id: String
    public var agentId: String
    public var source: String
    public var hasManagedMetadata: Bool
    public var name: String
    public var jobTitle: String
    public var status: String
    public var currentStatus: String
    public var activeTaskCount: Int
    public var avatar: MemberAvatar
    public var brain: BrainAssignment?
    public var teamIds: [String]
    public var bindingCount: Int
    public var bindings: [MemberBindingSummary]
    public var lastUpdatedAt: String
}

public struct AIMemberDetail: Codable, Sendable, Identifiable {
    public var id: String
    public var agentId: String
    public var source: String
    public var hasManagedMetadata: Bool
    public var name: String
    public var jobTitle: String
    public var status: String
    public var currentStatus: String
    public var activeTaskCount: Int
    public var avatar: MemberAvatar
    public var brain: BrainAssignment?
    public var teamIds: [String]
    public var bindingCount: Int
    public var bindings: [MemberBindingSummary]
    public var lastUpdatedAt: String
    public var personality: String
    public var soul: String
    public var workStyles: [String]
    public var presetSkillIds: [String]?
    public var skillIds: [String]
    public var knowledgePackIds: [String]
    public var capabilitySettings: MemberCapabilitySettings
    public var agentDir: String?
    public var workspaceDir: String?
}

public struct TeamDetail: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var purpose: String
    public var memberIds: [String]
    public var memberCount: Int
    public var displayOrder: Int?
    public var updatedAt: String
}

public struct AITeamActivityItem: Codable, Sendable, Identifiable {
    public var id: String
    public var memberId: String?
    public var memberName: String?
    public var action: String
    public var description: String
    public var timestamp: String
    public var tone: String
}

public struct AIMemberPreset: Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var description: String
    public var avatarPresetId: String?
    public var jobTitle: String
    public var personality: String
    public var soul: String
    public var workStyles: [String]
    public var presetSkillIds: [String]?
    public var skillIds: [String]
    public var knowledgePackIds: [String]
    public var defaultMemoryEnabled: Bool?
}

public struct AITeamOverview: Codable, Sendable {
    public var teamVision: String
    public var members: [AIMemberDetail]
    public var teams: [TeamDetail]
    public var activity: [AITeamActivityItem]
    public var availableBrains: [SavedModelEntry]
    public var memberPresets: [AIMemberPreset]
    public var knowledgePacks: [KnowledgePack]
    public var skillOptions: [SkillOption]
    public var presetSkillSync: PresetSkillSyncOverview?
}

public struct MemberBindingsResponse: Codable, Sendable {
    public var memberId: String
    public var bindings: [MemberBindingSummary]
}

public struct AITeamActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var overview: AITeamOverview
    public var requiresGatewayApply: Bool?
}

public enum ChatBridgeState: String, Codable, Sendable {
    case connected
    case reconnecting
    case polling
    case disconnected
}

public enum ChatToolActivityStatus: String, Codable, Sendable {
    case queued
    case running
    case completed
    case failed
}

public struct ChatToolActivity: Codable, Sendable {
    public var id: String
    public var label: String
    public var status: ChatToolActivityStatus
    public var detail: String?

    public init(id: String, label: String, status: ChatToolActivityStatus, detail: String? = nil) {
        self.id = id
        self.label = label
        self.status = status
        self.detail = detail
    }
}

public struct ChatComposerState: Codable, Sendable {
    public var status: String
    public var canSend: Bool
    public var canAbort: Bool
    public var activityLabel: String?
    public var error: String?
    public var bridgeState: ChatBridgeState?
    public var toolActivities: [ChatToolActivity]?

    public init(
        status: String,
        canSend: Bool,
        canAbort: Bool,
        activityLabel: String? = nil,
        error: String? = nil,
        bridgeState: ChatBridgeState? = nil,
        toolActivities: [ChatToolActivity]? = nil
    ) {
        self.status = status
        self.canSend = canSend
        self.canAbort = canAbort
        self.activityLabel = activityLabel
        self.error = error
        self.bridgeState = bridgeState
        self.toolActivities = toolActivities
    }
}

public struct ChatMessage: Codable, Sendable, Identifiable {
    public var id: String
    public var role: String
    public var text: String
    public var timestamp: String?
    public var provider: String?
    public var model: String?
    public var clientMessageId: String?
    public var status: String?
    public var interrupted: Bool?
    public var pending: Bool?
    public var error: String?

    public init(
        id: String,
        role: String,
        text: String,
        timestamp: String? = nil,
        provider: String? = nil,
        model: String? = nil,
        clientMessageId: String? = nil,
        status: String? = nil,
        interrupted: Bool? = nil,
        pending: Bool? = nil,
        error: String? = nil
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.timestamp = timestamp
        self.provider = provider
        self.model = model
        self.clientMessageId = clientMessageId
        self.status = status
        self.interrupted = interrupted
        self.pending = pending
        self.error = error
    }
}

public struct ChatThreadSummary: Codable, Sendable, Identifiable {
    public var id: String
    public var memberId: String
    public var agentId: String
    public var sessionKey: String
    public var title: String
    public var createdAt: String
    public var updatedAt: String
    public var lastPreview: String?
    public var lastMessageAt: String?
    public var unreadCount: Int
    public var activeRunState: String?
    public var historyStatus: String
    public var composerState: ChatComposerState

    public init(
        id: String,
        memberId: String,
        agentId: String,
        sessionKey: String,
        title: String,
        createdAt: String,
        updatedAt: String,
        lastPreview: String? = nil,
        lastMessageAt: String? = nil,
        unreadCount: Int,
        activeRunState: String? = nil,
        historyStatus: String,
        composerState: ChatComposerState
    ) {
        self.id = id
        self.memberId = memberId
        self.agentId = agentId
        self.sessionKey = sessionKey
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastPreview = lastPreview
        self.lastMessageAt = lastMessageAt
        self.unreadCount = unreadCount
        self.activeRunState = activeRunState
        self.historyStatus = historyStatus
        self.composerState = composerState
    }
}

public struct ChatThreadDetail: Codable, Sendable, Identifiable {
    public var id: String
    public var memberId: String
    public var agentId: String
    public var sessionKey: String
    public var title: String
    public var createdAt: String
    public var updatedAt: String
    public var lastPreview: String?
    public var lastMessageAt: String?
    public var unreadCount: Int
    public var activeRunState: String?
    public var historyStatus: String
    public var composerState: ChatComposerState
    public var messages: [ChatMessage]
    public var historyError: String?

    public init(
        id: String,
        memberId: String,
        agentId: String,
        sessionKey: String,
        title: String,
        createdAt: String,
        updatedAt: String,
        lastPreview: String? = nil,
        lastMessageAt: String? = nil,
        unreadCount: Int,
        activeRunState: String? = nil,
        historyStatus: String,
        composerState: ChatComposerState,
        messages: [ChatMessage],
        historyError: String? = nil
    ) {
        self.id = id
        self.memberId = memberId
        self.agentId = agentId
        self.sessionKey = sessionKey
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastPreview = lastPreview
        self.lastMessageAt = lastMessageAt
        self.unreadCount = unreadCount
        self.activeRunState = activeRunState
        self.historyStatus = historyStatus
        self.composerState = composerState
        self.messages = messages
        self.historyError = historyError
    }
}

public struct ChatOverview: Codable, Sendable {
    public var threads: [ChatThreadSummary]

    public init(threads: [ChatThreadSummary]) {
        self.threads = threads
    }
}

public enum ChatStreamEvent: Codable, Sendable {
    case threadCreated(ChatThreadSummary)
    case historyLoaded(threadId: String, detail: ChatThreadDetail)
    case messageCreated(threadId: String, message: ChatMessage)
    case runStarted(threadId: String, message: ChatMessage, activityLabel: String?)
    case assistantThinking(threadId: String, activityLabel: String?)
    case connectionState(threadId: String, state: ChatBridgeState, detail: String?)
    case assistantToolStatus(threadId: String, sessionKey: String, runId: String?, activityLabel: String, toolActivity: ChatToolActivity)
    case assistantDelta(threadId: String, message: ChatMessage, activityLabel: String?)
    case assistantCompleted(threadId: String, detail: ChatThreadDetail, activityLabel: String?)
    case assistantAborted(threadId: String, detail: ChatThreadDetail, activityLabel: String?)
    case assistantFailed(threadId: String, error: String, detail: ChatThreadDetail?, activityLabel: String?)
    case threadUpdated(ChatThreadSummary)

    private enum CodingKeys: String, CodingKey {
        case type
        case thread
        case threadId
        case detail
        case message
        case sessionKey
        case runId
        case state
        case activityLabel
        case toolActivity
        case error
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "thread-created":
            self = .threadCreated(try container.decode(ChatThreadSummary.self, forKey: .thread))
        case "history-loaded":
            self = .historyLoaded(
                threadId: try container.decode(String.self, forKey: .threadId),
                detail: try container.decode(ChatThreadDetail.self, forKey: .detail)
            )
        case "message-created":
            self = .messageCreated(
                threadId: try container.decode(String.self, forKey: .threadId),
                message: try container.decode(ChatMessage.self, forKey: .message)
            )
        case "run-started":
            self = .runStarted(
                threadId: try container.decode(String.self, forKey: .threadId),
                message: try container.decode(ChatMessage.self, forKey: .message),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "assistant-thinking":
            self = .assistantThinking(
                threadId: try container.decode(String.self, forKey: .threadId),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "connection-state":
            self = .connectionState(
                threadId: try container.decode(String.self, forKey: .threadId),
                state: try container.decode(ChatBridgeState.self, forKey: .state),
                detail: try container.decodeIfPresent(String.self, forKey: .detail)
            )
        case "assistant-tool-status":
            self = .assistantToolStatus(
                threadId: try container.decode(String.self, forKey: .threadId),
                sessionKey: try container.decode(String.self, forKey: .sessionKey),
                runId: try container.decodeIfPresent(String.self, forKey: .runId),
                activityLabel: try container.decode(String.self, forKey: .activityLabel),
                toolActivity: try container.decode(ChatToolActivity.self, forKey: .toolActivity)
            )
        case "assistant-delta":
            self = .assistantDelta(
                threadId: try container.decode(String.self, forKey: .threadId),
                message: try container.decode(ChatMessage.self, forKey: .message),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "assistant-completed":
            self = .assistantCompleted(
                threadId: try container.decode(String.self, forKey: .threadId),
                detail: try container.decode(ChatThreadDetail.self, forKey: .detail),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "assistant-aborted":
            self = .assistantAborted(
                threadId: try container.decode(String.self, forKey: .threadId),
                detail: try container.decode(ChatThreadDetail.self, forKey: .detail),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "assistant-failed":
            self = .assistantFailed(
                threadId: try container.decode(String.self, forKey: .threadId),
                error: try container.decode(String.self, forKey: .error),
                detail: try container.decodeIfPresent(ChatThreadDetail.self, forKey: .detail),
                activityLabel: try container.decodeIfPresent(String.self, forKey: .activityLabel)
            )
        case "thread-updated":
            self = .threadUpdated(try container.decode(ChatThreadSummary.self, forKey: .thread))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unsupported chat stream event type: \(type)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .threadCreated(thread):
            try container.encode("thread-created", forKey: .type)
            try container.encode(thread, forKey: .thread)
        case let .historyLoaded(threadId, detail):
            try container.encode("history-loaded", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(detail, forKey: .detail)
        case let .messageCreated(threadId, message):
            try container.encode("message-created", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(message, forKey: .message)
        case let .runStarted(threadId, message, activityLabel):
            try container.encode("run-started", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(message, forKey: .message)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .assistantThinking(threadId, activityLabel):
            try container.encode("assistant-thinking", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .connectionState(threadId, state, detail):
            try container.encode("connection-state", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(state, forKey: .state)
            try container.encodeIfPresent(detail, forKey: .detail)
        case let .assistantToolStatus(threadId, sessionKey, runId, activityLabel, toolActivity):
            try container.encode("assistant-tool-status", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(sessionKey, forKey: .sessionKey)
            try container.encodeIfPresent(runId, forKey: .runId)
            try container.encode(activityLabel, forKey: .activityLabel)
            try container.encode(toolActivity, forKey: .toolActivity)
        case let .assistantDelta(threadId, message, activityLabel):
            try container.encode("assistant-delta", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(message, forKey: .message)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .assistantCompleted(threadId, detail, activityLabel):
            try container.encode("assistant-completed", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(detail, forKey: .detail)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .assistantAborted(threadId, detail, activityLabel):
            try container.encode("assistant-aborted", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(detail, forKey: .detail)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .assistantFailed(threadId, error, detail, activityLabel):
            try container.encode("assistant-failed", forKey: .type)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(error, forKey: .error)
            try container.encodeIfPresent(detail, forKey: .detail)
            try container.encodeIfPresent(activityLabel, forKey: .activityLabel)
        case let .threadUpdated(thread):
            try container.encode("thread-updated", forKey: .type)
            try container.encode(thread, forKey: .thread)
        }
    }
}

public struct ChatActionResponse: Codable, Sendable {
    public var status: String
    public var message: String
    public var overview: ChatOverview
    public var thread: ChatThreadDetail?
}
