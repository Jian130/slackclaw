import test from "node:test";
import assert from "node:assert/strict";

import type { AppState } from "./services/state-store.js";
import {
  resetStateAfterRuntimeUninstall,
  resolveFreshReadInvalidationTargets,
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
