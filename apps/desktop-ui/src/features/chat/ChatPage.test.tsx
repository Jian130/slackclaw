import { describe, expect, it } from "vitest";
import type { AIMemberDetail, ChatThreadDetail, ChatThreadSummary, SlackClawEvent } from "@slackclaw/contracts";

import {
  applyChatEventToDetail,
  canSendComposerDraft,
  chatStreamEventFromDaemonEvent,
  inlineToolActivitiesForMessage,
  memberNameForThread,
  preferredNewChatMemberId,
  shouldSubmitComposerShortcut,
  sortChatThreads
} from "./ChatPage.js";

const members: AIMemberDetail[] = [
  {
    id: "member-1",
    agentId: "agent-1",
    source: "slackclaw",
    hasManagedMetadata: true,
    name: "Alex Morgan",
    jobTitle: "Research Lead",
    status: "ready",
    currentStatus: "Ready",
    activeTaskCount: 0,
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊"
    },
    teamIds: [],
    bindingCount: 0,
    bindings: [],
    lastUpdatedAt: "2026-03-14T01:00:00.000Z",
    personality: "",
    soul: "",
    workStyles: [],
    skillIds: [],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  }
];

const summary = (id: string, updatedAt: string): ChatThreadSummary => ({
  id,
  memberId: "member-1",
  agentId: "agent-1",
  sessionKey: `agent:agent-1:slackclaw-chat:${id}`,
  title: `Thread ${id}`,
  createdAt: "2026-03-14T00:00:00.000Z",
  updatedAt,
  lastMessageAt: updatedAt,
  unreadCount: 0,
  historyStatus: "ready",
  composerState: {
    status: "idle",
    canSend: true,
    canAbort: false
  }
});

function detail(): ChatThreadDetail {
  return {
    ...summary("thread-1", "2026-03-14T01:00:00.000Z"),
    messages: [
      {
        id: "user-1",
        role: "user",
        text: "Draft the weekly update."
      }
    ]
  };
}

describe("ChatPage helpers", () => {
  it("sorts chat threads with the most recently updated first", () => {
    const ordered = sortChatThreads([
      summary("older", "2026-03-14T00:00:00.000Z"),
      summary("newer", "2026-03-14T02:00:00.000Z")
    ]);

    expect(ordered.map((thread) => thread.id)).toEqual(["newer", "older"]);
  });

  it("resolves a friendly member name for thread cards", () => {
    expect(memberNameForThread(summary("thread-1", "2026-03-14T01:00:00.000Z"), members)).toBe("Alex Morgan");
  });

  it("prefers the left-side member selection when starting a new chat", () => {
    expect(preferredNewChatMemberId("member-1", members, "member-2")).toBe("member-1");
  });

  it("falls back to the selected thread member when all members are shown", () => {
    expect(preferredNewChatMemberId("all", members, "member-1")).toBe("member-1");
  });

  it("returns no preferred member when there is no concrete member context", () => {
    expect(preferredNewChatMemberId("all", members)).toBeUndefined();
  });

  it("applies assistant delta and completion events to the active detail", () => {
    const started = applyChatEventToDetail(detail(), {
      type: "run-started",
      threadId: "thread-1",
      message: {
        id: "thread-1:assistant:stream",
        role: "assistant",
        text: "",
        pending: true
      },
      activityLabel: "Thinking…"
    });

    expect(started?.composerState.status).toBe("thinking");

    const streaming = applyChatEventToDetail(started, {
      type: "assistant-delta",
      threadId: "thread-1",
      message: {
        id: "thread-1:assistant:stream",
        role: "assistant",
        text: "Working on it...",
        status: "streaming"
      },
      activityLabel: "Responding…"
    });

    expect(streaming?.messages.at(-1)?.text).toBe("Working on it...");
    expect(streaming?.composerState.status).toBe("streaming");

    const withToolProgress = applyChatEventToDetail(streaming, {
      type: "assistant-tool-status",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:slackclaw-chat:thread-1",
      activityLabel: "Gathering sources…",
      toolActivity: {
        id: "tool-1",
        label: "Search knowledge base",
        status: "running"
      }
    });

    expect(withToolProgress?.composerState.bridgeState).toBeUndefined();
    expect(withToolProgress?.composerState.toolActivities?.at(0)?.label).toBe("Search knowledge base");

    const connected = applyChatEventToDetail(withToolProgress, {
      type: "connection-state",
      threadId: "thread-1",
      state: "reconnecting",
      detail: "Bridge reconnecting"
    });

    expect(connected?.composerState.bridgeState).toBe("reconnecting");

    const completed = applyChatEventToDetail(detail(), {
      type: "assistant-completed",
      threadId: "thread-1",
      detail: {
        ...detail(),
        composerState: {
          status: "idle",
          canSend: true,
          canAbort: false
        },
        messages: [
          ...detail().messages,
          {
            id: "assistant-final",
            role: "assistant",
            text: "Here is the completed draft."
          }
        ]
      }
    });

    expect(completed?.messages.at(-1)?.text).toBe("Here is the completed draft.");
    expect(completed?.composerState.canSend).toBe(true);
  });

  it("keeps failed detail when the assistant run aborts", () => {
    const aborted = applyChatEventToDetail(detail(), {
      type: "assistant-aborted",
      threadId: "thread-1",
      detail: {
        ...detail(),
        composerState: {
          status: "idle",
          canSend: true,
          canAbort: false
        },
        messages: [
          ...detail().messages,
          {
            id: "assistant-partial",
            role: "assistant",
            text: "Partial answer",
            interrupted: true,
            status: "failed"
          }
        ]
      }
    });

    expect(aborted?.messages.at(-1)?.interrupted).toBe(true);
    expect(aborted?.composerState.canSend).toBe(true);
  });

  it("extracts chat stream payloads from daemon events", () => {
    const chatEvent: SlackClawEvent = {
      type: "chat.stream",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:slackclaw-chat:thread-1",
      payload: {
        type: "assistant-delta",
        threadId: "thread-1",
        activityLabel: "Responding…",
        message: {
          id: "thread-1:assistant:stream",
          role: "assistant",
          text: "Working on it...",
          status: "streaming"
        }
      }
    };

    expect(chatStreamEventFromDaemonEvent(chatEvent)).toEqual(chatEvent.payload);
  });

  it("ignores non-chat daemon events when deriving chat stream updates", () => {
    expect(
      chatStreamEventFromDaemonEvent({
        type: "gateway.status",
        reachable: true,
        pendingGatewayApply: false,
        summary: "Gateway is healthy."
      })
    ).toBeUndefined();
  });

  it("only sends from the keyboard when the draft is sendable and composition is inactive", () => {
    expect(
      shouldSubmitComposerShortcut({
        key: "Enter",
        shiftKey: false,
        canSend: true,
        draft: "Send this",
        isComposing: false
      })
    ).toBe(true);

    expect(
      shouldSubmitComposerShortcut({
        key: "Enter",
        shiftKey: true,
        canSend: true,
        draft: "Keep newline",
        isComposing: false
      })
    ).toBe(false);

    expect(
      shouldSubmitComposerShortcut({
        key: "Enter",
        shiftKey: false,
        canSend: false,
        draft: "Blocked while streaming",
        isComposing: false
      })
    ).toBe(false);

    expect(
      shouldSubmitComposerShortcut({
        key: "Enter",
        shiftKey: false,
        canSend: true,
        draft: "正在输入",
        isComposing: true
      })
    ).toBe(false);
  });

  it("reuses the same sendability rule for the button and keyboard path", () => {
    expect(canSendComposerDraft("Send this", true)).toBe(true);
    expect(canSendComposerDraft("   ", true)).toBe(false);
    expect(canSendComposerDraft("Blocked", false)).toBe(false);
  });

  it("exposes inline tool activity for the active assistant run only", () => {
    const currentDetail = applyChatEventToDetail(detail(), {
      type: "assistant-tool-status",
      threadId: "thread-1",
      sessionKey: "agent:agent-1:slackclaw-chat:thread-1",
      activityLabel: "Gathering sources…",
      toolActivity: {
        id: "tool-1",
        label: "Search knowledge base",
        status: "running",
        detail: "Scanning recent workspace notes"
      }
    });

    const activeMessage = {
      id: "thread-1:assistant:stream",
      role: "assistant" as const,
      text: "Working on it...",
      status: "streaming" as const
    };

    expect(inlineToolActivitiesForMessage(activeMessage, currentDetail)?.[0]?.label).toBe("Search knowledge base");
    expect(
      inlineToolActivitiesForMessage(
        {
          id: "assistant-final",
          role: "assistant",
          text: "Done"
        },
        currentDetail
      )
    ).toBeUndefined();
  });
});
