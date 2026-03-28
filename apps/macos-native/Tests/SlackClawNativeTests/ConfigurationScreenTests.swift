import Testing
@testable import SlackClawNative
@testable import SlackClawProtocol

struct ConfigurationScreenTests {
    @Test
    func configurationChannelActionStateShowsApproveForPairingCapabilities() {
        let telegramEntry = ConfiguredChannelEntry(
            id: "telegram:default",
            channelId: .telegram,
            label: "Telegram",
            status: "completed",
            summary: "Telegram is configured.",
            detail: "Configured",
            maskedConfigSummary: [],
            editableValues: [:],
            pairingRequired: false,
            lastUpdatedAt: nil
        )
        let telegramCapability = ChannelCapability(
            id: .telegram,
            label: "Telegram",
            description: "Telegram bot setup.",
            officialSupport: true,
            iconKey: "telegram",
            docsUrl: nil,
            fieldDefs: [],
            supportsEdit: true,
            supportsRemove: true,
            supportsPairing: true,
            supportsLogin: false,
            guidedSetupKind: nil
        )
        let wechatCapability = ChannelCapability(
            id: .wechatWork,
            label: "WeChat Work",
            description: "WeChat Work setup.",
            officialSupport: false,
            iconKey: "wechat",
            docsUrl: nil,
            fieldDefs: [],
            supportsEdit: true,
            supportsRemove: true,
            supportsPairing: true,
            supportsLogin: false,
            guidedSetupKind: "wechat-work"
        )
        let personalWechatCapability = ChannelCapability(
            id: .wechat,
            label: "WeChat",
            description: "Personal WeChat login.",
            officialSupport: false,
            iconKey: "wechat",
            docsUrl: nil,
            fieldDefs: [],
            supportsEdit: false,
            supportsRemove: false,
            supportsPairing: false,
            supportsLogin: true,
            guidedSetupKind: "wechat"
        )

        #expect(configurationChannelActionState(entry: telegramEntry, capability: telegramCapability) == .init(primaryAction: .edit, showApproveAction: true))
        #expect(configurationChannelActionState(entry: .init(id: telegramEntry.id, channelId: telegramEntry.channelId, label: telegramEntry.label, status: telegramEntry.status, summary: telegramEntry.summary, detail: telegramEntry.detail, maskedConfigSummary: [], editableValues: [:], pairingRequired: true, lastUpdatedAt: nil), capability: telegramCapability) == .init(primaryAction: .continueSetup, showApproveAction: true))
        #expect(configurationChannelActionState(entry: telegramEntry, capability: wechatCapability) == .init(primaryAction: .edit, showApproveAction: true))
        #expect(
            configurationChannelActionState(
                entry: .init(
                    id: "wechat:default",
                    channelId: .wechat,
                    label: "WeChat",
                    status: "awaiting-pairing",
                    summary: "Waiting for QR confirmation.",
                    detail: "Waiting",
                    maskedConfigSummary: [],
                    editableValues: [:],
                    pairingRequired: false,
                    lastUpdatedAt: nil
                ),
                capability: personalWechatCapability
            ) == .init(primaryAction: .continueSetup, showApproveAction: false)
        )
    }

    @Test
    func approvePairingRequestIncludesTrimmedCode() {
        let request = buildConfigurationChannelRequest(
            channelId: .telegram,
            entryId: "telegram:default",
            editableValues: ["accountName": "Support Bot"],
            action: .approvePairing,
            pairingCode: " 123456 "
        )

        #expect(request.channelId == "telegram")
        #expect(request.entryId == "telegram:default")
        #expect(request.action == "approve-pairing")
        #expect(request.values["accountName"] == "Support Bot")
        #expect(request.values["code"] == "123456")
    }
}
