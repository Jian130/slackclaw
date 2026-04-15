import test from "node:test";
import assert from "node:assert/strict";

import { EventBusService } from "./event-bus-service.js";

test("event bus delivers typed events to multiple subscribers", async () => {
  const bus = new EventBusService();
  const first: string[] = [];
  const second: string[] = [];

  const unsubscribeFirst = bus.subscribe((event) => {
    first.push(event.type);
  });

  bus.subscribe((event) => {
    second.push(event.type);
  });

  bus.publish({
    type: "deploy.progress",
    correlationId: "corr-1",
    targetId: "managed-local",
    phase: "installing",
    percent: 50,
    message: "Installing OpenClaw."
  });

  unsubscribeFirst();

  bus.publish({
    type: "gateway.status",
    reachable: true,
    pendingGatewayApply: false,
    summary: "Gateway is healthy."
  });

  assert.deepEqual(first, ["deploy.progress"]);
  assert.deepEqual(second, ["deploy.progress", "gateway.status"]);
  assert.equal(bus.listenerCount(), 1);
});

test("event bus retains the latest downloads snapshot for late subscribers", () => {
  const bus = new EventBusService();

  bus.publish({
    type: "downloads.updated",
    snapshot: {
      epoch: "downloads-test",
      revision: 1,
      data: {
        checkedAt: "2026-04-15T00:00:00.000Z",
        jobs: [],
        activeCount: 0,
        queuedCount: 0,
        failedCount: 0,
        summary: "No downloads are running."
      }
    }
  });

  assert.deepEqual(
    bus.getRetainedEvents().map((event) => event.type),
    ["downloads.updated"]
  );
});
