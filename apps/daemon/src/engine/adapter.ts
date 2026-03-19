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
  FeishuSetupRequest,
  TelegramSetupRequest,
  UpdateSkillRequest,
  WechatSetupRequest
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
      runId?: string;
      activityLabel: string;
    };

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

export interface EngineAdapter {
  readonly installSpec: EngineInstallSpec;
  readonly capabilities: EngineCapabilities;

  invalidateReadCaches(): void;

  install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse>;
  uninstall(): Promise<EngineActionResponse>;
  installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  restartGateway(): Promise<GatewayActionResponse>;
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
  onboard(profileId: string): Promise<void>;
  configure(profileId: string): Promise<void>;
  status(): Promise<EngineStatus>;
  getDeploymentTargets(): Promise<DeploymentTargetsResponse>;
  updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse>;
  healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]>;
  runTask(request: EngineTaskRequest): Promise<EngineTaskResult>;
  update(): Promise<{ message: string; engineStatus: EngineStatus }>;
  repair(action: RecoveryAction): Promise<RecoveryRunResponse>;
  exportDiagnostics(): Promise<{ filename: string; content: string }>;
  getChannelState(channelId: "telegram" | "whatsapp" | "feishu" | "wechat"): Promise<ChannelSetupState>;
  getConfiguredChannelEntries(): Promise<ConfiguredChannelEntry[]>;
  getActiveChannelSession(): Promise<ChannelSession | undefined>;
  getChannelSession(sessionId: string): Promise<ChannelSession>;
  submitChannelSessionInput(sessionId: string, request: ChannelSessionInputRequest): Promise<ChannelSession>;
  saveChannelEntry(
    request: SaveChannelEntryRequest
  ): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession }>;
  removeChannelEntry(request: RemoveChannelEntryRequest): Promise<{ message: string; channelId: "telegram" | "whatsapp" | "feishu" | "wechat" }>;
  getSkillRuntimeCatalog(): Promise<SkillRuntimeCatalog>;
  getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail>;
  listMarketplaceInstalledSkills(): Promise<Array<{ slug: string; version?: string }>>;
  exploreSkillMarketplace(limit?: number): Promise<SkillMarketplaceEntry[]>;
  searchSkillMarketplace(query: string, limit?: number): Promise<SkillMarketplaceEntry[]>;
  getSkillMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail>;
  installMarketplaceSkill(request: InstallSkillRequest): Promise<void>;
  updateMarketplaceSkill(slug: string, request: UpdateSkillRequest): Promise<void>;
  saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<{ slug: string }>;
  removeInstalledSkill(slug: string, request: RemoveSkillRequest & { managedBy: "clawhub" | "slackclaw-custom" }): Promise<void>;
  listAIMemberRuntimeCandidates(): Promise<AIMemberRuntimeCandidate[]>;
  saveAIMemberRuntime(request: AIMemberRuntimeRequest): Promise<AIMemberRuntimeState>;
  getAIMemberBindings(agentId: string): Promise<MemberBindingSummary[]>;
  bindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest): Promise<MemberBindingSummary[]>;
  unbindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest): Promise<MemberBindingSummary[]>;
  deleteAIMemberRuntime(agentId: string, request: DeleteAIMemberRequest): Promise<void>;
  getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }): Promise<ChatThreadDetail>;
  subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void): Promise<() => void>;
  sendChatMessage(
    request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }
  ): Promise<{ runId?: string }>;
  abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }): Promise<void>;
  configureTelegram(request: TelegramSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }>;
  approvePairing(channelId: "telegram" | "whatsapp" | "feishu", request: PairingApprovalRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }>;
  configureFeishu(request: FeishuSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  configureWechatWorkaround(request: WechatSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }>;
}
