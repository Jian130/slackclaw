import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, resolve } from "node:path";

import type {
  BrainAssignment,
  SupportedChannelId,
  ChannelSession,
  ConfiguredChannelEntry,
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  GatewayActionResponse,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSession,
  ModelAuthMethod,
  ModelCatalogEntry,
  ModelConfigOverview,
  SaveModelEntryRequest,
  SavedModelEntry,
  SkillMarketplaceEntry,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  RecoveryAction,
  RecoveryRunResponse,
  FeishuSetupRequest,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@chillclaw/contracts";
import { writeMemberWorkspaceFiles } from "./member-workspace.js";
import { AgentsConfigCoordinator } from "./openclaw-agents-config-coordinator.js";
import { OpenClawAIEmployeeManager } from "./openclaw-ai-employee-manager.js";
import { CapabilityConfigCoordinator } from "./openclaw-capability-config-coordinator.js";
import { OpenClawChatService } from "./openclaw-chat-service.js";
import { ChannelsConfigCoordinator } from "./openclaw-channels-config-coordinator.js";
import { OpenClawConfigManager } from "./openclaw-config-manager.js";
import { OpenClawGatewayManager } from "./openclaw-gateway-manager.js";
import { OpenClawInstanceManager } from "./openclaw-instance-manager.js";
import { ModelsConfigCoordinator } from "./openclaw-models-config-coordinator.js";
import { OpenClawPluginManager } from "./openclaw-plugin-manager.js";
import { OpenClawRuntimeLifecycleService } from "./openclaw-runtime-lifecycle-service.js";
import { appendGatewayApplyMessage, summarizePendingGatewayApply } from "./openclaw-shared.js";
import { type CommandResult, probeCommand as probeExternalCommand, resolveCommandFromPath as resolveCommandFromShellPath, runCommand as runExternalCommand } from "../platform/cli-runner.js";
import { createDefaultSecretsAdapter } from "../platform/macos-keychain-secrets-adapter.js";
import { OpenClawGatewaySocketAdapter, normalizeGatewaySocketUrl } from "../platform/openclaw-gateway-socket-adapter.js";
import { modelAuthSecretName, type SecretsAdapter } from "../platform/secrets-adapter.js";
import {
  listModelProviderDefinitions,
  providerDefinitionById,
  providerDefinitionByModelKey,
  toPublicAuthMethod,
  type InternalModelAuthMethod,
  type InternalModelProviderConfig
} from "../config/openclaw-model-provider-catalog.js";
import {
  createChannelState,
} from "../config/channel-setup-state.js";

import type {
  AIEmployeeManager,
  ConfigManager,
  EngineAdapter,
  GatewayManager,
  InstanceManager
} from "./adapter.js";
import type {
  AIMemberRuntimeCandidate,
  AIMemberRuntimeRequest,
  PluginManager,
} from "./adapter.js";
import {
  getAppRootDir,
  getDataDir,
  getManagedOpenClawBinPath,
  getManagedOpenClawDir,
  getManagedWechatInstallerDir
} from "../runtime-paths.js";
import { errorToLogDetails, logDevelopmentCommand, writeErrorLog, writeInfoLog } from "../services/logger.js";

interface OpenClawStatusJson {
  setup?: {
    required?: boolean;
  };
  gateway?: {
    reachable?: boolean;
    error?: string | null;
  };
  gatewayService?: {
    installed?: boolean;
    loadedText?: string;
    runtimeShort?: string;
  };
  channelSummary?: string[];
  providers?: {
    summary?: {
      missingProfiles?: number;
      error?: string | null;
    };
    missing?: string[];
  };
  securityAudit?: {
    summary?: {
      critical?: number;
      warn?: number;
      info?: number;
    };
    findings?: Array<{
      checkId?: string;
      severity?: string;
      title?: string;
      detail?: string;
      remediation?: string;
    }>;
  };
  agents?: {
    defaultId?: string;
    bootstrapPendingCount?: number;
  };
}

type SecurityFinding = NonNullable<NonNullable<OpenClawStatusJson["securityAudit"]>["findings"]>[number];

interface OpenClawGatewayStatusJson {
  service?: {
    installed?: boolean;
    loaded?: boolean;
    loadedText?: string;
    runtime?: {
      status?: string;
      detail?: string;
    };
    configAudit?: {
      ok?: boolean;
      issues?: Array<{
        code?: string;
        message?: string;
        detail?: string;
        level?: string;
      }>;
    };
  };
  rpc?: {
    ok?: boolean;
    error?: string;
    url?: string;
  };
}

interface OpenClawUpdateStatusJson {
  update?: {
    root?: string;
    installKind?: string;
    packageManager?: string;
    registry?: {
      latestVersion?: string | null;
      error?: string | null;
    };
  };
  channel?: {
    label?: string;
  };
  availability?: {
    available?: boolean;
    latestVersion?: string | null;
  };
}

interface OpenClawTargetUpdateStatus {
  updateAvailable: boolean;
  latestVersion?: string;
  summary: string;
}

interface OpenClawModelListJson {
  count?: number;
  models?: ModelCatalogEntry[];
}

interface OpenClawSkillsListJson {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills?: Array<{
    name?: string;
    description?: string;
    emoji?: string;
    eligible?: boolean;
    disabled?: boolean;
    blockedByAllowlist?: boolean;
    source?: string;
    bundled?: boolean;
    homepage?: string;
    missing?: OpenClawSkillMissing;
  }>;
}

interface OpenClawSkillMissing {
  bins?: string[];
  anyBins?: string[];
  env?: string[];
  config?: string[];
  os?: string[];
}

interface OpenClawModelStatusJson {
  configPath?: string;
  agentDir?: string;
  defaultModel?: string | null;
  resolvedDefault?: string | null;
  fallbacks?: string[];
  imageModel?: string | null;
  imageFallbacks?: string[];
  aliases?: Record<string, string>;
  allowed?: string[];
  auth?: {
    providers?: Array<{
      provider?: string;
      profiles?: {
        count?: number;
        oauth?: number;
        token?: number;
        apiKey?: number;
      };
    }>;
    oauth?: {
      providers?: Array<{
        provider?: string;
        status?: string;
      }>;
    };
  };
}

interface OpenClawPluginListJson {
  plugins?: Array<{
    id?: string;
    name?: string;
    source?: string;
    origin?: string;
    enabled?: boolean;
    status?: string;
    error?: string;
  }>;
  diagnostics?: Array<{
    level?: string;
    pluginId?: string;
    source?: string;
    message?: string;
  }>;
}

interface OpenClawChannelsListJson {
  chat?: Record<string, string[]>;
}

interface OpenClawChannelsStatusJson {
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channels?: Record<
    string,
    {
      configured?: boolean;
      running?: boolean;
      linked?: boolean;
      connected?: boolean;
      mode?: string;
      probe?: {
        ok?: boolean;
        bot?: {
          username?: string;
        };
      };
      self?: {
        e164?: string;
      };
      lastError?: string | null;
    }
  >;
  channelAccounts?: Record<
    string,
    Array<{
      accountId?: string;
      configured?: boolean;
      enabled?: boolean;
      running?: boolean;
      linked?: boolean;
      connected?: boolean;
      mode?: string;
      tokenSource?: string;
      probe?: {
        ok?: boolean;
        bot?: {
          username?: string;
        };
      };
      self?: {
        e164?: string;
      };
      lastError?: string | null;
    }>
  >;
}

interface OpenClawAgentListEntry {
  id?: string;
  name?: string;
  identityName?: string;
  identityEmoji?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  bindings?: number;
  isDefault?: boolean;
}

export function isVisibleAIMemberAgentId(agentId: string | undefined): boolean {
  const trimmed = agentId?.trim();

  return Boolean(trimmed && trimmed !== OPENCLAW_MAIN_AGENT_ID && !isManagedModelAgentId(trimmed));
}

function isManagedModelAgentId(agentId: string | undefined): boolean {
  const trimmed = agentId?.trim();
  return Boolean(trimmed && trimmed.startsWith("chillclaw-model-"));
}

function isImplicitMainAgentId(agentId: string | undefined): boolean {
  return agentId?.trim() === OPENCLAW_MAIN_AGENT_ID;
}

interface OpenClawAdapterState {
  configuredProfileId?: string;
  installedAt?: string;
  lastInstallMode?: "detected" | "onboarded";
  modelEntries?: SavedModelEntryState[];
  defaultModelEntryId?: string;
  fallbackModelEntryIds?: string[];
  pendingGatewayApply?: boolean;
  pendingGatewayApplySummary?: string;
}

interface OpenClawConfigFileJson {
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
  channels?: Record<string, unknown>;
  plugins?: {
    entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  };
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
}

interface OpenClawAuthProfileStoreJson {
  version?: number;
  profiles?: Record<string, Record<string, unknown> & { provider?: string; type?: string; email?: string; accountId?: string }>;
  usageStats?: Record<string, unknown>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
}

const OPENCLAW_STATE_PATH = resolve(getDataDir(), "openclaw-state.json");
const OPENCLAW_VERSION_OVERRIDE = process.env.CHILLCLAW_OPENCLAW_VERSION?.trim() || undefined;
const OPENCLAW_INSTALL_TARGET = OPENCLAW_VERSION_OVERRIDE ?? "latest";
const OPENCLAW_PACKAGE_SPEC = OPENCLAW_VERSION_OVERRIDE ? `openclaw@${OPENCLAW_VERSION_OVERRIDE}` : "openclaw@latest";
const WECHAT_INSTALLER_PACKAGE_SPEC = "@tencent-weixin/openclaw-weixin-cli@latest";
const PERSONAL_WECHAT_RUNTIME_CHANNEL_KEY = "openclaw-weixin";
const FEISHU_BUNDLED_SINCE = "2026.3.7";
const OPENCLAW_MAIN_AGENT_ID = "main";
const OPENCLAW_INSTALL_DOCS_URL = "https://docs.openclaw.ai/install";
const OPENCLAW_MAC_DOCS_URL = "https://docs.openclaw.ai/mac/bun";
const CHILLCLAW_OPENCLAW_GATEWAY_MODE = "local";
const CHILLCLAW_OPENCLAW_GATEWAY_BIND = "loopback";
const CHILLCLAW_OPENCLAW_GATEWAY_AUTH_MODE = "token";
const STANDARD_OPENCLAW_REQUIREMENTS = [
  "macOS",
  "Node.js 22 or newer",
  "A global openclaw CLI install for local mode",
  "pnpm only if you build OpenClaw from source"
];
const MANAGED_OPENCLAW_REQUIREMENTS = [
  "macOS",
  "Node.js 22 or newer",
  "pnpm only if you build OpenClaw from source"
];

interface BootstrapResult {
  status: "reused-existing" | "would-install" | "would-reinstall" | "installed" | "reinstalled" | "failed";
  changed: boolean;
  hadExisting: boolean;
  existingVersion?: string;
  version?: string | null;
  message: string;
}

interface CommandInvocation {
  command: string;
  argsPrefix: string[];
  display: string;
}

interface RuntimeModelAuthSession extends ModelAuthSession {
  child?: ReturnType<typeof spawn>;
  outputBuffer: string;
  setDefaultModel?: string;
  browserOpened: boolean;
  agentDir?: string;
  pendingEntry?: PendingSavedModelEntryOperation;
}

interface SavedModelEntryState extends SavedModelEntry {
  agentDir: string;
  workspaceDir: string;
  profileIds: string[];
}

interface PendingSavedModelEntryOperation {
  mode: "create" | "update";
  entryId: string;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  draft: SaveModelEntryRequest;
}

type CommandFallbackDecision = "retry-with-config" | "hard-fail" | "not-applicable";

const LEGACY_WECOM_CHANNEL_KEY = "wecom-openclaw-plugin";
const CANONICAL_WECOM_CHANNEL_KEY = "wecom";

const modelAuthSessions = new Map<string, RuntimeModelAuthSession>();

const READ_CACHE_TTL_MS = {
  engine: 1000,
  models: 1000,
  channels: 1000,
  skills: 1000,
  agents: 1000,
  bindings: 1000
} as const;

type ReadCacheEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
  settled: boolean;
};

type CommandResolutionCacheEntry = {
  promise: Promise<string | undefined>;
  value?: string | undefined;
};

type EngineReadSnapshot = {
  installed: boolean;
  command?: string;
  cliVersion?: string;
  statusJson?: OpenClawStatusJson;
  gatewayJson?: OpenClawGatewayStatusJson;
  updateJson?: OpenClawUpdateStatusJson;
};

export { buildGatewaySocketConnectParams } from "../platform/openclaw-gateway-socket-adapter.js";

type ModelReadSnapshot = {
  allModels: ModelCatalogEntry[];
  configuredModels: ModelCatalogEntry[];
  status?: OpenClawModelStatusJson;
  activeConfig?: OpenClawConfigFileJson;
  configuredAuthProviders: Set<string>;
  supplemental: ReturnType<typeof collectSupplementalModelRefs>;
};

type ChannelReadSnapshot = {
  list?: OpenClawChannelsListJson;
  status?: OpenClawChannelsStatusJson;
};

type SkillReadSnapshot = {
  list?: OpenClawSkillsListJson;
  warnings: string[];
};

const gatewaySocketBridge = new OpenClawGatewaySocketAdapter({
  readConnectionInfo: async () => {
    const snapshot = await readEngineSnapshot();
    const url = snapshot.gatewayJson?.rpc?.url?.trim();

    if (!url) {
      return undefined;
    }

    const config = (await readOpenClawConfigFile(defaultOpenClawConfigPath())) ?? {};
    const token = config.gateway?.auth?.token?.trim();

    if (!token || token.startsWith("__OPENCLAW_")) {
      return undefined;
    }

    return {
      url: normalizeGatewaySocketUrl(url),
      token
    };
  },
  onReconnectError: async (error) => {
    await writeErrorLog("ChillClaw lost the live OpenClaw chat event bridge.", {
      error: errorToLogDetails(error)
    });
  }
});

const readCache = new Map<string, ReadCacheEntry>();
const commandResolutionCache = new Map<string, CommandResolutionCacheEntry>();

function invalidateReadCache(...prefixes: string[]): void {
  if (prefixes.length === 0) {
    readCache.clear();
    return;
  }

  for (const key of [...readCache.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      const entry = readCache.get(key);
      if (!entry) {
        continue;
      }

      // Preserve in-flight reads so overlapping fresh requests share the same
      // snapshot load instead of stampeding the OpenClaw CLI.
      if (entry.settled) {
        readCache.delete(key);
      } else {
        entry.expiresAt = 0;
      }
    }
  }
}

function invalidateCommandResolutionCache(...keys: string[]): void {
  if (keys.length === 0) {
    commandResolutionCache.clear();
    return;
  }

  for (const key of keys) {
    commandResolutionCache.delete(key);
  }
}

function invalidateResolvedCommandByPath(command: string): void {
  for (const [key, entry] of commandResolutionCache.entries()) {
    if (entry.value === command) {
      commandResolutionCache.delete(key);
    }
  }
}

async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options?: { fresh?: boolean }
): Promise<T> {
  const now = Date.now();
  const existing = readCache.get(key);

  if (existing) {
    if (!existing.settled) {
      return existing.promise as Promise<T>;
    }
    if (!options?.fresh && existing.expiresAt > now) {
      return existing.promise as Promise<T>;
    }
  }

  const entry: ReadCacheEntry = {
    expiresAt: now + ttlMs,
    promise: Promise.resolve(),
    settled: false
  };

  const promise = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (readCache.get(key)?.promise === promise) {
        readCache.delete(key);
      }
      throw error;
    })
    .finally(() => {
      entry.settled = true;
      if (entry.expiresAt <= Date.now() && readCache.get(key)?.promise === promise) {
        readCache.delete(key);
      }
    });

  entry.promise = promise;
  readCache.set(key, entry);

  return promise;
}

async function resolveStickyCommand(
  key: string,
  resolver: () => Promise<string | undefined>,
  options?: { fresh?: boolean }
): Promise<string | undefined> {
  if (options?.fresh) {
    commandResolutionCache.delete(key);
  }

  const existing = commandResolutionCache.get(key);
  if (existing) {
    return existing.promise;
  }

  const entry: CommandResolutionCacheEntry = {
    promise: Promise.resolve()
      .then(resolver)
      .then((resolved) => {
        const current = commandResolutionCache.get(key);
        if (current) {
          current.value = resolved;
        }
        return resolved;
      })
      .catch((error) => {
        if (commandResolutionCache.get(key)?.promise === entry.promise) {
          commandResolutionCache.delete(key);
        }
        throw error;
      })
  };

  commandResolutionCache.set(key, entry);
  return entry.promise;
}

function buildCommandEnv(command?: string, envOverrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const pathEntries = [
    command && command.startsWith("/") ? dirname(command) : undefined,
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ].filter((value): value is string => Boolean(value));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [...new Set(pathEntries)].join(delimiter),
    NO_COLOR: "1"
  };

  for (const [key, value] of Object.entries(envOverrides ?? {})) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return env;
}

function isOpenClawCommand(command: string): boolean {
  return basename(command) === "openclaw";
}

export function isGlobalNpmManagedOpenClawCommand(
  commandPath: string | undefined,
  npmPrefix: string | undefined,
  npmRoot: string | undefined,
  packageInstalled: boolean
): boolean {
  if (!commandPath || !npmPrefix || !npmRoot || !packageInstalled) {
    return false;
  }

  return resolve(commandPath) === resolve(npmPrefix, "bin", "openclaw");
}

function logExternalCommand(command: string, args: string[]): void {
  logDevelopmentCommand(isOpenClawCommand(command) ? "openclaw" : "exec", command, args);
}

function runtimeChannelKeys(channelId: SupportedChannelId): string[] {
  switch (channelId) {
    case "wechat-work":
      return [CANONICAL_WECOM_CHANNEL_KEY, LEGACY_WECOM_CHANNEL_KEY, "wechat-work", "wechat"];
    case "wechat":
      return [PERSONAL_WECHAT_RUNTIME_CHANNEL_KEY];
    default:
      return [channelId];
  }
}

function supportedBindingChannelId(prefix: string): SupportedChannelId | undefined {
  if (prefix === "telegram" || prefix === "whatsapp" || prefix === "feishu" || prefix === "wechat-work" || prefix === "wechat") {
    return prefix;
  }

  return normalizeRuntimeChannelId(prefix);
}

function toRuntimeBindingTarget(binding: string): string {
  const trimmed = binding.trim();
  if (!trimmed) {
    return trimmed;
  }

  const [prefix, ...rest] = trimmed.split(":");
  const channelId = supportedBindingChannelId(prefix);
  if (!channelId) {
    return trimmed;
  }

  const runtimeChannelId = runtimeChannelKeys(channelId)[0] ?? prefix;
  return [runtimeChannelId, ...rest].join(":");
}

function normalizeRuntimeChannelId(channelId: string): SupportedChannelId | undefined {
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

async function runOpenClaw(
  args: string[],
  options?: {
    allowFailure?: boolean;
    envOverrides?: Record<string, string | undefined>;
    input?: string;
    freshCommandResolution?: boolean;
  }
): Promise<CommandResult> {
  const command = await resolveOpenClawCommand({ fresh: options?.freshCommandResolution });

  if (!command) {
    if (options?.allowFailure) {
      return {
        code: 1,
        stdout: "",
        stderr: "OpenClaw CLI is not installed."
      };
    }

    throw new Error("OpenClaw CLI is not installed.");
  }

  const result = await runCommand(command, args, options);
  if (!(await repairLegacyWecomChannelConfigFromFailure(result))) {
    return result;
  }

  return runCommand(command, args, options);
}

function isLegacyWecomChannelConfigFailure(result: CommandResult): boolean {
  const text = commandFailureText(result).toLowerCase();
  return (
    text.includes(`channels.${LEGACY_WECOM_CHANNEL_KEY}`) &&
    text.includes(`unknown channel id: ${LEGACY_WECOM_CHANNEL_KEY}`)
  );
}

function normalizeLegacyWecomChannelConfigEntry(entry: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = {
    enabled: true,
    dmPolicy: "pairing",
    groupPolicy: "open"
  };

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return next;
  }

  const current = entry as Record<string, unknown>;
  if (typeof current.enabled === "boolean") {
    next.enabled = current.enabled;
  }
  if (typeof current.botId === "string" && current.botId.trim()) {
    next.botId = current.botId.trim();
  }
  if (typeof current.secret === "string" && current.secret.trim()) {
    next.secret = current.secret.trim();
  }
  if (typeof current.dmPolicy === "string" && current.dmPolicy.trim()) {
    next.dmPolicy = current.dmPolicy.trim();
  }
  if (typeof current.groupPolicy === "string" && current.groupPolicy.trim()) {
    next.groupPolicy = current.groupPolicy.trim();
  }

  return next;
}

async function repairLegacyWecomChannelConfigFromFailure(result: CommandResult): Promise<boolean> {
  if (!isLegacyWecomChannelConfigFailure(result)) {
    return false;
  }

  const failureText = commandFailureText(result);
  const configPath =
    failureText.match(/^Invalid config at (.+?):$/m)?.[1]?.trim() ||
    failureText.match(/^Invalid config at (.+?):/m)?.[1]?.trim() ||
    defaultOpenClawConfigPath();
  const config = (await readOpenClawConfigFile(configPath)) ?? {};
  const legacyEntry = config.channels?.[LEGACY_WECOM_CHANNEL_KEY];

  if (!config.channels || legacyEntry === undefined) {
    return false;
  }

  const existingCanonical =
    config.channels[CANONICAL_WECOM_CHANNEL_KEY] &&
    typeof config.channels[CANONICAL_WECOM_CHANNEL_KEY] === "object" &&
    !Array.isArray(config.channels[CANONICAL_WECOM_CHANNEL_KEY])
      ? config.channels[CANONICAL_WECOM_CHANNEL_KEY] as Record<string, unknown>
      : undefined;
  config.channels[CANONICAL_WECOM_CHANNEL_KEY] = {
    ...normalizeLegacyWecomChannelConfigEntry(legacyEntry),
    ...existingCanonical
  };
  delete config.channels[LEGACY_WECOM_CHANNEL_KEY];
  if (Object.keys(config.channels).length === 0) {
    delete config.channels;
  }

  await writeOpenClawConfigFile(configPath, config);
  invalidateReadCache("models:", "engine:", "channels:", "plugins:");
  await writeInfoLog("Repaired legacy WeChat Work channel config key.", {
    configPath,
    fromKey: LEGACY_WECOM_CHANNEL_KEY,
    toKey: CANONICAL_WECOM_CHANNEL_KEY
  });
  return true;
}

async function runGatewayCall<T>(
  method: string,
  params: Record<string, unknown>,
  options?: { allowFailure?: boolean; expectFinal?: boolean; timeoutMs?: number }
): Promise<{ result: CommandResult; payload?: T }> {
  const args = ["gateway", "call", method, "--json", "--params", JSON.stringify(params)];

  if (options?.expectFinal) {
    args.push("--expect-final");
  }

  if (options?.timeoutMs) {
    args.push("--timeout", String(options.timeoutMs));
  }

  const result = await runOpenClaw(args, { allowFailure: options?.allowFailure });
  const payload = safeJsonPayloadParse<T>(result.stdout) ?? safeJsonPayloadParse<T>(result.stderr);

  return {
    result,
    payload
  };
}

async function runCommand(
  command: string,
  args: string[],
  options?: { allowFailure?: boolean; envOverrides?: Record<string, string | undefined>; input?: string }
): Promise<CommandResult> {
  return runExternalCommand(command, args, {
    allowFailure: options?.allowFailure,
    env: buildCommandEnv(command, options?.envOverrides),
    input: options?.input,
    beforeSpawn: (nextCommand, nextArgs) => {
      logExternalCommand(nextCommand, nextArgs);
    },
    onSpawnError: async (error) => {
      const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (errorCode === "ENOENT") {
        invalidateResolvedCommandByPath(command);
        invalidateReadCache(`command:version:${command}`, `command:update:${command}`, `command:status:${command}`);
      }
      await writeErrorLog("Failed to spawn system command for ChillClaw.", {
        command,
        args,
        error: errorToLogDetails(error)
      });
    }
  });
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommandFromEnvPath(command: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  if (command.includes("/")) {
    return (await fileExists(command)) ? command : undefined;
  }

  for (const entry of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(entry, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function resolveCommandFromPath(command: string): Promise<string | undefined> {
  const env = buildCommandEnv();
  const fromEnvPath = await resolveCommandFromEnvPath(command, env);
  if (fromEnvPath) {
    return fromEnvPath;
  }

  return resolveCommandFromShellPath(command, { env });
}

async function resolveCommand(command: string, extraCandidates: string[] = []): Promise<string | undefined> {
  const fromPath = await resolveCommandFromPath(command);

  if (fromPath) {
    return fromPath;
  }

  for (const candidate of extraCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function readWechatInstallerBinName(packagePath: string): Promise<string | undefined> {
  try {
    const raw = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(raw) as {
      name?: string;
      bin?: string | Record<string, string>;
    };

    if (typeof parsed.bin === "string") {
      const packageName = parsed.name?.split("/").pop()?.trim();
      return packageName || undefined;
    }

    if (parsed.bin && typeof parsed.bin === "object") {
      const [binName] = Object.keys(parsed.bin);
      return binName?.trim() || undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function probeCommand(command: string, args: string[] = ["--version"]): Promise<boolean> {
  return probeExternalCommand(command, args, {
    env: buildCommandEnv(command)
  });
}

async function resolveOpenClawCommand(options?: { fresh?: boolean }): Promise<string | undefined> {
  return (await resolveManagedOpenClawCommand(options)) ?? (await resolveSystemOpenClawCommand(options));
}

async function resolveClawHubCommand(options?: { fresh?: boolean }): Promise<string | undefined> {
  return resolveStickyCommand(
    "clawhub",
    async () => {
      return resolveCommand("clawhub", ["/opt/homebrew/bin/clawhub", "/usr/local/bin/clawhub"]);
    },
    options
  );
}

async function resolveManagedOpenClawCommand(options?: { fresh?: boolean }): Promise<string | undefined> {
  return resolveStickyCommand(
    "openclaw:managed",
    async () => {
      const managedBinary = getManagedOpenClawBinPath();

      if (await fileExists(managedBinary)) {
        return managedBinary;
      }

      return undefined;
    },
    options
  );
}

async function resolveSystemOpenClawCommand(options?: { fresh?: boolean }): Promise<string | undefined> {
  return resolveStickyCommand(
    "openclaw:system",
    async () => {
      const npmManagedCommand = await resolveExpectedNpmGlobalOpenClawCommand(await resolveNpmInvocation());
      return resolveCommand("openclaw", [
        "/opt/homebrew/bin/openclaw",
        "/usr/local/bin/openclaw",
        ...(npmManagedCommand ? [npmManagedCommand] : [])
      ]);
    },
    options
  );
}

async function runClawHub(
  args: string[],
  options?: { allowFailure?: boolean; envOverrides?: Record<string, string | undefined> }
): Promise<CommandResult> {
  const command = await resolveClawHubCommand();

  if (!command) {
    if (options?.allowFailure) {
      return {
        code: 1,
        stdout: "",
        stderr: "ClawHub CLI is not installed."
      };
    }

    throw new Error("ClawHub CLI is not installed.");
  }

  return runCommand(command, args, options);
}

async function resolveNodeCommand(): Promise<string | undefined> {
  const nodeCommand = await resolveCommand("node", [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    resolve(process.env.HOME ?? "", ".nvm/current/bin/node")
  ]);

  if (nodeCommand && (await probeCommand(nodeCommand))) {
    return nodeCommand;
  }

  return undefined;
}

async function probeInvocation(invocation: CommandInvocation, args: string[] = ["--version"]): Promise<boolean> {
  try {
    const result = await runCommand(invocation.command, [...invocation.argsPrefix, ...args], { allowFailure: true });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function resolveNpmInvocation(): Promise<CommandInvocation | undefined> {
  const npmCommand = await resolveCommand("npm", [
    "/opt/homebrew/bin/npm",
    "/usr/local/bin/npm",
    "/usr/bin/npm",
    resolve(process.env.HOME ?? "", ".nvm/current/bin/npm")
  ]);

  if (npmCommand) {
    const npmInvocation: CommandInvocation = {
      command: npmCommand,
      argsPrefix: [],
      display: npmCommand
    };

    if (await probeInvocation(npmInvocation)) {
      return npmInvocation;
    }
  }

  const nodeCommand = await resolveNodeCommand();

  if (!nodeCommand) {
    return undefined;
  }

  const npmCliCandidates = [
    process.env.npm_execpath,
    "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js"
  ].filter((value): value is string => Boolean(value));

  for (const candidate of npmCliCandidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    const cliInvocation: CommandInvocation = {
      command: nodeCommand,
      argsPrefix: [candidate],
      display: `${nodeCommand} ${candidate}`
    };

    if (await probeInvocation(cliInvocation)) {
      return cliInvocation;
    }
  }

  return undefined;
}

async function readInvocationStdout(invocation: CommandInvocation, args: string[]): Promise<string | undefined> {
  try {
    const result = await runCommand(invocation.command, [...invocation.argsPrefix, ...args], { allowFailure: true });
    const output = result.stdout.trim();
    return result.code === 0 && output ? output : undefined;
  } catch {
    return undefined;
  }
}

async function resolveExpectedNpmGlobalOpenClawCommand(
  npmInvocation: CommandInvocation | undefined
): Promise<string | undefined> {
  if (!npmInvocation) {
    return undefined;
  }

  const [prefix, root] = await Promise.all([
    readInvocationStdout(npmInvocation, ["prefix", "--global"]),
    readInvocationStdout(npmInvocation, ["root", "--global"])
  ]);

  if (!prefix || !root) {
    return undefined;
  }

  const packageRoot = resolve(root, "openclaw");
  const commandPath = resolve(prefix, "bin", "openclaw");

  if (!(await fileExists(packageRoot)) || !(await fileExists(commandPath))) {
    return undefined;
  }

  return commandPath;
}

async function resolveGitCommand(): Promise<string | undefined> {
  const gitCommand = await resolveCommand("git", ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"]);

  if (gitCommand && (await probeCommand(gitCommand))) {
    return gitCommand;
  }

  return undefined;
}

async function resolveBrewCommand(): Promise<string | undefined> {
  const brewCommand = await resolveCommand("brew", ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]);

  if (brewCommand && (await probeCommand(brewCommand, ["--version"]))) {
    return brewCommand;
  }

  return undefined;
}

async function readInstalledOpenClawVersion(): Promise<string | undefined> {
  return readEngineSnapshot().then((snapshot) => snapshot.cliVersion);
}

async function readVersionFromCommand(command: string | undefined, options?: { fresh?: boolean }): Promise<string | undefined> {
  if (!command) {
    return undefined;
  }

  return readThroughCache(
    `command:version:${command}`,
    READ_CACHE_TTL_MS.engine,
    async () => {
      const result = await runCommand(command, ["--version"], { allowFailure: true }).catch(() => ({
        code: 1,
        stdout: "",
        stderr: ""
      }));

      if (result.code !== 0 || !result.stdout) {
        return undefined;
      }

      return result.stdout;
    },
    options
  );
}

async function readManagedOpenClawVersion(options?: { fresh?: boolean }): Promise<string | undefined> {
  return readVersionFromCommand(await resolveManagedOpenClawCommand(options), options);
}

async function readSystemOpenClawVersion(options?: { fresh?: boolean }): Promise<string | undefined> {
  return readVersionFromCommand(await resolveSystemOpenClawCommand(options), options);
}

function compareOpenClawVersions(left: string | undefined, right: string | undefined): number | undefined {
  if (!left || !right) {
    return undefined;
  }

  const leftParts = left
    .replace(/^v/i, "")
    .split(/[^\d]+/u)
    .filter(Boolean)
    .map((part) => Number(part));
  const rightParts = right
    .replace(/^v/i, "")
    .split(/[^\d]+/u)
    .filter(Boolean)
    .map((part) => Number(part));

  if (leftParts.length === 0 || rightParts.length === 0) {
    return undefined;
  }

  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function isOpenClawVersionCompatible(version: string | undefined): boolean {
  if (!version) {
    return false;
  }

  if (!OPENCLAW_VERSION_OVERRIDE) {
    return true;
  }

  const comparison = compareOpenClawVersions(version, OPENCLAW_VERSION_OVERRIDE);
  return comparison !== undefined && comparison >= 0;
}

function openClawInstallTargetSummary(): string {
  return OPENCLAW_VERSION_OVERRIDE ?? "the latest available version";
}

function openClawVersionSummary(version: string | undefined): string {
  if (!version) {
    return "OpenClaw version could not be determined.";
  }

  if (!OPENCLAW_VERSION_OVERRIDE) {
    return `OpenClaw ${version} is installed. ChillClaw uses the latest available version for new installs.`;
  }

  return isOpenClawVersionCompatible(version)
    ? `OpenClaw ${version} meets ChillClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
    : `OpenClaw ${version} is older than ChillClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`;
}

export function summarizeTargetUpdateStatus(
  parsed: OpenClawUpdateStatusJson | undefined,
  fallbackMessage: string
): OpenClawTargetUpdateStatus {
  const latestVersion =
    parsed?.availability?.latestVersion?.trim() ||
    parsed?.update?.registry?.latestVersion?.trim() ||
    undefined;

  if (parsed?.availability?.available) {
    return {
      updateAvailable: true,
      latestVersion,
      summary: `Version ${latestVersion ?? "unknown"} is available on ${parsed.channel?.label ?? "the current channel"}.`
    };
  }

  if (parsed?.update?.registry?.error) {
    return {
      updateAvailable: false,
      latestVersion,
      summary: latestVersion
        ? `ChillClaw could not fully confirm update availability, but the latest registry version appears to be ${latestVersion}.`
        : `ChillClaw could not check for updates: ${parsed.update.registry.error}.`
    };
  }

  if (latestVersion) {
    return {
      updateAvailable: false,
      latestVersion,
      summary: "No newer version detected."
    };
  }

  return {
    updateAvailable: false,
    summary: fallbackMessage
  };
}

async function readUpdateStatusFromCommand(
  command: string | undefined,
  options?: { fresh?: boolean }
): Promise<OpenClawTargetUpdateStatus | undefined> {
  if (!command) {
    return undefined;
  }

  return readThroughCache(
    `command:update:${command}`,
    READ_CACHE_TTL_MS.engine,
    async () => {
      for (const attempt of [0, 1]) {
        const result = await runCommand(command, ["update", "status", "--json"], { allowFailure: true }).catch(() => ({
          code: 1,
          stdout: "",
          stderr: ""
        }));

        const parsed =
          safeJsonPayloadParse<OpenClawUpdateStatusJson>(result.stdout) ??
          safeJsonPayloadParse<OpenClawUpdateStatusJson>(result.stderr);
        const hasTransientRegistryAbort =
          Boolean(parsed?.update?.registry?.error?.includes("AbortError")) &&
          !parsed?.update?.registry?.latestVersion &&
          !parsed?.availability?.latestVersion;

        if (hasTransientRegistryAbort && attempt === 0) {
          await wait(200);
          continue;
        }

        return summarizeTargetUpdateStatus(parsed, result.stderr || result.stdout || "ChillClaw could not check for updates.");
      }

      return {
        updateAvailable: false,
        summary: "ChillClaw could not check for updates."
      };
    },
    options
  );
}

function safeJsonParse<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function extractBalancedJsonPayload(value: string, startIndex: number): string | undefined {
  const opening = value[startIndex];
  if (opening !== "{" && opening !== "[") {
    return undefined;
  }

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

function bundledManagedSkillMarkdown(slug: string): string | undefined {
  if (slug === "research-brief") {
    return `---
name: "Research Brief"
slug: research-brief
version: "1.0.0"
description: "Create concise research summaries with findings, risks, and next steps."
---

## When to Use

Use this skill when the user needs a grounded research summary that separates facts, risks, and recommended follow-up work.

## Instructions

Start by restating the question in one sentence. Gather the strongest available evidence, call out uncertainty directly, and separate confirmed findings from inference. End with a short list of risks, open questions, and concrete next steps.
`;
  }

  if (slug === "status-writer") {
    return `---
name: "Status Writer"
slug: status-writer
version: "1.0.0"
description: "Turn progress into crisp status updates with blockers and recommended follow-ups."
---

## When to Use

Use this skill when the user needs a progress update, standup note, or delivery status summary.

## Instructions

Write in plain language. Start with what changed, then list what is complete, what is blocked, and what should happen next. Keep the update short, concrete, and action-oriented.
`;
  }

  return undefined;
}

async function readBundledManagedSkillMarkdown(slug: string, assetPath?: string): Promise<string | undefined> {
  const candidates = new Set<string>();
  const appRoot = getAppRootDir();

  if (assetPath?.trim()) {
    const normalized = assetPath.trim();
    candidates.add(normalized);
    candidates.add(resolve(process.cwd(), normalized));
    if (appRoot) {
      candidates.add(resolve(appRoot, normalized));
      candidates.add(resolve(appRoot, "app", normalized));
      if (normalized.startsWith("apps/daemon/")) {
        candidates.add(resolve(appRoot, "app", normalized.replace(/^apps\/daemon\//, "")));
      }
    }
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return readFile(candidate, "utf8");
    }
  }

  return bundledManagedSkillMarkdown(slug);
}

export function parseClawHubSearchOutput(output: string): SkillMarketplaceEntry[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("- Searching"))
    .flatMap((line): SkillMarketplaceEntry[] => {
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length < 2) {
        return [];
      }

      return [{
        slug: parts[0],
        name: parts[1],
        summary: "",
        latestVersion: undefined,
        updatedLabel: undefined,
        ownerHandle: undefined,
        downloads: undefined,
        stars: undefined,
        installed: false,
        curated: false
      }];
    });
}

export function parseClawHubExploreOutput(output: string): SkillMarketplaceEntry[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("- Fetching latest skills"))
    .flatMap((line): SkillMarketplaceEntry[] => {
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length < 4) {
        return [];
      }

      return [{
        slug: parts[0],
        name: parts[0],
        summary: parts.slice(3).join(" "),
        latestVersion: parts[1].replace(/^v/i, ""),
        updatedLabel: parts[2],
        ownerHandle: undefined,
        downloads: undefined,
        stars: undefined,
        installed: false,
        curated: true
      }];
    });
}

async function logSoftFailure(message: string, details?: unknown): Promise<void> {
  await writeErrorLog(message, details);
}

function compareVersionStrings(left: string, right: string): number {
  const leftParts = left.split(/[^0-9]+/).filter(Boolean).map(Number);
  const rightParts = right.split(/[^0-9]+/).filter(Boolean).map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;

    if (a > b) {
      return 1;
    }

    if (a < b) {
      return -1;
    }
  }

  return 0;
}

function buildModelsCommandArgs(args: string[], agentId?: string): string[] {
  return agentId ? ["models", "--agent", agentId, ...args] : ["models", ...args];
}

async function openExternalUrl(url: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  await runCommand("/usr/bin/open", [url], { allowFailure: true }).catch(() => undefined);
}

function trimLogLines(lines: string[]): string[] {
  return lines.slice(-80);
}

function commandFailureText(result: CommandResult): string {
  return [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
}

function stripIgnorableOpenClawWarningLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.toLowerCase().includes("plugins.allow is empty"))
    .join("\n")
    .trim();
}

function hasOnlyIgnorableOpenClawWarnings(result: CommandResult): boolean {
  const failureText = commandFailureText(result);
  if (!failureText) {
    return false;
  }

  return stripIgnorableOpenClawWarningLines(failureText).length === 0;
}

function classifyCommandDriftFailure(result: CommandResult, patterns: string[] = []): CommandFallbackDecision {
  const text = commandFailureText(result).toLowerCase();

  if (!text) {
    return "not-applicable";
  }

  if (patterns.some((pattern) => text.includes(pattern.toLowerCase()))) {
    return "retry-with-config";
  }

  if (
    text.includes("unknown option") ||
    text.includes("unknown argument") ||
    text.includes("unsupported option") ||
    text.includes("unsupported flag") ||
    text.includes("did you mean")
  ) {
    return "retry-with-config";
  }

  return "not-applicable";
}

function spawnInteractiveCommand(command: string, args: string[], envOverrides?: Record<string, string | undefined>) {
  const relayScript = String.raw`
import os
import pty
import select
import subprocess
import sys

cmd = sys.argv[1:]
master_fd, slave_fd = pty.openpty()
child = subprocess.Popen(cmd, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd, close_fds=True)
os.close(slave_fd)

stdin_fd = sys.stdin.fileno()
stdout_fd = sys.stdout.fileno()

try:
    while True:
        read_fds = [master_fd, stdin_fd]
        ready, _, _ = select.select(read_fds, [], [], 0.1)
        if master_fd in ready:
            try:
                data = os.read(master_fd, 4096)
            except OSError:
                data = b""
            if data:
                os.write(stdout_fd, data)
            elif child.poll() is not None:
                break
        if stdin_fd in ready:
            try:
                data = os.read(stdin_fd, 4096)
            except OSError:
                data = b""
            if data:
                os.write(master_fd, data)
        if child.poll() is not None and not ready:
            break
finally:
    try:
        os.close(master_fd)
    except OSError:
        pass

sys.exit(child.wait())
`;

  return spawn("python3", ["-c", relayScript, command, ...args], {
    env: buildCommandEnv(command, envOverrides)
  });
}

function appendAuthSessionOutput(session: RuntimeModelAuthSession, chunk: string): void {
  session.outputBuffer += chunk;

  const normalized = chunk.replace(/\r/g, "\n");
  const parts = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (parts.length) {
    session.logs = trimLogLines([...session.logs, ...parts]);
  }

  if (!session.launchUrl) {
    const match = session.outputBuffer.match(/https?:\/\/[^\s"'<>]+/i);
    if (match && !/127\.0\.0\.1|localhost/.test(match[0])) {
      session.launchUrl = match[0];
    }
  }

  if (session.launchUrl && !session.browserOpened) {
    session.browserOpened = true;
    void openExternalUrl(session.launchUrl);
  }

  if (
    /paste.+redirect url|paste.+url\/code|paste.+full redirect url|enter.+one-time code|enter.+code|paste.+callback/i.test(session.outputBuffer)
  ) {
    session.status = "awaiting-input";
    session.inputPrompt = "Paste the redirect URL or code from the provider sign-in page.";
    session.message = "Finish sign-in in the browser, then paste the redirect URL or code here to continue.";
  } else if (session.status !== "completed" && session.status !== "failed") {
    session.status = "running";
    session.inputPrompt = undefined;
    session.message = session.launchUrl
      ? "ChillClaw opened the provider sign-in page in your browser. Finish sign-in there."
      : "ChillClaw is starting the OpenClaw authentication flow.";
  }
}

function summarizeGateway(gatewayStatus?: OpenClawGatewayStatusJson): string | undefined {
  if (!gatewayStatus) {
    return undefined;
  }

  if (gatewayStatus.rpc?.ok) {
    return "Gateway is reachable.";
  }

  if (gatewayStatus.service?.installed && gatewayStatus.service.loaded === false) {
    return "Gateway service is installed but not loaded.";
  }

  if (gatewayStatus.rpc?.error) {
    return gatewayStatus.rpc.error;
  }

  return undefined;
}

function isGatewayReachable(snapshot: EngineReadSnapshot): boolean {
  return Boolean(snapshot.gatewayJson?.rpc?.ok || snapshot.statusJson?.gateway?.reachable);
}

function gatewayReachabilitySummary(snapshot: EngineReadSnapshot): string {
  return (
    summarizeGateway(snapshot.gatewayJson) ??
    snapshot.statusJson?.gateway?.error ??
    "ChillClaw could not determine gateway reachability."
  );
}

async function readAdapterState(): Promise<OpenClawAdapterState> {
  try {
    const raw = await readFile(OPENCLAW_STATE_PATH, "utf8");
    return JSON.parse(raw) as OpenClawAdapterState;
  } catch {
    return {};
  }
}

async function writeAdapterState(nextState: OpenClawAdapterState): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(OPENCLAW_STATE_PATH, JSON.stringify(nextState, null, 2));
}

async function readModelCatalog(all = false, options?: { fresh?: boolean }): Promise<ModelCatalogEntry[]> {
  const cacheKey = all ? "models:list:all" : "models:list:configured";

  return readThroughCache(
    cacheKey,
    READ_CACHE_TTL_MS.models,
    async () => {
      const args = ["models", "list", "--json"];
      if (all) {
        args.splice(2, 0, "--all");
      }

      const result = await runOpenClaw(args, { allowFailure: true });
      const payload =
        safeJsonPayloadParse<OpenClawModelListJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawModelListJson>(result.stderr);
      return payload?.models ?? [];
    },
    options
  );
}

async function readModelStatus(options?: { fresh?: boolean }): Promise<OpenClawModelStatusJson | undefined> {
  return readThroughCache(
    "models:status",
    READ_CACHE_TTL_MS.models,
    async () => {
      const result = await runOpenClaw(["models", "status", "--json"], { allowFailure: true });
      return (
        safeJsonPayloadParse<OpenClawModelStatusJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawModelStatusJson>(result.stderr)
      );
    },
    options
  );
}

async function readConfiguredAuthProviders(status?: OpenClawModelStatusJson): Promise<Set<string>> {
  const payload = status ?? (await readModelStatus());
  const configured = new Set<string>();

  for (const provider of payload?.auth?.providers ?? []) {
    const providerName = provider.provider?.trim().toLowerCase();
    const profileCount =
      (provider.profiles?.count ?? 0) +
      (provider.profiles?.oauth ?? 0) +
      (provider.profiles?.token ?? 0) +
      (provider.profiles?.apiKey ?? 0);

    if (providerName && profileCount > 0) {
      configured.add(providerName);
    }
  }

  for (const provider of payload?.auth?.oauth?.providers ?? []) {
    const providerName = provider.provider?.trim().toLowerCase();
    if (providerName && provider.status === "ok") {
      configured.add(providerName);
    }
  }

  return configured;
}

async function readOpenClawConfigFile(configPath?: string): Promise<OpenClawConfigFileJson | undefined> {
  if (!configPath) {
    return undefined;
  }

  const normalizedPath =
    configPath.startsWith("~/") && process.env.HOME ? resolve(process.env.HOME, configPath.slice(2)) : configPath;

  try {
    const raw = await readFile(normalizedPath, "utf8");
    return JSON.parse(raw) as OpenClawConfigFileJson;
  } catch {
    return undefined;
  }
}

function deriveConfiguredModels(
  allModels: ModelCatalogEntry[],
  supplemental: ReturnType<typeof collectSupplementalModelRefs>
): ModelCatalogEntry[] {
  const configuredRefs = new Set<string>(supplemental.refs);

  if (supplemental.defaultModel) {
    configuredRefs.add(supplemental.defaultModel);
  }

  for (const model of allModels) {
    const tags = model.tags ?? [];
    if (tags.includes("configured") || tags.includes("default") || tags.some((tag) => tag.startsWith("fallback#"))) {
      configuredRefs.add(model.key);
    }
  }

  return mergeModelCatalogEntries(allModels, configuredRefs, {
    available: true,
    defaultModel: supplemental.defaultModel
  });
}

async function readEngineSnapshot(options?: { fresh?: boolean; includeUpdate?: boolean }): Promise<EngineReadSnapshot> {
  return readThroughCache(
    `engine:snapshot:${options?.includeUpdate ? "with-update" : "base"}`,
    READ_CACHE_TTL_MS.engine,
    async () => {
      const command = await resolveOpenClawCommand({ fresh: options?.fresh });

      if (!command) {
        return {
          installed: false
        };
      }

      const [cliVersion, statusResult, gatewayResult, updateResult] = await Promise.all([
        readVersionFromCommand(command, options),
        runCommand(command, ["status", "--json"], { allowFailure: true }).catch(() => ({ code: 1, stdout: "", stderr: "" })),
        runCommand(command, ["gateway", "status", "--json"], { allowFailure: true }).catch(() => ({
          code: 1,
          stdout: "",
          stderr: ""
        })),
        options?.includeUpdate
          ? runCommand(command, ["update", "status", "--json"], { allowFailure: true }).catch(() => ({
              code: 1,
              stdout: "",
              stderr: ""
            }))
          : Promise.resolve(undefined)
      ]);

      return {
        installed: true,
        command,
        cliVersion,
        statusJson:
          safeJsonPayloadParse<OpenClawStatusJson>(statusResult.stdout) ??
          safeJsonPayloadParse<OpenClawStatusJson>(statusResult.stderr),
        gatewayJson:
          safeJsonPayloadParse<OpenClawGatewayStatusJson>(gatewayResult.stdout) ??
          safeJsonPayloadParse<OpenClawGatewayStatusJson>(gatewayResult.stderr),
        updateJson: updateResult
          ? safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateResult.stdout) ??
            safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateResult.stderr)
          : undefined
      };
    },
    options
  );
}

async function readModelSnapshot(options?: { fresh?: boolean }): Promise<ModelReadSnapshot> {
  return readThroughCache(
    "models:snapshot",
    READ_CACHE_TTL_MS.models,
    async () => {
      const [allModels, configuredModelCatalog, status] = await Promise.all([
        readModelCatalog(true, options),
        readModelCatalog(false, options),
        readModelStatus(options)
      ]);
      const activeConfig = await readOpenClawConfigFile(status?.configPath);
      const configuredAuthProviders = await readConfiguredAuthProviders(status);
      const rawSupplemental = collectSupplementalModelRefs(status, activeConfig);
      const supplemental = {
        refs: new Set(
          [...rawSupplemental.refs].map((ref) => resolveCatalogModelKey(allModels, ref) ?? ref)
        ),
        defaultModel: resolveCatalogModelKey(allModels, rawSupplemental.defaultModel) ?? rawSupplemental.defaultModel
      };

      return {
        allModels,
        configuredModels: deriveConfiguredModels(configuredModelCatalog, supplemental),
        status,
        activeConfig,
        configuredAuthProviders,
        supplemental
      };
    },
    options
  );
}

async function readChannelSnapshot(options?: { fresh?: boolean }): Promise<ChannelReadSnapshot> {
  return readThroughCache(
    "channels:snapshot",
    READ_CACHE_TTL_MS.channels,
    async () => {
      const [list, status] = await Promise.all([
        readChannelsList(options),
        readChannelsStatus(options)
      ]);

      return { list, status };
    },
    options
  );
}

async function readSkillSnapshot(options?: { fresh?: boolean }): Promise<SkillReadSnapshot> {
  return readThroughCache(
    "skills:snapshot",
    READ_CACHE_TTL_MS.skills,
    async () => {
      const [list, warnings] = await Promise.all([
        readOpenClawSkillsList(options),
        readOpenClawSkillCheckWarnings(options)
      ]);

      return {
        list,
        warnings
      };
    },
    options
  );
}

async function readAgentListSnapshot(options?: { fresh?: boolean }): Promise<OpenClawAgentListEntry[]> {
  return readThroughCache(
    "agents:list",
    READ_CACHE_TTL_MS.agents,
    async () => {
      const result = await runOpenClaw(["agents", "list", "--json", "--bindings"], { allowFailure: true });
      return safeJsonPayloadParse<OpenClawAgentListEntry[]>(result.stdout) ?? safeJsonPayloadParse<OpenClawAgentListEntry[]>(result.stderr) ?? [];
    },
    options
  );
}

async function writeOpenClawConfigFile(configPath: string, config: OpenClawConfigFileJson): Promise<void> {
  const normalizedPath = configPath.startsWith("~/") && process.env.HOME ? resolve(process.env.HOME, configPath.slice(2)) : configPath;
  await mkdir(dirname(normalizedPath), { recursive: true });
  await writeFile(normalizedPath, JSON.stringify(config, null, 2));
}

function generateChillClawGatewayToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizeOpenClawGatewayConfigForChillClaw(config: OpenClawConfigFileJson): {
  changed: boolean;
  config: OpenClawConfigFileJson;
} {
  const currentGateway = config.gateway ?? {};
  const currentAuth = currentGateway.auth ?? {};
  const trimmedToken = currentAuth.token?.trim();
  const nextAuth: NonNullable<OpenClawConfigFileJson["gateway"]>["auth"] = {
    ...currentAuth,
    mode: CHILLCLAW_OPENCLAW_GATEWAY_AUTH_MODE,
    token: trimmedToken || generateChillClawGatewayToken()
  };

  if ("password" in nextAuth) {
    delete nextAuth.password;
  }

  const nextGateway: NonNullable<OpenClawConfigFileJson["gateway"]> = {
    ...currentGateway,
    mode: CHILLCLAW_OPENCLAW_GATEWAY_MODE,
    bind: CHILLCLAW_OPENCLAW_GATEWAY_BIND,
    auth: nextAuth
  };

  if ("remote" in nextGateway) {
    delete nextGateway.remote;
  }

  const changed =
    currentGateway.mode !== CHILLCLAW_OPENCLAW_GATEWAY_MODE ||
    currentGateway.bind !== CHILLCLAW_OPENCLAW_GATEWAY_BIND ||
    currentAuth.mode !== CHILLCLAW_OPENCLAW_GATEWAY_AUTH_MODE ||
    currentAuth.token !== nextAuth.token ||
    Boolean(currentAuth.password) ||
    currentGateway.remote !== undefined;

  return {
    changed,
    config: {
      ...config,
      gateway: nextGateway
    }
  };
}

function defaultOpenClawConfigPath(): string {
  return resolve(process.env.HOME ?? "", ".openclaw", "openclaw.json");
}

function getMainOpenClawAgentDir(): string {
  return resolve(process.env.HOME ?? "", ".openclaw", "agents", OPENCLAW_MAIN_AGENT_ID, "agent");
}

function getManagedMemberAgentPaths(memberId: string): { rootDir: string; agentDir: string; workspaceDir: string } {
  const rootDir = resolve(getDataDir(), "ai-members", memberId);

  return {
    rootDir,
    agentDir: resolve(rootDir, "agent"),
    workspaceDir: resolve(rootDir, "workspace")
  };
}

function getAuthStorePath(agentDir: string): string {
  return resolve(agentDir, "auth-profiles.json");
}

async function readAuthStore(agentDir: string): Promise<OpenClawAuthProfileStoreJson> {
  try {
    const raw = await readFile(getAuthStorePath(agentDir), "utf8");
    return JSON.parse(raw) as OpenClawAuthProfileStoreJson;
  } catch {
    return {
      version: 1,
      profiles: {},
      usageStats: {},
      order: {},
      lastGood: {}
    };
  }
}

async function writeAuthStore(agentDir: string, store: OpenClawAuthProfileStoreJson): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  await writeFile(getAuthStorePath(agentDir), JSON.stringify(store, null, 2));
}

function normalizeModelLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveLegacyCatalogModelReplacement(
  models: ModelCatalogEntry[],
  provider: InternalModelProviderConfig | undefined,
  normalizedName: string
): string | undefined {
  if (provider?.id === "minimax" && normalizedName === normalizeModelLookupKey("MiniMax-M2.5")) {
    const replacement = models.find((model) => model.key.toLowerCase() === "minimax/minimax-m2.7".toLowerCase());
    return replacement?.key;
  }

  return undefined;
}

function matchesProviderModelRef(modelKey: string, provider?: InternalModelProviderConfig): boolean {
  if (!provider) {
    return true;
  }

  return provider.providerRefs.some((prefix) => modelKey.startsWith(prefix));
}

export function resolveCatalogModelKey(
  models: ModelCatalogEntry[],
  raw: string | null | undefined,
  options?: { providerId?: string }
): string | undefined {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return undefined;
  }

  const direct = models.find((model) => model.key === trimmed);
  if (direct) {
    return direct.key;
  }

  const lower = trimmed.toLowerCase();
  const caseInsensitive = models.find((model) => model.key.toLowerCase() === lower);
  if (caseInsensitive) {
    return caseInsensitive.key;
  }

  const provider =
    (options?.providerId ? providerDefinitionById(options.providerId) : undefined) ??
    providerDefinitionByModelKey(trimmed);
  const providerScopedModels = models.filter((model) => matchesProviderModelRef(model.key, provider));
  const rawName = trimmed.includes("/") ? trimmed.slice(trimmed.indexOf("/") + 1) : trimmed;
  const normalizedName = normalizeModelLookupKey(rawName);
  const legacyReplacement = resolveLegacyCatalogModelReplacement(models, provider, normalizedName);

  if (legacyReplacement) {
    return legacyReplacement;
  }

  const fuzzyMatches = providerScopedModels.filter((model) => {
    const modelName = model.key.includes("/") ? model.key.slice(model.key.indexOf("/") + 1) : model.key;
    return (
      normalizeModelLookupKey(modelName) === normalizedName ||
      normalizeModelLookupKey(model.name) === normalizedName
    );
  });

  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0]?.key;
  }

  return undefined;
}

function authModeLabelForMethodKind(kind: ModelAuthMethod["kind"] | undefined): string | undefined {
  if (kind === "api-key") {
    return "API key";
  }

  if (kind === "oauth") {
    return "OAuth";
  }

  if (kind === "setup-token") {
    return "Token";
  }

  if (kind === "local") {
    return "Local";
  }

  if (kind === "custom") {
    return "Custom";
  }

  return undefined;
}

function runtimeEntryIdForModelKey(modelKey: string): string {
  return `runtime:${modelKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function isRuntimeDerivedModelEntryId(entryId: string): boolean {
  return entryId.startsWith("runtime:");
}

function runtimeEntryLabel(model: ModelCatalogEntry): string {
  const provider = providerDefinitionByModelKey(model.key);
  return provider ? `${provider.label} ${model.name}` : model.name;
}

function runtimeEntryAuthLabel(model: ModelCatalogEntry, provider: InternalModelProviderConfig | undefined): string | undefined {
  if (model.local) {
    return "Local";
  }

  return authModeLabelForMethodKind(provider?.authMethods[0]?.kind);
}

function fallbackOrderForModel(model: ModelCatalogEntry): number {
  const tag = model.tags.find((item) => item.startsWith("fallback#"));
  if (!tag) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = Number(tag.slice("fallback#".length));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function orderedRuntimeModels(configuredModels: ModelCatalogEntry[], defaultModel?: string): ModelCatalogEntry[] {
  const byKey = new Map(configuredModels.map((model) => [model.key, model]));
  const ordered: ModelCatalogEntry[] = [];

  if (defaultModel && byKey.has(defaultModel)) {
    ordered.push(byKey.get(defaultModel)!);
    byKey.delete(defaultModel);
  }

  const remaining = [...byKey.values()].sort((left, right) => {
    const fallbackDelta = fallbackOrderForModel(left) - fallbackOrderForModel(right);
    if (fallbackDelta !== 0) {
      return fallbackDelta;
    }

    const leftConfigured = left.tags.includes("configured") ? 0 : 1;
    const rightConfigured = right.tags.includes("configured") ? 0 : 1;
    if (leftConfigured !== rightConfigured) {
      return leftConfigured - rightConfigured;
    }

    return left.key.localeCompare(right.key);
  });

  return [...ordered, ...remaining];
}

function configuredModelChain(
  config: OpenClawConfigFileJson,
  status?: Pick<OpenClawModelStatusJson, "aliases">
): { primary?: string; fallbacks: string[] } {
  const raw = config.agents?.defaults?.model;
  const aliases = status?.aliases ?? {};

  if (typeof raw === "string") {
    return {
      primary: resolveModelRef(raw, undefined, aliases) ?? raw,
      fallbacks: []
    };
  }

  if (!raw || typeof raw !== "object") {
    return { primary: undefined, fallbacks: [] };
  }

  return {
    primary: resolveModelRef(raw.primary, undefined, aliases) ?? raw.primary,
    fallbacks: (raw.fallbacks ?? [])
      .map((value) => resolveModelRef(value, undefined, aliases) ?? value)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  };
}

export function removeRuntimeDerivedModelFromConfig(
  config: OpenClawConfigFileJson,
  status: Pick<OpenClawModelStatusJson, "aliases"> | undefined,
  modelKey: string
): {
  changed: boolean;
  remainingModelKeys: string[];
  removedDefault: boolean;
} {
  const aliases = status?.aliases ?? {};
  const defaults = config.agents?.defaults;
  const existingModels = defaults?.models ?? {};
  const nextModels = Object.fromEntries(
    Object.entries(existingModels).filter(([key]) => (resolveModelRef(key, undefined, aliases) ?? key) !== modelKey)
  );
  const existingChain = configuredModelChain(config, status);
  const removedDefault = existingChain.primary === modelKey;
  const nextPrimary =
    existingChain.primary === modelKey ? existingChain.fallbacks[0] : existingChain.primary;
  const nextFallbacks = existingChain.fallbacks.filter((item, index) => item !== modelKey && !(removedDefault && index === 0));
  const changed =
    Object.keys(nextModels).length !== Object.keys(existingModels).length ||
    removedDefault ||
    existingChain.fallbacks.some((item) => item === modelKey);

  if (!changed) {
    return {
      changed: false,
      remainingModelKeys: Object.keys(existingModels),
      removedDefault: false
    };
  }

  config.agents = config.agents ?? {};
  const nextDefaults: NonNullable<NonNullable<OpenClawConfigFileJson["agents"]>["defaults"]> = {
    ...(defaults ?? {}),
    models: nextModels
  };

  if (nextPrimary) {
    nextDefaults.model = {
      primary: nextPrimary,
      fallbacks: nextFallbacks
    };
  } else {
    delete nextDefaults.model;
  }

  if (Object.keys(nextModels).length === 0) {
    delete nextDefaults.models;
  }

  if (Object.keys(nextDefaults).length === 0) {
    if (config.agents) {
      delete config.agents.defaults;
    }
  } else {
    config.agents.defaults = nextDefaults;
  }

  return {
    changed: true,
    remainingModelKeys: Object.keys(nextModels),
    removedDefault
  };
}

function buildRuntimeDerivedEntry(model: ModelCatalogEntry, now: string): SavedModelEntryState {
  const provider = providerDefinitionByModelKey(model.key);
  return {
    id: runtimeEntryIdForModelKey(model.key),
    label: runtimeEntryLabel(model),
    providerId: provider?.id ?? modelRefProvider(model.key) ?? "custom",
    modelKey: model.key,
    agentId: "",
    agentDir: "",
    workspaceDir: "",
    authMethodId: provider?.authMethods[0]?.id,
    authModeLabel: runtimeEntryAuthLabel(model, provider),
    profileLabel: undefined,
    profileIds: [],
    isDefault: false,
    isFallback: false,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeImplicitMainSavedEntry(
  entry: SavedModelEntryState,
  configuredModels: ModelCatalogEntry[],
  now: string
): SavedModelEntryState {
  if (!isImplicitMainAgentId(entry.agentId)) {
    return entry;
  }

  const resolvedModelKey =
    resolveCatalogModelKey(configuredModels, entry.modelKey, { providerId: entry.providerId }) ?? entry.modelKey;

  return {
    ...entry,
    id: runtimeEntryIdForModelKey(resolvedModelKey),
    modelKey: resolvedModelKey,
    agentId: "",
    agentDir: "",
    workspaceDir: "",
    profileIds: [],
    updatedAt: now
  };
}

export function reconcileSavedEntriesWithRuntime(
  entries: SavedModelEntryState[],
  configuredModels: ModelCatalogEntry[],
  defaultModel?: string
): {
  entries: SavedModelEntryState[];
  defaultEntryId?: string;
  fallbackEntryIds: string[];
} {
  const now = new Date().toISOString();
  const resolvedDefaultModel = resolveCatalogModelKey(configuredModels, defaultModel) ?? defaultModel;
  const orderedConfiguredModels = orderedRuntimeModels(configuredModels, resolvedDefaultModel);
  const entriesByModelKey = new Map<string, SavedModelEntryState[]>();
  const usedEntryIds = new Set<string>();

  for (const rawEntry of entries) {
    const entry = normalizeImplicitMainSavedEntry(rawEntry, configuredModels, now);
    const resolvedModelKey =
      resolveCatalogModelKey(configuredModels, entry.modelKey, { providerId: entry.providerId }) ?? entry.modelKey;
    const existing = entriesByModelKey.get(resolvedModelKey) ?? [];
    existing.push(
      resolvedModelKey === entry.modelKey
        ? entry
        : {
            ...entry,
            modelKey: resolvedModelKey,
            updatedAt: now
          }
    );
    entriesByModelKey.set(resolvedModelKey, existing);
  }

  const activeEntries: SavedModelEntryState[] = orderedConfiguredModels.map((model, index) => {
    const candidates = entriesByModelKey.get(model.key) ?? [];
    const preferred = candidates.find((entry) => {
      if (usedEntryIds.has(entry.id)) {
        return false;
      }

      if (index === 0) {
        return entry.isDefault;
      }

      return entry.isFallback;
    });
    const unusedCandidate = candidates.find((entry) => !usedEntryIds.has(entry.id));
    const nextEntry = preferred ?? unusedCandidate ?? buildRuntimeDerivedEntry(model, now);
    usedEntryIds.add(nextEntry.id);
    return nextEntry;
  });

  const defaultEntryId = activeEntries[0]?.id;
  const fallbackEntryIds = activeEntries.slice(1).map((entry) => entry.id);

  return {
    entries: activeEntries.map((entry) => ({
      ...entry,
      isDefault: entry.id === defaultEntryId,
      isFallback: fallbackEntryIds.includes(entry.id)
    })),
    defaultEntryId,
    fallbackEntryIds
  };
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

function preferredConfiguredPrimaryAgentId(config: OpenClawConfigFileJson): string | undefined {
  return (config.agents?.list ?? []).find((entry) => entry.default === true && isVisibleAIMemberAgentId(entry.id))?.id;
}

function toSavedModelEntry(entry: SavedModelEntryState): SavedModelEntry {
  return {
    id: entry.id,
    label: entry.label,
    providerId: entry.providerId,
    modelKey: entry.modelKey,
    agentId: entry.agentId,
    authMethodId: entry.authMethodId,
    authModeLabel: entry.authModeLabel,
    profileLabel: entry.profileLabel,
    isDefault: entry.isDefault,
    isFallback: entry.isFallback,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

function modelRefProvider(ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }

  const index = ref.indexOf("/");
  return index > 0 ? ref.slice(0, index) : undefined;
}

function resolveModelRef(
  raw: string | null | undefined,
  defaultProvider: string | undefined,
  aliases: Record<string, string>,
  seen = new Set<string>()
): string | undefined {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return undefined;
  }

  const aliasKey = trimmed.toLowerCase();

  if (seen.has(aliasKey)) {
    return undefined;
  }

  const aliasTarget = aliases[trimmed] ?? aliases[aliasKey];
  if (typeof aliasTarget === "string" && aliasTarget.trim()) {
    seen.add(aliasKey);
    return resolveModelRef(aliasTarget, defaultProvider, aliases, seen);
  }

  if (trimmed.includes("/")) {
    return trimmed;
  }

  return defaultProvider ? `${defaultProvider}/${trimmed}` : undefined;
}

function synthesizeModelCatalogEntry(key: string, options?: { available?: boolean; tags?: string[] }): ModelCatalogEntry {
  const slashIndex = key.indexOf("/");
  const name = slashIndex >= 0 ? key.slice(slashIndex + 1) : key;

  return {
    key,
    name,
    input: "text",
    contextWindow: 0,
    local: false,
    available: options?.available ?? false,
    tags: options?.tags ?? [],
    missing: false
  };
}

function mergeModelCatalogEntries(
  existing: ModelCatalogEntry[],
  refs: Iterable<string>,
  options?: { available?: boolean; defaultModel?: string }
): ModelCatalogEntry[] {
  const byKey = new Map(existing.map((entry) => [entry.key, { ...entry }]));
  const resolvedDefaultModel = resolveCatalogModelKey(existing, options?.defaultModel) ?? options?.defaultModel;

  for (const rawRef of refs) {
    const ref = resolveCatalogModelKey(existing, rawRef) ?? rawRef;
    const current = byKey.get(ref);
    const tags = new Set(current?.tags ?? []);

    if (resolvedDefaultModel === ref) {
      tags.add("default");
    }

    if (current) {
      byKey.set(ref, {
        ...current,
        available: current.available || Boolean(options?.available),
        tags: [...tags]
      });
      continue;
    }

    byKey.set(
      ref,
      synthesizeModelCatalogEntry(ref, {
        available: options?.available,
        tags: [...tags]
      })
    );
  }

  return [...byKey.values()];
}

function collectSupplementalModelRefs(status?: OpenClawModelStatusJson, config?: OpenClawConfigFileJson): {
  refs: Set<string>;
  defaultModel?: string;
} {
  const aliases = status?.aliases ?? {};
  const defaultModel =
    resolveModelRef(status?.resolvedDefault, undefined, aliases) ?? resolveModelRef(status?.defaultModel, undefined, aliases);
  const defaultProvider = modelRefProvider(defaultModel);
  const refs = new Set<string>();

  const add = (raw: string | null | undefined) => {
    const resolved = resolveModelRef(raw, defaultProvider, aliases);
    if (resolved) {
      refs.add(resolved);
    }
  };

  const addAll = (values: Array<string | null | undefined> | undefined) => {
    for (const value of values ?? []) {
      add(value);
    }
  };

  add(status?.defaultModel);
  add(status?.resolvedDefault);
  addAll(status?.fallbacks);
  add(status?.imageModel);
  addAll(status?.imageFallbacks);
  addAll(status?.allowed);

  for (const key of Object.keys(config?.agents?.defaults?.models ?? {})) {
    add(key);
  }

  return { refs, defaultModel };
}

async function readPluginInventory(): Promise<OpenClawPluginListJson | undefined> {
  return readThroughCache(
    "plugins:list",
    READ_CACHE_TTL_MS.channels,
    async () => {
      const result = await runOpenClaw(["plugins", "list", "--json"], { allowFailure: true });
      return (
        safeJsonPayloadParse<OpenClawPluginListJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawPluginListJson>(result.stderr)
      );
    }
  );
}

async function readChannelsList(options?: { fresh?: boolean }): Promise<OpenClawChannelsListJson | undefined> {
  return readThroughCache(
    "channels:list",
    READ_CACHE_TTL_MS.channels,
    async () => {
      const result = await runOpenClaw(["channels", "list", "--json"], { allowFailure: true });
      return (
        safeJsonPayloadParse<OpenClawChannelsListJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawChannelsListJson>(result.stderr)
      );
    },
    options
  );
}

async function readChannelsStatus(options?: { fresh?: boolean }): Promise<OpenClawChannelsStatusJson | undefined> {
  return readThroughCache(
    "channels:status",
    READ_CACHE_TTL_MS.channels,
    async () => {
      const result = await runOpenClaw(["channels", "status", "--json", "--probe"], { allowFailure: true });
      return (
        safeJsonPayloadParse<OpenClawChannelsStatusJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawChannelsStatusJson>(result.stderr)
      );
    },
    options
  );
}

async function readOpenClawSkillsList(options?: { fresh?: boolean }): Promise<OpenClawSkillsListJson | undefined> {
  return readThroughCache(
    "skills:list",
    READ_CACHE_TTL_MS.skills,
    async () => {
      const result = await runOpenClaw(["skills", "list", "--json"], { allowFailure: true });
      return (
        safeJsonPayloadParse<OpenClawSkillsListJson>(result.stdout) ??
        safeJsonPayloadParse<OpenClawSkillsListJson>(result.stderr)
      );
    },
    options
  );
}

async function readOpenClawSkillCheckWarnings(options?: { fresh?: boolean }): Promise<string[]> {
  return readThroughCache(
    "skills:check",
    READ_CACHE_TTL_MS.skills,
    async () => {
      const result = await runOpenClaw(["skills", "check"], { allowFailure: true });

      return (result.stdout || result.stderr)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);
    },
    options
  );
}

function deriveLiveChannelState(
  channelId: SupportedChannelId,
  list?: OpenClawChannelsListJson,
  status?: OpenClawChannelsStatusJson
): ChannelSetupState {
  const runtimeKeys = runtimeChannelKeys(channelId);
  const configuredAccounts = runtimeKeys.flatMap((key) => list?.chat?.[key] ?? []);
  const channel = runtimeKeys.map((key) => status?.channels?.[key]).find((entry) => entry !== undefined);
  const accounts = runtimeKeys.flatMap((key) => status?.channelAccounts?.[key] ?? []);
  const anyConfigured = configuredAccounts.length > 0 || Boolean(channel?.configured) || accounts.some((account) => account.configured);

  if (!anyConfigured) {
    return createChannelState(channelId, {});
  }

  if (channelId === "telegram") {
    const account = accounts[0];
    const username = account?.probe?.bot?.username ?? channel?.probe?.bot?.username;
    const healthy = account?.probe?.ok ?? channel?.probe?.ok ?? false;
    return createChannelState("telegram", {
      status: healthy ? "completed" : "ready",
      summary: username ? `Telegram bot @${username} is configured.` : "Telegram is configured in OpenClaw.",
      detail: healthy
        ? "OpenClaw can reach the Telegram bot successfully."
        : channel?.lastError
          ? `Telegram is configured, but OpenClaw reported: ${channel.lastError}`
          : "Telegram is configured. If messages are not flowing yet, send the bot a DM and approve pairing if prompted."
    });
  }

  if (channelId === "whatsapp") {
    const account = accounts[0];
    const linked = account?.linked ?? channel?.linked ?? false;
    const connected = account?.connected ?? channel?.connected ?? false;
    const number = account?.self?.e164 ?? channel?.self?.e164;
    return createChannelState("whatsapp", {
      status: connected ? "completed" : linked ? "ready" : "awaiting-pairing",
      summary: number ? `WhatsApp ${number} is linked.` : linked ? "WhatsApp is linked in OpenClaw." : "WhatsApp is configured and waiting for pairing.",
      detail: connected
        ? "WhatsApp is connected and running through OpenClaw."
        : channel?.lastError
          ? `WhatsApp is configured, but OpenClaw reported: ${channel.lastError}`
          : linked
            ? "WhatsApp is linked. If it is not fully connected yet, restart the gateway or refresh status."
            : "WhatsApp setup is in progress. Finish pairing to bring the account online."
    });
  }

  if (channelId === "wechat") {
    const account = accounts[0];
    const linked = account?.linked ?? channel?.linked ?? false;
    const connected = account?.connected ?? channel?.connected ?? false;
    const lastError = account?.lastError ?? channel?.lastError ?? undefined;
    const pairingRequired = /pairing required/i.test(lastError ?? "");

    return createChannelState("wechat", {
      status: connected ? "completed" : "awaiting-pairing",
      summary: connected
        ? "WeChat is configured in OpenClaw."
        : pairingRequired
          ? "WeChat is waiting for pairing approval."
          : linked
            ? "WeChat is linked but still finishing setup."
            : "WeChat login is staged and waiting for pairing.",
      detail: connected
        ? "ChillClaw detected an existing configuration from the installed OpenClaw runtime."
        : lastError
          ? `WeChat is configured, but OpenClaw reported: ${lastError}`
          : linked
            ? "WeChat login finished staging, but the runtime is not connected yet. Complete pairing before using chat."
            : "Complete the remaining WeChat pairing steps before using chat."
    });
  }

  return createChannelState(channelId, {
    status: "completed",
    summary: `${channelId === "feishu" ? "Feishu" : channelId === "wechat-work" ? "WeChat Work" : "WeChat"} is configured in OpenClaw.`,
    detail: "ChillClaw detected an existing configuration from the installed OpenClaw runtime."
  });
}

function buildLiveChannelEntries(
  list?: OpenClawChannelsListJson,
  status?: OpenClawChannelsStatusJson
): ConfiguredChannelEntry[] {
  const channelIds = new Set<SupportedChannelId>([
    ...Object.keys(list?.chat ?? {}),
    ...Object.keys(status?.channelAccounts ?? {})
  ].flatMap((channelId) => {
    const normalized = normalizeRuntimeChannelId(channelId);
    return normalized ? [normalized] : [];
  }));

  const entries: ConfiguredChannelEntry[] = [];

  for (const channelId of channelIds) {
    const runtimeKeys = runtimeChannelKeys(channelId);
    const accountIds = new Set<string>([
      ...runtimeKeys.flatMap((key) => list?.chat?.[key] ?? []),
      ...runtimeKeys.flatMap((key) =>
        ((status?.channelAccounts?.[key] ?? []).map((account) => account.accountId).filter(Boolean) as string[])
      )
    ]);
    const accounts = runtimeKeys.flatMap((key) => status?.channelAccounts?.[key] ?? []);
    const liveState = deriveLiveChannelState(channelId, list, status);

    for (const accountId of accountIds) {
      const account = accounts.find((item) => (item.accountId ?? "default") === accountId);
      const label =
        channelId === "telegram"
          ? account?.probe?.bot?.username
            ? `Telegram @${account.probe.bot.username}`
            : "Telegram"
          : channelId === "whatsapp"
            ? account?.self?.e164
              ? `WhatsApp ${account.self.e164}`
              : "WhatsApp"
            : channelId === "feishu"
              ? "Feishu"
              : channelId === "wechat-work"
                ? "WeChat Work"
                : "WeChat";

      const maskedConfigSummary =
        channelId === "telegram"
          ? [
              ...(account?.probe?.bot?.username ? [{ label: "Bot", value: `@${account.probe.bot.username}` }] : []),
              ...(account?.mode ? [{ label: "Mode", value: account.mode }] : []),
              ...(account?.tokenSource ? [{ label: "Token source", value: account.tokenSource }] : [])
            ]
          : channelId === "whatsapp"
            ? [
                ...(account?.self?.e164 ? [{ label: "Linked number", value: account.self.e164 }] : []),
                ...(account?.connected ? [{ label: "Connection", value: "Connected" }] : [{ label: "Connection", value: "Linked" }])
              ]
            : [];

      entries.push({
        id: `${channelId}:${accountId}`,
        channelId,
        label,
        status: liveState.status,
        summary: liveState.summary,
        detail: liveState.detail,
        maskedConfigSummary,
        editableValues: {},
        pairingRequired: liveState.status === "awaiting-pairing",
        lastUpdatedAt: liveState.lastUpdatedAt
      });
    }
  }

  return entries;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function inspectPlugin(pluginId: string): Promise<{
  entries: NonNullable<OpenClawPluginListJson["plugins"]>;
  diagnostics: NonNullable<OpenClawPluginListJson["diagnostics"]>;
  duplicate: boolean;
  loadError?: string;
}> {
  const inventory = await readPluginInventory();
  const entries = (inventory?.plugins ?? []).filter((plugin) => plugin.id === pluginId);
  const diagnostics = (inventory?.diagnostics ?? []).filter((diagnostic) => diagnostic.pluginId === pluginId);
  const duplicate =
    entries.length > 1 || diagnostics.some((diagnostic) => /duplicate plugin id detected/i.test(diagnostic.message ?? ""));
  const errorEntry = entries.find((entry) => entry.status === "error");
  const errorDiagnostic = diagnostics.find((diagnostic) => diagnostic.level === "error");
  const loadError = errorEntry?.error ?? errorDiagnostic?.message;

  return {
    entries,
    diagnostics,
    duplicate,
    loadError
  };
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

function buildModelConfigOverview(
  allModels: ModelCatalogEntry[],
  configuredModels: ModelCatalogEntry[],
  configuredAuthProviders: Set<string>,
  savedEntries: SavedModelEntryState[],
  defaultEntryId: string | undefined,
  fallbackEntryIds: string[],
  defaultModelOverride?: string
): ModelConfigOverview {
  const configuredKeys = new Set(configuredModels.map((model) => model.key));
  const defaultModel = defaultModelOverride ?? configuredModels.find((model) => model.tags.includes("default"))?.key;

  return {
    providers: listModelProviderDefinitions().map((provider) => {
      const matches = allModels.filter((model) => provider.providerRefs.some((prefix) => model.key.startsWith(prefix)));
      const configuredByAuth = [...configuredAuthProviders].some((authProvider) => providerMatchesAuthProvider(provider, authProvider));
      const configured = configuredByAuth || matches.some((model) => configuredKeys.has(model.key));

      return {
        id: provider.id,
        label: provider.label,
        description: provider.description,
        docsUrl: provider.docsUrl,
        providerRefs: provider.providerRefs,
        authMethods: provider.authMethods.map(toPublicAuthMethod),
        exampleModels: provider.exampleModels,
        authEnvVars: provider.authEnvVars,
        setupNotes: provider.setupNotes,
        warnings: provider.warnings,
        providerType: provider.providerType,
        supportsNoAuth: provider.supportsNoAuth,
        configured,
        modelCount: matches.length,
        sampleModels: matches.slice(0, 5).map((model) => model.key)
      };
    }),
    models: allModels,
    defaultModel,
    configuredModelKeys: configuredModels.map((model) => model.key),
    savedEntries: savedEntries.map(toSavedModelEntry),
    defaultEntryId,
    fallbackEntryIds
  };
}

function isCleanModelRuntime(snapshot: ModelReadSnapshot): boolean {
  return (
    snapshot.configuredModels.length === 0 &&
    snapshot.configuredAuthProviders.size === 0 &&
    snapshot.supplemental.refs.size === 0 &&
    !snapshot.supplemental.defaultModel
  );
}

export class OpenClawAdapter implements EngineAdapter {
  readonly installSpec: EngineInstallSpec = {
    engine: "openclaw",
    desiredVersion: OPENCLAW_INSTALL_TARGET,
    installSource: "npm-local",
    prerequisites: [
      "macOS",
      "Node.js 22 or newer",
      "pnpm only if you build OpenClaw from source",
      "Permission to install or reuse the latest available OpenClaw CLI"
    ],
    installPath: getManagedOpenClawDir()
  };

  readonly capabilities: EngineCapabilities = {
    engine: "openclaw",
    supportsInstall: true,
    supportsUpdate: true,
    supportsRecovery: true,
    supportsStreaming: true,
    runtimeModes: ["gateway", "embedded", "local-llm"],
    supportedChannels: ["local-ui"],
    starterSkillCategories: ["communication", "research", "docs", "operations"],
    futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
  };

  readonly instances: InstanceManager;
  readonly config: ConfigManager;
  readonly aiEmployees: AIEmployeeManager;
  readonly gateway: GatewayManager;
  readonly plugins: PluginManager;
  private readonly channelsConfigCoordinator: ChannelsConfigCoordinator;
  private readonly modelsConfigCoordinator: ModelsConfigCoordinator;
  private readonly runtimeLifecycleService: OpenClawRuntimeLifecycleService;

  constructor(private readonly secrets: SecretsAdapter = createDefaultSecretsAdapter()) {
    const modelsConfigCoordinator = new ModelsConfigCoordinator({
      readModelSnapshot: async () => {
        const snapshot = await readModelSnapshot();
        return {
          ...snapshot,
          supplemental: {
            refs: snapshot.supplemental.refs,
            defaultModel: snapshot.supplemental.defaultModel
          }
        };
      },
      resolveCatalogModelKey,
      isCleanModelRuntime: (snapshot) => isCleanModelRuntime(snapshot as ModelReadSnapshot),
      mergeModelCatalogEntries: (models, refs, options) =>
        mergeModelCatalogEntries(models, refs ?? [], {
          available: options.available,
          defaultModel: options.defaultModel ?? undefined
        }),
      buildModelConfigOverview: (
        allModels,
        configuredModels,
        configuredAuthProviders,
        modelEntries,
        defaultModelEntryId,
        fallbackModelEntryIds,
        defaultModel
      ) =>
        buildModelConfigOverview(
          allModels,
          configuredModels,
          configuredAuthProviders,
          modelEntries as SavedModelEntryState[],
          defaultModelEntryId,
          fallbackModelEntryIds,
          defaultModel ?? undefined
        ),
      buildEntryLabel: (label, providerId, modelKey) => this.buildEntryLabel(label, providerId, modelKey),
      readAdapterState,
      writeAdapterState: (state) => writeAdapterState(state as OpenClawAdapterState),
      ensureSavedModelState: () => this.ensureSavedModelState(),
      reconcileSavedModelState: (state, configuredModels, defaultModel) =>
        this.reconcileSavedModelState(
          state as OpenClawAdapterState,
          configuredModels,
          defaultModel ?? undefined
        ),
      mutationSyncMeta: (engineSynced) => this.mutationSyncMeta(engineSynced),
      getRuntimeModelAuthSession: (sessionId) => modelAuthSessions.get(sessionId) as unknown as ReturnType<typeof modelAuthSessions.get>,
      setRuntimeModelAuthSession: (sessionId, session) => {
        modelAuthSessions.set(sessionId, session as RuntimeModelAuthSession);
      },
      resolveOpenClawCommand,
      buildModelsCommandArgs,
      spawnInteractiveCommand: (command, args, envOverrides) => spawnInteractiveCommand(command, args, envOverrides),
      appendAuthSessionOutput: (session, chunk) => appendAuthSessionOutput(session as RuntimeModelAuthSession, chunk),
      writeErrorLog,
      errorToLogDetails,
      readOpenClawConfigSnapshot: async () => {
        const snapshot = await this.readOpenClawConfigSnapshot();
        return snapshot as unknown as {
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
            aliases?: Record<string, string>;
          };
        };
      },
      writeOpenClawConfigSnapshot: (configPath, config) =>
        this.writeOpenClawConfigSnapshot(configPath, config as OpenClawConfigFileJson),
      readAuthStore,
      writeAuthStore,
      upsertAgentConfigEntry: (configPath, config, entry, model) =>
        this.upsertAgentConfigEntry(
          configPath,
          config as OpenClawConfigFileJson,
          entry as SavedModelEntryState,
          model
        ),
      hasReusableAuthForSavedModelEntry: (entry, providerId, method) =>
        this.hasReusableAuthForSavedModelEntry(
          entry as SavedModelEntryState | undefined,
          providerId,
          method as InternalModelAuthMethod
        ),
      normalizeStateFlags: (state) => this.normalizeStateFlags(state as OpenClawAdapterState),
      isRuntimeDerivedModelEntryId,
      removeRuntimeDerivedModelFromConfig: (config, status, modelKey) =>
        removeRuntimeDerivedModelFromConfig(
          config as OpenClawConfigFileJson,
          status as Pick<OpenClawModelStatusJson, "aliases"> | undefined,
          modelKey
        ),
      markGatewayApplyPending: () => this.markGatewayApplyPending(),
      runMutationWithConfigFallback: (options) => this.runMutationWithConfigFallback(options),
      writeDefaultModelConfig: (modelKey) => this.writeDefaultModelConfig(modelKey),
      runOpenClaw
    });
    const channelsConfigCoordinator = new ChannelsConfigCoordinator({
      readChannelSnapshot,
      deriveLiveChannelState: (channelId, list, status) =>
        deriveLiveChannelState(
          channelId,
          list as OpenClawChannelsListJson | undefined,
          status as OpenClawChannelsStatusJson | undefined
        ),
      buildLiveChannelEntries: (list, status) =>
        buildLiveChannelEntries(
          list as OpenClawChannelsListJson | undefined,
          status as OpenClawChannelsStatusJson | undefined
      ),
      runOpenClaw,
      runMutationWithConfigFallback: (options) => this.runMutationWithConfigFallback(options),
      removeChannelConfig: async (channelKey) => {
        await this.mutateOpenClawConfig(({ config }) => {
          if (!config.channels || !(channelKey in config.channels)) {
            return;
          }

          delete config.channels[channelKey];
          if (Object.keys(config.channels).length === 0) {
            delete config.channels;
          }
        });
      },
      markGatewayApplyPending: () => this.markGatewayApplyPending(),
      readInstalledOpenClawVersion,
      inspectPlugin,
      restartGatewayAndRequireHealthy: (reason) => this.restartGatewayAndRequireHealthy(reason),
      writeFeishuChannelConfig: (request) => this.writeFeishuChannelConfig(request),
      writeTelegramChannelConfig: (request) => this.writeTelegramChannelConfig(request),
      writeWechatChannelConfig: (pluginId, request, legacyKeys) =>
        this.writeWechatChannelConfig(pluginId, request, legacyKeys),
      resolveOpenClawCommand,
      buildCommandEnv,
      logExternalCommand,
      spawnInteractiveCommand,
      managedWechatInstallerDir: getManagedWechatInstallerDir(),
      wechatInstallerPackageSpec: WECHAT_INSTALLER_PACKAGE_SPEC,
      resolveNpmInvocation,
      ensureSystemDependencies: () => this.ensureSystemDependencies(),
      runCommand,
      readWechatInstallerBinName,
      fileExists,
      writeErrorLog,
      errorToLogDetails,
      compareVersionStrings,
      personalWechatRuntimeChannelKey: PERSONAL_WECHAT_RUNTIME_CHANNEL_KEY,
      feishuBundledSince: FEISHU_BUNDLED_SINCE
    });
    const capabilityConfigCoordinator = new CapabilityConfigCoordinator({
      readSkillSnapshot,
      runClawHub,
      runOpenClaw,
      markGatewayApplyPending: () => this.markGatewayApplyPending(),
      invalidateReadCaches: (resources) => this.invalidateReadCaches(resources),
      readBundledManagedSkillMarkdown,
      readOpenClawSkillsList: () => readOpenClawSkillsList(),
      getConfiguredChannelEntries: () => this.getConfiguredChannelEntries(),
      readOpenClawConfigSnapshot: async () => {
        const snapshot = await this.readOpenClawConfigSnapshot();
        return snapshot as unknown as {
          configPath: string;
          config: {
            channels?: Record<string, unknown>;
            plugins?: {
              entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
            };
            [key: string]: unknown;
          };
        };
      },
      writeOpenClawConfigSnapshot: (configPath, config) =>
        this.writeOpenClawConfigSnapshot(configPath, config as OpenClawConfigFileJson),
      inspectPlugin,
      restartGatewayAndRequireHealthy: (reason) => this.restartGatewayAndRequireHealthy(reason)
    });
    const agentsConfigCoordinator = new AgentsConfigCoordinator({
      listAIMemberRuntimeCandidates: () => this.listAIMemberRuntimeCandidates(),
      getPrimaryAIMemberAgentId: () => this.getPrimaryAIMemberAgentId(),
      setPrimaryAIMemberAgent: (agentId) => this.setPrimaryAIMemberAgent(agentId),
      readResolvedSavedModelState: () => this.readResolvedSavedModelState(),
      readAllModels: async () => (await readModelSnapshot()).allModels,
      resolveCatalogModelKey,
      listOpenClawAgents: () => this.listOpenClawAgents(),
      ensureMemberAgent: (memberId, agentId, brain) => this.ensureMemberAgent(memberId, agentId, brain),
      setMemberIdentity: (agentId, request) => this.setMemberIdentity(agentId, request),
      writeMemberWorkspaceFiles,
      runOpenClaw,
      markGatewayApplyPending: () => this.markGatewayApplyPending(),
      invalidateReadCaches: (resources, agentId) => {
        const cacheResources = resources.flatMap((resource) =>
          resource === "ai-members"
            ? ["agents" as const, ...(agentId ? ([`agents:bindings:${agentId}`] as const) : [])]
            : resource === "skills"
              ? (["skills"] as const)
              : []
        );

        if (cacheResources.length > 0) {
          invalidateReadCache(...cacheResources);
        }
      },
      toRuntimeBindingTarget,
      readOpenClawConfigSnapshot: async () => {
        const snapshot = await this.readOpenClawConfigSnapshot();
        return snapshot as unknown as {
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
      },
      writeOpenClawConfigSnapshot: (configPath, config) =>
        this.writeOpenClawConfigSnapshot(configPath, config as OpenClawConfigFileJson),
      getSavedSecret: (secretName) => this.secrets.get(secretName),
      buildModelsCommandArgs,
      readAuthStore,
      writeAuthStore,
      upsertAgentConfigEntry: (configPath, config, entry, model) =>
        this.upsertAgentConfigEntry(
          configPath,
          config as OpenClawConfigFileJson,
          entry as SavedModelEntryState,
          model
        ),
      getMainOpenClawAgentDir,
      readBindingsCache: (agentId, loader) => readThroughCache(`agents:bindings:${agentId}`, READ_CACHE_TTL_MS.bindings, loader),
      invalidateMemberBindingCaches: (agentIds) =>
        invalidateReadCache(...agentIds.map((agentId) => `agents:bindings:${agentId}`))
    });
    const runtimeLifecycleService = new OpenClawRuntimeLifecycleService({
      installSpec: this.installSpec,
      versionOverride: OPENCLAW_VERSION_OVERRIDE,
      installTarget: OPENCLAW_INSTALL_TARGET,
      standardRequirements: STANDARD_OPENCLAW_REQUIREMENTS,
      managedRequirements: MANAGED_OPENCLAW_REQUIREMENTS,
      installDocsUrl: OPENCLAW_INSTALL_DOCS_URL,
      macDocsUrl: OPENCLAW_MAC_DOCS_URL,
      ensurePinnedOpenClaw: (targetMode) => this.ensurePinnedOpenClaw(targetMode),
      readAdapterState,
      writeAdapterState,
      normalizeStateFlags: (state) => this.normalizeStateFlags(state),
      appendGatewayApplyMessage,
      summarizePendingGatewayApply,
      configure: (profileId) => this.configure(profileId),
      invalidateReadCaches: (resources) => this.invalidateReadCaches(resources),
      collectStatusData: () => this.collectStatusData(),
      readEngineSnapshot,
      resolveManagedOpenClawCommand,
      resolveSystemOpenClawCommand,
      resolveOpenClawCommand,
      readVersionFromCommand,
      readUpdateStatusFromCommand,
      isOpenClawVersionCompatible,
      openClawVersionSummary,
      compareOpenClawVersions,
      runCommand,
      runOpenClaw,
      logSoftFailure,
      openClawInstallTargetSummary,
      resolveAgentArgs: () => this.resolveAgentArgs(),
      fileExists,
      managedOpenClawDir: getManagedOpenClawDir(),
      managedOpenClawBinPath: getManagedOpenClawBinPath(),
      gatewayInstalled: async () => {
        const snapshot = await readEngineSnapshot({ fresh: true });
        return Boolean(snapshot.statusJson?.gatewayService?.installed || snapshot.gatewayJson?.service?.installed);
      },
      restartGatewayAndRequireHealthy: (reason) => this.restartGatewayAndRequireHealthy(reason),
      waitForGatewayReachable: (reason) => this.waitForGatewayReachable(reason)
    });
    const chatService = new OpenClawChatService({
      runGatewayCall,
      subscribeToLiveChatEvents: (listener) => gatewaySocketBridge.subscribe(listener)
    });

    this.instances = new OpenClawInstanceManager(runtimeLifecycleService);
    this.channelsConfigCoordinator = channelsConfigCoordinator;
    this.modelsConfigCoordinator = modelsConfigCoordinator;
    this.runtimeLifecycleService = runtimeLifecycleService;
    this.config = new OpenClawConfigManager({
      getModelConfig: () => modelsConfigCoordinator.getModelConfig(),
      createSavedModelEntry: (request) => modelsConfigCoordinator.createSavedModelEntry(request),
      updateSavedModelEntry: (entryId, request) => modelsConfigCoordinator.updateSavedModelEntry(entryId, request),
      removeSavedModelEntry: (entryId) => modelsConfigCoordinator.removeSavedModelEntry(entryId),
      setDefaultModelEntry: (request) => modelsConfigCoordinator.setDefaultModelEntry(request),
      replaceFallbackModelEntries: (request) => modelsConfigCoordinator.replaceFallbackModelEntries(request),
      authenticateModelProvider: (request) => modelsConfigCoordinator.authenticateModelProvider(request),
      getModelAuthSession: (sessionId) => modelsConfigCoordinator.getModelAuthSession(sessionId),
      submitModelAuthSessionInput: (sessionId, request) => modelsConfigCoordinator.submitModelAuthSessionInput(sessionId, request),
      setDefaultModel: (modelKey) => modelsConfigCoordinator.setDefaultModel(modelKey),
      getChannelState: (channelId) => channelsConfigCoordinator.getChannelState(channelId),
      getConfiguredChannelEntries: () => channelsConfigCoordinator.getConfiguredChannelEntries(),
      saveChannelEntry: (request) => channelsConfigCoordinator.saveChannelEntry(request),
      removeChannelEntry: (request) => channelsConfigCoordinator.removeChannelEntry(request),
      getSkillRuntimeCatalog: () => capabilityConfigCoordinator.getSkillRuntimeCatalog(),
      getInstalledSkillDetail: (skillId) => capabilityConfigCoordinator.getInstalledSkillDetail(skillId),
      listMarketplaceInstalledSkills: () => capabilityConfigCoordinator.listMarketplaceInstalledSkills(),
      exploreSkillMarketplace: (limit) => capabilityConfigCoordinator.exploreSkillMarketplace(limit),
      searchSkillMarketplace: (query, limit) => capabilityConfigCoordinator.searchSkillMarketplace(query, limit),
      getSkillMarketplaceDetail: (slug) => capabilityConfigCoordinator.getSkillMarketplaceDetail(slug),
      installMarketplaceSkill: (request) => capabilityConfigCoordinator.installMarketplaceSkill(request),
      updateMarketplaceSkill: (slug, request) => capabilityConfigCoordinator.updateMarketplaceSkill(slug, request),
      saveCustomSkill: (skillId, request) => capabilityConfigCoordinator.saveCustomSkill(skillId, request),
      removeInstalledSkill: (slug, request) => capabilityConfigCoordinator.removeInstalledSkill(slug, request),
      installManagedSkill: (request) => capabilityConfigCoordinator.installManagedSkill(request),
      verifyManagedSkill: (slug) => capabilityConfigCoordinator.verifyManagedSkill(slug)
    }, {
      secrets: this.secrets,
      resolveModelAuthSecretFieldIds: (providerId, methodId) =>
        providerDefinitionById(providerId)?.authMethods.find((item) => item.id === methodId)?.fields
          .filter((field) => field.secret === true)
          .map((field) => field.id) ?? []
    });
    this.aiEmployees = new OpenClawAIEmployeeManager(agentsConfigCoordinator);
    this.gateway = new OpenClawGatewayManager({
      restartGateway: () => runtimeLifecycleService.restartGateway(),
      healthCheck: (selectedProfileId) => runtimeLifecycleService.healthCheck(selectedProfileId),
      getActiveChannelSession: () => channelsConfigCoordinator.getActiveChannelSession(),
      getChannelSession: (sessionId) => channelsConfigCoordinator.getChannelSession(sessionId),
      submitChannelSessionInput: (sessionId, request) => channelsConfigCoordinator.submitChannelSessionInput(sessionId, request),
      runTask: (request) => runtimeLifecycleService.runTask(request),
      getChatThreadDetail: (request) => chatService.getChatThreadDetail(request),
      subscribeToLiveChatEvents: (listener) => chatService.subscribeToLiveChatEvents(listener),
      sendChatMessage: (request) => chatService.sendChatMessage(request),
      abortChatMessage: (request) => chatService.abortChatMessage(request),
      startWhatsappLogin: () => channelsConfigCoordinator.startWhatsappLogin(),
      approvePairing: (channelId, request) => channelsConfigCoordinator.approvePairing(channelId, request),
      prepareFeishu: () => channelsConfigCoordinator.prepareFeishu(),
      finalizeOnboardingSetup: () => runtimeLifecycleService.finalizeOnboardingSetup(),
      startGatewayAfterChannels: () => runtimeLifecycleService.startGatewayAfterChannels()
    });
    this.plugins = new OpenClawPluginManager(capabilityConfigCoordinator);
  }

  invalidateReadCaches(resources?: import("./adapter.js").EngineReadCacheResource[]): void {
    if (!resources || resources.length === 0) {
      invalidateReadCache();
      invalidateCommandResolutionCache();
      return;
    }

    const cachePrefixes = new Set<string>();
    const commandKeys = new Set<string>();

    for (const resource of resources) {
      if (resource === "engine") {
        cachePrefixes.add("engine:");
        commandKeys.add("command:version:");
        commandKeys.add("command:update:");
      }
      if (resource === "models") {
        cachePrefixes.add("models:");
      }
      if (resource === "channels") {
        cachePrefixes.add("channels:");
      }
      if (resource === "plugins") {
        cachePrefixes.add("plugins:");
      }
      if (resource === "skills") {
        cachePrefixes.add("skills:");
      }
      if (resource === "ai-members") {
        cachePrefixes.add("agents:");
      }
    }

    invalidateReadCache(...cachePrefixes);
    invalidateCommandResolutionCache(...commandKeys);
  }

  private mutationSyncMeta(settled = true) {
    return {
      epoch: "daemon-local",
      revision: 0,
      settled
    } as const;
  }

  private async readOpenClawConfigSnapshot(): Promise<{
    status?: OpenClawModelStatusJson;
    configPath: string;
    config: OpenClawConfigFileJson;
  }> {
    const status = await readModelStatus();
    const configPath = status?.configPath ?? defaultOpenClawConfigPath();
    const config = (await readOpenClawConfigFile(configPath)) ?? {};

    return {
      status,
      configPath,
      config
    };
  }

  private async writeOpenClawConfigSnapshot(configPath: string, config: OpenClawConfigFileJson): Promise<void> {
    await writeOpenClawConfigFile(configPath, config);
    invalidateReadCache("models:", "engine:");
  }

  private async resolveOpenClawConfigPathForInstall(command: string | undefined): Promise<string> {
    if (!command) {
      return defaultOpenClawConfigPath();
    }

    const result = await runCommand(command, ["models", "status", "--json"], { allowFailure: true }).catch(() => ({
      code: 1,
      stdout: "",
      stderr: ""
    }));
    const status =
      safeJsonPayloadParse<OpenClawModelStatusJson>(result.stdout) ??
      safeJsonPayloadParse<OpenClawModelStatusJson>(result.stderr);

    return status?.configPath ?? defaultOpenClawConfigPath();
  }

  private async ensureChillClawGatewayConfigBaseline(command: string | undefined): Promise<boolean> {
    const configPath = await this.resolveOpenClawConfigPathForInstall(command);
    const currentConfig = (await readOpenClawConfigFile(configPath)) ?? {};
    const normalized = normalizeOpenClawGatewayConfigForChillClaw(currentConfig);

    if (!normalized.changed) {
      return false;
    }

    await writeOpenClawConfigFile(configPath, normalized.config);
    invalidateReadCache("models:", "engine:");
    await writeInfoLog("Normalized OpenClaw gateway config to ChillClaw's local baseline.", {
      configPath,
      gatewayMode: CHILLCLAW_OPENCLAW_GATEWAY_MODE,
      gatewayBind: CHILLCLAW_OPENCLAW_GATEWAY_BIND,
      gatewayAuthMode: CHILLCLAW_OPENCLAW_GATEWAY_AUTH_MODE
    });
    return true;
  }

  private async mutateOpenClawConfig(
    mutate: (snapshot: { configPath: string; config: OpenClawConfigFileJson }) => void | Promise<void>
  ): Promise<void> {
    const snapshot = await this.readOpenClawConfigSnapshot();
    await mutate(snapshot);
    await this.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
  }

  private async runMutationWithConfigFallback(options: {
    commandArgs: string[];
    fallbackDescription: string;
    fallbackPatterns?: string[];
    applyFallback: () => Promise<void>;
  }): Promise<{ usedFallback: boolean; result: CommandResult }> {
    const result = await runOpenClaw(options.commandArgs, { allowFailure: true });

    if (result.code === 0) {
      return {
        usedFallback: false,
        result
      };
    }

    const decision = classifyCommandDriftFailure(result, options.fallbackPatterns);

    if (decision !== "retry-with-config") {
      return {
        usedFallback: false,
        result
      };
    }

    logDevelopmentCommand("fallback", "openclaw-config", [options.fallbackDescription]);
    await writeInfoLog("ChillClaw activated config-backed OpenClaw fallback.", {
      commandArgs: options.commandArgs,
      fallbackDescription: options.fallbackDescription,
      failure: commandFailureText(result)
    });
    await options.applyFallback();

    return {
      usedFallback: true,
      result
    };
  }

  private async writeTelegramChannelConfig(request: TelegramSetupRequest): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      config.channels = config.channels ?? {};
      config.channels.telegram = {
        enabled: true,
        botToken: request.token,
        dmPolicy: "pairing",
        groups: {
          "*": {
            requireMention: true
          }
        }
      };
    });
  }

  private async writeFeishuChannelConfig(request: FeishuSetupRequest): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      config.channels = config.channels ?? {};
      config.channels.feishu = {
        enabled: true,
        domain: request.domain ?? "feishu",
        dmPolicy: "pairing",
        groupPolicy: "open",
        useLongConnection: true,
        accounts: {
          default: {
            appId: request.appId,
            appSecret: request.appSecret,
            ...(request.botName?.trim() ? { botName: request.botName.trim() } : {})
          }
        }
      };
    });
  }

  private async writeWechatChannelConfig(
    pluginId: string,
    request: WechatSetupRequest,
    legacyKeys: string[] = []
  ): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      config.channels = config.channels ?? {};
      for (const legacyKey of legacyKeys) {
        delete config.channels[legacyKey];
      }
      config.channels[pluginId] = {
        enabled: true,
        botId: request.botId,
        secret: request.secret,
        dmPolicy: "pairing",
        groupPolicy: "open"
      };
    });
  }

  private async writeDefaultModelConfig(modelKey: string): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      config.agents = config.agents ?? {};
      const existingDefaults = config.agents.defaults ?? {};
      const existingModel = existingDefaults.model;
      const fallbacks =
        typeof existingModel === "object" && existingModel && Array.isArray(existingModel.fallbacks)
          ? existingModel.fallbacks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];
      const models = existingDefaults.models ?? {};

      config.agents.defaults = {
        ...existingDefaults,
        model: {
          primary: modelKey,
          fallbacks
        },
        models: {
          ...models,
          [modelKey]: models[modelKey] ?? {}
        }
      };
    });
  }

  private normalizeStateFlags(state: OpenClawAdapterState): OpenClawAdapterState {
    const entries = [...(state.modelEntries ?? [])];
    const defaultEntryId =
      state.defaultModelEntryId && entries.some((entry) => entry.id === state.defaultModelEntryId)
        ? state.defaultModelEntryId
        : entries.find((entry) => entry.isDefault)?.id;
    const seenModelKeys = new Set<string>();
    const fallbackEntryIds: string[] = [];

    for (const entryId of state.fallbackModelEntryIds ?? []) {
      if (entryId === defaultEntryId) {
        continue;
      }

      const entry = entries.find((item) => item.id === entryId);
      if (!entry || seenModelKeys.has(entry.modelKey)) {
        continue;
      }

      seenModelKeys.add(entry.modelKey);
      fallbackEntryIds.push(entry.id);
    }

    return {
      ...state,
      modelEntries: entries.map((entry) => ({
        ...entry,
        isDefault: entry.id === defaultEntryId,
        isFallback: fallbackEntryIds.includes(entry.id)
      })),
      defaultModelEntryId: defaultEntryId,
      fallbackModelEntryIds: fallbackEntryIds,
      pendingGatewayApply: state.pendingGatewayApply === true,
      pendingGatewayApplySummary: state.pendingGatewayApply ? state.pendingGatewayApplySummary : undefined
    };
  }

  private async markGatewayApplyPending(summary = summarizePendingGatewayApply()): Promise<void> {
    const state = this.normalizeStateFlags(await readAdapterState());

    await writeAdapterState({
      ...state,
      pendingGatewayApply: true,
      pendingGatewayApplySummary: summary
    });
  }

  private async clearGatewayApplyPending(): Promise<void> {
    const state = this.normalizeStateFlags(await readAdapterState());

    if (!state.pendingGatewayApply && !state.pendingGatewayApplySummary) {
      return;
    }

    await writeAdapterState({
      ...state,
      pendingGatewayApply: false,
      pendingGatewayApplySummary: undefined
    });
  }

  private buildEntryLabel(label: string | undefined, providerId: string, modelKey: string): string {
    const trimmed = label?.trim();
    if (trimmed) {
      return trimmed;
    }

    const provider = providerDefinitionById(providerId);
    const modelName = modelKey.includes("/") ? modelKey.slice(modelKey.indexOf("/") + 1) : modelKey;
    return provider ? `${provider.label} ${modelName}` : modelName;
  }

  private async ensureSavedModelState(): Promise<OpenClawAdapterState> {
    const state = this.normalizeStateFlags(await readAdapterState());
    if ((state.modelEntries?.length ?? 0) > 0) {
      if ((state.modelEntries ?? []).some((entry) => isImplicitMainAgentId(entry.agentId))) {
        const snapshot = await readModelSnapshot();
        const completeConfiguredModels = mergeModelCatalogEntries(snapshot.configuredModels, snapshot.supplemental.refs, {
          available: true,
          defaultModel: snapshot.supplemental.defaultModel
        });
        return this.reconcileSavedModelState(state, completeConfiguredModels, snapshot.supplemental.defaultModel);
      }

      return state;
    }

    const migration = await this.seedSavedModelEntriesFromCurrentConfig(state);
    const normalized = this.normalizeStateFlags(migration);
    await writeAdapterState(normalized);
    return normalized;
  }

  private async reconcileSavedModelState(
    state: OpenClawAdapterState,
    configuredModels: ModelCatalogEntry[],
    defaultModel?: string
  ): Promise<OpenClawAdapterState> {
    const reconciled = reconcileSavedEntriesWithRuntime(state.modelEntries ?? [], configuredModels, defaultModel);
    const nextState = this.normalizeStateFlags({
      ...state,
      modelEntries: reconciled.entries,
      defaultModelEntryId: reconciled.defaultEntryId,
      fallbackModelEntryIds: reconciled.fallbackEntryIds
    });

    if (JSON.stringify(nextState) !== JSON.stringify(state)) {
      await writeAdapterState(nextState);
    }

    return nextState;
  }

  private async readResolvedSavedModelState(): Promise<OpenClawAdapterState> {
    const snapshot = await readModelSnapshot();
    const completeConfiguredModels = mergeModelCatalogEntries(snapshot.configuredModels, snapshot.supplemental.refs, {
      available: true,
      defaultModel: snapshot.supplemental.defaultModel
    });

    return this.reconcileSavedModelState(
      await this.ensureSavedModelState(),
      completeConfiguredModels,
      snapshot.supplemental.defaultModel
    );
  }

  private async seedSavedModelEntriesFromCurrentConfig(state: OpenClawAdapterState): Promise<OpenClawAdapterState> {
    const snapshot = await this.readOpenClawConfigSnapshot();
    const modelKey =
      resolveModelRef(snapshot.status?.resolvedDefault, undefined, snapshot.status?.aliases ?? {}) ??
      resolveModelRef(snapshot.status?.defaultModel, undefined, snapshot.status?.aliases ?? {}) ??
      snapshot.status?.allowed?.[0];

    if (!modelKey) {
      return {
        ...state,
        modelEntries: [],
        defaultModelEntryId: undefined,
        fallbackModelEntryIds: []
      };
    }

    const provider = providerDefinitionByModelKey(modelKey);
    const createdAt = new Date().toISOString();
    const agentDir = snapshot.status?.agentDir ?? getMainOpenClawAgentDir();
    const summary = await this.modelsConfigCoordinator.readEntryAuthSummary(agentDir, provider?.id);
    const runtimeEntryId = runtimeEntryIdForModelKey(modelKey);

    return {
      ...state,
      modelEntries: [
        {
          id: runtimeEntryId,
          label: this.buildEntryLabel(undefined, provider?.id ?? modelRefProvider(modelKey) ?? "custom", modelKey),
          providerId: provider?.id ?? modelRefProvider(modelKey) ?? "custom",
          modelKey,
          agentId: "",
          agentDir: "",
          workspaceDir: "",
          authMethodId: undefined,
          authModeLabel: summary.authModeLabel,
          profileLabel: summary.profileLabel,
          profileIds: [],
          isDefault: true,
          isFallback: false,
          createdAt,
          updatedAt: createdAt
        }
      ],
      defaultModelEntryId: runtimeEntryId,
      fallbackModelEntryIds: []
    };
  }

  private isVisibleAIMemberAgent(agent: OpenClawAgentListEntry): agent is OpenClawAgentListEntry & { id: string } {
    return isVisibleAIMemberAgentId(agent.id);
  }

  private async listOpenClawAgents(): Promise<OpenClawAgentListEntry[]> {
    return readAgentListSnapshot();
  }

  async listAIMemberRuntimeCandidates(): Promise<AIMemberRuntimeCandidate[]> {
    const agents = await this.listOpenClawAgents();
    const visibleAgents = agents.filter((agent) => this.isVisibleAIMemberAgent(agent));

    return visibleAgents.map((agent) => ({
        agentId: agent.id,
        name: agent.identityName?.trim() || agent.name?.trim() || agent.id,
        emoji: agent.identityEmoji?.trim() || undefined,
        modelKey: agent.model?.trim() || undefined,
        agentDir: agent.agentDir,
        workspaceDir: agent.workspace,
        bindingCount: typeof agent.bindings === "number" ? agent.bindings : 0,
        bindings: []
      }));
  }

  async getPrimaryAIMemberAgentId(): Promise<string | undefined> {
    const snapshot = await this.readOpenClawConfigSnapshot();
    return preferredConfiguredPrimaryAgentId(snapshot.config);
  }

  async setPrimaryAIMemberAgent(agentId: string | undefined): Promise<{ requiresGatewayApply?: boolean }> {
    const normalizedAgentId = agentId?.trim() || undefined;
    const snapshot = await this.readOpenClawConfigSnapshot();
    const existingList = snapshot.config.agents?.list ?? [];
    let nextList = existingList.filter((entry) => entry.id !== OPENCLAW_MAIN_AGENT_ID);
    let changed = nextList.length !== existingList.length;

    if (normalizedAgentId) {
      const existingIndex = nextList.findIndex((entry) => entry.id === normalizedAgentId);

      if (existingIndex < 0) {
        const runtimeEntry = (await this.listOpenClawAgents()).find((entry) => entry.id === normalizedAgentId);
        if (!runtimeEntry) {
          throw new Error(`ChillClaw could not find the AI member agent ${normalizedAgentId}.`);
        }

        nextList.push({
          id: normalizedAgentId,
          ...(runtimeEntry.identityName?.trim() || runtimeEntry.name?.trim()
            ? { name: runtimeEntry.identityName?.trim() || runtimeEntry.name?.trim() }
            : {}),
          ...(runtimeEntry.workspace?.trim() ? { workspace: runtimeEntry.workspace.trim() } : {}),
          ...(runtimeEntry.agentDir?.trim() ? { agentDir: runtimeEntry.agentDir.trim() } : {}),
          ...(runtimeEntry.model ? { model: runtimeEntry.model } : {})
        });
        changed = true;
      }
    }

    nextList = nextList.map((entry) => {
      const shouldBeDefault = Boolean(normalizedAgentId && entry.id === normalizedAgentId);
      const nextEntry = { ...entry };

      if (shouldBeDefault) {
        nextEntry.default = true;
      } else if ("default" in nextEntry) {
        delete nextEntry.default;
      }

      if ((entry.default === true) !== shouldBeDefault) {
        changed = true;
      }

      return nextEntry;
    });

    if (!changed) {
      return { requiresGatewayApply: false };
    }

    snapshot.config.agents = snapshot.config.agents ?? {};
    if (nextList.length > 0) {
      snapshot.config.agents.list = nextList;
    } else if (snapshot.config.agents) {
      delete snapshot.config.agents.list;
    }

    await this.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
    await this.markGatewayApplyPending();

    return { requiresGatewayApply: true };
  }

  private async ensureMemberAgent(
    memberId: string,
    agentId: string,
    brain: BrainAssignment
  ): Promise<{ agentDir: string; workspaceDir: string; created: boolean }> {
    const paths = getManagedMemberAgentPaths(memberId);
    const agents = await this.listOpenClawAgents();
    const existingAgent = agents.find((agent) => agent.id === agentId);
    let created = false;

    if (!existingAgent) {
      const add = await runOpenClaw(
        [
          "agents",
          "add",
          agentId,
          "--agent-dir",
          paths.agentDir,
          "--workspace",
          paths.workspaceDir,
          "--model",
          brain.modelKey,
          "--non-interactive",
          "--json"
        ],
        { allowFailure: true }
      );

      if (add.code !== 0) {
        throw new Error(add.stderr || add.stdout || `ChillClaw could not create the AI member agent ${agentId}.`);
      }

      created = true;
    }

    return {
      agentDir: existingAgent?.agentDir || paths.agentDir,
      workspaceDir: existingAgent?.workspace || paths.workspaceDir,
      created
    };
  }

  private async setMemberIdentity(agentId: string, request: AIMemberRuntimeRequest): Promise<void> {
    await runOpenClaw(
      [
        "agents",
        "set-identity",
        "--agent",
        agentId,
        "--name",
        request.name,
        "--emoji",
        request.avatar.emoji,
        ...(request.avatar.theme ? ["--theme", request.avatar.theme] : []),
        ...(request.avatar.presetId ? ["--avatar", request.avatar.presetId] : []),
        "--json"
      ],
      { allowFailure: true }
    );
  }

  private async hasReusableAuthForSavedModelEntry(
    entry: SavedModelEntryState | undefined,
    providerId: string,
    method: InternalModelAuthMethod
  ): Promise<boolean> {
    if (!entry) {
      return false;
    }

    const provider = providerDefinitionById(providerId);
    const snapshot = await this.readOpenClawConfigSnapshot();
    const sourceAuthDir = entry.agentDir || snapshot.status?.agentDir || getMainOpenClawAgentDir();
    const sourceStore = sourceAuthDir ? await readAuthStore(sourceAuthDir) : undefined;
    const matchingProfiles =
      entry.profileIds.length > 0
        ? entry.profileIds.filter((profileId) => Boolean(sourceStore?.profiles?.[profileId]))
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

    if (matchingProfiles.length > 0) {
      return true;
    }

    const secretFields = method.fields.filter((field) => field.secret === true);
    for (const field of secretFields) {
      const value = await this.secrets.get(modelAuthSecretName(providerId, method.id, field.id));
      if (value?.trim()) {
        return true;
      }
    }

    return false;
  }

  private async upsertAgentConfigEntry(
    configPath: string,
    config: OpenClawConfigFileJson,
    entry: SavedModelEntryState,
    model: string | { primary?: string; fallbacks?: string[] }
  ): Promise<void> {
    const list = [...(config.agents?.list ?? [])];
    const existingIndex = list.findIndex((item) => item.id === entry.agentId);

    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        id: entry.agentId,
        name: entry.label,
        agentDir: entry.agentDir,
        workspace: entry.workspaceDir,
        model
      };
    } else {
      list.push({
        id: entry.agentId,
        name: entry.label,
        agentDir: entry.agentDir,
        workspace: entry.workspaceDir,
        model
      });
    }

    config.agents = {
      ...config.agents,
      list
    };

    await this.writeOpenClawConfigSnapshot(configPath, config);
  }

  async install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    return this.runtimeLifecycleService.install(autoConfigure, options);
  }

  async installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    return this.runtimeLifecycleService.installDeploymentTarget(targetId);
  }

  async uninstall(): Promise<EngineActionResponse> {
    return this.runtimeLifecycleService.uninstall();
  }

  async uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    return this.runtimeLifecycleService.uninstallDeploymentTarget(targetId);
  }

  async restartGateway(): Promise<GatewayActionResponse> {
    return this.runtimeLifecycleService.restartGateway();
  }

  async configure(profileId: string): Promise<void> {
    const state = await readAdapterState();

    if (await resolveOpenClawCommand()) {
      await runOpenClaw(["config", "set", "chillclaw.defaultProfile", profileId], { allowFailure: true });
      await this.markGatewayApplyPending("ChillClaw saved profile configuration changes that still need to be applied through Gateway Manager.");
    }

    await writeAdapterState({
      ...state,
      configuredProfileId: profileId
    });
  }

  async status(): Promise<EngineStatus> {
    return this.runtimeLifecycleService.status();
  }

  async getDeploymentTargets(): Promise<DeploymentTargetsResponse> {
    return this.runtimeLifecycleService.getDeploymentTargets();
  }

  async updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    return this.runtimeLifecycleService.updateDeploymentTarget(targetId);
  }

  async healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]> {
    return this.runtimeLifecycleService.healthCheck(selectedProfileId);
  }

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    return this.runtimeLifecycleService.runTask(request);
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    return this.runtimeLifecycleService.update();
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    return this.runtimeLifecycleService.repair(action);
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    return this.runtimeLifecycleService.exportDiagnostics();
  }

  async getChannelState(channelId: SupportedChannelId): Promise<ChannelSetupState> {
    return this.channelsConfigCoordinator.getChannelState(channelId);
  }

  async getConfiguredChannelEntries(): Promise<ConfiguredChannelEntry[]> {
    return this.channelsConfigCoordinator.getConfiguredChannelEntries();
  }

  async getActiveChannelSession(): Promise<ChannelSession | undefined> {
    return this.channelsConfigCoordinator.getActiveChannelSession();
  }

  async getChannelSession(sessionId: string): Promise<ChannelSession> {
    return this.channelsConfigCoordinator.getChannelSession(sessionId);
  }

  private async restartGatewayAndRequireHealthy(reason: string): Promise<EngineStatus> {
    const restart = await runOpenClaw(["gateway", "restart"], { allowFailure: true });

    if (this.gatewayServiceNotLoaded(restart.stdout, restart.stderr)) {
      const install = await runOpenClaw(["gateway", "install", "--json"], { allowFailure: true });
      if (install.code !== 0 && !hasOnlyIgnorableOpenClawWarnings(install)) {
        throw new Error(
          install.stderr || install.stdout || `ChillClaw could not install the OpenClaw gateway service after ${reason}.`
        );
      }

      const start = await runOpenClaw(["gateway", "start"], { allowFailure: true });
      if (start.code !== 0 && !hasOnlyIgnorableOpenClawWarnings(start)) {
        throw new Error(
          start.stderr || start.stdout || `ChillClaw could not start the OpenClaw gateway service after ${reason}.`
        );
      }
    } else if (restart.code !== 0 && !hasOnlyIgnorableOpenClawWarnings(restart)) {
      throw new Error(restart.stderr || restart.stdout || `ChillClaw could not restart the OpenClaw gateway after ${reason}.`);
    }

    invalidateReadCache("engine:", "models:", "channels:", "plugins:", "skills:", "agents:", "command:version:", "command:update:");
    const status = await this.waitForGatewayReachable(reason);
    await this.clearGatewayApplyPending();
    return {
      ...status,
      pendingGatewayApply: false,
      pendingGatewayApplySummary: undefined
    };
  }

  private async waitForGatewayReachable(reason: string): Promise<EngineStatus> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const snapshot = await readEngineSnapshot({ fresh: true });

      if (snapshot.installed && isGatewayReachable(snapshot)) {
        return {
          engine: "openclaw",
          installed: true,
          running: true,
          version: snapshot.cliVersion,
          summary: gatewayReachabilitySummary(snapshot),
          lastCheckedAt: new Date().toISOString()
        };
      }

      await wait(500);
    }

    const snapshot = await readEngineSnapshot({ fresh: true });
    throw new Error(
      gatewayReachabilitySummary(snapshot) ||
        `ChillClaw restarted the OpenClaw gateway after ${reason}, but it is still not reachable.`
    );
  }

  private gatewayServiceNotLoaded(stdout?: string, stderr?: string): boolean {
    const output = `${stdout ?? ""}\n${stderr ?? ""}`.toLowerCase();
    return output.includes("gateway service not loaded");
  }

  private async collectStatusData(): Promise<{
    installed: boolean;
    cliVersion?: string;
    gatewayReachable: boolean;
    gatewayInstalled: boolean;
    gatewayDetail: string;
    providersMissingCount: number;
    providersMissingDetail: string;
    setupRequired: boolean;
    summary: string;
    securityFindings: SecurityFinding[];
  }> {
    const snapshot = await readEngineSnapshot();

    if (!snapshot.installed) {
      return {
        installed: false,
        cliVersion: undefined,
        gatewayReachable: false,
        gatewayInstalled: false,
        gatewayDetail: "OpenClaw CLI is missing.",
        providersMissingCount: 0,
        providersMissingDetail: "No provider status available.",
        setupRequired: true,
        summary: "OpenClaw is not installed.",
        securityFindings: []
      };
    }

    const cliVersion = snapshot.cliVersion;
    const statusJson = snapshot.statusJson;
    const gatewayJson = snapshot.gatewayJson;

    const gatewayReachable = isGatewayReachable(snapshot);
    const gatewayInstalled = Boolean(statusJson?.gatewayService?.installed || gatewayJson?.service?.installed);
    const setupRequired = Boolean(statusJson?.setup?.required);
    const providersMissingCount =
      statusJson?.providers?.summary?.missingProfiles ??
      statusJson?.providers?.missing?.length ??
      0;
    const providersMissingDetail =
      statusJson?.providers?.summary?.error ??
      (statusJson?.providers?.missing?.length
        ? `Missing provider profiles: ${statusJson.providers.missing.join(", ")}`
        : "Provider auth looks configured.");

    const gatewayDetail = gatewayReachabilitySummary(snapshot);

    const versionSummary = openClawVersionSummary(cliVersion);

    const summary = snapshot.installed
      ? gatewayReachable
        ? `OpenClaw is installed and the local gateway is reachable. ${versionSummary}`
        : `OpenClaw is installed, but the local gateway is not reachable. ${versionSummary}`
      : "OpenClaw is not installed.";

    return {
      installed: snapshot.installed,
      cliVersion,
      gatewayReachable,
      gatewayInstalled,
      gatewayDetail,
      providersMissingCount,
      providersMissingDetail,
      setupRequired,
      summary,
      securityFindings: statusJson?.securityAudit?.findings ?? []
    };
  }

  private async ensurePinnedOpenClaw(targetMode: "auto" | "system" | "managed-local"): Promise<BootstrapResult> {
    const usesManagedLocalRuntime = targetMode === "managed-local" || (targetMode === "auto" && Boolean(getAppRootDir()));
    const existingVersion = usesManagedLocalRuntime ? await readManagedOpenClawVersion() : await readSystemOpenClawVersion();
    const systemVersion = usesManagedLocalRuntime ? await readSystemOpenClawVersion() : existingVersion;
    const installPath = getManagedOpenClawDir();
    const brewCommand = await resolveBrewCommand();

    if (isOpenClawVersionCompatible(existingVersion)) {
      const reusedCommand = usesManagedLocalRuntime
        ? await resolveManagedOpenClawCommand({ fresh: true })
        : await resolveSystemOpenClawCommand({ fresh: true });
      const configChanged = await this.ensureChillClawGatewayConfigBaseline(reusedCommand);
      const gatewayNormalizationSuffix = configChanged
        ? " ChillClaw also reset the OpenClaw gateway to its local baseline on this Mac."
        : "";

      return {
        status: "reused-existing",
        changed: configChanged,
        hadExisting: true,
        existingVersion,
        version: existingVersion,
        message: usesManagedLocalRuntime
          ? `OpenClaw ${existingVersion} is already available in ChillClaw's managed local runtime.${gatewayNormalizationSuffix}`
          : OPENCLAW_VERSION_OVERRIDE
            ? `OpenClaw ${existingVersion} is already installed and meets ChillClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.${gatewayNormalizationSuffix}`
            : `OpenClaw ${existingVersion} is already installed and ready for ChillClaw.${gatewayNormalizationSuffix}`
      };
    }

    const npmInvocation = await resolveNpmInvocation();
    const ensuredNpmInvocation = npmInvocation ?? (await this.ensureSystemDependencies());

    if (!ensuredNpmInvocation) {
      throw new Error(
        brewCommand
          ? "ChillClaw asked Homebrew to prepare the required toolchain, but still could not find a working npm executable afterward."
          : existingVersion || systemVersion
            ? `ChillClaw found OpenClaw ${existingVersion ?? systemVersion}, but cannot deploy a managed local copy because neither npm nor Homebrew is available on this Mac.`
            : "ChillClaw cannot deploy OpenClaw locally because neither npm nor Homebrew is available on this Mac."
      );
    }

    if (usesManagedLocalRuntime) {
      await mkdir(installPath, { recursive: true });
    }

    const installArgs = usesManagedLocalRuntime
      ? ["install", "--prefix", installPath, OPENCLAW_PACKAGE_SPEC]
      : ["install", "--global", OPENCLAW_PACKAGE_SPEC];

    const installResult = await runCommand(
      ensuredNpmInvocation.command,
      [...ensuredNpmInvocation.argsPrefix, ...installArgs],
      { allowFailure: true }
    );

    if (installResult.code !== 0) {
      await writeErrorLog("OpenClaw install command failed.", {
        command: ensuredNpmInvocation.display,
        args: installArgs,
        result: installResult
      });
      throw new Error(installResult.stderr || installResult.stdout || "OpenClaw installation failed.");
    }

    const nextVersion = usesManagedLocalRuntime
      ? await readManagedOpenClawVersion({ fresh: true })
      : await readSystemOpenClawVersion({ fresh: true });

    if (!nextVersion || (OPENCLAW_VERSION_OVERRIDE && nextVersion !== OPENCLAW_VERSION_OVERRIDE)) {
      throw new Error(
        usesManagedLocalRuntime
          ? `ChillClaw downloaded OpenClaw into ${installPath}, but could not verify that the managed runtime can execute on this Mac.`
          : "ChillClaw installed OpenClaw, but could not verify the installed CLI."
      );
    }

    const installedCommand = usesManagedLocalRuntime
      ? await resolveManagedOpenClawCommand({ fresh: true })
      : await resolveSystemOpenClawCommand({ fresh: true });
    const configChanged = await this.ensureChillClawGatewayConfigBaseline(installedCommand);
    const gatewayNormalizationSuffix = configChanged
      ? " ChillClaw also reset the OpenClaw gateway to its local baseline on this Mac."
      : "";

    return {
      status: existingVersion || systemVersion ? "reinstalled" : "installed",
      changed: true,
      hadExisting: Boolean(existingVersion || systemVersion),
      existingVersion: existingVersion ?? systemVersion,
      version: nextVersion,
      message: usesManagedLocalRuntime
        ? existingVersion
          ? `ChillClaw refreshed its managed local OpenClaw ${nextVersion} runtime in ${installPath}.${gatewayNormalizationSuffix}`
          : systemVersion
            ? `ChillClaw deployed a managed local OpenClaw ${nextVersion} runtime into ${installPath} instead of depending on the system OpenClaw ${systemVersion}.${gatewayNormalizationSuffix}`
            : `ChillClaw deployed OpenClaw ${nextVersion} locally into ${installPath}.${gatewayNormalizationSuffix}`
        : existingVersion
          ? `Replaced existing OpenClaw ${existingVersion} with ${nextVersion}.${gatewayNormalizationSuffix}`
          : `Installed OpenClaw ${nextVersion}.${gatewayNormalizationSuffix}`
    };
  }

  private async resolveAgentArgs(): Promise<string[]> {
    const state = await this.ensureSavedModelState();
    const defaultEntry = state.modelEntries?.find((entry) => entry.id === state.defaultModelEntryId);

    if (defaultEntry?.agentId) {
      return ["--agent", defaultEntry.agentId];
    }

    const statusResult = await runOpenClaw(["status", "--json"], { allowFailure: true });
    const statusJson = safeJsonParse<OpenClawStatusJson>(statusResult.stdout);
    const defaultAgentId = statusJson?.agents?.defaultId;

    return defaultAgentId ? ["--agent", defaultAgentId] : [];
  }

  private async ensureSystemDependencies(): Promise<CommandInvocation | undefined> {
    const [nodeCommand, npmInvocation, gitCommand, brewCommand] = await Promise.all([
      resolveNodeCommand(),
      resolveNpmInvocation(),
      resolveGitCommand(),
      resolveBrewCommand()
    ]);

    const packages: string[] = [];

    if (!nodeCommand || !npmInvocation) {
      packages.push("node");
    }

    if (!gitCommand) {
      packages.push("git");
    }

    if (packages.length === 0) {
      return npmInvocation;
    }

    if (!brewCommand) {
      await writeErrorLog("ChillClaw could not install missing dependencies because Homebrew is unavailable.", {
        missingPackages: packages
      });
      return undefined;
    }

    const installResult = await runCommand(brewCommand, ["install", ...packages], { allowFailure: true });

    if (installResult.code !== 0) {
      await writeErrorLog("ChillClaw failed to install missing dependencies with Homebrew.", {
        command: brewCommand,
        args: ["install", ...packages],
        result: installResult
      });
      throw new Error(
        installResult.stderr ||
          installResult.stdout ||
          `ChillClaw could not install missing dependencies (${packages.join(", ")}) with Homebrew.`
      );
    }

    await writeInfoLog("ChillClaw installed missing system dependencies with Homebrew.", {
      command: brewCommand,
      packages
    });

    return resolveNpmInvocation();
  }
}
