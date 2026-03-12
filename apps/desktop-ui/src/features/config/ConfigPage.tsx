import { Copy, ExternalLink, KeyRound, Link2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ChannelActionResponse,
  ModelAuthSessionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  ProductOverview,
  SavedModelEntry
} from "@slackclaw/contracts";

import {
  approveFeishuPairing,
  approveTelegramPairing,
  approveWhatsappPairing,
  completeOnboarding,
  createSavedModelEntry,
  fetchModelAuthSession,
  fetchModelConfig,
  prepareFeishuChannel,
  replaceFallbackModelEntries,
  setDefaultModelEntry,
  setupFeishuChannel,
  setupTelegramChannel,
  setupWechatWorkaround,
  startGatewayAfterChannels,
  startWhatsappLogin,
  updateSavedModelEntry,
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
import { PageHeader } from "../../shared/ui/PageHeader.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/Tabs.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";

const providerGlyphs: Record<string, string> = {
  openai: "OA",
  "openai-codex": "OC",
  anthropic: "AN",
  gemini: "GE",
  google: "GE",
  github: "GH",
  githubcopilot: "GH",
  "github-copilot": "GH",
  feishu: "飞"
};

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

export function modelOptions(modelConfig: ModelConfigOverview | undefined, provider: ModelProviderConfig | undefined) {
  if (!modelConfig || !provider) return [];
  return modelConfig.models.filter((model) =>
    provider.providerRefs.some((ref) => model.key.startsWith(`${ref.replace(/\/$/, "")}/`))
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

export function providerIcon(providerId: string) {
  return providerGlyphs[providerId] ?? providerId.slice(0, 2).toUpperCase();
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

async function pasteInto(setter: (value: string) => void) {
  if (!navigator.clipboard?.readText) return;
  const value = await navigator.clipboard.readText();
  setter(value);
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

      return props.initialEntry?.modelKey ?? providerActiveModel(props.modelConfig, provider) ?? models[0]?.key ?? "";
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
              <div className="provider-logo">{providerIcon(item.id)}</div>
              <div className="provider-details">
                <strong>{item.label}</strong>
                <span className="card__description">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel-stack">
          <div className="info-banner">
            <div className="provider-logo">{providerIcon(provider.id)}</div>
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
              <Select id="model-key" onChange={(event) => setModelKey(event.target.value)} value={modelKey}>
                {models.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </Select>
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
                        <Button disabled={busy === "input"} onClick={handleSessionInput}>
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
              <Button disabled={!modelKey || busy === "save" || Boolean(validationError)} onClick={handleSave}>
                {busy === "save" ? "Saving..." : isEdit ? "Save Changes" : "Save Entry"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function FeishuDialog(props: { open: boolean; onClose: () => void; onConfigured: (result: ChannelActionResponse) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [domain, setDomain] = useState("feishu");
  const [botName, setBotName] = useState("SlackClaw Assistant");
  const [busy, setBusy] = useState(false);
  const lastStep = 6;

  async function handleSave() {
    setBusy(true);
    try {
      const result = await setupFeishuChannel({
        appId,
        appSecret,
        domain,
        botName
      });
      await props.onConfigured(result);
      props.onClose();
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog description="Follow the official OpenClaw Feishu flow and save credentials into the installed engine." onClose={props.onClose} open={props.open} title="Set Up Feishu Channel" wide>
      <div className="panel-stack">
        <div className="actions-row" style={{ justifyContent: "space-between" }}>
          <Badge tone="info">Step {step} / {lastStep}</Badge>
          <div className="actions-row">
            <Button disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} variant="outline">
              Back
            </Button>
            <Button disabled={step === lastStep} onClick={() => setStep((current) => Math.min(lastStep, current + 1))} variant="outline">
              Continue
            </Button>
          </div>
        </div>

        {step === 1 ? (
          <Card>
            <CardContent className="panel-stack">
              <strong>Create a Feishu app</strong>
              <p className="card__description">Create a custom enterprise app in the Feishu developer console before pasting credentials back into SlackClaw.</p>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardContent className="field-grid field-grid--two">
              <div>
                <FieldLabel htmlFor="feishu-app-id">App ID</FieldLabel>
                <div className="actions-row">
                  <Input id="feishu-app-id" onChange={(event) => setAppId(event.target.value)} value={appId} />
                  <Button onClick={() => void pasteInto(setAppId)} variant="outline">
                    Paste
                  </Button>
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="feishu-app-secret">App Secret</FieldLabel>
                <div className="actions-row">
                  <Input id="feishu-app-secret" onChange={(event) => setAppSecret(event.target.value)} type="password" value={appSecret} />
                  <Button onClick={() => void pasteInto(setAppSecret)} variant="outline">
                    Paste
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardContent className="panel-stack">
              <strong>Configure permissions</strong>
              <p className="card__description">Use batch import in Feishu and paste this exact OpenClaw scope set.</p>
              <Textarea readOnly value={feishuScopes} />
              <Button onClick={() => void copyText(feishuScopes)} variant="outline">
                <Copy size={14} />
                Copy batch import config
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card>
            <CardContent className="field-grid field-grid--two">
              <div>
                <FieldLabel htmlFor="feishu-domain">Domain</FieldLabel>
                <Select id="feishu-domain" onChange={(event) => setDomain(event.target.value)} value={domain}>
                  <option value="feishu">feishu</option>
                  <option value="lark">lark</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="feishu-bot-name">Bot name</FieldLabel>
                <Input id="feishu-bot-name" onChange={(event) => setBotName(event.target.value)} value={botName} />
              </div>
              <p className="card__description" style={{ gridColumn: "1 / -1" }}>
                Enable Bot Capability in Feishu before moving to the OpenClaw configuration step.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {step === 5 ? (
          <Card>
            <CardContent className="panel-stack">
              <strong>Configure OpenClaw</strong>
              <p className="card__description">SlackClaw will write the Feishu channel configuration into the installed OpenClaw and then you can approve pairing.</p>
              <Button disabled={busy || !appId || !appSecret} onClick={handleSave}>
                {busy ? "Configuring..." : "Configure Feishu in OpenClaw"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {step === 6 ? (
          <Card>
            <CardContent className="panel-stack">
              <strong>Gateway and test</strong>
              <p className="card__description">After saving credentials, restart the gateway in the Channels tab and approve the Feishu pairing code from SlackClaw.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Dialog>
  );
}

export default function ConfigPage() {
  const { locale } = useLocale();
  const copy = t(locale).config;
  const { overview, refresh, setOverview } = useOverview();
  const [modelConfig, setModelConfig] = useState<ModelConfigOverview>();
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [selectedModelEntry, setSelectedModelEntry] = useState<SavedModelEntry>();
  const [feishuPrepareOpen, setFeishuPrepareOpen] = useState(false);
  const [feishuSetupOpen, setFeishuSetupOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramAccountName, setTelegramAccountName] = useState("");
  const [telegramPairingCode, setTelegramPairingCode] = useState("");
  const [whatsappPairingCode, setWhatsappPairingCode] = useState("");
  const [feishuPairingCode, setFeishuPairingCode] = useState("");
  const [wechatCorpId, setWechatCorpId] = useState("");
  const [wechatAgentId, setWechatAgentId] = useState("");
  const [wechatSecret, setWechatSecret] = useState("");
  const [wechatToken, setWechatToken] = useState("");
  const [wechatEncodingKey, setWechatEncodingKey] = useState("");
  const [channelMessage, setChannelMessage] = useState("");
  const [busy, setBusy] = useState<"" | "onboarding" | "telegram" | "telegram-pair" | "whatsapp" | "whatsapp-pair" | "feishu-prepare" | "feishu-pair" | "wechat" | "gateway">("");

  const channelsLocked = !overview?.channelSetup.baseOnboardingCompleted;

  useEffect(() => {
    void reloadModelConfig();
  }, []);

  async function reloadModelConfig() {
    const next = await fetchModelConfig();
    setModelConfig(next);
    return next;
  }

  async function handleCompleteOnboarding() {
    if (!overview) return;
    setBusy("onboarding");
    try {
      const profileId = overview.firstRun.selectedProfileId ?? overview.profiles[0]?.id;
      if (!profileId) return;
      const next = await completeOnboarding({ profileId });
      setOverview(next);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleTelegram() {
    setBusy("telegram");
    try {
      const result = await setupTelegramChannel({ token: telegramToken, accountName: telegramAccountName });
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleTelegramPairing() {
    setBusy("telegram-pair");
    try {
      const result = await approveTelegramPairing({ code: telegramPairingCode });
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleWhatsappLogin() {
    setBusy("whatsapp");
    try {
      const result = await startWhatsappLogin();
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleWhatsappPairing() {
    setBusy("whatsapp-pair");
    try {
      const result = await approveWhatsappPairing({ code: whatsappPairingCode });
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleFeishuPrepare() {
    setBusy("feishu-prepare");
    try {
      const result = await prepareFeishuChannel();
      setChannelMessage(result.message);
      await refresh();
      setFeishuPrepareOpen(false);
      setFeishuSetupOpen(true);
    } finally {
      setBusy("");
    }
  }

  async function handleFeishuPairing() {
    setBusy("feishu-pair");
    try {
      const result = await approveFeishuPairing({ code: feishuPairingCode });
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleWechat() {
    setBusy("wechat");
    try {
      const result = await setupWechatWorkaround({
        pluginSpec: "@openclaw-china/wecom-app",
        corpId: wechatCorpId,
        agentId: wechatAgentId,
        secret: wechatSecret,
        token: wechatToken,
        encodingAesKey: wechatEncodingKey
      });
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleGateway() {
    setBusy("gateway");
    try {
      const result = await startGatewayAfterChannels();
      setChannelMessage(result.message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleSetDefaultEntry(entry: SavedModelEntry) {
    setBusy("gateway");
    try {
      await setDefaultModelEntry({ entryId: entry.id });
      await reloadModelConfig();
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleToggleFallback(entry: SavedModelEntry) {
    if (!modelConfig) return;

    setBusy("gateway");
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

      await replaceFallbackModelEntries({ entryIds: nextFallbackIds });
      await reloadModelConfig();
      await refresh();
    } finally {
      setBusy("");
    }
  }

  const savedEntries = (modelConfig?.savedEntries ?? []).filter((entry) => !entry.id.startsWith("runtime:"));
  const runtimeModels = runtimeConfiguredModels(modelConfig);

  return (
    <div className="panel-stack">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button onClick={() => void reloadModelConfig()} variant="outline">
            <RefreshCw size={14} />
            {copy.refreshProviders}
          </Button>
        }
      />

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">{copy.modelsTab} ({runtimeModels.length})</TabsTrigger>
          <TabsTrigger value="channels">{copy.channelsTab} ({overview?.channelSetup.channels.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="panel-stack">
          <InfoBanner icon={<Sparkles size={22} />} title={copy.modelsInfoTitle} description={copy.modelsInfoBody} />

          {runtimeModels.length ? (
            <Card>
              <CardContent className="panel-stack">
                <div>
                  <strong>{copy.runtimeModelsTitle}</strong>
                  <p className="card__description">{copy.runtimeModelsBody}</p>
                </div>
                <div className="panel-stack">
                  {runtimeModels.map((model) => {
                    const provider = modelConfig?.providers.find((item) =>
                      item.providerRefs.some((ref) => model.key.startsWith(ref))
                    );
                    const fallbackTag = model.tags.find((item) => item.startsWith("fallback#"));

                    return (
                      <div className="configured-model-card" key={model.key}>
                        <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                          <div className="actions-row">
                            <div className="provider-logo">{providerIcon(provider?.id ?? model.key.split("/")[0] ?? "ai")}</div>
                            <div className="provider-details">
                              <strong>{model.name}</strong>
                              <span className="card__description">{provider?.label ?? model.key.split("/")[0]}</span>
                              <div className="actions-row">
                                <Badge tone="info">{model.key}</Badge>
                                {model.key === modelConfig?.defaultModel ? <Badge tone="success">Default</Badge> : null}
                                {fallbackTag ? <Badge tone="info">{fallbackTag.replace("#", " #")}</Badge> : null}
                                {model.local ? <Badge tone="neutral">Local</Badge> : null}
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

          {savedEntries.length ? (
            <div className="panel-stack">
              <div>
                <strong>{copy.savedEntriesTitle}</strong>
                <p className="card__description">{copy.savedEntriesBody}</p>
              </div>
              {savedEntries.map((entry) => {
                const provider = modelConfig?.providers.find((item) => item.id === entry.providerId);
                const authLabel = entryAuthLabel(entry);
                const duplicateActiveEntry = savedEntries.find(
                  (item) => item.id !== entry.id && item.modelKey === entry.modelKey && (item.isDefault || item.isFallback)
                );

                return (
                  <div className="configured-model-card" key={entry.id}>
                    <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                      <div className="actions-row">
                        <div className="provider-logo">{providerIcon(entry.providerId)}</div>
                        <div className="provider-details">
                          <strong>{entry.label}</strong>
                          <span className="card__description">{provider?.label ?? entry.providerId}</span>
                          <div className="actions-row">
                            <Badge tone="info">{entry.modelKey}</Badge>
                            {entry.isDefault ? <Badge tone="success">Default</Badge> : null}
                            {entry.isFallback ? <Badge tone="info">Fallback</Badge> : null}
                            {authLabel ? <Badge tone="neutral">{authLabel}</Badge> : null}
                          </div>
                        </div>
                      </div>
                      <div className="actions-row">
                        {!entry.isDefault ? (
                          <Button disabled={busy === "gateway"} onClick={() => void handleSetDefaultEntry(entry)} variant="outline">
                            Set Default
                          </Button>
                        ) : null}
                        <Button
                          disabled={entry.isDefault || busy === "gateway"}
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
          ) : (
            <EmptyState
              title="No AI models are saved yet"
              description="Add your first saved model entry to configure credentials, default model, and fallback behavior."
            />
          )}

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
              <Button disabled={busy === "onboarding"} onClick={handleCompleteOnboarding}>
                {busy === "onboarding" ? "Saving..." : copy.completeOnboarding}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="panel-stack">
          <InfoBanner icon={<MessageCircle size={22} />} title={copy.channelsInfoTitle} description={copy.channelsInfoBody} />
          {channelsLocked ? (
            <InfoBanner accent="orange" title={copy.completeOnboardingFirst} description="SlackClaw only unlocks channels after OpenClaw onboarding succeeds." />
          ) : null}

          <div className="channel-grid">
            <div className="channel-card">
              <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                <div className="actions-row">
                  <div className="channel-logo">TG</div>
                  <div className="channel-details">
                    <strong>{copy.telegram}</strong>
                    <span className="card__description">Configure the Telegram bot token, then approve pairing.</span>
                  </div>
                </div>
                <StatusBadge overview={overview} channelId="telegram" />
              </div>
              <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                <div>
                  <FieldLabel htmlFor="telegram-token">Telegram bot token</FieldLabel>
                  <Input id="telegram-token" onChange={(event) => setTelegramToken(event.target.value)} value={telegramToken} />
                </div>
                <div>
                  <FieldLabel htmlFor="telegram-name">Account name</FieldLabel>
                  <Input id="telegram-name" onChange={(event) => setTelegramAccountName(event.target.value)} value={telegramAccountName} />
                </div>
                <div>
                  <FieldLabel htmlFor="telegram-pair">Pairing code</FieldLabel>
                  <Input id="telegram-pair" onChange={(event) => setTelegramPairingCode(event.target.value)} value={telegramPairingCode} />
                </div>
              </div>
              <div className="actions-row" style={{ marginTop: 18 }}>
                <Button disabled={channelsLocked || busy === "telegram"} onClick={handleTelegram}>
                  {busy === "telegram" ? "Saving..." : "Save Telegram"}
                </Button>
                <Button disabled={channelsLocked || busy === "telegram-pair"} onClick={handleTelegramPairing} variant="outline">
                  {busy === "telegram-pair" ? "Approving..." : "Approve Telegram Pairing"}
                </Button>
              </div>
            </div>

            <div className="channel-card">
              <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                <div className="actions-row">
                  <div className="channel-logo">WA</div>
                  <div className="channel-details">
                    <strong>{copy.whatsapp}</strong>
                    <span className="card__description">Start the login flow, then paste the pairing code from OpenClaw.</span>
                  </div>
                </div>
                <StatusBadge overview={overview} channelId="whatsapp" />
              </div>
              <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                <div>
                  <FieldLabel htmlFor="whatsapp-pair">Pairing code</FieldLabel>
                  <Input id="whatsapp-pair" onChange={(event) => setWhatsappPairingCode(event.target.value)} value={whatsappPairingCode} />
                </div>
              </div>
              <div className="actions-row" style={{ marginTop: 18 }}>
                <Button disabled={channelsLocked || busy === "whatsapp"} onClick={handleWhatsappLogin}>
                  {busy === "whatsapp" ? "Starting..." : "Start WhatsApp Login"}
                </Button>
                <Button disabled={channelsLocked || busy === "whatsapp-pair"} onClick={handleWhatsappPairing} variant="outline">
                  {busy === "whatsapp-pair" ? "Approving..." : "Approve WhatsApp Pairing"}
                </Button>
              </div>
            </div>

            <div className="channel-card">
              <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                <div className="actions-row">
                  <div className="channel-logo">飞</div>
                  <div className="channel-details">
                    <strong>{copy.feishu}</strong>
                    <span className="card__description">Use the official OpenClaw Feishu flow: prepare, configure, approve pairing, then restart the gateway.</span>
                  </div>
                </div>
                <StatusBadge overview={overview} channelId="feishu" />
              </div>
              <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                <div>
                  <FieldLabel htmlFor="feishu-pair">Pairing code</FieldLabel>
                  <Input id="feishu-pair" onChange={(event) => setFeishuPairingCode(event.target.value)} value={feishuPairingCode} />
                </div>
              </div>
              <div className="actions-row" style={{ marginTop: 18 }}>
                <Button disabled={channelsLocked || busy === "feishu-prepare"} onClick={() => setFeishuPrepareOpen(true)}>
                  {busy === "feishu-prepare" ? "Preparing..." : "Prepare Feishu"}
                </Button>
                <Button disabled={channelsLocked} onClick={() => setFeishuSetupOpen(true)} variant="outline">
                  Configure Feishu
                </Button>
                <Button disabled={channelsLocked || busy === "feishu-pair"} onClick={handleFeishuPairing} variant="outline">
                  {busy === "feishu-pair" ? "Approving..." : "Approve Feishu Pairing"}
                </Button>
              </div>
            </div>

            <div className="channel-card">
              <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                <div className="actions-row">
                  <div className="channel-logo">WX</div>
                  <div className="channel-details">
                    <strong>{copy.wechat}</strong>
                    <span className="card__description">Experimental workaround path. SlackClaw stores the current workaround values and sends them through the daemon.</span>
                  </div>
                </div>
                <StatusBadge overview={overview} channelId="wechat" />
              </div>
              <div className="field-grid field-grid--two" style={{ marginTop: 18 }}>
                <div>
                  <FieldLabel htmlFor="wechat-corp">Corp ID</FieldLabel>
                  <Input id="wechat-corp" onChange={(event) => setWechatCorpId(event.target.value)} value={wechatCorpId} />
                </div>
                <div>
                  <FieldLabel htmlFor="wechat-agent">Agent ID</FieldLabel>
                  <Input id="wechat-agent" onChange={(event) => setWechatAgentId(event.target.value)} value={wechatAgentId} />
                </div>
                <div>
                  <FieldLabel htmlFor="wechat-secret">Secret</FieldLabel>
                  <Input id="wechat-secret" onChange={(event) => setWechatSecret(event.target.value)} value={wechatSecret} />
                </div>
                <div>
                  <FieldLabel htmlFor="wechat-token">Webhook token</FieldLabel>
                  <Input id="wechat-token" onChange={(event) => setWechatToken(event.target.value)} value={wechatToken} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel htmlFor="wechat-encoding">Encoding AES key</FieldLabel>
                  <Input id="wechat-encoding" onChange={(event) => setWechatEncodingKey(event.target.value)} value={wechatEncodingKey} />
                </div>
              </div>
              <div className="actions-row" style={{ marginTop: 18 }}>
                <Button disabled={channelsLocked || busy === "wechat"} onClick={handleWechat}>
                  {busy === "wechat" ? "Saving..." : "Configure WeChat Workaround"}
                </Button>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>Gateway and test</strong>
                <p className="card__description">{channelMessage || "Restart the gateway after channels are configured."}</p>
              </div>
              <Button disabled={channelsLocked || busy === "gateway"} onClick={handleGateway}>
                {busy === "gateway" ? "Restarting..." : copy.gatewayStart}
              </Button>
            </CardContent>
          </Card>
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

      <Dialog
        description={copy.feishuPrepareBody}
        onClose={() => setFeishuPrepareOpen(false)}
        open={feishuPrepareOpen}
        title={copy.feishuPrepareTitle}
      >
        <div className="panel-stack">
          <Textarea readOnly value={"openclaw plugins install @openclaw/feishu"} />
          <Button disabled={busy === "feishu-prepare"} onClick={handleFeishuPrepare}>
            {busy === "feishu-prepare" ? "Preparing..." : "Prepare Feishu Channel"}
          </Button>
        </div>
      </Dialog>

      <FeishuDialog
        onClose={() => setFeishuSetupOpen(false)}
        onConfigured={async (result) => {
          setChannelMessage(result.message);
          await refresh();
        }}
        open={feishuSetupOpen}
      />
    </div>
  );
}

function StatusBadge(props: { overview?: ProductOverview; channelId: string }) {
  const channel = props.overview?.channelSetup.channels.find((item) => item.id === props.channelId);
  const tone =
    channel?.status === "completed" || channel?.status === "ready"
      ? "success"
      : channel?.status === "failed"
        ? "warning"
        : "neutral";

  return <Badge tone={tone}>{channel?.status ?? "not-started"}</Badge>;
}
