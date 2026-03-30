import type { EngineTaskRequest, EngineTaskResult } from "@slackclaw/contracts";
import { randomUUID } from "node:crypto";

import type { EngineAdapter } from "../engine/adapter.js";
import { EventPublisher } from "./event-publisher.js";
import { StateStore } from "./state-store.js";

export class TaskService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly eventPublisher?: EventPublisher
  ) {}

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    const state = await this.store.read();
    const member = request.memberId ? state.aiTeam?.members?.[request.memberId] : undefined;
    const fallbackTaskId = randomUUID();

    try {
      const result = await this.adapter.gateway.runTask({
        ...request,
        memberAgentId: member?.agentId
      });

      await this.store.update((current) => ({
        ...current,
        tasks: [...current.tasks, result].slice(-20)
      }));

      this.eventPublisher?.publishTaskProgress({
        taskId: result.taskId,
        status: result.status,
        message: result.summary
      });

      return result;
    } catch (error) {
      this.eventPublisher?.publishTaskProgress({
        taskId: fallbackTaskId,
        status: "failed",
        message: error instanceof Error ? error.message : "SlackClaw task failed."
      });
      throw error;
    }
  }
}
