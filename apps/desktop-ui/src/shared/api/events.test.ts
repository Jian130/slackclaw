import { afterEach, describe, expect, it, vi } from "vitest";

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closeCallCount = 0;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitMessage(data: string) {
    this.onmessage?.({ data });
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event("close"));
  }

  close() {
    this.closeCallCount += 1;
    this.readyState = FakeWebSocket.CLOSED;
  }

  static reset() {
    FakeWebSocket.instances.length = 0;
  }
}

async function loadEventsModule() {
  return import("./events.js");
}

afterEach(async () => {
  vi.useRealTimers();
  try {
    const events = await loadEventsModule();
    events.resetDaemonEventStateForTests();
  } catch {
    // Ignore when the module does not exist yet during the red phase.
  }
  FakeWebSocket.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("daemon event client", () => {
  it("decodes daemon WebSocket JSON messages", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const events = await loadEventsModule();
    const received: unknown[] = [];
    const states: unknown[] = [];

    const unsubscribe = events.subscribeToDaemonEvents((event) => {
      received.push(event);
    }, undefined, (state) => {
      states.push(state);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:4545/api/events");
    expect(states.at(-1)).toMatchObject({
      connectionState: "connecting",
      lastSeenByResource: {}
    });

    FakeWebSocket.instances[0]?.emitOpen();
    expect(states.at(-1)).toMatchObject({
      connectionState: "connected"
    });

    FakeWebSocket.instances[0]?.emitMessage(
      JSON.stringify({
        type: "overview.updated",
        snapshot: {
          epoch: "epoch-1",
          revision: 4,
          data: {
            appName: "ChillClaw",
            appVersion: "1.0.0",
            platformTarget: "desktop",
            firstRun: {
              status: "completed"
            },
            appService: {
              serviceId: "service",
              installed: true,
              running: true,
              status: "running",
              summary: "Running"
            },
            engine: {
              engine: "openclaw",
              installed: true,
              running: true,
              summary: "Ready",
              lastCheckedAt: "2026-03-27T00:00:00.000Z"
            },
            installSpec: {
              desiredVersion: "1.0.0"
            },
            capabilities: [],
            installChecks: [],
            channelSetup: {
              channels: [],
              gatewaySummary: "Ready"
            },
            profiles: [],
            templates: [],
            healthChecks: [],
            recoveryActions: [],
            recentTasks: []
          }
        }
      })
    );

    expect(received).toEqual([
      {
        type: "overview.updated",
        snapshot: expect.objectContaining({
          epoch: "epoch-1",
          revision: 4
        })
      }
    ]);
    expect(events.getDaemonResourceRevision("overview")).toEqual({
      epoch: "epoch-1",
      revision: 4
    });

    unsubscribe();
  });

  it("tracks plugin-config revisions from retained daemon snapshots", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const events = await loadEventsModule();
    const unsubscribe = events.subscribeToDaemonEvents(() => undefined);

    FakeWebSocket.instances[0]?.emitMessage(
      JSON.stringify({
        type: "plugin-config.updated",
        snapshot: {
          epoch: "epoch-plugin",
          revision: 2,
          data: {
            entries: []
          }
        }
      })
    );

    expect(events.getDaemonResourceRevision("plugin-config")).toEqual({
      epoch: "epoch-plugin",
      revision: 2
    });

    unsubscribe();
  });

  it("reconnects after the socket closes while listeners remain", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const events = await loadEventsModule();

    const unsubscribe = events.subscribeToDaemonEvents(() => undefined);

    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.emitClose();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe("ws://127.0.0.1:4545/api/events");

    unsubscribe();
  });

  it("shares one socket across subscribers and closes it after the last unsubscribe", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const events = await loadEventsModule();

    const firstUnsubscribe = events.subscribeToDaemonEvents(() => undefined);
    const secondUnsubscribe = events.subscribeToDaemonEvents(() => undefined);

    expect(FakeWebSocket.instances).toHaveLength(1);

    firstUnsubscribe();
    expect(FakeWebSocket.instances[0]?.closeCallCount).toBe(0);

    secondUnsubscribe();

    expect(FakeWebSocket.instances[0]?.closeCallCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
