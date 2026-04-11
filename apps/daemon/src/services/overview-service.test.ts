import test from "node:test";
import assert from "node:assert/strict";

import { MockAdapter } from "../engine/mock-adapter.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";
import type { LocalModelRuntimeService } from "./local-model-runtime-service.js";

test("overview service returns ChillClaw product data", async () => {
  const service = new OverviewService(new MockAdapter(), new StateStore("/tmp/chillclaw-overview-test.json"));
  const overview = await service.getOverview();

  assert.equal(overview.appName, "ChillClaw");
  assert.equal(typeof overview.appUpdate.status, "string");
  assert.equal(overview.engine.installed, true);
  assert.equal(Array.isArray(overview.profiles), true);
  assert.equal(overview.channelSetup.baseOnboardingCompleted, true);
  assert.match(overview.channelSetup.gatewaySummary, /Next recommended channel|All channel setup steps are complete|Gateway restarted/);
});

test("overview service can skip local runtime probing for install-time reads", async () => {
  let localRuntimeCalls = 0;
  const localModelRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      throw new Error("Install-time overview should not probe Ollama.");
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OverviewService(
    new MockAdapter(),
    new StateStore("/tmp/chillclaw-overview-lightweight-test.json"),
    undefined,
    undefined,
    localModelRuntimeService
  );

  const overview = await service.getOverview({ includeLocalRuntime: false });

  assert.equal(localRuntimeCalls, 0);
  assert.equal(overview.localRuntime?.status, "unchecked");
});
