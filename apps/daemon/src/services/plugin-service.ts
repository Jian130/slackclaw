import type { PluginActionResponse, PluginConfigOverview } from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { EventPublisher } from "./event-publisher.js";
import { fallbackMutationSyncMeta } from "./mutation-sync.js";

export class PluginService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly eventPublisher?: EventPublisher
  ) {}

  getConfigOverview(): Promise<PluginConfigOverview> {
    return this.adapter.plugins.getConfigOverview();
  }

  async installPlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.installPlugin(pluginId);
    return this.buildResponse(result.message, result.pluginConfig);
  }

  async updatePlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.updatePlugin(pluginId);
    return this.buildResponse(result.message, result.pluginConfig);
  }

  async removePlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.removePlugin(pluginId);
    return this.buildResponse(result.message, result.pluginConfig);
  }

  private buildResponse(message: string, pluginConfig: PluginConfigOverview): PluginActionResponse {
    const sync = this.eventPublisher?.publishPluginConfigUpdated(pluginConfig) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message,
      pluginConfig
    };
  }
}
