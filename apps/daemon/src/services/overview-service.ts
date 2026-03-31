import { statfs } from "node:fs/promises";
import { homedir } from "node:os";

import {
  createDefaultProductOverview,
  type InstallCheck,
  type ProductOverview,
  type RecoveryAction
} from "@chillclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { AppServiceManager } from "./app-service-manager.js";
import { getDefaultAppSupportDir } from "../runtime-paths.js";
import { StateStore } from "./state-store.js";

export class OverviewService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly appServiceManager = new AppServiceManager()
  ) {}

  async getOverview(): Promise<ProductOverview> {
    const base = createDefaultProductOverview();
    const state = await this.store.read();
    const engine = await this.adapter.instances.status();
    const healthChecks = await this.adapter.gateway.healthCheck(state.selectedProfileId);
    const appService = await this.appServiceManager.getStatus();
    const installChecks = await this.getInstallChecks(base.installSpec.prerequisites);
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

    return {
      ...base,
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      appService,
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
      healthChecks,
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
      const stats = await statfs(targetPath);
      const availableBytes = stats.bavail * stats.bsize;
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
