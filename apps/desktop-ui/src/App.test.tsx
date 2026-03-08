import { describe, expect, it } from "vitest";

import { defaultTemplates } from "@slackclaw/contracts";
import { localeOptions } from "./i18n.js";

describe("starter templates", () => {
  it("ships a focused office-work starter set", () => {
    expect(defaultTemplates.length).toBeGreaterThan(4);
    expect(defaultTemplates.some((template) => template.id === "draft-email")).toBe(true);
  });

  it("exposes the supported UI locales", () => {
    expect(localeOptions.map((option) => option.value)).toEqual(["en", "zh", "ja", "ko", "es"]);
  });
});
