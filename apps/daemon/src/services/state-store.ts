import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  AIMemberDetail,
  AITeamActivityItem,
  ChannelFieldSummary,
  ChannelSetupState,
  EngineTaskResult,
  OnboardingDraftState,
  TeamDetail,
  SupportedChannelId
} from "@slackclaw/contracts";
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
  chat?: ChatState;
}

export function defaultOnboardingDraftState(): OnboardingDraftState {
  return {
    currentStep: "welcome"
  };
}

const DEFAULT_STATE: AppState = {
  selectedProfileId: undefined,
  tasks: []
};

export class StateStore {
  private readonly filePath: string;

  constructor(filePath = resolve(getDataDir(), "state.json")) {
    this.filePath = filePath;
  }

  async read(): Promise<AppState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return { ...DEFAULT_STATE, ...JSON.parse(raw) } as AppState;
    } catch {
      return DEFAULT_STATE;
    }
  }

  async write(nextState: AppState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(nextState, null, 2));
  }

  async update(updater: (current: AppState) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
  }
}
