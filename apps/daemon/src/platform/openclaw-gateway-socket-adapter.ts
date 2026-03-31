import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@chillclaw/contracts";

import type { EngineChatLiveEvent } from "../engine/adapter.js";

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
  socket?: GatewaySocketLike;
  connectPromise?: Promise<void>;
  reconnectTimer?: NodeJS.Timeout;
  connectRequestId?: string;
  intentionalClose?: boolean;
  connected: boolean;
};

export function buildGatewaySocketConnectParams(params: {
  token: string;
  platform?: string;
  clientVersion?: string;
}): Record<string, unknown> {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",
      displayName: "ChillClaw daemon",
      version: params.clientVersion ?? process.env.npm_package_version ?? "0.1.2",
      platform: params.platform ?? process.platform,
      mode: "backend"
    },
    caps: ["tool-events"],
    auth: {
      token: params.token
    },
    role: "operator",
    scopes: ["operator.admin"]
  };
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

export function readGatewayChatText(message: unknown): string {
  if (!message) {
    return "";
  }

  if (typeof message === "string") {
    return message.trim();
  }

  if (typeof message !== "object" || !("content" in message)) {
    return "";
  }

  const content = (message as { content?: Array<{ type?: string; text?: string }> }).content ?? [];

  return content
    .filter((part) => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
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
    connected: false
  };

  constructor(
    private readonly options: {
      readConnectionInfo: () => Promise<{ url: string; token: string } | undefined>;
      onReconnectError?: (error: unknown) => void | Promise<void>;
      websocketFactory?: GatewaySocketConstructor;
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

  close(): void {
    this.state.intentionalClose = true;

    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = undefined;
    }

    this.state.connectPromise = undefined;
    this.state.connected = false;

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

        const fail = (error: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          this.state.socket = undefined;
          this.state.connected = false;
          reject(error);
        };

        const succeed = () => {
          if (settled) {
            return;
          }

          settled = true;
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
                  token: connection.token
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
