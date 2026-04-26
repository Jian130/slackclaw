import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ModelAuthRequest,
  ModelAuthSession,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelCatalogEntry,
  ModelConfigActionResponse,
  ModelConfigOverview,
  MutationSyncMeta,
  ReplaceFallbackModelEntriesRequest,
  SavedModelEntry,
  SaveModelEntryRequest,
  SetDefaultModelEntryRequest
} from "@chillclaw/contracts";

import {
  buildBaseOnboardArgs,
  buildOnboardAuthArgs,
  canUseTokenPasteAuth,
  providerDefinitionById,
  resolveTokenAuthProvider,
  type InternalModelProviderConfig
} from "../config/openclaw-model-provider-catalog.js";
import { syncManagedLocalOllamaProviderConfig } from "./managed-local-ollama-config.js";
import { getDataDir } from "../runtime-paths.js";
import { appendGatewayApplyMessage } from "./openclaw-shared.js";

type SavedModelEntryLike = SavedModelEntry & {
  agentDir?: string;
  workspaceDir?: string;
  profileIds?: string[];
};

type ModelSnapshotLike = {
  allModels: ModelCatalogEntry[];
  configuredModels: ModelCatalogEntry[];
  activeConfig?: OpenClawConfigSnapshotLike["config"];
  configuredAuthProviders: Set<string>;
  status?: {
    configPath?: string;
    agentDir?: string;
    aliases?: Record<string, string>;
    resolvedDefault?: string | null;
    defaultModel?: string | null;
    allowed?: string[];
  };
  supplemental: {
    refs?: Iterable<string>;
    defaultModel?: string | null;
  };
};

type AdapterModelState = {
  modelEntries?: SavedModelEntryLike[];
  defaultModelEntryId?: string;
  fallbackModelEntryIds?: string[];
};

type PendingSavedModelEntryOperationLike = {
  mode: "create" | "update";
  entryId: string;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  draft: SaveModelEntryRequest;
};

type InteractiveAuthChildLike = {
  stdout?: {
    on: (event: "data", listener: (chunk: { toString(): string }) => void) => void;
  } | null;
  stderr?: {
    on: (event: "data", listener: (chunk: { toString(): string }) => void) => void;
  } | null;
  on: (event: "error" | "exit", listener: (value?: unknown) => void) => void;
  exitCode?: number | null;
  stdin?: {
    destroyed?: boolean;
    write: (value: string) => void;
  } | null;
};

type RuntimeModelAuthSessionLike = ModelAuthSession & {
  child?: {
    stdin?: {
      destroyed?: boolean;
      write: (value: string) => void;
    } | null;
  };
  outputBuffer: string;
  browserOpened: boolean;
  setDefaultModel?: string;
  agentDir?: string;
  pendingEntry?: PendingSavedModelEntryOperationLike;
  modelConfig?: ModelConfigOverview;
};

type OpenClawAuthProfileStoreLike = {
  version?: number;
  profiles?: Record<string, Record<string, unknown> & { provider?: string; type?: string; email?: string; accountId?: string }>;
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
      defaults?: {
        model?: string | { primary?: string; fallbacks?: string[] };
        models?: Record<string, unknown>;
        workspace?: string;
      };
      list?: Array<{
        id: string;
        name?: string;
        workspace?: string;
        agentDir?: string;
        default?: boolean;
        model?: string | { primary?: string; fallbacks?: string[] };
      }>;
    };
    channels?: Record<string, unknown>;
    gateway?: {
      mode?: string;
      bind?: string;
      auth?: {
        mode?: string;
        token?: string;
        password?: string;
      };
      remote?: Record<string, unknown>;
    };
    plugins?: {
      entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
    };
    models?: {
      mode?: string;
      providers?: Record<
        string,
        {
          baseUrl?: string;
          api?: string;
          apiKey?: string;
          models?: Array<{
            id?: string;
            name?: string;
            reasoning?: boolean;
            input?: string[];
            cost?: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
            };
            contextWindow?: number;
            maxTokens?: number;
          }>;
        }
      >;
    };
  };
  status?: {
    agentDir?: string;
    aliases?: Record<string, string>;
  };
};

function resolveConfigModelAlias(
  raw: string | null | undefined,
  aliases: Record<string, string>,
  seen: Set<string> = new Set()
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (seen.has(trimmed)) {
    return trimmed;
  }

  seen.add(trimmed);
  const aliasTarget = aliases[trimmed];
  if (aliasTarget?.trim()) {
    return resolveConfigModelAlias(aliasTarget, aliases, seen);
  }

  return trimmed;
}

function resolveDefaultModelFromConfigSnapshot(snapshot: OpenClawConfigSnapshotLike): string | undefined {
  const rawDefaultModel = snapshot.config.agents?.defaults?.model;
  const primaryModel = typeof rawDefaultModel === "string" ? rawDefaultModel : rawDefaultModel?.primary;
  return resolveConfigModelAlias(primaryModel, snapshot.status?.aliases ?? {});
}

function hasIterableValue(values: Iterable<unknown> | undefined): boolean {
  for (const _value of values ?? []) {
    return true;
  }
  return false;
}

function modelSnapshotReadUnavailable(snapshot: ModelSnapshotLike): boolean {
  return (
    !snapshot.status &&
    !snapshot.activeConfig &&
    snapshot.allModels.length === 0 &&
    snapshot.configuredModels.length === 0 &&
    snapshot.configuredAuthProviders.size === 0 &&
    !snapshot.supplemental.defaultModel &&
    !hasIterableValue(snapshot.supplemental.refs)
  );
}

function isLocalSavedModelEntry(entry: SavedModelEntryLike): boolean {
  const provider = providerDefinitionById(entry.providerId);
  const method = entry.authMethodId
    ? provider?.authMethods.find((item) => item.id === entry.authMethodId)
    : undefined;
  return method?.kind === "local";
}

function cleanRuntimeShouldKeepSavedState(state: AdapterModelState): boolean {
  return (state.modelEntries ?? []).some(isLocalSavedModelEntry);
}

type ModelsConfigAccess = {
  readModelSnapshot: (options?: { fresh?: boolean }) => Promise<ModelSnapshotLike>;
  resolveCatalogModelKey: (
    models: ModelCatalogEntry[],
    raw: string | null | undefined,
    options?: { providerId?: string }
  ) => string | undefined;
  isCleanModelRuntime: (snapshot: ModelSnapshotLike) => boolean;
  mergeModelCatalogEntries: (
    models: ModelCatalogEntry[],
    refs: Iterable<string> | undefined,
    options: { available: boolean; defaultModel?: string | null }
  ) => ModelCatalogEntry[];
  buildModelConfigOverview: (
    allModels: ModelCatalogEntry[],
    configuredModels: ModelCatalogEntry[],
    configuredAuthProviders: Set<string>,
    modelEntries: SavedModelEntryLike[],
    defaultModelEntryId: string | undefined,
    fallbackModelEntryIds: string[],
    defaultModel: string | null | undefined
  ) => ModelConfigOverview;
  readAdapterState: () => Promise<AdapterModelState>;
  writeAdapterState: (state: AdapterModelState) => Promise<void>;
  ensureSavedModelState: (snapshot?: ModelSnapshotLike) => Promise<AdapterModelState>;
  reconcileSavedModelState: (
    state: AdapterModelState,
    configuredModels: ModelCatalogEntry[],
    defaultModel?: string | null
  ) => Promise<AdapterModelState>;
  buildEntryLabel: (label: string | undefined, providerId: string, modelKey: string) => string;
  mutationSyncMeta: (engineSynced?: boolean) => MutationSyncMeta;
  getRuntimeModelAuthSession: (sessionId: string) => RuntimeModelAuthSessionLike | undefined;
  setRuntimeModelAuthSession: (sessionId: string, session: RuntimeModelAuthSessionLike) => void;
  resolveOpenClawCommand: () => Promise<string | undefined>;
  buildModelsCommandArgs: (args: string[], agentId?: string) => string[];
  logExternalCommand: (command: string, args: string[]) => void;
  spawnInteractiveCommand: (
    command: string,
    args: string[],
    envOverrides?: Record<string, string | undefined>
  ) => InteractiveAuthChildLike;
  appendAuthSessionOutput: (session: RuntimeModelAuthSessionLike, chunk: string) => void;
  writeErrorLog: (message: string, details: unknown, metadata?: { scope?: string }) => Promise<void>;
  errorToLogDetails: (error: unknown) => unknown;
  readOpenClawConfigSnapshot: () => Promise<OpenClawConfigSnapshotLike>;
  writeOpenClawConfigSnapshot: (configPath: string, config: OpenClawConfigSnapshotLike["config"]) => Promise<void>;
  readAuthStore: (agentDir: string) => Promise<OpenClawAuthProfileStoreLike>;
  writeAuthStore: (agentDir: string, store: OpenClawAuthProfileStoreLike) => Promise<void>;
  upsertAgentConfigEntry: (
    configPath: string,
    config: OpenClawConfigSnapshotLike["config"],
    entry: SavedModelEntryLike & { agentId: string; agentDir: string; workspaceDir: string },
    model: string | { primary?: string; fallbacks?: string[] }
  ) => Promise<void>;
  hasReusableAuthForSavedModelEntry: (
    entry: SavedModelEntryLike | undefined,
    providerId: string,
    method: {
      id: string;
      tokenProviderId?: string;
      fields: Array<{ id: string; secret?: boolean }>;
    }
  ) => Promise<boolean>;
  normalizeStateFlags: (state: AdapterModelState) => AdapterModelState;
  isRuntimeDerivedModelEntryId: (entryId: string) => boolean;
  removeRuntimeDerivedModelFromConfig: (
    config: OpenClawConfigSnapshotLike["config"],
    status: OpenClawConfigSnapshotLike["status"] | undefined,
    modelKey: string
  ) => { changed: boolean; remainingModelKeys: string[]; removedDefault: boolean };
  markGatewayApplyPending: () => Promise<void>;
  runMutationWithConfigFallback: (options: {
    commandArgs: string[];
    fallbackDescription: string;
    applyFallback: () => Promise<void>;
  }) => Promise<{ usedFallback: boolean; result: { code: number; stdout: string; stderr: string } }>;
  writeDefaultModelConfig: (modelKey: string) => Promise<void>;
  runOpenClaw: (
    args: string[],
    options?: { allowFailure?: boolean; envOverrides?: Record<string, string | undefined>; input?: string }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
};

function trimLogLines(lines: string[]): string[] {
  return lines.slice(-80);
}

function toModelAuthSessionResponse(
  session: RuntimeModelAuthSessionLike
): ModelAuthSessionResponse["session"] {
  return {
    id: session.id,
    providerId: session.providerId,
    methodId: session.methodId,
    entryId: session.entryId,
    status: session.status,
    message: session.message,
    logs: session.logs,
    launchUrl: session.launchUrl,
    inputPrompt: session.inputPrompt
  };
}

function hasProvidedModelAuthValues(request: SaveModelEntryRequest): boolean {
  return Object.values(request.values ?? {}).some((value) => value.trim().length > 0);
}

function requiresInteractiveModelAuth(method: {
  setupTokenProvider?: string;
  specialCommand?: string;
  loginProviderId?: string;
  onboardAuthChoice?: string;
}): boolean {
  return Boolean(
    method.setupTokenProvider ||
    method.specialCommand === "login-github-copilot" ||
    method.loginProviderId ||
    method.onboardAuthChoice
  );
}

function shouldAuthenticateSavedModelEntry(
  mode: "create" | "update",
  request: SaveModelEntryRequest,
  method: {
    setupTokenProvider?: string;
    specialCommand?: string;
    loginProviderId?: string;
    onboardAuthChoice?: string;
  }
): boolean {
  if (request.makeDefault || request.useAsFallback) {
    return true;
  }

  if (hasProvidedModelAuthValues(request)) {
    return true;
  }

  if (mode === "create" && requiresInteractiveModelAuth(method)) {
    return true;
  }

  return false;
}

const OPENCLAW_MAIN_AGENT_ID = "main";
const MANAGED_MODEL_AGENT_PREFIX = "chillclaw-model-";

function authModeLabelForCredentialType(type: unknown): string | undefined {
  if (type === "oauth") {
    return "OAuth";
  }

  if (type === "token") {
    return "Token";
  }

  if (type === "api_key") {
    return "API key";
  }

  return undefined;
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

function describeProfileLabel(
  profileId: string,
  profile: Record<string, unknown> & { email?: string; accountId?: string }
): string {
  if (profile.email?.trim()) {
    return profile.email.trim();
  }

  if (profile.accountId?.trim()) {
    return profile.accountId.trim();
  }

  const suffixIndex = profileId.indexOf(":");
  return suffixIndex >= 0 ? profileId.slice(suffixIndex + 1) : profileId;
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

function matchingProfilesForProvider(
  store: OpenClawAuthProfileStoreLike,
  provider: InternalModelProviderConfig | undefined
): Array<[string, Record<string, unknown> & { provider?: string; type?: string; email?: string; accountId?: string }]> {
  return Object.entries(store.profiles ?? {}).filter(([, profile]) =>
    provider ? providerMatchesAuthProvider(provider, String(profile.provider ?? "")) : true
  );
}

function pruneExplicitMainAgentEntry(config: OpenClawConfigSnapshotLike["config"]): boolean {
  const existingList = config.agents?.list ?? [];
  const nextList = existingList.filter((entry) => entry.id !== OPENCLAW_MAIN_AGENT_ID);

  if (nextList.length === existingList.length) {
    return false;
  }

  config.agents = config.agents ?? {};
  if (nextList.length > 0) {
    config.agents.list = nextList;
  } else if (config.agents) {
    delete config.agents.list;
  }

  return true;
}

function isManagedModelAgentId(agentId: string | undefined): boolean {
  const trimmed = agentId?.trim();
  return Boolean(trimmed && trimmed.startsWith(MANAGED_MODEL_AGENT_PREFIX));
}

function isImplicitMainAgentId(agentId: string | undefined): boolean {
  return agentId?.trim() === OPENCLAW_MAIN_AGENT_ID;
}

function getManagedModelAgentRootDir(entryId: string): string {
  return resolve(getDataDir(), "model-agents", entryId);
}

function removeProfileIdsFromConfig(
  config: OpenClawConfigSnapshotLike["config"],
  profileIds: string[]
): void {
  if (profileIds.length === 0) {
    return;
  }

  const profileIdSet = new Set(profileIds);

  for (const profileId of profileIdSet) {
    delete config.auth?.profiles?.[profileId];
  }

  if (config.auth?.order) {
    config.auth.order = Object.fromEntries(
      Object.entries(config.auth.order)
        .map(([providerId, orderedProfileIds]) => [
          providerId,
          orderedProfileIds.filter((profileId) => !profileIdSet.has(profileId))
        ])
        .filter(([, orderedProfileIds]) => orderedProfileIds.length > 0)
    );
  }
}

export class ModelsConfigCoordinator {
  constructor(private readonly access: ModelsConfigAccess) {}

  async getModelSelection(): Promise<Pick<ModelConfigOverview, "savedEntries" | "defaultEntryId" | "defaultModel">> {
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    const snapshot = await this.access.readOpenClawConfigSnapshot();

    return {
      savedEntries: state.modelEntries ?? [],
      defaultEntryId: state.defaultModelEntryId,
      defaultModel: resolveDefaultModelFromConfigSnapshot(snapshot)
    };
  }

  async canReuseSavedModelEntry(entryId: string): Promise<boolean> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    const entry = state.modelEntries?.find((item) => item.id === entryId);

    if (!entry) {
      return false;
    }

    const provider = providerDefinitionById(entry.providerId);
    const method = entry.authMethodId
      ? provider?.authMethods.find((item) => item.id === entry.authMethodId)
      : undefined;

    if (!method) {
      if (this.access.isRuntimeDerivedModelEntryId(entry.id) && provider?.authMethods.some((item) => item.kind === "local")) {
        return true;
      }
      return false;
    }

    if (method.kind === "local") {
      return true;
    }

    return this.access.hasReusableAuthForSavedModelEntry(entry, entry.providerId, method);
  }

  async getModelConfig(options?: { fresh?: boolean }): Promise<ModelConfigOverview> {
    const snapshot = await this.access.readModelSnapshot(options);

    if (modelSnapshotReadUnavailable(snapshot)) {
      const adapterState = this.access.normalizeStateFlags(await this.access.readAdapterState());
      const defaultEntry = adapterState.modelEntries?.find((entry) => entry.id === adapterState.defaultModelEntryId);
      return this.access.buildModelConfigOverview(
        snapshot.allModels,
        snapshot.configuredModels,
        snapshot.configuredAuthProviders,
        adapterState.modelEntries ?? [],
        adapterState.defaultModelEntryId,
        adapterState.fallbackModelEntryIds ?? [],
        defaultEntry?.modelKey
      );
    }

    if (this.access.isCleanModelRuntime(snapshot)) {
      const adapterState = this.access.normalizeStateFlags(await this.access.readAdapterState());
      if (cleanRuntimeShouldKeepSavedState(adapterState)) {
        const defaultEntry = adapterState.modelEntries?.find((entry) => entry.id === adapterState.defaultModelEntryId);
        return this.access.buildModelConfigOverview(
          snapshot.allModels,
          snapshot.configuredModels,
          snapshot.configuredAuthProviders,
          adapterState.modelEntries ?? [],
          adapterState.defaultModelEntryId,
          adapterState.fallbackModelEntryIds ?? [],
          defaultEntry?.modelKey
        );
      }

      if ((adapterState.modelEntries?.length ?? 0) > 0 || adapterState.defaultModelEntryId || (adapterState.fallbackModelEntryIds?.length ?? 0) > 0) {
        await this.access.writeAdapterState({
          ...adapterState,
          modelEntries: [],
          defaultModelEntryId: undefined,
          fallbackModelEntryIds: []
        });
      }

      return this.access.buildModelConfigOverview([], [], new Set<string>(), [], undefined, [], undefined);
    }

    const adapterState = await this.access.ensureSavedModelState(snapshot);
    const completeAllModels = this.access.mergeModelCatalogEntries(snapshot.allModels, snapshot.supplemental.refs, {
      available: true,
      defaultModel: snapshot.supplemental.defaultModel
    });
    const completeConfiguredModels = this.access.mergeModelCatalogEntries(snapshot.configuredModels, snapshot.supplemental.refs, {
      available: true,
      defaultModel: snapshot.supplemental.defaultModel
    });
    const reconciledState = await this.access.reconcileSavedModelState(
      adapterState,
      completeConfiguredModels,
      snapshot.supplemental.defaultModel
    );

    return this.access.buildModelConfigOverview(
      completeAllModels,
      completeConfiguredModels,
      snapshot.configuredAuthProviders,
      reconciledState.modelEntries ?? [],
      reconciledState.defaultModelEntryId,
      reconciledState.fallbackModelEntryIds ?? [],
      snapshot.supplemental.defaultModel
    );
  }

  async startInteractiveModelAuthSession(
    providerId: string,
    methodId: string,
    args: string[],
    setDefaultModel?: string,
    envOverrides?: Record<string, string | undefined>,
    pendingEntry?: PendingSavedModelEntryOperationLike
  ): Promise<ModelConfigActionResponse> {
    const provider = providerDefinitionById(providerId);
    const method = provider?.authMethods.find((entry) => entry.id === methodId);

    if (!provider || !method) {
      throw new Error(`Unknown auth method ${methodId} for provider ${providerId}.`);
    }

    const command = await this.access.resolveOpenClawCommand();

    if (!command) {
      throw new Error("OpenClaw CLI is not installed.");
    }

    const sessionId = randomUUID();
    const session: RuntimeModelAuthSessionLike = {
      id: sessionId,
      providerId,
      methodId,
      entryId: pendingEntry?.entryId,
      status: "running",
      message: "ChillClaw is starting the OpenClaw authentication flow.",
      logs: [`[ChillClaw] Starting ${provider.label} ${method.label}...`],
      launchUrl: undefined,
      inputPrompt: undefined,
      child: undefined,
      outputBuffer: "",
      setDefaultModel,
      browserOpened: false,
      agentDir: pendingEntry?.agentDir,
      pendingEntry
    };

    this.access.logExternalCommand(command, args);

    const child = this.access.spawnInteractiveCommand(command, args, envOverrides);
    session.child = child;
    this.access.setRuntimeModelAuthSession(sessionId, session);

    child.stdout?.on("data", (chunk) => {
      this.access.appendAuthSessionOutput(session, chunk.toString());
    });

    child.stderr?.on("data", (chunk) => {
      this.access.appendAuthSessionOutput(session, chunk.toString());
    });

    child.on("error", (error) => {
      session.status = "failed";
      session.message = "ChillClaw could not start the OpenClaw authentication flow.";
      session.logs = trimLogLines([...session.logs, error instanceof Error ? error.message : String(error)]);
      void this.access.writeErrorLog("Failed to start interactive OpenClaw auth session.", {
        providerId,
        methodId,
        error: this.access.errorToLogDetails(error)
      }, {
        scope: "ModelsConfigCoordinator.startInteractiveAuth.childError"
      });
    });

    child.on("exit", () => {
      void (async () => {
        const code = child.exitCode ?? 1;
        session.child = undefined;

        if (code === 0) {
          try {
            if (session.pendingEntry) {
              const result = await this.finalizeSavedModelEntryOperation(session.pendingEntry);
              session.status = "completed";
              session.message = result.message;
              session.modelConfig = result.modelConfig;
            } else {
              if (session.setDefaultModel) {
                await this.access.runOpenClaw(["models", "set", session.setDefaultModel], { allowFailure: false }).catch(async (error) => {
                  session.logs = trimLogLines([
                    ...session.logs,
                    error instanceof Error ? error.message : "Failed to set the default model after auth."
                  ]);
                  await this.access.writeErrorLog("Failed to set default model after interactive auth.", {
                    providerId,
                    methodId,
                    modelKey: session.setDefaultModel,
                    error: this.access.errorToLogDetails(error)
                  }, {
                    scope: "ModelsConfigCoordinator.startInteractiveAuth.setDefaultModel"
                  });
                });
              }

              await this.access.markGatewayApplyPending();
              session.modelConfig = await this.getModelConfig({ fresh: true });
              session.status = "completed";
              session.message = appendGatewayApplyMessage(`${provider.label} authentication completed.`);
            }
          } catch (error) {
            session.status = "failed";
            session.message =
              session.pendingEntry
                ? `${provider.label} authentication completed, but ChillClaw could not finish the saved model entry setup.`
                : `${provider.label} authentication completed, but ChillClaw could not save the staged configuration.`;
            session.logs = trimLogLines([
              ...session.logs,
              error instanceof Error ? error.message : "ChillClaw could not finish the interactive model setup."
            ]);
            await this.access.writeErrorLog("Failed to finalize interactive OpenClaw model auth.", {
              providerId,
              methodId,
              entryId: session.pendingEntry?.entryId,
              error: this.access.errorToLogDetails(error)
            }, {
              scope: "ModelsConfigCoordinator.startInteractiveAuth.finalize"
            });
          }
        } else {
          if (session.status !== "awaiting-input") {
            session.status = "failed";
          }
          session.message = `${provider.label} authentication did not complete successfully.`;
        }
      })();
    });

    return {
      ...this.access.mutationSyncMeta(false),
      status: "interactive",
      message: `ChillClaw started the ${provider.label} ${method.label} flow.`,
      modelConfig: await this.getModelConfig(),
      authSession: toModelAuthSessionResponse(session)
    };
  }

  async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    const session = this.access.getRuntimeModelAuthSession(sessionId);

    if (!session) {
      throw new Error("Auth session not found.");
    }

    return {
      session: toModelAuthSessionResponse(session),
      modelConfig: session.modelConfig ?? await this.getModelConfig()
    };
  }

  async submitModelAuthSessionInput(sessionId: string, request: ModelAuthSessionInputRequest): Promise<ModelAuthSessionResponse> {
    const session = this.access.getRuntimeModelAuthSession(sessionId);

    if (!session || !session.child?.stdin) {
      throw new Error("This auth session is no longer accepting input.");
    }

    const value = request.value.trim();

    if (!value) {
      throw new Error("Paste the redirect URL or code first.");
    }

    session.child.stdin.write(`${value}\n`);
    session.status = "running";
    session.message = "ChillClaw sent the pasted redirect URL / code to OpenClaw. Waiting for completion.";
    session.logs = trimLogLines([...session.logs, "[ChillClaw] Submitted redirect URL / code to OpenClaw."]);
    session.inputPrompt = undefined;

    return this.getModelAuthSession(sessionId);
  }

  createSavedModelEntry(request: SaveModelEntryRequest) {
    return this.createOrUpdateSavedModelEntry("create", randomUUID(), request);
  }

  updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest) {
    return this.createOrUpdateSavedModelEntry("update", entryId, request);
  }

  async upsertManagedLocalModelEntry(request: {
    label: string;
    providerId: string;
    methodId: string;
    modelKey: string;
    entryId?: string;
  }): Promise<ModelConfigActionResponse> {
    const provider = providerDefinitionById(request.providerId);
    const method = provider?.authMethods.find((item) => item.id === request.methodId);

    if (!provider) {
      throw new Error(`Unknown provider: ${request.providerId}`);
    }

    if (!method) {
      throw new Error(`Unknown auth method for provider ${request.providerId}: ${request.methodId}`);
    }

    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    const existingEntry =
      (request.entryId ? state.modelEntries?.find((entry) => entry.id === request.entryId) : undefined) ??
      state.modelEntries?.find((entry) => entry.providerId === request.providerId && entry.authMethodId === request.methodId);
    const saveRequest: SaveModelEntryRequest = {
      label: request.label,
      providerId: request.providerId,
      methodId: request.methodId,
      modelKey: request.modelKey,
      values: {},
      makeDefault: true
    };
    const nextEntry = this.buildSavedModelEntryState(
      request.entryId ?? existingEntry?.id ?? randomUUID(),
      saveRequest,
      new Date().toISOString(),
      existingEntry,
      method
    );

    const nextState = await this.syncRuntimeModelChain(this.applySavedModelEntryState(state, nextEntry, saveRequest));
    await this.access.markGatewayApplyPending();
    const normalizedState = this.access.normalizeStateFlags(nextState);
    const defaultEntry = normalizedState.modelEntries?.find((entry) => entry.id === normalizedState.defaultModelEntryId);

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`${nextEntry.label} is ready.`),
      modelConfig: this.access.buildModelConfigOverview(
        [],
        [],
        new Set<string>(),
        normalizedState.modelEntries ?? [],
        normalizedState.defaultModelEntryId,
        normalizedState.fallbackModelEntryIds ?? [],
        defaultEntry?.modelKey
      ),
      requiresGatewayApply: true
    };
  }

  async removeSavedModelEntry(entryId: string): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    const entry = state.modelEntries?.find((item) => item.id === entryId);

    if (!entry) {
      throw new Error("Saved model entry not found.");
    }

    const remainingEntries = (state.modelEntries ?? []).filter((item) => item.id !== entryId);
    const removingDefault = state.defaultModelEntryId === entryId;
    const remainingFallbackIds = (state.fallbackModelEntryIds ?? []).filter((id) => id !== entryId);
    const runtimeDerivedEntry = this.access.isRuntimeDerivedModelEntryId(entry.id);
    let nextDefaultEntryId = state.defaultModelEntryId;
    let nextFallbackEntryIds = remainingFallbackIds;

    if (removingDefault) {
      const promotedFallbackId = remainingFallbackIds[0];

      if (!promotedFallbackId && !runtimeDerivedEntry) {
        throw new Error("Set another default AI model before removing the current default model.");
      }

      nextDefaultEntryId = promotedFallbackId;
      nextFallbackEntryIds = remainingFallbackIds.filter((id) => id !== promotedFallbackId);
    }

    const nextState = this.access.normalizeStateFlags({
      ...state,
      modelEntries: remainingEntries,
      defaultModelEntryId: nextDefaultEntryId,
      fallbackModelEntryIds: nextFallbackEntryIds
    });
    const touchedRuntime = runtimeDerivedEntry || entry.isDefault || entry.isFallback;

    if (runtimeDerivedEntry) {
      return this.removeRuntimeDerivedModelEntry(entry, nextState);
    }

    await this.cleanupRemovedSavedModelEntry(entry, nextState);

    if (touchedRuntime) {
      await this.syncRuntimeModelChain(nextState);
      await this.access.markGatewayApplyPending();

      return {
        ...this.access.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${entry.label} was removed.`),
        modelConfig: await this.getModelConfig({ fresh: true }),
        requiresGatewayApply: true
      };
    }

    await this.access.writeAdapterState(nextState);
    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: `${entry.label} was removed from ChillClaw.`,
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: false
    };
  }

  async setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    if (!state.modelEntries?.some((entry) => entry.id === request.entryId)) {
      throw new Error("Saved model entry not found.");
    }

    await this.syncRuntimeModelChain({
      ...state,
      defaultModelEntryId: request.entryId,
      fallbackModelEntryIds: (state.fallbackModelEntryIds ?? []).filter((entryId) => entryId !== request.entryId)
    });

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Default AI model updated."),
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  async replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    await this.syncRuntimeModelChain({
      ...state,
      fallbackModelEntryIds: request.entryIds
    });

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Fallback AI models updated."),
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  async authenticateModelProvider(request: ModelAuthRequest): Promise<ModelConfigActionResponse> {
    const provider = providerDefinitionById(request.providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${request.providerId}`);
    }

    const method = provider.authMethods.find((entry) => entry.id === request.methodId);

    if (!method) {
      throw new Error(`Unknown auth method for provider ${request.providerId}: ${request.methodId}`);
    }

    let message = `${provider.label} authentication completed.`;

    if (provider.id === "custom") {
      if (method.kind !== "custom") {
        throw new Error("ChillClaw custom provider setup requires the custom endpoint method.");
      }

      const baseUrl = request.values.baseUrl?.trim();
      const modelId = request.values.modelId?.trim();
      const compatibility = request.values.compatibility?.trim() || "openai";
      const providerId = request.values.providerId?.trim();
      const apiKey = request.values.apiKey?.trim();

      if (!baseUrl || !modelId) {
        throw new Error("Custom provider setup requires base URL and model ID.");
      }

      const args = [
        ...buildBaseOnboardArgs(),
        "--auth-choice",
        "custom-api-key",
        "--custom-base-url",
        baseUrl,
        "--custom-model-id",
        modelId,
        "--custom-compatibility",
        compatibility
      ];

      if (providerId) {
        args.push("--custom-provider-id", providerId);
      }

      if (apiKey) {
        args.push("--custom-api-key", apiKey);
      }

      await this.access.runOpenClaw(args, { allowFailure: false });
      message = `${provider.label} endpoint settings were saved for OpenClaw.`;
    } else if (method.onboardAuthChoice) {
      const missingField = method.fields.find((field) => field.required && !request.values[field.id]?.trim());
      if (missingField) {
        throw new Error(`Enter ${missingField.label} first.`);
      }

      // Prefer provider onboarding when available so OpenClaw can write any required
      // provider config such as MiniMax regional base URLs, not just the raw secret.
      await this.access.runOpenClaw(buildOnboardAuthArgs(method, request.values), { allowFailure: false });
      message = `${provider.label} ${method.label} was saved for OpenClaw.`;
    } else if (method.tokenProviderId || canUseTokenPasteAuth(method)) {
      const tokenField = method.fields[0];
      const token = request.values[tokenField?.id ?? "token"]?.trim();
      const authProvider = resolveTokenAuthProvider(provider, method);

      if (!token) {
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      await this.access.runOpenClaw(
        [
          "models",
          "auth",
          "paste-token",
          "--provider",
          authProvider,
          "--profile-id",
          method.tokenProfileId ?? `${authProvider}:manual`
        ],
        {
          allowFailure: false,
          input: `${token}\n`
        }
      );

      message =
        method.kind === "api-key" ? `${provider.label} ${method.label} was saved for OpenClaw.` : `${provider.label} token was saved for OpenClaw.`;
    } else if (method.setupTokenProvider) {
      return this.startInteractiveModelAuthSession(
        provider.id,
        method.id,
        ["models", "auth", "setup-token", "--provider", method.setupTokenProvider, "--yes"],
        request.setDefaultModel
      );
    } else if (method.specialCommand === "login-github-copilot") {
      return this.startInteractiveModelAuthSession(
        provider.id,
        method.id,
        ["models", "auth", "login-github-copilot", "--yes"],
        request.setDefaultModel
      );
    } else if (method.loginProviderId) {
      const args = ["models", "auth", "login", "--provider", method.loginProviderId];

      if (method.loginMethodId) {
        args.push("--method", method.loginMethodId);
      }

      return this.startInteractiveModelAuthSession(provider.id, method.id, args, request.setDefaultModel);
    } else {
      throw new Error(`ChillClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
    }

    if (request.setDefaultModel) {
      await this.access.runOpenClaw(["models", "set", request.setDefaultModel], { allowFailure: false });
      message = `${message} Default model set to ${request.setDefaultModel}.`;
    }

    await this.access.markGatewayApplyPending();
    message = appendGatewayApplyMessage(message);

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message,
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  async setDefaultModel(modelKey: string): Promise<ModelConfigActionResponse> {
    const state = await this.access.ensureSavedModelState();
    const matchingEntry = state.modelEntries?.find((entry) => entry.modelKey === modelKey);

    if (matchingEntry) {
      return this.setDefaultModelEntry({ entryId: matchingEntry.id });
    }

    const mutation = await this.access.runMutationWithConfigFallback({
      commandArgs: ["models", "set", modelKey],
      fallbackDescription: `models.default ${modelKey}`,
      applyFallback: async () => {
        await this.access.writeDefaultModelConfig(modelKey);
      }
    });

    if (!mutation.usedFallback && mutation.result.code !== 0) {
      throw new Error(mutation.result.stderr || mutation.result.stdout || `ChillClaw could not set ${modelKey} as the default model.`);
    }

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`Default model set to ${modelKey}.`),
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  async readEntryAuthSummary(agentDir: string, providerId?: string): Promise<{
    profileIds: string[];
    authModeLabel?: string;
    profileLabel?: string;
  }> {
    const store = await this.access.readAuthStore(agentDir);
    const provider = providerDefinitionById(providerId ?? "");
    const profiles = matchingProfilesForProvider(store, provider);
    const first = profiles[0];

    return {
      profileIds: profiles.map(([profileId]) => profileId),
      authModeLabel: first ? authModeLabelForCredentialType(first[1].type) : undefined,
      profileLabel: first ? describeProfileLabel(first[0], first[1]) : undefined
    };
  }

  async syncRuntimeModelChain(nextState: AdapterModelState): Promise<AdapterModelState> {
    const state = this.access.normalizeStateFlags(nextState);
    const defaultEntry = state.modelEntries?.find((entry) => entry.id === state.defaultModelEntryId);
    const fallbackEntries = (state.fallbackModelEntryIds ?? [])
      .map((entryId) => state.modelEntries?.find((entry) => entry.id === entryId))
      .filter((entry): entry is SavedModelEntryLike => Boolean(entry));

    if (!defaultEntry) {
      await this.access.writeAdapterState(state);
      return state;
    }

    const snapshot = await this.access.readOpenClawConfigSnapshot();
    const allModelKeys = [...new Set((state.modelEntries ?? []).map((entry) => entry.modelKey))];

    snapshot.config.agents = snapshot.config.agents ?? {};
    snapshot.config.agents.defaults = {
      ...snapshot.config.agents.defaults,
      model: {
        primary: defaultEntry.modelKey,
        fallbacks: fallbackEntries.map((entry) => entry.modelKey)
      },
      models: Object.fromEntries(
        allModelKeys.map((modelKey) => [modelKey, snapshot.config.agents?.defaults?.models?.[modelKey] ?? {}])
      )
    };
    syncManagedLocalOllamaProviderConfig(snapshot.config, state.modelEntries ?? []);
    pruneExplicitMainAgentEntry(snapshot.config);

    if (!defaultEntry.agentId || !defaultEntry.agentDir || !defaultEntry.workspaceDir) {
      await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
      await this.access.writeAdapterState(state);
      return state;
    }

    const runtimeDefaultEntry = defaultEntry as SavedModelEntryLike & {
      agentId: string;
      agentDir: string;
      workspaceDir: string;
    };
    const runtimeFallbackEntries = fallbackEntries.filter(
      (entry): entry is SavedModelEntryLike & { agentId: string; agentDir: string; workspaceDir: string } =>
        Boolean(entry.agentId && entry.agentDir && entry.workspaceDir)
    );
    const activeEntries = [runtimeDefaultEntry, ...runtimeFallbackEntries];

    await this.access.upsertAgentConfigEntry(
      snapshot.configPath,
      snapshot.config,
      runtimeDefaultEntry,
      {
        primary: runtimeDefaultEntry.modelKey,
        fallbacks: runtimeFallbackEntries.map((entry) => entry.modelKey)
      }
    );

    for (const entry of state.modelEntries ?? []) {
      if (entry.id === defaultEntry.id || !entry.agentId || !entry.agentDir || !entry.workspaceDir) {
        continue;
      }

      await this.access.upsertAgentConfigEntry(
        snapshot.configPath,
        snapshot.config,
        entry as SavedModelEntryLike & { agentId: string; agentDir: string; workspaceDir: string },
        entry.modelKey
      );
    }

    await this.syncRuntimeAuthProfiles(snapshot.configPath, snapshot.config, runtimeDefaultEntry, activeEntries);
    await this.access.writeAdapterState(state);
    return state;
  }

  private buildSavedModelEntryState(
    entryId: string,
    request: SaveModelEntryRequest,
    now: string,
    existingEntry?: SavedModelEntryLike,
    method?: {
      kind?: string;
    },
    paths?: { agentId: string; agentDir: string; workspaceDir: string }
  ): SavedModelEntryLike {
    return {
      id: entryId,
      label: this.access.buildEntryLabel(request.label, request.providerId, request.modelKey),
      providerId: request.providerId,
      modelKey: request.modelKey,
      agentId: paths?.agentId ?? existingEntry?.agentId ?? "",
      agentDir: paths?.agentDir ?? existingEntry?.agentDir ?? "",
      workspaceDir: paths?.workspaceDir ?? existingEntry?.workspaceDir ?? "",
      authMethodId: request.methodId,
      authModeLabel:
        existingEntry?.authModeLabel ??
        (method?.kind === "oauth"
          ? "OAuth"
          : method?.kind === "api-key"
            ? "API key"
            : method?.kind === "token"
              ? "Token"
              : method?.kind === "local"
                ? "Local runtime"
              : undefined),
      profileLabel: existingEntry?.profileLabel,
      profileIds: existingEntry?.profileIds ?? [],
      isDefault: false,
      isFallback: false,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now
    };
  }

  private applySavedModelEntryState(
    state: AdapterModelState,
    entry: SavedModelEntryLike,
    request: SaveModelEntryRequest
  ): AdapterModelState {
    const otherEntries = (state.modelEntries ?? []).filter((item) => item.id !== entry.id);
    const nextEntries = [...otherEntries, entry];
    const previousWasDefault = state.defaultModelEntryId === entry.id;
    const previousWasFallback = (state.fallbackModelEntryIds ?? []).includes(entry.id);
    const nextState: AdapterModelState = {
      ...state,
      modelEntries: nextEntries
    };

    if (request.makeDefault) {
      nextState.defaultModelEntryId = entry.id;
    } else if (previousWasDefault) {
      nextState.defaultModelEntryId = otherEntries.find((item) => item.agentId)?.id;
    }

    const fallbackIds = new Set((state.fallbackModelEntryIds ?? []).filter((entryId) => entryId !== entry.id));
    if (request.useAsFallback) {
      fallbackIds.add(entry.id);
    }

    nextState.fallbackModelEntryIds = [...fallbackIds];

    if (!request.makeDefault && !request.useAsFallback && !previousWasDefault && !previousWasFallback) {
      return {
        ...nextState,
        modelEntries: nextEntries.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                isDefault: false,
                isFallback: false
              }
            : item
        )
      };
    }

    return this.access.normalizeStateFlags(nextState);
  }

  private async finalizeSavedModelEntryMetadataOnly(
    entryId: string,
    request: SaveModelEntryRequest
  ): Promise<ModelConfigActionResponse> {
    const state = await this.access.ensureSavedModelState();
    const existingEntry = state.modelEntries?.find((entry) => entry.id === entryId);
    const now = new Date().toISOString();
    const provider = providerDefinitionById(request.providerId);
    const method = provider?.authMethods.find((item) => item.id === request.methodId);
    const nextEntry = this.buildSavedModelEntryState(entryId, request, now, existingEntry, method);
    const previousWasRuntime = state.defaultModelEntryId === entryId || (state.fallbackModelEntryIds ?? []).includes(entryId);
    let nextState = this.applySavedModelEntryState(state, nextEntry, request);

    if (previousWasRuntime) {
      nextState = await this.syncRuntimeModelChain(nextState);
      await this.access.markGatewayApplyPending();
      return {
        ...this.access.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${nextEntry.label} was updated.`),
        modelConfig: await this.getModelConfig({ fresh: true }),
        requiresGatewayApply: true
      };
    }

    await this.access.writeAdapterState(nextState);
    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: `${nextEntry.label} was added to ChillClaw. OpenClaw will only configure it when you set it as default or fallback.`,
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: false
    };
  }

  private async finalizeSavedModelEntryOperation(operation: PendingSavedModelEntryOperationLike): Promise<ModelConfigActionResponse> {
    const state = await this.access.ensureSavedModelState();
    const now = new Date().toISOString();
    const existingEntry = state.modelEntries?.find((entry) => entry.id === operation.entryId);
    const nextEntryBase: SavedModelEntryLike = existingEntry ?? {
      id: operation.entryId,
      label: this.access.buildEntryLabel(operation.draft.label, operation.draft.providerId, operation.draft.modelKey),
      providerId: operation.draft.providerId,
      modelKey: operation.draft.modelKey,
      agentId: operation.agentId,
      agentDir: operation.agentDir,
      workspaceDir: operation.workspaceDir,
      authMethodId: operation.draft.methodId,
      profileIds: [],
      isDefault: false,
      isFallback: false,
      createdAt: now,
      updatedAt: now
    };
    const snapshot = await this.access.readOpenClawConfigSnapshot();
    const provider = providerDefinitionById(operation.draft.providerId);
    const entryDraft = {
      ...nextEntryBase,
      label: this.access.buildEntryLabel(operation.draft.label, operation.draft.providerId, operation.draft.modelKey),
      providerId: operation.draft.providerId,
      modelKey: operation.draft.modelKey,
      authMethodId: operation.draft.methodId,
      updatedAt: now
    };
    const nextEntry = entryDraft.agentId
      ? entryDraft.agentId.startsWith("chillclaw-model-")
        ? await this.replaceEntryProfileIds(snapshot.configPath, snapshot.config, entryDraft)
        : {
            ...entryDraft,
            ...(await this.readEntryAuthSummary(
              entryDraft.agentDir || snapshot.status?.agentDir || "",
              provider?.id
            ))
          }
      : entryDraft;

    const otherEntries = (state.modelEntries ?? []).filter((entry) => entry.id !== nextEntry.id);
    let nextState: AdapterModelState = this.applySavedModelEntryState(
      {
        ...state,
        modelEntries: otherEntries
      },
      nextEntry,
      operation.draft
    );
    nextState = await this.syncRuntimeModelChain(nextState);
    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`${nextEntry.label} is ready.`),
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  private async startEntryAuthentication(
    providerId: string,
    methodId: string,
    request: SaveModelEntryRequest,
    operation: PendingSavedModelEntryOperationLike
  ): Promise<ModelConfigActionResponse> {
    const provider = providerDefinitionById(providerId);
    const method = provider?.authMethods.find((item) => item.id === methodId);

    if (!provider || !method) {
      throw new Error(`Unknown auth method ${methodId} for provider ${providerId}.`);
    }

    if (provider.id === "custom") {
      throw new Error("ChillClaw hidden-agent model entries do not support custom providers yet.");
    }

    if (method.onboardAuthChoice) {
      const missingField = method.fields.find((field) => field.required && !request.values[field.id]?.trim());
      if (missingField) {
        throw new Error(`Enter ${missingField.label} first.`);
      }

      await this.access.runOpenClaw(buildOnboardAuthArgs(method, request.values), {
        allowFailure: false,
        envOverrides: {
          OPENCLAW_AGENT_DIR: operation.agentDir
        }
      });

      return this.finalizeSavedModelEntryOperation(operation);
    }

    if (method.tokenProviderId || canUseTokenPasteAuth(method)) {
      const tokenField = method.fields[0];
      const token = request.values[tokenField?.id ?? "token"]?.trim();
      const authProvider = resolveTokenAuthProvider(provider, method);

      if (!token) {
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      await this.access.runOpenClaw(
        this.access.buildModelsCommandArgs(
          [
            "auth",
            "paste-token",
            "--provider",
            authProvider,
            "--profile-id",
            `${authProvider}:chillclaw-${operation.entryId}`
          ],
          operation.agentId
        ),
        {
          allowFailure: false,
          input: `${token}\n`
        }
      );

      return this.finalizeSavedModelEntryOperation(operation);
    }

    if (method.setupTokenProvider) {
      return this.startInteractiveModelAuthSession(
        provider.id,
        method.id,
        this.access.buildModelsCommandArgs(["auth", "setup-token", "--provider", method.setupTokenProvider, "--yes"], operation.agentId),
        undefined,
        undefined,
        operation
      );
    }

    if (method.specialCommand === "login-github-copilot") {
      return this.startInteractiveModelAuthSession(
        provider.id,
        method.id,
        this.access.buildModelsCommandArgs(["auth", "login-github-copilot", "--yes"], operation.agentId),
        undefined,
        undefined,
        operation
      );
    }

    if (method.loginProviderId) {
      const args = this.access.buildModelsCommandArgs(["auth", "login", "--provider", method.loginProviderId], operation.agentId);

      if (method.loginMethodId) {
        args.push("--method", method.loginMethodId);
      }

      return this.startInteractiveModelAuthSession(
        provider.id,
        method.id,
        args,
        undefined,
        undefined,
        operation
      );
    }

    throw new Error(`ChillClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
  }

  private async createOrUpdateSavedModelEntry(
    mode: "create" | "update",
    entryId: string,
    request: SaveModelEntryRequest
  ): Promise<ModelConfigActionResponse> {
    const currentState = await this.access.ensureSavedModelState();
    const provider = providerDefinitionById(request.providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${request.providerId}`);
    }

    const method = provider.authMethods.find((item) => item.id === request.methodId);

    if (!method) {
      throw new Error(`Unknown auth method for provider ${request.providerId}: ${request.methodId}`);
    }

    const modelSnapshot = await this.access.readModelSnapshot();
    const normalizedRequest: SaveModelEntryRequest = {
      ...request,
      modelKey:
        this.access.resolveCatalogModelKey(modelSnapshot.allModels, request.modelKey, { providerId: request.providerId }) ??
        request.modelKey.trim()
    };

    const existingEntry = currentState.modelEntries?.find((entry) => entry.id === entryId);
    if (!shouldAuthenticateSavedModelEntry(mode, normalizedRequest, method)) {
      return this.finalizeSavedModelEntryMetadataOnly(entryId, normalizedRequest);
    }

    const defaultAuthContext = await this.access.readOpenClawConfigSnapshot();
    const sharedAuthAgentDir = defaultAuthContext.status?.agentDir ?? "";
    const agentId = mode === "update" ? existingEntry?.agentId ?? "" : "";
    const paths =
      mode === "update"
        ? {
            agentDir: existingEntry?.agentDir || sharedAuthAgentDir,
            workspaceDir: existingEntry?.workspaceDir || ""
          }
        : {
            agentDir: sharedAuthAgentDir,
            workspaceDir: ""
          };

    const operation: PendingSavedModelEntryOperationLike = {
      mode,
      entryId,
      agentId,
      agentDir: paths.agentDir,
      workspaceDir: paths.workspaceDir,
      draft: normalizedRequest
    };

    if (mode === "update" && !hasProvidedModelAuthValues(normalizedRequest)) {
      if (
        (method.tokenProviderId || canUseTokenPasteAuth(method)) &&
        !(await this.access.hasReusableAuthForSavedModelEntry(existingEntry, request.providerId, method))
      ) {
        const tokenField = method.fields[0];
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      return this.finalizeSavedModelEntryOperation(operation);
    }

    return this.startEntryAuthentication(provider.id, method.id, normalizedRequest, operation);
  }

  private async replaceEntryProfileIds(
    configPath: string,
    config: OpenClawConfigSnapshotLike["config"],
    entry: SavedModelEntryLike
  ): Promise<SavedModelEntryLike> {
    if (!entry.agentDir) {
      throw new Error(`ChillClaw could not find the hidden agent directory for ${entry.label}.`);
    }

    const provider = providerDefinitionById(entry.providerId);
    const store = await this.access.readAuthStore(entry.agentDir);
    const sourceProfiles = matchingProfilesForProvider(store, provider);
    const nextProfiles: NonNullable<OpenClawAuthProfileStoreLike["profiles"]> = {};
    const nextUsageStats: NonNullable<OpenClawAuthProfileStoreLike["usageStats"]> = {};
    const nextProfileIds: string[] = [];

    for (const existingProfileId of entry.profileIds ?? []) {
      delete config.auth?.profiles?.[existingProfileId];
    }

    const providerPrefix = provider?.authProviderId ?? provider?.providerRefs[0]?.replace(/\/$/, "") ?? entry.providerId;

    sourceProfiles.forEach(([profileId, profile], index) => {
      const nextProfileId = `${providerPrefix}:chillclaw-${entry.id}-${index + 1}`;
      nextProfiles[nextProfileId] = profile;
      if (store.usageStats?.[profileId]) {
        nextUsageStats[nextProfileId] = store.usageStats[profileId];
      }
      nextProfileIds.push(nextProfileId);
    });

    for (const [profileId, profile] of Object.entries(store.profiles ?? {})) {
      if (sourceProfiles.some(([id]) => id === profileId)) {
        continue;
      }

      nextProfiles[profileId] = profile;
      if (store.usageStats?.[profileId]) {
        nextUsageStats[profileId] = store.usageStats[profileId];
      }
    }

    store.profiles = nextProfiles;
    store.usageStats = nextUsageStats;

    if (store.lastGood) {
      for (const [providerKey, profileId] of Object.entries(store.lastGood)) {
        const sourceIndex = sourceProfiles.findIndex(([id]) => id === profileId);
        if (sourceIndex >= 0) {
          store.lastGood[providerKey] = nextProfileIds[sourceIndex];
        }
      }
    }

    await this.access.writeAuthStore(entry.agentDir, store);

    config.auth = config.auth ?? {};
    config.auth.profiles = config.auth.profiles ?? {};

    for (const profileId of nextProfileIds) {
      const profile = nextProfiles[profileId];
      if (!profile) {
        continue;
      }

      config.auth.profiles[profileId] = {
        provider: String(profile.provider ?? providerPrefix),
        mode: authModeForCredentialType(profile.type),
        ...(typeof profile.email === "string" && profile.email.trim() ? { email: profile.email.trim() } : {})
      };
    }

    await this.access.writeOpenClawConfigSnapshot(configPath, config);

    return {
      ...entry,
      profileIds: nextProfileIds,
      authModeLabel: nextProfileIds[0] ? authModeLabelForCredentialType(nextProfiles[nextProfileIds[0]]?.type) : undefined,
      profileLabel: nextProfileIds[0] ? describeProfileLabel(nextProfileIds[0], nextProfiles[nextProfileIds[0]] ?? {}) : undefined
    };
  }

  private async syncRuntimeAuthProfiles(
    configPath: string,
    config: OpenClawConfigSnapshotLike["config"],
    defaultEntry: SavedModelEntryLike & { agentDir: string },
    activeEntries: SavedModelEntryLike[]
  ): Promise<void> {
    const targetStore = await this.access.readAuthStore(defaultEntry.agentDir);
    targetStore.profiles = targetStore.profiles ?? {};
    targetStore.usageStats = targetStore.usageStats ?? {};
    targetStore.order = targetStore.order ?? {};
    config.auth = config.auth ?? {};
    config.auth.profiles = config.auth.profiles ?? {};

    for (const entry of activeEntries) {
      if (!entry.agentDir) {
        continue;
      }

      const sourceStore = await this.access.readAuthStore(entry.agentDir);
      const providerOrder: string[] = [];

      for (const profileId of entry.profileIds ?? []) {
        const profile = sourceStore.profiles?.[profileId];
        if (!profile) {
          continue;
        }

        targetStore.profiles[profileId] = profile;
        if (sourceStore.usageStats?.[profileId]) {
          targetStore.usageStats[profileId] = sourceStore.usageStats[profileId];
        }

        providerOrder.push(profileId);
        config.auth.profiles[profileId] = {
          provider: String(profile.provider ?? entry.providerId),
          mode: authModeForCredentialType(profile.type),
          ...(typeof profile.email === "string" && profile.email.trim() ? { email: profile.email.trim() } : {})
        };
      }

      if (providerOrder.length > 0) {
        const provider = providerDefinitionById(entry.providerId);
        const providerConfigKey =
          provider?.authProviderId ??
          provider?.providerRefs[0]?.replace(/\/$/, "") ??
          entry.providerId;
        targetStore.order[providerConfigKey] = providerOrder;
      }
    }

    await this.access.writeAuthStore(defaultEntry.agentDir, targetStore);
    await this.access.writeOpenClawConfigSnapshot(configPath, config);
  }

  private async removeRuntimeDerivedModelEntry(
    entry: SavedModelEntryLike,
    nextState: AdapterModelState
  ): Promise<ModelConfigActionResponse> {
    if (nextState.defaultModelEntryId) {
      await this.syncRuntimeModelChain(nextState);
    } else {
      const snapshot = await this.access.readOpenClawConfigSnapshot();
      this.access.removeRuntimeDerivedModelFromConfig(snapshot.config, snapshot.status, entry.modelKey);
      pruneExplicitMainAgentEntry(snapshot.config);
      await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
      await this.access.writeAdapterState(nextState);
    }

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`${entry.label} was removed from OpenClaw.`),
      modelConfig: await this.getModelConfig({ fresh: true }),
      requiresGatewayApply: true
    };
  }

  private async deleteManagedModelAgent(entry: SavedModelEntryLike): Promise<void> {
    if (!isManagedModelAgentId(entry.agentId)) {
      return;
    }

    const result = await this.access.runOpenClaw(["agents", "delete", entry.agentId, "--force", "--json"], {
      allowFailure: true
    });

    if (result.code !== 0) {
      const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
      if (!output.includes("not found")) {
        throw new Error(result.stderr || result.stdout || `ChillClaw could not delete the hidden model agent ${entry.agentId}.`);
      }
    }

    await rm(getManagedModelAgentRootDir(entry.id), { recursive: true, force: true }).catch(() => undefined);
  }

  private async removeProfileIdsFromAuthStore(agentDir: string | undefined, profileIds: string[]): Promise<void> {
    if (!agentDir || profileIds.length === 0) {
      return;
    }

    const store = await this.access.readAuthStore(agentDir);
    const profileIdSet = new Set(profileIds);

    for (const profileId of profileIdSet) {
      delete store.profiles?.[profileId];
      delete store.usageStats?.[profileId];
    }

    if (store.order) {
      store.order = Object.fromEntries(
        Object.entries(store.order)
          .map(([providerId, orderedProfileIds]) => [
            providerId,
            orderedProfileIds.filter((profileId) => !profileIdSet.has(profileId))
          ])
          .filter(([, orderedProfileIds]) => orderedProfileIds.length > 0)
      );
    }

    if (store.lastGood) {
      store.lastGood = Object.fromEntries(
        Object.entries(store.lastGood).filter(([, profileId]) => !profileIdSet.has(profileId))
      );
    }

    await this.access.writeAuthStore(agentDir, store);
  }

  private async cleanupRemovedSavedModelEntry(
    entry: SavedModelEntryLike,
    nextState: AdapterModelState
  ): Promise<void> {
    const snapshot = await this.access.readOpenClawConfigSnapshot();

    if (isManagedModelAgentId(entry.agentId) || isImplicitMainAgentId(entry.agentId)) {
      snapshot.config.agents = {
        ...snapshot.config.agents,
        list: (snapshot.config.agents?.list ?? []).filter((item) => item.id !== entry.agentId)
      };
    }

    pruneExplicitMainAgentEntry(snapshot.config);

    if (isManagedModelAgentId(entry.agentId)) {
      removeProfileIdsFromConfig(snapshot.config, entry.profileIds ?? []);
      await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);

      const nextDefaultEntry = (nextState.modelEntries ?? []).find((item) => item.id === nextState.defaultModelEntryId);
      await this.removeProfileIdsFromAuthStore(nextDefaultEntry?.agentDir, entry.profileIds ?? []);
    }

    if (isManagedModelAgentId(entry.agentId)) {
      await this.deleteManagedModelAgent(entry);
    }
  }
}
