import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@chillclaw/contracts";

import type { EngineChatLiveEvent } from "../engine/adapter.js";
import { getProductVersion } from "../product-version.js";
import {
  buildOpenClawGatewayDeviceAuthPayload,
  publicKeyRawBase64UrlFromPem,
  signOpenClawGatewayDevicePayload,
  type OpenClawGatewayDeviceIdentity
} from "./openclaw-gateway-device-auth.js";
import { DaemonTimeoutError } from "./timeout-errors.js";

interface OpenClawGatewaySocketEnvelope {
  type?: string;
  event?: string;
  id?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: string | { message?: string };
}

interface OpenClawGatewayConnectChallengePayload {
  nonce?: string;
}

type GatewaySocketPayload = {
  sessionKey?: string;
  runId?: string;
  state?: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
  data?: {
    phase?: string;
    name?: string;
    isError?: boolean;
    error?: string;
  };
};

type GatewaySocketLike = {
  close: () => void;
  send: (value: string) => void;
  readyState: number;
  onopen?: (event: unknown) => void;
  onmessage?: (event: { data?: unknown }) => void;
  onclose?: (event: { code?: number; reason?: string }) => void;
  onerror?: (event: unknown) => void;
};

type GatewaySocketConstructor = new (url: string) => GatewaySocketLike;

type GatewaySocketState = {
  listeners: Set<(event: EngineChatLiveEvent) => void>;
  pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>;
  socket?: GatewaySocketLike;
  connectPromise?: Promise<void>;
  reconnectTimer?: NodeJS.Timeout;
  connectRequestId?: string;
  intentionalClose?: boolean;
  connected: boolean;
};

export function buildGatewaySocketConnectParams(params: {
  token: string;
  nonce?: string;
  deviceIdentity?: OpenClawGatewayDeviceIdentity;
  platform?: string;
  clientVersion?: string;
}): Record<string, unknown> {
  const scopes = ["operator.read", "operator.write"];
  const connectParams: Record<string, unknown> = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",
      displayName: "ChillClaw daemon",
      version: params.clientVersion ?? process.env.CHILLCLAW_APP_VERSION ?? process.env.npm_package_version ?? getProductVersion(),
      platform: params.platform ?? process.platform,
      mode: "backend"
    },
    caps: ["tool-events"],
    auth: {
      token: params.token
    },
    role: "operator",
    scopes
  };

  if (params.deviceIdentity && params.nonce) {
    const signedAtMs = Date.now();
    const payload = buildOpenClawGatewayDeviceAuthPayload({
      deviceId: params.deviceIdentity.deviceId,
      clientId: "gateway-client",
      clientMode: "backend",
      role: "operator",
      scopes,
      signedAtMs,
      token: params.token,
      nonce: params.nonce,
      platform: params.platform ?? process.platform
    });
    connectParams.device = {
      id: params.deviceIdentity.deviceId,
      publicKey: publicKeyRawBase64UrlFromPem(params.deviceIdentity.publicKeyPem),
      signature: signOpenClawGatewayDevicePayload(params.deviceIdentity.privateKeyPem, payload),
      signedAt: signedAtMs,
      nonce: params.nonce
    };
  }

  return connectParams;
}

export function normalizeGatewaySocketUrl(url: string): string {
  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  return url;
}

interface GatewayCodeRegion {
  start: number;
  end: number;
}

const GATEWAY_REASONING_TAG_QUICK_RE = /<\s*\/?\s*(?:think(?:ing)?|thought|antthinking|final|relevant[-_]memories)\b/i;
const GATEWAY_FINAL_TAG_RE = /<\s*\/?\s*final\b[^<>]*>/gi;
const GATEWAY_THINKING_TAG_RE = /<\s*(\/?)\s*(?:think(?:ing)?|thought|antthinking)\b[^<>]*>/gi;
const GATEWAY_MEMORY_TAG_RE = /<\s*(\/?)\s*relevant[-_]memories\b[^<>]*>/gi;
const DEFAULT_GATEWAY_CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 30_000;

function findGatewayCodeRegions(text: string): GatewayCodeRegion[] {
  const regions: GatewayCodeRegion[] = [];
  const fencedRe = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(?:\n\2(?:\n|$)|$)/g;
  for (const match of text.matchAll(fencedRe)) {
    const start = (match.index ?? 0) + match[1].length;
    regions.push({ start, end: start + match[0].length - match[1].length });
  }

  const inlineRe = /`+[^`]+`+/g;
  for (const match of text.matchAll(inlineRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const insideFenced = regions.some((region) => start >= region.start && end <= region.end);
    if (!insideFenced) {
      regions.push({ start, end });
    }
  }

  regions.sort((left, right) => left.start - right.start);
  return regions;
}

function isInsideGatewayCode(index: number, regions: GatewayCodeRegion[]): boolean {
  return regions.some((region) => index >= region.start && index < region.end);
}

function stripGatewayReasoningTags(text: string): string {
  if (!text || !GATEWAY_REASONING_TAG_QUICK_RE.test(text)) {
    return text;
  }

  let cleaned = text;
  GATEWAY_FINAL_TAG_RE.lastIndex = 0;
  if (GATEWAY_FINAL_TAG_RE.test(cleaned)) {
    GATEWAY_FINAL_TAG_RE.lastIndex = 0;
    const finalMatches: Array<{ start: number; length: number }> = [];
    const codeRegions = findGatewayCodeRegions(cleaned);
    for (const match of cleaned.matchAll(GATEWAY_FINAL_TAG_RE)) {
      const start = match.index ?? 0;
      if (!isInsideGatewayCode(start, codeRegions)) {
        finalMatches.push({ start, length: match[0].length });
      }
    }

    for (let index = finalMatches.length - 1; index >= 0; index -= 1) {
      const match = finalMatches[index];
      cleaned = cleaned.slice(0, match.start) + cleaned.slice(match.start + match.length);
    }
  }

  const codeRegions = findGatewayCodeRegions(cleaned);
  GATEWAY_THINKING_TAG_RE.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let inThinking = false;

  for (const match of cleaned.matchAll(GATEWAY_THINKING_TAG_RE)) {
    const index = match.index ?? 0;
    const isClose = match[1] === "/";

    if (isInsideGatewayCode(index, codeRegions)) {
      continue;
    }

    if (!inThinking) {
      result += cleaned.slice(lastIndex, index);
      if (!isClose) {
        inThinking = true;
      }
    } else if (isClose) {
      inThinking = false;
    }

    lastIndex = index + match[0].length;
  }

  if (!inThinking) {
    result += cleaned.slice(lastIndex);
  }

  return result;
}

function stripGatewayMemoryTags(text: string): string {
  if (!text || !GATEWAY_MEMORY_TAG_RE.test(text)) {
    GATEWAY_MEMORY_TAG_RE.lastIndex = 0;
    return text;
  }

  GATEWAY_MEMORY_TAG_RE.lastIndex = 0;
  const codeRegions = findGatewayCodeRegions(text);
  let result = "";
  let lastIndex = 0;
  let inMemoryBlock = false;

  for (const match of text.matchAll(GATEWAY_MEMORY_TAG_RE)) {
    const index = match.index ?? 0;
    const isClose = match[1] === "/";

    if (isInsideGatewayCode(index, codeRegions)) {
      continue;
    }

    if (!inMemoryBlock) {
      result += text.slice(lastIndex, index);
      if (!isClose) {
        inMemoryBlock = true;
      }
    } else if (isClose) {
      inMemoryBlock = false;
    }

    lastIndex = index + match[0].length;
  }

  if (!inMemoryBlock) {
    result += text.slice(lastIndex);
  }

  return result;
}

function sanitizeGatewayChatText(text: string): string {
  const withoutReasoning = stripGatewayReasoningTags(text);
  const withoutMemories = stripGatewayMemoryTags(withoutReasoning);
  return withoutMemories.replace(/\n{3,}/g, "\n\n").trim();
}

export function readGatewayChatText(message: unknown, options?: { sanitize?: boolean }): string {
  const shouldSanitize = options?.sanitize ?? true;

  if (!message) {
    return "";
  }

  if (typeof message === "string") {
    return shouldSanitize ? sanitizeGatewayChatText(message) : message.trim();
  }

  if (typeof message !== "object" || !("content" in message)) {
    return "";
  }

  const content = (message as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  const text = content
    .filter((part) => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("");

  if (!text.trim()) {
    return "";
  }

  return shouldSanitize ? sanitizeGatewayChatText(text) : text.trim();
}

export function formatOpenClawGatewayToolActivity(payload: GatewaySocketPayload | undefined): string | undefined {
  const name = payload?.data?.name?.trim();
  const phase = payload?.data?.phase?.trim();

  if (!name) {
    return undefined;
  }

  if (payload?.data?.isError || phase === "error") {
    return `Tool issue: ${name}`;
  }

  if (phase === "result" || phase === "end") {
    return `Tool finished: ${name}`;
  }

  return `Using tools: ${name}`;
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function readGatewaySocketChallengeNonce(envelope: OpenClawGatewaySocketEnvelope): string | undefined {
  if (envelope.event !== "connect.challenge") {
    return undefined;
  }

  const payload = (envelope.payload ?? {}) as OpenClawGatewayConnectChallengePayload;
  const nonce = payload.nonce?.trim();
  return nonce ? nonce : undefined;
}

export class OpenClawGatewaySocketAdapter {
  private readonly state: GatewaySocketState = {
    listeners: new Set(),
    pendingRequests: new Map(),
    connected: false
  };

  constructor(
    private readonly options: {
      readConnectionInfo: () => Promise<{ url: string; token: string; deviceIdentity?: OpenClawGatewayDeviceIdentity } | undefined>;
      onReconnectError?: (error: unknown) => void | Promise<void>;
      websocketFactory?: GatewaySocketConstructor;
      connectTimeoutMs?: number;
      requestTimeoutMs?: number;
    }
  ) {}

  async subscribe(listener: (event: EngineChatLiveEvent) => void): Promise<() => void> {
    this.state.listeners.add(listener);

    try {
      await this.ensureConnected();
    } catch (error) {
      this.state.listeners.delete(listener);
      throw error;
    }

    return () => {
      this.state.listeners.delete(listener);

      if (this.state.listeners.size === 0) {
        this.close();
      }
    };
  }

  async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    await this.ensureConnected();

    const socket = this.state.socket;
    if (!socket || !this.state.connected) {
      throw new Error("OpenClaw gateway backend socket is not connected.");
    }

    const requestId = randomUUID();
    const requestFrame = JSON.stringify({
      type: "req",
      id: requestId,
      method,
      params
    });

    return await new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS;
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            const pending = this.state.pendingRequests.get(requestId);
            pending?.reject(new DaemonTimeoutError(
              "GATEWAY_TIMEOUT",
              `OpenClaw gateway request ${method} timed out after ${timeoutMs}ms.`,
              timeoutMs,
              { method, requestId }
            ));
          }, timeoutMs)
        : undefined;
      this.state.pendingRequests.set(requestId, {
        resolve: (value) => {
          if (timer) {
            clearTimeout(timer);
          }
          this.state.pendingRequests.delete(requestId);
          resolve(value as T);
        },
        reject: (error) => {
          if (timer) {
            clearTimeout(timer);
          }
          this.state.pendingRequests.delete(requestId);
          reject(error);
        },
        timer
      });

      try {
        socket.send(requestFrame);
      } catch (error) {
        const pending = this.state.pendingRequests.get(requestId);
        pending?.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close(): void {
    this.state.intentionalClose = true;

    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = undefined;
    }

    this.state.connectPromise = undefined;
    this.state.connected = false;
    this.rejectPendingRequests(new Error("OpenClaw gateway backend socket closed."));

    try {
      this.state.socket?.close();
    } catch {
      // Best-effort close.
    }

    this.state.socket = undefined;
  }

  private emit(event: EngineChatLiveEvent): void {
    for (const listener of this.state.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures should not break the shared bridge.
      }
    }
  }

  private rejectPendingRequests(error: Error): void {
    if (this.state.pendingRequests.size === 0) {
      return;
    }

    for (const pending of this.state.pendingRequests.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(error);
    }
    this.state.pendingRequests.clear();
  }

  private scheduleReconnect(reason?: string): void {
    if (this.state.intentionalClose || this.state.listeners.size === 0) {
      return;
    }

    if (this.state.reconnectTimer) {
      return;
    }

    this.emit({
      type: "disconnected",
      error: reason
    });

    this.state.reconnectTimer = setTimeout(() => {
      this.state.reconnectTimer = undefined;
      void this.ensureConnected().catch(async (error) => {
        await this.options.onReconnectError?.(error);
        this.scheduleReconnect(error instanceof Error ? error.message : "OpenClaw chat bridge reconnect failed.");
      });
    }, 1500);
  }

  private async ensureConnected(): Promise<void> {
    if (this.state.connected && this.state.socket) {
      return;
    }

    if (this.state.connectPromise) {
      return this.state.connectPromise;
    }

    this.state.connectPromise = (async () => {
      const connection = await this.options.readConnectionInfo();
      const GatewaySocket =
        this.options.websocketFactory ??
        ((globalThis as typeof globalThis & { WebSocket?: GatewaySocketConstructor }).WebSocket);

      if (!GatewaySocket) {
        throw new Error("This ChillClaw runtime does not provide WebSocket support.");
      }

      if (!connection) {
        throw new Error("ChillClaw could not resolve the OpenClaw gateway socket URL or auth token.");
      }

      this.state.intentionalClose = false;
      const socket = new GatewaySocket(connection.url);
      this.state.socket = socket;
      this.state.connectRequestId = randomUUID();

      await new Promise<void>((resolve, reject) => {
        let authenticated = false;
        let settled = false;
        const timeoutMs = this.options.connectTimeoutMs ?? DEFAULT_GATEWAY_CONNECT_TIMEOUT_MS;
        const connectTimer = timeoutMs > 0
          ? setTimeout(() => {
              fail(new DaemonTimeoutError(
                "GATEWAY_TIMEOUT",
                `OpenClaw gateway connect timed out after ${timeoutMs}ms.`,
                timeoutMs,
                { url: connection.url }
              ));
              try {
                socket.close();
              } catch {
                // Best-effort shutdown.
              }
            }, timeoutMs)
          : undefined;

        const clearConnectTimer = () => {
          if (connectTimer) {
            clearTimeout(connectTimer);
          }
        };

        const fail = (error: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearConnectTimer();
          this.state.socket = undefined;
          this.state.connected = false;
          reject(error);
        };

        const succeed = () => {
          if (settled) {
            return;
          }

          settled = true;
          clearConnectTimer();
          this.state.connected = true;
          this.emit({ type: "connected" });
          resolve();
        };

        socket.onmessage = (event) => {
          const raw = typeof event.data === "string" ? event.data : String(event.data ?? "");
          const envelope = safeJsonParse<OpenClawGatewaySocketEnvelope>(raw);

          if (!envelope) {
            return;
          }

          if (envelope.type === "event" && envelope.event === "connect.challenge") {
            const nonce = readGatewaySocketChallengeNonce(envelope);

            if (!nonce) {
              fail(new Error("OpenClaw gateway connect challenge did not include a nonce."));
              try {
                socket.close();
              } catch {
                // Best-effort shutdown.
              }
              return;
            }

            socket.send(
              JSON.stringify({
                type: "req",
                id: this.state.connectRequestId,
                method: "connect",
                params: buildGatewaySocketConnectParams({
                  token: connection.token,
                  nonce,
                  deviceIdentity: connection.deviceIdentity
                })
              })
            );
            return;
          }

          if (envelope.id === this.state.connectRequestId) {
            if (envelope.ok === false) {
              const detail =
                (typeof envelope.error === "string" ? envelope.error : envelope.error?.message) ??
                "OpenClaw rejected the ChillClaw chat bridge connection.";
              fail(new Error(detail));
              return;
            }

            authenticated = true;
            succeed();
            return;
          }

          if (envelope.id) {
            const pending = this.state.pendingRequests.get(envelope.id);
            if (pending) {
              if (envelope.ok === false) {
                const detail =
                  (typeof envelope.error === "string" ? envelope.error : envelope.error?.message) ??
                  `OpenClaw rejected the ${envelope.id} gateway request.`;
                pending.reject(new Error(detail));
                return;
              }

              pending.resolve(envelope.payload);
              return;
            }
          }

          if (!authenticated || envelope.type !== "event") {
            return;
          }

          const payload = (envelope.payload ?? {}) as GatewaySocketPayload;

          if (envelope.event === "chat") {
            const sessionKey = payload.sessionKey?.trim();

            if (!sessionKey) {
              return;
            }

            switch (payload.state) {
              case "delta":
                this.emit({
                  type: "assistant-delta",
                  sessionKey,
                  runId: payload.runId,
                  message: {
                    id: `${sessionKey}:assistant:stream`,
                    role: "assistant",
                    text: readGatewayChatText(payload.message),
                    status: "streaming"
                  } as ChatMessage
                });
                return;
              case "final":
                this.emit({
                  type: "assistant-completed",
                  sessionKey,
                  runId: payload.runId
                });
                return;
              case "aborted":
                this.emit({
                  type: "assistant-aborted",
                  sessionKey,
                  runId: payload.runId
                });
                return;
              case "error":
                this.emit({
                  type: "assistant-failed",
                  sessionKey,
                  runId: payload.runId,
                  error: payload.errorMessage ?? "OpenClaw reported a chat error."
                });
                return;
              default:
                return;
            }
          }

          if (envelope.event === "agent") {
            const activityLabel = formatOpenClawGatewayToolActivity(payload);
            const sessionKey = payload.sessionKey?.trim();

            if (!activityLabel || !sessionKey) {
              return;
            }

            this.emit({
              type: "assistant-tool-status",
              sessionKey,
              runId: payload.runId,
              activityLabel,
              toolActivity: {
                id: payload.data?.name?.trim() || `${sessionKey}:tool`,
                label: payload.data?.name?.trim() || activityLabel,
                status:
                  payload.data?.isError || payload.data?.phase === "error"
                    ? "failed"
                    : payload.data?.phase === "result" || payload.data?.phase === "end"
                      ? "completed"
                      : "running",
                detail: payload.data?.error?.trim() || undefined
              }
            });
          }
        };

        socket.onerror = () => {
          if (!authenticated) {
            fail(new Error("ChillClaw could not open the OpenClaw chat event bridge."));
          }
        };

        socket.onclose = (event) => {
          this.state.connected = false;
          this.state.socket = undefined;
          this.state.connectPromise = undefined;
          this.rejectPendingRequests(new Error(event.reason || "OpenClaw closed the backend socket request."));

          if (!authenticated) {
            fail(new Error(event.reason || "OpenClaw closed the chat bridge before ChillClaw connected."));
            return;
          }

          this.scheduleReconnect(event.reason);
        };
      });
    })().finally(() => {
      this.state.connectPromise = undefined;
    });

    return this.state.connectPromise;
  }
}
