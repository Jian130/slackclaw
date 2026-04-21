import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChillClawEvent,
  createDefaultRuntimeManagerOverview,
  type CapabilityOverview,
  type ModelConfigOverview,
  type ProductOverview,
  type ToolOverview
} from "@chillclaw/contracts";

import DashboardPage, {
  capabilityReadyCount,
  capabilityReadinessDetail,
  connectedModelCount,
  connectedModelDetail,
  shouldRefreshDashboardCapabilitySnapshotsForEvent,
  toolReadyCount,
  toolReadinessDetail
} from "./DashboardPage.js";

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
      appUpdate: {
        status: "unsupported",
        supported: false,
        currentVersion: "0.1.2",
        checkedAt: new Date().toISOString(),
        summary: "App updates are available from the packaged macOS app.",
        detail: "ChillClaw can only check GitHub release updates from the packaged macOS app."
      },
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
      runtimeManager: createDefaultRuntimeManagerOverview(),
      healthChecks: [],
      recentTasks: [],
      recoveryActions: [],
      profiles: [],
      templates: []
    };

    expect(connectedModelDetail(overview, undefined)).toBe("OpenClaw is not installed.");
  });

  it("prefers the managed local runtime summary when local AI is active", () => {
    expect(
      connectedModelDetail(
        {
          appName: "ChillClaw",
          appVersion: "0.1.2",
          platformTarget: "macOS first",
          appUpdate: {
            status: "unsupported",
            supported: false,
            currentVersion: "0.1.2",
            checkedAt: new Date().toISOString(),
            summary: "",
            detail: ""
          },
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
            installed: true,
            running: true,
            version: "2026.4.5",
            summary: "Ready",
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
          localRuntime: {
            supported: true,
            recommendation: "local",
            supportCode: "supported",
            status: "ready",
            runtimeInstalled: true,
            runtimeReachable: true,
            modelDownloaded: true,
            activeInOpenClaw: true,
            summary: "Local AI is ready on this Mac.",
            detail: "OpenClaw is connected to the local runtime."
          },
          runtimeManager: createDefaultRuntimeManagerOverview(),
          healthChecks: [],
          recentTasks: [],
          recoveryActions: [],
          profiles: [],
          templates: []
        },
        {
          providers: [],
          models: [],
          defaultModel: "ollama/gemma4:e4b",
          configuredModelKeys: ["ollama/gemma4:e4b"],
          savedEntries: [],
          defaultEntryId: undefined,
          fallbackEntryIds: []
        }
      )
    ).toBe("Local AI is ready on this Mac.");
  });

  it("renders the dashboard scaffold in the full-width mode", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, undefined, createElement(DashboardPage)));

    expect(html).toContain("workspace-scaffold--full");
    expect(html).not.toContain("workspace-scaffold--centered");
  });

  it("summarizes dashboard capability and tool readiness from the new overview APIs", () => {
    const capabilityOverview: CapabilityOverview = {
      engine: "openclaw",
      checkedAt: "2026-04-20T00:00:00.000Z",
      entries: [
        { id: "general-assistant", kind: "preset", engine: "openclaw", label: "General Assistant", status: "ready", summary: "Ready.", requirements: [] },
        { id: "openclaw-weixin", kind: "plugin", engine: "openclaw", label: "WeChat", status: "blocked", summary: "Plugin blocked.", requirements: [] }
      ],
      summary: "1 ready · 1 needs attention."
    };
    const toolOverview: ToolOverview = {
      engine: "openclaw",
      checkedAt: "2026-04-20T00:00:00.000Z",
      profile: "default",
      allow: ["web.search"],
      deny: ["fs.write"],
      byProvider: {},
      entries: [
        { id: "web.search", kind: "tool", engine: "openclaw", label: "Web Search", status: "ready", summary: "Allowed." },
        { id: "fs.write", kind: "tool", engine: "openclaw", label: "File Write", status: "blocked", summary: "Denied." }
      ],
      summary: "1 tool ready · 1 blocked."
    };

    expect(capabilityReadyCount(capabilityOverview)).toBe(1);
    expect(capabilityReadinessDetail(capabilityOverview)).toBe("1 ready · 1 needs attention.");
    expect(toolReadyCount(toolOverview)).toBe(1);
    expect(toolReadinessDetail(toolOverview)).toBe("1 tool ready · 1 blocked.");
  });

  it("refreshes dashboard capability snapshots from existing capability-related events", () => {
    const skillEvent: ChillClawEvent = {
      type: "skill-catalog.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 1,
        data: {
          installedSkills: [],
          readiness: { total: 0, eligible: 0, disabled: 0, blocked: 0, missing: 0, warnings: [], summary: "Ready" },
          marketplaceAvailable: false,
          marketplaceSummary: "Marketplace unavailable.",
          marketplacePreview: []
        }
      }
    };
    const modelEvent: ChillClawEvent = {
      type: "model-config.updated",
      snapshot: {
        epoch: "epoch-1",
        revision: 2,
        data: {
          providers: [],
          models: [],
          configuredModelKeys: [],
          savedEntries: [],
          fallbackEntryIds: []
        }
      }
    };

    expect(shouldRefreshDashboardCapabilitySnapshotsForEvent(skillEvent)).toBe(true);
    expect(
      shouldRefreshDashboardCapabilitySnapshotsForEvent({
        type: "plugin-config.updated",
        snapshot: { epoch: "epoch-1", revision: 3, data: { entries: [] } }
      })
    ).toBe(true);
    expect(
      shouldRefreshDashboardCapabilitySnapshotsForEvent({
        type: "channel-config.updated",
        snapshot: {
          epoch: "epoch-1",
          revision: 4,
          data: { baseOnboardingCompleted: true, capabilities: [], entries: [], gatewaySummary: "Ready" }
        }
      })
    ).toBe(true);
    expect(shouldRefreshDashboardCapabilitySnapshotsForEvent(modelEvent)).toBe(false);
  });
});
