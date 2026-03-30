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
      appService: {
        running: true,
        summary: "SlackClaw launches as a local background service."
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
  });
});
