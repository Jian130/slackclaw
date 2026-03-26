import {
  ArrowDown,
  LoaderCircle,
  Plus,
  SendHorizontal,
  Square,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  AIMemberDetail,
  ChatMessage,
  ChatOverview,
  ChatStreamEvent,
  ChatThreadDetail,
  ChatThreadSummary,
  SlackClawEvent
} from "@slackclaw/contracts";

import { useAITeam } from "../../app/providers/AITeamProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import {
  abortChatThread,
  createChatThread,
  fetchChatOverview,
  fetchChatThread,
  sendChatMessage
} from "../../shared/api/client.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { useChatLayoutMode } from "../../shared/data/responsive.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { FieldLabel, Select, Textarea } from "../../shared/ui/Field.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { SplitContentScaffold, WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";

function detailFromSummary(summary: ChatThreadSummary): ChatThreadDetail {
  return {
    ...summary,
    messages: []
  };
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const next = [...messages];
  const existingIndex = next.findIndex(
    (candidate) =>
      candidate.id === message.id ||
      (candidate.clientMessageId && message.clientMessageId && candidate.clientMessageId === message.clientMessageId)
  );

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      ...message
    };
    return next;
  }

  return [...next, message];
}

function mergeThreadSummary(
  current: ChatOverview | undefined,
  thread: ChatThreadSummary,
  unreadByThreadId: Record<string, number>
): ChatOverview {
  const merged = [...(current?.threads ?? []).filter((candidate) => candidate.id !== thread.id), {
    ...thread,
    unreadCount: unreadByThreadId[thread.id] ?? thread.unreadCount
  }];

  return {
    threads: sortChatThreads(merged)
  };
}

export function sortChatThreads(threads: ChatThreadSummary[]): ChatThreadSummary[] {
  return [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function chatStreamEventFromDaemonEvent(event: SlackClawEvent): ChatStreamEvent | undefined {
  if (event.type !== "chat.stream") {
    return undefined;
  }

  return event.payload;
}

export function memberNameForThread(thread: ChatThreadSummary, members: AIMemberDetail[]): string {
  return members.find((member) => member.id === thread.memberId)?.name ?? "AI Member";
}

export function preferredNewChatMemberId(
  memberFilterId: string,
  members: AIMemberDetail[],
  selectedThreadMemberId?: string
): string | undefined {
  const memberIds = new Set(members.map((member) => member.id));

  if (memberFilterId !== "all" && memberIds.has(memberFilterId)) {
    return memberFilterId;
  }

  if (selectedThreadMemberId && memberIds.has(selectedThreadMemberId)) {
    return selectedThreadMemberId;
  }

  return undefined;
}

function memberForThread(thread: ChatThreadSummary | ChatThreadDetail | undefined, members: AIMemberDetail[]): AIMemberDetail | undefined {
  if (!thread) {
    return undefined;
  }

  return members.find((member) => member.id === thread.memberId);
}

function formatThreadTimestamp(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();

  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}

function isAuthFailure(error: string | undefined): boolean {
  if (!error) {
    return false;
  }

  const normalized = error.toLowerCase();
  return (
    normalized.includes("authentication_error") ||
    normalized.includes("invalid x-api-key") ||
    normalized.includes("invalid api key") ||
    normalized.includes("invalid api-key") ||
    normalized.includes("unauthorized")
  );
}

function visibleMessageBody(message: ChatMessage, copy: Record<string, string>): string {
  if (message.status === "failed" && isAuthFailure(message.error || message.text)) {
    return copy.authErrorTitle;
  }

  return message.text;
}

function visibleMessageMeta(message: ChatMessage, copy: Record<string, string>): string | undefined {
  if (message.status === "failed" && isAuthFailure(message.error || message.text)) {
    return copy.authErrorBody;
  }

  if (message.error && message.error.trim() && message.error.trim() !== message.text.trim()) {
    return message.error;
  }

  return undefined;
}

function activityTone(status: ChatThreadSummary["composerState"]["status"]): "neutral" | "success" | "warning" | "info" {
  switch (status) {
    case "streaming":
      return "success";
    case "thinking":
    case "sending":
    case "aborting":
      return "info";
    case "error":
      return "warning";
    default:
      return "neutral";
  }
}

function nextComposerState(
  current: ChatThreadDetail["composerState"],
  patch: Partial<ChatThreadDetail["composerState"]>
): ChatThreadDetail["composerState"] {
  return {
    ...current,
    ...patch
  };
}

export function applyChatEventToDetail(
  current: ChatThreadDetail | undefined,
  event: ChatStreamEvent
): ChatThreadDetail | undefined {
  if (!current) {
    return current;
  }

  switch (event.type) {
    case "thread-created":
      return current;
    case "thread-updated":
      if (event.thread.id !== current.id) {
        return current;
      }
      return {
        ...current,
        ...event.thread
      };
    case "history-loaded":
    case "assistant-completed":
    case "assistant-aborted":
      if (event.threadId !== current.id) {
        return current;
      }
      return event.detail;
    case "message-created":
      if (event.threadId !== current.id) {
        return current;
      }
      return {
        ...current,
        messages: upsertMessage(current.messages.filter((message) => message.id !== `${current.id}:assistant:stream`), event.message)
      };
    case "run-started":
      if (event.threadId !== current.id) {
        return current;
      }
      return {
        ...current,
        composerState: nextComposerState(current.composerState, {
          status: "thinking",
          canSend: false,
          canAbort: true,
          activityLabel: event.activityLabel
        }),
        messages: upsertMessage(current.messages, event.message)
      };
    case "assistant-thinking":
      if (event.threadId !== current.id) {
        return current;
      }
      return {
        ...current,
        composerState: nextComposerState(current.composerState, {
          status: "thinking",
          canSend: false,
          canAbort: true,
          activityLabel: event.activityLabel
        })
      };
    case "assistant-tool-status":
      if (event.threadId !== current.id) {
        return current;
      }
      return {
        ...current,
        composerState: nextComposerState(current.composerState, {
          status: current.composerState.status === "streaming" ? "streaming" : "thinking",
          canSend: false,
          canAbort: true,
          activityLabel: event.activityLabel
        })
      };
    case "assistant-delta":
      if (event.threadId !== current.id) {
        return current;
      }
      return {
        ...current,
        composerState: nextComposerState(current.composerState, {
          status: "streaming",
          canSend: false,
          canAbort: true,
          activityLabel: event.activityLabel
        }),
        messages: upsertMessage(current.messages, event.message)
      };
    case "assistant-failed":
      if (event.threadId !== current.id) {
        return current;
      }
      if (event.detail) {
        return event.detail;
      }
      return {
        ...current,
        composerState: nextComposerState(current.composerState, {
          status: "error",
          canSend: true,
          canAbort: false,
          error: event.error,
          activityLabel: event.activityLabel
        }),
        messages: upsertMessage(current.messages, {
          id: `${current.id}:assistant:error`,
          role: "assistant",
          text: event.error,
          status: "failed",
          error: event.error
        })
      };
    default:
      return current;
  }
}

function optimisticThreadDetail(
  current: ChatThreadDetail | undefined,
  summary: ChatThreadSummary,
  message: string,
  clientMessageId: string
): ChatThreadDetail {
  const timestamp = new Date().toISOString();

  return applyChatEventToDetail(
    applyChatEventToDetail(current ?? detailFromSummary(summary), {
      type: "message-created",
      threadId: summary.id,
      message: {
        id: `${summary.id}:user:${clientMessageId}`,
        role: "user",
        text: message,
        timestamp,
        clientMessageId,
        status: "pending"
      }
    })!,
    {
      type: "run-started",
      threadId: summary.id,
      activityLabel: "Thinking…",
      message: {
        id: `${summary.id}:assistant:stream`,
        role: "assistant",
        text: "",
        timestamp,
        status: "pending",
        pending: true
      }
    }
  )!;
}

function NewChatDialog(props: {
  open: boolean;
  members: AIMemberDetail[];
  busy: boolean;
  chooseMemberLabel: string;
  createLabel: string;
  cancelLabel: string;
  title: string;
  description: string;
  onClose: () => void;
  onCreate: (memberId: string) => Promise<void>;
}) {
  const [memberId, setMemberId] = useState("");

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setMemberId(props.members[0]?.id ?? "");
  }, [props.members, props.open]);

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      description={props.description}
    >
      <LoadingBlocker active={props.busy} label="Creating chat" description="ChillClaw is opening a new OpenClaw-backed conversation.">
        <div className="panel-stack">
          <div>
            <FieldLabel htmlFor="chat-member-select">{props.chooseMemberLabel}</FieldLabel>
            <Select
              id="chat-member-select"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              {props.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.jobTitle}
                </option>
              ))}
            </Select>
          </div>
          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={props.onClose} disabled={props.busy}>
              {props.cancelLabel}
            </Button>
            <Button loading={props.busy} disabled={!memberId} onClick={() => void props.onCreate(memberId)}>
              {props.busy ? `${props.createLabel}...` : props.createLabel}
            </Button>
          </div>
        </div>
      </LoadingBlocker>
    </Dialog>
  );
}

function MemberAvatarChip(props: { member?: AIMemberDetail; tone?: "assistant" | "user" }) {
  if (props.tone === "user") {
    return (
      <div className="chat-avatar chat-avatar--user">
        <UserRound size={16} />
      </div>
    );
  }

  return (
    <MemberAvatar avatar={props.member?.avatar} className="chat-avatar" name={props.member?.name} />
  );
}

export default function ChatPage() {
  const chatLayoutMode = useChatLayoutMode();
  const { locale } = useLocale();
  const copy = t(locale).chatPage;
  const common = t(locale).common;
  const { overview: teamOverview, loading: membersLoading } = useAITeam();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<ChatOverview>();
  const [detailsById, setDetailsById] = useState<Record<string, ChatThreadDetail>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [threadLoadingId, setThreadLoadingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [memberFilterId, setMemberFilterId] = useState<string>("all");
  const [unreadByThreadId, setUnreadByThreadId] = useState<Record<string, number>>({});
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const autoOpenRef = useRef<string | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const unreadByThreadIdRef = useRef<Record<string, number>>({});

  const members = teamOverview?.members ?? [];
  const selectedSummary = useMemo(
    () => (selectedThreadId ? overview?.threads.find((thread) => thread.id === selectedThreadId) : undefined),
    [overview?.threads, selectedThreadId]
  );
  const selectedThread = useMemo(
    () =>
      selectedThreadId
        ? detailsById[selectedThreadId] ?? (selectedSummary ? detailFromSummary(selectedSummary) : undefined)
        : undefined,
    [detailsById, selectedSummary, selectedThreadId]
  );
  const selectedMember = useMemo(
    () => memberForThread(selectedThread ?? selectedSummary, members),
    [members, selectedSummary, selectedThread]
  );
  const filteredThreads = useMemo(
    () => overview?.threads.filter((thread) => memberFilterId === "all" || thread.memberId === memberFilterId) ?? [],
    [memberFilterId, overview?.threads]
  );
  const lastUserMessage = useMemo(
    () => [...(selectedThread?.messages ?? [])].reverse().find((message) => message.role === "user")?.text,
    [selectedThread?.messages]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const next = await fetchChatOverview();
        if (cancelled) {
          return;
        }

        setOverview({
          threads: sortChatThreads(next.threads)
        });
        setSelectedThreadId((current) => current ?? searchParams.get("threadId") ?? next.threads[0]?.id);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "ChillClaw could not load chats.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!selectedThreadId || detailsById[selectedThreadId]) {
      return;
    }

    let cancelled = false;
    setThreadLoadingId(selectedThreadId);
    void fetchChatThread(selectedThreadId)
      .then((detail) => {
        if (!cancelled) {
          setDetailsById((current) => ({
            ...current,
            [selectedThreadId]: detail
          }));
        }
      })
      .catch((threadError) => {
        if (!cancelled) {
          setError(threadError instanceof Error ? threadError.message : "ChillClaw could not load this conversation.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setThreadLoadingId(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailsById, selectedThreadId]);

  useEffect(() => {
    const threadId = selectedThreadId;
    const status = selectedThread?.composerState.status ?? selectedSummary?.composerState.status;
    if (!threadId || !status || !["sending", "thinking", "streaming", "aborting"].includes(status)) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetchChatThread(threadId)
        .then((detail) => {
          if (cancelled) {
            return;
          }

          setDetailsById((current) => ({
            ...current,
            [threadId]: detail
          }));
          setOverview((current) => mergeThreadSummary(current, detail, unreadByThreadIdRef.current));
        })
        .catch(() => {
          // Keep the current optimistic state and let SSE or the next poll recover it.
        });
    }, 1800);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedSummary, selectedThread, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    setUnreadByThreadId((current) => {
      if (!current[selectedThreadId]) {
        return current;
      }

      return {
        ...current,
        [selectedThreadId]: 0
      };
    });
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    if (memberFilterId === "all") {
      return;
    }

    if (!filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      const nextThreadId = filteredThreads[0]?.id;
      setSelectedThreadId(nextThreadId);
      setSearchParams(nextThreadId ? { threadId: nextThreadId } : {});
    }
  }, [filteredThreads, memberFilterId, selectedThreadId, setSearchParams]);

  useEffect(() => {
    unreadByThreadIdRef.current = unreadByThreadId;
  }, [unreadByThreadId]);

  useEffect(() => {
    return subscribeToDaemonEvents((daemonEvent) => {
      const event = chatStreamEventFromDaemonEvent(daemonEvent);
      if (!event) {
        return;
      }

      if (event.type === "thread-created" || event.type === "thread-updated") {
        setOverview((current) => mergeThreadSummary(current, event.thread, unreadByThreadIdRef.current));
      }

      if (event.type === "history-loaded" || event.type === "assistant-completed" || event.type === "assistant-aborted") {
        setDetailsById((current) => ({
          ...current,
          [event.detail.id]: event.detail
        }));
        setOverview((current) => mergeThreadSummary(current, event.detail, unreadByThreadIdRef.current));
      }

      if (event.type === "assistant-failed" && event.detail) {
        const detail = event.detail;
        setOverview((current) => mergeThreadSummary(current, detail, unreadByThreadIdRef.current));
      }

      if ("threadId" in event && event.threadId !== selectedThreadId) {
        if (
          event.type === "assistant-delta" ||
          event.type === "assistant-completed" ||
          event.type === "assistant-aborted" ||
          event.type === "assistant-failed"
        ) {
          setUnreadByThreadId((current) => ({
            ...current,
            [event.threadId]: (current[event.threadId] ?? 0) + 1
          }));
        }
      }

      if ("threadId" in event) {
        setDetailsById((current) => {
          const nextDetail = applyChatEventToDetail(current[event.threadId], event);
          if (!nextDetail) {
            return current;
          }

          return {
            ...current,
            [event.threadId]: nextDetail
          };
        });
      }
    });
  }, [selectedThreadId]);

  useEffect(() => {
    const memberId = searchParams.get("memberId");
    const mode = searchParams.get("mode") === "reuse-recent" ? "reuse-recent" : "new";
    const requestKey = memberId ? `${memberId}:${mode}` : undefined;

    if (!memberId || !members.length || autoOpenRef.current === requestKey) {
      return;
    }

    if (!members.some((member) => member.id === memberId)) {
      return;
    }

    autoOpenRef.current = requestKey;
    void handleCreateThread(memberId, mode);
  }, [members, searchParams]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    if (stickToBottomRef.current) {
      transcript.scrollTop = transcript.scrollHeight;
      setShowJumpToLatest(false);
      return;
    }

    if (selectedThread?.composerState.status === "streaming" || selectedThread?.composerState.status === "thinking") {
      setShowJumpToLatest(true);
    }
  }, [selectedThread?.messages, selectedThread?.composerState.status, selectedThreadId]);

  async function handleCreateThread(memberId: string, mode: "new" | "reuse-recent" = "new") {
    setNewChatBusy(true);
    try {
      const response = await createChatThread({ memberId, mode });
      setOverview({
        threads: sortChatThreads(response.overview.threads)
      });
      const thread = response.thread;
      if (thread) {
        setDetailsById((current) => ({
          ...current,
          [thread.id]: thread
        }));
        setSelectedThreadId(thread.id);
        setSearchParams({ threadId: thread.id });
      }
      setNewChatOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "ChillClaw could not create a chat.");
    } finally {
      setNewChatBusy(false);
    }
  }

  function handleNewChatAction() {
    const memberId = preferredNewChatMemberId(
      memberFilterId,
      members,
      selectedThread?.memberId ?? selectedSummary?.memberId
    );

    if (memberId) {
      void handleCreateThread(memberId);
      return;
    }

    setNewChatOpen(true);
  }

  async function handleSend() {
    if (!selectedThreadId || !draft.trim() || !selectedSummary) {
      return;
    }

    const message = draft.trim();
    const clientMessageId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setDraft("");
    setDetailsById((current) => ({
      ...current,
      [selectedThreadId]: optimisticThreadDetail(current[selectedThreadId], selectedSummary, message, clientMessageId)
    }));
    setOverview((current) =>
      current
        ? {
            threads: sortChatThreads(
              current.threads.map((thread) =>
                thread.id === selectedThreadId
                  ? {
                      ...thread,
                      updatedAt: new Date().toISOString(),
                      lastPreview: message,
                      lastMessageAt: new Date().toISOString(),
                      activeRunState: "thinking",
                      composerState: {
                        status: "thinking",
                        canSend: false,
                        canAbort: true,
                        activityLabel: "Thinking…"
                      }
                    }
                  : thread
              )
            )
          }
        : current
    );
    stickToBottomRef.current = true;
    await sendCurrentMessage(message, clientMessageId);
  }

  async function sendCurrentMessage(message: string, clientMessageId?: string) {
    const threadId = selectedThreadId;
    if (!threadId) {
      return;
    }

    try {
      const response = await sendChatMessage(threadId, { message, clientMessageId });
      setOverview({
        threads: sortChatThreads(response.overview.threads)
      });
      const thread = response.thread;
      if (thread) {
        setDetailsById((current) => ({
          ...current,
          [threadId]: thread
        }));
      }
    } catch (sendError) {
      setDraft(message);
      setError(sendError instanceof Error ? sendError.message : "ChillClaw could not send this message.");
    }
  }

  async function handleRetry() {
    if (!lastUserMessage) {
      return;
    }

    await sendCurrentMessage(lastUserMessage);
  }

  async function handleAbort() {
    const threadId = selectedThreadId;
    if (!threadId) {
      return;
    }

    try {
      const response = await abortChatThread(threadId);
      setOverview({
        threads: sortChatThreads(response.overview.threads)
      });
      const thread = response.thread;
      if (thread) {
        setDetailsById((current) => ({
          ...current,
          [threadId]: thread
        }));
      }
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : "ChillClaw could not stop the current reply.");
    }
  }

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId);
    setSearchParams({ threadId });
    stickToBottomRef.current = true;
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSend();
  }

  function handleTranscriptScroll() {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    const nearBottom = distanceFromBottom < 72;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) {
      setShowJumpToLatest(false);
    }
  }

  function jumpToLatest() {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    transcript.scrollTop = transcript.scrollHeight;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  if (loading && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <LoadingPanel title="Loading conversations" description="ChillClaw is connecting to OpenClaw and loading chat threads." />
      </WorkspaceScaffold>
    );
  }

  return (
    <SplitContentScaffold
      className={`chat-page chat-page--${chatLayoutMode}`}
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <Button onClick={handleNewChatAction} disabled={members.length === 0} loading={membersLoading}>
          <Plus size={14} />
          {copy.newChat}
        </Button>
      }
      sidebar={
        <Card className="chat-sidebar chat-sidebar--telegram">
          <CardContent className="panel-stack">
            <div className="actions-row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{copy.threadList}</strong>
                <p className="card__description">{copy.chooseMember}</p>
              </div>
              <Badge tone="info">{filteredThreads.length}</Badge>
            </div>

            <div>
              <FieldLabel htmlFor="chat-member-filter">{copy.chooseMember}</FieldLabel>
              <Select
                id="chat-member-filter"
                value={memberFilterId}
                onChange={(event) => setMemberFilterId(event.target.value)}
              >
                <option value="all">{copy.allMembers}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </div>

            {filteredThreads.length ? (
              <div className="chat-thread-list">
                {filteredThreads.map((thread) => {
                  const active = thread.id === selectedThreadId;
                  const member = memberForThread(thread, members);
                  const unreadCount = unreadByThreadId[thread.id] ?? thread.unreadCount;

                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={`chat-thread-card chat-thread-card--telegram${active ? " chat-thread-card--active" : ""}`}
                      onClick={() => handleSelectThread(thread.id)}
                    >
                      <div className="chat-thread-card__top">
                        <div className="chat-thread-card__identity">
                          <MemberAvatarChip member={member} />
                          <div className="provider-details">
                            <strong>{thread.title}</strong>
                            <span className="card__description">{memberNameForThread(thread, members)}</span>
                          </div>
                        </div>
                        <div className="chat-thread-card__meta">
                          <span className="chat-thread-card__time">{formatThreadTimestamp(thread.lastMessageAt ?? thread.updatedAt)}</span>
                          {unreadCount > 0 ? <span className="chat-unread-badge">{unreadCount}</span> : null}
                        </div>
                      </div>

                      <div className="chat-thread-card__bottom">
                        <p className="card__description chat-thread-card__preview">{thread.lastPreview ?? copy.emptyBody}</p>
                        {thread.activeRunState ? (
                          <StatusBadge tone={activityTone(thread.activeRunState)}>
                            {thread.composerState.activityLabel ?? thread.activeRunState}
                          </StatusBadge>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title={copy.emptyTitle}
                description={copy.emptyBody}
                actionLabel={copy.newChat}
                onAction={handleNewChatAction}
              />
            )}
          </CardContent>
        </Card>
      }
      detail={
        <Card className="chat-main chat-main--telegram">
          <CardContent className="chat-main__content chat-main__content--telegram">
            {selectedThread ? (
              <>
                <div className="chat-thread-header">
                  <div className="chat-thread-header__identity">
                    <MemberAvatarChip member={selectedMember} />
                    <div>
                      <strong>{selectedMember?.name ?? memberNameForThread(selectedThread, members)}</strong>
                      <p className="card__description">
                        {selectedThread.composerState.activityLabel ?? selectedMember?.jobTitle ?? copy.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="actions-row">
                    {selectedThread.composerState.status === "error" && lastUserMessage ? (
                      <Button variant="outline" onClick={() => void handleRetry()}>
                        {common.retry}
                      </Button>
                    ) : null}
                    {selectedThread.composerState.canAbort ? (
                      <Button variant="outline" onClick={() => void handleAbort()}>
                        <Square size={14} />
                        {copy.stop}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedThread.historyStatus === "unavailable" ? (
                  <EmptyState
                    title={copy.unavailableTitle}
                    description={selectedThread.historyError ?? copy.unavailableBody}
                    actionLabel={copy.newChat}
                    onAction={() => void handleCreateThread(selectedThread.memberId)}
                  />
                ) : (
                  <>
                    <div className="chat-transcript-shell">
                      <div className="chat-transcript chat-transcript--telegram" ref={transcriptRef} onScroll={handleTranscriptScroll}>
                        {threadLoadingId === selectedThread.id ? (
                          <LoadingPanel compact title={copy.loadingThread} description="ChillClaw is syncing the latest messages from OpenClaw." />
                        ) : selectedThread.messages.length > 0 ? (
                          selectedThread.messages.map((message, index) => {
                            const previous = selectedThread.messages[index - 1];
                            const next = selectedThread.messages[index + 1];
                            const isUser = message.role === "user";
                            const showAvatar = !previous || previous.role !== message.role;
                            const groupedWithNext = next?.role === message.role;
                            const messageBody = visibleMessageBody(message, copy);
                            const messageMeta = visibleMessageMeta(message, copy);

                            return (
                              <div
                                className={`chat-message-row ${isUser ? "chat-message-row--user" : "chat-message-row--assistant"} ${
                                  groupedWithNext ? "chat-message-row--grouped" : ""
                                }`}
                                key={message.id}
                              >
                                {!isUser ? (
                                  <div className="chat-message-row__avatar-slot">
                                    {showAvatar ? <MemberAvatarChip member={selectedMember} /> : null}
                                  </div>
                                ) : null}

                                <div
                                  className={`message-bubble message-bubble--${isUser ? "user" : "assistant"} ${
                                    message.status === "failed" ? "message-bubble--failed" : ""
                                  }`}
                                >
                                  {message.status === "pending" && !message.text ? (
                                    <div className="chat-thinking">
                                      <LoaderCircle size={14} className="chat-thinking__spinner" />
                                      <span>{selectedThread.composerState.activityLabel ?? "Thinking…"}</span>
                                    </div>
                                  ) : (
                                    <p className="chat-message-text">{messageBody}</p>
                                  )}

                                  <div className="chat-message-meta">
                                    {message.interrupted ? <span>{copy.replyStopped}</span> : null}
                                    {messageMeta ? <span>{messageMeta}</span> : null}
                                    <span>{formatThreadTimestamp(message.timestamp)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <EmptyState
                            title={copy.emptyThreadTitle}
                            description={copy.emptyBody}
                            actionLabel={copy.newChat}
                            onAction={handleNewChatAction}
                          />
                        )}
                      </div>

                      {showJumpToLatest ? (
                        <button type="button" className="chat-jump-button" onClick={jumpToLatest}>
                          <ArrowDown size={14} />
                          {copy.newReply}
                        </button>
                      ) : null}
                    </div>

                    <div className="chat-composer chat-composer--telegram">
                      <Textarea
                        ref={composerRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        rows={1}
                        placeholder={copy.messagePlaceholder.replace("{name}", selectedMember?.name ?? memberNameForThread(selectedThread, members))}
                      />
                      {selectedThread.composerState.canAbort ? (
                        <Button variant="outline" onClick={() => void handleAbort()} loading={selectedThread.composerState.status === "aborting"}>
                          <Square size={14} />
                          {copy.stop}
                        </Button>
                      ) : (
                        <Button
                          disabled={!selectedThread.composerState.canSend || !draft.trim()}
                          loading={selectedThread.composerState.status === "sending"}
                          onClick={() => void handleSend()}
                        >
                          <SendHorizontal size={14} />
                          {selectedThread.composerState.status === "sending" ? copy.sending : copy.send}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <EmptyState
                title={copy.emptyThreadTitle}
                description={copy.emptyThreadBody}
                actionLabel={copy.newChat}
                onAction={handleNewChatAction}
              />
            )}
          </CardContent>
        </Card>
      }
    >
      {error ? (
        <Card>
          <CardContent>
            <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p>
          </CardContent>
        </Card>
      ) : null}
      <NewChatDialog
        open={newChatOpen}
        members={members}
        busy={newChatBusy}
        chooseMemberLabel={copy.chooseMember}
        createLabel={copy.createChat}
        cancelLabel={common.cancel}
        title={copy.newChat}
        description={copy.createChatDescription}
        onClose={() => setNewChatOpen(false)}
        onCreate={(memberId) => handleCreateThread(memberId)}
      />
    </SplitContentScaffold>
  );
}
