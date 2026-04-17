import type { ChillClawEvent } from "@chillclaw/contracts";

import { resolveApiBase } from "./client.js";

type EventListener = (event: ChillClawEvent) => void;
type ErrorListener = (event: Event) => void;
export type DaemonSocketConnectionState = "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface DaemonResourceRevisionState {
  epoch: string;
  revision: number;
}

export interface DaemonEventTransportState {
  connectionState: DaemonSocketConnectionState;
  lastError?: string;
  lastSeenByResource: Partial<Record<string, DaemonResourceRevisionState>>;
}

type StateListener = (state: DaemonEventTransportState) => void;

const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const EVENT_STREAM_STALE_MS = 45_000;

const eventListeners = new Set<EventListener>();
const errorListeners = new Set<ErrorListener>();
const stateListeners = new Set<StateListener>();

let activeSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let connectionState: DaemonSocketConnectionState = "closed";
let lastError: string | undefined;
const lastSeenByResource = new Map<string, DaemonResourceRevisionState>();

function buildEventSocketUrl() {
  return resolveApiBase().replace(/^http/i, "ws") + "/events";
}

function currentState(): DaemonEventTransportState {
  return {
    connectionState,
    lastError,
    lastSeenByResource: Object.fromEntries(lastSeenByResource.entries())
  };
}

function emitState() {
  const snapshot = currentState();
  for (const listener of [...stateListeners]) {
    listener(snapshot);
  }
}

function setConnectionState(next: DaemonSocketConnectionState, error?: string) {
  connectionState = next;
  if (error !== undefined || next === "connected" || next === "closed") {
    lastError = error;
  }
  emitState();
}

function updateResourceRevision(event: ChillClawEvent) {
  switch (event.type) {
    case "overview.updated":
      lastSeenByResource.set("overview", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "ai-team.updated":
      lastSeenByResource.set("ai-team", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "model-config.updated":
      lastSeenByResource.set("model-config", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "channel-config.updated":
      lastSeenByResource.set("channel-config", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "skill-catalog.updated":
      lastSeenByResource.set("skill-catalog", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "plugin-config.updated":
      lastSeenByResource.set("plugin-config", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "preset-skill-sync.updated":
      lastSeenByResource.set("preset-skill-sync", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    case "downloads.updated":
      lastSeenByResource.set("downloads", { epoch: event.snapshot.epoch, revision: event.snapshot.revision });
      break;
    default:
      return;
  }

  emitState();
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearStaleTimer() {
  if (staleTimer) {
    clearTimeout(staleTimer);
    staleTimer = null;
  }
}

function markStreamActivity(socket: WebSocket) {
  if (activeSocket !== socket) {
    return;
  }

  clearStaleTimer();
  staleTimer = setTimeout(() => {
    if (activeSocket !== socket) {
      return;
    }

    activeSocket = null;
    setConnectionState("reconnecting", "The event stream stopped responding.");
    socket.close();
    scheduleReconnect();
  }, EVENT_STREAM_STALE_MS);
}

function scheduleReconnect() {
  if (!shouldReconnect || eventListeners.size === 0 || reconnectTimer) {
    return;
  }

  setConnectionState("reconnecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureSocket();
  }, DEFAULT_RECONNECT_DELAY_MS);
}

function ensureSocket() {
  if (!shouldReconnect || eventListeners.size === 0 || activeSocket) {
    return;
  }

  setConnectionState(connectionState === "connected" ? "reconnecting" : "connecting");
  const socket = new WebSocket(buildEventSocketUrl());
  activeSocket = socket;

  socket.onopen = () => {
    if (activeSocket === socket) {
      setConnectionState("connected");
      markStreamActivity(socket);
    }
  };

  socket.onmessage = (event) => {
    markStreamActivity(socket);
    try {
      const payload = JSON.parse(event.data) as ChillClawEvent;
      if (payload.type === "daemon.heartbeat") {
        return;
      }
      updateResourceRevision(payload);
      for (const listener of [...eventListeners]) {
        listener(payload);
      }
    } catch {
      // Ignore malformed events and keep the stream alive.
    }
  };

  socket.onerror = (event) => {
    setConnectionState("error", "The event stream encountered an error.");
    for (const listener of [...errorListeners]) {
      listener(event);
    }
  };

  socket.onclose = () => {
    if (activeSocket === socket) {
      activeSocket = null;
    }
    clearStaleTimer();

    if (shouldReconnect && eventListeners.size > 0) {
      scheduleReconnect();
      return;
    }

    setConnectionState("closed");
  };
}

function closeSocket() {
  if (!activeSocket) {
    return;
  }

  const socket = activeSocket;
  activeSocket = null;
  clearStaleTimer();
  socket.close();
}

export function subscribeToDaemonEvents(onEvent: EventListener, onError?: ErrorListener, onState?: StateListener): () => void {
  eventListeners.add(onEvent);
  if (onError) {
    errorListeners.add(onError);
  }
  if (onState) {
    stateListeners.add(onState);
    onState(currentState());
  }

  shouldReconnect = true;
  ensureSocket();

  return () => {
    eventListeners.delete(onEvent);
    if (onError) {
      errorListeners.delete(onError);
    }
    if (onState) {
      stateListeners.delete(onState);
    }

    if (eventListeners.size > 0) {
      return;
    }

    shouldReconnect = false;
    clearReconnectTimer();
    closeSocket();
    setConnectionState("closed");
  };
}

export function getDaemonEventTransportState(): DaemonEventTransportState {
  return currentState();
}

export function getDaemonResourceRevision(resource: string): DaemonResourceRevisionState | undefined {
  return lastSeenByResource.get(resource);
}

export function resetDaemonEventStateForTests() {
  shouldReconnect = false;
  eventListeners.clear();
  errorListeners.clear();
  stateListeners.clear();
  clearReconnectTimer();
  clearStaleTimer();
  closeSocket();
  lastSeenByResource.clear();
  connectionState = "closed";
  lastError = undefined;
}
