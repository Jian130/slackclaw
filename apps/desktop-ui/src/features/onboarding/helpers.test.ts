import { describe, expect, it } from "vitest";

import type { ChannelConfigOverview, ChannelSession, OnboardingStep, ChillClawEvent } from "@chillclaw/contracts";

import {
  applyPresetSkillSyncToOnboardingState,
  applyOnboardingChannelSessionToConfig,
  buildExistingInstallAdvanceDraft,
  buildOnboardingMemberRequest,
  onboardingDestinationPath,
  onboardingRefreshResourceForEvent,
  resolveOnboardingEmployeePresetReadiness,
  resolveOnboardingModelSetupVariant,
  shouldShowOnboardingAuthMethodChooser,
  resolveOnboardingInstallViewState,
  resolveOnboardingModelPickerProviders,
  resolveOnboardingModelViewState,
  resolveOnboardingChannelPresentations,
  resolveOnboardingEmployeePresets,
  resolveOnboardingPresetSkillIds,
  resolveOnboardingActiveChannelSession,
  resolveOnboardingChannelSessionLogMode,
  resolveOnboardingChannelSetupVariant,
  shouldRefreshOnboardingChannelConfig,
  buildOnboardingChannelSaveValues,
  nextOnboardingStepAfterModelSave,
  resolveCompletedOnboardingChannelEntry,
  type ResolvedOnboardingModelProvider,
  resolveOnboardingProviderId,
  resolveOnboardingModelProviders
} from "./helpers.js";
import { onboardingCopy } from "./copy.js";

describe("onboarding helpers", () => {
  it("merges preset skill sync snapshots into the current onboarding state", () => {
    const onboardingState = {
      firstRun: {
        introCompleted: true,
        setupCompleted: false
      },
      draft: {
        currentStep: "employee" as const,
        employee: {
          name: "Ryo-AI",
          jobTitle: "Research Analyst",
          avatarPresetId: "onboarding-analyst",
          presetId: "research-analyst",
          personalityTraits: [],
          presetSkillIds: ["research-brief", "status-writer"],
          knowledgePackIds: [],
          workStyles: [],
          memoryEnabled: true
        }
      },
      config: {
        modelProviders: [],
        channels: [],
        employeePresets: []
      },
      summary: {},
      presetSkillSync: undefined
    };
    const presetSkillSync = {
      targetMode: "managed-local" as const,
      entries: [
        {
          presetSkillId: "research-brief",
          runtimeSlug: "research-brief",
          targetMode: "managed-local" as const,
          status: "verified" as const,
          updatedAt: "2026-03-29T00:00:00.000Z"
        }
      ],
      summary: "1 preset skill verified on the managed-local runtime.",
      repairRecommended: false
    };

    expect(applyPresetSkillSyncToOnboardingState(onboardingState, presetSkillSync)).toEqual({
      ...onboardingState,
      presetSkillSync
    });
  });

  it("leaves onboarding state untouched when a preset skill sync snapshot arrives too early", () => {
    const presetSkillSync = {
      targetMode: "managed-local" as const,
      entries: [],
      summary: "No preset skills selected.",
      repairRecommended: false
    };

    expect(applyPresetSkillSyncToOnboardingState(undefined, presetSkillSync)).toBeUndefined();
  });

  it("detects when the personal WeChat onboarding channel is already completed in the refreshed config", () => {
    const channelConfig: ChannelConfigOverview = {
      baseOnboardingCompleted: false,
      capabilities: [],
      entries: [
        {
          id: "wechat:default",
          channelId: "wechat",
          label: "WeChat",
          status: "completed",
          summary: "WeChat is configured in OpenClaw.",
          detail: "ChillClaw detected an existing configuration from the installed OpenClaw runtime.",
          maskedConfigSummary: [],
          editableValues: {},
          pairingRequired: false
        }
      ],
      gatewaySummary: "Ready"
    };

    expect(resolveCompletedOnboardingChannelEntry("wechat", "wechat:default", channelConfig)?.id).toBe("wechat:default");
  });

  it("overlays the latest onboarding channel session onto config snapshots", () => {
    const channelConfig: ChannelConfigOverview = {
      baseOnboardingCompleted: false,
      capabilities: [],
      entries: [],
      gatewaySummary: "Ready",
      activeSession: undefined
    };
    const session: ChannelSession = {
      id: "wechat:default:login",
      channelId: "wechat",
      entryId: "wechat:default",
      status: "running",
      message: "WeChat login is waiting for QR confirmation.",
      logs: [
        "Starting the personal WeChat installer.",
        "https://liteapp.weixin.qq.com/?qrcode=abc"
      ]
    };

    expect(applyOnboardingChannelSessionToConfig(channelConfig, session)).toEqual({
      ...channelConfig,
      activeSession: session
    });
  });

  it("uses the active WeChat session only while the onboarding draft still tracks it", () => {
    const activeSession: ChannelSession = {
      id: "wechat:default:login",
      channelId: "wechat",
      entryId: "wechat:default",
      status: "running",
      message: "WeChat login is waiting for QR confirmation.",
      logs: ["Starting the personal WeChat installer."]
    };
    const channelConfig: ChannelConfigOverview = {
      baseOnboardingCompleted: false,
      capabilities: [],
      entries: [],
      gatewaySummary: "Ready",
      activeSession
    };

    expect(
      resolveOnboardingActiveChannelSession(channelConfig, "wechat", "wechat:default:login")
    ).toEqual(activeSession);
    expect(
      resolveOnboardingActiveChannelSession(channelConfig, "wechat", undefined)
    ).toBeUndefined();
    expect(
      resolveOnboardingActiveChannelSession(channelConfig, "telegram", "wechat:default:login")
    ).toBeUndefined();
  });

  it("detects terminal QR blocks so the onboarding session log can render them scanably", () => {
    expect(
      resolveOnboardingChannelSessionLogMode([
        "WeChat login is waiting for QR confirmation.",
        "██  ██",
        "█ ██ █",
        "██  ██",
        "█ ██ █",
        "Scan with WeChat"
      ])
    ).toBe("qr");

    expect(
      resolveOnboardingChannelSessionLogMode([
        "Installing WeChat runtime helper",
        "Running installer",
        "Waiting for QR confirmation."
      ])
    ).toBe("plain");
  });

  it("skips redundant live channel-config refreshes while an onboarding channel session is active", () => {
    expect(
      shouldRefreshOnboardingChannelConfig("channel", {
        channelId: "wechat",
        entryId: "wechat:default"
      }, "wechat:default:login")
    ).toBe(false);

    expect(
      shouldRefreshOnboardingChannelConfig("channel", {
        channelId: "wechat",
        entryId: "wechat:default"
      }, undefined)
    ).toBe(true);
  });

  it("does not auto-complete onboarding for unfinished or non-WeChat channel entries", () => {
    const channelConfig: ChannelConfigOverview = {
      baseOnboardingCompleted: false,
      capabilities: [],
      entries: [
        {
          id: "wechat:default",
          channelId: "wechat",
          label: "WeChat",
          status: "awaiting-pairing",
          summary: "WeChat login started.",
          detail: "Scan the QR code to continue.",
          maskedConfigSummary: [],
          editableValues: {},
          pairingRequired: true
        },
        {
          id: "telegram:default",
          channelId: "telegram",
          label: "Telegram",
          status: "completed",
          summary: "Telegram is configured in OpenClaw.",
          detail: "Telegram is ready.",
          maskedConfigSummary: [],
          editableValues: {},
          pairingRequired: false
        }
      ],
      gatewaySummary: "Ready"
    };

    expect(resolveCompletedOnboardingChannelEntry("wechat", "wechat:default", channelConfig)).toBeUndefined();
    expect(resolveCompletedOnboardingChannelEntry("telegram", "telegram:default", channelConfig)).toBeUndefined();
  });

  it("advances successful non-interactive model setup to the channel step", () => {
    expect(nextOnboardingStepAfterModelSave(false)).toBe("channel");
    expect(nextOnboardingStepAfterModelSave(true)).toBe("model");
  });

  it("maps the final destination buttons to app routes", () => {
    expect(onboardingDestinationPath("team")).toBe("/team");
    expect(onboardingDestinationPath("dashboard")).toBe("/");
    expect(onboardingDestinationPath("chat")).toBe("/chat");
  });

  it("builds the onboarding AI employee request with deterministic hidden fields", () => {
    const request = buildOnboardingMemberRequest({
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      personalityTraits: [],
      presetSkillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      workStyles: ["Analytical", "Concise"],
      memoryEnabled: true,
      brainEntryId: "brain-1"
    });

    expect(request).toEqual({
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatar: {
        presetId: "onboarding-analyst",
        accent: "#97b5ea",
        emoji: "🧠",
        theme: "onboarding"
      },
      brainEntryId: "brain-1",
      personality: "Analytical, Concise",
      soul: "Analytical, Concise",
      workStyles: ["Analytical", "Concise"],
      presetSkillIds: ["research-brief", "status-writer"],
      skillIds: [],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      }
    });
  });

  it("maps daemon events to onboarding refresh resources by step", () => {
    const installEvent: ChillClawEvent = {
      type: "deploy.completed",
      correlationId: "install-1",
      targetId: "managed-local",
      status: "completed",
      message: "Installed.",
      engineStatus: {
        engine: "openclaw",
        installed: true,
        running: false,
        summary: "Installed",
        lastCheckedAt: "2026-03-21T00:00:00.000Z"
      }
    };
    const modelEvent: ChillClawEvent = {
      type: "model-config.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 3,
        data: {
          providers: [],
          models: [],
          savedEntries: [],
          configuredModelKeys: [],
          fallbackEntryIds: []
        }
      }
    };
    const channelEvent: ChillClawEvent = {
      type: "channel-config.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 4,
        data: {
          baseOnboardingCompleted: false,
          capabilities: [],
          entries: [],
          gatewaySummary: "Ready"
        }
      }
    };
    const employeeEvent: ChillClawEvent = {
      type: "ai-team.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 5,
        data: {
          teamVision: "",
          members: [],
          teams: [],
          activity: [],
          availableBrains: [],
          memberPresets: [],
          knowledgePacks: [],
          skillOptions: []
        }
      }
    };
    const presetSyncEvent: ChillClawEvent = {
      type: "preset-skill-sync.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 7,
        data: {
          targetMode: "managed-local",
          entries: [],
          summary: "No preset skills selected.",
          repairRecommended: false
        }
      }
    };

    expect(onboardingRefreshResourceForEvent("install", installEvent)).toBe("overview");
    expect(onboardingRefreshResourceForEvent("model", modelEvent)).toBeUndefined();
    expect(onboardingRefreshResourceForEvent("channel", channelEvent)).toBeUndefined();
    expect(onboardingRefreshResourceForEvent("employee", employeeEvent)).toBeUndefined();
    expect(onboardingRefreshResourceForEvent("employee", presetSyncEvent)).toBeUndefined();
  });

  it("ignores unrelated daemon events during onboarding", () => {
    const unrelatedEvent: ChillClawEvent = {
      type: "task.progress",
      taskId: "task-1",
      status: "running",
      message: "Working"
    };

    const steps: OnboardingStep[] = ["welcome", "install", "model", "channel", "employee"];
    for (const step of steps) {
      expect(onboardingRefreshResourceForEvent(step, unrelatedEvent)).toBeUndefined();
    }
  });

  it("uses the daemon-curated onboarding provider list instead of the full provider catalog", () => {
    const curatedProviders = resolveOnboardingModelProviders(
      {
        config: {
          modelProviders: [
          {
            id: "minimax",
            label: "MiniMax",
            description: "MiniMax models for onboarding.",
            theme: "minimax",
            platformUrl: "https://platform.minimaxi.com/login",
            tutorialVideoUrl: "https://video.example/minimax",
            defaultModelKey: "minimax/MiniMax-M2.7",
            authMethods: [
              { id: "minimax-api", label: "Global API Key", kind: "api-key", description: "Use the international MiniMax endpoint (api.minimax.io).", interactive: false, fields: [] },
              { id: "minimax-api-key-cn", label: "China API Key", kind: "api-key", description: "Use the China MiniMax endpoint (api.minimaxi.com).", interactive: false, fields: [] }
            ]
          },
          {
            id: "modelstudio",
            label: "Qwen (通义千问)",
            description: "Qwen models for onboarding.",
            theme: "qwen",
            platformUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
            defaultModelKey: "modelstudio/qwen3.5-plus",
            authMethods: [{ id: "modelstudio-api-key-cn", label: "API Key", kind: "api-key", description: "Paste a Model Studio API key.", interactive: false, fields: [] }]
          },
          {
            id: "openai",
            label: "ChatGPT",
            description: "OpenAI ChatGPT for onboarding.",
            theme: "chatgpt",
            platformUrl: "https://platform.openai.com/api-keys",
            defaultModelKey: "openai/gpt-5.1-codex",
            authMethods: [
              { id: "openai-api-key", label: "API Key", kind: "api-key", description: "Paste an OpenAI API key.", interactive: false, fields: [] },
              { id: "openai-codex", label: "OAuth", kind: "oauth", description: "Connect securely with your account.", interactive: true, fields: [] }
            ]
          }
        ]
      }
    } as never,
      {
        providers: [
          {
            id: "anthropic",
            label: "Anthropic",
            description: "Anthropic",
            docsUrl: "https://example.com/anthropic",
            providerRefs: ["anthropic/"],
            authMethods: [],
            configured: false,
            modelCount: 1,
            sampleModels: ["anthropic/claude-opus-4-1"]
          },
          {
            id: "minimax",
            label: "MiniMax",
            description: "MiniMax",
            docsUrl: "https://example.com/minimax",
            providerRefs: ["minimax/"],
            authMethods: [],
            configured: false,
            modelCount: 1,
            sampleModels: ["minimax/minimax-m1"]
          },
          {
            id: "modelstudio",
            label: "Model Studio",
            description: "Model Studio",
            docsUrl: "https://example.com/qwen",
            providerRefs: ["modelstudio/"],
            authMethods: [],
            configured: false,
            modelCount: 1,
            sampleModels: ["modelstudio/qwen3.5-plus"]
          },
          {
            id: "openai",
            label: "OpenAI (API + Codex)",
            description: "OpenAI",
            docsUrl: "https://example.com/openai",
            providerRefs: ["openai/"],
            authMethods: [],
            configured: false,
            modelCount: 1,
            sampleModels: ["openai/gpt-5"]
          }
        ],
        models: [],
        savedEntries: [],
        configuredModelKeys: []
      } as never
    );

    expect(curatedProviders.map((provider) => provider.id)).toEqual(["minimax", "modelstudio", "openai"]);
    expect(curatedProviders.map((provider) => provider.curated.label)).toEqual(["MiniMax", "Qwen (通义千问)", "ChatGPT"]);
    expect(curatedProviders.some((provider) => provider.provider?.id === "anthropic")).toBe(false);
    expect(curatedProviders[0]?.curated.authMethods.map((method) => method.id)).toEqual(["minimax-api", "minimax-api-key-cn"]);
    expect(curatedProviders[1]?.curated.authMethods.map((method) => method.id)).toEqual(["modelstudio-api-key-cn"]);
    expect(curatedProviders[2]?.curated.authMethods.map((method) => method.id)).toEqual(["openai-api-key", "openai-codex"]);
  });

  it("keeps the curated picker providers available even before the model catalog is ready", () => {
    const pickerProviders = resolveOnboardingModelPickerProviders({
      config: {
        modelProviders: [
          {
            id: "minimax",
            label: "MiniMax",
            description: "MiniMax models for onboarding.",
            theme: "minimax",
            platformUrl: "https://platform.minimaxi.com/login",
            tutorialVideoUrl: "https://video.example/minimax",
            defaultModelKey: "minimax/MiniMax-M2.7",
            authMethods: [
              { id: "minimax-api", label: "Global API Key", kind: "api-key", description: "Use the international MiniMax endpoint (api.minimax.io).", interactive: false, fields: [] },
              { id: "minimax-api-key-cn", label: "China API Key", kind: "api-key", description: "Use the China MiniMax endpoint (api.minimaxi.com).", interactive: false, fields: [] }
            ]
          },
          {
            id: "modelstudio",
            label: "Qwen (通义千问)",
            description: "Qwen models for onboarding.",
            theme: "qwen",
            platformUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
            defaultModelKey: "modelstudio/qwen3.5-plus",
            authMethods: [{ id: "modelstudio-api-key-cn", label: "API Key", kind: "api-key", description: "Paste a Model Studio API key.", interactive: false, fields: [] }]
          },
          {
            id: "openai",
            label: "ChatGPT",
            description: "OpenAI ChatGPT for onboarding.",
            theme: "chatgpt",
            platformUrl: "https://platform.openai.com/api-keys",
            defaultModelKey: "openai/gpt-5.1-codex",
            authMethods: [
              { id: "openai-api-key", label: "API Key", kind: "api-key", description: "Paste an OpenAI API key.", interactive: false, fields: [] },
              { id: "openai-codex", label: "OAuth", kind: "oauth", description: "Connect securely with your account.", interactive: true, fields: [] }
            ]
          }
        ]
      }
    } as never);

    expect(pickerProviders.map((provider) => provider.id)).toEqual(["minimax", "modelstudio", "openai"]);
    expect(pickerProviders.map((provider) => provider.label)).toEqual(["MiniMax", "Qwen (通义千问)", "ChatGPT"]);
  });

  it("uses the daemon-curated onboarding channel list instead of capability ordering", () => {
    const channels = resolveOnboardingChannelPresentations({
      config: {
        modelProviders: [],
        channels: [
          {
            id: "wechat-work",
            label: "WeChat Work (WeCom)",
            secondaryLabel: "企业微信",
            description: "Configure WeChat Work.",
            theme: "wechat-work",
            setupKind: "wechat-work-guided",
            docsUrl: "https://work.weixin.qq.com/"
          },
          {
            id: "wechat",
            label: "WeChat",
            secondaryLabel: "微信",
            description: "Configure personal WeChat.",
            theme: "wechat",
            setupKind: "wechat-guided",
          },
          {
            id: "feishu",
            label: "Feishu",
            secondaryLabel: "飞书",
            description: "Configure Feishu.",
            theme: "feishu",
            setupKind: "feishu-guided",
            platformUrl: "https://open.feishu.cn/app",
            tutorialVideoUrl: "https://video.example/feishu"
          },
          {
            id: "telegram",
            label: "Telegram",
            secondaryLabel: "Telegram",
            description: "Configure Telegram.",
            theme: "telegram",
            setupKind: "telegram-guided",
            docsUrl: "https://core.telegram.org/bots/tutorial"
          }
        ]
      }
    } as never);

    expect(channels.map((channel) => channel.id)).toEqual(["wechat-work", "wechat", "feishu", "telegram"]);
    expect(channels.map((channel) => channel.setupKind)).toEqual([
      "wechat-work-guided",
      "wechat-guided",
      "feishu-guided",
      "telegram-guided"
    ]);
  });

  it("uses the daemon-curated onboarding employee presets instead of runtime skill options", () => {
    const presets = resolveOnboardingEmployeePresets({
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
          },
          {
            id: "support-captain",
            label: "Support Captain",
            description: "Handle customer-facing requests with calm tone, clear follow-ups, and fast status updates.",
            theme: "support",
            avatarPresetId: "onboarding-guide",
            starterSkillLabels: ["Status Writer"],
            toolLabels: ["Customer voice", "Memory"],
            presetSkillIds: ["status-writer"],
            knowledgePackIds: ["customer-voice"],
            workStyles: ["Calm", "Supportive"],
            defaultMemoryEnabled: true
          },
          {
            id: "delivery-operator",
            label: "Delivery Operator",
            description: "Turn briefs into checklists, track milestones, and keep execution moving without extra setup.",
            theme: "operator",
            avatarPresetId: "onboarding-builder",
            starterSkillLabels: ["Research Brief"],
            toolLabels: ["Delivery playbook", "Company handbook"],
            presetSkillIds: ["research-brief"],
            knowledgePackIds: ["delivery-playbook", "company-handbook"],
            workStyles: ["Methodical", "Action-oriented"],
            defaultMemoryEnabled: true
          }
        ]
      }
    } as never);

    expect(presets.map((preset) => preset.id)).toEqual(["research-analyst", "support-captain", "delivery-operator"]);
    expect(presets[0]?.starterSkillLabels).toEqual(["Research Brief", "Status Writer"]);
    expect(presets[1]?.toolLabels).toEqual(["Customer voice", "Memory"]);
    expect(presets[2]?.knowledgePackIds).toEqual(["delivery-playbook", "company-handbook"]);
  });

  it("uses preset skill ids only for curated onboarding presets", () => {
    expect(
      resolveOnboardingPresetSkillIds({
        presetSkillIds: ["research-brief", "status-writer"]
      })
    ).toEqual(["research-brief", "status-writer"]);

    expect(
      resolveOnboardingPresetSkillIds({})
    ).toEqual([]);
  });

  it("marks onboarding employee presets ready only after all preset skills verify", () => {
    const preset = {
      id: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"]
    };

    expect(
      resolveOnboardingEmployeePresetReadiness(preset, {
        targetMode: "managed-local",
        entries: [
          {
            presetSkillId: "research-brief",
            runtimeSlug: "research-brief",
            targetMode: "managed-local",
            status: "verified",
            updatedAt: "2026-03-27T00:00:00.000Z"
          },
          {
            presetSkillId: "status-writer",
            runtimeSlug: "status-writer",
            targetMode: "managed-local",
            status: "verified",
            updatedAt: "2026-03-27T00:00:00.000Z"
          }
        ],
        summary: "2 preset skills verified on the managed-local runtime.",
        repairRecommended: false
      })
    ).toMatchObject({
      status: "ready",
      blocking: false
    });

    expect(
      resolveOnboardingEmployeePresetReadiness(preset, {
        targetMode: "managed-local",
        entries: [
          {
            presetSkillId: "research-brief",
            runtimeSlug: "research-brief",
            targetMode: "managed-local",
            status: "installing",
            updatedAt: "2026-03-27T00:00:00.000Z"
          }
        ],
        summary: "1 preset skill is syncing on the managed-local runtime.",
        repairRecommended: true
      })
    ).toMatchObject({
      status: "syncing",
      blocking: false
    });

    expect(
      resolveOnboardingEmployeePresetReadiness(preset, {
        targetMode: "managed-local",
        entries: [
          {
            presetSkillId: "research-brief",
            runtimeSlug: "research-brief",
            targetMode: "managed-local",
            status: "failed",
            lastError: "Missing skill install.",
            updatedAt: "2026-03-27T00:00:00.000Z"
          }
        ],
        summary: "1 preset skill needs repair on the managed-local runtime.",
        repairRecommended: true
      })
    ).toMatchObject({
      status: "repair",
      blocking: false,
      detail: "Missing skill install."
    });

    expect(resolveOnboardingEmployeePresetReadiness(preset, undefined)).toMatchObject({
      status: "install",
      label: "Prepared on finish",
      blocking: false
    });
  });

  it("uses provider-specific channel setup variants", () => {
    expect(resolveOnboardingChannelSetupVariant("wechat-work-guided")).toBe("wechat-work-guided");
    expect(resolveOnboardingChannelSetupVariant("wechat-guided")).toBe("wechat-guided");
    expect(resolveOnboardingChannelSetupVariant("feishu-guided")).toBe("feishu-guided");
    expect(resolveOnboardingChannelSetupVariant("telegram-guided")).toBe("telegram-guided");
  });

  it("keeps WeChat Work save values limited to Bot ID and Secret", () => {
    const values = buildOnboardingChannelSaveValues("wechat-work", {
      botId: "1000002",
      secret: "wechat-secret"
    });

    expect(values.botId).toBe("1000002");
    expect(values.secret).toBe("wechat-secret");
    expect(values).not.toHaveProperty("corpId");
    expect(values).not.toHaveProperty("agentId");
    expect(values).not.toHaveProperty("token");
    expect(values).not.toHaveProperty("encodingAesKey");
  });

  it("keeps personal WeChat onboarding QR-first with no hidden credential defaults", () => {
    const values = buildOnboardingChannelSaveValues("wechat", {});

    expect(values).toEqual({});
  });

  it("uses a guided setup variant for the MiniMax API key flow", () => {
    expect(
      resolveOnboardingModelSetupVariant({
        providerId: "minimax",
        methodKind: "api-key"
      })
    ).toBe("guided-minimax-api-key");

    expect(
      resolveOnboardingModelSetupVariant({
        providerId: "openai",
        methodKind: "api-key"
      })
    ).toBe("default-api-key");

    expect(
      resolveOnboardingModelSetupVariant({
        providerId: "openai",
        methodKind: "oauth"
      })
    ).toBe("oauth");
  });

  it("only shows the auth method chooser when a provider supports multiple methods", () => {
    expect(
      shouldShowOnboardingAuthMethodChooser([
        {
          id: "minimax-api",
          label: "API Key",
          kind: "api-key",
          description: "Paste a MiniMax API key.",
          interactive: false,
          fields: []
        }
      ])
    ).toBe(false);

    expect(
      shouldShowOnboardingAuthMethodChooser([
        {
          id: "openai-api-key",
          label: "API Key",
          kind: "api-key",
          description: "Paste an OpenAI API key.",
          interactive: false,
          fields: []
        },
        {
          id: "openai-codex",
          label: "OAuth",
          kind: "oauth",
          description: "Connect securely with your account.",
          interactive: true,
          fields: []
        }
      ])
    ).toBe(true);
  });

  it("does not auto-select a provider when onboarding has no saved model draft", () => {
    const providers: ResolvedOnboardingModelProvider[] = [
      {
        id: "minimax",
        curated: {
          id: "minimax",
          label: "MiniMax",
          description: "MiniMax models for onboarding.",
          theme: "minimax",
          platformUrl: "https://platform.minimaxi.com/login",
          defaultModelKey: "minimax/MiniMax-M2.7",
          authMethods: []
        },
        provider: {
          id: "minimax",
          label: "MiniMax",
          description: "MiniMax",
          docsUrl: "https://example.com/minimax",
          providerRefs: ["minimax/"],
          authMethods: [],
          configured: false,
          modelCount: 1,
          sampleModels: ["minimax/minimax-m1"]
        }
      }
    ];

    expect(resolveOnboardingProviderId("", undefined, [...providers])).toBe("");
    expect(resolveOnboardingProviderId("anthropic", undefined, [...providers])).toBe("");
    expect(resolveOnboardingProviderId("", "minimax", [...providers])).toBe("minimax");
  });

  it("prefers an explicit cleared draft provider over a stale local selection", () => {
    const providers = [{ id: "minimax" }, { id: "openai" }];

    expect(resolveOnboardingProviderId("openai", "", providers)).toBe("");
    expect(resolveOnboardingProviderId("openai", "minimax", providers)).toBe("minimax");
    expect(resolveOnboardingProviderId("openai", undefined, providers)).toBe("openai");
  });

  it("maps step 3 to picker, configure, and connected states", () => {
    const providers: ResolvedOnboardingModelProvider[] = [
      {
        id: "openai",
        curated: {
          id: "openai",
          label: "ChatGPT",
          description: "OpenAI ChatGPT for onboarding.",
          theme: "chatgpt",
          platformUrl: "https://platform.openai.com/api-keys",
          defaultModelKey: "openai/gpt-5.1-codex",
          authMethods: []
        },
        provider: {
          id: "openai",
          label: "OpenAI",
          description: "OpenAI",
          docsUrl: "https://example.com/openai",
          providerRefs: ["openai/"],
          authMethods: [],
          configured: false,
          modelCount: 1,
          sampleModels: ["openai/gpt-5"]
        }
      }
    ];

    expect(
      resolveOnboardingModelViewState({
        providerId: "",
        methodId: "",
        modelKey: "",
        providers,
        selectedEntry: undefined,
        draftEntryId: undefined,
        summaryEntryId: undefined,
        activeModelAuthSessionId: ""
      }).kind
    ).toBe("picker");

    expect(
      resolveOnboardingModelViewState({
        providerId: "openai",
        methodId: "api_key",
        modelKey: "openai/gpt-5",
        providers,
        selectedEntry: undefined,
        draftEntryId: undefined,
        summaryEntryId: undefined,
        activeModelAuthSessionId: ""
      }).kind
    ).toBe("configure");

    expect(
      resolveOnboardingModelViewState({
        providerId: "openai",
        methodId: "api_key",
        modelKey: "openai/gpt-5",
        providers,
        selectedEntry: {
          id: "entry-1",
          label: "ChatGPT",
          providerId: "openai",
          modelKey: "openai/gpt-5",
          agentId: "",
          authMethodId: "api_key",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z"
        },
        draftEntryId: "entry-1",
        summaryEntryId: undefined,
        activeModelAuthSessionId: ""
      }).kind
    ).toBe("connected");

    expect(
      resolveOnboardingModelViewState({
        providerId: "openai",
        methodId: "oauth",
        modelKey: "openai/gpt-5",
        providers,
        selectedEntry: {
          id: "entry-1",
          label: "ChatGPT",
          providerId: "openai",
          modelKey: "openai/gpt-5",
          agentId: "",
          authMethodId: "api_key",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z"
        },
        draftEntryId: "entry-1",
        summaryEntryId: undefined,
        activeModelAuthSessionId: ""
      }).kind
    ).toBe("configure");

    expect(
      resolveOnboardingModelViewState({
        providerId: "openai",
        methodId: "api_key",
        modelKey: "openai/gpt-5",
        providers,
        selectedEntry: {
          id: "entry-1",
          label: "ChatGPT",
          providerId: "openai",
          modelKey: "openai/gpt-5",
          agentId: "",
          authMethodId: "api_key",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z"
        },
        draftEntryId: "entry-1",
        summaryEntryId: undefined,
        activeModelAuthSessionId: "session-1"
      }).kind
    ).toBe("configure");
  });

  it("does not report connected until the saved model entry is persisted into onboarding state", () => {
    const providers: ResolvedOnboardingModelProvider[] = [
      {
        id: "openai",
        curated: {
          id: "openai",
          label: "ChatGPT",
          description: "OpenAI ChatGPT for onboarding.",
          theme: "chatgpt",
          platformUrl: "https://platform.openai.com/api-keys",
          defaultModelKey: "openai/gpt-5.1-codex",
          authMethods: []
        },
        provider: {
          id: "openai",
          label: "OpenAI",
          description: "OpenAI",
          docsUrl: "https://example.com/openai",
          providerRefs: ["openai/"],
          authMethods: [],
          configured: false,
          modelCount: 1,
          sampleModels: ["openai/gpt-5"]
        }
      }
    ];

    expect(
      resolveOnboardingModelViewState({
        providerId: "openai",
        methodId: "api_key",
        modelKey: "openai/gpt-5",
        providers,
        selectedEntry: {
          id: "entry-1",
          label: "ChatGPT",
          providerId: "openai",
          modelKey: "openai/gpt-5",
          agentId: "",
          authMethodId: "api_key",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z"
        },
        draftEntryId: undefined,
        summaryEntryId: undefined,
        activeModelAuthSessionId: ""
      }).kind
    ).toBe("configure");
  });

  it("uses the figma step-3 copy for curated provider setup", () => {
    const copy = onboardingCopy("en");

    expect(copy.modelTitle).toBe("Choose Your AI Model");
    expect(copy.modelBody).toBe("Select an AI provider to power your digital employees");
    expect(copy.providerTitle).toBe("Select a provider to get started");
    expect(copy.authTitle).toBe("How would you like to connect?");
  });

  it("keeps step one copy aligned with the curated Figma onboarding message", () => {
    const copy = onboardingCopy("en");

    expect(copy.welcomeBody).toBe("Build your OpenClaw-powered digital employee workspace in minutes");
    expect(copy.welcomeHighlights.map((highlight) => highlight.title)).toEqual([
      "One-Click Setup",
      "Personal AI Workspace",
      "Build Your First Digital Employee"
    ]);
    expect(copy.begin).toBe("Get My Workspace Ready");
  });

  it("maps the install step to the Figma missing, installing, found, and complete states", () => {
    const copy = onboardingCopy("en");

    expect(
      resolveOnboardingInstallViewState(
        {
          overview: {
            engine: {
              engine: "openclaw",
              installed: false,
              running: false,
              summary: "Missing",
              lastCheckedAt: "2026-03-22T00:00:00.000Z"
            }
          },
          busy: false
        },
        copy
      ).kind
    ).toBe("missing");

    expect(
      resolveOnboardingInstallViewState(
        {
          overview: {
            engine: {
              engine: "openclaw",
              installed: true,
              running: false,
              version: "2026.3.13",
              summary: "Installed",
              lastCheckedAt: "2026-03-22T00:00:00.000Z"
            }
          },
          busy: false
        },
        copy
      )
    ).toMatchObject({
      kind: "found",
      version: "2026.3.13"
    });

    expect(
      resolveOnboardingInstallViewState(
        {
          busy: true,
          progress: {
            phase: "verifying",
            percent: 82
          }
        },
        copy
      )
    ).toMatchObject({
      kind: "installing",
      progressPercent: 82,
      stageLabel: copy.installStageVerifying
    });

    expect(
      resolveOnboardingInstallViewState(
        {
          overview: {
            engine: {
              engine: "openclaw",
              installed: true,
              running: true,
              version: "2026.3.13",
              summary: "Installed",
              lastCheckedAt: "2026-03-22T00:00:00.000Z"
            }
          },
          install: {
            installed: true,
            version: "2026.3.13",
            disposition: "installed-managed"
          },
          busy: false
        },
        copy
      )
    ).toMatchObject({
      kind: "complete",
      version: "2026.3.13"
    });
  });

  it("advances to the permissions step when the user confirms an existing OpenClaw install", () => {
    expect(
      buildExistingInstallAdvanceDraft({
        engine: {
          engine: "openclaw",
          installed: true,
          running: false,
          version: "2026.3.13",
          summary: "Installed",
          lastCheckedAt: "2026-03-22T00:00:00.000Z"
        }
      })
    ).toEqual({
      currentStep: "permissions",
      install: {
        installed: true,
        version: "2026.3.13",
        disposition: "reused-existing"
      }
    });
  });
});
