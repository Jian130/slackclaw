import { homedir } from "node:os";

import {
  createDefaultProductOverview,
  type InstallCheck,
  type ProductOverview,
  type RecoveryAction
} from "@chillclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import type { RuntimeManager } from "../runtime-manager/runtime-manager.js";
import { AppServiceManager } from "./app-service-manager.js";
import { AppUpdateService } from "./app-update-service.js";
import { getDefaultAppSupportDir } from "../runtime-paths.js";
import { StateStore } from "./state-store.js";
import { getProductVersion } from "../product-version.js";
import type { LocalModelRuntimeService } from "./local-model-runtime-service.js";
import { getAvailableDiskBytes } from "../platform/disk-space.js";

export type OverviewReadOptions = {
  includeLocalRuntime?: boolean;
};

export class OverviewService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly appServiceManager = new AppServiceManager(),
    private readonly appUpdateService = new AppUpdateService(),
    private readonly localModelRuntimeService?: LocalModelRuntimeService,
    private readonly runtimeManager?: RuntimeManager
  ) {}

  async getOverview(options?: OverviewReadOptions): Promise<ProductOverview> {
    const appUpdate = await this.appUpdateService.getStatus();
    const base = createDefaultProductOverview({
      appVersion: getProductVersion(),
      appUpdate
    });
    const state = await this.store.read();
    const engine = await this.adapter.instances.status();
    const healthChecks = await this.adapter.gateway.healthCheck(state.selectedProfileId);
    const appService = await this.appServiceManager.getStatus();
    const installChecks = await this.getInstallChecks(base.installSpec.prerequisites);
    const runtimeManager = this.runtimeManager ? await this.runtimeManager.getOverview() : base.runtimeManager;
    const liveWhatsapp = await this.adapter.config.getChannelState("whatsapp");
    const storedChannels = state.channelOnboarding?.channels ?? {};
    const baseChannels = Object.fromEntries(base.channelSetup.channels.map((channel) => [channel.id, channel])) as Record<
      "telegram" | "whatsapp" | "feishu" | "wechat",
      (typeof base.channelSetup.channels)[number]
    >;
    const mergedChannels = {
      telegram: storedChannels.telegram ?? baseChannels.telegram,
      whatsapp:
        liveWhatsapp.status !== "not-started" || liveWhatsapp.logs?.length
          ? liveWhatsapp
          : storedChannels.whatsapp ?? baseChannels.whatsapp,
      feishu: storedChannels.feishu ?? baseChannels.feishu,
      wechat: storedChannels.wechat ?? baseChannels.wechat
    };
    const onboardingCompleted = true;
    const nextChannelId = (["telegram", "whatsapp", "feishu", "wechat"] as const).find((channelId) => mergedChannels[channelId].status !== "completed");
    const includeLocalRuntime = options?.includeLocalRuntime ?? Boolean(state.setupCompletedAt);
    const localRuntime = includeLocalRuntime && this.localModelRuntimeService
      ? await this.localModelRuntimeService.getOverview()
      : base.localRuntime;
    const recoveryActions = [...base.recoveryActions];
    const mergedHealthChecks = [...healthChecks];

    if (localRuntime && (localRuntime.status === "degraded" || localRuntime.status === "failed")) {
      recoveryActions.unshift({
        id: "repair-local-model-runtime",
        type: "repair-local-model-runtime",
        title: "Repair local AI runtime",
        description: "Restart or reconnect the local Ollama runtime that ChillClaw manages on this Mac.",
        safetyLevel: "safe",
        expectedImpact: "May restart the local Ollama runtime and re-check the downloaded local model."
      });
    }

    if (localRuntime?.activeInOpenClaw && (localRuntime.status === "degraded" || localRuntime.status === "failed")) {
      mergedHealthChecks.unshift({
        id: "local-model-runtime",
        title: "Local AI runtime",
        severity: "warning",
        summary: "Local AI on this Mac needs repair.",
        detail: localRuntime.detail,
        remediationActionIds: ["repair-local-model-runtime"]
      });
    }

    return {
      ...base,
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      appService,
      appUpdate,
      engine,
      capabilities: this.adapter.capabilities,
      installSpec: this.adapter.installSpec,
      installChecks,
      channelSetup: {
        baseOnboardingCompleted: onboardingCompleted,
        channels: [mergedChannels.telegram, mergedChannels.whatsapp, mergedChannels.feishu, mergedChannels.wechat],
        nextChannelId,
        gatewayStarted: Boolean(state.channelOnboarding?.gatewayStartedAt),
        gatewaySummary: engine.pendingGatewayApply
          ? engine.pendingGatewayApplySummary ?? "ChillClaw saved changes that are ready to apply to the gateway."
          : nextChannelId
            ? `Next recommended channel: ${mergedChannels[nextChannelId].title}.`
          : "All channel setup steps are complete. Restart the gateway to load every channel."
      },
      localRuntime,
      runtimeManager,
      healthChecks: mergedHealthChecks,
      recoveryActions,
      recentTasks: state.tasks.slice(-5).reverse(),
      profiles: base.profiles,
      templates: base.templates
    };
  }

  async findRecoveryAction(actionId: string): Promise<RecoveryAction | undefined> {
    const overview = await this.getOverview();
    return overview.recoveryActions.find((action) => action.id === actionId);
  }

  private async getInstallChecks(prerequisites: string[]): Promise<InstallCheck[]> {
    const minimumDiskGb = this.extractDiskRequirement(prerequisites) ?? 2;
    const checks: InstallCheck[] = [
      {
        id: "platform",
        label: "Supported macOS version",
        status: process.platform === "darwin" ? "passed" : "action-required",
        detail:
          process.platform === "darwin"
            ? `Running on macOS. ChillClaw is supported on this platform.`
            : `ChillClaw currently targets macOS first, but this machine reports ${process.platform}.`
      },
      {
        id: "disk",
        label: "Free disk space",
        status: "pending",
        detail: "ChillClaw is checking available disk space."
      },
      {
        id: "permissions",
        label: "Document access permission",
        status: "passed",
        detail: "ChillClaw will request file access only when you explicitly choose local documents or folders."
      }
    ];

    try {
      const targetPath = process.env.CHILLCLAW_DATA_DIR ?? getDefaultAppSupportDir() ?? homedir();
      const availableBytes = await getAvailableDiskBytes(targetPath);
      const availableGb = availableBytes / 1024 / 1024 / 1024;
      const roundedGb = availableGb >= 10 ? Math.round(availableGb) : Number(availableGb.toFixed(1));
      checks[1] = {
        id: "disk",
        label: "Free disk space",
        status: availableGb >= minimumDiskGb ? "passed" : "action-required",
        detail:
          availableGb >= minimumDiskGb
            ? `${roundedGb} GB is available. ChillClaw has enough free space for OpenClaw and starter assets.`
            : `${roundedGb} GB is available. ChillClaw recommends at least ${minimumDiskGb} GB free before deployment.`
      };
    } catch {
      checks[1] = {
        id: "disk",
        label: "Free disk space",
        status: "action-required",
        detail: "ChillClaw could not verify free disk space automatically. Deployment can still continue."
      };
    }

    return checks;
  }

  private extractDiskRequirement(prerequisites: string[]): number | undefined {
    for (const prerequisite of prerequisites) {
      const match = prerequisite.match(/(\d+(?:\.\d+)?)\s*GB/i);
      if (match) {
        return Number(match[1]);
      }
    }

    return undefined;
  }
}
