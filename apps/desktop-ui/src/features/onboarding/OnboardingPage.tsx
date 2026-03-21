import {
  ArrowRight,
  Bot,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Rocket,
  Sparkles,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AITeamOverview,
  ChannelCapability,
  ChannelConfigActionResponse,
  ChannelConfigOverview,
  ConfiguredChannelEntry,
  ModelAuthMethod,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  OnboardingStateResponse,
  ProductOverview,
  SaveChannelEntryRequest,
  SaveModelEntryRequest
} from "@slackclaw/contracts";

import { useLocale } from "../../app/providers/LocaleProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import {
  completeOnboarding,
  createAIMember,
  createChannelEntry,
  createSavedModelEntry,
  fetchAITeamOverview,
  fetchChannelConfig,
  fetchModelAuthSession,
  fetchModelConfig,
  fetchOnboardingState,
  runFirstRunSetup,
  submitModelAuthSessionInput,
  updateChannelEntry,
  updateOnboardingState
} from "../../shared/api/client.js";
import { memberAvatarPresets, resolveMemberAvatarPreset } from "../../shared/avatar-presets.js";
import { settleAfterMutation } from "../../shared/data/settle.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { FieldLabel, Input, Select, Textarea } from "../../shared/ui/Field.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { ProviderLogo } from "../../shared/ui/ProviderLogo.js";
import { onboardingCopy } from "./copy.js";
import { buildOnboardingMemberRequest, onboardingDestinationPath, type OnboardingEmployeeDraft } from "./helpers.js";

const MODEL_KEY_CUSTOM_OPTION = "__custom_model_key__";
const ONBOARDING_CHANNEL_IDS = new Set(["wechat", "feishu", "telegram"]);
const ONBOARDING_STEP_ORDER = ["welcome", "install", "model", "channel", "employee", "complete"] as const;
const ONBOARDING_AVATAR_PRESETS = memberAvatarPresets.filter((preset) => preset.id.startsWith("onboarding-"));
const ONBOARDING_TRAITS = [
  "Analytical",
  "Creative",
  "Strategic",
  "Empathetic",
  "Innovative",
  "Detail-Oriented",
  "Collaborative",
  "Assertive"
];

function isCurrentOrLaterStep(step: OnboardingStateResponse["draft"]["currentStep"], target: typeof ONBOARDING_STEP_ORDER[number]) {
  return ONBOARDING_STEP_ORDER.indexOf(step) >= ONBOARDING_STEP_ORDER.indexOf(target);
}

function channelIcon(channelId: string) {
  const icons: Record<string, string> = {
    telegram: "TG",
    feishu: "飞",
    wechat: "企微"
  };

  return icons[channelId] ?? channelId.slice(0, 2).toUpperCase();
}

function modelOptions(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) {
    return [];
  }

  const providerModels = modelConfig.models.filter((model) =>
    provider.providerRefs.some((ref) => model.key.startsWith(`${ref.replace(/\/$/, "")}/`))
  );

  if (providerModels.length > 0) {
    return providerModels;
  }

  return provider.sampleModels.map((modelKey) => ({
    key: modelKey,
    name: modelKey.split("/").pop() ?? modelKey,
    input: "text",
    contextWindow: 0,
    local: false,
    available: false,
    tags: [],
    missing: false
  }));
}

function modelKeyPlaceholder(provider: ModelProviderConfig | undefined) {
  if (!provider) {
    return "provider/model-name";
  }

  return provider.sampleModels[0] ?? `${provider.providerRefs[0]?.replace(/\/?$/, "/") ?? ""}model-name`;
}

function modelSelectValue(models: Array<{ key: string }>, modelKey: string) {
  if (!modelKey) {
    return models[0]?.key ?? MODEL_KEY_CUSTOM_OPTION;
  }

  return models.some((item) => item.key === modelKey) ? modelKey : MODEL_KEY_CUSTOM_OPTION;
}

function installDisposition(overview: ProductOverview | undefined, setup: Awaited<ReturnType<typeof runFirstRunSetup>>) {
  if (setup.install?.disposition === "reused-existing") {
    return "reused-existing" as const;
  }

  if (overview?.engine.installed) {
    return "installed-managed" as const;
  }

  return "not-installed" as const;
}

function saveEntrySignature(entry: ModelConfigOverview["savedEntries"][number] | undefined) {
  if (!entry) {
    return "";
  }

  return JSON.stringify({
    id: entry.id,
    providerId: entry.providerId,
    modelKey: entry.modelKey,
    authMethodId: entry.authMethodId,
    isDefault: entry.isDefault,
    isFallback: entry.isFallback,
    updatedAt: entry.updatedAt
  });
}

function channelEntrySignature(entry: ConfiguredChannelEntry | undefined) {
  if (!entry) {
    return "";
  }

  return JSON.stringify({
    id: entry.id,
    channelId: entry.channelId,
    status: entry.status,
    summary: entry.summary,
    pairingRequired: entry.pairingRequired,
    lastUpdatedAt: entry.lastUpdatedAt
  });
}

function findCreatedSavedEntry(
  previousEntries: ModelConfigOverview["savedEntries"],
  nextEntries: ModelConfigOverview["savedEntries"]
) {
  return nextEntries.find((entry) => !previousEntries.some((previous) => previous.id === entry.id));
}

function findCreatedChannelEntry(previousEntries: ConfiguredChannelEntry[], nextEntries: ConfiguredChannelEntry[]) {
  return nextEntries.find((entry) => !previousEntries.some((previous) => previous.id === entry.id));
}

function findCreatedMember(previousMembers: AITeamOverview["members"], nextMembers: AITeamOverview["members"]) {
  return nextMembers.find((member) => !previousMembers.some((previous) => previous.id === member.id));
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function onboardingFieldValue(
  values: Record<string, string>,
  fieldId: string,
  fallback: string | undefined = undefined
) {
  return values[fieldId] ?? fallback ?? "";
}

function requiredChannelFieldsMissing(capability: ChannelCapability | undefined, values: Record<string, string>) {
  if (!capability) {
    return true;
  }

  return capability.fieldDefs.some((field) => field.required && !values[field.id]?.trim());
}

function requiredModelFieldsMissing(method: ModelAuthMethod | undefined, values: Record<string, string>) {
  if (!method) {
    return true;
  }

  return method.fields.some((field) => field.required && !values[field.id]?.trim());
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const common = t(locale).common;
  const copy = onboardingCopy(locale);
  const { overview, refresh, setOverview } = useOverview();

  const [onboardingState, setOnboardingState] = useState<OnboardingStateResponse>();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string>();

  const [modelConfig, setModelConfig] = useState<ModelConfigOverview>();
  const [channelConfig, setChannelConfig] = useState<ChannelConfigOverview>();
  const [teamOverview, setTeamOverview] = useState<AITeamOverview>();

  const [providerId, setProviderId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const [modelValues, setModelValues] = useState<Record<string, string>>({});
  const [modelSession, setModelSession] = useState<ModelAuthSessionResponse["session"]>();
  const [modelSessionInput, setModelSessionInput] = useState("");
  const [modelBusy, setModelBusy] = useState<"" | "save" | "input">("");

  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelValues, setChannelValues] = useState<Record<string, string>>({});
  const [channelMessage, setChannelMessage] = useState("");
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelRequiresApply, setChannelRequiresApply] = useState(false);

  const [employeeName, setEmployeeName] = useState("");
  const [employeeJobTitle, setEmployeeJobTitle] = useState("");
  const [employeeAvatarPresetId, setEmployeeAvatarPresetId] = useState(ONBOARDING_AVATAR_PRESETS[0]?.id ?? memberAvatarPresets[0].id);
  const [selectedTraits, setSelectedTraits] = useState<string[]>(["Analytical", "Detail-Oriented"]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [employeeBusy, setEmployeeBusy] = useState(false);
  const [completionBusy, setCompletionBusy] = useState<"" | "team" | "dashboard" | "chat">("");

  const currentDraft = onboardingState?.draft ?? { currentStep: "welcome" as const };
  const currentStep = currentDraft.currentStep;
  const currentStepIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);

  const selectedProvider = modelConfig?.providers.find((provider) => provider.id === providerId);
  const selectedMethod = selectedProvider?.authMethods.find((method) => method.id === methodId);
  const availableModels = modelOptions(modelConfig, selectedProvider);
  const selectedModelValue = modelSelectValue(availableModels, modelKey);
  const showCustomModelInput = availableModels.length === 0 || selectedModelValue === MODEL_KEY_CUSTOM_OPTION;

  const visibleChannelCapabilities = useMemo(
    () => channelConfig?.capabilities.filter((capability) => ONBOARDING_CHANNEL_IDS.has(capability.id)) ?? [],
    [channelConfig?.capabilities]
  );
  const selectedChannelCapability = visibleChannelCapabilities.find((capability) => capability.id === selectedChannelId);
  const selectedChannelEntry = useMemo(() => {
    if (!channelConfig || !selectedChannelId) {
      return undefined;
    }

    return (
      channelConfig.entries.find((entry) => entry.id === currentDraft.channel?.entryId) ??
      channelConfig.entries.find((entry) => entry.channelId === selectedChannelId)
    );
  }, [channelConfig, currentDraft.channel?.entryId, selectedChannelId]);

  const selectedModelEntry = useMemo(() => {
    if (!modelConfig) {
      return undefined;
    }

    return (
      modelConfig.savedEntries.find((entry) => entry.id === onboardingState?.summary.model?.entryId) ??
      modelConfig.savedEntries.find((entry) => entry.id === currentDraft.model?.entryId) ??
      (currentDraft.model
        ? modelConfig.savedEntries.find(
            (entry) => entry.providerId === currentDraft.model?.providerId && entry.modelKey === currentDraft.model?.modelKey
          )
        : undefined)
    );
  }, [currentDraft.model, modelConfig, onboardingState?.summary.model?.entryId]);

  const selectedBrainEntryId = selectedModelEntry?.id ?? onboardingState?.summary.model?.entryId;
  const selectedEmployeeAvatar = resolveMemberAvatarPreset(employeeAvatarPresetId);
  const selectedSkills = useMemo(
    () => teamOverview?.skillOptions.filter((skill) => selectedSkillIds.includes(skill.id)) ?? [],
    [selectedSkillIds, teamOverview?.skillOptions]
  );

  async function readFreshOverview() {
    const next = await refresh({ fresh: true });
    if (!next) {
      throw new Error("SlackClaw could not refresh the latest overview.");
    }
    return next;
  }

  async function readFreshModelConfig() {
    const next = await fetchModelConfig({ fresh: true });
    setModelConfig(next);
    return next;
  }

  async function readFreshChannelConfig() {
    const next = await fetchChannelConfig({ fresh: true });
    setChannelConfig(next);
    return next;
  }

  async function readFreshAITeamOverview() {
    const next = await fetchAITeamOverview({ fresh: true });
    setTeamOverview(next);
    return next;
  }

  async function refreshOnboardingState() {
    const next = await fetchOnboardingState({ fresh: true });
    setOnboardingState(next);
    return next;
  }

  async function persistDraft(patch: Partial<OnboardingStateResponse["draft"]>) {
    const nextDraft = {
      currentStep: patch.currentStep ?? currentDraft.currentStep,
      install: hasOwn(patch, "install") ? patch.install : currentDraft.install,
      model: hasOwn(patch, "model") ? patch.model : currentDraft.model,
      channel: hasOwn(patch, "channel") ? patch.channel : currentDraft.channel,
      employee: hasOwn(patch, "employee") ? patch.employee : currentDraft.employee,
      activeModelAuthSessionId: hasOwn(patch, "activeModelAuthSessionId")
        ? patch.activeModelAuthSessionId
        : currentDraft.activeModelAuthSessionId,
      activeChannelSessionId: hasOwn(patch, "activeChannelSessionId")
        ? patch.activeChannelSessionId
        : currentDraft.activeChannelSessionId
    };
    const next = await updateOnboardingState(nextDraft);
    setOnboardingState(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setPageLoading(true);
      setPageError(undefined);
      try {
        const [nextState] = await Promise.all([fetchOnboardingState({ fresh: true }), refresh({ fresh: true })]);
        if (cancelled) {
          return;
        }
        setOnboardingState(nextState);
      } catch (loadError) {
        if (!cancelled) {
          setPageError(loadError instanceof Error ? loadError.message : "SlackClaw could not load onboarding.");
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!onboardingState) {
      return;
    }

    if (isCurrentOrLaterStep(currentStep, "model") || Boolean(currentDraft.activeModelAuthSessionId) || Boolean(currentDraft.model)) {
      void readFreshModelConfig().catch(() => undefined);
    }

    if (isCurrentOrLaterStep(currentStep, "channel") || Boolean(currentDraft.channel)) {
      void readFreshChannelConfig().catch(() => undefined);
    }

    if (isCurrentOrLaterStep(currentStep, "employee") || Boolean(currentDraft.employee)) {
      void readFreshAITeamOverview().catch(() => undefined);
    }
  }, [currentDraft.activeModelAuthSessionId, currentDraft.channel, currentDraft.employee, currentDraft.model, currentStep, onboardingState]);

  useEffect(() => {
    if (!modelConfig) {
      return;
    }

    setProviderId((current) => current || currentDraft.model?.providerId || modelConfig.providers[0]?.id || "");
  }, [currentDraft.model?.providerId, modelConfig]);

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }

    setMethodId((current) => {
      if (current && selectedProvider.authMethods.some((method) => method.id === current)) {
        return current;
      }

      return currentDraft.model?.methodId ?? selectedProvider.authMethods[0]?.id ?? "";
    });

    setModelKey((current) => {
      if (current && availableModels.some((model) => model.key === current)) {
        return current;
      }

      return currentDraft.model?.modelKey ?? selectedProvider.sampleModels[0] ?? availableModels[0]?.key ?? "";
    });
  }, [availableModels, currentDraft.model?.methodId, currentDraft.model?.modelKey, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider || !modelKey) {
      return;
    }

    setModelLabel((current) => current || `${selectedProvider.label} ${modelKey.split("/").pop() ?? "model"}`);
  }, [modelKey, selectedProvider]);

  useEffect(() => {
    if (!channelConfig) {
      return;
    }

    setSelectedChannelId((current) => current || currentDraft.channel?.channelId || visibleChannelCapabilities[0]?.id || "");
  }, [channelConfig, currentDraft.channel?.channelId, visibleChannelCapabilities]);

  useEffect(() => {
    if (!selectedChannelId) {
      return;
    }

    setChannelValues({
      domain: "feishu",
      botName: "SlackClaw Assistant",
      pluginSpec: "@openclaw-china/wecom-app",
      ...(selectedChannelEntry?.editableValues ?? {})
    });
  }, [selectedChannelEntry?.id, selectedChannelId]);

  useEffect(() => {
    if (currentStep !== "employee" && currentStep !== "complete") {
      return;
    }

    if (currentDraft.employee) {
      setEmployeeName((current) => current || currentDraft.employee?.name || "");
      setEmployeeJobTitle((current) => current || currentDraft.employee?.jobTitle || "");
      setEmployeeAvatarPresetId((current) => current || currentDraft.employee?.avatarPresetId || ONBOARDING_AVATAR_PRESETS[0]?.id || memberAvatarPresets[0].id);
      setSelectedTraits((current) => current.length > 0 ? current : currentDraft.employee?.personalityTraits ?? ["Analytical", "Detail-Oriented"]);
      setSelectedSkillIds((current) => current.length > 0 ? current : currentDraft.employee?.skillIds ?? []);
      setMemoryEnabled(currentDraft.employee.memoryEnabled ?? true);
    }
  }, [currentDraft.employee, currentStep]);

  useEffect(() => {
    if (!currentDraft.activeModelAuthSessionId) {
      setModelSession(undefined);
      return;
    }

    let cancelled = false;

    async function restoreSession() {
      try {
        const next = await fetchModelAuthSession(currentDraft.activeModelAuthSessionId!);
        if (cancelled) {
          return;
        }
        setModelConfig(next.modelConfig);
        setModelSession(next.session);
      } catch {
        if (!cancelled) {
          setModelSession(undefined);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [currentDraft.activeModelAuthSessionId]);

  useEffect(() => {
    if (currentStep !== "model" || !providerId || !modelKey) {
      return;
    }

    const nextModelState = {
      providerId,
      modelKey,
      methodId,
      entryId: currentDraft.model?.entryId
    };

    if (JSON.stringify(nextModelState) === JSON.stringify(currentDraft.model ?? {})) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDraft({ model: nextModelState });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentDraft.model, currentStep, methodId, modelKey, providerId]);

  useEffect(() => {
    if (currentStep !== "channel" || !selectedChannelId) {
      return;
    }

    const selectedChannelStateId = visibleChannelCapabilities.find((capability) => capability.id === selectedChannelId)?.id;
    if (!selectedChannelStateId) {
      return;
    }

    const nextChannelState = {
      channelId: selectedChannelStateId,
      entryId: currentDraft.channel?.entryId
    };

    if (JSON.stringify(nextChannelState) === JSON.stringify(currentDraft.channel ?? {})) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDraft({ channel: nextChannelState });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentDraft.channel, currentStep, selectedChannelId, visibleChannelCapabilities]);

  useEffect(() => {
    if (currentStep !== "employee") {
      return;
    }

    const nextEmployeeState = {
      memberId: currentDraft.employee?.memberId,
      name: employeeName,
      jobTitle: employeeJobTitle,
      avatarPresetId: employeeAvatarPresetId,
      personalityTraits: selectedTraits,
      skillIds: selectedSkillIds,
      memoryEnabled
    };

    if (JSON.stringify(nextEmployeeState) === JSON.stringify(currentDraft.employee ?? {})) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDraft({ employee: nextEmployeeState });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentDraft.employee, currentStep, employeeAvatarPresetId, employeeJobTitle, employeeName, memoryEnabled, selectedSkillIds, selectedTraits]);

  useEffect(() => {
    if (!modelSession?.id) {
      return;
    }

    const timer = window.setInterval(async () => {
      const nextSession = await fetchModelAuthSession(modelSession.id);
      setModelSession(nextSession.session);
      setModelConfig(nextSession.modelConfig);

      if (nextSession.session.status === "completed") {
        const result = await settleAfterMutation({
          mutate: async () => nextSession,
          getProvisionalState: (mutation) => mutation.modelConfig,
          applyState: setModelConfig,
          readFresh: readFreshModelConfig,
          isSettled: (state, mutation) => {
            const entryId = mutation.session.entryId ?? currentDraft.model?.entryId;
            if (!entryId) {
              return false;
            }

            const expectedEntry = mutation.modelConfig.savedEntries.find((entry) => entry.id === entryId);
            const actualEntry = state.savedEntries.find((entry) => entry.id === entryId);
            return saveEntrySignature(actualEntry) === saveEntrySignature(expectedEntry);
          },
          attempts: 8,
          delayMs: 700
        });

        const nextEntry =
          result.state.savedEntries.find((entry) => entry.id === nextSession.session.entryId) ??
          result.state.savedEntries.find(
            (entry) => entry.providerId === nextSession.session.providerId && entry.authMethodId === nextSession.session.methodId
          );

        await persistDraft({
          currentStep: "channel",
          model: {
            providerId: nextEntry?.providerId ?? providerId,
            modelKey: nextEntry?.modelKey ?? modelKey,
            methodId: nextEntry?.authMethodId ?? methodId,
            entryId: nextEntry?.id ?? currentDraft.model?.entryId
          },
          activeModelAuthSessionId: ""
        });
        setModelSession(undefined);
        return;
      }

      if (nextSession.session.status === "failed") {
        await persistDraft({ activeModelAuthSessionId: "" });
      }
    }, 1600);

    return () => window.clearInterval(timer);
  }, [currentDraft.model?.entryId, methodId, modelKey, modelSession?.id, providerId]);

  async function handleAdvanceToInstall() {
    setPageError(undefined);
    await persistDraft({ currentStep: "install" });
  }

  async function handleInstall() {
    setPageError(undefined);
    setPageLoading(true);
    try {
      const result = await settleAfterMutation({
        mutate: () => runFirstRunSetup(),
        getProvisionalState: (mutation) => mutation.overview,
        applyState: setOverview,
        readFresh: readFreshOverview,
        isSettled: (state) => state.engine.installed,
        attempts: 10,
        delayMs: 750
      });

      const installState = {
        installed: result.state.engine.installed,
        version: result.state.engine.version ?? result.mutation.install?.actualVersion ?? result.mutation.install?.existingVersion,
        disposition: installDisposition(result.state, result.mutation)
      };

      await persistDraft({
        currentStep: "model",
        install: installState
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not finish installation.");
    } finally {
      setPageLoading(false);
    }
  }

  async function handleSaveModel() {
    if (!selectedProvider || !selectedMethod || !modelKey.trim()) {
      setPageError(copy.chooseProvider);
      return;
    }

    setPageError(undefined);
    setModelBusy("save");
    try {
      const request: SaveModelEntryRequest = {
        label: modelLabel.trim() || `${selectedProvider.label} ${modelKey.split("/").pop() ?? modelKey}`,
        providerId,
        methodId,
        modelKey: modelKey.trim(),
        values: modelValues,
        makeDefault: true,
        useAsFallback: false
      };
      const previousEntries = modelConfig?.savedEntries ?? [];
      const result = await settleAfterMutation<ModelConfigActionResponse, ModelConfigOverview>({
        mutate: () => createSavedModelEntry(request),
        getProvisionalState: (mutation) => mutation.modelConfig,
        applyState: setModelConfig,
        readFresh: readFreshModelConfig,
        isSettled: (state, mutation) => {
          if (mutation.authSession) {
            return false;
          }

          const createdEntry = findCreatedSavedEntry(previousEntries, mutation.modelConfig.savedEntries);
          if (!createdEntry) {
            return false;
          }

          const actualEntry = state.savedEntries.find((entry) => entry.id === createdEntry.id);
          return saveEntrySignature(actualEntry) === saveEntrySignature(createdEntry);
        },
        attempts: 8,
        delayMs: 700
      });

      setModelConfig(result.state);
      if (result.mutation.authSession) {
        setModelSession(result.mutation.authSession);
        await persistDraft({
          currentStep: "model",
          model: {
            providerId,
            modelKey: modelKey.trim(),
            methodId
          },
          activeModelAuthSessionId: result.mutation.authSession.id
        });
        return;
      }

      const savedEntry =
        findCreatedSavedEntry(previousEntries, result.state.savedEntries) ??
        result.state.savedEntries.find((entry) => entry.providerId === providerId && entry.modelKey === modelKey.trim());

      await persistDraft({
        currentStep: "channel",
        model: {
          providerId,
          modelKey: modelKey.trim(),
          methodId,
          entryId: savedEntry?.id
        },
        activeModelAuthSessionId: ""
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not save this model.");
    } finally {
      setModelBusy("");
    }
  }

  async function handleModelSessionInput() {
    if (!modelSession?.id || !modelSessionInput.trim()) {
      return;
    }

    setModelBusy("input");
    try {
      const next = await submitModelAuthSessionInput(modelSession.id, { value: modelSessionInput.trim() });
      setModelSession(next.session);
      setModelConfig(next.modelConfig);
      setModelSessionInput("");
      await refreshOnboardingState();
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not finish model authentication.");
    } finally {
      setModelBusy("");
    }
  }

  async function handleSaveChannel() {
    if (!selectedChannelCapability) {
      setPageError(copy.chooseChannel);
      return;
    }

    setPageError(undefined);
    setChannelBusy(true);
    try {
      const request: SaveChannelEntryRequest = {
        channelId: selectedChannelCapability.id,
        values: channelValues,
        action: "save"
      };
      const previousEntries = channelConfig?.entries ?? [];
      const result = selectedChannelEntry
        ? await settleAfterMutation<ChannelConfigActionResponse, ChannelConfigOverview>({
            mutate: () => updateChannelEntry(selectedChannelEntry.id, request),
            getProvisionalState: (mutation) => mutation.channelConfig,
            applyState: setChannelConfig,
            readFresh: readFreshChannelConfig,
            isSettled: (state, mutation) => {
              const expectedEntry = mutation.channelConfig.entries.find((entry) => entry.id === selectedChannelEntry.id);
              const actualEntry = state.entries.find((entry) => entry.id === selectedChannelEntry.id);
              return channelEntrySignature(actualEntry) === channelEntrySignature(expectedEntry);
            },
            attempts: 8,
            delayMs: 700
          })
        : await settleAfterMutation<ChannelConfigActionResponse, ChannelConfigOverview>({
            mutate: () => createChannelEntry(request),
            getProvisionalState: (mutation) => mutation.channelConfig,
            applyState: setChannelConfig,
            readFresh: readFreshChannelConfig,
            isSettled: (state, mutation) => {
              const createdEntry = findCreatedChannelEntry(previousEntries, mutation.channelConfig.entries);
              if (!createdEntry) {
                return false;
              }

              const actualEntry = state.entries.find((entry) => entry.id === createdEntry.id);
              return channelEntrySignature(actualEntry) === channelEntrySignature(createdEntry);
            },
            attempts: 8,
            delayMs: 700
          });

      setChannelConfig(result.state);
      setChannelMessage(result.mutation.message);
      setChannelRequiresApply(Boolean(result.mutation.requiresGatewayApply));
      const savedEntry =
        (selectedChannelEntry ? result.state.entries.find((entry) => entry.id === selectedChannelEntry.id) : undefined) ??
        findCreatedChannelEntry(previousEntries, result.state.entries) ??
        result.state.entries.find((entry) => entry.channelId === selectedChannelCapability.id);

      await persistDraft({
        currentStep: "employee",
        channel: {
          channelId: selectedChannelCapability.id,
          entryId: savedEntry?.id
        }
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not save this channel.");
    } finally {
      setChannelBusy(false);
    }
  }

  function toggleTrait(trait: string) {
    setSelectedTraits((current) => (current.includes(trait) ? current.filter((item) => item !== trait) : [...current, trait]));
  }

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) => (current.includes(skillId) ? current.filter((item) => item !== skillId) : [...current, skillId]));
  }

  async function handleCreateEmployee() {
    if (!selectedBrainEntryId || !employeeName.trim() || !employeeJobTitle.trim()) {
      setPageError("SlackClaw needs a saved model, employee name, and job title before it can create the AI employee.");
      return;
    }

    setPageError(undefined);
    setEmployeeBusy(true);
    try {
      const draft: OnboardingEmployeeDraft = {
        name: employeeName,
        jobTitle: employeeJobTitle,
        avatarPresetId: employeeAvatarPresetId,
        personalityTraits: selectedTraits,
        skillIds: selectedSkillIds,
        memoryEnabled,
        brainEntryId: selectedBrainEntryId
      };
      const previousMembers = teamOverview?.members ?? [];
      const result = await settleAfterMutation({
        mutate: () => createAIMember(buildOnboardingMemberRequest(draft)),
        getProvisionalState: (mutation) => mutation.overview,
        applyState: setTeamOverview,
        readFresh: readFreshAITeamOverview,
        isSettled: (state, mutation) => {
          const createdMember = findCreatedMember(previousMembers, mutation.overview.members);
          if (!createdMember) {
            return false;
          }
          return Boolean(state.members.find((member) => member.id === createdMember.id));
        },
        attempts: 8,
        delayMs: 700
      });

      const createdMember =
        findCreatedMember(previousMembers, result.state.members) ??
        result.state.members.find((member) => member.name === draft.name && member.jobTitle === draft.jobTitle);

      await persistDraft({
        currentStep: "complete",
        employee: {
          memberId: createdMember?.id,
          name: createdMember?.name ?? draft.name,
          jobTitle: createdMember?.jobTitle ?? draft.jobTitle,
          avatarPresetId: createdMember?.avatar.presetId ?? draft.avatarPresetId,
          personalityTraits: selectedTraits,
          skillIds: selectedSkillIds,
          memoryEnabled
        }
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not create this AI employee.");
    } finally {
      setEmployeeBusy(false);
    }
  }

  async function handleComplete(destination: "team" | "dashboard" | "chat") {
    setCompletionBusy(destination);
    setPageError(undefined);
    try {
      const result = await completeOnboarding({ destination });
      setOverview(result.overview);
      navigate(onboardingDestinationPath(destination), { replace: true });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "SlackClaw could not complete onboarding.");
    } finally {
      setCompletionBusy("");
    }
  }

  if (pageLoading && !onboardingState) {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-shell onboarding-shell--loading">
          <LoaderCircle className="onboarding-spinner" size={28} />
          <strong>{copy.loading}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-screen">
      <div className="onboarding-shell">
        <div className="onboarding-header">
          <div className="onboarding-header__copy">
            <Badge tone="info">
              <Sparkles size={14} />
              {copy.brand}
            </Badge>
            <h1>{copy.welcomeTitle}</h1>
            <p>{copy.subtitle}</p>
          </div>
          <div className="onboarding-progress">
            {ONBOARDING_STEP_ORDER.map((step, index) => {
              const active = index === currentStepIndex;
              const complete = index < currentStepIndex;
              return (
                <div
                  className={`onboarding-progress__step${active ? " onboarding-progress__step--active" : ""}${complete ? " onboarding-progress__step--complete" : ""}`}
                  key={step}
                >
                  <span className="onboarding-progress__index">{index + 1}</span>
                  <strong>{copy.stepLabels[index]}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="onboarding-card">
          <CardContent className="onboarding-card__content">
            {pageError ? <div className="onboarding-error">{pageError}</div> : null}

            {currentStep === "welcome" ? (
              <div className="onboarding-step onboarding-step--welcome">
                <div className="onboarding-step__hero">
                  <Badge tone="success">{copy.welcomeEyebrow}</Badge>
                  <h2>{copy.welcomeTitle}</h2>
                  <p>{copy.welcomeBody}</p>
                  <Button size="lg" onClick={() => void handleAdvanceToInstall()}>
                    {copy.begin}
                    <ArrowRight size={16} />
                  </Button>
                </div>
                <div className="onboarding-highlight-grid">
                  {copy.welcomeHighlights.map((highlight) => (
                    <div className="onboarding-highlight-card" key={highlight.title}>
                      <div className="onboarding-highlight-card__icon">
                        <Sparkles size={18} />
                      </div>
                      <strong>{highlight.title}</strong>
                      <p>{highlight.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === "install" ? (
              <LoadingBlocker
                active={pageLoading}
                label={copy.installTitle}
                description={overview?.engine.installed ? copy.installDetected : copy.installMissing}
              >
                <div className="onboarding-step onboarding-step--install">
                  <div className="onboarding-step__intro">
                    <Badge tone="info">{copy.installEyebrow}</Badge>
                    <h2>{copy.installTitle}</h2>
                    <p>{copy.installBody}</p>
                  </div>
                  <div className="onboarding-grid onboarding-grid--two">
                    <div className="onboarding-panel onboarding-panel--soft">
                      <div className="onboarding-panel__icon">
                        <Rocket size={20} />
                      </div>
                      <strong>{overview?.engine.installed ? copy.installDetected : copy.installMissing}</strong>
                      <p>{overview?.engine.summary}</p>
                      {overview?.engine.version ? <Badge tone="neutral">{overview.engine.version}</Badge> : null}
                    </div>
                    <div className="onboarding-panel">
                      <strong>{copy.installSuccess}</strong>
                      <p>{currentDraft.install?.version ? `${copy.completionInstall}: ${currentDraft.install.version}` : overview?.engine.version ?? "—"}</p>
                      <div className="onboarding-actions">
                        <Button variant="outline" onClick={() => void persistDraft({ currentStep: "welcome" })}>
                          {common.back}
                        </Button>
                        <Button onClick={() => void handleInstall()}>
                          {overview?.engine.installed ? copy.installContinue : copy.installCta}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "model" ? (
              <LoadingBlocker
                active={!modelConfig || modelBusy !== ""}
                label={copy.modelTitle}
                description={copy.modelBody}
              >
                <div className="onboarding-step onboarding-step--model">
                  <div className="onboarding-step__intro">
                    <Badge tone="info">{copy.modelEyebrow}</Badge>
                    <h2>{copy.modelTitle}</h2>
                    <p>{copy.modelBody}</p>
                  </div>

                  {!selectedProvider ? (
                    <div className="onboarding-provider-grid">
                      {modelConfig?.providers.map((provider) => (
                        <button
                          className="onboarding-select-card"
                          key={provider.id}
                          onClick={() => setProviderId(provider.id)}
                          type="button"
                        >
                          <ProviderLogo label={provider.label} providerId={provider.id} />
                          <div>
                            <strong>{provider.label}</strong>
                            <p>{provider.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="onboarding-grid onboarding-grid--two">
                      <div className="onboarding-panel onboarding-panel--soft">
                        <div className="onboarding-provider-head">
                          <ProviderLogo label={selectedProvider.label} providerId={selectedProvider.id} />
                          <div>
                            <strong>{selectedProvider.label}</strong>
                            <p>{selectedProvider.description}</p>
                          </div>
                        </div>
                        <div className="field-grid">
                          <div>
                            <FieldLabel htmlFor="onboarding-model-label">Display name</FieldLabel>
                            <Input
                              id="onboarding-model-label"
                              value={modelLabel}
                              onChange={(event) => setModelLabel(event.target.value)}
                              placeholder={`${selectedProvider.label} ${modelKey.split("/").pop() ?? "model"}`}
                            />
                          </div>
                          <div>
                            <FieldLabel htmlFor="onboarding-model-method">{copy.authTitle}</FieldLabel>
                            <Select id="onboarding-model-method" value={methodId} onChange={(event) => setMethodId(event.target.value)}>
                              {selectedProvider.authMethods.map((method) => (
                                <option key={method.id} value={method.id}>
                                  {method.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <FieldLabel htmlFor="onboarding-model-select">Model</FieldLabel>
                            {availableModels.length ? (
                              <Select
                                id="onboarding-model-select"
                                value={selectedModelValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === MODEL_KEY_CUSTOM_OPTION) {
                                    setModelKey((current) => (availableModels.some((item) => item.key === current) ? "" : current));
                                    return;
                                  }
                                  setModelKey(nextValue);
                                }}
                              >
                                {availableModels.map((model) => (
                                  <option key={model.key} value={model.key}>
                                    {model.name} ({model.key})
                                  </option>
                                ))}
                                <option value={MODEL_KEY_CUSTOM_OPTION}>Custom model key…</option>
                              </Select>
                            ) : null}
                            {showCustomModelInput ? (
                              <Input
                                value={modelKey}
                                onChange={(event) => setModelKey(event.target.value)}
                                placeholder={modelKeyPlaceholder(selectedProvider)}
                              />
                            ) : null}
                          </div>
                          {selectedMethod?.fields.map((field) => (
                            <div key={field.id}>
                              <FieldLabel htmlFor={`field-${field.id}`}>
                                {field.label}
                                {field.required ? ` · ${copy.required}` : ""}
                              </FieldLabel>
                              <Input
                                id={`field-${field.id}`}
                                type={field.secret ? "password" : "text"}
                                value={onboardingFieldValue(modelValues, field.id)}
                                onChange={(event) =>
                                  setModelValues((current) => ({
                                    ...current,
                                    [field.id]: event.target.value
                                  }))
                                }
                                placeholder={field.placeholder}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="onboarding-actions">
                          <Button variant="outline" onClick={() => void persistDraft({ currentStep: "install" })}>
                            {common.back}
                          </Button>
                          <Button
                            onClick={() => void handleSaveModel()}
                            disabled={!selectedProvider || !selectedMethod || !modelKey.trim() || requiredModelFieldsMissing(selectedMethod, modelValues)}
                            loading={modelBusy === "save"}
                          >
                            {copy.modelSave}
                          </Button>
                        </div>
                      </div>

                      <div className="onboarding-panel">
                        <strong>{copy.authProgressTitle}</strong>
                        <p>{selectedMethod?.description}</p>
                        {selectedProvider.docsUrl ? (
                          <Button
                            variant="ghost"
                            onClick={() => window.open(selectedProvider.docsUrl, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink size={14} />
                            Documentation
                          </Button>
                        ) : null}
                        {modelSession ? (
                          <div className="panel-stack">
                            <Textarea readOnly rows={10} value={modelSession.logs.join("\n")} />
                            {modelSession.launchUrl ? (
                              <Button
                                variant="outline"
                                onClick={() => window.open(modelSession.launchUrl, "_blank", "noopener,noreferrer")}
                              >
                                <ExternalLink size={14} />
                                {copy.openAuthWindow}
                              </Button>
                            ) : null}
                            {modelSession.status === "awaiting-input" ? (
                              <div className="field-grid field-grid--two">
                                <Input
                                  value={modelSessionInput}
                                  onChange={(event) => setModelSessionInput(event.target.value)}
                                  placeholder={modelSession.inputPrompt ?? "Paste redirect URL or code"}
                                />
                                <Button
                                  loading={modelBusy === "input"}
                                  onClick={() => void handleModelSessionInput()}
                                  disabled={!modelSessionInput.trim()}
                                >
                                  {copy.submitAuthInput}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="onboarding-panel__empty">
                            <Bot size={22} />
                            <p>{copy.modelSaved}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "channel" ? (
              <LoadingBlocker
                active={!channelConfig || channelBusy}
                label={copy.channelTitle}
                description={copy.channelBody}
              >
                <div className="onboarding-step onboarding-step--channel">
                  <div className="onboarding-step__intro">
                    <Badge tone="info">{copy.channelEyebrow}</Badge>
                    <h2>{copy.channelTitle}</h2>
                    <p>{copy.channelBody}</p>
                  </div>

                  <div className="onboarding-grid onboarding-grid--two">
                    <div className="onboarding-panel onboarding-panel--soft">
                      <strong>{copy.chooseChannel}</strong>
                      <div className="onboarding-channel-grid">
                        {visibleChannelCapabilities.map((capability) => (
                          <button
                            className={`onboarding-select-card${selectedChannelId === capability.id ? " onboarding-select-card--active" : ""}`}
                            key={capability.id}
                            onClick={() => setSelectedChannelId(capability.id)}
                            type="button"
                          >
                            <div className="onboarding-channel-glyph">{channelIcon(capability.id)}</div>
                            <div>
                              <strong>{capability.label}</strong>
                              <p>{capability.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="onboarding-panel">
                      {selectedChannelCapability ? (
                        <>
                          <div className="onboarding-provider-head">
                            <div className="onboarding-channel-glyph">{channelIcon(selectedChannelCapability.id)}</div>
                            <div>
                              <strong>{selectedChannelCapability.label}</strong>
                              <p>{selectedChannelCapability.description}</p>
                            </div>
                          </div>
                          <div className="field-grid">
                            {selectedChannelCapability.fieldDefs.map((field) => (
                              <div key={field.id}>
                                <FieldLabel htmlFor={`channel-${field.id}`}>
                                  {field.label}
                                  {field.required ? ` · ${copy.required}` : ""}
                                </FieldLabel>
                                {field.kind === "textarea" ? (
                                  <Textarea
                                    id={`channel-${field.id}`}
                                    rows={4}
                                    value={onboardingFieldValue(channelValues, field.id)}
                                    onChange={(event) =>
                                      setChannelValues((current) => ({
                                        ...current,
                                        [field.id]: event.target.value
                                      }))
                                    }
                                    placeholder={field.placeholder}
                                  />
                                ) : field.kind === "select" ? (
                                  <Select
                                    id={`channel-${field.id}`}
                                    value={onboardingFieldValue(channelValues, field.id, field.options?.[0]?.value)}
                                    onChange={(event) =>
                                      setChannelValues((current) => ({
                                        ...current,
                                        [field.id]: event.target.value
                                      }))
                                    }
                                  >
                                    {field.options?.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <Input
                                    id={`channel-${field.id}`}
                                    type={field.secret ? "password" : "text"}
                                    value={onboardingFieldValue(channelValues, field.id)}
                                    onChange={(event) =>
                                      setChannelValues((current) => ({
                                        ...current,
                                        [field.id]: event.target.value
                                      }))
                                    }
                                    placeholder={field.placeholder}
                                  />
                                )}
                                {field.helpText ? <p className="card__description">{field.helpText}</p> : null}
                              </div>
                            ))}
                          </div>
                          {channelMessage ? <div className="onboarding-inline-note">{channelMessage}</div> : null}
                          {channelRequiresApply ? (
                            <div className="onboarding-inline-note onboarding-inline-note--warning">
                              <strong>{copy.pendingApplyTitle}</strong>
                              <span>{copy.channelApplyHint}</span>
                            </div>
                          ) : null}
                          <div className="onboarding-actions">
                            <Button variant="outline" onClick={() => void persistDraft({ currentStep: "model" })}>
                              {common.back}
                            </Button>
                            <Button
                              onClick={() => void handleSaveChannel()}
                              disabled={requiredChannelFieldsMissing(selectedChannelCapability, channelValues)}
                            >
                              {copy.channelSave}
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "employee" ? (
              <LoadingBlocker
                active={!teamOverview || employeeBusy}
                label={copy.employeeTitle}
                description={copy.employeeBody}
              >
                <div className="onboarding-step onboarding-step--employee">
                  <div className="onboarding-step__intro">
                    <Badge tone="info">{copy.employeeEyebrow}</Badge>
                    <h2>{copy.employeeTitle}</h2>
                    <p>{copy.employeeBody}</p>
                  </div>

                  <div className="onboarding-employee-grid">
                    <div className="onboarding-panel onboarding-panel--soft">
                      <strong>{copy.chooseAvatar}</strong>
                      <div className="onboarding-avatar-grid">
                        {ONBOARDING_AVATAR_PRESETS.map((preset) => (
                          <button
                            className={`onboarding-avatar-card${employeeAvatarPresetId === preset.id ? " onboarding-avatar-card--active" : ""}`}
                            key={preset.id}
                            onClick={() => setEmployeeAvatarPresetId(preset.id)}
                            type="button"
                          >
                            <MemberAvatar
                              avatar={{
                                presetId: preset.id,
                                accent: preset.accent,
                                emoji: preset.emoji,
                                theme: preset.theme
                              }}
                              className="onboarding-avatar-card__avatar"
                              name={preset.label}
                            />
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="field-grid">
                        <div>
                          <FieldLabel htmlFor="employee-name">{copy.employeeName}</FieldLabel>
                          <Input id="employee-name" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} />
                        </div>
                        <div>
                          <FieldLabel htmlFor="employee-role">{copy.employeeRole}</FieldLabel>
                          <Input id="employee-role" value={employeeJobTitle} onChange={(event) => setEmployeeJobTitle(event.target.value)} />
                        </div>
                      </div>

                      <div className="panel-stack">
                        <strong>{copy.personalityTitle}</strong>
                        <div className="skill-chip-grid">
                          {ONBOARDING_TRAITS.map((trait) => (
                            <button
                              className={`badge ${selectedTraits.includes(trait) ? "badge--info" : "badge--neutral"}`}
                              key={trait}
                              onClick={() => toggleTrait(trait)}
                              type="button"
                            >
                              {trait}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="onboarding-panel">
                      <div className="panel-stack">
                        <strong>{copy.skillsTitle}</strong>
                        <div className="skill-chip-grid">
                          {teamOverview?.skillOptions.map((skill) => (
                            <button
                              className={`badge ${selectedSkillIds.includes(skill.id) ? "badge--success" : "badge--neutral"}`}
                              key={skill.id}
                              onClick={() => toggleSkill(skill.id)}
                              type="button"
                            >
                              {skill.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="onboarding-memory-toggle">
                        <div>
                          <strong>{memoryEnabled ? copy.memoryOn : copy.memoryOff}</strong>
                          <p className="card__description">Context window: 128000</p>
                        </div>
                        <button
                          className={`onboarding-switch${memoryEnabled ? " onboarding-switch--active" : ""}`}
                          onClick={() => setMemoryEnabled((current) => !current)}
                          type="button"
                        >
                          <span />
                        </button>
                      </div>

                      <div className="onboarding-preview-card">
                        <div className="onboarding-preview-card__top">
                          <MemberAvatar
                            avatar={{
                              presetId: selectedEmployeeAvatar.id,
                              accent: selectedEmployeeAvatar.accent,
                              emoji: selectedEmployeeAvatar.emoji,
                              theme: selectedEmployeeAvatar.theme
                            }}
                            className="onboarding-preview-card__avatar"
                            name={employeeName || selectedEmployeeAvatar.label}
                          />
                          <div>
                            <strong>{employeeName || "Alex Morgan"}</strong>
                            <p>{employeeJobTitle || "Senior Research Analyst"}</p>
                          </div>
                        </div>
                        <div className="actions-row" style={{ flexWrap: "wrap" }}>
                          {selectedTraits.slice(0, 3).map((trait) => (
                            <Badge key={trait} tone="info">{trait}</Badge>
                          ))}
                          {selectedSkills.slice(0, 2).map((skill) => (
                            <Badge key={skill.id} tone="neutral">{skill.label}</Badge>
                          ))}
                        </div>
                        <p className="card__description">
                          {selectedModelEntry?.label ?? selectedModelEntry?.modelKey ?? "Default onboarding model"}
                        </p>
                      </div>

                      <div className="onboarding-actions">
                        <Button variant="outline" onClick={() => void persistDraft({ currentStep: "channel" })}>
                          {common.back}
                        </Button>
                        <Button
                          onClick={() => void handleCreateEmployee()}
                          disabled={!selectedBrainEntryId || !employeeName.trim() || !employeeJobTitle.trim()}
                          loading={employeeBusy}
                        >
                          {copy.createEmployee}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "complete" ? (
              <div className="onboarding-step onboarding-step--complete">
                <div className="onboarding-step__intro onboarding-step__intro--center">
                  <Badge tone="success">{copy.completeEyebrow}</Badge>
                  <h2>{copy.completeTitle}</h2>
                  <p>{copy.completeBody}</p>
                </div>

                <div className="onboarding-complete-summary">
                  <div className="onboarding-summary-card">
                    <strong>{copy.completionInstall}</strong>
                    <span>{onboardingState?.summary.install?.version ?? overview?.engine.version ?? "Not installed"}</span>
                  </div>
                  <div className="onboarding-summary-card">
                    <strong>{copy.completionModel}</strong>
                    <span>{selectedModelEntry?.label ?? onboardingState?.summary.model?.modelKey ?? "Not configured"}</span>
                  </div>
                  <div className="onboarding-summary-card">
                    <strong>{copy.completionChannel}</strong>
                    <span>{onboardingState?.summary.channel?.channelId ?? "Not configured"}</span>
                  </div>
                  <div className="onboarding-summary-card">
                    <strong>{copy.completionEmployee}</strong>
                    <span>{onboardingState?.summary.employee?.name ?? "Not created"}</span>
                  </div>
                </div>

                <div className="onboarding-destination-grid">
                  <button
                    className="onboarding-destination-card"
                    onClick={() => void handleComplete("team")}
                    type="button"
                  >
                    <Users size={18} />
                    <strong>{copy.goTeam}</strong>
                    {completionBusy === "team" ? <LoaderCircle className="onboarding-inline-spinner" size={16} /> : <ArrowRight size={16} />}
                  </button>
                  <button
                    className="onboarding-destination-card"
                    onClick={() => void handleComplete("dashboard")}
                    type="button"
                  >
                    <Rocket size={18} />
                    <strong>{copy.goDashboard}</strong>
                    {completionBusy === "dashboard" ? <LoaderCircle className="onboarding-inline-spinner" size={16} /> : <ArrowRight size={16} />}
                  </button>
                  <button
                    className="onboarding-destination-card"
                    onClick={() => void handleComplete("chat")}
                    type="button"
                  >
                    <MessageSquare size={18} />
                    <strong>{copy.goChat}</strong>
                    {completionBusy === "chat" ? <LoaderCircle className="onboarding-inline-spinner" size={16} /> : <ArrowRight size={16} />}
                  </button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
