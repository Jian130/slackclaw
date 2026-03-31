import {
  Briefcase,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type {
  ChannelCapability,
  ChannelConfigOverview,
  ConfiguredChannelEntry,
  ModelAuthSessionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  SavedModelEntry
} from "@chillclaw/contracts";

import {
  createChannelEntry,
  createSavedModelEntry,
  fetchChannelConfig,
  fetchModelConfig,
  removeSavedModelEntry,
  removeChannelEntry,
  replaceFallbackModelEntries,
  setDefaultModelEntry,
  updateSavedModelEntry,
  updateChannelEntry,
  submitModelAuthSessionInput
} from "../../shared/api/client.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { FieldLabel, Input, Select, Textarea } from "../../shared/ui/Field.js";
import { InfoBanner } from "../../shared/ui/InfoBanner.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/Tabs.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { ProviderLogo, providerFallbackGlyph } from "../../shared/ui/ProviderLogo.js";

const feishuScopes = `{
  "scopes": {
    "tenant": [
      "aily:file:read",
      "aily:file:write",
      "application:application.app_message_stats.overview:readonly",
      "application:application:self_manage",
      "application:bot.menu:write",
      "cardkit:card:read",
      "cardkit:card:write",
      "contact:user.employee_id:readonly",
      "corehr:file:download",
      "event:ip_list",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:chat.members:bot_access",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource"
    ],
    "user": ["aily:file:read", "aily:file:write", "im:chat.access_event.bot_p2p_chat:read"]
  }
}`;

export const feishuGuideSteps = [
  "Open Feishu Open Platform and create an enterprise app for this workspace.",
  "Copy the App ID and App Secret, then paste them into ChillClaw.",
  "Batch-import the required scopes and confirm the bot capability is enabled for the app.",
  "Use Prepare in ChillClaw first so OpenClaw can verify the Feishu plugin is ready.",
  "In Feishu event subscriptions, switch delivery to long connection and enable the message receive event OpenClaw expects.",
  "Publish the app after permissions and event settings are finished.",
  "Save the credentials here, send the bot a direct message, then approve the pairing code in ChillClaw.",
  "If your tenant uses Lark instead of Feishu, change the Domain field to lark before saving."
] as const;

export const feishuDirectLinks = [
  {
    label: "Open Feishu Open Platform",
    url: "https://open.feishu.cn/app"
  },
  {
    label: "Open Lark Open Platform",
    url: "https://open.larksuite.com/app"
  },
  {
    label: "Open official Feishu guide",
    url: "https://docs.openclaw.ai/channels/feishu"
  }
] as const;

export function channelStatusTone(status: ConfiguredChannelEntry["status"] | undefined) {
  if (status === "completed" || status === "ready") {
    return "success" as const;
  }

  if (status === "failed") {
    return "warning" as const;
  }

  if (status === "awaiting-pairing" || status === "in-progress") {
    return "info" as const;
  }

  return "neutral" as const;
}

export function ChannelStatusBadge(props: { status: ConfiguredChannelEntry["status"] | undefined }) {
  return <StatusBadge tone={channelStatusTone(props.status)}>{props.status ?? "pending"}</StatusBadge>;
}

export function channelIcon(channelId: string) {
  const icons: Record<string, string> = {
    telegram: "TG",
    whatsapp: "WA",
    feishu: "飞",
    "wechat-work": "WC",
    wechat: "WX"
  };

  return icons[channelId] ?? channelId.slice(0, 2).toUpperCase();
}

export function modelOptions(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) return [];
  const providerModels = modelConfig.models.filter((model) =>
    provider.providerRefs.some((ref) => model.key.startsWith(`${ref.replace(/\/$/, "")}/`))
  );

  if (providerModels.length > 0) {
    return providerModels;
  }

  return providerDisplayModels(provider).map((modelKey) => ({
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

  return providerDisplayModels(provider)[0] ?? `${provider.providerRefs[0]?.replace(/\/?$/, "/") ?? ""}model-name`;
}

export type ProviderGuidanceGroup = {
  id: string;
  label: string;
  items: string[];
  tone: "neutral" | "warning";
  format: "code" | "text";
};

export function providerTypeLabel(providerType: ModelProviderConfig["providerType"] | undefined) {
  if (providerType === "built-in") {
    return "Built-in provider";
  }

  if (providerType === "gateway") {
    return "Gateway / router";
  }

  if (providerType === "local") {
    return "Local runtime";
  }

  if (providerType === "custom") {
    return "Custom endpoint";
  }

  if (providerType === "community") {
    return "Community integration";
  }

  return undefined;
}

export function providerDisplayModels(provider: ModelProviderConfig | undefined) {
  if (!provider) {
    return [];
  }

  if (provider.exampleModels?.length) {
    return provider.exampleModels;
  }

  return provider.sampleModels;
}

export function providerGuidanceGroups(provider: ModelProviderConfig | undefined): ProviderGuidanceGroup[] {
  if (!provider) {
    return [];
  }

  const groups: ProviderGuidanceGroup[] = [];
  const providerType = providerTypeLabel(provider.providerType);
  const exampleModels = providerDisplayModels(provider);
  const setupItems = [...(provider.setupNotes ?? [])];

  if (provider.supportsNoAuth) {
    setupItems.unshift("No provider credentials required for local mode.");
  }

  if (providerType) {
    groups.push({
      id: "type",
      label: "Provider type",
      items: [providerType],
      tone: "neutral",
      format: "text"
    });
  }

  if (exampleModels.length) {
    groups.push({
      id: "models",
      label: provider.exampleModels?.length ? "Example models" : "Runtime examples",
      items: exampleModels,
      tone: "neutral",
      format: "code"
    });
  }

  if (provider.authEnvVars?.length) {
    groups.push({
      id: "env",
      label: "Auth env",
      items: provider.authEnvVars,
      tone: "neutral",
      format: "code"
    });
  }

  if (setupItems.length) {
    groups.push({
      id: "setup",
      label: "Setup notes",
      items: setupItems,
      tone: "neutral",
      format: "text"
    });
  }

  if (provider.warnings?.length) {
    groups.push({
      id: "warnings",
      label: "Warnings",
      items: provider.warnings,
      tone: "warning",
      format: "text"
    });
  }

  return groups;
}

export function ProviderGuidance(props: { provider: ModelProviderConfig }) {
  const groups = providerGuidanceGroups(props.provider);

  if (!groups.length) {
    return null;
  }

  return (
    <div className="config-page__provider-guidance">
      {groups.map((group) => (
        <div
          className={`config-page__provider-group${group.tone === "warning" ? " config-page__provider-group--warning" : ""}`}
          key={group.id}
        >
          <span className="config-page__provider-group-label">{group.label}</span>
          <div className="config-page__provider-group-values">
            {group.items.map((item) =>
              group.format === "code" ? (
                <code className="config-page__provider-pill" key={item}>
                  {item}
                </code>
              ) : (
                <span className="config-page__provider-note" key={item}>
                  {item}
                </span>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function providerConfiguredModels(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) return [];
  return modelConfig.configuredModelKeys.filter((key) => provider.providerRefs.some((ref) => key.startsWith(ref)));
}

export function providerActiveModel(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) return undefined;
  if (modelConfig.defaultModel && provider.providerRefs.some((ref) => modelConfig.defaultModel?.startsWith(ref))) {
    return modelConfig.defaultModel;
  }

  return providerConfiguredModels(modelConfig, provider)[0];
}

function fallbackOrder(model: ModelConfigOverview["models"][number]): number {
  const tag = model.tags.find((item) => item.startsWith("fallback#"));
  if (!tag) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = Number(tag.slice("fallback#".length));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function runtimeConfiguredModels(modelConfig: ModelConfigOverview | undefined) {
  if (!modelConfig) {
    return [];
  }

  return modelConfig.models
    .filter((model) => modelConfig.configuredModelKeys.includes(model.key))
    .sort((left, right) => {
      if (left.key === modelConfig.defaultModel) return -1;
      if (right.key === modelConfig.defaultModel) return 1;

      const fallbackDelta = fallbackOrder(left) - fallbackOrder(right);
      if (fallbackDelta !== 0) {
        return fallbackDelta;
      }

      return left.key.localeCompare(right.key);
    });
}

export function activeSavedModelEntries(
  savedEntries: SavedModelEntry[],
  runtimeModels: Array<{ key: string }>
) {
  const runtimeKeys = new Set(runtimeModels.map((model) => model.key));
  return savedEntries.filter((entry) => runtimeKeys.has(entry.modelKey));
}

export function runtimeDerivedModelEntry(
  savedEntries: SavedModelEntry[],
  modelKey: string
) {
  return savedEntries.find((entry) => entry.id.startsWith("runtime:") && entry.modelKey === modelKey);
}

export const providerIcon = providerFallbackGlyph;
export const MODEL_KEY_CUSTOM_OPTION = "__custom_model_key__";

export function modelSelectValue(
  models: Array<{ key: string }>,
  modelKey: string
) {
  if (!modelKey) {
    return models[0]?.key ?? MODEL_KEY_CUSTOM_OPTION;
  }

  return models.some((item) => item.key === modelKey) ? modelKey : MODEL_KEY_CUSTOM_OPTION;
}

export function entryAuthLabel(entry: Pick<SavedModelEntry, "authModeLabel" | "authMethodId">): string | undefined {
  if (entry.authModeLabel) {
    return entry.authModeLabel;
  }

  if (entry.authMethodId?.includes("api-key")) {
    return "API key";
  }

  if (entry.authMethodId?.includes("oauth")) {
    return "OAuth";
  }

  return undefined;
}

export type ModelEntryRole = "normal" | "default" | "fallback";

export function resolveModelEntryRole(makeDefault: boolean, useAsFallback: boolean): ModelEntryRole {
  if (makeDefault) {
    return "default";
  }

  if (useAsFallback) {
    return "fallback";
  }

  return "normal";
}

export function applyModelEntryRole(role: ModelEntryRole): { makeDefault: boolean; useAsFallback: boolean } {
  return {
    makeDefault: role === "default",
    useAsFallback: role === "fallback"
  };
}

export function defaultModelEntryRole(liveConfiguredModelCount: number, initialEntry?: SavedModelEntry): ModelEntryRole {
  if (initialEntry) {
    return resolveModelEntryRole(Boolean(initialEntry.isDefault), Boolean(initialEntry.isFallback));
  }

  return liveConfiguredModelCount === 0 ? "default" : "normal";
}

export function validateModelEntryDraft(
  method: ModelProviderConfig["authMethods"][number] | undefined,
  values: Record<string, string>,
  role: ModelEntryRole
): string | undefined {
  if (role === "normal") {
    return undefined;
  }

  if (!method) {
    return "Choose an authentication method first.";
  }

  for (const field of method.fields) {
    const value = values[field.id]?.trim() ?? "";

    if (field.required && !value) {
      return `${field.label} is required.`;
    }

    const looksLikeApiKeyField = field.id.toLowerCase().includes("apikey") || field.label.toLowerCase().includes("api key");
    if (looksLikeApiKeyField && value) {
      if (/\s/.test(value)) {
        return `${field.label} cannot contain spaces.`;
      }

      if (value.length < 10) {
        return `${field.label} looks too short.`;
      }
    }
  }

  return undefined;
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(value);
}

export function configuredChannelActionState(
  entry: Pick<ConfiguredChannelEntry, "pairingRequired" | "status">,
  capability: Pick<ChannelCapability, "supportsPairing" | "supportsLogin"> | undefined
) {
  return {
    primaryAction: entry.pairingRequired || (capability?.supportsLogin && entry.status !== "completed") ? "continue-setup" : "edit",
    showApproveAction: Boolean(capability?.supportsPairing)
  } as const;
}

export function shouldCloseChannelDialogAfterAction(
  action: "save" | "prepare" | "login" | "approve-pairing",
  channelId: string,
  hasSession: boolean
) {
  if (hasSession) {
    return false;
  }

  if (action === "approve-pairing") {
    return true;
  }

  return action === "save" && channelId !== "whatsapp";
}

function ConfiguredChannelCardActions(props: {
  capability?: ChannelCapability;
  copy: Record<string, string>;
  entry: ConfiguredChannelEntry;
  busy: string;
  onEdit: () => void;
  onApprove: () => void;
  onRemove: () => void;
}) {
  const actionState = configuredChannelActionState(props.entry, props.capability);

  return (
    <div className="actions-row config-page__entry-actions">
      {actionState.showApproveAction ? (
        <Button onClick={props.onApprove} variant="outline">
          {props.copy.approvePairing}
        </Button>
      ) : null}
      <Button onClick={props.onEdit} variant="outline">
        {actionState.primaryAction === "continue-setup" ? props.copy.continueSetup : props.copy.editChannel}
      </Button>
      <Button loading={props.busy === `remove:${props.entry.id}`} onClick={props.onRemove} variant="danger">
        <Trash2 size={14} />
        {props.busy === `remove:${props.entry.id}` ? props.copy.removingChannel : props.copy.removeChannel}
      </Button>
    </div>
  );
}

type ConfigPalette = {
  accent: string;
  accentStrong: string;
  surface: string;
  surfaceStrong: string;
};

const defaultModelPalette: ConfigPalette = {
  accent: "#6366f1",
  accentStrong: "#4f46e5",
  surface: "#eef2ff",
  surfaceStrong: "#e0e7ff"
};

const modelPalettes: Record<string, ConfigPalette> = {
  openai: {
    accent: "#10b981",
    accentStrong: "#059669",
    surface: "#ecfdf5",
    surfaceStrong: "#d1fae5"
  },
  anthropic: {
    accent: "#f59e0b",
    accentStrong: "#d97706",
    surface: "#fffbeb",
    surfaceStrong: "#fef3c7"
  },
  google: {
    accent: "#3b82f6",
    accentStrong: "#2563eb",
    surface: "#eff6ff",
    surfaceStrong: "#dbeafe"
  },
  gemini: {
    accent: "#3b82f6",
    accentStrong: "#2563eb",
    surface: "#eff6ff",
    surfaceStrong: "#dbeafe"
  },
  github: {
    accent: "#475569",
    accentStrong: "#334155",
    surface: "#f8fafc",
    surfaceStrong: "#e2e8f0"
  },
  "github-copilot": {
    accent: "#7c3aed",
    accentStrong: "#6d28d9",
    surface: "#faf5ff",
    surfaceStrong: "#ede9fe"
  },
  minimax: {
    accent: "#ec4899",
    accentStrong: "#db2777",
    surface: "#fdf2f8",
    surfaceStrong: "#fce7f3"
  }
};

const defaultChannelPalette: ConfigPalette = {
  accent: "#14b8a6",
  accentStrong: "#0f766e",
  surface: "#ecfeff",
  surfaceStrong: "#ccfbf1"
};

const channelPalettes: Record<string, ConfigPalette> = {
  telegram: {
    accent: "#3b82f6",
    accentStrong: "#2563eb",
    surface: "#eff6ff",
    surfaceStrong: "#dbeafe"
  },
  whatsapp: {
    accent: "#16a34a",
    accentStrong: "#15803d",
    surface: "#f0fdf4",
    surfaceStrong: "#dcfce7"
  },
  feishu: {
    accent: "#14b8a6",
    accentStrong: "#0f766e",
    surface: "#ecfeff",
    surfaceStrong: "#ccfbf1"
  },
  wechat: {
    accent: "#22c55e",
    accentStrong: "#16a34a",
    surface: "#f0fdf4",
    surfaceStrong: "#dcfce7"
  },
  "wechat-work": {
    accent: "#0ea5e9",
    accentStrong: "#0284c7",
    surface: "#f0f9ff",
    surfaceStrong: "#e0f2fe"
  }
};

function paletteStyle(palette: ConfigPalette): CSSProperties {
  return {
    ["--config-accent" as string]: palette.accent,
    ["--config-accent-strong" as string]: palette.accentStrong,
    ["--config-surface" as string]: palette.surface,
    ["--config-surface-strong" as string]: palette.surfaceStrong
  } as CSSProperties;
}

function providerPalette(providerId: string): ConfigPalette {
  return modelPalettes[providerId] ?? defaultModelPalette;
}

function channelPalette(channelId: string): ConfigPalette {
  return channelPalettes[channelId] ?? defaultChannelPalette;
}

function channelVisualIcon(channelId: string) {
  const icons = {
    telegram: Send,
    whatsapp: MessageCircle,
    feishu: Sparkles,
    wechat: MessageCircle,
    "wechat-work": Briefcase
  };

  return icons[channelId as keyof typeof icons] ?? Radio;
}

function ConfigMetric(props: { label: string; value: ReactNode; tone?: "primary" | "success" }) {
  return (
    <div className={`config-page__metric${props.tone === "success" ? " config-page__metric--success" : ""}`}>
      <span className="config-page__metric-label">{props.label}</span>
      <strong className="config-page__metric-value">{props.value}</strong>
    </div>
  );
}

function ConfigAddCard(props: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="config-page__add-card" onClick={props.onClick} type="button">
      <span className="config-page__add-card-icon">
        <Plus size={20} />
      </span>
      <strong>{props.title}</strong>
      <span>{props.description}</span>
    </button>
  );
}

function ModelDialog(props: {
  open: boolean;
  onClose: () => void;
  modelConfig?: ModelConfigOverview;
  reloadModelConfig: (options?: { fresh?: boolean }) => Promise<ModelConfigOverview>;
  onModelConfigChange: (next: ModelConfigOverview) => void;
  initialEntry?: SavedModelEntry;
}) {
  const [providerId, setProviderId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [label, setLabel] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [session, setSession] = useState<ModelAuthSessionResponse["session"]>();
  const [sessionInput, setSessionInput] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "input">("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [useAsFallback, setUseAsFallback] = useState(false);

  const provider = props.modelConfig?.providers.find((item) => item.id === providerId);
  const method = provider?.authMethods.find((item) => item.id === methodId);
  const models = modelOptions(props.modelConfig, provider);
  const runtimeModels = useMemo(() => runtimeConfiguredModels(props.modelConfig), [props.modelConfig]);
  const selectedModelValue = modelSelectValue(models, modelKey);
  const showCustomModelInput = models.length === 0 || selectedModelValue === MODEL_KEY_CUSTOM_OPTION;
  const isEdit = Boolean(props.initialEntry);
  const validationError = validateModelEntryDraft(method, values, resolveModelEntryRole(makeDefault, useAsFallback));

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setProviderId(props.initialEntry?.providerId ?? "");
    setMethodId(props.initialEntry?.authMethodId ?? "");
    setModelKey(props.initialEntry?.modelKey ?? "");
    setLabel(props.initialEntry?.label ?? "");
    setValues({});
    setSession(undefined);
    setSessionInput("");
    const nextRole = defaultModelEntryRole(runtimeModels.length, props.initialEntry);
    const nextFlags = applyModelEntryRole(nextRole);
    setMakeDefault(nextFlags.makeDefault);
    setUseAsFallback(nextFlags.useAsFallback);
  }, [props.initialEntry, props.open, runtimeModels.length]);

  useEffect(() => {
    if (!props.open || !provider) {
      return;
    }

    setMethodId((current) => (current && provider.authMethods.some((item) => item.id === current) ? current : provider.authMethods[0]?.id ?? ""));
    setModelKey((current) => {
      if (current && models.some((item) => item.key === current)) {
        return current;
      }

      return props.initialEntry?.modelKey ?? providerActiveModel(props.modelConfig, provider) ?? providerDisplayModels(provider)[0] ?? models[0]?.key ?? "";
    });
  }, [models, props.initialEntry?.modelKey, props.modelConfig, props.open, provider]);

  async function handleSave() {
    if (!provider || !method) return;
    setBusy("save");
    try {
      const request = {
        label: label.trim() || `${provider.label} ${modelKey.split("/").pop() ?? modelKey}`,
        providerId,
        methodId,
        values,
        modelKey,
        makeDefault,
        useAsFallback
      };
      const response = props.initialEntry
        ? await updateSavedModelEntry(props.initialEntry!.id, request)
        : await createSavedModelEntry(request);

      props.onModelConfigChange(response.modelConfig);
      setSession(response.authSession);

      if (!response.authSession && response.status === "completed") {
        props.onClose();
      }
    } finally {
      setBusy("");
    }
  }

  async function handleSessionInput() {
    if (!session?.id || !sessionInput.trim()) return;
    setBusy("input");
    try {
      const next = await submitModelAuthSessionInput(session.id, { value: sessionInput.trim() });
      setSession(next.session);
      setSessionInput("");
      props.onModelConfigChange(next.modelConfig);

      if (next.session.status === "completed") {
        props.onClose();
      }
    } finally {
      setBusy("");
    }
  }

  async function handleRefreshProviders() {
    const next = await props.reloadModelConfig();
    props.onModelConfigChange(next);
  }

  return (
    <Dialog
      description="Choose a provider, model, and authentication for this saved AI model entry."
      onClose={props.onClose}
      open={props.open}
      title={isEdit ? "Edit AI Model" : "Add AI Model"}
      wide
    >
      {!provider ? (
        <div className="provider-grid">
          {props.modelConfig?.providers.map((item) => (
            <button className="provider-tile" key={item.id} onClick={() => setProviderId(item.id)} type="button">
              <ProviderLogo label={item.label} providerId={item.id} />
              <div className="provider-details">
                <strong>{item.label}</strong>
                <span className="card__description">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <LoadingBlocker
          active={busy === "save" || busy === "input"}
          label={busy === "input" ? "Finishing model authentication" : "Saving AI model"}
          description="ChillClaw is syncing the model entry with OpenClaw."
        >
          <div className="panel-stack">
            <InfoBanner
              icon={<ProviderLogo label={provider.label} providerId={provider.id} />}
              title={provider.label}
              description={provider.description}
            >
              <div className="actions-row info-banner__actions">
                <Button onClick={() => setProviderId("")} variant="outline">
                  Change Provider
                </Button>
                {provider.docsUrl ? (
                  <Button onClick={() => window.open(provider.docsUrl, "_blank", "noopener,noreferrer")} variant="ghost">
                    <ExternalLink size={14} />
                    Documentation
                  </Button>
                ) : null}
              </div>
            </InfoBanner>

            <ProviderGuidance provider={provider} />

          <div className="field-grid field-grid--two">
            <div>
              <FieldLabel htmlFor="entry-label">Display name</FieldLabel>
              <Input id="entry-label" onChange={(event) => setLabel(event.target.value)} placeholder={`${provider.label} ${modelKey.split("/").pop() ?? "model"}`} value={label} />
            </div>
            <div>
              <FieldLabel htmlFor="model-key-select">Model</FieldLabel>
              {models.length ? (
                <Select
                  id="model-key-select"
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === MODEL_KEY_CUSTOM_OPTION) {
                      setModelKey((current) => (models.some((item) => item.key === current) ? "" : current));
                      return;
                    }

                    setModelKey(nextValue);
                  }}
                  value={selectedModelValue}
                >
                  {models.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name} ({item.key})
                    </option>
                  ))}
                  <option value={MODEL_KEY_CUSTOM_OPTION}>Custom model key…</option>
                </Select>
              ) : null}
              {showCustomModelInput ? (
                <div style={{ marginTop: models.length ? 12 : 0 }}>
                  <FieldLabel htmlFor="model-key">Custom model key</FieldLabel>
                  <Input
                    id="model-key"
                    onChange={(event) => setModelKey(event.target.value)}
                    placeholder={modelKeyPlaceholder(provider)}
                    value={modelKey}
                  />
                </div>
              ) : null}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel htmlFor="method-id">Authentication Method</FieldLabel>
              <Select id="method-id" onChange={(event) => setMethodId(event.target.value)} value={methodId}>
                {provider.authMethods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {method ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>{method.interactive ? "Interactive flow" : method.kind === "api-key" ? "API key setup" : "Direct setup"}</strong>
                <p className="card__description">{method.description}</p>
                <div className="field-grid">
                  {method.fields.map((field) => (
                    <div key={field.id}>
                      <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
                      <Input
                        id={field.id}
                        onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                        placeholder={field.placeholder}
                        type={field.secret ? "password" : "text"}
                        value={values[field.id] ?? ""}
                      />
                    </div>
                  ))}
                </div>
                {validationError ? <p className="card__description">{validationError}</p> : null}
                {session ? (
                  <div className="panel-stack">
                    <strong>Authentication progress</strong>
                    <Textarea readOnly value={session.logs.join("\n")} />
                    {session.launchUrl ? (
                      <Button onClick={() => window.open(session.launchUrl, "_blank", "noopener,noreferrer")} variant="outline">
                        <Link2 size={14} />
                        Open authentication window
                      </Button>
                    ) : null}
                    {session.status === "awaiting-input" ? (
                      <div className="field-grid field-grid--two">
                        <Input
                          onChange={(event) => setSessionInput(event.target.value)}
                          placeholder={session.inputPrompt ?? "Paste redirect URL or code"}
                          value={sessionInput}
                        />
                        <Button loading={busy === "input"} onClick={handleSessionInput}>
                          {busy === "input" ? "Sending..." : "Finish Authentication"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="actions-row" style={{ justifyContent: "space-between" }}>
            <div className="actions-row">
              <Badge tone="neutral">{provider.configured ? "Provider seen in OpenClaw" : "New provider setup"}</Badge>
              {makeDefault ? <Badge tone="success">Default</Badge> : null}
              {useAsFallback ? <Badge tone="info">Fallback</Badge> : null}
              {!makeDefault && !useAsFallback ? <Badge tone="neutral">Normal</Badge> : null}
            </div>
            <div className="actions-row">
              <Button onClick={() => void handleRefreshProviders()} type="button" variant="outline">
                <RefreshCw size={14} />
                Refresh providers
              </Button>
              <Button disabled={!modelKey || Boolean(validationError)} loading={busy === "save"} onClick={handleSave}>
                {busy === "save" ? "Saving..." : isEdit ? "Save Changes" : "Save Entry"}
              </Button>
            </div>
          </div>
          </div>
        </LoadingBlocker>
      )}
    </Dialog>
  );
}

function ChannelDialog(props: {
  open: boolean;
  onClose: () => void;
  channelConfig?: ChannelConfigOverview;
  onChannelConfigChange: (next: ChannelConfigOverview) => void;
  reloadChannelConfig: (options?: { fresh?: boolean }) => Promise<ChannelConfigOverview>;
  initialEntry?: ConfiguredChannelEntry;
  initialChannelId?: string;
}) {
  const [channelId, setChannelId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const capability = props.channelConfig?.capabilities.find((item) => item.id === channelId);
  const activeSession = props.channelConfig?.activeSession?.channelId === channelId ? props.channelConfig.activeSession : undefined;
  const isEdit = Boolean(props.initialEntry);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const nextChannelId = props.initialEntry?.channelId ?? props.initialChannelId ?? "";
    setChannelId(nextChannelId);
    setMessage("");
    setValues({
      domain: "feishu",
      botName: "ChillClaw Assistant",
      ...props.initialEntry?.editableValues
    });
  }, [props.initialChannelId, props.initialEntry, props.open]);

  async function applyChannelAction(action: "save" | "prepare" | "login" | "approve-pairing") {
    if (!capability) {
      return;
    }

    setBusy(action);
    try {
      const request = { channelId: capability.id, values, action };
      const response = props.initialEntry
        ? await updateChannelEntry(props.initialEntry!.id, request)
        : await createChannelEntry(request);
      props.onChannelConfigChange(response.channelConfig);
      setMessage(response.message);

      if (shouldCloseChannelDialogAfterAction(action, capability.id, Boolean(response.session))) {
        props.onClose();
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog
      description="Choose a communication channel, review the setup guidance, and save the account through ChillClaw."
      onClose={props.onClose}
      open={props.open}
      title={isEdit ? "Edit Channel" : "Add Channel"}
      wide
    >
      {!capability ? (
        <div className="provider-grid">
          {props.channelConfig?.capabilities.map((item) => (
            <button className="provider-tile" key={item.id} onClick={() => setChannelId(item.id)} type="button">
              <div className="provider-logo">{channelIcon(item.id)}</div>
              <div className="provider-details">
                <strong>{item.label}</strong>
                <span className="card__description">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <LoadingBlocker
          active={Boolean(busy)}
          label="Saving channel configuration"
          description="ChillClaw is sending the channel action to OpenClaw."
        >
          <div className="panel-stack">
            <InfoBanner
              icon={<div className="provider-logo">{channelIcon(capability.id)}</div>}
              title={capability.label}
              description={capability.description}
            >
              <div className="actions-row info-banner__actions">
                <Button onClick={() => setChannelId("")} variant="outline">
                  Change Channel
                </Button>
                {capability.docsUrl ? (
                  <Button onClick={() => window.open(capability.docsUrl, "_blank", "noopener,noreferrer")} variant="ghost">
                    <ExternalLink size={14} />
                    Documentation
                  </Button>
                ) : null}
              </div>
            </InfoBanner>

          {props.initialEntry ? (
            <Card>
              <CardContent className="panel-stack">
                <div className="actions-row" style={{ justifyContent: "space-between" }}>
                  <strong>Current configuration</strong>
                  <ChannelStatusBadge status={props.initialEntry.status} />
                </div>
                <p className="card__description">{props.initialEntry.summary}</p>
                {props.initialEntry.maskedConfigSummary.length ? (
                  <div className="field-grid field-grid--two">
                    {props.initialEntry.maskedConfigSummary.map((item) => (
                      <div key={item.label}>
                        <FieldLabel htmlFor={`summary-${item.label}`}>{item.label}</FieldLabel>
                        <Input id={`summary-${item.label}`} readOnly value={item.value} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {capability.guidedSetupKind === "feishu" ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>Feishu setup guidance</strong>
                <p className="card__description">
                  Follow the official Feishu channel guide step by step, then return here to save credentials and finish pairing in ChillClaw.
                </p>
                <div className="actions-row" style={{ flexWrap: "wrap" }}>
                  {feishuDirectLinks.map((link) => (
                    <Button
                      key={link.url}
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                      variant="outline"
                    >
                      <ExternalLink size={14} />
                      {link.label}
                    </Button>
                  ))}
                </div>
                <div className="panel-stack">
                  {feishuGuideSteps.map((step, index) => (
                    <div className="check-row" key={step}>
                      <div className="check-row__meta">
                        <strong>Step {index + 1}</strong>
                        <p>{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <InfoBanner
                  title="What to prepare before saving"
                  description="App ID, App Secret, the correct tenant domain, imported scopes, bot capability enabled, long connection enabled, and the message receive event required by OpenClaw."
                  accent="blue"
                />
                <Textarea readOnly value={feishuScopes} />
                <div className="actions-row">
                  <Button onClick={() => void copyText(feishuScopes)} variant="outline">
                    <Copy size={14} />
                    Copy scope config
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {capability.guidedSetupKind === "wechat-work" ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>WeChat Work setup guidance</strong>
                <p className="card__description">
                  ChillClaw manages the required WeCom plugin automatically. Save the Bot ID and Secret here, and the
                  daemon will install or update the plugin before it writes the WeChat Work channel config.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {capability.guidedSetupKind === "wechat" ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>Personal WeChat login</strong>
                <p className="card__description">
                  ChillClaw starts the QR-first WeChat installer for you. Use Start Login to begin, then keep this dialog
                  open while the session log streams the pairing steps.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {activeSession ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>Active session</strong>
                <p className="card__description">{activeSession.message}</p>
                <Textarea readOnly value={activeSession.logs.join("\n")} />
              </CardContent>
            </Card>
          ) : null}

          <div className="field-grid field-grid--two">
            {capability.fieldDefs.map((field) => (
              <div key={field.id} style={field.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                <FieldLabel htmlFor={`${capability.id}-${field.id}`}>{field.label}</FieldLabel>
                {field.kind === "select" ? (
                  <Select
                    id={`${capability.id}-${field.id}`}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    value={values[field.id] ?? field.options?.[0]?.value ?? ""}
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : field.kind === "textarea" ? (
                  <Textarea
                    id={`${capability.id}-${field.id}`}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    value={values[field.id] ?? ""}
                  />
                ) : (
                  <Input
                    id={`${capability.id}-${field.id}`}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    placeholder={field.placeholder}
                    type={field.secret ? "password" : "text"}
                    value={values[field.id] ?? ""}
                  />
                )}
              </div>
            ))}
          </div>

          {message ? <p className="card__description">{message}</p> : null}

          <div className="actions-row" style={{ justifyContent: "space-between" }}>
            <div className="actions-row">
              <Badge tone={capability.officialSupport ? "success" : "warning"}>
                {capability.officialSupport ? "Official" : "Workaround"}
              </Badge>
              {props.initialEntry?.pairingRequired ? <StatusBadge tone="info">Pairing required</StatusBadge> : null}
            </div>
            <div className="actions-row">
              {capability.id === "feishu" ? (
                <Button loading={busy === "prepare"} onClick={() => void applyChannelAction("prepare")} variant="outline">
                  {busy === "prepare" ? "Preparing..." : "Prepare"}
                </Button>
              ) : null}
              {capability.supportsLogin ? (
                <Button loading={busy === "login"} onClick={() => void applyChannelAction("login")} variant="outline">
                  {busy === "login" ? "Starting..." : capability.id === "wechat" ? "Start Login" : "Start Login"}
                </Button>
              ) : null}
              {capability.id !== "whatsapp" && capability.id !== "wechat" ? (
                <Button loading={busy === "save"} onClick={() => void applyChannelAction("save")}>
                  {busy === "save" ? "Saving..." : isEdit ? "Save Changes" : "Save Channel"}
                </Button>
              ) : null}
              {capability.supportsPairing ? (
                <Button
                  disabled={!values.code?.trim()}
                  loading={busy === "approve-pairing"}
                  onClick={() => void applyChannelAction("approve-pairing")}
                  variant="outline"
                >
                  {busy === "approve-pairing" ? "Approving..." : "Approve Pairing"}
                </Button>
              ) : null}
            </div>
          </div>
          </div>
        </LoadingBlocker>
      )}
    </Dialog>
  );
}

export default function ConfigPage() {
  const { locale } = useLocale();
  const copy = t(locale).config;
  const [activeTab, setActiveTab] = useState<"models" | "channels">("models");
  const [modelConfig, setModelConfig] = useState<ModelConfigOverview>();
  const [channelConfig, setChannelConfig] = useState<ChannelConfigOverview>();
  const [modelsLoading, setModelsLoading] = useState(true);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [selectedModelEntry, setSelectedModelEntry] = useState<SavedModelEntry>();
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>();
  const [selectedChannelEntry, setSelectedChannelEntry] = useState<ConfiguredChannelEntry>();
  const [channelMessage, setChannelMessage] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void reloadModelConfig();
  }, []);

  useEffect(() => {
    if (activeTab !== "channels" || channelConfig || channelsLoading) {
      return;
    }

    void reloadChannelConfig();
  }, [activeTab, channelConfig, channelsLoading]);

  useEffect(() => {
    if (!channelDialogOpen || channelConfig || channelsLoading) {
      return;
    }

    void reloadChannelConfig();
  }, [channelConfig, channelDialogOpen, channelsLoading]);

  useEffect(() => {
    return subscribeToDaemonEvents((event) => {
      if (event.type === "model-config.updated") {
        setModelConfig(event.snapshot.data);
        setModelsLoading(false);
        return;
      }

      if (event.type === "channel-config.updated") {
        setChannelConfig(event.snapshot.data);
        setChannelsLoading(false);
        return;
      }

      if (event.type === "channel.session.updated") {
        setChannelConfig((current) => {
          if (!current || current.activeSession?.channelId !== event.channelId) {
            return current;
          }

          return {
            ...current,
            activeSession: event.session
          };
        });
      }
    });
  }, []);

  async function reloadModelConfig(options?: { fresh?: boolean }) {
    setModelsLoading(true);
    const next = await fetchModelConfig(options);
    setModelConfig(next);
    setModelsLoading(false);
    return next;
  }

  async function reloadChannelConfig(options?: { fresh?: boolean }) {
    setChannelsLoading(true);
    const next = await fetchChannelConfig(options);
    setChannelConfig(next);
    setChannelsLoading(false);
    return next;
  }

  function openAddChannelDialog() {
    setSelectedChannelEntry(undefined);
    setSelectedChannelId(undefined);
    setChannelDialogOpen(true);
  }

  function openEditChannelDialog(entry: ConfiguredChannelEntry) {
    setSelectedChannelEntry(entry);
    setSelectedChannelId(entry.channelId);
    setChannelDialogOpen(true);
  }

  async function handleRemoveChannel(entry: ConfiguredChannelEntry) {
    setBusy(`remove:${entry.id}`);
    try {
      const response = await removeChannelEntry(entry.id);
      setChannelConfig(response.channelConfig);
      setChannelMessage(response.message);
    } finally {
      setBusy("");
    }
  }

  async function handleSetDefaultEntry(entry: SavedModelEntry) {
    setBusy("models:gateway");
    try {
      const response = await setDefaultModelEntry({ entryId: entry.id });
      setModelConfig(response.modelConfig);
    } finally {
      setBusy("");
    }
  }

  async function handleToggleFallback(entry: SavedModelEntry) {
    if (!modelConfig) return;

    setBusy("models:gateway");
    try {
      const nextFallbackIds = modelConfig.savedEntries
        .filter((item) => {
          if (item.isDefault) {
            return false;
          }

          if (item.id === entry.id) {
            return !item.isFallback;
          }

          if (!item.isFallback) {
            return false;
          }

          if (!entry.isFallback && item.modelKey === entry.modelKey) {
            return false;
          }

          return true;
        })
        .map((item) => item.id);

      const response = await replaceFallbackModelEntries({ entryIds: nextFallbackIds });
      setModelConfig(response.modelConfig);
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveModelEntry(entry: SavedModelEntry) {
    if (!window.confirm(`Remove ${entry.label} from ChillClaw?`)) {
      return;
    }

    setBusy(`models:remove:${entry.id}`);
    try {
      const response = await removeSavedModelEntry(entry.id);
      setModelConfig(response.modelConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "ChillClaw could not remove this configured model.");
    } finally {
      setBusy("");
    }
  }

  const allSavedEntries = modelConfig?.savedEntries ?? [];
  const savedEntries = allSavedEntries.filter((entry) => !entry.id.startsWith("runtime:"));
  const runtimeModels = runtimeConfiguredModels(modelConfig);
  const runtimeModelsByKey = new Map(runtimeModels.map((model) => [model.key, model]));
  const runtimeManagedEntries = activeSavedModelEntries(savedEntries, runtimeModels);
  const runtimeOnlyModels = runtimeModels.filter((model) => !runtimeManagedEntries.some((entry) => entry.modelKey === model.key));
  const configuredChannels = channelConfig?.entries ?? [];
  const configuredProviderCount =
    modelConfig?.providers.filter((item) => providerConfiguredModels(modelConfig, item).length > 0 || item.configured).length ?? 0;
  const defaultRuntimeModel =
    runtimeModels.find((model) => model.key === modelConfig?.defaultModel) ??
    (modelConfig?.defaultModel
      ? {
          key: modelConfig.defaultModel,
          name: modelConfig.defaultModel.split("/").pop() ?? modelConfig.defaultModel
        }
      : undefined);
  const activeChannelSession = channelConfig?.activeSession;
  const modelBusy = busy.startsWith("models:");
  const modelHeaderAction = (
    <>
      <Button onClick={() => void reloadModelConfig({ fresh: true })} variant="outline" loading={modelsLoading}>
        <RefreshCw size={14} />
        {copy.refreshProviders}
      </Button>
      <Button
        onClick={() => {
          setSelectedModelEntry(undefined);
          setModelDialogOpen(true);
        }}
      >
        <Plus size={14} />
        {copy.addModel}
      </Button>
    </>
  );
  const channelHeaderAction = (
    <>
      <Button onClick={() => void reloadChannelConfig({ fresh: true })} variant="outline" loading={channelsLoading}>
        <RefreshCw size={14} />
        {copy.refreshProviders}
      </Button>
      <Button onClick={openAddChannelDialog}>
        <Plus size={14} />
        Add Channel
      </Button>
    </>
  );

  return (
    <WorkspaceScaffold
      className="config-page"
      title={copy.title}
      subtitle={copy.subtitle}
      actions={activeTab === "channels" ? channelHeaderAction : modelHeaderAction}
    >

      <Tabs className="config-page__tabs" defaultValue="models" value={activeTab} onValueChange={(value) => setActiveTab(value as "models" | "channels")}>
        <TabsList className="config-page__tab-list">
          <TabsTrigger value="models">
            <span className="config-page__tab-trigger">
              <span className="config-page__tab-icon config-page__tab-icon--models">
                <Sparkles size={16} />
              </span>
              <span className="config-page__tab-copy">
                <strong>{copy.modelsTab}</strong>
                <small>{runtimeModels.length ? "Live runtime models" : "No live runtime models yet"}</small>
              </span>
              <Badge tone="accent">{runtimeModels.length}</Badge>
            </span>
          </TabsTrigger>
          <TabsTrigger value="channels">
            <span className="config-page__tab-trigger">
              <span className="config-page__tab-icon config-page__tab-icon--channels">
                <MessageCircle size={16} />
              </span>
              <span className="config-page__tab-copy">
                <strong>{copy.channelsTab}</strong>
                <small>{configuredChannels.length ? "Configured live channels" : "No live channels yet"}</small>
              </span>
              <Badge tone="accent">{configuredChannels.length}</Badge>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="config-page__content">
          {modelsLoading && !modelConfig ? (
            <LoadingPanel title="Loading AI models" description="ChillClaw is reading configured models from OpenClaw." />
          ) : null}

          {!modelsLoading && modelConfig ? (
            <>
              <Card className="config-page__hero-card config-page__hero-card--models">
                <CardContent className="config-page__hero-card-content">
                  <div className="config-page__hero-main">
                    <div className="config-page__hero-icon config-page__hero-icon--models">
                      <Sparkles size={28} />
                    </div>
                    <div className="config-page__hero-copy">
                      <span className="config-page__eyebrow">Live runtime</span>
                      <h2>{copy.modelsInfoTitle}</h2>
                      <p>{copy.modelsInfoBody}</p>
                      <div className="config-page__hero-points">
                        <span>
                          <CheckCircle2 size={14} />
                          Managed entries stay tied to the active OpenClaw runtime.
                        </span>
                        <span>
                          <CheckCircle2 size={14} />
                          Default and fallback routing are visible in one place.
                        </span>
                        <span>
                          <CheckCircle2 size={14} />
                          Credentials remain editable without showing stale history.
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="config-page__hero-metrics">
                    <ConfigMetric label="Live models" value={runtimeModels.length} />
                    <ConfigMetric label="Providers ready" value={configuredProviderCount} />
                    <ConfigMetric
                      label="Default route"
                      tone="success"
                      value={defaultRuntimeModel ? defaultRuntimeModel.name : "Not set"}
                    />
                  </div>
                </CardContent>
              </Card>

              {runtimeManagedEntries.length ? (
                <section className="config-page__section">
                  <div className="config-page__section-header">
                    <div>
                      <span className="config-page__eyebrow">Managed entries</span>
                      <h2>{copy.runtimeModelsTitle}</h2>
                      <p>{copy.runtimeModelsBody}</p>
                    </div>
                    <Badge tone="accent">{runtimeManagedEntries.length}</Badge>
                  </div>
                  <div className="config-page__entry-list">
                  {runtimeManagedEntries.map((entry) => {
                    const provider = modelConfig?.providers.find((item) => item.id === entry.providerId);
                    const authLabel = entryAuthLabel(entry);
                    const duplicateActiveEntry = runtimeManagedEntries.find(
                      (item) => item.id !== entry.id && item.modelKey === entry.modelKey && (item.isDefault || item.isFallback)
                    );
                    const runtimeModel = runtimeModelsByKey.get(entry.modelKey);
                    const fallbackTag = runtimeModel?.tags.find((item) => item.startsWith("fallback#"));

                    return (
                      <article
                        className="config-page__entry-card config-page__entry-card--model"
                        key={entry.id}
                        style={paletteStyle(providerPalette(entry.providerId))}
                      >
                        <div className="config-page__entry-shell">
                          <div className="config-page__entry-media">
                            <div className="config-page__entry-media-inner">
                              <ProviderLogo label={provider?.label ?? entry.providerId} providerId={entry.providerId} />
                            </div>
                          </div>
                          <div className="config-page__entry-body">
                            <div className="config-page__entry-header">
                              <div className="config-page__entry-copy">
                                <span className="config-page__eyebrow">{provider?.label ?? entry.providerId}</span>
                                <h3>{entry.label}</h3>
                                <p>Managed by ChillClaw and mapped to the live OpenClaw model chain.</p>
                              </div>
                              <div className="config-page__badge-row">
                                <Badge tone="info">{entry.modelKey}</Badge>
                                {entry.isDefault ? <Badge tone="success">Default</Badge> : null}
                                {entry.isFallback ? <Badge tone="accent">Fallback</Badge> : null}
                                {fallbackTag ? <Badge tone="accent">{fallbackTag.replace("#", " #")}</Badge> : null}
                                {authLabel ? <Badge tone="neutral">{authLabel}</Badge> : null}
                                {runtimeModel?.local ? <Badge tone="neutral">Local</Badge> : null}
                              </div>
                            </div>
                            <div className="config-page__meta-grid">
                              <div className="config-page__meta-card">
                                <span>Provider</span>
                                <strong>{provider?.label ?? entry.providerId}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Authentication</span>
                                <strong>{entry.profileLabel ? `${authLabel ?? "Configured"} • ${entry.profileLabel}` : authLabel ?? "Configured"}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Role</span>
                                <strong>{entry.isDefault ? "Default route" : entry.isFallback ? "Fallback route" : "Managed route"}</strong>
                              </div>
                            </div>
                            {duplicateActiveEntry && !entry.isDefault && !entry.isFallback ? (
                              <p className="config-page__entry-note">
                                Another managed entry with this same model is already active. Turning this one on will replace the active copy.
                              </p>
                            ) : null}
                            <div className="config-page__entry-footer">
                              <p className="config-page__entry-hint">
                                {runtimeModel?.local
                                  ? "This model is running in local mode."
                                  : "This route is available in the active OpenClaw runtime right now."}
                              </p>
                              <div className="config-page__entry-actions">
                                {!entry.isDefault ? (
                                  <Button disabled={modelBusy && busy !== "models:gateway"} loading={busy === "models:gateway"} onClick={() => void handleSetDefaultEntry(entry)} variant="secondary">
                                    Set Default
                                  </Button>
                                ) : null}
                                <Button
                                  disabled={entry.isDefault || (modelBusy && busy !== "models:gateway")}
                                  loading={busy === "models:gateway"}
                                  onClick={() => void handleToggleFallback(entry)}
                                  variant={entry.isFallback ? "secondary" : "outline"}
                                >
                                  {entry.isFallback ? "Remove Fallback" : "Use as Fallback"}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setSelectedModelEntry(entry);
                                    setModelDialogOpen(true);
                                  }}
                                  variant="outline"
                                >
                                  Edit
                                </Button>
                                {provider?.docsUrl ? (
                                  <Button onClick={() => window.open(provider.docsUrl, "_blank", "noopener,noreferrer")} variant="ghost">
                                    <ExternalLink size={14} />
                                    {copy.docs}
                                  </Button>
                                ) : null}
                                <Button disabled={modelBusy && busy !== `models:remove:${entry.id}`} loading={busy === `models:remove:${entry.id}`} onClick={() => void handleRemoveModelEntry(entry)} variant="danger">
                                  <Trash2 size={14} />
                                  {busy === `models:remove:${entry.id}` ? "Removing..." : "Remove"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                </section>
              ) : null}

              {runtimeOnlyModels.length ? (
                <section className="config-page__section">
                  <div className="config-page__section-header">
                    <div>
                      <span className="config-page__eyebrow">Runtime-only</span>
                      <h2>{copy.runtimeOnlyTitle}</h2>
                      <p>{copy.runtimeOnlyBody}</p>
                    </div>
                    <Badge tone="info">{runtimeOnlyModels.length}</Badge>
                  </div>
                  <div className="config-page__entry-list config-page__entry-list--compact">
                  {runtimeOnlyModels.map((model) => {
                    const provider = modelConfig?.providers.find((item) =>
                      item.providerRefs.some((ref) => model.key.startsWith(ref))
                    );
                    const fallbackTag = model.tags.find((item) => item.startsWith("fallback#"));
                    const runtimeEntry = runtimeDerivedModelEntry(allSavedEntries, model.key);

                    return (
                      <article
                        className="config-page__entry-card config-page__entry-card--runtime"
                        key={model.key}
                        style={paletteStyle(providerPalette(provider?.id ?? model.key.split("/")[0] ?? "ai"))}
                      >
                        <div className="config-page__entry-shell">
                          <div className="config-page__entry-media">
                            <div className="config-page__entry-media-inner">
                              <ProviderLogo label={provider?.label ?? model.key.split("/")[0]} providerId={provider?.id ?? model.key.split("/")[0] ?? "ai"} />
                            </div>
                          </div>
                          <div className="config-page__entry-body">
                            <div className="config-page__entry-header">
                              <div className="config-page__entry-copy">
                                <span className="config-page__eyebrow">{provider?.label ?? model.key.split("/")[0]}</span>
                                <h3>{model.name}</h3>
                                <p>Live in OpenClaw right now, but not yet managed as a ChillClaw entry.</p>
                              </div>
                              <div className="config-page__badge-row">
                                <Badge tone="info">{model.key}</Badge>
                                {model.key === modelConfig?.defaultModel ? <Badge tone="success">Default</Badge> : null}
                                {fallbackTag ? <Badge tone="accent">{fallbackTag.replace("#", " #")}</Badge> : null}
                                {model.local ? <Badge tone="neutral">Local</Badge> : null}
                                <Badge tone="warning">{copy.sourceInstalled}</Badge>
                              </div>
                            </div>
                            <div className="config-page__meta-grid">
                              <div className="config-page__meta-card">
                                <span>Provider</span>
                                <strong>{provider?.label ?? model.key.split("/")[0]}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Context window</span>
                                <strong>{model.contextWindow ? `${Intl.NumberFormat().format(model.contextWindow)} tokens` : "Unknown"}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Availability</span>
                                <strong>{model.available ? "Available now" : "Unavailable"}</strong>
                              </div>
                            </div>
                            <div className="config-page__entry-footer">
                              <p className="config-page__entry-hint">
                                This model is currently coming from the active OpenClaw runtime without a managed ChillClaw entry.
                              </p>
                              <div className="config-page__entry-actions">
                                {runtimeEntry ? (
                                  <Button disabled={modelBusy && busy !== `models:remove:${runtimeEntry.id}`} loading={busy === `models:remove:${runtimeEntry.id}`} onClick={() => void handleRemoveModelEntry(runtimeEntry)} variant="danger">
                                    <Trash2 size={14} />
                                    {busy === `models:remove:${runtimeEntry.id}` ? "Removing..." : "Remove"}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                </section>
              ) : null}

              <ConfigAddCard
                title={copy.addModel}
                description="Create a new managed entry for a live provider or model."
                onClick={() => {
                  setSelectedModelEntry(undefined);
                  setModelDialogOpen(true);
                }}
              />

              {!runtimeManagedEntries.length && !runtimeOnlyModels.length ? (
                <EmptyState
                  title={copy.modelsEmptyTitle}
                  description={copy.modelsEmptyBody}
                />
              ) : null}

            </>
          ) : null}
        </TabsContent>

        <TabsContent value="channels" className="config-page__content">
          {channelsLoading && !channelConfig ? (
            <LoadingPanel title="Loading channels" description="ChillClaw is reading channel accounts and live channel status from OpenClaw." />
          ) : null}

          {!channelsLoading && channelConfig ? (
            <>
              <Card className="config-page__hero-card config-page__hero-card--channels">
                <CardContent className="config-page__hero-card-content">
                  <div className="config-page__hero-main">
                    <div className="config-page__hero-icon config-page__hero-icon--channels">
                      <MessageCircle size={28} />
                    </div>
                    <div className="config-page__hero-copy">
                      <span className="config-page__eyebrow">Live runtime</span>
                      <h2>{copy.channelsInfoTitle}</h2>
                      <p>{copy.channelsInfoBody}</p>
                      <div className="config-page__hero-points">
                        <span>
                          <CheckCircle2 size={14} />
                          Only live configured channels appear here.
                        </span>
                        <span>
                          <CheckCircle2 size={14} />
                          Pairing and login progress stay visible while setup is active.
                        </span>
                        <span>
                          <CheckCircle2 size={14} />
                          Gateway truth comes directly from the active OpenClaw runtime.
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="config-page__hero-metrics">
                    <ConfigMetric label="Live channels" value={configuredChannels.length} />
                    <ConfigMetric label="Channel types" value={channelConfig.capabilities.length} />
                    <ConfigMetric
                      label="Gateway state"
                      tone="success"
                      value={channelMessage || channelConfig.gatewaySummary || "Ready"}
                    />
                  </div>
                </CardContent>
              </Card>

              {activeChannelSession ? (
                <Card className="config-page__session-card">
                  <CardContent className="config-page__session-card-content">
                    <div className="config-page__section-header">
                      <div>
                        <span className="config-page__eyebrow">Active session</span>
                        <h2>{activeChannelSession.channelId}</h2>
                        <p>{activeChannelSession.message}</p>
                      </div>
                      <Badge tone="info">{activeChannelSession.channelId}</Badge>
                    </div>
                    <Textarea readOnly value={activeChannelSession.logs.join("\n")} />
                  </CardContent>
                </Card>
              ) : null}

              {configuredChannels.length ? (
                <section className="config-page__section">
                  <div className="config-page__section-header">
                    <div>
                      <span className="config-page__eyebrow">Configured now</span>
                      <h2>Live channel entries</h2>
                      <p>{channelMessage || channelConfig.gatewaySummary || "ChillClaw reads these configured channels directly from the current OpenClaw runtime."}</p>
                    </div>
                    <Badge tone="accent">{configuredChannels.length}</Badge>
                  </div>
                  <div className="config-page__entry-list">
              {configuredChannels.map((entry) => {
                const capability = channelConfig?.capabilities.find((item) => item.id === entry.channelId);
                const ChannelIcon = channelVisualIcon(entry.channelId);

                return (
                  <article
                    className="config-page__entry-card config-page__entry-card--channel"
                    key={entry.id}
                    style={paletteStyle(channelPalette(entry.channelId))}
                  >
                    <div className="config-page__entry-shell">
                      <div className="config-page__entry-media">
                        <div className="config-page__entry-media-inner config-page__entry-media-inner--icon">
                          <ChannelIcon size={30} />
                        </div>
                      </div>
                      <div className="config-page__entry-body">
                        <div className="config-page__entry-header">
                          <div className="config-page__entry-copy">
                            <span className="config-page__eyebrow">{capability?.label ?? entry.channelId}</span>
                            <h3>{entry.label}</h3>
                            <p>{entry.summary}</p>
                          </div>
                          <div className="config-page__badge-row">
                            <ChannelStatusBadge status={entry.status} />
                            {entry.pairingRequired ? <StatusBadge tone="info">Pairing required</StatusBadge> : null}
                            {capability?.officialSupport === false ? <Badge tone="warning">Workaround</Badge> : null}
                          </div>
                        </div>
                        <div className="config-page__meta-grid">
                          {entry.maskedConfigSummary.length ? (
                            entry.maskedConfigSummary.map((item) => (
                              <div className="config-page__meta-card" key={item.label}>
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="config-page__meta-card">
                                <span>Capability</span>
                                <strong>{capability?.label ?? entry.channelId}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Status</span>
                                <strong>{entry.status ?? "pending"}</strong>
                              </div>
                              <div className="config-page__meta-card">
                                <span>Last updated</span>
                                <strong>{entry.lastUpdatedAt ? new Date(entry.lastUpdatedAt).toLocaleString() : "Unknown"}</strong>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="config-page__entry-footer">
                          <p className="config-page__entry-hint">
                            {capability?.officialSupport === false
                              ? "This channel uses the current workaround path supported by the active runtime."
                              : "This channel is live in the current OpenClaw runtime."}
                          </p>
                          <ConfiguredChannelCardActions
                            busy={busy}
                            capability={capability}
                            copy={copy}
                            entry={entry}
                            onApprove={() => openEditChannelDialog(entry)}
                            onEdit={() => openEditChannelDialog(entry)}
                            onRemove={() => void handleRemoveChannel(entry)}
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
                  </div>
                </section>
              ) : (
                <EmptyState
                  title="No channels are configured yet"
                  description="Add Telegram, WhatsApp, Feishu, or WeChat through the dialog to start managing communication channels in ChillClaw."
                />
              )}

              <ConfigAddCard
                title="Add Channel"
                description="Start another live channel setup in the current OpenClaw runtime."
                onClick={openAddChannelDialog}
              />
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <ModelDialog
        initialEntry={selectedModelEntry}
        modelConfig={modelConfig}
        onClose={() => {
          setModelDialogOpen(false);
          setSelectedModelEntry(undefined);
        }}
        onModelConfigChange={setModelConfig}
        open={modelDialogOpen}
        reloadModelConfig={reloadModelConfig}
      />

      <ChannelDialog
        channelConfig={channelConfig}
        initialChannelId={selectedChannelId}
        initialEntry={selectedChannelEntry}
        onChannelConfigChange={setChannelConfig}
        onClose={() => {
          setChannelDialogOpen(false);
          setSelectedChannelEntry(undefined);
          setSelectedChannelId(undefined);
        }}
        open={channelDialogOpen}
        reloadChannelConfig={reloadChannelConfig}
      />
    </WorkspaceScaffold>
  );
}
