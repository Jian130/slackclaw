import type { ChannelSession, ChannelSetupState, SupportedChannelId } from "@chillclaw/contracts";
import { createDefaultProductOverview } from "@chillclaw/contracts";

export interface ChannelLoginSessionSnapshot {
  channelId: "whatsapp" | "wechat";
  entryId: string;
  status: "in-progress" | "awaiting-pairing" | "completed" | "failed";
  logs: string[];
  launchUrl?: string;
  inputPrompt?: string;
}

export function defaultChannelSetupStateMap(): Record<SupportedChannelId, ChannelSetupState> {
  const channels = createDefaultProductOverview().channelSetup.channels;

  return {
    telegram: { ...channels.find((channel) => channel.id === "telegram")! },
    whatsapp: { ...channels.find((channel) => channel.id === "whatsapp")! },
    feishu: { ...channels.find((channel) => channel.id === "feishu")! },
    "wechat-work": { ...channels.find((channel) => channel.id === "wechat-work")! },
    wechat: { ...channels.find((channel) => channel.id === "wechat")! }
  };
}

export function createChannelState(
  id: SupportedChannelId,
  overrides: Partial<ChannelSetupState>
): ChannelSetupState {
  const defaults = defaultChannelSetupStateMap();

  return {
    ...defaults[id],
    ...overrides,
    lastUpdatedAt: overrides.lastUpdatedAt ?? new Date().toISOString()
  };
}

function sessionTitle(channelId: "whatsapp" | "wechat"): string {
  return channelId === "whatsapp" ? "WhatsApp" : "WeChat";
}

function sessionRunningMessage(channelId: "whatsapp" | "wechat"): string {
  return `${sessionTitle(channelId)} login is running.`;
}

function sessionCompletedMessage(channelId: "whatsapp" | "wechat"): string {
  if (channelId === "wechat") {
    return "WeChat login finished. ChillClaw saved this channel and will finish gateway activation after onboarding.";
  }

  return `${sessionTitle(channelId)} login completed.`;
}

function sessionFailedMessage(channelId: "whatsapp" | "wechat"): string {
  return `${sessionTitle(channelId)} login failed.`;
}

function sessionAwaitingMessage(session: ChannelLoginSessionSnapshot): string {
  if (session.channelId === "whatsapp") {
    return "WhatsApp login is waiting for pairing approval.";
  }

  return session.inputPrompt
    ? "WeChat login is waiting for follow-up input."
    : "WeChat login is waiting for QR confirmation.";
}

export function toChannelSession(
  sessionState: ChannelLoginSessionSnapshot | undefined,
  options?: { includeCompleted?: boolean }
): ChannelSession | undefined {
  if (!sessionState) {
    return undefined;
  }

  if (sessionState.status === "completed" && options?.includeCompleted !== true) {
    return undefined;
  }

  return {
    id: `${sessionState.entryId}:login`,
    channelId: sessionState.channelId,
    entryId: sessionState.entryId,
    status:
      sessionState.status === "in-progress"
        ? "running"
        : sessionState.status === "awaiting-pairing"
          ? sessionState.inputPrompt
            ? "awaiting-input"
            : "running"
          : sessionState.status,
    message:
      sessionState.status === "failed"
        ? sessionFailedMessage(sessionState.channelId)
        : sessionState.status === "completed"
          ? sessionCompletedMessage(sessionState.channelId)
          : sessionState.status === "awaiting-pairing"
            ? sessionAwaitingMessage(sessionState)
            : sessionRunningMessage(sessionState.channelId),
    logs: sessionState.logs.slice(-40),
    launchUrl: sessionState.launchUrl,
    inputPrompt: sessionState.status === "awaiting-pairing" ? sessionState.inputPrompt : undefined
  };
}

export function createChannelStateFromLoginSession(
  channelId: "whatsapp" | "wechat",
  sessionState: ChannelLoginSessionSnapshot
): ChannelSetupState {
  const session = toChannelSession(sessionState, { includeCompleted: true });

  return createChannelState(channelId, {
    status: sessionState.status,
    summary:
      sessionState.status === "failed"
        ? `${channelId === "whatsapp" ? "WhatsApp" : "WeChat"} login session failed.`
        : sessionState.status === "completed"
          ? `${channelId === "whatsapp" ? "WhatsApp" : "WeChat"} login session completed.`
          : sessionState.status === "awaiting-pairing"
            ? channelId === "whatsapp"
              ? "WhatsApp login is waiting for pairing approval."
              : "WeChat login is waiting for QR confirmation."
            : `${channelId === "whatsapp" ? "WhatsApp" : "WeChat"} login is running.`,
    detail:
      sessionState.logs.at(-1) ??
      (channelId === "whatsapp"
        ? "Scan the QR code or follow the WhatsApp login instructions shown by OpenClaw."
        : "Scan the QR code or follow the WeChat login instructions shown in the session log."),
    logs: session?.logs.slice(-20) ?? sessionState.logs.slice(-20)
  });
}
