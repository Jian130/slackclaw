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
  RecoveryRunResponse,
  RuntimeResourceOverview
} from "@chillclaw/contracts";

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

type ManagedRuntimeActionResult = {
  status: "completed" | "failed";
  message: string;
  resource?: Partial<
    Pick<
      RuntimeResourceOverview,
      "installedVersion" | "desiredVersion" | "latestApprovedVersion" | "stagedVersion" | "updateAvailable"
    >
  >;
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
  readEngineSnapshot: (options?: { fresh?: boolean }) => Promise<{
    gatewayJson?: unknown;
  }>;
  resolveManagedOpenClawCommand: (options?: { fresh?: boolean }) => Promise<string | undefined>;
  resolveSystemOpenClawCommand: (options?: { fresh?: boolean }) => Promise<string | undefined>;
  resolveOpenClawCommand: () => Promise<string | undefined>;
  readVersionFromCommand: (command: string | undefined, options?: { fresh?: boolean }) => Promise<string | undefined>;
  getManagedOpenClawRuntimeResource: () => Promise<RuntimeResourceOverview | undefined>;
  prepareManagedOpenClawRuntime: () => Promise<ManagedRuntimeActionResult>;
  checkManagedOpenClawRuntimeUpdate: () => Promise<ManagedRuntimeActionResult>;
  stageManagedOpenClawRuntimeUpdate: () => Promise<ManagedRuntimeActionResult>;
  applyManagedOpenClawRuntimeUpdate: () => Promise<ManagedRuntimeActionResult>;
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
    const [managedCommand, systemCommand, managedRuntimeResource] = await Promise.all([
      this.access.resolveManagedOpenClawCommand(),
      this.access.resolveSystemOpenClawCommand(),
      this.access.getManagedOpenClawRuntimeResource().catch(async (error) => {
        await this.access.logSoftFailure("ChillClaw could not read the managed OpenClaw runtime manager status.", {
          error: error instanceof Error ? error.message : String(error)
        });
        return undefined;
      })
    ]);
    const activeCommand = await this.access.resolveOpenClawCommand();
    const [managedVersion, systemVersion] = await Promise.all([
      this.access.readVersionFromCommand(managedCommand),
      this.access.readVersionFromCommand(systemCommand)
    ]);
    const systemCompatible = this.access.isOpenClawVersionCompatible(systemVersion);
    const managedCompatible = this.access.isOpenClawVersionCompatible(managedVersion);
    const bundledManagedUpdateAvailable =
      managedVersion !== undefined &&
      (this.access.compareOpenClawVersions(managedVersion, this.access.installTarget) ?? 0) < 0;
    const managedRuntimeUpdateAvailable = Boolean(
      managedRuntimeResource?.updateAvailable || managedRuntimeResource?.stagedVersion
    );
    const managedUpdateAvailable = managedRuntimeUpdateAvailable || bundledManagedUpdateAvailable;
    const managedLatestVersion =
      managedRuntimeResource?.stagedVersion ??
      managedRuntimeResource?.latestApprovedVersion ??
      (bundledManagedUpdateAvailable ? this.access.installTarget : managedVersion);
    const managedDesiredVersion = managedRuntimeResource?.desiredVersion ?? this.access.installTarget;
    const managedUpdateSummary = managedRuntimeResource?.stagedVersion
      ? `ChillClaw staged approved OpenClaw ${managedRuntimeResource.stagedVersion} and can apply it to the managed runtime.`
      : managedRuntimeUpdateAvailable && managedLatestVersion
        ? `ChillClaw can update the managed runtime to approved OpenClaw ${managedLatestVersion}.`
        : bundledManagedUpdateAvailable
          ? `ChillClaw can refresh the managed runtime from the bundled OpenClaw ${this.access.installTarget} artifact.`
          : managedVersion
            ? "Managed OpenClaw is on ChillClaw's bundled runtime version."
            : undefined;

    const targets: DeploymentTargetStatus[] = [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "External OpenClaw installs are detected for migration only. ChillClaw updates its managed bundled runtime.",
        installMode: "system",
        installed: Boolean(systemVersion),
        installable: false,
        planned: false,
        recommended: false,
        active: Boolean(systemCommand && activeCommand === systemCommand),
        version: systemVersion,
        desiredVersion: this.access.installTarget,
        latestVersion: systemVersion,
        updateAvailable: false,
        requirements: this.access.standardRequirements,
        requirementsSourceUrl: this.access.macDocsUrl,
        summary: systemVersion
          ? this.access.versionOverride
            ? systemCompatible
              ? `System OpenClaw ${systemVersion} is installed, but ChillClaw now uses its managed bundled runtime instead.`
              : `System OpenClaw ${systemVersion} is installed, but ChillClaw now uses its managed bundled runtime.`
            : `System OpenClaw ${systemVersion} is installed, but ChillClaw now uses its managed bundled runtime.`
          : "No system OpenClaw install was detected.",
        updateSummary: systemVersion ? "System OpenClaw updates are not managed by ChillClaw." : undefined
      },
      {
        id: "managed-local",
        title: "OpenClaw Managed Local",
        description: "Deploy the bundled OpenClaw runtime selected and verified by ChillClaw.",
        installMode: "managed-local",
        installed: Boolean(managedVersion),
        installable: true,
        planned: false,
        recommended: true,
        active: Boolean(managedCommand && activeCommand === managedCommand),
        version: managedVersion,
        desiredVersion: managedDesiredVersion,
        latestVersion: managedLatestVersion,
        updateAvailable: managedUpdateAvailable,
        requirements: this.access.managedRequirements,
        requirementsSourceUrl: this.access.installDocsUrl,
        summary: managedVersion
          ? this.access.versionOverride
            ? managedCompatible
              ? `Managed local OpenClaw ${managedVersion} meets ChillClaw's requested version floor ${this.access.versionOverride}.`
              : `Managed local OpenClaw ${managedVersion} is installed, but ChillClaw expects at least ${this.access.versionOverride}.`
            : `Managed local OpenClaw ${managedVersion} is installed.`
          : "ChillClaw's managed local OpenClaw runtime is not installed yet.",
        updateSummary: managedUpdateSummary
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

    if (targetId !== "managed-local") {
      await this.access.logSoftFailure("ChillClaw skipped a system OpenClaw update because runtime updates are managed from the bundled runtime.", {
        targetId,
        targetLabel
      });
      return {
        targetId,
        status: "failed",
        message: "ChillClaw only updates its managed OpenClaw runtime. Install or update the managed runtime instead.",
        engineStatus: await this.status()
      };
    }

    let runtimeResult = await this.access.checkManagedOpenClawRuntimeUpdate();
    if (runtimeResult.status !== "completed") {
      await this.access.logSoftFailure("ChillClaw could not check the managed OpenClaw runtime update.", {
        targetId,
        targetLabel,
        message: runtimeResult.message
      });
      return {
        targetId,
        status: "failed",
        message: runtimeResult.message,
        engineStatus: await this.status()
      };
    }

    const shouldStageManagedUpdate = Boolean(runtimeResult.resource?.updateAvailable || runtimeResult.resource?.stagedVersion);
    if (shouldStageManagedUpdate) {
      const hadStagedUpdate = Boolean(runtimeResult.resource?.stagedVersion);
      const stageResult = await this.access.stageManagedOpenClawRuntimeUpdate();
      if (stageResult.status !== "completed") {
        await this.access.logSoftFailure("ChillClaw could not stage the managed OpenClaw runtime update.", {
          targetId,
          targetLabel,
          message: stageResult.message
        });
        return {
          targetId,
          status: "failed",
          message: stageResult.message,
          engineStatus: await this.status()
        };
      }

      runtimeResult = stageResult;

      if (hadStagedUpdate || stageResult.resource?.stagedVersion) {
        const applyResult = await this.access.applyManagedOpenClawRuntimeUpdate();
        if (applyResult.status !== "completed") {
          await this.access.logSoftFailure("ChillClaw could not apply the managed OpenClaw runtime update.", {
            targetId,
            targetLabel,
            message: applyResult.message
          });
          return {
            targetId,
            status: "failed",
            message: applyResult.message,
            engineStatus: await this.status()
          };
        }
        runtimeResult = applyResult;
      }
    } else {
      runtimeResult = await this.access.prepareManagedOpenClawRuntime();
      if (runtimeResult.status !== "completed") {
        await this.access.logSoftFailure("ChillClaw could not prepare the managed OpenClaw runtime.", {
          targetId,
          targetLabel,
          message: runtimeResult.message
        });
        return {
          targetId,
          status: "failed",
          message: runtimeResult.message,
          engineStatus: await this.status()
        };
      }
    }

    this.access.invalidateReadCaches(["engine"]);
    const effectiveCommand = await this.access.resolveManagedOpenClawCommand({ fresh: true });
    if (!effectiveCommand) {
      await this.access.logSoftFailure("ChillClaw prepared the managed runtime, but the OpenClaw command is still missing.", {
        targetId,
        targetLabel
      });
      return {
        targetId,
        status: "failed",
        message: "ChillClaw prepared the managed OpenClaw runtime, but could not find the managed command afterward.",
        engineStatus: await this.status()
      };
    }

    const restart = await this.access.runCommand(effectiveCommand, ["gateway", "restart"], { allowFailure: true });

    if (restart.code !== 0) {
      await this.access.logSoftFailure("ChillClaw updated OpenClaw but could not restart the gateway afterward.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
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
    let engineStatus: EngineStatus;

    try {
      engineStatus = await this.access.waitForGatewayReachable(`${targetLabel} update`);
    } catch (error) {
      const fallbackStatus = await this.status();
      await this.access.logSoftFailure("ChillClaw restarted the OpenClaw gateway after update, but it is still not reachable.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
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
      message: `${runtimeResult.message} OpenClaw gateway restarted and is reachable.`,
      engineStatus
    };
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const runtimeResult = await this.access.checkManagedOpenClawRuntimeUpdate();
    const engineStatus = await this.status();

    return {
      message: runtimeResult.message,
      engineStatus
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    const requireOpenClawCommand = async () => {
      if (await this.access.resolveOpenClawCommand()) {
        return undefined;
      }

      await this.access.logSoftFailure("ChillClaw recovery failed because OpenClaw CLI is not installed.", {
        actionId: action.id
      });
      return {
        actionId: action.id,
        status: "failed",
        message: "OpenClaw CLI is not installed."
      } satisfies RecoveryRunResponse;
    };

    switch (action.id) {
      case "restart-engine": {
        const missingCommand = await requireOpenClawCommand();
        if (missingCommand) {
          return missingCommand;
        }

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
        const missingCommand = await requireOpenClawCommand();
        if (missingCommand) {
          return missingCommand;
        }

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
        const runtimeResult = await this.access.prepareManagedOpenClawRuntime();
        if (runtimeResult.status !== "completed") {
          await this.access.logSoftFailure("ChillClaw could not restore the managed OpenClaw runtime during recovery.", {
            actionId: action.id,
            message: runtimeResult.message
          });
        }
        this.access.invalidateReadCaches(["engine"]);
        return {
          actionId: action.id,
          status: runtimeResult.status,
          message:
            runtimeResult.status === "completed"
              ? `${runtimeResult.message} ChillClaw restored the managed OpenClaw runtime to the bundled baseline.`
              : runtimeResult.message
        };
      }
      case "reinstall-engine": {
        const bootstrap = await this.access.ensurePinnedOpenClaw("managed-local");
        const managedCommand = await this.access.resolveManagedOpenClawCommand({ fresh: true });
        if (!managedCommand) {
          await this.access.logSoftFailure("ChillClaw prepared the managed runtime, but could not find the OpenClaw command for gateway reinstall.", {
            actionId: action.id,
            bootstrap
          });
          return {
            actionId: action.id,
            status: "failed",
            message: "ChillClaw prepared the managed OpenClaw runtime, but could not find the managed command afterward."
          };
        }
        const reinstall = await this.access.runCommand(managedCommand, ["gateway", "install", "--force"], { allowFailure: true });
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
    const [status, health, snapshot, managedRuntimeUpdate] = await Promise.all([
      this.status(),
      this.healthCheck(),
      this.access.readEngineSnapshot(),
      this.access.checkManagedOpenClawRuntimeUpdate()
    ]);

    return {
      filename: "chillclaw-diagnostics.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          installSpec: this.access.installSpec,
          status,
          health,
          raw: {
            gatewayStatus: snapshot.gatewayJson,
            managedRuntimeUpdate
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
        : `ChillClaw uses OpenClaw ${this.access.installTarget} for new installs.`,
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
    if (targetId !== "managed-local") {
      await this.access.logSoftFailure("ChillClaw skipped a system OpenClaw install because installs are managed from the bundled runtime.", {
        targetId
      });
      return {
        targetId,
        status: "failed",
        message: "ChillClaw only installs its managed OpenClaw runtime. Use the managed runtime target instead.",
        engineStatus: await this.status()
      };
    }

    const bootstrap = await this.access.ensurePinnedOpenClaw("managed-local");
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
