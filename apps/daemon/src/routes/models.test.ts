import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultProductOverview,
  type LocalModelRuntimeActionResponse,
  type LocalModelRuntimeOverview,
  type ModelConfigOverview,
  type OperationSummary
} from "@chillclaw/contracts";

import { modelsRoutes } from "./models.js";
import type { ServerContext } from "./server-context.js";
import type { OperationWorker } from "../services/operation-runner.js";

function emptyModelConfig(localRuntime?: LocalModelRuntimeOverview): ModelConfigOverview {
  return {
    providers: [],
    models: [],
    configuredModelKeys: [],
    savedEntries: [],
    fallbackEntryIds: [],
    localRuntime
  };
}

test("local runtime install route accepts work and adopts the active local model in the worker", async () => {
  const route = modelsRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/models/local-runtime/install"));
  assert.ok(route);

  const localRuntime: LocalModelRuntimeOverview = {
    supported: true,
    recommendation: "local",
    supportCode: "supported",
    status: "ready",
    runtimeInstalled: true,
    runtimeReachable: true,
    modelDownloaded: true,
    activeInOpenClaw: true,
    chosenModelKey: "ollama/gemma4:e2b",
    managedEntryId: "runtime:ollama-gemma4-e2b",
    summary: "Local AI is ready on this Mac.",
    detail: "OpenClaw is already pointed at the local Ollama runtime."
  };
  let adoptedRuntime: LocalModelRuntimeOverview | undefined;
  let installCalls = 0;
  let capturedWorker: OperationWorker | undefined;
  const modelConfig = emptyModelConfig(localRuntime);
  const productOverview = { ...createDefaultProductOverview(), localRuntime };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: Omit<OperationSummary, "status" | "startedAt" | "updatedAt">,
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        return {
          operation: {
            ...request,
            status: "running" as const,
            startedAt: "2026-04-26T00:00:00.000Z",
            updatedAt: "2026-04-26T00:00:00.000Z"
          },
          accepted: true,
          alreadyRunning: false
        };
      }
    },
    localModelRuntimeService: {
      install: async () => {
        installCalls += 1;
        return {
          status: "completed" as const,
          message: "Local AI is ready on this Mac.",
          localRuntime
        };
      },
      decorateModelConfig: async () => modelConfig
    },
    adapter: {
      config: {
        getModelConfig: async () => emptyModelConfig()
      }
    },
    eventPublisher: {
      publishModelConfigUpdated: () => ({
        epoch: "epoch-1",
        revision: 1,
        settled: true
      }),
      publishOverviewUpdated: () => undefined
    },
    overviewService: {
      getOverview: async () => productOverview
    },
    onboardingService: {
      adoptActiveLocalRuntimeModel: async (runtime: LocalModelRuntimeOverview) => {
        adoptedRuntime = runtime;
        return {
          firstRun: {
            introCompleted: true,
            setupCompleted: false
          },
          draft: {
            currentStep: "model" as const,
            install: {
              installed: true,
              version: "2026.4.5",
              disposition: "installed-managed" as const
            },
            model: {
              providerId: "ollama",
              methodId: "ollama-local",
              modelKey: "ollama/gemma4:e2b",
              entryId: "runtime:ollama-gemma4-e2b"
            }
          },
          config: {
            modelProviders: [],
            channels: [],
            employeePresets: []
          },
          summary: {
            model: {
              providerId: "ollama",
              modelKey: "ollama/gemma4:e2b",
              entryId: "runtime:ollama-gemma4-e2b"
            }
          },
          localRuntime
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: {} as never,
    requestUrl: new URL("http://127.0.0.1/api/models/local-runtime/install"),
    pathname: "/api/models/local-runtime/install",
    params: {}
  });
  const body = response.body as LocalModelRuntimeActionResponse;

  assert.equal(installCalls, 0);
  assert.equal(body.status, "running");
  assert.equal(body.operation?.operationId, "onboarding:localRuntime");
  assert.equal(body.localRuntime.activeAction, "install");
  assert.ok(capturedWorker);

  const workerResult = await capturedWorker({
    operation: body.operation as OperationSummary,
    update: async (patch) => ({
      ...(body.operation as OperationSummary),
      ...patch,
      updatedAt: "2026-04-26T00:00:01.000Z"
    })
  });

  assert.equal(workerResult?.phase, "completed");
  assert.equal(workerResult?.result?.id, "runtime:ollama-gemma4-e2b");
  assert.equal(installCalls, 1);
  assert.equal(adoptedRuntime, localRuntime);
});

test("model config route falls back to persisted local runtime state when live reads hang", async () => {
  const route = modelsRoutes.find((candidate) => candidate.method === "GET" && candidate.match("/api/models/config"));
  assert.ok(route);

  const context = {
    store: {
      read: async () => ({
        localModelRuntime: {
          managedEntryId: "local-entry",
          selectedModelKey: "ollama/gemma4:e2b",
          status: "ready" as const
        }
      })
    },
    localModelRuntimeService: {
      decorateModelConfig: async () => new Promise<ModelConfigOverview>(() => undefined)
    },
    adapter: {
      config: {
        getModelConfig: async () => new Promise<ModelConfigOverview>(() => undefined)
      }
    }
  } as unknown as ServerContext;

  const startedAt = Date.now();
  const response = await route.handle({
    context,
    request: {} as never,
    requestUrl: new URL("http://127.0.0.1/api/models/config"),
    pathname: "/api/models/config",
    params: {}
  });
  const body = response.body as ModelConfigOverview;

  assert.ok(Date.now() - startedAt < 1_800);
  assert.equal(body.defaultEntryId, "local-entry");
  assert.equal(body.savedEntries[0]?.modelKey, "ollama/gemma4:e2b");
  assert.equal(body.localRuntime?.status, "ready");
});
