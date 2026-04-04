import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenClawGatewaySocketAdapter,
  buildGatewaySocketConnectParams,
  readGatewayChatText
} from "./openclaw-gateway-socket-adapter.js";
import {
  buildOpenClawGatewayDeviceAuthPayload,
  publicKeyRawBase64UrlFromPem,
  signOpenClawGatewayDevicePayload
} from "./openclaw-gateway-device-auth.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = 0;
  onopen?: (event: unknown) => void;
  onmessage?: (event: { data?: unknown }) => void;
  onclose?: (event: { code?: number; reason?: string }) => void;
  onerror?: (event: unknown) => void;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.closed = true;
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: typeof payload === "string" ? payload : JSON.stringify(payload)
    });
  }

  emitClose(reason = "closed") {
    this.onclose?.({
      code: 1000,
      reason
    });
  }

  static reset() {
    FakeWebSocket.instances = [];
  }
}

test("buildGatewaySocketConnectParams matches the expected ChillClaw connect shape", () => {
  const params = buildGatewaySocketConnectParams({
    token: "gateway-token",
    platform: "darwin",
    clientVersion: "0.1.2"
  });

  assert.deepEqual(params, {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",
      displayName: "ChillClaw daemon",
      version: "0.1.2",
      platform: "darwin",
      mode: "backend"
    },
    caps: ["tool-events"],
    auth: {
      token: "gateway-token"
    },
    role: "operator",
    scopes: ["operator.read", "operator.write"]
  });
});

test("buildGatewaySocketConnectParams signs the shared OpenClaw device identity when one is available", () => {
  const deviceIdentity = {
    deviceId: "device-1",
    publicKeyPem:
      "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA3kHVMyjfDWNaeWsdzN3Yig58LS4VH8PyxvYt+U7UFs4=\n-----END PUBLIC KEY-----\n",
    privateKeyPem:
      "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIL6/2E+luArRvnDydqrxz64M4BxkfkwtgQcRZcOLMAIM\n-----END PRIVATE KEY-----\n"
  };
  const params = buildGatewaySocketConnectParams({
    token: "gateway-token",
    nonce: "nonce-1",
    deviceIdentity,
    platform: "darwin",
    clientVersion: "0.1.2"
  });

  const signedAt = (params.device as { signedAt: number }).signedAt;
  const payload = buildOpenClawGatewayDeviceAuthPayload({
    deviceId: deviceIdentity.deviceId,
    clientId: "gateway-client",
    clientMode: "backend",
    role: "operator",
    scopes: ["operator.read", "operator.write"],
    signedAtMs: signedAt,
    token: "gateway-token",
    nonce: "nonce-1",
    platform: "darwin"
  });

  assert.deepEqual(params.device, {
    id: "device-1",
    publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
    signature: signOpenClawGatewayDevicePayload(deviceIdentity.privateKeyPem, payload),
    signedAt,
    nonce: "nonce-1"
  });
});

test("readGatewayChatText strips OpenClaw wrapper tags from visible assistant text", () => {
  assert.equal(readGatewayChatText("<final>\n\nHello there\n\n</final>"), "Hello there");
  assert.equal(readGatewayChatText("<think>secret</think>\n\n<final>Hello</final>"), "Hello");
  assert.equal(
    readGatewayChatText({
      content: [{ type: "text", text: "<think>secret</think>" }, { type: "text", text: "<final>Hello</final>" }]
    }),
    "Hello"
  );
});

test("gateway socket adapter authenticates and maps chat and tool events", async () => {
  FakeWebSocket.reset();
  const events: Array<Record<string, unknown>> = [];
  const adapter = new OpenClawGatewaySocketAdapter({
    websocketFactory: FakeWebSocket as never,
    readConnectionInfo: async () => ({
      url: "ws://127.0.0.1:4545/rpc/ws",
      token: "gateway-token"
    })
  });

  const unsubscribePromise = adapter.subscribe((event) => {
    events.push(event as Record<string, unknown>);
  });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeWebSocket.instances[0];

  assert.ok(socket);
  assert.equal(socket?.url, "ws://127.0.0.1:4545/rpc/ws");

  socket?.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: {
      nonce: "nonce-1"
    }
  });

  const connectRequest = socket?.sent[0];
  assert.ok(connectRequest);

  const parsedConnectRequest = JSON.parse(connectRequest ?? "{}") as { id?: string; method?: string; params?: unknown };
  assert.equal(parsedConnectRequest.method, "connect");

  socket?.emitMessage({
    id: parsedConnectRequest.id,
    ok: true
  });

  const unsubscribe = await unsubscribePromise;

  socket?.emitMessage({
    type: "event",
    event: "chat",
    payload: {
      sessionKey: "session-1",
      runId: "run-1",
      state: "delta",
      message: {
        content: [{ type: "text", text: "Hello from gateway" }]
      }
    }
  });
  socket?.emitMessage({
    type: "event",
    event: "agent",
    payload: {
      sessionKey: "session-1",
      runId: "run-1",
      data: {
        name: "browser",
        phase: "start"
      }
    }
  });
  socket?.emitMessage({
    type: "event",
    event: "chat",
    payload: {
      sessionKey: "session-1",
      runId: "run-1",
      state: "final"
    }
  });

  assert.deepEqual(events, [
    { type: "connected" },
    {
      type: "assistant-delta",
      sessionKey: "session-1",
      runId: "run-1",
      message: {
        id: "session-1:assistant:stream",
        role: "assistant",
        text: "Hello from gateway",
        status: "streaming"
      }
    },
    {
      type: "assistant-tool-status",
      sessionKey: "session-1",
      runId: "run-1",
      activityLabel: "Using tools: browser",
      toolActivity: {
        id: "browser",
        label: "browser",
        status: "running",
        detail: undefined
      }
    },
    {
      type: "assistant-completed",
      sessionKey: "session-1",
      runId: "run-1"
    }
  ]);

  unsubscribe();
  assert.equal(socket?.closed, true);
});

test("gateway socket adapter can send authenticated request-response calls over the shared backend socket", async () => {
  FakeWebSocket.reset();
  const adapter = new OpenClawGatewaySocketAdapter({
    websocketFactory: FakeWebSocket as never,
    readConnectionInfo: async () => ({
      url: "ws://127.0.0.1:4545/rpc/ws",
      token: "gateway-token"
    })
  });

  const historyPromise = adapter.request<{ messages: Array<{ role: string; text: string }> }>("chat.history", {
    sessionKey: "session-1",
    limit: 50
  });

  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket);

  socket?.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: {
      nonce: "nonce-2"
    }
  });

  const connectRequest = JSON.parse(socket?.sent[0] ?? "{}") as { id?: string };
  socket?.emitMessage({
    id: connectRequest.id,
    ok: true
  });
  await new Promise((resolve) => setImmediate(resolve));

  const historyRequest = JSON.parse(socket?.sent[1] ?? "{}") as {
    id?: string;
    method?: string;
    params?: Record<string, unknown>;
  };
  assert.equal(historyRequest.method, "chat.history");
  assert.deepEqual(historyRequest.params, {
    sessionKey: "session-1",
    limit: 50
  });

  socket?.emitMessage({
    id: historyRequest.id,
    ok: true,
    payload: {
      messages: [{ role: "assistant", text: "History response" }]
    }
  });

  await assert.doesNotReject(historyPromise);
  assert.deepEqual(await historyPromise, {
    messages: [{ role: "assistant", text: "History response" }]
  });
});
