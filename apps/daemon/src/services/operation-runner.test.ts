import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { OperationRunner } from "./operation-runner.js";
import { OperationStore } from "./operation-store.js";
import { StateStore } from "./state-store.js";

function createRunner(name: string) {
  const communicationLogs: Array<{ message: string; details?: unknown; scope?: string }> = [];
  const stateStore = new StateStore(resolve(process.cwd(), `apps/daemon/.data/${name}-${randomUUID()}.json`));
  const operationStore = new OperationStore(stateStore);
  const eventBus = new EventBusService();
  const publisher = new EventPublisher(eventBus);
  const runner = new OperationRunner(operationStore, publisher, {
    now: (() => {
      let tick = 0;
      return () => `2026-04-21T00:00:0${tick++}.000Z`;
    })(),
    communicationLogger: (message, details, metadata) => {
      communicationLogs.push({ message, details, scope: metadata?.scope });
    }
  });

  return {
    communicationLogs,
    eventBus,
    operationStore,
    runner
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("operation runner returns accepted operation before worker resolves", async () => {
  const { operationStore, runner } = createRunner("operation-runner-quick-return");
  const gate = deferred<{ message: string }>();
  let workerStarted = false;

  const response = await runner.startOrResume({
    operationId: "onboarding:install",
    scope: "onboarding",
    resourceId: "managed-local",
    action: "onboarding-runtime-install",
    phase: "installing",
    percent: 10,
    message: "Installing OpenClaw locally."
  }, async () => {
    workerStarted = true;
    await gate.promise;
    return {
      phase: "completed",
      percent: 100,
      message: "OpenClaw deployment is complete."
    };
  });

  assert.equal(response.accepted, true);
  assert.equal(response.alreadyRunning, false);
  assert.equal(response.operation.status, "running");
  assert.equal(workerStarted, false);
  assert.equal((await operationStore.read("onboarding:install"))?.status, "running");

  gate.resolve({ message: "done" });
  await runner.waitForIdle();

  assert.equal((await operationStore.read("onboarding:install"))?.status, "completed");
});

test("operation runner reuses an active operation for duplicate commands", async () => {
  const { runner } = createRunner("operation-runner-dedupe");
  const gate = deferred<void>();
  let runCount = 0;

  const first = await runner.startOrResume({
    operationId: "onboarding:install",
    scope: "onboarding",
    action: "onboarding-runtime-install",
    phase: "installing",
    message: "Installing OpenClaw locally."
  }, async () => {
    runCount += 1;
    await gate.promise;
    return { message: "OpenClaw deployment is complete." };
  });
  const second = await runner.startOrResume({
    operationId: "onboarding:install",
    scope: "onboarding",
    action: "onboarding-runtime-install",
    phase: "installing",
    message: "Installing OpenClaw locally."
  }, async () => {
    runCount += 1;
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(second.alreadyRunning, true);
  assert.equal(second.operation.operationId, "onboarding:install");

  gate.resolve();
  await runner.waitForIdle();
  assert.equal(runCount, 1);
});

test("operation runner restarts an active operation abandoned by a previous daemon process", async () => {
  const { operationStore, runner } = createRunner("operation-runner-stale-active");
  await operationStore.create({
    operationId: "onboarding:channel",
    scope: "onboarding",
    resourceId: "wechat",
    action: "onboarding-channel-save",
    status: "running",
    phase: "saving-channel",
    percent: 10,
    message: "Saving the first channel.",
    startedAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:01.000Z"
  });
  let runCount = 0;

  const response = await runner.startOrResume({
    operationId: "onboarding:channel",
    scope: "onboarding",
    resourceId: "wechat",
    action: "onboarding-channel-save",
    phase: "saving-channel",
    percent: 10,
    message: "Saving the first channel."
  }, async () => {
    runCount += 1;
    return {
      phase: "completed",
      percent: 100,
      message: "WeChat channel saved."
    };
  });

  assert.equal(response.accepted, true);
  assert.equal(response.alreadyRunning, false);

  await runner.waitForIdle();

  const operation = await operationStore.read("onboarding:channel");
  assert.equal(runCount, 1);
  assert.equal(operation?.status, "completed");
  assert.equal(operation?.message, "WeChat channel saved.");
});

test("operation runner persists and publishes progress updates", async () => {
  const { eventBus, operationStore, runner } = createRunner("operation-runner-progress");
  const events: string[] = [];
  eventBus.subscribe((event) => {
    events.push(event.type);
  });

  await runner.startOrResume({
    operationId: "runtime:openclaw-runtime:prepare",
    scope: "runtime",
    resourceId: "openclaw-runtime",
    action: "prepare",
    phase: "checking",
    message: "Checking OpenClaw runtime."
  }, async ({ update }) => {
    await update({
      phase: "installing",
      percent: 55,
      message: "Preparing OpenClaw runtime."
    });
    return {
      phase: "completed",
      percent: 100,
      message: "OpenClaw runtime is ready."
    };
  });

  await runner.waitForIdle();

  const operation = await operationStore.read("runtime:openclaw-runtime:prepare");
  assert.equal(operation?.phase, "completed");
  assert.equal(operation?.percent, 100);
  assert.deepEqual(events, ["operation.updated", "operation.updated", "operation.completed"]);
});

test("operation runner marks failed workers as failed operations", async () => {
  const { eventBus, operationStore, runner } = createRunner("operation-runner-failure");
  const events: string[] = [];
  eventBus.subscribe((event) => {
    events.push(event.type);
  });

  await runner.startOrResume({
    operationId: "gateway:restart",
    scope: "gateway",
    action: "restart",
    phase: "restarting",
    message: "Restarting OpenClaw gateway."
  }, async () => {
    throw Object.assign(new Error("token should not leak"), {
      code: "GATEWAY_RESTART_FAILED"
    });
  });

  await runner.waitForIdle();

  const operation = await operationStore.read("gateway:restart");
  assert.equal(operation?.status, "failed");
  assert.equal(operation?.error?.code, "GATEWAY_RESTART_FAILED");
  assert.equal(operation?.error?.message, "Restarting OpenClaw gateway failed.");
  assert.deepEqual(events, ["operation.updated", "operation.completed"]);
});

test("operation runner logs operation lifecycle without leaking worker errors", async () => {
  const { communicationLogs, runner } = createRunner("operation-runner-communication-logs");

  await runner.startOrResume({
    operationId: "gateway:restart",
    scope: "gateway",
    action: "restart",
    phase: "restarting",
    message: "Restarting OpenClaw gateway."
  }, async ({ update }) => {
    await update({
      phase: "waiting",
      message: "Waiting for gateway token sk-secret."
    });
    throw new Error("token sk-secret failed");
  });

  await runner.waitForIdle();

  assert.deepEqual(communicationLogs.map((entry) => entry.scope), [
    "communication.operation.start",
    "communication.operation.update",
    "communication.operation.failed"
  ]);
  assert.deepEqual(communicationLogs[0]?.details, {
    operationId: "gateway:restart",
    scope: "gateway",
    action: "restart",
    status: "running",
    phase: "restarting"
  });
  assert.deepEqual(communicationLogs.at(-1)?.details, {
    operationId: "gateway:restart",
    scope: "gateway",
    action: "restart",
    status: "failed",
    phase: "waiting",
    errorName: "Error"
  });
  assert.doesNotMatch(JSON.stringify(communicationLogs), /sk-secret/);
});
