import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, join, resolve } from "node:path";

import type {
  ChatMessage,
  ChatThreadDetail,
  BindAIMemberChannelRequest,
  BrainAssignment,
  SendChatMessageRequest,
  AbortChatRequest,
  DeleteAIMemberRequest,
  MemberBindingSummary,
  SupportedChannelId,
  ChannelSession,
  ChannelSessionInputRequest,
  ConfiguredChannelEntry,
  DeploymentTargetActionResponse,
  DeploymentTargetStatus,
  DeploymentTargetsResponse,
  EngineActionResponse,
  GatewayActionResponse,
  InstalledSkillDetail,
  InstallSkillRequest,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  ChannelSetupState,
  EngineCapabilities,
  EngineInstallSpec,
  ModelAuthSession,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelAuthMethod,
  ModelAuthRequest,
  ModelCatalogEntry,
  ModelConfigActionResponse,
  ModelConfigOverview,
  ModelProviderConfig,
  PluginConfigOverview,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SavedModelEntry,
  SetDefaultModelEntryRequest,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  SkillReadinessSummary,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  PairingApprovalRequest,
  RecoveryAction,
  RecoveryRunResponse,
  FeishuSetupRequest,
  TelegramSetupRequest,
  UpdateSkillRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";
import { writeMemberWorkspaceFiles } from "./member-workspace.js";
import { resolveReadableMemberAgentId } from "./member-agent-id.js";
import { OpenClawAIEmployeeManager } from "./openclaw-ai-employee-manager.js";
import { OpenClawConfigManager } from "./openclaw-config-manager.js";
import { OpenClawGatewayManager } from "./openclaw-gateway-manager.js";
import { OpenClawInstanceManager } from "./openclaw-instance-manager.js";
import { OpenClawPluginManager } from "./openclaw-plugin-manager.js";
import { appendGatewayApplyMessage, summarizePendingGatewayApply } from "./openclaw-shared.js";
import { type CommandResult, probeCommand as probeExternalCommand, resolveCommandFromPath as resolveCommandFromShellPath, runCommand as runExternalCommand } from "../platform/cli-runner.js";
import { createDefaultSecretsAdapter } from "../platform/macos-keychain-secrets-adapter.js";
import { OpenClawGatewaySocketAdapter, normalizeGatewaySocketUrl, readGatewayChatText } from "../platform/openclaw-gateway-socket-adapter.js";
import type { SecretsAdapter } from "../platform/secrets-adapter.js";
import {
  managedPluginConfigKeys,
  managedPluginDefinitionById,
  managedPluginDefinitionForFeature,
  listManagedPluginDefinitions
} from "../config/managed-plugins.js";

import type {
  AIEmployeeManager,
  ConfigManager,
  EngineAdapter,
  EngineChatLiveEvent,
  GatewayManager,
  InstanceManager
} from "./adapter.js";
import type {
  AIMemberRuntimeCandidate,
  AIMemberRuntimeRequest,
  AIMemberRuntimeState,
  PluginManager,
  SkillRuntimeCatalog,
  SkillRuntimeEntry
} from "./adapter.js";
import { getAppRootDir, getDataDir, getManagedOpenClawBinPath, getManagedOpenClawDir } from "../runtime-paths.js";
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

interface OpenClawAgentJson {
  ok?: boolean;
  output?: string;
  finalText?: string;
  response?: string;
  message?: string;
}

interface OpenClawChatHistoryJson {
  sessionKey?: string;
  sessionId?: string;
  messages?: OpenClawChatMessageJson[];
}

interface OpenClawChatMessageJson {
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
    thinking?: string;
  }>;
  timestamp?: number;
  provider?: string;
  model?: string;
  error?: string;
  errorMessage?: string;
  stopReason?: string;
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

interface OpenClawSkillInfoJson {
  name?: string;
  description?: string;
  source?: string;
  bundled?: boolean;
  filePath?: string;
  baseDir?: string;
  skillKey?: string;
  homepage?: string;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  eligible?: boolean;
  missing?: OpenClawSkillMissing;
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

  return Boolean(trimmed);
}

function isManagedModelAgentId(agentId: string | undefined): boolean {
  const trimmed = agentId?.trim();
  return Boolean(trimmed && trimmed.startsWith("slackclaw-model-"));
}

interface OpenClawAgentBindingJsonEntry {
  id?: string;
  bind?: string;
  target?: string;
  channel?: string;
  account?: string;
  route?: string;
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
const OPENCLAW_VERSION_OVERRIDE = process.env.SLACKCLAW_OPENCLAW_VERSION?.trim() || undefined;
const OPENCLAW_INSTALL_TARGET = OPENCLAW_VERSION_OVERRIDE ?? "latest";
const OPENCLAW_PACKAGE_SPEC = OPENCLAW_VERSION_OVERRIDE ? `openclaw@${OPENCLAW_VERSION_OVERRIDE}` : "openclaw@latest";
const FEISHU_BUNDLED_SINCE = "2026.3.7";
const OPENCLAW_MAIN_AGENT_ID = "main";
const OPENCLAW_INSTALL_DOCS_URL = "https://docs.openclaw.ai/install";
const OPENCLAW_MAC_DOCS_URL = "https://docs.openclaw.ai/mac/bun";
const SLACKCLAW_OPENCLAW_GATEWAY_MODE = "local";
const SLACKCLAW_OPENCLAW_GATEWAY_BIND = "loopback";
const SLACKCLAW_OPENCLAW_GATEWAY_AUTH_MODE = "token";
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

interface NpmManagedSystemOpenClaw {
  invocation: CommandInvocation;
  packageRoot: string;
}

interface LoginSessionState {
  channelId: "whatsapp" | "wechat";
  entryId: string;
  startedAt: string;
  status: "in-progress" | "awaiting-pairing" | "completed" | "failed";
  logs: string[];
  exitCode?: number;
  inputPrompt?: string;
  child?: ReturnType<typeof spawn>;
}

interface RuntimeModelAuthSession extends ModelAuthSession {
  child?: ReturnType<typeof spawn>;
  outputBuffer: string;
  setDefaultModel?: string;
  browserOpened: boolean;
  agentDir?: string;
  pendingEntry?: PendingSavedModelEntryOperation;
}

interface InternalModelAuthMethod extends ModelAuthMethod {
  loginProviderId?: string;
  loginMethodId?: string;
  onboardAuthChoice?: string;
  onboardFieldFlags?: Record<string, string>;
  tokenProviderId?: string;
  tokenProfileId?: string;
  setupTokenProvider?: string;
  specialCommand?: "login-github-copilot";
}

interface InternalModelProviderConfig extends Omit<ModelProviderConfig, "authMethods" | "configured" | "modelCount" | "sampleModels"> {
  authProviderId?: string;
  authMethods: InternalModelAuthMethod[];
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

let activeChannelLoginSession: LoginSessionState | undefined;
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
    await writeErrorLog("SlackClaw lost the live OpenClaw chat event bridge.", {
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
      readCache.delete(key);
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

  if (!options?.fresh && existing && existing.expiresAt > now) {
    return existing.promise as Promise<T>;
  }

  let promise: Promise<T>;
  promise = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (readCache.get(key)?.promise === promise) {
        readCache.delete(key);
      }
      throw error;
    });

  readCache.set(key, {
    expiresAt: now + ttlMs,
    promise
  });

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

const PROVIDER_DOCS_BASE = "https://docs.openclaw.ai/providers/docs";
const MODEL_PROVIDER_CONCEPTS_URL = "https://docs.openclaw.ai/concepts/model-providers";

const MODEL_PROVIDER_DEFINITIONS: InternalModelProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models through Anthropic.",
    docsUrl: `${PROVIDER_DOCS_BASE}/anthropic`,
    providerRefs: ["anthropic/"],
    authMethods: [
      {
        id: "anthropic-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste an Anthropic API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "anthropic-api-key",
        onboardFieldFlags: { apiKey: "--anthropic-api-key" }
      },
      {
        id: "anthropic-setup-token",
        label: "Paste setup-token",
        kind: "setup-token",
        description: "Paste a Claude setup-token from the documented Anthropic flow.",
        interactive: false,
        fields: [{ id: "token", label: "Setup-token", required: true, secret: true }],
        tokenProviderId: "anthropic",
        tokenProfileId: "anthropic:manual"
      },
      {
        id: "anthropic-setup-token-cli",
        label: "Claude CLI setup-token",
        kind: "setup-token",
        description: "Run the Claude CLI setup-token flow on this Mac.",
        interactive: true,
        fields: [],
        setupTokenProvider: "anthropic"
      }
    ]
  },
  {
    id: "amazon-bedrock",
    label: "Amazon Bedrock",
    description: "AWS Bedrock-hosted model catalog.",
    docsUrl: `${PROVIDER_DOCS_BASE}/amazon-bedrock`,
    providerRefs: ["amazon-bedrock/"],
    authMethods: [
      {
        id: "amazon-bedrock-login",
        label: "AWS credentials",
        kind: "local",
        description: "Use the Bedrock provider setup on this Mac. Make sure AWS credentials are already available locally.",
        interactive: true,
        fields: [],
        loginProviderId: "amazon-bedrock"
      }
    ]
  },
  {
    id: "byteplus",
    label: "BytePlus",
    description: "BytePlus-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/byteplus`,
    providerRefs: ["byteplus/", "byteplus-plan/"],
    authMethods: [
      {
        id: "byteplus-api-key",
        label: "BytePlus API Key",
        kind: "api-key",
        description: "Paste a BytePlus API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "byteplus-api-key",
        onboardFieldFlags: { apiKey: "--byteplus-api-key" }
      }
    ]
  },
  {
    id: "volcengine",
    label: "Volcano Engine",
    description: "Volcano Engine and Doubao-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/volcengine`,
    providerRefs: ["volcengine/", "volcengine-plan/"],
    authMethods: [
      {
        id: "volcengine-api-key",
        label: "Volcano Engine API Key",
        kind: "api-key",
        description: "Paste a Volcano Engine API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "volcengine-api-key",
        onboardFieldFlags: { apiKey: "--volcengine-api-key" }
      }
    ]
  },
  {
    id: "chutes",
    label: "Chutes",
    description: "Chutes-hosted provider configuration.",
    docsUrl: "https://docs.openclaw.ai/providers",
    providerRefs: ["chutes/"],
    authMethods: [
      {
        id: "chutes-login",
        label: "Chutes login",
        kind: "oauth",
        description: "Run the Chutes provider login flow through OpenClaw.",
        interactive: true,
        fields: [],
        loginProviderId: "chutes"
      }
    ]
  },
  {
    id: "cloudflare-ai-gateway",
    label: "Cloudflare AI Gateway",
    description: "OpenClaw through Cloudflare AI Gateway.",
    docsUrl: `${PROVIDER_DOCS_BASE}/cloudflare-ai-gateway`,
    providerRefs: ["cloudflare-ai-gateway/"],
    authMethods: [
      {
        id: "cloudflare-ai-gateway-api-key",
        label: "Gateway Credentials",
        kind: "api-key",
        description: "Use account ID, gateway ID, and API key.",
        interactive: false,
        fields: [
          { id: "accountId", label: "Account ID", required: true },
          { id: "gatewayId", label: "Gateway ID", required: true },
          { id: "apiKey", label: "API Key", required: true, secret: true }
        ],
        onboardAuthChoice: "cloudflare-ai-gateway-api-key",
        onboardFieldFlags: {
          accountId: "--cloudflare-ai-gateway-account-id",
          gatewayId: "--cloudflare-ai-gateway-gateway-id",
          apiKey: "--cloudflare-ai-gateway-api-key"
        }
      }
    ]
  },
  {
    id: "custom",
    label: "Custom Provider",
    description: "OpenAI-compatible or Anthropic-compatible custom endpoints.",
    docsUrl: `${PROVIDER_DOCS_BASE}/custom-providers`,
    providerRefs: ["custom/"],
    authMethods: [
      {
        id: "custom-api-key",
        label: "Custom Endpoint",
        kind: "custom",
        description: "Configure a custom base URL, model, and compatibility mode.",
        interactive: false,
        fields: [
          { id: "baseUrl", label: "Base URL", required: true, placeholder: "https://..." },
          { id: "modelId", label: "Model ID", required: true },
          { id: "compatibility", label: "Compatibility (openai|anthropic)", required: true, placeholder: "openai" },
          { id: "providerId", label: "Provider ID", required: false, placeholder: "custom-provider" },
          { id: "apiKey", label: "API Key", required: false, secret: true }
        ]
      }
    ]
  },
  {
    id: "gemini",
    label: "Google (Gemini / Vertex / CLI)",
    description: "Google Gemini, Google Vertex, Antigravity, and Gemini CLI model access.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["google/", "google-gemini-cli/", "google-antigravity/", "google-vertex/"],
    authMethods: [
      {
        id: "gemini-api-key",
        label: "Gemini API Key",
        kind: "api-key",
        description: "Paste a Gemini API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "gemini-api-key",
        onboardFieldFlags: { apiKey: "--gemini-api-key" }
      },
      {
        id: "google-gemini-cli",
        label: "Google Gemini CLI",
        kind: "oauth",
        description: "Run the Google Gemini CLI login flow documented by OpenClaw.",
        interactive: true,
        fields: [],
        loginProviderId: "google-gemini-cli"
      }
    ]
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    description: "Copilot-based model access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/github-copilot`,
    providerRefs: ["github-copilot/"],
    authMethods: [
      {
        id: "github-copilot-device",
        label: "GitHub Device Flow",
        kind: "oauth",
        description: "Login with GitHub Copilot using the device flow.",
        interactive: true,
        fields: [],
        specialCommand: "login-github-copilot"
      }
    ]
  },
  {
    id: "huggingface",
    label: "Hugging Face Inference",
    description: "Hugging Face Inference token-based model access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/hugging-face`,
    providerRefs: ["huggingface/"],
    authMethods: [
      {
        id: "huggingface-api-key",
        label: "HF Token",
        kind: "api-key",
        description: "Paste a Hugging Face token.",
        interactive: false,
        fields: [{ id: "apiKey", label: "Token", required: true, secret: true }],
        onboardAuthChoice: "huggingface-api-key",
        onboardFieldFlags: { apiKey: "--huggingface-api-key" }
      }
    ]
  },
  {
    id: "kilocode",
    label: "Kilo Gateway",
    description: "Kilo Gateway hosted provider.",
    docsUrl: `${PROVIDER_DOCS_BASE}/kilo-gateway`,
    providerRefs: ["kilocode/"],
    authMethods: [
      {
        id: "kilocode-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Kilo Gateway API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "kilocode-api-key",
        onboardFieldFlags: { apiKey: "--kilocode-api-key" }
      }
    ]
  },
  {
    id: "kimi-code",
    label: "Kimi Coding",
    description: "Kimi Coding model access through Moonshot AI.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["kimi-coding/"],
    authMethods: [
      {
        id: "kimi-code-api-key",
        label: "Kimi Coding API Key",
        kind: "api-key",
        description: "Paste a Kimi Coding API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "kimi-code-api-key",
        onboardFieldFlags: { apiKey: "--kimi-code-api-key" }
      }
    ]
  },
  {
    id: "moonshot",
    label: "Moonshot AI",
    description: "Moonshot AI hosted models, including Kimi family access.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["moonshot/", "moonshotai/"],
    authMethods: [
      {
        id: "moonshot-api-key",
        label: "Moonshot API Key",
        kind: "api-key",
        description: "Paste a Moonshot API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "moonshot-api-key",
        onboardFieldFlags: { apiKey: "--moonshot-api-key" }
      },
      {
        id: "moonshot-api-key-cn",
        label: "Moonshot CN API Key",
        kind: "api-key",
        description: "Paste a Moonshot China-region API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "moonshot-api-key-cn",
        onboardFieldFlags: { apiKey: "--moonshot-api-key" }
      }
    ]
  },
  {
    id: "litellm",
    label: "LiteLLM",
    description: "LiteLLM proxy or gateway.",
    docsUrl: `${PROVIDER_DOCS_BASE}/litellm`,
    providerRefs: ["litellm/"],
    authMethods: [
      {
        id: "litellm-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a LiteLLM API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "litellm-api-key",
        onboardFieldFlags: { apiKey: "--litellm-api-key" }
      }
    ]
  },
  {
    id: "minimax",
    label: "MiniMax",
    description: "MiniMax cloud and portal auth flows.",
    docsUrl: `${PROVIDER_DOCS_BASE}/minimax`,
    providerRefs: ["minimax/", "minimax-cn/"],
    authMethods: [
      {
        id: "minimax-api",
        label: "MiniMax API Key",
        kind: "api-key",
        description: "Paste a MiniMax API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-api",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-api-key-cn",
        label: "MiniMax CN API Key",
        kind: "api-key",
        description: "Paste a MiniMax China-region API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-api-key-cn",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-api-lightning",
        label: "MiniMax Lightning",
        kind: "api-key",
        description: "Use the MiniMax Lightning auth flow documented by OpenClaw.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-api-lightning",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-portal",
        label: "MiniMax Portal",
        kind: "oauth",
        description: "Run the MiniMax portal login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "minimax-portal"
      },
      {
        id: "minimax-cloud",
        label: "MiniMax Cloud",
        kind: "oauth",
        description: "Run the MiniMax cloud login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "minimax-cloud"
      }
    ]
  },
  {
    id: "mistral",
    label: "Mistral",
    description: "Mistral-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/mistral`,
    providerRefs: ["mistral/"],
    authMethods: [
      {
        id: "mistral-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Mistral API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "mistral-api-key",
        onboardFieldFlags: { apiKey: "--mistral-api-key" }
      }
    ]
  },
  {
    id: "modelstudio",
    label: "Model Studio (Qwen)",
    description: "Alibaba Cloud Model Studio and Qwen-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/modelstudio`,
    providerRefs: ["modelstudio/"],
    authMethods: [
      {
        id: "modelstudio-api-key-cn",
        label: "Model Studio CN API Key",
        kind: "api-key",
        description: "Paste an Alibaba Cloud Model Studio China-region API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "modelstudio-api-key-cn",
        onboardFieldFlags: { apiKey: "--modelstudio-api-key-cn" }
      },
      {
        id: "modelstudio-api-key",
        label: "Model Studio API Key",
        kind: "api-key",
        description: "Paste an Alibaba Cloud Model Studio API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "modelstudio-api-key",
        onboardFieldFlags: { apiKey: "--modelstudio-api-key" }
      }
    ]
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    description: "NVIDIA-hosted model access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/nvidia`,
    providerRefs: ["nvidia/"],
    authMethods: [
      {
        id: "nvidia-login",
        label: "NVIDIA Provider Login",
        kind: "oauth",
        description: "Run the NVIDIA provider login flow through OpenClaw.",
        interactive: true,
        fields: [],
        loginProviderId: "nvidia"
      }
    ]
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local Ollama runtime.",
    docsUrl: `${PROVIDER_DOCS_BASE}/ollama`,
    providerRefs: ["ollama/"],
    authMethods: [
      {
        id: "ollama-local",
        label: "Local Runtime",
        kind: "local",
        description: "Use the local Ollama runtime on this Mac.",
        interactive: true,
        fields: [],
        loginProviderId: "ollama"
      }
    ]
  },
  {
    id: "opencode-zen",
    label: "OpenCode (Zen + Go)",
    description: "OpenCode Zen and OpenCode Go providers.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["opencode/", "opencode-zen/", "opencode-go/"],
    authMethods: [
      {
        id: "opencode-zen",
        label: "OpenCode Zen",
        kind: "api-key",
        description: "Paste an OpenCode Zen API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "opencode-zen",
        onboardFieldFlags: { apiKey: "--opencode-zen-api-key" }
      }
    ]
  },
  {
    id: "openai",
    label: "OpenAI (API + Codex)",
    description: "OpenAI GPT models and the OpenAI Codex login flow.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["openai/", "openai-codex/"],
    authMethods: [
      {
        id: "openai-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste an OpenAI API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "openai-api-key",
        onboardFieldFlags: { apiKey: "--openai-api-key" }
      },
      {
        id: "openai-codex",
        label: "OpenAI Codex OAuth",
        kind: "oauth",
        description: "Run the OpenAI Codex login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "openai-codex"
      }
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "OpenRouter-hosted provider catalog.",
    docsUrl: `${PROVIDER_DOCS_BASE}/openrouter`,
    providerRefs: ["openrouter/"],
    authMethods: [
      {
        id: "openrouter-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste an OpenRouter API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "openrouter-api-key",
        onboardFieldFlags: { apiKey: "--openrouter-api-key" }
      }
    ]
  },
  {
    id: "qianfan",
    label: "Qianfan",
    description: "Baidu Qianfan hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/qianfan`,
    providerRefs: ["qianfan/"],
    authMethods: [
      {
        id: "qianfan-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Qianfan API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "qianfan-api-key",
        onboardFieldFlags: { apiKey: "--qianfan-api-key" }
      }
    ]
  },
  {
    id: "qwen",
    label: "Qwen (OAuth)",
    description: "Qwen OAuth and portal-based access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/qwen`,
    providerRefs: ["qwen/", "qwen-portal/"],
    authMethods: [
      {
        id: "qwen-portal",
        label: "Qwen Portal",
        kind: "oauth",
        description: "Run the Qwen portal login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "qwen-portal"
      }
    ]
  },
  {
    id: "synthetic",
    label: "Synthetic",
    description: "Synthetic-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/synthetic`,
    providerRefs: ["synthetic/"],
    authMethods: [
      {
        id: "synthetic-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Synthetic API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "synthetic-api-key",
        onboardFieldFlags: { apiKey: "--synthetic-api-key" }
      }
    ]
  },
  {
    id: "together",
    label: "Together AI",
    description: "Together AI hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/together`,
    providerRefs: ["together/"],
    authMethods: [
      {
        id: "together-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Together AI API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "together-api-key",
        onboardFieldFlags: { apiKey: "--together-api-key" }
      }
    ]
  },
  {
    id: "vercel-ai-gateway",
    label: "Vercel AI Gateway",
    description: "Vercel AI Gateway model access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/vercel-ai-gateway`,
    providerRefs: ["vercel-ai-gateway/"],
    authMethods: [
      {
        id: "ai-gateway-api-key",
        label: "Gateway API Key",
        kind: "api-key",
        description: "Paste a Vercel AI Gateway API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "ai-gateway-api-key",
        onboardFieldFlags: { apiKey: "--ai-gateway-api-key" }
      }
    ]
  },
  {
    id: "venice",
    label: "Venice AI",
    description: "Venice AI-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/venice`,
    providerRefs: ["venice/"],
    authMethods: [
      {
        id: "venice-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Venice API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "venice-api-key",
        onboardFieldFlags: { apiKey: "--venice-api-key" }
      }
    ]
  },
  {
    id: "vllm",
    label: "vLLM",
    description: "Local or remote vLLM runtime.",
    docsUrl: `${PROVIDER_DOCS_BASE}/vllm`,
    providerRefs: ["vllm/"],
    authMethods: [
      {
        id: "vllm",
        label: "vLLM Runtime",
        kind: "local",
        description: "Connect to a local or network vLLM runtime.",
        interactive: true,
        fields: [],
        loginProviderId: "vllm"
      }
    ]
  },
  {
    id: "xai",
    label: "xAI",
    description: "Grok and xAI model catalog.",
    docsUrl: "https://docs.openclaw.ai/providers",
    providerRefs: ["xai/"],
    authMethods: [
      {
        id: "xai-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste an xAI API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "xai-api-key",
        onboardFieldFlags: { apiKey: "--xai-api-key" }
      }
    ]
  },
  {
    id: "xiaomi",
    label: "Xiaomi MiMo",
    description: "Xiaomi MiMo-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/xiaomi`,
    providerRefs: ["xiaomi/"],
    authMethods: [
      {
        id: "xiaomi-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Xiaomi API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "xiaomi-api-key",
        onboardFieldFlags: { apiKey: "--xiaomi-api-key" }
      }
    ]
  },
  {
    id: "zai",
    label: "Z.AI (GLM)",
    description: "Z.AI and GLM model catalog.",
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["zai/"],
    authMethods: [
      {
        id: "zai-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Z.AI API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "zai-api-key",
        onboardFieldFlags: { apiKey: "--zai-api-key" }
      },
      {
        id: "zai-global",
        label: "Z.AI Global",
        kind: "oauth",
        description: "Run the Z.AI global login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-global"
      },
      {
        id: "zai-cn",
        label: "Z.AI CN",
        kind: "oauth",
        description: "Run the Z.AI China login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-cn"
      },
      {
        id: "zai-coding-global",
        label: "Z.AI Coding Global",
        kind: "oauth",
        description: "Run the Z.AI Coding global login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-coding-global"
      },
      {
        id: "zai-coding-cn",
        label: "Z.AI Coding CN",
        kind: "oauth",
        description: "Run the Z.AI Coding China login flow.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-coding-cn"
      }
    ]
  }
];

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

function toInstallDisposition(
  bootstrapStatus: BootstrapResult["status"],
  mode: "detected" | "onboarded"
): InstallResponse["disposition"] {
  if (mode === "onboarded") {
    return "onboarded";
  }

  if (bootstrapStatus === "reused-existing" || bootstrapStatus === "installed" || bootstrapStatus === "reinstalled") {
    return bootstrapStatus;
  }

  return "installed";
}

function createChannelState(id: SupportedChannelId, overrides: Partial<ChannelSetupState>): ChannelSetupState {
  const defaults: Record<SupportedChannelId, ChannelSetupState> = {
    telegram: {
      id: "telegram",
      title: "Telegram",
      officialSupport: true,
      status: "not-started",
      summary: "Telegram setup has not started yet.",
      detail: "Add a bot token, then approve the first pairing request."
    },
    whatsapp: {
      id: "whatsapp",
      title: "WhatsApp",
      officialSupport: true,
      status: "not-started",
      summary: "WhatsApp setup has not started yet.",
      detail: "Start the login flow, scan the QR, then approve the pairing request."
    },
    feishu: {
      id: "feishu",
      title: "Feishu (飞书)",
      officialSupport: true,
      status: "not-started",
      summary: "Feishu bot setup has not started yet.",
      detail: "Install the official Feishu plugin, save the app credentials, restart the gateway, enable long connection, then publish the app and approve pairing."
    },
    "wechat-work": {
      id: "wechat-work",
      title: "WeChat Work (WeCom)",
      officialSupport: true,
      status: "not-started",
      summary: "WeChat Work setup has not started yet.",
      detail: "Install the managed WeCom plugin, save the bot credentials, then apply the pending gateway changes."
    },
    wechat: {
      id: "wechat",
      title: "WeChat",
      officialSupport: false,
      status: "not-started",
      summary: "WeChat setup has not started yet.",
      detail: "Complete the QR-first WeChat login flow when that guided path is available."
    }
  };

  return {
    ...defaults[id],
    ...overrides,
    lastUpdatedAt: overrides.lastUpdatedAt ?? new Date().toISOString()
  };
}

function sessionTitle(channelId: "whatsapp" | "wechat"): string {
  return channelId === "whatsapp" ? "WhatsApp" : "WeChat";
}

function sessionRunningMessage(channelId: "whatsapp" | "wechat"): string {
  return `${sessionTitle(channelId)} login is running.`;
}

function sessionCompletedMessage(channelId: "whatsapp" | "wechat"): string {
  return `${sessionTitle(channelId)} login completed.`;
}

function sessionFailedMessage(channelId: "whatsapp" | "wechat"): string {
  return `${sessionTitle(channelId)} login failed.`;
}

function sessionAwaitingMessage(session: LoginSessionState): string {
  if (session.channelId === "whatsapp") {
    return "WhatsApp login is waiting for pairing approval.";
  }

  return session.inputPrompt ? "WeChat login is waiting for follow-up input." : "WeChat login is waiting for QR confirmation.";
}

function activeChannelSession(): ChannelSession | undefined {
  if (!activeChannelLoginSession) {
    return undefined;
  }

  return {
    id: `${activeChannelLoginSession.entryId}:login`,
    channelId: activeChannelLoginSession.channelId,
    entryId: activeChannelLoginSession.entryId,
    status:
      activeChannelLoginSession.status === "in-progress"
        ? "running"
        : activeChannelLoginSession.status === "awaiting-pairing"
          ? activeChannelLoginSession.inputPrompt
            ? "awaiting-input"
            : "running"
          : activeChannelLoginSession.status,
    message:
      activeChannelLoginSession.status === "failed"
        ? sessionFailedMessage(activeChannelLoginSession.channelId)
        : activeChannelLoginSession.status === "completed"
          ? sessionCompletedMessage(activeChannelLoginSession.channelId)
          : activeChannelLoginSession.status === "awaiting-pairing"
            ? sessionAwaitingMessage(activeChannelLoginSession)
            : sessionRunningMessage(activeChannelLoginSession.channelId),
    logs: activeChannelLoginSession.logs.slice(-40),
    inputPrompt: activeChannelLoginSession.status === "awaiting-pairing" ? activeChannelLoginSession.inputPrompt : undefined
  };
}

function channelIdFromEntryId(entryId: string): SupportedChannelId {
  const [channelId] = entryId.split(":");

  if (channelId === "telegram" || channelId === "whatsapp" || channelId === "feishu" || channelId === "wechat-work" || channelId === "wechat") {
    return channelId;
  }

  throw new Error(`Unsupported channel entry id: ${entryId}`);
}

function runtimeChannelKeys(channelId: SupportedChannelId): string[] {
  switch (channelId) {
    case "wechat-work":
      return ["wechat-work", "wechat"];
    case "wechat":
      return [];
    default:
      return [channelId];
  }
}

function normalizeRuntimeChannelId(channelId: string): SupportedChannelId | undefined {
  if (channelId === "wechat") {
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
      await writeErrorLog("Failed to spawn system command for SlackClaw.", {
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
  return resolveCommandFromShellPath(command, {
    env: buildCommandEnv()
  });
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

async function resolveNpmManagedSystemOpenClaw(
  systemCommand: string | undefined,
  npmInvocation: CommandInvocation | undefined
): Promise<NpmManagedSystemOpenClaw | undefined> {
  if (!systemCommand || !npmInvocation) {
    return undefined;
  }

  const [prefix, root] = await Promise.all([
    readInvocationStdout(npmInvocation, ["prefix", "--global"]),
    readInvocationStdout(npmInvocation, ["root", "--global"])
  ]);
  const packageRoot = root ? resolve(root, "openclaw") : undefined;
  const packageInstalled = packageRoot ? await fileExists(packageRoot) : false;

  if (!isGlobalNpmManagedOpenClawCommand(systemCommand, prefix, root, packageInstalled) || !packageRoot) {
    return undefined;
  }

  return {
    invocation: npmInvocation,
    packageRoot
  };
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
    return `OpenClaw ${version} is installed. SlackClaw uses the latest available version for new installs.`;
  }

  return isOpenClawVersionCompatible(version)
    ? `OpenClaw ${version} meets SlackClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
    : `OpenClaw ${version} is older than SlackClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`;
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
        ? `SlackClaw could not fully confirm update availability, but the latest registry version appears to be ${latestVersion}.`
        : `SlackClaw could not check for updates: ${parsed.update.registry.error}.`
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

        return summarizeTargetUpdateStatus(parsed, result.stderr || result.stdout || "SlackClaw could not check for updates.");
      }

      return {
        updateAvailable: false,
        summary: "SlackClaw could not check for updates."
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

function readChatText(message: OpenClawChatMessageJson): string {
  return readGatewayChatText(message);
}

function toVisibleChatRole(role: string | undefined): ChatMessage["role"] | undefined {
  if (role === "user" || role === "assistant") {
    return role;
  }

  return undefined;
}

function toChatMessageId(message: OpenClawChatMessageJson, index: number): string {
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : index;
  return `${message.role ?? "message"}-${timestamp}-${index}`;
}

function toChatMessage(message: OpenClawChatMessageJson, index: number): ChatMessage | undefined {
  const role = toVisibleChatRole(message.role);
  if (!role) {
    return undefined;
  }

  const error = message.errorMessage?.trim() || message.error?.trim();
  const text = readChatText(message) || (error && message.role === "assistant" ? error : "");
  if (!text) {
    return undefined;
  }

  return {
    id: toChatMessageId(message, index),
    role,
    text,
    timestamp: typeof message.timestamp === "number" ? new Date(message.timestamp).toISOString() : undefined,
    provider: message.provider,
    model: message.model,
    status: error || message.stopReason === "error" ? "failed" : "sent",
    error
  };
}

function collapseVisibleChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.reduce<ChatMessage[]>((collapsed, message) => {
    const previous = collapsed[collapsed.length - 1];
    if (!previous || previous.role !== "assistant" || message.role !== "assistant") {
      collapsed.push(message);
      return collapsed;
    }

    const previousText = previous.text.trim();
    const nextText = message.text.trim();
    const mergedText =
      previousText && nextText && previousText !== nextText
        ? `${previous.text}\n\n${message.text}`
        : previousText
          ? previous.text
          : message.text;

    collapsed[collapsed.length - 1] = {
      ...previous,
      ...message,
      id: previous.id,
      text: mergedText
    };
    return collapsed;
  }, []);
}

function normalizeSkillMissing(missing?: OpenClawSkillMissing): SkillRuntimeEntry["missing"] {
  return {
    bins: missing?.bins ?? [],
    anyBins: missing?.anyBins ?? [],
    env: missing?.env ?? [],
    config: missing?.config ?? [],
    os: missing?.os ?? []
  };
}

function parseSkillFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");

  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const result: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === "---") {
      break;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    result[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }

  return result;
}

function stripSkillFrontmatter(content: string): string {
  if (!content.startsWith("---")) {
    return content.trim();
  }

  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return content.trim();
  }

  return content.slice(end + 4).trim();
}

function slugifySkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCustomSkillMarkdown(
  request: SaveCustomSkillRequest,
  slug: string,
  version = "0.1.0"
): string {
  const lines = [
    "---",
    `name: "${request.name.replace(/"/g, '\\"')}"`,
    `slug: ${slug}`,
    `version: "${version}"`,
    ...(request.homepage?.trim() ? [`homepage: ${request.homepage.trim()}`] : []),
    `description: "${request.description.replace(/"/g, '\\"')}"`,
    "---",
    "",
    "## When to Use",
    "",
    request.description.trim() || "Use this skill when the user needs the workflow described here.",
    "",
    "## Instructions",
    "",
    request.instructions.trim() || "Add the skill-specific instructions here."
  ];

  return `${lines.join("\n").trim()}\n`;
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

function isUsableManagedSkillEntry(entry: SkillRuntimeEntry | undefined): entry is SkillRuntimeEntry {
  return Boolean(entry && entry.eligible && !entry.disabled && !entry.blockedByAllowlist);
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

function toSkillReadinessSummary(
  skills: SkillRuntimeEntry[],
  warnings: string[]
): SkillReadinessSummary {
  const disabled = skills.filter((skill) => skill.disabled).length;
  const blocked = skills.filter((skill) => skill.blockedByAllowlist).length;
  const missing = skills.filter((skill) => !skill.eligible && !skill.disabled && !skill.blockedByAllowlist).length;
  const eligible = skills.filter((skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist).length;

  return {
    total: skills.length,
    eligible,
    disabled,
    blocked,
    missing,
    warnings,
    summary: `${eligible} ready · ${missing} missing requirements${warnings.length > 0 ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`
  };
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

function toPublicAuthMethod(method: InternalModelAuthMethod): ModelAuthMethod {
  return {
    id: method.id,
    label: method.label,
    kind: method.kind,
    description: method.description,
    interactive: method.interactive,
    fields: method.fields
  };
}

function buildBaseOnboardArgs(): string[] {
  return [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--flow",
    "quickstart",
    "--mode",
    "local",
    "--skip-channels",
    "--skip-search",
    "--skip-skills",
    "--skip-ui",
    "--skip-health",
    "--skip-daemon"
  ];
}

function buildOnboardAuthArgs(method: InternalModelAuthMethod, values: Record<string, string>): string[] {
  if (!method.onboardAuthChoice) {
    throw new Error(`SlackClaw does not have a non-interactive onboarding flow for ${method.label}.`);
  }

  const args = [...buildBaseOnboardArgs(), "--auth-choice", method.onboardAuthChoice];

  if (method.onboardFieldFlags) {
    for (const [fieldId, flag] of Object.entries(method.onboardFieldFlags)) {
      const value = values[fieldId]?.trim();
      if (!value) {
        throw new Error(`Enter ${fieldId} for ${method.label} first.`);
      }
      args.push(flag, value);
    }
  }

  return args;
}

function buildModelsCommandArgs(args: string[], agentId?: string): string[] {
  return agentId ? ["models", "--agent", agentId, ...args] : ["models", ...args];
}

function resolveTokenAuthProvider(provider: InternalModelProviderConfig, method: InternalModelAuthMethod): string {
  return method.tokenProviderId ?? method.loginProviderId ?? provider.authProviderId ?? provider.id;
}

function canUseTokenPasteAuth(method: InternalModelAuthMethod): boolean {
  // Single-secret provider auth maps cleanly onto `openclaw models auth paste-token`.
  return method.kind === "api-key" && method.fields.length === 1;
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
      ? "SlackClaw opened the provider sign-in page in your browser. Finish sign-in there."
      : "SlackClaw is starting the OpenClaw authentication flow.";
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
    "SlackClaw could not determine gateway reachability."
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
      const supplemental = collectSupplementalModelRefs(status, activeConfig);

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

function generateSlackClawGatewayToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizeOpenClawGatewayConfigForSlackClaw(config: OpenClawConfigFileJson): {
  changed: boolean;
  config: OpenClawConfigFileJson;
} {
  const currentGateway = config.gateway ?? {};
  const currentAuth = currentGateway.auth ?? {};
  const trimmedToken = currentAuth.token?.trim();
  const nextAuth: NonNullable<OpenClawConfigFileJson["gateway"]>["auth"] = {
    ...currentAuth,
    mode: SLACKCLAW_OPENCLAW_GATEWAY_AUTH_MODE,
    token: trimmedToken || generateSlackClawGatewayToken()
  };

  if ("password" in nextAuth) {
    delete nextAuth.password;
  }

  const nextGateway: NonNullable<OpenClawConfigFileJson["gateway"]> = {
    ...currentGateway,
    mode: SLACKCLAW_OPENCLAW_GATEWAY_MODE,
    bind: SLACKCLAW_OPENCLAW_GATEWAY_BIND,
    auth: nextAuth
  };

  if ("remote" in nextGateway) {
    delete nextGateway.remote;
  }

  const changed =
    currentGateway.mode !== SLACKCLAW_OPENCLAW_GATEWAY_MODE ||
    currentGateway.bind !== SLACKCLAW_OPENCLAW_GATEWAY_BIND ||
    currentAuth.mode !== SLACKCLAW_OPENCLAW_GATEWAY_AUTH_MODE ||
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

function getManagedModelAgentPaths(entryId: string): { rootDir: string; agentDir: string; workspaceDir: string } {
  const rootDir = resolve(getDataDir(), "model-agents", entryId);

  return {
    rootDir,
    agentDir: resolve(rootDir, "agent"),
    workspaceDir: resolve(rootDir, "workspace")
  };
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

function removeProfileIdsFromConfig(config: OpenClawConfigFileJson, profileIds: string[]): void {
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

async function removeProfileIdsFromAuthStore(agentDir: string | undefined, profileIds: string[]): Promise<void> {
  if (!agentDir || profileIds.length === 0) {
    return;
  }

  const store = await readAuthStore(agentDir);
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

  await writeAuthStore(agentDir, store);
}

function providerDefinitionById(providerId: string): InternalModelProviderConfig | undefined {
  return MODEL_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
}

function providerDefinitionByModelKey(modelKey: string): InternalModelProviderConfig | undefined {
  return MODEL_PROVIDER_DEFINITIONS.find((provider) =>
    provider.providerRefs.some((prefix) => modelKey.startsWith(prefix))
  );
}

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
  const orderedConfiguredModels = orderedRuntimeModels(configuredModels, defaultModel);
  const entriesByModelKey = new Map<string, SavedModelEntryState[]>();
  const usedEntryIds = new Set<string>();

  for (const entry of entries) {
    const existing = entriesByModelKey.get(entry.modelKey) ?? [];
    existing.push(entry);
    entriesByModelKey.set(entry.modelKey, existing);
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
  const allEntries = [...entries];

  for (const entry of activeEntries) {
    if (!allEntries.some((item) => item.id === entry.id)) {
      allEntries.push(entry);
    }
  }

  return {
    entries: allEntries.map((entry) => ({
      ...entry,
      isDefault: entry.id === defaultEntryId,
      isFallback: fallbackEntryIds.includes(entry.id)
    })),
    defaultEntryId,
    fallbackEntryIds
  };
}

function isRuntimeModelRole(request: SaveModelEntryRequest): boolean {
  return Boolean(request.makeDefault || request.useAsFallback);
}

function hasProvidedModelAuthValues(request: SaveModelEntryRequest): boolean {
  return Object.values(request.values ?? {}).some((value) => value.trim().length > 0);
}

function requiresInteractiveModelAuth(method: InternalModelAuthMethod): boolean {
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
  method: InternalModelAuthMethod
): boolean {
  if (isRuntimeModelRole(request)) {
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

function describeProfileLabel(profileId: string, profile: Record<string, unknown> & { email?: string; accountId?: string }): string {
  if (profile.email?.trim()) {
    return profile.email.trim();
  }

  if (profile.accountId?.trim()) {
    return profile.accountId.trim();
  }

  const suffixIndex = profileId.indexOf(":");
  return suffixIndex >= 0 ? profileId.slice(suffixIndex + 1) : profileId;
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

function normalizeBindingTarget(entry: string | OpenClawAgentBindingJsonEntry): MemberBindingSummary | undefined {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed ? { id: trimmed, target: trimmed } : undefined;
  }

  const target =
    entry.target?.trim() ||
    entry.bind?.trim() ||
    [entry.channel?.trim(), entry.account?.trim()].filter(Boolean).join(":") ||
    entry.route?.trim();

  if (!target) {
    return undefined;
  }

  return {
    id: entry.id?.trim() || target,
    target
  };
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

  for (const ref of refs) {
    const current = byKey.get(ref);
    const tags = new Set(current?.tags ?? []);

    if (options?.defaultModel === ref) {
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

  return createChannelState(channelId, {
    status: "completed",
    summary: `${channelId === "feishu" ? "Feishu" : channelId === "wechat-work" ? "WeChat Work" : "WeChat"} is configured in OpenClaw.`,
    detail: "SlackClaw detected an existing configuration from the installed OpenClaw runtime."
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
    providers: MODEL_PROVIDER_DEFINITIONS.map((provider) => {
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

function createTaskTitle(request: EngineTaskRequest): string {
  if (request.templateId) {
    return `Run ${request.templateId}`;
  }

  return request.prompt.length > 36 ? `${request.prompt.slice(0, 36)}...` : request.prompt;
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

  constructor(private readonly secrets: SecretsAdapter = createDefaultSecretsAdapter()) {
    this.instances = new OpenClawInstanceManager(this);
    this.config = new OpenClawConfigManager({
      getModelConfig: () => this.getModelConfig(),
      createSavedModelEntry: (request) => this.createSavedModelEntry(request),
      updateSavedModelEntry: (entryId, request) => this.updateSavedModelEntry(entryId, request),
      removeSavedModelEntry: (entryId) => this.removeSavedModelEntry(entryId),
      setDefaultModelEntry: (request) => this.setDefaultModelEntry(request),
      replaceFallbackModelEntries: (request) => this.replaceFallbackModelEntries(request),
      authenticateModelProvider: (request) => this.authenticateModelProvider(request),
      getModelAuthSession: (sessionId) => this.getModelAuthSession(sessionId),
      submitModelAuthSessionInput: (sessionId, request) => this.submitModelAuthSessionInput(sessionId, request),
      setDefaultModel: (modelKey) => this.setDefaultModel(modelKey),
      getChannelState: (channelId) => this.getChannelState(channelId),
      getConfiguredChannelEntries: () => this.getConfiguredChannelEntries(),
      saveChannelEntry: (request) => this.saveChannelEntry(request),
      removeChannelEntry: (request) => this.removeChannelEntry(request),
      getSkillRuntimeCatalog: () => this.getSkillRuntimeCatalog(),
      getInstalledSkillDetail: (skillId) => this.getInstalledSkillDetail(skillId),
      listMarketplaceInstalledSkills: () => this.listMarketplaceInstalledSkills(),
      exploreSkillMarketplace: (limit) => this.exploreSkillMarketplace(limit),
      searchSkillMarketplace: (query, limit) => this.searchSkillMarketplace(query, limit),
      getSkillMarketplaceDetail: (slug) => this.getSkillMarketplaceDetail(slug),
      installMarketplaceSkill: (request) => this.installMarketplaceSkill(request),
      updateMarketplaceSkill: (slug, request) => this.updateMarketplaceSkill(slug, request),
      saveCustomSkill: (skillId, request) => this.saveCustomSkill(skillId, request),
      removeInstalledSkill: (slug, request) => this.removeInstalledSkill(slug, request),
      installManagedSkill: (request) => this.installManagedSkill(request),
      verifyManagedSkill: (slug) => this.verifyManagedSkill(slug)
    }, {
      secrets: this.secrets,
      resolveModelAuthSecretFieldIds: (providerId, methodId) =>
        providerDefinitionById(providerId)?.authMethods.find((item) => item.id === methodId)?.fields
          .filter((field) => field.secret === true)
          .map((field) => field.id) ?? []
    });
    this.aiEmployees = new OpenClawAIEmployeeManager({
      listAIMemberRuntimeCandidates: () => this.listAIMemberRuntimeCandidates(),
      saveAIMemberRuntime: (request) => this.saveAIMemberRuntime(request),
      getAIMemberBindings: (agentId) => this.getAIMemberBindings(agentId),
      bindAIMemberChannel: (agentId, request) => this.bindAIMemberChannel(agentId, request),
      unbindAIMemberChannel: (agentId, request) => this.unbindAIMemberChannel(agentId, request),
      deleteAIMemberRuntime: (agentId, request) => this.deleteAIMemberRuntime(agentId, request)
    });
    this.gateway = new OpenClawGatewayManager({
      restartGateway: () => this.restartGateway(),
      healthCheck: (selectedProfileId) => this.healthCheck(selectedProfileId),
      getActiveChannelSession: () => this.getActiveChannelSession(),
      getChannelSession: (sessionId) => this.getChannelSession(sessionId),
      submitChannelSessionInput: (sessionId, request) => this.submitChannelSessionInput(sessionId, request),
      runTask: (request) => this.runTask(request),
      getChatThreadDetail: (request) => this.getChatThreadDetail(request),
      subscribeToLiveChatEvents: (listener) => this.subscribeToLiveChatEvents(listener),
      sendChatMessage: (request) => this.sendChatMessage(request),
      abortChatMessage: (request) => this.abortChatMessage(request),
      startWhatsappLogin: () => this.startWhatsappLogin(),
      approvePairing: (channelId, request) => this.approvePairing(channelId, request),
      prepareFeishu: () => this.prepareFeishu(),
      finalizeOnboardingSetup: () => this.finalizeOnboardingSetup(),
      startGatewayAfterChannels: () => this.startGatewayAfterChannels()
    });
    this.plugins = new OpenClawPluginManager({
      getConfigOverview: () => this.getPluginConfigOverview(),
      ensureFeatureRequirements: (featureId, options) => this.ensureFeatureRequirements(featureId, options),
      installPlugin: (pluginId) => this.installPlugin(pluginId),
      updatePlugin: (pluginId) => this.updatePlugin(pluginId),
      removePlugin: (pluginId) => this.removePlugin(pluginId)
    });
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

  private async ensureSlackClawGatewayConfigBaseline(command: string | undefined): Promise<boolean> {
    const configPath = await this.resolveOpenClawConfigPathForInstall(command);
    const currentConfig = (await readOpenClawConfigFile(configPath)) ?? {};
    const normalized = normalizeOpenClawGatewayConfigForSlackClaw(currentConfig);

    if (!normalized.changed) {
      return false;
    }

    await writeOpenClawConfigFile(configPath, normalized.config);
    invalidateReadCache("models:", "engine:");
    await writeInfoLog("Normalized OpenClaw gateway config to SlackClaw's local baseline.", {
      configPath,
      gatewayMode: SLACKCLAW_OPENCLAW_GATEWAY_MODE,
      gatewayBind: SLACKCLAW_OPENCLAW_GATEWAY_BIND,
      gatewayAuthMode: SLACKCLAW_OPENCLAW_GATEWAY_AUTH_MODE
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
    await writeInfoLog("SlackClaw activated config-backed OpenClaw fallback.", {
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

  private async removeManagedPluginConfigEntry(pluginId: string): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      if (!config.plugins?.entries || !(pluginId in config.plugins.entries)) {
        return;
      }

      delete config.plugins.entries[pluginId];
      if (Object.keys(config.plugins.entries).length === 0) {
        delete config.plugins.entries;
      }
      if (config.plugins && Object.keys(config.plugins).length === 0) {
        delete config.plugins;
      }
    });
  }

  private async removeChannelConfig(channelKey: string): Promise<void> {
    await this.mutateOpenClawConfig(({ config }) => {
      if (!config.channels || !(channelKey in config.channels)) {
        return;
      }

      delete config.channels[channelKey];
      if (Object.keys(config.channels).length === 0) {
        delete config.channels;
      }
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

  private async readOpenClawSkillsList(options?: { fresh?: boolean }): Promise<OpenClawSkillsListJson | undefined> {
    return readOpenClawSkillsList(options);
  }

  private async resolveSharedSkillsDir(list?: OpenClawSkillsListJson): Promise<string | undefined> {
    const workspaceDir = list?.workspaceDir?.trim();
    const workspaceSkillsDir = workspaceDir ? resolve(workspaceDir, "skills") : undefined;
    const managedSkillsDir = list?.managedSkillsDir?.trim();

    if (workspaceSkillsDir && (await fileExists(workspaceSkillsDir))) {
      return workspaceSkillsDir;
    }

    if (managedSkillsDir && (await fileExists(managedSkillsDir))) {
      return managedSkillsDir;
    }

    return workspaceSkillsDir ?? managedSkillsDir;
  }

  private async readWorkspaceSkillMetadata(
    skillsDir: string | undefined
  ): Promise<Map<string, { slug: string; version?: string; filePath: string; baseDir: string; name?: string; description?: string; homepage?: string; content?: string }>> {
    const metadata = new Map<string, { slug: string; version?: string; filePath: string; baseDir: string; name?: string; description?: string; homepage?: string; content?: string }>();

    if (!skillsDir || !(await fileExists(skillsDir))) {
      return metadata;
    }

    const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const baseDir = join(skillsDir, entry.name);
      const filePath = join(baseDir, "SKILL.md");
      if (!(await fileExists(filePath))) {
        continue;
      }

      const content = await readFile(filePath, "utf8").catch(() => "");
      const frontmatter = parseSkillFrontmatter(content);
      const slug = frontmatter.slug?.trim() || entry.name;
      const name = frontmatter.name?.trim() || entry.name;
      const item = {
        slug,
        version: frontmatter.version?.trim() || undefined,
        filePath,
        baseDir,
        name,
        description: frontmatter.description?.trim() || undefined,
        homepage: frontmatter.homepage?.trim() || undefined,
        content: stripSkillFrontmatter(content)
      };

      metadata.set(name, item);
      metadata.set(slug, item);
      metadata.set(entry.name, item);
    }

    return metadata;
  }

  private async resolveClawHubContext(): Promise<{ workdir: string; dir: string } | undefined> {
    const skills = await this.readOpenClawSkillsList();
    const skillsDir = await this.resolveSharedSkillsDir(skills);

    if (!skillsDir) {
      return undefined;
    }

    return {
      workdir: dirname(skillsDir),
      dir: basename(skillsDir)
    };
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
    const agentId = OPENCLAW_MAIN_AGENT_ID;
    const agentDir = snapshot.status?.agentDir ?? getMainOpenClawAgentDir();
    const workspaceDir =
      snapshot.config.agents?.defaults?.workspace && typeof snapshot.config.agents.defaults.workspace === "string"
        ? snapshot.config.agents.defaults.workspace
        : resolve(process.env.HOME ?? "", ".openclaw", "workspace");
    const summary = await this.readEntryAuthSummary(agentDir, provider?.id);

    return {
      ...state,
      modelEntries: [
        {
          id: "slackclaw-main",
          label: this.buildEntryLabel(undefined, provider?.id ?? modelRefProvider(modelKey) ?? "custom", modelKey),
          providerId: provider?.id ?? modelRefProvider(modelKey) ?? "custom",
          modelKey,
          agentId,
          agentDir,
          workspaceDir,
          authMethodId: undefined,
          authModeLabel: summary.authModeLabel,
          profileLabel: summary.profileLabel,
          profileIds: summary.profileIds,
          isDefault: true,
          isFallback: false,
          createdAt,
          updatedAt: createdAt
        }
      ],
      defaultModelEntryId: "slackclaw-main",
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
        throw new Error(add.stderr || add.stdout || `SlackClaw could not create the AI member agent ${agentId}.`);
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

  private async syncMemberBrain(
    request: AIMemberRuntimeRequest,
    agentId: string,
    agentDir: string,
    workspaceDir: string
  ): Promise<void> {
    const modelState = await this.ensureSavedModelState();
    const sourceEntry = modelState.modelEntries?.find((entry) => entry.id === request.brain.entryId);

    if (!sourceEntry) {
      throw new Error("Saved model entry for this AI member was not found.");
    }

    const snapshot = await this.readOpenClawConfigSnapshot();
    await this.upsertAgentConfigEntry(
      snapshot.configPath,
      snapshot.config,
      {
        ...sourceEntry,
        label: request.name,
        agentId,
        agentDir,
        workspaceDir
      },
      request.brain.modelKey
    );

    const sourceAuthDir = sourceEntry.agentDir || snapshot.status?.agentDir || getMainOpenClawAgentDir();
    const sourceStore = sourceAuthDir ? await readAuthStore(sourceAuthDir) : undefined;
    if (!sourceStore?.profiles || Object.keys(sourceStore.profiles).length === 0) {
      return;
    }

    const profileIdsToCopy =
      sourceEntry.profileIds.length > 0
        ? sourceEntry.profileIds.filter((profileId) => Boolean(sourceStore.profiles?.[profileId]))
        : Object.keys(sourceStore.profiles ?? {});
    const nextProfiles = Object.fromEntries(
      profileIdsToCopy.map((profileId) => [profileId, sourceStore.profiles?.[profileId]]).filter((entry): entry is [string, NonNullable<OpenClawAuthProfileStoreJson["profiles"]>[string]] => Boolean(entry[1]))
    );
    const nextUsageStats = Object.fromEntries(
      profileIdsToCopy
        .map((profileId) => [profileId, sourceStore.usageStats?.[profileId]] as const)
        .filter((entry): entry is [string, NonNullable<OpenClawAuthProfileStoreJson["usageStats"]>[string]] => Boolean(entry[1]))
    );
    const nextOrder = Object.fromEntries(
      Object.entries(sourceStore.order ?? {}).map(([providerId, profileIds]) => [
        providerId,
        profileIds.filter((profileId) => profileIdsToCopy.includes(profileId))
      ]).filter((entry) => entry[1].length > 0)
    );
    const nextLastGood = Object.fromEntries(
      Object.entries(sourceStore.lastGood ?? {}).filter(([, profileId]) => profileIdsToCopy.includes(profileId))
    );

    await writeAuthStore(agentDir, {
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

    await this.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
  }

  private async readMemberBindings(agentId: string): Promise<MemberBindingSummary[]> {
    return readThroughCache(
      `agents:bindings:${agentId}`,
      READ_CACHE_TTL_MS.bindings,
      async () => {
        const result = await runOpenClaw(["agents", "bindings", "--agent", agentId, "--json"], { allowFailure: true });
        const payload =
          safeJsonPayloadParse<Array<string | OpenClawAgentBindingJsonEntry>>(result.stdout) ??
          safeJsonPayloadParse<Array<string | OpenClawAgentBindingJsonEntry>>(result.stderr) ??
          [];

        return payload
          .map((entry) => normalizeBindingTarget(entry))
          .filter((entry): entry is MemberBindingSummary => Boolean(entry));
      }
    );
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

  private async readEntryAuthSummary(agentDir: string, providerId?: string): Promise<{
    profileIds: string[];
    authModeLabel?: string;
    profileLabel?: string;
  }> {
    const store = await readAuthStore(agentDir);
    const provider = providerDefinitionById(providerId ?? "");
    const profiles = Object.entries(store.profiles ?? {}).filter(([, profile]) =>
      provider ? providerMatchesAuthProvider(provider, String(profile.provider ?? "")) : true
    );
    const first = profiles[0];

    return {
      profileIds: profiles.map(([profileId]) => profileId),
      authModeLabel: first ? authModeLabelForCredentialType(first[1].type) : undefined,
      profileLabel: first ? describeProfileLabel(first[0], first[1]) : undefined
    };
  }

  private async replaceEntryProfileIds(
    configPath: string,
    config: OpenClawConfigFileJson,
    entry: SavedModelEntryState
  ): Promise<SavedModelEntryState> {
    const provider = providerDefinitionById(entry.providerId);
    const store = await readAuthStore(entry.agentDir);
    const sourceProfiles = Object.entries(store.profiles ?? {}).filter(([, profile]) =>
      provider ? providerMatchesAuthProvider(provider, String(profile.provider ?? "")) : true
    );
    const nextProfiles: NonNullable<OpenClawAuthProfileStoreJson["profiles"]> = {};
    const nextUsageStats: NonNullable<OpenClawAuthProfileStoreJson["usageStats"]> = {};
    const nextProfileIds: string[] = [];

    for (const existingProfileId of entry.profileIds ?? []) {
      delete config.auth?.profiles?.[existingProfileId];
    }

    const providerPrefix = provider?.authProviderId ?? provider?.providerRefs[0]?.replace(/\/$/, "") ?? entry.providerId;

    sourceProfiles.forEach(([profileId, profile], index) => {
      const nextProfileId = `${providerPrefix}:slackclaw-${entry.id}-${index + 1}`;
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

    await writeAuthStore(entry.agentDir, store);

    config.auth = config.auth ?? {};
    config.auth.profiles = config.auth.profiles ?? {};

    for (const profileId of nextProfileIds) {
      const profile = nextProfiles[profileId];
      config.auth.profiles[profileId] = {
        provider: String(profile.provider ?? providerPrefix),
        mode: profile.type === "api_key" ? "api_key" : profile.type === "token" ? "token" : "oauth",
        ...(typeof profile.email === "string" && profile.email.trim() ? { email: profile.email.trim() } : {})
      };
    }

    await this.writeOpenClawConfigSnapshot(configPath, config);

    return {
      ...entry,
      profileIds: nextProfileIds,
      authModeLabel: nextProfileIds[0] ? authModeLabelForCredentialType(nextProfiles[nextProfileIds[0]]?.type) : undefined,
      profileLabel: nextProfileIds[0] ? describeProfileLabel(nextProfileIds[0], nextProfiles[nextProfileIds[0]]) : undefined
    };
  }

  private async syncRuntimeAuthProfiles(
    configPath: string,
    config: OpenClawConfigFileJson,
    defaultEntry: SavedModelEntryState,
    activeEntries: SavedModelEntryState[]
  ): Promise<void> {
    const targetStore = await readAuthStore(defaultEntry.agentDir);
    targetStore.profiles = targetStore.profiles ?? {};
    targetStore.usageStats = targetStore.usageStats ?? {};
    targetStore.order = targetStore.order ?? {};
    config.auth = config.auth ?? {};
    config.auth.profiles = config.auth.profiles ?? {};

    for (const entry of activeEntries) {
      const sourceStore = await readAuthStore(entry.agentDir);
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
          mode: profile.type === "api_key" ? "api_key" : profile.type === "token" ? "token" : "oauth",
          ...(typeof profile.email === "string" && profile.email.trim() ? { email: profile.email.trim() } : {})
        };
      }

      if (providerOrder.length > 0) {
        const providerConfigKey =
          providerDefinitionById(entry.providerId)?.authProviderId ??
          providerDefinitionById(entry.providerId)?.providerRefs[0]?.replace(/\/$/, "") ??
          entry.providerId;
        targetStore.order[providerConfigKey] = providerOrder;
      }
    }

    await writeAuthStore(defaultEntry.agentDir, targetStore);
    await this.writeOpenClawConfigSnapshot(configPath, config);
  }

  private async syncRuntimeModelChain(nextState: OpenClawAdapterState): Promise<OpenClawAdapterState> {
    const state = this.normalizeStateFlags(nextState);
    const defaultEntry = state.modelEntries?.find((entry) => entry.id === state.defaultModelEntryId);
    const fallbackEntries = (state.fallbackModelEntryIds ?? [])
      .map((entryId) => state.modelEntries?.find((entry) => entry.id === entryId))
      .filter((entry): entry is SavedModelEntryState => Boolean(entry));

    if (!defaultEntry) {
      await writeAdapterState(state);
      return state;
    }

    const snapshot = await this.readOpenClawConfigSnapshot();
    const allModelKeys = [...new Set((state.modelEntries ?? []).map((entry) => entry.modelKey))];

    snapshot.config.agents = snapshot.config.agents ?? {};
    snapshot.config.agents.defaults = {
      ...snapshot.config.agents.defaults,
      model: {
        primary: defaultEntry.modelKey,
        fallbacks: fallbackEntries.map((entry) => entry.modelKey)
      },
      models: Object.fromEntries(allModelKeys.map((modelKey) => [modelKey, snapshot.config.agents?.defaults?.models?.[modelKey] ?? {}]))
    };

    if (!defaultEntry.agentId || !defaultEntry.agentDir || !defaultEntry.workspaceDir) {
      await this.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
      await writeAdapterState(state);
      return state;
    }

    const runtimeFallbackEntries = fallbackEntries.filter((entry): entry is SavedModelEntryState => Boolean(entry.agentId && entry.agentDir && entry.workspaceDir));
    const activeEntries = [defaultEntry, ...runtimeFallbackEntries];

    await this.upsertAgentConfigEntry(snapshot.configPath, snapshot.config, defaultEntry, {
      primary: defaultEntry.modelKey,
      fallbacks: runtimeFallbackEntries.map((entry) => entry.modelKey)
    });

    for (const entry of state.modelEntries ?? []) {
      if (entry.id === defaultEntry.id || !entry.agentId || !entry.agentDir || !entry.workspaceDir) {
        continue;
      }

      await this.upsertAgentConfigEntry(snapshot.configPath, snapshot.config, entry, entry.modelKey);
    }

    await this.syncRuntimeAuthProfiles(snapshot.configPath, snapshot.config, defaultEntry, activeEntries);
    await writeAdapterState(state);
    return state;
  }

  private buildSavedModelEntryState(
    entryId: string,
    request: SaveModelEntryRequest,
    now: string,
    existingEntry?: SavedModelEntryState,
    method?: InternalModelAuthMethod,
    paths?: { agentId: string; agentDir: string; workspaceDir: string }
  ): SavedModelEntryState {
    return {
      id: entryId,
      label: this.buildEntryLabel(request.label, request.providerId, request.modelKey),
      providerId: request.providerId,
      modelKey: request.modelKey,
      agentId: paths?.agentId ?? existingEntry?.agentId ?? "",
      agentDir: paths?.agentDir ?? existingEntry?.agentDir ?? "",
      workspaceDir: paths?.workspaceDir ?? existingEntry?.workspaceDir ?? "",
      authMethodId: request.methodId,
      authModeLabel: existingEntry?.authModeLabel ?? authModeLabelForMethodKind(method?.kind),
      profileLabel: existingEntry?.profileLabel,
      profileIds: existingEntry?.profileIds ?? [],
      isDefault: false,
      isFallback: false,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now
    };
  }

  private applySavedModelEntryState(
    state: OpenClawAdapterState,
    entry: SavedModelEntryState,
    request: SaveModelEntryRequest
  ): OpenClawAdapterState {
    const otherEntries = (state.modelEntries ?? []).filter((item) => item.id !== entry.id);
    const nextEntries = [...otherEntries, entry];
    const previousWasDefault = state.defaultModelEntryId === entry.id;
    const previousWasFallback = (state.fallbackModelEntryIds ?? []).includes(entry.id);
    const nextState: OpenClawAdapterState = {
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

    return this.normalizeStateFlags(nextState);
  }

  private async finalizeSavedModelEntryMetadataOnly(
    entryId: string,
    request: SaveModelEntryRequest
  ): Promise<ModelConfigActionResponse> {
    const state = await this.ensureSavedModelState();
    const existingEntry = state.modelEntries?.find((entry) => entry.id === entryId);
    const now = new Date().toISOString();
    const provider = providerDefinitionById(request.providerId);
    const method = provider?.authMethods.find((item) => item.id === request.methodId);
    const nextEntry = this.buildSavedModelEntryState(entryId, request, now, existingEntry, method);
    const previousWasRuntime = state.defaultModelEntryId === entryId || (state.fallbackModelEntryIds ?? []).includes(entryId);
    let nextState = this.applySavedModelEntryState(state, nextEntry, request);

    if (previousWasRuntime) {
      nextState = await this.syncRuntimeModelChain(nextState);
      await this.markGatewayApplyPending();
      return {
        ...this.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${nextEntry.label} was updated.`),
        modelConfig: await this.getModelConfig(),
        requiresGatewayApply: true
      };
    }

    await writeAdapterState(nextState);
    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: `${nextEntry.label} was added to SlackClaw. OpenClaw will only configure it when you set it as default or fallback.`,
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: false
    };
  }

  private async finalizeSavedModelEntryOperation(operation: PendingSavedModelEntryOperation): Promise<ModelConfigActionResponse> {
    const state = await this.ensureSavedModelState();
    const now = new Date().toISOString();
    const existingEntry = state.modelEntries?.find((entry) => entry.id === operation.entryId);
    const nextEntryBase: SavedModelEntryState = existingEntry ?? {
      id: operation.entryId,
      label: this.buildEntryLabel(operation.draft.label, operation.draft.providerId, operation.draft.modelKey),
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
    const snapshot = await this.readOpenClawConfigSnapshot();
    const provider = providerDefinitionById(operation.draft.providerId);
    const entryDraft = {
      ...nextEntryBase,
      label: this.buildEntryLabel(operation.draft.label, operation.draft.providerId, operation.draft.modelKey),
      providerId: operation.draft.providerId,
      modelKey: operation.draft.modelKey,
      authMethodId: operation.draft.methodId,
      updatedAt: now
    };
    const nextEntry = isManagedModelAgentId(entryDraft.agentId)
      ? await this.replaceEntryProfileIds(snapshot.configPath, snapshot.config, entryDraft)
      : {
          ...entryDraft,
          ...(await this.readEntryAuthSummary(entryDraft.agentDir || snapshot.status?.agentDir || getMainOpenClawAgentDir(), provider?.id))
        };

    const otherEntries = (state.modelEntries ?? []).filter((entry) => entry.id !== nextEntry.id);
    let nextState: OpenClawAdapterState = this.applySavedModelEntryState(
      {
        ...state,
        modelEntries: otherEntries
      },
      nextEntry,
      operation.draft
    );
    nextState = await this.syncRuntimeModelChain(nextState);
    await this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`${nextEntry.label} is ready.`),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  private async deleteManagedModelAgent(entry: SavedModelEntryState): Promise<void> {
    if (!isManagedModelAgentId(entry.agentId)) {
      return;
    }

    const result = await runOpenClaw(["agents", "delete", entry.agentId, "--force", "--json"], { allowFailure: true });

    if (result.code !== 0) {
      const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
      if (!output.includes("not found")) {
        throw new Error(result.stderr || result.stdout || `SlackClaw could not delete the hidden model agent ${entry.agentId}.`);
      }
    }

    const managedPaths = getManagedModelAgentPaths(entry.id);
    await rm(managedPaths.rootDir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async cleanupRemovedSavedModelEntry(
    entry: SavedModelEntryState,
    nextState: OpenClawAdapterState
  ): Promise<void> {
    const snapshot = await this.readOpenClawConfigSnapshot();

    if (isManagedModelAgentId(entry.agentId)) {
      snapshot.config.agents = {
        ...snapshot.config.agents,
        list: (snapshot.config.agents?.list ?? []).filter((item) => item.id !== entry.agentId)
      };
    }

    if (isManagedModelAgentId(entry.agentId)) {
      removeProfileIdsFromConfig(snapshot.config, entry.profileIds);
      await this.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);

      const nextDefaultEntry = (nextState.modelEntries ?? []).find((item) => item.id === nextState.defaultModelEntryId);
      await removeProfileIdsFromAuthStore(nextDefaultEntry?.agentDir, entry.profileIds);
    }

    if (isManagedModelAgentId(entry.agentId)) {
      await this.deleteManagedModelAgent(entry);
    }
  }

  private async startEntryAuthentication(
    provider: InternalModelProviderConfig,
    method: InternalModelAuthMethod,
    request: SaveModelEntryRequest,
    operation: PendingSavedModelEntryOperation
  ): Promise<ModelConfigActionResponse> {
    if (provider.id === "custom") {
      throw new Error("SlackClaw hidden-agent model entries do not support custom providers yet.");
    }

    if (method.tokenProviderId || canUseTokenPasteAuth(method)) {
      const tokenField = method.fields[0];
      const token = request.values[tokenField?.id ?? "token"]?.trim();
      const authProvider = resolveTokenAuthProvider(provider, method);

      if (!token) {
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      await runOpenClaw(
        buildModelsCommandArgs(
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
        provider,
        method,
        buildModelsCommandArgs(["auth", "setup-token", "--provider", method.setupTokenProvider, "--yes"], operation.agentId),
        undefined,
        undefined,
        operation
      );
    }

    if (method.specialCommand === "login-github-copilot") {
      return this.startInteractiveModelAuthSession(
        provider,
        method,
        buildModelsCommandArgs(["auth", "login-github-copilot", "--yes"], operation.agentId),
        undefined,
        undefined,
        operation
      );
    }

    if (method.loginProviderId) {
      const args = buildModelsCommandArgs(["auth", "login", "--provider", method.loginProviderId], operation.agentId);

      if (method.loginMethodId) {
        args.push("--method", method.loginMethodId);
      }

      return this.startInteractiveModelAuthSession(
        provider,
        method,
        args,
        undefined,
        undefined,
        operation
      );
    }

    if (method.onboardAuthChoice) {
      const missingField = method.fields.find((field) => field.required && !request.values[field.id]?.trim());
      if (missingField) {
        throw new Error(`Enter ${missingField.label} first.`);
      }

      await runOpenClaw(buildOnboardAuthArgs(method, request.values), {
        allowFailure: false,
        envOverrides: {
          OPENCLAW_AGENT_DIR: operation.agentDir
        }
      });

      return this.finalizeSavedModelEntryOperation(operation);
    }

    throw new Error(`SlackClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
  }

  private async createOrUpdateSavedModelEntry(
    mode: "create" | "update",
    entryId: string,
    request: SaveModelEntryRequest
  ): Promise<ModelConfigActionResponse> {
    const currentState = await this.ensureSavedModelState();
    const provider = providerDefinitionById(request.providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${request.providerId}`);
    }

    const method = provider.authMethods.find((item) => item.id === request.methodId);

    if (!method) {
      throw new Error(`Unknown auth method for provider ${request.providerId}: ${request.methodId}`);
    }

    const existingEntry = currentState.modelEntries?.find((entry) => entry.id === entryId);
    if (!shouldAuthenticateSavedModelEntry(mode, request, method)) {
      return this.finalizeSavedModelEntryMetadataOnly(entryId, request);
    }

    const defaultAuthContext = await this.readOpenClawConfigSnapshot();
    const sharedAuthAgentDir = defaultAuthContext.status?.agentDir ?? getMainOpenClawAgentDir();
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

    const operation: PendingSavedModelEntryOperation = {
      mode,
      entryId,
      agentId,
      agentDir: paths.agentDir,
      workspaceDir: paths.workspaceDir,
      draft: request
    };

    if (mode === "update" && !hasProvidedModelAuthValues(request)) {
      return this.finalizeSavedModelEntryOperation(operation);
    }

    return this.startEntryAuthentication(provider, method, request, operation);
  }

  async install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    const bootstrap = await this.ensurePinnedOpenClaw(options?.forceLocal ? "managed-local" : "auto");
    const state = await readAdapterState();
    const mode: "detected" | "onboarded" = "detected";
    let message = `${bootstrap.message} SlackClaw is ready to run OpenClaw onboarding next.`;

    if (autoConfigure && !state.configuredProfileId) {
      await this.configure("email-admin");
    }

    await writeAdapterState({
      ...state,
      installedAt: new Date().toISOString(),
      lastInstallMode: mode
    });

    this.invalidateReadCaches();
    const engineStatus = await this.status();

    return {
      status: "installed",
      message,
      engineStatus,
      disposition: toInstallDisposition(bootstrap.status, mode),
      changed: bootstrap.changed,
      hadExisting: bootstrap.hadExisting,
      pinnedVersion: OPENCLAW_VERSION_OVERRIDE,
      existingVersion: bootstrap.existingVersion,
      actualVersion: bootstrap.version ?? undefined
    };
  }

  async installDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    const bootstrap = await this.ensurePinnedOpenClaw(targetId === "managed-local" ? "managed-local" : "system");
    const state = await readAdapterState();

    await writeAdapterState({
      ...state,
      installedAt: new Date().toISOString(),
      lastInstallMode: "detected"
    });

    this.invalidateReadCaches();
    const engineStatus = await this.status();

    return {
      targetId,
      status: "completed",
      message: bootstrap.message,
      engineStatus
    };
  }

  async uninstall(): Promise<EngineActionResponse> {
    const managedDir = getManagedOpenClawDir();
    const managedBinary = getManagedOpenClawBinPath();
    const hadManagedInstall = await fileExists(managedDir);
    const command = await resolveOpenClawCommand();
    let message = "SlackClaw did not find a SlackClaw-managed OpenClaw runtime to remove.";

    if (hadManagedInstall) {
      if (await fileExists(managedBinary)) {
        await runCommand(managedBinary, ["gateway", "uninstall"], { allowFailure: true }).catch(() => undefined);
      }
      await rm(managedDir, { recursive: true, force: true });
      await writeInfoLog("SlackClaw removed the managed local OpenClaw runtime.", {
        managedDir
      });
      message = `SlackClaw removed the managed local OpenClaw runtime from ${managedDir}.`;
    }

    if (command && command !== managedBinary && !hadManagedInstall) {
      message = `SlackClaw did not remove the external OpenClaw at ${command}. Remove it with the original package manager if you still want it gone.`;
    }

    await writeAdapterState({});
    this.invalidateReadCaches();
    const engineStatus = await this.status();

    if (engineStatus.installed && command && command !== managedBinary) {
      message = `${message} SlackClaw still detects an external OpenClaw at ${command}. Remove it with the original package manager if you want a full uninstall.`;
    }

    return {
      action: "uninstall-engine",
      status: "completed",
      message,
      engineStatus
    };
  }

  async uninstallDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    if (targetId === "managed-local") {
      const result = await this.uninstall();
      return {
        targetId,
        status: result.status === "completed" ? "completed" : "failed",
        message: result.message,
        engineStatus: result.engineStatus
      };
    }

    const systemCommand = await resolveSystemOpenClawCommand({ fresh: true });

    if (!systemCommand) {
      return {
        targetId,
        status: "completed",
        message: "SlackClaw did not detect a system OpenClaw install to remove.",
        engineStatus: await this.status()
      };
    }

    await runCommand(systemCommand, ["uninstall", "--all", "--yes", "--non-interactive"], { allowFailure: true }).catch(() => undefined);

    const npmInvocation = await resolveNpmInvocation();
    const npmManaged = await resolveNpmManagedSystemOpenClaw(systemCommand, npmInvocation);

    if (!npmManaged) {
      return {
        targetId,
        status: "failed",
        message: `SlackClaw detected the external OpenClaw at ${systemCommand}, but could not prove it is the global npm install SlackClaw can safely remove automatically.`,
        engineStatus: await this.status()
      };
    }

    const uninstallArgs = ["rm", "--global", "openclaw"];
    const uninstallResult = await runCommand(
      npmManaged.invocation.command,
      [...npmManaged.invocation.argsPrefix, ...uninstallArgs],
      { allowFailure: true }
    );

    if (uninstallResult.code !== 0) {
      await writeErrorLog("OpenClaw npm uninstall command failed.", {
        command: npmManaged.invocation.display,
        args: uninstallArgs,
        result: uninstallResult,
        systemCommand,
        packageRoot: npmManaged.packageRoot
      });

      return {
        targetId,
        status: "failed",
        message: uninstallResult.stderr || uninstallResult.stdout || "SlackClaw could not remove the npm-managed OpenClaw install.",
        engineStatus: await this.status()
      };
    }

    this.invalidateReadCaches();
    const remainingSystemCommand = await resolveSystemOpenClawCommand({ fresh: true });
    const engineStatus = await this.status();

    if (remainingSystemCommand) {
      return {
        targetId,
        status: "failed",
        message: `SlackClaw ran npm uninstall for ${systemCommand}, but SlackClaw still detects a system OpenClaw afterward at ${remainingSystemCommand}.`,
        engineStatus
      };
    }

    return {
      targetId,
      status: "completed",
      message: `SlackClaw removed the npm-managed OpenClaw install at ${systemCommand}.`,
      engineStatus
    };
  }

  async restartGateway(): Promise<GatewayActionResponse> {
    try {
      const engineStatus = await this.restartGatewayAndRequireHealthy("manual restart");

      return {
        action: "restart-gateway",
        status: "completed",
        message: "OpenClaw gateway restarted and is reachable.",
        engineStatus
      };
    } catch (error) {
      await logSoftFailure("SlackClaw could not restart the OpenClaw gateway on demand.", {
        error: errorToLogDetails(error)
      });

      return {
        action: "restart-gateway",
        status: "failed",
        message: error instanceof Error ? error.message : "SlackClaw could not restart the OpenClaw gateway.",
        engineStatus: await this.status()
      };
    }
  }

  async getSkillRuntimeCatalog(): Promise<SkillRuntimeCatalog> {
    const snapshot = await readSkillSnapshot();
    const list = snapshot.list;
    const skillsDir = await this.resolveSharedSkillsDir(list);
    const workspaceMetadata = await this.readWorkspaceSkillMetadata(skillsDir);
    const marketplaceAvailable = Boolean(await resolveClawHubCommand());
    const skills = (list?.skills ?? []).flatMap((skill): SkillRuntimeEntry[] => {
        const skillName = skill.name?.trim();

        if (!skillName) {
          return [];
        }

        const metadata = workspaceMetadata.get(skillName);
        return [{
          id: skillName,
          slug: metadata?.slug,
          name: skillName,
          description: skill.description?.trim() || metadata?.description || "",
          source: skill.source?.trim() || "openclaw-workspace",
          bundled: Boolean(skill.bundled),
          eligible: Boolean(skill.eligible),
          disabled: Boolean(skill.disabled),
          blockedByAllowlist: Boolean(skill.blockedByAllowlist),
          missing: normalizeSkillMissing(skill.missing),
          homepage: skill.homepage?.trim() || metadata?.homepage,
          version: metadata?.version,
          filePath: metadata?.filePath,
          baseDir: metadata?.baseDir
        } satisfies SkillRuntimeEntry];
      });
    const warnings = snapshot.warnings;

    return {
      workspaceDir: list?.workspaceDir?.trim() || undefined,
      managedSkillsDir: skillsDir ?? (list?.managedSkillsDir?.trim() || undefined),
      readiness: toSkillReadinessSummary(skills, warnings),
      marketplaceAvailable,
      marketplaceSummary: marketplaceAvailable
        ? "ClawHub search and install are available."
        : "ClawHub CLI is not installed on this Mac.",
      skills
    };
  }

  async getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail> {
    const result = await runOpenClaw(["skills", "info", skillId, "--json"], { allowFailure: true });
    const parsed = safeJsonPayloadParse<OpenClawSkillInfoJson>(result.stdout) ?? safeJsonPayloadParse<OpenClawSkillInfoJson>(result.stderr);

    if (!parsed) {
      throw new Error(`SlackClaw could not read details for ${skillId}.`);
    }

    const content = parsed.filePath ? await readFile(parsed.filePath, "utf8").catch(() => "") : "";
    const frontmatter = parseSkillFrontmatter(content);

    return {
      id: parsed.skillKey?.trim() || skillId,
      slug: frontmatter.slug?.trim() || (parsed.baseDir ? basename(parsed.baseDir) : undefined),
      name: parsed.name?.trim() || skillId,
      description: parsed.description?.trim() || frontmatter.description?.trim() || "",
      source: parsed.source === "openclaw-bundled" ? "bundled" : parsed.source === "openclaw-extra" ? "extra" : "workspace",
      bundled: Boolean(parsed.bundled),
      eligible: Boolean(parsed.eligible),
      disabled: Boolean(parsed.disabled),
      blockedByAllowlist: Boolean(parsed.blockedByAllowlist),
      readiness: parsed.disabled ? "disabled" : parsed.blockedByAllowlist ? "blocked" : parsed.eligible ? "ready" : "missing",
      missing: normalizeSkillMissing(parsed.missing),
      homepage: parsed.homepage?.trim() || frontmatter.homepage?.trim() || undefined,
      version: frontmatter.version?.trim() || undefined,
      managedBy: "openclaw",
      editable: false,
      removable: false,
      updatable: false,
      filePath: parsed.filePath?.trim() || undefined,
      baseDir: parsed.baseDir?.trim() || undefined,
      contentPreview: content ? stripSkillFrontmatter(content).slice(0, 6000) : undefined
    };
  }

  async listMarketplaceInstalledSkills(): Promise<Array<{ slug: string; version?: string }>> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      return [];
    }

    const result = await runClawHub(["--workdir", context.workdir, "--dir", context.dir, "list"], { allowFailure: true });
    if (result.code !== 0) {
      return [];
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s{2,}/).filter(Boolean))
      .map((parts) => ({
        slug: parts[0],
        version: parts[1]
      }))
      .filter((entry) => Boolean(entry.slug));
  }

  async getSkillMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail> {
    const context = await this.resolveClawHubContext();
    const argsPrefix = context ? ["--workdir", context.workdir, "--dir", context.dir] : [];
    const [metadataResult, fileResult, installed] = await Promise.all([
      runClawHub([...argsPrefix, "inspect", slug, "--json"], { allowFailure: true }),
      runClawHub([...argsPrefix, "inspect", slug, "--file", "SKILL.md"], { allowFailure: true }),
      this.listMarketplaceInstalledSkills()
    ]);

    const parsed = safeJsonPayloadParse<{
      skill?: {
        slug?: string;
        displayName?: string;
        summary?: string;
        tags?: { latest?: string };
        stats?: {
          downloads?: number;
          installsCurrent?: number;
          installsAllTime?: number;
          stars?: number;
          versions?: number;
        };
      };
      latestVersion?: {
        version?: string;
        changelog?: string;
        license?: string;
      };
      owner?: {
        handle?: string;
        displayName?: string;
        image?: string;
      };
    }>(metadataResult.stdout) ?? safeJsonPayloadParse(metadataResult.stderr);

    if (!parsed?.skill?.slug) {
      throw new Error(`SlackClaw could not inspect ${slug} from ClawHub.`);
    }

    const installsCurrent = parsed.skill.stats?.installsCurrent;
    const downloads = parsed.skill.stats?.downloads;
    const stars = parsed.skill.stats?.stars;

    return {
      slug: parsed.skill.slug,
      name: parsed.skill.displayName?.trim() || parsed.skill.slug,
      summary: parsed.skill.summary?.trim() || "",
      latestVersion: parsed.latestVersion?.version?.trim() || parsed.skill.tags?.latest?.trim() || undefined,
      updatedLabel: undefined,
      ownerHandle: parsed.owner?.handle?.trim() || undefined,
      downloads,
      stars,
      installed: installed.some((entry) => entry.slug === parsed.skill?.slug),
      curated: Boolean((downloads ?? 0) >= 500 || (stars ?? 0) >= 5 || (installsCurrent ?? 0) >= 10),
      ownerDisplayName: parsed.owner?.displayName?.trim() || undefined,
      ownerImageUrl: parsed.owner?.image?.trim() || undefined,
      changelog: parsed.latestVersion?.changelog?.trim() || undefined,
      license: parsed.latestVersion?.license?.trim() || undefined,
      installsCurrent,
      installsAllTime: parsed.skill.stats?.installsAllTime,
      versions: parsed.skill.stats?.versions,
      filePreview: fileResult.code === 0 ? fileResult.stdout : undefined,
      homepage: undefined
    };
  }

  async exploreSkillMarketplace(limit = 8): Promise<SkillMarketplaceEntry[]> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      return [];
    }

    const result = await runClawHub(["--workdir", context.workdir, "--dir", context.dir, "explore"], { allowFailure: true });
    if (result.code !== 0) {
      return [];
    }

    const parsed = parseClawHubExploreOutput(result.stdout).slice(0, limit);
    const installedSet = new Set((await this.listMarketplaceInstalledSkills()).map((entry) => entry.slug));
    const details = await Promise.all(parsed.map(async (entry) => this.getSkillMarketplaceDetail(entry.slug).catch(() => undefined)));

    return parsed.map((entry, index) => {
      const detail = details[index];
      return {
        ...entry,
        name: detail?.name ?? entry.name,
        summary: detail?.summary || entry.summary,
        latestVersion: detail?.latestVersion ?? entry.latestVersion,
        ownerHandle: detail?.ownerHandle,
        downloads: detail?.downloads,
        stars: detail?.stars,
        installed: installedSet.has(entry.slug),
        curated: detail?.curated ?? entry.curated
      };
    });
  }

  async searchSkillMarketplace(query: string, limit = 10): Promise<SkillMarketplaceEntry[]> {
    const trimmed = query.trim();
    const context = await this.resolveClawHubContext();

    if (!trimmed || !context) {
      return [];
    }

    const result = await runClawHub(["--workdir", context.workdir, "--dir", context.dir, "search", trimmed, "--limit", String(limit)], { allowFailure: true });
    if (result.code !== 0) {
      return [];
    }

    const parsed = parseClawHubSearchOutput(result.stdout).slice(0, limit);
    const installedSet = new Set((await this.listMarketplaceInstalledSkills()).map((entry) => entry.slug));
    const details = await Promise.all(parsed.map(async (entry) => this.getSkillMarketplaceDetail(entry.slug).catch(() => undefined)));

    return parsed.map((entry, index) => {
      const detail = details[index];
      return {
        ...entry,
        name: detail?.name ?? entry.name,
        summary: detail?.summary ?? entry.summary,
        latestVersion: detail?.latestVersion,
        ownerHandle: detail?.ownerHandle,
        downloads: detail?.downloads,
        stars: detail?.stars,
        installed: installedSet.has(entry.slug),
        curated: detail?.curated ?? false
      };
    });
  }

  async installMarketplaceSkill(request: InstallSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const result = await runClawHub(
      ["--workdir", context.workdir, "--dir", context.dir, "--no-input", "install", request.slug, ...(request.version ? ["--version", request.version] : [])],
      { allowFailure: true }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not install ${request.slug} from ClawHub.`);
    }

    await this.markGatewayApplyPending();
    invalidateReadCache("skills:");
    return { requiresGatewayApply: true };
  }

  async installManagedSkill(request: import("./adapter.js").ManagedSkillInstallRequest): Promise<import("./adapter.js").ManagedSkillInstallResult> {
    const verified = await this.verifyManagedSkill(request.slug);
    if (verified) {
      return {
        runtimeSkillId: verified.id,
        version: verified.version,
        requiresGatewayApply: false
      };
    }

    if (request.installSource === "bundled") {
      const bundledMarkdown = await readBundledManagedSkillMarkdown(request.slug, request.bundledAssetPath);
      if (!bundledMarkdown) {
        throw new Error(`SlackClaw could not resolve bundled assets for ${request.slug}.`);
      }

      const list = await this.readOpenClawSkillsList();
      const skillsDir = await this.resolveSharedSkillsDir(list);

      if (!skillsDir) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      const baseDir = join(skillsDir, request.slug);
      await mkdir(baseDir, { recursive: true });
      await writeFile(join(baseDir, "SKILL.md"), bundledMarkdown);

      await this.markGatewayApplyPending();
      invalidateReadCache("skills:");
      const installed = await this.verifyManagedSkill(request.slug);

      return {
        runtimeSkillId: installed?.id,
        version: installed?.version ?? request.version,
        requiresGatewayApply: true
      };
    }

    if (request.installSource === "clawhub") {
      const result = await this.installMarketplaceSkill({
        slug: request.slug,
        version: request.version
      });
      const installed = await this.verifyManagedSkill(request.slug);

      return {
        runtimeSkillId: installed?.id,
        version: installed?.version,
        requiresGatewayApply: result.requiresGatewayApply
      };
    }

    return {
      runtimeSkillId: undefined,
      version: request.version,
      requiresGatewayApply: false
    };
  }

  async updateMarketplaceSkill(slug: string, request: UpdateSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const args =
      request.action === "reinstall"
        ? ["--workdir", context.workdir, "--dir", context.dir, "--no-input", "install", slug, "--force", ...(request.version ? ["--version", request.version] : [])]
        : ["--workdir", context.workdir, "--dir", context.dir, "update", slug, ...(request.version ? ["--version", request.version] : [])];

    const result = await runClawHub(args, { allowFailure: true });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not ${request.action} ${slug}.`);
    }

    await this.markGatewayApplyPending();
    invalidateReadCache("skills:");
    return { requiresGatewayApply: true };
  }

  async saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<{ slug: string; requiresGatewayApply?: boolean }> {
    const list = await this.readOpenClawSkillsList();
    const skillsDir = await this.resolveSharedSkillsDir(list);

    if (!skillsDir) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const existing = skillId ? await this.getInstalledSkillDetail(skillId).catch(() => undefined) : undefined;
    const slug = slugifySkillName(request.slug?.trim() || existing?.slug || request.name);

    if (!slug) {
      throw new Error("Enter a skill name first.");
    }

    const baseDir = join(skillsDir, slug);
    await mkdir(baseDir, { recursive: true });
    await writeFile(join(baseDir, "SKILL.md"), buildCustomSkillMarkdown(request, slug, existing?.version));

    await this.markGatewayApplyPending();
    invalidateReadCache("skills:");

    return { slug, requiresGatewayApply: true };
  }

  async removeInstalledSkill(
    slug: string,
    request: RemoveSkillRequest & { managedBy: "clawhub" | "slackclaw-custom" }
  ): Promise<{ requiresGatewayApply?: boolean }> {
    if (request.managedBy === "clawhub") {
      const context = await this.resolveClawHubContext();

      if (!context) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      const result = await runClawHub(["--workdir", context.workdir, "--dir", context.dir, "uninstall", slug, "--yes"], { allowFailure: true });
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `SlackClaw could not remove ${slug}.`);
      }
    } else {
      const list = await this.readOpenClawSkillsList();
      const skillsDir = await this.resolveSharedSkillsDir(list);

      if (!skillsDir) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      await rm(join(skillsDir, slug), { recursive: true, force: true });
    }

    await this.markGatewayApplyPending();
    invalidateReadCache("skills:");
    return { requiresGatewayApply: true };
  }

  async verifyManagedSkill(slug: string): Promise<SkillRuntimeEntry | undefined> {
    const catalog = await this.getSkillRuntimeCatalog();
    return catalog.skills.find((entry) => entry.slug === slug && isUsableManagedSkillEntry(entry));
  }

  private async getModelConfig(): Promise<ModelConfigOverview> {
    const snapshot = await readModelSnapshot();

    if (isCleanModelRuntime(snapshot)) {
      const adapterState = this.normalizeStateFlags(await readAdapterState());
      if ((adapterState.modelEntries?.length ?? 0) > 0 || adapterState.defaultModelEntryId || (adapterState.fallbackModelEntryIds?.length ?? 0) > 0) {
        await writeAdapterState({
          ...adapterState,
          modelEntries: [],
          defaultModelEntryId: undefined,
          fallbackModelEntryIds: []
        });
      }

      return buildModelConfigOverview([], [], new Set<string>(), [], undefined, [], undefined);
    }

    const adapterState = await this.ensureSavedModelState();
    const completeAllModels = mergeModelCatalogEntries(snapshot.allModels, snapshot.supplemental.refs, {
      available: true,
      defaultModel: snapshot.supplemental.defaultModel
    });
    const completeConfiguredModels = mergeModelCatalogEntries(snapshot.configuredModels, snapshot.supplemental.refs, {
      available: true,
      defaultModel: snapshot.supplemental.defaultModel
    });
    const reconciledState = await this.reconcileSavedModelState(
      adapterState,
      completeConfiguredModels,
      snapshot.supplemental.defaultModel
    );

    return buildModelConfigOverview(
      completeAllModels,
      completeConfiguredModels,
      snapshot.configuredAuthProviders,
      reconciledState.modelEntries ?? [],
      reconciledState.defaultModelEntryId,
      reconciledState.fallbackModelEntryIds ?? [],
      snapshot.supplemental.defaultModel
    );
  }

  private async startInteractiveModelAuthSession(
    provider: InternalModelProviderConfig,
    method: InternalModelAuthMethod,
    args: string[],
    setDefaultModel?: string,
    envOverrides?: Record<string, string | undefined>,
    pendingEntry?: PendingSavedModelEntryOperation
  ): Promise<ModelConfigActionResponse> {
    const command = await resolveOpenClawCommand();

    if (!command) {
      throw new Error("OpenClaw CLI is not installed.");
    }

    const sessionId = randomUUID();
    const session: RuntimeModelAuthSession = {
      id: sessionId,
      providerId: provider.id,
      methodId: method.id,
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

    const child = spawnInteractiveCommand(command, args, envOverrides);

    session.child = child;
    modelAuthSessions.set(sessionId, session);

    child.stdout.on("data", (chunk) => {
      appendAuthSessionOutput(session, chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      appendAuthSessionOutput(session, chunk.toString());
    });

    child.on("error", (error) => {
      session.status = "failed";
      session.message = "SlackClaw could not start the OpenClaw authentication flow.";
      session.logs = trimLogLines([...session.logs, error.message]);
      void writeErrorLog("Failed to start interactive OpenClaw auth session.", {
        providerId: provider.id,
        methodId: method.id,
        error: errorToLogDetails(error)
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
                await runOpenClaw(["models", "set", session.setDefaultModel], { allowFailure: false }).catch(async (error) => {
                  session.logs = trimLogLines([
                    ...session.logs,
                    error instanceof Error ? error.message : "Failed to set the default model after auth."
                  ]);
                  await writeErrorLog("Failed to set default model after interactive auth.", {
                    providerId: provider.id,
                    methodId: method.id,
                    modelKey: session.setDefaultModel,
                    error: errorToLogDetails(error)
                  });
                });
              }

              await this.markGatewayApplyPending();
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
            await writeErrorLog("Failed to finalize interactive OpenClaw model auth.", {
              providerId: provider.id,
              methodId: method.id,
              entryId: session.pendingEntry?.entryId,
              error: errorToLogDetails(error)
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
      ...this.mutationSyncMeta(false),
      status: "interactive",
      message: `SlackClaw started the ${provider.label} ${method.label} flow.`,
      modelConfig: await this.getModelConfig(),
      authSession: {
        id: session.id,
        providerId: session.providerId,
        methodId: session.methodId,
        entryId: session.entryId,
        status: session.status,
        message: session.message,
        logs: session.logs,
        launchUrl: session.launchUrl,
        inputPrompt: session.inputPrompt
      }
    };
  }

  private async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    const session = modelAuthSessions.get(sessionId);

    if (!session) {
      throw new Error("Auth session not found.");
    }

    return {
      session: {
        id: session.id,
        providerId: session.providerId,
        methodId: session.methodId,
        entryId: session.entryId,
        status: session.status,
        message: session.message,
        logs: session.logs,
        launchUrl: session.launchUrl,
        inputPrompt: session.inputPrompt
      },
      modelConfig: await this.getModelConfig()
    };
  }

  async submitModelAuthSessionInput(sessionId: string, request: ModelAuthSessionInputRequest): Promise<ModelAuthSessionResponse> {
    const session = modelAuthSessions.get(sessionId);

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
    session.logs = trimLogLines([...session.logs, `[SlackClaw] Submitted redirect URL / code to OpenClaw.`]);
    session.inputPrompt = undefined;

    return this.getModelAuthSession(sessionId);
  }

  async createSavedModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    return this.createOrUpdateSavedModelEntry("create", randomUUID(), request);
  }

  async updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
    return this.createOrUpdateSavedModelEntry("update", entryId, request);
  }

  async removeSavedModelEntry(entryId: string): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.normalizeStateFlags(await readAdapterState());
    const entry = state.modelEntries?.find((item) => item.id === entryId);

    if (!entry) {
      throw new Error("Saved model entry not found.");
    }

    const remainingEntries = (state.modelEntries ?? []).filter((item) => item.id !== entryId);
    const removingDefault = state.defaultModelEntryId === entryId;
    const remainingFallbackIds = (state.fallbackModelEntryIds ?? []).filter((id) => id !== entryId);
    let nextDefaultEntryId = state.defaultModelEntryId;
    let nextFallbackEntryIds = remainingFallbackIds;

    if (removingDefault) {
      const promotedFallbackId = remainingFallbackIds[0];

      if (!promotedFallbackId) {
        throw new Error("Set another default AI model before removing the current default model.");
      }

      nextDefaultEntryId = promotedFallbackId;
      nextFallbackEntryIds = remainingFallbackIds.filter((id) => id !== promotedFallbackId);
    }

    const nextState = this.normalizeStateFlags({
      ...state,
      modelEntries: remainingEntries,
      defaultModelEntryId: nextDefaultEntryId,
      fallbackModelEntryIds: nextFallbackEntryIds
    });
    const touchedRuntime = entry.isDefault || entry.isFallback;

    await this.cleanupRemovedSavedModelEntry(entry, nextState);

    if (touchedRuntime) {
      await this.syncRuntimeModelChain(nextState);
      await this.markGatewayApplyPending();

      return {
        ...this.mutationSyncMeta(),
        status: "completed",
        message: appendGatewayApplyMessage(`${entry.label} was removed.`),
        modelConfig: await this.getModelConfig(),
        requiresGatewayApply: true
      };
    }

    await writeAdapterState(nextState);
    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: `${entry.label} was removed from SlackClaw.`,
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: false
    };
  }

  async setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.normalizeStateFlags(await readAdapterState());
    if (!state.modelEntries?.some((entry) => entry.id === request.entryId)) {
      throw new Error("Saved model entry not found.");
    }

    await this.syncRuntimeModelChain({
      ...state,
      defaultModelEntryId: request.entryId,
      fallbackModelEntryIds: (state.fallbackModelEntryIds ?? []).filter((entryId) => entryId !== request.entryId)
    });

    await this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Default AI model updated."),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
    await this.getModelConfig();
    const state = this.normalizeStateFlags(await readAdapterState());
    await this.syncRuntimeModelChain({
      ...state,
      fallbackModelEntryIds: request.entryIds
    });

    await this.markGatewayApplyPending();

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage("Fallback AI models updated."),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async authenticateModelProvider(request: ModelAuthRequest): Promise<ModelConfigActionResponse> {
    const provider = MODEL_PROVIDER_DEFINITIONS.find((entry) => entry.id === request.providerId);

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

      await runOpenClaw(args, { allowFailure: false });
      message = `${provider.label} endpoint settings were saved for OpenClaw.`;
    } else if (method.tokenProviderId || canUseTokenPasteAuth(method)) {
      const tokenField = method.fields[0];
      const token = request.values[tokenField?.id ?? "token"]?.trim();
      const authProvider = resolveTokenAuthProvider(provider, method);

      if (!token) {
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      await runOpenClaw(
        [
          ...buildModelsCommandArgs(["auth", "paste-token"]),
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
        provider,
        method,
        buildModelsCommandArgs(["auth", "setup-token", "--provider", method.setupTokenProvider, "--yes"]),
        request.setDefaultModel
      );
    } else if (method.specialCommand === "login-github-copilot") {
      return this.startInteractiveModelAuthSession(
        provider,
        method,
        buildModelsCommandArgs(["auth", "login-github-copilot", "--yes"]),
        request.setDefaultModel
      );
    } else if (method.loginProviderId) {
      const args = buildModelsCommandArgs(["auth", "login", "--provider", method.loginProviderId]);

      if (method.loginMethodId) {
        args.push("--method", method.loginMethodId);
      }

      return this.startInteractiveModelAuthSession(provider, method, args, request.setDefaultModel);
    } else if (method.onboardAuthChoice) {
      if (provider.id === "custom") {
        throw new Error("Custom provider setup must use the custom endpoint method.");
      }

      const missingField = method.fields.find((field) => field.required && !request.values[field.id]?.trim());
      if (missingField) {
        throw new Error(`Enter ${missingField.label} first.`);
      }

      await runOpenClaw(buildOnboardAuthArgs(method, request.values), { allowFailure: false });
      message = `${provider.label} ${method.label} was saved for OpenClaw.`;
    } else {
      throw new Error(`SlackClaw does not yet know how to authenticate ${provider.label} with ${method.label}.`);
    }

    if (request.setDefaultModel) {
      await runOpenClaw(["models", "set", request.setDefaultModel], { allowFailure: false });
      message = `${message} Default model set to ${request.setDefaultModel}.`;
    }

    await this.markGatewayApplyPending();
    message = appendGatewayApplyMessage(message);

    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message,
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async setDefaultModel(modelKey: string): Promise<ModelConfigActionResponse> {
    const state = await this.ensureSavedModelState();
    const matchingEntry = state.modelEntries?.find((entry) => entry.modelKey === modelKey);

    if (matchingEntry) {
      return this.setDefaultModelEntry({ entryId: matchingEntry.id });
    }

    const mutation = await this.runMutationWithConfigFallback({
      commandArgs: ["models", "set", modelKey],
      fallbackDescription: `models.default ${modelKey}`,
      applyFallback: async () => {
        await this.writeDefaultModelConfig(modelKey);
      }
    });

    if (!mutation.usedFallback && mutation.result.code !== 0) {
      throw new Error(commandFailureText(mutation.result) || `SlackClaw could not set the default model to ${modelKey}.`);
    }

    await this.markGatewayApplyPending();
    return {
      ...this.mutationSyncMeta(),
      status: "completed",
      message: appendGatewayApplyMessage(`Default model set to ${modelKey}.`),
      modelConfig: await this.getModelConfig(),
      requiresGatewayApply: true
    };
  }

  async configure(profileId: string): Promise<void> {
    const state = await readAdapterState();

    if (await resolveOpenClawCommand()) {
      await runOpenClaw(["config", "set", "slackclaw.defaultProfile", profileId], { allowFailure: true });
      await this.markGatewayApplyPending("SlackClaw saved profile configuration changes that still need to be applied through Gateway Manager.");
    }

    await writeAdapterState({
      ...state,
      configuredProfileId: profileId
    });
  }

  async status(): Promise<EngineStatus> {
    const data = await this.collectStatusData();
    const state = this.normalizeStateFlags(await readAdapterState());

    return {
      engine: "openclaw",
      installed: data.installed,
      running: data.gatewayReachable,
      version: data.cliVersion,
      summary: state.pendingGatewayApply ? appendGatewayApplyMessage(data.summary) : data.summary,
      pendingGatewayApply: state.pendingGatewayApply === true,
      pendingGatewayApplySummary: state.pendingGatewayApply ? state.pendingGatewayApplySummary ?? summarizePendingGatewayApply() : undefined,
      lastCheckedAt: new Date().toISOString()
    };
  }

  async getDeploymentTargets(): Promise<DeploymentTargetsResponse> {
    const [managedCommand, systemCommand] = await Promise.all([
      resolveManagedOpenClawCommand(),
      resolveSystemOpenClawCommand()
    ]);
    const activeCommand = await resolveOpenClawCommand();
    const [managedVersion, systemVersion, managedUpdate, systemUpdate] = await Promise.all([
      readVersionFromCommand(managedCommand),
      readVersionFromCommand(systemCommand),
      readUpdateStatusFromCommand(managedCommand),
      readUpdateStatusFromCommand(systemCommand)
    ]);
    const systemCompatible = isOpenClawVersionCompatible(systemVersion);
    const managedCompatible = isOpenClawVersionCompatible(managedVersion);

    const targets: DeploymentTargetStatus[] = [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "Reuse an existing OpenClaw install when available.",
        installMode: "system",
        installed: Boolean(systemVersion),
        installable: true,
        planned: false,
        recommended: true,
        active: Boolean(systemCommand && activeCommand === systemCommand),
        version: systemVersion,
        desiredVersion: OPENCLAW_INSTALL_TARGET,
        latestVersion: systemUpdate?.latestVersion ?? systemVersion,
        updateAvailable: systemUpdate?.updateAvailable ?? false,
        requirements: STANDARD_OPENCLAW_REQUIREMENTS,
        requirementsSourceUrl: OPENCLAW_MAC_DOCS_URL,
        summary: systemVersion
          ? OPENCLAW_VERSION_OVERRIDE
            ? systemCompatible
              ? `System OpenClaw ${systemVersion} meets SlackClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
              : `System OpenClaw ${systemVersion} is installed, but SlackClaw expects at least ${OPENCLAW_VERSION_OVERRIDE}.`
            : `System OpenClaw ${systemVersion} is installed and can be reused.`
          : "No system OpenClaw install was detected.",
        updateSummary: systemVersion ? systemUpdate?.summary : undefined
      },
      {
        id: "managed-local",
        title: "OpenClaw Managed Local",
        description: "Deploy a SlackClaw-managed local runtime under the app data directory.",
        installMode: "managed-local",
        installed: Boolean(managedVersion),
        installable: true,
        planned: false,
        recommended: false,
        active: Boolean(managedCommand && activeCommand === managedCommand),
        version: managedVersion,
        desiredVersion: OPENCLAW_INSTALL_TARGET,
        latestVersion: managedUpdate?.latestVersion ?? managedVersion,
        updateAvailable: managedUpdate?.updateAvailable ?? false,
        requirements: MANAGED_OPENCLAW_REQUIREMENTS,
        requirementsSourceUrl: OPENCLAW_INSTALL_DOCS_URL,
        summary: managedVersion
          ? OPENCLAW_VERSION_OVERRIDE
            ? managedCompatible
              ? `Managed local OpenClaw ${managedVersion} meets SlackClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
              : `Managed local OpenClaw ${managedVersion} is installed, but SlackClaw expects at least ${OPENCLAW_VERSION_OVERRIDE}.`
            : `Managed local OpenClaw ${managedVersion} is installed.`
          : "SlackClaw's managed local OpenClaw runtime is not installed yet.",
        updateSummary: managedVersion ? managedUpdate?.summary : undefined
      },
      {
        id: "zeroclaw",
        title: "ZeroClaw",
        description: "Reserved future engine adapter target.",
        installMode: "future",
        installed: false,
        installable: false,
        planned: true,
        recommended: false,
        active: false,
        updateAvailable: false,
        requirements: [],
        summary: "Planned future adapter."
      },
      {
        id: "ironclaw",
        title: "IronClaw",
        description: "Reserved future engine adapter target.",
        installMode: "future",
        installed: false,
        installable: false,
        planned: true,
        recommended: false,
        active: false,
        updateAvailable: false,
        requirements: [],
        summary: "Planned future adapter."
      }
    ];

    return {
      checkedAt: new Date().toISOString(),
      targets
    };
  }

  async updateDeploymentTarget(targetId: "standard" | "managed-local"): Promise<DeploymentTargetActionResponse> {
    const targetLabel = targetId === "standard" ? "System OpenClaw" : "Managed local OpenClaw";
    const command =
      targetId === "standard"
        ? await resolveSystemOpenClawCommand()
        : await resolveManagedOpenClawCommand();

    if (!command) {
      await logSoftFailure("SlackClaw could not update an OpenClaw deployment target because the runtime is missing.", {
        targetId,
        targetLabel
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} is not installed on this Mac.`,
        engineStatus: await this.status()
      };
    }

    const beforeVersion = await readVersionFromCommand(command);
    const beforeStatus = await readUpdateStatusFromCommand(command);
    const updateResult = await runCommand(command, ["update", "--json", "--yes", "--no-restart", "--tag", "latest"], {
      allowFailure: true
    });
    invalidateResolvedCommandByPath(command);
    invalidateCommandResolutionCache(targetId === "standard" ? "openclaw:system" : "openclaw:managed");
    invalidateReadCache("engine:", "command:version:", "command:update:");
    const refreshedCommand =
      targetId === "standard"
        ? await resolveSystemOpenClawCommand({ fresh: true })
        : await resolveManagedOpenClawCommand({ fresh: true });
    const effectiveCommand = refreshedCommand ?? command;
    const afterVersion = await readVersionFromCommand(effectiveCommand, { fresh: true });
    const afterStatus = await readUpdateStatusFromCommand(effectiveCommand, { fresh: true });
    const parsedUpdateResult =
      safeJsonPayloadParse<{ targetVersion?: string; currentVersion?: string }>(updateResult.stdout) ??
      safeJsonPayloadParse<{ targetVersion?: string; currentVersion?: string }>(updateResult.stderr);
    const expectedVersion = parsedUpdateResult?.targetVersion?.trim() || beforeStatus?.latestVersion?.trim();
    const versionAdvanced =
      compareOpenClawVersions(afterVersion, beforeVersion) ??
      (afterVersion && beforeVersion ? (afterVersion === beforeVersion ? 0 : 1) : undefined);
    const stillBehindExpectedVersion =
      compareOpenClawVersions(afterVersion, expectedVersion) ??
      (afterVersion && expectedVersion ? (afterVersion === expectedVersion ? 0 : -1) : undefined);

    if (updateResult.code !== 0) {
      await logSoftFailure("SlackClaw failed to update an installed OpenClaw deployment target.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        stderr: updateResult.stderr,
        stdout: updateResult.stdout
      });
      return {
        targetId,
        status: "failed",
        message: updateResult.stderr || updateResult.stdout || `${targetLabel} update failed.`,
        engineStatus: await this.status()
      };
    }

    if (beforeStatus?.updateAvailable && beforeVersion && (!afterVersion || (versionAdvanced ?? 0) <= 0)) {
      await logSoftFailure("SlackClaw attempted an OpenClaw update but the installed version did not change.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        expectedVersion,
        stdout: updateResult.stdout,
        stderr: updateResult.stderr
      });
      return {
        targetId,
        status: "failed",
        message: expectedVersion
          ? `${targetLabel} update finished, but the active version is still ${afterVersion ?? beforeVersion} instead of ${expectedVersion}.`
          : `${targetLabel} update did not change the installed version. It is still ${afterVersion ?? beforeVersion}.`,
        engineStatus: await this.status()
      };
    }

    if (
      beforeStatus?.updateAvailable &&
      expectedVersion &&
      afterVersion &&
      afterStatus?.updateAvailable &&
      (stillBehindExpectedVersion ?? -1) < 0
    ) {
      await logSoftFailure("SlackClaw attempted an OpenClaw update but the active binary is still behind the expected version.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        expectedVersion,
        stdout: updateResult.stdout,
        stderr: updateResult.stderr
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} update finished, but the active version is still ${afterVersion} and SlackClaw expected at least ${expectedVersion}.`,
        engineStatus: await this.status()
      };
    }

    const restart = await runCommand(effectiveCommand, ["gateway", "restart"], { allowFailure: true });

    if (restart.code !== 0) {
      await logSoftFailure("SlackClaw updated OpenClaw but could not restart the gateway afterward.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        stdout: restart.stdout,
        stderr: restart.stderr
      });
      return {
        targetId,
        status: "failed",
        message: restart.stderr || restart.stdout || `${targetLabel} updated, but SlackClaw could not restart the OpenClaw gateway.`,
        engineStatus: await this.status()
      };
    }

    invalidateReadCache("engine:", "command:version:", "command:update:");
    const finalVersion = await readVersionFromCommand(effectiveCommand, { fresh: true });
    const finalStatus = await readUpdateStatusFromCommand(effectiveCommand, { fresh: true });
    const finalVersionAdvanced =
      compareOpenClawVersions(finalVersion, beforeVersion) ??
      (finalVersion && beforeVersion ? (finalVersion === beforeVersion ? 0 : 1) : undefined);
    const finalStillBehindExpectedVersion =
      compareOpenClawVersions(finalVersion, expectedVersion) ??
      (finalVersion && expectedVersion ? (finalVersion === expectedVersion ? 0 : -1) : undefined);

    if (beforeStatus?.updateAvailable && beforeVersion && (!finalVersion || (finalVersionAdvanced ?? 0) <= 0)) {
      await logSoftFailure("SlackClaw updated and restarted OpenClaw, but the active version reverted afterward.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        finalVersion,
        expectedVersion
      });
      return {
        targetId,
        status: "failed",
        message: expectedVersion
          ? `${targetLabel} update ran, but after restart the active version is still ${finalVersion ?? beforeVersion} instead of ${expectedVersion}.`
          : `${targetLabel} update ran, but after restart the active version is still ${finalVersion ?? beforeVersion}.`,
        engineStatus: await this.status()
      };
    }

    if (
      beforeStatus?.updateAvailable &&
      expectedVersion &&
      finalVersion &&
      finalStatus?.updateAvailable &&
      (finalStillBehindExpectedVersion ?? -1) < 0
    ) {
      await logSoftFailure("SlackClaw updated and restarted OpenClaw, but the active version stayed behind the expected version.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        beforeVersion,
        afterVersion,
        finalVersion,
        expectedVersion
      });
      return {
        targetId,
        status: "failed",
        message: `${targetLabel} update ran, but after restart the active version is still ${finalVersion} and SlackClaw expected at least ${expectedVersion}.`,
        engineStatus: await this.status()
      };
    }

    const message =
      afterVersion && beforeVersion && afterVersion !== beforeVersion
        ? `${targetLabel} updated from ${beforeVersion} to ${finalVersion ?? afterVersion}.`
        : finalVersion
          ? `${targetLabel} update completed. Current version: ${finalVersion}.`
          : `${targetLabel} update completed.`;
    let engineStatus: EngineStatus;

    try {
      engineStatus = await this.waitForGatewayReachable(`${targetLabel} update`);
    } catch (error) {
      const fallbackStatus = await this.status();
      await logSoftFailure("SlackClaw restarted the OpenClaw gateway after update, but it is still not reachable.", {
        targetId,
        targetLabel,
        command: effectiveCommand,
        finalVersion,
        summary: error instanceof Error ? error.message : fallbackStatus.summary
      });
      return {
        targetId,
        status: "failed",
        message:
          (error instanceof Error ? error.message : fallbackStatus.summary) ||
          `${targetLabel} updated, but the OpenClaw gateway is still not reachable after restart.`,
        engineStatus: fallbackStatus
      };
    }

    return {
      targetId,
      status: "completed",
      message: `${message} OpenClaw gateway restarted and is reachable. SlackClaw verified the version again after restart.`,
      engineStatus
    };
  }

  async healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]> {
    const data = await this.collectStatusData();
    const state = await readAdapterState();
    const effectiveProfile = selectedProfileId ?? state.configuredProfileId;
    const checks: HealthCheckResult[] = [];

    checks.push({
      id: "engine-cli",
      title: "OpenClaw CLI",
      severity: data.installed ? "ok" : "error",
      summary: data.installed ? `OpenClaw ${data.cliVersion ?? "detected"} is installed.` : "OpenClaw CLI is missing.",
      detail: data.installed
        ? "SlackClaw can invoke the upstream CLI."
        : "Install OpenClaw before SlackClaw can perform onboarding or tasks.",
      remediationActionIds: data.installed ? [] : ["reinstall-engine"]
    });

    checks.push({
      id: "gateway-service",
      title: "Gateway service",
      severity: data.gatewayReachable ? "ok" : data.gatewayInstalled ? "warning" : "error",
      summary: data.gatewayReachable
        ? "Gateway is reachable."
        : data.gatewayInstalled
          ? "Gateway service is installed but not reachable."
          : "Gateway service is not installed.",
      detail: data.gatewayDetail,
      remediationActionIds: data.gatewayReachable
        ? []
        : data.gatewayInstalled
          ? ["restart-engine", "reinstall-engine"]
          : ["reinstall-engine"]
    });

    checks.push({
      id: "version-compatibility",
      title: "Version compatibility",
      severity: isOpenClawVersionCompatible(data.cliVersion) ? "ok" : data.cliVersion ? "warning" : "info",
      summary: openClawVersionSummary(data.cliVersion),
      detail: OPENCLAW_VERSION_OVERRIDE
        ? "SlackClaw is running with an explicit OpenClaw version override."
        : "SlackClaw uses the latest available OpenClaw release for new installs.",
      remediationActionIds: OPENCLAW_VERSION_OVERRIDE && !isOpenClawVersionCompatible(data.cliVersion) ? ["rollback-update"] : []
    });

    checks.push({
      id: "default-profile",
      title: "SlackClaw defaults",
      severity: effectiveProfile ? "ok" : "info",
      summary: effectiveProfile ? `Default profile set to ${effectiveProfile}.` : "No SlackClaw onboarding profile selected yet.",
      detail: effectiveProfile
        ? "SlackClaw can apply office-work defaults to new tasks."
        : "Complete onboarding so SlackClaw can choose a beginner-friendly default workflow.",
      remediationActionIds: effectiveProfile ? [] : ["repair-config"]
    });

    if (data.providersMissingCount > 0) {
      checks.push({
        id: "provider-auth",
        title: "Provider authentication",
        severity: "warning",
        summary: `${data.providersMissingCount} model provider profile(s) are missing auth.`,
        detail: data.providersMissingDetail,
        remediationActionIds: ["repair-config", "export-diagnostics"]
      });
    }

    for (const finding of data.securityFindings.slice(0, 3)) {
      checks.push({
        id: finding.checkId ?? `security-${randomUUID()}`,
        title: finding.title ?? "Security audit finding",
        severity: finding.severity === "critical" ? "error" : finding.severity === "warn" ? "warning" : "info",
        summary: finding.title ?? "Security audit reported an issue.",
        detail: [finding.detail, finding.remediation].filter(Boolean).join(" "),
        remediationActionIds: ["export-diagnostics"]
      });
    }

    return checks;
  }

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    const startedAt = new Date().toISOString();
    const state = await readAdapterState();
    const installed = Boolean(await resolveOpenClawCommand());
    const title = createTaskTitle(request);

    if (!installed) {
      await logSoftFailure("SlackClaw task execution failed because OpenClaw is not installed.", {
        profileId: request.profileId,
        memberId: request.memberId,
        memberAgentId: request.memberAgentId
      });
      return {
        taskId: randomUUID(),
        title,
        status: "failed",
        summary: "OpenClaw is not installed.",
        output: "Install OpenClaw before running tasks.",
        nextActions: ["Install OpenClaw", "Use the mock adapter for UI development"],
        startedAt,
        finishedAt: new Date().toISOString(),
        steps: [
          { id: "prepare", label: "Preparing task", status: "done" },
          { id: "execute", label: "Running engine task", status: "done" }
        ]
      };
    }

    const result = await runOpenClaw(
      [
        "agent",
        "--local",
        "--json",
        ...(request.memberAgentId ? ["--agent", request.memberAgentId] : await this.resolveAgentArgs()),
        "--message",
        request.prompt
      ],
      { allowFailure: true }
    );

    const parsed = safeJsonParse<OpenClawAgentJson>(result.stdout);
    const output =
      parsed?.output ??
      parsed?.finalText ??
      parsed?.response ??
      parsed?.message ??
      result.stdout ??
      result.stderr;
    const ok = result.code === 0 && Boolean(output);

    if (!ok) {
      await logSoftFailure("SlackClaw task execution returned a failed OpenClaw response.", {
        profileId: request.profileId,
        memberId: request.memberId,
        memberAgentId: request.memberAgentId,
        code: result.code,
        stderr: result.stderr,
        stdout: result.stdout
      });
    }

    return {
      taskId: randomUUID(),
      title,
      status: ok ? "completed" : "failed",
      summary: ok
        ? `OpenClaw completed the task using profile ${request.profileId}${request.memberId ? ` and AI member ${request.memberId}` : ""}.`
        : "OpenClaw did not return a successful local agent response.",
      output: ok
        ? output
        : [
            "OpenClaw task execution failed.",
            result.stderr || result.stdout || "No output was returned.",
            state.configuredProfileId
              ? `SlackClaw default profile: ${state.configuredProfileId}`
              : "SlackClaw onboarding profile is not configured yet."
          ].join("\n\n"),
      nextActions: ok
        ? ["Refine the prompt", "Save as a reusable workflow", "Export the result"]
        : ["Repair setup defaults", "Restart engine", "Export diagnostics"],
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: [
        { id: "prepare", label: "Preparing task", status: "done" },
        { id: "execute", label: "Running openclaw agent --local", status: "done" },
        { id: "summarize", label: "Formatting response", status: "done" }
      ]
    };
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const snapshot = await readEngineSnapshot({ includeUpdate: true });
    const parsed = snapshot.updateJson;
    const engineStatus = await this.status();

    if (parsed?.availability?.available) {
      return {
        message: `OpenClaw update available: ${parsed.availability.latestVersion ?? "new version detected"} on ${parsed.channel?.label ?? "current channel"}.`,
        engineStatus
      };
    }

    if (parsed?.update?.registry?.error) {
      await logSoftFailure("SlackClaw update check failed during OpenClaw registry lookup.", {
        registryError: parsed.update.registry.error
      });
      return {
        message: `SlackClaw checked for updates, but registry lookup failed: ${parsed.update.registry.error}.`,
        engineStatus
      };
    }

    return {
      message: "SlackClaw verified that no newer OpenClaw version is currently visible.",
      engineStatus
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    if (!(await resolveOpenClawCommand())) {
      await logSoftFailure("SlackClaw recovery failed because OpenClaw CLI is not installed.", {
        actionId: action.id
      });
      return {
        actionId: action.id,
        status: "failed",
        message: "OpenClaw CLI is not installed."
      };
    }

    switch (action.id) {
      case "restart-engine": {
        const restart = await runOpenClaw(["gateway", "restart"], { allowFailure: true });
        if (restart.code !== 0) {
          await logSoftFailure("SlackClaw failed to restart the OpenClaw gateway during recovery.", {
            actionId: action.id,
            stderr: restart.stderr,
            stdout: restart.stdout
          });
        }
        return {
          actionId: action.id,
          status: restart.code === 0 ? "completed" : "failed",
          message: restart.code === 0
            ? "OpenClaw gateway restart completed."
            : restart.stderr || restart.stdout || "OpenClaw gateway restart failed."
        };
      }
      case "repair-config": {
        await this.configure("email-admin");
        const doctor = await runOpenClaw(["doctor", "--repair", "--non-interactive", "--yes"], { allowFailure: true });
        if (doctor.code !== 0) {
          await logSoftFailure("SlackClaw failed to repair the OpenClaw configuration with doctor.", {
            actionId: action.id,
            stderr: doctor.stderr,
            stdout: doctor.stdout
          });
        }
        return {
          actionId: action.id,
          status: doctor.code === 0 ? "completed" : "failed",
          message: doctor.code === 0
            ? "SlackClaw defaults were restored and OpenClaw doctor applied safe repairs."
            : doctor.stderr || doctor.stdout || "OpenClaw doctor could not complete repairs."
        };
      }
      case "rollback-update": {
        const updateStatus = await runOpenClaw(["update", "status", "--json"], { allowFailure: true });
        const parsed = safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateStatus.stdout) ?? safeJsonPayloadParse<OpenClawUpdateStatusJson>(updateStatus.stderr);
        return {
          actionId: action.id,
          status: "completed",
          message: parsed?.availability?.available
            ? `SlackClaw detected update drift. Manual reinstall of ${openClawInstallTargetSummary()} is recommended until automated rollback is added.`
            : "OpenClaw update state looks consistent; no rollback was needed."
        };
      }
      case "reinstall-engine": {
        const bootstrap = await this.ensurePinnedOpenClaw("auto");
        const reinstall = await runOpenClaw(["gateway", "install", "--force"], { allowFailure: true });
        const installStatus = bootstrap.status !== "failed" && reinstall.code === 0 ? "completed" : "failed";
        if (installStatus === "failed") {
          await logSoftFailure("SlackClaw failed to reinstall the OpenClaw gateway during recovery.", {
            actionId: action.id,
            bootstrap,
            stderr: reinstall.stderr,
            stdout: reinstall.stdout
          });
        }
        return {
          actionId: action.id,
          status: installStatus,
          message: installStatus === "completed"
            ? `${bootstrap.message} OpenClaw gateway service was reinstalled.`
            : bootstrap.status === "failed"
              ? bootstrap.message
              : reinstall.stderr || reinstall.stdout || "OpenClaw gateway reinstall failed."
        };
      }
      case "export-diagnostics":
        return {
          actionId: action.id,
          status: "completed",
          message: "Diagnostics are ready for export."
        };
      default:
        await logSoftFailure("SlackClaw received an unsupported recovery action.", {
          actionId: action.id
        });
        return {
          actionId: action.id,
          status: "failed",
          message: "Unsupported recovery action."
        };
    }
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    const [status, health, snapshot] = await Promise.all([
      this.status(),
      this.healthCheck(),
      readEngineSnapshot({ includeUpdate: true })
    ]);

    return {
      filename: "slackclaw-diagnostics.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          installSpec: this.installSpec,
          status,
          health,
          raw: {
            gatewayStatus: snapshot.gatewayJson,
            updateStatus: snapshot.updateJson
          }
        },
        null,
        2
      )
    };
  }

  async getChannelState(channelId: SupportedChannelId): Promise<ChannelSetupState> {
    if (activeChannelLoginSession?.channelId === channelId) {
      return createChannelState(channelId, {
        status: activeChannelLoginSession.status,
        summary:
          activeChannelLoginSession.status === "failed"
            ? `${sessionTitle(channelId)} login session failed.`
            : activeChannelLoginSession.status === "completed"
              ? `${sessionTitle(channelId)} login session completed.`
              : activeChannelLoginSession.status === "awaiting-pairing"
                ? channelId === "whatsapp"
                  ? "WhatsApp login is waiting for pairing approval."
                  : "WeChat login is waiting for QR confirmation."
                : `${sessionTitle(channelId)} login is running.`,
        detail:
          activeChannelLoginSession.logs.at(-1) ??
          (channelId === "whatsapp"
            ? "Scan the QR code or follow the WhatsApp login instructions shown by OpenClaw."
            : "Scan the QR code or follow the WeChat installer instructions shown in the session log."),
        logs: activeChannelLoginSession.logs.slice(-20)
      });
    }

    const snapshot = await readChannelSnapshot();
    return deriveLiveChannelState(channelId, snapshot.list, snapshot.status);
  }

  async getConfiguredChannelEntries(): Promise<ConfiguredChannelEntry[]> {
    const snapshot = await readChannelSnapshot();
    return buildLiveChannelEntries(snapshot.list, snapshot.status);
  }

  async getPluginConfigOverview(): Promise<PluginConfigOverview> {
    const channelEntries = await this.getConfiguredChannelEntries();
    const configSnapshot = await this.readOpenClawConfigSnapshot();

    return {
      entries: await Promise.all(
        listManagedPluginDefinitions().map(async (definition) => {
          const inspected = await inspectPlugin(definition.runtimePluginId);
          const channelConfiguredInFile = managedPluginConfigKeys(definition).some((key) =>
            Boolean(configSnapshot.config.channels?.[key])
          );
          const dependencyStates = definition.dependencies.map((dependency) => ({
            ...dependency,
            active:
              dependency.id === "channel:wechat-work"
                ? channelConfiguredInFile || channelEntries.some((entry) => entry.channelId === "wechat-work")
                : false
          }));
          const activeDependentCount = dependencyStates.filter((dependency) => dependency.active).length;
          const enabled = inspected.entries.some((entry) => entry.enabled !== false);
          const installed = inspected.entries.length > 0;
          const hasError = Boolean(inspected.loadError || inspected.duplicate);
          const hasUpdate =
            inspected.entries.some((entry) => (entry.status ?? "").toLowerCase().includes("update")) ||
            inspected.diagnostics.some((diagnostic) => /update available/i.test(diagnostic.message ?? ""));

          return {
            id: definition.id,
            label: definition.label,
            packageSpec: definition.packageSpec,
            runtimePluginId: definition.runtimePluginId,
            configKey: definition.configKey,
            status:
              hasError
                ? "error"
                : !installed
                  ? "missing"
                  : hasUpdate
                    ? "update-available"
                    : enabled
                      ? "ready"
                      : "blocked",
            summary: hasError
              ? `${definition.label} has a plugin load problem.`
              : !installed
                ? `${definition.label} is not installed.`
                : hasUpdate
                  ? `${definition.label} has an update available.`
                : enabled
                  ? `${definition.label} is ready.`
                  : `${definition.label} is installed but disabled.`,
            detail: hasError
              ? inspected.loadError ?? "OpenClaw reported duplicate or invalid plugin state."
              : activeDependentCount > 0
                ? `${definition.dependencies[0]?.label ?? "A managed feature"} currently depends on this plugin.`
                : "Plugin is managed by ChillClaw and ready for feature use.",
            enabled,
            installed,
            hasUpdate,
            hasError,
            activeDependentCount,
            dependencies: dependencyStates
          };
        })
      )
    };
  }

  async ensureFeatureRequirements(
    featureId: string,
    options?: { deferGatewayRestart?: boolean }
  ): Promise<PluginConfigOverview> {
    const definition = managedPluginDefinitionForFeature(featureId as "channel:wechat-work");
    if (!definition) {
      return this.getPluginConfigOverview();
    }

    const inspected = await inspectPlugin(definition.runtimePluginId);
    if (inspected.loadError) {
      throw new Error(
        `${definition.label} failed to load: ${inspected.loadError}. Repair the installed plugin first, then retry the feature setup.`
      );
    }

    let changed = false;
    if (inspected.entries.length === 0) {
      const install = await runOpenClaw(["plugins", "install", definition.packageSpec], { allowFailure: true });
      if (install.code !== 0) {
        throw new Error(install.stderr || install.stdout || `ChillClaw could not install ${definition.packageSpec}.`);
      }
      changed = true;
    } else {
      const update = await runOpenClaw(["plugins", "update", definition.runtimePluginId, "--yes"], { allowFailure: true });
      if (update.code === 0) {
        const output = `${update.stdout}\n${update.stderr}`.toLowerCase();
        if (!/already up[- ]to[- ]date|no updates|already current/.test(output)) {
          changed = true;
        }
      }
    }

    const enable = await runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code === 0) {
      const output = `${enable.stdout}\n${enable.stderr}`.toLowerCase();
      if (!/already enabled/.test(output)) {
        changed = true;
      }
    } else {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not enable ${definition.label}.`);
    }

    if (changed) {
      if (options?.deferGatewayRestart) {
        await this.markGatewayApplyPending();
      } else {
        await this.restartGatewayAndRequireHealthy(`${definition.label} preparation`);
      }
    }

    this.invalidateReadCaches(["plugins", "channels"]);
    return this.getPluginConfigOverview();
  }

  async installPlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const install = await runOpenClaw(["plugins", "install", definition.packageSpec], { allowFailure: true });
    if (install.code !== 0) {
      throw new Error(install.stderr || install.stdout || `ChillClaw could not install ${definition.packageSpec}.`);
    }

    const enable = await runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code !== 0) {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not enable ${definition.label}.`);
    }

    await this.restartGatewayAndRequireHealthy(`${definition.label} installation`);

    this.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw installed ${definition.label} and verified the gateway restart.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  async updatePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const update = await runOpenClaw(["plugins", "update", definition.runtimePluginId, "--yes"], { allowFailure: true });
    if (update.code !== 0) {
      throw new Error(update.stderr || update.stdout || `ChillClaw could not update ${definition.label}.`);
    }

    const enable = await runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code !== 0) {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not re-enable ${definition.label}.`);
    }

    await this.restartGatewayAndRequireHealthy(`${definition.label} update`);

    this.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw updated ${definition.label} and verified the gateway restart.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  async removePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const overview = await this.getPluginConfigOverview();
    const entry = overview.entries.find((item) => item.id === pluginId);
    if ((entry?.activeDependentCount ?? 0) > 0) {
      throw new Error(`${definition.label} is still required by an active managed feature.`);
    }

    const uninstall = await runOpenClaw(["plugins", "uninstall", definition.runtimePluginId], { allowFailure: true });
    if (uninstall.code !== 0) {
      throw new Error(uninstall.stderr || uninstall.stdout || `ChillClaw could not remove ${definition.label}.`);
    }

    await this.removeManagedPluginConfigEntry(definition.runtimePluginId);
    for (const channelKey of managedPluginConfigKeys(definition)) {
      await this.removeChannelConfig(channelKey);
    }
    await this.restartGatewayAndRequireHealthy(`${definition.label} removal`);

    this.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw removed ${definition.label} and cleaned its managed config.`,
      pluginConfig: await this.getPluginConfigOverview()
    };
  }

  async getActiveChannelSession(): Promise<ChannelSession | undefined> {
    return activeChannelSession();
  }

  async getChannelSession(sessionId: string): Promise<ChannelSession> {
    const session = activeChannelSession();

    if (!session || session.id !== sessionId) {
      throw new Error("Channel session not found.");
    }

    return session;
  }

  async submitChannelSessionInput(sessionId: string, request: ChannelSessionInputRequest): Promise<ChannelSession> {
    const session = await this.getChannelSession(sessionId);

    if (session.channelId === "whatsapp") {
      await this.approvePairing("whatsapp", { code: request.value });
      return (await this.getActiveChannelSession()) ?? {
        ...session,
        status: "completed",
        message: "WhatsApp pairing approved.",
        logs: [...session.logs, "WhatsApp pairing approved."]
      };
    }

    if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "wechat") {
      throw new Error("WeChat login session not found.");
    }

    if (activeChannelLoginSession.child?.stdin && !activeChannelLoginSession.child.stdin.destroyed) {
      activeChannelLoginSession.child.stdin.write(`${request.value}\n`);
      activeChannelLoginSession.logs.push("Submitted follow-up WeChat input to the installer.");
    } else {
      activeChannelLoginSession.logs.push("SlackClaw recorded the WeChat follow-up input, but the installer is no longer accepting stdin.");
    }

    return (await this.getActiveChannelSession()) ?? session;
  }

  private async saveChannelEntry(
    request: SaveChannelEntryRequest
  ): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession; requiresGatewayApply?: boolean }> {
    switch (request.channelId) {
      case "telegram":
        if (request.action === "approve-pairing") {
          return this.approvePairing("telegram", { code: request.values.code ?? "" });
        }

        return this.configureTelegram({
          token: request.values.token ?? "",
          accountName: request.values.accountName
        });
      case "whatsapp":
        if (request.action === "approve-pairing") {
          return this.approvePairing("whatsapp", { code: request.values.code ?? "" });
        }

        {
          const result = await this.startWhatsappLogin();
          return {
            ...result,
            session: await this.getActiveChannelSession()
          };
        }
      case "feishu":
        if (request.action === "prepare") {
          return this.prepareFeishu();
        }

        if (request.action === "approve-pairing") {
          return this.approvePairing("feishu", { code: request.values.code ?? "" });
        }

        return this.configureFeishu({
          appId: request.values.appId ?? "",
          appSecret: request.values.appSecret ?? "",
          domain: request.values.domain,
          botName: request.values.botName
        });
      case "wechat-work":
        return this.configureWechatWorkaround({
          botId: request.values.botId ?? "",
          secret: request.values.secret ?? ""
        });
      case "wechat":
        {
          const result = await this.startWechatLogin();
          return {
            ...result,
            session: await this.getActiveChannelSession()
          };
        }
      default:
        throw new Error("Unsupported channel.");
    }
  }

  async removeChannelEntry(
    request: RemoveChannelEntryRequest
  ): Promise<{ message: string; channelId: SupportedChannelId; requiresGatewayApply?: boolean }> {
    const channelId = request.channelId ?? channelIdFromEntryId(request.entryId);

    if (channelId === "whatsapp") {
      await runOpenClaw(["channels", "logout", "--channel", "whatsapp", "--account", "default"], { allowFailure: true });
      const remove = await runOpenClaw(["channels", "remove", "--channel", "whatsapp", "--account", "default", "--delete"], { allowFailure: true });

      if (remove.code !== 0) {
        throw new Error(remove.stderr || remove.stdout || "SlackClaw could not remove the WhatsApp configuration.");
      }

      activeChannelLoginSession = undefined;
    } else if (channelId === "telegram") {
      const remove = await this.runMutationWithConfigFallback({
        commandArgs: ["channels", "remove", "--channel", "telegram", "--account", "default", "--delete"],
        fallbackDescription: "channels.telegram remove",
        fallbackPatterns: ["Unknown channel: telegram"],
        applyFallback: async () => {
          await this.removeChannelConfig("telegram");
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "SlackClaw could not remove the Telegram configuration.");
      }
    } else if (channelId === "feishu") {
      const remove = await this.runMutationWithConfigFallback({
        commandArgs: ["config", "unset", "channels.feishu"],
        fallbackDescription: "channels.feishu remove",
        applyFallback: async () => {
          await this.removeChannelConfig("feishu");
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "SlackClaw could not remove the Feishu configuration.");
      }
    } else if (channelId === "wechat-work") {
      const wechatPlugin = managedPluginDefinitionForFeature("channel:wechat-work");
      if (!wechatPlugin) {
        throw new Error("Managed WeChat plugin definition is missing.");
      }
      const remove = await this.runMutationWithConfigFallback({
        commandArgs: ["config", "unset", `channels.${wechatPlugin.configKey}`],
        fallbackDescription: `channels.${wechatPlugin.configKey} remove`,
        applyFallback: async () => {
          for (const channelKey of managedPluginConfigKeys(wechatPlugin)) {
            await this.removeChannelConfig(channelKey);
          }
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "SlackClaw could not remove the WeChat configuration.");
      }
    } else {
      activeChannelLoginSession = undefined;
      await this.removeChannelConfig("wechat");
    }

    await this.markGatewayApplyPending();

    return {
      message: appendGatewayApplyMessage(
        `${channelId === "wechat-work" ? "WeChat Work" : channelId === "wechat" ? "WeChat" : channelId[0].toUpperCase() + channelId.slice(1)} configuration removed.`
      ),
      channelId,
      requiresGatewayApply: true
    };
  }

  private async saveAIMemberRuntime(request: AIMemberRuntimeRequest): Promise<AIMemberRuntimeState & { requiresGatewayApply?: boolean }> {
    const agentId =
      request.existingAgentId ??
      resolveReadableMemberAgentId(
      request.name,
        (await this.listOpenClawAgents()).map((agent) => agent.id).filter((agentId): agentId is string => Boolean(agentId))
      );
    const { agentDir, workspaceDir, created } = await this.ensureMemberAgent(request.memberId, agentId, request.brain);

    await this.setMemberIdentity(agentId, request);
    await rm(resolve(workspaceDir, "knowledge"), { recursive: true, force: true }).catch(() => undefined);
    await writeMemberWorkspaceFiles(request, workspaceDir, { createBootstrap: created });
    await this.syncMemberBrain(request, agentId, agentDir, workspaceDir);
    await runOpenClaw(["memory", "index", "--agent", agentId, "--force"], { allowFailure: true });
    await this.markGatewayApplyPending();
    invalidateReadCache("agents:list", `agents:bindings:${agentId}`, "skills:");

    const agents = await this.listOpenClawAgents();
    if (!agents.some((agent) => agent.id === agentId)) {
      throw new Error(`SlackClaw could not verify the AI member agent ${agentId}.`);
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

    const result = await runOpenClaw(["agents", "bind", "--agent", agentId, "--bind", request.binding, "--json"], { allowFailure: true });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not bind ${request.binding} to ${agentId}.`);
    }

    await this.markGatewayApplyPending();
    invalidateReadCache(`agents:bindings:${agentId}`);
    return {
      bindings: await this.readMemberBindings(agentId),
      requiresGatewayApply: true
    };
  }

  async unbindAIMemberChannel(
    agentId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }> {
    if (!agentId) {
      throw new Error("AI member agent is missing.");
    }

    const result = await runOpenClaw(["agents", "unbind", "--agent", agentId, "--bind", request.binding, "--json"], { allowFailure: true });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not unbind ${request.binding} from ${agentId}.`);
    }

    await this.markGatewayApplyPending();
    invalidateReadCache(`agents:bindings:${agentId}`);
    return {
      bindings: await this.readMemberBindings(agentId),
      requiresGatewayApply: true
    };
  }

  async deleteAIMemberRuntime(agentId: string, request: DeleteAIMemberRequest): Promise<{ requiresGatewayApply?: boolean }> {
    if (!agentId) {
      return { requiresGatewayApply: false };
    }

    const agents = await this.listOpenClawAgents();
    const existing = agents.find((agent) => agent.id === agentId);

    if (!existing) {
      return { requiresGatewayApply: false };
    }

    const result = await runOpenClaw(["agents", "delete", agentId, "--force", "--json"], { allowFailure: true });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not delete the AI member agent ${agentId}.`);
    }

    if (request.deleteMode === "full" && existing.workspace) {
      await rm(existing.workspace, { recursive: true, force: true }).catch(() => undefined);
    }

    if (request.deleteMode === "full" && existing.agentDir) {
      await rm(dirname(existing.agentDir), { recursive: true, force: true }).catch(() => undefined);
    }

    await this.markGatewayApplyPending();
    invalidateReadCache("agents:list", `agents:bindings:${agentId}`);

    const remaining = await this.listOpenClawAgents();
    if (remaining.some((agent) => agent.id === agentId)) {
      throw new Error(`SlackClaw could not verify deletion of AI member agent ${agentId}.`);
    }

    return { requiresGatewayApply: true };
  }

  async getChatThreadDetail(request: { agentId: string; threadId: string; sessionKey: string }): Promise<ChatThreadDetail> {
    const { result, payload } = await runGatewayCall<OpenClawChatHistoryJson>(
      "chat.history",
      {
        sessionKey: request.sessionKey,
        limit: 200
      },
      { allowFailure: true, timeoutMs: 20000 }
    );

    if (result.code !== 0 || !payload) {
      throw new Error(result.stderr || result.stdout || "SlackClaw could not load chat history from OpenClaw.");
    }

    return {
      id: request.threadId,
      memberId: "",
      agentId: request.agentId,
      sessionKey: request.sessionKey,
      title: "",
      createdAt: "",
      updatedAt: "",
      unreadCount: 0,
      historyStatus: "ready",
      composerState: {
        status: "idle",
        canSend: true,
        canAbort: false
      },
      messages: collapseVisibleChatMessages(
        (payload.messages ?? []).flatMap((message, index) => {
          const mapped = toChatMessage(message, index);
          return mapped ? [mapped] : [];
        })
      )
    };
  }

  private async subscribeToLiveChatEvents(listener: (event: EngineChatLiveEvent) => void): Promise<() => void> {
    return gatewaySocketBridge.subscribe(listener);
  }

  async sendChatMessage(
    request: SendChatMessageRequest & { agentId: string; threadId: string; sessionKey: string }
  ): Promise<{ runId?: string }> {
    const { result, payload } = await runGatewayCall<{ runId?: string }>(
      "chat.send",
      {
        sessionKey: request.sessionKey,
        message: request.message,
        idempotencyKey: request.clientMessageId ?? randomUUID()
      },
      {
        allowFailure: true,
        timeoutMs: 30000
      }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not send the message for ${request.threadId}.`);
    }

    return {
      runId: payload?.runId
    };
  }

  async abortChatMessage(request: AbortChatRequest & { agentId: string; threadId: string; sessionKey: string }): Promise<void> {
    const { result } = await runGatewayCall(
      "chat.abort",
      {
        sessionKey: request.sessionKey
      },
      {
        allowFailure: true,
        timeoutMs: 15000
      }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not stop the active reply for ${request.threadId}.`);
    }
  }

  async prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }> {
    const pluginSpec = "@openclaw/feishu";
    const cliVersion = await readInstalledOpenClawVersion();
    const feishuPlugin = await inspectPlugin("feishu");

    if (feishuPlugin.loadError) {
      await writeErrorLog("OpenClaw Feishu plugin is present but failed to load.", {
        pluginId: "feishu",
        duplicate: feishuPlugin.duplicate,
        entries: feishuPlugin.entries,
        diagnostics: feishuPlugin.diagnostics
      });
      throw new Error(
        `OpenClaw already has a Feishu plugin, but it failed to load: ${feishuPlugin.loadError}. SlackClaw did not install another copy because that would create duplicate plugin warnings. Repair the installed Feishu plugin first, then retry setup.`
      );
    }

    if (feishuPlugin.entries.length > 0) {
      await runOpenClaw(["plugins", "enable", "feishu"], { allowFailure: true });

      if (feishuPlugin.duplicate) {
        await writeInfoLog("SlackClaw detected an existing duplicate Feishu plugin and skipped reinstall.", {
          pluginId: "feishu",
          entries: feishuPlugin.entries,
          diagnostics: feishuPlugin.diagnostics
        });
      }

      return {
        message: feishuPlugin.duplicate
          ? "SlackClaw found an existing Feishu plugin and skipped reinstalling it to avoid another duplicate plugin warning. Continue with the Feishu credential wizard."
          : cliVersion && compareVersionStrings(cliVersion, FEISHU_BUNDLED_SINCE) >= 0
            ? `OpenClaw ${cliVersion} already bundles the official Feishu plugin, so SlackClaw reused it.`
            : "SlackClaw found the official Feishu plugin already installed and ready to use.",
        channel: createChannelState("feishu", {
          status: "ready",
          summary: "Feishu plugin already present.",
          detail: feishuPlugin.duplicate
            ? "OpenClaw already has a Feishu plugin and also reports a duplicate Feishu plugin entry. SlackClaw reused the existing plugin instead of installing another copy. Continue with setup, then clean up the older duplicate plugin copy later."
            : cliVersion && compareVersionStrings(cliVersion, FEISHU_BUNDLED_SINCE) >= 0
              ? `OpenClaw ${cliVersion} already includes the official Feishu plugin. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw.`
              : "The official Feishu plugin is already present. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw."
        })
      };
    }

    if (cliVersion && compareVersionStrings(cliVersion, FEISHU_BUNDLED_SINCE) >= 0) {
      throw new Error(
        `OpenClaw ${cliVersion} should already include the official Feishu plugin, but SlackClaw could not detect a usable Feishu plugin entry. SlackClaw did not run a separate plugin install because newer OpenClaw versions bundle Feishu already. Repair the installed OpenClaw plugin state first, then retry setup.`
      );
    }

    const install = await runOpenClaw(["plugins", "install", pluginSpec], { allowFailure: true });

    if (install.code !== 0) {
      throw new Error(install.stderr || install.stdout || `SlackClaw could not install the official Feishu plugin ${pluginSpec}.`);
    }

    await runOpenClaw(["plugins", "enable", "feishu"], { allowFailure: true });
    await this.restartGatewayAndRequireHealthy("Feishu plugin preparation");

    return {
      message: "SlackClaw ran `openclaw plugins install @openclaw/feishu`, restarted the OpenClaw gateway, and verified it is reachable.",
      channel: createChannelState("feishu", {
        status: "ready",
        summary: "Official Feishu plugin installed.",
        detail: "The plugin is installed and the gateway is reachable. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw."
      })
    };
  }

  private async configureFeishu(
    request: FeishuSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const configSave = await this.runMutationWithConfigFallback({
      commandArgs: [
        "config",
        "set",
        "--strict-json",
        "channels.feishu",
        JSON.stringify({
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
        })
      ],
      fallbackDescription: "channels.feishu config write",
      applyFallback: async () => {
        await this.writeFeishuChannelConfig(request);
      }
    });

    if (!configSave.usedFallback && configSave.result.code !== 0) {
      throw new Error(configSave.result.stderr || configSave.result.stdout || "SlackClaw could not save the Feishu configuration into OpenClaw.");
    }

    await this.markGatewayApplyPending();

    return {
      message:
        "SlackClaw saved your Feishu app credentials into OpenClaw. Apply pending changes from Gateway Manager, then enable long connection, publish the Feishu app, send a test DM, and approve the pairing code in SlackClaw.",
      channel: createChannelState("feishu", {
        status: "awaiting-pairing",
        summary: "Official Feishu plugin configured.",
        detail: `OpenClaw saved the ${request.domain ?? "feishu"} tenant credentials. Apply pending gateway changes, switch Feishu event delivery to long connection, publish the app, send a DM to the bot, then approve the Feishu pairing code in SlackClaw.`
      }),
      requiresGatewayApply: true
    };
  }

  private async configureTelegram(request: TelegramSetupRequest): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const args = ["channels", "add", "--channel", "telegram", "--token", request.token];

    if (request.accountName?.trim()) {
      args.push("--name", request.accountName.trim());
    }

    const result = await this.runMutationWithConfigFallback({
      commandArgs: args,
      fallbackDescription: "channels.telegram config write",
      fallbackPatterns: ["Unknown channel: telegram"],
      applyFallback: async () => {
        await this.writeTelegramChannelConfig(request);
      }
    });

    if (!result.usedFallback && result.result.code !== 0) {
      throw new Error(result.result.stderr || result.result.stdout || "SlackClaw could not save the Telegram channel configuration.");
    }

    await this.markGatewayApplyPending();

    return {
      message: "Telegram bot token saved. Apply pending changes from Gateway Manager, send a message to the bot, then approve the pairing code in SlackClaw.",
      channel: createChannelState("telegram", {
        status: "awaiting-pairing",
        summary: "Telegram token saved.",
        detail: "The Telegram bot is configured. Apply pending gateway changes, send the first message to your bot, then approve the pairing code."
      }),
      requiresGatewayApply: true
    };
  }

  private async startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }> {
    if (activeChannelLoginSession?.channelId === "whatsapp" && activeChannelLoginSession.status === "in-progress") {
      return {
        message: "WhatsApp login is already running.",
        channel: await this.getChannelState("whatsapp")
      };
    }

    await runOpenClaw(["channels", "add", "--channel", "whatsapp", "--name", "SlackClaw WhatsApp"], {
      allowFailure: true
    });
    await this.restartGatewayAndRequireHealthy("WhatsApp configuration");

    activeChannelLoginSession = {
      channelId: "whatsapp",
      entryId: "whatsapp:default",
      startedAt: new Date().toISOString(),
      status: "in-progress",
      logs: ["Starting WhatsApp login. OpenClaw may print a QR code or pairing instructions here."],
      inputPrompt: "Paste the WhatsApp pairing code to finish setup."
    };

    const command = await resolveOpenClawCommand();

    if (!command) {
      throw new Error("OpenClaw CLI is not installed.");
    }

    const loginArgs = ["channels", "login", "--channel", "whatsapp", "--verbose"];
    logExternalCommand(command, loginArgs);
    const child = spawn(command, loginArgs, {
      env: buildCommandEnv(command)
    });
    activeChannelLoginSession.child = child;

    const pushLog = (text: string) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "whatsapp") {
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
      activeChannelLoginSession.logs.push(...lines);
      activeChannelLoginSession.logs = activeChannelLoginSession.logs.slice(-40);
      activeChannelLoginSession.status = "awaiting-pairing";
    };

    child.stdout.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.on("error", (error) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "whatsapp") {
        return;
      }

      activeChannelLoginSession.status = "failed";
      activeChannelLoginSession.logs.push(`Failed to start WhatsApp login: ${error instanceof Error ? error.message : String(error)}`);
      void writeErrorLog("WhatsApp login session failed to start.", errorToLogDetails(error));
    });

    child.on("exit", (code) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "whatsapp") {
        return;
      }

      activeChannelLoginSession.exitCode = code ?? 1;
      activeChannelLoginSession.status = code === 0 ? "awaiting-pairing" : "failed";
      activeChannelLoginSession.logs.push(
        code === 0
          ? "WhatsApp login command finished. If pairing is pending, approve the code below."
          : `WhatsApp login command exited with code ${code ?? 1}.`
      );
    });

    return {
      message: "SlackClaw restarted the OpenClaw gateway, verified it is reachable, and started the WhatsApp login flow. Follow the QR or pairing instructions shown in the session log.",
      channel: await this.getChannelState("whatsapp")
    };
  }

  async approvePairing(
    channelId: "telegram" | "whatsapp" | "feishu",
    request: PairingApprovalRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    const result = await runOpenClaw(["pairing", "approve", channelId, request.code, "--notify"], { allowFailure: true });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not approve the ${channelId} pairing code.`);
    }

    if (channelId === "whatsapp" && activeChannelLoginSession?.channelId === "whatsapp") {
      activeChannelLoginSession.status = "completed";
      activeChannelLoginSession.logs.push("WhatsApp pairing approved.");
    }

    const label = channelId === "telegram" ? "Telegram" : channelId === "whatsapp" ? "WhatsApp" : "Feishu";

    return {
      message: `${label} pairing approved.`,
      channel: createChannelState(channelId, {
        status: "completed",
        summary: `${label} pairing approved.`,
        detail: "This channel is ready for use."
      })
    };
  }

  private async configureWechatWorkaround(
    request: WechatSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const wechatPlugin = managedPluginDefinitionForFeature("channel:wechat-work");
    if (!wechatPlugin) {
      throw new Error("Managed WeChat plugin definition is missing.");
    }

    // Managed plugin config may be written before the gateway restarts and reloads the plugin schema.
    // Write the config file directly so setup does not depend on strict CLI validation.
    logDevelopmentCommand("fallback", "openclaw-config", [`channels.${wechatPlugin.configKey} config write`]);
    await this.writeWechatChannelConfig(wechatPlugin.configKey, request, wechatPlugin.legacyConfigKeys ?? []);
    await this.markGatewayApplyPending();

    return {
      message: "ChillClaw saved the managed WeChat plugin configuration. Apply pending changes from Gateway Manager to make it live.",
      channel: createChannelState("wechat-work", {
        status: "completed",
        summary: "WeChat Work configured.",
        detail: "The managed WeCom plugin is configured. Apply pending gateway changes to make it live."
      }),
      requiresGatewayApply: true
    };
  }

  private async startWechatLogin(): Promise<{ message: string; channel: ChannelSetupState }> {
    if (activeChannelLoginSession?.channelId === "wechat" && activeChannelLoginSession.status === "in-progress") {
      return {
        message: "WeChat login is already running.",
        channel: await this.getChannelState("wechat")
      };
    }

    const env = buildCommandEnv();
    const command = (await resolveCommandFromEnvPath("npx", env)) ?? "npx";

    const installerArgs = ["-y", "@tencent-weixin/openclaw-weixin-cli@latest", "install"];
    logExternalCommand(command, installerArgs);
    const child = spawn(command, installerArgs, {
      env
    });
    let settleStartup: (() => void) | undefined;
    const startupReady = new Promise<void>((resolve) => {
      settleStartup = resolve;
    });
    const startupTimer = setTimeout(() => {
      settleStartup?.();
      settleStartup = undefined;
    }, 200);

    activeChannelLoginSession = {
      channelId: "wechat",
      entryId: "wechat:default",
      startedAt: new Date().toISOString(),
      status: "in-progress",
      logs: [
        `Running installer: ${["npx", ...installerArgs].join(" ")}`,
        "Starting the personal WeChat installer.",
        "Follow the QR code and login guidance printed below."
      ],
      child
    };

    const pushLog = (text: string) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "wechat") {
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
      if (lines.length === 0) {
        return;
      }
      activeChannelLoginSession.logs.push(...lines);
      activeChannelLoginSession.logs = activeChannelLoginSession.logs.slice(-40);
      activeChannelLoginSession.status = "awaiting-pairing";
      settleStartup?.();
      settleStartup = undefined;
    };

    child.stdout.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.on("error", (error) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "wechat") {
        return;
      }

      activeChannelLoginSession.status = "failed";
      activeChannelLoginSession.logs.push(`Failed to start WeChat login: ${error instanceof Error ? error.message : String(error)}`);
      settleStartup?.();
      settleStartup = undefined;
      void writeErrorLog("WeChat login session failed to start.", errorToLogDetails(error));
    });

    child.on("exit", (code) => {
      if (!activeChannelLoginSession || activeChannelLoginSession.channelId !== "wechat") {
        return;
      }

      activeChannelLoginSession.exitCode = code ?? 1;
      activeChannelLoginSession.child = undefined;
      activeChannelLoginSession.status = code === 0 ? "awaiting-pairing" : "failed";
      activeChannelLoginSession.logs.push(
        code === 0
          ? "WeChat installer finished. If login is still pending, continue following the QR or log instructions above."
          : `WeChat installer exited with code ${code ?? 1}.`
      );
      settleStartup?.();
      settleStartup = undefined;
    });

    await startupReady.finally(() => {
      clearTimeout(startupTimer);
    });

    return {
      message:
        "SlackClaw started the personal WeChat installer. Follow the QR-first login instructions in the channel session log.",
      channel: createChannelState("wechat", {
        status: "awaiting-pairing",
        summary: "Personal WeChat login started.",
        detail: "Follow the QR-first WeChat installer logs, then complete any remaining confirmation steps from the session."
      })
    };
  }

  async startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const engineStatus = await this.restartGatewayAndRequireHealthy("channel setup");

    return {
      message: "OpenClaw gateway restarted and is reachable.",
      engineStatus
    };
  }

  async finalizeOnboardingSetup(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const [engineStatus, snapshot] = await Promise.all([this.status(), readEngineSnapshot({ fresh: true })]);
    const gatewayInstalled = Boolean(snapshot.statusJson?.gatewayService?.installed || snapshot.gatewayJson?.service?.installed);

    if (gatewayInstalled && engineStatus.running && !engineStatus.pendingGatewayApply) {
      return {
        message: "OpenClaw gateway is already installed, configured, and reachable.",
        engineStatus
      };
    }

    const finalizedStatus = await this.restartGatewayAndRequireHealthy("onboarding completion");
    return {
      message: "OpenClaw onboarding finalization applied the gateway runtime and verified reachability.",
      engineStatus: finalizedStatus
    };
  }

  private async restartGatewayAndRequireHealthy(reason: string): Promise<EngineStatus> {
    const restart = await runOpenClaw(["gateway", "restart"], { allowFailure: true });

    if (this.gatewayServiceNotLoaded(restart.stdout, restart.stderr)) {
      const install = await runOpenClaw(["gateway", "install", "--json"], { allowFailure: true });
      if (install.code !== 0) {
        throw new Error(
          install.stderr || install.stdout || `SlackClaw could not install the OpenClaw gateway service after ${reason}.`
        );
      }

      const start = await runOpenClaw(["gateway", "start"], { allowFailure: true });
      if (start.code !== 0) {
        throw new Error(
          start.stderr || start.stdout || `SlackClaw could not start the OpenClaw gateway service after ${reason}.`
        );
      }
    } else if (restart.code !== 0) {
      throw new Error(restart.stderr || restart.stdout || `SlackClaw could not restart the OpenClaw gateway after ${reason}.`);
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
        `SlackClaw restarted the OpenClaw gateway after ${reason}, but it is still not reachable.`
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
      const configChanged = await this.ensureSlackClawGatewayConfigBaseline(reusedCommand);
      const gatewayNormalizationSuffix = configChanged
        ? " SlackClaw also reset the OpenClaw gateway to its local baseline on this Mac."
        : "";

      return {
        status: "reused-existing",
        changed: configChanged,
        hadExisting: true,
        existingVersion,
        version: existingVersion,
        message: usesManagedLocalRuntime
          ? `OpenClaw ${existingVersion} is already available in SlackClaw's managed local runtime.${gatewayNormalizationSuffix}`
          : OPENCLAW_VERSION_OVERRIDE
            ? `OpenClaw ${existingVersion} is already installed and meets SlackClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.${gatewayNormalizationSuffix}`
            : `OpenClaw ${existingVersion} is already installed and ready for SlackClaw.${gatewayNormalizationSuffix}`
      };
    }

    const npmInvocation = await resolveNpmInvocation();
    const ensuredNpmInvocation = npmInvocation ?? (await this.ensureSystemDependencies());

    if (!ensuredNpmInvocation) {
      throw new Error(
        brewCommand
          ? "SlackClaw asked Homebrew to prepare the required toolchain, but still could not find a working npm executable afterward."
          : existingVersion || systemVersion
            ? `SlackClaw found OpenClaw ${existingVersion ?? systemVersion}, but cannot deploy a managed local copy because neither npm nor Homebrew is available on this Mac.`
            : "SlackClaw cannot deploy OpenClaw locally because neither npm nor Homebrew is available on this Mac."
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
          ? `SlackClaw downloaded OpenClaw into ${installPath}, but could not verify that the managed runtime can execute on this Mac.`
          : "SlackClaw installed OpenClaw, but could not verify the installed CLI."
      );
    }

    const installedCommand = usesManagedLocalRuntime
      ? await resolveManagedOpenClawCommand({ fresh: true })
      : await resolveSystemOpenClawCommand({ fresh: true });
    const configChanged = await this.ensureSlackClawGatewayConfigBaseline(installedCommand);
    const gatewayNormalizationSuffix = configChanged
      ? " SlackClaw also reset the OpenClaw gateway to its local baseline on this Mac."
      : "";

    return {
      status: existingVersion || systemVersion ? "reinstalled" : "installed",
      changed: true,
      hadExisting: Boolean(existingVersion || systemVersion),
      existingVersion: existingVersion ?? systemVersion,
      version: nextVersion,
      message: usesManagedLocalRuntime
        ? existingVersion
          ? `SlackClaw refreshed its managed local OpenClaw ${nextVersion} runtime in ${installPath}.${gatewayNormalizationSuffix}`
          : systemVersion
            ? `SlackClaw deployed a managed local OpenClaw ${nextVersion} runtime into ${installPath} instead of depending on the system OpenClaw ${systemVersion}.${gatewayNormalizationSuffix}`
            : `SlackClaw deployed OpenClaw ${nextVersion} locally into ${installPath}.${gatewayNormalizationSuffix}`
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
      await writeErrorLog("SlackClaw could not install missing dependencies because Homebrew is unavailable.", {
        missingPackages: packages
      });
      return undefined;
    }

    const installResult = await runCommand(brewCommand, ["install", ...packages], { allowFailure: true });

    if (installResult.code !== 0) {
      await writeErrorLog("SlackClaw failed to install missing dependencies with Homebrew.", {
        command: brewCommand,
        args: ["install", ...packages],
        result: installResult
      });
      throw new Error(
        installResult.stderr ||
          installResult.stdout ||
          `SlackClaw could not install missing dependencies (${packages.join(", ")}) with Homebrew.`
      );
    }

    await writeInfoLog("SlackClaw installed missing system dependencies with Homebrew.", {
      command: brewCommand,
      packages
    });

    return resolveNpmInvocation();
  }
}
