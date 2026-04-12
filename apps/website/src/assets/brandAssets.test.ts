import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceLogoPath = fileURLToPath(new URL("./logos/chillclaw-logo-simple-1-640.webp", import.meta.url));
const faviconPath = fileURLToPath(new URL("../../public/favicon.ico", import.meta.url));
const faviconPngPath = fileURLToPath(new URL("../../public/favicon-32x32.png", import.meta.url));
const appleTouchIconPath = fileURLToPath(new URL("../../public/apple-touch-icon.png", import.meta.url));
const indexHtmlPath = fileURLToPath(new URL("../../index.html", import.meta.url));

describe("website brand favicon assets", () => {
  it("derives browser icons from the existing wordless ChillClaw logo", () => {
    expect(readFileSync(sourceLogoPath).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect([...readFileSync(faviconPath).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect([...readFileSync(faviconPngPath).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([...readFileSync(appleTouchIconPath).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("advertises favicon and touch icon metadata from the static website shell", () => {
    const html = readFileSync(indexHtmlPath, "utf8");

    expect(html).toContain('href="%BASE_URL%favicon.ico"');
    expect(html).toContain('href="%BASE_URL%favicon-32x32.png"');
    expect(html).toContain('href="%BASE_URL%apple-touch-icon.png"');
  });
});
