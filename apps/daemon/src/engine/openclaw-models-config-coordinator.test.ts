import assert from "node:assert/strict";
import test from "node:test";

import type { ModelAuthRequest, ModelCatalogEntry, ModelConfigOverview, SaveModelEntryRequest } from "@chillclaw/contracts";

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
  const interactiveCalls: Array<{
    command: string;
    args: string[];
    envOverrides?: Record<string, string | undefined>;
  }> = [];
  const loggedCommands: Array<{ command: string; args: string[] }> = [];

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
    logExternalCommand: (command, args) => {
      loggedCommands.push({ command, args });
    },
    spawnInteractiveCommand: (command, args, envOverrides) => {
      interactiveCalls.push({ command, args, envOverrides });
      return {
        stdout: { on: () => undefined },
        stderr: { on: () => undefined },
        stdin: { write: () => undefined, destroyed: false },
        on: () => undefined,
        exitCode: null
      };
    },
    appendAuthSessionOutput: () => undefined,
    writeErrorLog: async () => undefined,
    errorToLogDetails: (error) => error,
    readOpenClawConfigSnapshot: async () => ({
      configPath: "/tmp/openclaw.json",
      config: {},
      status: { agentDir: "/tmp/default-agent" }
    }),
    writeOpenClawConfigSnapshot: async () => undefined,
    readAuthStore: async () => ({
      version: 1,
      profiles: {},
      usageStats: {},
      order: {},
      lastGood: {}
    }),
    writeAuthStore: async () => undefined,
    upsertAgentConfigEntry: async () => undefined,
    hasReusableAuthForSavedModelEntry: async () => false,
    normalizeStateFlags: (state) => state,
    isRuntimeDerivedModelEntryId: () => false,
    removeRuntimeDerivedModelFromConfig: () => ({
      changed: false,
      remainingModelKeys: [],
      removedDefault: false
    }),
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
    interactiveCalls,
    loggedCommands,
    runCalls,
    getAdapterState: () => adapterState,
    setAdapterState: (state: typeof adapterState) => {
      adapterState = state;
    }
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

test("authenticateModelProvider starts MiniMax global OAuth with an explicit method and logs the interactive command", async () => {
  const { coordinator, interactiveCalls, loggedCommands } = createCoordinatorTestHarness();
  const request: ModelAuthRequest = {
    providerId: "minimax",
    methodId: "minimax-portal",
    values: {}
  };

  const result = await coordinator.authenticateModelProvider(request);

  assert.equal(result.status, "interactive");
  assert.equal(interactiveCalls.length, 1);
  assert.deepEqual(interactiveCalls[0], {
    command: "openclaw",
    args: ["models", "auth", "login", "--provider", "minimax-portal", "--method", "oauth"],
    envOverrides: undefined
  });
  assert.deepEqual(loggedCommands, [
    {
      command: "openclaw",
      args: ["models", "auth", "login", "--provider", "minimax-portal", "--method", "oauth"]
    }
  ]);
});

test("canReuseSavedModelEntry treats runtime-derived local entries as reusable even when auth metadata is missing", async () => {
  const { coordinator, setAdapterState } = createCoordinatorTestHarness({
    isRuntimeDerivedModelEntryId: (entryId) => entryId.startsWith("runtime:")
  });

  setAdapterState({
    modelEntries: [
      {
        id: "runtime:ollama-gemma4-e2b",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e2b",
        agentId: "",
        agentDir: "",
        workspaceDir: "",
        authMethodId: undefined,
        profileIds: [],
        isDefault: true,
        isFallback: false,
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }
    ],
    defaultModelEntryId: "runtime:ollama-gemma4-e2b",
    fallbackModelEntryIds: []
  });

  const reusable = await coordinator.canReuseSavedModelEntry("runtime:ollama-gemma4-e2b");
  assert.equal(reusable, true);
});

test("authenticateModelProvider starts MiniMax China OAuth with an explicit method", async () => {
  const { coordinator, interactiveCalls, loggedCommands } = createCoordinatorTestHarness();
  const request: ModelAuthRequest = {
    providerId: "minimax",
    methodId: "minimax-portal-cn",
    values: {}
  };

  const result = await coordinator.authenticateModelProvider(request);

  assert.equal(result.status, "interactive");
  assert.equal(interactiveCalls.length, 1);
  assert.deepEqual(interactiveCalls[0], {
    command: "openclaw",
    args: ["models", "auth", "login", "--provider", "minimax-portal", "--method", "oauth-cn"],
    envOverrides: undefined
  });
  assert.deepEqual(loggedCommands, [
    {
      command: "openclaw",
      args: ["models", "auth", "login", "--provider", "minimax-portal", "--method", "oauth-cn"]
    }
  ]);
});

test("upsertManagedLocalModelEntry configures an Ollama default without starting interactive auth", async () => {
  let gatewayApplyMarks = 0;
  const configWrites: Array<Record<string, unknown>> = [];
  const { coordinator, interactiveCalls, runCalls, getAdapterState } = createCoordinatorTestHarness({
    markGatewayApplyPending: async () => {
      gatewayApplyMarks += 1;
    },
    readOpenClawConfigSnapshot: async () => ({
      configPath: "/tmp/openclaw.json",
      config: {
        agents: {
          defaults: {
            models: {}
          }
        }
      },
      status: { agentDir: "/tmp/default-agent", aliases: {} }
    }),
    writeOpenClawConfigSnapshot: async (_configPath, config) => {
      configWrites.push(structuredClone(config) as Record<string, unknown>);
    },
    buildModelConfigOverview: (_allModels, _configuredModels, _configuredAuthProviders, modelEntries, defaultEntryId, fallbackEntryIds) => ({
      ...createEmptyModelConfig(),
      localRuntime: {
        supported: true,
        recommendation: "local",
        supportCode: "supported",
        status: "ready",
        runtimeInstalled: true,
        runtimeReachable: true,
        modelDownloaded: true,
        activeInOpenClaw: true,
        chosenModelKey: "ollama/gemma4:e4b",
        summary: "Local AI is ready on this Mac.",
        detail: "ChillClaw connected OpenClaw to the local Ollama runtime."
      },
      savedEntries: modelEntries,
      defaultEntryId,
      fallbackEntryIds,
      configuredModelKeys: modelEntries.map((entry) => entry.modelKey),
      defaultModel: modelEntries.find((entry) => entry.id === defaultEntryId)?.modelKey
    })
  });

  const result = await coordinator.upsertManagedLocalModelEntry({
    label: "Local AI on this Mac",
    providerId: "ollama",
    methodId: "ollama-local",
    modelKey: "ollama/gemma4:e4b",
    entryId: "managed-ollama-entry"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.requiresGatewayApply, true);
  assert.equal(interactiveCalls.length, 0);
  assert.equal(runCalls.length, 0);
  assert.equal(gatewayApplyMarks, 1);
  assert.equal(getAdapterState().defaultModelEntryId, "managed-ollama-entry");
  assert.equal(getAdapterState().modelEntries?.[0]?.providerId, "ollama");
  assert.equal(getAdapterState().modelEntries?.[0]?.authMethodId, "ollama-local");

  const writtenConfig = configWrites.at(-1) as
    | {
        models?: {
          mode?: string;
          providers?: {
            ollama?: {
              baseUrl?: string;
              api?: string;
              apiKey?: string;
              models?: Array<Record<string, unknown>>;
            };
          };
        };
      }
    | undefined;
  assert.equal(writtenConfig?.models?.mode, "merge");
  assert.deepEqual(writtenConfig?.models?.providers?.ollama, {
    baseUrl: "http://127.0.0.1:11434",
    api: "ollama",
    apiKey: "ollama-local",
    models: [
      {
        id: "gemma4:e4b",
        name: "gemma4:e4b",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0
        },
        contextWindow: 131072,
        maxTokens: 8192
      }
    ]
  });
});

test("getModelSelection resolves the default model from config aliases without loading the full catalog", async () => {
  const { coordinator, setAdapterState } = createCoordinatorTestHarness({
    readOpenClawConfigSnapshot: async () => ({
      configPath: "/tmp/openclaw.json",
      config: {
        agents: {
          defaults: {
            model: "starter-local"
          }
        }
      },
      status: {
        agentDir: "/tmp/default-agent",
        aliases: {
          "starter-local": "ollama/gemma4:e4b"
        }
      }
    })
  });

  setAdapterState({
    modelEntries: [
      {
        id: "managed-ollama-entry",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e4b",
        agentId: "",
        agentDir: "",
        workspaceDir: "",
        authMethodId: "ollama-local",
        profileIds: [],
        isDefault: true,
        isFallback: false,
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z"
      }
    ],
    defaultModelEntryId: "managed-ollama-entry",
    fallbackModelEntryIds: []
  });

  const selection = await coordinator.getModelSelection();

  assert.equal(selection.defaultEntryId, "managed-ollama-entry");
  assert.equal(selection.defaultModel, "ollama/gemma4:e4b");
  assert.equal(selection.savedEntries.length, 1);
});

test("removeSavedModelEntry removes a runtime-derived default entry through coordinator-owned runtime cleanup", async () => {
  const configWrites: Array<Record<string, unknown>> = [];
  let pendingMarked = 0;
  const { coordinator, getAdapterState, setAdapterState } = createCoordinatorTestHarness({
    writeOpenClawConfigSnapshot: async (_configPath, config) => {
      configWrites.push(structuredClone(config) as Record<string, unknown>);
    },
    readOpenClawConfigSnapshot: async () => ({
      configPath: "/tmp/openclaw.json",
      config: {
        agents: {
          defaults: {
            model: {
              primary: "minimax/MiniMax-M2.7",
              fallbacks: []
            },
            models: {
              "minimax/MiniMax-M2.7": {}
            }
          }
        }
      },
      status: { agentDir: "/tmp/default-agent", aliases: {} }
    }),
    isRuntimeDerivedModelEntryId: (entryId) => entryId.startsWith("runtime:"),
    removeRuntimeDerivedModelFromConfig: (config, _status, modelKey) => {
      if (config.agents?.defaults?.models) {
        delete config.agents.defaults.models[modelKey];
        if (Object.keys(config.agents.defaults.models).length === 0) {
          delete config.agents.defaults.models;
        }
      }

      if (config.agents?.defaults) {
        delete config.agents.defaults.model;
      }

      return {
        changed: true,
        remainingModelKeys: [],
        removedDefault: true
      };
    },
    markGatewayApplyPending: async () => {
      pendingMarked += 1;
    }
  });

  setAdapterState({
    modelEntries: [
      {
        id: "runtime:minimax-minimax-m2-7",
        label: "MiniMax M2.7",
        providerId: "minimax",
        modelKey: "minimax/MiniMax-M2.7",
        agentId: "",
        agentDir: "",
        workspaceDir: "",
        authMethodId: undefined,
        profileIds: [],
        isDefault: true,
        isFallback: false,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z"
      }
    ],
    defaultModelEntryId: "runtime:minimax-minimax-m2-7",
    fallbackModelEntryIds: []
  });

  const result = await coordinator.removeSavedModelEntry("runtime:minimax-minimax-m2-7");

  assert.equal(result.requiresGatewayApply, true);
  assert.match(result.message, /removed from OpenClaw/);
  assert.equal(pendingMarked, 1);
  assert.equal(getAdapterState().modelEntries?.length ?? 0, 0);
  assert.equal(getAdapterState().defaultModelEntryId, undefined);
  assert.equal(configWrites.length, 1);
  assert.deepEqual(configWrites[0], {
    agents: {
      defaults: {}
    }
  });
});
