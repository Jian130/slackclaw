import Testing
import Foundation
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
            fieldDefs: [.init(id: "code", label: "Pairing code", required: false, kind: nil, secret: false, placeholder: nil, options: nil)],
            supportsEdit: true,
            supportsRemove: true,
            supportsPairing: true,
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
            ) == .init(primaryAction: .continueSetup, showApproveAction: true)
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

    @Test
    func configurationChannelSheetCloseBehaviorMatchesWebFlow() {
        #expect(shouldCloseNativeConfigurationChannelSheetAfterAction(action: .approvePairing, channelId: .telegram, hasSession: false))
        #expect(!shouldCloseNativeConfigurationChannelSheetAfterAction(action: .save, channelId: .whatsapp, hasSession: true))
        #expect(!shouldCloseNativeConfigurationChannelSheetAfterAction(action: .login, channelId: .telegram, hasSession: false))
    }

    @Test
    func configurationScreenRunsMutationsOnMainActorAndRefreshesInBackground() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("@MainActor\nstruct ConfigurationScreen: View"))
        #expect(source.contains("private func refreshConfigurationStateInBackground()"))
        #expect(source.contains("Task { await appState.refreshAll() }"))
    }

    @Test
    func configurationScreenKeepsModelEditInteractive() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("@State private var selectedModelEntry: SavedModelEntry?"))
        #expect(source.contains("ModelEntrySheet(appState: appState, existingEntry: selectedModelEntry)"))
        #expect(source.contains(".disabled(hasPendingConfigurationAction)"))
        #expect(!source.contains(".disabled(true || hasPendingConfigurationAction)"))
        #expect(source.contains("selectedModelEntry = entry"))
        #expect(source.contains("providerId = existingEntry.providerId"))
        #expect(source.contains("label = existingEntry.label"))
        #expect(source.contains("modelKey = existingEntry.modelKey"))
    }

    @Test
    func configurationScreenUsesCardStyleTabsForModelsAndChannels() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("private struct NativeConfigurationTabButton: View"))
        #expect(source.contains("title: \"AI Models\""))
        #expect(source.contains("title: \"Channels\""))
        #expect(source.contains("subtitle: liveModelCount > 0 ? \"Live runtime models\" : \"No live runtime models yet\""))
        #expect(source.contains("subtitle: liveChannelCount > 0 ? \"Configured live channels\" : \"No live channels yet\""))
        #expect(source.contains("private var configurationQuickActions: some View"))
        #expect(source.contains("configurationQuickActions"))
        #expect(source.contains("if selectedTab == 0 {"))
        #expect(!source.contains(".pickerStyle(.segmented)"))
    }

    @Test
    func modelEntrySheetUsesProviderFirstWorkflowAndInteractiveAuthHooks() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("Choose a provider, model, and authentication for this saved AI model entry."))
        #expect(source.contains("if providerId.isEmpty"))
        #expect(source.contains("Change Provider"))
        #expect(source.contains("Authentication Method"))
        #expect(source.contains("Authentication progress"))
        #expect(source.contains("Refresh providers"))
        #expect(source.contains("submitModelAuthInput"))
        #expect(source.contains("fetchModelAuthSession"))
        #expect(source.contains("private enum NativeConfigurationModelSheetBusyState: Equatable"))
    }

    @Test
    func modelEntrySheetKeepsRemoveActionForExistingEntries() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("if let existingEntry {"))
        #expect(source.contains("ActionButton(\"Remove\", variant: .destructive, isBusy: busyState == .remove"))
        #expect(source.contains("private func remove(entry: SavedModelEntry) async"))
        #expect(source.contains("deleteModelEntry(entryId: entry.id)"))
    }

    @Test
    func runtimeOnlyModelCardsKeepRemoveAction() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("func nativeRuntimeDerivedModelEntry(_ modelConfig: ModelConfigOverview?, modelKey: String) -> SavedModelEntry?"))
        #expect(source.contains("let runtimeEntry = nativeRuntimeDerivedModelEntry(appState.modelConfig, modelKey: model.key)"))
        #expect(source.contains("runtimeOnlyModelBody(model: model, provider: provider, palette: palette, fallbackTag: fallbackTag, runtimeEntry: runtimeEntry)"))
        #expect(source.contains("This model is currently coming from the active OpenClaw runtime without a managed ChillClaw entry."))
    }

    @Test
    func channelEntrySheetUsesChooserWorkflowAndStyledActionFooter() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(
            contentsOf: packageRoot.appendingPathComponent("Sources/SlackClawNative/Screens.swift"),
            encoding: .utf8
        )

        #expect(source.contains("Choose a communication channel, review the setup guidance, and save the account through ChillClaw."))
        #expect(source.contains("Change Channel"))
        #expect(source.contains("Start Login"))
        #expect(source.contains("Save Channel"))
        #expect(source.contains("Approve Pairing"))
        #expect(source.contains("private struct NativeConfigurationChannelMark: View"))
        #expect(source.contains("shouldCloseNativeConfigurationChannelSheetAfterAction"))
    }

    @Test
    func configurationScreenShowsOnlyLiveManagedModelsAndRuntimeOnlyModels() {
        let savedEntry = SavedModelEntry(
            id: "saved-anthropic",
            label: "Claude Opus 4.6",
            providerId: "anthropic",
            modelKey: "anthropic/claude-opus-4-6",
            agentId: "main",
            authMethodId: nil,
            authModeLabel: nil,
            profileLabel: nil,
            isDefault: true,
            isFallback: false,
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T00:00:00.000Z"
        )
        let staleEntry = SavedModelEntry(
            id: "saved-openai",
            label: "OpenAI GPT-5",
            providerId: "openai",
            modelKey: "openai/gpt-5",
            agentId: "main",
            authMethodId: nil,
            authModeLabel: nil,
            profileLabel: nil,
            isDefault: false,
            isFallback: false,
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T00:00:00.000Z"
        )
        let runtimePlaceholder = SavedModelEntry(
            id: "runtime:minimax-minimax-chat",
            label: "MiniMax Chat",
            providerId: "minimax",
            modelKey: "minimax/minimax-chat",
            agentId: "main",
            authMethodId: nil,
            authModeLabel: "API key",
            profileLabel: nil,
            isDefault: false,
            isFallback: true,
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T00:00:00.000Z"
        )
        let config = makeConfigurationModelConfig(savedEntries: [savedEntry, staleEntry, runtimePlaceholder], configuredModelKeys: [
            "anthropic/claude-opus-4-6",
            "minimax/minimax-chat"
        ])

        #expect(nativeManagedConfiguredModelEntries(config).map(\.id) == ["saved-anthropic"])
        #expect(nativeRuntimeOnlyModels(config).map(\.key) == ["minimax/minimax-chat"])
    }

    @Test
    func newModelDefaultsOnlyWhenNoLiveModelIsConfigured() {
        #expect(nativeShouldDefaultNewModelEntry(makeConfigurationModelConfig(configuredModelKeys: [])))
        #expect(!nativeShouldDefaultNewModelEntry(makeConfigurationModelConfig(configuredModelKeys: ["anthropic/claude-opus-4-6"])))
    }
}

private func makeConfigurationModelConfig(
    savedEntries: [SavedModelEntry] = [],
    configuredModelKeys: [String]
) -> ModelConfigOverview {
    ModelConfigOverview(
        providers: [
            ModelProviderConfig(
                id: "anthropic",
                label: "Anthropic",
                description: "Anthropic models",
                docsUrl: "https://docs.openclaw.ai/providers/anthropic",
                providerRefs: ["anthropic/"],
                authMethods: [],
                configured: !configuredModelKeys.filter { $0.hasPrefix("anthropic/") }.isEmpty,
                modelCount: 1,
                sampleModels: ["anthropic/claude-opus-4-6"]
            ),
            ModelProviderConfig(
                id: "minimax",
                label: "MiniMax",
                description: "MiniMax models",
                docsUrl: "https://docs.openclaw.ai/providers/minimax",
                providerRefs: ["minimax/"],
                authMethods: [],
                configured: !configuredModelKeys.filter { $0.hasPrefix("minimax/") }.isEmpty,
                modelCount: 1,
                sampleModels: ["minimax/minimax-chat"]
            ),
            ModelProviderConfig(
                id: "openai",
                label: "OpenAI",
                description: "OpenAI models",
                docsUrl: "https://docs.openclaw.ai/providers/openai",
                providerRefs: ["openai/"],
                authMethods: [],
                configured: !configuredModelKeys.filter { $0.hasPrefix("openai/") }.isEmpty,
                modelCount: 1,
                sampleModels: ["openai/gpt-5"]
            )
        ],
        models: [
            ModelCatalogEntry(
                key: "anthropic/claude-opus-4-6",
                name: "Claude Opus 4.6",
                input: "text+image",
                contextWindow: 977000,
                local: false,
                available: true,
                tags: configuredModelKeys.contains("anthropic/claude-opus-4-6") ? ["default", "configured"] : [],
                missing: false
            ),
            ModelCatalogEntry(
                key: "minimax/minimax-chat",
                name: "MiniMax Chat",
                input: "text",
                contextWindow: 256000,
                local: false,
                available: true,
                tags: configuredModelKeys.contains("minimax/minimax-chat") ? ["fallback#1", "configured"] : [],
                missing: false
            ),
            ModelCatalogEntry(
                key: "openai/gpt-5",
                name: "GPT-5",
                input: "text",
                contextWindow: 400000,
                local: false,
                available: true,
                tags: configuredModelKeys.contains("openai/gpt-5") ? ["configured"] : [],
                missing: false
            )
        ],
        defaultModel: configuredModelKeys.first,
        configuredModelKeys: configuredModelKeys,
        savedEntries: savedEntries,
        defaultEntryId: savedEntries.first?.id,
        fallbackEntryIds: savedEntries.dropFirst().map(\.id)
    )
}
