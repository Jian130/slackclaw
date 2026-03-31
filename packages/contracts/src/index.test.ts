import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultProductOverview,
  type DeploymentTargetsResponse,
  type AITeamOverview,
  type ChatActionResponse,
  type ChatBridgeState,
  type ChatToolActivity,
  type PluginConfigOverview,
  type ChillClawEvent,
  type ChatOverview,
  type ChannelConfigOverview,
  type ModelConfigOverview,
  type MutationSyncMeta,
  type OnboardingStateResponse,
  type PresetSkillSyncOverview,
  type RevisionedSnapshot,
  type SkillCatalogOverview,
  type SkillMarketplaceDetail
} from "./index.js";

test("default product overview starts with OpenClaw not installed", () => {
  const overview = createDefaultProductOverview();

  assert.equal(overview.engine.engine, "openclaw");
  assert.equal(overview.engine.installed, false);
  assert.equal(overview.installSpec.desiredVersion, "latest");
  assert.equal(overview.templates.length > 4, true);
  assert.equal(overview.recoveryActions.some((action) => action.id === "reinstall-engine"), true);
  assert.deepEqual(
    overview.channelSetup.channels.map((channel) => channel.id),
    ["telegram", "whatsapp", "feishu", "wechat-work", "wechat"]
  );
});

test("deployment target shapes serialize installed and available claw runtime targets", () => {
  const payload: DeploymentTargetsResponse = {
    checkedAt: new Date().toISOString(),
    targets: [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "Reuse an existing compatible install.",
        installMode: "system",
        installed: true,
        installable: true,
        planned: false,
        recommended: true,
        active: true,
        version: "2026.3.7",
        latestVersion: "2026.3.11",
        updateAvailable: true,
        summary: "Installed on this Mac.",
        requirements: ["macOS", "Node.js 22 or newer"],
        requirementsSourceUrl: "https://docs.openclaw.ai/install"
      },
      {
        id: "managed-local",
        title: "OpenClaw Managed Local",
        description: "ChillClaw-managed local runtime.",
        installMode: "managed-local",
        installed: false,
        installable: true,
        planned: false,
        recommended: false,
        active: false,
        latestVersion: "2026.3.11",
        updateAvailable: false,
        summary: "Available to install.",
        requirements: ["macOS", "Node.js 22 or newer"]
      }
    ]
  };

    const parsed = JSON.parse(JSON.stringify(payload)) as DeploymentTargetsResponse;
    assert.equal(parsed.targets[0]?.id, "standard");
    assert.equal(parsed.targets[0]?.installed, true);
    assert.equal(parsed.targets[0]?.requirements?.includes("Node.js 22 or newer"), true);
    assert.equal(parsed.targets[1]?.installMode, "managed-local");
  });

test("model config overview serializes providers, runtime models, and saved entries", () => {
  const payload: ModelConfigOverview = {
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        description: "OpenAI models.",
        docsUrl: "https://docs.openclaw.ai/providers/openai",
        providerRefs: ["openai/"],
        authMethods: [
          {
            id: "api-key",
            label: "API key",
            kind: "api-key",
            description: "Paste an API key.",
            interactive: false,
            fields: [{ id: "apiKey", label: "API key", required: true, secret: true }]
          }
        ],
        exampleModels: ["openai/gpt-5.4", "openai/gpt-5.4-pro"],
        authEnvVars: ["OPENAI_API_KEY", "OPENAI_API_KEYS"],
        setupNotes: ["Default transport is auto (WebSocket-first, SSE fallback)."],
        warnings: [],
        providerType: "built-in",
        supportsNoAuth: false,
        configured: true,
        modelCount: 2,
        sampleModels: ["openai/gpt-5"]
      }
    ],
    models: [
      {
        key: "openai/gpt-5",
        name: "GPT-5",
        input: "text",
        contextWindow: 400000,
        local: false,
        available: true,
        tags: ["default", "configured"],
        missing: false
      }
    ],
    defaultModel: "openai/gpt-5",
    configuredModelKeys: ["openai/gpt-5"],
    savedEntries: [
      {
        id: "entry-1",
        label: "OpenAI GPT-5",
        providerId: "openai",
        modelKey: "openai/gpt-5",
        agentId: "main",
        authMethodId: "api-key",
        authModeLabel: "API key",
        profileLabel: "default",
        isDefault: true,
        isFallback: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    defaultEntryId: "entry-1",
    fallbackEntryIds: []
  };

  const parsed = JSON.parse(JSON.stringify(payload)) as ModelConfigOverview;
  assert.equal(parsed.providers[0]?.id, "openai");
  assert.deepEqual(parsed.providers[0]?.exampleModels, ["openai/gpt-5.4", "openai/gpt-5.4-pro"]);
  assert.deepEqual(parsed.providers[0]?.authEnvVars, ["OPENAI_API_KEY", "OPENAI_API_KEYS"]);
  assert.deepEqual(parsed.providers[0]?.setupNotes, ["Default transport is auto (WebSocket-first, SSE fallback)."]);
  assert.equal(parsed.providers[0]?.providerType, "built-in");
  assert.equal(parsed.providers[0]?.supportsNoAuth, false);
  assert.equal(parsed.defaultModel, "openai/gpt-5");
  assert.equal(parsed.savedEntries[0]?.isDefault, true);
});

test("generic channel config shapes serialize with masked summaries and capabilities", () => {
  const overview: ChannelConfigOverview = {
    baseOnboardingCompleted: true,
    capabilities: [
      {
        id: "telegram",
        label: "Telegram",
        description: "Configure a Telegram bot.",
        officialSupport: true,
        iconKey: "TG",
        fieldDefs: [{ id: "token", label: "Bot token", required: true, secret: true }],
        supportsEdit: true,
        supportsRemove: true,
        supportsPairing: true,
        supportsLogin: false
      }
    ],
    entries: [
      {
        id: "telegram:default",
        channelId: "telegram",
        label: "Telegram",
        status: "awaiting-pairing",
        summary: "Telegram token saved.",
        detail: "Approve pairing next.",
        maskedConfigSummary: [{ label: "Bot token", value: "te...en" }],
        editableValues: { accountName: "Support Bot" },
        pairingRequired: true,
        lastUpdatedAt: new Date().toISOString()
      }
    ],
    gatewaySummary: "Gateway restarted after channel setup."
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as ChannelConfigOverview;

  assert.equal(parsed.capabilities[0].id, "telegram");
  assert.equal(parsed.entries[0].maskedConfigSummary[0].value, "te...en");
  assert.equal(parsed.entries[0].pairingRequired, true);
});

test("onboarding state response distinguishes wechat-work and wechat setup kinds", () => {
  const response: OnboardingStateResponse = {
    firstRun: {
      introCompleted: true,
      setupCompleted: false
    },
    draft: {
      currentStep: "channel"
    },
    config: {
      modelProviders: [],
      channels: [
        {
          id: "wechat-work",
          label: "WeChat Work (WeCom)",
          secondaryLabel: "企业微信",
          description: "Set up WeChat Work credentials for your digital employees.",
          theme: "wechat-work",
          setupKind: "wechat-work-guided",
          docsUrl: "https://work.weixin.qq.com/"
        },
        {
          id: "wechat",
          label: "WeChat",
          secondaryLabel: "微信",
          description: "Set up personal WeChat with a QR-first login flow.",
          theme: "wechat",
          setupKind: "wechat-guided"
        }
      ],
      employeePresets: []
    },
    summary: {}
  };

  assert.deepEqual(response.config.channels.map((channel) => channel.id), ["wechat-work", "wechat"]);
  assert.deepEqual(response.config.channels.map((channel) => channel.setupKind), ["wechat-work-guided", "wechat-guided"]);
});

test("plugin config overview serializes managed plugin entries and dependencies", () => {
  const overview: PluginConfigOverview = {
    entries: [
      {
        id: "wecom",
        label: "WeCom Plugin",
        packageSpec: "@wecom/wecom-openclaw-plugin",
        runtimePluginId: "wecom-openclaw-plugin",
        configKey: "wecom",
        status: "update-available",
        summary: "A newer managed plugin version is available.",
        detail: "WeChat depends on this plugin.",
        enabled: true,
        installed: true,
        hasUpdate: true,
        hasError: false,
        activeDependentCount: 1,
        dependencies: [
          {
            id: "channel:wechat",
            label: "WeChat Work",
            kind: "channel",
            active: true,
            summary: "Configured through ChillClaw."
          }
        ]
      }
    ]
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as PluginConfigOverview;

  assert.equal(parsed.entries[0]?.id, "wecom");
  assert.equal(parsed.entries[0]?.packageSpec, "@wecom/wecom-openclaw-plugin");
  assert.equal(parsed.entries[0]?.dependencies[0]?.id, "channel:wechat");
  assert.equal(parsed.entries[0]?.activeDependentCount, 1);
});

test("revisioned snapshot events serialize authoritative resource updates", () => {
  const snapshot: RevisionedSnapshot<ModelConfigOverview> = {
    epoch: "daemon-epoch-1",
    revision: 4,
    data: {
      providers: [],
      models: [],
      configuredModelKeys: [],
      savedEntries: [],
      fallbackEntryIds: []
    }
  };
  const event: ChillClawEvent = {
    type: "model-config.updated",
    snapshot
  };

  const parsed = JSON.parse(JSON.stringify(event)) as ChillClawEvent;

  assert.equal(parsed.type, "model-config.updated");
  assert.equal(parsed.snapshot.epoch, "daemon-epoch-1");
  assert.equal(parsed.snapshot.revision, 4);
  assert.deepEqual(parsed.snapshot.data.savedEntries, []);
});

test("plugin config events serialize authoritative plugin resource updates", () => {
  const snapshot: RevisionedSnapshot<PluginConfigOverview> = {
    epoch: "daemon-epoch-plugins",
    revision: 2,
    data: {
      entries: [
        {
          id: "wecom",
          label: "WeCom Plugin",
          packageSpec: "@wecom/wecom-openclaw-plugin",
          runtimePluginId: "wecom-openclaw-plugin",
          configKey: "wecom",
          status: "ready",
          summary: "Plugin is ready.",
          detail: "Managed by ChillClaw.",
          enabled: true,
          installed: true,
          hasUpdate: false,
          hasError: false,
          activeDependentCount: 0,
          dependencies: []
        }
      ]
    }
  };
  const event: ChillClawEvent = {
    type: "plugin-config.updated",
    snapshot
  };

  const parsed = JSON.parse(JSON.stringify(event)) as ChillClawEvent;

  assert.equal(parsed.type, "plugin-config.updated");
  assert.equal(parsed.snapshot.data.entries[0]?.runtimePluginId, "wecom-openclaw-plugin");
  assert.equal(parsed.snapshot.data.entries[0]?.status, "ready");
});

test("AI team overview serializes brain assignments and team membership", () => {
  const presetSkillSync: PresetSkillSyncOverview = {
    targetMode: "managed-local",
    entries: [
      {
        presetSkillId: "preset-research-brief",
        runtimeSlug: "research-brief",
        targetMode: "managed-local",
        status: "verified",
        installedVersion: "1.0.0",
        updatedAt: new Date().toISOString()
      }
    ],
    summary: "1 preset skill verified.",
    repairRecommended: false
  };
  const overview: AITeamOverview = {
    teamVision: "AI members help the team move routine work forward.",
    members: [
      {
        id: "member-1",
        agentId: "chillclaw-member-member-1",
        source: "chillclaw",
        hasManagedMetadata: true,
        name: "Alex Morgan",
        jobTitle: "Research Lead",
        status: "ready",
        currentStatus: "Ready for new assignments.",
        activeTaskCount: 0,
        avatar: {
          presetId: "operator",
          accent: "var(--avatar-1)",
          emoji: "🦊",
          theme: "sunrise"
        },
        brain: {
          entryId: "brain-1",
          label: "OpenAI GPT-5",
          providerId: "openai",
          modelKey: "openai/gpt-5"
        },
        teamIds: ["team-1"],
        bindingCount: 1,
        bindings: [{ id: "telegram", target: "telegram:support" }],
        lastUpdatedAt: new Date().toISOString(),
        personality: "Analytical and calm",
        soul: "Turn scattered requests into crisp next steps.",
        workStyles: ["Methodical"],
        presetSkillIds: ["research-brief"],
        skillIds: ["research-brief"],
        knowledgePackIds: ["company-handbook"],
        capabilitySettings: {
          memoryEnabled: true,
          contextWindow: 128000
        }
      }
    ],
    teams: [
      {
        id: "team-1",
        name: "Customer Ops",
        purpose: "Handle inbound operational requests.",
        memberIds: ["member-1"],
        memberCount: 1,
        updatedAt: new Date().toISOString()
      }
    ],
    activity: [],
    availableBrains: [],
    memberPresets: [
      {
        id: "general-assistant",
        label: "General Assistant",
        description: "Start with a reliable default kit for everyday work.",
        avatarPresetId: "operator",
        jobTitle: "General Assistant",
        personality: "Clear, practical, and dependable",
        soul: "Turn requests into useful next steps without extra overhead.",
        workStyles: ["Methodical", "Structured"],
        presetSkillIds: ["research-brief"],
        skillIds: ["research-brief"],
        knowledgePackIds: ["company-handbook"],
        defaultMemoryEnabled: true
      }
    ],
    knowledgePacks: [
      {
        id: "company-handbook",
        label: "Company handbook",
        description: "Core company rules and expectations.",
        content: "# Company handbook"
      }
    ],
    skillOptions: [
      {
        id: "research-brief",
        label: "Research brief",
        description: "Turn notes into a structured brief."
      }
    ],
    presetSkillSync
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as AITeamOverview;

  assert.equal(parsed.members[0].brain?.entryId, "brain-1");
  assert.equal(parsed.memberPresets[0].id, "general-assistant");
  assert.equal(parsed.memberPresets[0].jobTitle, "General Assistant");
  assert.deepEqual(parsed.members[0].presetSkillIds, ["research-brief"]);
  assert.equal(parsed.members[0].source, "chillclaw");
  assert.equal(parsed.members[0].hasManagedMetadata, true);
  assert.equal(parsed.members[0].bindingCount, 1);
  assert.equal(parsed.members[0].bindings[0]?.target, "telegram:support");
  assert.equal(parsed.teams[0].memberCount, 1);
  assert.equal(parsed.presetSkillSync?.entries[0]?.presetSkillId, "preset-research-brief");
});

test("AI member delete request serializes retention mode", () => {
  const payload = JSON.parse(JSON.stringify({ deleteMode: "keep-workspace" })) as { deleteMode: string };
  assert.equal(payload.deleteMode, "keep-workspace");
});

test("chat overview and action responses serialize thread state and messages", () => {
  const toolActivity: ChatToolActivity = {
    id: "tool-1",
    label: "Reading workspace files",
    status: "running",
    detail: "Inspecting the current thread context."
  };
  const bridgeState: ChatBridgeState = "reconnecting";
  const overview: ChatOverview = {
    threads: [
      {
        id: "thread-1",
        memberId: "member-1",
        agentId: "agent-1",
        sessionKey: "agent:agent-1:chillclaw-chat:thread-1",
        title: "Alex Morgan · Mar 14, 9:30 AM",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPreview: "Draft the weekly update.",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        historyStatus: "ready",
        composerState: {
          status: "idle",
          canSend: true,
          canAbort: false,
          bridgeState,
          toolActivities: [toolActivity]
        }
      }
    ]
  };

  const response: ChatActionResponse = {
    status: "completed",
    message: "Started a new chat.",
    overview,
    epoch: "daemon-epoch-1",
    revision: 9,
    settled: true,
    thread: {
      ...overview.threads[0],
      messages: [
        {
          id: "message-1",
          role: "user",
          text: "Draft the weekly update.",
          clientMessageId: "client-1",
          status: "sent"
        },
        {
          id: "message-2",
          role: "assistant",
          text: "Here is a first draft.",
          status: "sent"
        }
      ]
    }
  };

  const parsed = JSON.parse(JSON.stringify(response)) as ChatActionResponse;
  assert.equal(parsed.overview.threads[0]?.sessionKey, "agent:agent-1:chillclaw-chat:thread-1");
  assert.equal(parsed.overview.threads[0]?.unreadCount, 0);
  assert.equal(parsed.thread?.messages[1]?.role, "assistant");
  assert.equal(parsed.thread?.messages[0]?.clientMessageId, "client-1");
  assert.equal(parsed.thread?.composerState.canSend, true);
  assert.equal(parsed.thread?.composerState.bridgeState, "reconnecting");
  assert.equal(parsed.thread?.composerState.toolActivities?.[0]?.label, "Reading workspace files");
  assert.equal(parsed.epoch, "daemon-epoch-1");
  assert.equal(parsed.revision, 9);
  assert.equal(parsed.settled, true);
});

test("daemon event envelope serializes deploy, gateway, task, and chat updates", () => {
  const events: ChillClawEvent[] = [
    {
      type: "deploy.progress",
      correlationId: "corr-1",
      targetId: "managed-local",
      phase: "installing",
      percent: 50,
      message: "Installing OpenClaw."
    },
    {
      type: "gateway.status",
      reachable: true,
      pendingGatewayApply: false,
      summary: "Gateway is healthy."
    },
    {
      type: "task.progress",
      taskId: "task-1",
      status: "running",
      message: "Generating task summary."
    },
    {
      type: "chat.stream",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:chillclaw-chat:thread-1",
      payload: {
        type: "assistant-tool-status",
        threadId: "thread-1",
        sessionKey: "agent:agent-1:chillclaw-chat:thread-1",
        activityLabel: "Inspecting files",
        toolActivity: {
          id: "tool-1",
          label: "Inspecting files",
          status: "running"
        }
      }
    },
    {
      type: "overview.updated",
      snapshot: {
        epoch: "daemon-epoch-1",
        revision: 2,
        data: createDefaultProductOverview()
      }
    },
    {
      type: "chat.stream",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:chillclaw-chat:thread-1",
      payload: {
        type: "connection-state",
        threadId: "thread-1",
        state: "polling",
        detail: "Falling back to daemon polling."
      }
    },
    {
      type: "chat.stream",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:chillclaw-chat:thread-1",
      payload: {
        type: "assistant-delta",
        threadId: "thread-1",
        message: {
          id: "message-1",
          role: "assistant",
          text: "hello",
          status: "streaming"
        }
      }
    }
  ];

  const parsed = JSON.parse(JSON.stringify(events)) as ChillClawEvent[];
  assert.equal(parsed[0]?.type, "deploy.progress");
  assert.equal(parsed[0]?.targetId, "managed-local");
  assert.equal(parsed[1]?.type, "gateway.status");
  assert.equal(parsed[1]?.reachable, true);
  assert.equal(parsed[2]?.type, "task.progress");
  assert.equal(parsed[2]?.status, "running");
  assert.equal(parsed[3]?.type, "chat.stream");
  assert.equal(parsed[3]?.payload.type, "assistant-tool-status");
  assert.equal(parsed[3]?.payload.toolActivity.status, "running");
  assert.equal(parsed[4]?.type, "overview.updated");
  assert.equal(parsed[4]?.snapshot.revision, 2);
  assert.equal(parsed[5]?.type, "chat.stream");
  assert.equal(parsed[5]?.payload.type, "connection-state");
  assert.equal(parsed[6]?.type, "chat.stream");
  assert.equal(parsed[6]?.payload.type, "assistant-delta");
});

test("skill catalog overview serializes installed entries and readiness", () => {
  const presetSkillSync: PresetSkillSyncOverview = {
    targetMode: "reused-install",
    entries: [
      {
        presetSkillId: "preset-status-writer",
        runtimeSlug: "status-writer",
        targetMode: "reused-install",
        status: "failed",
        lastError: "Missing runtime package.",
        updatedAt: new Date().toISOString()
      }
    ],
    summary: "1 preset skill needs repair.",
    repairRecommended: true
  };
  const overview: SkillCatalogOverview = {
    managedSkillsDir: "/Users/home/.openclaw/workspace/skills",
    workspaceDir: "/Users/home/.openclaw/workspace",
    marketplaceAvailable: true,
    marketplaceSummary: "ClawHub is available.",
    installedSkills: [
      {
        id: "weather",
        slug: "weather",
        name: "weather",
        description: "Weather skill.",
        source: "bundled",
        bundled: true,
        eligible: true,
        disabled: false,
        blockedByAllowlist: false,
        readiness: "ready",
        missing: {
          bins: [],
          anyBins: [],
          env: [],
          config: [],
          os: []
        },
        homepage: "https://wttr.in/:help",
        version: "1.0.0",
        managedBy: "openclaw",
        editable: false,
        removable: false,
        updatable: false
      }
    ],
    readiness: {
      total: 1,
      eligible: 1,
      disabled: 0,
      blocked: 0,
      missing: 0,
      warnings: [],
      summary: "1 ready"
    },
    marketplacePreview: [],
    presetSkillSync
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as SkillCatalogOverview;
  assert.equal(parsed.installedSkills[0]?.managedBy, "openclaw");
  assert.equal(parsed.readiness.total, 1);
  assert.equal(parsed.presetSkillSync?.repairRecommended, true);
});

test("onboarding response serializes preset skill sync summary", () => {
  const response: OnboardingStateResponse = {
    firstRun: {
      introCompleted: false,
      setupCompleted: false
    },
    draft: {
      currentStep: "welcome"
    },
    config: {
      modelProviders: [],
      channels: [],
      employeePresets: []
    },
    summary: {
      install: {
        installed: true,
        version: "2026.3.11",
        disposition: "installed-managed"
      },
      model: {
        providerId: "openai",
        modelKey: "openai/gpt-5"
      },
      channel: {
        channelId: "telegram"
      },
      employee: {
        name: "Alex Morgan",
        jobTitle: "Research Lead",
        avatarPresetId: "operator"
      }
    },
    presetSkillSync: {
      targetMode: "managed-local",
      entries: [],
      summary: "No preset skills selected.",
      repairRecommended: false
    }
  };

  const parsed = JSON.parse(JSON.stringify(response)) as OnboardingStateResponse;
  assert.equal(parsed.presetSkillSync?.summary, "No preset skills selected.");
});

test("onboarding employee preset presentation carries daemon-owned avatar preset ids", () => {
  const response: OnboardingStateResponse = {
    firstRun: {
      introCompleted: false,
      setupCompleted: false
    },
    draft: {
      currentStep: "employee"
    },
    config: {
      modelProviders: [],
      channels: [],
      employeePresets: [
        {
          id: "research-analyst",
          label: "Research Analyst",
          description: "Research quickly, write crisp summaries, and keep answers grounded in the right context.",
          theme: "analyst",
          avatarPresetId: "onboarding-analyst",
          starterSkillLabels: ["Research Brief", "Status Writer"],
          toolLabels: ["Company handbook", "Delivery playbook"],
          presetSkillIds: ["research-brief", "status-writer"],
          knowledgePackIds: ["company-handbook", "delivery-playbook"],
          workStyles: ["Analytical", "Concise"],
          defaultMemoryEnabled: true
        }
      ]
    },
    summary: {}
  };

  const parsed = JSON.parse(JSON.stringify(response)) as OnboardingStateResponse;
  assert.equal(parsed.config.employeePresets[0]?.avatarPresetId, "onboarding-analyst");
});

test("mutation sync metadata serializes on action responses", () => {
  const sync: MutationSyncMeta = {
    epoch: "daemon-epoch-1",
    revision: 3,
    settled: false
  };

  const response: ChatActionResponse = {
    status: "completed",
    message: "Message sent.",
    overview: { threads: [] },
    ...sync
  };

  const parsed = JSON.parse(JSON.stringify(response)) as ChatActionResponse;

  assert.equal(parsed.epoch, "daemon-epoch-1");
  assert.equal(parsed.revision, 3);
  assert.equal(parsed.settled, false);
});

test("skill marketplace detail serializes install metadata", () => {
  const detail: SkillMarketplaceDetail = {
    slug: "skill-finder",
    name: "Skill Finder",
    summary: "Find skills.",
    latestVersion: "1.1.5",
    updatedLabel: "just now",
    ownerHandle: "ivangdavila",
    downloads: 4015,
    stars: 7,
    installed: true,
    curated: true,
    changelog: "Broader discovery guidance.",
    license: "MIT-0",
    installsCurrent: 29,
    installsAllTime: 32,
    versions: 11,
    filePreview: "# Skill Finder",
    homepage: "https://clawic.com/skills/skill-finder"
  };

  const parsed = JSON.parse(JSON.stringify(detail)) as SkillMarketplaceDetail;
  assert.equal(parsed.slug, "skill-finder");
  assert.equal(parsed.installed, true);
  assert.equal(parsed.filePreview, "# Skill Finder");
});
