import type { PluginActionResponse, PluginConfigOverview } from "@slackclaw/contracts";

import { listManagedPluginDefinitions } from "../config/managed-plugins.js";
import type { EngineAdapter } from "../engine/adapter.js";
import { EventPublisher } from "./event-publisher.js";
import { fallbackMutationSyncMeta } from "./mutation-sync.js";

export class PluginService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly eventPublisher?: EventPublisher
  ) {}

  getConfigOverview(): Promise<PluginConfigOverview> {
    return this.getManagedConfigOverview();
  }

  async installPlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.installPlugin(pluginId);
    return this.buildResponse(result.message, this.filterManagedPluginOverview(result.pluginConfig));
  }

  async updatePlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.updatePlugin(pluginId);
    return this.buildResponse(result.message, this.filterManagedPluginOverview(result.pluginConfig));
  }

  async removePlugin(pluginId: string): Promise<PluginActionResponse> {
    const result = await this.adapter.plugins.removePlugin(pluginId);
    return this.buildResponse(result.message, this.filterManagedPluginOverview(result.pluginConfig));
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

  private async getManagedConfigOverview(): Promise<PluginConfigOverview> {
    return this.filterManagedPluginOverview(await this.adapter.plugins.getConfigOverview());
  }

  private filterManagedPluginOverview(pluginConfig: PluginConfigOverview): PluginConfigOverview {
    const managedPluginIds = new Set(listManagedPluginDefinitions().map((definition) => definition.id));

    return {
      entries: pluginConfig.entries.filter((entry) => managedPluginIds.has(entry.id))
    };
  }
}
