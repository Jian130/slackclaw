import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { MockAdapter } from "../engine/mock-adapter.js";
import { OverviewService } from "./overview-service.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { StateStore } from "./state-store.js";

function createServices(testName: string) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);

  return {
    service: new ChannelSetupService(adapter, store, overviewService),
    store
  };
}

test("channel setup requires onboarding before configuration", async () => {
  const { service } = createServices("channel-setup-gate");

  await assert.rejects(
    () => service.configureTelegram({ token: "telegram-test-token" }),
    /Complete OpenClaw onboarding before configuring channels/
  );
});

test("channel setup persists gateway restart and configured channel state", async () => {
  const { service, store } = createServices("channel-setup-persist");
  await service.markBaseOnboardingCompleted();

  const result = await service.configureTelegram({ token: "telegram-test-token", accountName: "Compatibility Test" });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.channel?.id, "telegram");
  assert.equal(Boolean(state.channelOnboarding?.gatewayStartedAt), true);
  assert.equal(state.channelOnboarding?.channels.telegram.status, "awaiting-pairing");
});
