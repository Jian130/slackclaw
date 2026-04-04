import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigateSpy = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateSpy
}));

vi.mock("../../app/providers/LocaleProvider.js", () => ({
  useLocale: () => ({ locale: "en" })
}));

vi.mock("../../app/providers/OverviewProvider.js", () => ({
  useOverview: () => ({
    overview: {
      appUpdate: {
        status: "update-available",
        supported: true,
        currentVersion: "0.1.2",
        latestVersion: "0.1.4",
        downloadUrl: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.pkg",
        releaseUrl: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
        checkedAt: "2026-04-04T11:00:00.000Z",
        summary: "ChillClaw 0.1.4 is available.",
        detail: "Download the latest signed installer."
      },
      appService: {
        running: true,
        summary: "ChillClaw launches as a local background service."
      }
    },
    refresh: async () => undefined
  })
}));

vi.mock("../../app/providers/WorkspaceProvider.js", () => ({
  useWorkspace: () => ({
    state: {
      settings: {
        general: {
          instanceName: "Test workspace",
          autoStart: true,
          checkUpdates: true,
          telemetry: false
        },
        logging: {
          level: "info",
          retention: 14,
          enableDebug: false
        }
      }
    },
    update: () => undefined
  })
}));

import SettingsPage from "./SettingsPage.js";

describe("SettingsPage", () => {
  it("shows the permissions guidance card in the general settings tab", () => {
    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain("Permissions");
    expect(html).toContain("Automation, Notifications, Accessibility, Screen Recording");
    expect(html).toContain("Manage this in the native macOS app");
    expect(html).toContain("App Updates");
    expect(html).toContain("OpenClaw Runtime");
    expect(html).toContain("Download 0.1.4");
  });
});
