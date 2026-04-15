import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/providers/LocaleProvider.js", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: () => undefined
  })
}));

import { SidebarNav } from "./SidebarNav.js";

describe("SidebarNav", () => {
  it("orders the shell navigation for daily user workflows", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SidebarNav />
      </MemoryRouter>
    );
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual(["/chat", "/", "/deploy", "/config", "/skills", "/plugins", "/settings"]);
    expect(html).toContain("Claws");
    expect(html).toContain("Tools (plugins)");
    expect(html).not.toContain("/members");
  });
});
