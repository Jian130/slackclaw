import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../providers/LocaleProvider.js", () => ({
  localeOptions: [
    { value: "en", label: "English", flag: "EN" },
    { value: "zh", label: "中文", flag: "中文" }
  ],
  useLocale: () => ({
    locale: "en",
    setLocale: () => undefined
  })
}));

vi.mock("../providers/OverviewProvider.js", () => ({
  useOverview: () => ({
    overview: {
      engine: {
        running: true,
        installed: true,
        summary: "All systems operational."
      }
    }
  })
}));

vi.mock("../../shared/data/responsive.js", () => ({
  useViewportMode: () => "desktop"
}));

import { AppShell } from "./AppShell.js";

describe("AppShell", () => {
  it("stacks the status and language utilities together in the sidebar", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppShell>
          <div>Body</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(html).toContain("sidebar-utilities");
    expect((html.match(/sidebar-utility-card/g) ?? []).length).toBe(2);
    expect(html.indexOf("sidebar-status")).toBeLessThan(html.indexOf("sidebar-language"));
  });
});
