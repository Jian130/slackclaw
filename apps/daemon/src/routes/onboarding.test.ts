import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import type {
  OnboardingChannelOperationResponse,
  OnboardingCompletionOperationResponse,
  OnboardingModelOperationResponse,
  OnboardingRuntimeOperationResponse,
  OnboardingStateResponse,
  OperationCommandResponse
} from "@chillclaw/contracts";

import { onboardingRoutes } from "./onboarding.js";
import type { ServerContext } from "./server-context.js";
import type { OperationWorker, OperationWorkerContext } from "../services/operation-runner.js";

function onboardingState(): OnboardingStateResponse {
  return {
    firstRun: {
      introCompleted: true,
      setupCompleted: false
    },
    draft: {
      currentStep: "install"
    },
    config: {
      modelProviders: [],
      channels: [],
      employeePresets: []
    },
    summary: {}
  };
}

test("onboarding runtime install route accepts work and returns without running installation inline", async () => {
  const route = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/runtime/install"));
  assert.ok(route);

  let capturedWorker: OperationWorker | undefined;
  let installCalled = false;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:install",
      scope: "onboarding",
      resourceId: "managed-local",
      action: "onboarding-runtime-install",
      status: "running",
      phase: "installing",
      message: "Installing OpenClaw locally.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.scope, "onboarding");
        assert.equal(request.resourceId, "managed-local");
        assert.equal(request.action, "onboarding-runtime-install");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => onboardingState(),
      installRuntime: async () => {
        installCalled = true;
        return {
          status: "completed" as const,
          message: "OpenClaw deployment is complete.",
          steps: [],
          overview: {},
          operation: accepted.operation,
          onboarding: onboardingState()
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: Readable.from([JSON.stringify({ forceLocal: true })]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/runtime/install"),
    pathname: "/api/onboarding/runtime/install",
    params: {}
  });
  const body = response.body as OnboardingRuntimeOperationResponse;

  assert.equal(body.accepted, true);
  assert.equal(body.operation.operationId, "onboarding:install");
  assert.equal(body.onboarding.draft.currentStep, "install");
  assert.equal(installCalled, false);
  assert.ok(capturedWorker);

  await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(installCalled, true);
});

test("onboarding runtime detect route accepts work and returns without probing inline", async () => {
  const route = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/runtime/detect"));
  assert.ok(route);

  let capturedWorker: OperationWorker | undefined;
  let detectCalled = false;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:runtime-detect",
      scope: "onboarding",
      resourceId: "managed-local",
      action: "onboarding-runtime-detect",
      status: "running",
      phase: "detecting",
      message: "Checking OpenClaw install status.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.scope, "onboarding");
        assert.equal(request.resourceId, "managed-local");
        assert.equal(request.action, "onboarding-runtime-detect");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => onboardingState(),
      detectRuntime: async () => {
        detectCalled = true;
        return {
          ...onboardingState(),
          draft: {
            currentStep: "model" as const,
            install: {
              installed: true,
              disposition: "installed-managed" as const
            }
          },
          summary: {
            install: {
              installed: true,
              disposition: "installed-managed" as const
            }
          }
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: Readable.from(["{}"]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/runtime/detect"),
    pathname: "/api/onboarding/runtime/detect",
    params: {}
  });
  const body = response.body as OnboardingStateResponse;

  assert.equal(body.operations?.install?.operationId, "onboarding:runtime-detect");
  assert.equal(body.operations?.install?.action, "onboarding-runtime-detect");
  assert.equal(detectCalled, false);
  assert.ok(capturedWorker);

  const workerResult = await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(detectCalled, true);
  assert.equal(workerResult?.message, "OpenClaw is installed and ready.");
});

test("onboarding runtime update route accepts work and returns without running update inline", async () => {
  const route = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/runtime/update"));
  assert.ok(route);

  let capturedWorker: OperationWorker | undefined;
  let updateCalled = false;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:install",
      scope: "onboarding",
      resourceId: "managed-local",
      action: "onboarding-runtime-update",
      status: "running",
      phase: "updating",
      message: "Updating OpenClaw locally.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.scope, "onboarding");
        assert.equal(request.resourceId, "managed-local");
        assert.equal(request.action, "onboarding-runtime-update");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => onboardingState(),
      updateRuntime: async () => {
        updateCalled = true;
        return {
          status: "completed" as const,
          message: "OpenClaw update is complete.",
          steps: [],
          overview: {},
          operation: accepted.operation,
          onboarding: onboardingState()
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: Readable.from(["{}"]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/runtime/update"),
    pathname: "/api/onboarding/runtime/update",
    params: {}
  });
  const body = response.body as OnboardingRuntimeOperationResponse;

  assert.equal(body.accepted, true);
  assert.equal(body.operation.operationId, "onboarding:install");
  assert.equal(body.operation.action, "onboarding-runtime-update");
  assert.equal(body.onboarding.operations?.install?.action, "onboarding-runtime-update");
  assert.equal(updateCalled, false);
  assert.ok(capturedWorker);

  await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(updateCalled, true);
});

test("onboarding complete route accepts work and returns without running finalization inline", async () => {
  const route = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/complete"));
  assert.ok(route);

  let capturedWorker: OperationWorker | undefined;
  let completeCalled = false;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:completion",
      scope: "onboarding",
      action: "onboarding-completion",
      status: "running",
      phase: "finalizing",
      message: "Finishing onboarding.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { operationId: string; action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.operationId, "onboarding:completion");
        assert.equal(request.scope, "onboarding");
        assert.equal(request.action, "onboarding-completion");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => ({
        ...onboardingState(),
        draft: {
          currentStep: "employee"
        }
      }),
      complete: async () => {
        completeCalled = true;
        return {
          status: "completed" as const,
          destination: "chat" as const,
          summary: {},
          overview: {}
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: Readable.from([JSON.stringify({ destination: "chat" })]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/complete"),
    pathname: "/api/onboarding/complete",
    params: {}
  });
  const body = response.body as OnboardingCompletionOperationResponse;

  assert.equal(body.accepted, true);
  assert.equal(body.operation.operationId, "onboarding:completion");
  assert.equal(body.destination, "chat");
  assert.equal(body.onboarding.operations?.completion?.operationId, "onboarding:completion");
  assert.equal(completeCalled, false);
  assert.ok(capturedWorker);

  await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(completeCalled, true);
});

test("onboarding model entry route accepts work and returns without saving inline", async () => {
  const route = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/model/entries"));
  assert.ok(route);

  let capturedWorker: OperationWorker | undefined;
  let saveCalled = false;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:model",
      scope: "onboarding",
      action: "onboarding-model-save",
      status: "running",
      phase: "saving-model",
      message: "Saving the first model.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { operationId: string; action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.operationId, "onboarding:model");
        assert.equal(request.scope, "onboarding");
        assert.equal(request.resourceId, "anthropic:claude");
        assert.equal(request.action, "onboarding-model-save");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => ({
        ...onboardingState(),
        draft: {
          currentStep: "model"
        }
      }),
      saveModelEntry: async () => {
        saveCalled = true;
        return {
          status: "completed" as const,
          message: "Model saved.",
          modelConfig: {},
          epoch: "epoch",
          revision: 1,
          settled: true,
          onboarding: onboardingState()
        };
      }
    }
  } as unknown as ServerContext;

  const response = await route.handle({
    context,
    request: Readable.from([JSON.stringify({
      label: "Claude",
      providerId: "anthropic",
      methodId: "api-key",
      modelKey: "claude",
      values: { apiKey: "test" },
      makeDefault: true
    })]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/model/entries"),
    pathname: "/api/onboarding/model/entries",
    params: {}
  });
  const body = response.body as OnboardingModelOperationResponse;

  assert.equal(body.accepted, true);
  assert.equal(body.operation.operationId, "onboarding:model");
  assert.equal(body.onboarding.operations?.model?.operationId, "onboarding:model");
  assert.equal(saveCalled, false);
  assert.ok(capturedWorker);

  await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(saveCalled, true);
});

test("onboarding channel entry routes accept work and return without saving inline", async () => {
  const createRoute = onboardingRoutes.find((candidate) => candidate.method === "POST" && candidate.match("/api/onboarding/channel/entries"));
  const updateRoute = onboardingRoutes.find((candidate) => candidate.method === "PATCH" && candidate.match("/api/onboarding/channel/entries/entry-1"));
  assert.ok(createRoute);
  assert.ok(updateRoute);

  let capturedWorker: OperationWorker | undefined;
  let saveCalls = 0;
  const accepted: OperationCommandResponse = {
    accepted: true,
    operation: {
      operationId: "onboarding:channel",
      scope: "onboarding",
      resourceId: "wechat",
      action: "onboarding-channel-save",
      status: "running",
      phase: "saving-channel",
      message: "Saving the first channel.",
      startedAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
      retryable: true
    }
  };
  const context = {
    operationRunner: {
      startOrResume: async (
        request: { operationId: string; action: string; scope: string; resourceId?: string },
        worker: OperationWorker
      ) => {
        capturedWorker = worker;
        assert.equal(request.operationId, "onboarding:channel");
        assert.equal(request.scope, "onboarding");
        assert.equal(request.resourceId, "wechat");
        assert.equal(request.action, "onboarding-channel-save");
        return accepted;
      }
    },
    onboardingService: {
      getState: async () => ({
        ...onboardingState(),
        draft: {
          currentStep: "channel"
        }
      }),
      saveChannelEntry: async () => {
        saveCalls += 1;
        return {
          status: "completed" as const,
          message: "Channel saved.",
          channelConfig: {},
          epoch: "epoch",
          revision: 1,
          settled: true,
          onboarding: onboardingState()
        };
      }
    }
  } as unknown as ServerContext;
  const requestBody = JSON.stringify({
    channelId: "wechat",
    values: { account: "test" },
    action: "save"
  });

  const createResponse = await createRoute.handle({
    context,
    request: Readable.from([requestBody]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/channel/entries"),
    pathname: "/api/onboarding/channel/entries",
    params: {}
  });
  const createBody = createResponse.body as OnboardingChannelOperationResponse;
  assert.equal(createBody.accepted, true);
  assert.equal(createBody.onboarding.operations?.channel?.operationId, "onboarding:channel");
  assert.equal(saveCalls, 0);
  assert.ok(capturedWorker);

  await capturedWorker({
    operation: accepted.operation,
    update: async () => accepted.operation
  } satisfies OperationWorkerContext);
  assert.equal(saveCalls, 1);

  capturedWorker = undefined;
  const updateResponse = await updateRoute.handle({
    context,
    request: Readable.from([requestBody]) as never,
    requestUrl: new URL("http://127.0.0.1/api/onboarding/channel/entries/entry-1"),
    pathname: "/api/onboarding/channel/entries/entry-1",
    params: { entryId: "entry-1" }
  });
  const updateBody = updateResponse.body as OnboardingChannelOperationResponse;
  assert.equal(updateBody.accepted, true);
  assert.equal(updateBody.operation.operationId, "onboarding:channel");
  assert.equal(saveCalls, 1);
  assert.ok(capturedWorker);
});
