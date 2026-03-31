import test from "node:test";
import assert from "node:assert/strict";

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
