import type {
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SetDefaultModelEntryRequest
} from "@slackclaw/contracts";

import { readJson, jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchModelEntry = createPathMatcher("/api/models/entries/:entryId");
const matchModelAuthSession = createPathMatcher("/api/models/auth/session/:sessionId");
const matchModelAuthSessionInput = createPathMatcher("/api/models/auth/session/:sessionId/input");

export const modelsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/models/config"),
    freshReadInvalidationTargets: ["models"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.adapter.config.getModelConfig());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/models/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveModelEntryRequest>(request);
      const result = await context.adapter.config.createSavedModelEntry(body);
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
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
      const sync = context.eventPublisher.publishModelConfigUpdated(result.modelConfig);

      return jsonResponse({
        ...result,
        ...sync
      });
    }
  }
];
