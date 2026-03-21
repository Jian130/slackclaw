import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

import type {
  AbortChatRequest,
  ChatActionResponse,
  ChatComposerState,
  ChatMessage,
  ChatOverview,
  ChatStreamEvent,
  ChatThreadDetail,
  ChatThreadSummary,
  ChatThreadStatus,
  CreateChatThreadRequest,
  SendChatMessageRequest
} from "@slackclaw/contracts";

import type { EngineAdapter, EngineChatLiveEvent } from "../engine/adapter.js";
import { errorToLogDetails, writeErrorLog } from "./logger.js";
import type { StoredChatThreadState } from "./state-store.js";
import { StateStore } from "./state-store.js";
import { AITeamService } from "./ai-team-service.js";

interface ActiveChatRun {
  threadId: string;
  agentId: string;
  sessionKey: string;
  baselineMessageCount: number;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  assistantText: string;
  userMessageText: string;
  clientMessageId: string;
  status: ChatThreadStatus;
  activityLabel?: string;
  runId?: string;
  completed: boolean;
  sendSettled: boolean;
  receivedLiveEvent: boolean;
  pollTimer?: NodeJS.Timeout;
  fallbackTimer?: NodeJS.Timeout;
  pollInFlight?: boolean;
}

interface HistoryProgressState {
  assistantText: string;
  failed: boolean;
  failureMessage?: string;
  completed: boolean;
}

function normalizePreview(text: string | undefined, fallback = "New chat"): string {
  const trimmed = text?.replace(/\s+/g, " ").trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 72 ? `${trimmed.slice(0, 72).trimEnd()}...` : trimmed;
}

function defaultThreadTitle(memberName: string, createdAt: string): string {
  const label = new Date(createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${memberName} · ${label}`;
}

function buildThreadSessionKey(agentId: string, threadId: string): string {
  return `agent:${agentId}:slackclaw-chat:${threadId}`;
}

function createOptimisticUserMessage(threadId: string, clientMessageId: string, text: string, timestamp: string): ChatMessage {
  return {
    id: `${threadId}:user:${clientMessageId}`,
    role: "user",
    text,
    timestamp,
    clientMessageId,
    status: "pending"
  };
}

function createAssistantPlaceholder(threadId: string, timestamp: string): ChatMessage {
  return {
    id: `${threadId}:assistant:stream`,
    role: "assistant",
    text: "",
    timestamp,
    status: "pending",
    pending: true
  };
}

function createInterruptedAssistantMessage(threadId: string, text: string, timestamp: string, error?: string): ChatMessage {
  return {
    id: `${threadId}:assistant:interrupted:${Date.now()}`,
    role: "assistant",
    text,
    timestamp,
    status: "failed",
    interrupted: true,
    error
  };
}

function normalizeMessageText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class ChatService {
  private readonly subscribers = new Set<ServerResponse>();
  private readonly activeRuns = new Map<string, ActiveChatRun>();
  private readonly detailOverrides = new Map<string, ChatThreadDetail>();
  private liveBridgeReady = false;
  private liveBridgeConnected = false;
  private liveBridgeInitPromise?: Promise<boolean>;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly aiTeamService: AITeamService
  ) {}

  async getOverview(): Promise<ChatOverview> {
    return {
      threads: await this.listThreadSummaries()
    };
  }

  async createThread(request: CreateChatThreadRequest): Promise<ChatActionResponse> {
    const member = await this.resolveMember(request.memberId);
    if (!member?.agentId) {
      throw new Error("Choose an AI member with a real OpenClaw agent before starting chat.");
    }

    if (request.mode === "reuse-recent") {
      const recent = await this.findRecentThreadForMember(request.memberId, member.agentId);
      if (recent) {
        return {
          status: "completed",
          message: `Opened the most recent chat with ${member.name}.`,
          overview: await this.getOverview(),
          thread: await this.getThreadDetail(recent.id)
        };
      }
    }

    const createdAt = new Date().toISOString();
    const id = randomUUID();
    const thread: StoredChatThreadState = {
      id,
      memberId: member.id,
      agentId: member.agentId,
      sessionKey: buildThreadSessionKey(member.agentId, id),
      title: defaultThreadTitle(member.name, createdAt),
      createdAt,
      updatedAt: createdAt
    };

    await this.persistThread(thread);

    const detail = this.buildEmptyDetail(thread);
    this.broadcast({
      type: "thread-created",
      thread: this.toSummary(thread)
    });

    return {
      status: "completed",
      message: `Started a new chat with ${member.name}.`,
      overview: await this.getOverview(),
      thread: detail
    };
  }

  async getThreadDetail(threadId: string): Promise<ChatThreadDetail> {
    const thread = await this.getStoredThread(threadId);

    if (!thread) {
      throw new Error("Chat thread not found.");
    }

    try {
      const detail = await this.adapter.gateway.getChatThreadDetail({
        threadId: thread.id,
        agentId: thread.agentId,
        sessionKey: thread.sessionKey
      });

      return this.applyDetailOverride(
        this.withActiveRunState(
        {
          ...detail,
          id: thread.id,
          memberId: thread.memberId,
          agentId: thread.agentId,
          sessionKey: thread.sessionKey,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          lastPreview: thread.lastPreview,
          lastMessageAt: thread.updatedAt,
          unreadCount: 0,
          historyStatus: "ready",
          composerState: this.composerState(thread.id)
        },
        this.activeRuns.get(thread.id)
        )
      );
    } catch (error) {
      await writeErrorLog("SlackClaw could not load chat history from OpenClaw.", {
        threadId,
        sessionKey: thread.sessionKey,
        error: errorToLogDetails(error)
      });

      return this.applyDetailOverride(
        this.withActiveRunState(
        {
          ...this.buildEmptyDetail(thread),
          historyStatus: "unavailable",
          historyError: error instanceof Error ? error.message : "OpenClaw chat history is unavailable."
        },
        this.activeRuns.get(thread.id)
        )
      );
    }
  }

  async sendMessage(threadId: string, request: SendChatMessageRequest): Promise<ChatActionResponse> {
    const thread = await this.getStoredThread(threadId);
    if (!thread) {
      throw new Error("Chat thread not found.");
    }

    const message = request.message.trim();
    if (!message) {
      throw new Error("Message is required.");
    }

    if (this.activeRuns.has(threadId)) {
      throw new Error("Wait for the current reply to finish before sending another message.");
    }

    void this.ensureLiveBridge();

    const now = new Date().toISOString();
    const clientMessageId = request.clientMessageId ?? randomUUID();
    const initialDetail = await this.getThreadDetail(threadId);
    this.detailOverrides.delete(threadId);
    const nextTitle = thread.lastPreview ? thread.title : normalizePreview(message, thread.title);

    const userMessage = createOptimisticUserMessage(threadId, clientMessageId, message, now);
    const assistantMessage = createAssistantPlaceholder(threadId, now);
    const activeRun: ActiveChatRun = {
      threadId,
      agentId: thread.agentId,
      sessionKey: thread.sessionKey,
      baselineMessageCount: initialDetail.messages.length,
      userMessage,
      assistantMessage,
      assistantText: "",
      userMessageText: message,
      clientMessageId,
      status: "thinking",
      activityLabel: "Thinking…",
      completed: false,
      sendSettled: false,
      receivedLiveEvent: false
    };

    this.activeRuns.set(threadId, activeRun);
    await this.persistThread({
      ...thread,
      title: nextTitle,
      lastPreview: normalizePreview(message),
      updatedAt: now
    });

    this.broadcastThreadSummary(threadId);
    this.broadcast({
      type: "message-created",
      threadId,
      message: userMessage
    });
    this.broadcast({
      type: "run-started",
      threadId,
      message: assistantMessage,
      activityLabel: activeRun.activityLabel
    });
    this.broadcast({
      type: "assistant-thinking",
      threadId,
      activityLabel: activeRun.activityLabel
    });

    void this.runSendLoop(activeRun);

    return {
      status: "completed",
      message: `Sending a message to ${nextTitle}.`,
      overview: await this.getOverview(),
      thread: this.withActiveRunState(
        {
          ...initialDetail,
          title: nextTitle,
          updatedAt: now,
          lastPreview: normalizePreview(message),
          lastMessageAt: now,
          unreadCount: 0,
          composerState: this.composerState(threadId)
        },
        activeRun
      )
    };
  }

  async abortThread(threadId: string, _request: AbortChatRequest = {}): Promise<ChatActionResponse> {
    const thread = await this.getStoredThread(threadId);
    if (!thread) {
      throw new Error("Chat thread not found.");
    }

    const activeRun = this.activeRuns.get(threadId);
    if (!activeRun) {
      return {
        status: "completed",
        message: "There is no active chat reply to stop.",
        overview: await this.getOverview(),
        thread: await this.getThreadDetail(threadId)
      };
    }

    activeRun.status = "aborting";
    activeRun.activityLabel = "Stopping reply…";
    this.broadcastThreadSummary(threadId);

    try {
      await this.adapter.gateway.abortChatMessage({
        threadId,
        agentId: thread.agentId,
        sessionKey: thread.sessionKey
      });
    } catch (error) {
      await writeErrorLog("SlackClaw could not stop an in-flight OpenClaw chat reply.", {
        threadId,
        sessionKey: thread.sessionKey,
        error: errorToLogDetails(error)
      });
      throw error;
    }

    return {
      status: "completed",
      message: "Stopping the current reply.",
      overview: await this.getOverview(),
      thread: this.withActiveRunState(await this.getThreadDetail(threadId), activeRun)
    };
  }

  subscribe(response: ServerResponse): () => void {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    this.subscribers.add(response);
    void this.ensureLiveBridge();

    const keepAlive = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 20000);

    const cleanup = () => {
      clearInterval(keepAlive);
      this.subscribers.delete(response);
    };

    response.on("close", cleanup);
    response.on("error", cleanup);

    return cleanup;
  }

  private async ensureLiveBridge(): Promise<boolean> {
    if (this.liveBridgeReady) {
      return true;
    }

    if (this.liveBridgeInitPromise) {
      return this.liveBridgeInitPromise;
    }

    this.liveBridgeInitPromise = this.adapter.gateway
      .subscribeToLiveChatEvents((event) => {
        void this.handleLiveEvent(event);
      })
      .then(() => {
        this.liveBridgeReady = true;
        return true;
      })
      .catch(async (error) => {
        this.liveBridgeReady = false;
        await writeErrorLog("SlackClaw could not start the live OpenClaw chat event bridge.", {
          error: errorToLogDetails(error)
        });
        return false;
      })
      .finally(() => {
        this.liveBridgeInitPromise = undefined;
      });

    return this.liveBridgeInitPromise;
  }

  private async handleLiveEvent(event: EngineChatLiveEvent): Promise<void> {
    if (event.type === "connected") {
      this.liveBridgeConnected = true;
      return;
    }

    if (event.type === "disconnected") {
      this.liveBridgeConnected = false;

      for (const activeRun of this.activeRuns.values()) {
        if (activeRun.completed) {
          continue;
        }

        activeRun.activityLabel = "Reconnecting…";
        if (activeRun.status !== "streaming") {
          activeRun.status = "thinking";
        }
        this.broadcastThreadSummary(activeRun.threadId);
        this.broadcast({
          type: "assistant-thinking",
          threadId: activeRun.threadId,
          activityLabel: activeRun.activityLabel
        });
        this.startFallbackPolling(activeRun, 200);
      }

      return;
    }

    const activeRun = this.findActiveRunForEvent(event);
    if (!activeRun || activeRun.completed) {
      return;
    }

    activeRun.receivedLiveEvent = true;
    if (activeRun.fallbackTimer) {
      clearTimeout(activeRun.fallbackTimer);
      activeRun.fallbackTimer = undefined;
    }

    switch (event.type) {
      case "assistant-tool-status":
        activeRun.activityLabel = event.activityLabel;
        if (activeRun.status !== "streaming") {
          activeRun.status = "thinking";
        }
        this.broadcastThreadSummary(activeRun.threadId);
        this.broadcast({
          type: "assistant-tool-status",
          threadId: activeRun.threadId,
          activityLabel: event.activityLabel
        });
        return;
      case "assistant-delta":
        activeRun.runId = event.runId ?? activeRun.runId;
        activeRun.assistantText = event.message.text;
        activeRun.assistantMessage = {
          ...activeRun.assistantMessage,
          ...event.message,
          id: activeRun.assistantMessage.id,
          status: "streaming",
          pending: true
        };
        activeRun.status = "streaming";
        activeRun.activityLabel = "Responding…";
        if (activeRun.pollTimer) {
          clearInterval(activeRun.pollTimer);
          activeRun.pollTimer = undefined;
        }
        this.broadcastThreadSummary(activeRun.threadId);
        this.broadcast({
          type: "assistant-delta",
          threadId: activeRun.threadId,
          message: activeRun.assistantMessage,
          activityLabel: activeRun.activityLabel
        });
        return;
      case "assistant-completed":
        activeRun.runId = event.runId ?? activeRun.runId;
        await this.completeRunFromHistory(activeRun, "assistant-completed");
        return;
      case "assistant-aborted":
        activeRun.runId = event.runId ?? activeRun.runId;
        await this.completeAbortedRun(activeRun);
        return;
      case "assistant-failed":
        activeRun.runId = event.runId ?? activeRun.runId;
        await this.failRun(activeRun, event.error);
        return;
      default:
        return;
    }
  }

  private async runSendLoop(activeRun: ActiveChatRun): Promise<void> {
    this.startFallbackPolling(activeRun, 1200);

    try {
      const result = await this.adapter.gateway.sendChatMessage({
        threadId: activeRun.threadId,
        agentId: activeRun.agentId,
        sessionKey: activeRun.sessionKey,
        message: activeRun.userMessageText,
        clientMessageId: activeRun.clientMessageId
      });

      activeRun.sendSettled = true;
      activeRun.runId = result.runId ?? activeRun.runId;

      if (activeRun.completed) {
        return;
      }

      if (!this.liveBridgeConnected) {
        this.startFallbackPolling(activeRun, 0);
        return;
      }

      this.startFallbackPolling(activeRun, activeRun.receivedLiveEvent ? 900 : 0);
    } catch (error) {
      await writeErrorLog("SlackClaw could not complete an OpenClaw chat send.", {
        threadId: activeRun.threadId,
        sessionKey: activeRun.sessionKey,
        error: errorToLogDetails(error)
      });
      const recovered = await this.recoverRunFromHistory(
        activeRun,
        error instanceof Error ? error.message : "OpenClaw could not complete this reply."
      );

      if (!recovered) {
        await this.failRun(activeRun, error instanceof Error ? error.message : "OpenClaw could not complete this reply.");
      }
    }
  }

  private startFallbackPolling(activeRun: ActiveChatRun, delayMs: number): void {
    if (activeRun.completed || activeRun.pollTimer || activeRun.pollInFlight) {
      return;
    }

    if (activeRun.fallbackTimer) {
      clearTimeout(activeRun.fallbackTimer);
      activeRun.fallbackTimer = undefined;
    }

    activeRun.fallbackTimer = setTimeout(() => {
      activeRun.fallbackTimer = undefined;
      void this.pollRunHistory(activeRun);
    }, delayMs);
  }

  private async pollRunHistory(activeRun: ActiveChatRun): Promise<void> {
    if (activeRun.completed || activeRun.pollInFlight) {
      return;
    }

    activeRun.pollInFlight = true;
    try {
      const detail = await this.adapter.gateway.getChatThreadDetail({
        threadId: activeRun.threadId,
        agentId: activeRun.agentId,
        sessionKey: activeRun.sessionKey
      });
      const next = this.readHistoryProgress(detail.messages, activeRun.baselineMessageCount);
      const nextText = next.assistantText;

      if (nextText && nextText !== activeRun.assistantText) {
        activeRun.assistantText = nextText;
        activeRun.status = "streaming";
        activeRun.activityLabel = "Responding…";
        activeRun.assistantMessage = {
          ...activeRun.assistantMessage,
          text: nextText,
          status: "streaming",
          pending: true
        };
        this.broadcastThreadSummary(activeRun.threadId);
        this.broadcast({
          type: "assistant-delta",
          threadId: activeRun.threadId,
          message: activeRun.assistantMessage,
          activityLabel: activeRun.activityLabel
        });
      }

      if (next.failed) {
        await this.failRun(activeRun, next.failureMessage ?? "OpenClaw could not finish this reply.");
        return;
      }

      if (next.completed) {
        await this.completeRunFromHistory(activeRun, "assistant-completed");
      }
    } catch {
      // Keep polling until the send finishes or a live event arrives.
    } finally {
      activeRun.pollInFlight = false;
      activeRun.pollTimer = undefined;
      if (!activeRun.completed) {
        activeRun.pollTimer = setTimeout(() => {
          activeRun.pollTimer = undefined;
          void this.pollRunHistory(activeRun);
        }, 900);
      }
    }
  }

  private async completeRunFromHistory(
    activeRun: ActiveChatRun,
    eventType: Extract<ChatStreamEvent["type"], "assistant-completed">
  ): Promise<void> {
    if (activeRun.completed) {
      return;
    }

    const thread = await this.getStoredThread(activeRun.threadId);
    if (!thread) {
      this.finishRun(activeRun.threadId);
      return;
    }

    this.finishRun(activeRun.threadId);
    const detail = await this.getThreadDetail(activeRun.threadId);
    const lastAssistant = [...detail.messages].reverse().find((item) => item.role === "assistant")?.text;
    const updatedThread = await this.persistThreadPreview(
      activeRun.threadId,
      normalizePreview(lastAssistant, normalizePreview(activeRun.userMessageText))
    );
    const refreshedDetail = {
      ...detail,
      updatedAt: updatedThread.updatedAt,
      lastPreview: updatedThread.lastPreview,
      lastMessageAt: updatedThread.updatedAt
    };
    this.detailOverrides.delete(activeRun.threadId);

    this.broadcast({
      type: "thread-updated",
      thread: updatedThread
    });
    this.broadcast({
      type: eventType,
      threadId: activeRun.threadId,
      detail: refreshedDetail
    });
  }

  private async completeAbortedRun(activeRun: ActiveChatRun): Promise<void> {
    if (activeRun.completed) {
      return;
    }

    this.finishRun(activeRun.threadId);
    const detail = await this.getThreadDetail(activeRun.threadId);
    const interruptedText = activeRun.assistantText || "Reply stopped before it was finished.";
    const nextPreview = normalizePreview(interruptedText, normalizePreview(activeRun.userMessageText));
    const updatedThread = await this.persistThreadPreview(activeRun.threadId, nextPreview);
    const interruptedDetail = this.ensureInterruptedAssistantMessage(
      {
        ...detail,
        updatedAt: updatedThread.updatedAt,
        lastPreview: updatedThread.lastPreview,
        lastMessageAt: updatedThread.updatedAt
      },
      interruptedText,
      "Reply stopped before it was finished."
    );
    this.detailOverrides.set(activeRun.threadId, interruptedDetail);

    this.broadcast({
      type: "thread-updated",
      thread: updatedThread
    });
    this.broadcast({
      type: "assistant-aborted",
      threadId: activeRun.threadId,
      detail: interruptedDetail,
      activityLabel: "Reply stopped"
    });
  }

  private async failRun(activeRun: ActiveChatRun, error: string): Promise<void> {
    if (activeRun.completed) {
      return;
    }

    this.finishRun(activeRun.threadId);
    const detail = await this.getThreadDetail(activeRun.threadId);
    const nextPreview = normalizePreview(activeRun.assistantText, normalizePreview(activeRun.userMessageText));
    const updatedThread = await this.persistThreadPreview(activeRun.threadId, nextPreview);
    const failedDetail = this.ensureInterruptedAssistantMessage(
      {
        ...detail,
        updatedAt: updatedThread.updatedAt,
        lastPreview: updatedThread.lastPreview,
        lastMessageAt: updatedThread.updatedAt,
        composerState: {
          status: "error",
          canSend: true,
          canAbort: false,
          error,
          activityLabel: "Could not finish reply"
        }
      },
      activeRun.assistantText || error,
      error
    );
    this.detailOverrides.set(activeRun.threadId, failedDetail);

    this.broadcast({
      type: "thread-updated",
      thread: {
        ...updatedThread,
        composerState: failedDetail.composerState,
        activeRunState: "error"
      }
    });
    this.broadcast({
      type: "assistant-failed",
      threadId: activeRun.threadId,
      error,
      detail: failedDetail,
      activityLabel: "Could not finish reply"
    });
  }

  private finishRun(threadId: string): void {
    const activeRun = this.activeRuns.get(threadId);
    if (!activeRun) {
      return;
    }

    activeRun.completed = true;
    if (activeRun.pollTimer) {
      clearTimeout(activeRun.pollTimer);
    }
    if (activeRun.fallbackTimer) {
      clearTimeout(activeRun.fallbackTimer);
    }
    this.activeRuns.delete(threadId);
  }

  private ensureInterruptedAssistantMessage(detail: ChatThreadDetail, text: string, error?: string): ChatThreadDetail {
    const hasInterruptedMessage = detail.messages.some(
      (message) => message.role === "assistant" && (message.interrupted || message.error === error || message.text === text)
    );

    if (hasInterruptedMessage) {
      return detail;
    }

    return {
      ...detail,
      messages: [...detail.messages, createInterruptedAssistantMessage(detail.id, text, new Date().toISOString(), error)]
    };
  }

  private findActiveRunForEvent(event: Exclude<EngineChatLiveEvent, { type: "connected" } | { type: "disconnected"; error?: string }>): ActiveChatRun | undefined {
    for (const activeRun of this.activeRuns.values()) {
      if ("sessionKey" in event && event.sessionKey === activeRun.sessionKey) {
        return activeRun;
      }

      if (event.runId && event.runId === activeRun.runId) {
        return activeRun;
      }
    }

    return undefined;
  }

  private readHistoryProgress(messages: ChatMessage[], baselineMessageCount: number): HistoryProgressState {
    const assistantMessages = messages
      .slice(baselineMessageCount)
      .filter((message) => message.role === "assistant");
    const failedAssistant = [...assistantMessages]
      .reverse()
      .find((message) => message.status === "failed" || Boolean(message.error));
    const assistantText = assistantMessages
      .map((message) => message.text)
      .join("\n\n")
      .trim();

    if (failedAssistant) {
      return {
        assistantText: failedAssistant.text?.trim() || assistantText,
        failed: true,
        failureMessage: failedAssistant.error || failedAssistant.text || "OpenClaw could not finish this reply.",
        completed: false
      };
    }

    return {
      assistantText,
      failed: false,
      completed: assistantText.length > 0
    };
  }

  private async recoverRunFromHistory(activeRun: ActiveChatRun, fallbackError: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const detail = await this.adapter.gateway.getChatThreadDetail({
          threadId: activeRun.threadId,
          agentId: activeRun.agentId,
          sessionKey: activeRun.sessionKey
        });
        const progress = this.readHistoryProgress(detail.messages, activeRun.baselineMessageCount);

        if (progress.failed) {
          await this.failRun(activeRun, progress.failureMessage ?? fallbackError);
          return true;
        }

        if (progress.completed) {
          activeRun.assistantText = progress.assistantText;
          await this.completeRunFromHistory(activeRun, "assistant-completed");
          return true;
        }
      } catch {
        // Keep retrying a few times before surfacing the original send error.
      }

      if (attempt < 2) {
        await wait(350);
      }
    }

    return false;
  }

  private withActiveRunState(detail: ChatThreadDetail, activeRun: ActiveChatRun | undefined): ChatThreadDetail {
    if (!activeRun) {
      return detail;
    }

    const messages = [...detail.messages];
    const matchingUserIndex = this.findMatchingHistoryUserMessageIndex(messages, activeRun);
    if (matchingUserIndex >= 0) {
      const matchedUserMessage = messages[matchingUserIndex];
      messages[matchingUserIndex] = {
        ...matchedUserMessage,
        clientMessageId: matchedUserMessage.clientMessageId ?? activeRun.clientMessageId,
        status: matchedUserMessage.status === "pending" ? "sent" : matchedUserMessage.status ?? "sent",
        pending: false
      };
    } else if (!messages.some((message) => message.id === activeRun.userMessage.id)) {
      messages.push(activeRun.userMessage);
    }

    const assistantIndex = messages.findIndex((message) => message.id === activeRun.assistantMessage.id);
    if (assistantIndex >= 0) {
      messages[assistantIndex] = activeRun.assistantMessage;
    } else {
      messages.push(activeRun.assistantMessage);
    }

    return {
      ...detail,
      messages,
      composerState: this.composerState(detail.id)
    };
  }

  private findMatchingHistoryUserMessageIndex(messages: ChatMessage[], activeRun: ActiveChatRun): number {
    const expectedText = normalizeMessageText(activeRun.userMessageText);
    const baselineIndex = Math.min(activeRun.baselineMessageCount, messages.length);

    for (let index = messages.length - 1; index >= baselineIndex; index -= 1) {
      const message = messages[index];
      if (message.role !== "user") {
        continue;
      }

      if (message.clientMessageId && message.clientMessageId === activeRun.clientMessageId) {
        return index;
      }

      if (normalizeMessageText(message.text) === expectedText) {
        return index;
      }
    }

    return -1;
  }

  private applyDetailOverride(detail: ChatThreadDetail): ChatThreadDetail {
    const override = this.detailOverrides.get(detail.id);
    if (!override) {
      return detail;
    }

    return override.messages.length >= detail.messages.length
      ? {
          ...detail,
          ...override,
          composerState: override.composerState
        }
      : detail;
  }

  private async findRecentThreadForMember(memberId: string, agentId: string): Promise<StoredChatThreadState | undefined> {
    const threads = Object.values((await this.store.read()).chat?.threads ?? {});
    const expectedPrefix = `agent:${agentId}:slackclaw-chat:`;
    return threads
      .filter((thread) => thread.memberId === memberId && thread.agentId === agentId && thread.sessionKey.startsWith(expectedPrefix))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  private async resolveMember(memberId: string) {
    const overview = await this.aiTeamService.getOverview();
    const live = overview.members.find((member) => member.id === memberId);
    if (live?.agentId) {
      return live;
    }

    const stored = (await this.store.read()).aiTeam?.members?.[memberId];
    if (stored?.agentId) {
      return stored;
    }

    return live;
  }

  private async getStoredThread(threadId: string): Promise<StoredChatThreadState | undefined> {
    for (const attempt of [0, 1, 2]) {
      const thread = (await this.store.read()).chat?.threads?.[threadId];
      if (thread) {
        return thread;
      }

      if (attempt < 2) {
        await wait(15);
      }
    }

    return undefined;
  }

  private async listThreadSummaries(): Promise<ChatThreadSummary[]> {
    const state = await this.store.read();
    const threads = Object.values(state.chat?.threads ?? {})
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return threads.map((thread) => this.toSummary(thread));
  }

  private async persistThread(thread: StoredChatThreadState): Promise<void> {
    await this.store.update((state) => ({
      ...state,
      chat: {
        threads: {
          ...(state.chat?.threads ?? {}),
          [thread.id]: thread
        }
      }
    }));
  }

  private async persistThreadPreview(threadId: string, lastPreview: string): Promise<ChatThreadSummary> {
    let nextThread: StoredChatThreadState | undefined;
    await this.store.update((state) => {
      const currentThread = state.chat?.threads?.[threadId];
      if (!currentThread) {
        return state;
      }

      nextThread = {
        ...currentThread,
        lastPreview,
        updatedAt: new Date().toISOString()
      };

      return {
        ...state,
        chat: {
          threads: {
            ...(state.chat?.threads ?? {}),
            [threadId]: nextThread
          }
        }
      };
    });

    if (!nextThread) {
      throw new Error("Chat thread not found.");
    }

    return this.toSummary(nextThread);
  }

  private buildEmptyDetail(thread: StoredChatThreadState): ChatThreadDetail {
    return {
      ...this.toSummary(thread),
      messages: []
    };
  }

  private toSummary(thread: StoredChatThreadState): ChatThreadSummary {
    const composerState = this.composerState(thread.id);
    return {
      id: thread.id,
      memberId: thread.memberId,
      agentId: thread.agentId,
      sessionKey: thread.sessionKey,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastPreview: thread.lastPreview,
      lastMessageAt: thread.updatedAt,
      unreadCount: 0,
      activeRunState: composerState.status === "idle" ? undefined : composerState.status,
      historyStatus: "ready",
      composerState
    };
  }

  private composerState(threadId: string): ChatComposerState {
    const active = this.activeRuns.get(threadId);
    if (!active) {
      return {
        status: "idle",
        canSend: true,
        canAbort: false
      };
    }

    return {
      status: active.status,
      canSend: false,
      canAbort: active.status !== "error",
      activityLabel: active.activityLabel
    };
  }

  private async broadcastThreadSummary(threadId: string): Promise<void> {
    const thread = await this.getStoredThread(threadId);
    if (!thread) {
      return;
    }

    this.broadcast({
      type: "thread-updated",
      thread: this.toSummary(thread)
    });
  }

  private broadcast(event: ChatStreamEvent | { type: "connected" }): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of this.subscribers) {
      subscriber.write(payload);
    }
  }
}
