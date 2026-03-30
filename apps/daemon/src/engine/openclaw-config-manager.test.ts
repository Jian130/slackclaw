import assert from "node:assert/strict";
import test from "node:test";

import type { ModelAuthRequest, ModelConfigActionResponse } from "@slackclaw/contracts";

import { OpenClawConfigManager } from "./openclaw-config-manager.js";
import { InMemorySecretsAdapter, modelAuthSecretName } from "../platform/secrets-adapter.js";

test("config manager stores model auth secrets through the secrets adapter before delegating", async () => {
  const calls: ModelAuthRequest[] = [];
  const secrets = new InMemorySecretsAdapter();
  const response: ModelConfigActionResponse = {
    epoch: "daemon-local",
    revision: 0,
    settled: true,
    status: "completed",
    message: "Saved",
    modelConfig: {
      providers: [],
      models: [],
      configuredModelKeys: [],
      savedEntries: [],
      defaultModel: undefined,
      defaultEntryId: undefined,
      fallbackEntryIds: []
    }
  };

  const manager = new OpenClawConfigManager(
    {
      getModelConfig: async () => response.modelConfig,
      createSavedModelEntry: async () => response,
      updateSavedModelEntry: async () => response,
      removeSavedModelEntry: async () => response,
      setDefaultModelEntry: async () => response,
      replaceFallbackModelEntries: async () => response,
      authenticateModelProvider: async (request) => {
        calls.push(request);
        return response;
      },
      getModelAuthSession: async () => {
        throw new Error("not used");
      },
      submitModelAuthSessionInput: async () => {
        throw new Error("not used");
      },
      setDefaultModel: async () => response,
      getChannelState: async () => {
        throw new Error("not used");
      },
      getConfiguredChannelEntries: async () => [],
      saveChannelEntry: async () => {
        throw new Error("not used");
      },
      removeChannelEntry: async () => {
        throw new Error("not used");
      },
      getSkillRuntimeCatalog: async () => {
        throw new Error("not used");
      },
      getInstalledSkillDetail: async () => {
        throw new Error("not used");
      },
      listMarketplaceInstalledSkills: async () => [],
      exploreSkillMarketplace: async () => [],
      searchSkillMarketplace: async () => [],
      getSkillMarketplaceDetail: async () => {
        throw new Error("not used");
      },
      installMarketplaceSkill: async () => ({}),
      updateMarketplaceSkill: async () => ({}),
      saveCustomSkill: async () => ({ slug: "custom-skill" }),
      removeInstalledSkill: async () => ({}),
      installManagedSkill: async () => ({}),
      verifyManagedSkill: async () => undefined
    },
    {
      secrets,
      resolveModelAuthSecretFieldIds: (providerId, methodId) =>
        providerId === "openai" && methodId === "api-key" ? ["apiKey"] : []
    }
  );

  const request: ModelAuthRequest = {
    providerId: "openai",
    methodId: "api-key",
    values: {
      apiKey: "sk-test-123",
      ignored: "leave-me-out"
    }
  };

  await manager.authenticateModelProvider(request);

  assert.deepEqual(calls, [request]);
  assert.equal(await secrets.get(modelAuthSecretName("openai", "api-key", "apiKey")), "sk-test-123");
  assert.equal(await secrets.get(modelAuthSecretName("openai", "api-key", "ignored")), undefined);
});
