import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelConfigOverview, ProductOverview } from "@chillclaw/contracts";

import DashboardPage, { connectedModelCount, connectedModelDetail } from "./DashboardPage.js";

vi.mock("../../app/providers/LocaleProvider.js", () => ({
  useLocale: () => ({ locale: "en" })
}));

vi.mock("../../app/providers/OverviewProvider.js", () => ({
  useOverview: () => ({
    overview: {
      engine: {
        installed: true,
        running: true,
        version: "2026.3.13",
        summary: "Ready"
      },
      installSpec: {
        desiredVersion: "latest"
      },
      channelSetup: {
        channels: [],
        gatewaySummary: "Gateway ready"
      },
      healthChecks: []
    }
  })
}));

vi.mock("../../app/providers/AITeamProvider.js", () => ({
  useAITeam: () => ({
    overview: {
      members: [],
      activity: []
    }
  })
}));

describe("DashboardPage model metrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
      appName: "ChillClaw",
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

  it("renders the dashboard scaffold in the full-width mode", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, undefined, createElement(DashboardPage)));

    expect(html).toContain("workspace-scaffold--full");
    expect(html).not.toContain("workspace-scaffold--centered");
  });
});
