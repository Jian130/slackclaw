import type {
  ChannelActionResponse,
  ChannelSetupOverview,
  ChannelSetupState,
  FeishuSetupRequest,
  PairingApprovalRequest,
  SupportedChannelId,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";
import { createDefaultProductOverview } from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { OverviewService } from "./overview-service.js";
import type { AppState } from "./state-store.js";
import { StateStore } from "./state-store.js";

function channelOrder(): SupportedChannelId[] {
  return ["telegram", "whatsapp", "feishu", "wechat"];
}

function defaultChannelMap(): Record<SupportedChannelId, ChannelSetupState> {
  const defaults = createDefaultProductOverview().channelSetup.channels;

  return {
    telegram: defaults.find((channel) => channel.id === "telegram")!,
    whatsapp: defaults.find((channel) => channel.id === "whatsapp")!,
    feishu: defaults.find((channel) => channel.id === "feishu")!,
    wechat: defaults.find((channel) => channel.id === "wechat")!
  };
}

function mergeChannelStates(
  stored: Record<string, ChannelSetupState> | undefined,
  live: Partial<Record<SupportedChannelId, ChannelSetupState>>
): Record<SupportedChannelId, ChannelSetupState> {
  const defaults = defaultChannelMap();

  return {
    telegram: live.telegram ?? stored?.telegram ?? defaults.telegram,
    whatsapp: live.whatsapp ?? stored?.whatsapp ?? defaults.whatsapp,
    feishu: live.feishu ?? stored?.feishu ?? defaults.feishu,
    wechat: live.wechat ?? stored?.wechat ?? defaults.wechat
  };
}

function nextChannelId(channels: Record<SupportedChannelId, ChannelSetupState>): SupportedChannelId | undefined {
  return channelOrder().find((channelId) => channels[channelId].status !== "completed");
}

export class ChannelSetupService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly overviewService: OverviewService
  ) {}

  async getOverviewFromState(state?: AppState): Promise<ChannelSetupOverview> {
    const current = state ?? (await this.store.read());
    const liveWhatsapp = await this.adapter.getChannelState("whatsapp");
    const onboardingCompleted = Boolean(current.channelOnboarding?.baseOnboardingCompletedAt);
    const channels = mergeChannelStates(current.channelOnboarding?.channels, {
      whatsapp:
        liveWhatsapp.status !== "not-started" || liveWhatsapp.logs?.length
          ? liveWhatsapp
          : undefined
    });
    const nextId = onboardingCompleted ? nextChannelId(channels) : undefined;
    const gatewayStarted = Boolean(current.channelOnboarding?.gatewayStartedAt);

    return {
      baseOnboardingCompleted: onboardingCompleted,
      channels: channelOrder().map((id) => channels[id]),
      nextChannelId: nextId,
      gatewayStarted,
      gatewaySummary: gatewayStarted
        ? "Gateway restarted after channel setup."
        : !onboardingCompleted
          ? "Complete OpenClaw onboarding before setting up channels and starting the gateway."
        : nextId
          ? `Next recommended channel: ${channels[nextId].title}.`
          : "All channel steps are complete. Restart the gateway to load every channel."
    };
  }

  async markBaseOnboardingCompleted(): Promise<void> {
    await this.store.update((current) => ({
      ...current,
      channelOnboarding: {
        baseOnboardingCompletedAt: current.channelOnboarding?.baseOnboardingCompletedAt ?? new Date().toISOString(),
        gatewayStartedAt: current.channelOnboarding?.gatewayStartedAt,
        channels: mergeChannelStates(current.channelOnboarding?.channels, {})
      }
    }));
  }

  async configureTelegram(request: TelegramSetupRequest): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.configureTelegram(request);
    return this.persistChannelResult("telegram", result.channel, result.message, true);
  }

  async approvePairing(
    channelId: "telegram" | "whatsapp" | "feishu",
    request: PairingApprovalRequest
  ): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.approvePairing(channelId, request);
    return this.persistChannelResult(channelId, result.channel, result.message);
  }

  async startWhatsappLogin(): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.startWhatsappLogin();
    return this.persistChannelResult("whatsapp", result.channel, result.message, true);
  }

  async prepareFeishu(): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.prepareFeishu();
    return this.persistChannelResult("feishu", result.channel, result.message, true);
  }

  async configureFeishu(request: FeishuSetupRequest): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.configureFeishu(request);
    return this.persistChannelResult("feishu", result.channel, result.message, true);
  }

  async configureWechatWorkaround(request: WechatSetupRequest): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.configureWechatWorkaround(request);
    return this.persistChannelResult("wechat", result.channel, result.message, true);
  }

  async startGateway(): Promise<ChannelActionResponse> {
    await this.ensureBaseOnboardingCompleted();
    const result = await this.adapter.startGatewayAfterChannels();
    await this.store.update((current) => ({
      ...current,
      channelOnboarding: {
        baseOnboardingCompletedAt: current.channelOnboarding?.baseOnboardingCompletedAt,
        gatewayStartedAt: new Date().toISOString(),
        channels: mergeChannelStates(current.channelOnboarding?.channels, {})
      }
    }));

    const overview = await this.overviewService.getOverview();

    return {
      status: "completed",
      message: result.message,
      overview
    };
  }

  private async persistChannelResult(
    channelId: SupportedChannelId,
    channelState: ChannelSetupState,
    message: string,
    gatewayRestarted = false
  ): Promise<ChannelActionResponse> {
    await this.store.update((current) => ({
      ...current,
      channelOnboarding: {
        baseOnboardingCompletedAt: current.channelOnboarding?.baseOnboardingCompletedAt,
        gatewayStartedAt: gatewayRestarted ? new Date().toISOString() : current.channelOnboarding?.gatewayStartedAt,
        channels: {
          ...mergeChannelStates(current.channelOnboarding?.channels, {}),
          [channelId]: channelState
        }
      }
    }));

    const overview = await this.overviewService.getOverview();

    return {
      status: "completed",
      message,
      channel: channelState,
      overview
    };
  }

  private async ensureBaseOnboardingCompleted(): Promise<void> {
    const current = await this.store.read();

    if (!current.channelOnboarding?.baseOnboardingCompletedAt) {
      throw new Error("Complete OpenClaw onboarding before configuring channels or starting the gateway.");
    }
  }
}
