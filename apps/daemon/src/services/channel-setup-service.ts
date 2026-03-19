import type {
  ChannelConfigActionResponse,
  ChannelConfigOverview,
  ChannelCapability,
  ChannelFieldSummary,
  ChannelSessionInputRequest,
  ChannelSessionResponse,
  ChannelSetupOverview,
  ChannelSetupState,
  ConfiguredChannelEntry,
  RemoveChannelEntryRequest,
  SaveChannelEntryRequest,
  SupportedChannelId
} from "@slackclaw/contracts";
import { createDefaultProductOverview } from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import type { AppState } from "./state-store.js";
import { StateStore, type StoredChannelEntryState } from "./state-store.js";

const CHANNEL_ORDER: SupportedChannelId[] = ["telegram", "whatsapp", "feishu", "wechat"];
const CHANNEL_ENTRY_IDS: Record<SupportedChannelId, string> = {
  telegram: "telegram:default",
  whatsapp: "whatsapp:default",
  feishu: "feishu:default",
  wechat: "wechat:default"
};

const CHANNEL_CAPABILITIES: ChannelCapability[] = [
  {
    id: "telegram",
    label: "Telegram",
    description: "Configure the Telegram bot token, then approve the first pairing request.",
    officialSupport: true,
    iconKey: "TG",
    docsUrl: "https://docs.openclaw.ai/cli/channels",
    fieldDefs: [
      { id: "token", label: "Bot token", required: true, secret: true, placeholder: "123456:AA..." },
      { id: "accountName", label: "Account name", required: false, placeholder: "Support Bot" },
      { id: "code", label: "Pairing code", required: false, placeholder: "Paste pairing code when prompted" }
    ],
    supportsEdit: true,
    supportsRemove: true,
    supportsPairing: true,
    supportsLogin: false
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Start the login flow, then approve the pairing code from OpenClaw.",
    officialSupport: true,
    iconKey: "WA",
    docsUrl: "https://docs.openclaw.ai/cli/channels",
    fieldDefs: [{ id: "code", label: "Pairing code", required: false, placeholder: "Paste pairing code when OpenClaw shows it" }],
    supportsEdit: true,
    supportsRemove: true,
    supportsPairing: true,
    supportsLogin: true
  },
  {
    id: "feishu",
    label: "Feishu (飞书)",
    description: "Prepare the official Feishu flow, save app credentials, then approve pairing.",
    officialSupport: true,
    iconKey: "飞",
    docsUrl: "https://docs.openclaw.ai/channels/feishu",
    fieldDefs: [
      { id: "appId", label: "App ID", required: true },
      { id: "appSecret", label: "App Secret", required: true, secret: true },
      {
        id: "domain",
        label: "Domain",
        required: false,
        kind: "select",
        options: [
          { value: "feishu", label: "feishu" },
          { value: "lark", label: "lark" }
        ]
      },
      { id: "botName", label: "Bot name", required: false, placeholder: "SlackClaw Assistant" },
      { id: "code", label: "Pairing code", required: false, placeholder: "Paste pairing code when prompted" }
    ],
    supportsEdit: true,
    supportsRemove: true,
    supportsPairing: true,
    supportsLogin: false,
    guidedSetupKind: "feishu"
  },
  {
    id: "wechat",
    label: "WeChat workaround",
    description: "Use the workaround plugin path, then save the app credentials into OpenClaw.",
    officialSupport: false,
    iconKey: "WX",
    docsUrl: "https://docs.openclaw.ai/cli/config",
    fieldDefs: [
      { id: "pluginSpec", label: "Plugin package", required: false, placeholder: "@openclaw-china/wecom-app" },
      { id: "corpId", label: "Corp ID", required: true },
      { id: "agentId", label: "Agent ID", required: true },
      { id: "secret", label: "Secret", required: true, secret: true },
      { id: "token", label: "Webhook token", required: true, secret: true },
      { id: "encodingAesKey", label: "Encoding AES key", required: true, secret: true }
    ],
    supportsEdit: true,
    supportsRemove: true,
    supportsPairing: false,
    supportsLogin: false,
    guidedSetupKind: "wechat"
  }
];

function defaultChannelMap(): Record<SupportedChannelId, ChannelSetupState> {
  const defaults = createDefaultProductOverview().channelSetup.channels;

  return {
    telegram: defaults.find((channel) => channel.id === "telegram")!,
    whatsapp: defaults.find((channel) => channel.id === "whatsapp")!,
    feishu: defaults.find((channel) => channel.id === "feishu")!,
    wechat: defaults.find((channel) => channel.id === "wechat")!
  };
}

function mergeChannelStates(
  stored: Record<string, ChannelSetupState> | undefined,
  live: Partial<Record<SupportedChannelId, ChannelSetupState>>
): Record<SupportedChannelId, ChannelSetupState> {
  const defaults = defaultChannelMap();

  return {
    telegram: live.telegram ?? stored?.telegram ?? defaults.telegram,
    whatsapp: live.whatsapp ?? stored?.whatsapp ?? defaults.whatsapp,
    feishu: live.feishu ?? stored?.feishu ?? defaults.feishu,
    wechat: live.wechat ?? stored?.wechat ?? defaults.wechat
  };
}

function nextChannelId(channels: Record<SupportedChannelId, ChannelSetupState>): SupportedChannelId | undefined {
  return CHANNEL_ORDER.find((channelId) => channels[channelId].status !== "completed");
}

function capabilityFor(channelId: SupportedChannelId): ChannelCapability {
  return CHANNEL_CAPABILITIES.find((capability) => capability.id === channelId)!;
}

function channelTitle(channelId: SupportedChannelId): string {
  return capabilityFor(channelId).label;
}

function entryIdFor(channelId: SupportedChannelId): string {
  return CHANNEL_ENTRY_IDS[channelId];
}

function labelFor(channelId: SupportedChannelId, values: Record<string, string>): string {
  if (channelId === "telegram" && values.accountName?.trim()) {
    return values.accountName.trim();
  }

  if (channelId === "feishu" && values.botName?.trim()) {
    return values.botName.trim();
  }

  return channelTitle(channelId);
}

function editableValuesFor(channelId: SupportedChannelId, values: Record<string, string>): Record<string, string> {
  switch (channelId) {
    case "telegram":
      return values.accountName?.trim() ? { accountName: values.accountName.trim() } : {};
    case "feishu":
      return {
        ...(values.appId?.trim() ? { appId: values.appId.trim() } : {}),
        ...(values.domain?.trim() ? { domain: values.domain.trim() } : { domain: "feishu" }),
        ...(values.botName?.trim() ? { botName: values.botName.trim() } : {})
      };
    case "wechat":
      return {
        ...(values.pluginSpec?.trim() ? { pluginSpec: values.pluginSpec.trim() } : { pluginSpec: "@openclaw-china/wecom-app" }),
        ...(values.corpId?.trim() ? { corpId: values.corpId.trim() } : {}),
        ...(values.agentId?.trim() ? { agentId: values.agentId.trim() } : {})
      };
    case "whatsapp":
    default:
      return {};
  }
}

function maskValue(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Saved";
  }

  if (trimmed.length <= 6) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
}

function maskedSummaryFor(channelId: SupportedChannelId, values: Record<string, string>): ChannelFieldSummary[] {
  switch (channelId) {
    case "telegram":
      return values.token?.trim()
        ? [
            { label: "Bot token", value: maskValue(values.token) },
            ...(values.accountName?.trim() ? [{ label: "Account name", value: values.accountName.trim() }] : [])
          ]
        : [];
    case "whatsapp":
      return [{ label: "Login", value: "Linked through OpenClaw login flow" }];
    case "feishu":
      return [
        ...(values.appId?.trim() ? [{ label: "App ID", value: values.appId.trim() }] : []),
        ...(values.domain?.trim() ? [{ label: "Domain", value: values.domain.trim() }] : [{ label: "Domain", value: "feishu" }]),
        ...(values.botName?.trim() ? [{ label: "Bot name", value: values.botName.trim() }] : []),
        ...(values.appSecret?.trim() ? [{ label: "App Secret", value: maskValue(values.appSecret) }] : [])
      ];
    case "wechat":
      return [
        ...(values.pluginSpec?.trim() ? [{ label: "Plugin", value: values.pluginSpec.trim() }] : [{ label: "Plugin", value: "@openclaw-china/wecom-app" }]),
        ...(values.corpId?.trim() ? [{ label: "Corp ID", value: values.corpId.trim() }] : []),
        ...(values.agentId?.trim() ? [{ label: "Agent ID", value: values.agentId.trim() }] : []),
        ...(values.secret?.trim() ? [{ label: "Secret", value: maskValue(values.secret) }] : []),
        ...(values.token?.trim() ? [{ label: "Webhook token", value: maskValue(values.token) }] : []),
        ...(values.encodingAesKey?.trim() ? [{ label: "Encoding AES key", value: maskValue(values.encodingAesKey) }] : [])
      ];
  }
}

function buildEntry(
  record: StoredChannelEntryState,
  channelState: ChannelSetupState
): ConfiguredChannelEntry {
  return {
    id: record.id,
    channelId: record.channelId,
    label: record.label,
    status: channelState.status,
    summary: channelState.summary,
    detail: channelState.detail,
    maskedConfigSummary: record.maskedConfigSummary,
    editableValues: record.editableValues,
    pairingRequired: channelState.status === "awaiting-pairing",
    lastUpdatedAt: channelState.lastUpdatedAt ?? record.lastUpdatedAt
  };
}

function mergeLiveAndStoredEntry(
  liveEntry: ConfiguredChannelEntry,
  record: StoredChannelEntryState | undefined
): ConfiguredChannelEntry {
  if (!record) {
    return liveEntry;
  }

  return {
    ...liveEntry,
    label: record.label || liveEntry.label,
    maskedConfigSummary: record.maskedConfigSummary.length > 0 ? record.maskedConfigSummary : liveEntry.maskedConfigSummary,
    editableValues: Object.keys(record.editableValues).length > 0 ? record.editableValues : liveEntry.editableValues,
    lastUpdatedAt: record.lastUpdatedAt ?? liveEntry.lastUpdatedAt
  };
}

function legacyEntryFromState(channelState: ChannelSetupState): StoredChannelEntryState | undefined {
  if (channelState.status === "not-started") {
    return undefined;
  }

  return {
    id: entryIdFor(channelState.id),
    channelId: channelState.id,
    label: channelState.title,
    editableValues: {},
    maskedConfigSummary: [],
    lastUpdatedAt: channelState.lastUpdatedAt ?? new Date().toISOString()
  };
}

function gatewaySummary(
  onboardingCompleted: boolean,
  gatewayStartedAt: string | undefined,
  channels: Record<SupportedChannelId, ChannelSetupState>
): string {
  const nextId = onboardingCompleted ? nextChannelId(channels) : undefined;

  if (gatewayStartedAt) {
    return "Gateway restarted after channel setup.";
  }

  if (nextId) {
    return `Next recommended channel: ${channels[nextId].title}.`;
  }

  return "All channel setup steps are complete.";
}

export class ChannelSetupService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore
  ) {}

  async getOverviewFromState(state?: AppState): Promise<ChannelSetupOverview> {
    const current = state ?? (await this.store.read());
    const liveChannels = await this.readLiveChannelStates();
    const onboardingCompleted = true;
    const channels = mergeChannelStates(current.channelOnboarding?.channels, liveChannels);
    const nextId = nextChannelId(channels);
    const gatewayStarted = Boolean(current.channelOnboarding?.gatewayStartedAt);

    return {
      baseOnboardingCompleted: onboardingCompleted,
      channels: CHANNEL_ORDER.map((id) => channels[id]),
      nextChannelId: nextId,
      gatewayStarted,
      gatewaySummary: gatewaySummary(onboardingCompleted, current.channelOnboarding?.gatewayStartedAt, channels)
    };
  }

  async getConfigOverview(state?: AppState): Promise<ChannelConfigOverview> {
    const current = state ?? (await this.store.read());
    const liveChannels = await this.readLiveChannelStates();
    const liveEntries = await this.adapter.getConfiguredChannelEntries();
    const channels = mergeChannelStates(current.channelOnboarding?.channels, liveChannels);
    const onboardingCompleted = true;
    const storedEntries = current.channelOnboarding?.entries ?? {};
    const entriesById = new Map<string, ConfiguredChannelEntry>();

    for (const liveEntry of liveEntries) {
      entriesById.set(liveEntry.id, mergeLiveAndStoredEntry(liveEntry, storedEntries[liveEntry.id]));
    }

    for (const channelId of CHANNEL_ORDER) {
      const record = storedEntries[entryIdFor(channelId)] ?? legacyEntryFromState(channels[channelId]);
      const fallbackEntry = record ? buildEntry(record, channels[channelId]) : undefined;
      if (!fallbackEntry) {
        continue;
      }

      if (!entriesById.has(fallbackEntry.id)) {
        entriesById.set(fallbackEntry.id, fallbackEntry);
      }
    }

    const entries = [...entriesById.values()].sort((left, right) => {
      const channelDelta = CHANNEL_ORDER.indexOf(left.channelId) - CHANNEL_ORDER.indexOf(right.channelId);
      if (channelDelta !== 0) {
        return channelDelta;
      }

      return left.label.localeCompare(right.label);
    });

    return {
      baseOnboardingCompleted: onboardingCompleted,
      capabilities: CHANNEL_CAPABILITIES,
      entries,
      activeSession: await this.adapter.getActiveChannelSession(),
      gatewaySummary: gatewaySummary(onboardingCompleted, current.channelOnboarding?.gatewayStartedAt, channels)
    };
  }

  async saveEntry(entryId: string | undefined, request: SaveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
    const result = await this.adapter.saveChannelEntry({ ...request, entryId });
    const channelId = request.channelId;
    const now = new Date().toISOString();
    const shouldPersistEntry = request.action !== "prepare";
    const nextEntryId = entryId ?? entryIdFor(channelId);
    const gatewayRestarted = request.action === "save" || request.action === "login";

    const nextState = await this.store.update((current) => {
      const existingEntries = current.channelOnboarding?.entries ?? {};
      const nextEntries = { ...existingEntries };

      if (shouldPersistEntry) {
        nextEntries[nextEntryId] = {
          id: nextEntryId,
          channelId,
          label: labelFor(channelId, request.values),
          editableValues: channelId === "whatsapp" && existingEntries[nextEntryId]
            ? existingEntries[nextEntryId].editableValues
            : editableValuesFor(channelId, request.values),
          maskedConfigSummary:
            request.action === "approve-pairing" && existingEntries[nextEntryId]
              ? existingEntries[nextEntryId].maskedConfigSummary
              : maskedSummaryFor(channelId, request.values),
          lastUpdatedAt: now
        };
      }

      return {
        ...current,
        channelOnboarding: {
          baseOnboardingCompletedAt: current.channelOnboarding?.baseOnboardingCompletedAt ?? now,
          gatewayStartedAt: gatewayRestarted ? now : current.channelOnboarding?.gatewayStartedAt,
          channels: {
            ...mergeChannelStates(current.channelOnboarding?.channels, {}),
            [channelId]: result.channel
          },
          entries: nextEntries
        }
      };
    });

    return {
      status: result.session ? "interactive" : "completed",
      message: result.message,
      channelConfig: await this.getConfigOverview(nextState),
      session: result.session
    };
  }

  async removeEntry(request: RemoveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
    const current = await this.store.read();
    const record =
      current.channelOnboarding?.entries?.[request.entryId] ??
      (() => {
        const channelId = request.channelId ?? (request.entryId.split(":")[0] as SupportedChannelId);
        return legacyEntryFromState((current.channelOnboarding?.channels?.[channelId] ?? defaultChannelMap()[channelId]) as ChannelSetupState);
      })();

    if (!record) {
      throw new Error("SlackClaw could not find that saved channel entry.");
    }

    const result = await this.adapter.removeChannelEntry({
      ...request,
      channelId: record.channelId,
      values: record.editableValues
    });

    const defaults = defaultChannelMap();
    const nextState = await this.store.update((next) => {
      const entries = { ...(next.channelOnboarding?.entries ?? {}) };
      delete entries[request.entryId];

      return {
        ...next,
        channelOnboarding: {
          baseOnboardingCompletedAt: next.channelOnboarding?.baseOnboardingCompletedAt ?? new Date().toISOString(),
          gatewayStartedAt: new Date().toISOString(),
          channels: {
            ...mergeChannelStates(next.channelOnboarding?.channels, {}),
            [result.channelId]: defaults[result.channelId]
          },
          entries
        }
      };
    });

    return {
      status: "completed",
      message: result.message,
      channelConfig: await this.getConfigOverview(nextState)
    };
  }

  async getSession(sessionId: string): Promise<ChannelSessionResponse> {
    return {
      session: await this.adapter.getChannelSession(sessionId),
      channelConfig: await this.getConfigOverview()
    };
  }

  async submitSessionInput(sessionId: string, request: ChannelSessionInputRequest): Promise<ChannelSessionResponse> {
    return {
      session: await this.adapter.submitChannelSessionInput(sessionId, request),
      channelConfig: await this.getConfigOverview()
    };
  }

  private async readLiveChannelStates(): Promise<Partial<Record<SupportedChannelId, ChannelSetupState>>> {
    const live = await Promise.all(CHANNEL_ORDER.map(async (channelId) => [channelId, await this.adapter.getChannelState(channelId)] as const));
    return Object.fromEntries(live) as Partial<Record<SupportedChannelId, ChannelSetupState>>;
  }
}
