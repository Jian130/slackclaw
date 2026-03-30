import assert from "node:assert/strict";
import test from "node:test";

import type { ModelAuthRequest, ModelCatalogEntry, ModelConfigOverview, SaveModelEntryRequest } from "@slackclaw/contracts";

import { buildBaseOnboardArgs } from "../config/openclaw-model-provider-catalog.js";
import { ModelsConfigCoordinator } from "./openclaw-models-config-coordinator.js";

type ModelsConfigAccess = ConstructorParameters<typeof ModelsConfigCoordinator>[0];

const MINIMAX_MODEL: ModelCatalogEntry = {
  key: "minimax/MiniMax-M2.7",
  name: "MiniMax M2.7",
  input: "text",
  contextWindow: 200000,
  local: false,
  available: true,
  tags: [],
  missing: false
};

function createEmptyModelConfig(): ModelConfigOverview {
  return {
    providers: [],
    models: [MINIMAX_MODEL],
    configuredModelKeys: [],
    savedEntries: [],
    defaultModel: undefined,
    defaultEntryId: undefined,
    fallbackEntryIds: []
  };
}

function createCoordinatorTestHarness(overrides: Partial<ModelsConfigAccess> = {}) {
  const runCalls: Array<{
    args: string[];
    options?: {
      allowFailure?: boolean;
      envOverrides?: Record<string, string | undefined>;
      input?: string;
    };
  }> = [];

  let adapterState: {
    modelEntries?: Array<{
      id: string;
      label: string;
      providerId: string;
      modelKey: string;
      agentId: string;
      agentDir?: string;
      workspaceDir?: string;
      authMethodId?: string;
      profileIds?: string[];
      isDefault: boolean;
      isFallback: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    defaultModelEntryId?: string;
    fallbackModelEntryIds?: string[];
  } = {
    modelEntries: [],
    defaultModelEntryId: undefined,
    fallbackModelEntryIds: []
  };

  const access: ModelsConfigAccess = {
    readModelSnapshot: async () => ({
      allModels: [MINIMAX_MODEL],
      configuredModels: [],
      configuredAuthProviders: new Set<string>(),
      supplemental: {}
    }),
    resolveCatalogModelKey: (models, raw) => models.find((entry) => entry.key === raw)?.key ?? raw?.trim() ?? undefined,
    isCleanModelRuntime: () => false,
    mergeModelCatalogEntries: (models) => models,
    buildModelConfigOverview: () => createEmptyModelConfig(),
    readAdapterState: async () => adapterState,
    writeAdapterState: async (state) => {
      adapterState = state;
    },
    ensureSavedModelState: async () => adapterState,
    reconcileSavedModelState: async (state) => state,
    buildEntryLabel: (label, _providerId, modelKey) => label ?? modelKey,
    mutationSyncMeta: () => ({ epoch: "test", revision: 1, settled: true }),
    getRuntimeModelAuthSession: () => undefined,
    setRuntimeModelAuthSession: () => undefined,
    resolveOpenClawCommand: async () => "openclaw",
    buildModelsCommandArgs: (args) => args,
    spawnInteractiveCommand: () => {
      throw new Error("not used");
    },
    appendAuthSessionOutput: () => undefined,
    writeErrorLog: async () => undefined,
    errorToLogDetails: (error) => error,
    readOpenClawConfigSnapshot: async () => ({
      configPath: "/tmp/openclaw.json",
      config: {},
      status: { agentDir: "/tmp/default-agent" }
    }),
    readEntryAuthSummary: async () => ({
      profileIds: [],
      authModeLabel: undefined,
      profileLabel: undefined
    }),
    replaceEntryProfileIds: async (_configPath, _config, entry) => ({
      ...entry,
      profileIds: ["minimax:slackclaw-test"],
      authModeLabel: "API key",
      profileLabel: "minimax"
    }),
    hasReusableAuthForSavedModelEntry: async () => false,
    normalizeStateFlags: (state) => state,
    isRuntimeDerivedModelEntryId: () => false,
    removeRuntimeDerivedModelEntry: async () => {
      throw new Error("not used");
    },
    cleanupRemovedSavedModelEntry: async () => undefined,
    syncRuntimeModelChain: async (nextState) => {
      adapterState = nextState;
      return nextState;
    },
    markGatewayApplyPending: async () => undefined,
    runMutationWithConfigFallback: async () => {
      throw new Error("not used");
    },
    writeDefaultModelConfig: async () => undefined,
    runOpenClaw: async (args, options) => {
      runCalls.push({ args, options });
      return { code: 0, stdout: "", stderr: "" };
    },
    ...overrides
  };

  return {
    coordinator: new ModelsConfigCoordinator(access),
    runCalls,
    getAdapterState: () => adapterState
  };
}

test("authenticateModelProvider uses OpenClaw onboarding for MiniMax CN API keys", async () => {
  const { coordinator, runCalls } = createCoordinatorTestHarness();
  const request: ModelAuthRequest = {
    providerId: "minimax",
    methodId: "minimax-api-key-cn",
    values: {
      apiKey: "sk-minimax-test"
    }
  };

  await coordinator.authenticateModelProvider(request);

  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0]?.args, [
    ...buildBaseOnboardArgs(),
    "--auth-choice",
    "minimax-cn-api",
    "--minimax-api-key",
    "sk-minimax-test"
  ]);
  assert.equal(runCalls[0]?.options?.input, undefined);
});

test("createSavedModelEntry uses OpenClaw onboarding for MiniMax global API keys", async () => {
  const { coordinator, runCalls, getAdapterState } = createCoordinatorTestHarness();
  const request: SaveModelEntryRequest = {
    label: "MiniMax",
    providerId: "minimax",
    methodId: "minimax-api",
    values: {
      apiKey: "sk-minimax-test"
    },
    modelKey: "minimax/MiniMax-M2.7"
  };

  await coordinator.createSavedModelEntry(request);

  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0]?.args, [
    ...buildBaseOnboardArgs(),
    "--auth-choice",
    "minimax-global-api",
    "--minimax-api-key",
    "sk-minimax-test"
  ]);
  assert.equal(runCalls[0]?.options?.input, undefined);
  assert.ok(runCalls[0]?.options?.envOverrides?.OPENCLAW_AGENT_DIR);
  assert.equal(getAdapterState().modelEntries?.[0]?.providerId, "minimax");
  assert.equal(getAdapterState().modelEntries?.[0]?.authMethodId, "minimax-api");
});
