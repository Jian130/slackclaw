import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type {
  ChannelConfigOverview,
  ChannelConfigActionResponse,
  ChannelSessionInputRequest,
  ChannelSessionResponse,
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  LongRunningOperationSummary,
  LocalModelRuntimeOverview,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  OnboardingCapabilityReadiness,
  OnboardingModelState,
  OnboardingCompletionSummary,
  OnboardingEmployeeState,
  OnboardingInstallState,
  OnboardingOperationsState,
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
import { managedFeatureIdForChannel } from "../config/managed-features.js";
import { resolveOnboardingUiConfig } from "../config/onboarding-config.js";
import type { ChannelSetupService } from "./channel-setup-service.js";
import type { CapabilityService } from "./capability-service.js";
import { EventPublisher } from "./event-publisher.js";
import { fallbackMutationSyncMeta } from "./mutation-sync.js";
import type { OverviewService } from "./overview-service.js";
import { SetupService } from "./setup-service.js";
import { AITeamService } from "./ai-team-service.js";
import type { LocalModelRuntimeService } from "./local-model-runtime-service.js";
import { formatConsoleLine } from "./logger.js";
import {
  logOnboardingEvent,
  summarizeLocalRuntime,
  summarizeOnboardingDraft,
  summarizeOnboardingOperationResult,
  summarizeStepTransition,
  traceOnboardingOperation
} from "./onboarding-logger.js";
import { StateStore, defaultOnboardingDraftState, type OnboardingWarmupState } from "./state-store.js";

const onboardingUiConfig = resolveOnboardingUiConfig();
const ONBOARDING_STEP_ORDER: OnboardingStep[] = ["welcome", "install", "model", "channel", "employee"];
const ONBOARDING_WARMUP_TASK_PREFIX = "onboarding-warmup";
const ONBOARDING_OPERATION_DEADLINE_MS = 1_200_000;

type OnboardingOperationSlot = "install" | "localRuntime" | "channel" | "completion";

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
  return ONBOARDING_STEP_ORDER.indexOf(normalizeOnboardingStep(step));
}

function stepIsAtOrAfter(currentStep: OnboardingStep, target: OnboardingStep): boolean {
  return stepIndex(currentStep) >= stepIndex(target);
}

function normalizeOnboardingStep(step: OnboardingStep): OnboardingStep {
  return step === "permissions" ? "model" : step;
}

function onboardingOperationId(slot: OnboardingOperationSlot): string {
  return `onboarding:${slot}`;
}

function operationDeadlineFrom(startedAt: string): string {
  return new Date(new Date(startedAt).getTime() + ONBOARDING_OPERATION_DEADLINE_MS).toISOString();
}

function operationErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | undefined)?.code;
}

function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : (typeof error === "string" && error.trim() ? error : fallback);
}

function isCompletedInstall(draft: ReturnType<typeof defaultOnboardingDraftState>): boolean {
  return draft.install?.installed === true;
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

function isLocalOllamaOnboardingModel(model: OnboardingModelState | undefined): boolean {
  return model?.providerId === "ollama" || Boolean(model?.modelKey?.startsWith("ollama/"));
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
    private readonly capabilityPresetSyncService?: Pick<CapabilityService, "getPresetSkillSyncOverview" | "setDesiredPresetSkillIds">,
    private readonly eventPublisher?: EventPublisher,
    private readonly localModelRuntimeService?: LocalModelRuntimeService,
    private readonly capabilityOverviewService?: Pick<CapabilityService, "getOverview">
  ) {
    void this.resumePendingWarmups();
  }

  private traceOperation<T>(
    operation: string,
    details: unknown,
    action: () => Promise<T>
  ): Promise<T> {
    return traceOnboardingOperation(`onboarding.${operation}`, details, action, summarizeOnboardingOperationResult);
  }

  private ensureOnboardingMutable(current: Awaited<ReturnType<StateStore["read"]>>): void {
    if (current.setupCompletedAt) {
      throw new Error("Onboarding is already complete. Reset onboarding before changing first-run setup.");
    }
  }

  private async assertOnboardingMutable(): Promise<void> {
    this.ensureOnboardingMutable(await this.store.read());
  }

  private async setOperation(
    slot: OnboardingOperationSlot,
    patch: {
      action: string;
      status: LongRunningOperationSummary["status"];
      phase?: string;
      message: string;
      errorCode?: string;
      retryable?: boolean;
    }
  ): Promise<LongRunningOperationSummary> {
    const now = new Date().toISOString();
    let nextOperation: LongRunningOperationSummary | undefined;
    await this.store.update((current) => {
      const existing = current.onboardingOperations?.[slot];
      const startedAt = existing?.startedAt ?? now;
      nextOperation = {
        operationId: onboardingOperationId(slot),
        action: patch.action,
        status: patch.status,
        phase: patch.phase,
        message: patch.message,
        startedAt,
        updatedAt: now,
        deadlineAt: patch.status === "running" || patch.status === "pending" ? operationDeadlineFrom(startedAt) : existing?.deadlineAt,
        errorCode: patch.errorCode,
        retryable: patch.retryable
      };
      return {
        ...current,
        onboardingOperations: {
          ...(current.onboardingOperations ?? {}),
          [slot]: nextOperation
        }
      };
    });

    return nextOperation as LongRunningOperationSummary;
  }

  private async startOperation(slot: OnboardingOperationSlot, action: string, phase: string, message: string) {
    return this.setOperation(slot, {
      action,
      status: "running",
      phase,
      message,
      retryable: true
    });
  }

  private async completeOperation(slot: OnboardingOperationSlot, action: string, phase: string, message: string) {
    return this.setOperation(slot, {
      action,
      status: "completed",
      phase,
      message,
      retryable: false
    });
  }

  private async failOperation(slot: OnboardingOperationSlot, action: string, phase: string, error: unknown, fallback: string) {
    return this.setOperation(slot, {
      action,
      status: operationErrorCode(error)?.includes("TIMEOUT") ? "timed-out" : "failed",
      phase,
      message: operationErrorMessage(error, fallback),
      errorCode: operationErrorCode(error),
      retryable: true
    });
  }

  async getState(): Promise<OnboardingStateResponse> {
    return this.traceOperation("getState", {}, async () => {
      const t0 = performance.now();

      const t1 = performance.now();
      const { state } = await this.readResolvedDraftState();
      console.log(formatConsoleLine(`readResolvedDraftState: ${(performance.now() - t1).toFixed(1)}ms`, { scope: "onboarding.getState" }));

      const t2 = performance.now();
      const result = await this.buildStateResponse(state);
      console.log(formatConsoleLine(`buildStateResponse: ${(performance.now() - t2).toFixed(1)}ms`, { scope: "onboarding.getState" }));

      console.log(formatConsoleLine(`total: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "onboarding.getState" }));
      return result;
    });
  }

  async updateState(
    request: UpdateOnboardingStateRequest,
    options?: { responseSummaryMode?: "draft" | "resolved" }
  ): Promise<OnboardingStateResponse> {
    return this.traceOperation("updateState", {
      request: summarizeOnboardingDraft(request),
      responseSummaryMode: options?.responseSummaryMode
    }, async () => {
      await this.assertOnboardingMutable();
      let reuseDraftSummary = false;
      const nextState = await this.store.update((current) => {
        this.ensureOnboardingMutable(current);
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

        logOnboardingEvent("onboarding.updateState", "Onboarding draft mutation prepared.", {
          before: summarizeOnboardingDraft(existingDraft),
          after: summarizeOnboardingDraft(nextDraft),
          reuseDraftSummary
        });

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
      const presetSkillSync = this.capabilityPresetSyncService
        ? await this.capabilityPresetSyncService.getPresetSkillSyncOverview()
        : undefined;
      const capabilityReadiness = await this.buildCapabilityReadiness();
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
        presetSkillSync,
        capabilityReadiness,
        operations: this.operationsForState(nextState, undefined)
      };
    });
  }

  async navigateStep(request: OnboardingStepNavigationRequest): Promise<OnboardingStateResponse> {
    return this.traceOperation("navigateStep", { requestedStep: request.step }, async () => {
      await this.assertOnboardingMutable();
      const { draft } = await this.readResolvedDraftState();
      const targetStep = normalizeOnboardingStep(request.step);
      logOnboardingEvent("onboarding.navigateStep", "Onboarding navigation target resolved.", {
        ...summarizeStepTransition(draft.currentStep, targetStep),
        requestedStep: request.step
      });
      const navigationDraft =
        stepIndex(targetStep) > stepIndex(draft.currentStep)
          ? await this.repairProgressedDraft({
              ...draft,
              currentStep: targetStep
            }, {
              allowLocalRuntimeModelRepair: targetStep === "channel"
            })
          : draft;
      const canUseDraftNavigationSummary = targetStep === "channel" && Boolean(navigationDraft.model?.entryId);
      const summary = canUseDraftNavigationSummary
        ? this.buildDraftSummary(navigationDraft)
        : await this.buildSummary(navigationDraft);

      if (!this.canNavigateToStep(draft.currentStep, targetStep, navigationDraft, summary)) {
        throw new Error("Finish the earlier onboarding steps before moving ahead.");
      }

      return this.updateState(
        {
          currentStep: targetStep,
          install: navigationDraft.install,
          permissions: navigationDraft.permissions,
          model: navigationDraft.model,
          channel: navigationDraft.channel,
          channelProgress: navigationDraft.channelProgress,
          activeChannelSessionId: navigationDraft.activeChannelSessionId
        },
        canUseDraftNavigationSummary ? { responseSummaryMode: "draft" } : undefined
      );
    });
  }

  async detectRuntime(): Promise<OnboardingStateResponse> {
    return this.traceOperation("detectRuntime", {}, async () => {
      await this.assertOnboardingMutable();
      const install = await this.detectInstallState((await this.store.read()).onboarding?.draft.install);
      return this.updateState({
        currentStep: "install",
        install
      });
    });
  }

  async installRuntime(options?: { forceLocal?: boolean }) {
    return this.traceOperation("installRuntime", { forceLocal: options?.forceLocal ?? true }, async () => {
      await this.assertOnboardingMutable();
      const action = "onboarding-runtime-install";
      await this.startOperation("install", action, "installing", "Installing OpenClaw locally.");
      try {
        const setupService = new SetupService(this.adapter, this.store, this.overviewService, this.eventPublisher);
        const result = await setupService.runFirstRunSetup({ forceLocal: options?.forceLocal ?? true });
        const install = await this.detectInstallStateFromRuntime(result.install, (await this.store.read()).onboarding?.draft.install);
        const operation = await this.completeOperation("install", action, "completed", result.message);
        const onboarding = await this.updateState({
          currentStep: install.installed ? "model" : "install",
          install
        });

        return {
          ...result,
          operation,
          onboarding
        };
      } catch (error) {
        await this.failOperation("install", action, "installing", error, "ChillClaw could not finish OpenClaw installation.");
        throw error;
      }
    });
  }

  async updateRuntime() {
    return this.traceOperation("updateRuntime", {}, async () => {
      await this.assertOnboardingMutable();
      const targets = await this.adapter.instances.getDeploymentTargets();
      const target = targets.targets.find((entry) => entry.active) ?? targets.targets.find((entry) => entry.installed);
      logOnboardingEvent("onboarding.updateRuntime", "Onboarding runtime update target selected.", {
        targetId: target?.id,
        active: target?.active,
        installed: target?.installed,
        installMode: target?.installMode
      });
      const result = target?.id === "standard" || target?.id === "managed-local"
        ? await this.adapter.instances.updateDeploymentTarget(target.id)
        : await this.adapter.instances.update();
      const install = await this.detectInstallStateFromRuntime(undefined, (await this.store.read()).onboarding?.draft.install);
      const onboarding = await this.updateState({
        currentStep: install.installed ? "model" : "install",
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
    });
  }

  async confirmPermissions(): Promise<OnboardingStateResponse> {
    return this.traceOperation("confirmPermissions", {}, async () => {
      await this.assertOnboardingMutable();
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
    });
  }

  async reuseDetectedRuntime(): Promise<OnboardingStateResponse> {
    return this.traceOperation("reuseDetectedRuntime", {}, async () => {
      await this.assertOnboardingMutable();
      const install = await this.detectInstallState((await this.store.read()).onboarding?.draft.install);
      if (!install.installed) {
        throw new Error("OpenClaw is not installed yet.");
      }

      return this.updateState({
        currentStep: "model",
        install: {
          ...install,
          disposition: install.disposition === "installed-managed" ? "installed-managed" : "reused-existing"
        }
      });
    });
  }

  async saveModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    return this.traceOperation("saveModelEntry", {
      providerId: request.providerId,
      methodId: request.methodId,
      modelKey: request.modelKey,
      makeDefault: request.makeDefault,
      useAsFallback: request.useAsFallback,
      valueKeys: Object.keys(request.values ?? {})
    }, async () => {
      await this.assertOnboardingMutable();
      const { draft } = await this.readResolvedDraftState();
      if (!isCompletedInstall(draft)) {
        throw new Error("Install OpenClaw before configuring the first model.");
      }

      const shouldUpdateExistingEntry =
        Boolean(draft.model?.entryId) && draft.model?.providerId === request.providerId;
      logOnboardingEvent("onboarding.saveModelEntry", "Onboarding model mutation selected.", {
        shouldUpdateExistingEntry,
        draft: summarizeOnboardingDraft(draft)
      });
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
    });
  }

  async adoptActiveLocalRuntimeModel(
    localRuntime?: LocalModelRuntimeOverview
  ): Promise<OnboardingStateResponse | undefined> {
    return this.traceOperation("adoptActiveLocalRuntimeModel", {
      suppliedLocalRuntime: summarizeLocalRuntime(localRuntime)
    }, async () => {
      await this.assertOnboardingMutable();
      const { draft } = await this.readResolvedDraftState();
      if (normalizeOnboardingStep(draft.currentStep) !== "model") {
        logOnboardingEvent("onboarding.adoptActiveLocalRuntimeModel", "Skipped local runtime adoption outside model step.", {
          draft: summarizeOnboardingDraft(draft)
        });
        return undefined;
      }

      const effectiveLocalRuntime =
        localRuntime ?? (this.localModelRuntimeService ? await this.localModelRuntimeService.getOverview() : undefined);
      const model = onboardingModelFromLocalRuntime(effectiveLocalRuntime);
      if (!model) {
        logOnboardingEvent("onboarding.adoptActiveLocalRuntimeModel", "Skipped local runtime adoption because no ready model was available.", {
          localRuntime: summarizeLocalRuntime(effectiveLocalRuntime)
        });
        return undefined;
      }

      const onboarding = await this.updateState(
        {
          currentStep: "model",
          install: draft.install,
          permissions: draft.permissions,
          model,
          activeModelAuthSessionId: ""
        },
        { responseSummaryMode: "draft" }
      );

      return {
        ...onboarding,
        localRuntime: effectiveLocalRuntime
      };
    });
  }

  async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    return this.traceOperation("getModelAuthSession", { sessionId }, async () => {
      await this.assertOnboardingMutable();
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
    });
  }

  async submitModelAuthSessionInput(
    sessionId: string,
    request: ModelAuthSessionInputRequest
  ): Promise<ModelAuthSessionResponse> {
    return this.traceOperation("submitModelAuthSessionInput", {
      sessionId,
      hasValue: Boolean(request.value?.trim())
    }, async () => {
      await this.assertOnboardingMutable();
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
    });
  }

  async saveChannelEntry(entryId: string | undefined, request: SaveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
    return this.traceOperation("saveChannelEntry", {
      entryId,
      channelId: request.channelId,
      valueKeys: Object.keys(request.values ?? {})
    }, async () => {
      await this.assertOnboardingMutable();
      const action = "onboarding-channel-save";
      await this.startOperation("channel", action, "saving-channel", "Saving the first channel.");
      try {
        const { draft } = await this.readResolvedDraftState();
        const summary = await this.buildSummary(draft);
        if (!summary.model?.entryId) {
          throw new Error("Save the first model before configuring a channel.");
        }

        const result = await this.channelSetupService.saveEntry(entryId, request);
        const operation = result.status === "interactive"
          ? await this.setOperation("channel", {
              action,
              status: "running",
              phase: "awaiting-pairing",
              message: result.message,
              retryable: true
            })
          : await this.completeOperation("channel", action, "completed", result.message);
        const onboarding = await this.updateState(this.channelDraftPatchFromMutation(request.channelId, entryId, result));

        return {
          ...result,
          operation,
          onboarding
        };
      } catch (error) {
        await this.failOperation("channel", action, "saving-channel", error, "ChillClaw could not save this channel.");
        throw error;
      }
    });
  }

  async getChannelSession(sessionId: string): Promise<ChannelSessionResponse> {
    return this.traceOperation("getChannelSession", { sessionId }, async () => {
      await this.assertOnboardingMutable();
      let response: ChannelSessionResponse;
      try {
        response = await this.channelSetupService.getSession(sessionId);
      } catch (error) {
        const recovered = await this.recoverMissingChannelSessionResponse(sessionId, error);
        if (recovered) {
          return recovered;
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
      if (response.session.status === "completed") {
        await this.completeOperation("channel", "onboarding-channel-save", "completed", response.session.message);
      } else if (response.session.status === "failed") {
        await this.setOperation("channel", {
          action: "onboarding-channel-save",
          status: "failed",
          phase: "awaiting-pairing",
          message: response.session.message,
          errorCode: "CHANNEL_SESSION_FAILED",
          retryable: true
        });
      }
      const onboarding = await this.updateState(this.channelDraftPatchFromSession(response));

      return {
        ...response,
        onboarding
      };
    });
  }

  async submitChannelSessionInput(
    sessionId: string,
    request: ChannelSessionInputRequest
  ): Promise<ChannelSessionResponse> {
    return this.traceOperation("submitChannelSessionInput", {
      sessionId,
      hasValue: Boolean(request.value?.trim())
    }, async () => {
      await this.assertOnboardingMutable();
      let response: ChannelSessionResponse;
      try {
        response = await this.channelSetupService.submitSessionInput(sessionId, request);
      } catch (error) {
        const recovered = await this.recoverMissingChannelSessionResponse(sessionId, error);
        if (recovered) {
          return recovered;
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
      if (response.session.status === "completed") {
        await this.completeOperation("channel", "onboarding-channel-save", "completed", response.session.message);
      } else if (response.session.status === "failed") {
        await this.setOperation("channel", {
          action: "onboarding-channel-save",
          status: "failed",
          phase: "awaiting-pairing",
          message: response.session.message,
          errorCode: "CHANNEL_SESSION_FAILED",
          retryable: true
        });
      }
      const onboarding = await this.updateState(this.channelDraftPatchFromSession(response));

      return {
        ...response,
        onboarding
      };
    });
  }

  async saveEmployeeDraft(employee: OnboardingEmployeeState): Promise<OnboardingStateResponse> {
    return this.traceOperation("saveEmployeeDraft", {
      employee: summarizeOnboardingDraft({ currentStep: "employee", employee })?.employee
    }, async () => {
      await this.assertOnboardingMutable();
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
    });
  }

  async resetModelDraft(): Promise<OnboardingStateResponse> {
    return this.traceOperation("resetModelDraft", {}, async () => {
      await this.assertOnboardingMutable();
      return this.updateState({
        currentStep: "model",
        model: undefined,
        activeModelAuthSessionId: ""
      });
    });
  }

  async resetChannelDraft(): Promise<OnboardingStateResponse> {
    return this.traceOperation("resetChannelDraft", {}, async () => {
      await this.assertOnboardingMutable();
      return this.updateState({
        currentStep: "channel",
        channel: undefined,
        channelProgress: undefined,
        activeChannelSessionId: ""
      });
    });
  }

  async complete(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> {
    return this.traceOperation("complete", {
      destination: request.destination,
      employee: request.employee ? summarizeOnboardingDraft({ currentStep: "employee", employee: request.employee })?.employee : undefined
    }, async () => {
      const existing = await this.store.read();
      const existingCompletion = existing.onboardingOperations?.completion;
      if (existing.setupCompletedAt && existingCompletion?.status === "completed") {
        return {
          status: "completed",
          destination: request.destination,
          summary: {},
          overview: await this.overviewService.getOverview(),
          operation: existingCompletion
        };
      }

      const action = "onboarding-completion";
      await this.startOperation("completion", action, "preparing", "Preparing to finish onboarding.");
      try {
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

        const preparedModel = await this.prepareLocalRuntimeModelForFinalize(summary.model ?? completionDraft.model);
        if (preparedModel?.entryId) {
          summary.model = preparedModel;
          completionDraft.model = preparedModel;
        }

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
        logOnboardingEvent("onboarding.complete", "Onboarding finalize model entry resolved.", {
          brainEntryId: brainEntryId ?? "(missing)",
          summaryModelEntryId: summary.model?.entryId,
          draftModelEntryId: completionDraft.model?.entryId,
          canReuseBrainEntry
        });
        if (!brainEntryId) {
          throw new Error("Save the first model before creating the AI employee.");
        }
        if (!canReuseBrainEntry) {
          throw new Error("Re-save the first model in Configuration before finishing onboarding.");
        }

        const presetSkillIds = resolvePresetSkillIds(employee);
        const warmupTargetMode = onboardingTargetMode(completionDraft.install);
        warmupTaskId = this.createWarmupTaskId();
        await this.setOperation("completion", {
          action,
          status: "running",
          phase: "creating-employee",
          message: "Creating your AI employee.",
          retryable: true
        });
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

        const createdEmployeeDraft = {
          ...(employee),
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
        };
        await this.store.update((existing) => ({
          ...existing,
          onboarding: {
            draft: {
              ...(existing.onboarding?.draft ?? defaultOnboardingDraftState()),
              employee: createdEmployeeDraft
            }
          }
        }));

        const channelBinding = summary.channel?.entryId ?? completionDraft.channel?.entryId;
        if (channelBinding && !createdMember.bindings.some((binding) => binding.target === channelBinding)) {
          await this.aiTeamService.bindMemberChannelForOnboarding(createdMember.id, { binding: channelBinding });
        }
        await this.adapter.aiEmployees.setPrimaryAIMemberAgent(createdMember.agentId);
        await this.setOperation("completion", {
          action,
          status: "running",
          phase: "applying-gateway",
          message: "Applying gateway changes.",
          retryable: true
        });
        this.publishWarmupProgress(warmupTaskId, "running", "Applying gateway changes");

        finalSummary = {
          ...summary,
          employee: createdEmployeeDraft
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

      const operation = await this.completeOperation("completion", action, "completed", "Onboarding complete.");

      return {
        status: "completed",
        destination: request.destination,
        summary: finalSummary,
        overview: await this.overviewService.getOverview(),
        warmupTaskId,
        operation
      };
      } catch (error) {
        await this.failOperation("completion", action, "finalizing", error, "ChillClaw could not finish onboarding.");
        throw error;
      }
    });
  }

  private createWarmupTaskId(): string {
    const taskId = `${ONBOARDING_WARMUP_TASK_PREFIX}:${randomUUID()}`;
    logOnboardingEvent("onboarding.createWarmupTaskId", "Created onboarding warmup task id.", { taskId });
    return taskId;
  }

  private publishWarmupProgress(
    taskId: string | undefined,
    status: "pending" | "running" | "completed" | "failed",
    message: string
  ): void {
    if (!taskId) {
      logOnboardingEvent("onboarding.publishWarmupProgress", "Skipped onboarding warmup progress because task id is missing.", {
        status,
        message
      });
      return;
    }

    logOnboardingEvent("onboarding.publishWarmupProgress", "Publishing onboarding warmup progress.", {
      taskId,
      status,
      message
    });
    this.eventPublisher?.publishTaskProgress({
      taskId,
      status,
      message
    });
  }

  private async readOnboardingWarmup(taskId: string): Promise<OnboardingWarmupState | undefined> {
    logOnboardingEvent("onboarding.readOnboardingWarmup", "Reading onboarding warmup state.", { taskId });
    const state = await this.store.read();
    const warmup = state.onboardingWarmups?.[taskId];
    logOnboardingEvent("onboarding.readOnboardingWarmup", "Read onboarding warmup state.", {
      taskId,
      status: warmup?.status,
      memberId: warmup?.memberId,
      targetMode: warmup?.targetMode
    });
    return warmup;
  }

  private async updateOnboardingWarmup(
    taskId: string,
    patch: Partial<OnboardingWarmupState>
  ): Promise<OnboardingWarmupState | undefined> {
    logOnboardingEvent("onboarding.updateOnboardingWarmup", "Updating onboarding warmup state.", {
      taskId,
      patch
    });
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

    logOnboardingEvent("onboarding.updateOnboardingWarmup", "Updated onboarding warmup state.", {
      taskId,
      status: nextWarmup?.status,
      lastMessage: nextWarmup?.lastMessage,
      hasLastError: Boolean(nextWarmup?.lastError)
    });
    return nextWarmup;
  }

  private startOnboardingWarmup(taskId: string): void {
    if (this.warmupJobs.has(taskId)) {
      logOnboardingEvent("onboarding.startOnboardingWarmup", "Skipped duplicate onboarding warmup start.", { taskId });
      return;
    }

    logOnboardingEvent("onboarding.startOnboardingWarmup", "Starting onboarding warmup job.", { taskId });
    const job = this.runOnboardingWarmup(taskId).finally(() => {
      this.warmupJobs.delete(taskId);
      logOnboardingEvent("onboarding.startOnboardingWarmup", "Onboarding warmup job settled.", { taskId });
    });
    this.warmupJobs.set(taskId, job);
    void job;
  }

  private async resumePendingWarmups(): Promise<void> {
    logOnboardingEvent("onboarding.resumePendingWarmups", "Checking for pending onboarding warmups.", {});
    const state = await this.store.read();
    const pendingWarmups = Object.values(state.onboardingWarmups ?? {}).filter(
      (warmup) => warmup.status === "pending" || warmup.status === "running"
    );
    logOnboardingEvent("onboarding.resumePendingWarmups", "Pending onboarding warmups resolved.", {
      count: pendingWarmups.length,
      taskIds: pendingWarmups.map((warmup) => warmup.taskId)
    });

    for (const warmup of pendingWarmups) {
      this.startOnboardingWarmup(warmup.taskId);
    }
  }

  private async runOnboardingWarmup(taskId: string): Promise<void> {
    logOnboardingEvent("onboarding.runOnboardingWarmup", "Running onboarding warmup.", { taskId });
    const warmup = await this.readOnboardingWarmup(taskId);
    if (!warmup || warmup.status === "completed") {
      logOnboardingEvent("onboarding.runOnboardingWarmup", "Skipped onboarding warmup run.", {
        taskId,
        status: warmup?.status
      });
      return;
    }

    const verificationMessage = "Verifying preset skills";
    const indexingMessage = "Indexing memory";
    const applyMessage = "Applying gateway changes";
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

      if (this.capabilityPresetSyncService && warmup.presetSkillIds.length > 0) {
        logOnboardingEvent("onboarding.runOnboardingWarmup", "Reconciling onboarding preset skills during warmup.", {
          taskId,
          presetSkillCount: warmup.presetSkillIds.length,
          targetMode: warmup.targetMode
        });
        await this.capabilityPresetSyncService.setDesiredPresetSkillIds("onboarding", warmup.presetSkillIds, {
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

      await this.updateOnboardingWarmup(taskId, {
        status: "running",
        lastMessage: applyMessage,
        updatedAt: new Date().toISOString()
      });
      await this.aiTeamService.markOnboardingWarmupProgress(
        warmup.memberId,
        applyMessage,
        "ChillClaw is applying the prepared OpenClaw gateway changes for the first chat."
      );
      this.publishWarmupProgress(taskId, "running", applyMessage);
      await this.adapter.gateway.finalizeOnboardingSetup();

      const completedAt = new Date().toISOString();
      await this.updateOnboardingWarmup(taskId, {
        status: "completed",
        lastMessage: readyMessage,
        updatedAt: completedAt,
        completedAt,
        lastError: undefined
      });
      this.publishWarmupProgress(taskId, "completed", readyMessage);
      logOnboardingEvent("onboarding.runOnboardingWarmup", "Onboarding warmup completed.", { taskId });
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
      logOnboardingEvent("onboarding.runOnboardingWarmup", "Onboarding warmup failed.", {
        taskId,
        message
      });
    }
  }

  private async clearOnboardingFallbackModels(result: ModelConfigActionResponse): Promise<ModelConfigActionResponse> {
    if (result.authSession || result.modelConfig.fallbackEntryIds.length === 0) {
      logOnboardingEvent("onboarding.clearOnboardingFallbackModels", "Skipped clearing onboarding fallback models.", {
        hasAuthSession: Boolean(result.authSession),
        fallbackEntryCount: result.modelConfig.fallbackEntryIds.length
      });
      return result;
    }

    logOnboardingEvent("onboarding.clearOnboardingFallbackModels", "Clearing onboarding fallback model entries.", {
      fallbackEntryCount: result.modelConfig.fallbackEntryIds.length
    });
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
      logOnboardingEvent("onboarding.clearOnboardingFallbacksFromSession", "Skipped clearing onboarding fallback models from session.", {
        sessionId: response.session.id,
        sessionStatus: response.session.status,
        fallbackEntryCount: response.modelConfig.fallbackEntryIds.length
      });
      return response;
    }

    logOnboardingEvent("onboarding.clearOnboardingFallbacksFromSession", "Clearing onboarding fallback model entries from completed session.", {
      sessionId: response.session.id,
      fallbackEntryCount: response.modelConfig.fallbackEntryIds.length
    });
    const cleared = await this.adapter.config.replaceFallbackModelEntries({ entryIds: [] });
    return {
      ...response,
      modelConfig: cleared.modelConfig
    };
  }

  async reset(): Promise<OnboardingStateResponse> {
    return this.traceOperation("reset", {}, async () => {
      const nextState = await this.store.update((current) => ({
        ...current,
        setupCompletedAt: undefined,
        onboardingOperations: undefined,
        onboarding: {
          draft: defaultOnboardingDraftState()
        }
      }));
      const presetSkillSync = this.capabilityPresetSyncService ? await this.capabilityPresetSyncService.setDesiredPresetSkillIds("onboarding", []) : undefined;
      const capabilityReadiness = await this.buildCapabilityReadiness();

      return {
        firstRun: {
          introCompleted: Boolean(nextState.introCompletedAt),
          setupCompleted: false,
          selectedProfileId: nextState.selectedProfileId
        },
        draft: nextState.onboarding?.draft ?? defaultOnboardingDraftState(),
        config: onboardingUiConfig,
        summary: {},
        presetSkillSync,
        capabilityReadiness
      };
    });
  }

  private async readResolvedDraftState(): Promise<{
    state: Awaited<ReturnType<StateStore["read"]>>;
    draft: ReturnType<typeof defaultOnboardingDraftState>;
  }> {
    logOnboardingEvent("onboarding.readResolvedDraftState", "Reading onboarding draft state.", {});
    const t0 = performance.now();
    const current = await this.store.read();
    console.log(formatConsoleLine(`store.read: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "onboarding.readResolvedDraftState" }));

    const existingDraft = {
      ...(current.onboarding?.draft ?? defaultOnboardingDraftState()),
      employee: normalizedEmployeeState(current.onboarding?.draft?.employee)
    };
    logOnboardingEvent("onboarding.readResolvedDraftState", "Onboarding draft loaded.", {
      draft: summarizeOnboardingDraft(existingDraft),
      setupCompleted: Boolean(current.setupCompletedAt)
    });

    const t1 = performance.now();
    const repairedDraft = await this.repairProgressedDraft(existingDraft);
    console.log(formatConsoleLine(`repairProgressedDraft: ${(performance.now() - t1).toFixed(1)}ms`, { scope: "onboarding.readResolvedDraftState" }));

    if (JSON.stringify(this.repairableDraftFields(existingDraft)) === JSON.stringify(this.repairableDraftFields(repairedDraft))) {
      logOnboardingEvent("onboarding.readResolvedDraftState", "Onboarding draft needed no persisted repair.", {
        draft: summarizeOnboardingDraft(repairedDraft)
      });
      return {
        state: current,
        draft: repairedDraft
      };
    }

    logOnboardingEvent("onboarding.readResolvedDraftState", "Persisting repaired onboarding draft.", {
      before: summarizeOnboardingDraft(existingDraft),
      after: summarizeOnboardingDraft(repairedDraft)
    });

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
    logOnboardingEvent("onboarding.repairProgressedDraft", "Repairing progressed onboarding draft.", {
      draft: summarizeOnboardingDraft(draft),
      allowLocalRuntimeModelRepair: options?.allowLocalRuntimeModelRepair
    });
    const repaired = {
      ...draft,
      currentStep: normalizeOnboardingStep(draft.currentStep),
      employee: normalizedEmployeeState(draft.employee)
    };

    if (!repaired.install && stepIsAtOrAfter(repaired.currentStep, "model")) {
      const detectedInstall = await this.detectInstallState(repaired.install);
      if (detectedInstall.installed) {
        repaired.install = detectedInstall;
        logOnboardingEvent("onboarding.repairProgressedDraft", "Repaired missing install state from live runtime.", {
          install: summarizeOnboardingDraft({ currentStep: repaired.currentStep, install: repaired.install })?.install
        });
      }
    }

    // Keep the model step undecided so clients can still run local-vs-cloud detection
    // instead of silently inheriting an unrelated saved default model.
    if (!repaired.model && stepIsAtOrAfter(repaired.currentStep, "channel")) {
      const activeLocalModel = options?.allowLocalRuntimeModelRepair
        ? await this.resolveActiveLocalRuntimeModelState()
        : undefined;

      if (activeLocalModel) {
        repaired.model = activeLocalModel;
        logOnboardingEvent("onboarding.repairProgressedDraft", "Repaired model state from active local runtime.", {
          model: summarizeOnboardingDraft({ currentStep: repaired.currentStep, model: activeLocalModel })?.model
        });
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
          logOnboardingEvent("onboarding.repairProgressedDraft", "Repaired model state from reusable saved entry.", {
            providerId: preferredEntry.providerId,
            modelKey: preferredEntry.modelKey,
            entryId: preferredEntry.id
          });
        } else {
          repaired.currentStep = "model";
          logOnboardingEvent("onboarding.repairProgressedDraft", "Moved onboarding back to model because no reusable model was found.", {
            savedEntryCount: modelConfig.savedEntries.length
          });
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
      logOnboardingEvent("onboarding.repairProgressedDraft", "Repaired deferred personal WeChat handoff to employee step.", {
        channelId: deferredWechatEntry.channelId,
        entryId: deferredWechatEntry.id,
        status: deferredWechatEntry.status
      });
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
        logOnboardingEvent("onboarding.repairProgressedDraft", "Repaired channel state from preferred channel entry.", {
          channelId: preferredEntry.channelId,
          entryId: preferredEntry.id,
          status: preferredEntry.status
        });
      }
    }

    logOnboardingEvent("onboarding.repairProgressedDraft", "Completed onboarding draft repair pass.", {
      draft: summarizeOnboardingDraft(repaired)
    });
    return repaired;
  }

  private async resolveActiveLocalRuntimeModelState(): Promise<OnboardingModelState | undefined> {
    if (!this.localModelRuntimeService) {
      logOnboardingEvent("onboarding.resolveActiveLocalRuntimeModelState", "No local runtime service is available for model repair.", {});
      return undefined;
    }

    try {
      const localRuntime = await this.localModelRuntimeService.getOverview();
      const model = onboardingModelFromLocalRuntime(localRuntime);
      logOnboardingEvent("onboarding.resolveActiveLocalRuntimeModelState", "Resolved active local runtime model state.", {
        localRuntime: summarizeLocalRuntime(localRuntime),
        model: summarizeOnboardingDraft({ currentStep: "model", model })?.model
      });
      return model;
    } catch (error) {
      logOnboardingEvent("onboarding.resolveActiveLocalRuntimeModelState", "Failed to resolve active local runtime model state.", {
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  private canNavigateToStep(
    currentStep: OnboardingStep,
    targetStep: OnboardingStep,
    draft: ReturnType<typeof defaultOnboardingDraftState>,
    summary: OnboardingCompletionSummary
  ): boolean {
    const details = {
      ...summarizeStepTransition(currentStep, targetStep),
      draft: summarizeOnboardingDraft(draft),
      hasSummaryModel: Boolean(summary.model?.entryId),
      hasSummaryChannel: Boolean(summary.channel?.entryId)
    };
    if (stepIndex(targetStep) <= stepIndex(currentStep)) {
      logOnboardingEvent("onboarding.canNavigateToStep", "Allowed backwards or same-step onboarding navigation.", details);
      return true;
    }

    let allowed: boolean;
    switch (targetStep) {
      case "install":
        allowed = true;
        break;
      case "permissions":
        allowed = isCompletedInstall(draft);
        break;
      case "model":
        allowed = isCompletedInstall(draft);
        break;
      case "channel":
        allowed = isCompletedInstall(draft) && Boolean(summary.model?.entryId);
        break;
      case "employee":
        allowed = this.isChannelStaged(draft) && Boolean(summary.channel?.entryId);
        break;
      case "welcome":
      default:
        allowed = true;
    }
    logOnboardingEvent("onboarding.canNavigateToStep", "Evaluated onboarding navigation gate.", {
      ...details,
      allowed
    });
    return allowed;
  }

  private assertReadyForFinalize(
    draft: ReturnType<typeof defaultOnboardingDraftState>,
    summary: OnboardingCompletionSummary
  ): void {
    if (!isCompletedInstall(draft) || !summary.install?.installed) {
      throw new Error("Install OpenClaw before finishing onboarding.");
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

    logOnboardingEvent("onboarding.recoverMissingModelSession", "Recovering missing onboarding model auth session.", {
      sessionId
    });
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

  private async recoverMissingChannelSessionResponse(
    sessionId: string,
    error: unknown
  ): Promise<ChannelSessionResponse | undefined> {
    if (!(error instanceof Error) || !/channel session not found/i.test(error.message)) {
      return undefined;
    }

    logOnboardingEvent("onboarding.recoverMissingChannelSession", "Recovering missing onboarding channel session.", {
      sessionId
    });
    const state = await this.store.read();
    const draft = state.onboarding?.draft ?? defaultOnboardingDraftState();
    const message = "The channel login session ended. Start the login again.";
    let onboarding: OnboardingStateResponse | undefined;

    if (draft.activeChannelSessionId === sessionId) {
      const deferredWechatEntry = await this.resolveDeferredWechatStageEntry({
        ...draft,
        activeChannelSessionId: ""
      });
      if (deferredWechatEntry) {
        onboarding = await this.updateState({
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
        onboarding = await this.updateState({
          currentStep: "channel",
          channel: draft.channel,
          channelProgress: {
            status: "idle",
            message
          },
          activeChannelSessionId: ""
        });
      }
    }

    if (!onboarding) {
      return undefined;
    }

    return {
      session: {
        id: sessionId,
        channelId: draft.channel?.channelId ?? "wechat",
        entryId: draft.channel?.entryId,
        status: "failed",
        message,
        logs: []
      },
      channelConfig: await this.channelSetupService.getConfigOverview(),
      onboarding
    };
  }

  private async resolveDeferredWechatStageEntry(
    draft: ReturnType<typeof defaultOnboardingDraftState>
  ): Promise<Awaited<ReturnType<ChannelSetupService["getConfigOverview"]>>["entries"][number] | undefined> {
    logOnboardingEvent("onboarding.resolveDeferredWechatStageEntry", "Checking for deferred personal WeChat staged entry.", {
      draft: summarizeOnboardingDraft(draft)
    });
    if (
      draft.currentStep !== "channel" ||
      draft.channel?.channelId !== "wechat" ||
      !draft.channel.entryId ||
      draft.activeChannelSessionId
    ) {
      logOnboardingEvent("onboarding.resolveDeferredWechatStageEntry", "Deferred personal WeChat repair preconditions were not met.", {
        currentStep: draft.currentStep,
        channelId: draft.channel?.channelId,
        hasEntryId: Boolean(draft.channel?.entryId),
        hasActiveSession: Boolean(draft.activeChannelSessionId)
      });
      return undefined;
    }

    const channelConfig = await this.channelSetupService.getConfigOverview();
    const matchedEntry =
      channelConfig.entries.find((entry) => entry.id === draft.channel?.entryId) ??
      channelConfig.entries.find((entry) => entry.channelId === draft.channel?.channelId);

    if (!matchedEntry || matchedEntry.channelId !== "wechat") {
      logOnboardingEvent("onboarding.resolveDeferredWechatStageEntry", "No matching personal WeChat staged entry found.", {
        draftEntryId: draft.channel?.entryId,
        entryCount: channelConfig.entries.length
      });
      return undefined;
    }

    const result = matchedEntry.status === "awaiting-pairing" || matchedEntry.status === "completed"
      ? matchedEntry
      : undefined;
    logOnboardingEvent("onboarding.resolveDeferredWechatStageEntry", "Deferred personal WeChat staged entry check completed.", {
      matchedEntryId: matchedEntry.id,
      matchedStatus: matchedEntry.status,
      canDefer: Boolean(result)
    });
    return result;
  }

  private operationsForState(
    state: Awaited<ReturnType<StateStore["read"]>>,
    localRuntime: LocalModelRuntimeOverview | undefined
  ): OnboardingOperationsState | undefined {
    const operations: OnboardingOperationsState = {
      ...(state.onboardingOperations ?? {})
    };
    const runtimeAction = localRuntime?.activeAction;
    const runtimePhase = localRuntime?.activePhase;
    if (runtimeAction && runtimePhase && localRuntime.status !== "ready" && localRuntime.status !== "idle") {
      const updatedAt = localRuntime.lastProgressAt ?? new Date().toISOString();
      operations.localRuntime = {
        operationId: onboardingOperationId("localRuntime"),
        action: `local-runtime-${runtimeAction}`,
        status: localRuntime.status === "failed" ? "failed" : "running",
        phase: runtimePhase,
        message: localRuntime.progressMessage ?? localRuntime.detail,
        startedAt: updatedAt,
        updatedAt,
        deadlineAt: operationDeadlineFrom(updatedAt),
        errorCode: localRuntime.status === "failed" ? "LOCAL_RUNTIME_FAILED" : undefined,
        retryable: true
      };
    }

    return Object.keys(operations).length > 0 ? operations : undefined;
  }

  private async buildCapabilityReadiness(): Promise<OnboardingCapabilityReadiness | undefined> {
    if (!this.capabilityOverviewService) {
      return undefined;
    }

    try {
      const overview = await this.capabilityOverviewService.getOverview();
      const presetEntries = new Map(
        overview.entries
          .filter((entry) => entry.kind === "preset")
          .map((entry) => [entry.id, entry])
      );
      const featureEntries = new Map(
        overview.entries
          .filter((entry) => entry.kind === "feature")
          .map((entry) => [entry.id, entry])
      );
      const employeePresets = onboardingUiConfig.employeePresets.map((preset) => {
        const entry = presetEntries.get(preset.id);

        if (!entry) {
          return {
            presetId: preset.id,
            status: "missing" as const,
            summary: "Preset is not present in the capability catalog.",
            requirements: []
          };
        }

        return {
          presetId: preset.id,
          status: entry.status,
          summary: entry.summary,
          requirements: entry.requirements
        };
      });
      const channels = onboardingUiConfig.channels.map((channel) => {
        const featureId = managedFeatureIdForChannel(channel.id);
        const entry = featureId ? featureEntries.get(featureId) : undefined;

        if (!entry) {
          return {
            channelId: channel.id,
            status: "missing" as const,
            summary: "Channel capability is not present in the capability catalog.",
            requirements: []
          };
        }

        return {
          channelId: channel.id,
          status: entry.status,
          summary: entry.summary,
          requirements: entry.requirements
        };
      });

      return {
        engine: overview.engine,
        checkedAt: overview.checkedAt,
        employeePresets,
        channels,
        summary: summarizeOnboardingCapabilityReadiness(employeePresets, channels)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logOnboardingEvent("onboarding.capabilityReadiness", "Capability readiness is unavailable.", { error: message });

      const employeePresets = onboardingUiConfig.employeePresets.map((preset) => ({
        presetId: preset.id,
        status: "unknown" as const,
        summary: "Capability readiness is temporarily unavailable.",
        requirements: []
      }));
      const channels = onboardingUiConfig.channels.map((channel) => ({
        channelId: channel.id,
        status: "unknown" as const,
        summary: "Capability readiness is temporarily unavailable.",
        requirements: []
      }));

      return {
        engine: this.adapter.capabilities.engine,
        checkedAt: new Date().toISOString(),
        employeePresets,
        channels,
        summary: "Capability readiness is temporarily unavailable."
      };
    }
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
    const presetSkillSync = this.capabilityPresetSyncService ? await this.capabilityPresetSyncService.getPresetSkillSyncOverview() : undefined;
    if (this.capabilityPresetSyncService) {
      console.log(formatConsoleLine(`capabilityService.getPresetSkillSyncOverview: ${(performance.now() - tPreset).toFixed(1)}ms`, { scope: "onboarding.buildStateResponse" }));
    }
    const capabilityReadiness = await this.buildCapabilityReadiness();

    const response = {
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      draft,
      config: onboardingUiConfig,
      summary,
      localRuntime,
      presetSkillSync,
      capabilityReadiness,
      operations: this.operationsForState(state, localRuntime)
    };
    logOnboardingEvent("onboarding.buildStateResponse", "Built onboarding state response.", summarizeOnboardingOperationResult(response));
    return response;
  }

  private async buildFinalizeSummary(
    draft: ReturnType<typeof defaultOnboardingDraftState>
  ): Promise<OnboardingCompletionSummary> {
    logOnboardingEvent("onboarding.buildFinalizeSummary", "Building onboarding finalize summary.", {
      draft: summarizeOnboardingDraft(draft)
    });
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
      logOnboardingEvent("onboarding.buildFinalizeSummary", "Finalize summary used deferred personal WeChat channel.", {
        channelId: deferredWechatEntry.channelId,
        entryId: deferredWechatEntry.id
      });
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
      } catch (error) {
        logOnboardingEvent("onboarding.buildFinalizeSummary", "Channel overview refresh failed during finalize summary.", {
          error: error instanceof Error ? error.message : String(error)
        });
        // Keep finalization on draft-only fallback when channel overview refresh fails.
      }
    }

    logOnboardingEvent("onboarding.buildFinalizeSummary", "Built onboarding finalize summary.", {
      summary: summarizeOnboardingOperationResult({ draft: { currentStep: draft.currentStep }, summary })
    });
    return summary;
  }

  private async resolveSavedModelForFinalize(
    model: OnboardingModelState | undefined
  ): Promise<OnboardingModelState | undefined> {
    logOnboardingEvent("onboarding.resolveSavedModelForFinalize", "Resolving saved model for onboarding finalize.", {
      model: summarizeOnboardingDraft({ currentStep: "employee", model })?.model
    });
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

    const resolvedModel = matchedEntry ? onboardingModelFromSavedEntry(matchedEntry, model) : undefined;
    logOnboardingEvent("onboarding.resolveSavedModelForFinalize", "Saved model finalize resolution completed.", {
      requestedModel: summarizeOnboardingDraft({ currentStep: "employee", model })?.model,
      resolvedModel: summarizeOnboardingDraft({ currentStep: "employee", model: resolvedModel })?.model
    });
    return resolvedModel;
  }

  private async prepareLocalRuntimeModelForFinalize(
    model: OnboardingModelState | undefined
  ): Promise<OnboardingModelState | undefined> {
    logOnboardingEvent("onboarding.prepareLocalRuntimeModelForFinalize", "Preparing local runtime model for onboarding finalize.", {
      model: summarizeOnboardingDraft({ currentStep: "employee", model })?.model,
      hasLocalRuntimeService: Boolean(this.localModelRuntimeService)
    });
    if (!this.localModelRuntimeService || !isLocalOllamaOnboardingModel(model)) {
      return model;
    }

    const before = await this.localModelRuntimeService.getOverview();
    const readyModel = onboardingModelFromLocalRuntime(before);
    if (readyModel) {
      logOnboardingEvent("onboarding.prepareLocalRuntimeModelForFinalize", "Local runtime model already ready for onboarding finalize.", {
        localRuntime: summarizeLocalRuntime(before),
        model: summarizeOnboardingDraft({ currentStep: "employee", model: readyModel })?.model
      });
      return readyModel;
    }

    logOnboardingEvent("onboarding.prepareLocalRuntimeModelForFinalize", "Repairing local runtime before onboarding finalize.", {
      localRuntime: summarizeLocalRuntime(before)
    });
    const result = await this.localModelRuntimeService.repair();
    if (result.status !== "completed") {
      throw new Error(result.message || "ChillClaw could not repair the local Ollama runtime before finishing onboarding.");
    }

    const repairedModel = onboardingModelFromLocalRuntime(result.localRuntime);
    if (!repairedModel) {
      throw new Error("ChillClaw repaired the local Ollama runtime, but OpenClaw did not report a ready local model.");
    }

    logOnboardingEvent("onboarding.prepareLocalRuntimeModelForFinalize", "Local runtime model repaired for onboarding finalize.", {
      localRuntime: summarizeLocalRuntime(result.localRuntime),
      model: summarizeOnboardingDraft({ currentStep: "employee", model: repairedModel })?.model
    });
    return repairedModel;
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
    logOnboardingEvent("onboarding.buildDraftSummary", "Building onboarding draft summary.", {
      draft: summarizeOnboardingDraft(draft)
    });
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

    logOnboardingEvent("onboarding.buildDraftSummary", "Built onboarding draft summary.", {
      summary: summarizeOnboardingOperationResult({ draft: { currentStep: draft.currentStep }, summary })
    });
    return summary;
  }

  private async buildSummary(draft: ReturnType<typeof defaultOnboardingDraftState>): Promise<OnboardingCompletionSummary> {
    logOnboardingEvent("onboarding.buildSummary", "Building onboarding live summary.", {
      draft: summarizeOnboardingDraft(draft)
    });
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

    logOnboardingEvent("onboarding.buildSummary", "Built onboarding live summary.", {
      summary: summarizeOnboardingOperationResult({ draft: { currentStep: draft.currentStep }, summary })
    });
    return summary;
  }

  private async detectInstallState(existing: OnboardingInstallState | undefined): Promise<OnboardingInstallState> {
    logOnboardingEvent("onboarding.detectInstallState", "Detecting onboarding OpenClaw install state.", {
      existing: summarizeOnboardingDraft({ currentStep: "install", install: existing })?.install
    });
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

    const install: OnboardingInstallState = {
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
    logOnboardingEvent("onboarding.detectInstallState", "Detected onboarding OpenClaw install state.", {
      statusInstalled: status.installed,
      statusVersion: status.version,
      targetId: target?.id,
      targetInstalled: target?.installed,
      targetVersion: target?.version,
      install: summarizeOnboardingDraft({ currentStep: "install", install })?.install
    });
    return install;
  }

  private async detectInstallStateFromRuntime(
    installResult: { disposition?: string; existingVersion?: string; actualVersion?: string } | undefined,
    existing: OnboardingInstallState | undefined
  ): Promise<OnboardingInstallState> {
    logOnboardingEvent("onboarding.detectInstallStateFromRuntime", "Reconciling onboarding install state from runtime result.", {
      installResult,
      existing: summarizeOnboardingDraft({ currentStep: "install", install: existing })?.install
    });
    const detected = await this.detectInstallState(existing);

    const install: OnboardingInstallState = {
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
    logOnboardingEvent("onboarding.detectInstallStateFromRuntime", "Reconciled onboarding install state from runtime result.", {
      install: summarizeOnboardingDraft({ currentStep: "install", install })?.install
    });
    return install;
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

function summarizeOnboardingCapabilityReadiness(
  employeePresets: OnboardingCapabilityReadiness["employeePresets"],
  channels: OnboardingCapabilityReadiness["channels"]
): string {
  const entries = [...employeePresets, ...channels];
  const ready = entries.filter((entry) => entry.status === "ready").length;
  const attention = entries.length - ready;
  return `${ready} ready · ${attention} ${attention === 1 ? "needs" : "need"} attention.`;
}
