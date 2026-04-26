import type {
  ChannelSessionInputRequest,
  CompleteOnboardingRequest,
  InstallRequest,
  OnboardingChannelOperationResponse,
  OnboardingCompletionOperationResponse,
  OnboardingModelOperationResponse,
  ModelAuthSessionInputRequest,
  OnboardingRuntimeOperationResponse,
  OnboardingStateResponse,
  OnboardingEmployeeState,
  OnboardingStepNavigationRequest,
  SaveChannelEntryRequest,
  SaveModelEntryRequest
} from "@chillclaw/contracts";

import { performance } from "node:perf_hooks";

import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import { formatConsoleLine } from "../services/logger.js";
import {
  summarizeOnboardingDraft,
  summarizeOnboardingOperationResult,
  traceOnboardingOperation
} from "../services/onboarding-logger.js";
import type { RouteDefinition } from "./types.js";

const matchOnboardingModelAuthSession = createPathMatcher("/api/onboarding/model/auth/session/:sessionId");
const matchOnboardingModelAuthSessionInput = createPathMatcher("/api/onboarding/model/auth/session/:sessionId/input");
const matchOnboardingChannelEntry = createPathMatcher("/api/onboarding/channel/entries/:entryId");
const matchOnboardingChannelSession = createPathMatcher("/api/onboarding/channel/session/:sessionId");
const matchOnboardingChannelSessionInput = createPathMatcher("/api/onboarding/channel/session/:sessionId/input");

function traceOnboardingRoute<T>(
  route: string,
  details: unknown,
  action: () => Promise<T>
): Promise<T> {
  return traceOnboardingOperation(`route.${route}`, details, action, summarizeOnboardingOperationResult);
}

function withInstallOperation(
  onboarding: OnboardingStateResponse,
  operation: OnboardingRuntimeOperationResponse["operation"]
): OnboardingStateResponse {
  return {
    ...onboarding,
    operations: {
      ...(onboarding.operations ?? {}),
      install: operation
    }
  };
}

function withCompletionOperation(
  onboarding: OnboardingStateResponse,
  operation: OnboardingCompletionOperationResponse["operation"]
): OnboardingStateResponse {
  return {
    ...onboarding,
    operations: {
      ...(onboarding.operations ?? {}),
      completion: operation
    }
  };
}

function withModelOperation(
  onboarding: OnboardingStateResponse,
  operation: OnboardingModelOperationResponse["operation"]
): OnboardingStateResponse {
  return {
    ...onboarding,
    operations: {
      ...(onboarding.operations ?? {}),
      model: operation
    }
  };
}

function withChannelOperation(
  onboarding: OnboardingStateResponse,
  operation: OnboardingChannelOperationResponse["operation"]
): OnboardingStateResponse {
  return {
    ...onboarding,
    operations: {
      ...(onboarding.operations ?? {}),
      channel: operation
    }
  };
}

function onboardingRuntimeOperationResponse(
  onboarding: OnboardingStateResponse,
  result: Omit<OnboardingRuntimeOperationResponse, "onboarding">
): OnboardingRuntimeOperationResponse {
  return {
    ...result,
    onboarding: withInstallOperation(onboarding, result.operation)
  };
}

function onboardingCompletionOperationResponse(
  onboarding: OnboardingStateResponse,
  result: Omit<OnboardingCompletionOperationResponse, "onboarding">
): OnboardingCompletionOperationResponse {
  return {
    ...result,
    onboarding: withCompletionOperation(onboarding, result.operation)
  };
}

function onboardingModelOperationResponse(
  onboarding: OnboardingStateResponse,
  result: Omit<OnboardingModelOperationResponse, "onboarding">
): OnboardingModelOperationResponse {
  return {
    ...result,
    onboarding: withModelOperation(onboarding, result.operation)
  };
}

function onboardingChannelOperationResponse(
  onboarding: OnboardingStateResponse,
  result: Omit<OnboardingChannelOperationResponse, "onboarding">
): OnboardingChannelOperationResponse {
  return {
    ...result,
    onboarding: withChannelOperation(onboarding, result.operation)
  };
}

export const onboardingRoutes: RouteDefinition[] = [
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/intro"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/intro", {}, () => context.setupService.markIntroCompleted()));
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/onboarding/state"),
    async handle({ context }) {
      const t0 = performance.now();
      const result = await traceOnboardingRoute("GET /api/onboarding/state", {}, () => context.onboardingService.getState());
      console.log(formatConsoleLine(`GET /api/onboarding/state: ${(performance.now() - t0).toFixed(1)}ms`, { scope: "route" }));
      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/navigate"),
    async handle({ context, request }) {
      const body = await readJson<OnboardingStepNavigationRequest>(request);
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/navigate", { step: body.step }, () => context.onboardingService.navigateStep(body)));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/detect"),
    async handle({ context }) {
      const result = await traceOnboardingRoute(
        "POST /api/onboarding/runtime/detect",
        {},
        () => context.operationRunner.startOrResume(
          {
            operationId: "onboarding:runtime-detect",
            scope: "onboarding",
            resourceId: "managed-local",
            action: "onboarding-runtime-detect",
            phase: "detecting",
            percent: 8,
            message: "Checking OpenClaw install status."
          },
          async ({ update }) => {
            await update({
              phase: "detecting",
              percent: 40,
              message: "Checking OpenClaw install status."
            });
            const onboarding = await context.onboardingService.detectRuntime();
            const installed = onboarding.draft.install?.installed === true || onboarding.summary.install?.installed === true;

            return {
              phase: "completed",
              percent: 100,
              message: installed ? "OpenClaw is installed and ready." : "OpenClaw is not installed yet.",
              result: {
                kind: "resource",
                resource: "onboarding"
              }
            };
          }
        )
      );
      return jsonResponse(withInstallOperation(await context.onboardingService.getState(), result.operation));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/install"),
    async handle({ context, request }) {
      const body = await readJson<InstallRequest>(request);
      const forceLocal = body.forceLocal ?? true;
      const result = await traceOnboardingRoute(
        "POST /api/onboarding/runtime/install",
        { forceLocal },
        () => context.operationRunner.startOrResume(
          {
            operationId: "onboarding:install",
            scope: "onboarding",
            resourceId: "managed-local",
            action: "onboarding-runtime-install",
            phase: "installing",
            percent: 8,
            message: "Installing OpenClaw locally."
          },
          async ({ update }) => {
            await update({
              phase: "installing",
              percent: 16,
              message: "Installing OpenClaw locally."
            });
            const setup = await context.onboardingService.installRuntime({ forceLocal });
            return {
              phase: "completed",
              percent: 100,
              message: setup.message,
              result: {
                kind: "resource",
                resource: "onboarding"
              }
            };
          }
        )
      );
      return jsonResponse(onboardingRuntimeOperationResponse(await context.onboardingService.getState(), result));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/reuse"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/runtime/reuse", {}, () => context.onboardingService.reuseDetectedRuntime()));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/runtime/update"),
    async handle({ context }) {
      const result = await traceOnboardingRoute(
        "POST /api/onboarding/runtime/update",
        {},
        () => context.operationRunner.startOrResume(
          {
            operationId: "onboarding:install",
            scope: "onboarding",
            resourceId: "managed-local",
            action: "onboarding-runtime-update",
            phase: "updating",
            percent: 8,
            message: "Updating OpenClaw locally."
          },
          async ({ update }) => {
            await update({
              phase: "updating",
              percent: 16,
              message: "Updating OpenClaw locally."
            });
            const setup = await context.onboardingService.updateRuntime();
            return {
              phase: "completed",
              percent: 100,
              message: setup.message,
              result: {
                kind: "resource",
                resource: "onboarding"
              }
            };
          }
        )
      );
      return jsonResponse(onboardingRuntimeOperationResponse(await context.onboardingService.getState(), result));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/permissions/confirm"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/permissions/confirm", {}, () => context.onboardingService.confirmPermissions()));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/model/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveModelEntryRequest>(request);
      const result = await traceOnboardingRoute("POST /api/onboarding/model/entries", {
        providerId: body.providerId,
        methodId: body.methodId,
        modelKey: body.modelKey,
        makeDefault: body.makeDefault,
        useAsFallback: body.useAsFallback,
        valueKeys: Object.keys(body.values ?? {})
      }, () => context.operationRunner.startOrResume(
        {
          operationId: "onboarding:model",
          scope: "onboarding",
          resourceId: `${body.providerId}:${body.modelKey}`,
          action: "onboarding-model-save",
          phase: "saving-model",
          percent: 10,
          message: "Saving the first model."
        },
        async ({ update }) => {
          await update({
            phase: "saving-model",
            percent: 45,
            message: "Saving the first model."
          });
          const saved = await context.onboardingService.saveModelEntry(body);
          return {
            phase: saved.status === "interactive" ? "awaiting-auth" : "completed",
            percent: saved.status === "interactive" ? 80 : 100,
            message: saved.message,
            result: {
              kind: "resource",
              resource: "onboarding-model",
              id: saved.authSession?.id ?? saved.modelConfig.defaultEntryId
            }
          };
        }
      ));
      return jsonResponse(onboardingModelOperationResponse(await context.onboardingService.getState(), result));
    }
  },
  {
    method: "GET",
    match: matchOnboardingModelAuthSession,
    async handle({ context, params }) {
      return jsonResponse(await traceOnboardingRoute(
        "GET /api/onboarding/model/auth/session/:sessionId",
        { sessionId: params.sessionId },
        () => context.onboardingService.getModelAuthSession(params.sessionId)
      ));
    }
  },
  {
    method: "POST",
    match: matchOnboardingModelAuthSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ModelAuthSessionInputRequest>(request);
      return jsonResponse(await traceOnboardingRoute(
        "POST /api/onboarding/model/auth/session/:sessionId/input",
        { sessionId: params.sessionId, hasValue: Boolean(body.value?.trim()) },
        () => context.onboardingService.submitModelAuthSessionInput(params.sessionId, body)
      ));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/channel/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      const result = await traceOnboardingRoute("POST /api/onboarding/channel/entries", {
        channelId: body.channelId,
        action: body.action,
        valueKeys: Object.keys(body.values ?? {})
      }, () => context.operationRunner.startOrResume(
        {
          operationId: "onboarding:channel",
          scope: "onboarding",
          resourceId: body.channelId,
          action: "onboarding-channel-save",
          phase: "saving-channel",
          percent: 10,
          message: "Saving the first channel."
        },
        async ({ update }) => {
          await update({
            phase: "saving-channel",
            percent: 45,
            message: "Saving the first channel."
          });
          const saved = await context.onboardingService.saveChannelEntry(undefined, body);
          return {
            phase: saved.status === "interactive" ? "awaiting-pairing" : "completed",
            percent: saved.status === "interactive" ? 80 : 100,
            message: saved.message,
            result: {
              kind: "resource",
              resource: "onboarding-channel",
              id: saved.session?.id ?? saved.session?.entryId ?? body.channelId
            }
          };
        }
      ));
      return jsonResponse(onboardingChannelOperationResponse(await context.onboardingService.getState(), result));
    }
  },
  {
    method: "PATCH",
    match: matchOnboardingChannelEntry,
    async handle({ context, request, params }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      const result = await traceOnboardingRoute("PATCH /api/onboarding/channel/entries/:entryId", {
        entryId: params.entryId,
        channelId: body.channelId,
        action: body.action,
        valueKeys: Object.keys(body.values ?? {})
      }, () => context.operationRunner.startOrResume(
        {
          operationId: "onboarding:channel",
          scope: "onboarding",
          resourceId: body.channelId,
          action: "onboarding-channel-save",
          phase: "saving-channel",
          percent: 10,
          message: "Saving the first channel."
        },
        async ({ update }) => {
          await update({
            phase: "saving-channel",
            percent: 45,
            message: "Saving the first channel."
          });
          const saved = await context.onboardingService.saveChannelEntry(params.entryId, body);
          return {
            phase: saved.status === "interactive" ? "awaiting-pairing" : "completed",
            percent: saved.status === "interactive" ? 80 : 100,
            message: saved.message,
            result: {
              kind: "resource",
              resource: "onboarding-channel",
              id: saved.session?.id ?? saved.session?.entryId ?? params.entryId
            }
          };
        }
      ));
      return jsonResponse(onboardingChannelOperationResponse(await context.onboardingService.getState(), result));
    }
  },
  {
    method: "GET",
    match: matchOnboardingChannelSession,
    async handle({ context, params }) {
      return jsonResponse(await traceOnboardingRoute(
        "GET /api/onboarding/channel/session/:sessionId",
        { sessionId: params.sessionId },
        () => context.onboardingService.getChannelSession(params.sessionId)
      ));
    }
  },
  {
    method: "POST",
    match: matchOnboardingChannelSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ChannelSessionInputRequest>(request);
      return jsonResponse(await traceOnboardingRoute(
        "POST /api/onboarding/channel/session/:sessionId/input",
        { sessionId: params.sessionId, hasValue: Boolean(body.value?.trim()) },
        () => context.onboardingService.submitChannelSessionInput(params.sessionId, body)
      ));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/employee"),
    async handle({ context, request }) {
      const body = await readJson<OnboardingEmployeeState>(request);
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/employee", {
        employee: summarizeOnboardingDraft({ currentStep: "employee", employee: body })?.employee
      }, () => context.onboardingService.saveEmployeeDraft(body)));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/model/reset"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/model/reset", {}, () => context.onboardingService.resetModelDraft()));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/channel/reset"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/channel/reset", {}, () => context.onboardingService.resetChannelDraft()));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/reset"),
    async handle({ context }) {
      return jsonResponse(await traceOnboardingRoute("POST /api/onboarding/reset", {}, () => context.onboardingService.reset()));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/onboarding/complete"),
    async handle({ context, request }) {
      const body = await readJson<CompleteOnboardingRequest>(request);
      const result = await traceOnboardingRoute("POST /api/onboarding/complete", {
        destination: body.destination,
        employee: body.employee ? summarizeOnboardingDraft({ currentStep: "employee", employee: body.employee })?.employee : undefined
      }, () => context.operationRunner.startOrResume(
        {
          operationId: "onboarding:completion",
          scope: "onboarding",
          action: "onboarding-completion",
          phase: "finalizing",
          percent: 8,
          message: "Finishing onboarding."
        },
        async ({ update }) => {
          await update({
            phase: "finalizing",
            percent: 16,
            message: "Finishing onboarding."
          });
          const completion = await context.onboardingService.complete(body);
          return {
            phase: "completed",
            percent: 100,
            message: completion.operation?.message ?? "Onboarding complete.",
            result: {
              kind: "resource",
              resource: "onboarding",
              id: completion.warmupTaskId
            }
          };
        }
      ));
      return jsonResponse(onboardingCompletionOperationResponse(await context.onboardingService.getState(), {
        ...result,
        destination: body.destination
      }));
    }
  }
];
