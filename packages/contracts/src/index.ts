export type EngineKind = "openclaw" | "zeroclaw" | "ironclaw";

export type Severity = "ok" | "info" | "warning" | "error";
export type RecoverySafety = "safe" | "review" | "destructive";
export interface RevisionedSnapshot<T> {
  epoch: string;
  revision: number;
  data: T;
}

export interface MutationSyncMeta {
  epoch: string;
  revision: number;
  settled: boolean;
}

export type RecoveryActionType =
  | "restart-engine"
  | "repair-config"
  | "rollback-update"
  | "reinstall-engine"
  | "export-diagnostics";

export interface EngineCapabilities {
  engine: EngineKind;
  supportsInstall: boolean;
  supportsUpdate: boolean;
  supportsRecovery: boolean;
  supportsStreaming: boolean;
  runtimeModes: Array<"gateway" | "embedded" | "local-llm">;
  supportedChannels: string[];
  starterSkillCategories: string[];
  futureLocalModelFamilies: string[];
}

export interface EngineInstallSpec {
  engine: EngineKind;
  desiredVersion: string;
  installSource: "brew" | "bundle" | "manual" | "mock" | "npm-global" | "npm-local";
  prerequisites: string[];
  installPath?: string;
}

export interface EngineStatus {
  engine: EngineKind;
  installed: boolean;
  running: boolean;
  version?: string;
  summary: string;
  pendingGatewayApply?: boolean;
  pendingGatewayApplySummary?: string;
  lastCheckedAt: string;
}

export interface AppServiceStatus {
  mode: "launchagent" | "adhoc" | "unmanaged";
  installed: boolean;
  running: boolean;
  managedAtLogin: boolean;
  label?: string;
  summary: string;
  detail: string;
}

export interface HealthCheckResult {
  id: string;
  title: string;
  severity: Severity;
  summary: string;
  detail: string;
  remediationActionIds: string[];
}

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  title: string;
  description: string;
  safetyLevel: RecoverySafety;
  expectedImpact: string;
}

export interface EngineTaskRequest {
  prompt: string;
  profileId: string;
  templateId?: string;
  memberId?: string;
  memberAgentId?: string;
}

export interface EngineTaskStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
}

export type ModelAuthMethodKind = "api-key" | "oauth" | "setup-token" | "local" | "custom";

export interface ModelAuthField {
  id: string;
  label: string;
  required: boolean;
  secret?: boolean;
  placeholder?: string;
}

export interface ModelAuthMethod {
  id: string;
  label: string;
  kind: ModelAuthMethodKind;
  description: string;
  interactive: boolean;
  fields: ModelAuthField[];
}

export interface ModelCatalogEntry {
  key: string;
  name: string;
  input: string;
  contextWindow: number;
  local: boolean;
  available: boolean;
  tags: string[];
  missing: boolean;
}

export interface ModelProviderConfig {
  id: string;
  label: string;
  description: string;
  docsUrl: string;
  providerRefs: string[];
  authMethods: ModelAuthMethod[];
  configured: boolean;
  modelCount: number;
  sampleModels: string[];
}

export interface SavedModelEntry {
  id: string;
  label: string;
  providerId: string;
  modelKey: string;
  agentId: string;
  authMethodId?: string;
  authModeLabel?: string;
  profileLabel?: string;
  isDefault: boolean;
  isFallback: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigOverview {
  providers: ModelProviderConfig[];
  models: ModelCatalogEntry[];
  defaultModel?: string;
  configuredModelKeys: string[];
  savedEntries: SavedModelEntry[];
  defaultEntryId?: string;
  fallbackEntryIds: string[];
}

export interface EngineTaskResult {
  taskId: string;
  title: string;
  status: "running" | "completed" | "failed";
  summary: string;
  output: string;
  nextActions: string[];
  startedAt: string;
  finishedAt?: string;
  steps: EngineTaskStep[];
}

export interface TaskTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  promptHint: string;
}

export interface UserProfile {
  id: string;
  name: string;
  description: string;
  defaultTemplateIds: string[];
}

export interface InstallCheck {
  id: string;
  label: string;
  status: "pending" | "passed" | "action-required";
  detail: string;
}

export type DeploymentTargetId = "standard" | "managed-local" | "zeroclaw" | "ironclaw";

export interface DeploymentTargetStatus {
  id: DeploymentTargetId;
  title: string;
  description: string;
  installMode: "system" | "managed-local" | "future";
  installed: boolean;
  installable: boolean;
  planned: boolean;
  recommended: boolean;
  active: boolean;
  version?: string;
  desiredVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  summary: string;
  updateSummary?: string;
  requirements?: string[];
  requirementsSourceUrl?: string;
}

export interface DeploymentTargetsResponse {
  checkedAt: string;
  targets: DeploymentTargetStatus[];
}

export interface DeploymentTargetActionResponse {
  targetId: DeploymentTargetId;
  status: "completed" | "failed";
  message: string;
  engineStatus: EngineStatus;
}

export interface FirstRunState {
  introCompleted: boolean;
  setupCompleted: boolean;
  selectedProfileId?: string;
}

export type OnboardingStep = "welcome" | "install" | "permissions" | "model" | "channel" | "employee";
export type OnboardingDestination = "team" | "dashboard" | "chat";

export interface OnboardingInstallState {
  installed: boolean;
  version?: string;
  disposition?: "reused-existing" | "installed-managed" | "installed-system" | "not-installed";
  updateAvailable?: boolean;
  latestVersion?: string;
  updateSummary?: string;
}

export interface OnboardingPermissionsState {
  confirmed: boolean;
  confirmedAt?: string;
}

export interface OnboardingModelState {
  providerId: string;
  modelKey: string;
  methodId?: string;
  entryId?: string;
}

export interface OnboardingChannelState {
  channelId: SupportedChannelId;
  entryId?: string;
}

export type OnboardingChannelProgressStatus = "idle" | "capturing" | "staged";

export interface OnboardingChannelProgressState {
  status: OnboardingChannelProgressStatus;
  sessionId?: string;
  message?: string;
  requiresGatewayApply?: boolean;
}

export interface OnboardingEmployeeState {
  memberId?: string;
  name: string;
  jobTitle: string;
  avatarPresetId: string;
  presetId?: string;
  personalityTraits?: string[];
  presetSkillIds?: string[];
  knowledgePackIds?: string[];
  workStyles?: string[];
  memoryEnabled?: boolean;
}

export interface OnboardingDraftState {
  currentStep: OnboardingStep;
  install?: OnboardingInstallState;
  permissions?: OnboardingPermissionsState;
  model?: OnboardingModelState;
  channel?: OnboardingChannelState;
  channelProgress?: OnboardingChannelProgressState;
  employee?: OnboardingEmployeeState;
  activeModelAuthSessionId?: string;
  activeChannelSessionId?: string;
}

export interface OnboardingCompletionSummary {
  install?: OnboardingInstallState;
  model?: OnboardingModelState;
  channel?: OnboardingChannelState;
  employee?: OnboardingEmployeeState;
}

export type OnboardingModelProviderTheme = "minimax" | "qwen" | "chatgpt";
export type OnboardingChannelTheme = "wechat-work" | "wechat" | "feishu" | "telegram";
export type OnboardingChannelSetupKind =
  | "wechat-work-guided"
  | "wechat-guided"
  | "feishu-guided"
  | "telegram-guided";
export type OnboardingEmployeePresetTheme = "analyst" | "support" | "operator";

export interface OnboardingModelProviderPresentation {
  id: string;
  label: string;
  description: string;
  theme: OnboardingModelProviderTheme;
  platformUrl: string;
  tutorialVideoUrl?: string;
  defaultModelKey: string;
  authMethods: ModelAuthMethod[];
}

export interface OnboardingChannelPresentation {
  id: SupportedChannelId;
  label: string;
  secondaryLabel?: string;
  description: string;
  theme: OnboardingChannelTheme;
  setupKind: OnboardingChannelSetupKind;
  platformUrl?: string;
  docsUrl?: string;
  tutorialVideoUrl?: string;
}

export interface OnboardingEmployeePresetPresentation {
  id: string;
  label: string;
  description: string;
  theme: OnboardingEmployeePresetTheme;
  avatarPresetId: string;
  starterSkillLabels: string[];
  toolLabels: string[];
  presetSkillIds?: string[];
  knowledgePackIds: string[];
  workStyles: string[];
  defaultMemoryEnabled?: boolean;
}

export interface OnboardingUiConfig {
  modelProviders: OnboardingModelProviderPresentation[];
  channels: OnboardingChannelPresentation[];
  employeePresets: OnboardingEmployeePresetPresentation[];
}

export interface OnboardingStateResponse {
  firstRun: FirstRunState;
  draft: OnboardingDraftState;
  config: OnboardingUiConfig;
  summary: OnboardingCompletionSummary;
  presetSkillSync?: PresetSkillSyncOverview;
}

export interface UpdateOnboardingStateRequest {
  currentStep?: OnboardingStep;
  install?: OnboardingInstallState;
  permissions?: OnboardingPermissionsState;
  model?: OnboardingModelState;
  channel?: OnboardingChannelState;
  channelProgress?: OnboardingChannelProgressState;
  employee?: OnboardingEmployeeState;
  activeModelAuthSessionId?: string;
  activeChannelSessionId?: string;
}

export interface CompleteOnboardingRequest {
  destination?: OnboardingDestination;
}

export interface CompleteOnboardingResponse {
  status: "completed";
  destination?: OnboardingDestination;
  summary: OnboardingCompletionSummary;
  overview: ProductOverview;
}

export interface OnboardingStepNavigationRequest {
  step: OnboardingStep;
}

export interface SetupStepResult {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  detail: string;
}

export type SupportedChannelId = "telegram" | "whatsapp" | "feishu" | "wechat-work" | "wechat";

export interface ChannelSetupState {
  id: SupportedChannelId;
  title: string;
  officialSupport: boolean;
  status: "not-started" | "ready" | "in-progress" | "awaiting-pairing" | "completed" | "failed";
  summary: string;
  detail: string;
  lastUpdatedAt?: string;
  logs?: string[];
}

export interface ChannelSetupOverview {
  baseOnboardingCompleted: boolean;
  channels: ChannelSetupState[];
  nextChannelId?: SupportedChannelId;
  gatewayStarted: boolean;
  gatewaySummary: string;
}

export type ChannelFieldKind = "text" | "password" | "textarea" | "select";

export interface ChannelFieldOption {
  value: string;
  label: string;
}

export interface ChannelFieldDefinition {
  id: string;
  label: string;
  required: boolean;
  kind?: ChannelFieldKind;
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: ChannelFieldOption[];
}

export interface ChannelCapability {
  id: SupportedChannelId;
  label: string;
  description: string;
  officialSupport: boolean;
  iconKey: string;
  docsUrl?: string;
  fieldDefs: ChannelFieldDefinition[];
  supportsEdit: boolean;
  supportsRemove: boolean;
  supportsPairing: boolean;
  supportsLogin: boolean;
  guidedSetupKind?: "feishu" | "wechat-work" | "wechat";
}

export interface ChannelFieldSummary {
  label: string;
  value: string;
}

export interface ConfiguredChannelEntry {
  id: string;
  channelId: SupportedChannelId;
  label: string;
  status: ChannelSetupState["status"];
  summary: string;
  detail: string;
  maskedConfigSummary: ChannelFieldSummary[];
  editableValues: Record<string, string>;
  pairingRequired: boolean;
  lastUpdatedAt?: string;
}

export interface ChannelSession {
  id: string;
  channelId: SupportedChannelId;
  entryId?: string;
  status: "running" | "awaiting-input" | "completed" | "failed";
  message: string;
  logs: string[];
  launchUrl?: string;
  inputPrompt?: string;
}

export interface ChannelConfigOverview {
  baseOnboardingCompleted: boolean;
  capabilities: ChannelCapability[];
  entries: ConfiguredChannelEntry[];
  activeSession?: ChannelSession;
  gatewaySummary: string;
}

export type ManagedPluginStatus =
  | "missing"
  | "installing"
  | "updating"
  | "ready"
  | "update-available"
  | "blocked"
  | "error";

export type ManagedPluginAction = "install" | "update" | "remove";

export interface ManagedPluginDependency {
  id: string;
  label: string;
  kind: "channel" | "model" | "skill" | "feature";
  active: boolean;
  summary: string;
}

export interface ManagedPluginEntry {
  id: string;
  label: string;
  packageSpec: string;
  runtimePluginId: string;
  configKey: string;
  status: ManagedPluginStatus;
  summary: string;
  detail: string;
  enabled: boolean;
  installed: boolean;
  hasUpdate: boolean;
  hasError: boolean;
  activeDependentCount: number;
  dependencies: ManagedPluginDependency[];
}

export interface PluginConfigOverview {
  entries: ManagedPluginEntry[];
}

export interface BrainAssignment {
  entryId: string;
  label: string;
  providerId: string;
  modelKey: string;
}

export interface MemberAvatar {
  presetId: string;
  accent: string;
  emoji: string;
  theme?: string;
}

export interface MemberCapabilitySettings {
  memoryEnabled: boolean;
  contextWindow: number;
}

export interface KnowledgePack {
  id: string;
  label: string;
  description: string;
  content: string;
}

export interface SkillOption {
  id: string;
  label: string;
  description: string;
}

export interface SkillRequirementSummary {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export type PresetSkillInstallSource = "bundled" | "clawhub";
export type PresetSkillTargetMode = "managed-local" | "reused-install";
export type PresetSkillSyncStatus = "pending" | "installing" | "installed" | "verified" | "failed";

export interface PresetSkillDefinition {
  id: string;
  label: string;
  description: string;
  onboardingSafe: boolean;
  runtimeSlug: string;
  installSource: PresetSkillInstallSource;
  pinnedVersion?: string;
  bundledAssetPath?: string;
}

export interface PresetSkillSyncEntry {
  presetSkillId: string;
  runtimeSlug: string;
  targetMode: PresetSkillTargetMode;
  status: PresetSkillSyncStatus;
  installedVersion?: string;
  lastError?: string;
  updatedAt: string;
}

export interface PresetSkillSyncOverview {
  targetMode: PresetSkillTargetMode;
  entries: PresetSkillSyncEntry[];
  summary: string;
  repairRecommended: boolean;
}

export type InstalledSkillSource = "bundled" | "workspace" | "extra" | "clawhub" | "custom";
export type SkillManagerKind = "openclaw" | "clawhub" | "chillclaw-custom";

export interface InstalledSkillEntry {
  id: string;
  slug?: string;
  name: string;
  description: string;
  source: InstalledSkillSource;
  bundled: boolean;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  readiness: "ready" | "missing" | "disabled" | "blocked";
  missing: SkillRequirementSummary;
  homepage?: string;
  version?: string;
  managedBy: SkillManagerKind;
  editable: boolean;
  removable: boolean;
  updatable: boolean;
}

export interface InstalledSkillDetail extends InstalledSkillEntry {
  filePath?: string;
  baseDir?: string;
  contentPreview?: string;
}

export interface SkillMarketplaceEntry {
  slug: string;
  name: string;
  summary: string;
  latestVersion?: string;
  updatedLabel?: string;
  ownerHandle?: string;
  downloads?: number;
  stars?: number;
  installed: boolean;
  curated: boolean;
}

export interface SkillMarketplaceDetail extends SkillMarketplaceEntry {
  ownerDisplayName?: string;
  ownerImageUrl?: string;
  changelog?: string;
  license?: string;
  installsCurrent?: number;
  installsAllTime?: number;
  versions?: number;
  filePreview?: string;
  homepage?: string;
}

export interface SkillReadinessSummary {
  total: number;
  eligible: number;
  disabled: number;
  blocked: number;
  missing: number;
  warnings: string[];
  summary: string;
}

export interface SkillCatalogOverview {
  managedSkillsDir?: string;
  workspaceDir?: string;
  marketplaceAvailable: boolean;
  marketplaceSummary: string;
  installedSkills: InstalledSkillEntry[];
  readiness: SkillReadinessSummary;
  marketplacePreview: SkillMarketplaceEntry[];
  presetSkillSync?: PresetSkillSyncOverview;
}

export interface MemberBindingSummary {
  id: string;
  target: string;
}

export interface AIMemberSummary {
  id: string;
  agentId: string;
  source: "chillclaw" | "detected";
  hasManagedMetadata: boolean;
  name: string;
  jobTitle: string;
  status: "ready" | "busy" | "idle";
  currentStatus: string;
  activeTaskCount: number;
  avatar: MemberAvatar;
  brain?: BrainAssignment;
  teamIds: string[];
  bindingCount: number;
  bindings: MemberBindingSummary[];
  lastUpdatedAt: string;
}

export interface AIMemberDetail extends AIMemberSummary {
  personality: string;
  soul: string;
  workStyles: string[];
  presetSkillIds?: string[];
  skillIds: string[];
  knowledgePackIds: string[];
  capabilitySettings: MemberCapabilitySettings;
  agentDir?: string;
  workspaceDir?: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  purpose: string;
  memberIds: string[];
  memberCount: number;
  displayOrder?: number;
  updatedAt: string;
}

export interface TeamDetail extends TeamSummary {}

export interface AITeamActivityItem {
  id: string;
  memberId?: string;
  memberName?: string;
  action: string;
  description: string;
  timestamp: string;
  tone: "completed" | "started" | "generated" | "updated" | "assigned";
}

export interface AIMemberPreset {
  id: string;
  label: string;
  description: string;
  avatarPresetId?: string;
  jobTitle: string;
  personality: string;
  soul: string;
  workStyles: string[];
  presetSkillIds?: string[];
  skillIds: string[];
  knowledgePackIds: string[];
  defaultMemoryEnabled?: boolean;
}

export interface AITeamOverview {
  teamVision: string;
  members: AIMemberDetail[];
  teams: TeamDetail[];
  activity: AITeamActivityItem[];
  availableBrains: SavedModelEntry[];
  memberPresets: AIMemberPreset[];
  knowledgePacks: KnowledgePack[];
  skillOptions: SkillOption[];
  presetSkillSync?: PresetSkillSyncOverview;
}

export interface MemberBindingsResponse {
  memberId: string;
  bindings: MemberBindingSummary[];
}

export type ChatThreadStatus = "idle" | "sending" | "thinking" | "streaming" | "aborting" | "error";
export type ChatHistoryStatus = "ready" | "unavailable";
export type ChatMessageStatus = "pending" | "sent" | "streaming" | "failed";
export type ChatBridgeState = "connected" | "reconnecting" | "polling" | "disconnected";

export interface ChatToolActivity {
  id: string;
  label: string;
  status: "queued" | "running" | "completed" | "failed";
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
  provider?: string;
  model?: string;
  clientMessageId?: string;
  status?: ChatMessageStatus;
  interrupted?: boolean;
  pending?: boolean;
  error?: string;
}

export interface ChatComposerState {
  status: ChatThreadStatus;
  canSend: boolean;
  canAbort: boolean;
  activityLabel?: string;
  error?: string;
  bridgeState?: ChatBridgeState;
  toolActivities?: ChatToolActivity[];
}

export interface ChatThreadSummary {
  id: string;
  memberId: string;
  agentId: string;
  sessionKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastPreview?: string;
  lastMessageAt?: string;
  unreadCount: number;
  activeRunState?: Exclude<ChatThreadStatus, "idle">;
  historyStatus: ChatHistoryStatus;
  composerState: ChatComposerState;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatMessage[];
  historyError?: string;
}

export interface ChatOverview {
  threads: ChatThreadSummary[];
}

export interface CreateChatThreadRequest {
  memberId: string;
  mode?: "new" | "reuse-recent";
}

export interface SendChatMessageRequest {
  message: string;
  clientMessageId?: string;
}

export interface AbortChatRequest {}

export type ChatStreamEvent =
  | {
      type: "connection-state";
      threadId: string;
      state: ChatBridgeState;
      detail?: string;
    }
  | {
      type: "thread-created";
      thread: ChatThreadSummary;
    }
  | {
      type: "history-loaded";
      threadId: string;
      detail: ChatThreadDetail;
    }
  | {
      type: "message-created";
      threadId: string;
      message: ChatMessage;
    }
  | {
      type: "run-started";
      threadId: string;
      message: ChatMessage;
      activityLabel?: string;
    }
  | {
      type: "assistant-thinking";
      threadId: string;
      activityLabel?: string;
    }
  | {
      type: "assistant-tool-status";
      threadId: string;
      sessionKey: string;
      runId?: string;
      activityLabel: string;
      toolActivity: ChatToolActivity;
    }
  | {
      type: "assistant-delta";
      threadId: string;
      message: ChatMessage;
      activityLabel?: string;
    }
  | {
      type: "assistant-completed";
      threadId: string;
      detail: ChatThreadDetail;
    }
  | {
      type: "assistant-aborted";
      threadId: string;
      detail: ChatThreadDetail;
      activityLabel?: string;
    }
  | {
      type: "assistant-failed";
      threadId: string;
      error: string;
      detail?: ChatThreadDetail;
      activityLabel?: string;
    }
  | {
      type: "thread-updated";
      thread: ChatThreadSummary;
    };

export type ChillClawTaskProgressStatus = "pending" | "running" | "completed" | "failed";
export type ChillClawDeployPhase =
  | "detecting"
  | "reusing"
  | "installing"
  | "updating"
  | "uninstalling"
  | "verifying"
  | "restarting-gateway";
export type ChillClawConfigResource = "models" | "channels" | "skills" | "ai-employees" | "onboarding" | "gateway";

export type ChillClawEvent =
  | {
      type: "overview.updated";
      snapshot: RevisionedSnapshot<ProductOverview>;
    }
  | {
      type: "ai-team.updated";
      snapshot: RevisionedSnapshot<AITeamOverview>;
    }
  | {
      type: "model-config.updated";
      snapshot: RevisionedSnapshot<ModelConfigOverview>;
    }
  | {
      type: "channel-config.updated";
      snapshot: RevisionedSnapshot<ChannelConfigOverview>;
    }
  | {
      type: "plugin-config.updated";
      snapshot: RevisionedSnapshot<PluginConfigOverview>;
    }
  | {
      type: "skill-catalog.updated";
      snapshot: RevisionedSnapshot<SkillCatalogOverview>;
    }
  | {
      type: "preset-skill-sync.updated";
      snapshot: RevisionedSnapshot<PresetSkillSyncOverview>;
    }
  | {
      type: "deploy.progress";
      correlationId: string;
      targetId: DeploymentTargetId;
      phase: ChillClawDeployPhase;
      percent?: number;
      message: string;
    }
  | {
      type: "deploy.completed";
      correlationId: string;
      targetId: DeploymentTargetId;
      status: "completed" | "failed";
      message: string;
      engineStatus: EngineStatus;
    }
  | {
      type: "gateway.status";
      reachable: boolean;
      pendingGatewayApply: boolean;
      summary: string;
    }
  | {
      type: "task.progress";
      taskId: string;
      status: ChillClawTaskProgressStatus;
      message: string;
    }
  | {
      type: "chat.stream";
      threadId: string;
      sessionKey: string;
      payload: ChatStreamEvent;
    }
  | {
      type: "channel.session.updated";
      channelId: SupportedChannelId;
      session: ChannelSession;
    }
  | {
      type: "config.applied";
      resource: ChillClawConfigResource;
      summary: string;
    };

export interface ProductOverview {
  appName: string;
  appVersion: string;
  platformTarget: string;
  firstRun: FirstRunState;
  appService: AppServiceStatus;
  engine: EngineStatus;
  installSpec: EngineInstallSpec;
  capabilities: EngineCapabilities;
  installChecks: InstallCheck[];
  channelSetup: ChannelSetupOverview;
  profiles: UserProfile[];
  templates: TaskTemplate[];
  healthChecks: HealthCheckResult[];
  recoveryActions: RecoveryAction[];
  recentTasks: EngineTaskResult[];
}

export interface InstallRequest {
  autoConfigure: boolean;
  forceLocal?: boolean;
}

export interface InstallResponse {
  status: "installed" | "already-installed";
  message: string;
  engineStatus: EngineStatus;
  disposition?: "reused-existing" | "installed" | "reinstalled" | "onboarded";
  changed?: boolean;
  hadExisting?: boolean;
  pinnedVersion?: string;
  existingVersion?: string;
  actualVersion?: string;
}

export interface ModelAuthRequest {
  providerId: string;
  methodId: string;
  values: Record<string, string>;
  setDefaultModel?: string;
}

export interface ModelAuthSession {
  id: string;
  providerId: string;
  methodId: string;
  entryId?: string;
  status: "running" | "awaiting-input" | "completed" | "failed";
  message: string;
  logs: string[];
  launchUrl?: string;
  inputPrompt?: string;
}

export interface ModelAuthSessionInputRequest {
  value: string;
}

export interface ModelAuthSessionResponse {
  session: ModelAuthSession;
  modelConfig: ModelConfigOverview;
  onboarding?: OnboardingStateResponse;
}

export interface SetDefaultModelRequest {
  modelKey: string;
}

export interface SaveModelEntryRequest {
  label: string;
  providerId: string;
  methodId: string;
  modelKey: string;
  values: Record<string, string>;
  makeDefault?: boolean;
  useAsFallback?: boolean;
}

export interface SetDefaultModelEntryRequest {
  entryId: string;
}

export interface ReplaceFallbackModelEntriesRequest {
  entryIds: string[];
}

export interface ModelConfigActionResponse extends MutationSyncMeta {
  status: "completed" | "failed" | "interactive";
  message: string;
  modelConfig: ModelConfigOverview;
  authSession?: ModelAuthSession;
  requiresGatewayApply?: boolean;
  onboarding?: OnboardingStateResponse;
}

export interface RecoveryRunResponse {
  actionId: string;
  status: "completed" | "failed";
  message: string;
}

export interface SetupRunResponse {
  status: "completed" | "failed";
  message: string;
  steps: SetupStepResult[];
  overview: ProductOverview;
  install?: InstallResponse;
  onboarding?: OnboardingStateResponse;
}

export interface AppServiceActionResponse {
  action: "install" | "restart" | "uninstall";
  status: "completed" | "failed";
  message: string;
  service: AppServiceStatus;
}

export interface AppControlResponse {
  action: "stop-app" | "uninstall-app";
  status: "completed" | "failed";
  message: string;
}

export interface EngineActionResponse {
  action: "uninstall-engine";
  status: "completed" | "failed";
  message: string;
  engineStatus: EngineStatus;
}

export interface GatewayActionResponse {
  action: "restart-gateway";
  status: "completed" | "failed";
  message: string;
  engineStatus: EngineStatus;
}

export interface TelegramSetupRequest {
  token: string;
  accountName?: string;
}

export interface PairingApprovalRequest {
  code: string;
}

export interface WechatWorkSetupRequest {
  botId: string;
  secret: string;
}

export type WechatSetupRequest = WechatWorkSetupRequest;

export interface FeishuSetupRequest {
  appId: string;
  appSecret: string;
  domain?: string;
  botName?: string;
}

export interface SaveChannelEntryRequest {
  channelId: SupportedChannelId;
  entryId?: string;
  values: Record<string, string>;
  action?: "save" | "prepare" | "login" | "approve-pairing";
}

export interface RemoveChannelEntryRequest {
  entryId: string;
  channelId?: SupportedChannelId;
  values?: Record<string, string>;
}

export interface ChannelSessionInputRequest {
  value: string;
}

export interface ChannelConfigActionResponse extends MutationSyncMeta {
  status: "completed" | "failed" | "interactive";
  message: string;
  channelConfig: ChannelConfigOverview;
  session?: ChannelSession;
  requiresGatewayApply?: boolean;
  onboarding?: OnboardingStateResponse;
}

export interface ChannelSessionResponse {
  session: ChannelSession;
  channelConfig: ChannelConfigOverview;
  onboarding?: OnboardingStateResponse;
}

export interface PluginActionResponse extends MutationSyncMeta {
  status: "completed" | "failed";
  message: string;
  pluginConfig: PluginConfigOverview;
}

export interface SaveAIMemberRequest {
  name: string;
  jobTitle: string;
  avatar: MemberAvatar;
  brainEntryId: string;
  personality: string;
  soul: string;
  workStyles: string[];
  presetSkillIds?: string[];
  skillIds: string[];
  knowledgePackIds: string[];
  capabilitySettings: MemberCapabilitySettings;
}

export interface SaveTeamRequest {
  name: string;
  purpose: string;
  memberIds: string[];
  displayOrder?: number;
}

export interface BindAIMemberChannelRequest {
  binding: string;
}

export interface DeleteAIMemberRequest {
  deleteMode: "full" | "keep-workspace";
}

export interface SaveCustomSkillRequest {
  name: string;
  slug?: string;
  description: string;
  instructions: string;
  homepage?: string;
}

export interface InstallSkillRequest {
  slug: string;
  version?: string;
}

export interface UpdateSkillRequest {
  action: "update" | "reinstall" | "edit-custom";
  version?: string;
  name?: string;
  description?: string;
  instructions?: string;
  homepage?: string;
}

export interface RemoveSkillRequest {}

export interface AITeamActionResponse extends MutationSyncMeta {
  status: "completed" | "failed";
  message: string;
  overview: AITeamOverview;
  requiresGatewayApply?: boolean;
}

export interface ChatActionResponse extends MutationSyncMeta {
  status: "completed" | "failed";
  message: string;
  overview: ChatOverview;
  thread?: ChatThreadDetail;
}

export interface SkillCatalogActionResponse extends MutationSyncMeta {
  status: "completed" | "failed";
  message: string;
  skillConfig: SkillCatalogOverview;
  requiresGatewayApply?: boolean;
}

export interface ChannelActionResponse {
  status: "completed" | "failed";
  message: string;
  channel?: ChannelSetupState;
  overview: ProductOverview;
}

export const defaultProfiles: UserProfile[] = [
  {
    id: "email-admin",
    name: "Email & Admin",
    description: "Draft replies, summarize updates, and keep routine work moving.",
    defaultTemplateIds: ["summarize-thread", "draft-email"]
  },
  {
    id: "research",
    name: "Research",
    description: "Turn scattered notes and links into concise briefings.",
    defaultTemplateIds: ["research-brief", "meeting-summary"]
  },
  {
    id: "docs",
    name: "Docs & Writing",
    description: "Polish drafts, create first-pass memos, and organize information.",
    defaultTemplateIds: ["rewrite-plain", "status-update"]
  }
];

export const defaultTemplates: TaskTemplate[] = [
  {
    id: "summarize-thread",
    title: "Summarize a thread",
    category: "Communication",
    description: "Condense a long conversation into a short action-oriented summary.",
    promptHint: "Paste the thread and tell ChillClaw who the summary is for."
  },
  {
    id: "draft-email",
    title: "Draft a reply",
    category: "Communication",
    description: "Write a professional response with a clear next step.",
    promptHint: "Paste the incoming email and describe the tone you want."
  },
  {
    id: "research-brief",
    title: "Research brief",
    category: "Research",
    description: "Turn notes into a structured brief with key findings and risks.",
    promptHint: "List the topic, audience, and your raw notes."
  },
  {
    id: "meeting-summary",
    title: "Meeting summary",
    category: "Operations",
    description: "Convert meeting notes into decisions, owners, and follow-ups.",
    promptHint: "Paste notes or transcript excerpts."
  },
  {
    id: "rewrite-plain",
    title: "Rewrite in plain language",
    category: "Writing",
    description: "Make a draft easier for non-technical readers to understand.",
    promptHint: "Paste the draft and mention the target audience."
  },
  {
    id: "status-update",
    title: "Weekly status update",
    category: "Operations",
    description: "Create a concise update with wins, blockers, and next steps.",
    promptHint: "List what shipped, what is blocked, and what is next."
  }
];

export * from "./compatibility.js";

export function createDefaultProductOverview(): ProductOverview {
  const now = new Date().toISOString();

  return {
    appName: "ChillClaw",
    appVersion: "0.1.2",
    platformTarget: "macOS first",
    firstRun: {
      introCompleted: false,
      setupCompleted: false,
      selectedProfileId: undefined
    },
    appService: {
      mode: "unmanaged",
      installed: false,
      running: false,
      managedAtLogin: false,
      label: undefined,
      summary: "ChillClaw background service is not managed yet.",
      detail: "The packaged app can install a LaunchAgent for login-time startup."
    },
    engine: {
      engine: "openclaw",
      installed: false,
      running: false,
      version: undefined,
      summary: "OpenClaw is not installed yet.",
      pendingGatewayApply: false,
      pendingGatewayApplySummary: undefined,
      lastCheckedAt: now
    },
    installSpec: {
      engine: "openclaw",
      desiredVersion: "latest",
      installSource: "npm-local",
      prerequisites: [
        "macOS",
        "Node.js 22 or newer",
        "pnpm only if you build OpenClaw from source",
        "Ability to install or reuse the latest available OpenClaw CLI"
      ]
    },
    capabilities: {
      engine: "openclaw",
      supportsInstall: true,
      supportsUpdate: true,
      supportsRecovery: true,
      supportsStreaming: true,
      runtimeModes: ["gateway", "embedded", "local-llm"],
      supportedChannels: ["local-ui"],
      starterSkillCategories: ["communication", "research", "docs", "operations"],
      futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
    },
    installChecks: [
      {
        id: "platform",
        label: "Supported macOS version",
        status: "pending",
        detail: "ChillClaw will check your OS version on first launch."
      },
      {
        id: "disk",
        label: "Free disk space",
        status: "pending",
        detail: "ChillClaw will verify enough space for the engine and starter assets."
      },
      {
        id: "permissions",
        label: "Document access permission",
        status: "pending",
        detail: "Needed only when you explicitly select files or folders."
      }
    ],
    channelSetup: {
      baseOnboardingCompleted: true,
      channels: [
        {
          id: "telegram",
          title: "Telegram",
          officialSupport: true,
          status: "not-started",
          summary: "Telegram setup has not started yet.",
          detail: "ChillClaw will add the bot token, then help approve the first pairing code."
        },
        {
          id: "whatsapp",
          title: "WhatsApp",
          officialSupport: true,
          status: "not-started",
          summary: "WhatsApp setup has not started yet.",
          detail: "ChillClaw will start the login flow, then wait for pairing approval."
        },
        {
          id: "feishu",
          title: "Feishu (飞书)",
          officialSupport: true,
          status: "not-started",
          summary: "Feishu bot setup has not started yet.",
          detail: "ChillClaw can guide you through the official OpenClaw Feishu plugin setup: app creation, credentials, gateway restart, long-connection event subscription, and pairing."
        },
        {
          id: "wechat-work",
          title: "WeChat Work (WeCom)",
          officialSupport: true,
          status: "not-started",
          summary: "WeChat Work setup has not started yet.",
          detail: "ChillClaw will install the managed WeCom plugin, then save the bot credentials."
        },
        {
          id: "wechat",
          title: "WeChat",
          officialSupport: false,
          status: "not-started",
          summary: "Personal WeChat setup has not started yet.",
          detail: "ChillClaw will start the QR-first installer flow, then wait for login confirmation."
        }
      ],
      nextChannelId: "telegram",
      gatewayStarted: false,
      gatewaySummary: "Next recommended channel: Telegram."
    },
    profiles: defaultProfiles,
    templates: defaultTemplates,
    healthChecks: [
      {
        id: "engine-service",
        title: "Engine service",
        severity: "warning",
        summary: "OpenClaw is not running yet.",
        detail: "Install ChillClaw's bundled OpenClaw setup to enable tasks.",
        remediationActionIds: ["reinstall-engine"]
      },
      {
        id: "config",
        title: "Configuration",
        severity: "info",
        summary: "Default profile has not been selected.",
        detail: "Choose a default ChillClaw workflow profile so tasks start with sane defaults.",
        remediationActionIds: ["repair-config"]
      }
    ],
    recoveryActions: [
      {
        id: "restart-engine",
        type: "restart-engine",
        title: "Restart assistant engine",
        description: "Safely restart the local engine service.",
        safetyLevel: "safe",
        expectedImpact: "Briefly interrupts active work while the engine restarts."
      },
      {
        id: "repair-config",
        type: "repair-config",
        title: "Repair setup defaults",
        description: "Restore the recommended profile and default ChillClaw settings.",
        safetyLevel: "safe",
        expectedImpact: "Keeps your history but resets product preferences to defaults."
      },
      {
        id: "rollback-update",
        type: "rollback-update",
        title: "Rollback last update",
        description: "Return to the last known compatible engine release.",
        safetyLevel: "review",
        expectedImpact: "May remove the newest engine update if it caused instability."
      },
      {
        id: "reinstall-engine",
        type: "reinstall-engine",
        title: "Reinstall engine",
        description: "Reinstall OpenClaw with ChillClaw's recommended version.",
        safetyLevel: "review",
        expectedImpact: "Rebuilds the engine installation without removing your task history."
      },
      {
        id: "export-diagnostics",
        type: "export-diagnostics",
        title: "Export diagnostics",
        description: "Create a support bundle with logs, versions, and health state.",
        safetyLevel: "safe",
        expectedImpact: "Creates a zip file you can share with support."
      }
    ],
    recentTasks: []
  };
}
