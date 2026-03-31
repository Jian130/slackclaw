import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { onboardingAuthMethodBody, onboardingAuthMethodLabel } from "./OnboardingPage";
import { onboardingCopy } from "./copy";

describe("OnboardingPage CTA styling", () => {
  it("uses one shared class hook for forward onboarding actions", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source.match(/onboarding-primary-action/g)).toHaveLength(7);
  });

  it("prefers the provider-defined auth method label and description for onboarding cards", () => {
    const copy = onboardingCopy("en");
    const method = {
      id: "minimax-api-key-cn",
      label: "China API Key",
      kind: "api-key" as const,
      description: "Use the China MiniMax endpoint (api.minimaxi.com).",
      interactive: false,
      fields: []
    };

    expect(onboardingAuthMethodLabel(copy, method)).toBe("China API Key");
    expect(onboardingAuthMethodBody(copy, method)).toBe("Use the China MiniMax endpoint (api.minimaxi.com).");
  });

  it("falls back to the generic auth method copy when custom method text is missing", () => {
    const copy = onboardingCopy("en");
    const method = {
      id: "openai-api-key",
      label: "",
      kind: "api-key" as const,
      description: "",
      interactive: false,
      fields: []
    };

    expect(onboardingAuthMethodLabel(copy, method)).toBe("API Key");
    expect(onboardingAuthMethodBody(copy, method)).toBe("Use your API key for quick setup");
  });

  it("sizes auth method cards from the provider method count instead of a fixed single-column modifier", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("--onboarding-auth-method-count");
    expect(source).not.toContain("onboarding-auth-method-grid--single");
  });
});
