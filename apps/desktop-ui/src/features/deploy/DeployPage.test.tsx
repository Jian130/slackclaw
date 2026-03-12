import { describe, expect, it } from "vitest";
import type { DeploymentTargetStatus } from "@slackclaw/contracts";

import { createActivityState, decorateTargets } from "./DeployPage.js";

describe("DeployPage helpers", () => {
  it("decorates deployment targets with variant metadata", () => {
    const targets: DeploymentTargetStatus[] = [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "System runtime",
        installMode: "system",
        installed: true,
        installable: true,
        planned: false,
        recommended: true,
        active: true,
        version: "2026.3.7",
        latestVersion: "2026.3.11",
        updateAvailable: true,
        summary: "Installed"
      }
    ];

    const [decorated] = decorateTargets(targets);
    expect(decorated.features.length).toBeGreaterThan(2);
    expect(decorated.gradientClass).toBe("deploy-variant--standard");
  });

  it("marks the active step as running while work is in progress", () => {
    const activity = createActivityState(
      "Update OpenClaw",
      ["Inspect", "Request", "Sync", "Verify"],
      2,
      "Syncing candidate version",
      "running"
    );

    expect(activity.progress).toBe(75);
    expect(activity.steps.map((step) => step.state)).toEqual(["done", "done", "running", "pending"]);
  });
});
