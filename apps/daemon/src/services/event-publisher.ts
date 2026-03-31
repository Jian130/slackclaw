import type {
  AITeamOverview,
  ChatStreamEvent,
  ChannelSession,
  ChannelConfigOverview,
  DeploymentTargetId,
  EngineStatus,
  ModelConfigOverview,
  MutationSyncMeta,
  PluginConfigOverview,
  PresetSkillSyncOverview,
  ProductOverview,
  RevisionedSnapshot,
  ChillClawDeployPhase,
  ChillClawTaskProgressStatus,
  SkillCatalogOverview,
  SupportedChannelId
} from "@chillclaw/contracts";

import { EventBusService } from "./event-bus-service.js";
import { RevisionStore, type RevisionedResource } from "./revision-store.js";

export class EventPublisher {
  constructor(
    private readonly bus: EventBusService,
    private readonly revisions = new RevisionStore()
  ) {}

  publishDeployProgress(args: {
    correlationId: string;
    targetId: DeploymentTargetId;
    phase: ChillClawDeployPhase;
    percent?: number;
    message: string;
  }): void {
    this.bus.publish({
      type: "deploy.progress",
      ...args
    });
  }

  publishDeployCompleted(args: {
    correlationId: string;
    targetId: DeploymentTargetId;
    status: "completed" | "failed";
    message: string;
    engineStatus: EngineStatus;
  }): void {
    this.bus.publish({
      type: "deploy.completed",
      ...args
    });
  }

  publishGatewayStatus(args: { reachable: boolean; pendingGatewayApply: boolean; summary: string }): void {
    this.bus.publish({
      type: "gateway.status",
      ...args
    });
  }

  publishTaskProgress(args: { taskId: string; status: ChillClawTaskProgressStatus; message: string }): void {
    this.bus.publish({
      type: "task.progress",
      ...args
    });
  }

  publishChatStream(args: {
    threadId: string;
    sessionKey: string;
    payload: ChatStreamEvent;
  }): void {
    this.bus.publish({
      type: "chat.stream",
      ...args
    });
  }

  publishOverviewUpdated(overview: ProductOverview): MutationSyncMeta {
    return this.publishSnapshot("overview", overview, (snapshot) => ({
      type: "overview.updated",
      snapshot
    }));
  }

  publishAITeamUpdated(overview: AITeamOverview): MutationSyncMeta {
    return this.publishSnapshot("ai-team", overview, (snapshot) => ({
      type: "ai-team.updated",
      snapshot
    }));
  }

  publishModelConfigUpdated(modelConfig: ModelConfigOverview): MutationSyncMeta {
    return this.publishSnapshot("model-config", modelConfig, (snapshot) => ({
      type: "model-config.updated",
      snapshot
    }));
  }

  publishChannelConfigUpdated(channelConfig: ChannelConfigOverview): MutationSyncMeta {
    return this.publishSnapshot("channel-config", channelConfig, (snapshot) => ({
      type: "channel-config.updated",
      snapshot
    }));
  }

  publishPluginConfigUpdated(pluginConfig: PluginConfigOverview): MutationSyncMeta {
    return this.publishSnapshot("plugin-config", pluginConfig, (snapshot) => ({
      type: "plugin-config.updated",
      snapshot
    }));
  }

  publishSkillCatalogUpdated(skillConfig: SkillCatalogOverview): MutationSyncMeta {
    return this.publishSnapshot("skill-catalog", skillConfig, (snapshot) => ({
      type: "skill-catalog.updated",
      snapshot
    }));
  }

  publishPresetSkillSyncUpdated(presetSkillSync: PresetSkillSyncOverview): MutationSyncMeta {
    return this.publishSnapshot("preset-skill-sync", presetSkillSync, (snapshot) => ({
      type: "preset-skill-sync.updated",
      snapshot
    }));
  }

  publishChannelSessionUpdated(args: { channelId: SupportedChannelId; session: ChannelSession }): void {
    this.bus.publish({
      type: "channel.session.updated",
      ...args
    });
  }

  private publishSnapshot<T>(
    resource: RevisionedResource,
    data: T,
    buildEvent: (snapshot: RevisionedSnapshot<T>) => Parameters<EventBusService["publish"]>[0]
  ): MutationSyncMeta {
    const snapshot = this.revisions.nextSnapshot(resource, data);
    this.bus.publish(buildEvent(snapshot));
    return this.revisions.toMutationMeta(snapshot, true);
  }
}
