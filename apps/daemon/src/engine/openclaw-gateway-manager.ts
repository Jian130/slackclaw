import type {
  AbortChatRequest,
  ChatThreadDetail,
  ChannelSession,
  ChannelSessionInputRequest,
  ChannelSetupState,
  EngineTaskRequest,
  EngineTaskResult,
  EngineStatus,
  HealthCheckResult,
  PairingApprovalRequest,
  SendChatMessageRequest
} from "@chillclaw/contracts";

import type { EngineChatLiveEvent, GatewayManager } from "./adapter.js";

type GatewayAccess = {
  restartGateway: () => Promise<{ action: "restart-gateway"; status: "completed" | "failed"; message: string; engineStatus: EngineStatus }>;
  healthCheck: (selectedProfileId?: string) => Promise<HealthCheckResult[]>;
  getActiveChannelSession: () => Promise<ChannelSession | undefined>;
  getChannelSession: (sessionId: string) => Promise<ChannelSession>;
  submitChannelSessionInput: (sessionId: string, request: ChannelSessionInputRequest) => Promise<ChannelSession>;
  runTask: (request: EngineTaskRequest) => Promise<EngineTaskResult>;
  getChatThreadDetail: (request: { agentId: string; threadId: string; sessionKey: string }) => Promise<ChatThreadDetail>;
  subscribeToLiveChatEvents: (listener: (event: EngineChatLiveEvent) => void) => Promise<() => void>;
  sendChatMessage: (request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }) => Promise<{ runId?: string }>;
  abortChatMessage: (request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }) => Promise<void>;
  startWhatsappLogin: () => Promise<{ message: string; channel: ChannelSetupState }>;
  approvePairing: (
    channelId: "telegram" | "whatsapp" | "feishu" | "wechat-work" | "wechat",
    request: PairingApprovalRequest
  ) => Promise<{ message: string; channel: ChannelSetupState }>;
  prepareFeishu: () => Promise<{ message: string; channel: ChannelSetupState }>;
  finalizeOnboardingSetup: () => Promise<{ message: string; engineStatus: EngineStatus }>;
  startGatewayAfterChannels: () => Promise<{ message: string; engineStatus: EngineStatus }>;
};

export class OpenClawGatewayManager implements GatewayManager {
  constructor(private readonly access: GatewayAccess) {}

  restartGateway() {
    return this.access.restartGateway();
  }

  healthCheck(selectedProfileId?: string) {
    return this.access.healthCheck(selectedProfileId);
  }

  getActiveChannelSession() {
    return this.access.getActiveChannelSession();
  }

  getChannelSession(sessionId: string) {
    return this.access.getChannelSession(sessionId);
  }

  submitChannelSessionInput(sessionId: string, request: ChannelSessionInputRequest) {
    return this.access.submitChannelSessionInput(sessionId, request);
  }

  runTask(request: EngineTaskRequest) {
    return this.access.runTask(request);
  }

  getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }) {
    return this.access.getChatThreadDetail(request);
  }

  subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void) {
    return this.access.subscribeToLiveChatEvents(listener);
  }

  sendChatMessage(request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }) {
    return this.access.sendChatMessage(request);
  }

  abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }) {
    return this.access.abortChatMessage(request);
  }

  startWhatsappLogin() {
    return this.access.startWhatsappLogin();
  }

  approvePairing(channelId: "telegram" | "whatsapp" | "feishu" | "wechat-work" | "wechat", request: PairingApprovalRequest) {
    return this.access.approvePairing(channelId, request);
  }

  prepareFeishu() {
    return this.access.prepareFeishu();
  }

  finalizeOnboardingSetup() {
    return this.access.finalizeOnboardingSetup();
  }

  startGatewayAfterChannels() {
    return this.access.startGatewayAfterChannels();
  }
}
