import { resolve } from "node:path";

import type {
  AIMemberDetail,
  AITeamActivityItem,
  ChannelFieldSummary,
  ChannelSetupState,
  EngineTaskResult,
  OnboardingDraftState,
  PresetSkillSyncOverview,
  PresetSkillTargetMode,
  TeamDetail,
  SupportedChannelId
} from "@slackclaw/contracts";
import { normalizePresetSkillIds, presetSkillDefinitionById } from "../config/preset-skill-definitions.js";
import { FilesystemStateAdapter } from "../platform/filesystem-state-adapter.js";
import { getDataDir } from "../runtime-paths.js";

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

export interface AppState {
  selectedProfileId?: string;
  tasks: EngineTaskResult[];
  introCompletedAt?: string;
  setupCompletedAt?: string;
  onboarding?: OnboardingState;
  channelOnboarding?: ChannelOnboardingState;
  aiTeam?: AITeamState;
  skills?: SkillState;
  presetSkills?: PresetSkillState;
  chat?: ChatState;
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

  const migratedChannelOnboarding = channelOnboarding
    ? {
        ...channelOnboarding,
        channels: Object.fromEntries(
          Object.entries(channelOnboarding.channels ?? {}).map(([channelId, channelState]) => {
            const nextChannelId = (channelId === "wechat" ? "wechat-work" : channelId) as SupportedChannelId;
            return [nextChannelId, { ...channelState, id: nextChannelId }];
          })
        ),
        entries: channelOnboarding.entries
          ? Object.fromEntries(
              Object.entries(channelOnboarding.entries).map(([entryId, entry]) => {
                const nextEntryId = entryId.startsWith("wechat:") ? entryId.replace(/^wechat(?=:)/, "wechat-work") : entryId;
                const nextChannelId = (entry.channelId === "wechat" ? "wechat-work" : entry.channelId) as SupportedChannelId;
                return [
                  nextEntryId,
                  {
                    ...entry,
                    id: nextEntryId,
                    channelId: nextChannelId
                  }
                ];
              })
            )
          : undefined
      }
    : channelOnboarding;

  const migratedOnboardingChannel =
    onboardingChannel?.channelId === "wechat"
      ? {
          ...onboardingChannel,
          channelId: "wechat-work"
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

  constructor(filePath = resolve(getDataDir(), "state.json"), filesystem = new FilesystemStateAdapter()) {
    this.filePath = filePath;
    this.filesystem = filesystem;
  }

  async read(): Promise<AppState> {
    const persisted = await this.filesystem.readJson(this.filePath, DEFAULT_STATE);
    return migrateLegacyWechatChannelOnboarding(migrateLegacyOnboardingPresetSkills({ ...DEFAULT_STATE, ...persisted } as AppState));
  }

  async write(nextState: AppState): Promise<void> {
    await this.filesystem.writeJson(this.filePath, nextState);
  }

  async update(updater: (current: AppState) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
  }
}
