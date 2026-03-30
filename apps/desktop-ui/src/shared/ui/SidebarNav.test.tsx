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
  it("hides the AI Team entry while keeping the rest of the shell navigation", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SidebarNav />
      </MemoryRouter>
    );

    expect(html).not.toContain("/team");
    expect(html).toContain("/chat");
    expect(html).toContain("/members");
  });
});
