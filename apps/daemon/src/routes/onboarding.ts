import type {
  ChannelSessionInputRequest,
  CompleteOnboardingRequest,
  InstallRequest,
  ModelAuthSessionInputRequest,
  OnboardingEmployeeState,
  OnboardingStepNavigationRequest,
  SaveChannelEntryRequest,
  SaveModelEntryRequest
} from "@slackclaw/contracts";

import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchOnboardingModelAuthSession = createPathMatcher("/api/onboarding/model/auth/session/:sessionId");
const matchOnboardingModelAuthSessionInput = createPathMatcher("/api/onboarding/model/auth/session/:sessionId/input");
const matchOnboardingChannelEntry = createPathMatcher("/api/onboarding/channel/entries/:entryId");
const matchOnboardingChannelSession = createPathMatcher("/api/onboarding/channel/session/:sessionId");
const matchOnboardingChannelSessionInput = createPathMatcher("/api/onboarding/channel/session/:sessionId/input");

export const onboardingRoutes: RouteDefinition[] = [
  {
    method: "POST",
    match: createPathMatcher("/api/first-run/intro"),
    async handle({ context }) {
      return jsonResponse(await context.setupService.markIntroCompleted());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/first-run/setup"),
    async handle({ context, request }) {
      const body = await readJson<InstallRequest>(request);
      return jsonResponse(await context.setupService.runFirstRunSetup({ forceLocal: body.forceLocal ?? false }));
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/onboarding/state"),
    freshReadInvalidationTargets: ["engine", "channels", "models", "skills", "ai-members"],
    async handle({ context }) {
      return jsonResponse(await context.onboardingService.getState());
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
      return jsonResponse(await context.onboardingService.installRuntime({ forceLocal: body.forceLocal ?? false }));
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
