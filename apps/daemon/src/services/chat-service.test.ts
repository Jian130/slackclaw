import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { ChatStreamEvent } from "@slackclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { AITeamService } from "./ai-team-service.js";
import { ChatService } from "./chat-service.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { StateStore } from "./state-store.js";

async function createServices(testName: string, options?: { withEvents?: boolean }) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const aiTeamService = new AITeamService(adapter, store);
  const eventBus = options?.withEvents ? new EventBusService() : undefined;
  const chatService = new ChatService(adapter, store, aiTeamService, eventBus ? new EventPublisher(eventBus) : undefined);

  const created = await aiTeamService.saveMember(undefined, {
    name: "Alex Morgan",
    jobTitle: "Research Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Analytical",
    soul: "Keep work clear and grounded.",
    workStyles: ["Methodical"],
    skillIds: ["research-brief"],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });
  await adapter.gateway.startGatewayAfterChannels();

  return {
    adapter,
    store,
    aiTeamService,
    chatService,
    eventBus,
    member: created.overview.members[0]
  };
}

test("chat service creates and reuses member chat threads", async () => {
  const { chatService, member, store } = await createServices("chat-service-create");

  const created = await chatService.createThread({
    memberId: member.id,
    mode: "new"
  });
  const reused = await chatService.createThread({
    memberId: member.id,
    mode: "reuse-recent"
  });
  const state = await store.read();

  assert.equal(created.thread?.memberId, member.id);
  assert.equal(created.thread?.agentId, member.agentId);
  assert.equal(created.thread?.sessionKey.startsWith(`agent:${member.agentId}:slackclaw-chat:`), true);
  assert.equal(reused.thread?.id, created.thread?.id);
  assert.equal(Object.keys(state.chat?.threads ?? {}).length, 1);
});

test("chat service only reuses recent threads when they still match the member's current agent session", async () => {
  const { chatService, member, store } = await createServices("chat-service-reuse-current-agent");

  const created = await chatService.createThread({
    memberId: member.id,
    mode: "new"
  });

  await store.update((state) => ({
    ...state,
    chat: {
      threads: {
        ...(state.chat?.threads ?? {}),
        [created.thread!.id]: {
          ...(state.chat?.threads ?? {})[created.thread!.id],
          agentId: "stale-agent",
          sessionKey: `agent:stale-agent:slackclaw-chat:${created.thread!.id}`
        }
      }
    }
  }));

  const reused = await chatService.createThread({
    memberId: member.id,
    mode: "reuse-recent"
  });
  const state = await store.read();

  assert.notEqual(reused.thread?.id, created.thread?.id);
  assert.equal(reused.thread?.agentId, member.agentId);
  assert.equal(reused.thread?.sessionKey.startsWith(`agent:${member.agentId}:slackclaw-chat:`), true);
  assert.equal(Object.keys(state.chat?.threads ?? {}).length, 2);
});

test("chat service prefers the live AI member mapping over stale stored agent ids", async () => {
  const { chatService, member, aiTeamService, store } = await createServices("chat-service-live-member-resolution");

  await store.update((state) => ({
    ...state,
    aiTeam: state.aiTeam
      ? {
          ...state.aiTeam,
          members: {
            ...state.aiTeam.members,
            [member.id]: {
              ...state.aiTeam.members[member.id],
              agentId: "stale-agent"
            }
          }
        }
      : state.aiTeam
  }));

  aiTeamService.getOverview = (async () => ({
    teamVision: "Test team",
    members: [
      {
        ...member,
        agentId: "live-agent"
      }
    ],
    teams: [],
    activity: [],
    availableBrains: [],
    memberPresets: [],
    knowledgePacks: [],
    skillOptions: []
  })) as typeof aiTeamService.getOverview;

  const created = await chatService.createThread({
    memberId: member.id,
    mode: "new"
  });

  assert.equal(created.thread?.agentId, "live-agent");
  assert.equal(created.thread?.sessionKey.startsWith("agent:live-agent:slackclaw-chat:"), true);
});

test("chat service sends messages and keeps thread histories isolated", async () => {
  const { chatService, member } = await createServices("chat-service-send");

  const firstThread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  const secondThread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;

  const firstSend = await chatService.sendMessage(firstThread.id, { message: "Summarize today's work.", clientMessageId: "client-1" });
  assert.equal(firstSend.thread?.composerState.status, "thinking");
  await delay(40);
  await chatService.sendMessage(secondThread.id, { message: "Draft tomorrow's plan.", clientMessageId: "client-2" });
  await delay(40);

  const firstDetail = await chatService.getThreadDetail(firstThread.id);
  const secondDetail = await chatService.getThreadDetail(secondThread.id);
  const overview = await chatService.getOverview();

  assert.equal(firstDetail.messages.some((message) => message.text.includes("Summarize today's work.")), true);
  assert.equal(firstDetail.messages.some((message) => message.text.includes("Draft tomorrow's plan.")), false);
  assert.equal(firstDetail.messages.some((message) => message.clientMessageId === "client-1"), true);
  assert.equal(secondDetail.messages.some((message) => message.text.includes("Draft tomorrow's plan.")), true);
  assert.equal(overview.threads.length, 2);
});

test("chat service reuses the already-loaded thread detail when sending from an open chat", async () => {
  const { chatService, member, adapter } = await createServices("chat-service-send-reuses-cached-detail");

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  const baseGetChatThreadDetail = adapter.getChatThreadDetail.bind(adapter);
  let historyReads = 0;

  adapter.getChatThreadDetail = (async (request) => {
    historyReads += 1;
    return baseGetChatThreadDetail(request);
  }) as typeof adapter.getChatThreadDetail;
  adapter.sendChatMessage = (async () => {
    await delay(250);
    return { runId: "mock-run-cache" };
  }) as typeof adapter.sendChatMessage;

  await chatService.getThreadDetail(thread.id);
  assert.equal(historyReads, 1);

  await chatService.sendMessage(thread.id, { message: "Hello from the cached thread.", clientMessageId: "client-cache" });

  assert.equal(historyReads, 1);
  await chatService.abortThread(thread.id);
});

test("chat service rejects sends immediately when the gateway is not ready", async () => {
  class PendingGatewayAdapter extends MockAdapter {
    override async status() {
      const current = await super.status();
      return {
        ...current,
        running: false,
        pendingGatewayApply: true,
        pendingGatewayApplySummary: "OpenClaw setup is saved but the gateway is not running yet.",
        summary: "OpenClaw gateway is not reachable yet."
      };
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/chat-service-pending-gateway-${randomUUID()}.json`);
  const adapter = new PendingGatewayAdapter();
  const store = new StateStore(filePath);
  const aiTeamService = new AITeamService(adapter, store);
  const created = await aiTeamService.saveMember(undefined, {
    name: "Alex Morgan",
    jobTitle: "Research Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Analytical",
    soul: "Keep work clear and grounded.",
    workStyles: ["Methodical"],
    skillIds: ["research-brief"],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });
  const guardedChatService = new ChatService(adapter, store, aiTeamService);
  const guardedThread = (await guardedChatService.createThread({ memberId: created.overview.members[0].id, mode: "new" })).thread!;

  await assert.rejects(
    () => guardedChatService.sendMessage(guardedThread.id, { message: "Hello", clientMessageId: "client-pending" }),
    /gateway is not running yet|not reachable yet|ready to apply/i
  );
});

test("chat service mirrors chat stream updates onto the daemon event bus", async () => {
  const { chatService, member, eventBus } = await createServices("chat-service-daemon-events", { withEvents: true });
  const eventTypes: string[] = [];
  const payloadTypes: string[] = [];
  const toolPayloads: Array<Extract<ChatStreamEvent, { type: "assistant-tool-status" }>> = [];
  const unsubscribe = eventBus!.subscribe((event) => {
    eventTypes.push(event.type);
    if (event.type === "chat.stream") {
      payloadTypes.push(event.payload.type);
      if (event.payload.type === "assistant-tool-status") {
        toolPayloads.push(event.payload);
      }
    }
  });
  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;

  await chatService.sendMessage(thread.id, { message: "Summarize today's work.", clientMessageId: "client-event" });
  await delay(160);
  unsubscribe();

  assert.equal(eventTypes.includes("chat.stream"), true);
  assert.equal(payloadTypes.includes("thread-created"), true);
  assert.equal(payloadTypes.includes("message-created"), true);
  assert.equal(payloadTypes.includes("assistant-tool-status"), true);
  assert.equal(payloadTypes.includes("assistant-completed"), true);
  assert.equal(toolPayloads[0]?.sessionKey, thread.sessionKey);
  assert.equal(toolPayloads[0]?.toolActivity.label, "mock-search");
});

test("chat service publishes connection-state and history-loaded resync events on reconnect", async () => {
  const { adapter, chatService, member, eventBus } = await createServices("chat-service-reconnect-resync", { withEvents: true });
  const payloadTypes: string[] = [];
  const connectionStates: string[] = [];
  const listeners = (adapter as unknown as {
    chatListeners: Set<(event: import("../engine/adapter.js").EngineChatLiveEvent) => void>;
  }).chatListeners;

  eventBus!.subscribe((event) => {
    if (event.type !== "chat.stream") {
      return;
    }

    payloadTypes.push(event.payload.type);
    if (event.payload.type === "connection-state") {
      connectionStates.push(event.payload.state);
    }
  });

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  await chatService.sendMessage(thread.id, { message: "Summarize today's work.", clientMessageId: "client-reconnect" });

  for (const listener of listeners) {
    listener({ type: "disconnected", error: "Socket dropped." });
    listener({ type: "connected" });
  }

  await delay(50);

  assert.equal(connectionStates.includes("reconnecting"), true);
  assert.equal(connectionStates.includes("connected"), true);
  assert.equal(payloadTypes.includes("history-loaded"), true);
});

test("chat service abort returns the current thread detail when nothing is running", async () => {
  const { chatService, member } = await createServices("chat-service-abort");

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  const aborted = await chatService.abortThread(thread.id);

  assert.equal(aborted.status, "completed");
  assert.match(aborted.message, /no active chat reply/i);
  assert.equal(aborted.thread?.id, thread.id);
});

test("chat service marks an aborted run with partial assistant output", async () => {
  const { chatService, member } = await createServices("chat-service-aborted-run");

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  await chatService.sendMessage(thread.id, { message: "Start a long reply.", clientMessageId: "client-abort" });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const detail = await chatService.getThreadDetail(thread.id);
    if (detail.messages.some((message) => message.status === "streaming")) {
      break;
    }

    await delay(5);
  }

  await chatService.abortThread(thread.id);
  await delay(20);

  const detail = await chatService.getThreadDetail(thread.id);

  assert.equal(detail.messages.some((message) => message.interrupted === true), true);
  assert.equal(detail.composerState.canSend, true);
});

test("chat service recovers a failed send from OpenClaw history instead of thinking forever", async () => {
  const { chatService, member, adapter } = await createServices("chat-service-send-recovery");

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  const historyMessages = [
    {
      id: "user-final",
      role: "user" as const,
      text: "Check the latest chat state.",
      status: "sent" as const
    },
    {
      id: "assistant-final",
      role: "assistant" as const,
      text: "HTTP 401 authentication_error: invalid x-api-key",
      status: "failed" as const,
      error: "HTTP 401 authentication_error: invalid x-api-key"
    }
  ];

  adapter.sendChatMessage = (async () => {
    throw new Error("gateway closed");
  }) as typeof adapter.sendChatMessage;
  let historyReads = 0;
  adapter.getChatThreadDetail = (async (request) => ({
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
    messages: historyReads++ === 0 ? [] : historyMessages
  })) as typeof adapter.getChatThreadDetail;

  await chatService.sendMessage(thread.id, { message: "Check the latest chat state.", clientMessageId: "client-error" });
  await delay(1200);

  const detail = await chatService.getThreadDetail(thread.id);

  assert.equal(detail.composerState.status, "error");
  assert.match(detail.composerState.error ?? "", /invalid x-api-key/i);
  assert.equal(detail.messages.some((message) => message.status === "failed"), true);
});

test("chat service does not duplicate the active user message when history already contains it without a client message id", async () => {
  const { chatService, member, adapter } = await createServices("chat-service-history-user-dedupe");

  const thread = (await chatService.createThread({ memberId: member.id, mode: "new" })).thread!;
  const messageText = "what's your name";

  adapter.sendChatMessage = (async () => {
    await delay(250);
    return { runId: "run-dedupe" };
  }) as typeof adapter.sendChatMessage;
  let historyReads = 0;
  const historyUserMessage = {
    id: "history-user-1",
    role: "user" as const,
    text: messageText,
    timestamp: new Date().toISOString(),
    status: "sent" as const
  };
  const historyAssistantMessage = {
    id: "history-assistant-1",
    role: "assistant" as const,
    text: "Maggie.",
    timestamp: new Date().toISOString(),
    status: "sent" as const
  };
  adapter.getChatThreadDetail = (async (request) => ({
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
    messages:
      historyReads++ === 0
        ? []
        : historyReads === 2
          ? [historyUserMessage]
          : [historyUserMessage, historyAssistantMessage]
  })) as typeof adapter.getChatThreadDetail;

  await chatService.sendMessage(thread.id, { message: messageText, clientMessageId: "client-dedupe" });

  const detail = await chatService.getThreadDetail(thread.id);
  const userMessages = detail.messages.filter((message) => message.role === "user");

  assert.equal(userMessages.length, 1);
  assert.equal(userMessages[0]?.id, "history-user-1");
  assert.equal(userMessages[0]?.clientMessageId, "client-dedupe");
  assert.equal(userMessages[0]?.status, "sent");
  assert.equal(detail.messages.some((message) => message.id === `${thread.id}:assistant:stream`), true);

  await delay(1400);

  const settledDetail = await chatService.getThreadDetail(thread.id);
  assert.equal(settledDetail.composerState.status, "idle");
  assert.equal(settledDetail.messages.some((message) => message.id === "history-assistant-1"), true);
});
