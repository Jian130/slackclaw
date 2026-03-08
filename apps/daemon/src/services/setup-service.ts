import type {
  InstallResponse,
  RecoveryAction,
  SetupRunResponse,
  SetupStepResult
} from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";

function restartEngineAction(): RecoveryAction {
  return {
    id: "restart-engine",
    type: "restart-engine",
    title: "Restart assistant engine",
    description: "Restart the local engine service so SlackClaw can reconnect.",
    safetyLevel: "safe",
    expectedImpact: "Running tasks may be interrupted for a moment while the service restarts."
  };
}

export class SetupService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService
  ) {}

  async markIntroCompleted() {
    await this.store.update((current) => ({
      ...current,
      introCompletedAt: current.introCompletedAt ?? new Date().toISOString()
    }));

    return this.overviewService.getOverview();
  }

  async runFirstRunSetup(options?: { forceLocal?: boolean }): Promise<SetupRunResponse> {
    const steps: SetupStepResult[] = [];
    let installResult: InstallResponse | undefined;

    await this.store.update((current) => ({
      ...current,
      introCompletedAt: current.introCompletedAt ?? new Date().toISOString()
    }));

    const statusBefore = await this.adapter.status();
    steps.push({
      id: "check-existing-openclaw",
      title: "Check for an existing OpenClaw installation",
      status: "completed",
      detail: statusBefore.installed
        ? `Found OpenClaw ${statusBefore.version ?? "installed"} on this Mac and SlackClaw can try to reuse it.`
        : "No compatible OpenClaw installation was found yet. SlackClaw will deploy a managed local copy for this user."
    });

    installResult = await this.adapter.install(true, { forceLocal: options?.forceLocal ?? false });
    steps.push({
      id: "prepare-openclaw",
      title: "Prepare OpenClaw and its required dependencies",
      status: installResult.status === "installed" || installResult.status === "already-installed" ? "completed" : "failed",
      detail: installResult.message
    });

    let finalStatus = installResult.engineStatus;

    if (!finalStatus.running) {
      const restart = await this.adapter.repair(restartEngineAction());
      finalStatus = await this.adapter.status();
      steps.push({
        id: "ensure-engine-running",
        title: "Make sure the OpenClaw service is running",
        status: restart.status === "completed" && finalStatus.running ? "completed" : "failed",
        detail: restart.status === "completed" && finalStatus.running
          ? "SlackClaw confirmed that the local engine service is now reachable."
          : restart.message
      });
    } else {
      steps.push({
        id: "ensure-engine-running",
        title: "Make sure the OpenClaw service is running",
        status: "completed",
        detail: "OpenClaw was already running and reachable."
      });
    }

    const setupCompleted = finalStatus.installed && finalStatus.running;

    if (setupCompleted) {
      await this.store.update((current) => ({
        ...current,
        setupCompletedAt: new Date().toISOString()
      }));
    }

    const overview = await this.overviewService.getOverview();
    const failedStep = steps.find((step) => step.status === "failed");

    return {
      status: failedStep ? "failed" : "completed",
      message: failedStep
        ? "SlackClaw finished part of setup, but the engine still needs attention."
        : "SlackClaw setup completed and the local engine is ready.",
      steps,
      overview,
      install: installResult
    };
  }
}
