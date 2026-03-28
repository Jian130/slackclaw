import { randomUUID } from "node:crypto";

import type {
  AbortChatRequest,
  BindAIMemberChannelRequest,
  BrainAssignment,
  ChatMessage,
  ChatThreadDetail,
  DeleteAIMemberRequest,
  InstallSkillRequest,
  InstalledSkillDetail,
  KnowledgePack,
  MemberAvatar,
  MemberBindingSummary,
  MemberCapabilitySettings,
  PluginConfigOverview,
  SendChatMessageRequest,
  SupportedChannelId,
  ChannelSession,
  ChannelSessionInputRequest,
  ConfiguredChannelEntry,
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  GatewayActionResponse,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelAuthRequest,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  SaveModelEntryRequest,
  SavedModelEntry,
  SetDefaultModelEntryRequest,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
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
  UpdateSkillRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";
import { resolveReadableMemberAgentId } from "./member-agent-id.js";
import { OpenClawAIEmployeeManager } from "./openclaw-ai-employee-manager.js";
import { OpenClawConfigManager } from "./openclaw-config-manager.js";
import { OpenClawGatewayManager } from "./openclaw-gateway-manager.js";
import { OpenClawInstanceManager } from "./openclaw-instance-manager.js";
import { OpenClawPluginManager } from "./openclaw-plugin-manager.js";
import { appendGatewayApplyMessage, summarizePendingGatewayApply } from "./openclaw-shared.js";
import { listManagedPluginDefinitions, managedPluginDefinitionById, managedPluginDefinitionForFeature } from "../config/managed-plugins.js";

import type { EngineAdapter } from "./adapter.js";
import type {
  AIEmployeeManager,
  AIMemberRuntimeCandidate,
  AIMemberRuntimeRequest,
  AIMemberRuntimeState,
  EngineChatLiveEvent,
  EngineReadCacheResource,
  GatewayManager,
  InstanceManager,
  PluginManager,
  ManagedSkillInstallRequest,
  ManagedSkillInstallResult,
  ConfigManager,
  SkillRuntimeCatalog,
  SkillRuntimeEntry
} from "./adapter.js";

const MOCK_STANDARD_OPENCLAW_REQUIREMENTS = [
  "macOS",
  "Node.js 22 or newer",
  "A global openclaw CLI install for local mode",
  "pnpm only if you build OpenClaw from source"
];

const MOCK_MANAGED_OPENCLAW_REQUIREMENTS = [
  "macOS",
  "Node.js 22 or newer",
  "pnpm only if you build OpenClaw from source"
];

export class MockAdapter implements EngineAdapter {
  readonly instances: InstanceManager;
  readonly config: ConfigManager;
  readonly aiEmployees: AIEmployeeManager;
  readonly gateway: GatewayManager;
  readonly plugins: PluginManager;
  readonly installSpec: EngineInstallSpec = {
    engine: "openclaw",
    desiredVersion: "latest",
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

  invalidateReadCaches(_resources?: EngineReadCacheResource[]): void {}

  private installed = true;
  private pendingGatewayApply = false;
  private pendingGatewayApplySummary?: string;
  private profileId = "email-admin";
  private savedEntries: SavedModelEntry[] = [
    {
      id: "mock-openai-gpt-4o-mini",
      label: "OpenAI GPT-4o Mini",
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      agentId: "main",
      authMethodId: "openai-api-key",
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
      authMethodId: "openai-api-key",
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
      id: "minimax",
      label: "MiniMax",
      description: "Mock MiniMax provider.",
      docsUrl: "https://docs.openclaw.ai/providers/docs/minimax",
      providerRefs: ["minimax/"],
      authMethods: [
        {
          id: "minimax-api-key",
          label: "API Key",
          kind: "api-key",
          description: "Paste a MiniMax API key.",
          interactive: false,
          fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }]
        }
      ],
      configured: false,
      modelCount: 1,
      sampleModels: ["minimax/MiniMax-M2.5"]
    },
    {
      id: "modelstudio",
      label: "Model Studio",
      description: "Mock Alibaba Cloud Model Studio provider.",
      docsUrl: "https://docs.openclaw.ai/providers/docs/modelstudio",
      providerRefs: ["modelstudio/"],
      authMethods: [
        {
          id: "modelstudio-api-key-cn",
          label: "API Key",
          kind: "api-key",
          description: "Paste a Model Studio API key.",
          interactive: false,
          fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }]
        }
      ],
      configured: false,
      modelCount: 1,
      sampleModels: ["modelstudio/qwen3.5-plus"]
    },
    {
      id: "openai",
      label: "OpenAI",
      description: "Mock OpenAI provider.",
      docsUrl: "https://docs.openclaw.ai/providers/docs/openai",
      providerRefs: ["openai/", "openai-codex/"],
      authMethods: [
        { id: "openai-api-key", label: "API Key", kind: "api-key", description: "Paste an API key.", interactive: false, fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }] },
        { id: "openai-codex", label: "OAuth", kind: "oauth", description: "Connect with your OpenAI account.", interactive: true, fields: [] }
      ],
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
      status: "not-started",
      summary: "Mock Telegram setup has not started yet.",
      detail: "Mock mode simulates Telegram token setup and pairing approval."
    },
    whatsapp: {
      id: "whatsapp",
      title: "WhatsApp",
      officialSupport: true,
      status: "not-started",
      summary: "Mock WhatsApp setup has not started yet.",
      detail: "Mock mode simulates WhatsApp login and pairing approval."
    },
    feishu: {
      id: "feishu",
      title: "Feishu (飞书)",
      officialSupport: true,
      status: "not-started",
      summary: "Mock Feishu setup has not started yet.",
      detail: "Mock mode simulates the official OpenClaw Feishu plugin setup flow."
    },
    "wechat-work": {
      id: "wechat-work",
      title: "WeChat Work (WeCom)",
      officialSupport: true,
      status: "not-started",
      summary: "Mock WeChat Work setup has not started yet.",
      detail: "Mock mode simulates the managed WeCom plugin setup flow."
    },
    wechat: {
      id: "wechat",
      title: "WeChat",
      officialSupport: false,
      status: "not-started",
      summary: "Mock WeChat setup has not started yet.",
      detail: "Mock mode keeps personal WeChat distinct from WeChat Work."
    }
  };
  private activeChannelSession?: ChannelSession;
  private readonly managedPlugins = new Map(
    listManagedPluginDefinitions().map((definition) => [
      definition.id,
      {
        installed: false,
        enabled: false,
        hasUpdate: false,
        hasError: false,
        detail: "Plugin is not installed yet."
      }
    ])
  );
  private skillRuntimeCatalog: SkillRuntimeCatalog = {
    workspaceDir: "/mock/openclaw/workspace",
    managedSkillsDir: "/mock/openclaw/workspace/skills",
    marketplaceAvailable: true,
    marketplaceSummary: "Mock ClawHub is available.",
    readiness: {
      total: 3,
      eligible: 2,
      disabled: 0,
      blocked: 0,
      missing: 1,
      warnings: [],
      summary: "2 ready · 1 missing requirements"
    },
    skills: [
      {
        id: "weather",
        slug: "weather",
        name: "weather",
        description: "Weather forecasts.",
        source: "openclaw-bundled",
        bundled: true,
        eligible: true,
        disabled: false,
        blockedByAllowlist: false,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
        homepage: "https://wttr.in/:help",
        version: "1.0.0"
      },
      {
        id: "Skill Finder - Search Skills",
        slug: "skill-finder",
        name: "Skill Finder - Search Skills",
        description: "Find, evaluate, and recommend skills.",
        source: "openclaw-workspace",
        bundled: false,
        eligible: true,
        disabled: false,
        blockedByAllowlist: false,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
        homepage: "https://clawic.com/skills/skill-finder",
        version: "1.1.2",
        filePath: "/mock/openclaw/workspace/skills/skill-finder/SKILL.md",
        baseDir: "/mock/openclaw/workspace/skills/skill-finder"
      },
      {
        id: "slack",
        slug: "slack",
        name: "slack",
        description: "Slack operations.",
        source: "openclaw-bundled",
        bundled: true,
        eligible: false,
        disabled: false,
        blockedByAllowlist: false,
        missing: { bins: [], anyBins: [], env: [], config: ["channels.slack"], os: [] },
        version: "1.0.0"
      }
    ]
  };
  private marketplaceInstalled: Array<{ slug: string; version?: string }> = [
    { slug: "skill-finder", version: "1.1.2" }
  ];
  private marketplaceCatalog: SkillMarketplaceDetail[] = [
    {
      slug: "skill-finder",
      name: "Skill Finder",
      summary: "Find, compare, and install agent skills.",
      latestVersion: "1.1.5",
      updatedLabel: "just now",
      ownerHandle: "ivangdavila",
      ownerDisplayName: "Iván",
      ownerImageUrl: "https://example.com/avatar.png",
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
    },
    {
      slug: "weather-api",
      name: "Weather API",
      summary: "Query weather from a remote API.",
      latestVersion: "1.0.1",
      updatedLabel: "2 days ago",
      ownerHandle: "weather-team",
      downloads: 125,
      stars: 4,
      installed: false,
      curated: true,
      changelog: "Bug fixes.",
      license: "MIT",
      installsCurrent: 12,
      installsAllTime: 28,
      versions: 2,
      filePreview: "# Weather API"
    }
  ];
  private readonly memberRuntimeState = new Map<
    string,
    AIMemberRuntimeState & {
      name: string;
      jobTitle: string;
      avatar: MemberAvatar;
      personality: string;
      soul: string;
      workStyles: string[];
      skillIds: string[];
      capabilitySettings: MemberCapabilitySettings;
      knowledgePacks: KnowledgePack[];
      brain: BrainAssignment;
    }
  >();
  private readonly chatSessions = new Map<string, ChatMessage[]>();
  private readonly chatListeners = new Set<(event: EngineChatLiveEvent) => void>();
  private readonly activeChatTimers = new Map<string, NodeJS.Timeout[]>();

  constructor() {
    this.instances = new OpenClawInstanceManager(this);
    this.config = new OpenClawConfigManager({
      getModelConfig: () => this.getModelConfig(),
      createSavedModelEntry: (request) => this.createSavedModelEntry(request),
      updateSavedModelEntry: (entryId, request) => this.updateSavedModelEntry(entryId, request),
      removeSavedModelEntry: (entryId) => this.removeSavedModelEntry(entryId),
      setDefaultModelEntry: (request) => this.setDefaultModelEntry(request),
      replaceFallbackModelEntries: (request) => this.replaceFallbackModelEntries(request),
      authenticateModelProvider: (request) => this.authenticateModelProvider(request),
      getModelAuthSession: (sessionId) => this.getModelAuthSession(sessionId),
      submitModelAuthSessionInput: (sessionId, request) => this.submitModelAuthSessionInput(sessionId, request),
      setDefaultModel: (modelKey) => this.setDefaultModel(modelKey),
      getChannelState: (channelId) => this.getChannelState(channelId),
      getConfiguredChannelEntries: () => this.getConfiguredChannelEntries(),
      saveChannelEntry: (request) => this.saveChannelEntry(request),
      removeChannelEntry: (request) => this.removeChannelEntry(request),
      getSkillRuntimeCatalog: () => this.getSkillRuntimeCatalog(),
      getInstalledSkillDetail: (skillId) => this.getInstalledSkillDetail(skillId),
      listMarketplaceInstalledSkills: () => this.listMarketplaceInstalledSkills(),
      exploreSkillMarketplace: (limit) => this.exploreSkillMarketplace(limit),
      searchSkillMarketplace: (query, limit) => this.searchSkillMarketplace(query, limit),
      getSkillMarketplaceDetail: (slug) => this.getSkillMarketplaceDetail(slug),
      installMarketplaceSkill: (request) => this.installMarketplaceSkill(request),
      updateMarketplaceSkill: (slug, request) => this.updateMarketplaceSkill(slug, request),
      saveCustomSkill: (skillId, request) => this.saveCustomSkill(skillId, request),
      removeInstalledSkill: (slug, request) => this.removeInstalledSkill(slug, request),
      installManagedSkill: (request) => this.installManagedSkill(request),
      verifyManagedSkill: (slug) => this.verifyManagedSkill(slug)
    });
    this.aiEmployees = new OpenClawAIEmployeeManager({
      listAIMemberRuntimeCandidates: () => this.listAIMemberRuntimeCandidates(),
      saveAIMemberRuntime: (request) => this.saveAIMemberRuntime(request),
      getAIMemberBindings: (agentId) => this.getAIMemberBindings(agentId),
      bindAIMemberChannel: (agentId, request) => this.bindAIMemberChannel(agentId, request),
      unbindAIMemberChannel: (agentId, request) => this.unbindAIMemberChannel(agentId, request),
      deleteAIMemberRuntime: (agentId, request) => this.deleteAIMemberRuntime(agentId, request)
    });
    this.gateway = new OpenClawGatewayManager({
      restartGateway: () => this.restartGateway(),
      healthCheck: (selectedProfileId) => this.healthCheck(selectedProfileId),
      getActiveChannelSession: () => this.getActiveChannelSession(),
      getChannelSession: (sessionId) => this.getChannelSession(sessionId),
      submitChannelSessionInput: (sessionId, request) => this.submitChannelSessionInput(sessionId, request),
      runTask: (request) => this.runTask(request),
      getChatThreadDetail: (request) => this.getChatThreadDetail(request),
      subscribeToLiveChatEvents: (listener) => this.subscribeToLiveChatEvents(listener),
      sendChatMessage: (request) => this.sendChatMessage(request),
      abortChatMessage: (request) => this.abortChatMessage(request),
      startWhatsappLogin: () => this.startWhatsappLogin(),
      approvePairing: (channelId, request) => this.approvePairing(channelId, request),
      prepareFeishu: () => this.prepareFeishu(),
      startGatewayAfterChannels: () => this.startGatewayAfterChannels()
    });
    this.plugins = new OpenClawPluginManager({
      getConfigOverview: () => this.getPluginConfigOverview(),
      ensureFeatureRequirements: (featureId) => this.ensureFeatureRequirements(featureId),
      installPlugin: (pluginId) => this.installPlugin(pluginId),
      updatePlugin: (pluginId) => this.updatePlugin(pluginId),
      removePlugin: (pluginId) => this.removePlugin(pluginId)
    });
  }

  private markGatewayApplyPending(summary = summarizePendingGatewayApply()): void {
    this.pendingGatewayApply = true;
    this.pendingGatewayApplySummary = summary;
  }

  private clearGatewayApplyPending(): void {
    this.pendingGatewayApply = false;
    this.pendingGatewayApplySummary = undefined;
  }

  private mutationSyncMeta(settled = true) {
    return {
      epoch: "mock-daemon",
      revision: 0,
      settled
    } as const;
  }

  async install(_autoConfigure = true, _options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    this.installed = true;
    this.clearGatewayApplyPending();
    return {
      status: "already-installed",
      message: "Mock OpenClaw runtime is deployed and ready for onboarding.",
      engineStatus: await this.status()
    };
  }

  async installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    this.installed = true;
    this.clearGatewayApplyPending();
    return {
      targetId,
      status: "completed",
      message:
        targetId === "standard"
          ? "Mock standard OpenClaw runtime is deployed."
          : "Mock managed local OpenClaw runtime is deployed.",
      engineStatus: await this.status()
    };
  }

  async uninstall(): Promise<EngineActionResponse> {
    this.installed = false;
    this.clearGatewayApplyPending();
    return {
      action: "uninstall-engine",
      status: "completed",
      message: "Mock OpenClaw runtime was removed.",
      engineStatus: await this.status()
    };
  }

  async uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    this.installed = false;
    this.clearGatewayApplyPending();
    return {
      targetId,
      status: "completed",
      message:
        targetId === "standard"
          ? "Mock standard OpenClaw runtime was removed."
          : "Mock managed local OpenClaw runtime was removed.",
      engineStatus: await this.status()
    };
  }

  async getSkillRuntimeCatalog(): Promise<SkillRuntimeCatalog> {
    return this.skillRuntimeCatalog;
  }

  async getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail> {
    const skill = this.skillRuntimeCatalog.skills.find((entry) => entry.id === skillId);

    if (!skill) {
      throw new Error("Skill not found.");
    }

    return {
      ...skill,
      source: skill.source === "openclaw-bundled" ? "bundled" : skill.source === "openclaw-extra" ? "extra" : "workspace",
      readiness: skill.disabled ? "disabled" : skill.blockedByAllowlist ? "blocked" : skill.eligible ? "ready" : "missing",
      managedBy: this.marketplaceInstalled.some((entry) => entry.slug === skill.slug)
        ? "clawhub"
        : skill.source === "openclaw-workspace"
          ? "slackclaw-custom"
          : "openclaw",
      editable: skill.source === "openclaw-workspace" && !this.marketplaceInstalled.some((entry) => entry.slug === skill.slug),
      removable: skill.source === "openclaw-workspace",
      updatable: this.marketplaceInstalled.some((entry) => entry.slug === skill.slug),
      contentPreview: "# Mock skill"
    };
  }

  async listMarketplaceInstalledSkills(): Promise<Array<{ slug: string; version?: string }>> {
    return this.marketplaceInstalled;
  }

  async exploreSkillMarketplace(limit = 8): Promise<SkillMarketplaceEntry[]> {
    return this.marketplaceCatalog.slice(0, limit).map((entry) => ({ ...entry }));
  }

  async searchSkillMarketplace(query: string, limit = 10): Promise<SkillMarketplaceEntry[]> {
    const normalized = query.trim().toLowerCase();
    return this.marketplaceCatalog
      .filter((entry) => entry.slug.includes(normalized) || entry.name.toLowerCase().includes(normalized))
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }

  async getSkillMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail> {
    const entry = this.marketplaceCatalog.find((item) => item.slug === slug);

    if (!entry) {
      throw new Error("Marketplace skill not found.");
    }

    return { ...entry };
  }

  async installMarketplaceSkill(request: InstallSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const detail = this.marketplaceCatalog.find((entry) => entry.slug === request.slug);
    if (!detail) {
      throw new Error("Marketplace skill not found.");
    }

    if (!this.marketplaceInstalled.some((entry) => entry.slug === request.slug)) {
      this.marketplaceInstalled = [
        ...this.marketplaceInstalled,
        { slug: request.slug, version: request.version ?? detail.latestVersion }
      ];
      this.skillRuntimeCatalog = {
        ...this.skillRuntimeCatalog,
        skills: [
          ...this.skillRuntimeCatalog.skills,
          {
            id: detail.name,
            slug: detail.slug,
            name: detail.name,
            description: detail.summary,
            source: "openclaw-workspace",
            bundled: false,
            eligible: true,
            disabled: false,
            blockedByAllowlist: false,
            missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
            homepage: detail.homepage,
            version: request.version ?? detail.latestVersion,
            filePath: `/mock/openclaw/workspace/skills/${detail.slug}/SKILL.md`,
            baseDir: `/mock/openclaw/workspace/skills/${detail.slug}`
          }
        ],
        readiness: {
          ...this.skillRuntimeCatalog.readiness,
          total: this.skillRuntimeCatalog.readiness.total + 1,
          eligible: this.skillRuntimeCatalog.readiness.eligible + 1
        }
      };
    }

    this.markGatewayApplyPending();
    return { requiresGatewayApply: true };
  }

  async updateMarketplaceSkill(slug: string, request: UpdateSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const latestVersion = request.version ?? this.marketplaceCatalog.find((entry) => entry.slug === slug)?.latestVersion ?? "1.0.0";
    this.marketplaceInstalled = this.marketplaceInstalled.map((entry) => entry.slug === slug ? { ...entry, version: latestVersion } : entry);
    this.skillRuntimeCatalog = {
      ...this.skillRuntimeCatalog,
      skills: this.skillRuntimeCatalog.skills.map((entry) => entry.slug === slug ? { ...entry, version: latestVersion } : entry)
    };
    this.markGatewayApplyPending();
    return { requiresGatewayApply: true };
  }

  async saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<{ slug: string; requiresGatewayApply?: boolean }> {
    const slug = request.slug?.trim() || request.name.toLowerCase().replace(/\s+/g, "-");
    const nextSkill: SkillRuntimeEntry = {
      id: request.name,
      slug,
      name: request.name,
      description: request.description,
      source: "openclaw-workspace",
      bundled: false,
      eligible: true,
      disabled: false,
      blockedByAllowlist: false,
      missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
      homepage: request.homepage,
      version: "0.1.0",
      filePath: `/mock/openclaw/workspace/skills/${slug}/SKILL.md`,
      baseDir: `/mock/openclaw/workspace/skills/${slug}`
    };

    const exists = this.skillRuntimeCatalog.skills.some((entry) => entry.id === skillId || entry.slug === slug);
    this.skillRuntimeCatalog = {
      ...this.skillRuntimeCatalog,
      skills: exists
        ? this.skillRuntimeCatalog.skills.map((entry) => entry.id === skillId || entry.slug === slug ? nextSkill : entry)
        : [...this.skillRuntimeCatalog.skills, nextSkill],
      readiness: exists
        ? this.skillRuntimeCatalog.readiness
        : {
            ...this.skillRuntimeCatalog.readiness,
            total: this.skillRuntimeCatalog.readiness.total + 1,
            eligible: this.skillRuntimeCatalog.readiness.eligible + 1
          }
    };

    this.markGatewayApplyPending();
    return { slug, requiresGatewayApply: true };
  }

  async removeInstalledSkill(
    slug: string,
    _request: RemoveSkillRequest & { managedBy: "clawhub" | "slackclaw-custom" }
  ): Promise<{ requiresGatewayApply?: boolean }> {
    const removed = this.skillRuntimeCatalog.skills.find((entry) => entry.slug === slug);
    this.skillRuntimeCatalog = {
      ...this.skillRuntimeCatalog,
      skills: this.skillRuntimeCatalog.skills.filter((entry) => entry.slug !== slug),
      readiness: removed
        ? {
            ...this.skillRuntimeCatalog.readiness,
            total: this.skillRuntimeCatalog.readiness.total - 1,
            eligible: removed.eligible ? this.skillRuntimeCatalog.readiness.eligible - 1 : this.skillRuntimeCatalog.readiness.eligible
          }
        : this.skillRuntimeCatalog.readiness
    };
    this.marketplaceInstalled = this.marketplaceInstalled.filter((entry) => entry.slug !== slug);
    this.markGatewayApplyPending();
    return { requiresGatewayApply: true };
  }

  async installManagedSkill(request: ManagedSkillInstallRequest): Promise<ManagedSkillInstallResult> {
    const existing = this.skillRuntimeCatalog.skills.find((entry) => entry.slug === request.slug);
    if (existing) {
      return {
        runtimeSkillId: existing.id,
        version: existing.version,
        requiresGatewayApply: false
      };
    }

    if (request.installSource === "bundled") {
      const bundledSkill: SkillRuntimeEntry = {
        id: request.slug,
        slug: request.slug,
        name: request.slug
          .split("-")
          .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
          .join(" "),
        description: `Bundled managed skill ${request.slug}.`,
        source: "openclaw-workspace",
        bundled: true,
        eligible: true,
        disabled: false,
        blockedByAllowlist: false,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
        version: request.version ?? "1.0.0",
        filePath: `/mock/openclaw/workspace/skills/${request.slug}/SKILL.md`,
        baseDir: `/mock/openclaw/workspace/skills/${request.slug}`
      };

      this.skillRuntimeCatalog = {
        ...this.skillRuntimeCatalog,
        skills: [...this.skillRuntimeCatalog.skills, bundledSkill],
        readiness: {
          ...this.skillRuntimeCatalog.readiness,
          total: this.skillRuntimeCatalog.readiness.total + 1,
          eligible: this.skillRuntimeCatalog.readiness.eligible + 1
        }
      };
      this.markGatewayApplyPending();
      return {
        runtimeSkillId: bundledSkill.id,
        version: bundledSkill.version,
        requiresGatewayApply: true
      };
    }

    await this.installMarketplaceSkill({
      slug: request.slug,
      version: request.version
    });
    const installed = this.skillRuntimeCatalog.skills.find((entry) => entry.slug === request.slug);

    return {
      runtimeSkillId: installed?.id,
      version: installed?.version,
      requiresGatewayApply: true
    };
  }

  async verifyManagedSkill(slug: string): Promise<SkillRuntimeEntry | undefined> {
    return this.skillRuntimeCatalog.skills.find((entry) => entry.slug === slug && entry.eligible && !entry.disabled && !entry.blockedByAllowlist);
  }

  private async getModelConfig(): Promise<ModelConfigOverview> {
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
    this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock saved model entry created.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
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
    this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock saved model entry updated.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async removeSavedModelEntry(entryId: string): Promise<ModelConfigActionResponse> {
    const existing = this.savedEntries.find((entry) => entry.id === entryId);

    if (!existing) {
      throw new Error("Saved model entry not found.");
    }

    const remaining = this.savedEntries.filter((entry) => entry.id !== entryId);
    let nextDefaultId = remaining.find((entry) => entry.isDefault)?.id;
    let nextFallbackIds = remaining.filter((entry) => entry.isFallback).map((entry) => entry.id);

    if (existing.isDefault) {
      const promotedFallbackId = nextFallbackIds[0];

      if (!promotedFallbackId) {
        throw new Error("Set another default AI model before removing the current default model.");
      }

      nextDefaultId = promotedFallbackId;
      nextFallbackIds = nextFallbackIds.filter((id) => id !== promotedFallbackId);
    }

    this.savedEntries = remaining.map((entry) => ({
      ...entry,
      isDefault: entry.id === nextDefaultId,
      isFallback: nextFallbackIds.includes(entry.id),
      updatedAt: entry.id === nextDefaultId || nextFallbackIds.includes(entry.id) ? new Date().toISOString() : entry.updatedAt
    }));
    this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock saved model entry removed.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
    this.savedEntries = this.savedEntries.map((entry) => ({
      ...entry,
      isDefault: entry.id === request.entryId,
      isFallback: entry.id === request.entryId ? false : entry.isFallback,
      updatedAt: entry.id === request.entryId ? new Date().toISOString() : entry.updatedAt
    }));
    this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock default entry updated.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
    this.savedEntries = this.savedEntries.map((entry) => ({
      ...entry,
      isFallback: request.entryIds.includes(entry.id) && !entry.isDefault,
      updatedAt: request.entryIds.includes(entry.id) ? new Date().toISOString() : entry.updatedAt
    }));
    this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock fallback entries updated.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async authenticateModelProvider(_request: ModelAuthRequest): Promise<ModelConfigActionResponse> {
    this.markGatewayApplyPending();
    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: "Mock provider authentication completed.",
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  private async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
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
      ...this.mutationSyncMeta(),
      status: "completed",
      message: `Mock default model set to ${modelKey}.`,
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async configure(profileId: string): Promise<void> {
    this.profileId = profileId;
    this.markGatewayApplyPending("OpenClaw configuration was saved and is ready to apply.");
  }

  async status(): Promise<EngineStatus> {
    return {
      engine: "openclaw",
      installed: this.installed,
      running: this.installed,
      version: "mock",
      summary: this.pendingGatewayApply
        ? appendGatewayApplyMessage("SlackClaw is running with a mock engine adapter.")
        : "SlackClaw is running with a mock engine adapter.",
      lastCheckedAt: new Date().toISOString(),
      pendingGatewayApply: this.pendingGatewayApply,
      pendingGatewayApplySummary: this.pendingGatewayApply ? this.pendingGatewayApplySummary : undefined
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
          requirements: MOCK_STANDARD_OPENCLAW_REQUIREMENTS,
          requirementsSourceUrl: "https://docs.openclaw.ai/mac/bun",
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
          requirements: MOCK_MANAGED_OPENCLAW_REQUIREMENTS,
          requirementsSourceUrl: "https://docs.openclaw.ai/install",
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
          requirements: [],
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
          requirements: [],
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

  async restartGateway(): Promise<GatewayActionResponse> {
    this.clearGatewayApplyPending();
    return {
      action: "restart-gateway",
      status: "completed",
      message: "Mock OpenClaw gateway restarted and is reachable.",
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

  async getChannelState(channelId: SupportedChannelId): Promise<ChannelSetupState> {
    return this.channels[channelId];
  }

  async getConfiguredChannelEntries(): Promise<ConfiguredChannelEntry[]> {
    return (Object.entries(this.channels) as Array<[ConfiguredChannelEntry["channelId"], ChannelSetupState]>)
      .filter(([, channel]) => channel.status !== "not-started")
      .map(([channelId, channel]) => ({
        id: `${channelId}:default`,
        channelId,
        label: channel.title,
        status: channel.status,
        summary: channel.summary,
        detail: channel.detail,
        maskedConfigSummary: channelId === "whatsapp" ? [{ label: "Account", value: "Linked through OpenClaw" }] : [],
        editableValues: {},
        pairingRequired: channel.status === "awaiting-pairing",
        lastUpdatedAt: channel.lastUpdatedAt
      }));
  }

  async getActiveChannelSession(): Promise<ChannelSession | undefined> {
    return this.activeChannelSession;
  }

  async getChannelSession(sessionId: string): Promise<ChannelSession> {
    if (!this.activeChannelSession || this.activeChannelSession.id !== sessionId) {
      throw new Error("Mock channel session not found.");
    }

    return this.activeChannelSession;
  }

  async submitChannelSessionInput(_sessionId: string, _request: ChannelSessionInputRequest): Promise<ChannelSession> {
    throw new Error("Mock channel sessions do not accept direct input.");
  }

  private async saveChannelEntry(
    request: SaveChannelEntryRequest
  ): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession; requiresGatewayApply?: boolean }> {
    switch (request.channelId) {
      case "telegram":
        if (request.action === "approve-pairing") {
          return this.gateway.approvePairing("telegram", { code: request.values.code ?? "" });
        }

        return this.configureTelegram({ token: request.values.token ?? "", accountName: request.values.accountName });
      case "whatsapp":
        if (request.action === "approve-pairing") {
          return this.gateway.approvePairing("whatsapp", { code: request.values.code ?? "" });
        }

        {
          const result = await this.gateway.startWhatsappLogin();
          return {
            ...result,
            session: this.activeChannelSession
          };
        }
      case "feishu":
        if (request.action === "prepare") {
          return this.gateway.prepareFeishu();
        }

        if (request.action === "approve-pairing") {
          return this.gateway.approvePairing("feishu", { code: request.values.code ?? "" });
        }

        return this.configureFeishu({
          appId: request.values.appId ?? "",
          appSecret: request.values.appSecret ?? "",
          domain: request.values.domain,
          botName: request.values.botName
        });
      case "wechat-work":
        return this.configureWechatWorkaround({
          botId: request.values.botId ?? "",
          secret: request.values.secret ?? "",
        });
      case "wechat":
        throw new Error("Mock personal WeChat setup is not available through the generic credential form.");
      default:
        throw new Error("Unsupported mock channel.");
    }
  }

  async removeChannelEntry(
    request: RemoveChannelEntryRequest
  ): Promise<{ message: string; channelId: SupportedChannelId; requiresGatewayApply?: boolean }> {
    const channelId = (request.channelId ?? request.entryId.split(":")[0]) as SupportedChannelId;
    const template = new MockAdapter().channels[channelId];
    this.channels[channelId] = { ...template };
    if (this.activeChannelSession?.channelId === channelId) {
      this.activeChannelSession = undefined;
    }
    this.markGatewayApplyPending();

    return {
      message: `Mock ${template.title} configuration removed.`,
      channelId,
      requiresGatewayApply: true
    };
  }

  private async saveAIMemberRuntime(request: AIMemberRuntimeRequest): Promise<AIMemberRuntimeState & { requiresGatewayApply?: boolean }> {
    const agentId =
      request.existingAgentId ??
      resolveReadableMemberAgentId(
        request.name,
        [...this.memberRuntimeState.values()].map((entry) => entry.agentId)
      );
    const runtime: AIMemberRuntimeState = {
      agentId,
      agentDir: `/mock/agents/${agentId}`,
      workspaceDir: `/mock/workspaces/${request.memberId}`,
      bindings: this.memberRuntimeState.get(request.memberId)?.bindings ?? []
    };

    this.memberRuntimeState.set(request.memberId, {
      ...runtime,
      name: request.name,
      jobTitle: request.jobTitle,
      avatar: request.avatar,
      personality: request.personality,
      soul: request.soul,
      workStyles: request.workStyles,
      skillIds: request.skillIds,
      capabilitySettings: request.capabilitySettings,
      knowledgePacks: request.knowledgePacks,
      brain: request.brain
    });
    this.markGatewayApplyPending();

    return {
      ...runtime,
      requiresGatewayApply: true
    };
  }

  async listAIMemberRuntimeCandidates(): Promise<AIMemberRuntimeCandidate[]> {
    return [...this.memberRuntimeState.values()].map((entry) => ({
      agentId: entry.agentId,
      name: entry.name,
      modelKey: entry.brain.modelKey,
      agentDir: entry.agentDir,
      workspaceDir: entry.workspaceDir,
      bindingCount: entry.bindings.length,
      bindings: entry.bindings
    }));
  }

  async getAIMemberBindings(agentId: string): Promise<MemberBindingSummary[]> {
    const runtime = [...this.memberRuntimeState.values()].find((entry) => entry.agentId === agentId);
    return runtime?.bindings ?? [];
  }

  async bindAIMemberChannel(
    agentId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    const entry = [...this.memberRuntimeState.entries()].find(([, value]) => value.agentId === agentId);
    if (!entry) {
      return { bindings: [] };
    }

    const bindings = entry[1].bindings.some((binding) => binding.target === request.binding)
      ? entry[1].bindings
      : [...entry[1].bindings, { id: request.binding, target: request.binding }];

    this.memberRuntimeState.set(entry[0], {
      ...entry[1],
      bindings
    });
    this.markGatewayApplyPending();

    return {
      bindings,
      requiresGatewayApply: true
    };
  }

  async unbindAIMemberChannel(
    agentId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    const entry = [...this.memberRuntimeState.entries()].find(([, value]) => value.agentId === agentId);
    if (!entry) {
      return { bindings: [] };
    }

    const bindings = entry[1].bindings.filter((binding) => binding.target !== request.binding);
    this.memberRuntimeState.set(entry[0], {
      ...entry[1],
      bindings
    });
    this.markGatewayApplyPending();

    return {
      bindings,
      requiresGatewayApply: true
    };
  }

  async deleteAIMemberRuntime(agentId: string, _request: DeleteAIMemberRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const entry = [...this.memberRuntimeState.entries()].find(([, value]) => value.agentId === agentId);
    if (entry) {
      this.memberRuntimeState.delete(entry[0]);
      this.markGatewayApplyPending();
    }
    return { requiresGatewayApply: true };
  }

  async getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }): Promise<ChatThreadDetail> {
    return {
      id: request.threadId,
      memberId: "",
      agentId: request.agentId,
      sessionKey: request.sessionKey,
      title: "",
      createdAt: "",
      updatedAt: "",
      unreadCount: 0,
      historyStatus: "ready",
      composerState: {
        status: "idle",
        canSend: true,
        canAbort: false
      },
      messages: [...(this.chatSessions.get(request.sessionKey) ?? [])]
    };
  }

  private async subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void): Promise<() => void> {
    this.chatListeners.add(listener);
    listener({ type: "connected" });
    return () => {
      this.chatListeners.delete(listener);
    };
  }

  async sendChatMessage(
    request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }
  ): Promise<{ runId?: string }> {
    const existing = this.chatSessions.get(request.sessionKey) ?? [];
    const timestamp = new Date().toISOString();
    const runId = `mock-run-${randomUUID()}`;
    const userMessage: ChatMessage = {
      id: `${request.threadId}:user:${existing.length}`,
      role: "user",
      text: request.message,
      timestamp,
      clientMessageId: request.clientMessageId,
      status: "sent"
    };
    const assistantMessage: ChatMessage = {
      id: `${request.threadId}:assistant:${existing.length + 1}`,
      role: "assistant",
      text: `Mock reply from ${request.agentId}: ${request.message}`,
      timestamp,
      status: "sent"
    };
    this.chatSessions.set(request.sessionKey, [...existing, userMessage]);

    const timers = [
      setTimeout(() => {
        this.emitChatEvent({
          type: "assistant-tool-status",
          sessionKey: request.sessionKey,
          runId,
          activityLabel: "Using tools: mock-search",
          toolActivity: {
            id: "mock-search",
            label: "mock-search",
            status: "running"
          }
        });
      }, 5),
      setTimeout(() => {
        this.emitChatEvent({
          type: "assistant-delta",
          sessionKey: request.sessionKey,
          runId,
          message: {
            id: `${request.threadId}:assistant:stream`,
            role: "assistant",
            text: "Mock reply from",
            status: "streaming"
          }
        });
      }, 10),
      setTimeout(() => {
        this.chatSessions.set(request.sessionKey, [...(this.chatSessions.get(request.sessionKey) ?? []), assistantMessage]);
        this.emitChatEvent({
          type: "assistant-completed",
          sessionKey: request.sessionKey,
          runId
        });
        this.activeChatTimers.delete(request.sessionKey);
      }, 20)
    ];
    this.activeChatTimers.set(request.sessionKey, timers);

    return { runId };
  }

  async abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }): Promise<void> {
    for (const timer of this.activeChatTimers.get(request.sessionKey) ?? []) {
      clearTimeout(timer);
    }

    this.activeChatTimers.delete(request.sessionKey);
    this.emitChatEvent({
      type: "assistant-aborted",
      sessionKey: request.sessionKey
    });
  }

  async getPluginConfigOverview(): Promise<PluginConfigOverview> {
    return {
      entries: listManagedPluginDefinitions().map((definition) => {
        const state = this.managedPlugins.get(definition.id) ?? {
          installed: false,
          enabled: false,
          hasUpdate: false,
          hasError: false,
          detail: "Plugin is not installed yet."
        };
        const dependencies = definition.dependencies.map((dependency) => ({
          ...dependency,
          active: dependency.id === "channel:wechat-work" ? this.channels["wechat-work"].status !== "not-started" : false
        }));
        const activeDependentCount = dependencies.filter((dependency) => dependency.active).length;

        return {
          id: definition.id,
          label: definition.label,
          packageSpec: definition.packageSpec,
          runtimePluginId: definition.runtimePluginId,
          configKey: definition.configKey,
          status: state.hasError
            ? "error"
            : !state.installed
              ? "missing"
              : state.hasUpdate
                ? "update-available"
                : state.enabled
                  ? "ready"
                  : "blocked",
          summary: state.hasError
            ? "Plugin is in an error state."
            : !state.installed
              ? "Plugin is not installed."
              : state.hasUpdate
                ? "A managed plugin update is available."
                : state.enabled
                  ? "Plugin is ready."
                  : "Plugin is installed but disabled.",
          detail: state.detail,
          enabled: state.enabled,
          installed: state.installed,
          hasUpdate: state.hasUpdate,
          hasError: state.hasError,
          activeDependentCount,
          dependencies
        };
      })
    };
  }

  async ensureFeatureRequirements(featureId: string): Promise<PluginConfigOverview> {
    const definition = managedPluginDefinitionForFeature(featureId as "channel:wechat-work");
    if (!definition) {
      return this.getPluginConfigOverview();
    }

    const state = this.managedPlugins.get(definition.id);
    if (state) {
      state.installed = true;
      state.enabled = true;
      state.hasUpdate = false;
      state.hasError = false;
      state.detail = `Mock mode ensured ${definition.label} is installed and enabled.`;
    }

    return this.getPluginConfigOverview();
  }

  async installPlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const state = this.managedPlugins.get(pluginId);
    if (state) {
      state.installed = true;
      state.enabled = true;
      state.hasUpdate = false;
      state.hasError = false;
      state.detail = `Mock mode installed ${definition.packageSpec}.`;
    }

    return {
      message: `Mock installed ${definition.label}.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  async updatePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const state = this.managedPlugins.get(pluginId);
    if (state) {
      state.installed = true;
      state.enabled = true;
      state.hasUpdate = false;
      state.hasError = false;
      state.detail = `Mock mode updated ${definition.packageSpec}.`;
    }

    return {
      message: `Mock updated ${definition.label}.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  async removePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const overview = await this.getPluginConfigOverview();
    const entry = overview.entries.find((item) => item.id === pluginId);
    if ((entry?.activeDependentCount ?? 0) > 0) {
      throw new Error(`${definition.label} is still required by an active managed feature.`);
    }

    const state = this.managedPlugins.get(pluginId);
    if (state) {
      state.installed = false;
      state.enabled = false;
      state.hasUpdate = false;
      state.hasError = false;
      state.detail = "Plugin is not installed yet.";
    }

    return {
      message: `Mock removed ${definition.label}.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  private emitChatEvent(event: EngineChatLiveEvent): void {
    for (const listener of this.chatListeners) {
      listener(event);
    }
  }

  private async configureTelegram(
    _request: TelegramSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    this.channels.telegram = {
      ...this.channels.telegram,
      status: "awaiting-pairing",
      summary: "Mock Telegram token saved.",
      detail: "Send a message to the bot, then approve the pairing code."
    };
    this.markGatewayApplyPending();
    return { message: "Mock Telegram token saved.", channel: this.channels.telegram, requiresGatewayApply: true };
  }

  private async startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }> {
    this.channels.whatsapp = {
      ...this.channels.whatsapp,
      status: "awaiting-pairing",
      summary: "Mock WhatsApp login started.",
      detail: "Pretend a QR code was shown, then approve the pairing code."
    };
    this.activeChannelSession = {
      id: "whatsapp:default:login",
      channelId: "whatsapp",
      entryId: "whatsapp:default",
      status: "running",
      message: "Mock WhatsApp login started.",
      logs: ["Mock WhatsApp login session started."]
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
    if (this.activeChannelSession?.channelId === channelId) {
      this.activeChannelSession = {
        ...this.activeChannelSession,
        status: "completed",
        message: "Mock pairing approved.",
        logs: [...this.activeChannelSession.logs, "Mock pairing approved."]
      };
    }
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

  private async configureFeishu(
    request: FeishuSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    this.channels.feishu = {
      ...this.channels.feishu,
      status: "awaiting-pairing",
      summary: "Mock Feishu channel configured.",
      detail: `Mock mode saved App ID ${request.appId} for the ${request.domain ?? "feishu"} tenant. Send a DM to the bot, then approve the pairing code.`
    };
    this.markGatewayApplyPending();
    return { message: "Mock Feishu channel configured.", channel: this.channels.feishu, requiresGatewayApply: true };
  }

  private async configureWechatWorkaround(
    _request: WechatSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    this.channels["wechat-work"] = {
      ...this.channels["wechat-work"],
      status: "completed",
      summary: "Mock WeChat Work configured.",
      detail: "Mock mode marked the managed WeCom plugin flow as configured."
    };
    this.markGatewayApplyPending();
    return { message: "Mock WeChat Work configured.", channel: this.channels["wechat-work"], requiresGatewayApply: true };
  }

  async startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }> {
    this.clearGatewayApplyPending();
    return {
      message: "Mock gateway started.",
      engineStatus: await this.status()
    };
  }
}
