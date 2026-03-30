import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const cssFiles = [
  "components.css",
  "layout.css",
  "pages.css"
] as const;

const rawRadiusPattern =
  /\b(?:border-radius|border-top-left-radius|border-top-right-radius)\s*:\s*\d+px\b/;
const rawRadiusVariablePattern = /--[a-z-]*radius\s*:\s*\d+px\b/;

describe("shared radius policy", () => {
  test.each(cssFiles)("%s uses shared radius tokens", (fileName) => {
    const css = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");

    expect(css).not.toMatch(rawRadiusPattern);
    expect(css).not.toMatch(rawRadiusVariablePattern);
  });
});
