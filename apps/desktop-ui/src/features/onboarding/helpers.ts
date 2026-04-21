import type {
  CapabilityRequirement,
  CapabilityStatus,
  ChannelConfigOverview,
  ChannelSession,
  ConfiguredChannelEntry,
  LocalModelRuntimeStatus,
  ModelConfigOverview,
  ModelAuthMethod,
  ModelProviderConfig,
  OnboardingChannelPresentation,
  OnboardingEmployeePresetPresentation,
  OnboardingModelProviderPresentation,
  OnboardingInstallState,
  OnboardingCapabilityReadiness,
  OnboardingStateResponse,
  OnboardingStep,
  PresetSkillSyncOverview,
  ProductOverview,
  SaveAIMemberRequest,
  SavedModelEntry,
  ChillClawDeployPhase,
  ChillClawEvent
} from "@chillclaw/contracts";

import { resolveMemberAvatarPreset } from "../../shared/avatar-presets.js";
import type { OnboardingCopy } from "./copy.js";

export type OnboardingDestination = "team" | "dashboard" | "chat";

export interface OnboardingEmployeeDraft {
  name: string;
  jobTitle: string;
  avatarPresetId: string;
  presetId: string;
  personalityTraits: string[];
  presetSkillIds: string[];
  knowledgePackIds: string[];
  workStyles: string[];
  memoryEnabled: boolean;
  brainEntryId: string;
}

export function resolveOnboardingModelPickerProviders(
  onboardingState: Pick<OnboardingStateResponse, "config"> | undefined
): OnboardingModelProviderPresentation[] {
  return onboardingState?.config.modelProviders ?? [];
}

export function resolveOnboardingChannelPresentations(
  onboardingState: Pick<OnboardingStateResponse, "config"> | undefined
): OnboardingChannelPresentation[] {
  return onboardingState?.config.channels ?? [];
}

export function resolveOnboardingEmployeePresets(
  onboardingState: Pick<OnboardingStateResponse, "config"> | undefined
): OnboardingEmployeePresetPresentation[] {
  return onboardingState?.config.employeePresets ?? [];
}

export function applyPresetSkillSyncToOnboardingState(
  onboardingState: OnboardingStateResponse | undefined,
  presetSkillSync: PresetSkillSyncOverview
): OnboardingStateResponse | undefined {
  if (!onboardingState) {
    return onboardingState;
  }

  return {
    ...onboardingState,
    presetSkillSync
  };
}

export function applyOnboardingChannelSessionToConfig(
  channelConfig: ChannelConfigOverview,
  activeSession: ChannelSession | undefined
): ChannelConfigOverview {
  if (!activeSession) {
    return channelConfig;
  }

  return {
    ...channelConfig,
    activeSession
  };
}

export function onboardingChannelSessionHandoffCompleted(
  onboardingState: Pick<OnboardingStateResponse, "draft"> | undefined,
  sessionId: string
): boolean {
  return onboardingState?.draft.currentStep === "employee" && onboardingState.draft.activeChannelSessionId !== sessionId;
}

export function resolveOnboardingChannelSessionLogMode(logs: string[]): "plain" | "qr" {
  const qrLikeLines = logs.filter((line) => /[█▀▄▌▐]/u.test(line)).length;
  return qrLikeLines >= 4 ? "qr" : "plain";
}

export function resolveOnboardingActiveChannelSession(
  channelConfig: Pick<ChannelConfigOverview, "activeSession"> | undefined,
  selectedChannelId: string,
  activeChannelSessionId: string | undefined
): ChannelSession | undefined {
  const activeSession = channelConfig?.activeSession;
  if (!activeSession || !activeChannelSessionId) {
    return undefined;
  }

  if (activeSession.channelId !== selectedChannelId) {
    return undefined;
  }

  return activeSession.id === activeChannelSessionId ? activeSession : undefined;
}

export function shouldRefreshOnboardingChannelConfig(
  currentStep: OnboardingStep,
  draftChannel: OnboardingStateResponse["draft"]["channel"] | undefined,
  activeChannelSessionId: string | undefined
): boolean {
  if (activeChannelSessionId) {
    return false;
  }

  return currentStep === "channel" || Boolean(draftChannel);
}

export type OnboardingEmployeePresetReadinessStatus =
  | "ready"
  | "syncing"
  | "repair"
  | "install"
  | "attention"
  | "unknown";

export interface OnboardingEmployeePresetRequirementReadiness {
  id: string;
  label: string;
  status: CapabilityStatus;
  summary: string;
}

export interface OnboardingEmployeePresetReadiness {
  status: OnboardingEmployeePresetReadinessStatus;
  label: string;
  detail?: string;
  blocking: boolean;
  requirements?: OnboardingEmployeePresetRequirementReadiness[];
}

export type OnboardingChannelCapabilityReadiness = OnboardingEmployeePresetReadiness;

export function resolveOnboardingPresetSkillIds(
  preset:
    | Pick<OnboardingEmployeePresetPresentation, "presetSkillIds">
    | Pick<OnboardingEmployeeDraft, "presetSkillIds">
    | undefined
): string[] {
  if (!preset) {
    return [];
  }

  return preset.presetSkillIds?.filter(Boolean) ?? [];
}

export function resolveOnboardingEmployeePresetReadiness(
  preset: Pick<OnboardingEmployeePresetPresentation, "presetSkillIds"> & Partial<Pick<OnboardingEmployeePresetPresentation, "id">>,
  presetSkillSync: PresetSkillSyncOverview | undefined,
  capabilityReadiness?: OnboardingCapabilityReadiness
): OnboardingEmployeePresetReadiness {
  const capabilityPresetReadiness = resolveOnboardingEmployeePresetCapabilityReadiness(preset.id, capabilityReadiness);
  if (capabilityPresetReadiness) {
    return capabilityPresetReadiness;
  }

  const presetSkillIds = resolveOnboardingPresetSkillIds(preset);
  if (presetSkillIds.length === 0) {
    return {
      status: "ready",
      label: "Ready",
      detail: "This preset does not need any managed skills.",
      blocking: false
    };
  }

  const entries = presetSkillIds
    .map((presetSkillId) => presetSkillSync?.entries.find((entry) => entry.presetSkillId === presetSkillId))
    .filter((entry) => Boolean(entry));

  if (entries.length === presetSkillIds.length && entries.every((entry) => entry?.status === "verified")) {
    return {
      status: "ready",
      label: "Ready",
      detail: presetSkillSync?.summary ?? "Preset skills are verified in the active runtime.",
      blocking: false
    };
  }

  const failedEntry = entries.find((entry) => entry?.status === "failed");
  if (failedEntry) {
    return {
      status: "repair",
      label: "Repair needed",
      detail: failedEntry.lastError ?? presetSkillSync?.summary ?? "ChillClaw could not verify every preset skill.",
      blocking: false
    };
  }

  const inFlight = entries.some((entry) => entry && entry.status !== "verified");
  if (inFlight) {
    return {
      status: "syncing",
      label: "Syncing",
      detail: presetSkillSync?.summary ?? "ChillClaw is syncing preset skills for this employee.",
      blocking: false
    };
  }

  return {
    status: "install",
    label: "Prepared on finish",
    detail: "Choose this preset and ChillClaw will prepare its guided skills during final setup.",
    blocking: false
  };
}

export function resolveOnboardingChannelCapabilityReadiness(
  channelId: string | undefined,
  capabilityReadiness?: OnboardingCapabilityReadiness
): OnboardingChannelCapabilityReadiness | undefined {
  if (!channelId || !capabilityReadiness) {
    return undefined;
  }

  const channel = (capabilityReadiness.channels ?? []).find((entry) => entry.channelId === channelId);
  if (!channel) {
    return undefined;
  }

  const requirements = channel.requirements.map(normalizeCapabilityRequirement);
  if (channel.status === "ready") {
    return {
      status: "ready",
      label: "Ready",
      detail: channel.summary || capabilityReadiness.summary,
      blocking: false,
      requirements
    };
  }

  if (channel.status === "unknown") {
    return {
      status: "unknown",
      label: "Checking setup",
      detail: channel.summary || capabilityReadiness.summary,
      blocking: false,
      requirements
    };
  }

  return {
    status: "attention",
    label: capabilityChannelAttentionLabel(channel.status),
    detail: channel.summary || capabilityReadiness.summary,
    blocking: channel.status === "blocked" || channel.status === "error",
    requirements
  };
}

function resolveOnboardingEmployeePresetCapabilityReadiness(
  presetId: string | undefined,
  capabilityReadiness: OnboardingCapabilityReadiness | undefined
): OnboardingEmployeePresetReadiness | undefined {
  if (!presetId || !capabilityReadiness) {
    return undefined;
  }

  const preset = capabilityReadiness.employeePresets.find((entry) => entry.presetId === presetId);
  if (!preset) {
    return undefined;
  }

  const requirements = preset.requirements.map(normalizeCapabilityRequirement);
  if (preset.status === "ready") {
    return {
      status: "ready",
      label: "Ready",
      detail: preset.summary || capabilityReadiness.summary,
      blocking: false,
      requirements
    };
  }

  if (preset.status === "unknown") {
    return {
      status: "unknown",
      label: "Checking setup",
      detail: preset.summary || capabilityReadiness.summary,
      blocking: false,
      requirements
    };
  }

  return {
    status: "attention",
    label: capabilityPresetAttentionLabel(preset.status),
    detail: preset.summary || capabilityReadiness.summary,
    blocking: false,
    requirements
  };
}

function capabilityChannelAttentionLabel(status: CapabilityStatus): string {
  if (status === "disabled") {
    return "Disabled";
  }

  if (status === "error") {
    return "Needs repair";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Needs setup";
}

function normalizeCapabilityRequirement(requirement: CapabilityRequirement): OnboardingEmployeePresetRequirementReadiness {
  return {
    id: requirement.id,
    label: requirement.label ?? requirement.id,
    status: requirement.status,
    summary: requirement.summary
  };
}

function capabilityPresetAttentionLabel(status: CapabilityStatus): string {
  if (status === "disabled") {
    return "Disabled";
  }

  if (status === "error") {
    return "Needs repair";
  }

  return "Needs setup";
}

export interface ResolvedOnboardingModelProvider {
  id: string;
  curated: OnboardingModelProviderPresentation;
  provider?: ModelProviderConfig;
}

export interface OnboardingInstallProgressSnapshot {
  phase?: ChillClawDeployPhase;
  percent?: number;
  message?: string;
}

export interface OnboardingInstallViewState {
  kind: "missing" | "found" | "installing" | "complete";
  version?: string;
  progressPercent?: number;
  stageLabel?: string;
}

export interface OnboardingModelViewState {
  kind: "picker" | "configure" | "connected";
  provider?: ResolvedOnboardingModelProvider;
  entry?: SavedModelEntry;
}

export type OnboardingModelStepMode =
  | "detecting-local"
  | "cloud-handoff"
  | "local-setup"
  | "cloud-config"
  | "connected";

export interface OnboardingLocalSetupProgress {
  currentStep: 1 | 2 | 3 | 4;
}

export interface OnboardingLocalModelDownloadInfo {
  modelLabel?: string;
  amountLabel: string;
  remainingLabel?: string;
  percentLabel?: string;
  progressPercent?: number;
}

export type OnboardingModelSetupVariant = "default-api-key" | "guided-minimax-api-key" | "oauth";
export type OnboardingChannelSetupVariant =
  | "wechat-work-guided"
  | "wechat-guided"
  | "feishu-guided"
  | "telegram-guided";

interface ResolveOnboardingInstallViewStateArgs {
  overview?: Pick<ProductOverview, "engine">;
  install?: OnboardingInstallState;
  busy: boolean;
  progress?: OnboardingInstallProgressSnapshot;
}

export function buildExistingInstallAdvanceDraft(
  overview?: Pick<ProductOverview, "engine">
): Pick<OnboardingStateResponse["draft"], "currentStep" | "install"> {
  return {
    currentStep: "model",
    install: {
      installed: true,
      version: overview?.engine.version,
      disposition: "reused-existing"
    }
  };
}

interface OnboardingInstallProgressCopy {
  installStageDetecting: string;
  installStageReusing: string;
  installStageInstalling: string;
  installStageVerifying: string;
  installStageRestarting: string;
}

interface ResolveOnboardingModelViewStateArgs {
  providerId: string;
  methodId: string;
  modelKey: string;
  providers: ResolvedOnboardingModelProvider[];
  selectedEntry?: SavedModelEntry;
  draftEntryId?: string;
  summaryEntryId?: string;
  activeModelAuthSessionId?: string;
}

const INSTALL_PROGRESS_FALLBACKS: Record<ChillClawDeployPhase, number> = {
  detecting: 16,
  reusing: 34,
  installing: 58,
  updating: 64,
  uninstalling: 64,
  verifying: 82,
  "restarting-gateway": 94
};

const INSTALL_RUNTIME_PROGRESS_RANGES = {
  "node-npm-runtime": { start: 46, end: 60 },
  "openclaw-runtime": { start: 58, end: 76 }
} as const;

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function scaleRuntimeInstallProgress(resourceId: keyof typeof INSTALL_RUNTIME_PROGRESS_RANGES, percent: number | undefined): number {
  const range = INSTALL_RUNTIME_PROGRESS_RANGES[resourceId];
  const runtimePercent = clampPercent(percent ?? 55);
  return Math.round(range.start + (runtimePercent / 100) * (range.end - range.start));
}

function installPhaseForRuntimeAction(action: string): ChillClawDeployPhase {
  return action === "apply-update" || action === "stage-update" ? "updating" : "installing";
}

export function mergeOnboardingInstallProgress(
  current: OnboardingInstallProgressSnapshot | undefined,
  next: OnboardingInstallProgressSnapshot
): OnboardingInstallProgressSnapshot {
  return {
    phase: next.phase ?? current?.phase,
    percent:
      current?.percent === undefined || next.percent === undefined
        ? next.percent ?? current?.percent
        : Math.max(current.percent, next.percent),
    message: next.message?.trim() || current?.message
  };
}

export function onboardingInstallProgressFromRuntimeEvent(
  event: ChillClawEvent
): OnboardingInstallProgressSnapshot | undefined {
  if (event.type !== "runtime.progress" && event.type !== "runtime.completed") {
    return undefined;
  }

  if (event.resourceId !== "node-npm-runtime" && event.resourceId !== "openclaw-runtime") {
    return undefined;
  }

  return {
    phase: installPhaseForRuntimeAction(event.action),
    percent: scaleRuntimeInstallProgress(
      event.resourceId,
      event.type === "runtime.completed" ? 100 : event.percent
    ),
    message: event.message
  };
}

export function resolveOnboardingProviderId<T extends { id: string }>(
  currentProviderId: string,
  draftProviderId: string | undefined,
  providers: T[]
) {
  if (draftProviderId !== undefined) {
    if (providers.some((provider) => provider.id === draftProviderId)) {
      return draftProviderId;
    }
    return "";
  }

  if (providers.some((provider) => provider.id === currentProviderId)) {
    return currentProviderId;
  }

  return "";
}

export function nextOnboardingStepAfterModelSave(requiresInteraction: boolean): OnboardingStep {
  return requiresInteraction ? "model" : "channel";
}

export function resolveOnboardingLocalRuntime(args: {
  currentStep: OnboardingStateResponse["draft"]["currentStep"];
  localRuntimeSnapshot?: ModelConfigOverview["localRuntime"];
  onboardingLocalRuntime?: ModelConfigOverview["localRuntime"];
  modelConfigLocalRuntime?: ModelConfigOverview["localRuntime"];
}): ModelConfigOverview["localRuntime"] {
  if (args.localRuntimeSnapshot) {
    return args.localRuntimeSnapshot;
  }

  if (args.currentStep === "model" || args.currentStep === "permissions") {
    return args.onboardingLocalRuntime ?? args.modelConfigLocalRuntime;
  }

  return args.modelConfigLocalRuntime ?? args.onboardingLocalRuntime;
}

export function resolveOnboardingModelViewState(
  args: ResolveOnboardingModelViewStateArgs
): OnboardingModelViewState {
  const provider = args.providers.find((candidate) => candidate.id === args.providerId);
  if (!provider) {
    return { kind: "picker" };
  }

  const selectedEntry = args.selectedEntry;
  const entryMatchesSelection =
    selectedEntry?.providerId === provider.id &&
    (!args.modelKey || selectedEntry?.modelKey === args.modelKey) &&
    (!args.methodId || (selectedEntry?.authMethodId ?? "") === args.methodId);
  const persistedEntryMatches =
    !!selectedEntry &&
    [args.draftEntryId, args.summaryEntryId].some((entryId) => !!entryId && entryId === selectedEntry.id);

  if (entryMatchesSelection && persistedEntryMatches && !(args.activeModelAuthSessionId ?? "").trim()) {
    return {
      kind: "connected",
      provider,
      entry: selectedEntry
    };
  }

  return {
    kind: "configure",
    provider,
    entry: selectedEntry
  };
}

export function resolveOnboardingModelStepMode(args: {
  bootstrapPending: boolean;
  providerId: string;
  selectedProviderPresent: boolean;
  modelViewKind: OnboardingModelViewState["kind"];
  activeModelAuthSessionId?: string;
  draftModelEntryId?: string;
  summaryModelEntryId?: string;
  localRuntimeManagedEntryId?: string;
  localRuntime?: ModelConfigOverview["localRuntime"];
}): OnboardingModelStepMode {
  void args.localRuntimeManagedEntryId;
  const hasPersistedModel = Boolean(args.draftModelEntryId || args.summaryModelEntryId);
  const hasActiveAuthSession = Boolean(args.activeModelAuthSessionId);
  const hasCloudFlow =
    Boolean(args.providerId) ||
    args.selectedProviderPresent ||
    hasActiveAuthSession ||
    (args.modelViewKind === "configure" && !hasPersistedModel);

  if (args.modelViewKind === "connected" || args.localRuntime?.activeInOpenClaw) {
    return "connected";
  }

  if (hasPersistedModel || hasActiveAuthSession) {
    return "cloud-config";
  }

  if (args.bootstrapPending) {
    return "detecting-local";
  }

  if (args.localRuntime?.status === "unchecked") {
    return "detecting-local";
  }

  if (args.localRuntime?.recommendation === "cloud" || args.localRuntime?.status === "cloud-recommended") {
    return "cloud-handoff";
  }

  if (args.localRuntime?.recommendation === "local" && args.localRuntime?.status !== "ready") {
    return "local-setup";
  }

  if (hasCloudFlow) {
    return "cloud-config";
  }

  return "cloud-config";
}

export function resolveOnboardingLocalSetupProgress(
  mode: OnboardingModelStepMode,
  status: LocalModelRuntimeStatus | undefined
): OnboardingLocalSetupProgress {
  if (mode === "connected" || status === "ready") {
    return { currentStep: 4 };
  }

  switch (status) {
    case "installing-runtime":
      return { currentStep: 2 };
    case "downloading-model":
      return { currentStep: 3 };
    case "starting-runtime":
    case "configuring-openclaw":
      return { currentStep: 4 };
    case "idle":
    case "degraded":
    case "failed":
    case "cloud-recommended":
    case "unchecked":
    default:
      return { currentStep: 1 };
  }
}

function trimOnboardingText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function localModelMessageIsTechnical(value: string | undefined) {
  return /sha256:/i.test(value ?? "");
}

function formatOnboardingDownloadTemplate(
  template: string,
  replacements: Record<string, string | number>
) {
  return Object.entries(replacements).reduce(
    (resolved, [key, value]) => resolved.replace(`{${key}}`, String(value)),
    template
  );
}

function formatOnboardingGigabytes(bytes: number, locale: string) {
  const gigabytes = Math.round((bytes / 1_000_000_000) * 10) / 10;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(gigabytes) ? 0 : 1,
    maximumFractionDigits: 1
  }).format(gigabytes);

  return `${formatted} GB`;
}

function normalizeOnboardingModelLabel(modelKey: string | undefined) {
  const trimmed = trimOnboardingText(modelKey);
  if (!trimmed) {
    return undefined;
  }

  const slashIndex = trimmed.indexOf("/");
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

export function describeOnboardingLocalModelDownload(
  localRuntime: ModelConfigOverview["localRuntime"] | undefined,
  locale: string,
  copy: Pick<
    OnboardingCopy,
    | "localModelDownloadAmountLabel"
    | "localModelDownloadRemainingLabel"
    | "localModelDownloadPercentLabel"
    | "localModelDownloadStepLabel"
  >
): OnboardingLocalModelDownloadInfo | undefined {
  if (!localRuntime || localRuntime.status !== "downloading-model") {
    return undefined;
  }

  const modelLabel = normalizeOnboardingModelLabel(localRuntime.chosenModelKey);
  const completedBytes = localRuntime.progressCompletedBytes;
  const totalBytes = localRuntime.progressTotalBytes;
  if (typeof completedBytes === "number" && typeof totalBytes === "number" && totalBytes > 0 && completedBytes >= 0) {
    const clampedCompleted = Math.min(completedBytes, totalBytes);
    const progressPercent = Math.max(
      0,
      Math.min(100, localRuntime.progressPercent ?? Math.round((clampedCompleted / totalBytes) * 100))
    );

    return {
      modelLabel,
      amountLabel: formatOnboardingDownloadTemplate(copy.localModelDownloadAmountLabel, {
        downloaded: formatOnboardingGigabytes(clampedCompleted, locale),
        total: formatOnboardingGigabytes(totalBytes, locale)
      }),
      remainingLabel: formatOnboardingDownloadTemplate(copy.localModelDownloadRemainingLabel, {
        remaining: formatOnboardingGigabytes(Math.max(totalBytes - clampedCompleted, 0), locale)
      }),
      percentLabel: formatOnboardingDownloadTemplate(copy.localModelDownloadPercentLabel, {
        percent: progressPercent
      }),
      progressPercent
    };
  }

  const fallbackMessage =
    trimOnboardingText(localRuntime.progressMessage) ??
    (localModelMessageIsTechnical(localRuntime.detail) ? undefined : trimOnboardingText(localRuntime.detail)) ??
    (localModelMessageIsTechnical(localRuntime.summary) ? undefined : trimOnboardingText(localRuntime.summary)) ??
    copy.localModelDownloadStepLabel;

  return {
    modelLabel,
    amountLabel: fallbackMessage
  };
}

export function resolveOnboardingModelSetupVariant(args: {
  providerId: string;
  methodKind: string | undefined;
}): OnboardingModelSetupVariant {
  if (args.methodKind === "oauth") {
    return "oauth";
  }

  if (args.providerId === "minimax" && args.methodKind === "api-key") {
    return "guided-minimax-api-key";
  }

  return "default-api-key";
}

export function shouldShowOnboardingAuthMethodChooser(methods: ModelAuthMethod[]) {
  return methods.length > 1;
}

export function resolveOnboardingChannelSetupVariant(setupKind: string | undefined): OnboardingChannelSetupVariant {
  switch (setupKind) {
    case "wechat-work-guided":
      return "wechat-work-guided";
    case "wechat-guided":
      return "wechat-guided";
    case "telegram-guided":
      return "telegram-guided";
    case "feishu-guided":
    default:
      return "feishu-guided";
  }
}

export function buildOnboardingChannelSaveValues(
  channelId: string,
  values: Record<string, string>
): Record<string, string> {
  if (channelId === "wechat-work") {
    return {
      botId: values.botId ?? "",
      secret: values.secret ?? ""
    };
  }

  if (channelId !== "wechat") {
    return values;
  }

  return values;
}

export function resolveCompletedOnboardingChannelEntry(
  channelId: string | undefined,
  preferredEntryId: string | undefined,
  channelConfig: Pick<ChannelConfigOverview, "entries"> | undefined
): ConfiguredChannelEntry | undefined {
  if (channelId !== "wechat" || !channelConfig) {
    return undefined;
  }

  const preferredEntry = preferredEntryId
    ? channelConfig.entries.find((entry) => entry.id === preferredEntryId)
    : undefined;
  const resolvedEntry = preferredEntry ?? channelConfig.entries.find((entry) => entry.channelId === channelId);

  return resolvedEntry?.status === "completed" ? resolvedEntry : undefined;
}

function installProgressStageLabel(
  progress: OnboardingInstallProgressSnapshot | undefined,
  copy: OnboardingInstallProgressCopy
) {
  if (progress?.message?.trim()) {
    return progress.message.trim();
  }

  switch (progress?.phase) {
    case "reusing":
      return copy.installStageReusing;
    case "installing":
    case "updating":
    case "uninstalling":
      return copy.installStageInstalling;
    case "verifying":
      return copy.installStageVerifying;
    case "restarting-gateway":
      return copy.installStageRestarting;
    case "detecting":
    default:
      return copy.installStageDetecting;
  }
}

export function resolveOnboardingInstallViewState(
  args: ResolveOnboardingInstallViewStateArgs,
  copy: Pick<
    OnboardingCopy,
    | "installStageDetecting"
    | "installStageInstalling"
    | "installStageRestarting"
    | "installStageReusing"
    | "installStageVerifying"
  >
): OnboardingInstallViewState {
  if (args.busy) {
    const fallbackPercent = args.progress?.phase ? INSTALL_PROGRESS_FALLBACKS[args.progress.phase] : INSTALL_PROGRESS_FALLBACKS.detecting;
    return {
      kind: "installing",
      progressPercent: Math.min(Math.max(args.progress?.percent ?? fallbackPercent, 8), 96),
      stageLabel: installProgressStageLabel(args.progress, copy)
    };
  }

  if (args.install?.installed) {
    return {
      kind: "complete",
      version: args.install.version ?? args.overview?.engine.version
    };
  }

  if (args.overview?.engine.installed) {
    return {
      kind: "found",
      version: args.overview.engine.version
    };
  }

  return {
    kind: "missing",
    version: args.overview?.engine.version
  };
}

export function onboardingDestinationPath(destination: OnboardingDestination, memberId?: string): string {
  switch (destination) {
    case "team":
      return "/team";
    case "chat":
      return memberId ? `/chat?${new URLSearchParams({ memberId }).toString()}` : "/chat";
    case "dashboard":
    default:
      return "/";
  }
}

export function buildOnboardingMemberRequest(draft: OnboardingEmployeeDraft): SaveAIMemberRequest {
  const personality = draft.personalityTraits.length > 0 ? draft.personalityTraits.join(", ") : draft.workStyles.join(", ");
  const avatarPreset = resolveMemberAvatarPreset(draft.avatarPresetId);

  return {
    name: draft.name.trim(),
    jobTitle: draft.jobTitle.trim(),
    avatar: {
      presetId: avatarPreset.id,
      accent: avatarPreset.accent,
      emoji: avatarPreset.emoji,
      theme: avatarPreset.theme
    },
    brainEntryId: draft.brainEntryId,
    personality,
    soul: personality,
    workStyles: draft.workStyles,
    presetSkillIds: draft.presetSkillIds,
    skillIds: [],
    knowledgePackIds: draft.knowledgePackIds,
    capabilitySettings: {
      memoryEnabled: draft.memoryEnabled,
      contextWindow: 128000
    }
  };
}

export function resolveOnboardingModelProviders(
  onboardingState: Pick<OnboardingStateResponse, "config"> | undefined,
  modelConfig: Pick<ModelConfigOverview, "providers"> | undefined
): ResolvedOnboardingModelProvider[] {
  if (!onboardingState) {
    return [];
  }

  return onboardingState.config.modelProviders.map((curated) => ({
    id: curated.id,
    curated,
    provider: modelConfig?.providers.find((candidate) => candidate.id === curated.id)
  }));
}

export type OnboardingRefreshResource = "overview" | "model" | "channel" | "team" | "onboarding";

export function onboardingRefreshResourceForEvent(
  step: OnboardingStep,
  event: ChillClawEvent
): OnboardingRefreshResource | undefined {
  switch (step) {
    case "install":
      return event.type === "deploy.completed" || event.type === "gateway.status" ? "overview" : undefined;
    case "model":
      return undefined;
    case "channel":
      return undefined;
    case "employee":
      return undefined;
    case "welcome":
    default:
      return undefined;
  }
}
