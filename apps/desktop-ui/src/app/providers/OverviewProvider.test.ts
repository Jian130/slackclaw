import { describe, expect, it } from "vitest";

import { shouldRefreshOverviewForEvent } from "./OverviewProvider.js";

describe("OverviewProvider helpers", () => {
  it("refreshes overview for deploy and gateway events but ignores pushed snapshots", () => {
    expect(
      shouldRefreshOverviewForEvent({
        type: "deploy.completed",
        correlationId: "corr-1",
        targetId: "managed-local",
        status: "completed",
        message: "Installed.",
        engineStatus: {
          engine: "openclaw",
          installed: true,
          running: false,
          summary: "Installed",
          lastCheckedAt: new Date().toISOString()
        }
      })
    ).toBe(true);

    expect(
      shouldRefreshOverviewForEvent({
        type: "gateway.status",
        reachable: true,
        pendingGatewayApply: false,
        summary: "Gateway is healthy."
      })
    ).toBe(true);

    expect(
      shouldRefreshOverviewForEvent({
        type: "channel-config.updated",
        snapshot: {
          epoch: "epoch-1",
          revision: 2,
          data: {
            baseOnboardingCompleted: false,
            capabilities: [],
            entries: [],
            gatewaySummary: "Ready"
          }
        }
      })
    ).toBe(false);

    expect(
      shouldRefreshOverviewForEvent({
        type: "task.progress",
        taskId: "task-1",
        status: "completed",
        message: "Task completed."
      })
    ).toBe(true);
  });

  it("ignores chat-only and task-only events for overview refresh", () => {
    expect(
      shouldRefreshOverviewForEvent({
        type: "chat.stream",
        threadId: "thread-1",
        sessionKey: "session-1",
        payload: {
          type: "assistant-failed",
          threadId: "thread-1",
          error: "Done"
        }
      })
    ).toBe(false);

    expect(
      shouldRefreshOverviewForEvent({
        type: "task.progress",
        taskId: "task-1",
        status: "running",
        message: "Working"
      })
    ).toBe(false);
  });
});
