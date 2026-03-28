import {
  AlertCircle,
  ArrowRight,
  Brain,
  ChevronRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Info,
  Key,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  PlayCircle,
  Rocket,
  Server,
  Send,
  Sparkles,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AITeamOverview,
  ChannelConfigOverview,
  ConfiguredChannelEntry,
  ModelAuthMethod,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  ModelConfigOverview,
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
  submitChannelSessionInput,
  submitModelAuthSessionInput,
  updateChannelEntry,
  updateOnboardingState
} from "../../shared/api/client.js";
import { memberAvatarImageSrc, memberAvatarPresets, resolveMemberAvatarPreset } from "../../shared/avatar-presets.js";
import { settleAfterMutation } from "../../shared/data/settle.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge, TagBadge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { FieldLabel, Input, Textarea } from "../../shared/ui/Field.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { ErrorState } from "../../shared/ui/ErrorState.js";
import { LanguageSelector } from "../../shared/ui/LanguageSelector.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { Progress } from "../../shared/ui/Progress.js";
import { GuidedFlowScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";
import { onboardingCopy } from "./copy.js";
import {
  buildExistingInstallAdvanceDraft,
  buildOnboardingChannelSaveValues,
  buildOnboardingMemberRequest,
  onboardingDestinationPath,
  resolveOnboardingEmployeePresetReadiness,
  resolveOnboardingEmployeePresets,
  onboardingRefreshResourceForEvent,
  resolveOnboardingChannelPresentations,
  resolveOnboardingChannelSetupVariant,
  resolveOnboardingInstallViewState,
  resolveOnboardingModelPickerProviders,
  resolveOnboardingModelSetupVariant,
  resolveOnboardingModelViewState,
  resolveOnboardingProviderId,
  resolveOnboardingModelProviders,
  nextOnboardingStepAfterModelSave,
  resolveOnboardingPresetSkillIds,
  shouldShowOnboardingAuthMethodChooser,
  type OnboardingEmployeeDraft,
  type OnboardingInstallProgressSnapshot
} from "./helpers.js";

const ONBOARDING_STEP_ORDER = ["welcome", "install", "permissions", "model", "channel", "employee", "complete"] as const;
const ONBOARDING_AVATAR_PRESETS = memberAvatarPresets.filter((preset) => preset.id.startsWith("onboarding-"));

function isCurrentOrLaterStep(step: OnboardingStateResponse["draft"]["currentStep"], target: typeof ONBOARDING_STEP_ORDER[number]) {
  return ONBOARDING_STEP_ORDER.indexOf(step) >= ONBOARDING_STEP_ORDER.indexOf(target);
}

function channelIcon(channelId: string) {
  switch (channelId) {
    case "telegram":
      return <Send size={28} strokeWidth={2} />;
    case "feishu":
    case "wechat":
    default:
      return <MessageCircle size={28} strokeWidth={2} />;
  }
}

function onboardingChannelThemeClass(theme: "wechat-work" | "wechat" | "feishu" | "telegram") {
  return `onboarding-channel-theme onboarding-channel-theme--${theme === "wechat-work" ? "wechat" : theme}`;
}

function defaultChannelValuesFor(channelId: string): Record<string, string> {
  switch (channelId) {
    case "feishu":
      return { domain: "feishu", botName: "ChillClaw Assistant" };
    default:
      return {};
  }
}

function onboardingProviderThemeClass(theme: OnboardingStateResponse["config"]["modelProviders"][number]["theme"]) {
  return `onboarding-provider-theme onboarding-provider-theme--${theme}`;
}

function onboardingAuthMethodIcon(method: ModelAuthMethod) {
  return method.kind === "oauth" ? <Sparkles size={18} /> : <Key size={18} />;
}

function onboardingAuthMethodLabel(copy: ReturnType<typeof onboardingCopy>, method: ModelAuthMethod) {
  return method.kind === "oauth" ? copy.authOAuthLabel : copy.authApiKeyLabel;
}

function onboardingAuthMethodBody(copy: ReturnType<typeof onboardingCopy>, method: ModelAuthMethod) {
  return method.kind === "oauth" ? copy.authOAuthBody : copy.authApiKeyBody;
}

function formatOnboardingProgressLabel(template: string, current: number, total: number) {
  return template.replace("{current}", String(current)).replace("{total}", String(total));
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

function requiredChannelSetupFieldsMissing(
  setupVariant: ReturnType<typeof resolveOnboardingChannelSetupVariant> | undefined,
  values: Record<string, string>
) {
  switch (setupVariant) {
    case "wechat-work-guided":
      return !values.botId?.trim() || !values.secret?.trim();
    case "wechat-guided":
      return false;
    case "telegram-guided":
      return !values.token?.trim();
    case "feishu-guided":
      return !values.appId?.trim() || !values.appSecret?.trim();
    default:
      return true;
  }
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
  const [lastKnownModelPickerProviders, setLastKnownModelPickerProviders] = useState<
    OnboardingStateResponse["config"]["modelProviders"]
  >([]);
  const [lastKnownChannels, setLastKnownChannels] = useState<OnboardingStateResponse["config"]["channels"]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string>();
  const [installBusy, setInstallBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<OnboardingInstallProgressSnapshot>();

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
  const [modelTutorialOpen, setModelTutorialOpen] = useState(false);

  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelValues, setChannelValues] = useState<Record<string, string>>({});
  const [channelMessage, setChannelMessage] = useState("");
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelRequiresApply, setChannelRequiresApply] = useState(false);
  const [channelSessionInput, setChannelSessionInput] = useState("");
  const [channelTutorialOpen, setChannelTutorialOpen] = useState(false);

  const [employeeName, setEmployeeName] = useState("");
  const [employeeJobTitle, setEmployeeJobTitle] = useState("");
  const [employeeAvatarPresetId, setEmployeeAvatarPresetId] = useState(ONBOARDING_AVATAR_PRESETS[0]?.id ?? memberAvatarPresets[0].id);
  const [selectedEmployeePresetId, setSelectedEmployeePresetId] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [employeeBusy, setEmployeeBusy] = useState(false);
  const [completionBusy, setCompletionBusy] = useState<"" | "team" | "dashboard" | "chat">("");

  const currentDraft = onboardingState?.draft ?? { currentStep: "welcome" as const };
  const currentStep = currentDraft.currentStep;
  const currentStepIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  const progressPercent = Math.round(((currentStepIndex + 1) / ONBOARDING_STEP_ORDER.length) * 100);
  const installViewState = resolveOnboardingInstallViewState(
    {
      overview,
      install: currentDraft.install,
      busy: installBusy,
      progress: installProgress
    },
    copy
  );

  const resolvedModelProviders = useMemo(
    () => resolveOnboardingModelProviders(onboardingState, modelConfig),
    [modelConfig, onboardingState]
  );
  const modelPickerProviders = useMemo(
    () => {
      const providers = resolveOnboardingModelPickerProviders(onboardingState);
      return providers.length > 0 ? providers : lastKnownModelPickerProviders;
    },
    [lastKnownModelPickerProviders, onboardingState]
  );
  const selectedProviderOption = resolvedModelProviders.find((provider) => provider.id === providerId);
  const selectedProviderPresentation =
    selectedProviderOption?.curated ?? modelPickerProviders.find((provider) => provider.id === providerId);
  const selectedAuthMethods = selectedProviderPresentation?.authMethods ?? [];
  const selectedMethod = selectedAuthMethods.find((method) => method.id === methodId);
  const shouldShowAuthMethodChooser = shouldShowOnboardingAuthMethodChooser(selectedAuthMethods);
  const selectedSetupVariant = resolveOnboardingModelSetupVariant({
    providerId: selectedProviderPresentation?.id ?? "",
    methodKind: selectedMethod?.kind
  });

  const channelPickerChannels = useMemo(() => {
    const channels = resolveOnboardingChannelPresentations(onboardingState);
    return channels.length > 0 ? channels : lastKnownChannels;
  }, [lastKnownChannels, onboardingState]);
  const selectedChannelPresentation = channelPickerChannels.find((channel) => channel.id === selectedChannelId);
  const selectedChannelSetupVariant = resolveOnboardingChannelSetupVariant(selectedChannelPresentation?.setupKind);
  const selectedChannelEntry = useMemo(() => {
    if (!channelConfig || !selectedChannelId) {
      return undefined;
    }

    return (
      channelConfig.entries.find((entry) => entry.id === currentDraft.channel?.entryId) ??
      channelConfig.entries.find((entry) => entry.channelId === selectedChannelId)
    );
  }, [channelConfig, currentDraft.channel?.entryId, selectedChannelId]);
  const activeChannelSession =
    channelConfig?.activeSession?.channelId === selectedChannelId ? channelConfig.activeSession : undefined;

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
  const modelViewState = useMemo(
    () =>
      resolveOnboardingModelViewState({
        providerId,
        methodId,
        modelKey,
        providers: resolvedModelProviders,
        selectedEntry: selectedModelEntry,
        draftEntryId: currentDraft.model?.entryId,
        summaryEntryId: onboardingState?.summary.model?.entryId,
        activeModelAuthSessionId: currentDraft.activeModelAuthSessionId
      }),
    [
      currentDraft.activeModelAuthSessionId,
      currentDraft.model?.entryId,
      methodId,
      modelKey,
      onboardingState?.summary.model?.entryId,
      providerId,
      resolvedModelProviders,
      selectedModelEntry
    ]
  );

  const selectedBrainEntryId = selectedModelEntry?.id;
  const selectedEmployeeAvatar = resolveMemberAvatarPreset(employeeAvatarPresetId);
  const employeePresets = useMemo(() => resolveOnboardingEmployeePresets(onboardingState), [onboardingState]);
  const selectedEmployeePreset = useMemo(() => {
    if (employeePresets.length === 0) {
      return undefined;
    }

    return employeePresets.find((preset) => preset.id === selectedEmployeePresetId) ?? employeePresets[0];
  }, [employeePresets, selectedEmployeePresetId]);
  const employeePresetReadinessById = useMemo(
    () =>
      new Map(
        employeePresets.map((preset) => [
          preset.id,
          resolveOnboardingEmployeePresetReadiness(preset, onboardingState?.presetSkillSync)
        ])
      ),
    [employeePresets, onboardingState?.presetSkillSync]
  );
  const selectedEmployeePresetReadiness = selectedEmployeePreset
    ? employeePresetReadinessById.get(selectedEmployeePreset.id)
    : undefined;

  async function readFreshOverview() {
    const next = await refresh({ fresh: true });
    if (!next) {
      throw new Error("ChillClaw could not refresh the latest overview.");
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
          setPageError(loadError instanceof Error ? loadError.message : "ChillClaw could not load onboarding.");
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
    const providers = resolveOnboardingModelPickerProviders(onboardingState);
    if (providers.length > 0) {
      setLastKnownModelPickerProviders(providers);
    }
  }, [onboardingState]);

  useEffect(() => {
    if (!onboardingState) {
      return;
    }

    if (Boolean(currentDraft.activeModelAuthSessionId) || Boolean(currentDraft.model?.entryId)) {
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
    if (currentStep !== "model" || !onboardingState || modelPickerProviders.length > 0) {
      return;
    }

    void refreshOnboardingState().catch(() => undefined);
  }, [currentStep, modelPickerProviders.length, onboardingState]);

  useEffect(() => {
    if (!modelPickerProviders.length) {
      setProviderId("");
      return;
    }

    setProviderId((current) => resolveOnboardingProviderId(current, currentDraft.model?.providerId, modelPickerProviders));
  }, [currentDraft.model?.providerId, modelPickerProviders]);

  useEffect(() => {
    if (!selectedProviderPresentation) {
      return;
    }

    setMethodId((current) => {
      if (current && selectedProviderPresentation.authMethods.some((method) => method.id === current)) {
        return current;
      }

      return currentDraft.model?.methodId ?? selectedProviderPresentation.authMethods[0]?.id ?? "";
    });

    setModelKey((current) => {
      if (current && current === selectedProviderPresentation.defaultModelKey) {
        return current;
      }

      return currentDraft.model?.modelKey || selectedProviderPresentation.defaultModelKey;
    });
  }, [currentDraft.model?.methodId, currentDraft.model?.modelKey, selectedProviderPresentation]);

  useEffect(() => {
    return subscribeToDaemonEvents((event) => {
      if (currentStep === "install" && event.type === "deploy.progress") {
        setInstallProgress({
          phase: event.phase,
          percent: event.percent,
          message: event.message
        });
      }

      if (event.type === "overview.updated") {
        setOverview(event.snapshot.data);
      } else if (event.type === "model-config.updated") {
        setModelConfig(event.snapshot.data);
      } else if (event.type === "channel-config.updated") {
        setChannelConfig(event.snapshot.data);
      } else if (event.type === "channel.session.updated") {
        setChannelConfig((current) => {
          if (!current || current.activeSession?.channelId !== event.channelId) {
            return current;
          }

          return {
            ...current,
            activeSession: event.session
          };
        });
      } else if (event.type === "ai-team.updated") {
        setTeamOverview(event.snapshot.data);
      }

      const resource = onboardingRefreshResourceForEvent(currentStep, event);
      if (!resource) {
        return;
      }

      void (async () => {
        try {
          switch (resource) {
            case "overview":
              await readFreshOverview();
              break;
            case "onboarding":
              await refreshOnboardingState();
              break;
            case "model":
              await readFreshModelConfig();
              break;
            case "channel":
              await readFreshChannelConfig();
              break;
            case "team":
              await readFreshAITeamOverview();
              break;
          }
        } catch {
          // Keep the onboarding flow responsive even if a live refresh misses once.
        }
      })();
    });
  }, [currentStep, refresh]);

  useEffect(() => {
    const channels = resolveOnboardingChannelPresentations(onboardingState);
    if (channels.length > 0) {
      setLastKnownChannels(channels);
    }
  }, [onboardingState]);

  useEffect(() => {
    if (currentStep !== "install") {
      setInstallProgress(undefined);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!selectedProviderPresentation || !modelKey) {
      return;
    }

    const providerLabel = selectedProviderPresentation.label;
    setModelLabel((current) => current || providerLabel);
  }, [modelKey, selectedProviderPresentation]);

  useEffect(() => {
    setSelectedChannelId((current) => resolveOnboardingProviderId(current, currentDraft.channel?.channelId, channelPickerChannels));
  }, [channelPickerChannels, currentDraft.channel?.channelId]);

  useEffect(() => {
    if (!selectedChannelId) {
      setChannelValues({});
      return;
    }

    setChannelValues({
      ...defaultChannelValuesFor(selectedChannelId),
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
      setSelectedEmployeePresetId((current) => current || currentDraft.employee?.presetId || employeePresets[0]?.id || "");
      setMemoryEnabled(currentDraft.employee.memoryEnabled ?? selectedEmployeePreset?.defaultMemoryEnabled ?? true);
    }
  }, [currentDraft.employee, currentStep, employeePresets, selectedEmployeePreset?.defaultMemoryEnabled]);

  useEffect(() => {
    if (currentStep !== "employee") {
      return;
    }

    if (!selectedEmployeePresetId && employeePresets[0]?.id) {
      setSelectedEmployeePresetId(employeePresets[0].id);
      if (currentDraft.employee?.memoryEnabled === undefined && employeePresets[0].defaultMemoryEnabled !== undefined) {
        setMemoryEnabled(employeePresets[0].defaultMemoryEnabled);
      }
    }
  }, [currentDraft.employee?.memoryEnabled, currentStep, employeePresets, selectedEmployeePresetId]);

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
    if (currentStep !== "employee") {
      return;
    }

    const nextEmployeeState = {
      memberId: currentDraft.employee?.memberId,
      name: employeeName,
      jobTitle: employeeJobTitle,
      avatarPresetId: employeeAvatarPresetId,
      presetId: selectedEmployeePreset?.id,
      personalityTraits: [],
      presetSkillIds: resolveOnboardingPresetSkillIds(selectedEmployeePreset),
      knowledgePackIds: selectedEmployeePreset?.knowledgePackIds ?? [],
      workStyles: selectedEmployeePreset?.workStyles ?? [],
      memoryEnabled
    };

    if (JSON.stringify(nextEmployeeState) === JSON.stringify(currentDraft.employee ?? {})) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDraft({ employee: nextEmployeeState });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentDraft.employee, currentStep, employeeAvatarPresetId, employeeJobTitle, employeeName, memoryEnabled, selectedEmployeePreset]);

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
          currentStep: nextOnboardingStepAfterModelSave(true),
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

  async function handleUseExistingInstall() {
    setPageError(undefined);
    await persistDraft(buildExistingInstallAdvanceDraft(overview));
  }

  async function handleAdvanceToPermissions() {
    setPageError(undefined);
    await persistDraft({ currentStep: "permissions" });
  }

  async function handleAdvanceToModel() {
    setPageError(undefined);
    await persistDraft({ currentStep: "model" });
  }

  async function handleAdvanceToChannel() {
    setPageError(undefined);
    await persistDraft({ currentStep: "channel" });
  }

  async function handleReturnToModelPicker() {
    setPageError(undefined);
    setProviderId("");
    setMethodId("");
    setModelKey("");
    setModelLabel("");
    setModelValues({});
    setModelSession(undefined);
    setModelSessionInput("");

    await persistDraft({
      currentStep: "model",
      model: {
        providerId: "",
        modelKey: "",
        methodId: ""
      },
      activeModelAuthSessionId: ""
    });
  }

  async function handleInstall() {
    setPageError(undefined);
    setInstallBusy(true);
    setInstallProgress({
      phase: "detecting",
      percent: 16,
      message: copy.installStageDetecting
    });
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
        currentStep: "install",
        install: installState
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not finish installation.");
    } finally {
      setInstallBusy(false);
    }
  }

  async function handleSaveModel() {
    if (!selectedProviderPresentation || !selectedMethod || !modelKey.trim()) {
      setPageError(copy.chooseProvider);
      return;
    }

    setPageError(undefined);
    setModelBusy("save");
    try {
      const request: SaveModelEntryRequest = {
        label: modelLabel.trim() || selectedProviderPresentation.label,
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
          currentStep: nextOnboardingStepAfterModelSave(true),
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
        currentStep: nextOnboardingStepAfterModelSave(false),
        model: {
          providerId,
          modelKey: modelKey.trim(),
          methodId,
          entryId: savedEntry?.id
        },
        activeModelAuthSessionId: ""
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not save this model.");
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
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not finish model authentication.");
    } finally {
      setModelBusy("");
    }
  }

  async function handleSaveChannel() {
    if (!selectedChannelPresentation) {
      setPageError(copy.chooseChannel);
      return;
    }

    setPageError(undefined);
    setChannelBusy(true);
    try {
      const request: SaveChannelEntryRequest = {
        channelId: selectedChannelPresentation.id,
        values: buildOnboardingChannelSaveValues(selectedChannelPresentation.id, channelValues),
        action: "save"
      };
      const previousEntries = channelConfig?.entries ?? [];
      const result = selectedChannelEntry
        ? await updateChannelEntry(selectedChannelEntry.id, request)
        : await createChannelEntry(request);

      setChannelConfig(result.channelConfig);
      setChannelMessage(result.message);
      setChannelRequiresApply(Boolean(result.requiresGatewayApply));
      if (result.session) {
        setChannelSessionInput("");
      }
      const savedEntry =
        (selectedChannelEntry ? result.channelConfig.entries.find((entry) => entry.id === selectedChannelEntry.id) : undefined) ??
        findCreatedChannelEntry(previousEntries, result.channelConfig.entries) ??
        result.channelConfig.entries.find((entry) => entry.channelId === selectedChannelPresentation.id);

      if (result.session) {
        await persistDraft({
          currentStep: "channel",
          channel: {
            channelId: selectedChannelPresentation.id,
            entryId: savedEntry?.id
          }
        });
        return;
      }

      await persistDraft({
        currentStep: "employee",
        channel: {
          channelId: selectedChannelPresentation.id,
          entryId: savedEntry?.id
        }
      });
      void readFreshChannelConfig().then(setChannelConfig).catch(() => undefined);
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not save this channel.");
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleChannelSessionInput() {
    if (!activeChannelSession?.id || !channelSessionInput.trim()) {
      return;
    }

    setChannelBusy(true);
    try {
      const next = await submitChannelSessionInput(activeChannelSession.id, { value: channelSessionInput.trim() });
      setChannelConfig((current) => current ? { ...current, activeSession: next.session } : current);
      setChannelSessionInput("");
      await readFreshChannelConfig();
      await refreshOnboardingState();
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not continue this channel session.");
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleReturnToChannelPicker() {
    setSelectedChannelId("");
    setChannelValues({});
    setChannelMessage("");
    setChannelRequiresApply(false);
    setChannelSessionInput("");
    setChannelTutorialOpen(false);
    await persistDraft({ currentStep: "channel" });
  }

  async function handleBackFromChannelPicker() {
    await persistDraft({ currentStep: "model" });
  }

  function selectEmployeePreset(presetId: string) {
    const preset = employeePresets.find((candidate) => candidate.id === presetId);
    setSelectedEmployeePresetId(presetId);
    if (preset?.defaultMemoryEnabled !== undefined) {
      setMemoryEnabled(preset.defaultMemoryEnabled);
    }
  }

  async function handleCreateEmployee() {
    if (!selectedBrainEntryId || !selectedEmployeePreset || !employeeName.trim() || !employeeJobTitle.trim()) {
      setPageError("ChillClaw needs a saved model, employee name, and job title before it can create the AI employee.");
      return;
    }

    if (selectedEmployeePresetReadiness?.blocking) {
      setPageError(
        selectedEmployeePresetReadiness.detail ??
          "ChillClaw is still preparing this preset's managed skills in the active OpenClaw runtime."
      );
      return;
    }

    setPageError(undefined);
    setEmployeeBusy(true);
    try {
      const draft: OnboardingEmployeeDraft = {
        name: employeeName,
        jobTitle: employeeJobTitle,
        avatarPresetId: employeeAvatarPresetId,
        presetId: selectedEmployeePreset.id,
        personalityTraits: [],
        presetSkillIds: resolveOnboardingPresetSkillIds(selectedEmployeePreset),
        knowledgePackIds: selectedEmployeePreset.knowledgePackIds,
        workStyles: selectedEmployeePreset.workStyles,
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
          presetId: draft.presetId,
          personalityTraits: [],
          presetSkillIds: draft.presetSkillIds,
          knowledgePackIds: draft.knowledgePackIds,
          workStyles: draft.workStyles,
          memoryEnabled
        }
      });
    } catch (actionError) {
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not create this AI employee.");
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
      setPageError(actionError instanceof Error ? actionError.message : "ChillClaw could not complete onboarding.");
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
      <GuidedFlowScaffold
        className="onboarding-shell"
        header={
          <div className="onboarding-toolbar">
            <div aria-hidden className="onboarding-toolbar__spacer" />
            <div className="onboarding-brand">
              <div className="onboarding-brand__mark">
                <Sparkles size={28} />
              </div>
              <strong>{copy.brand}</strong>
            </div>
            <div className="onboarding-toolbar__controls">
              <LanguageSelector />
            </div>
          </div>
        }
      >

        {currentStep === "welcome" || currentStep === "install" || currentStep === "permissions" || currentStep === "model" ? (
          <div className="onboarding-header onboarding-header--welcome">
            <p>{copy.subtitle}</p>
            <button className="onboarding-skip" onClick={() => void handleComplete("team")} type="button">
              {copy.skip}
            </button>
            <div className="onboarding-progress-bar" role="presentation">
              <div className="onboarding-progress-bar__meta">
                <span>{formatOnboardingProgressLabel(copy.progressStep, currentStepIndex + 1, ONBOARDING_STEP_ORDER.length)}</span>
                <span>{`${progressPercent}% ${copy.progressComplete}`}</span>
              </div>
              <Progress value={progressPercent} />
            </div>
          </div>
        ) : (
          <div className="onboarding-header">
            <div className="onboarding-header__copy">
              <TagBadge tone="info">
                <Sparkles size={14} />
                {copy.brand}
              </TagBadge>
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
        )}

        <Card className={`onboarding-card ${currentStep === "welcome" ? "onboarding-card--welcome" : ""}`.trim()}>
          <CardContent className="onboarding-card__content">
            {pageError ? (
              <ErrorState compact title="Could not continue onboarding" description={pageError} />
            ) : null}

            {currentStep === "welcome" ? (
              <div className="onboarding-step onboarding-step--welcome onboarding-step--welcome-figma">
                <div className="onboarding-step__intro onboarding-step__intro--welcome">
                  <h2>{copy.welcomeTitle}</h2>
                  <p>{copy.welcomeBody}</p>
                </div>
                <div className="onboarding-highlight-stack">
                  {copy.welcomeHighlights.map((highlight, index) => (
                    <div
                      className={`onboarding-highlight-row onboarding-highlight-row--${index === 0 ? "blue" : index === 1 ? "green" : "violet"}`}
                      key={highlight.title}
                    >
                      <div className="onboarding-highlight-row__icon">
                        {index === 0 ? <Rocket size={20} /> : index === 1 ? <Brain size={20} /> : <Users size={20} />}
                      </div>
                      <div className="onboarding-highlight-row__copy">
                        <strong>{highlight.title}</strong>
                        <p>{highlight.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="onboarding-welcome-support">{copy.welcomeSupport}</p>
                <Button className="onboarding-welcome-cta" fullWidth size="lg" onClick={() => void handleAdvanceToInstall()}>
                  {copy.begin}
                </Button>
                <p className="onboarding-welcome-timing">{copy.welcomeTiming}</p>
              </div>
            ) : null}

            {currentStep === "install" ? (
              <div className="onboarding-step onboarding-step--install onboarding-step--install-figma">
                <div className="onboarding-step__intro onboarding-step__intro--welcome">
                  <h2>{copy.installTitle}</h2>
                  <p>{copy.installBody}</p>
                </div>

                {installViewState.kind === "installing" ? (
                  <div className="onboarding-install-progress">
                    <div className="onboarding-install-progress__icon">
                      <Server size={42} />
                    </div>
                    <strong>{copy.installInstallingTitle}</strong>
                    <p>{copy.installInstallingBody}</p>
                    <div className="onboarding-install-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(installViewState.progressPercent ?? 16)}>
                      <Progress value={installViewState.progressPercent ?? 16} />
                    </div>
                    <span className="onboarding-install-progress__stage">{installViewState.stageLabel}</span>
                  </div>
                ) : (
                  <>
                    <div
                      className={`onboarding-install-status onboarding-install-status--${
                        installViewState.kind === "missing" ? "warning" : "success"
                      }`}
                    >
                      <div className="onboarding-install-status__icon">
                        {installViewState.kind === "missing" ? <AlertCircle size={28} /> : <CheckCircle2 size={28} />}
                      </div>
                      <div className="onboarding-install-status__copy">
                        <strong>
                          {installViewState.kind === "missing"
                            ? copy.installNotFoundTitle
                            : installViewState.kind === "found"
                              ? copy.installFoundTitle
                              : copy.installCompleteTitle}
                        </strong>
                        <p>
                          {installViewState.kind === "missing"
                            ? copy.installNotFoundBody
                            : installViewState.kind === "found"
                              ? copy.installFoundBody
                              : copy.installCompleteBody}
                        </p>
                        {installViewState.version ? (
                          <span className="onboarding-install-status__version">
                            {copy.installVersionLabel}: {installViewState.version}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {installViewState.kind === "missing" ? (
                      <Button className="onboarding-install-cta" fullWidth size="lg" onClick={() => void handleInstall()}>
                        <span className="onboarding-install-button__content">
                          <Download size={18} />
                          <span>{copy.installCta}</span>
                        </span>
                      </Button>
                    ) : null}

                    {installViewState.kind === "found" ? (
                      <div className="onboarding-install-actions">
                        <Button className="onboarding-install-cta" fullWidth size="lg" onClick={() => void handleUseExistingInstall()}>
                          {copy.installContinue}
                        </Button>
                        <button className="onboarding-install-back" onClick={() => void persistDraft({ currentStep: "welcome" })} type="button">
                          {common.back}
                        </button>
                      </div>
                    ) : null}

                    {installViewState.kind === "complete" ? (
                      <div className="onboarding-install-actions">
                        <Button className="onboarding-install-next" fullWidth size="lg" onClick={() => void handleAdvanceToPermissions()}>
                          {copy.installContinue}
                        </Button>
                        <button className="onboarding-install-back" onClick={() => void persistDraft({ currentStep: "welcome" })} type="button">
                          {common.back}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {currentStep === "permissions" ? (
              <div className="onboarding-step onboarding-step--install onboarding-step--install-figma">
                <div className="onboarding-step__intro onboarding-step__intro--welcome onboarding-step__intro--model">
                  <h2>{copy.permissionsTitle}</h2>
                  <p>{copy.permissionsBody}</p>
                </div>

                <div className="onboarding-install-status onboarding-install-status--success">
                  <div className="onboarding-install-status__icon">
                    <Info size={28} />
                  </div>
                  <div className="onboarding-install-status__copy">
                    <strong>{copy.permissionsNativeTitle}</strong>
                    <p>{copy.permissionsNativeBody}</p>
                  </div>
                </div>

                <div className="onboarding-install-actions">
                  <Button className="onboarding-install-next" fullWidth size="lg" onClick={() => void handleAdvanceToModel()}>
                    {copy.installContinue}
                  </Button>
                  <button className="onboarding-install-back" onClick={() => void persistDraft({ currentStep: "install" })} type="button">
                    {common.back}
                  </button>
                </div>
              </div>
            ) : null}

            {currentStep === "model" ? (
              <LoadingBlocker
                active={modelBusy !== ""}
                label={copy.modelTitle}
                description={copy.modelBody}
              >
                <div className="onboarding-step onboarding-step--model onboarding-step--model-figma">
                  <div className="onboarding-step__intro onboarding-step__intro--welcome onboarding-step__intro--model">
                    <h2>{copy.modelTitle}</h2>
                    <p>{copy.modelBody}</p>
                  </div>

                  {modelViewState.kind === "picker" ? (
                    <div className="onboarding-model-flow onboarding-model-flow--picker">
                      <div className="onboarding-provider-picker__header">
                        <p className="onboarding-provider-picker__hint">{copy.providerTitle}</p>
                      </div>
                      <div className="onboarding-provider-grid">
                        {modelPickerProviders.map((providerOption) => (
                          <button
                            className={`onboarding-select-card onboarding-select-card--provider onboarding-select-card--provider-figma ${onboardingProviderThemeClass(providerOption.theme)}`}
                            key={providerOption.id}
                            onClick={() => {
                              setProviderId(providerOption.id);
                              setMethodId(providerOption.authMethods[0]?.id ?? "");
                              setModelKey(providerOption.defaultModelKey);
                              setModelLabel(providerOption.label);
                              setModelValues({});
                              setModelSession(undefined);
                              setModelSessionInput("");
                            }}
                            type="button"
                          >
                            <div className="onboarding-provider-mark onboarding-provider-mark--figma">
                              <Brain size={22} />
                            </div>
                            <div className="onboarding-provider-copy onboarding-provider-copy--figma">
                              <strong>{providerOption.label}</strong>
                            </div>
                            <ArrowRight className="onboarding-provider-arrow" size={18} />
                          </button>
                        ))}
                      </div>
                      <div className="onboarding-model-actions onboarding-model-actions--picker">
                        <button className="onboarding-install-back" onClick={() => void persistDraft({ currentStep: "permissions" })} type="button">
                          {common.back}
                        </button>
                      </div>
                    </div>
                  ) : selectedProviderPresentation ? (
                    <div className={`onboarding-model-flow onboarding-model-flow--${modelViewState.kind}`}>
                      <div className={`onboarding-model-provider-banner ${onboardingProviderThemeClass(selectedProviderPresentation.theme)}`}>
                        <div className="onboarding-provider-mark onboarding-provider-mark--figma onboarding-provider-mark--banner">
                          <Brain size={22} />
                        </div>
                        <strong>{selectedProviderPresentation.label}</strong>
                      </div>

                      {modelViewState.kind === "configure" ? (
                        <>
                          {shouldShowAuthMethodChooser ? (
                            <div className="onboarding-model-connect">
                              <h3>{copy.authTitle}</h3>
                              <div
                                className={`onboarding-auth-method-grid ${
                                  selectedAuthMethods.length <= 1 ? "onboarding-auth-method-grid--single" : ""
                                }`}
                                role="group"
                                aria-label={copy.authTitle}
                              >
                                {selectedAuthMethods.map((method) => (
                                  <button
                                    type="button"
                                    key={method.id}
                                    className={`onboarding-auth-method-card onboarding-auth-method-card--figma ${
                                      methodId === method.id ? "onboarding-auth-method-card--active" : ""
                                    }`}
                                    onClick={() => {
                                      setMethodId(method.id);
                                      setModelSession(undefined);
                                      setModelSessionInput("");
                                    }}
                                  >
                                    <div className="onboarding-auth-method-card__icon">{onboardingAuthMethodIcon(method)}</div>
                                    <strong>{onboardingAuthMethodLabel(copy, method)}</strong>
                                    <p>{onboardingAuthMethodBody(copy, method)}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {selectedSetupVariant === "oauth" ? (
                            <div className="onboarding-model-form">
                              {modelSession?.message ? <p className="onboarding-model-input-help">{modelSession.message}</p> : null}
                              {modelSession?.launchUrl ? (
                                <Button
                                  variant="outline"
                                  fullWidth
                                  onClick={() => window.open(modelSession.launchUrl, "_blank", "noopener,noreferrer")}
                                >
                                  <ExternalLink size={16} />
                                  {copy.openAuthWindow}
                                </Button>
                              ) : null}
                              {modelSession?.status === "awaiting-input" ? (
                                <>
                                  <div className="onboarding-model-field">
                                    <FieldLabel htmlFor="onboarding-model-session-input">
                                      {modelSession.inputPrompt ?? copy.submitAuthInput}
                                    </FieldLabel>
                                    <Input
                                      id="onboarding-model-session-input"
                                      value={modelSessionInput}
                                      onChange={(event) => setModelSessionInput(event.target.value)}
                                      placeholder={modelSession.inputPrompt ?? copy.submitAuthInput}
                                    />
                                  </div>
                                  <Button
                                    fullWidth
                                    loading={modelBusy === "input"}
                                    onClick={() => void handleModelSessionInput()}
                                    disabled={!modelSessionInput.trim()}
                                  >
                                    {copy.submitAuthInput}
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          ) : selectedSetupVariant === "guided-minimax-api-key" ? (
                            <div className="onboarding-model-guided">
                              <div className="onboarding-model-guide-card onboarding-model-guide-card--tutorial">
                                <div className="onboarding-model-guide-card__header">
                                  <div className="onboarding-model-guide-step onboarding-model-guide-step--tutorial">1</div>
                                  <div className="onboarding-model-guide-card__copy">
                                    <strong>{copy.minimaxTutorialTitle}</strong>
                                    <p>{copy.minimaxTutorialBody}</p>
                                  </div>
                                  <button
                                    className="onboarding-model-guide-play"
                                    onClick={() => setModelTutorialOpen(true)}
                                    type="button"
                                    aria-label={copy.minimaxTutorialTitle}
                                  >
                                    <PlayCircle size={32} />
                                  </button>
                                </div>
                              </div>

                              <div className="onboarding-model-guide-card onboarding-model-guide-card--get-key">
                                <div className="onboarding-model-guide-card__header onboarding-model-guide-card__header--stacked">
                                  <div className="onboarding-model-guide-step onboarding-model-guide-step--get-key">2</div>
                                  <div className="onboarding-model-guide-card__copy">
                                    <strong>{copy.minimaxGetKeyTitle}</strong>
                                    <p>{copy.minimaxGetKeyBody}</p>
                                  </div>
                                </div>
                                <button
                                  className="onboarding-model-guide-cta"
                                  onClick={() => window.open(selectedProviderPresentation.platformUrl, "_blank", "noopener,noreferrer")}
                                  type="button"
                                >
                                  <ExternalLink size={18} />
                                  {copy.minimaxGetKeyCTA}
                                  <ArrowRight size={18} />
                                </button>
                              </div>

                              <div className="onboarding-model-guide-card onboarding-model-guide-card--input">
                                <div className="onboarding-model-guide-card__header onboarding-model-guide-card__header--stacked">
                                  <div className="onboarding-model-guide-step onboarding-model-guide-step--input">3</div>
                                  <div className="onboarding-model-guide-card__copy">
                                    <strong>{copy.minimaxEnterKeyTitle}</strong>
                                    <p>{copy.minimaxEnterKeyBody}</p>
                                  </div>
                                </div>
                                <div className="onboarding-model-field onboarding-model-field--guided">
                                  {(selectedMethod?.fields ?? []).map((field, index) => (
                                    <Input
                                      key={field.id}
                                      id={index === 0 ? "onboarding-model-api-key" : `onboarding-model-api-key-${field.id}`}
                                      type={field.secret ? "password" : "text"}
                                      value={onboardingFieldValue(modelValues, field.id)}
                                      onChange={(event) =>
                                        setModelValues((current) => ({
                                          ...current,
                                          [field.id]: event.target.value
                                        }))
                                      }
                                      placeholder={field.placeholder ?? copy.modelApiKeyPlaceholder}
                                    />
                                  ))}
                                  <p className="onboarding-model-input-help onboarding-model-input-help--guided">{copy.modelApiKeyHelp}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="onboarding-model-form">
                              <div className="onboarding-model-field">
                                <FieldLabel htmlFor="onboarding-model-api-key">{copy.modelApiKeyTitle}</FieldLabel>
                                {(selectedMethod?.fields ?? []).map((field, index) => (
                                  <Input
                                    key={field.id}
                                    id={index === 0 ? "onboarding-model-api-key" : `onboarding-model-api-key-${field.id}`}
                                    type={field.secret ? "password" : "text"}
                                    value={onboardingFieldValue(modelValues, field.id)}
                                    onChange={(event) =>
                                      setModelValues((current) => ({
                                        ...current,
                                        [field.id]: event.target.value
                                      }))
                                    }
                                    placeholder={field.placeholder ?? copy.modelApiKeyPlaceholder}
                                  />
                                ))}
                                <p className="onboarding-model-input-help">{copy.modelApiKeyHelp}</p>
                              </div>

                              {selectedProviderPresentation.platformUrl ? (
                                <Button
                                  variant="outline"
                                  fullWidth
                                  onClick={() => window.open(selectedProviderPresentation.platformUrl, "_blank", "noopener,noreferrer")}
                                >
                                  <ExternalLink size={16} />
                                  {copy.modelGetApiKey}
                                </Button>
                              ) : null}
                            </div>
                          )}

                          <div className="onboarding-model-actions">
                              <Button variant="outline" fullWidth onClick={() => void handleReturnToModelPicker()}>
                                {common.back}
                              </Button>
                              <Button
                                fullWidth
                                onClick={() => void handleSaveModel()}
                                disabled={!selectedProviderPresentation || !selectedMethod || !modelKey.trim() || requiredModelFieldsMissing(selectedMethod, modelValues)}
                                loading={modelBusy === "save"}
                              >
                              {copy.modelSave}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="onboarding-model-success">
                            <div className="onboarding-model-success__icon">
                              <CheckCircle2 size={28} />
                            </div>
                            <div>
                              <strong>{copy.modelConnectedTitle}</strong>
                              <p>{copy.modelConnectedBody.replace("{provider}", selectedProviderPresentation.label)}</p>
                            </div>
                          </div>
                          <div className="onboarding-model-actions onboarding-model-actions--connected">
                            <Button className="onboarding-install-next" fullWidth size="lg" onClick={() => void handleAdvanceToChannel()}>
                              {common.next}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "channel" ? (
              <LoadingBlocker
                active={!channelConfig}
                label={copy.channelTitle}
                description={copy.channelBody}
              >
                <div className="onboarding-step onboarding-step--channel onboarding-step--channel-figma">
                  <div className="onboarding-step__intro onboarding-step__intro--welcome onboarding-step__intro--model">
                    <h2>{copy.channelTitle}</h2>
                    <p>{copy.channelBody}</p>
                  </div>

                  {!selectedChannelPresentation ? (
                    <div className="onboarding-model-flow onboarding-model-flow--picker">
                      <div className="onboarding-provider-picker__header">
                        <p className="onboarding-provider-picker__hint">{copy.channelPickerHint}</p>
                      </div>
                      <div className="onboarding-provider-grid">
                        {channelPickerChannels.map((channel) => (
                          <button
                            className={`onboarding-select-card onboarding-select-card--provider onboarding-select-card--provider-figma ${onboardingChannelThemeClass(channel.theme)}`}
                            key={channel.id}
                            onClick={() => setSelectedChannelId(channel.id)}
                            type="button"
                          >
                            <div className="onboarding-provider-mark onboarding-provider-mark--figma">
                              {channelIcon(channel.id)}
                            </div>
                            <div className="onboarding-provider-copy onboarding-provider-copy--figma onboarding-provider-copy--channel">
                              <strong>{channel.label}</strong>
                              {channel.secondaryLabel ? <span>{channel.secondaryLabel}</span> : null}
                            </div>
                            <ChevronRight className="onboarding-provider-arrow" size={18} />
                          </button>
                        ))}
                      </div>
                      <div className="onboarding-model-actions onboarding-model-actions--picker">
                        <button className="onboarding-install-back" onClick={() => void handleBackFromChannelPicker()} type="button">
                          {common.back}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="onboarding-model-flow onboarding-model-flow--configure">
                      <div className={`onboarding-model-provider-banner ${onboardingChannelThemeClass(selectedChannelPresentation.theme)}`}>
                        <div className="onboarding-provider-mark onboarding-provider-mark--figma onboarding-provider-mark--banner">
                          {channelIcon(selectedChannelPresentation.id)}
                        </div>
                        <div className="onboarding-provider-copy onboarding-provider-copy--figma onboarding-provider-copy--channel-banner">
                          <strong>{selectedChannelPresentation.label}</strong>
                          {selectedChannelPresentation.secondaryLabel ? <span>{selectedChannelPresentation.secondaryLabel}</span> : null}
                        </div>
                      </div>

                      {selectedChannelSetupVariant === "wechat-work-guided" ? (
                        <>
                          <div className="onboarding-channel-docs-card onboarding-channel-docs-card--wechat">
                            <div className="onboarding-channel-docs-card__header">
                              <div className="onboarding-channel-docs-card__icon">
                                <Info size={22} />
                              </div>
                              <strong>{copy.channelWechatInstructionsTitle}</strong>
                            </div>
                            <ol className="onboarding-channel-docs-card__steps">
                              {copy.channelWechatInstructionSteps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                            <button
                              className="onboarding-channel-docs-card__cta"
                              onClick={() => window.open(selectedChannelPresentation.docsUrl, "_blank", "noopener,noreferrer")}
                              type="button"
                            >
                              <ExternalLink size={18} />
                              {copy.channelDocumentationCta}
                            </button>
                          </div>

                          <div className="onboarding-channel-form-card onboarding-channel-form-card--wechat">
                            <div className="field-grid">
                              <div>
                                <FieldLabel htmlFor="channel-botId">{copy.channelWechatAgentId}</FieldLabel>
                                <Input
                                  id="channel-botId"
                                  value={onboardingFieldValue(channelValues, "botId")}
                                  onChange={(event) => setChannelValues((current) => ({ ...current, botId: event.target.value }))}
                                  placeholder="1000002"
                                />
                              </div>
                              <div>
                                <FieldLabel htmlFor="channel-secret">{copy.channelWechatSecret}</FieldLabel>
                                <Input
                                  id="channel-secret"
                                  type="password"
                                  value={onboardingFieldValue(channelValues, "secret")}
                                  onChange={(event) => setChannelValues((current) => ({ ...current, secret: event.target.value }))}
                                  placeholder="••••••••••••"
                                />
                              </div>
                            </div>
                            <p className="onboarding-channel-secret-help">{copy.channelSecretHelp}</p>
                          </div>
                        </>
                      ) : null}

                      {selectedChannelSetupVariant === "wechat-guided" ? (
                        <div className="onboarding-channel-docs-card onboarding-channel-docs-card--wechat">
                          <div className="onboarding-channel-docs-card__header">
                            <div className="onboarding-channel-docs-card__icon">
                              <Info size={22} />
                            </div>
                            <strong>{selectedChannelPresentation.label}</strong>
                          </div>
                          <p className="card__description">
                            ChillClaw will run the personal WeChat installer and keep the QR-first session log here. Start
                            the login flow, scan the QR code on your phone, and keep this step open until the installer finishes.
                          </p>
                        </div>
                      ) : null}

                      {selectedChannelSetupVariant === "telegram-guided" ? (
                        <>
                          <div className="onboarding-channel-docs-card onboarding-channel-docs-card--telegram">
                            <div className="onboarding-channel-docs-card__header">
                              <div className="onboarding-channel-docs-card__icon">
                                <Info size={22} />
                              </div>
                              <strong>{copy.channelTelegramInstructionsTitle}</strong>
                            </div>
                            <ol className="onboarding-channel-docs-card__steps">
                              {copy.channelTelegramInstructionSteps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                            <button
                              className="onboarding-channel-docs-card__cta"
                              onClick={() => window.open(selectedChannelPresentation.docsUrl, "_blank", "noopener,noreferrer")}
                              type="button"
                            >
                              <ExternalLink size={18} />
                              {copy.channelDocumentationCta}
                            </button>
                          </div>

                          <div className="onboarding-channel-form-card onboarding-channel-form-card--telegram">
                            <div className="field-grid">
                              <div>
                                <FieldLabel htmlFor="channel-token">{copy.channelTelegramToken}</FieldLabel>
                                <Input
                                  id="channel-token"
                                  type="password"
                                  value={onboardingFieldValue(channelValues, "token")}
                                  onChange={(event) => setChannelValues((current) => ({ ...current, token: event.target.value }))}
                                  placeholder="123456:ABC-DEF..."
                                />
                              </div>
                            </div>
                            <p className="onboarding-channel-secret-help">{copy.channelSecretHelp}</p>
                          </div>
                        </>
                      ) : null}

                      {selectedChannelSetupVariant === "feishu-guided" ? (
                        <>
                          <div className="onboarding-model-guided">
                            <div className="onboarding-model-guide-card onboarding-model-guide-card--tutorial">
                              <div className="onboarding-model-guide-card__header">
                                <div className="onboarding-model-guide-step onboarding-model-guide-step--tutorial">1</div>
                                <div className="onboarding-model-guide-card__copy">
                                  <strong>{copy.channelFeishuTutorialTitle}</strong>
                                  <p>{copy.channelFeishuTutorialBody}</p>
                                </div>
                                <button
                                  className="onboarding-model-guide-play"
                                  onClick={() => setChannelTutorialOpen(true)}
                                  type="button"
                                  aria-label={copy.channelFeishuTutorialTitle}
                                >
                                  <PlayCircle size={32} />
                                </button>
                              </div>
                            </div>

                            <div className="onboarding-model-guide-card onboarding-model-guide-card--get-key">
                              <div className="onboarding-model-guide-card__header onboarding-model-guide-card__header--stacked">
                                <div className="onboarding-model-guide-step onboarding-model-guide-step--get-key">2</div>
                                <div className="onboarding-model-guide-card__copy">
                                  <strong>{copy.channelFeishuPlatformTitle}</strong>
                                  <p>{copy.channelFeishuPlatformBody}</p>
                                </div>
                              </div>
                              <button
                                className="onboarding-model-guide-cta"
                                onClick={() => window.open(selectedChannelPresentation.platformUrl, "_blank", "noopener,noreferrer")}
                                type="button"
                              >
                                <ExternalLink size={18} />
                                {copy.channelPlatformCta}
                                <ArrowRight size={18} />
                              </button>
                            </div>

                            <div className="onboarding-model-guide-card onboarding-model-guide-card--input">
                              <div className="onboarding-model-guide-card__header onboarding-model-guide-card__header--stacked">
                                <div className="onboarding-model-guide-step onboarding-model-guide-step--input">3</div>
                                <div className="onboarding-model-guide-card__copy">
                                  <strong>{copy.channelFeishuCredentialsTitle}</strong>
                                  <p>{copy.channelFeishuCredentialsBody}</p>
                                </div>
                              </div>
                              <div className="field-grid">
                                <div>
                                  <FieldLabel htmlFor="channel-appId">{copy.channelFeishuAppId}</FieldLabel>
                                  <Input
                                    id="channel-appId"
                                    value={onboardingFieldValue(channelValues, "appId")}
                                    onChange={(event) => setChannelValues((current) => ({ ...current, appId: event.target.value }))}
                                    placeholder="cli_..."
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor="channel-appSecret">{copy.channelFeishuAppSecret}</FieldLabel>
                                  <Input
                                    id="channel-appSecret"
                                    type="password"
                                    value={onboardingFieldValue(channelValues, "appSecret")}
                                    onChange={(event) => setChannelValues((current) => ({ ...current, appSecret: event.target.value }))}
                                    placeholder="••••••••••••"
                                  />
                                </div>
                              </div>
                              <p className="onboarding-channel-secret-help">{copy.channelSecretHelp}</p>
                            </div>
                          </div>
                        </>
                      ) : null}

                      {channelMessage ? <div className="onboarding-inline-note">{channelMessage}</div> : null}
                      {activeChannelSession ? (
                        <div className="onboarding-channel-form-card onboarding-channel-form-card--wechat">
                          <div className="onboarding-channel-docs-card__header">
                            <div className="onboarding-channel-docs-card__icon">
                              <MessageSquare size={22} />
                            </div>
                            <strong>Active channel session</strong>
                          </div>
                          <p className="card__description">{activeChannelSession.message}</p>
                          <Textarea readOnly value={activeChannelSession.logs.join("\n")} />
                          {activeChannelSession.inputPrompt ? (
                            <div className="field-grid">
                              <div>
                                <FieldLabel htmlFor="channel-session-input">{activeChannelSession.inputPrompt}</FieldLabel>
                                <Input
                                  id="channel-session-input"
                                  value={channelSessionInput}
                                  onChange={(event) => setChannelSessionInput(event.target.value)}
                                  placeholder="Paste the follow-up input from the installer"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {channelRequiresApply ? (
                        <div className="onboarding-inline-note onboarding-inline-note--warning">
                          <strong>{copy.pendingApplyTitle}</strong>
                          <span>{copy.channelApplyHint}</span>
                        </div>
                      ) : null}

                      <div className="onboarding-model-actions">
                        <Button variant="outline" fullWidth onClick={() => void handleReturnToChannelPicker()}>
                          {common.back}
                        </Button>
                        <Button
                          fullWidth
                          onClick={() =>
                            void (activeChannelSession?.inputPrompt
                              ? handleChannelSessionInput()
                              : handleSaveChannel())
                          }
                          disabled={
                            channelBusy || (activeChannelSession?.inputPrompt
                              ? !channelSessionInput.trim()
                              : requiredChannelSetupFieldsMissing(selectedChannelSetupVariant, channelValues))
                          }
                          loading={channelBusy}
                        >
                          {activeChannelSession?.inputPrompt
                            ? "Submit Session Input"
                            : selectedChannelSetupVariant === "wechat-guided"
                              ? activeChannelSession
                                ? "Restart WeChat Login"
                                : "Start WeChat Login"
                              : copy.channelSaveContinue}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </LoadingBlocker>
            ) : null}

            {currentStep === "employee" ? (
              <LoadingBlocker
                active={!teamOverview}
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
                        {ONBOARDING_AVATAR_PRESETS.map((preset) => {
                          const imageSrc = memberAvatarImageSrc({ presetId: preset.id });

                          return (
                            <button
                              className={`onboarding-avatar-card${employeeAvatarPresetId === preset.id ? " onboarding-avatar-card--active" : ""}`}
                              key={preset.id}
                              onClick={() => setEmployeeAvatarPresetId(preset.id)}
                              type="button"
                            >
                              <div className="onboarding-avatar-card__avatar" aria-label={preset.label}>
                                {imageSrc ? (
                                  <img alt={preset.label} className="member-avatar-image" src={imageSrc} />
                                ) : (
                                  <span className="member-avatar-fallback">{preset.emoji}</span>
                                )}
                              </div>
                              <span>{preset.label}</span>
                            </button>
                          );
                        })}
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
                        <strong>{copy.skillsTitle}</strong>
                        <div className="onboarding-employee-preset-grid">
                          {employeePresets.map((preset) => {
                            const readiness = employeePresetReadinessById.get(preset.id);
                            const readinessTone =
                              readiness?.status === "ready"
                                ? "success"
                                : readiness?.status === "repair"
                                  ? "warning"
                                  : readiness?.status === "syncing"
                                    ? "info"
                                    : "neutral";

                            return (
                              <button
                                className={`onboarding-select-card onboarding-select-card--employee-preset ${selectedEmployeePreset?.id === preset.id ? "onboarding-select-card--active" : ""} onboarding-employee-preset onboarding-employee-preset--${preset.theme}`}
                                key={preset.id}
                                onClick={() => selectEmployeePreset(preset.id)}
                                type="button"
                              >
                                <div className="onboarding-employee-preset__head">
                                  <div className="onboarding-provider-mark onboarding-provider-mark--employee-preset">
                                    {preset.theme === "analyst" ? <Brain size={24} strokeWidth={2.2} /> : null}
                                    {preset.theme === "support" ? <Users size={24} strokeWidth={2.2} /> : null}
                                    {preset.theme === "operator" ? <Rocket size={24} strokeWidth={2.2} /> : null}
                                  </div>
                                  <div className="onboarding-provider-copy onboarding-provider-copy--employee-preset">
                                    <strong>{preset.label}</strong>
                                    <span>{preset.description}</span>
                                  </div>
                                </div>
                                <div className="actions-row onboarding-employee-preset__chips">
                                  {readiness ? <StatusBadge tone={readinessTone}>{readiness.label}</StatusBadge> : null}
                                  {preset.starterSkillLabels.slice(0, 1).map((label) => (
                                    <Badge key={label} tone="success">{label}</Badge>
                                  ))}
                                  {preset.toolLabels.slice(0, 1).map((label) => (
                                    <Badge key={label} tone="neutral">{label}</Badge>
                                  ))}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="onboarding-panel">
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
                          {memberAvatarImageSrc({ presetId: selectedEmployeeAvatar.id }) ? (
                            <div className="onboarding-preview-card__avatar">
                              <img
                                alt={employeeName || selectedEmployeeAvatar.label}
                                className="member-avatar-image"
                                src={memberAvatarImageSrc({ presetId: selectedEmployeeAvatar.id })}
                              />
                            </div>
                          ) : (
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
                          )}
                          <div>
                            <strong>{employeeName || "Alex Morgan"}</strong>
                            <p>{employeeJobTitle || "Senior Research Analyst"}</p>
                          </div>
                        </div>
                        <div className="actions-row onboarding-preview-card__chips">
                          {selectedEmployeePresetReadiness ? (
                            <StatusBadge
                              tone={
                                selectedEmployeePresetReadiness.status === "ready"
                                  ? "success"
                                  : selectedEmployeePresetReadiness.status === "repair"
                                    ? "warning"
                                    : selectedEmployeePresetReadiness.status === "syncing"
                                      ? "info"
                                      : "neutral"
                              }
                            >
                              {selectedEmployeePresetReadiness.label}
                            </StatusBadge>
                          ) : null}
                          {selectedEmployeePreset?.starterSkillLabels.slice(0, 2).map((label) => (
                            <Badge key={label} tone="success">{label}</Badge>
                          ))}
                          {selectedEmployeePreset?.toolLabels.slice(0, 2).map((label) => (
                            <Badge key={label} tone="neutral">{label}</Badge>
                          ))}
                        </div>
                        <p className="card__description">
                          {selectedModelEntry?.label ?? selectedModelEntry?.modelKey ?? "Default onboarding model"}
                        </p>
                        {selectedEmployeePresetReadiness?.detail ? (
                          <p className="card__description">{selectedEmployeePresetReadiness.detail}</p>
                        ) : null}
                      </div>

                      <div className="onboarding-actions">
                        <Button variant="outline" onClick={() => void persistDraft({ currentStep: "channel" })}>
                          {common.back}
                        </Button>
                        <Button
                          onClick={() => void handleCreateEmployee()}
                          disabled={
                            !selectedBrainEntryId ||
                            !selectedEmployeePreset ||
                            !employeeName.trim() ||
                            !employeeJobTitle.trim() ||
                            Boolean(selectedEmployeePresetReadiness?.blocking)
                          }
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

        <Dialog
          open={modelTutorialOpen}
          onClose={() => setModelTutorialOpen(false)}
          title={copy.minimaxTutorialModalTitle}
          description={copy.minimaxTutorialModalBody}
          wide
        >
          <div className="onboarding-tutorial-modal">
            <div className="onboarding-tutorial-modal__frame">
              {selectedProviderPresentation?.tutorialVideoUrl ? (
                <iframe
                  className="onboarding-tutorial-modal__iframe"
                  src={selectedProviderPresentation.tutorialVideoUrl}
                  title={copy.minimaxTutorialModalTitle}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="onboarding-tutorial-modal__fallback">
                  <PlayCircle size={88} strokeWidth={1.5} />
                  <strong>{copy.minimaxTutorialFallbackTitle}</strong>
                  <p>{copy.minimaxTutorialFallbackBody}</p>
                </div>
              )}
            </div>
            <Button fullWidth onClick={() => setModelTutorialOpen(false)}>
              {copy.minimaxTutorialClose}
            </Button>
          </div>
        </Dialog>
        <Dialog
          open={channelTutorialOpen}
          onClose={() => setChannelTutorialOpen(false)}
          title={copy.channelTutorialModalTitle}
          description={copy.channelTutorialModalBody}
          wide
        >
          <div className="onboarding-tutorial-modal">
            <div className="onboarding-tutorial-modal__frame">
              {selectedChannelPresentation?.tutorialVideoUrl ? (
                <iframe
                  className="onboarding-tutorial-modal__iframe"
                  src={selectedChannelPresentation.tutorialVideoUrl}
                  title={copy.channelTutorialModalTitle}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="onboarding-tutorial-modal__fallback">
                  <PlayCircle size={88} strokeWidth={1.5} />
                  <strong>{copy.channelTutorialFallbackTitle}</strong>
                  <p>{copy.channelTutorialFallbackBody}</p>
                </div>
              )}
            </div>
            <Button fullWidth onClick={() => setChannelTutorialOpen(false)}>
              {copy.channelTutorialClose}
            </Button>
          </div>
        </Dialog>
      </GuidedFlowScaffold>
    </div>
  );
}
