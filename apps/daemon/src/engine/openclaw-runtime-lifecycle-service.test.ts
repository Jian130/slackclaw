import test from "node:test";
import assert from "node:assert/strict";

import type { EngineStatus } from "@slackclaw/contracts";

import { OpenClawRuntimeLifecycleService } from "./openclaw-runtime-lifecycle-service.js";

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
    readUpdateStatusFromCommand: async () => undefined,
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
