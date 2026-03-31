import { rm } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  BindAIMemberChannelRequest,
  DeleteAIMemberRequest,
  MemberBindingSummary,
  ModelCatalogEntry
} from "@chillclaw/contracts";

import {
  canUseTokenPasteAuth,
  providerDefinitionById,
  resolveTokenAuthProvider,
  type InternalModelProviderConfig
} from "../config/openclaw-model-provider-catalog.js";
import { modelAuthSecretName } from "../platform/secrets-adapter.js";
import { resolveReadableMemberAgentId } from "./member-agent-id.js";
import type {
  AIMemberRuntimeCandidate,
  AIMemberRuntimeRequest,
  AIMemberRuntimeState
} from "./adapter.js";

const PERSONAL_WECHAT_RUNTIME_CHANNEL_KEY = "openclaw-weixin";
const CANONICAL_WECOM_CHANNEL_KEY = "wecom";
const LEGACY_WECOM_CHANNEL_KEY = "wecom-openclaw-plugin";

type SavedModelEntryLike = {
  id: string;
  label: string;
  providerId: string;
  modelKey: string;
  agentDir?: string;
  workspaceDir?: string;
  authMethodId?: string;
  profileIds?: string[];
};

type OpenClawAgentEntry = {
  id?: string;
  workspace?: string;
  agentDir?: string;
};

type OpenClawAgentBindingJsonEntry = {
  agentId?: string;
  id?: string;
  bind?: string;
  target?: string;
  channel?: string;
  account?: string;
  accountId?: string;
  route?: string;
  description?: string;
  match?: {
    channel?: string;
    account?: string;
    accountId?: string;
    route?: string;
  };
};

type OpenClawAuthProfileStoreJson = {
  version?: number;
  profiles?: Record<string, Record<string, unknown> & { provider?: string; type?: string; email?: string; accountId?: string; key?: string }>;
  usageStats?: Record<string, unknown>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
};

type OpenClawConfigSnapshotLike = {
  configPath: string;
  config: {
    auth?: {
      profiles?: Record<string, { provider?: string; mode?: string; email?: string }>;
      order?: Record<string, string[]>;
    };
    agents?: {
      list?: Array<{ id?: string; [key: string]: unknown }>;
    };
    [key: string]: unknown;
  };
  status?: {
    agentDir?: string;
  };
};

type AgentsConfigAccess = {
  listAIMemberRuntimeCandidates: () => Promise<AIMemberRuntimeCandidate[]>;
  getPrimaryAIMemberAgentId: () => Promise<string | undefined>;
  setPrimaryAIMemberAgent: (agentId: string | undefined) => Promise<{ requiresGatewayApply?: boolean }>;
  readResolvedSavedModelState: () => Promise<{ modelEntries?: SavedModelEntryLike[] }>;
  readAllModels: () => Promise<ModelCatalogEntry[]>;
  resolveCatalogModelKey: (
    models: ModelCatalogEntry[],
    raw: string | null | undefined,
    options?: { providerId?: string }
  ) => string | undefined;
  listOpenClawAgents: () => Promise<OpenClawAgentEntry[]>;
  ensureMemberAgent: (
    memberId: string,
    agentId: string,
    brain: AIMemberRuntimeRequest["brain"]
  ) => Promise<{ agentDir: string; workspaceDir: string; created: boolean }>;
  setMemberIdentity: (agentId: string, request: AIMemberRuntimeRequest) => Promise<void>;
  writeMemberWorkspaceFiles: (
    request: AIMemberRuntimeRequest,
    workspaceDir: string,
    options: { createBootstrap: boolean }
  ) => Promise<void>;
  runOpenClaw: (
    args: string[],
    options?: { allowFailure?: boolean; envOverrides?: Record<string, string | undefined>; input?: string }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  markGatewayApplyPending: () => Promise<void>;
  invalidateReadCaches: (resources: Array<"skills" | "ai-members">, agentId?: string) => void;
  toRuntimeBindingTarget: (binding: string) => string;
  readOpenClawConfigSnapshot: () => Promise<OpenClawConfigSnapshotLike>;
  writeOpenClawConfigSnapshot: (configPath: string, config: OpenClawConfigSnapshotLike["config"]) => Promise<void>;
  getSavedSecret: (secretName: string) => Promise<string | undefined>;
  buildModelsCommandArgs: (args: string[], agentId?: string) => string[];
  readAuthStore: (agentDir: string) => Promise<OpenClawAuthProfileStoreJson>;
  writeAuthStore: (agentDir: string, store: OpenClawAuthProfileStoreJson) => Promise<void>;
  upsertAgentConfigEntry: (
    configPath: string,
    config: OpenClawConfigSnapshotLike["config"],
    entry: SavedModelEntryLike & { agentId: string; agentDir: string; workspaceDir: string },
    model: string | { primary?: string; fallbacks?: string[] }
  ) => Promise<void>;
  getMainOpenClawAgentDir: () => string;
  readBindingsCache: (agentId: string, loader: () => Promise<MemberBindingSummary[]>) => Promise<MemberBindingSummary[]>;
  invalidateMemberBindingCaches: (agentIds: string[]) => void;
};

function normalizeModelLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function modelKeysMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left?.trim() || !right?.trim()) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftName = left.includes("/") ? left.slice(left.indexOf("/") + 1) : left;
  const rightName = right.includes("/") ? right.slice(right.indexOf("/") + 1) : right;
  return normalizeModelLookupKey(leftName) === normalizeModelLookupKey(rightName);
}

function providerMatchesAuthProvider(provider: InternalModelProviderConfig, authProvider: string): boolean {
  const normalized = authProvider.trim().toLowerCase();
  const candidates = new Set<string>();

  candidates.add(provider.id.toLowerCase());

  for (const ref of provider.providerRefs) {
    candidates.add(ref.replace(/\/$/, "").toLowerCase());
  }

  if (provider.authProviderId) {
    candidates.add(provider.authProviderId.toLowerCase());
  }

  for (const method of provider.authMethods) {
    if (method.loginProviderId) {
      candidates.add(method.loginProviderId.toLowerCase());
    }

    if (method.tokenProviderId) {
      candidates.add(method.tokenProviderId.toLowerCase());
    }

    if (method.setupTokenProvider) {
      candidates.add(method.setupTokenProvider.toLowerCase());
    }
  }

  return candidates.has(normalized);
}

function matchingProfileIdsForProvider(
  store: OpenClawAuthProfileStoreJson,
  provider: InternalModelProviderConfig | undefined
): string[] {
  return Object.entries(store.profiles ?? {})
    .filter(([, profile]) =>
      provider ? providerMatchesAuthProvider(provider, String(profile.provider ?? "")) : true
    )
    .map(([profileId]) => profileId);
}

function authModeForCredentialType(type: unknown): "api_key" | "token" | "oauth" {
  if (type === "api_key") {
    return "api_key";
  }

  if (type === "token") {
    return "token";
  }

  return "oauth";
}

function normalizeRuntimeChannelId(channelId: string): string | undefined {
  if (channelId === PERSONAL_WECHAT_RUNTIME_CHANNEL_KEY) {
    return "wechat";
  }

  if (
    channelId === CANONICAL_WECOM_CHANNEL_KEY ||
    channelId === LEGACY_WECOM_CHANNEL_KEY ||
    channelId === "wechat"
  ) {
    return "wechat-work";
  }

  if (channelId === "telegram" || channelId === "whatsapp" || channelId === "feishu" || channelId === "wechat-work") {
    return channelId;
  }

  return undefined;
}

function normalizeRuntimeBindingTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) {
    return trimmed;
  }

  const [prefix, ...rest] = trimmed.split(":");
  const channelId = normalizeRuntimeChannelId(prefix);
  if (!channelId) {
    return trimmed;
  }

  return [channelId, ...rest].join(":");
}

function normalizeBindingTarget(entry: string | OpenClawAgentBindingJsonEntry): MemberBindingSummary | undefined {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    const normalized = normalizeRuntimeBindingTarget(trimmed);
    return normalized ? { id: normalized, target: normalized } : undefined;
  }

  const matchAccount = entry.match?.accountId?.trim() || entry.match?.account?.trim();
  const target =
    entry.target?.trim() ||
    entry.bind?.trim() ||
    [entry.channel?.trim(), entry.accountId?.trim() || entry.account?.trim()].filter(Boolean).join(":") ||
    [entry.match?.channel?.trim(), matchAccount].filter(Boolean).join(":") ||
    entry.match?.route?.trim() ||
    entry.route?.trim();

  if (!target) {
    return undefined;
  }

  return {
    id: normalizeRuntimeBindingTarget(entry.id?.trim() || target),
    target: normalizeRuntimeBindingTarget(target)
  };
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function extractBalancedJsonPayload(value: string, startIndex: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      depth += 1;
      continue;
    }

    if (character === "}" || character === "]") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }

      if (depth < 0) {
        return undefined;
      }
    }
  }

  return undefined;
}

function safeJsonPayloadParse<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const direct = safeJsonParse<T>(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character !== "{" && character !== "[") {
      continue;
    }

    const payload = extractBalancedJsonPayload(trimmed, index);
    if (!payload) {
      continue;
    }

    const parsed = safeJsonParse<T>(payload);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export class AgentsConfigCoordinator {
  constructor(private readonly access: AgentsConfigAccess) {}

  listAIMemberRuntimeCandidates() {
    return this.access.listAIMemberRuntimeCandidates();
  }

  getPrimaryAIMemberAgentId() {
    return this.access.getPrimaryAIMemberAgentId();
  }

  setPrimaryAIMemberAgent(agentId: string | undefined) {
    return this.access.setPrimaryAIMemberAgent(agentId);
  }

  async saveAIMemberRuntime(request: AIMemberRuntimeRequest): Promise<AIMemberRuntimeState & { requiresGatewayApply?: boolean }> {
    const modelState = await this.access.readResolvedSavedModelState();
    const sourceEntry =
      modelState.modelEntries?.find((entry) => entry.id === request.brain.entryId) ??
      modelState.modelEntries?.find(
        (entry) => entry.providerId === request.brain.providerId && modelKeysMatch(entry.modelKey, request.brain.modelKey)
      );
    const resolvedModelKey =
      this.access.resolveCatalogModelKey(await this.access.readAllModels(), sourceEntry?.modelKey ?? request.brain.modelKey, {
        providerId: sourceEntry?.providerId ?? request.brain.providerId
      }) ??
      sourceEntry?.modelKey ??
      request.brain.modelKey;
    const resolvedBrain = sourceEntry
      ? {
          ...request.brain,
          entryId: sourceEntry.id,
          label: sourceEntry.label,
          providerId: sourceEntry.providerId,
          modelKey: resolvedModelKey
        }
      : {
          ...request.brain,
          modelKey: resolvedModelKey
        };
    const agentId =
      request.existingAgentId ??
      resolveReadableMemberAgentId(
        request.name,
        (await this.access.listOpenClawAgents()).map((agent) => agent.id).filter((candidate): candidate is string => Boolean(candidate))
      );
    const { agentDir, workspaceDir, created } = await this.access.ensureMemberAgent(request.memberId, agentId, resolvedBrain);

    await this.access.setMemberIdentity(agentId, request);
    await rm(`${workspaceDir}/knowledge`, { recursive: true, force: true }).catch(() => undefined);
    await this.access.writeMemberWorkspaceFiles(request, workspaceDir, { createBootstrap: created });
    await this.syncMemberBrain({ ...request, brain: resolvedBrain }, agentId, agentDir, workspaceDir);
    await this.access.runOpenClaw(["memory", "index", "--agent", agentId, "--force"], { allowFailure: true });
    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["skills", "ai-members"], agentId);

    const agents = await this.access.listOpenClawAgents();
    if (!agents.some((agent) => agent.id === agentId)) {
      throw new Error(`ChillClaw could not verify the AI member agent ${agentId}.`);
    }

    if (!(await this.access.getPrimaryAIMemberAgentId())) {
      await this.access.setPrimaryAIMemberAgent(agentId);
    }

    return {
      agentId,
      agentDir,
      workspaceDir,
      bindings: await this.readMemberBindings(agentId),
      requiresGatewayApply: true
    };
  }

  async getAIMemberBindings(agentId: string): Promise<MemberBindingSummary[]> {
    if (!agentId) {
      return [];
    }

    return this.readMemberBindings(agentId);
  }

  async bindAIMemberChannel(
    agentId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    if (!agentId) {
      throw new Error("AI member agent is missing.");
    }

    return this.bindMemberChannelExclusively(agentId, request.binding);
  }

  async unbindAIMemberChannel(
    agentId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    if (!agentId) {
      throw new Error("AI member agent is missing.");
    }

    const runtimeBinding = this.access.toRuntimeBindingTarget(request.binding);
    const result = await this.access.runOpenClaw(["agents", "unbind", "--agent", agentId, "--bind", runtimeBinding, "--json"], {
      allowFailure: true
    });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `ChillClaw could not unbind ${request.binding} from ${agentId}.`);
    }

    this.access.invalidateMemberBindingCaches([agentId]);
    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["ai-members"], agentId);
    return {
      bindings: await this.readMemberBindings(agentId),
      requiresGatewayApply: true
    };
  }

  async deleteAIMemberRuntime(
    agentId: string,
    request: DeleteAIMemberRequest
  ): Promise<{ requiresGatewayApply?: boolean; wasPrimary?: boolean }> {
    if (!agentId) {
      return { requiresGatewayApply: false, wasPrimary: false };
    }

    const wasPrimary = (await this.access.getPrimaryAIMemberAgentId()) === agentId;
    const agents = await this.access.listOpenClawAgents();
    const existing = agents.find((agent) => agent.id === agentId);

    if (!existing) {
      return { requiresGatewayApply: false, wasPrimary };
    }

    const result = await this.access.runOpenClaw(["agents", "delete", agentId, "--force", "--json"], { allowFailure: true });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `ChillClaw could not delete the AI member agent ${agentId}.`);
    }

    if (request.deleteMode === "full" && existing.workspace) {
      await rm(existing.workspace, { recursive: true, force: true }).catch(() => undefined);
    }

    if (request.deleteMode === "full" && existing.agentDir) {
      await rm(dirname(existing.agentDir), { recursive: true, force: true }).catch(() => undefined);
    }

    const snapshot = await this.access.readOpenClawConfigSnapshot();
    if ((snapshot.config.agents?.list ?? []).some((entry) => entry.id === agentId)) {
      snapshot.config.agents = {
        ...snapshot.config.agents,
        list: (snapshot.config.agents?.list ?? []).filter((entry) => entry.id !== agentId)
      };
      await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
    }

    this.access.invalidateMemberBindingCaches([agentId]);
    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["ai-members"], agentId);

    const remaining = await this.access.listOpenClawAgents();
    if (remaining.some((agent) => agent.id === agentId)) {
      throw new Error(`ChillClaw could not verify deletion of AI member agent ${agentId}.`);
    }

    return {
      requiresGatewayApply: true,
      wasPrimary
    };
  }

  private async rehydrateMemberAuthFromSavedSecrets(
    agentId: string,
    agentDir: string,
    providerId: string,
    methodId: string
  ): Promise<OpenClawAuthProfileStoreJson | undefined> {
    const provider = providerDefinitionById(providerId);
    const method = provider?.authMethods.find((item) => item.id === methodId);

    if (!provider || !method || !canUseTokenPasteAuth(method)) {
      return undefined;
    }

    const tokenField = method.fields[0];
    const token = tokenField
      ? await this.access.getSavedSecret(modelAuthSecretName(providerId, methodId, tokenField.id))
      : undefined;

    if (!token?.trim()) {
      return undefined;
    }

    const authProvider = resolveTokenAuthProvider(provider, method);
    const profileId = method.tokenProfileId ?? `${authProvider}:chillclaw-${agentId}`;
    const result = await this.access.runOpenClaw(
      this.access.buildModelsCommandArgs(
        [
          "auth",
          "paste-token",
          "--provider",
          authProvider,
          "--profile-id",
          profileId
        ],
        agentId
      ),
      {
        allowFailure: true,
        input: `${token.trim()}\n`
      }
    );

    if (result.code !== 0) {
      throw new Error(
        result.stderr ||
          result.stdout ||
          `ChillClaw could not restore saved ${provider.label} credentials for ${agentId}.`
      );
    }

    const restoredStore = await this.access.readAuthStore(agentDir);
    if (matchingProfileIdsForProvider(restoredStore, provider).length > 0) {
      return restoredStore;
    }

    const nextStore: OpenClawAuthProfileStoreJson = {
      version: restoredStore.version ?? 1,
      profiles: {
        ...(restoredStore.profiles ?? {}),
        [profileId]: {
          ...(restoredStore.profiles?.[profileId] ?? {}),
          provider: authProvider,
          type: "api_key",
          key: token.trim(),
          label: method.label || `${provider.label} API Key`
        }
      },
      usageStats: restoredStore.usageStats ?? {},
      order: {
        ...(restoredStore.order ?? {}),
        [authProvider]: Array.from(new Set([profileId, ...(restoredStore.order?.[authProvider] ?? [])]))
      },
      lastGood: {
        ...(restoredStore.lastGood ?? {}),
        [authProvider]: profileId
      }
    };

    await this.access.writeAuthStore(agentDir, nextStore);
    return nextStore;
  }

  private async syncMemberBrain(
    request: AIMemberRuntimeRequest,
    agentId: string,
    agentDir: string,
    workspaceDir: string
  ): Promise<void> {
    const modelState = await this.access.readResolvedSavedModelState();
    const sourceEntry =
      modelState.modelEntries?.find((entry) => entry.id === request.brain.entryId) ??
      modelState.modelEntries?.find(
        (entry) => entry.providerId === request.brain.providerId && modelKeysMatch(entry.modelKey, request.brain.modelKey)
      );

    if (!sourceEntry) {
      throw new Error("Saved model entry for this AI member was not found.");
    }

    const snapshot = await this.access.readOpenClawConfigSnapshot();
    await this.access.upsertAgentConfigEntry(
      snapshot.configPath,
      snapshot.config,
      {
        ...sourceEntry,
        label: request.name,
        agentId,
        agentDir,
        workspaceDir
      },
      {
        primary: request.brain.modelKey,
        fallbacks: []
      }
    );

    const sourceAuthDir = sourceEntry.agentDir || snapshot.status?.agentDir || this.access.getMainOpenClawAgentDir();
    const provider = providerDefinitionById(sourceEntry.providerId);
    let sourceStore = sourceAuthDir ? await this.access.readAuthStore(sourceAuthDir) : undefined;
    let profileIdsToCopy =
      (sourceEntry.profileIds ?? []).length > 0
        ? (sourceEntry.profileIds ?? []).filter((profileId) => Boolean(sourceStore?.profiles?.[profileId]))
        : matchingProfileIdsForProvider(
            sourceStore ?? {
              version: 1,
              profiles: {},
              usageStats: {},
              order: {},
              lastGood: {}
            },
            provider
          );

    if (profileIdsToCopy.length === 0 && sourceEntry.authMethodId) {
      sourceStore = await this.rehydrateMemberAuthFromSavedSecrets(
        agentId,
        agentDir,
        sourceEntry.providerId,
        sourceEntry.authMethodId
      );
      profileIdsToCopy = matchingProfileIdsForProvider(
        sourceStore ?? {
          version: 1,
          profiles: {},
          usageStats: {},
          order: {},
          lastGood: {}
        },
        provider
      );
    }

    if (!sourceStore?.profiles || Object.keys(sourceStore.profiles).length === 0 || profileIdsToCopy.length === 0) {
      if (sourceEntry.authMethodId) {
        throw new Error(
          `ChillClaw could not find saved ${sourceEntry.providerId} credentials for ${request.name}. Re-save that model in Configuration first.`
        );
      }

      return;
    }

    const nextProfiles = Object.fromEntries(
      profileIdsToCopy
        .map((profileId) => [profileId, sourceStore.profiles?.[profileId]])
        .filter((entry): entry is [string, NonNullable<OpenClawAuthProfileStoreJson["profiles"]>[string]] => Boolean(entry[1]))
    );
    const nextUsageStats = Object.fromEntries(
      profileIdsToCopy
        .map((profileId) => [profileId, sourceStore.usageStats?.[profileId]] as const)
        .filter((entry): entry is [string, NonNullable<OpenClawAuthProfileStoreJson["usageStats"]>[string]] => Boolean(entry[1]))
    );
    const nextOrder = Object.fromEntries(
      Object.entries(sourceStore.order ?? {})
        .map(([providerId, profileIds]) => [
          providerId,
          profileIds.filter((profileId) => profileIdsToCopy.includes(profileId))
        ])
        .filter((entry) => entry[1].length > 0)
    );
    const nextLastGood = Object.fromEntries(
      Object.entries(sourceStore.lastGood ?? {}).filter(([, profileId]) => profileIdsToCopy.includes(profileId))
    );

    await this.access.writeAuthStore(agentDir, {
      version: sourceStore.version ?? 1,
      profiles: nextProfiles,
      usageStats: nextUsageStats,
      order: nextOrder,
      lastGood: nextLastGood
    });

    snapshot.config.auth = snapshot.config.auth ?? {};
    snapshot.config.auth.profiles = snapshot.config.auth.profiles ?? {};

    for (const [profileId, profile] of Object.entries(nextProfiles)) {
      snapshot.config.auth.profiles[profileId] = {
        provider: String(profile.provider ?? sourceEntry.providerId),
        mode: authModeForCredentialType(profile.type),
        ...(typeof profile.email === "string" && profile.email.trim() ? { email: profile.email.trim() } : {})
      };
    }

    await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
  }

  private async readMemberBindings(agentId: string): Promise<MemberBindingSummary[]> {
    return this.access.readBindingsCache(agentId, async () => {
      const result = await this.access.runOpenClaw(["agents", "bindings", "--agent", agentId, "--json"], {
        allowFailure: true
      });
      const payload =
        safeJsonPayloadParse<Array<string | OpenClawAgentBindingJsonEntry>>(result.stdout) ??
        safeJsonPayloadParse<Array<string | OpenClawAgentBindingJsonEntry>>(result.stderr) ??
        [];

      return payload
        .map((entry) => normalizeBindingTarget(entry))
        .filter((entry): entry is MemberBindingSummary => Boolean(entry));
    });
  }

  private async readBindingOwnerAgentIds(binding: string, excludeAgentId?: string): Promise<string[]> {
    const agents = await this.access.listOpenClawAgents();
    const owners: string[] = [];

    for (const agent of agents) {
      const candidateAgentId = agent.id?.trim();
      if (!candidateAgentId || candidateAgentId === excludeAgentId) {
        continue;
      }

      const bindings = await this.readMemberBindings(candidateAgentId);
      if (bindings.some((entry) => entry.target === binding)) {
        owners.push(candidateAgentId);
      }
    }

    return owners;
  }

  private async bindMemberChannelExclusively(
    agentId: string,
    binding: string
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    const ownerAgentIds = await this.readBindingOwnerAgentIds(binding, agentId);
    const runtimeBinding = this.access.toRuntimeBindingTarget(binding);

    for (const ownerAgentId of ownerAgentIds) {
      const result = await this.access.runOpenClaw(
        ["agents", "unbind", "--agent", ownerAgentId, "--bind", runtimeBinding, "--json"],
        { allowFailure: true }
      );
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `ChillClaw could not unbind ${binding} from ${ownerAgentId}.`);
      }
    }

    const result = await this.access.runOpenClaw(
      ["agents", "bind", "--agent", agentId, "--bind", runtimeBinding, "--json"],
      { allowFailure: true }
    );
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `ChillClaw could not bind ${binding} to ${agentId}.`);
    }

    this.access.invalidateMemberBindingCaches([...ownerAgentIds, agentId]);
    const bindings = await this.readMemberBindings(agentId);

    if (!bindings.some((entry) => entry.target === binding)) {
      throw new Error(`ChillClaw could not verify that ${binding} is owned by ${agentId}.`);
    }

    const lingeringOwners = await this.readBindingOwnerAgentIds(binding, agentId);
    if (lingeringOwners.length > 0) {
      throw new Error(`ChillClaw could not clear ${binding} from ${lingeringOwners.join(", ")}.`);
    }

    await this.access.markGatewayApplyPending();
    return {
      bindings,
      requiresGatewayApply: true
    };
  }
}
