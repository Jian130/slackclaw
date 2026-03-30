import { randomUUID } from "node:crypto";

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
} from "@slackclaw/contracts";

import {
  buildBaseOnboardArgs,
  buildOnboardAuthArgs,
  canUseTokenPasteAuth,
  providerDefinitionById,
  resolveTokenAuthProvider
} from "../config/openclaw-model-provider-catalog.js";
import { appendGatewayApplyMessage } from "./openclaw-shared.js";

type SavedModelEntryLike = SavedModelEntry & {
  agentDir?: string;
  workspaceDir?: string;
  profileIds?: string[];
};

type ModelSnapshotLike = {
  allModels: ModelCatalogEntry[];
  configuredModels: ModelCatalogEntry[];
  configuredAuthProviders: Set<string>;
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
};

type ModelsConfigAccess = {
  readModelSnapshot: () => Promise<ModelSnapshotLike>;
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
  ensureSavedModelState: () => Promise<AdapterModelState>;
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
  spawnInteractiveCommand: (
    command: string,
    args: string[],
    envOverrides?: Record<string, string | undefined>
  ) => InteractiveAuthChildLike;
  appendAuthSessionOutput: (session: RuntimeModelAuthSessionLike, chunk: string) => void;
  writeErrorLog: (message: string, details: unknown) => Promise<void>;
  errorToLogDetails: (error: unknown) => unknown;
  readOpenClawConfigSnapshot: () => Promise<{
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
      [key: string]: unknown;
    };
    status?: {
      agentDir?: string;
    };
  }>;
  readEntryAuthSummary: (
    agentDir: string,
    providerId?: string
  ) => Promise<{ profileIds: string[]; authModeLabel?: string; profileLabel?: string }>;
  replaceEntryProfileIds: (
    configPath: string,
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
      [key: string]: unknown;
    },
    entry: SavedModelEntryLike
  ) => Promise<SavedModelEntryLike>;
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
  removeRuntimeDerivedModelEntry: (
    entry: SavedModelEntryLike,
    nextState: AdapterModelState
  ) => Promise<ModelConfigActionResponse>;
  cleanupRemovedSavedModelEntry: (entry: SavedModelEntryLike, nextState: AdapterModelState) => Promise<void>;
  syncRuntimeModelChain: (nextState: AdapterModelState) => Promise<AdapterModelState>;
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

export class ModelsConfigCoordinator {
  constructor(private readonly access: ModelsConfigAccess) {}

  async getModelConfig(): Promise<ModelConfigOverview> {
    const snapshot = await this.access.readModelSnapshot();

    if (this.access.isCleanModelRuntime(snapshot)) {
      const adapterState = this.access.normalizeStateFlags(await this.access.readAdapterState());
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

    const adapterState = await this.access.ensureSavedModelState();
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
      message: "SlackClaw is starting the OpenClaw authentication flow.",
      logs: [`[SlackClaw] Starting ${provider.label} ${method.label}...`],
      launchUrl: undefined,
      inputPrompt: undefined,
      child: undefined,
      outputBuffer: "",
      setDefaultModel,
      browserOpened: false,
      agentDir: pendingEntry?.agentDir,
      pendingEntry
    };

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
      session.message = "SlackClaw could not start the OpenClaw authentication flow.";
      session.logs = trimLogLines([...session.logs, error instanceof Error ? error.message : String(error)]);
      void this.access.writeErrorLog("Failed to start interactive OpenClaw auth session.", {
        providerId,
        methodId,
        error: this.access.errorToLogDetails(error)
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
                  });
                });
              }

              await this.access.markGatewayApplyPending();
              session.status = "completed";
              session.message = appendGatewayApplyMessage(`${provider.label} authentication completed.`);
            }
          } catch (error) {
            session.status = "failed";
            session.message =
              session.pendingEntry
                ? `${provider.label} authentication completed, but SlackClaw could not finish the saved model entry setup.`
                : `${provider.label} authentication completed, but SlackClaw could not save the staged configuration.`;
            session.logs = trimLogLines([
              ...session.logs,
              error instanceof Error ? error.message : "SlackClaw could not finish the interactive model setup."
            ]);
            await this.access.writeErrorLog("Failed to finalize interactive OpenClaw model auth.", {
              providerId,
              methodId,
              entryId: session.pendingEntry?.entryId,
              error: this.access.errorToLogDetails(error)
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
      message: `SlackClaw started the ${provider.label} ${method.label} flow.`,
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
      modelConfig: await this.getModelConfig()
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
    session.message = "SlackClaw sent the pasted redirect URL / code to OpenClaw. Waiting for completion.";
    session.logs = trimLogLines([...session.logs, "[SlackClaw] Submitted redirect URL / code to OpenClaw."]);
    session.inputPrompt = undefined;

    return this.getModelAuthSession(sessionId);
  }

  createSavedModelEntry(request: SaveModelEntryRequest) {
    return this.createOrUpdateSavedModelEntry("create", randomUUID(), request);
  }

  updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest) {
    return this.createOrUpdateSavedModelEntry("update", entryId, request);
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
      return this.access.removeRuntimeDerivedModelEntry(entry, nextState);
    }

    await this.access.cleanupRemovedSavedModelEntry(entry, nextState);

    if (touchedRuntime) {
      await this.access.syncRuntimeModelChain(nextState);
      await this.access.markGatewayApplyPending();

      return {
        ...this.access.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${entry.label} was removed.`),
        modelConfig: await this.getModelConfig(),
        requiresGatewayApply: true
      };
    }

    await this.access.writeAdapterState(nextState);
    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: `${entry.label} was removed from SlackClaw.`,
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: false
    };
  }

  async setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    if (!state.modelEntries?.some((entry) => entry.id === request.entryId)) {
      throw new Error("Saved model entry not found.");
    }

    await this.access.syncRuntimeModelChain({
      ...state,
      defaultModelEntryId: request.entryId,
      fallbackModelEntryIds: (state.fallbackModelEntryIds ?? []).filter((entryId) => entryId !== request.entryId)
    });

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Default AI model updated."),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.access.normalizeStateFlags(await this.access.readAdapterState());
    await this.access.syncRuntimeModelChain({
      ...state,
      fallbackModelEntryIds: request.entryIds
    });

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Fallback AI models updated."),
      modelConfig: await this.getModelConfig(),
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
        throw new Error("SlackClaw custom provider setup requires the custom endpoint method.");
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
      throw new Error(`SlackClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
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
      modelConfig: await this.getModelConfig(),
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
      throw new Error(mutation.result.stderr || mutation.result.stdout || `SlackClaw could not set ${modelKey} as the default model.`);
    }

    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`Default model set to ${modelKey}.`),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
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
      nextState = await this.access.syncRuntimeModelChain(nextState);
      await this.access.markGatewayApplyPending();
      return {
        ...this.access.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${nextEntry.label} was updated.`),
        modelConfig: await this.getModelConfig(),
        requiresGatewayApply: true
      };
    }

    await this.access.writeAdapterState(nextState);
    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: `${nextEntry.label} was added to SlackClaw. OpenClaw will only configure it when you set it as default or fallback.`,
      modelConfig: await this.getModelConfig(),
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
      ? entryDraft.agentId.startsWith("slackclaw-model-")
        ? await this.access.replaceEntryProfileIds(snapshot.configPath, snapshot.config, entryDraft)
        : {
            ...entryDraft,
            ...(await this.access.readEntryAuthSummary(
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
    nextState = await this.access.syncRuntimeModelChain(nextState);
    await this.access.markGatewayApplyPending();

    return {
      ...this.access.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`${nextEntry.label} is ready.`),
      modelConfig: await this.getModelConfig(),
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
      throw new Error("SlackClaw hidden-agent model entries do not support custom providers yet.");
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
            `${authProvider}:slackclaw-${operation.entryId}`
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

    throw new Error(`SlackClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
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
}
