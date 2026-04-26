import type {
  LocalModelRuntimeActionResponse,
  LocalModelRuntimeAction,
  LocalModelRuntimeOverview,
  LocalModelRuntimePhase,
  LocalModelRuntimeStatus,
  ModelCatalogEntry,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelConfigOverview,
  ModelProviderConfig,
  OperationSummary,
  ReplaceFallbackModelEntriesRequest,
  SavedModelEntry,
  SaveModelEntryRequest,
  SetDefaultModelEntryRequest
} from "@chillclaw/contracts";
import { createDefaultLocalModelRuntimeOverview } from "@chillclaw/contracts";

import { readJson, jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { ServerContext } from "./server-context.js";
import type { RouteDefinition } from "./types.js";
import { listModelProviderDefinitions, toPublicAuthMethod } from "../config/openclaw-model-provider-catalog.js";
import type { LocalModelRuntimeState } from "../services/state-store.js";

const matchModelEntry = createPathMatcher("/api/models/entries/:entryId");
const matchModelAuthSession = createPathMatcher("/api/models/auth/session/:sessionId");
const matchModelAuthSessionInput = createPathMatcher("/api/models/auth/session/:sessionId/input");
const MODEL_CONFIG_ROUTE_TIMEOUT_MS = 1_200;

const LOCAL_RUNTIME_OPERATION_ID = "onboarding:localRuntime";
const LOCAL_RUNTIME_PHASES = new Set<LocalModelRuntimePhase>([
  "inspecting-host",
  "installing-runtime",
  "starting-runtime",
  "downloading-model",
  "configuring-openclaw",
  "verifying"
]);

async function decoratedModelConfig(context: ServerContext) {
  return context.localModelRuntimeService.decorateModelConfig(await context.adapter.config.getModelConfig());
}

async function withRouteReadTimeout<T>(promise: Promise<T>, fallback: () => Promise<T>): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      void fallback().then(resolve, () => resolve(undefined as T));
    }, MODEL_CONFIG_ROUTE_TIMEOUT_MS);

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        void fallback().then(resolve, () => resolve(undefined as T));
      }
    );
  });
}

function fallbackLocalRuntime(localState: LocalModelRuntimeState | undefined): LocalModelRuntimeOverview {
  const base = createDefaultLocalModelRuntimeOverview();
  const modelKey = localState?.selectedModelKey?.trim();
  const activeInOpenClaw = Boolean(localState?.managedEntryId?.trim() && modelKey);
  const ready = localState?.status === "ready";

  return {
    ...base,
    supported: true,
    recommendation: "local",
    supportCode: "supported",
    status: localState?.status ?? base.status,
    runtimeInstalled: activeInOpenClaw || ready,
    runtimeReachable: ready,
    modelDownloaded: ready,
    activeInOpenClaw,
    chosenModelKey: modelKey,
    managedEntryId: localState?.managedEntryId,
    summary: ready ? "Local AI is ready on this Mac." : "ChillClaw is still checking local AI.",
    detail: ready
      ? "ChillClaw connected OpenClaw directly to the local Ollama runtime."
      : "The saved local runtime state is available while ChillClaw refreshes live OpenClaw status."
  };
}

function fallbackModelCatalogEntry(modelKey: string): ModelCatalogEntry {
  return {
    key: modelKey,
    name: modelKey.includes("/") ? modelKey.slice(modelKey.indexOf("/") + 1) : modelKey,
    input: "text",
    contextWindow: 8192,
    local: modelKey.startsWith("ollama/"),
    available: true,
    tags: ["default"],
    missing: false
  };
}

function fallbackSavedModelEntry(
  localState: LocalModelRuntimeState | undefined,
  now: string
): SavedModelEntry | undefined {
  const modelKey = localState?.selectedModelKey?.trim();
  const entryId = localState?.managedEntryId?.trim();
  if (!modelKey || !entryId) {
    return undefined;
  }

  return {
    id: entryId,
    label: "Local AI on this Mac",
    providerId: "ollama",
    modelKey,
    agentId: "",
    authMethodId: "ollama-local",
    authModeLabel: "Local runtime",
    isDefault: true,
    isFallback: false,
    createdAt: now,
    updatedAt: now
  };
}

function fallbackModelProviders(savedEntries: SavedModelEntry[]): ModelProviderConfig[] {
  const configuredProviders = new Set(savedEntries.map((entry) => entry.providerId));
  return listModelProviderDefinitions().map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    docsUrl: provider.docsUrl,
    providerRefs: provider.providerRefs,
    authMethods: provider.authMethods.map(toPublicAuthMethod),
    exampleModels: provider.exampleModels,
    authEnvVars: provider.authEnvVars,
    setupNotes: provider.setupNotes,
    warnings: provider.warnings,
    providerType: provider.providerType,
    supportsNoAuth: provider.supportsNoAuth,
    configured: configuredProviders.has(provider.id),
    modelCount: 0,
    sampleModels: provider.exampleModels?.slice(0, 5) ?? []
  }));
}

async function fallbackModelConfig(context: ServerContext): Promise<ModelConfigOverview> {
  const state = await context.store.read();
  const now = new Date().toISOString();
  const savedEntry = fallbackSavedModelEntry(state.localModelRuntime, now);
  const models = savedEntry ? [fallbackModelCatalogEntry(savedEntry.modelKey)] : [];
  const localRuntime = fallbackLocalRuntime(state.localModelRuntime);

  return {
    providers: fallbackModelProviders(savedEntry ? [savedEntry] : []),
    models,
    defaultModel: savedEntry?.modelKey,
    configuredModelKeys: savedEntry ? [savedEntry.modelKey] : [],
    localRuntime,
    savedEntries: savedEntry ? [savedEntry] : [],
    defaultEntryId: savedEntry?.id,
    fallbackEntryIds: []
  };
}

function normalizeLocalRuntimePhase(phase: string | undefined): LocalModelRuntimePhase | undefined {
  return phase && LOCAL_RUNTIME_PHASES.has(phase as LocalModelRuntimePhase)
    ? (phase as LocalModelRuntimePhase)
    : undefined;
}

function localRuntimeStatusForOperation(
  operation: OperationSummary,
  fallbackStatus: LocalModelRuntimeStatus
): LocalModelRuntimeStatus {
  if (operation.status === "failed") {
    return "failed";
  }
  if (operation.status === "completed") {
    return fallbackStatus === "ready" ? "ready" : "configuring-openclaw";
  }

  switch (normalizeLocalRuntimePhase(operation.phase)) {
    case "installing-runtime":
    case "starting-runtime":
    case "downloading-model":
    case "configuring-openclaw":
      return operation.phase as LocalModelRuntimeStatus;
    case "verifying":
      return "configuring-openclaw";
    case "inspecting-host":
    default:
      return fallbackStatus === "ready" ? "ready" : "installing-runtime";
  }
}

function localRuntimeWithOperation(
  localRuntime: LocalModelRuntimeOverview | undefined,
  action: LocalModelRuntimeAction,
  operation: OperationSummary
): LocalModelRuntimeOverview {
  const base = localRuntime ?? createDefaultLocalModelRuntimeOverview();
  const activePhase = normalizeLocalRuntimePhase(operation.phase);
  const operationActive = operation.status === "pending" || operation.status === "running" || operation.status === "timed-out";

  return {
    ...base,
    status: localRuntimeStatusForOperation(operation, base.status),
    activeAction: operationActive ? action : base.activeAction,
    activePhase: activePhase ?? base.activePhase,
    progressMessage: operation.message,
    progressPercent: operation.percent ?? base.progressPercent,
    lastProgressAt: operation.updatedAt
  };
}

async function publishModelAndOverview(
  context: ServerContext,
  modelConfig?: Awaited<ReturnType<typeof decoratedModelConfig>>
) {
  const effectiveModelConfig = modelConfig ?? (await withRouteReadTimeout(decoratedModelConfig(context), () => fallbackModelConfig(context)));
  const sync = context.eventPublisher.publishModelConfigUpdated(effectiveModelConfig);
  const overview = await context.overviewService.getOverview();
  context.eventPublisher.publishOverviewUpdated(overview);

  return {
    sync,
    modelConfig: effectiveModelConfig,
    overview
  };
}

async function localRuntimeActionSnapshotResponse(
  context: ServerContext,
  action: LocalModelRuntimeAction,
  operation: OperationSummary
): Promise<LocalModelRuntimeActionResponse> {
  const [modelConfig, overview] = await Promise.all([
    withRouteReadTimeout(decoratedModelConfig(context), () => fallbackModelConfig(context)),
    context.overviewService.getOverview({ includeLocalRuntime: true })
  ]);
  const localRuntime = localRuntimeWithOperation(modelConfig.localRuntime ?? overview.localRuntime, action, operation);
  const effectiveModelConfig = {
    ...modelConfig,
    localRuntime
  };
  const effectiveOverview = {
    ...overview,
    localRuntime
  };
  const sync = context.eventPublisher.publishModelConfigUpdated(effectiveModelConfig);
  context.eventPublisher.publishOverviewUpdated(effectiveOverview);

  return {
    action,
    status: operation.status,
    message: operation.message,
    localRuntime,
    modelConfig: effectiveModelConfig,
    overview: effectiveOverview,
    operation,
    ...sync
  };
}

async function runLocalRuntimeAction(
  context: ServerContext,
  action: LocalModelRuntimeAction
): Promise<Partial<OperationSummary>> {
  const result =
    action === "repair"
      ? await context.localModelRuntimeService.repair()
      : await context.localModelRuntimeService.install();
  await publishModelAndOverview(context);

  if (result.status === "completed") {
    await context.onboardingService.adoptActiveLocalRuntimeModel(result.localRuntime);
    return {
      phase: "completed",
      percent: 100,
      message: result.message,
      result: {
        kind: "resource",
        resource: "local-runtime",
        id: result.localRuntime.managedEntryId
      }
    };
  }

  throw Object.assign(new Error(result.message), {
    code: "LOCAL_RUNTIME_FAILED"
  });
}

export const modelsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/models/config"),
    freshReadInvalidationTargets: ["models"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await withRouteReadTimeout(decoratedModelConfig(context), () => fallbackModelConfig(context)));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveModelEntryRequest>(request);
      const result = await context.adapter.config.createSavedModelEntry(body);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync,
        settled: result.status === "interactive" ? false : sync.settled
      });
    }
  },
  {
    method: "PATCH",
    match: matchModelEntry,
    async handle({ context, request, params }) {
      const body = await readJson<SaveModelEntryRequest>(request);
      const result = await context.adapter.config.updateSavedModelEntry(params.entryId, body);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync,
        settled: result.status === "interactive" ? false : sync.settled
      });
    }
  },
  {
    method: "DELETE",
    match: matchModelEntry,
    async handle({ context, params }) {
      const result = await context.adapter.config.removeSavedModelEntry(params.entryId);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/default-entry"),
    async handle({ context, request }) {
      const body = await readJson<SetDefaultModelEntryRequest>(request);
      const result = await context.adapter.config.setDefaultModelEntry(body);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/fallbacks"),
    async handle({ context, request }) {
      const body = await readJson<ReplaceFallbackModelEntriesRequest>(request);
      const result = await context.adapter.config.replaceFallbackModelEntries(body);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/auth"),
    async handle({ context, request }) {
      const body = await readJson<ModelAuthRequest>(request);
      const result = await context.adapter.config.authenticateModelProvider(body);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync,
        settled: result.status === "interactive" ? false : sync.settled
      });
    }
  },
  {
    method: "GET",
    match: matchModelAuthSession,
    async handle({ context, params }) {
      return jsonResponse(await context.adapter.config.getModelAuthSession(params.sessionId));
    }
  },
  {
    method: "POST",
    match: matchModelAuthSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ModelAuthSessionInputRequest>(request);
      return jsonResponse(await context.adapter.config.submitModelAuthSessionInput(params.sessionId, body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/default"),
    async handle({ context, request }) {
      const body = await readJson<{ modelKey: string }>(request);
      const result = await context.adapter.config.setDefaultModel(body.modelKey);
      const { sync, modelConfig } = await publishModelAndOverview(
        context,
        await context.localModelRuntimeService.decorateModelConfig(result.modelConfig)
      );

      return jsonResponse({
        ...result,
        modelConfig,
        ...sync
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/local-runtime/install"),
    async handle({ context }) {
      const result = await context.operationRunner.startOrResume(
        {
          operationId: LOCAL_RUNTIME_OPERATION_ID,
          scope: "onboarding",
          resourceId: "ollama-local",
          action: "local-runtime-install",
          phase: "inspecting-host",
          percent: 5,
          message: "Preparing local AI on this Mac."
        },
        async ({ update }) => {
          await update({
            phase: "installing-runtime",
            percent: 12,
            message: "Preparing local AI on this Mac."
          });
          return runLocalRuntimeAction(context, "install");
        }
      );

      return jsonResponse(await localRuntimeActionSnapshotResponse(context, "install", result.operation));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/local-runtime/repair"),
    async handle({ context }) {
      const result = await context.operationRunner.startOrResume(
        {
          operationId: LOCAL_RUNTIME_OPERATION_ID,
          scope: "onboarding",
          resourceId: "ollama-local",
          action: "local-runtime-repair",
          phase: "inspecting-host",
          percent: 5,
          message: "Repairing local AI on this Mac."
        },
        async ({ update }) => {
          await update({
            phase: "starting-runtime",
            percent: 12,
            message: "Repairing local AI on this Mac."
          });
          return runLocalRuntimeAction(context, "repair");
        }
      );

      return jsonResponse(await localRuntimeActionSnapshotResponse(context, "repair", result.operation));
    }
  }
];
