import { describe, expect, it } from "vitest";

import { shouldRedirectToOnboarding } from "./routes.js";

describe("route onboarding gate", () => {
  it("redirects first-run users to onboarding from normal pages", () => {
    expect(shouldRedirectToOnboarding(false, "/")).toBe(true);
    expect(shouldRedirectToOnboarding(false, "/config")).toBe(true);
  });

  it("does not redirect while already inside onboarding", () => {
    expect(shouldRedirectToOnboarding(false, "/onboarding")).toBe(false);
  });

  it("does not redirect once full onboarding is complete", () => {
    expect(shouldRedirectToOnboarding(true, "/")).toBe(false);
  });
});
