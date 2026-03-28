export type ManagedFeatureId = "channel:wechat-work";

export interface ManagedPluginDefinition {
  id: string;
  label: string;
  packageSpec: string;
  runtimePluginId: string;
  configKey: string;
  dependencies: Array<{
    id: ManagedFeatureId;
    label: string;
    kind: "channel";
    summary: string;
  }>;
}

const managedPluginDefinitions = [
  {
    id: "wecom",
    label: "WeCom Plugin",
    packageSpec: "@wecom/wecom-openclaw-plugin",
    runtimePluginId: "wecom-openclaw-plugin",
    configKey: "wecom-openclaw-plugin",
    dependencies: [
      {
        id: "channel:wechat-work",
        label: "WeChat Work",
        kind: "channel",
        summary: "Required for the managed WeChat Work channel."
      }
    ]
  }
] satisfies ManagedPluginDefinition[];

export function listManagedPluginDefinitions(): ManagedPluginDefinition[] {
  return managedPluginDefinitions;
}

export function managedPluginDefinitionById(pluginId: string): ManagedPluginDefinition | undefined {
  return managedPluginDefinitions.find((plugin) => plugin.id === pluginId);
}

export function managedPluginDefinitionForFeature(featureId: ManagedFeatureId): ManagedPluginDefinition | undefined {
  return managedPluginDefinitions.find((plugin) => plugin.dependencies.some((dependency) => dependency.id === featureId));
}

export function managedFeatureIdForChannel(channelId: string): ManagedFeatureId | undefined {
  switch (channelId) {
    case "wechat-work":
      return "channel:wechat-work";
    default:
      return undefined;
  }
}
