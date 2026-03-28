import type {
  AbortChatRequest,
  BindAIMemberChannelRequest,
  BrainAssignment,
  ChatMessage,
  ChatToolActivity,
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
  ChannelSessionInputRequest,
  ChannelSession,
  ConfiguredChannelEntry,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  GatewayActionResponse,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSessionResponse,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ReplaceFallbackModelEntriesRequest,
  SkillReadinessSummary,
  SaveModelEntryRequest,
  SupportedChannelId,
  SkillOption,
  SetDefaultModelEntryRequest,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  PairingApprovalRequest,
  RecoveryAction,
  RecoveryRunResponse,
  UpdateSkillRequest
} from "@slackclaw/contracts";

export type EngineChatLiveEvent =
  | {
      type: "connected";
    }
  | {
      type: "disconnected";
      error?: string;
    }
  | {
      type: "assistant-delta";
      sessionKey: string;
      runId?: string;
      message: ChatMessage;
    }
  | {
      type: "assistant-completed";
      sessionKey: string;
      runId?: string;
    }
  | {
      type: "assistant-aborted";
      sessionKey: string;
      runId?: string;
    }
  | {
      type: "assistant-failed";
      sessionKey: string;
      runId?: string;
      error: string;
    }
  | {
      type: "assistant-tool-status";
      sessionKey: string;
      runId?: string;
      activityLabel: string;
      toolActivity: ChatToolActivity;
    };

export type EngineReadCacheResource = "engine" | "models" | "channels" | "plugins" | "skills" | "ai-members";

export interface ManagedSkillInstallRequest {
  slug: string;
  installSource: "bundled" | "clawhub";
  version?: string;
  bundledAssetPath?: string;
}

export interface ManagedSkillInstallResult {
  runtimeSkillId?: string;
  version?: string;
  requiresGatewayApply?: boolean;
}

export interface AIMemberRuntimeRequest {
  memberId: string;
  existingAgentId?: string;
  name: string;
  jobTitle: string;
  avatar: MemberAvatar;
  personality: string;
  soul: string;
  workStyles: string[];
  skillIds: string[];
  selectedSkills: SkillOption[];
  capabilitySettings: MemberCapabilitySettings;
  knowledgePacks: KnowledgePack[];
  brain: BrainAssignment;
}

export interface AIMemberRuntimeState {
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  bindings: MemberBindingSummary[];
}

export interface AIMemberRuntimeCandidate {
  agentId: string;
  name: string;
  emoji?: string;
  modelKey?: string;
  agentDir?: string;
  workspaceDir?: string;
  bindingCount: number;
  bindings: MemberBindingSummary[];
}

export interface SkillRuntimeEntry {
  id: string;
  slug?: string;
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  homepage?: string;
  version?: string;
  filePath?: string;
  baseDir?: string;
}

export interface SkillRuntimeCatalog {
  workspaceDir?: string;
  managedSkillsDir?: string;
  readiness: SkillReadinessSummary;
  marketplaceAvailable: boolean;
  marketplaceSummary: string;
  skills: SkillRuntimeEntry[];
}

export interface InstanceManager {
  install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse>;
  uninstall(): Promise<EngineActionResponse>;
  status(): Promise<EngineStatus>;
  getDeploymentTargets(): Promise<DeploymentTargetsResponse>;
  installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  update(): Promise<{ message: string; engineStatus: EngineStatus }>;
  repair(action: RecoveryAction): Promise<RecoveryRunResponse>;
  exportDiagnostics(): Promise<{ filename: string; content: string }>;
}

export interface ConfigManager {
  getModelConfig(): Promise<ModelConfigOverview>;
  createSavedModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse>;
  updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest): Promise<ModelConfigActionResponse>;
  removeSavedModelEntry(entryId: string): Promise<ModelConfigActionResponse>;
  setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse>;
  replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse>;
  authenticateModelProvider(request: ModelAuthRequest): Promise<ModelConfigActionResponse>;
  getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse>;
  submitModelAuthSessionInput(sessionId: string, request: ModelAuthSessionInputRequest): Promise<ModelAuthSessionResponse>;
  setDefaultModel(modelKey: string): Promise<ModelConfigActionResponse>;
  getChannelState(channelId: SupportedChannelId): Promise<ChannelSetupState>;
  getConfiguredChannelEntries(): Promise<ConfiguredChannelEntry[]>;
  saveChannelEntry(
    request: SaveChannelEntryRequest
  ): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession; requiresGatewayApply?: boolean }>;
  removeChannelEntry(
    request: RemoveChannelEntryRequest
  ): Promise<{ message: string; channelId: SupportedChannelId; requiresGatewayApply?: boolean }>;
  getSkillRuntimeCatalog(): Promise<SkillRuntimeCatalog>;
  getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail>;
  listMarketplaceInstalledSkills(): Promise<Array<{ slug: string; version?: string }>>;
  exploreSkillMarketplace(limit?: number): Promise<SkillMarketplaceEntry[]>;
  searchSkillMarketplace(query: string, limit?: number): Promise<SkillMarketplaceEntry[]>;
  getSkillMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail>;
  installMarketplaceSkill(request: InstallSkillRequest): Promise<{ requiresGatewayApply?: boolean }>;
  updateMarketplaceSkill(slug: string, request: UpdateSkillRequest): Promise<{ requiresGatewayApply?: boolean }>;
  saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<{ slug: string; requiresGatewayApply?: boolean }>;
  removeInstalledSkill(
    slug: string,
    request: RemoveSkillRequest & { managedBy: "clawhub" | "slackclaw-custom" }
  ): Promise<{ requiresGatewayApply?: boolean }>;
  installManagedSkill(request: ManagedSkillInstallRequest): Promise<ManagedSkillInstallResult>;
  verifyManagedSkill(slug: string): Promise<SkillRuntimeEntry | undefined>;
}

export interface AIEmployeeManager {
  listAIMemberRuntimeCandidates(): Promise<AIMemberRuntimeCandidate[]>;
  saveAIMemberRuntime(request: AIMemberRuntimeRequest): Promise<AIMemberRuntimeState & { requiresGatewayApply?: boolean }>;
  getAIMemberBindings(agentId: string): Promise<MemberBindingSummary[]>;
  bindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest): Promise<{
    bindings: MemberBindingSummary[];
    requiresGatewayApply?: boolean;
  }>;
  unbindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest): Promise<{
    bindings: MemberBindingSummary[];
    requiresGatewayApply?: boolean;
  }>;
  deleteAIMemberRuntime(agentId: string, request: DeleteAIMemberRequest): Promise<{ requiresGatewayApply?: boolean }>;
}

export interface GatewayManager {
  restartGateway(): Promise<GatewayActionResponse>;
  healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]>;
  getActiveChannelSession(): Promise<ChannelSession | undefined>;
  getChannelSession(sessionId: string): Promise<ChannelSession>;
  submitChannelSessionInput(sessionId: string, request: ChannelSessionInputRequest): Promise<ChannelSession>;
  runTask(request: EngineTaskRequest): Promise<EngineTaskResult>;
  getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }): Promise<ChatThreadDetail>;
  subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void): Promise<() => void>;
  sendChatMessage(
    request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }
  ): Promise<{ runId?: string }>;
  abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }): Promise<void>;
  startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }>;
  approvePairing(channelId: "telegram" | "whatsapp" | "feishu", request: PairingApprovalRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }>;
  finalizeOnboardingSetup(): Promise<{ message: string; engineStatus: EngineStatus }>;
  startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }>;
}

export interface PluginManager {
  getConfigOverview(): Promise<PluginConfigOverview>;
  ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }): Promise<PluginConfigOverview>;
  installPlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
  updatePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
  removePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
}

export interface EngineAdapter {
  readonly installSpec: EngineInstallSpec;
  readonly capabilities: EngineCapabilities;
  readonly instances: InstanceManager;
  readonly config: ConfigManager;
  readonly aiEmployees: AIEmployeeManager;
  readonly gateway: GatewayManager;
  readonly plugins: PluginManager;

  invalidateReadCaches(resources?: EngineReadCacheResource[]): void;
}
