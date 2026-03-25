import Testing
@testable import SlackClawNative
@testable import SlackClawProtocol

struct DashboardSupportTests {
    @Test
    func dashboardPresentationMatchesReactParityMetricsAndHealth() {
        let presentation = makeDashboardPresentation(
            overview: makeDashboardOverview(),
            modelConfig: makeDashboardModelConfig(),
            aiTeamOverview: makeDashboardAITeamOverview()
        )

        #expect(presentation.metrics.count == 5)
        #expect(presentation.metrics[0] == .init(title: "Engine", value: "Installed", detail: "Ready"))
        #expect(presentation.metrics[1] == .init(title: "Connected Models", value: "2", detail: "MiniMax / minimax-chat"))
        #expect(presentation.metrics[2] == .init(title: "AI Members", value: "2", detail: "1 ready / 1 busy"))
        #expect(presentation.metrics[3] == .init(title: "Active Tasks", value: "3", detail: "In Progress"))
        #expect(presentation.metrics[4] == .init(title: "Channels Ready", value: "2", detail: "Gateway ready"))

        #expect(presentation.healthItems.count == 5)
        #expect(presentation.healthItems[0] == .init(title: "OpenClaw deployed", status: "Active", tone: .success))
        #expect(presentation.healthItems[1] == .init(title: "Gateway reachable", status: "Running", tone: .success))
        #expect(presentation.healthItems[2] == .init(title: "Channels configured", status: "2 ready", tone: .success))
        #expect(presentation.healthItems[3] == .init(title: "Health blockers", status: "Review", tone: .warning))
        #expect(presentation.healthItems[4] == .init(title: "AI member roster", status: "2 members", tone: .info))

        #expect(presentation.employeeRows.count == 2)
        #expect(presentation.activityRows.count == 2)
        #expect(presentation.heroVersion == "2026.3.13")
    }
}

private func makeDashboardOverview() -> ProductOverview {
    .init(
        appName: "SlackClaw",
        appVersion: "0.1.2",
        platformTarget: "macOS first",
        firstRun: .init(introCompleted: true, setupCompleted: true, selectedProfileId: nil),
        appService: .init(mode: .launchagent, installed: true, running: true, managedAtLogin: true, label: nil, summary: "Running", detail: "Loaded"),
        engine: .init(engine: "openclaw", installed: true, running: true, version: "2026.3.13", summary: "Ready", pendingGatewayApply: false, pendingGatewayApplySummary: nil, lastCheckedAt: "2026-03-20T00:00:00.000Z"),
        installSpec: .init(engine: "openclaw", desiredVersion: "latest", installSource: "npm-local", prerequisites: ["macOS"], installPath: nil),
        capabilities: .init(engine: "openclaw", supportsInstall: true, supportsUpdate: true, supportsRecovery: true, supportsStreaming: true, runtimeModes: ["gateway"], supportedChannels: ["telegram", "feishu", "wechat"], starterSkillCategories: ["communication"], futureLocalModelFamilies: ["qwen"]),
        installChecks: [],
        channelSetup: .init(
            baseOnboardingCompleted: true,
            channels: [
                .init(id: "telegram", title: "Telegram", officialSupport: true, status: "completed", summary: "Ready", detail: "Connected", lastUpdatedAt: nil, logs: nil),
                .init(id: "feishu", title: "Feishu", officialSupport: true, status: "ready", summary: "Ready", detail: "Connected", lastUpdatedAt: nil, logs: nil),
                .init(id: "wechat", title: "WeChat", officialSupport: true, status: "pending", summary: "Pending", detail: "Waiting", lastUpdatedAt: nil, logs: nil)
            ],
            nextChannelId: nil,
            gatewayStarted: true,
            gatewaySummary: "Gateway ready"
        ),
        profiles: [],
        templates: [],
        healthChecks: [
            .init(id: "gateway", title: "Gateway", severity: "error", summary: "Blocked", detail: "Needs review", remediationActionIds: []),
            .init(id: "engine", title: "Engine", severity: "info", summary: "Healthy", detail: "Ready", remediationActionIds: [])
        ],
        recoveryActions: [],
        recentTasks: [
            .init(taskId: "task-1", title: "Draft status summary", status: "completed", summary: "Done", output: "", nextActions: [], startedAt: "2026-03-20T00:00:00.000Z", finishedAt: nil, steps: []),
            .init(taskId: "task-2", title: "Sync briefing", status: "running", summary: "Working", output: "", nextActions: [], startedAt: "2026-03-20T00:00:00.000Z", finishedAt: nil, steps: [])
        ]
    )
}

private func makeDashboardModelConfig() -> ModelConfigOverview {
    .init(
        providers: [],
        models: [],
        defaultModel: "MiniMax / minimax-chat",
        configuredModelKeys: ["minimax-chat", "gpt-5.4"],
        savedEntries: [],
        defaultEntryId: nil,
        fallbackEntryIds: []
    )
}

private func makeDashboardAITeamOverview() -> AITeamOverview {
    .init(
        teamVision: "",
        members: [
            .init(
                id: "member-1",
                agentId: "agent-1",
                source: "managed",
                hasManagedMetadata: true,
                name: "Research Analyst",
                jobTitle: "Analyst",
                status: "ready",
                currentStatus: "Standing by for research work.",
                activeTaskCount: 1,
                avatar: .init(presetId: "onboarding-analyst", accent: "#4f46e5", emoji: "A", theme: nil),
                brain: .init(entryId: "entry-1", label: "MiniMax", providerId: "minimax", modelKey: "minimax-chat"),
                teamIds: [],
                bindingCount: 0,
                bindings: [],
                lastUpdatedAt: "2026-03-20T00:00:00.000Z",
                personality: "",
                soul: "",
                workStyles: [],
                skillIds: [],
                knowledgePackIds: [],
                capabilitySettings: .init(memoryEnabled: true, contextWindow: 128000),
                agentDir: nil,
                workspaceDir: nil
            ),
            .init(
                id: "member-2",
                agentId: "agent-2",
                source: "managed",
                hasManagedMetadata: true,
                name: "Support Captain",
                jobTitle: "Support Lead",
                status: "busy",
                currentStatus: "Handling a customer-facing response.",
                activeTaskCount: 2,
                avatar: .init(presetId: "onboarding-guide", accent: "#16a34a", emoji: "S", theme: nil),
                brain: .init(entryId: "entry-2", label: "GPT-5.4", providerId: "openai", modelKey: "gpt-5.4"),
                teamIds: [],
                bindingCount: 0,
                bindings: [],
                lastUpdatedAt: "2026-03-20T00:00:00.000Z",
                personality: "",
                soul: "",
                workStyles: [],
                skillIds: [],
                knowledgePackIds: [],
                capabilitySettings: .init(memoryEnabled: true, contextWindow: 128000),
                agentDir: nil,
                workspaceDir: nil
            )
        ],
        teams: [],
        activity: [
            .init(id: "activity-1", memberId: "member-1", memberName: "Research Analyst", action: "Updated brief", description: "Published a status note.", timestamp: "2026-03-20 10:00", tone: "updated"),
            .init(id: "activity-2", memberId: "member-2", memberName: "Support Captain", action: "Started response", description: "Opened a customer follow-up.", timestamp: "2026-03-20 10:05", tone: "started")
        ],
        availableBrains: [],
        knowledgePacks: [],
        skillOptions: []
    )
}
