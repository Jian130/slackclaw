import { randomUUID } from "node:crypto";

import type {
  AbortChatRequest,
  ChatMessage,
  ChatThreadDetail,
  SendChatMessageRequest
} from "@slackclaw/contracts";

import type { CommandResult } from "../platform/cli-runner.js";
import { readGatewayChatText } from "../platform/openclaw-gateway-socket-adapter.js";
import type { EngineChatLiveEvent } from "./adapter.js";

interface OpenClawChatHistoryJson {
  sessionKey?: string;
  sessionId?: string;
  messages?: OpenClawChatMessageJson[];
}

interface OpenClawChatMessageJson {
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
    thinking?: string;
  }>;
  timestamp?: number;
  provider?: string;
  model?: string;
  error?: string;
  errorMessage?: string;
  stopReason?: string;
}

type OpenClawChatAccess = {
  runGatewayCall: <T>(
    method: string,
    params: Record<string, unknown>,
    options?: { allowFailure?: boolean; timeoutMs?: number }
  ) => Promise<{ result: CommandResult; payload?: T }>;
  subscribeToLiveChatEvents: (listener: (event: EngineChatLiveEvent) => void) => Promise<() => void>;
};

function readChatText(message: OpenClawChatMessageJson): string {
  return readGatewayChatText(message);
}

function toVisibleChatRole(role: string | undefined): ChatMessage["role"] | undefined {
  if (role === "user" || role === "assistant") {
    return role;
  }

  return undefined;
}

function toChatMessageId(message: OpenClawChatMessageJson, index: number): string {
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : index;
  return `${message.role ?? "message"}-${timestamp}-${index}`;
}

function toChatMessage(message: OpenClawChatMessageJson, index: number): ChatMessage | undefined {
  const role = toVisibleChatRole(message.role);
  if (!role) {
    return undefined;
  }

  const error = (message.error ?? message.errorMessage)?.trim();
  const text = readChatText(message) || (error && message.role === "assistant" ? error : "");
  if (!text) {
    return undefined;
  }

  return {
    id: toChatMessageId(message, index),
    role,
    text,
    timestamp: typeof message.timestamp === "number" ? new Date(message.timestamp).toISOString() : undefined,
    provider: message.provider?.trim() || undefined,
    model: message.model?.trim() || undefined,
    status: error || message.stopReason === "error" ? "failed" : "sent",
    error: error || undefined
  };
}

function collapseVisibleChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.reduce<ChatMessage[]>((collapsed, message) => {
    const previous = collapsed[collapsed.length - 1];
    if (!previous || previous.role !== "assistant" || message.role !== "assistant") {
      collapsed.push(message);
      return collapsed;
    }

    const previousText = previous.text.trim();
    const nextText = message.text.trim();
    const mergedText =
      previousText && nextText && previousText !== nextText
        ? `${previous.text}\n\n${message.text}`
        : previousText
          ? previous.text
          : message.text;

    collapsed[collapsed.length - 1] = {
      ...previous,
      ...message,
      id: previous.id,
      text: mergedText
    };
    return collapsed;
  }, []);
}

export class OpenClawChatService {
  constructor(private readonly access: OpenClawChatAccess) {}

  async getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }): Promise<ChatThreadDetail> {
    const { result, payload } = await this.access.runGatewayCall<OpenClawChatHistoryJson>(
      "chat.history",
      {
        sessionKey: request.sessionKey,
        limit: 200
      },
      { allowFailure: true, timeoutMs: 20000 }
    );

    if (result.code !== 0 || !payload) {
      throw new Error(result.stderr || result.stdout || "SlackClaw could not load chat history from OpenClaw.");
    }

    return {
      id: request.threadId,
      memberId: "",
      agentId: request.agentId,
      sessionKey: request.sessionKey,
      title: "",
      createdAt: "",
      updatedAt: "",
      unreadCount: 0,
      historyStatus: "ready",
      composerState: {
        status: "idle",
        canSend: true,
        canAbort: false
      },
      messages: collapseVisibleChatMessages(
        (payload.messages ?? []).flatMap((message, index) => {
          const mapped = toChatMessage(message, index);
          return mapped ? [mapped] : [];
        })
      )
    };
  }

  subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void) {
    return this.access.subscribeToLiveChatEvents(listener);
  }

  async sendChatMessage(
    request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }
  ): Promise<{ runId?: string }> {
    const { result, payload } = await this.access.runGatewayCall<{ runId?: string }>(
      "chat.send",
      {
        sessionKey: request.sessionKey,
        message: request.message,
        idempotencyKey: request.clientMessageId ?? randomUUID()
      },
      {
        allowFailure: true,
        timeoutMs: 30000
      }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not send the message for ${request.threadId}.`);
    }

    return {
      runId: payload?.runId
    };
  }

  async abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }): Promise<void> {
    const { result } = await this.access.runGatewayCall(
      "chat.abort",
      {
        sessionKey: request.sessionKey
      },
      {
        allowFailure: true,
        timeoutMs: 15000
      }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not stop the active reply for ${request.threadId}.`);
    }
  }
}
