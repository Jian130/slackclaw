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
