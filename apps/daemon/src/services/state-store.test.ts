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
    },
    onboarding: {
      draft: {
        currentStep: "channel",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
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
    botId: "1000001",
    secret: "secret-value"
  });
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.maskedConfigSummary, [
    { label: "Bot ID", value: "1000001" }
  ]);
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.lastUpdatedAt, "2026-03-24T00:03:00.000Z");
  assert.equal(migrated.onboarding?.draft.channel?.channelId, "wechat-work");
  assert.equal(migrated.onboarding?.draft.channel?.entryId, "wechat-work:default");
});

test("state store preserves canonical wechat-work state when legacy wechat data collides", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/state-store-wechat-collision-${randomUUID()}.json`);
  const store = new StateStore(filePath);

  await store.write({
    tasks: [],
    channelOnboarding: {
      channels: {
        "wechat-work": {
          id: "wechat-work",
          title: "WeChat Work",
          officialSupport: false,
          status: "completed",
          summary: "Canonical WeChat Work state.",
          detail: "Canonical channel state should win.",
          lastUpdatedAt: "2026-03-26T00:00:00.000Z",
          logs: ["canonical channel"]
        },
        wechat: {
          id: "wechat",
          title: "Legacy WeChat Work",
          officialSupport: false,
          status: "failed",
          summary: "Legacy state should not overwrite canonical.",
          detail: "Legacy channel state should lose on collision.",
          lastUpdatedAt: "2026-03-25T00:00:00.000Z",
          logs: ["legacy channel"]
        }
      },
      entries: {
        "wechat-work:default": {
          id: "wechat-work:default",
          channelId: "wechat-work",
          label: "Canonical WeChat Work",
          editableValues: {
            botId: "canonical-bot",
            secret: "canonical-secret"
          },
          maskedConfigSummary: [{ label: "Bot ID", value: "canonical-bot" }],
          lastUpdatedAt: "2026-03-26T00:01:00.000Z"
        },
        "wechat:default": {
          id: "wechat:default",
          channelId: "wechat",
          label: "Legacy WeChat Work",
          editableValues: {
            corpId: "legacy-corp",
            agentId: "1000001",
            secret: "legacy-secret"
          },
          maskedConfigSummary: [{ label: "Corp ID", value: "legacy-corp" }],
          lastUpdatedAt: "2026-03-25T00:01:00.000Z"
        },
        "wechat:secondary": {
          id: "wechat:secondary",
          channelId: "wechat",
          label: "Legacy Secondary",
          editableValues: {
            corpId: "secondary-corp",
            agentId: "1000002",
            secret: "secondary-secret"
          },
          maskedConfigSummary: [{ label: "Corp ID", value: "secondary-corp" }],
          lastUpdatedAt: "2026-03-25T00:02:00.000Z"
        }
      }
    },
    onboarding: {
      draft: {
        currentStep: "channel",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        }
      }
    }
  });

  const migrated = await store.read();

  assert.equal(migrated.channelOnboarding?.channels["wechat-work"]?.summary, "Canonical WeChat Work state.");
  assert.deepEqual(migrated.channelOnboarding?.channels["wechat-work"]?.logs, ["canonical channel"]);
  assert.equal(migrated.channelOnboarding?.channels.wechat, undefined);
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:default"]?.editableValues, {
    botId: "canonical-bot",
    secret: "canonical-secret"
  });
  assert.equal(migrated.channelOnboarding?.entries?.["wechat:default"], undefined);
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:secondary"]?.id, "wechat-work:secondary");
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:secondary"]?.channelId, "wechat-work");
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:secondary"]?.editableValues, {
    botId: "1000002",
    secret: "secondary-secret"
  });
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat-work:secondary"]?.maskedConfigSummary, [
    { label: "Bot ID", value: "1000002" }
  ]);
  assert.equal(migrated.onboarding?.draft.channel?.channelId, "wechat-work");
  assert.equal(migrated.onboarding?.draft.channel?.entryId, "wechat-work:default");
});

test("state store preserves genuine personal wechat channel state", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/state-store-personal-wechat-${randomUUID()}.json`);
  const store = new StateStore(filePath);

  await store.write({
    tasks: [],
    channelOnboarding: {
      channels: {
        wechat: {
          id: "wechat",
          title: "WeChat",
          officialSupport: false,
          status: "completed",
          summary: "Personal WeChat is connected.",
          detail: "This is the personal WeChat login flow.",
          lastUpdatedAt: "2026-03-27T00:00:00.000Z",
          logs: ["personal wechat ready"]
        }
      },
      entries: {
        "wechat:personal": {
          id: "wechat:personal",
          channelId: "wechat",
          label: "Personal WeChat",
          editableValues: {
            sessionMode: "qr-login"
          },
          maskedConfigSummary: [{ label: "Login", value: "QR linked" }],
          lastUpdatedAt: "2026-03-27T00:01:00.000Z"
        }
      }
    },
    onboarding: {
      draft: {
        currentStep: "channel",
        channel: {
          channelId: "wechat",
          entryId: "wechat:personal"
        }
      }
    }
  });

  const migrated = await store.read();

  assert.equal(migrated.channelOnboarding?.channels.wechat?.id, "wechat");
  assert.equal(migrated.channelOnboarding?.channels["wechat-work"], undefined);
  assert.equal(migrated.channelOnboarding?.entries?.["wechat:personal"]?.channelId, "wechat");
  assert.equal(migrated.channelOnboarding?.entries?.["wechat-work:personal"], undefined);
  assert.deepEqual(migrated.channelOnboarding?.entries?.["wechat:personal"]?.editableValues, {
    sessionMode: "qr-login"
  });
  assert.equal(migrated.onboarding?.draft.channel?.channelId, "wechat");
  assert.equal(migrated.onboarding?.draft.channel?.entryId, "wechat:personal");
});
