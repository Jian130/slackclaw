import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AppState } from "./services/state-store.js";
import {
  resetStateAfterRuntimeUninstall,
  resolveFreshReadInvalidationTargets,
  shouldPublishSnapshotForRoute,
  shouldResetStateAfterDeploymentUninstall
} from "./server.js";

test("fresh overview reads only invalidate overview-related caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/overview"), ["engine", "channels"]);
});

test("fresh AI team reads invalidate model, skill, and member caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/ai-team/overview"), ["models", "skills", "ai-members"]);
});

test("fresh plugin reads invalidate plugin and channel caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/plugins/config"), ["plugins", "channels"]);
});

test("chat thread reads do not invalidate daemon read caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/chat/threads/thread-1"), []);
});

test("non-GET requests do not invalidate daemon read caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("POST", "/api/models/default"), []);
});

test("snapshot GET routes do not emit snapshot events back onto the bus", () => {
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/overview"), false);
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/models/config"), false);
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/channels/config"), false);
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/plugins/config"), false);
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/skills/config"), false);
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/ai-team/overview"), false);
});

test("mutation routes still publish snapshot events", () => {
  assert.equal(shouldPublishSnapshotForRoute("POST", "/api/models/config"), true);
  assert.equal(shouldPublishSnapshotForRoute("PATCH", "/api/ai-team/member-1"), true);
});

test("successful managed-local target uninstall triggers runtime-state reset", () => {
  assert.equal(
    shouldResetStateAfterDeploymentUninstall({
      targetId: "managed-local",
      status: "completed",
      message: "Removed managed runtime.",
      engineStatus: {
        engine: "openclaw",
        installed: false,
        running: false,
        summary: "OpenClaw is removed.",
        lastCheckedAt: "2026-03-27T00:00:00.000Z"
      }
    }),
    true
  );
});

test("successful standard target uninstall triggers runtime-state reset", () => {
  assert.equal(
    shouldResetStateAfterDeploymentUninstall({
      targetId: "standard",
      status: "completed",
      message: "Removed system runtime.",
      engineStatus: {
        engine: "openclaw",
        installed: false,
        running: false,
        summary: "OpenClaw is removed.",
        lastCheckedAt: "2026-03-27T00:00:00.000Z"
      }
    }),
    true
  );
});

test("runtime uninstall reset clears setup and channel onboarding state but preserves unrelated app data", () => {
  const current: AppState = {
    selectedProfileId: "email-admin",
    setupCompletedAt: "2026-03-27T00:00:00.000Z",
    introCompletedAt: "2026-03-27T00:00:00.000Z",
    tasks: [
      {
        taskId: "task-1",
        title: "Existing task",
        status: "completed",
        summary: "Task summary",
        output: "Task output",
        nextActions: [],
        startedAt: "2026-03-27T00:00:00.000Z",
        finishedAt: "2026-03-27T00:10:00.000Z",
        steps: []
      }
    ],
    onboarding: {
      draft: {
        currentStep: "channel"
      }
    },
    channelOnboarding: {
      baseOnboardingCompletedAt: "2026-03-27T00:00:00.000Z",
      gatewayStartedAt: "2026-03-27T00:05:00.000Z",
      channels: {
        telegram: {
          id: "telegram",
          title: "Telegram",
          officialSupport: true,
          status: "completed",
          summary: "Configured",
          detail: "Configured",
          lastUpdatedAt: "2026-03-27T00:00:00.000Z"
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
        wechat: {
          id: "wechat",
          title: "WeChat workaround",
          officialSupport: false,
          status: "not-started",
          summary: "Not started",
          detail: "Not started"
        }
      },
      entries: {
        "telegram:default": {
          id: "telegram:default",
          channelId: "telegram",
          label: "Support Bot",
          editableValues: {
            accountName: "Support Bot"
          },
          maskedConfigSummary: [],
          lastUpdatedAt: "2026-03-27T00:00:00.000Z"
        }
      }
    },
    skills: {
      customEntries: {
        helper: {
          slug: "helper",
          name: "Helper",
          description: "Custom skill",
          instructions: "Do the thing.",
          updatedAt: "2026-03-27T00:00:00.000Z"
        }
      }
    }
  };

  const next = resetStateAfterRuntimeUninstall(current);

  assert.equal(next.setupCompletedAt, undefined);
  assert.equal(next.selectedProfileId, undefined);
  assert.equal(next.onboarding, undefined);
  assert.equal(next.channelOnboarding, undefined);
  assert.equal(next.introCompletedAt, current.introCompletedAt);
  assert.deepEqual(next.tasks, current.tasks);
  assert.deepEqual(next.skills, current.skills);
});

test("server keeps channel session transport instead of adding a workflow-session API", async () => {
  const source = await readFile(resolve(process.cwd(), "apps/daemon/src/server.ts"), "utf8");

  assert.match(source, /\/api\/channels\/session\//);
  assert.doesNotMatch(source, /\/api\/workflow-session\//);
  assert.doesNotMatch(source, /\/api\/workflows\/session\//);
});
