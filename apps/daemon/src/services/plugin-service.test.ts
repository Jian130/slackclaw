import test from "node:test";
import assert from "node:assert/strict";

import { MockAdapter } from "../engine/mock-adapter.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { PluginService } from "./plugin-service.js";

test("plugin service exposes the managed WeChat plugin dependency", async () => {
  const service = new PluginService(new MockAdapter());

  const overview = await service.getConfigOverview();

  assert.equal(overview.entries[0]?.id, "wecom");
  assert.equal(overview.entries[0]?.packageSpec, "@wecom/wecom-openclaw-plugin");
  assert.equal(overview.entries[0]?.dependencies[0]?.id, "channel:wechat-work");
  assert.equal(overview.entries[0]?.activeDependentCount, 0);
});

test("plugin service publishes plugin snapshots after install actions", async () => {
  const bus = new EventBusService();
  const events: string[] = [];
  bus.subscribe((event) => {
    events.push(event.type);
  });
  const service = new PluginService(new MockAdapter(), new EventPublisher(bus));

  const result = await service.installPlugin("wecom");

  assert.equal(result.status, "completed");
  assert.equal(events.includes("plugin-config.updated"), true);
  assert.equal(result.pluginConfig.entries[0]?.status, "ready");
});

test("plugin service blocks removal while WeChat still depends on the managed plugin", async () => {
  const adapter = new MockAdapter();
  const service = new PluginService(adapter);

  await adapter.config.saveChannelEntry({
    channelId: "wechat-work",
    values: {
      botId: "bot-id",
      secret: "secret-value"
    }
  });

  await assert.rejects(() => service.removePlugin("wecom"), /still required/i);
});
