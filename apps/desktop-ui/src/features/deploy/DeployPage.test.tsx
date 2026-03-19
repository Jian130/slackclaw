import { describe, expect, it, vi } from "vitest";
import type { DeploymentTargetStatus, DeploymentTargetsResponse } from "@slackclaw/contracts";

import {
  createActivityState,
  decorateTargets,
  getTargetActionKinds,
  waitForInstalledTarget,
  waitForTargetInstalledState
} from "./DeployPage.js";

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
        summary: "Installed",
        requirements: ["macOS", "Node.js 22 or newer"],
        requirementsSourceUrl: "https://docs.openclaw.ai/mac/bun"
      }
    ];

    const [decorated] = decorateTargets(targets);
    expect(decorated.features.length).toBeGreaterThan(2);
    expect(decorated.gradientClass).toBe("deploy-variant--standard");
    expect(decorated.requirements).toContain("Node.js 22 or newer");
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

  it("waits for the installed target to appear after install completes", async () => {
    const first: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: false,
          installable: true,
          planned: false,
          recommended: false,
          active: false,
          updateAvailable: false,
          summary: "Installing"
        }
      ]
    };
    const second: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: true,
          installable: true,
          planned: false,
          recommended: false,
          active: true,
          version: "2026.3.12",
          latestVersion: "2026.3.12",
          updateAvailable: false,
          summary: "Installed"
        }
      ]
    };
    const fetcher = vi
      .fn<(_options?: { fresh?: boolean }) => Promise<DeploymentTargetsResponse>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const result = await waitForInstalledTarget(fetcher, "managed-local", {
      attempts: 2,
      delayMs: 0
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.targets[0]?.installed).toBe(true);
  });

  it("publishes intermediate deployment target updates while waiting for install state", async () => {
    const first: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: false,
          installable: true,
          planned: false,
          recommended: false,
          active: false,
          updateAvailable: false,
          summary: "Installing"
        }
      ]
    };
    const second: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: true,
          installable: true,
          planned: false,
          recommended: false,
          active: true,
          version: "2026.3.12",
          latestVersion: "2026.3.12",
          updateAvailable: false,
          summary: "Installed"
        }
      ]
    };
    const fetcher = vi
      .fn<(_options?: { fresh?: boolean }) => Promise<DeploymentTargetsResponse>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const onUpdate = vi.fn();

    await waitForInstalledTarget(fetcher, "managed-local", {
      attempts: 2,
      delayMs: 0,
      onUpdate
    });

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenNthCalledWith(1, first);
    expect(onUpdate).toHaveBeenNthCalledWith(2, second);
  });

  it("assigns install and uninstall actions directly on target cards", () => {
    expect(
      getTargetActionKinds({
        id: "managed-local",
        title: "Managed",
        description: "Managed runtime",
        installMode: "managed-local",
        installed: false,
        installable: true,
        planned: false,
        recommended: false,
        active: false,
        updateAvailable: false,
        summary: "Available"
      })
    ).toEqual(["install"]);

    expect(
      getTargetActionKinds({
        id: "standard",
        title: "Standard",
        description: "System runtime",
        installMode: "system",
        installed: true,
        installable: true,
        planned: false,
        recommended: true,
        active: true,
        version: "2026.3.12",
        latestVersion: "2026.3.12",
        updateAvailable: false,
        summary: "Installed"
      })
    ).toEqual(["update", "uninstall"]);

    expect(
      getTargetActionKinds({
        id: "zeroclaw",
        title: "ZeroClaw",
        description: "Future target",
        installMode: "system",
        installed: false,
        installable: false,
        planned: true,
        recommended: false,
        active: false,
        updateAvailable: false,
        summary: "Coming soon"
      })
    ).toEqual([]);
  });

  it("waits for the target to leave the installed state after uninstall completes", async () => {
    const first: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: true,
          installable: true,
          planned: false,
          recommended: false,
          active: true,
          updateAvailable: false,
          summary: "Installed"
        }
      ]
    };
    const second: DeploymentTargetsResponse = {
      checkedAt: new Date().toISOString(),
      targets: [
        {
          id: "managed-local",
          title: "OpenClaw Managed Local",
          description: "Managed runtime",
          installMode: "managed-local",
          installed: false,
          installable: true,
          planned: false,
          recommended: false,
          active: false,
          updateAvailable: false,
          summary: "Available"
        }
      ]
    };
    const fetcher = vi
      .fn<(_options?: { fresh?: boolean }) => Promise<DeploymentTargetsResponse>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const result = await waitForTargetInstalledState(fetcher, "managed-local", false, {
      attempts: 2,
      delayMs: 0
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.targets[0]?.installed).toBe(false);
  });
});
