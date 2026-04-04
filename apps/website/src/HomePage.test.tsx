import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveBasePath } from "../base-path.js";
import App from "./App.js";
import { websiteLinks } from "./links.js";

describe("website homepage", () => {
  it("renders the Figma-generated anchored sections", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Stay Chill.");
    expect(markup).toContain("Your AI");
    expect(markup).toContain("Does the Work");
    expect(markup).toContain("id=\"features\"");
    expect(markup).toContain("id=\"how-it-works\"");
    expect(markup).toContain("id=\"help\"");
    expect(markup).toContain("Open Source &amp; Community");
    expect(markup).toContain("ChillClaw");
  });

  it("uses the same local artwork selections shown in the design screenshots", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("/src/assets/5-720.webp");
    expect(markup).toContain("/src/assets/4-720.webp");
    expect(markup).toContain("/src/assets/7-720.webp");
  });

  it("uses real outbound links instead of placeholder hrefs", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(websiteLinks.repository).toBe("https://github.com/Jian130/chillclaw");
    expect(websiteLinks.downloadMac).toBe("https://github.com/Jian130/chillclaw/releases/latest/download/ChillClaw-macOS.pkg");
    expect(websiteLinks.releases).toBe("https://github.com/Jian130/chillclaw/releases");
    expect(websiteLinks.docs).toBe("https://github.com/Jian130/chillclaw/tree/main/docs");
    expect(markup).toContain(`href="${websiteLinks.repository}"`);
    expect(markup).toContain(`href="${websiteLinks.downloadMac}"`);
    expect(markup).toContain(`href="${websiteLinks.docs}"`);
    expect(markup).not.toContain("href=\"#\"");
  });
});

describe("website base path", () => {
  it("uses the repository path on GitHub Pages but keeps root-relative local dev", () => {
    expect(resolveBasePath({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "Jian130/chillclaw" })).toBe("/chillclaw/");
    expect(resolveBasePath({})).toBe("/");
  });
});
