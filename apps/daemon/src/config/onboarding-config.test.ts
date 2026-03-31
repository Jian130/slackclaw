import test from "node:test";
import assert from "node:assert/strict";

import { providerDefinitionById, toPublicAuthMethod } from "./openclaw-model-provider-catalog.js";
import { resolveOnboardingUiConfig } from "./onboarding-config.js";

test("onboarding config sources provider auth methods from the shared model provider catalog", () => {
  const config = resolveOnboardingUiConfig();
  const modelStudio = config.modelProviders.find((provider) => provider.id === "modelstudio");
  const openAI = config.modelProviders.find((provider) => provider.id === "openai");
  const miniMax = config.modelProviders.find((provider) => provider.id === "minimax");

  const modelStudioCatalog = providerDefinitionById("modelstudio");
  const openAICatalog = providerDefinitionById("openai");
  const miniMaxCatalog = providerDefinitionById("minimax");

  assert.ok(modelStudio);
  assert.ok(openAI);
  assert.ok(miniMax);
  assert.ok(modelStudioCatalog);
  assert.ok(openAICatalog);
  assert.ok(miniMaxCatalog);

  assert.deepEqual(modelStudio.authMethods, modelStudioCatalog.authMethods.map(toPublicAuthMethod));
  assert.deepEqual(openAI.authMethods, openAICatalog.authMethods.map(toPublicAuthMethod));
  assert.deepEqual(miniMax.authMethods, miniMaxCatalog.authMethods.map(toPublicAuthMethod));
});
