import { describe, expect, it } from "vitest";

import { buildOnboardingMemberRequest, onboardingDestinationPath } from "./helpers.js";

describe("onboarding helpers", () => {
  it("maps the final destination buttons to app routes", () => {
    expect(onboardingDestinationPath("team")).toBe("/team");
    expect(onboardingDestinationPath("dashboard")).toBe("/");
    expect(onboardingDestinationPath("chat")).toBe("/chat");
  });

  it("builds the onboarding AI employee request with deterministic hidden fields", () => {
    const request = buildOnboardingMemberRequest({
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      personalityTraits: ["Analytical", "Detail-Oriented"],
      skillIds: ["research", "summarization"],
      memoryEnabled: true,
      brainEntryId: "brain-1"
    });

    expect(request).toEqual({
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatar: {
        presetId: "onboarding-analyst",
        accent: "#97b5ea",
        emoji: "🧠",
        theme: "onboarding"
      },
      brainEntryId: "brain-1",
      personality: "Analytical, Detail-Oriented",
      soul: "Analytical, Detail-Oriented",
      workStyles: [],
      skillIds: ["research", "summarization"],
      knowledgePackIds: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      }
    });
  });
});
