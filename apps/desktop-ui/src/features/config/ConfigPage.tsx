import { Copy, ExternalLink, KeyRound, Link2, MessageCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ChannelConfigOverview,
  ConfiguredChannelEntry,
  ModelAuthSessionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  SavedModelEntry
} from "@slackclaw/contracts";

import {
  completeOnboarding,
  createChannelEntry,
  createSavedModelEntry,
  fetchChannelConfig,
  fetchModelAuthSession,
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
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { FieldLabel, Input, Select, Textarea } from "../../shared/ui/Field.js";
import { InfoBanner } from "../../shared/ui/InfoBanner.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { PageHeader } from "../../shared/ui/PageHeader.js";
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
  "Copy the App ID and App Secret, then paste them into SlackClaw.",
  "Batch-import the required scopes and confirm the bot capability is enabled for the app.",
  "Use Prepare in SlackClaw first so OpenClaw can verify the Feishu plugin is ready.",
  "In Feishu event subscriptions, switch delivery to long connection and enable the message receive event OpenClaw expects.",
  "Publish the app after permissions and event settings are finished.",
  "Save the credentials here, send the bot a direct message, then approve the pairing code in SlackClaw.",
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

export function channelIcon(channelId: string) {
  const icons: Record<string, string> = {
    telegram: "TG",
    whatsapp: "WA",
    feishu: "飞",
    wechat: "WX"
  };

  return icons[channelId] ?? channelId.slice(0, 2).toUpperCase();
}

export function modelOptions(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) return [];
  return modelConfig.models.filter((model) =>
    provider.providerRefs.some((ref) => model.key.startsWith(`${ref.replace(/\/$/, "")}/`))
  );
}

function modelKeyPlaceholder(provider: ModelProviderConfig | undefined) {
  if (!provider) {
    return "provider/model-name";
  }

  return provider.sampleModels[0] ?? `${provider.providerRefs[0]?.replace(/\/?$/, "/") ?? ""}model-name`;
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

export const providerIcon = providerFallbackGlyph;

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

function ModelDialog(props: {
  open: boolean;
  onClose: () => void;
  modelConfig?: ModelConfigOverview;
  reloadModelConfig: () => Promise<ModelConfigOverview>;
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
  const isEdit = Boolean(props.initialEntry);
  const selectedRole = resolveModelEntryRole(makeDefault, useAsFallback);
  const validationError = validateModelEntryDraft(method, values, selectedRole);

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
    setMakeDefault(Boolean(props.initialEntry?.isDefault));
    setUseAsFallback(Boolean(props.initialEntry?.isFallback));
  }, [props.initialEntry, props.open]);

  useEffect(() => {
    if (!props.open || !provider) {
      return;
    }

    setMethodId((current) => (current && provider.authMethods.some((item) => item.id === current) ? current : provider.authMethods[0]?.id ?? ""));
    setModelKey((current) => {
      if (current && models.some((item) => item.key === current)) {
        return current;
      }

      return props.initialEntry?.modelKey ?? providerActiveModel(props.modelConfig, provider) ?? provider.sampleModels[0] ?? models[0]?.key ?? "";
    });
  }, [models, props.initialEntry?.modelKey, props.modelConfig, props.open, provider]);

  useEffect(() => {
    if (!session?.id) {
      return;
    }

    const timer = window.setInterval(async () => {
      const nextSession = await fetchModelAuthSession(session.id);
      setSession(nextSession.session);
      if (nextSession.session.launchUrl) {
        window.open(nextSession.session.launchUrl, "_blank", "noopener,noreferrer");
      }

      if (nextSession.session.status === "completed") {
        await props.reloadModelConfig();
        props.onClose();
        return;
      }

      if (nextSession.session.status === "failed") {
        await props.reloadModelConfig();
      }
    }, 1600);

    return () => window.clearInterval(timer);
  }, [props, session?.id]);

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
      const result = props.initialEntry
        ? await updateSavedModelEntry(props.initialEntry.id, request)
        : await createSavedModelEntry(request);

      props.onModelConfigChange(result.modelConfig);
      setSession(result.authSession);
      if (result.authSession?.launchUrl) {
        window.open(result.authSession.launchUrl, "_blank", "noopener,noreferrer");
      }

      if (!result.authSession && result.status === "completed") {
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
      props.onModelConfigChange(await props.reloadModelConfig());
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
          description="SlackClaw is syncing the model entry with OpenClaw."
        >
          <div className="panel-stack">
          <div className="info-banner">
            <ProviderLogo label={provider.label} providerId={provider.id} />
            <div>
              <h3>{provider.label}</h3>
              <p>{provider.description}</p>
              <div className="actions-row" style={{ marginTop: 12 }}>
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
            </div>
          </div>

          <div className="field-grid field-grid--two">
            <div>
              <FieldLabel htmlFor="entry-label">Display name</FieldLabel>
              <Input id="entry-label" onChange={(event) => setLabel(event.target.value)} placeholder={`${provider.label} ${modelKey.split("/").pop() ?? "model"}`} value={label} />
            </div>
            <div>
              <FieldLabel htmlFor="model-key">Model</FieldLabel>
              <Input
                id="model-key"
                list={models.length ? "model-key-options" : undefined}
                onChange={(event) => setModelKey(event.target.value)}
                placeholder={modelKeyPlaceholder(provider)}
                value={modelKey}
              />
              {models.length ? (
                <datalist id="model-key-options">
                  {models.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </datalist>
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

          <Card>
            <CardContent className="panel-stack">
              <strong>Roles</strong>
              <div className="model-role-grid">
                <button
                  className={`model-role-toggle${selectedRole === "normal" ? " model-role-toggle--active" : ""}`}
                  onClick={() => {
                    const next = applyModelEntryRole("normal");
                    setMakeDefault(next.makeDefault);
                    setUseAsFallback(next.useAsFallback);
                  }}
                  type="button"
                >
                  <span>Normal</span>
                  <small>Saved for later, but not active in runtime routing.</small>
                </button>
                <button
                  className={`model-role-toggle${selectedRole === "default" ? " model-role-toggle--active" : ""}`}
                  onClick={() => {
                    const next = applyModelEntryRole("default");
                    setMakeDefault(next.makeDefault);
                    setUseAsFallback(next.useAsFallback);
                  }}
                  type="button"
                >
                  <span>Default model</span>
                  <small>SlackClaw runs tasks with this entry.</small>
                </button>
                <button
                  className={`model-role-toggle${selectedRole === "fallback" ? " model-role-toggle--active" : ""}`}
                  onClick={() => {
                    const next = applyModelEntryRole("fallback");
                    setMakeDefault(next.makeDefault);
                    setUseAsFallback(next.useAsFallback);
                  }}
                  type="button"
                >
                  <span>Fallback model</span>
                  <small>Used when the active default needs a backup.</small>
                </button>
              </div>
            </CardContent>
          </Card>

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
  reloadChannelConfig: () => Promise<ChannelConfigOverview>;
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
      botName: "SlackClaw Assistant",
      pluginSpec: "@openclaw-china/wecom-app",
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
      const result = props.initialEntry
        ? await updateChannelEntry(props.initialEntry.id, request)
        : await createChannelEntry(request);
      props.onChannelConfigChange(result.channelConfig);
      setMessage(result.message);

      if (!result.session && action !== "approve-pairing") {
        const refreshed = await props.reloadChannelConfig();
        props.onChannelConfigChange(refreshed);
      }

      if (action === "save" && capability.id !== "whatsapp") {
        props.onClose();
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog
      description="Choose a communication channel, review the setup guidance, and save the account through SlackClaw."
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
          description="SlackClaw is sending the channel action to OpenClaw."
        >
          <div className="panel-stack">
          <div className="info-banner">
            <div className="provider-logo">{channelIcon(capability.id)}</div>
            <div>
              <h3>{capability.label}</h3>
              <p>{capability.description}</p>
              <div className="actions-row" style={{ marginTop: 12 }}>
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
            </div>
          </div>

          {props.initialEntry ? (
            <Card>
              <CardContent className="panel-stack">
                <div className="actions-row" style={{ justifyContent: "space-between" }}>
                  <strong>Current configuration</strong>
                  <Badge tone={channelStatusTone(props.initialEntry.status)}>{props.initialEntry.status}</Badge>
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
                  Follow the official Feishu channel guide step by step, then return here to save credentials and finish pairing in SlackClaw.
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
                <div className="info-banner">
                  <div>
                    <h3>What to prepare before saving</h3>
                    <p>
                      App ID, App Secret, the correct tenant domain, imported scopes, bot capability enabled, long connection enabled,
                      and the message receive event required by OpenClaw.
                    </p>
                  </div>
                </div>
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

          {capability.guidedSetupKind === "wechat" ? (
            <Card>
              <CardContent className="panel-stack">
                <strong>WeChat workaround guidance</strong>
                <p className="card__description">SlackClaw uses the workaround plugin path for WeChat. Confirm the plugin package, then save the Corp ID, Agent ID, webhook token, and AES key.</p>
                <Textarea readOnly value={"openclaw plugins install @openclaw-china/wecom-app"} />
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
              {props.initialEntry?.pairingRequired ? <Badge tone="info">Pairing required</Badge> : null}
            </div>
            <div className="actions-row">
              {capability.id === "feishu" ? (
                <Button loading={busy === "prepare"} onClick={() => void applyChannelAction("prepare")} variant="outline">
                  {busy === "prepare" ? "Preparing..." : "Prepare"}
                </Button>
              ) : null}
              {capability.supportsLogin ? (
                <Button loading={busy === "login"} onClick={() => void applyChannelAction("login")} variant="outline">
                  {busy === "login" ? "Starting..." : "Start Login"}
                </Button>
              ) : null}
              {capability.id !== "whatsapp" ? (
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
  const { overview, setOverview } = useOverview();
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

  const channelsLocked = !(channelConfig?.baseOnboardingCompleted ?? overview?.channelSetup.baseOnboardingCompleted);

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
    if (!channelConfig?.activeSession?.id) {
      return;
    }

    const timer = window.setInterval(() => {
      void reloadChannelConfig();
    }, 1600);

    return () => window.clearInterval(timer);
  }, [channelConfig?.activeSession?.id]);

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

  async function handleCompleteOnboarding() {
    if (!overview) return;
    setBusy("onboarding");
    try {
      const profileId = overview.firstRun.selectedProfileId ?? overview.profiles[0]?.id;
      if (!profileId) return;
      const next = await completeOnboarding({ profileId });
      setOverview(next);
      setChannelConfig(undefined);
      await reloadChannelConfig({ fresh: true });
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveChannel(entry: ConfiguredChannelEntry) {
    setBusy(`remove:${entry.id}`);
    try {
      const result = await removeChannelEntry(entry.id);
      setChannelConfig(result.channelConfig);
      setChannelMessage(result.message);
    } finally {
      setBusy("");
    }
  }

  async function handleSetDefaultEntry(entry: SavedModelEntry) {
    setBusy("models:gateway");
    try {
      const result = await setDefaultModelEntry({ entryId: entry.id });
      setModelConfig(result.modelConfig);
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

      const result = await replaceFallbackModelEntries({ entryIds: nextFallbackIds });
      setModelConfig(result.modelConfig);
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveModelEntry(entry: SavedModelEntry) {
    if (!window.confirm(`Remove ${entry.label} from SlackClaw?`)) {
      return;
    }

    setBusy(`models:remove:${entry.id}`);
    try {
      const result = await removeSavedModelEntry(entry.id);
      setModelConfig(result.modelConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "SlackClaw could not remove this configured model.");
    } finally {
      setBusy("");
    }
  }

  const savedEntries = (modelConfig?.savedEntries ?? []).filter((entry) => !entry.id.startsWith("runtime:"));
  const runtimeModels = runtimeConfiguredModels(modelConfig);
  const runtimeModelsByKey = new Map(runtimeModels.map((model) => [model.key, model]));
  const runtimeOnlyModels = runtimeModels.filter((model) => !savedEntries.some((entry) => entry.modelKey === model.key));
  const configuredChannels = channelConfig?.entries ?? [];
  const modelBusy = busy.startsWith("models:");

  return (
    <div className="panel-stack">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button
            onClick={() =>
              void (activeTab === "channels"
                ? reloadChannelConfig({ fresh: true })
                : reloadModelConfig({ fresh: true }))
            }
            variant="outline"
            loading={activeTab === "channels" ? channelsLoading : modelsLoading}
          >
            <RefreshCw size={14} />
            {copy.refreshProviders}
          </Button>
        }
      />

      <Tabs defaultValue="models" value={activeTab} onValueChange={(value) => setActiveTab(value as "models" | "channels")}>
        <TabsList>
          <TabsTrigger value="models">{copy.modelsTab} ({runtimeModels.length})</TabsTrigger>
          <TabsTrigger value="channels">{copy.channelsTab} ({configuredChannels.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="panel-stack">
          {modelsLoading && !modelConfig ? (
            <LoadingPanel title="Loading AI models" description="SlackClaw is reading configured models from OpenClaw." />
          ) : null}

          {!modelsLoading && modelConfig ? (
            <>
          <InfoBanner icon={<Sparkles size={22} />} title={copy.modelsInfoTitle} description={copy.modelsInfoBody} />

          {savedEntries.length ? (
            <Card>
              <CardContent className="panel-stack">
                <div>
                  <strong>{copy.runtimeModelsTitle}</strong>
                  <p className="card__description">{copy.runtimeModelsBody}</p>
                </div>
                <div className="panel-stack">
                  {savedEntries.map((entry) => {
                    const provider = modelConfig?.providers.find((item) => item.id === entry.providerId);
                    const authLabel = entryAuthLabel(entry);
                    const duplicateActiveEntry = savedEntries.find(
                      (item) => item.id !== entry.id && item.modelKey === entry.modelKey && (item.isDefault || item.isFallback)
                    );
                    const runtimeModel = runtimeModelsByKey.get(entry.modelKey);
                    const fallbackTag = runtimeModel?.tags.find((item) => item.startsWith("fallback#"));

                    return (
                      <div className="configured-model-card" key={entry.id}>
                        <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                          <div className="actions-row">
                            <ProviderLogo label={provider?.label ?? entry.providerId} providerId={entry.providerId} />
                            <div className="provider-details">
                              <strong>{entry.label}</strong>
                              <span className="card__description">{provider?.label ?? entry.providerId}</span>
                              <div className="actions-row">
                                <Badge tone="info">{entry.modelKey}</Badge>
                                {entry.isDefault ? <Badge tone="success">Default</Badge> : null}
                                {entry.isFallback ? <Badge tone="info">Fallback</Badge> : null}
                                {fallbackTag ? <Badge tone="info">{fallbackTag.replace("#", " #")}</Badge> : null}
                                {authLabel ? <Badge tone="neutral">{authLabel}</Badge> : null}
                                {runtimeModel?.local ? <Badge tone="neutral">Local</Badge> : null}
                              </div>
                            </div>
                          </div>
                          <div className="actions-row">
                            {!entry.isDefault ? (
                              <Button disabled={modelBusy && busy !== "models:gateway"} loading={busy === "models:gateway"} onClick={() => void handleSetDefaultEntry(entry)} variant="outline">
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
                            <Button disabled={modelBusy && busy !== `models:remove:${entry.id}`} loading={busy === `models:remove:${entry.id}`} onClick={() => void handleRemoveModelEntry(entry)} variant="outline">
                              <Trash2 size={14} />
                              {busy === `models:remove:${entry.id}` ? "Removing..." : "Remove"}
                            </Button>
                            {provider?.docsUrl ? (
                              <Button onClick={() => window.open(provider.docsUrl, "_blank", "noopener,noreferrer")} variant="outline">
                                <ExternalLink size={14} />
                                {copy.docs}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                          <Card>
                            <CardContent className="panel-stack">
                              <span className="card__description">Provider</span>
                              <strong>{provider?.label ?? entry.providerId}</strong>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="panel-stack">
                              <span className="card__description">Authentication</span>
                              <strong>{entry.profileLabel ? `${authLabel ?? "Configured"} • ${entry.profileLabel}` : authLabel ?? "Configured"}</strong>
                            </CardContent>
                          </Card>
                        </div>
                        {duplicateActiveEntry && !entry.isDefault && !entry.isFallback ? (
                          <p className="card__description" style={{ marginTop: 16 }}>
                            Another saved entry with this same model is already active. Turning this one on will replace the active copy.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {runtimeOnlyModels.length ? (
            <Card>
              <CardContent className="panel-stack">
                <div>
                  <strong>{copy.runtimeOnlyTitle}</strong>
                  <p className="card__description">{copy.runtimeOnlyBody}</p>
                </div>
                <div className="panel-stack">
                  {runtimeOnlyModels.map((model) => {
                    const provider = modelConfig?.providers.find((item) =>
                      item.providerRefs.some((ref) => model.key.startsWith(ref))
                    );
                    const fallbackTag = model.tags.find((item) => item.startsWith("fallback#"));

                    return (
                      <div className="configured-model-card" key={model.key}>
                        <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                          <div className="actions-row">
                            <ProviderLogo label={provider?.label ?? model.key.split("/")[0]} providerId={provider?.id ?? model.key.split("/")[0] ?? "ai"} />
                            <div className="provider-details">
                              <strong>{model.name}</strong>
                              <span className="card__description">{provider?.label ?? model.key.split("/")[0]}</span>
                              <div className="actions-row">
                                <Badge tone="info">{model.key}</Badge>
                                {model.key === modelConfig?.defaultModel ? <Badge tone="success">Default</Badge> : null}
                                {fallbackTag ? <Badge tone="info">{fallbackTag.replace("#", " #")}</Badge> : null}
                                {model.local ? <Badge tone="neutral">Local</Badge> : null}
                                <Badge tone="warning">{copy.sourceInstalled}</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!savedEntries.length && !runtimeOnlyModels.length ? (
            <EmptyState
              title={copy.modelsEmptyTitle}
              description={copy.modelsEmptyBody}
            />
          ) : null}

          <Card>
            <CardContent className="actions-row" style={{ justifyContent: "center" }}>
              <Button
                onClick={() => {
                  setSelectedModelEntry(undefined);
                  setModelDialogOpen(true);
                }}
                variant="outline"
              >
                <KeyRound size={14} />
                {copy.addModel}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{overview?.channelSetup.baseOnboardingCompleted ? copy.onboardingDone : "Unlock channels"}</strong>
                <p className="card__description">
                  {overview?.channelSetup.baseOnboardingCompleted
                    ? "Channels are unlocked. Continue with Telegram, WhatsApp, Feishu, and WeChat."
                    : "Complete OpenClaw onboarding after models are configured to unlock channels."}
                </p>
              </div>
              <Button loading={busy === "onboarding"} onClick={handleCompleteOnboarding}>
                {busy === "onboarding" ? "Saving..." : copy.completeOnboarding}
              </Button>
            </CardContent>
          </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="channels" className="panel-stack">
          {channelsLoading && !channelConfig ? (
            <LoadingPanel title="Loading channels" description="SlackClaw is reading channel accounts and live channel status from OpenClaw." />
          ) : null}

          {!channelsLoading && channelConfig ? (
            <>
          <InfoBanner icon={<MessageCircle size={22} />} title={copy.channelsInfoTitle} description={copy.channelsInfoBody} />
          {channelsLocked ? (
            <InfoBanner accent="orange" title={copy.completeOnboardingFirst} description="SlackClaw only unlocks channels after OpenClaw onboarding succeeds." />
          ) : null}
          <Card>
            <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>Current channel configuration</strong>
                <p className="card__description">
                  {channelMessage || channelConfig?.gatewaySummary || "SlackClaw manages configured channels through the installed OpenClaw runtime."}
                </p>
              </div>
              <Button
                disabled={channelsLocked}
                onClick={openAddChannelDialog}
              >
                <Plus size={14} />
                Add Channel
              </Button>
            </CardContent>
          </Card>

          {channelConfig?.activeSession ? (
            <Card>
              <CardContent className="panel-stack">
                <div className="actions-row" style={{ justifyContent: "space-between" }}>
                  <strong>Active channel session</strong>
                  <Badge tone="info">{channelConfig.activeSession.channelId}</Badge>
                </div>
                <p className="card__description">{channelConfig.activeSession.message}</p>
                <Textarea readOnly value={channelConfig.activeSession.logs.join("\n")} />
              </CardContent>
            </Card>
          ) : null}

          {configuredChannels.length ? (
            <div className="panel-stack">
              {configuredChannels.map((entry) => {
                const capability = channelConfig?.capabilities.find((item) => item.id === entry.channelId);

                return (
                  <div className="configured-model-card" key={entry.id}>
                    <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                      <div className="actions-row">
                        <div className="provider-logo">{channelIcon(entry.channelId)}</div>
                        <div className="provider-details">
                          <strong>{entry.label}</strong>
                          <span className="card__description">{capability?.label ?? entry.channelId}</span>
                          <div className="actions-row">
                            <Badge tone={channelStatusTone(entry.status)}>{entry.status}</Badge>
                            {entry.pairingRequired ? <Badge tone="info">Pairing required</Badge> : null}
                            {capability?.officialSupport === false ? <Badge tone="warning">Workaround</Badge> : null}
                          </div>
                        </div>
                      </div>
                      <div className="actions-row">
                        <Button
                          onClick={() => openEditChannelDialog(entry)}
                          variant="outline"
                        >
                          {entry.pairingRequired ? "Continue Setup" : "Edit"}
                        </Button>
                        <Button loading={busy === `remove:${entry.id}`} onClick={() => void handleRemoveChannel(entry)} variant="outline">
                          <Trash2 size={14} />
                          {busy === `remove:${entry.id}` ? "Removing..." : "Remove"}
                        </Button>
                      </div>
                    </div>
                    <p className="card__description" style={{ marginTop: 14 }}>{entry.summary}</p>
                    {entry.maskedConfigSummary.length ? (
                      <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                        {entry.maskedConfigSummary.map((item) => (
                          <Card key={item.label}>
                            <CardContent className="panel-stack">
                              <span className="card__description">{item.label}</span>
                              <strong>{item.value}</strong>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No channels are configured yet"
              description="Add Telegram, WhatsApp, Feishu, or WeChat through the dialog to start managing communication channels in SlackClaw."
            />
          )}
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
    </div>
  );
}
