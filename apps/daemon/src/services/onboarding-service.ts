import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type {
  ChannelConfigOverview,
  ChannelConfigActionResponse,
  ChannelSessionInputRequest,
  ChannelSessionResponse,
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  LocalModelRuntimeOverview,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  OnboardingModelState,
  OnboardingCompletionSummary,
  OnboardingEmployeeState,
  OnboardingInstallState,
  OnboardingStateResponse,
  OnboardingStep,
  OnboardingStepNavigationRequest,
  SaveAIMemberRequest,
  SaveChannelEntryRequest,
  SaveModelEntryRequest,
  UpdateOnboardingStateRequest
} from "@chillclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { aiMemberPresetById, normalizePresetSkillIds, presetSkillDefinitionById } from "../config/ai-member-presets.js";
import { resolveOnboardingUiConfig } from "../config/onboarding-config.js";
import type { ChannelSetupService } from "./channel-setup-service.js";
import { EventPublisher } from "./event-publisher.js";
import { fallbackMutationSyncMeta } from "./mutation-sync.js";
import type { OverviewService } from "./overview-service.js";
import type { PresetSkillService } from "./preset-skill-service.js";
import { SetupService } from "./setup-service.js";
import { AITeamService } from "./ai-team-service.js";
import type { LocalModelRuntimeService } from "./local-model-runtime-service.js";
import { formatConsoleLine } from "./logger.js";
import { StateStore, defaultOnboardingDraftState, type OnboardingWarmupState } from "./state-store.js";

const onboardingUiConfig = resolveOnboardingUiConfig();
const ONBOARDING_STEP_ORDER: OnboardingStep[] = ["welcome", "install", "permissions", "model", "channel", "employee"];
const ONBOARDING_WARMUP_TASK_PREFIX = "onboarding-warmup";

const AVATAR_PRESET_DETAILS: Record<string, { accent: string; emoji: string; theme: string }> = {
  operator: { accent: "var(--avatar-1)", emoji: "🦊", theme: "sunrise" },
  analyst: { accent: "var(--avatar-2)", emoji: "🧭", theme: "forest" },
  partner: { accent: "var(--avatar-3)", emoji: "🌟", theme: "ocean" },
  builder: { accent: "var(--avatar-4)", emoji: "🛠️", theme: "ember" },
  "onboarding-analyst": { accent: "#97b5ea", emoji: "🧠", theme: "onboarding" },
  "onboarding-strategist": { accent: "#a9bde8", emoji: "🗺️", theme: "onboarding" },
  "onboarding-builder": { accent: "#9ec1ef", emoji: "🛠️", theme: "onboarding" },
  "onboarding-guide": { accent: "#a0c7ef", emoji: "✨", theme: "onboarding" },
  "onboarding-visionary": { accent: "#afc6f0", emoji: "🚀", theme: "onboarding" }
};

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

function stepIsAtOrAfter(currentStep: OnboardingStep, target: OnboardingStep): boolean {
  return stepIndex(currentStep) >= stepIndex(target);
}

function isCompletedInstall(draft: ReturnType<typeof defaultOnboardingDraftState>): boolean {
  return draft.install?.installed === true;
}

function isConfirmedPermissions(draft: ReturnType<typeof defaultOnboardingDraftState>): boolean {
  return draft.permissions?.confirmed === true;
}

function onboardingTargetMode(install: OnboardingInstallState | undefined) {
  return install?.disposition === "reused-existing" || install?.disposition === "installed-system" ? "reused-install" : "managed-local";
}

function resolvePresetSkillIds(employee: OnboardingEmployeeState | undefined): string[] {
  if (!employee) {
    return [];
  }

  const configuredPreset = employee.presetId ? aiMemberPresetById(employee.presetId) : undefined;
  const fromEmployee = normalizePresetSkillIds(employee.presetSkillIds).filter((presetSkillId) => presetSkillDefinitionById(presetSkillId));
  const fromPreset = normalizePresetSkillIds(configuredPreset?.presetSkillIds);

  return [...new Set((fromEmployee.length > 0 ? fromEmployee : fromPreset).filter(Boolean))];
}

function normalizedEmployeeState(employee: OnboardingEmployeeState | undefined): OnboardingEmployeeState | undefined {
  if (!employee) {
    return undefined;
  }

  return {
    ...employee,
    // Preserve in-progress text exactly as typed during onboarding autosave.
    name: employee.name ?? "",
    jobTitle: employee.jobTitle ?? "",
    presetSkillIds: resolvePresetSkillIds(employee),
    knowledgePackIds: [...new Set((employee.knowledgePackIds ?? []).map((value) => value.trim()).filter(Boolean))],
    workStyles: [...new Set((employee.workStyles ?? []).map((value) => value.trim()).filter(Boolean))],
    personalityTraits: [...new Set((employee.personalityTraits ?? []).map((value) => value.trim()).filter(Boolean))]
  };
}

function normalizeModelLookupKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function modelKeyMatches(left: string | undefined, right: string | undefined): boolean {
  if (!left?.trim() || !right?.trim()) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftNormalized = normalizeModelLookupKey(left.includes("/") ? left.slice(left.indexOf("/") + 1) : left);
  const rightNormalized = normalizeModelLookupKey(right.includes("/") ? right.slice(right.indexOf("/") + 1) : right);
  return Boolean(leftNormalized) && leftNormalized === rightNormalized;
}

function runtimeDerivedModelEntryId(modelKey: string): string {
  return `runtime:${modelKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function onboardingModelFromLocalRuntime(
  localRuntime: LocalModelRuntimeOverview | undefined
): OnboardingModelState | undefined {
  const modelKey = localRuntime?.chosenModelKey?.trim();
  if (
    !localRuntime?.activeInOpenClaw ||
    localRuntime.status !== "ready" ||
    !localRuntime.runtimeReachable ||
    !localRuntime.modelDownloaded ||
    !modelKey?.startsWith("ollama/")
  ) {
    return undefined;
  }

  return {
    providerId: "ollama",
    modelKey,
    methodId: "ollama-local",
    entryId: localRuntime.managedEntryId?.trim() || runtimeDerivedModelEntryId(modelKey)
  };
}

function resolveSavedModelEntry(
  savedEntries: ModelConfigActionResponse["modelConfig"]["savedEntries"],
  criteria: {
    entryId?: string;
    providerId?: string;
    modelKey?: string;
    preferDefault?: boolean;
  }
) {
  if (criteria.entryId) {
    const byId = savedEntries.find((entry) => entry.id === criteria.entryId);
    if (byId) {
      return byId;
    }
  }

  const providerEntries = criteria.providerId
    ? savedEntries.filter((entry) => entry.providerId === criteria.providerId)
    : savedEntries;
  const byModel = criteria.modelKey
    ? providerEntries.find((entry) => modelKeyMatches(entry.modelKey, criteria.modelKey))
    : undefined;

  if (byModel) {
    return byModel;
  }

  if (criteria.preferDefault) {
    const providerDefault = providerEntries.find((entry) => entry.isDefault);
    if (providerDefault) {
      return providerDefault;
    }
  }

  return providerEntries.length === 1 ? providerEntries[0] : undefined;
}

function onboardingModelFromSavedEntry(
  entry: ModelConfigActionResponse["modelConfig"]["savedEntries"][number],
  fallback?: OnboardingModelState
): OnboardingModelState {
  return {
    providerId: entry.providerId,
    modelKey: entry.modelKey,
    methodId: entry.authMethodId ?? fallback?.methodId,
    entryId: entry.id
  };
}

function resolveAvatarPreset(presetId: string | undefined) {
  const fallback = AVATAR_PRESET_DETAILS.operator;
  return {
    presetId: presetId?.trim() || "operator",
    ...(AVATAR_PRESET_DETAILS[presetId?.trim() || ""] ?? fallback)
  };
}

function buildOnboardingMemberRequest(
  employee: OnboardingEmployeeState,
  brainEntryId: string
): SaveAIMemberRequest {
  const personality = (employee.personalityTraits?.length ? employee.personalityTraits : employee.workStyles ?? []).join(", ");
  const avatar = resolveAvatarPreset(employee.avatarPresetId);

  return {
    name: employee.name.trim(),
    jobTitle: employee.jobTitle.trim(),
    avatar,
    brainEntryId,
    personality,
    soul: personality,
    workStyles: employee.workStyles ?? [],
    presetSkillIds: resolvePresetSkillIds(employee),
    skillIds: [],
    knowledgePackIds: employee.knowledgePackIds ?? [],
    capabilitySettings: {
      memoryEnabled: employee.memoryEnabled ?? true,
      contextWindow: 128000
    }
  };
}

export class OnboardingService {
  private readonly warmupJobs = new Map<string, Promise<void>>();

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService,
    private readonly channelSetupService: ChannelSetupService,
    private readonly aiTeamService: AITeamService,
    private readonly presetSkillService?: PresetSkillService,
    private readonly eventPublisher?: EventPublisher,
    private readonly localModelRuntimeService?: LocalModelRuntimeService
  ) {
    void this.resumePendingWarmups();
  }

  async getState(): Promise<OnboardingStateResponse> {
    const t0 = performance.now();

    const t1 = performance.now();
    const { state } = await this.readResolvedDraftState();
    console.log(formatConsoleLine(`readResolvedDraftState: ${(performance.now() - t1).toFixed(1)}ms`, { scope: "onboarding.getState" }));

    const t2 = performance.now();
    const result = await this.buildStateResponse(state);
    console.log(formatConsoleLine(`buildStateResponse: ${(performance.now() - t2).toFixed(1)}ms`, { scope: "onboarding.getState" }));

    console.log(formatConsoleLine(`total: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "onboarding.getState" }));
    return result;
  }

  async updateState(
    request: UpdateOnboardingStateRequest,
    options?: { responseSummaryMode?: "draft" | "resolved" }
  ): Promise<OnboardingStateResponse> {
    let reuseDraftSummary = false;
    const nextState = await this.store.update((current) => {
      const existingDraft = current.onboarding?.draft ?? defaultOnboardingDraftState();
      const nextDraft = {
        ...existingDraft,
        ...(request.currentStep ? { currentStep: request.currentStep } : {}),
        ...(hasOwn(request, "install") ? { install: request.install } : {}),
        ...(hasOwn(request, "permissions") ? { permissions: request.permissions } : {}),
        ...(hasOwn(request, "model") ? { model: request.model } : {}),
        ...(hasOwn(request, "channel") ? { channel: request.channel } : {}),
        ...(hasOwn(request, "channelProgress") ? { channelProgress: request.channelProgress } : {}),
        ...(hasOwn(request, "employee") ? { employee: normalizedEmployeeState(request.employee) } : {}),
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

    const draft = {
      ...(nextState.onboarding?.draft ?? defaultOnboardingDraftState()),
      employee: normalizedEmployeeState(nextState.onboarding?.draft?.employee)
    };
    const presetSkillSync = this.presetSkillService
      ? await this.presetSkillService.getOverview()
      : undefined;
    const summary =
      options?.responseSummaryMode === "draft" || reuseDraftSummary
        ? this.buildDraftSummary(draft)
        : await this.buildSummary(draft);

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

  async navigateStep(request: OnboardingStepNavigationRequest): Promise<OnboardingStateResponse> {
    const { draft } = await this.readResolvedDraftState();
    const navigationDraft =
      stepIndex(request.step) > stepIndex(draft.currentStep)
        ? await this.repairProgressedDraft({
            ...draft,
            currentStep: request.step
          }, {
            allowLocalRuntimeModelRepair: request.step === "channel"
          })
        : draft;
    const canUseDraftNavigationSummary = request.step === "channel" && Boolean(navigationDraft.model?.entryId);
    const summary = canUseDraftNavigationSummary
      ? this.buildDraftSummary(navigationDraft)
      : await this.buildSummary(navigationDraft);

    if (!this.canNavigateToStep(draft.currentStep, request.step, navigationDraft, summary)) {
      throw new Error("Finish the earlier onboarding steps before moving ahead.");
    }

    return this.updateState(
      {
        currentStep: request.step,
        install: navigationDraft.install,
        permissions: navigationDraft.permissions,
        model: navigationDraft.model,
        channel: navigationDraft.channel,
        channelProgress: navigationDraft.channelProgress,
        activeChannelSessionId: navigationDraft.activeChannelSessionId
      },
      canUseDraftNavigationSummary ? { responseSummaryMode: "draft" } : undefined
    );
  }

  async detectRuntime(): Promise<OnboardingStateResponse> {
    const install = await this.detectInstallState((await this.store.read()).onboarding?.draft.install);
    return this.updateState({
      currentStep: "install",
      install
    });
  }

  async installRuntime(options?: { forceLocal?: boolean }) {
    const setupService = new SetupService(this.adapter, this.store, this.overviewService, this.eventPublisher);
    const result = await setupService.runFirstRunSetup({ forceLocal: options?.forceLocal ?? true });
    const install = await this.detectInstallStateFromRuntime(result.install, (await this.store.read()).onboarding?.draft.install);
    const onboarding = await this.updateState({
      currentStep: install.installed ? "permissions" : "install",
      install
    });

    return {
      ...result,
      onboarding
    };
  }

  async updateRuntime() {
    const targets = await this.adapter.instances.getDeploymentTargets();
    const target = targets.targets.find((entry) => entry.active) ?? targets.targets.find((entry) => entry.installed);
    const result = target?.id === "standard" || target?.id === "managed-local"
      ? await this.adapter.instances.updateDeploymentTarget(target.id)
      : await this.adapter.instances.update();
    const install = await this.detectInstallStateFromRuntime(undefined, (await this.store.read()).onboarding?.draft.install);
    const onboarding = await this.updateState({
      currentStep: install.installed ? "permissions" : "install",
      install
    });

    return {
      status: "completed" as const,
      message: result.message,
      steps: [
        {
          id: "update-openclaw",
          title: "Update the managed OpenClaw runtime",
          status: "completed" as const,
          detail: result.message
        }
      ],
      overview: await this.overviewService.getOverview(),
      onboarding
    };
  }

  async confirmPermissions(): Promise<OnboardingStateResponse> {
    const { draft } = await this.readResolvedDraftState();
    if (!isCompletedInstall(draft)) {
      throw new Error("Install OpenClaw before confirming permissions.");
    }

    return this.updateState({
      currentStep: "model",
      permissions: {
        confirmed: true,
        confirmedAt: new Date().toISOString()
      }
    });
  }

  async reuseDetectedRuntime(): Promise<OnboardingStateResponse> {
    const install = await this.detectInstallState((await this.store.read()).onboarding?.draft.install);
    if (!install.installed) {
      throw new Error("OpenClaw is not installed yet.");
    }

    return this.updateState({
      currentStep: "permissions",
      install: {
        ...install,
        disposition: install.disposition === "installed-managed" ? "installed-managed" : "reused-existing"
      }
    });
  }

  async saveModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    const { draft } = await this.readResolvedDraftState();
    if (!isCompletedInstall(draft) || !isConfirmedPermissions(draft)) {
      throw new Error("Confirm permissions before configuring the first model.");
    }

    const shouldUpdateExistingEntry =
      Boolean(draft.model?.entryId) && draft.model?.providerId === request.providerId;
    const mutation = shouldUpdateExistingEntry && draft.model?.entryId
      ? await this.adapter.config.updateSavedModelEntry(draft.model.entryId, request)
      : await this.adapter.config.createSavedModelEntry(request);
    const result = await this.clearOnboardingFallbackModels(mutation);
    const modelConfig = this.localModelRuntimeService
      ? await this.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      : result.modelConfig;
    const sync = this.eventPublisher?.publishModelConfigUpdated(modelConfig) ?? fallbackMutationSyncMeta(!result.authSession);
    const onboarding = await this.updateState(this.modelDraftPatchFromMutation(request, result));

    return {
      ...result,
      modelConfig,
      ...sync,
      settled: result.status === "interactive" ? false : sync.settled,
      onboarding
    };
  }

  async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    let response: ModelAuthSessionResponse;
    try {
      response = await this.clearOnboardingFallbacksFromSession(await this.adapter.config.getModelAuthSession(sessionId));
    } catch (error) {
      throw await this.recoverMissingModelSession(sessionId, error);
    }
    const onboarding = await this.updateState(this.modelDraftPatchFromSession(response));

    return {
      ...response,
      onboarding
    };
  }

  async submitModelAuthSessionInput(
    sessionId: string,
    request: ModelAuthSessionInputRequest
  ): Promise<ModelAuthSessionResponse> {
    let response: ModelAuthSessionResponse;
    try {
      response = await this.clearOnboardingFallbacksFromSession(
        await this.adapter.config.submitModelAuthSessionInput(sessionId, request)
      );
    } catch (error) {
      throw await this.recoverMissingModelSession(sessionId, error);
    }
    const onboarding = await this.updateState(this.modelDraftPatchFromSession(response));

    return {
      ...response,
      onboarding
    };
  }

  async saveChannelEntry(entryId: string | undefined, request: SaveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
    const { draft } = await this.readResolvedDraftState();
    const summary = await this.buildSummary(draft);
    if (!summary.model?.entryId) {
      throw new Error("Save the first model before configuring a channel.");
    }

    const result = await this.channelSetupService.saveEntry(entryId, request);
    const onboarding = await this.updateState(this.channelDraftPatchFromMutation(request.channelId, entryId, result));

    return {
      ...result,
      onboarding
    };
  }

  async getChannelSession(sessionId: string): Promise<ChannelSessionResponse> {
    let response: ChannelSessionResponse;
    try {
      response = await this.channelSetupService.getSession(sessionId);
    } catch (error) {
      throw await this.recoverMissingChannelSession(sessionId, error);
    }
    const onboarding = await this.updateState(this.channelDraftPatchFromSession(response));

    return {
      ...response,
      onboarding
    };
  }

  async submitChannelSessionInput(
    sessionId: string,
    request: ChannelSessionInputRequest
  ): Promise<ChannelSessionResponse> {
    let response: ChannelSessionResponse;
    try {
      response = await this.channelSetupService.submitSessionInput(sessionId, request);
    } catch (error) {
      throw await this.recoverMissingChannelSession(sessionId, error);
    }
    const onboarding = await this.updateState(this.channelDraftPatchFromSession(response));

    return {
      ...response,
      onboarding
    };
  }

  async saveEmployeeDraft(employee: OnboardingEmployeeState): Promise<OnboardingStateResponse> {
    const { draft } = await this.readResolvedDraftState();
    let resolvedChannel = draft.channel;
    let canTreatDeferredWechatChannelAsStaged =
      resolvedChannel?.channelId === "wechat" &&
      Boolean(resolvedChannel?.entryId) &&
      !draft.activeChannelSessionId;
    let canTreatChannelAsStaged =
      Boolean(resolvedChannel?.entryId) &&
      (stepIsAtOrAfter(draft.currentStep, "employee") || canTreatDeferredWechatChannelAsStaged);

    if ((!this.isChannelStaged(draft) && !canTreatChannelAsStaged) || !resolvedChannel?.entryId) {
      const summary = await this.buildSummary(draft);
      resolvedChannel = summary.channel ?? draft.channel;
      canTreatDeferredWechatChannelAsStaged =
        resolvedChannel?.channelId === "wechat" &&
        Boolean(resolvedChannel?.entryId) &&
        !draft.activeChannelSessionId;
      canTreatChannelAsStaged =
        Boolean(resolvedChannel?.entryId) &&
        (stepIsAtOrAfter(draft.currentStep, "employee") || canTreatDeferredWechatChannelAsStaged);

      if ((!this.isChannelStaged(draft) && !canTreatChannelAsStaged) || !resolvedChannel?.entryId) {
        throw new Error("Finish staging the first channel before naming the AI employee.");
      }
    }

    // Employee autosave should stay lightweight and rely on the already-staged draft state.
    return this.updateState(
      {
        currentStep: "employee",
        model: draft.model,
        channel: resolvedChannel,
        channelProgress: canTreatChannelAsStaged
          ? {
              status: "staged",
              message: draft.channelProgress?.message ?? "Channel staged for final gateway activation."
            }
          : draft.channelProgress,
        activeChannelSessionId: canTreatChannelAsStaged ? "" : draft.activeChannelSessionId,
        employee: normalizedEmployeeState(employee)
      },
      { responseSummaryMode: "draft" }
    );
  }

  async resetModelDraft(): Promise<OnboardingStateResponse> {
    return this.updateState({
      currentStep: "model",
      model: undefined,
      activeModelAuthSessionId: ""
    });
  }

  async resetChannelDraft(): Promise<OnboardingStateResponse> {
    return this.updateState({
      currentStep: "channel",
      channel: undefined,
      channelProgress: undefined,
      activeChannelSessionId: ""
    });
  }

  async complete(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> {
    const { draft } = await this.readResolvedDraftState();
    const completionDraft = {
      ...draft,
      employee: normalizedEmployeeState(request.employee ?? draft.employee)
    };
    const skipToDashboard = request.destination === "dashboard";
    const summary = skipToDashboard ? await this.buildSummary(completionDraft) : await this.buildFinalizeSummary(completionDraft);
    let finalSummary = summary;
    let warmupTaskId: string | undefined;
    let pendingWarmup: OnboardingWarmupState | undefined;

    if (!skipToDashboard) {
      this.assertReadyForFinalize(completionDraft, summary);

      const employee = completionDraft.employee;
      if (!employee) {
        throw new Error("Enter the AI employee profile before finishing onboarding.");
      }

      let brainEntryId = summary.model?.entryId ?? completionDraft.model?.entryId;
      let canReuseBrainEntry = brainEntryId
        ? await this.adapter.config.canReuseSavedModelEntry(brainEntryId)
        : false;

      if (brainEntryId && !canReuseBrainEntry) {
        const resolvedModel = await this.resolveSavedModelForFinalize(summary.model ?? completionDraft.model);
        if (resolvedModel?.entryId && resolvedModel.entryId !== brainEntryId) {
          const canReuseResolvedEntry = await this.adapter.config.canReuseSavedModelEntry(resolvedModel.entryId);
          if (canReuseResolvedEntry) {
            summary.model = resolvedModel;
            brainEntryId = resolvedModel.entryId;
            canReuseBrainEntry = true;
          }
        }
      }

      console.log(formatConsoleLine(
        `brainEntryId=${brainEntryId ?? "(missing)"} summaryModelEntryId=${summary.model?.entryId ?? "(none)"} draftModelEntryId=${completionDraft.model?.entryId ?? "(none)"} reusable=${canReuseBrainEntry}`,
        { scope: "onboarding.complete" }
      ));
      if (!brainEntryId) {
        throw new Error("Save the first model before creating the AI employee.");
      }
      if (!canReuseBrainEntry) {
        throw new Error("Re-save the first model in Configuration before finishing onboarding.");
      }

      const presetSkillIds = resolvePresetSkillIds(employee);
      const warmupTargetMode = onboardingTargetMode(completionDraft.install);
      warmupTaskId = this.createWarmupTaskId();
      this.publishWarmupProgress(warmupTaskId, "running", "Creating your AI employee");

      const memberResult = await this.aiTeamService.saveMemberForOnboarding(
        employee.memberId,
        buildOnboardingMemberRequest(employee, brainEntryId),
        { deferWarmup: true }
      );
      const createdMember = memberResult.member;

      if (!createdMember) {
        throw new Error("ChillClaw could not verify the staged AI employee after creation.");
      }

      const channelBinding = summary.channel?.entryId ?? completionDraft.channel?.entryId;
      if (channelBinding && !createdMember.bindings.some((binding) => binding.target === channelBinding)) {
        await this.aiTeamService.bindMemberChannelForOnboarding(createdMember.id, { binding: channelBinding });
      }
      await this.adapter.aiEmployees.setPrimaryAIMemberAgent(createdMember.agentId);
      this.publishWarmupProgress(warmupTaskId, "running", "Applying gateway changes");

      await this.store.update((existing) => ({
        ...existing,
        onboarding: {
          draft: {
            ...(existing.onboarding?.draft ?? defaultOnboardingDraftState()),
            employee: {
              ...(existing.onboarding?.draft.employee ?? employee),
              memberId: createdMember.id,
              name: createdMember.name,
              jobTitle: createdMember.jobTitle,
              avatarPresetId: createdMember.avatar.presetId,
              presetId: employee.presetId,
              personalityTraits: employee.personalityTraits,
              presetSkillIds: resolvePresetSkillIds(employee),
              knowledgePackIds: employee.knowledgePackIds,
              workStyles: employee.workStyles,
              memoryEnabled: employee.memoryEnabled
            }
          }
        }
      }));

      finalSummary = {
        ...summary,
        employee: {
          memberId: createdMember.id,
          name: createdMember.name,
          jobTitle: createdMember.jobTitle,
          avatarPresetId: createdMember.avatar.presetId,
          presetId: employee.presetId,
          personalityTraits: employee.personalityTraits,
          presetSkillIds: resolvePresetSkillIds(employee),
          knowledgePackIds: employee.knowledgePackIds,
          workStyles: employee.workStyles,
          memoryEnabled: employee.memoryEnabled
        }
      };

      await this.adapter.gateway.finalizeOnboardingSetup();

      const warmupTimestamp = new Date().toISOString();
      pendingWarmup = {
        taskId: warmupTaskId,
        memberId: createdMember.id,
        agentId: createdMember.agentId,
        presetSkillIds,
        targetMode: warmupTargetMode,
        status: "pending",
        lastMessage: "Finishing workspace setup in the background.",
        createdAt: warmupTimestamp,
        updatedAt: warmupTimestamp
      };
    }

    await this.store.update((existing) => ({
      ...existing,
      introCompletedAt: existing.introCompletedAt ?? new Date().toISOString(),
      setupCompletedAt: existing.setupCompletedAt ?? new Date().toISOString(),
      onboarding: undefined,
      onboardingWarmups:
        pendingWarmup && warmupTaskId
          ? {
              ...(existing.onboardingWarmups ?? {}),
              [warmupTaskId]: pendingWarmup
            }
          : existing.onboardingWarmups
    }));

    if (warmupTaskId) {
      this.startOnboardingWarmup(warmupTaskId);
    }

    return {
      status: "completed",
      destination: request.destination,
      summary: finalSummary,
      overview: await this.overviewService.getOverview(),
      warmupTaskId
    };
  }

  private createWarmupTaskId(): string {
    return `${ONBOARDING_WARMUP_TASK_PREFIX}:${randomUUID()}`;
  }

  private publishWarmupProgress(
    taskId: string | undefined,
    status: "pending" | "running" | "completed" | "failed",
    message: string
  ): void {
    if (!taskId) {
      return;
    }

    this.eventPublisher?.publishTaskProgress({
      taskId,
      status,
      message
    });
  }

  private async readOnboardingWarmup(taskId: string): Promise<OnboardingWarmupState | undefined> {
    const state = await this.store.read();
    return state.onboardingWarmups?.[taskId];
  }

  private async updateOnboardingWarmup(
    taskId: string,
    patch: Partial<OnboardingWarmupState>
  ): Promise<OnboardingWarmupState | undefined> {
    let nextWarmup: OnboardingWarmupState | undefined;
    await this.store.update((current) => {
      const existingWarmup = current.onboardingWarmups?.[taskId];
      if (!existingWarmup) {
        return current;
      }

      nextWarmup = {
        ...existingWarmup,
        ...patch
      };

      return {
        ...current,
        onboardingWarmups: {
          ...(current.onboardingWarmups ?? {}),
          [taskId]: nextWarmup
        }
      };
    });

    return nextWarmup;
  }

  private startOnboardingWarmup(taskId: string): void {
    if (this.warmupJobs.has(taskId)) {
      return;
    }

    const job = this.runOnboardingWarmup(taskId).finally(() => {
      this.warmupJobs.delete(taskId);
    });
    this.warmupJobs.set(taskId, job);
    void job;
  }

  private async resumePendingWarmups(): Promise<void> {
    const state = await this.store.read();
    const pendingWarmups = Object.values(state.onboardingWarmups ?? {}).filter(
      (warmup) => warmup.status === "pending" || warmup.status === "running"
    );

    for (const warmup of pendingWarmups) {
      this.startOnboardingWarmup(warmup.taskId);
    }
  }

  private async runOnboardingWarmup(taskId: string): Promise<void> {
    const warmup = await this.readOnboardingWarmup(taskId);
    if (!warmup || warmup.status === "completed") {
      return;
    }

    const verificationMessage = "Verifying preset skills";
    const indexingMessage = "Indexing memory";
    const readyMessage = "Workspace ready";

    try {
      await this.updateOnboardingWarmup(taskId, {
        status: "running",
        lastMessage: verificationMessage,
        updatedAt: new Date().toISOString(),
        lastError: undefined,
        failedAt: undefined
      });
      await this.aiTeamService.markOnboardingWarmupProgress(
        warmup.memberId,
        verificationMessage,
        warmup.presetSkillIds.length > 0
          ? "ChillClaw is verifying the preset skills for this AI employee."
          : "ChillClaw is checking the workspace before final indexing."
      );
      this.publishWarmupProgress(taskId, "running", verificationMessage);

      if (this.presetSkillService && warmup.presetSkillIds.length > 0) {
        await this.presetSkillService.setDesiredPresetSkillIds("onboarding", warmup.presetSkillIds, {
          targetMode: warmup.targetMode,
          waitForReconcile: true
        });
      }

      await this.updateOnboardingWarmup(taskId, {
        status: "running",
        lastMessage: indexingMessage,
        updatedAt: new Date().toISOString()
      });
      await this.aiTeamService.markOnboardingWarmupProgress(
        warmup.memberId,
        indexingMessage,
        "ChillClaw is indexing memory so the workspace is ready for the first task."
      );
      this.publishWarmupProgress(taskId, "running", indexingMessage);

      await this.aiTeamService.finalizeOnboardingWarmup(warmup.memberId);

      const completedAt = new Date().toISOString();
      await this.updateOnboardingWarmup(taskId, {
        status: "completed",
        lastMessage: readyMessage,
        updatedAt: completedAt,
        completedAt,
        lastError: undefined
      });
      this.publishWarmupProgress(taskId, "completed", readyMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ChillClaw could not finish workspace setup.";
      const failedAt = new Date().toISOString();
      await this.updateOnboardingWarmup(taskId, {
        status: "failed",
        lastMessage: message,
        updatedAt: failedAt,
        failedAt,
        lastError: message
      });
      await this.aiTeamService.markOnboardingWarmupFailed(warmup.memberId, message);
      this.publishWarmupProgress(taskId, "failed", message);
    }
  }

  private async clearOnboardingFallbackModels(result: ModelConfigActionResponse): Promise<ModelConfigActionResponse> {
    if (result.authSession || result.modelConfig.fallbackEntryIds.length === 0) {
      return result;
    }

    const cleared = await this.adapter.config.replaceFallbackModelEntries({ entryIds: [] });
    return {
      ...result,
      modelConfig: cleared.modelConfig,
      requiresGatewayApply: result.requiresGatewayApply || cleared.requiresGatewayApply
    };
  }

  private async clearOnboardingFallbacksFromSession(
    response: ModelAuthSessionResponse
  ): Promise<ModelAuthSessionResponse> {
    if (response.session.status !== "completed" || response.modelConfig.fallbackEntryIds.length === 0) {
      return response;
    }

    const cleared = await this.adapter.config.replaceFallbackModelEntries({ entryIds: [] });
    return {
      ...response,
      modelConfig: cleared.modelConfig
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

    return {
      firstRun: {
        introCompleted: Boolean(nextState.introCompletedAt),
        setupCompleted: false,
        selectedProfileId: nextState.selectedProfileId
      },
      draft: nextState.onboarding?.draft ?? defaultOnboardingDraftState(),
      config: onboardingUiConfig,
      summary: {},
      presetSkillSync: this.presetSkillService ? await this.presetSkillService.setDesiredPresetSkillIds("onboarding", []) : undefined
    };
  }

  private async readResolvedDraftState(): Promise<{
    state: Awaited<ReturnType<StateStore["read"]>>;
    draft: ReturnType<typeof defaultOnboardingDraftState>;
  }> {
    const t0 = performance.now();
    const current = await this.store.read();
    console.log(formatConsoleLine(`store.read: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "onboarding.readResolvedDraftState" }));

    const existingDraft = {
      ...(current.onboarding?.draft ?? defaultOnboardingDraftState()),
      employee: normalizedEmployeeState(current.onboarding?.draft?.employee)
    };

    const t1 = performance.now();
    const repairedDraft = await this.repairProgressedDraft(existingDraft);
    console.log(formatConsoleLine(`repairProgressedDraft: ${(performance.now() - t1).toFixed(1)}ms`, { scope: "onboarding.readResolvedDraftState" }));

    if (JSON.stringify(this.repairableDraftFields(existingDraft)) === JSON.stringify(this.repairableDraftFields(repairedDraft))) {
      return {
        state: current,
        draft: repairedDraft
      };
    }

    const nextState = await this.store.update((state) => ({
      ...state,
      onboarding: {
        draft: {
          ...(state.onboarding?.draft ?? defaultOnboardingDraftState()),
          currentStep: repairedDraft.currentStep,
          install: repairedDraft.install,
          permissions: repairedDraft.permissions,
          model: repairedDraft.model,
          channel: repairedDraft.channel,
          channelProgress: repairedDraft.channelProgress,
          activeChannelSessionId: repairedDraft.activeChannelSessionId || undefined
        }
      }
    }));

    return {
      state: nextState,
      draft: {
        ...(nextState.onboarding?.draft ?? defaultOnboardingDraftState()),
        employee: normalizedEmployeeState(nextState.onboarding?.draft?.employee)
      }
    };
  }

  private repairableDraftFields(draft: ReturnType<typeof defaultOnboardingDraftState>) {
    return {
      currentStep: draft.currentStep,
      install: draft.install,
      permissions: draft.permissions,
      model: draft.model,
      channel: draft.channel,
      channelProgress: draft.channelProgress,
      activeChannelSessionId: draft.activeChannelSessionId
    };
  }

  private async repairProgressedDraft(
    draft: ReturnType<typeof defaultOnboardingDraftState>,
    options?: { allowLocalRuntimeModelRepair?: boolean }
  ): Promise<ReturnType<typeof defaultOnboardingDraftState>> {
    const repaired = {
      ...draft,
      employee: normalizedEmployeeState(draft.employee)
    };

    if (!repaired.install && stepIsAtOrAfter(repaired.currentStep, "permissions")) {
      const detectedInstall = await this.detectInstallState(repaired.install);
      if (detectedInstall.installed) {
        repaired.install = detectedInstall;
      }
    }

    if (!repaired.permissions?.confirmed && stepIsAtOrAfter(repaired.currentStep, "model")) {
      repaired.permissions = {
        confirmed: true,
        confirmedAt: repaired.permissions?.confirmedAt ?? new Date().toISOString()
      };
    }

    // Keep the model step undecided so clients can still run local-vs-cloud detection
    // instead of silently inheriting an unrelated saved default model.
    if (!repaired.model && stepIsAtOrAfter(repaired.currentStep, "channel")) {
      const activeLocalModel = options?.allowLocalRuntimeModelRepair
        ? await this.resolveActiveLocalRuntimeModelState()
        : undefined;

      if (activeLocalModel) {
        repaired.model = activeLocalModel;
      } else {
        const modelConfig = await this.adapter.config.getModelConfig();
        const preferredEntry =
          modelConfig.savedEntries.find((entry) => entry.id === modelConfig.defaultEntryId) ??
          modelConfig.savedEntries.find((entry) => entry.modelKey === modelConfig.defaultModel) ??
          modelConfig.savedEntries[0];

        if (preferredEntry && await this.adapter.config.canReuseSavedModelEntry(preferredEntry.id)) {
          repaired.model = {
            providerId: preferredEntry.providerId,
            modelKey: preferredEntry.modelKey,
            methodId: preferredEntry.authMethodId,
            entryId: preferredEntry.id
          };
        } else {
          repaired.currentStep = "model";
        }
      }
    }

    const deferredWechatEntry = await this.resolveDeferredWechatStageEntry(repaired);
    if (deferredWechatEntry) {
      repaired.currentStep = "employee";
      repaired.channel = {
        channelId: "wechat",
        entryId: deferredWechatEntry.id
      };
      repaired.channelProgress = {
        status: "staged",
        message: deferredWechatEntry.summary
      };
      repaired.activeChannelSessionId = "";
    }

    if (
      stepIsAtOrAfter(repaired.currentStep, "employee") &&
      !repaired.activeChannelSessionId &&
      (!repaired.channel || repaired.channelProgress?.status !== "staged")
    ) {
      const channelConfig = await this.channelSetupService.getConfigOverview();
      const preferredEntry = [...channelConfig.entries]
        .filter((entry) => entry.status !== "not-started")
        .sort((left, right) => {
          const leftTime = Date.parse(left.lastUpdatedAt ?? "");
          const rightTime = Date.parse(right.lastUpdatedAt ?? "");
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        })[0];

      if (preferredEntry) {
        repaired.channel = {
          channelId: preferredEntry.channelId,
          entryId: preferredEntry.id
        };
        repaired.channelProgress = {
          status: "staged",
          message: preferredEntry.summary
        };
      }
    }

    return repaired;
  }

  private async resolveActiveLocalRuntimeModelState(): Promise<OnboardingModelState | undefined> {
    if (!this.localModelRuntimeService) {
      return undefined;
    }

    try {
      return onboardingModelFromLocalRuntime(await this.localModelRuntimeService.getOverview());
    } catch {
      return undefined;
    }
  }

  private canNavigateToStep(
    currentStep: OnboardingStep,
    targetStep: OnboardingStep,
    draft: ReturnType<typeof defaultOnboardingDraftState>,
    summary: OnboardingCompletionSummary
  ): boolean {
    if (stepIndex(targetStep) <= stepIndex(currentStep)) {
      return true;
    }

    switch (targetStep) {
      case "install":
        return true;
      case "permissions":
        return isCompletedInstall(draft);
      case "model":
        return isCompletedInstall(draft) && isConfirmedPermissions(draft);
      case "channel":
        return isCompletedInstall(draft) && isConfirmedPermissions(draft) && Boolean(summary.model?.entryId);
      case "employee":
        return this.isChannelStaged(draft) && Boolean(summary.channel?.entryId);
      case "welcome":
      default:
        return true;
    }
  }

  private assertReadyForFinalize(
    draft: ReturnType<typeof defaultOnboardingDraftState>,
    summary: OnboardingCompletionSummary
  ): void {
    if (!isCompletedInstall(draft) || !summary.install?.installed) {
      throw new Error("Install OpenClaw before finishing onboarding.");
    }

    if (!isConfirmedPermissions(draft)) {
      throw new Error("Confirm permissions before finishing onboarding.");
    }

    if (!summary.model?.entryId) {
      throw new Error("Save the first model before finishing onboarding.");
    }

    if (!summary.channel?.entryId) {
      throw new Error("Finish staging the first channel before finishing onboarding.");
    }

    if (!draft.employee?.name?.trim() || !draft.employee.jobTitle?.trim()) {
      throw new Error("Name the first AI employee before finishing onboarding.");
    }
  }

  private isChannelStaged(draft: ReturnType<typeof defaultOnboardingDraftState>): boolean {
    if (!draft.channel) {
      return false;
    }

    if (draft.channelProgress?.status === "staged") {
      return true;
    }

    if (draft.activeChannelSessionId) {
      return false;
    }

    return stepIsAtOrAfter(draft.currentStep, "employee");
  }

  private async recoverMissingModelSession(sessionId: string, error: unknown): Promise<Error> {
    if (!(error instanceof Error) || !/auth session not found/i.test(error.message)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const state = await this.store.read();
    const draft = state.onboarding?.draft ?? defaultOnboardingDraftState();
    if (draft.activeModelAuthSessionId === sessionId) {
      const summary = await this.buildSummary(draft);
      const resolvedModel = summary.model ?? draft.model;

      await this.updateState({
        currentStep: resolvedModel?.entryId ? "channel" : "model",
        model: resolvedModel,
        activeModelAuthSessionId: ""
      });
    }

    return new Error("The provider sign-in session ended. Start sign-in again.");
  }

  private async recoverMissingChannelSession(sessionId: string, error: unknown): Promise<Error> {
    if (!(error instanceof Error) || !/channel session not found/i.test(error.message)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const state = await this.store.read();
    const draft = state.onboarding?.draft ?? defaultOnboardingDraftState();
    if (draft.activeChannelSessionId === sessionId) {
      const deferredWechatEntry = await this.resolveDeferredWechatStageEntry(draft);
      if (deferredWechatEntry) {
        await this.updateState({
          currentStep: "employee",
          channel: {
            channelId: "wechat",
            entryId: deferredWechatEntry.id
          },
          channelProgress: {
            status: "staged",
            message: deferredWechatEntry.summary
          },
          activeChannelSessionId: ""
        });
      } else {
        await this.updateState({
          currentStep: "channel",
          channel: draft.channel,
          channelProgress: {
            status: "idle",
            message: "The channel login session ended. Start the login again."
          },
          activeChannelSessionId: ""
        });
      }
    }

    return new Error("The channel login session ended. Start the login again.");
  }

  private async resolveDeferredWechatStageEntry(
    draft: ReturnType<typeof defaultOnboardingDraftState>
  ): Promise<Awaited<ReturnType<ChannelSetupService["getConfigOverview"]>>["entries"][number] | undefined> {
    if (
      draft.currentStep !== "channel" ||
      draft.channel?.channelId !== "wechat" ||
      !draft.channel.entryId ||
      draft.activeChannelSessionId
    ) {
      return undefined;
    }

    const channelConfig = await this.channelSetupService.getConfigOverview();
    const matchedEntry =
      channelConfig.entries.find((entry) => entry.id === draft.channel?.entryId) ??
      channelConfig.entries.find((entry) => entry.channelId === draft.channel?.channelId);

    if (!matchedEntry || matchedEntry.channelId !== "wechat") {
      return undefined;
    }

    return matchedEntry.status === "awaiting-pairing" || matchedEntry.status === "completed"
      ? matchedEntry
      : undefined;
  }

  private async buildStateResponse(state: Awaited<ReturnType<StateStore["read"]>>): Promise<OnboardingStateResponse> {
    const draft = {
      ...(state.onboarding?.draft ?? defaultOnboardingDraftState()),
      employee: normalizedEmployeeState(state.onboarding?.draft?.employee)
    };

    // Use draft summary for reads — the draft is already validated by mutations,
    // and calling buildSummary here hits OpenClaw CLI on every poll (10-40s cost).
    const tSummary = performance.now();
    const summary = this.buildDraftSummary(draft);
    console.log(formatConsoleLine(`buildDraftSummary (step=${draft.currentStep}): ${(performance.now() - tSummary).toFixed(1)}ms`, { scope: "onboarding.buildStateResponse" }));

    const tRuntime = performance.now();
    const localRuntime =
      draft.currentStep === "model" && this.localModelRuntimeService
        ? await this.localModelRuntimeService.getOverview()
        : undefined;
    if (draft.currentStep === "model") {
      console.log(formatConsoleLine(`localModelRuntimeService.getOverview: ${(performance.now() - tRuntime).toFixed(1)}ms`, { scope: "onboarding.buildStateResponse" }));
    }

    const tPreset = performance.now();
    const presetSkillSync = this.presetSkillService ? await this.presetSkillService.getOverview() : undefined;
    if (this.presetSkillService) {
      console.log(formatConsoleLine(`presetSkillService.getOverview: ${(performance.now() - tPreset).toFixed(1)}ms`, { scope: "onboarding.buildStateResponse" }));
    }

    return {
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary,
      localRuntime,
      presetSkillSync
    };
  }

  private async buildFinalizeSummary(
    draft: ReturnType<typeof defaultOnboardingDraftState>
  ): Promise<OnboardingCompletionSummary> {
    const summary = this.buildDraftSummary(draft);
    const canTrustDraftChannelForFinalize =
      stepIsAtOrAfter(draft.currentStep, "employee") && Boolean(draft.channel?.entryId);

    if (draft.install) {
      summary.install = await this.detectInstallState(draft.install);
    }

    // Finalization must tolerate stale draft channel-progress flags by verifying
    // the currently staged channel entry from live channel config.
    if (!this.isChannelStaged(draft) && !canTrustDraftChannelForFinalize) {
      summary.channel = undefined;
    }

    const deferredWechatEntry = await this.resolveDeferredWechatStageEntry(draft);
    if (deferredWechatEntry) {
      summary.channel = {
        channelId: deferredWechatEntry.channelId,
        entryId: deferredWechatEntry.id
      };
      return summary;
    }

    if (!summary.channel?.entryId && (draft.channel || stepIsAtOrAfter(draft.currentStep, "channel"))) {
      try {
        const channelConfig = await this.channelSetupService.getConfigOverview();
        const matchedEntry =
          (draft.channel?.entryId
            ? channelConfig.entries.find((entry) => entry.id === draft.channel?.entryId)
            : undefined) ??
          (draft.channel?.channelId
            ? channelConfig.entries.find((entry) => entry.channelId === draft.channel?.channelId)
            : undefined) ??
          [...channelConfig.entries]
            .filter((entry) => this.isChannelEntryReadyForFinalize(entry.status))
            .sort((left, right) => {
              const leftTime = Date.parse(left.lastUpdatedAt ?? "");
              const rightTime = Date.parse(right.lastUpdatedAt ?? "");
              return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
            })[0];

        if (matchedEntry && this.isChannelEntryReadyForFinalize(matchedEntry.status)) {
          summary.channel = {
            channelId: matchedEntry.channelId,
            entryId: matchedEntry.id
          };
        }
      } catch {
        // Keep finalization on draft-only fallback when channel overview refresh fails.
      }
    }

    return summary;
  }

  private async resolveSavedModelForFinalize(
    model: OnboardingModelState | undefined
  ): Promise<OnboardingModelState | undefined> {
    if (!model) {
      return undefined;
    }

    const modelConfig = await this.adapter.config.getModelConfig();
    const matchedEntry = resolveSavedModelEntry(modelConfig.savedEntries, {
      entryId: model.entryId,
      providerId: model.providerId,
      modelKey: model.modelKey,
      preferDefault: true
    });

    return matchedEntry ? onboardingModelFromSavedEntry(matchedEntry, model) : undefined;
  }

  private isChannelEntryReadyForFinalize(
    status: ChannelConfigOverview["entries"][number]["status"] | undefined
  ): boolean {
    return status === "completed" || status === "awaiting-pairing" || status === "ready";
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
    const draftModel = draft.model;
    const draftChannel = draft.channel;
    const draftEmployee = draft.employee;
    const needsAiTeam = Boolean(draftEmployee?.memberId);

    // Fetch all required engine state in parallel to avoid sequential CLI latency.
    const t = performance.now();
    const [installState, modelConfig, channelConfig, aiTeam] = await Promise.all([
      draft.install ? this.detectInstallState(draft.install) : Promise.resolve(undefined),
      draftModel ? this.adapter.config.getModelConfig() : Promise.resolve(undefined),
      draftChannel ? this.channelSetupService.getConfigOverview() : Promise.resolve(undefined),
      needsAiTeam ? this.aiTeamService.getOverview() : Promise.resolve(undefined)
    ]);
    console.log(formatConsoleLine(
      `parallel fetch (install=${!!draft.install}, model=${!!draftModel}, channel=${!!draftChannel}, aiTeam=${needsAiTeam}): ${(performance.now() - t).toFixed(1)}ms`,
      { scope: "onboarding.buildSummary" }
    ));

    if (installState) {
      summary.install = installState;
    }

    if (draftModel && modelConfig) {
      const matchedEntry = resolveSavedModelEntry(modelConfig.savedEntries, {
        entryId: draftModel.entryId,
        providerId: draftModel.providerId,
        modelKey: draftModel.modelKey,
        preferDefault: true
      });

      summary.model = matchedEntry ? onboardingModelFromSavedEntry(matchedEntry, draftModel) : draftModel;
    }

    if (draftChannel && channelConfig) {
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

    if (draftEmployee) {
      if (!draftEmployee.memberId) {
        summary.employee = draftEmployee;
      } else {
        const matchedMember = aiTeam?.members.find((member) => member.id === draftEmployee.memberId);

        summary.employee = matchedMember
          ? {
              memberId: matchedMember.id,
              name: matchedMember.name,
              jobTitle: matchedMember.jobTitle,
              avatarPresetId: matchedMember.avatar.presetId,
              presetId: draftEmployee.presetId,
              personalityTraits: draftEmployee.personalityTraits,
              presetSkillIds: resolvePresetSkillIds(draftEmployee),
              knowledgePackIds: draftEmployee.knowledgePackIds,
              workStyles: draftEmployee.workStyles,
              memoryEnabled: draftEmployee.memoryEnabled
            }
          : draftEmployee;
      }
    }

    return summary;
  }

  private async detectInstallState(existing: OnboardingInstallState | undefined): Promise<OnboardingInstallState> {
    const [status, targets] = await Promise.all([
      this.adapter.instances.status(),
      this.adapter.instances.getDeploymentTargets()
    ]);
    const target = targets.targets.find((entry) => entry.active) ?? targets.targets.find((entry) => entry.installed);
    const hasLiveInstallEvidence =
      status.installed ||
      Boolean(status.version) ||
      Boolean(target?.installed || target?.version);
    const installed =
      hasLiveInstallEvidence ||
      Boolean(existing?.installed && existing.disposition !== "not-installed" && existing.version);

    return {
      installed,
      version: status.version ?? target?.version ?? existing?.version,
      disposition:
        existing?.disposition ??
        (!installed
          ? "not-installed"
          : target?.installMode === "managed-local"
            ? "installed-managed"
            : "reused-existing"),
      updateAvailable: target?.updateAvailable ?? existing?.updateAvailable,
      latestVersion: target?.latestVersion ?? existing?.latestVersion,
      updateSummary: target?.updateSummary ?? existing?.updateSummary
    };
  }

  private async detectInstallStateFromRuntime(
    installResult: { disposition?: string; existingVersion?: string; actualVersion?: string } | undefined,
    existing: OnboardingInstallState | undefined
  ): Promise<OnboardingInstallState> {
    const detected = await this.detectInstallState(existing);

    return {
      ...detected,
      version: detected.version ?? installResult?.actualVersion ?? installResult?.existingVersion,
      disposition:
        installResult?.disposition === "reused-existing"
          ? "reused-existing"
          : detected.installed
            ? detected.disposition === "reused-existing"
              ? "reused-existing"
              : "installed-managed"
            : "not-installed"
    };
  }

  private modelDraftPatchFromMutation(
    request: SaveModelEntryRequest,
    mutation: ModelConfigActionResponse
  ): UpdateOnboardingStateRequest {
    const savedEntry = resolveSavedModelEntry(mutation.modelConfig.savedEntries, {
      entryId: mutation.authSession?.entryId,
      providerId: request.providerId,
      modelKey: request.modelKey,
      preferDefault: request.makeDefault
    });

    if (mutation.authSession) {
      return {
        currentStep: "model",
        model: {
          providerId: request.providerId,
          modelKey: request.modelKey,
          methodId: request.methodId,
          entryId: savedEntry?.id
        },
        activeModelAuthSessionId: mutation.authSession.id
      };
    }

    return {
      currentStep: "channel",
      model: {
        providerId: savedEntry?.providerId ?? request.providerId,
        modelKey: savedEntry?.modelKey ?? request.modelKey,
        methodId: savedEntry?.authMethodId ?? request.methodId,
        entryId: savedEntry?.id
      },
      activeModelAuthSessionId: ""
    };
  }

  private modelDraftPatchFromSession(response: ModelAuthSessionResponse): UpdateOnboardingStateRequest {
    const session = response.session;
    const resolvedEntry =
      resolveSavedModelEntry(response.modelConfig.savedEntries, {
        entryId: session.entryId,
        providerId: session.providerId,
        preferDefault: true
      }) ??
      response.modelConfig.savedEntries.find(
        (entry) => entry.providerId === session.providerId && (entry.authMethodId ?? "") === session.methodId
      );

    if (session.status === "completed") {
      return {
        currentStep: "channel",
        model: {
          providerId: resolvedEntry?.providerId ?? session.providerId,
          modelKey: resolvedEntry?.modelKey ?? "",
          methodId: resolvedEntry?.authMethodId ?? session.methodId,
          entryId: resolvedEntry?.id ?? session.entryId
        },
        activeModelAuthSessionId: ""
      };
    }

    if (session.status === "failed") {
      return {
        currentStep: "model",
        activeModelAuthSessionId: ""
      };
    }

    return {
      currentStep: "model",
      model: resolvedEntry
        ? {
            providerId: resolvedEntry.providerId,
            modelKey: resolvedEntry.modelKey,
            methodId: resolvedEntry.authMethodId ?? session.methodId,
            entryId: resolvedEntry.id
          }
        : undefined,
      activeModelAuthSessionId: session.id
    };
  }

  private channelDraftPatchFromMutation(
    channelId: SaveChannelEntryRequest["channelId"],
    requestedEntryId: string | undefined,
    mutation: ChannelConfigActionResponse
  ): UpdateOnboardingStateRequest {
    const savedEntry =
      (requestedEntryId ? mutation.channelConfig.entries.find((entry) => entry.id === requestedEntryId) : undefined) ??
      mutation.channelConfig.entries.find((entry) => entry.channelId === channelId);

    if (mutation.session) {
      return {
        currentStep: "channel",
        channel: {
          channelId,
          entryId: savedEntry?.id ?? mutation.session.entryId
        },
        channelProgress: {
          status: "capturing",
          sessionId: mutation.session.id,
          message: mutation.message,
          requiresGatewayApply: Boolean(mutation.requiresGatewayApply)
        },
        activeChannelSessionId: mutation.session.id
      };
    }

    return {
      currentStep: "employee",
      channel: {
        channelId,
        entryId: savedEntry?.id ?? requestedEntryId
      },
      channelProgress: {
        status: "staged",
        message: mutation.message,
        requiresGatewayApply: Boolean(mutation.requiresGatewayApply)
      },
      activeChannelSessionId: ""
    };
  }

  private channelDraftPatchFromSession(response: ChannelSessionResponse): UpdateOnboardingStateRequest {
    const session = response.session;
    const resolvedEntry =
      (session.entryId ? response.channelConfig.entries.find((entry) => entry.id === session.entryId) : undefined) ??
      response.channelConfig.entries.find((entry) => entry.channelId === session.channelId);
    const isStaged =
      resolvedEntry?.status === "completed" ||
      (session.channelId === "wechat" && session.status === "completed");

    if (isStaged) {
      return {
        currentStep: "employee",
        channel: {
          channelId: session.channelId,
          entryId: resolvedEntry?.id ?? session.entryId
        },
        channelProgress: {
          status: "staged",
          sessionId: session.id,
          message: session.message
        },
        activeChannelSessionId: ""
      };
    }

    if (session.status === "completed") {
      return {
        currentStep: "channel",
        channel: {
          channelId: session.channelId,
          entryId: resolvedEntry?.id ?? session.entryId
        },
        channelProgress: {
          status: "idle",
          sessionId: session.id,
          message: resolvedEntry?.summary ?? session.message
        },
        activeChannelSessionId: ""
      };
    }

    if (session.status === "failed") {
      return {
        currentStep: "channel",
        channel: {
          channelId: session.channelId,
          entryId: resolvedEntry?.id ?? session.entryId
        },
        channelProgress: {
          status: "idle",
          message: session.message
        },
        activeChannelSessionId: ""
      };
    }

    return {
      currentStep: "channel",
      channel: {
        channelId: session.channelId,
        entryId: resolvedEntry?.id ?? session.entryId
      },
      channelProgress: {
        status: "capturing",
        sessionId: session.id,
        message: session.message
      },
      activeChannelSessionId: session.id
    };
  }
}
