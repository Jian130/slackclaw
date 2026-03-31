import type { PluginConfigOverview, SupportedChannelId } from "@chillclaw/contracts";

import {
  managedFeatureDefinitionById,
  managedFeatureDefinitionForChannel,
  type ManagedFeatureDefinition,
  type ManagedFeatureId
} from "../config/managed-features.js";
import type { EngineAdapter } from "../engine/adapter.js";

export type PreparedFeaturePrerequisite =
  | {
      type: "openclaw-plugin";
      status: "ready";
      pluginId: string;
      displayName: string;
    }
  | {
      type: "external-installer";
      status: "queued";
      installerId: string;
      displayName: string;
      command: string[];
    };

export interface FeaturePreparationResult {
  feature: ManagedFeatureDefinition;
  prerequisites: PreparedFeaturePrerequisite[];
  pluginConfig?: PluginConfigOverview;
}

export class FeatureWorkflowService {
  constructor(private readonly adapter: EngineAdapter) {}

  async prepareChannel(channelId: SupportedChannelId): Promise<FeaturePreparationResult | undefined> {
    const feature = managedFeatureDefinitionForChannel(channelId);
    if (!feature) {
      return undefined;
    }

    return this.prepareFeature(feature.id);
  }

  async prepareFeature(featureId: ManagedFeatureId): Promise<FeaturePreparationResult> {
    const feature = managedFeatureDefinitionById(featureId);
    if (!feature) {
      throw new Error(`Unknown managed feature: ${featureId}`);
    }

    let pluginConfig: PluginConfigOverview | undefined;
    const prerequisites: PreparedFeaturePrerequisite[] = [];

    for (const prerequisite of feature.prerequisites) {
      if (prerequisite.type === "openclaw-plugin") {
        pluginConfig = await this.adapter.plugins.ensureFeatureRequirements(feature.id, {
          deferGatewayRestart: true
        });
        prerequisites.push({
          type: "openclaw-plugin",
          status: "ready",
          pluginId: prerequisite.pluginId,
          displayName: prerequisite.displayName
        });
        continue;
      }

      prerequisites.push({
        type: "external-installer",
        status: "queued",
        installerId: prerequisite.installerId,
        displayName: prerequisite.displayName,
        command: prerequisite.command
      });
    }

    return {
      feature,
      prerequisites,
      pluginConfig
    };
  }
}
