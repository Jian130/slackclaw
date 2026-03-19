import { describe, expect, it } from "vitest";
import type { ModelConfigOverview, ProductOverview } from "@slackclaw/contracts";

import { connectedModelCount, connectedModelDetail } from "./DashboardPage.js";

describe("DashboardPage model metrics", () => {
  it("counts connected models from configured model keys, not install checks", () => {
    const modelConfig: ModelConfigOverview = {
      providers: [],
      models: [],
      defaultModel: "anthropic/claude-opus-4-6",
      configuredModelKeys: ["anthropic/claude-opus-4-6"],
      savedEntries: [],
      defaultEntryId: undefined,
      fallbackEntryIds: []
    };

    expect(connectedModelCount(modelConfig)).toBe(1);
  });

  it("shows missing detail when OpenClaw is not installed", () => {
    const overview: ProductOverview = {
      appName: "SlackClaw",
      appVersion: "0.1.2",
      platformTarget: "macOS first",
      firstRun: {
        introCompleted: true,
        setupCompleted: true,
        selectedProfileId: undefined
      },
      appService: {
        mode: "unmanaged",
        installed: false,
        running: false,
        managedAtLogin: false,
        summary: "",
        detail: ""
      },
      engine: {
        engine: "openclaw",
        installed: false,
        running: false,
        version: undefined,
        summary: "OpenClaw is not installed.",
        lastCheckedAt: new Date().toISOString()
      },
      installSpec: {
        engine: "openclaw",
        desiredVersion: "latest",
        installSource: "npm-local",
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
        gatewaySummary: ""
      },
      healthChecks: [],
      recentTasks: [],
      recoveryActions: [],
      profiles: [],
      templates: []
    };

    expect(connectedModelDetail(overview, undefined)).toBe("OpenClaw is not installed.");
  });
});
