import { randomUUID } from "node:crypto";

import type {
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelAuthRequest,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SavedModelEntry,
  SetDefaultModelEntryRequest,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  PairingApprovalRequest,
  RecoveryAction,
  RecoveryRunResponse,
  FeishuSetupRequest,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";

import type { EngineAdapter } from "./adapter.js";

export class MockAdapter implements EngineAdapter {
  readonly installSpec: EngineInstallSpec = {
    engine: "openclaw",
    desiredVersion: "mock-compatible",
    installSource: "mock",
    prerequisites: ["None in mock mode"]
  };

  readonly capabilities: EngineCapabilities = {
    engine: "openclaw",
    supportsInstall: true,
    supportsUpdate: true,
    supportsRecovery: true,
    supportsStreaming: true,
    runtimeModes: ["gateway", "embedded", "local-llm"],
    supportedChannels: ["local-ui"],
    starterSkillCategories: ["communication", "research", "docs", "operations"],
    futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
  };

  private installed = true;
  private profileId = "email-admin";
  private savedEntries: SavedModelEntry[] = [
    {
      id: "mock-openai-gpt-4o-mini",
      label: "OpenAI GPT-4o Mini",
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      agentId: "main",
      authMethodId: "api-key",
      authModeLabel: "API key",
      profileLabel: "default",
      isDefault: true,
      isFallback: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "mock-openai-gpt-5",
      label: "OpenAI GPT-5",
      providerId: "openai",
      modelKey: "openai/gpt-5",
      agentId: "mock-agent-2",
      authMethodId: "api-key",
      authModeLabel: "API key",
      profileLabel: "default",
      isDefault: false,
      isFallback: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  private readonly providerCatalog: ModelProviderConfig[] = [
    {
      id: "openai",
      label: "OpenAI",
      description: "Mock OpenAI provider.",
      docsUrl: "https://docs.openclaw.ai/providers/docs/openai",
      providerRefs: ["openai/"],
      authMethods: [{ id: "api-key", label: "API Key", kind: "api-key", description: "Paste an API key.", interactive: false, fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }] }],
      configured: true,
      modelCount: 2,
      sampleModels: ["openai/gpt-4o-mini", "openai/gpt-5"]
    }
  ];
  private readonly channels: Record<string, ChannelSetupState> = {
    telegram: {
      id: "telegram",
      title: "Telegram",
      officialSupport: true,
      status: "ready",
      summary: "Mock Telegram setup is ready.",
      detail: "Mock mode simulates Telegram token setup and pairing approval."
    },
    whatsapp: {
      id: "whatsapp",
      title: "WhatsApp",
      officialSupport: true,
      status: "ready",
      summary: "Mock WhatsApp setup is ready.",
      detail: "Mock mode simulates WhatsApp login and pairing approval."
    },
    feishu: {
      id: "feishu",
      title: "Feishu (飞书)",
      officialSupport: true,
      status: "ready",
      summary: "Mock Feishu setup is ready.",
      detail: "Mock mode simulates the official OpenClaw Feishu plugin setup flow."
    },
    wechat: {
      id: "wechat",
      title: "WeChat workaround",
      officialSupport: false,
      status: "ready",
      summary: "Mock WeChat workaround is ready.",
      detail: "Mock mode simulates a community plugin workaround."
    }
  };

  async install(_autoConfigure = true, _options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    this.installed = true;
    return {
      status: "already-installed",
      message: "Mock OpenClaw runtime is deployed and ready for onboarding.",
      engineStatus: await this.status()
    };
  }

  async uninstall(): Promise<EngineActionResponse> {
    this.installed = false;
    return {
      action: "uninstall-engine",
      status: "completed",
      message: "Mock OpenClaw runtime was removed.",
      engineStatus: await this.status()
    };
  }

  async getModelConfig(): Promise<ModelConfigOverview> {
    const defaultEntry = this.savedEntries.find((entry) => entry.isDefault) ?? this.savedEntries[0];
    return {
      providers: this.providerCatalog,
      models: [
        {
          key: "openai/gpt-4o-mini",
          name: "GPT-4o Mini",
          input: "text+image",
          contextWindow: 128000,
          local: false,
          available: true,
          tags: ["default", "configured"],
          missing: false
        },
        {
          key: "openai/gpt-5",
          name: "GPT-5",
          input: "text+image",
          contextWindow: 400000,
          local: false,
          available: true,
          tags: ["configured"],
          missing: false
        }
      ],
      defaultModel: defaultEntry?.modelKey,
      configuredModelKeys: this.savedEntries.map((entry) => entry.modelKey),
      savedEntries: this.savedEntries,
      defaultEntryId: defaultEntry?.id,
      fallbackEntryIds: this.savedEntries.filter((entry) => entry.isFallback).map((entry) => entry.id)
    };
  }

  async createSavedModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    const now = new Date().toISOString();
    this.savedEntries = [
      ...this.savedEntries,
      {
        id: randomUUID(),
        label: request.label,
        providerId: request.providerId,
        modelKey: request.modelKey,
        agentId: request.makeDefault || request.useAsFallback ? `mock-${request.providerId}-${this.savedEntries.length + 1}` : "",
        authMethodId: request.methodId,
        authModeLabel: request.makeDefault || request.useAsFallback ? (request.methodId.includes("oauth") ? "OAuth" : "API key") : undefined,
        profileLabel: request.makeDefault || request.useAsFallback ? "default" : undefined,
        isDefault: Boolean(request.makeDefault),
        isFallback: Boolean(request.useAsFallback),
        createdAt: now,
        updatedAt: now
      }
    ].map((entry, index, list) => ({
      ...entry,
      isDefault: request.makeDefault ? index === list.length - 1 : entry.isDefault
    }));

    return {
      status: "completed",
      message: "Mock saved model entry created.",
      modelConfig: await this.getModelConfig()
    };
  }

  async updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    this.savedEntries = this.savedEntries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            label: request.label,
            providerId: request.providerId,
            modelKey: request.modelKey,
            authMethodId: request.methodId,
            agentId: request.makeDefault || request.useAsFallback ? entry.agentId || `mock-${request.providerId}-${this.savedEntries.length + 1}` : entry.agentId,
            authModeLabel: request.makeDefault || request.useAsFallback ? (request.methodId.includes("oauth") ? "OAuth" : "API key") : entry.authModeLabel,
            profileLabel: request.makeDefault || request.useAsFallback ? entry.profileLabel ?? "default" : entry.profileLabel,
            isDefault: Boolean(request.makeDefault),
            isFallback: Boolean(request.useAsFallback),
            updatedAt: new Date().toISOString()
          }
        : request.makeDefault
          ? { ...entry, isDefault: false }
          : entry
    );

    return {
      status: "completed",
      message: "Mock saved model entry updated.",
      modelConfig: await this.getModelConfig()
    };
  }

  async setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
    this.savedEntries = this.savedEntries.map((entry) => ({
      ...entry,
      isDefault: entry.id === request.entryId,
      isFallback: entry.id === request.entryId ? false : entry.isFallback,
      updatedAt: entry.id === request.entryId ? new Date().toISOString() : entry.updatedAt
    }));

    return {
      status: "completed",
      message: "Mock default entry updated.",
      modelConfig: await this.getModelConfig()
    };
  }

  async replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
    this.savedEntries = this.savedEntries.map((entry) => ({
      ...entry,
      isFallback: request.entryIds.includes(entry.id) && !entry.isDefault,
      updatedAt: request.entryIds.includes(entry.id) ? new Date().toISOString() : entry.updatedAt
    }));

    return {
      status: "completed",
      message: "Mock fallback entries updated.",
      modelConfig: await this.getModelConfig()
    };
  }

  async authenticateModelProvider(_request: ModelAuthRequest): Promise<ModelConfigActionResponse> {
    return {
      status: "completed",
      message: "Mock provider authentication completed.",
      modelConfig: await this.getModelConfig()
    };
  }

  async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    return {
      session: {
        id: sessionId,
        providerId: "openai",
        methodId: "openai-codex",
        status: "completed",
        message: "Mock interactive auth flow already completed.",
        logs: ["Mock auth session completed."]
      },
      modelConfig: await this.getModelConfig()
    };
  }

  async submitModelAuthSessionInput(sessionId: string, _request: ModelAuthSessionInputRequest): Promise<ModelAuthSessionResponse> {
    return this.getModelAuthSession(sessionId);
  }

  async setDefaultModel(modelKey: string): Promise<ModelConfigActionResponse> {
    const preferredEntry = this.savedEntries.find((entry) => entry.modelKey === modelKey);
    if (preferredEntry) {
      await this.setDefaultModelEntry({ entryId: preferredEntry.id });
    }

    return {
      status: "completed",
      message: `Mock default model set to ${modelKey}.`,
      modelConfig: await this.getModelConfig()
    };
  }

  async onboard(profileId: string): Promise<void> {
    this.profileId = profileId;
  }

  async configure(profileId: string): Promise<void> {
    this.profileId = profileId;
  }

  async status(): Promise<EngineStatus> {
    return {
      engine: "openclaw",
      installed: this.installed,
      running: this.installed,
      version: "mock",
      summary: "SlackClaw is running with a mock engine adapter.",
      lastCheckedAt: new Date().toISOString()
    };
  }

  async getDeploymentTargets(): Promise<DeploymentTargetsResponse> {
    const status = await this.status();

    return {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "standard",
          title: "OpenClaw Standard",
          description: "Reuse an existing compatible OpenClaw install when available.",
          installMode: "system",
          installed: this.installed,
          installable: true,
          planned: false,
          recommended: true,
          active: this.installed,
          version: status.version,
          desiredVersion: this.installSpec.desiredVersion,
          updateAvailable: false,
          summary: this.installed ? "Mock system OpenClaw is available." : "Mock system OpenClaw is not installed.",
          updateSummary: "Mock adapter is already on the recommended version."
        },
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Deploy a SlackClaw-managed local runtime under the app data directory.",
          installMode: "managed-local",
          installed: false,
          installable: true,
          planned: false,
          recommended: false,
          active: false,
          desiredVersion: this.installSpec.desiredVersion,
          updateAvailable: false,
          summary: "Mock managed local runtime is not installed."
        },
        {
          id: "zeroclaw",
          title: "ZeroClaw",
          description: "Reserved future engine adapter target.",
          installMode: "future",
          installed: false,
          installable: false,
          planned: true,
          recommended: false,
          active: false,
          updateAvailable: false,
          summary: "Planned future adapter."
        },
        {
          id: "ironclaw",
          title: "IronClaw",
          description: "Reserved future engine adapter target.",
          installMode: "future",
          installed: false,
          installable: false,
          planned: true,
          recommended: false,
          active: false,
          updateAvailable: false,
          summary: "Planned future adapter."
        }
      ]
    };
  }

  async updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    return {
      targetId,
      status: "completed",
      message:
        targetId === "standard"
          ? "Mock system OpenClaw is already on the current version."
          : "Mock managed local OpenClaw is already on the current version.",
      engineStatus: await this.status()
    };
  }

  async healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]> {
    return [
      {
        id: "engine-service",
        title: "Engine service",
        severity: "ok",
        summary: "Mock engine is ready.",
        detail: "This adapter keeps the UI usable before a real engine is connected.",
        remediationActionIds: []
      },
      {
        id: "default-profile",
        title: "Onboarding profile",
        severity: selectedProfileId ? "ok" : "info",
        summary: selectedProfileId ? "A default workflow profile is set." : "Choose a profile to finish onboarding.",
        detail: `Current mock default profile: ${this.profileId}.`,
        remediationActionIds: selectedProfileId ? [] : ["repair-config"]
      }
    ];
  }

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    return {
      taskId: randomUUID(),
      title: request.templateId ? `Mock ${request.templateId}` : "Mock task",
      status: "completed",
      summary: "Mock engine completed the task.",
      output: `Mock output for profile "${request.profileId}".\n\n${request.prompt}`,
      nextActions: ["Try a real engine", "Edit the task", "Export output"],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      steps: [
        { id: "prepare", label: "Preparing task", status: "done" },
        { id: "execute", label: "Generating mock output", status: "done" }
      ]
    };
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    return {
      message: "Mock engine is always on the recommended version.",
      engineStatus: await this.status()
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    return {
      actionId: action.id,
      status: "completed",
      message: `${action.title} completed in mock mode.`
    };
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    return {
      filename: "slackclaw-mock-diagnostics.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          adapter: "mock",
          profileId: this.profileId
        },
        null,
        2
      )
    };
  }

  async getChannelState(channelId: "telegram" | "whatsapp" | "feishu" | "wechat"): Promise<ChannelSetupState> {
    return this.channels[channelId];
  }

  async configureTelegram(_request: TelegramSetupRequest): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.telegram = {
      ...this.channels.telegram,
      status: "awaiting-pairing",
      summary: "Mock Telegram token saved.",
      detail: "Send a message to the bot, then approve the pairing code."
    };
    return { message: "Mock Telegram token saved.", channel: this.channels.telegram };
  }

  async startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.whatsapp = {
      ...this.channels.whatsapp,
      status: "awaiting-pairing",
      summary: "Mock WhatsApp login started.",
      detail: "Pretend a QR code was shown, then approve the pairing code."
    };
    return { message: "Mock WhatsApp login started.", channel: this.channels.whatsapp };
  }

  async approvePairing(
    channelId: "telegram" | "whatsapp" | "feishu",
    _request: PairingApprovalRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels[channelId] = {
      ...this.channels[channelId],
      status: "completed",
      summary: `Mock ${this.channels[channelId].title} pairing approved.`,
      detail: "Mock mode marked this channel as completed."
    };
    return { message: "Mock pairing approved.", channel: this.channels[channelId] };
  }

  async prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.feishu = {
      ...this.channels.feishu,
      status: "ready",
      summary: "Mock Feishu plugin installed.",
      detail: "Mock mode simulated `openclaw plugins install @openclaw/feishu`."
    };
    return { message: "Mock Feishu plugin installed.", channel: this.channels.feishu };
  }

  async configureFeishu(
    request: FeishuSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.feishu = {
      ...this.channels.feishu,
      status: "awaiting-pairing",
      summary: "Mock Feishu channel configured.",
      detail: `Mock mode saved App ID ${request.appId} for the ${request.domain ?? "feishu"} tenant. Send a DM to the bot, then approve the pairing code.`
    };
    return { message: "Mock Feishu channel configured.", channel: this.channels.feishu };
  }

  async configureWechatWorkaround(
    _request: WechatSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.wechat = {
      ...this.channels.wechat,
      status: "completed",
      summary: "Mock WeChat workaround configured.",
      detail: "Mock mode marked the community plugin workaround as configured."
    };
    return { message: "Mock WeChat workaround configured.", channel: this.channels.wechat };
  }

  async startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }> {
    return {
      message: "Mock gateway started.",
      engineStatus: await this.status()
    };
  }
}
