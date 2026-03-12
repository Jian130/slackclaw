import { describe, expect, it } from "vitest";
import type { ModelConfigOverview, ModelProviderConfig } from "@slackclaw/contracts";

import {
  applyModelEntryRole,
  entryAuthLabel,
  modelOptions,
  providerActiveModel,
  providerConfiguredModels,
  providerIcon,
  runtimeConfiguredModels,
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

  it("uses stable provider glyphs for known providers", () => {
    expect(providerIcon("github-copilot")).toBe("GH");
    expect(providerIcon("openai")).toBe("OA");
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
});
