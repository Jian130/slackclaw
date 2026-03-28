import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { MockAdapter } from "../engine/mock-adapter.js";
import { InMemorySecretsAdapter, channelSecretName } from "../platform/secrets-adapter.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { StateStore } from "./state-store.js";

function createServices(
  testName: string,
  options?: { withEvents?: boolean; adapter?: MockAdapter; secrets?: InMemorySecretsAdapter }
) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = options?.adapter ?? new MockAdapter();
  const store = new StateStore(filePath);
  const bus = options?.withEvents ? new EventBusService() : undefined;

  return {
    service: new ChannelSetupService(adapter, store, bus ? new EventPublisher(bus) : undefined, options?.secrets),
    store,
    bus
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
  assert.equal(result.requiresGatewayApply, true);
  assert.equal(Boolean(state.channelOnboarding?.gatewayStartedAt), false);
  assert.equal(state.channelOnboarding?.channels.telegram.status, "awaiting-pairing");
  assert.equal(state.channelOnboarding?.entries?.["telegram:default"]?.label, "Compatibility Test");
  assert.match(result.channelConfig.gatewaySummary, /staged engine change|gateway manager/i);
});

test("channel setup stores secret fields through the secrets adapter without exposing them in editable values", async () => {
  const secrets = new InMemorySecretsAdapter();
  const { service, store } = createServices("channel-setup-secret-storage", { secrets });

  await service.saveEntry(undefined, {
    channelId: "telegram",
    action: "save",
    values: {
      token: "telegram-secret-token",
      accountName: "Support Bot"
    }
  });

  const state = await store.read();

  assert.equal(await secrets.get(channelSecretName("telegram", "telegram:default", "token")), "telegram-secret-token");
  assert.equal(state.channelOnboarding?.entries?.["telegram:default"]?.editableValues.token, undefined);
  assert.deepEqual(state.channelOnboarding?.entries?.["telegram:default"]?.editableValues, {
    accountName: "Support Bot"
  });
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

test("wechat work setup auto-installs the managed plugin without persisting a raw plugin package", async () => {
  const adapter = new MockAdapter();
  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-wechat-managed-${randomUUID()}.json`);
  const service = new ChannelSetupService(adapter, new StateStore(filePath));

  const result = await service.saveEntry(undefined, {
    channelId: "wechat-work",
    action: "save",
    values: {
      botId: "1000001",
      secret: "secret-value"
    }
  });
  const pluginConfig = await adapter.plugins.getConfigOverview();

  assert.equal(result.status, "completed");
  assert.equal(result.channelConfig.entries[0]?.editableValues.pluginSpec, undefined);
  assert.equal(pluginConfig.entries[0]?.installed, true);
  assert.equal(pluginConfig.entries[0]?.activeDependentCount, 1);
});

test("channel setup routes WeChat Work through plugin prerequisites and personal WeChat through installer preparation", async () => {
  class RecordingAdapter extends MockAdapter {
    ensureCalls: string[] = [];

    override async ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }) {
      this.ensureCalls.push(featureId);
      return super.ensureFeatureRequirements(featureId, options);
    }
  }

  const adapter = new RecordingAdapter();
  const configSaveCalls: Array<{ channelId: string; action?: string }> = [];
  const originalSave = adapter.config.saveChannelEntry.bind(adapter.config);
  adapter.config.saveChannelEntry = async (request) => {
    configSaveCalls.push({ channelId: request.channelId, action: request.action });
    return originalSave(request);
  };

  const { service, store } = createServices("channel-setup-wechat-branching", { adapter });

  const wechatWork = await service.saveEntry(undefined, {
    channelId: "wechat-work",
    action: "save",
    values: {
      botId: "1000001",
      secret: "secret-value"
    }
  });

  const personalWechat = await service.saveEntry(undefined, {
    channelId: "wechat",
    action: "save",
    values: {}
  });
  const sessionId = personalWechat.session?.id;
  const sessionDetail = sessionId ? await service.getSession(sessionId) : undefined;
  const sessionAfterInput = sessionId ? await service.submitSessionInput(sessionId, { value: "confirm" }) : undefined;
  const state = await store.read();

  assert.equal(wechatWork.status, "completed");
  assert.deepEqual(adapter.ensureCalls, ["channel:wechat-work"]);
  assert.deepEqual(configSaveCalls, [
    { channelId: "wechat-work", action: "save" },
    { channelId: "wechat", action: "save" }
  ]);
  assert.equal(personalWechat.status, "interactive");
  assert.equal(personalWechat.session?.channelId, "wechat");
  assert.equal(sessionDetail?.session.channelId, "wechat");
  assert.equal(sessionAfterInput?.session.channelId, "wechat");
  assert.equal(state.channelOnboarding?.channels.wechat.status, "awaiting-pairing");
  assert.ok(state.channelOnboarding?.entries?.["wechat:default"]);
});

test("channel approve pairing skips feature prerequisite preparation", async () => {
  class RecordingAdapter extends MockAdapter {
    ensureCalls: string[] = [];

    override async ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }) {
      this.ensureCalls.push(featureId);
      return super.ensureFeatureRequirements(featureId, options);
    }
  }

  const adapter = new RecordingAdapter();
  const { service } = createServices("channel-setup-approve-skip-prepare", { adapter });

  await service.saveEntry(undefined, {
    channelId: "wechat-work",
    action: "save",
    values: {
      botId: "1000001",
      secret: "secret-value"
    }
  });

  const result = await service.saveEntry("wechat-work:default", {
    channelId: "wechat-work",
    action: "approve-pairing",
    values: {
      code: "RRR7T5CT"
    }
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(adapter.ensureCalls, ["channel:wechat-work"]);
});

test("channel setup publishes snapshot and session events for save and input flows", async () => {
  class InteractiveMockAdapter extends MockAdapter {
    override async submitChannelSessionInput(sessionId: string) {
      return {
        id: sessionId,
        channelId: "whatsapp" as const,
        status: "completed" as const,
        message: "Pairing approved.",
        logs: ["Pairing approved."]
      };
    }
  }

  const { service, bus } = createServices("channel-setup-events", {
    withEvents: true,
    adapter: new InteractiveMockAdapter()
  });
  const eventTypes: string[] = [];
  bus?.subscribe((event) => {
    eventTypes.push(event.type);
  });

  const save = await service.saveEntry(undefined, {
    channelId: "whatsapp",
    action: "save",
    values: {}
  });

  assert.equal(save.status, "interactive");
  assert.equal(eventTypes.includes("channel-config.updated"), true);
  assert.equal(eventTypes.includes("channel.session.updated"), true);

  eventTypes.length = 0;

  const sessionId = save.session?.id;
  assert.ok(sessionId);

  await service.submitSessionInput(sessionId!, { value: "123456" });

  assert.equal(eventTypes.includes("channel.session.updated"), true);
});
