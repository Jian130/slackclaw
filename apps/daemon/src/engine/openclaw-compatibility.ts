import type { EngineCompatibilityCapabilityId } from "@chillclaw/contracts";

type CompatibilitySource = {
  area: string;
  filePaths: string[];
  runtimeModes: Array<"system" | "managed">;
};

interface ChannelListJson {
  chat?: Record<string, string[]>;
  auth?: Array<{ id?: string; provider?: string; type?: string }>;
}

interface ChannelStatusJson {
  channelOrder?: string[];
  channels?: Record<string, { configured?: boolean; running?: boolean }>;
  channelAccounts?: Record<string, Array<{ accountId?: string; enabled?: boolean; configured?: boolean }>>;
}

interface AgentListEntryJson {
  id?: string;
  isDefault?: boolean;
}

interface ModelsStatusJson {
  defaultModel?: string;
  resolvedDefault?: string;
  fallbacks?: string[];
  allowed?: string[];
  auth?: {
    providersWithOAuth?: string[];
  };
}

export const openClawCompatibilitySources: Record<EngineCompatibilityCapabilityId, CompatibilitySource> = {
  "detect-runtime": {
    area: "Deploy",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/deploy/DeployPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "install-managed-runtime": {
    area: "Deploy",
    filePaths: [
      "scripts/bootstrap-openclaw.mjs",
      "apps/daemon/src/engine/openclaw-adapter.ts"
    ],
    runtimeModes: ["managed"]
  },
  "update-runtime": {
    area: "Deploy",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/deploy/DeployPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "uninstall-runtime": {
    area: "Deploy",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/server.ts"
    ],
    runtimeModes: ["system", "managed"]
  },
  "fetch-deployment-targets": {
    area: "Deploy",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/deploy/DeployPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "add-model": {
    area: "Config / Models",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "modify-model": {
    area: "Config / Models",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "remove-model": {
    area: "Config / Models",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/server.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "set-default-model": {
    area: "Config / Models",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "set-fallback-model": {
    area: "Config / Models",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "add-channel": {
    area: "Config / Channels",
    filePaths: [
      "apps/daemon/src/services/channel-setup-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "modify-channel": {
    area: "Config / Channels",
    filePaths: [
      "apps/daemon/src/services/channel-setup-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "remove-channel": {
    area: "Config / Channels",
    filePaths: [
      "apps/daemon/src/services/channel-setup-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/server.ts",
      "apps/desktop-ui/src/features/config/ConfigPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "restart-gateway": {
    area: "Gateway",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/services/channel-setup-service.ts"
    ],
    runtimeModes: ["system", "managed"]
  },
  "verify-gateway-health": {
    area: "Gateway",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/services/overview-service.ts"
    ],
    runtimeModes: ["system", "managed"]
  },
  "run-task-through-default-model": {
    area: "Tasks",
    filePaths: [
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/daemon/src/services/task-service.ts"
    ],
    runtimeModes: ["system", "managed"]
  },
  "list-members": {
    area: "AI Members",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/desktop-ui/src/features/members/MembersPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "create-member": {
    area: "AI Members",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/members/MembersPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "update-member": {
    area: "AI Members",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/members/MembersPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "delete-member": {
    area: "AI Members",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/members/MembersPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "list-teams": {
    area: "AI Team",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/desktop-ui/src/features/team/TeamPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "create-team": {
    area: "AI Team",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/desktop-ui/src/features/team/TeamPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "update-team": {
    area: "AI Team",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/desktop-ui/src/features/team/TeamPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "delete-team": {
    area: "AI Team",
    filePaths: [
      "apps/daemon/src/services/ai-team-service.ts",
      "apps/desktop-ui/src/features/team/TeamPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "run-task-with-member-agent": {
    area: "AI Team / Tasks",
    filePaths: [
      "apps/daemon/src/services/task-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/team/TeamPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "list-chat-threads": {
    area: "Chat",
    filePaths: [
      "apps/daemon/src/services/chat-service.ts",
      "apps/daemon/src/server.ts",
      "apps/desktop-ui/src/features/chat/ChatPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "create-chat-thread": {
    area: "Chat",
    filePaths: [
      "apps/daemon/src/services/chat-service.ts",
      "apps/daemon/src/server.ts",
      "apps/desktop-ui/src/features/chat/ChatPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "load-chat-history": {
    area: "Chat",
    filePaths: [
      "apps/daemon/src/services/chat-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/chat/ChatPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "send-chat-message": {
    area: "Chat",
    filePaths: [
      "apps/daemon/src/services/chat-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/chat/ChatPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  },
  "abort-chat-message": {
    area: "Chat",
    filePaths: [
      "apps/daemon/src/services/chat-service.ts",
      "apps/daemon/src/engine/openclaw-adapter.ts",
      "apps/desktop-ui/src/features/chat/ChatPage.tsx"
    ],
    runtimeModes: ["system", "managed"]
  }
};

export function extractJsonPayload(raw: string): string | undefined {
  const trimmed = raw.trim();

  if (!trimmed) {
    return undefined;
  }

  const lines = trimmed.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const candidate = line.trimStart();
    return candidate.startsWith("{") || (candidate.startsWith("[") && !candidate.startsWith("[plugins]"));
  });

  if (startIndex >= 0) {
    return lines.slice(startIndex).join("\n");
  }

  return undefined;
}

export function parseJsonCommandOutput<T>(raw: string): T | undefined {
  const payload = extractJsonPayload(raw);

  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(payload) as T;
  } catch {
    return undefined;
  }
}

export function summarizeChannelsList(raw: string): {
  configuredChannels: string[];
  authProfileIds: string[];
} {
  const parsed = parseJsonCommandOutput<ChannelListJson>(raw);
  const configuredChannels = Object.keys(parsed?.chat ?? {});
  const authProfileIds = (parsed?.auth ?? []).map((profile) => profile.id).filter((value): value is string => Boolean(value));

  return {
    configuredChannels,
    authProfileIds
  };
}

export function summarizeChannelsStatus(raw: string): {
  channelOrder: string[];
  configuredAccountCount: number;
  runningChannels: string[];
} {
  const parsed = parseJsonCommandOutput<ChannelStatusJson>(raw);
  const channelOrder = parsed?.channelOrder ?? [];
  const configuredAccountCount = Object.values(parsed?.channelAccounts ?? {}).reduce(
    (count, accounts) => count + accounts.filter((account) => account.configured !== false).length,
    0
  );
  const runningChannels = Object.entries(parsed?.channels ?? {})
    .filter(([, channel]) => channel.running)
    .map(([channelId]) => channelId);

  return {
    channelOrder,
    configuredAccountCount,
    runningChannels
  };
}

export function summarizeAgentsList(raw: string): {
  agentIds: string[];
  defaultAgentId?: string;
} {
  const parsed = parseJsonCommandOutput<AgentListEntryJson[]>(raw) ?? [];
  const defaultAgentId = parsed.find((entry) => entry.isDefault)?.id;

  return {
    agentIds: parsed.map((entry) => entry.id).filter((value): value is string => Boolean(value)),
    defaultAgentId
  };
}

export function summarizeModelsStatus(raw: string): {
  defaultModel?: string;
  fallbackCount: number;
  allowedCount: number;
  oauthProviders: string[];
} {
  const parsed = parseJsonCommandOutput<ModelsStatusJson>(raw);

  return {
    defaultModel: parsed?.resolvedDefault ?? parsed?.defaultModel,
    fallbackCount: parsed?.fallbacks?.length ?? 0,
    allowedCount: parsed?.allowed?.length ?? 0,
    oauthProviders: parsed?.auth?.providersWithOAuth ?? []
  };
}
