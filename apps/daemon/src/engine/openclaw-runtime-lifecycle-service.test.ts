import test from "node:test";
import assert from "node:assert/strict";

import type { EngineStatus } from "@chillclaw/contracts";

import { OpenClawRuntimeLifecycleService } from "./openclaw-runtime-lifecycle-service.js";

function recoveryAction(id: "rollback-update" | "reinstall-engine" | "restart-engine" | "repair-config") {
  return {
    id,
    type: id,
    title: id,
    description: id,
    safetyLevel: "safe" as const,
    expectedImpact: id
  };
}

function engineStatus(overrides: Partial<EngineStatus> = {}): EngineStatus {
  return {
    engine: "openclaw",
    installed: true,
    running: true,
    version: "1.0.0",
    summary: "Gateway ready",
    pendingGatewayApply: false,
    lastCheckedAt: "2026-03-30T00:00:00.000Z",
    ...overrides
  };
}

function runtimeStatusData(overrides: Partial<{
  installed: boolean;
  cliVersion?: string;
  gatewayReachable: boolean;
  gatewayInstalled: boolean;
  gatewayDetail: string;
  providersMissingCount: number;
  providersMissingDetail: string;
  setupRequired: boolean;
  summary: string;
  securityFindings: Array<{ checkId?: string; severity?: string; title?: string; detail?: string; remediation?: string }>;
}> = {}) {
  return {
    installed: true,
    cliVersion: "1.0.0",
    gatewayReachable: true,
    gatewayInstalled: true,
    gatewayDetail: "Gateway ready",
    providersMissingCount: 0,
    providersMissingDetail: "Provider auth looks configured.",
    setupRequired: false,
    summary: "Gateway ready",
    securityFindings: [],
    ...overrides
  };
}

function createService(overrides: Partial<ConstructorParameters<typeof OpenClawRuntimeLifecycleService>[0]> = {}) {
  return new OpenClawRuntimeLifecycleService({
    installSpec: { desiredVersion: "latest" },
    installTarget: "latest",
    standardRequirements: [],
    managedRequirements: [],
    installDocsUrl: "https://example.com/install",
    macDocsUrl: "https://example.com/mac",
    ensurePinnedOpenClaw: async () => ({
      status: "installed",
      changed: true,
      hadExisting: false,
      message: "installed"
    }),
    readAdapterState: async () => ({}),
    writeAdapterState: async () => undefined,
    normalizeStateFlags: (state) => state,
    appendGatewayApplyMessage: (message) => message,
    summarizePendingGatewayApply: () => "pending apply",
    configure: async () => undefined,
    invalidateReadCaches: () => undefined,
    collectStatusData: async () => runtimeStatusData(),
    readEngineSnapshot: async () => ({}),
    resolveManagedOpenClawCommand: async () => undefined,
    resolveSystemOpenClawCommand: async () => undefined,
    resolveOpenClawCommand: async () => undefined,
    readVersionFromCommand: async () => undefined,
    prepareManagedOpenClawRuntime: async () => ({
      status: "completed",
      message: "OpenClaw runtime is ready."
    }),
    checkManagedOpenClawRuntimeUpdate: async () => ({
      status: "completed",
      message: "Managed OpenClaw runtime is on the bundled version."
    }),
    stageManagedOpenClawRuntimeUpdate: async () => ({
      status: "completed",
      message: "Managed OpenClaw runtime has no approved update to stage."
    }),
    applyManagedOpenClawRuntimeUpdate: async () => ({
      status: "failed",
      message: "Managed OpenClaw runtime has no staged update to apply."
    }),
    getManagedOpenClawRuntimeResource: async () => undefined,
    isOpenClawVersionCompatible: () => true,
    openClawVersionSummary: () => "compatible",
    compareOpenClawVersions: () => undefined,
    runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
    runOpenClaw: async () => ({ code: 0, stdout: "", stderr: "" }),
    logSoftFailure: async () => undefined,
    openClawInstallTargetSummary: () => "OpenClaw latest",
    resolveAgentArgs: async () => [],
    fileExists: async () => false,
    managedOpenClawDir: "/tmp/openclaw",
    managedOpenClawBinPath: "/tmp/openclaw/bin/openclaw",
    gatewayInstalled: async () => true,
    restartGatewayAndRequireHealthy: async () => engineStatus(),
    waitForGatewayReachable: async () => engineStatus(),
    ...overrides
  });
}

test("install returns after preparing OpenClaw when post-install status hangs", async () => {
  const softFailures: string[] = [];
  const service = createService({
    ensurePinnedOpenClaw: async () => ({
      status: "installed",
      changed: true,
      hadExisting: false,
      version: "2026.4.15",
      message: "OpenClaw runtime was installed."
    }),
    collectStatusData: async () => new Promise(() => undefined),
    logSoftFailure: async (message) => {
      softFailures.push(message);
    }
  });

  const result = await Promise.race([
    service.install(false, { forceLocal: true }),
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 1_500))
  ]);

  assert.notEqual(result, "timeout");
  const install = result as Awaited<ReturnType<typeof service.install>>;
  assert.equal(install.status, "installed");
  assert.equal(install.engineStatus.installed, true);
  assert.equal(install.engineStatus.running, false);
  assert.equal(install.engineStatus.version, "2026.4.15");
  assert.equal(softFailures.length, 1);
  assert.match(softFailures[0], /post-install status/i);
});

test("finalizeOnboardingSetup returns existing healthy status without restarting", async () => {
  let restarted = false;
  const status = engineStatus();
  const service = createService({
    collectStatusData: async () =>
      runtimeStatusData({
        gatewayReachable: true,
        gatewayInstalled: true,
        summary: status.summary
      }),
    gatewayInstalled: async () => true,
    restartGatewayAndRequireHealthy: async () => {
      restarted = true;
      return status;
    }
  });

  const result = await service.finalizeOnboardingSetup();

  assert.equal(restarted, false);
  assert.equal(result.engineStatus.installed, status.installed);
  assert.equal(result.engineStatus.running, status.running);
  assert.equal(result.engineStatus.summary, status.summary);
  assert.match(result.message, /already installed, configured, and reachable/i);
});

test("startGatewayAfterChannels delegates the restart through the runtime service", async () => {
  const reasons: string[] = [];
  const status = engineStatus({ summary: "Gateway restarted" });
  const service = createService({
    restartGatewayAndRequireHealthy: async (reason) => {
      reasons.push(reason);
      return status;
    }
  });

  const result = await service.startGatewayAfterChannels();

  assert.deepEqual(reasons, ["channel setup"]);
  assert.equal(result.engineStatus, status);
  assert.match(result.message, /gateway restarted/i);
});

test("standard target uninstall falls back to npm global uninstall when OpenClaw stays installed", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const systemCommand = "/usr/local/bin/openclaw";
  let systemInstalled = true;
  const service = createService({
    collectStatusData: async () =>
      runtimeStatusData({
        installed: systemInstalled,
        cliVersion: systemInstalled ? "1.0.0" : undefined,
        gatewayReachable: false,
        gatewayInstalled: false,
        gatewayDetail: systemInstalled ? "Gateway ready" : "Gateway removed",
        summary: systemInstalled ? "Gateway ready" : "OpenClaw is removed."
      }),
    resolveSystemOpenClawCommand: async () => (systemInstalled ? systemCommand : undefined),
    runCommand: async (command, args) => {
      commands.push({ command, args });
      if (command === "npm" && args.join(" ") === "uninstall openclaw -g") {
        systemInstalled = false;
      }
      return { code: 0, stdout: "", stderr: "" };
    }
  });

  const result = await service.uninstallDeploymentTarget("standard");

  assert.deepEqual(commands, [
    {
      command: systemCommand,
      args: ["uninstall", "--all", "--yes", "--non-interactive"]
    },
    {
      command: "npm",
      args: ["uninstall", "openclaw", "-g"]
    }
  ]);
  assert.equal(result.status, "completed");
  assert.equal(result.engineStatus.installed, false);
  assert.match(result.message, /npm global uninstall/i);
});

test("standard target install is unsupported because ChillClaw only installs its managed runtime", async () => {
  let installed = false;
  const service = createService({
    ensurePinnedOpenClaw: async () => {
      installed = true;
      return {
        status: "installed",
        changed: true,
        hadExisting: false,
        message: "installed"
      };
    }
  });

  const result = await service.installDeploymentTarget("standard");

  assert.equal(installed, false);
  assert.equal(result.status, "failed");
  assert.match(result.message, /managed OpenClaw runtime/i);
});

test("managed-local target status reflects Runtime Manager approved updates", async () => {
  const service = createService({
    resolveManagedOpenClawCommand: async () => "/tmp/chillclaw/openclaw-runtime/node_modules/.bin/openclaw",
    resolveOpenClawCommand: async () => "/tmp/chillclaw/openclaw-runtime/node_modules/.bin/openclaw",
    readVersionFromCommand: async () => "2026.3.11",
    getManagedOpenClawRuntimeResource: async () => ({
      id: "openclaw-runtime",
      kind: "node-npm",
      label: "OpenClaw",
      status: "ready",
      sourcePolicy: ["bundled", "download"],
      updatePolicy: "stage-silently-apply-safely",
      installedVersion: "2026.3.11",
      desiredVersion: "2026.3.11",
      latestApprovedVersion: "2026.4.13",
      updateAvailable: true,
      summary: "OpenClaw has an approved update.",
      detail: "ChillClaw can update OpenClaw."
    })
  });

  const result = await service.getDeploymentTargets();
  const managedTarget = result.targets.find((target) => target.id === "managed-local");

  assert.equal(managedTarget?.updateAvailable, true);
  assert.equal(managedTarget?.latestVersion, "2026.4.13");
  assert.match(managedTarget?.updateSummary ?? "", /approved OpenClaw 2026\.4\.13/i);
});

test("managed-local target update stages and applies the Runtime Manager update", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const runtimeActions: string[] = [];
  const managedCommand = "/tmp/chillclaw/openclaw-runtime/node_modules/.bin/openclaw";
  const service = createService({
    resolveManagedOpenClawCommand: async () => managedCommand,
    readVersionFromCommand: async () => "2026.4.13",
    runCommand: async (command, args) => {
      commands.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    },
    waitForGatewayReachable: async () => engineStatus({ version: "2026.4.13" }),
    checkManagedOpenClawRuntimeUpdate: async () => {
      runtimeActions.push("check");
      return {
        status: "completed",
        message: "OpenClaw has an approved update.",
        resource: {
          installedVersion: "2026.3.11",
          latestApprovedVersion: "2026.4.13",
          updateAvailable: true
        }
      };
    },
    stageManagedOpenClawRuntimeUpdate: async () => {
      runtimeActions.push("stage");
      return {
        status: "completed",
        message: "OpenClaw update is staged.",
        resource: {
          installedVersion: "2026.3.11",
          latestApprovedVersion: "2026.4.13",
          stagedVersion: "2026.4.13",
          updateAvailable: true
        }
      };
    },
    applyManagedOpenClawRuntimeUpdate: async () => {
      runtimeActions.push("apply");
      return {
        status: "completed",
        message: "OpenClaw update is ready.",
        resource: {
          installedVersion: "2026.4.13",
          latestApprovedVersion: "2026.4.13",
          updateAvailable: false
        }
      };
    },
    prepareManagedOpenClawRuntime: async () => {
      throw new Error("managed-local updates must use Runtime Manager stage/apply");
    }
  } as Partial<ConstructorParameters<typeof OpenClawRuntimeLifecycleService>[0]>);

  const result = await service.updateDeploymentTarget("managed-local");

  assert.deepEqual(runtimeActions, ["check", "stage", "apply"]);
  assert.equal(result.status, "completed");
  assert.equal(result.engineStatus.version, "2026.4.13");
  assert.match(result.message, /update is ready/i);
  assert.deepEqual(commands, [
    {
      command: managedCommand,
      args: ["gateway", "restart"]
    }
  ]);
});

test("rollback update restores the managed bundled runtime without calling OpenClaw update status", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  let prepared = false;
  const service = createService({
    resolveOpenClawCommand: async () => undefined,
    runOpenClaw: async (args) => {
      commands.push({ command: "openclaw", args });
      return { code: 0, stdout: "", stderr: "" };
    },
    prepareManagedOpenClawRuntime: async () => {
      prepared = true;
      return {
        status: "completed",
        message: "OpenClaw runtime restored from bundle."
      };
    }
  });

  const result = await service.repair(recoveryAction("rollback-update"));

  assert.equal(prepared, true);
  assert.equal(result.status, "completed");
  assert.match(result.message, /managed OpenClaw runtime/i);
  assert.deepEqual(commands, []);
});

test("standard target update is unsupported because ChillClaw only updates its managed runtime", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const service = createService({
    resolveSystemOpenClawCommand: async () => "/usr/local/bin/openclaw",
    runCommand: async (command, args) => {
      commands.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    }
  });

  const result = await service.updateDeploymentTarget("standard");

  assert.equal(result.status, "failed");
  assert.match(result.message, /managed OpenClaw runtime/i);
  assert.deepEqual(commands, []);
});
