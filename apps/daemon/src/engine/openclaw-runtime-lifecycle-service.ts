import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import type {
  DeploymentTargetActionResponse,
  DeploymentTargetStatus,
  DeploymentTargetsResponse,
  EngineActionResponse,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  GatewayActionResponse,
  HealthCheckResult,
  InstallResponse,
  RecoveryAction,
  RecoveryRunResponse
} from "@slackclaw/contracts";

type BootstrapResult = {
  status: "reused-existing" | "would-install" | "would-reinstall" | "installed" | "reinstalled" | "failed";
  changed: boolean;
  hadExisting: boolean;
  existingVersion?: string;
  version?: string | null;
  message: string;
};

type AdapterRuntimeState = {
  configuredProfileId?: string;
  installedAt?: string;
  lastInstallMode?: "detected" | "onboarded";
  pendingGatewayApply?: boolean;
  pendingGatewayApplySummary?: string;
};

type SecurityFinding = {
  checkId?: string;
  severity?: string;
  title?: string;
  detail?: string;
  remediation?: string;
};

type RuntimeStatusData = {
  installed: boolean;
  cliVersion?: string;
  gatewayReachable: boolean;
  gatewayInstalled: boolean;
  gatewayDetail: string;
  providersMissingCount: number;
  providersMissingDetail: string;
  setupRequired: boolean;
  summary: string;
  securityFindings: SecurityFinding[];
};

type OpenClawUpdateStatusJson = {
  update?: {
    registry?: {
      error?: string | null;
    };
  };
  channel?: {
    label?: string;
  };
  availability?: {
    available?: boolean;
    latestVersion?: string | null;
  };
};

type OpenClawTargetUpdateStatus = {
  updateAvailable: boolean;
  latestVersion?: string;
  summary: string;
};

type OpenClawRuntimeLifecycleAccess = {
  installSpec: { desiredVersion: string };
  versionOverride?: string;
  installTarget: string;
  standardRequirements: string[];
  managedRequirements: string[];
  installDocsUrl: string;
  macDocsUrl: string;
  ensurePinnedOpenClaw: (targetMode: "auto" | "system" | "managed-local") => Promise<BootstrapResult>;
  readAdapterState: () => Promise<AdapterRuntimeState>;
  writeAdapterState: (state: AdapterRuntimeState) => Promise<void>;
  normalizeStateFlags: (state: AdapterRuntimeState) => AdapterRuntimeState;
  appendGatewayApplyMessage: (message: string) => string;
  summarizePendingGatewayApply: () => string;
  configure: (profileId: string) => Promise<void>;
  invalidateReadCaches: (resources?: Array<"engine" | "models" | "channels" | "plugins" | "skills" | "ai-members">) => void;
  collectStatusData: () => Promise<RuntimeStatusData>;
  readEngineSnapshot: (options?: { fresh?: boolean; includeUpdate?: boolean }) => Promise<{
    gatewayJson?: unknown;
    updateJson?: unknown;
  }>;
  resolveManagedOpenClawCommand: (options?: { fresh?: boolean }) => Promise<string | undefined>;
  resolveSystemOpenClawCommand: (options?: { fresh?: boolean }) => Promise<string | undefined>;
  resolveOpenClawCommand: () => Promise<string | undefined>;
  readVersionFromCommand: (command: string | undefined, options?: { fresh?: boolean }) => Promise<string | undefined>;
  readUpdateStatusFromCommand: (
    command: string | undefined,
    options?: { fresh?: boolean }
  ) => Promise<OpenClawTargetUpdateStatus | undefined>;
  isOpenClawVersionCompatible: (version: string | undefined) => boolean;
  openClawVersionSummary: (version: string | undefined) => string;
  compareOpenClawVersions: (left: string | undefined, right: string | undefined) => number | undefined;
  runCommand: (
    command: string,
    args: string[],
    options?: { allowFailure?: boolean }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  runOpenClaw: (
    args: string[],
    options?: { allowFailure?: boolean }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  logSoftFailure: (message: string, details: unknown) => Promise<void>;
  openClawInstallTargetSummary: () => string;
  resolveAgentArgs: () => Promise<string[]>;
  fileExists: (pathname: string) => Promise<boolean>;
  managedOpenClawDir: string;
  managedOpenClawBinPath: string;
  gatewayInstalled: () => Promise<boolean>;
  restartGatewayAndRequireHealthy: (reason: string) => Promise<EngineStatus>;
  waitForGatewayReachable: (reason: string) => Promise<EngineStatus>;
};

function safeJsonPayloadParse<T>(value: string | undefined): T | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function createTaskTitle(request: EngineTaskRequest): string {
  if (request.templateId) {
    return `Run ${request.templateId}`;
  }

  return request.prompt.length > 36 ? `${request.prompt.slice(0, 36)}...` : request.prompt;
}

function toInstallDisposition(
  bootstrapStatus: BootstrapResult["status"],
  mode: "detected" | "onboarded"
): InstallResponse["disposition"] {
  if (mode === "onboarded") {
    return "onboarded";
  }

  if (bootstrapStatus === "reused-existing" || bootstrapStatus === "installed" || bootstrapStatus === "reinstalled") {
    return bootstrapStatus;
  }

  return "installed";
}

export class OpenClawRuntimeLifecycleService {
  constructor(private readonly access: OpenClawRuntimeLifecycleAccess) {}

  async install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    const bootstrap = await this.access.ensurePinnedOpenClaw(options?.forceLocal ? "managed-local" : "auto");
    const state = await this.access.readAdapterState();
    const mode: "detected" | "onboarded" = "detected";
    const message = `${bootstrap.message} ChillClaw is ready to run OpenClaw onboarding next.`;

    if (autoConfigure && !state.configuredProfileId) {
      await this.access.configure("email-admin");
    }

    await this.access.writeAdapterState({
      ...state,
      installedAt: new Date().toISOString(),
      lastInstallMode: mode
    });

    this.access.invalidateReadCaches();
    const engineStatus = await this.status();

    return {
      status: "installed",
      message,
      engineStatus,
      disposition: toInstallDisposition(bootstrap.status, mode),
      changed: bootstrap.changed,
      hadExisting: bootstrap.hadExisting,
      pinnedVersion: this.access.versionOverride,
      existingVersion: bootstrap.existingVersion,
      actualVersion: bootstrap.version ?? undefined
    };
  }

  async uninstall(): Promise<EngineActionResponse> {
    const hadManagedInstall = await this.access.fileExists(this.access.managedOpenClawDir);
    const command = await this.access.resolveOpenClawCommand();
    let message = "ChillClaw did not find a ChillClaw-managed OpenClaw runtime to remove.";

    if (hadManagedInstall) {
      if (await this.access.fileExists(this.access.managedOpenClawBinPath)) {
        await this.access.runCommand(this.access.managedOpenClawBinPath, ["gateway", "uninstall"], {
          allowFailure: true
        }).catch(() => undefined);
      }
      await rm(this.access.managedOpenClawDir, { recursive: true, force: true });
      message = `ChillClaw removed the managed local OpenClaw runtime from ${this.access.managedOpenClawDir}.`;
    }

    if (command && command !== this.access.managedOpenClawBinPath && !hadManagedInstall) {
      message = `ChillClaw did not remove the external OpenClaw at ${command}. Remove it with the original package manager if you still want it gone.`;
    }

    await this.access.writeAdapterState({});
    this.access.invalidateReadCaches();
    const engineStatus = await this.status();

    if (engineStatus.installed && command && command !== this.access.managedOpenClawBinPath) {
      message = `${message} ChillClaw still detects an external OpenClaw at ${command}. Remove it with the original package manager if you want a full uninstall.`;
    }

    return {
      action: "uninstall-engine",
      status: "completed",
      message,
      engineStatus
    };
  }

  async status(): Promise<EngineStatus> {
    const data = await this.access.collectStatusData();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());

    return {
      engine: "openclaw",
      installed: data.installed,
      running: data.gatewayReachable,
      version: data.cliVersion,
      summary: state.pendingGatewayApply ? this.access.appendGatewayApplyMessage(data.summary) : data.summary,
      pendingGatewayApply: state.pendingGatewayApply === true,
      pendingGatewayApplySummary: state.pendingGatewayApply
        ? state.pendingGatewayApplySummary ?? this.access.summarizePendingGatewayApply()
        : undefined,
      lastCheckedAt: new Date().toISOString()
    };
  }

  async getDeploymentTargets(): Promise<DeploymentTargetsResponse> {
    const [managedCommand, systemCommand] = await Promise.all([
      this.access.resolveManagedOpenClawCommand(),
      this.access.resolveSystemOpenClawCommand()
    ]);
    const activeCommand = await this.access.resolveOpenClawCommand();
    const [managedVersion, systemVersion, managedUpdate, systemUpdate] = await Promise.all([
      this.access.readVersionFromCommand(managedCommand),
      this.access.readVersionFromCommand(systemCommand),
      this.access.readUpdateStatusFromCommand(managedCommand),
      this.access.readUpdateStatusFromCommand(systemCommand)
    ]);
    const systemCompatible = this.access.isOpenClawVersionCompatible(systemVersion);
    const managedCompatible = this.access.isOpenClawVersionCompatible(managedVersion);

    const targets: DeploymentTargetStatus[] = [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "Reuse an existing OpenClaw install when available.",
        installMode: "system",
        installed: Boolean(systemVersion),
        installable: true,
        planned: false,
        recommended: true,
        active: Boolean(systemCommand && activeCommand === systemCommand),
        version: systemVersion,
        desiredVersion: this.access.installTarget,
        latestVersion: systemUpdate?.latestVersion ?? systemVersion,
        updateAvailable: systemUpdate?.updateAvailable ?? false,
        requirements: this.access.standardRequirements,
        requirementsSourceUrl: this.access.macDocsUrl,
        summary: systemVersion
          ? this.access.versionOverride
            ? systemCompatible
              ? `System OpenClaw ${systemVersion} meets ChillClaw's requested version floor ${this.access.versionOverride}.`
              : `System OpenClaw ${systemVersion} is installed, but ChillClaw expects at least ${this.access.versionOverride}.`
            : `System OpenClaw ${systemVersion} is installed and can be reused.`
          : "No system OpenClaw install was detected.",
        updateSummary: systemVersion ? systemUpdate?.summary : undefined
      },
      {
        id: "managed-local",
        title: "OpenClaw Managed Local",
        description: "Deploy a ChillClaw-managed local runtime under the app data directory.",
        installMode: "managed-local",
        installed: Boolean(managedVersion),
        installable: true,
        planned: false,
        recommended: false,
        active: Boolean(managedCommand && activeCommand === managedCommand),
        version: managedVersion,
        desiredVersion: this.access.installTarget,
        latestVersion: managedUpdate?.latestVersion ?? managedVersion,
        updateAvailable: managedUpdate?.updateAvailable ?? false,
        requirements: this.access.managedRequirements,
        requirementsSourceUrl: this.access.installDocsUrl,
        summary: managedVersion
          ? this.access.versionOverride
            ? managedCompatible
              ? `Managed local OpenClaw ${managedVersion} meets ChillClaw's requested version floor ${this.access.versionOverride}.`
              : `Managed local OpenClaw ${managedVersion} is installed, but ChillClaw expects at least ${this.access.versionOverride}.`
            : `Managed local OpenClaw ${managedVersion} is installed.`
          : "ChillClaw's managed local OpenClaw runtime is not installed yet.",
        updateSummary: managedVersion ? managedUpdate?.summary : undefined
      },
      {
        id: "zeroclaw",
        title: "ZeroClaw",
        description: "Reserved future engine adapter target.",
        installMode: "future",
        installed: false,
        installable: false,
        planned: true,
        recommended: false,
        active: false,
        updateAvailable: false,
        requirements: [],
        summary: "Planned future adapter."
      },
      {
        id: "ironclaw",
        title: "IronClaw",
        description: "Reserved future engine adapter target.",
        installMode: "future",
        installed: false,
        installable: false,
        planned: true,
        recommended: false,
        active: false,
        updateAvailable: false,
        requirements: [],
        summary: "Planned future adapter."
      }
    ];

    return {
      checkedAt: new Date().toISOString(),
      targets
    };
  }

  installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    return this.installDeploymentTargetInternal(targetId);
  }

  async uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    if (targetId === "managed-local") {
      const result = await this.uninstall();
      return {
        targetId,
        status: result.status === "completed" ? "completed" : "failed",
        message: result.message,
        engineStatus: result.engineStatus
      };
    }

    const systemCommand = await this.access.resolveSystemOpenClawCommand({ fresh: true });

    if (!systemCommand) {
      return {
        targetId,
        status: "completed",
        message: "ChillClaw did not detect a system OpenClaw install to remove.",
        engineStatus: await this.status()
      };
    }

    await this.access.runCommand(systemCommand, ["uninstall", "--all", "--yes", "--non-interactive"], {
      allowFailure: true
    }).catch(() => undefined);

    let detectedSystemCommand = await this.access.resolveSystemOpenClawCommand({ fresh: true });
    if (detectedSystemCommand) {
      const npmArgs = ["uninstall", "openclaw", "-g"];
      try {
        const npmResult = await this.access.runCommand("npm", npmArgs, { allowFailure: true });
        if (npmResult.code !== 0) {
          await this.access.logSoftFailure("ChillClaw could not remove the system OpenClaw runtime with npm.", {
            npmArgs,
            npmResult,
            detectedSystemCommand
          });
        }
      } catch (error) {
        await this.access.logSoftFailure("ChillClaw could not start npm while removing the system OpenClaw runtime.", {
          npmArgs,
          detectedSystemCommand,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      detectedSystemCommand = await this.access.resolveSystemOpenClawCommand({ fresh: true });
    }

    const engineStatus = await this.status();
    if (!detectedSystemCommand) {
      return {
        targetId,
        status: "completed",
        message: "ChillClaw removed the system OpenClaw runtime after retrying the npm global uninstall.",
        engineStatus
      };
    }

    return {
      targetId,
      status: "failed",
      message: `ChillClaw ran the OpenClaw uninstall command and retried the npm global uninstall, but the system OpenClaw is still detected at ${detectedSystemCommand}. Remove it with the original package manager.`,
      engineStatus
    };
  }

  async updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    const targetLabel = targetId === "standard" ? "System OpenClaw" : "Managed local OpenClaw";
    const command =
      targetId === "standard"
        ? await this.access.resolveSystemOpenClawCommand()
        : await this.access.resolveManagedOpenClawCommand();

    if (!command) {
      await this.access.logSoftFailure("ChillClaw could not update an OpenClaw deployment target because the runtime is missing.", {
        targetId,
        targetLabel
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} is not installed on this Mac.`,
        engineStatus: await this.status()
      };
    }

    const beforeVersion = await this.access.readVersionFromCommand(command);
    const beforeStatus = await this.access.readUpdateStatusFromCommand(command);
    const updateResult = await this.access.runCommand(command, ["update", "--json", "--yes", "--no-restart", "--tag", "latest"], {
      allowFailure: true
    });
    this.access.invalidateReadCaches(["engine"]);
    const refreshedCommand =
      targetId === "standard"
        ? await this.access.resolveSystemOpenClawCommand({ fresh: true })
        : await this.access.resolveManagedOpenClawCommand({ fresh: true });
    const effectiveCommand = refreshedCommand ?? command;
    const afterVersion = await this.access.readVersionFromCommand(effectiveCommand, { fresh: true });
    const afterStatus = await this.access.readUpdateStatusFromCommand(effectiveCommand, { fresh: true });
    const parsedUpdateResult =
      safeJsonPayloadParse<{ targetVersion?: string; currentVersion?: string }>(updateResult.stdout) ??
      safeJsonPayloadParse<{ targetVersion?: string; currentVersion?: string }>(updateResult.stderr);
    const expectedVersion = parsedUpdateResult?.targetVersion?.trim() || beforeStatus?.latestVersion?.trim();
    const versionAdvanced =
      this.access.compareOpenClawVersions(afterVersion, beforeVersion) ??
      (afterVersion && beforeVersion ? (afterVersion === beforeVersion ? 0 : 1) : undefined);
    const stillBehindExpectedVersion =
      this.access.compareOpenClawVersions(afterVersion, expectedVersion) ??
      (afterVersion && expectedVersion ? (afterVersion === expectedVersion ? 0 : -1) : undefined);

    if (updateResult.code !== 0) {
      await this.access.logSoftFailure("ChillClaw failed to update an installed OpenClaw deployment target.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        stderr: updateResult.stderr,
        stdout: updateResult.stdout
      });
      return {
        targetId,
        status: "failed",
        message: updateResult.stderr || updateResult.stdout || `${targetLabel} update failed.`,
        engineStatus: await this.status()
      };
    }

    if (beforeStatus?.updateAvailable && beforeVersion && (!afterVersion || (versionAdvanced ?? 0) <= 0)) {
      await this.access.logSoftFailure("ChillClaw attempted an OpenClaw update but the installed version did not change.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        expectedVersion,
        stdout: updateResult.stdout,
        stderr: updateResult.stderr
      });
      return {
        targetId,
        status: "failed",
        message: expectedVersion
          ? `${targetLabel} update finished, but the active version is still ${afterVersion ?? beforeVersion} instead of ${expectedVersion}.`
          : `${targetLabel} update did not change the installed version. It is still ${afterVersion ?? beforeVersion}.`,
        engineStatus: await this.status()
      };
    }

    if (
      beforeStatus?.updateAvailable &&
      expectedVersion &&
      afterVersion &&
      afterStatus?.updateAvailable &&
      (stillBehindExpectedVersion ?? -1) < 0
    ) {
      await this.access.logSoftFailure("ChillClaw attempted an OpenClaw update but the active binary is still behind the expected version.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        expectedVersion,
        stdout: updateResult.stdout,
        stderr: updateResult.stderr
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} update finished, but the active version is still ${afterVersion} and ChillClaw expected at least ${expectedVersion}.`,
        engineStatus: await this.status()
      };
    }

    const restart = await this.access.runCommand(effectiveCommand, ["gateway", "restart"], { allowFailure: true });

    if (restart.code !== 0) {
      await this.access.logSoftFailure("ChillClaw updated OpenClaw but could not restart the gateway afterward.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        stdout: restart.stdout,
        stderr: restart.stderr
      });
      return {
        targetId,
        status: "failed",
        message: restart.stderr || restart.stdout || `${targetLabel} updated, but ChillClaw could not restart the OpenClaw gateway.`,
        engineStatus: await this.status()
      };
    }

    this.access.invalidateReadCaches(["engine"]);
    const finalVersion = await this.access.readVersionFromCommand(effectiveCommand, { fresh: true });
    const finalStatus = await this.access.readUpdateStatusFromCommand(effectiveCommand, { fresh: true });
    const finalVersionAdvanced =
      this.access.compareOpenClawVersions(finalVersion, beforeVersion) ??
      (finalVersion && beforeVersion ? (finalVersion === beforeVersion ? 0 : 1) : undefined);
    const finalStillBehindExpectedVersion =
      this.access.compareOpenClawVersions(finalVersion, expectedVersion) ??
      (finalVersion && expectedVersion ? (finalVersion === expectedVersion ? 0 : -1) : undefined);

    if (beforeStatus?.updateAvailable && beforeVersion && (!finalVersion || (finalVersionAdvanced ?? 0) <= 0)) {
      await this.access.logSoftFailure("ChillClaw updated and restarted OpenClaw, but the active version reverted afterward.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        finalVersion,
        expectedVersion
      });
      return {
        targetId,
        status: "failed",
        message: expectedVersion
          ? `${targetLabel} update ran, but after restart the active version is still ${finalVersion ?? beforeVersion} instead of ${expectedVersion}.`
          : `${targetLabel} update ran, but after restart the active version is still ${finalVersion ?? beforeVersion}.`,
        engineStatus: await this.status()
      };
    }

    if (
      beforeStatus?.updateAvailable &&
      expectedVersion &&
      finalVersion &&
      finalStatus?.updateAvailable &&
      (finalStillBehindExpectedVersion ?? -1) < 0
    ) {
      await this.access.logSoftFailure("ChillClaw updated and restarted OpenClaw, but the active version stayed behind the expected version.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        finalVersion,
        expectedVersion
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} update ran, but after restart the active version is still ${finalVersion} and ChillClaw expected at least ${expectedVersion}.`,
        engineStatus: await this.status()
      };
    }

    const message =
      afterVersion && beforeVersion && afterVersion !== beforeVersion
        ? `${targetLabel} updated from ${beforeVersion} to ${finalVersion ?? afterVersion}.`
        : finalVersion
          ? `${targetLabel} update completed. Current version: ${finalVersion}.`
          : `${targetLabel} update completed.`;
    let engineStatus: EngineStatus;

    try {
      engineStatus = await this.access.waitForGatewayReachable(`${targetLabel} update`);
    } catch (error) {
      const fallbackStatus = await this.status();
      await this.access.logSoftFailure("ChillClaw restarted the OpenClaw gateway after update, but it is still not reachable.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        finalVersion,
        summary: error instanceof Error ? error.message : fallbackStatus.summary
      });
      return {
        targetId,
        status: "failed",
        message:
          (error instanceof Error ? error.message : fallbackStatus.summary) ||
          `${targetLabel} updated, but the OpenClaw gateway is still not reachable after restart.`,
        engineStatus: fallbackStatus
      };
    }

    return {
      targetId,
      status: "completed",
      message: `${message} OpenClaw gateway restarted and is reachable. ChillClaw verified the version again after restart.`,
      engineStatus
    };
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const snapshot = await this.access.readEngineSnapshot({ includeUpdate: true });
    const parsed = snapshot.updateJson as OpenClawUpdateStatusJson | undefined;
    const engineStatus = await this.status();

    if (parsed?.availability?.available) {
      return {
        message: `OpenClaw update available: ${parsed.availability.latestVersion ?? "new version detected"} on ${parsed.channel?.label ?? "current channel"}.`,
        engineStatus
      };
    }

    if (parsed?.update?.registry?.error) {
      await this.access.logSoftFailure("ChillClaw update check failed during OpenClaw registry lookup.", {
        registryError: parsed.update.registry.error
      });
      return {
        message: `ChillClaw checked for updates, but registry lookup failed: ${parsed.update.registry.error}.`,
        engineStatus
      };
    }

    return {
      message: "ChillClaw verified that no newer OpenClaw version is currently visible.",
      engineStatus
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    if (!(await this.access.resolveOpenClawCommand())) {
      await this.access.logSoftFailure("ChillClaw recovery failed because OpenClaw CLI is not installed.", {
        actionId: action.id
      });
      return {
        actionId: action.id,
        status: "failed",
        message: "OpenClaw CLI is not installed."
      };
    }

    switch (action.id) {
      case "restart-engine": {
        const restart = await this.access.runOpenClaw(["gateway", "restart"], { allowFailure: true });
        if (restart.code !== 0) {
          await this.access.logSoftFailure("ChillClaw failed to restart the OpenClaw gateway during recovery.", {
            actionId: action.id,
            stderr: restart.stderr,
            stdout: restart.stdout
          });
        }
        return {
          actionId: action.id,
          status: restart.code === 0 ? "completed" : "failed",
          message: restart.code === 0
            ? "OpenClaw gateway restart completed."
            : restart.stderr || restart.stdout || "OpenClaw gateway restart failed."
        };
      }
      case "repair-config": {
        await this.access.configure("email-admin");
        const doctor = await this.access.runOpenClaw(["doctor", "--repair", "--non-interactive", "--yes"], {
          allowFailure: true
        });
        if (doctor.code !== 0) {
          await this.access.logSoftFailure("ChillClaw failed to repair the OpenClaw configuration with doctor.", {
            actionId: action.id,
            stderr: doctor.stderr,
            stdout: doctor.stdout
          });
        }
        return {
          actionId: action.id,
          status: doctor.code === 0 ? "completed" : "failed",
          message: doctor.code === 0
            ? "ChillClaw defaults were restored and OpenClaw doctor applied safe repairs."
            : doctor.stderr || doctor.stdout || "OpenClaw doctor could not complete repairs."
        };
      }
      case "rollback-update": {
        const updateStatus = await this.access.runOpenClaw(["update", "status", "--json"], { allowFailure: true });
        const parsed =
          safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateStatus.stdout) ??
          safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateStatus.stderr);
        return {
          actionId: action.id,
          status: "completed",
          message: parsed?.availability?.available
            ? `ChillClaw detected update drift. Manual reinstall of ${this.access.openClawInstallTargetSummary()} is recommended until automated rollback is added.`
            : "OpenClaw update state looks consistent; no rollback was needed."
        };
      }
      case "reinstall-engine": {
        const bootstrap = await this.access.ensurePinnedOpenClaw("auto");
        const reinstall = await this.access.runOpenClaw(["gateway", "install", "--force"], { allowFailure: true });
        const installStatus = bootstrap.status !== "failed" && reinstall.code === 0 ? "completed" : "failed";
        if (installStatus === "failed") {
          await this.access.logSoftFailure("ChillClaw failed to reinstall the OpenClaw gateway during recovery.", {
            actionId: action.id,
            bootstrap,
            stderr: reinstall.stderr,
            stdout: reinstall.stdout
          });
        }
        return {
          actionId: action.id,
          status: installStatus,
          message: installStatus === "completed"
            ? `${bootstrap.message} OpenClaw gateway service was reinstalled.`
            : bootstrap.status === "failed"
              ? bootstrap.message
              : reinstall.stderr || reinstall.stdout || "OpenClaw gateway reinstall failed."
        };
      }
      case "export-diagnostics":
        return {
          actionId: action.id,
          status: "completed",
          message: "Diagnostics are ready for export."
        };
      default:
        await this.access.logSoftFailure("ChillClaw received an unsupported recovery action.", {
          actionId: action.id
        });
        return {
          actionId: action.id,
          status: "failed",
          message: "Unsupported recovery action."
        };
    }
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    const [status, health, snapshot] = await Promise.all([
      this.status(),
      this.healthCheck(),
      this.access.readEngineSnapshot({ includeUpdate: true })
    ]);

    return {
      filename: "slackclaw-diagnostics.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          installSpec: this.access.installSpec,
          status,
          health,
          raw: {
            gatewayStatus: snapshot.gatewayJson,
            updateStatus: snapshot.updateJson
          }
        },
        null,
        2
      )
    };
  }

  async restartGateway(): Promise<GatewayActionResponse> {
    try {
      const engineStatus = await this.access.restartGatewayAndRequireHealthy("manual restart");

      return {
        action: "restart-gateway",
        status: "completed",
        message: "OpenClaw gateway restarted and is reachable.",
        engineStatus
      };
    } catch (error) {
      await this.access.logSoftFailure("ChillClaw could not restart the OpenClaw gateway on demand.", {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        action: "restart-gateway",
        status: "failed",
        message: error instanceof Error ? error.message : "ChillClaw could not restart the OpenClaw gateway.",
        engineStatus: await this.status()
      };
    }
  }

  async healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]> {
    const data = await this.access.collectStatusData();
    const state = await this.access.readAdapterState();
    const effectiveProfile = selectedProfileId ?? state.configuredProfileId;
    const checks: HealthCheckResult[] = [];

    checks.push({
      id: "engine-cli",
      title: "OpenClaw CLI",
      severity: data.installed ? "ok" : "error",
      summary: data.installed ? `OpenClaw ${data.cliVersion ?? "detected"} is installed.` : "OpenClaw CLI is missing.",
      detail: data.installed
        ? "ChillClaw can invoke the upstream CLI."
        : "Install OpenClaw before ChillClaw can perform onboarding or tasks.",
      remediationActionIds: data.installed ? [] : ["reinstall-engine"]
    });

    checks.push({
      id: "gateway-service",
      title: "Gateway service",
      severity: data.gatewayReachable ? "ok" : data.gatewayInstalled ? "warning" : "error",
      summary: data.gatewayReachable
        ? "Gateway is reachable."
        : data.gatewayInstalled
          ? "Gateway service is installed but not reachable."
          : "Gateway service is not installed.",
      detail: data.gatewayDetail,
      remediationActionIds: data.gatewayReachable
        ? []
        : data.gatewayInstalled
          ? ["restart-engine", "reinstall-engine"]
          : ["reinstall-engine"]
    });

    checks.push({
      id: "version-compatibility",
      title: "Version compatibility",
      severity: this.access.isOpenClawVersionCompatible(data.cliVersion) ? "ok" : data.cliVersion ? "warning" : "info",
      summary: this.access.openClawVersionSummary(data.cliVersion),
      detail: this.access.versionOverride
        ? "ChillClaw is running with an explicit OpenClaw version override."
        : "ChillClaw uses the latest available OpenClaw release for new installs.",
      remediationActionIds: this.access.versionOverride && !this.access.isOpenClawVersionCompatible(data.cliVersion)
        ? ["rollback-update"]
        : []
    });

    checks.push({
      id: "default-profile",
      title: "ChillClaw defaults",
      severity: effectiveProfile ? "ok" : "info",
      summary: effectiveProfile ? `Default profile set to ${effectiveProfile}.` : "No ChillClaw onboarding profile selected yet.",
      detail: effectiveProfile
        ? "ChillClaw can apply office-work defaults to new tasks."
        : "Complete onboarding so ChillClaw can choose a beginner-friendly default workflow.",
      remediationActionIds: effectiveProfile ? [] : ["repair-config"]
    });

    if (data.providersMissingCount > 0) {
      checks.push({
        id: "provider-auth",
        title: "Provider authentication",
        severity: "warning",
        summary: `${data.providersMissingCount} model provider profile(s) are missing auth.`,
        detail: data.providersMissingDetail,
        remediationActionIds: ["repair-config", "export-diagnostics"]
      });
    }

    for (const finding of data.securityFindings.slice(0, 3)) {
      checks.push({
        id: finding.checkId ?? `security-${randomUUID()}`,
        title: finding.title ?? "Security audit finding",
        severity: finding.severity === "critical" ? "error" : finding.severity === "warn" ? "warning" : "info",
        summary: finding.title ?? "Security audit reported an issue.",
        detail: [finding.detail, finding.remediation].filter(Boolean).join(" "),
        remediationActionIds: ["export-diagnostics"]
      });
    }

    return checks;
  }

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    const startedAt = new Date().toISOString();
    const state = await this.access.readAdapterState();
    const installed = Boolean(await this.access.resolveOpenClawCommand());
    const title = createTaskTitle(request);

    if (!installed) {
      await this.access.logSoftFailure("ChillClaw task execution failed because OpenClaw is not installed.", {
        profileId: request.profileId,
        memberId: request.memberId,
        memberAgentId: request.memberAgentId
      });
      return {
        taskId: randomUUID(),
        title,
        status: "failed",
        summary: "OpenClaw is not installed.",
        output: "Install OpenClaw before running tasks.",
        nextActions: ["Install OpenClaw", "Use the mock adapter for UI development"],
        startedAt,
        finishedAt: new Date().toISOString(),
        steps: [
          { id: "prepare", label: "Preparing task", status: "done" },
          { id: "execute", label: "Running engine task", status: "done" }
        ]
      };
    }

    const result = await this.access.runOpenClaw(
      [
        "agent",
        "--local",
        "--json",
        ...(request.memberAgentId ? ["--agent", request.memberAgentId] : await this.access.resolveAgentArgs()),
        "--message",
        request.prompt
      ],
      {
        allowFailure: true
      }
    );
    const parsed = safeJsonPayloadParse<{
      output?: string;
      finalText?: string;
      response?: string;
      message?: string;
    }>(result.stdout);
    const output =
      parsed?.output ??
      parsed?.finalText ??
      parsed?.response ??
      parsed?.message ??
      result.stdout ??
      result.stderr;
    const ok = result.code === 0 && Boolean(output);

    if (!ok) {
      await this.access.logSoftFailure("ChillClaw task execution returned a failed OpenClaw response.", {
        profileId: request.profileId,
        memberId: request.memberId,
        memberAgentId: request.memberAgentId,
        code: result.code,
        stderr: result.stderr,
        stdout: result.stdout
      });
    }

    return {
      taskId: randomUUID(),
      title,
      status: ok ? "completed" : "failed",
      summary: ok
        ? `OpenClaw completed the task using profile ${request.profileId}${request.memberId ? ` and AI member ${request.memberId}` : ""}.`
        : "OpenClaw did not return a successful local agent response.",
      output: ok
        ? output
        : [
            "OpenClaw task execution failed.",
            result.stderr || result.stdout || "No output was returned.",
            state.configuredProfileId
              ? `ChillClaw default profile: ${state.configuredProfileId}`
              : "ChillClaw onboarding profile is not configured yet."
          ].join("\n\n"),
      nextActions: ok
        ? ["Refine the prompt", "Save as a reusable workflow", "Export the result"]
        : ["Repair setup defaults", "Restart engine", "Export diagnostics"],
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: [
        { id: "prepare", label: "Preparing task", status: "done" },
        { id: "execute", label: "Running openclaw agent --local", status: "done" },
        { id: "summarize", label: "Formatting response", status: "done" }
      ]
    };
  }

  async finalizeOnboardingSetup() {
    const engineStatus = await this.status();
    const gatewayInstalled = await this.access.gatewayInstalled();

    if (gatewayInstalled && engineStatus.running && !engineStatus.pendingGatewayApply) {
      return {
        message: "OpenClaw gateway is already installed, configured, and reachable.",
        engineStatus
      };
    }

    const finalizedStatus = await this.access.restartGatewayAndRequireHealthy("onboarding completion");
    return {
      message: "OpenClaw onboarding finalization applied the gateway runtime and verified reachability.",
      engineStatus: finalizedStatus
    };
  }

  async startGatewayAfterChannels() {
    const engineStatus = await this.access.restartGatewayAndRequireHealthy("channel setup");

    return {
      message: "OpenClaw gateway restarted and is reachable.",
      engineStatus
    };
  }

  private async installDeploymentTargetInternal(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    const bootstrap = await this.access.ensurePinnedOpenClaw(targetId === "managed-local" ? "managed-local" : "system");
    const state = await this.access.readAdapterState();

    await this.access.writeAdapterState({
      ...state,
      installedAt: new Date().toISOString(),
      lastInstallMode: "detected"
    });

    this.access.invalidateReadCaches();
    const engineStatus = await this.status();

    return {
      targetId,
      status: "completed",
      message: bootstrap.message,
      engineStatus
    };
  }
}
