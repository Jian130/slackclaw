import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { MockAdapter } from "../engine/mock-adapter.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { StateStore } from "./state-store.js";

function createServices(testName: string) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);

  return {
    service: new ChannelSetupService(adapter, store),
    store
  };
}

test("channel setup allows configuration without a separate onboarding step", async () => {
  const { service } = createServices("channel-setup-gate");

  const result = await service.saveEntry(undefined, {
    channelId: "telegram",
    action: "save",
    values: { token: "telegram-test-token" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.channelConfig.entries[0]?.id, "telegram:default");
});

test("channel setup persists generic channel entries and configured channel state", async () => {
  const { service, store } = createServices("channel-setup-persist");

  const result = await service.saveEntry(undefined, {
    channelId: "telegram",
    action: "save",
    values: {
      token: "telegram-test-token",
      accountName: "Compatibility Test"
    }
  });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.channelConfig.entries[0]?.id, "telegram:default");
  assert.equal(Boolean(state.channelOnboarding?.gatewayStartedAt), true);
  assert.equal(state.channelOnboarding?.channels.telegram.status, "awaiting-pairing");
  assert.equal(state.channelOnboarding?.entries?.["telegram:default"]?.label, "Compatibility Test");
});

test("channel config overview includes live configured entries even without stored metadata", async () => {
  class PreconfiguredMockAdapter extends MockAdapter {
    override async getConfiguredChannelEntries() {
      return [
        {
          id: "telegram:default",
          channelId: "telegram" as const,
          label: "Telegram @support_bot",
          status: "completed" as const,
          summary: "Telegram is configured in OpenClaw.",
          detail: "OpenClaw detected an existing Telegram bot.",
          maskedConfigSummary: [{ label: "Bot", value: "@support_bot" }],
          editableValues: {},
          pairingRequired: false,
          lastUpdatedAt: new Date().toISOString()
        },
        {
          id: "whatsapp:default",
          channelId: "whatsapp" as const,
          label: "WhatsApp +15551234567",
          status: "completed" as const,
          summary: "WhatsApp is configured in OpenClaw.",
          detail: "OpenClaw detected an existing WhatsApp account.",
          maskedConfigSummary: [{ label: "Linked number", value: "+15551234567" }],
          editableValues: {},
          pairingRequired: false,
          lastUpdatedAt: new Date().toISOString()
        }
      ];
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-live-entries-${randomUUID()}.json`);
  const service = new ChannelSetupService(new PreconfiguredMockAdapter(), new StateStore(filePath));
  const store = new StateStore(filePath);
  await store.update((current) => ({
    ...current,
    channelOnboarding: {
      baseOnboardingCompletedAt: new Date().toISOString(),
      gatewayStartedAt: undefined,
      channels: {},
      entries: {}
    }
  }));

  const overview = await service.getConfigOverview();

  assert.ok(overview.entries.some((entry) => entry.id === "telegram:default"));
  assert.ok(overview.entries.some((entry) => entry.id === "whatsapp:default"));
});

test("channel setup removes a configured entry through the generic path", async () => {
  const { service, store } = createServices("channel-setup-remove");
  await service.saveEntry(undefined, {
    channelId: "telegram",
    action: "save",
    values: { token: "telegram-test-token" }
  });

  const result = await service.removeEntry({ entryId: "telegram:default" });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.channelConfig.entries.length, 0);
  assert.equal(state.channelOnboarding?.entries?.["telegram:default"], undefined);
  assert.equal(state.channelOnboarding?.channels.telegram.status, "not-started");
});
