import type {
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSessionResponse,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
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

export interface EngineAdapter {
  readonly installSpec: EngineInstallSpec;
  readonly capabilities: EngineCapabilities;

  install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse>;
  uninstall(): Promise<EngineActionResponse>;
  getModelConfig(): Promise<ModelConfigOverview>;
  createSavedModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse>;
  updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest): Promise<ModelConfigActionResponse>;
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
  configureTelegram(request: TelegramSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }>;
  approvePairing(channelId: "telegram" | "whatsapp" | "feishu", request: PairingApprovalRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }>;
  configureFeishu(request: FeishuSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  configureWechatWorkaround(request: WechatSetupRequest): Promise<{ message: string; channel: ChannelSetupState }>;
  startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }>;
}
