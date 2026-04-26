import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultLocalModelRuntimeOverview, createDefaultRuntimeManagerOverview } from "@chillclaw/contracts";

import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";

test("event publisher emits authoritative snapshot events and returns sync metadata", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const events: string[] = [];
  let revision = 0;

  bus.subscribe((event) => {
    events.push(event.type);
    if (event.type === "overview.updated") {
      revision = event.snapshot.revision;
    }
  });

  const sync = publisher.publishOverviewUpdated({
    appName: "ChillClaw",
    appVersion: "0.1.2",
    platformTarget: "macos",
    appUpdate: {
      status: "unsupported",
      supported: false,
      currentVersion: "0.1.2",
      checkedAt: new Date().toISOString(),
      summary: "App updates are available from the packaged macOS app.",
      detail: "ChillClaw can only check app releases from the packaged macOS app."
    },
    firstRun: {
      introCompleted: false,
      setupCompleted: false
    },
    appService: {
      mode: "launchagent",
      installed: false,
      running: false,
      managedAtLogin: false,
      summary: "Not installed.",
      detail: "No per-user service is installed."
    },
    engine: {
      engine: "openclaw",
      installed: false,
      running: false,
      summary: "Not installed.",
      lastCheckedAt: new Date().toISOString()
    },
    installSpec: {
      engine: "openclaw",
      desiredVersion: "latest",
      installSource: "bundle",
      prerequisites: []
    },
    capabilities: {
      engine: "openclaw",
      supportsInstall: true,
      supportsUpdate: true,
      supportsRecovery: true,
      supportsStreaming: true,
      runtimeModes: ["gateway"],
      supportedChannels: [],
      starterSkillCategories: [],
      futureLocalModelFamilies: []
    },
    installChecks: [],
    channelSetup: {
      baseOnboardingCompleted: true,
      channels: [],
      gatewayStarted: false,
      gatewaySummary: "Idle."
    },
    runtimeManager: createDefaultRuntimeManagerOverview(),
    profiles: [],
    templates: [],
    healthChecks: [],
    recoveryActions: [],
    recentTasks: []
  });

  assert.deepEqual(events, ["overview.updated"]);
  assert.equal(sync.revision, revision);
  assert.equal(sync.settled, true);
});

test("event bus replays the latest retained snapshot events to new subscribers", () => {
  const bus = new EventBusService();

  bus.publish({
    type: "overview.updated",
    snapshot: {
      epoch: "daemon-epoch-1",
      revision: 1,
      data: {
        appName: "ChillClaw",
        appVersion: "0.1.2",
        platformTarget: "macos",
        appUpdate: {
          status: "unsupported",
          supported: false,
          currentVersion: "0.1.2",
          checkedAt: new Date().toISOString(),
          summary: "App updates are available from the packaged macOS app.",
          detail: "ChillClaw can only check app releases from the packaged macOS app."
        },
        firstRun: {
          introCompleted: false,
          setupCompleted: false
        },
        appService: {
          mode: "launchagent",
          installed: false,
          running: false,
          managedAtLogin: false,
          summary: "Not installed.",
          detail: "No per-user service is installed."
        },
        engine: {
          engine: "openclaw",
          installed: false,
          running: false,
          summary: "Not installed.",
          lastCheckedAt: new Date().toISOString()
        },
        installSpec: {
          engine: "openclaw",
          desiredVersion: "latest",
          installSource: "bundle",
          prerequisites: []
        },
        capabilities: {
          engine: "openclaw",
          supportsInstall: true,
          supportsUpdate: true,
          supportsRecovery: true,
          supportsStreaming: true,
          runtimeModes: ["gateway"],
          supportedChannels: [],
          starterSkillCategories: [],
          futureLocalModelFamilies: []
        },
        installChecks: [],
        channelSetup: {
          baseOnboardingCompleted: true,
          channels: [],
          gatewayStarted: false,
          gatewaySummary: "Idle."
        },
        runtimeManager: createDefaultRuntimeManagerOverview(),
        profiles: [],
        templates: [],
        healthChecks: [],
        recoveryActions: [],
        recentTasks: []
      }
    }
  });

  const replayed = bus.getRetainedEvents();

  assert.equal(replayed.length, 1);
  assert.equal(replayed[0]?.type, "overview.updated");
  assert.equal(replayed[0]?.snapshot.revision, 1);
});

test("event publisher emits retained plugin snapshot events", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  let publishedRevision = 0;

  bus.subscribe((event) => {
    if (event.type === "plugin-config.updated") {
      publishedRevision = event.snapshot.revision;
    }
  });

  const sync = publisher.publishPluginConfigUpdated({
    entries: [
      {
        id: "wecom",
        label: "WeCom Plugin",
        packageSpec: "@wecom/wecom-openclaw-plugin",
        runtimePluginId: "wecom-openclaw-plugin",
        configKey: "wecom",
        status: "ready",
        summary: "Plugin is ready.",
        detail: "Managed by ChillClaw.",
        enabled: true,
        installed: true,
        hasUpdate: false,
        hasError: false,
        activeDependentCount: 0,
        dependencies: []
      }
    ]
  });

  const replayed = bus.getRetainedEvents();

  assert.equal(sync.revision, publishedRevision);
  assert.equal(replayed.some((event) => event.type === "plugin-config.updated"), true);
});

test("event publisher emits local runtime progress and completion events", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const events: string[] = [];

  bus.subscribe((event) => {
    events.push(event.type);
  });

  const localRuntime = {
    ...createDefaultLocalModelRuntimeOverview(),
    supported: true,
    recommendation: "local" as const,
    supportCode: "supported" as const,
    status: "downloading-model" as const,
    runtimeInstalled: true,
    runtimeReachable: true,
    modelDownloaded: false,
    activeInOpenClaw: false,
    recommendedTier: "medium" as const,
    requiredDiskGb: 16,
    totalMemoryGb: 36,
    freeDiskGb: 128,
    chosenModelKey: "ollama/gemma4:e4b",
    summary: "Local AI is downloading.",
    detail: "ChillClaw is downloading the starter local model."
  };

  publisher.publishLocalRuntimeProgress({
    action: "install",
    phase: "downloading-model",
    message: "Downloading model",
    localRuntime
  });
  publisher.publishLocalRuntimeCompleted({
    action: "install",
    status: "completed",
    message: "Local AI is ready.",
    localRuntime: {
      ...localRuntime,
      status: "ready",
      modelDownloaded: true,
      activeInOpenClaw: true
    }
  });

  assert.deepEqual(events, ["local-runtime.progress", "local-runtime.completed"]);
});

test("event bus retains the latest local runtime event for reconnecting clients", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const localRuntime = {
    ...createDefaultLocalModelRuntimeOverview(),
    supported: true,
    recommendation: "local" as const,
    supportCode: "supported" as const,
    status: "downloading-model" as const,
    runtimeInstalled: true,
    runtimeReachable: true,
    modelDownloaded: false,
    activeInOpenClaw: false,
    recommendedTier: "medium" as const,
    requiredDiskGb: 16,
    totalMemoryGb: 36,
    freeDiskGb: 128,
    chosenModelKey: "ollama/gemma4:e4b",
    summary: "Local AI is downloading.",
    detail: "ChillClaw is downloading the starter local model."
  };

  publisher.publishLocalRuntimeProgress({
    action: "install",
    phase: "downloading-model",
    message: "Downloading model",
    localRuntime
  });
  publisher.publishLocalRuntimeCompleted({
    action: "install",
    status: "completed",
    message: "Local AI is ready.",
    localRuntime: {
      ...localRuntime,
      status: "ready",
      modelDownloaded: true,
      activeInOpenClaw: true
    }
  });

  const retained = bus.getRetainedEvents().filter((event) => event.type.startsWith("local-runtime."));

  assert.equal(retained.length, 1);
  assert.equal(retained[0]?.type, "local-runtime.completed");
  assert.equal(retained[0]?.message, "Local AI is ready.");
  assert.equal(retained[0]?.localRuntime.status, "ready");
});

test("event publisher emits generic runtime progress, completion, and staged update events", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const events: string[] = [];
  const runtimeManager = createDefaultRuntimeManagerOverview({
    checkedAt: "2026-04-13T00:00:00.000Z",
    resources: [
      {
        id: "ollama-runtime",
        kind: "local-ai-runtime",
        label: "Ollama runtime",
        status: "staged-update",
        sourcePolicy: ["bundled", "download"],
        updatePolicy: "stage-silently-apply-safely",
        installedVersion: "0.20.5",
        stagedVersion: "0.20.6",
        updateAvailable: true,
        summary: "Ollama update is staged.",
        detail: "ChillClaw can apply this update when local AI is idle."
      }
    ]
  });

  bus.subscribe((event) => {
    events.push(event.type);
  });

  publisher.publishRuntimeProgress({
    resourceId: "ollama-runtime",
    action: "stage-update",
    phase: "downloading",
    percent: 50,
    message: "Downloading Ollama update.",
    runtimeManager
  });
  publisher.publishRuntimeUpdateStaged({
    resourceId: "ollama-runtime",
    version: "0.20.6",
    message: "Ollama update is staged.",
    runtimeManager
  });
  publisher.publishRuntimeCompleted({
    resourceId: "ollama-runtime",
    action: "apply-update",
    status: "completed",
    message: "Ollama runtime updated.",
    runtimeManager
  });

  assert.deepEqual(events, ["runtime.progress", "runtime.update-staged", "runtime.completed"]);
});

test("event publisher emits retained operation update and completion events", () => {
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const events: string[] = [];
  let publishedRevision = 0;

  bus.subscribe((event) => {
    events.push(event.type);
    if (event.type === "operation.completed") {
      publishedRevision = event.operation.revision;
    }
  });

  publisher.publishOperationUpdated({
    operationId: "onboarding:install",
    scope: "onboarding",
    action: "onboarding-runtime-install",
    status: "running",
    phase: "installing",
    percent: 55,
    message: "Installing OpenClaw locally.",
    startedAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:01.000Z"
  });
  const sync = publisher.publishOperationCompleted({
    operationId: "onboarding:install",
    scope: "onboarding",
    action: "onboarding-runtime-install",
    status: "completed",
    phase: "completed",
    percent: 100,
    message: "OpenClaw deployment is complete.",
    startedAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:02.000Z"
  });

  const replayed = bus.getRetainedEvents();

  assert.deepEqual(events, ["operation.updated", "operation.completed"]);
  assert.equal(sync.revision, publishedRevision);
  assert.equal(replayed.some((event) => event.type === "operation.completed"), true);
});
