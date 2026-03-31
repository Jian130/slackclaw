import type { PluginConfigOverview } from "@chillclaw/contracts";

import type { PluginManager } from "./adapter.js";

type PluginAccess = {
  getConfigOverview: () => Promise<PluginConfigOverview>;
  ensureFeatureRequirements: (featureId: string, options?: { deferGatewayRestart?: boolean }) => Promise<PluginConfigOverview>;
  installPlugin: (pluginId: string) => Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
  updatePlugin: (pluginId: string) => Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
  removePlugin: (pluginId: string) => Promise<{ message: string; pluginConfig: PluginConfigOverview }>;
};

export class OpenClawPluginManager implements PluginManager {
  constructor(private readonly access: PluginAccess) {}

  getConfigOverview() {
    return this.access.getConfigOverview();
  }

  ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }) {
    return this.access.ensureFeatureRequirements(featureId, options);
  }

  installPlugin(pluginId: string) {
    return this.access.installPlugin(pluginId);
  }

  updatePlugin(pluginId: string) {
    return this.access.updatePlugin(pluginId);
  }

  removePlugin(pluginId: string) {
    return this.access.removePlugin(pluginId);
  }
}
