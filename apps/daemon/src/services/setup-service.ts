import type {
  InstallResponse,
  SetupRunResponse,
  SetupStepResult
} from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";

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

    installResult = await this.adapter.install(false, { forceLocal: options?.forceLocal ?? false });
    steps.push({
      id: "prepare-openclaw",
      title: "Prepare OpenClaw and its required dependencies",
      status: installResult.status === "installed" || installResult.status === "already-installed" ? "completed" : "failed",
      detail: installResult.message
    });

    const finalStatus = await this.adapter.status();
    const setupCompleted = finalStatus.installed;

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
        ? "SlackClaw finished part of setup, but OpenClaw still needs attention."
        : "OpenClaw deployment is complete. Continue to Configuration for models and channels.",
      steps,
      overview,
      install: installResult
    };
  }
}
