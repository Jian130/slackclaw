import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

import { MockAdapter } from "../engine/mock-adapter.js";
import type { EngineAdapter } from "../engine/adapter.js";
import type { EngineTaskRequest } from "@chillclaw/contracts";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { StateStore } from "./state-store.js";
import { TaskService } from "./task-service.js";

function createService(testName: string, options?: { withEvents?: boolean; adapter?: MockAdapter }) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = options?.adapter ?? new MockAdapter();
  const store = new StateStore(filePath);
  const bus = options?.withEvents ? new EventBusService() : undefined;

  return {
    service: new TaskService(adapter, store, bus ? new EventPublisher(bus) : undefined),
    store,
    bus
  };
}

test("task service stores completed task results and publishes task progress events", async () => {
  const { service, store, bus } = createService("task-service-events", { withEvents: true });
  const events: Array<{ taskId: string; status: string }> = [];
  bus?.subscribe((event) => {
    if (event.type === "task.progress") {
      events.push({ taskId: event.taskId, status: event.status });
    }
  });

  const result = await service.runTask({
    prompt: "Summarize the current project state.",
    profileId: "email-admin"
  });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(state.tasks.at(-1)?.taskId, result.taskId);
  assert.deepEqual(events, [{ taskId: result.taskId, status: "completed" }]);
});

test("task service routes execution through the gateway manager instead of the flat adapter surface", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/task-service-gateway-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  const calls: string[] = [];
  const expectedResult = {
    taskId: "task-1",
    title: "Gateway task",
    status: "completed" as const,
    summary: "Completed through gateway manager.",
    output: "ok",
    nextActions: [],
    startedAt: "2026-03-21T00:00:00.000Z",
    finishedAt: "2026-03-21T00:00:01.000Z",
    steps: []
  };

  const adapter = {
    gateway: {
      async runTask(request: EngineTaskRequest) {
        calls.push(`gateway:${request.memberAgentId ?? "none"}`);
        return expectedResult;
      }
    },
    async runTask() {
      calls.push("flat");
      throw new Error("TaskService should not call adapter.runTask directly.");
    }
  } as unknown as EngineAdapter;

  const service = new TaskService(adapter, store);
  const result = await service.runTask({
    prompt: "Summarize the current project state.",
    profileId: "email-admin"
  });

  assert.deepEqual(result, expectedResult);
  assert.deepEqual(calls, ["gateway:none"]);
});
