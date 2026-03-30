import type { SupportedChannelId } from "@slackclaw/contracts";

export type ManagedFeatureId = "channel:wechat-work" | "channel:wechat";
export type ManagedFeatureSetupKind = "credential-form" | "session";

export type ManagedFeaturePrerequisite =
  | {
      type: "openclaw-plugin";
      pluginId: string;
      displayName: string;
    }
  | {
      type: "external-installer";
      installerId: string;
      displayName: string;
      command: string[];
    };

export interface ManagedFeatureDefinition {
  id: ManagedFeatureId;
  kind: "channel";
  channelId: SupportedChannelId;
  label: string;
  setupKind: ManagedFeatureSetupKind;
  prerequisites: ManagedFeaturePrerequisite[];
}

const managedFeatureDefinitions = [
  {
    id: "channel:wechat-work",
    kind: "channel",
    channelId: "wechat-work",
    label: "WeChat Work",
    setupKind: "credential-form",
    prerequisites: [
      {
        type: "openclaw-plugin",
        pluginId: "wecom",
        displayName: "WeCom Plugin"
      }
    ]
  },
  {
    id: "channel:wechat",
    kind: "channel",
    channelId: "wechat",
    label: "WeChat",
    setupKind: "session",
    prerequisites: [
      {
        type: "external-installer",
        installerId: "@tencent-weixin/openclaw-weixin-cli",
        displayName: "Personal WeChat installer",
        command: ["npm", "install", "@tencent-weixin/openclaw-weixin-cli@latest"]
      }
    ]
  }
] satisfies ManagedFeatureDefinition[];

export function listManagedFeatureDefinitions(): ManagedFeatureDefinition[] {
  return managedFeatureDefinitions;
}

export function managedFeatureDefinitionById(featureId: ManagedFeatureId): ManagedFeatureDefinition | undefined {
  return managedFeatureDefinitions.find((feature) => feature.id === featureId);
}

export function managedFeatureDefinitionForChannel(channelId: SupportedChannelId): ManagedFeatureDefinition | undefined {
  return managedFeatureDefinitions.find((feature) => feature.kind === "channel" && feature.channelId === channelId);
}

export function managedFeatureIdForChannel(channelId: SupportedChannelId): ManagedFeatureId | undefined {
  return managedFeatureDefinitionForChannel(channelId)?.id;
}

export function isPluginBackedManagedFeature(featureId: string): featureId is ManagedFeatureId {
  const definition = managedFeatureDefinitions.find((feature) => feature.id === featureId);
  return Boolean(definition?.prerequisites.some((prerequisite) => prerequisite.type === "openclaw-plugin"));
}
