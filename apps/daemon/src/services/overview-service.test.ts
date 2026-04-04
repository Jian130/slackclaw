import test from "node:test";
import assert from "node:assert/strict";

import { MockAdapter } from "../engine/mock-adapter.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";

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
