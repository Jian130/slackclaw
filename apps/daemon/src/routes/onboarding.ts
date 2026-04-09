import type {
  ChannelSessionInputRequest,
  CompleteOnboardingRequest,
  InstallRequest,
  ModelAuthSessionInputRequest,
  OnboardingEmployeeState,
  OnboardingStepNavigationRequest,
  SaveChannelEntryRequest,
  SaveModelEntryRequest
} from "@chillclaw/contracts";

import { performance } from "node:perf_hooks";

import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import { formatConsoleLine } from "../services/logger.js";
import type { RouteDefinition } from "./types.js";

const matchOnboardingModelAuthSession = createPathMatcher("/api/onboarding/model/auth/session/:sessionId");
const matchOnboardingModelAuthSessionInput = createPathMatcher("/api/onboarding/model/auth/session/:sessionId/input");
const matchOnboardingChannelEntry = createPathMatcher("/api/onboarding/channel/entries/:entryId");
const matchOnboardingChannelSession = createPathMatcher("/api/onboarding/channel/session/:sessionId");
const matchOnboardingChannelSessionInput = createPathMatcher("/api/onboarding/channel/session/:sessionId/input");

export const onboardingRoutes: RouteDefinition[] = [
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/intro"),
    async handle({ context }) {
      return jsonResponse(await context.setupService.markIntroCompleted());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/onboarding/state"),
    async handle({ context }) {
      const t0 = performance.now();
      const result = await context.onboardingService.getState();
      console.log(formatConsoleLine(`GET /api/onboarding/state: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "route" }));
      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/navigate"),
    async handle({ context, request }) {
      const body = await readJson<OnboardingStepNavigationRequest>(request);
      return jsonResponse(await context.onboardingService.navigateStep(body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/detect"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.detectRuntime());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/install"),
    async handle({ context, request }) {
      const body = await readJson<InstallRequest>(request);
      return jsonResponse(await context.onboardingService.installRuntime({ forceLocal: body.forceLocal ?? true }));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/reuse"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.reuseDetectedRuntime());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/update"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.updateRuntime());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/permissions/confirm"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.confirmPermissions());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/model/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveModelEntryRequest>(request);
      return jsonResponse(await context.onboardingService.saveModelEntry(body));
    }
  },
  {
    method: "GET",
    match: matchOnboardingModelAuthSession,
    async handle({ context, params }) {
      return jsonResponse(await context.onboardingService.getModelAuthSession(params.sessionId));
    }
  },
  {
    method: "POST",
    match: matchOnboardingModelAuthSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ModelAuthSessionInputRequest>(request);
      return jsonResponse(await context.onboardingService.submitModelAuthSessionInput(params.sessionId, body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/channel/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      return jsonResponse(await context.onboardingService.saveChannelEntry(undefined, body));
    }
  },
  {
    method: "PATCH",
    match: matchOnboardingChannelEntry,
    async handle({ context, request, params }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      return jsonResponse(await context.onboardingService.saveChannelEntry(params.entryId, body));
    }
  },
  {
    method: "GET",
    match: matchOnboardingChannelSession,
    async handle({ context, params }) {
      return jsonResponse(await context.onboardingService.getChannelSession(params.sessionId));
    }
  },
  {
    method: "POST",
    match: matchOnboardingChannelSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ChannelSessionInputRequest>(request);
      return jsonResponse(await context.onboardingService.submitChannelSessionInput(params.sessionId, body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/employee"),
    async handle({ context, request }) {
      const body = await readJson<OnboardingEmployeeState>(request);
      return jsonResponse(await context.onboardingService.saveEmployeeDraft(body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/model/reset"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.resetModelDraft());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/channel/reset"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.resetChannelDraft());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/reset"),
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.reset());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/complete"),
    async handle({ context, request }) {
      const body = await readJson<CompleteOnboardingRequest>(request);
      return jsonResponse(await context.onboardingService.complete(body));
    }
  }
];
