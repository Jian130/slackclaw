import { randomUUID } from "node:crypto";

import { createDefaultProductOverview } from "@chillclaw/contracts";
import type {
  InstallResponse,
  SetupRunResponse,
  SetupStepResult
} from "@chillclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { EventPublisher } from "./event-publisher.js";
import { writeInfoLog } from "./logger.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";

const SETUP_OVERVIEW_TIMEOUT_MS = 1_000;

async function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  onTimeout?: () => void,
  onError?: (error: unknown) => void
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      onTimeout?.();
      resolve(fallback);
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        onError?.(error);
        resolve(fallback);
      }
    );
  });
}

export class SetupService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService,
    private readonly eventPublisher?: EventPublisher
  ) {}

  async markIntroCompleted() {
    await this.store.update((current) => ({
      ...current,
      introCompletedAt: current.introCompletedAt ?? new Date().toISOString()
    }));

    return this.overviewService.getOverview();
  }

  async runFirstRunSetup(options?: { forceLocal?: boolean }): Promise<SetupRunResponse> {
    const correlationId = `first-run-setup:${randomUUID()}`;
    const steps: SetupStepResult[] = [];
    let installResult: InstallResponse | undefined;

    await this.store.update((current) => ({
      ...current,
      introCompletedAt: current.introCompletedAt ?? new Date().toISOString()
    }));

    const statusBefore = await this.adapter.instances.status();
    this.eventPublisher?.publishDeployProgress({
      correlationId,
      targetId: "managed-local",
      phase: "detecting",
      percent: 10,
      message: statusBefore.installed
        ? `Found OpenClaw ${statusBefore.version ?? "installed"} and ChillClaw is checking whether it can be reused.`
        : "ChillClaw is preparing a managed local OpenClaw install for this Mac."
    });
    steps.push({
      id: "check-existing-openclaw",
      title: "Check for an existing OpenClaw installation",
      status: "completed",
      detail: statusBefore.installed
        ? `Found OpenClaw ${statusBefore.version ?? "installed"} on this Mac and ChillClaw can try to reuse it.`
        : "No compatible OpenClaw installation was found yet. ChillClaw will deploy a managed local copy for this user."
    });

    this.eventPublisher?.publishDeployProgress({
      correlationId,
      targetId: "managed-local",
      phase: statusBefore.installed ? "reusing" : "installing",
      percent: statusBefore.installed ? 34 : 46,
      message: statusBefore.installed
        ? `ChillClaw is preparing the existing OpenClaw runtime for onboarding.`
        : "ChillClaw is downloading and installing OpenClaw locally for this Mac."
    });
    installResult = await this.adapter.instances.install(false, { forceLocal: options?.forceLocal ?? true });
    this.eventPublisher?.publishDeployProgress({
      correlationId,
      targetId: "managed-local",
      phase: "verifying",
      percent: 84,
      message: "ChillClaw is verifying the OpenClaw runtime and refreshing local status."
    });
    this.eventPublisher?.publishDeployCompleted({
      correlationId,
      targetId: "managed-local",
      status: installResult.status === "installed" || installResult.status === "already-installed" ? "completed" : "failed",
      message: installResult.message,
      engineStatus: installResult.engineStatus
    });
    steps.push({
      id: "prepare-openclaw",
      title: "Prepare OpenClaw and its required dependencies",
      status: installResult.status === "installed" || installResult.status === "already-installed" ? "completed" : "failed",
      detail: installResult.message
    });

    const defaultOverview = createDefaultProductOverview();
    const fallbackOverview = {
      ...defaultOverview,
      firstRun: {
        ...defaultOverview.firstRun,
        introCompleted: true,
        setupCompleted: false
      },
      engine: installResult.engineStatus
    };
    const overview = await withTimeoutFallback(
      this.overviewService.getOverview({ includeLocalRuntime: false }),
      SETUP_OVERVIEW_TIMEOUT_MS,
      fallbackOverview,
      () => {
        void writeInfoLog("ChillClaw skipped a slow first-run setup overview refresh.", {
          timeoutMs: SETUP_OVERVIEW_TIMEOUT_MS
        }, {
          scope: "setupService.runFirstRunSetup"
        });
      },
      (error) => {
        void writeInfoLog("ChillClaw could not refresh first-run setup overview.", {
          error: error instanceof Error ? error.message : String(error)
        }, {
          scope: "setupService.runFirstRunSetup"
        });
      }
    );
    const failedStep = steps.find((step) => step.status === "failed");

    return {
      status: failedStep ? "failed" : "completed",
      message: failedStep
        ? "ChillClaw finished part of setup, but OpenClaw still needs attention."
        : "OpenClaw deployment is complete. Continue to Configuration for models and channels.",
      steps,
      overview,
      install: installResult
    };
  }
}
