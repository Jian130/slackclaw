import type {
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  OnboardingCompletionSummary,
  OnboardingStateResponse,
  UpdateOnboardingStateRequest
} from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { onboardingUiConfig } from "../config/onboarding-config.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { OverviewService } from "./overview-service.js";
import { StateStore, defaultOnboardingDraftState } from "./state-store.js";
import { AITeamService } from "./ai-team-service.js";

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export class OnboardingService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService,
    private readonly channelSetupService: ChannelSetupService,
    private readonly aiTeamService: AITeamService
  ) {}

  async getState(): Promise<OnboardingStateResponse> {
    const state = await this.store.read();
    const draft = state.onboarding?.draft ?? defaultOnboardingDraftState();
    const summary = await this.buildSummary(draft);

    return {
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary
    };
  }

  async updateState(request: UpdateOnboardingStateRequest): Promise<OnboardingStateResponse> {
    const nextState = await this.store.update((current) => {
      const existingDraft = current.onboarding?.draft ?? defaultOnboardingDraftState();
      const nextDraft = {
        ...existingDraft,
        ...(request.currentStep ? { currentStep: request.currentStep } : {}),
        ...(request.install ? { install: request.install } : {}),
        ...(request.model ? { model: request.model } : {}),
        ...(request.channel ? { channel: request.channel } : {}),
        ...(request.employee ? { employee: request.employee } : {}),
        ...(hasOwn(request, "activeModelAuthSessionId")
          ? { activeModelAuthSessionId: request.activeModelAuthSessionId || undefined }
          : {}),
        ...(hasOwn(request, "activeChannelSessionId")
          ? { activeChannelSessionId: request.activeChannelSessionId || undefined }
          : {})
      };

      return {
        ...current,
        onboarding: {
          draft: nextDraft
        }
      };
    });

    const draft = nextState.onboarding?.draft ?? defaultOnboardingDraftState();
    const summary = await this.buildSummary(draft);

    return {
      firstRun: {
        introCompleted: Boolean(nextState.introCompletedAt),
        setupCompleted: Boolean(nextState.setupCompletedAt),
        selectedProfileId: nextState.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary
    };
  }

  async complete(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> {
    const current = await this.store.read();
    const draft = current.onboarding?.draft ?? defaultOnboardingDraftState();
    const summary = await this.buildSummary(draft);

    await this.store.update((existing) => ({
      ...existing,
      introCompletedAt: existing.introCompletedAt ?? new Date().toISOString(),
      setupCompletedAt: existing.setupCompletedAt ?? new Date().toISOString(),
      onboarding: undefined
    }));

    return {
      status: "completed",
      destination: request.destination,
      summary,
      overview: await this.overviewService.getOverview()
    };
  }

  async reset(): Promise<OnboardingStateResponse> {
    const nextState = await this.store.update((current) => ({
      ...current,
      setupCompletedAt: undefined,
      onboarding: {
        draft: defaultOnboardingDraftState()
      }
    }));

    const draft = nextState.onboarding?.draft ?? defaultOnboardingDraftState();

    return {
      firstRun: {
        introCompleted: Boolean(nextState.introCompletedAt),
        setupCompleted: false,
        selectedProfileId: nextState.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary: await this.buildSummary(draft)
    };
  }

  private async buildSummary(draft: ReturnType<typeof defaultOnboardingDraftState>): Promise<OnboardingCompletionSummary> {
    const summary: OnboardingCompletionSummary = {};

    if (draft.install) {
      const status = await this.adapter.instances.status();
      summary.install = {
        ...draft.install,
        installed: status.installed,
        version: status.version ?? draft.install.version
      };
    }

    if (draft.model) {
      const draftModel = draft.model;
      const modelConfig = await this.adapter.config.getModelConfig();
      const matchedEntry = draftModel.entryId
        ? modelConfig.savedEntries.find((entry) => entry.id === draftModel.entryId)
        : modelConfig.savedEntries.find((entry) => entry.modelKey === draftModel.modelKey && entry.providerId === draftModel.providerId);

      summary.model = matchedEntry
        ? {
            providerId: matchedEntry.providerId,
            modelKey: matchedEntry.modelKey,
            entryId: matchedEntry.id
          }
        : draftModel;
    }

    if (draft.channel) {
      const draftChannel = draft.channel;
      const channelConfig = await this.channelSetupService.getConfigOverview();
      const matchedEntry = draftChannel.entryId
        ? channelConfig.entries.find((entry) => entry.id === draftChannel.entryId)
        : channelConfig.entries.find((entry) => entry.channelId === draftChannel.channelId);

      summary.channel = matchedEntry
        ? {
            channelId: matchedEntry.channelId,
            entryId: matchedEntry.id
          }
        : draftChannel;
    }

    if (draft.employee) {
      const draftEmployee = draft.employee;
      const aiTeam = await this.aiTeamService.getOverview();
      const matchedMember = draftEmployee.memberId
        ? aiTeam.members.find((member) => member.id === draftEmployee.memberId)
        : aiTeam.members.find((member) => member.name === draftEmployee.name && member.jobTitle === draftEmployee.jobTitle);

      summary.employee = matchedMember
        ? {
            memberId: matchedMember.id,
            name: matchedMember.name,
            jobTitle: matchedMember.jobTitle,
            avatarPresetId: matchedMember.avatar.presetId
          }
        : draftEmployee;
    }

    return summary;
  }
}
