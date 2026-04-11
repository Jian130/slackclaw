import { resolve } from "node:path";

import type {
  AIMemberDetail,
  AITeamActivityItem,
  ChannelFieldSummary,
  ChannelSetupState,
  EngineTaskResult,
  LocalModelRuntimeAction,
  LocalModelRuntimePhase,
  LocalModelRuntimeStatus,
  OnboardingDraftState,
  PresetSkillSyncOverview,
  PresetSkillTargetMode,
  TeamDetail,
  SupportedChannelId
} from "@chillclaw/contracts";
import { normalizePresetSkillIds, presetSkillDefinitionById } from "../config/ai-member-presets.js";
import { FilesystemStateAdapter } from "../platform/filesystem-state-adapter.js";
import { getDataDir } from "../runtime-paths.js";
import { formatConsoleLine } from "./logger.js";

export interface StoredChannelEntryState {
  id: string;
  channelId: SupportedChannelId;
  label: string;
  editableValues: Record<string, string>;
  maskedConfigSummary: ChannelFieldSummary[];
  lastUpdatedAt: string;
}

export interface ChannelOnboardingState {
  baseOnboardingCompletedAt?: string;
  gatewayStartedAt?: string;
  channels: Record<string, ChannelSetupState>;
  entries?: Record<string, StoredChannelEntryState>;
}

export interface AITeamState {
  teamVision: string;
  members: Record<string, AIMemberDetail>;
  teams: Record<string, TeamDetail>;
  activity: AITeamActivityItem[];
}

export interface StoredCustomSkillState {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  homepage?: string;
  updatedAt: string;
}

export interface SkillState {
  customEntries: Record<string, StoredCustomSkillState>;
}

export interface PresetSkillSelectionState {
  presetSkillIds: string[];
  targetMode: PresetSkillTargetMode;
  updatedAt: string;
}

export interface PresetSkillState {
  targetMode: PresetSkillTargetMode;
  selections: Record<string, PresetSkillSelectionState>;
  syncOverview?: PresetSkillSyncOverview;
  lastReconciledAt?: string;
}

export interface StoredChatThreadState {
  id: string;
  memberId: string;
  agentId: string;
  sessionKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastPreview?: string;
}

export interface ChatState {
  threads: Record<string, StoredChatThreadState>;
}

export interface OnboardingState {
  draft: OnboardingDraftState;
}

export interface OnboardingWarmupState {
  taskId: string;
  memberId: string;
  agentId: string;
  presetSkillIds: string[];
  targetMode: PresetSkillTargetMode;
  status: "pending" | "running" | "completed" | "failed";
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  lastError?: string;
}

export interface LocalModelRuntimeState {
  managedEntryId?: string;
  selectedModelKey?: string;
  status?: LocalModelRuntimeStatus;
  lastError?: string;
  activeAction?: LocalModelRuntimeAction;
  activePhase?: LocalModelRuntimePhase;
  progressMessage?: string;
  progressDigest?: string;
  progressCompletedBytes?: number;
  progressTotalBytes?: number;
  progressPercent?: number;
  lastProgressAt?: string;
}

export interface AppState {
  selectedProfileId?: string;
  tasks: EngineTaskResult[];
  introCompletedAt?: string;
  setupCompletedAt?: string;
  onboarding?: OnboardingState;
  onboardingWarmups?: Record<string, OnboardingWarmupState>;
  channelOnboarding?: ChannelOnboardingState;
  aiTeam?: AITeamState;
  skills?: SkillState;
  presetSkills?: PresetSkillState;
  chat?: ChatState;
  localModelRuntime?: LocalModelRuntimeState;
}

export function defaultOnboardingDraftState(): OnboardingDraftState {
  return {
    currentStep: "welcome"
  };
}

export function defaultPresetSkillState(): PresetSkillState {
  return {
    targetMode: "managed-local",
    selections: {}
  };
}

const DEFAULT_STATE: AppState = {
  selectedProfileId: undefined,
  tasks: []
};

const LOCAL_MODEL_RUNTIME_TEXT_MAX_LENGTH = 4_000;
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const NON_PRINTABLE_RUNTIME_TEXT_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const LEGACY_WECHAT_WORK_FIELD_IDS = new Set(["corpId", "agentId", "token", "encodingAesKey"]);
const LEGACY_WECHAT_WORK_SUMMARY_LABELS = new Set(["Corp ID", "Agent ID", "Webhook token", "Encoding AES key"]);

function normalizeLocalRuntimeText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const stripped = value
    .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "")
    .replace(/\r+/g, "\n")
    .replace(NON_PRINTABLE_RUNTIME_TEXT_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!stripped) {
    return undefined;
  }

  if (stripped.length <= LOCAL_MODEL_RUNTIME_TEXT_MAX_LENGTH) {
    return stripped;
  }

  return `...${stripped.slice(-(LOCAL_MODEL_RUNTIME_TEXT_MAX_LENGTH - 3))}`;
}

function normalizeLocalModelRuntimeState(state: LocalModelRuntimeState | undefined): LocalModelRuntimeState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    ...state,
    lastError: normalizeLocalRuntimeText(state.lastError),
    progressMessage: normalizeLocalRuntimeText(state.progressMessage)
  };
}

function normalizeAppState(state: AppState): AppState {
  return {
    ...state,
    localModelRuntime: normalizeLocalModelRuntimeState(state.localModelRuntime)
  };
}

function summarizeStateForLog(state: AppState): string {
  const draft = state.onboarding?.draft;
  const draftParts = draft
    ? [
        `step=${draft.currentStep}`,
        `modelEntryId=${draft.model?.entryId ?? "(none)"}`,
        `modelKey=${draft.model?.modelKey ?? "(none)"}`,
        `channelEntryId=${draft.channel?.entryId ?? "(none)"}`
      ]
    : ["onboarding=(none)"];

  return [
    ...draftParts,
    `setupCompleted=${state.setupCompletedAt ? "true" : "false"}`,
    `warmups=${Object.keys(state.onboardingWarmups ?? {}).length}`,
    `members=${Object.keys(state.aiTeam?.members ?? {}).length}`
  ].join(" ");
}

function containsLegacyWechatWorkMetadata(value: string | undefined): boolean {
  return /wechat work|wecom|workaround/i.test(value ?? "");
}

function shouldMigrateLegacyWechatWorkEntry(entry: StoredChannelEntryState): boolean {
  if (entry.channelId !== "wechat") {
    return false;
  }

  if (Object.keys(entry.editableValues ?? {}).some((fieldId) => LEGACY_WECHAT_WORK_FIELD_IDS.has(fieldId))) {
    return true;
  }

  if (entry.maskedConfigSummary.some((summary) => LEGACY_WECHAT_WORK_SUMMARY_LABELS.has(summary.label) || containsLegacyWechatWorkMetadata(summary.value))) {
    return true;
  }

  return containsLegacyWechatWorkMetadata(entry.label);
}

function shouldMigrateLegacyWechatWorkChannel(channelState: ChannelSetupState, hasLegacyWechatWorkEntries: boolean): boolean {
  if (channelState.id !== "wechat") {
    return false;
  }

  if (hasLegacyWechatWorkEntries) {
    return true;
  }

  return [
    channelState.title,
    channelState.summary,
    channelState.detail,
    ...(channelState.logs ?? [])
  ].some((value) => containsLegacyWechatWorkMetadata(value));
}

function normalizeLegacyWechatWorkEditableValues(editableValues: Record<string, string>): Record<string, string> {
  const botId = editableValues.botId?.trim() || editableValues.agentId?.trim() || "";
  const nextValues = Object.fromEntries(
    Object.entries(editableValues).filter(([fieldId]) => !LEGACY_WECHAT_WORK_FIELD_IDS.has(fieldId))
  );

  if (botId) {
    nextValues.botId = botId;
  }

  return nextValues;
}

function normalizeLegacyWechatWorkMaskedSummary(
  maskedConfigSummary: ChannelFieldSummary[],
  editableValues: Record<string, string>
): ChannelFieldSummary[] {
  const nextSummary = maskedConfigSummary
    .filter((summary) => !["Corp ID", "Webhook token", "Encoding AES key"].includes(summary.label))
    .map((summary) => ({
      ...summary,
      label: summary.label === "Agent ID" ? "Bot ID" : summary.label
    }));

  const hasBotId = nextSummary.some((summary) => summary.label === "Bot ID");
  if (hasBotId) {
    return nextSummary;
  }

  const botId = editableValues.botId?.trim() || editableValues.agentId?.trim();
  if (!botId) {
    return nextSummary;
  }

  return [{ label: "Bot ID", value: botId }, ...nextSummary];
}

function migrateLegacyOnboardingPresetSkills(state: AppState): AppState {
  const employee = state.onboarding?.draft?.employee as (OnboardingDraftState["employee"] & {
    skillIds?: string[];
  }) | undefined;

  if (!employee || employee.presetSkillIds?.length) {
    return state;
  }

  const legacyPresetSkillIds = normalizePresetSkillIds(employee.skillIds).filter((presetSkillId) => presetSkillDefinitionById(presetSkillId));
  if (legacyPresetSkillIds.length === 0) {
    return state;
  }

  const { skillIds: _legacySkillIds, ...nextEmployee } = employee;

  return {
    ...state,
    onboarding: {
      ...(state.onboarding ?? { draft: defaultOnboardingDraftState() }),
      draft: {
        ...(state.onboarding?.draft ?? defaultOnboardingDraftState()),
        employee: {
          ...nextEmployee,
          presetSkillIds: legacyPresetSkillIds
        }
      }
    }
  };
}

function migrateLegacyWechatChannelOnboarding(state: AppState): AppState {
  const channelOnboarding = state.channelOnboarding;
  const onboardingChannel = state.onboarding?.draft.channel;
  const legacyWechatWorkEntryIds = new Set(
    Object.entries(channelOnboarding?.entries ?? {})
      .filter(([entryId, entry]) => entryId.startsWith("wechat:") && shouldMigrateLegacyWechatWorkEntry(entry))
      .map(([entryId]) => entryId)
  );
  const hasLegacyWechatWorkEntries = legacyWechatWorkEntryIds.size > 0;
  const legacyWechatWorkChannelIds = new Set(
    Object.entries(channelOnboarding?.channels ?? {})
      .filter(([channelId, channelState]) => channelId === "wechat" && shouldMigrateLegacyWechatWorkChannel(channelState, hasLegacyWechatWorkEntries))
      .map(([channelId]) => channelId)
  );

  const migrateLegacyChannelId = (channelId: string, shouldMigrate: boolean): SupportedChannelId =>
    (shouldMigrate && channelId === "wechat" ? "wechat-work" : channelId) as SupportedChannelId;
  const migrateLegacyEntryId = (entryId: string, shouldMigrate: boolean): string =>
    shouldMigrate && entryId.startsWith("wechat:") ? entryId.replace(/^wechat(?=:)/, "wechat-work") : entryId;

  const migratedChannelOnboarding = channelOnboarding
    ? {
        ...channelOnboarding,
        channels: Object.entries(channelOnboarding.channels ?? {}).reduce<Record<string, ChannelSetupState>>((nextChannels, [channelId, channelState]) => {
          const shouldMigrate = legacyWechatWorkChannelIds.has(channelId);
          const nextChannelId = migrateLegacyChannelId(channelId, shouldMigrate);
          const canonicalEntryExists = nextChannelId in nextChannels;

          if (canonicalEntryExists && shouldMigrate && nextChannelId !== channelId) {
            return nextChannels;
          }

          nextChannels[nextChannelId] = { ...channelState, id: nextChannelId };
          return nextChannels;
        }, {}),
        entries: channelOnboarding.entries
          ? Object.entries(channelOnboarding.entries).reduce<Record<string, StoredChannelEntryState>>((nextEntries, [entryId, entry]) => {
              const shouldMigrate = legacyWechatWorkEntryIds.has(entryId);
              const nextEntryId = migrateLegacyEntryId(entryId, shouldMigrate);
              const nextChannelId = migrateLegacyChannelId(entry.channelId, shouldMigrate);
              const canonicalEntryExists = nextEntryId in nextEntries;

              if (canonicalEntryExists && shouldMigrate && nextEntryId !== entryId) {
                return nextEntries;
              }

              const nextEditableValues = shouldMigrate ? normalizeLegacyWechatWorkEditableValues(entry.editableValues) : entry.editableValues;
              nextEntries[nextEntryId] = {
                ...entry,
                id: nextEntryId,
                channelId: nextChannelId,
                editableValues: nextEditableValues,
                maskedConfigSummary: shouldMigrate
                  ? normalizeLegacyWechatWorkMaskedSummary(entry.maskedConfigSummary, nextEditableValues)
                  : entry.maskedConfigSummary
              };
              return nextEntries;
            }, {})
          : undefined
      }
    : channelOnboarding;

  const migratedOnboardingChannel =
    onboardingChannel
      ? {
          ...onboardingChannel,
          channelId: migrateLegacyChannelId(
            onboardingChannel.channelId,
            legacyWechatWorkChannelIds.has(onboardingChannel.channelId) || legacyWechatWorkEntryIds.has(onboardingChannel.entryId ?? "")
          ),
          entryId: onboardingChannel.entryId
            ? migrateLegacyEntryId(onboardingChannel.entryId, legacyWechatWorkEntryIds.has(onboardingChannel.entryId))
            : onboardingChannel.entryId
        }
      : onboardingChannel;

  if (migratedChannelOnboarding === channelOnboarding && migratedOnboardingChannel === onboardingChannel) {
    return state;
  }

  return {
    ...state,
    channelOnboarding: migratedChannelOnboarding,
    onboarding: state.onboarding
      ? {
          ...state.onboarding,
          draft: {
            ...state.onboarding.draft,
            channel: migratedOnboardingChannel
          }
        }
      : state.onboarding
  };
}

export class StateStore {
  private readonly filePath: string;
  private readonly filesystem: FilesystemStateAdapter;
  private pendingMutation: Promise<void> = Promise.resolve();

  constructor(filePath = resolve(getDataDir(), "state.json"), filesystem = new FilesystemStateAdapter()) {
    this.filePath = filePath;
    this.filesystem = filesystem;
  }

  private async readPersisted(): Promise<AppState> {
    console.log(formatConsoleLine(`read ${this.filePath}`, { scope: "stateStore" }));
    const persisted = await this.filesystem.readJson(this.filePath, DEFAULT_STATE);
    return normalizeAppState(migrateLegacyWechatChannelOnboarding(migrateLegacyOnboardingPresetSkills({ ...DEFAULT_STATE, ...persisted } as AppState)));
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingMutation.then(operation, operation);
    this.pendingMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async read(): Promise<AppState> {
    await this.pendingMutation;
    return this.readPersisted();
  }

  async write(nextState: AppState): Promise<void> {
    await this.enqueueMutation(() => {
      const normalized = normalizeAppState(nextState);
      console.log(formatConsoleLine(`write ${this.filePath} ${summarizeStateForLog(normalized)}`, { scope: "stateStore" }));
      return this.filesystem.writeJson(this.filePath, normalized);
    });
  }

  async update(updater: (current: AppState) => AppState): Promise<AppState> {
    return this.enqueueMutation(async () => {
      const current = await this.readPersisted();
      const next = normalizeAppState(updater(current));
      console.log(formatConsoleLine(`write ${this.filePath} ${summarizeStateForLog(next)}`, { scope: "stateStore" }));
      await this.filesystem.writeJson(this.filePath, next);
      return next;
    });
  }
}
