import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { StateStore } from "./state-store.js";

test("state store normalizes legacy wechat channel onboarding state to wechat-work", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/state-store-wechat-migration-${randomUUID()}.json`);
  const store = new StateStore(filePath);

  await store.write({
    tasks: [],
    channelOnboarding: {
      baseOnboardingCompletedAt: "2026-03-24T00:00:00.000Z",
      gatewayStartedAt: "2026-03-24T00:01:00.000Z",
      channels: {
        wechat: {
          id: "wechat",
          title: "WeChat Work",
          officialSupport: false,
          status: "completed",
          summary: "WeChat Work is configured.",
          detail: "Legacy WeChat Work state.",
          lastUpdatedAt: "2026-03-24T00:02:00.000Z",
          logs: ["legacy setup finished"]
        }
      },
      entries: {
        "wechat:default": {
          id: "wechat:default",
          channelId: "wechat",
          label: "WeChat Work",
          editableValues: {
            corpId: "corp-id",
            agentId: "1000001",
            secret: "secret-value"
          },
          maskedConfigSummary: [
            { label: "Corp ID", value: "corp-id" },
            { label: "Agent ID", value: "1000001" }
          ],
          lastUpdatedAt: "2026-03-24T00:03:00.000Z"
        }
      }
    }
  });

  const migrated = await store.read();

  assert.equal(migrated.channelOnboarding?.channels.wechat, undefined);
  assert.equal(migrated.channelOnboarding?.channels["wechat-work"]?.id, "wechat-work");
  assert.equal(migrated.channelOnboarding?.channels["wechat-work"]?.status, "completed");
  assert.equal(migrated.channelOnboarding?.channels["wechat-work"]?.logs?.[0], "legacy setup finished");
  assert.equal(migrated.channelOnboarding?.baseOnboardingCompletedAt, "2026-03-24T00:00:00.000Z");
  assert.equal(migrated.channelOnboarding?.gatewayStartedAt, "2026-03-24T00:01:00.000Z");
  assert.equal(migrated.channelOnboarding?.entries?.["wechat:default"], undefined);
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.id, "wechat-work:default");
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.channelId, "wechat-work");
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.editableValues, {
    corpId: "corp-id",
    agentId: "1000001",
    secret: "secret-value"
  });
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.maskedConfigSummary, [
    { label: "Corp ID", value: "corp-id" },
    { label: "Agent ID", value: "1000001" }
  ]);
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.lastUpdatedAt, "2026-03-24T00:03:00.000Z");
});
