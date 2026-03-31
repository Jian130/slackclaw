import Foundation

public struct WechatWorkSetupRequest: Codable, Sendable {
    public var botId: String
    public var secret: String

    public init(botId: String, secret: String) {
        self.botId = botId
        self.secret = secret
    }
}

public typealias WechatSetupRequest = WechatWorkSetupRequest

public struct InstallRequest: Codable, Sendable {
    public var autoConfigure: Bool
    public var forceLocal: Bool?

    public init(autoConfigure: Bool = true, forceLocal: Bool? = nil) {
        self.autoConfigure = autoConfigure
        self.forceLocal = forceLocal
    }
}

public struct UpdateOnboardingStateRequest: Codable, Sendable {
    public var currentStep: OnboardingStep?
    public var install: OnboardingInstallState?
    public var permissions: OnboardingPermissionsState?
    public var model: OnboardingModelState?
    public var channel: OnboardingChannelState?
    public var channelProgress: OnboardingChannelProgressState?
    public var employee: OnboardingEmployeeState?
    public var activeModelAuthSessionId: String?
    public var activeChannelSessionId: String?

    public init(
        currentStep: OnboardingStep? = nil,
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

public struct CompleteOnboardingRequest: Codable, Sendable {
    public var destination: OnboardingDestination?

    public init(destination: OnboardingDestination? = nil) {
        self.destination = destination
    }
}

public struct OnboardingStepNavigationRequest: Codable, Sendable {
    public var step: OnboardingStep

    public init(step: OnboardingStep) {
        self.step = step
    }
}

public struct SaveModelEntryRequest: Codable, Sendable {
    public var label: String
    public var providerId: String
    public var methodId: String
    public var modelKey: String
    public var values: [String: String]
    public var makeDefault: Bool?
    public var useAsFallback: Bool?

    public init(
        label: String,
        providerId: String,
        methodId: String,
        modelKey: String,
        values: [String: String],
        makeDefault: Bool? = nil,
        useAsFallback: Bool? = nil
    ) {
        self.label = label
        self.providerId = providerId
        self.methodId = methodId
        self.modelKey = modelKey
        self.values = values
        self.makeDefault = makeDefault
        self.useAsFallback = useAsFallback
    }
}

public struct SetDefaultModelEntryRequest: Codable, Sendable {
    public var entryId: String

    public init(entryId: String) {
        self.entryId = entryId
    }
}

public struct ReplaceFallbackModelEntriesRequest: Codable, Sendable {
    public var entryIds: [String]

    public init(entryIds: [String]) {
        self.entryIds = entryIds
    }
}

public struct ModelAuthRequest: Codable, Sendable {
    public var providerId: String
    public var methodId: String
    public var values: [String: String]
    public var setDefaultModel: String?

    public init(providerId: String, methodId: String, values: [String: String], setDefaultModel: String? = nil) {
        self.providerId = providerId
        self.methodId = methodId
        self.values = values
        self.setDefaultModel = setDefaultModel
    }
}

public struct ModelAuthSessionInputRequest: Codable, Sendable {
    public var value: String

    public init(value: String) {
        self.value = value
    }
}

public struct SaveChannelEntryRequest: Codable, Sendable {
    public var channelId: String
    public var entryId: String?
    public var values: [String: String]
    public var action: String?

    public init(channelId: String, entryId: String? = nil, values: [String: String], action: String? = nil) {
        self.channelId = channelId
        self.entryId = entryId
        self.values = values
        self.action = action
    }
}

public struct RemoveChannelEntryRequest: Codable, Sendable {
    public var entryId: String
    public var channelId: String?
    public var values: [String: String]?

    public init(entryId: String, channelId: String? = nil, values: [String: String]? = nil) {
        self.entryId = entryId
        self.channelId = channelId
        self.values = values
    }
}

public struct ChannelSessionInputRequest: Codable, Sendable {
    public var value: String

    public init(value: String) {
        self.value = value
    }
}

public struct SaveCustomSkillRequest: Codable, Sendable {
    public var name: String
    public var slug: String?
    public var description: String
    public var instructions: String
    public var homepage: String?

    public init(name: String, slug: String? = nil, description: String, instructions: String, homepage: String? = nil) {
        self.name = name
        self.slug = slug
        self.description = description
        self.instructions = instructions
        self.homepage = homepage
    }
}

public struct InstallSkillRequest: Codable, Sendable {
    public var slug: String
    public var version: String?

    public init(slug: String, version: String? = nil) {
        self.slug = slug
        self.version = version
    }
}

public struct UpdateSkillRequest: Codable, Sendable {
    public var action: String
    public var version: String?
    public var name: String?
    public var description: String?
    public var instructions: String?
    public var homepage: String?

    public init(
        action: String,
        version: String? = nil,
        name: String? = nil,
        description: String? = nil,
        instructions: String? = nil,
        homepage: String? = nil
    ) {
        self.action = action
        self.version = version
        self.name = name
        self.description = description
        self.instructions = instructions
        self.homepage = homepage
    }
}

public struct RemoveSkillRequest: Codable, Sendable {
    public init() {}
}

public struct SaveAIMemberRequest: Codable, Sendable {
    public var name: String
    public var jobTitle: String
    public var avatar: MemberAvatar
    public var brainEntryId: String
    public var personality: String
    public var soul: String
    public var workStyles: [String]
    public var presetSkillIds: [String]?
    public var skillIds: [String]
    public var knowledgePackIds: [String]
    public var capabilitySettings: MemberCapabilitySettings

    public init(
        name: String,
        jobTitle: String,
        avatar: MemberAvatar,
        brainEntryId: String,
        personality: String,
        soul: String,
        workStyles: [String],
        presetSkillIds: [String]? = nil,
        skillIds: [String],
        knowledgePackIds: [String],
        capabilitySettings: MemberCapabilitySettings
    ) {
        self.name = name
        self.jobTitle = jobTitle
        self.avatar = avatar
        self.brainEntryId = brainEntryId
        self.personality = personality
        self.soul = soul
        self.workStyles = workStyles
        self.presetSkillIds = presetSkillIds
        self.skillIds = skillIds
        self.knowledgePackIds = knowledgePackIds
        self.capabilitySettings = capabilitySettings
    }
}

public struct BindAIMemberChannelRequest: Codable, Sendable {
    public var binding: String

    public init(binding: String) {
        self.binding = binding
    }
}

public struct DeleteAIMemberRequest: Codable, Sendable {
    public var deleteMode: String

    public init(deleteMode: String) {
        self.deleteMode = deleteMode
    }
}

public struct SaveTeamRequest: Codable, Sendable {
    public var name: String
    public var purpose: String
    public var memberIds: [String]
    public var displayOrder: Int?

    public init(name: String, purpose: String, memberIds: [String], displayOrder: Int? = nil) {
        self.name = name
        self.purpose = purpose
        self.memberIds = memberIds
        self.displayOrder = displayOrder
    }
}

public struct CreateChatThreadRequest: Codable, Sendable {
    public var memberId: String
    public var mode: String?

    public init(memberId: String, mode: String? = nil) {
        self.memberId = memberId
        self.mode = mode
    }
}

public struct SendChatMessageRequest: Codable, Sendable {
    public var message: String
    public var clientMessageId: String?

    public init(message: String, clientMessageId: String? = nil) {
        self.message = message
        self.clientMessageId = clientMessageId
    }
}

public struct AbortChatRequest: Codable, Sendable {
    public init() {}
}
