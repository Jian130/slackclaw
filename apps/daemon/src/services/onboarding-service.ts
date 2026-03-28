import type {
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  OnboardingEmployeeState,
  OnboardingCompletionSummary,
  OnboardingStateResponse,
  UpdateOnboardingStateRequest
} from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { onboardingUiConfig } from "../config/onboarding-config.js";
import { presetSkillDefinitionById } from "../config/preset-skill-definitions.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { OverviewService } from "./overview-service.js";
import { StateStore, defaultOnboardingDraftState } from "./state-store.js";
import { AITeamService } from "./ai-team-service.js";
import { PresetSkillService } from "./preset-skill-service.js";

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function resolvePresetSkillIds(employee: OnboardingEmployeeState | undefined): string[] {
  if (!employee) {
    return [];
  }

  const configuredPreset = employee.presetId
    ? onboardingUiConfig.employeePresets.find((preset) => preset.id === employee.presetId)
    : undefined;
  const fromEmployee = (employee.presetSkillIds ?? []).filter((presetSkillId) => presetSkillDefinitionById(presetSkillId));
  const fromPreset = configuredPreset?.presetSkillIds ?? [];

  return [...new Set((fromEmployee.length > 0 ? fromEmployee : fromPreset).filter(Boolean))];
}

function normalizedEmployeeState(employee: OnboardingEmployeeState | undefined): OnboardingEmployeeState | undefined {
  if (!employee) {
    return undefined;
  }

  const presetSkillIds = resolvePresetSkillIds(employee);
  return {
    ...employee,
    presetSkillIds
  };
}

function presetSkillTargetMode(install: ReturnType<typeof defaultOnboardingDraftState>["install"]) {
  return install?.disposition === "reused-existing" || install?.disposition === "installed-system" ? "reused-install" : "managed-local";
}

function samePresetSkillSelection(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((presetSkillId, index) => presetSkillId === right[index]);
}

export class OnboardingService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService,
    private readonly channelSetupService: ChannelSetupService,
    private readonly aiTeamService: AITeamService,
    private readonly presetSkillService?: PresetSkillService
  ) {}

  async getState(): Promise<OnboardingStateResponse> {
    const state = await this.store.read();
    const draft = {
      ...(state.onboarding?.draft ?? defaultOnboardingDraftState()),
      employee: normalizedEmployeeState(state.onboarding?.draft?.employee)
    };
    const summary = await this.buildSummary(draft);

    return {
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary,
      presetSkillSync: this.presetSkillService ? await this.presetSkillService.getOverview() : undefined
    };
  }

  async updateState(request: UpdateOnboardingStateRequest): Promise<OnboardingStateResponse> {
    let reuseDraftSummary = false;
    const nextState = await this.store.update((current) => {
      const existingDraft = current.onboarding?.draft ?? defaultOnboardingDraftState();
      const nextDraft = {
        ...existingDraft,
        ...(request.currentStep ? { currentStep: request.currentStep } : {}),
        ...(request.install ? { install: request.install } : {}),
        ...(request.model ? { model: request.model } : {}),
        ...(request.channel ? { channel: request.channel } : {}),
        ...(request.employee ? { employee: normalizedEmployeeState(request.employee) } : {}),
        ...(hasOwn(request, "activeModelAuthSessionId")
          ? { activeModelAuthSessionId: request.activeModelAuthSessionId || undefined }
          : {}),
        ...(hasOwn(request, "activeChannelSessionId")
          ? { activeChannelSessionId: request.activeChannelSessionId || undefined }
          : {})
      };
      reuseDraftSummary = this.shouldReuseDraftSummary(existingDraft, nextDraft);

      return {
        ...current,
        onboarding: {
          draft: nextDraft
        }
      };
    });

    const draft = nextState.onboarding?.draft ?? defaultOnboardingDraftState();
    const targetMode = presetSkillTargetMode(draft.install);
    const desiredPresetSkillIds = resolvePresetSkillIds(draft.employee);
    const existingPresetSelection = nextState.presetSkills?.selections.onboarding;
    const reuseExistingPresetSync =
      Boolean(existingPresetSelection) &&
      existingPresetSelection?.targetMode === targetMode &&
      samePresetSkillSelection(existingPresetSelection?.presetSkillIds ?? [], desiredPresetSkillIds) &&
      Boolean(nextState.presetSkills?.syncOverview);
    let presetSkillSync;
    if (this.presetSkillService) {
      presetSkillSync = reuseExistingPresetSync
        ? await this.presetSkillService.getOverview()
        : await this.presetSkillService.setDesiredPresetSkillIds("onboarding", desiredPresetSkillIds, {
            targetMode
          });
    }
    const summary = reuseDraftSummary ? this.buildDraftSummary(draft) : await this.buildSummary(draft);

    return {
      firstRun: {
        introCompleted: Boolean(nextState.introCompletedAt),
        setupCompleted: Boolean(nextState.setupCompletedAt),
        selectedProfileId: nextState.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary,
      presetSkillSync
    };
  }

  async complete(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> {
    const current = await this.store.read();
    const draft = current.onboarding?.draft ?? defaultOnboardingDraftState();
    const summary = await this.buildSummary(draft);
    await this.adapter.gateway.finalizeOnboardingSetup();

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
      summary: await this.buildSummary(draft),
      presetSkillSync: this.presetSkillService ? await this.presetSkillService.setDesiredPresetSkillIds("onboarding", []) : undefined
    };
  }

  private shouldReuseDraftSummary(
    previousDraft: ReturnType<typeof defaultOnboardingDraftState>,
    nextDraft: ReturnType<typeof defaultOnboardingDraftState>
  ): boolean {
    return JSON.stringify(this.summaryInputs(previousDraft)) === JSON.stringify(this.summaryInputs(nextDraft));
  }

  private summaryInputs(draft: ReturnType<typeof defaultOnboardingDraftState>) {
    return {
      install: draft.install,
      model: draft.model,
      channel: draft.channel,
      employee: draft.employee
    };
  }

  private buildDraftSummary(draft: ReturnType<typeof defaultOnboardingDraftState>): OnboardingCompletionSummary {
    const summary: OnboardingCompletionSummary = {};

    if (draft.install) {
      summary.install = { ...draft.install };
    }

    if (draft.model) {
      summary.model = { ...draft.model };
    }

    if (draft.channel) {
      summary.channel = { ...draft.channel };
    }

    if (draft.employee) {
      summary.employee = { ...draft.employee };
    }

    return summary;
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
      const matchedEntry =
        modelConfig.savedEntries.find((entry) => entry.id === draftModel.entryId) ??
        modelConfig.savedEntries.find((entry) => entry.modelKey === draftModel.modelKey && entry.providerId === draftModel.providerId);

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
