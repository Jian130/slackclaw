import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChannelCapability, ConfiguredChannelEntry, ModelConfigOverview, ModelProviderConfig } from "@chillclaw/contracts";

import {
  activeSavedModelEntries,
  applyModelEntryRole,
  ChannelStatusBadge,
  channelIcon,
  channelStatusTone,
  configuredChannelActionState,
  defaultModelEntryRole,
  entryAuthLabel,
  feishuDirectLinks,
  feishuGuideSteps,
  MODEL_KEY_CUSTOM_OPTION,
  modelSelectValue,
  modelOptions,
  providerActiveModel,
  providerConfiguredModels,
  providerIcon,
  runtimeConfiguredModels,
  runtimeDerivedModelEntry,
  shouldCloseChannelDialogAfterAction,
  resolveModelEntryRole,
  validateModelEntryDraft
} from "./ConfigPage.js";

const provider: ModelProviderConfig = {
  id: "openai",
  label: "OpenAI",
  description: "Test provider",
  docsUrl: "https://docs.openclaw.ai/providers/docs/openai",
  providerRefs: ["openai/"],
  authMethods: [
    {
      id: "api-key",
      label: "API Key",
      kind: "api-key",
      description: "Paste an API key.",
      interactive: false,
      fields: [
        {
          id: "apiKey",
          label: "API Key",
          required: true,
          secret: true
        }
      ]
    }
  ],
  configured: true,
  modelCount: 2,
  sampleModels: ["openai/gpt-4o-mini", "openai/gpt-5"]
};

const modelConfig: ModelConfigOverview = {
  providers: [provider],
  models: [
    {
      key: "openai/gpt-4o-mini",
      name: "GPT-4o Mini",
      input: "text",
      contextWindow: 128000,
      local: false,
      available: true,
      tags: ["configured"],
      missing: false
    },
    {
      key: "openai/gpt-5",
      name: "GPT-5",
      input: "text",
      contextWindow: 400000,
      local: false,
      available: true,
      tags: ["default", "configured"],
      missing: false
    }
  ],
  defaultModel: "openai/gpt-5",
  configuredModelKeys: ["openai/gpt-4o-mini", "openai/gpt-5"],
  savedEntries: [],
  defaultEntryId: undefined,
  fallbackEntryIds: []
};

const telegramCapability: ChannelCapability = {
  id: "telegram",
  label: "Telegram",
  description: "Telegram bot setup.",
  officialSupport: true,
  iconKey: "telegram",
  fieldDefs: [],
  supportsEdit: true,
  supportsRemove: true,
  supportsPairing: true,
  supportsLogin: false
};

const wechatWorkCapability: ChannelCapability = {
  id: "wechat-work",
  label: "WeChat Work (WeCom)",
  description: "WeChat Work setup.",
  officialSupport: true,
  iconKey: "wechat",
  fieldDefs: [],
  supportsEdit: true,
  supportsRemove: true,
  supportsPairing: true,
  supportsLogin: false,
  guidedSetupKind: "wechat-work"
};

const wechatCapability: ChannelCapability = {
  id: "wechat",
  label: "WeChat",
  description: "Personal WeChat login.",
  officialSupport: false,
  iconKey: "wechat",
  fieldDefs: [{ id: "code", label: "Pairing code", required: false }],
  supportsEdit: true,
  supportsRemove: true,
  supportsPairing: true,
  supportsLogin: true,
  guidedSetupKind: "wechat"
};

const configuredTelegramEntry: ConfiguredChannelEntry = {
  id: "telegram:default",
  channelId: "telegram",
  label: "Telegram Support",
  status: "completed",
  summary: "Telegram bot configured.",
  detail: "Telegram bot configured.",
  maskedConfigSummary: [],
  editableValues: {},
  pairingRequired: false,
  lastUpdatedAt: "2026-03-25T00:00:00.000Z"
};

describe("ConfigPage helpers", () => {
  it("filters models by provider refs", () => {
    expect(modelOptions(modelConfig, provider).map((model) => model.key)).toEqual([
      "openai/gpt-4o-mini",
      "openai/gpt-5"
    ]);
  });

  it("resolves configured and active provider models", () => {
    expect(providerConfiguredModels(modelConfig, provider)).toEqual([
      "openai/gpt-4o-mini",
      "openai/gpt-5"
    ]);
    expect(providerActiveModel(modelConfig, provider)).toBe("openai/gpt-5");
  });

  it("orders runtime-configured models with default first and fallback tags after", () => {
    expect(
      runtimeConfiguredModels({
        ...modelConfig,
        models: [
          ...modelConfig.models,
          {
            key: "openai/gpt-4.1",
            name: "GPT-4.1",
            input: "text",
            contextWindow: 128000,
            local: false,
            available: true,
            tags: ["fallback#2", "configured"],
            missing: false
          }
        ],
        configuredModelKeys: ["openai/gpt-4o-mini", "openai/gpt-5", "openai/gpt-4.1"]
      }).map((model) => model.key)
    ).toEqual(["openai/gpt-5", "openai/gpt-4.1", "openai/gpt-4o-mini"]);
  });

  it("keeps only saved model entries that still match the live runtime", () => {
    const runtimeModels = runtimeConfiguredModels({
      ...modelConfig,
      models: [
        {
          key: "anthropic/claude-opus-4-6",
          name: "Claude Opus 4.6",
          input: "text+image",
          contextWindow: 977000,
          local: false,
          available: true,
          tags: ["default", "configured"],
          missing: false
        }
      ],
      defaultModel: "anthropic/claude-opus-4-6",
      configuredModelKeys: ["anthropic/claude-opus-4-6"]
    });
    const savedEntries = [
      {
        id: "saved-openai",
        label: "OpenAI GPT-5",
        providerId: "openai",
        modelKey: "openai/gpt-5",
        agentId: "main",
        isDefault: false,
        isFallback: false,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z"
      },
      {
        id: "saved-anthropic",
        label: "Claude Opus 4.6",
        providerId: "anthropic",
        modelKey: "anthropic/claude-opus-4-6",
        agentId: "main",
        isDefault: true,
        isFallback: false,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z"
      }
    ];

    expect(activeSavedModelEntries(savedEntries, runtimeModels).map((entry) => entry.id)).toEqual(["saved-anthropic"]);
  });

  it("finds the synthetic runtime entry used for removing runtime-only models", () => {
    const runtimeEntry = {
      id: "runtime:openai-gpt-5",
      label: "OpenAI GPT-5",
      providerId: "openai",
      modelKey: "openai/gpt-5",
      agentId: "",
      isDefault: true,
      isFallback: false,
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z"
    };

    expect(runtimeDerivedModelEntry([runtimeEntry], "openai/gpt-5")?.id).toBe("runtime:openai-gpt-5");
    expect(runtimeDerivedModelEntry([runtimeEntry], "anthropic/claude-sonnet-4-6")).toBeUndefined();
  });

  it("falls back to provider sample models when the runtime has none for that provider", () => {
    const anthropicProvider: ModelProviderConfig = {
      ...provider,
      id: "anthropic",
      label: "Anthropic",
      providerRefs: ["anthropic/"],
      sampleModels: ["anthropic/claude-opus-4-6"]
    };

    expect(modelOptions(modelConfig, anthropicProvider).map((model) => model.key)).toEqual(["anthropic/claude-opus-4-6"]);
  });

  it("uses a real select value for known model keys and falls back to custom for unknown keys", () => {
    const models = modelOptions(modelConfig, provider);

    expect(modelSelectValue(models, "openai/gpt-5")).toBe("openai/gpt-5");
    expect(modelSelectValue(models, "openai/custom-preview-model")).toBe(MODEL_KEY_CUSTOM_OPTION);
  });

  it("defaults a new entry only when no live runtime model is configured", () => {
    expect(defaultModelEntryRole(0)).toBe("default");
    expect(defaultModelEntryRole(1)).toBe("normal");
  });

  it("uses stable provider glyphs for known providers", () => {
    expect(providerIcon("github-copilot")).toBe("GH");
    expect(providerIcon("openai")).toBe("OA");
    expect(channelIcon("telegram")).toBe("TG");
    expect(channelIcon("wechat-work")).toBe("WC");
  });

  it("renders configured channel status through StatusBadge semantics", () => {
    const html = renderToStaticMarkup(<ChannelStatusBadge status="awaiting-pairing" />);

    expect(html).toContain("badge--status");
    expect(html).toContain("badge--info");
    expect(html).toContain("awaiting-pairing");
  });

  it("maps channel statuses to stable badge tones", () => {
    expect(channelStatusTone("completed")).toBe("success");
    expect(channelStatusTone("awaiting-pairing")).toBe("info");
    expect(channelStatusTone("failed")).toBe("warning");
    expect(channelStatusTone("not-started")).toBe("neutral");
  });

  it("shows a reusable approve action for pairing-capable configured channels", () => {
    expect(configuredChannelActionState(configuredTelegramEntry, telegramCapability)).toEqual({
      primaryAction: "edit",
      showApproveAction: true
    });

    expect(
      configuredChannelActionState(
        {
          ...configuredTelegramEntry,
          pairingRequired: true
        },
        telegramCapability
      )
    ).toEqual({
      primaryAction: "continue-setup",
      showApproveAction: true
    });

    expect(configuredChannelActionState(configuredTelegramEntry, wechatWorkCapability)).toEqual({
      primaryAction: "edit",
      showApproveAction: true
    });

    expect(
      configuredChannelActionState(
        {
          ...configuredTelegramEntry,
          channelId: "wechat",
          status: "awaiting-pairing"
        } as ConfiguredChannelEntry,
        wechatCapability
      )
    ).toEqual({
      primaryAction: "continue-setup",
      showApproveAction: true
    });
  });

  it("closes the channel dialog after successful approve pairing", () => {
    expect(shouldCloseChannelDialogAfterAction("approve-pairing", "telegram", false)).toBe(true);
    expect(shouldCloseChannelDialogAfterAction("save", "whatsapp", true)).toBe(false);
    expect(shouldCloseChannelDialogAfterAction("login", "telegram", false)).toBe(false);
  });

  it("validates required API key inputs before save", () => {
    expect(validateModelEntryDraft(provider.authMethods[0], {}, "normal")).toBeUndefined();
    expect(validateModelEntryDraft(provider.authMethods[0], {}, "default")).toBe("API Key is required.");
    expect(validateModelEntryDraft(provider.authMethods[0], { apiKey: "short" }, "default")).toBe("API Key looks too short.");
    expect(validateModelEntryDraft(provider.authMethods[0], { apiKey: "sk test spaces" }, "fallback")).toBe("API Key cannot contain spaces.");
    expect(validateModelEntryDraft(provider.authMethods[0], { apiKey: "sk-valid-key-123" }, "default")).toBeUndefined();
  });

  it("maps roles between UI selection and runtime flags", () => {
    expect(resolveModelEntryRole(false, false)).toBe("normal");
    expect(resolveModelEntryRole(true, false)).toBe("default");
    expect(resolveModelEntryRole(false, true)).toBe("fallback");
    expect(applyModelEntryRole("normal")).toEqual({ makeDefault: false, useAsFallback: false });
    expect(applyModelEntryRole("default")).toEqual({ makeDefault: true, useAsFallback: false });
    expect(applyModelEntryRole("fallback")).toEqual({ makeDefault: false, useAsFallback: true });
  });

  it("falls back to auth method ids when auth mode labels are missing", () => {
    expect(entryAuthLabel({ authMethodId: "openai-api-key", authModeLabel: undefined })).toBe("API key");
    expect(entryAuthLabel({ authMethodId: "openai-oauth", authModeLabel: undefined })).toBe("OAuth");
    expect(entryAuthLabel({ authMethodId: "openai-api-key", authModeLabel: "API key" })).toBe("API key");
  });

  it("keeps the Feishu guide steps visible in the dialog flow", () => {
    expect(feishuGuideSteps.length).toBeGreaterThanOrEqual(7);
    expect(feishuGuideSteps[0]).toContain("Feishu Open Platform");
    expect(feishuGuideSteps.some((step) => step.includes("long connection"))).toBe(true);
    expect(feishuGuideSteps.some((step) => step.includes("pairing"))).toBe(true);
  });

  it("keeps direct Feishu links available for guided setup", () => {
    expect(feishuDirectLinks.map((link) => link.url)).toContain("https://open.feishu.cn/app");
    expect(feishuDirectLinks.map((link) => link.url)).toContain("https://open.larksuite.com/app");
    expect(feishuDirectLinks.map((link) => link.url)).toContain("https://docs.openclaw.ai/channels/feishu");
  });
});
