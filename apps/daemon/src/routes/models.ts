import type {
  LocalModelRuntimeActionResponse,
  LongRunningOperationSummary,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SetDefaultModelEntryRequest
} from "@chillclaw/contracts";

import { readJson, jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { ServerContext } from "./server-context.js";
import type { RouteDefinition } from "./types.js";

const matchModelEntry = createPathMatcher("/api/models/entries/:entryId");
const matchModelAuthSession = createPathMatcher("/api/models/auth/session/:sessionId");
const matchModelAuthSessionInput = createPathMatcher("/api/models/auth/session/:sessionId/input");

function localRuntimeOperation(
  action: "install" | "repair",
  status: "completed" | "failed",
  message: string,
  errorCode?: string
): LongRunningOperationSummary {
  const now = new Date().toISOString();
  return {
    operationId: "onboarding:localRuntime",
    action: `local-runtime-${action}`,
    status,
    phase: status === "completed" ? "completed" : "configuring-openclaw",
    message,
    startedAt: now,
    updatedAt: now,
    errorCode,
    retryable: status === "failed"
  };
}

async function decoratedModelConfig(context: ServerContext) {
  return context.localModelRuntimeService.decorateModelConfig(await context.adapter.config.getModelConfig());
}

async function publishModelAndOverview(
  context: ServerContext,
  modelConfig?: Awaited<ReturnType<typeof decoratedModelConfig>>
) {
  const effectiveModelConfig = modelConfig ?? (await decoratedModelConfig(context));
  const sync = context.eventPublisher.publishModelConfigUpdated(effectiveModelConfig);
  const overview = await context.overviewService.getOverview();
  context.eventPublisher.publishOverviewUpdated(overview);

  return {
    sync,
    modelConfig: effectiveModelConfig,
    overview
  };
}

export const modelsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/models/config"),
    freshReadInvalidationTargets: ["models"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await decoratedModelConfig(context));
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
      const result = await context.localModelRuntimeService.install();
      const { sync, modelConfig, overview } = await publishModelAndOverview(context);
      const onboarding =
        result.status === "completed"
          ? await context.onboardingService.adoptActiveLocalRuntimeModel(result.localRuntime)
          : undefined;
      const response: LocalModelRuntimeActionResponse = {
        action: "install",
        status: result.status,
        message: result.message,
        localRuntime: result.localRuntime,
        modelConfig,
        overview,
        onboarding,
        operation: localRuntimeOperation("install", result.status, result.message, result.status === "failed" ? "LOCAL_RUNTIME_FAILED" : undefined),
        ...sync
      };

      return jsonResponse(response);
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/local-runtime/repair"),
    async handle({ context }) {
      const result = await context.localModelRuntimeService.repair();
      const { sync, modelConfig, overview } = await publishModelAndOverview(context);
      const onboarding =
        result.status === "completed"
          ? await context.onboardingService.adoptActiveLocalRuntimeModel(result.localRuntime)
          : undefined;
      const response: LocalModelRuntimeActionResponse = {
        action: "repair",
        status: result.status,
        message: result.message,
        localRuntime: result.localRuntime,
        modelConfig,
        overview,
        onboarding,
        operation: localRuntimeOperation("repair", result.status, result.message, result.status === "failed" ? "LOCAL_RUNTIME_FAILED" : undefined),
        ...sync
      };

      return jsonResponse(response);
    }
  }
];
