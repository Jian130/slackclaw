import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { StateStore, type AppState } from "./services/state-store.js";
import {
  startServer,
  clearRuntimeUninstallState,
  resetStateAfterRuntimeUninstall,
  resolveFreshReadInvalidationTargets,
  shouldPublishSnapshotForRoute,
  shouldResetStateAfterDeploymentUninstall
} from "./server.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

test("fresh overview reads only invalidate overview-related caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/overview"), ["engine", "channels"]);
});

test("fresh AI team reads invalidate model, skill, and member caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/ai-team/overview"), ["models", "skills", "ai-members"]);
});

test("fresh onboarding state reads reuse daemon caches", () => {
  assert.deepEqual(resolveFreshReadInvalidationTargets("GET", "/api/onboarding/state"), []);
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
  assert.equal(shouldPublishSnapshotForRoute("GET", "/api/downloads"), false);
});

test("mutation routes still publish snapshot events", () => {
  assert.equal(shouldPublishSnapshotForRoute("POST", "/api/models/config"), true);
  assert.equal(shouldPublishSnapshotForRoute("PATCH", "/api/ai-team/member-1"), true);
});

test("server allows long-running onboarding install requests to outlive Node's default timeout", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  process.env.CHILLCLAW_ENGINE = "mock";

  const server = startServer(0);
  await once(server, "listening");

  try {
    assert.ok(server.requestTimeout === 0 || server.requestTimeout > 300_000);
    assert.ok(server.timeout === 0 || server.timeout > 300_000);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (previousEngine === undefined) delete process.env.CHILLCLAW_ENGINE;
    else process.env.CHILLCLAW_ENGINE = previousEngine;
  }
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
    onboardingWarmups: {
      "onboarding-warmup:task-1": {
        taskId: "onboarding-warmup:task-1",
        memberId: "member-1",
        agentId: "chillclaw-member-helper-20260327-000000",
        presetSkillIds: ["research-brief"],
        targetMode: "managed-local",
        status: "pending",
        lastMessage: "Finishing workspace setup in the background.",
        createdAt: "2026-03-27T00:00:00.000Z",
        updatedAt: "2026-03-27T00:00:00.000Z"
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
    aiTeam: {
      teamVision: "A helpful team.",
      members: {
        "member-1": {
          id: "member-1",
          agentId: "chillclaw-member-helper-20260327-000000",
          source: "chillclaw",
          hasManagedMetadata: true,
          name: "Helper",
          jobTitle: "Research assistant",
          status: "ready",
          currentStatus: "Ready for new assignments.",
          activeTaskCount: 0,
          avatar: {
            presetId: "onboarding-analyst",
            accent: "#97b5ea",
            emoji: "🧠",
            theme: "onboarding"
          },
          teamIds: [],
          bindingCount: 1,
          bindings: [{ id: "telegram:default", target: "telegram:default" }],
          lastUpdatedAt: "2026-03-27T00:00:00.000Z",
          personality: "Clear and supportive",
          soul: "Clear and supportive",
          workStyles: ["Direct"],
          skillIds: [],
          knowledgePackIds: [],
          capabilitySettings: {
            memoryEnabled: true,
            contextWindow: 128000
          },
          agentDir: "/tmp/chillclaw/member-1/agent",
          workspaceDir: "/tmp/chillclaw/member-1/workspace"
        }
      },
      teams: {},
      activity: []
    },
    chat: {
      threads: {
        "thread-1": {
          id: "thread-1",
          memberId: "member-1",
          agentId: "chillclaw-member-helper-20260327-000000",
          sessionKey: "agent:chillclaw-member-helper-20260327-000000:chillclaw-chat:thread-1",
          title: "Existing chat",
          createdAt: "2026-03-27T00:00:00.000Z",
          updatedAt: "2026-03-27T00:00:00.000Z"
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
  assert.equal(next.onboardingWarmups, undefined);
  assert.equal(next.channelOnboarding, undefined);
  assert.equal(next.aiTeam, undefined);
  assert.equal(next.chat, undefined);
  assert.equal(next.introCompletedAt, current.introCompletedAt);
  assert.deepEqual(next.tasks, current.tasks);
  assert.deepEqual(next.skills, current.skills);
});

test("runtime uninstall reset removes managed AI member workspace data", async () => {
  const previousDataDir = process.env.CHILLCLAW_DATA_DIR;
  const root = await mkdtemp(resolve(tmpdir(), "chillclaw-runtime-reset-"));
  const aiMembersDir = resolve(root, "ai-members");
  const store = new StateStore(resolve(root, "state.json"));

  process.env.CHILLCLAW_DATA_DIR = root;

  try {
    await mkdir(resolve(aiMembersDir, "member-1", "workspace"), { recursive: true });
    await store.write({
      setupCompletedAt: "2026-03-27T00:00:00.000Z",
      tasks: [],
      aiTeam: {
        teamVision: "A helpful team.",
        members: {},
        teams: {},
        activity: []
      }
    });

    await clearRuntimeUninstallState(store);

    assert.equal(await pathExists(aiMembersDir), false);
  } finally {
    if (previousDataDir === undefined) delete process.env.CHILLCLAW_DATA_DIR;
    else process.env.CHILLCLAW_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime uninstall reset removes ChillClaw-managed agents from OpenClaw config", async () => {
  const previousDataDir = process.env.CHILLCLAW_DATA_DIR;
  const previousHome = process.env.HOME;
  const root = await mkdtemp(resolve(tmpdir(), "chillclaw-runtime-reset-config-"));
  const home = resolve(root, "home");
  const configPath = resolve(home, ".openclaw", "openclaw.json");
  const store = new StateStore(resolve(root, "state.json"));

  process.env.CHILLCLAW_DATA_DIR = resolve(root, "data");
  process.env.HOME = home;

  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      agents: {
        defaults: {
          model: "openai/gpt-5"
        },
        list: [
          {
            id: "chillclaw-member-old-helper-20260411-000000",
            name: "Old Helper",
            default: true,
            workspace: resolve(root, "old-helper", "workspace"),
            agentDir: resolve(root, "old-helper", "agent")
          },
          {
            id: "existing-openclaw-agent",
            name: "Existing Agent",
            workspace: resolve(root, "existing", "workspace"),
            agentDir: resolve(root, "existing", "agent")
          }
        ]
      },
      bindings: [
        {
          type: "route",
          agentId: "chillclaw-member-old-helper-20260411-000000",
          match: {
            channel: "openclaw-weixin",
            accountId: "default"
          }
        },
        {
          type: "route",
          agentId: "existing-openclaw-agent",
          match: {
            channel: "telegram",
            accountId: "default"
          }
        }
      ]
    }));
    await store.write({
      setupCompletedAt: "2026-04-12T00:00:00.000Z",
      tasks: []
    });

    await clearRuntimeUninstallState(store);

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: {
        list?: Array<{ id?: string; default?: boolean }>;
      };
      bindings?: Array<{ agentId?: string }>;
    };
    assert.deepEqual(
      config.agents?.list?.map((agent) => agent.id),
      ["existing-openclaw-agent"]
    );
    assert.equal(config.agents?.list?.some((agent) => agent.default === true), false);
    assert.deepEqual(
      config.bindings?.map((binding) => binding.agentId),
      ["existing-openclaw-agent"]
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.CHILLCLAW_DATA_DIR;
    else process.env.CHILLCLAW_DATA_DIR = previousDataDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});

test("server keeps channel session transport instead of adding a workflow-session API", async () => {
  const serverSource = await readFile(resolve(sourceDir, "server.ts"), "utf8");
  const channelsSource = await readFile(resolve(sourceDir, "routes/channels.ts"), "utf8");

  assert.match(serverSource, /findRouteDefinition/);
  assert.match(channelsSource, /\/api\/channels\/session\/:sessionId/);
  assert.doesNotMatch(serverSource, /\/api\/workflow-session\//);
  assert.doesNotMatch(serverSource, /\/api\/workflows\/session\//);
  assert.doesNotMatch(channelsSource, /\/api\/workflow-session\//);
  assert.doesNotMatch(channelsSource, /\/api\/workflows\/session\//);
});

test("dev-mode app update routes report unsupported status", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  const previousAppRoot = process.env.CHILLCLAW_APP_ROOT;
  const previousAppVersion = process.env.CHILLCLAW_APP_VERSION;
  const previousFeedUrl = process.env.CHILLCLAW_APP_UPDATE_FEED_URL;
  process.env.CHILLCLAW_ENGINE = "mock";
  delete process.env.CHILLCLAW_APP_ROOT;
  delete process.env.CHILLCLAW_APP_VERSION;
  delete process.env.CHILLCLAW_APP_UPDATE_FEED_URL;

  const server = startServer(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/app/update`);
    const getPayload = await getResponse.json();
    const postResponse = await fetch(`http://127.0.0.1:${port}/api/app/update/check`, { method: "POST" });
    const postPayload = await postResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(getPayload.status, "unsupported");
    assert.equal(postResponse.status, 200);
    assert.equal(postPayload.appUpdate.status, "unsupported");
    assert.equal(postPayload.overview.appUpdate.status, "unsupported");
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (previousEngine === undefined) delete process.env.CHILLCLAW_ENGINE;
    else process.env.CHILLCLAW_ENGINE = previousEngine;
    if (previousAppRoot === undefined) delete process.env.CHILLCLAW_APP_ROOT;
    else process.env.CHILLCLAW_APP_ROOT = previousAppRoot;
    if (previousAppVersion === undefined) delete process.env.CHILLCLAW_APP_VERSION;
    else process.env.CHILLCLAW_APP_VERSION = previousAppVersion;
    if (previousFeedUrl === undefined) delete process.env.CHILLCLAW_APP_UPDATE_FEED_URL;
    else process.env.CHILLCLAW_APP_UPDATE_FEED_URL = previousFeedUrl;
  }
});

test("forced app update check refreshes overview state and engine update alias remains available", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  const previousAppRoot = process.env.CHILLCLAW_APP_ROOT;
  const previousAppVersion = process.env.CHILLCLAW_APP_VERSION;
  const previousFeedUrl = process.env.CHILLCLAW_APP_UPDATE_FEED_URL;
  process.env.CHILLCLAW_ENGINE = "mock";
  process.env.CHILLCLAW_APP_ROOT = "/Applications/ChillClaw.app/Contents/Resources";
  process.env.CHILLCLAW_APP_VERSION = "0.1.2";

  const feedServer = createServer((_, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      tag_name: "v0.1.4",
      prerelease: false,
      draft: false,
      html_url: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
      published_at: "2026-04-04T10:00:00.000Z",
      assets: [
        {
          name: "ChillClaw-macOS.dmg",
          browser_download_url: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.dmg"
        }
      ]
    }));
  });
  feedServer.listen(0, "127.0.0.1");
  await once(feedServer, "listening");
  process.env.CHILLCLAW_APP_UPDATE_FEED_URL = `http://127.0.0.1:${(feedServer.address() as AddressInfo).port}/releases/latest`;

  const server = startServer(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  try {
    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/app/update/check`, { method: "POST" });
    const updatePayload = await updateResponse.json();
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/overview`);
    const overviewPayload = await overviewResponse.json();
    const engineResponse = await fetch(`http://127.0.0.1:${port}/api/engine/update`, { method: "POST" });
    const enginePayload = await engineResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.appUpdate.status, "update-available");
    assert.equal(updatePayload.overview.appUpdate.latestVersion, "0.1.4");
    assert.equal(overviewPayload.appUpdate.latestVersion, "0.1.4");
    assert.equal(engineResponse.status, 200);
    assert.match(enginePayload.message, /recommended version|update/i);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await new Promise<void>((resolveClose) => feedServer.close(() => resolveClose()));
    if (previousEngine === undefined) delete process.env.CHILLCLAW_ENGINE;
    else process.env.CHILLCLAW_ENGINE = previousEngine;
    if (previousAppRoot === undefined) delete process.env.CHILLCLAW_APP_ROOT;
    else process.env.CHILLCLAW_APP_ROOT = previousAppRoot;
    if (previousAppVersion === undefined) delete process.env.CHILLCLAW_APP_VERSION;
    else process.env.CHILLCLAW_APP_VERSION = previousAppVersion;
    if (previousFeedUrl === undefined) delete process.env.CHILLCLAW_APP_UPDATE_FEED_URL;
    else process.env.CHILLCLAW_APP_UPDATE_FEED_URL = previousFeedUrl;
  }
});

test("legacy onboarding setup route returns route not found", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  process.env.CHILLCLAW_ENGINE = "mock";

  const server = startServer(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/onboarding/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        autoConfigure: true,
        forceLocal: true
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error, "Route not found.");
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (previousEngine === undefined) delete process.env.CHILLCLAW_ENGINE;
    else process.env.CHILLCLAW_ENGINE = previousEngine;
  }
});

test("server matches mutable skill routes from pathname instead of raw request.url", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  process.env.CHILLCLAW_ENGINE = "mock";

  const server = startServer(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skills/Skill%20Finder%20-%20Search%20Skills?fresh=1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-marketplace" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "completed");
    assert.match(payload.message, /updated/i);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (previousEngine === undefined) {
      delete process.env.CHILLCLAW_ENGINE;
    } else {
      process.env.CHILLCLAW_ENGINE = previousEngine;
    }
  }
});

test("AI team overview route returns a daemon snapshot instead of an unsupported placeholder", async () => {
  const previousEngine = process.env.CHILLCLAW_ENGINE;
  process.env.CHILLCLAW_ENGINE = "mock";

  const server = startServer(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai-team/overview`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(typeof payload.teamVision, "string");
    assert.ok(Array.isArray(payload.members));
    assert.ok(Array.isArray(payload.teams));
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (previousEngine === undefined) {
      delete process.env.CHILLCLAW_ENGINE;
    } else {
      process.env.CHILLCLAW_ENGINE = previousEngine;
    }
  }
});
