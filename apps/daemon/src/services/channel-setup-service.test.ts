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

test("channel config overview prunes stale stored entries that are no longer live", async () => {
  const adapter = new MockAdapter();
  const mockChannels = adapter as unknown as {
    channels: Record<string, { id: string; title: string; status: string; summary: string; detail: string; lastUpdatedAt?: string }>;
  };
  mockChannels.channels.telegram = {
    ...mockChannels.channels.telegram,
    status: "completed",
    summary: "Telegram is configured in OpenClaw.",
    detail: "OpenClaw detected an existing Telegram bot.",
    lastUpdatedAt: new Date().toISOString()
  };
  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-prune-stale-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  await store.update((current) => ({
    ...current,
    channelOnboarding: {
      baseOnboardingCompletedAt: new Date().toISOString(),
      gatewayStartedAt: undefined,
      channels: {
        telegram: mockChannels.channels.telegram as never,
        whatsapp: {
          id: "whatsapp",
          title: "WhatsApp",
          officialSupport: true,
          status: "completed",
          summary: "Old WhatsApp state",
          detail: "Should be pruned."
        },
        feishu: {
          id: "feishu",
          title: "Feishu (飞书)",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        "wechat-work": {
          id: "wechat-work",
          title: "WeChat Work",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        wechat: {
          id: "wechat",
          title: "WeChat",
          officialSupport: false,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        }
      },
      entries: {
        "whatsapp:default": {
          id: "whatsapp:default",
          channelId: "whatsapp",
          label: "Old WhatsApp",
          editableValues: {},
          maskedConfigSummary: [],
          lastUpdatedAt: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  }));

  const service = new ChannelSetupService(adapter, store);
  const overview = await service.getConfigOverview();
  const state = await store.read();

  assert.deepEqual(overview.entries.map((entry) => entry.id), ["telegram:default"]);
  assert.equal(state.channelOnboarding?.entries?.["whatsapp:default"], undefined);
  assert.equal(state.channelOnboarding?.channels.whatsapp.status, "not-started");
});

test("channel config overview falls back to stored entries when live reads hang", async () => {
  class HangingChannelAdapter extends MockAdapter {
    override async status() {
      return new Promise<Awaited<ReturnType<MockAdapter["status"]>>>(() => undefined);
    }

    override async getChannelState() {
      return new Promise<Awaited<ReturnType<MockAdapter["getChannelState"]>>>(() => undefined);
    }

    override async getConfiguredChannelEntries() {
      return new Promise<Awaited<ReturnType<MockAdapter["getConfiguredChannelEntries"]>>>(() => undefined);
    }

    override async getActiveChannelSession() {
      return new Promise<Awaited<ReturnType<MockAdapter["getActiveChannelSession"]>>>(() => undefined);
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-live-timeout-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  await store.update((current) => ({
    ...current,
    channelOnboarding: {
      baseOnboardingCompletedAt: new Date().toISOString(),
      gatewayStartedAt: undefined,
      channels: {
        telegram: {
          id: "telegram",
          title: "Telegram",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        whatsapp: {
          id: "whatsapp",
          title: "WhatsApp",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        feishu: {
          id: "feishu",
          title: "Feishu (飞书)",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        "wechat-work": {
          id: "wechat-work",
          title: "WeChat Work",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        wechat: {
          id: "wechat",
          title: "WeChat",
          officialSupport: false,
          status: "completed",
          summary: "WeChat login finished.",
          detail: "Saved through onboarding."
        }
      },
      entries: {
        "wechat:default": {
          id: "wechat:default",
          channelId: "wechat",
          label: "WeChat",
          editableValues: {},
          maskedConfigSummary: [],
          lastUpdatedAt: "2026-04-26T00:00:00.000Z"
        }
      }
    }
  }));

  const service = new ChannelSetupService(new HangingChannelAdapter(), store);
  const startedAt = Date.now();
  const overview = await service.getConfigOverview();
  const state = await store.read();

  assert.ok(Date.now() - startedAt < 1_800);
  assert.deepEqual(overview.entries.map((entry) => entry.id), ["wechat:default"]);
  assert.ok(state.channelOnboarding?.entries?.["wechat:default"]);
  assert.equal(state.channelOnboarding?.channels.wechat.status, "completed");
});

test("channel config overview keeps active sessions separate from configured entries", async () => {
  const adapter = new MockAdapter();
  const mock = adapter as unknown as {
    activeChannelSession?: {
      id: string;
      channelId: "wechat";
      status: string;
      message: string;
      logs: string[];
    };
  };
  mock.activeChannelSession = {
    id: "session-wechat",
    channelId: "wechat",
    status: "running",
    message: "Waiting for QR confirmation.",
    logs: ["QR code generated."]
  };
  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-session-separate-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  await store.update((current) => ({
    ...current,
    channelOnboarding: {
      baseOnboardingCompletedAt: new Date().toISOString(),
      gatewayStartedAt: undefined,
      channels: {
        telegram: {
          id: "telegram",
          title: "Telegram",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        whatsapp: {
          id: "whatsapp",
          title: "WhatsApp",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        feishu: {
          id: "feishu",
          title: "Feishu (飞书)",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        "wechat-work": {
          id: "wechat-work",
          title: "WeChat Work",
          officialSupport: true,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        },
        wechat: {
          id: "wechat",
          title: "WeChat",
          officialSupport: false,
          status: "awaiting-pairing",
          summary: "Waiting for QR confirmation.",
          detail: "Scan the code."
        }
      },
      entries: {
        "wechat:default": {
          id: "wechat:default",
          channelId: "wechat",
          label: "WeChat",
          editableValues: {},
          maskedConfigSummary: [],
          lastUpdatedAt: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  }));

  const service = new ChannelSetupService(adapter, store);
  const overview = await service.getConfigOverview();
  const state = await store.read();

  assert.equal(overview.entries.some((entry) => entry.id === "wechat:default"), false);
  assert.equal(overview.activeSession?.channelId, "wechat");
  assert.ok(state.channelOnboarding?.entries?.["wechat:default"]);
  assert.equal(state.channelOnboarding?.channels.wechat.status, "awaiting-pairing");
});

test("channel config overview exposes personal WeChat pairing as a live follow-up action", async () => {
  const { service } = createServices("channel-setup-wechat-pairing");

  const overview = await service.getConfigOverview();
  const capability = overview.capabilities.find((entry) => entry.id === "wechat");

  assert.deepEqual(overview.capabilities.map((entry) => entry.id), ["wechat"]);
  assert.equal(capability?.supportsPairing, true);
  assert.equal(capability?.supportsEdit, true);
  assert.equal(capability?.supportsRemove, true);
  assert.equal(capability?.fieldDefs.some((field) => field.id === "code"), true);
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

test("channel setup removes live configured entries even when stored metadata is missing", async () => {
  const adapter = new MockAdapter();
  const mockChannels = adapter as unknown as {
    channels: Record<string, { id: string; title: string; status: string; summary: string; detail: string; lastUpdatedAt?: string }>;
  };
  mockChannels.channels.telegram = {
    ...mockChannels.channels.telegram,
    status: "completed",
    summary: "Telegram is configured in OpenClaw.",
    detail: "OpenClaw detected an existing Telegram bot.",
    lastUpdatedAt: new Date().toISOString()
  };
  const filePath = resolve(process.cwd(), `apps/daemon/.data/channel-setup-remove-live-entry-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  const service = new ChannelSetupService(adapter, store);

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

test("interactive WeChat session responses reuse staged config without probing live runtime", async () => {
  class CountingAdapter extends MockAdapter {
    configuredEntryReads = 0;
    channelStateReads = 0;
    statusReads = 0;

    override async getConfiguredChannelEntries() {
      this.configuredEntryReads += 1;
      return super.getConfiguredChannelEntries();
    }

    override async getChannelState(channelId: Parameters<MockAdapter["getChannelState"]>[0]) {
      this.channelStateReads += 1;
      return super.getChannelState(channelId);
    }
  }

  const adapter = new CountingAdapter();
  const originalStatus = adapter.instances.status.bind(adapter.instances);
  adapter.instances.status = async () => {
    adapter.statusReads += 1;
    return originalStatus();
  };

  const { service } = createServices("channel-setup-wechat-session-config", { adapter });
  const save = await service.saveEntry(undefined, {
    channelId: "wechat",
    action: "save",
    values: {}
  });

  const sessionId = save.session?.id;
  assert.ok(sessionId);
  assert.equal(adapter.configuredEntryReads, 0);
  assert.equal(adapter.channelStateReads, 0);
  assert.equal(adapter.statusReads, 0);

  adapter.configuredEntryReads = 0;
  adapter.channelStateReads = 0;
  adapter.statusReads = 0;

  const sessionDetail = await service.getSession(sessionId!);

  assert.equal(sessionDetail.session.channelId, "wechat");
  assert.equal(sessionDetail.channelConfig.entries[0]?.id, "wechat:default");
  assert.equal(adapter.configuredEntryReads, 0);
  assert.equal(adapter.channelStateReads, 0);
  assert.equal(adapter.statusReads, 0);

  const afterInput = await service.submitSessionInput(sessionId!, { value: "confirm" });

  assert.equal(afterInput.session.status, "completed");
  assert.equal(afterInput.channelConfig.entries[0]?.status, "completed");
  assert.equal(adapter.configuredEntryReads, 0);
  assert.equal(adapter.channelStateReads, 0);
  assert.equal(adapter.statusReads, 0);
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
