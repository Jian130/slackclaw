import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveBasePath } from "../base-path.js";
import App from "./App.js";
import { websiteLinks } from "./links.js";

function renderWithStoredLanguage(language: string) {
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => language,
        setItem: () => undefined
      }
    }
  });

  try {
    return renderToStaticMarkup(<App />);
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }
  }
}

describe("website homepage", () => {
  it("renders the latest Figma Make landing structure", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Stay Chill.");
    expect(markup).toContain("Your Mini Claws Handle the Heavy Lifting.");
    expect(markup).toContain("Simple. Open. Secure.");
    expect(markup).toContain("Three Steps to Get Started");
    expect(markup).toContain("id=\"features\"");
    expect(markup).toContain("id=\"how-it-works\"");
    expect(markup).toContain("id=\"mini-claw\"");
    expect(markup).toContain("id=\"open-source\"");
    expect(markup).toContain("id=\"help\"");
    expect(markup).toContain("Meet Your AI Mini Claws");
    expect(markup).toContain("Built by the Community, For the Community");
    expect(markup).toContain("ChillClaw");
    expect(markup).not.toContain("id=\"work-masters\"");
    expect(markup).not.toContain("Start Building Today");
  });

  it("uses the same local artwork selections shown in the design screenshots", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("ai-work-master-mini-claw-1080.webp");
    expect(markup).toContain("ai-work-master-builder-1080.webp");
    expect(markup).toContain("ai-work-master-assistant-1080.webp");
    expect(markup).toContain("ai-work-master-coding-1080.webp");
    expect(markup).toContain("ai-work-master-degisn-1080.webp");
    expect(markup).toContain("ai-work-master-chill-1080.webp");
    expect(markup).toContain("chillclaw-logo-black-2-640.webp");
    expect(markup).toContain("chillclaw-logo-black-1-640.webp");
  });

  it("uses real outbound links instead of placeholder hrefs", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(websiteLinks.repository).toBe("https://github.com/jian130/chillclaw");
    expect(websiteLinks.downloadMac).toBe("https://github.com/jian130/chillclaw/releases/latest/download/ChillClaw-macOS.pkg");
    expect(websiteLinks.releases).toBe("https://github.com/jian130/chillclaw/releases");
    expect(websiteLinks.docs).toBe("https://github.com/jian130/chillclaw/tree/main/docs");
    expect(websiteLinks.workflowMap).toBe("https://github.com/jian130/chillclaw/blob/main/docs/reference/workflow-code-paths.md");
    expect(websiteLinks.license).toBe("https://github.com/jian130/chillclaw/blob/main/LICENSE");
    expect(markup).toContain(`href="${websiteLinks.repository}"`);
    expect(markup).toContain(`href="${websiteLinks.downloadMac}"`);
    expect(markup).toContain(`href="${websiteLinks.docs}"`);
    expect(markup).toContain(`href="${websiteLinks.workflowMap}"`);
    expect(markup).toContain(`href="${websiteLinks.license}"`);
    expect(markup).not.toContain("href=\"#\"");
    expect(markup).not.toContain("yourusername/chillclaw");
  });

  it("keeps the Figma refresh wired through the existing language switcher", () => {
    const markup = renderWithStoredLanguage("zh");

    expect(markup).toContain("由社区构建，为社区服务");
    expect(markup).toContain("小爪");
    expect(markup).not.toContain("工作流地图");
    expect(markup).not.toContain("Release Notes");
    expect(markup).not.toContain("Workflow Map");
  });
});

describe("website base path", () => {
  it("uses the repository path on GitHub Pages but keeps root-relative local dev", () => {
    expect(resolveBasePath({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "Jian130/chillclaw" })).toBe("/chillclaw/");
    expect(resolveBasePath({})).toBe("/");
  });
});
