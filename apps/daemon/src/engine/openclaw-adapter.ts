import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";

import type {
  EngineActionResponse,
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
  WechatSetupRequest
} from "@slackclaw/contracts";

import type { EngineAdapter } from "./adapter.js";
import { getAppRootDir, getDataDir, getManagedOpenClawBinPath, getManagedOpenClawDir } from "../runtime-paths.js";
import { errorToLogDetails, writeErrorLog, writeInfoLog } from "../services/logger.js";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

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

interface OpenClawAgentJson {
  ok?: boolean;
  output?: string;
  finalText?: string;
  response?: string;
  message?: string;
}

interface OpenClawModelListJson {
  count?: number;
  models?: ModelCatalogEntry[];
}

interface OpenClawModelStatusJson {
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

interface OpenClawAdapterState {
  configuredProfileId?: string;
  installedAt?: string;
  lastInstallMode?: "detected" | "onboarded";
}

const OPENCLAW_STATE_PATH = resolve(getDataDir(), "openclaw-state.json");
const OPENCLAW_VERSION_PIN = "2026.3.7";
const FEISHU_BUNDLED_SINCE = "2026.3.7";

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

interface LoginSessionState {
  startedAt: string;
  status: "in-progress" | "awaiting-pairing" | "completed" | "failed";
  logs: string[];
  exitCode?: number;
}

interface RuntimeModelAuthSession extends ModelAuthSession {
  child?: ReturnType<typeof spawn>;
  outputBuffer: string;
  setDefaultModel?: string;
  browserOpened: boolean;
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

let whatsappLoginSession: LoginSessionState | undefined;
const modelAuthSessions = new Map<string, RuntimeModelAuthSession>();

const PROVIDER_DOCS_BASE = "https://docs.openclaw.ai/providers/docs";

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
    label: "BytePlus / Volcengine",
    description: "BytePlus-hosted or Volcano Engine-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/byteplus`,
    providerRefs: ["byteplus/"],
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
      },
      {
        id: "volcengine-api-key",
        label: "Volcengine API Key",
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
    label: "Gemini",
    description: "Google Gemini models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/gemini`,
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
    providerRefs: ["github-copilot/", "openai-codex/"],
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
    label: "Hugging Face",
    description: "Hugging Face token-based model access.",
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
    label: "Kilo Code Gateway",
    description: "Kilo Code Gateway hosted provider.",
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
    label: "Kimi / Moonshot",
    description: "Moonshot and Kimi Coding models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/moonshot-kimi`,
    providerRefs: ["kimi-coding/", "moonshot/", "moonshotai/"],
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
      },
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
    label: "OpenCode Zen",
    description: "OpenCode Zen provider.",
    docsUrl: `${PROVIDER_DOCS_BASE}/opencode-zen`,
    providerRefs: ["opencode/", "opencode-zen/"],
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
    label: "OpenAI",
    description: "OpenAI GPT and reasoning models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/openai`,
    providerRefs: ["openai/"],
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
    label: "Qwen",
    description: "Qwen portal-based access.",
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
    label: "Venice",
    description: "Venice-hosted models.",
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
    label: "Xiaomi",
    description: "Xiaomi-hosted models.",
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
    id: "glm-models",
    label: "GLM Models",
    description: "GLM models through the Z.AI provider family.",
    docsUrl: `${PROVIDER_DOCS_BASE}/glm-models`,
    providerRefs: ["zai/"],
    authMethods: [
      {
        id: "zai-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a GLM / Z.AI API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "zai-api-key",
        onboardFieldFlags: { apiKey: "--zai-api-key" }
      },
      {
        id: "zai-global",
        label: "Z.AI Global",
        kind: "oauth",
        description: "Run the Z.AI global login flow for GLM models.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-global"
      },
      {
        id: "zai-cn",
        label: "Z.AI CN",
        kind: "oauth",
        description: "Run the Z.AI China login flow for GLM models.",
        interactive: true,
        fields: [],
        loginProviderId: "zai-cn"
      }
    ]
  },
  {
    id: "zai",
    label: "Z.AI",
    description: "Z.AI / GLM model catalog.",
    docsUrl: `${PROVIDER_DOCS_BASE}/z-ai`,
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

function buildCommandEnv(command?: string): NodeJS.ProcessEnv {
  const pathEntries = [
    command && command.startsWith("/") ? dirname(command) : undefined,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : [])
  ].filter((value): value is string => Boolean(value));

  return {
    ...process.env,
    PATH: [...new Set(pathEntries)].join(delimiter),
    NO_COLOR: "1"
  };
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

function createChannelState(
  id: "telegram" | "whatsapp" | "feishu" | "wechat",
  overrides: Partial<ChannelSetupState>
): ChannelSetupState {
  const defaults: Record<string, ChannelSetupState> = {
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
    wechat: {
      id: "wechat",
      title: "WeChat workaround",
      officialSupport: false,
      status: "not-started",
      summary: "WeChat requires an experimental workaround plugin.",
      detail: "Install the plugin workaround, configure the app credentials, then restart the gateway."
    }
  };

  return {
    ...defaults[id],
    ...overrides,
    lastUpdatedAt: overrides.lastUpdatedAt ?? new Date().toISOString()
  };
}

async function runOpenClaw(args: string[], options?: { allowFailure?: boolean }): Promise<CommandResult> {
  const command = await resolveOpenClawCommand();

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

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: buildCommandEnv(command)
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      void writeErrorLog("Failed to spawn OpenClaw command.", {
        command,
        args,
        error: errorToLogDetails(error)
      });
      reject(error);
    });

    child.on("exit", (code) => {
      const result: CommandResult = {
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (!options?.allowFailure && result.code !== 0) {
        reject(new Error(result.stderr || result.stdout || `openclaw ${args.join(" ")} failed`));
        return;
      }

      resolve(result);
    });
  });
}

async function runCommand(command: string, args: string[], options?: { allowFailure?: boolean }): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: buildCommandEnv(command)
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      void writeErrorLog("Failed to spawn system command for SlackClaw.", {
        command,
        args,
        error: errorToLogDetails(error)
      });
      reject(error);
    });

    child.on("exit", (code) => {
      const result: CommandResult = {
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (!options?.allowFailure && result.code !== 0) {
        reject(new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`));
        return;
      }

      resolve(result);
    });
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

async function resolveCommandFromPath(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], {
      stdio: ["ignore", "pipe", "ignore"],
      env: buildCommandEnv()
    });

    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("exit", (code) => {
      const resolved = stdout.trim();
      resolve(code === 0 && resolved.startsWith("/") ? resolved : undefined);
    });

    child.on("error", () => resolve(undefined));
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
  try {
    const result = await runCommand(command, args, { allowFailure: true });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function resolveOpenClawCommand(): Promise<string | undefined> {
  const managedBinary = getManagedOpenClawBinPath();

  if ((await fileExists(managedBinary)) && (await probeCommand(managedBinary))) {
    return managedBinary;
  }

  const systemBinary = await resolveCommand("openclaw", ["/opt/homebrew/bin/openclaw", "/usr/local/bin/openclaw"]);

  if (systemBinary && (await probeCommand(systemBinary))) {
    return systemBinary;
  }

  return undefined;
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
  const result = await runOpenClaw(["--version"], { allowFailure: true }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  if (result.code !== 0 || !result.stdout) {
    return undefined;
  }

  return result.stdout;
}

async function readVersionFromCommand(command: string | undefined): Promise<string | undefined> {
  if (!command) {
    return undefined;
  }

  const result = await runCommand(command, ["--version"], { allowFailure: true }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  if (result.code !== 0 || !result.stdout) {
    return undefined;
  }

  return result.stdout;
}

async function readManagedOpenClawVersion(): Promise<string | undefined> {
  const managedBinary = getManagedOpenClawBinPath();

  if (!(await fileExists(managedBinary)) || !(await probeCommand(managedBinary))) {
    return undefined;
  }

  return readVersionFromCommand(managedBinary);
}

async function readSystemOpenClawVersion(): Promise<string | undefined> {
  const systemCommand = await resolveCommand("openclaw", ["/opt/homebrew/bin/openclaw", "/usr/local/bin/openclaw"]);

  if (!systemCommand || !(await probeCommand(systemCommand))) {
    return undefined;
  }

  return readVersionFromCommand(systemCommand);
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

function safeJsonPayloadParse<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const direct = safeJsonParse<T>(trimmed);
  if (direct) {
    return direct;
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const jsonStart =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  if (jsonStart === -1) {
    return undefined;
  }

  return safeJsonParse<T>(trimmed.slice(jsonStart));
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

async function openExternalUrl(url: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  await runCommand("/usr/bin/open", [url], { allowFailure: true }).catch(() => undefined);
}

function trimLogLines(lines: string[]): string[] {
  return lines.slice(-80);
}

function spawnInteractiveCommand(command: string, args: string[]) {
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
    env: buildCommandEnv(command)
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

async function readModelCatalog(all = true): Promise<ModelCatalogEntry[]> {
  const args = ["models", "list", "--json"];
  if (all) {
    args.splice(2, 0, "--all");
  }

  const result = await runOpenClaw(args, { allowFailure: true });
  const payload = safeJsonParse<OpenClawModelListJson>(result.stdout);
  return payload?.models ?? [];
}

async function readConfiguredAuthProviders(): Promise<Set<string>> {
  const result = await runOpenClaw(["models", "status", "--json"], { allowFailure: true });
  const payload = safeJsonParse<OpenClawModelStatusJson>(result.stdout);
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

async function readPluginInventory(): Promise<OpenClawPluginListJson | undefined> {
  const result = await runOpenClaw(["plugins", "list", "--json"], { allowFailure: true });
  return safeJsonPayloadParse<OpenClawPluginListJson>(result.stdout) ?? safeJsonPayloadParse<OpenClawPluginListJson>(result.stderr);
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
  configuredAuthProviders: Set<string>
): ModelConfigOverview {
  const configuredKeys = new Set(configuredModels.map((model) => model.key));
  const defaultModel = configuredModels.find((model) => model.tags.includes("default"))?.key;

  return {
    providers: MODEL_PROVIDER_DEFINITIONS.map((provider) => {
      const matches = allModels.filter((model) => provider.providerRefs.some((prefix) => model.key.startsWith(prefix)));
      const configuredByAuth = [...configuredAuthProviders].some((authProvider) => providerMatchesAuthProvider(provider, authProvider));
      const configured = configuredByAuth || matches.some((model) => configuredKeys.has(model.key) || model.available);

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
    configuredModelKeys: configuredModels.map((model) => model.key)
  };
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
    desiredVersion: OPENCLAW_VERSION_PIN,
    installSource: "npm-local",
    prerequisites: [
      "macOS 14 or newer",
      "Either npm already available on the Mac, or Homebrew available so SlackClaw can install Node/npm and Git",
      "Permission to install or reuse the pinned OpenClaw CLI"
    ],
    installPath: getManagedOpenClawDir()
  };

  readonly capabilities: EngineCapabilities = {
    engine: "openclaw",
    supportsInstall: true,
    supportsUpdate: true,
    supportsRecovery: true,
    supportsStreaming: false,
    runtimeModes: ["gateway", "embedded", "local-llm"],
    supportedChannels: ["local-ui"],
    starterSkillCategories: ["communication", "research", "docs", "operations"],
    futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
  };

  async install(autoConfigure: boolean, options?: { forceLocal?: boolean }): Promise<InstallResponse> {
    const bootstrap = await this.ensurePinnedOpenClaw(options?.forceLocal ?? false);
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

    const engineStatus = await this.status();

    return {
      status: "installed",
      message,
      engineStatus,
      disposition: toInstallDisposition(bootstrap.status, mode),
      changed: bootstrap.changed,
      hadExisting: bootstrap.hadExisting,
      pinnedVersion: OPENCLAW_VERSION_PIN,
      existingVersion: bootstrap.existingVersion,
      actualVersion: bootstrap.version ?? undefined
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

  async getModelConfig(): Promise<ModelConfigOverview> {
    const [allModels, configuredModels, configuredAuthProviders] = await Promise.all([
      readModelCatalog(true),
      readModelCatalog(false),
      readConfiguredAuthProviders()
    ]);
    return buildModelConfigOverview(allModels, configuredModels, configuredAuthProviders);
  }

  private async startInteractiveModelAuthSession(
    provider: InternalModelProviderConfig,
    method: InternalModelAuthMethod,
    args: string[],
    setDefaultModel?: string
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
      status: "running",
      message: "SlackClaw is starting the OpenClaw authentication flow.",
      logs: [`[SlackClaw] Starting ${provider.label} ${method.label}...`],
      launchUrl: undefined,
      inputPrompt: undefined,
      child: undefined,
      outputBuffer: "",
      setDefaultModel,
      browserOpened: false
    };

    const child = spawnInteractiveCommand(command, args);

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

          session.status = "completed";
          session.message = `${provider.label} authentication completed. Refreshing provider status now works.`;
        } else {
          if (session.status !== "awaiting-input") {
            session.status = "failed";
          }
          session.message = `${provider.label} authentication did not complete successfully.`;
        }
      })();
    });

    return {
      status: "interactive",
      message: `SlackClaw started the ${provider.label} ${method.label} flow.`,
      modelConfig: await this.getModelConfig(),
      authSession: {
        id: session.id,
        providerId: session.providerId,
        methodId: session.methodId,
        status: session.status,
        message: session.message,
        logs: session.logs,
        launchUrl: session.launchUrl,
        inputPrompt: session.inputPrompt
      }
    };
  }

  async getModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
    const session = modelAuthSessions.get(sessionId);

    if (!session) {
      throw new Error("Auth session not found.");
    }

    return {
      session: {
        id: session.id,
        providerId: session.providerId,
        methodId: session.methodId,
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
    } else if (method.tokenProviderId) {
      const tokenField = method.fields[0];
      const token = request.values[tokenField?.id ?? "token"]?.trim();

      if (!token) {
        throw new Error(`Enter the ${tokenField?.label ?? "token"} first.`);
      }

      await runOpenClaw(
        [
          ...buildBaseOnboardArgs(),
          "--auth-choice",
          "token",
          "--token-provider",
          method.tokenProviderId,
          "--token-profile-id",
          method.tokenProfileId ?? `${method.tokenProviderId}:manual`,
          "--token",
          token
        ],
        { allowFailure: false }
      );

      message = `${provider.label} token was saved for OpenClaw.`;
    } else if (method.setupTokenProvider) {
      return this.startInteractiveModelAuthSession(
        provider,
        method,
        ["models", "auth", "setup-token", "--provider", method.setupTokenProvider, "--yes"],
        request.setDefaultModel
      );
    } else if (method.specialCommand === "login-github-copilot") {
      return this.startInteractiveModelAuthSession(provider, method, ["models", "auth", "login-github-copilot", "--yes"], request.setDefaultModel);
    } else if (method.loginProviderId) {
      const args = ["models", "auth", "login", "--provider", method.loginProviderId];

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

    return {
      status: "completed",
      message,
      modelConfig: await this.getModelConfig()
    };
  }

  async setDefaultModel(modelKey: string): Promise<ModelConfigActionResponse> {
    await runOpenClaw(["models", "set", modelKey], { allowFailure: false });
    return {
      status: "completed",
      message: `Default model set to ${modelKey}.`,
      modelConfig: await this.getModelConfig()
    };
  }

  async onboard(profileId: string): Promise<void> {
    const statusBefore = await this.collectStatusData();

    if (statusBefore.setupRequired || !statusBefore.cliVersion) {
      const result = await runOpenClaw(
        [
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
          "--install-daemon",
          "--json"
        ],
        { allowFailure: true }
      );

      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || "OpenClaw onboarding failed.");
      }
    }

    await this.configure(profileId);
  }

  async configure(profileId: string): Promise<void> {
    const state = await readAdapterState();

    if (await resolveOpenClawCommand()) {
      await runOpenClaw(["config", "set", "slackclaw.defaultProfile", profileId], { allowFailure: true });
    }

    await writeAdapterState({
      ...state,
      configuredProfileId: profileId
    });
  }

  async status(): Promise<EngineStatus> {
    const data = await this.collectStatusData();

    return {
      engine: "openclaw",
      installed: data.installed,
      running: data.gatewayReachable,
      version: data.cliVersion,
      summary: data.summary,
      lastCheckedAt: new Date().toISOString()
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
      severity: data.cliVersion === OPENCLAW_VERSION_PIN ? "ok" : data.cliVersion ? "warning" : "info",
      summary: data.cliVersion
        ? data.cliVersion === OPENCLAW_VERSION_PIN
          ? "OpenClaw matches SlackClaw's pinned version."
          : `OpenClaw ${data.cliVersion} differs from SlackClaw's pinned ${OPENCLAW_VERSION_PIN}.`
        : "OpenClaw version is unknown.",
      detail: "SlackClaw currently targets a pinned-compatible OpenClaw release for reliability.",
      remediationActionIds: data.cliVersion === OPENCLAW_VERSION_PIN ? [] : ["rollback-update"]
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
        ...(await this.resolveAgentArgs()),
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

    return {
      taskId: randomUUID(),
      title,
      status: ok ? "completed" : "failed",
      summary: ok
        ? `OpenClaw completed the task using profile ${request.profileId}.`
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
    const updateResult = await runOpenClaw(["update", "status", "--json"], { allowFailure: true });
    const parsed = safeJsonParse<OpenClawUpdateStatusJson>(updateResult.stdout);
    const engineStatus = await this.status();

    if (parsed?.availability?.available) {
      return {
        message: `OpenClaw update available: ${parsed.availability.latestVersion ?? "new version detected"} on ${parsed.channel?.label ?? "current channel"}.`,
        engineStatus
      };
    }

    if (parsed?.update?.registry?.error) {
      return {
        message: `SlackClaw checked for updates, but registry lookup failed: ${parsed.update.registry.error}.`,
        engineStatus
      };
    }

    return {
      message: "SlackClaw verified that no newer pinned-compatible OpenClaw version is currently visible.",
      engineStatus
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    if (!(await resolveOpenClawCommand())) {
      return {
        actionId: action.id,
        status: "failed",
        message: "OpenClaw CLI is not installed."
      };
    }

    switch (action.id) {
      case "restart-engine": {
        const restart = await runOpenClaw(["gateway", "restart"], { allowFailure: true });
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
        const parsed = safeJsonParse<OpenClawUpdateStatusJson>(updateStatus.stdout);
        return {
          actionId: action.id,
          status: "completed",
          message: parsed?.availability?.available
            ? `SlackClaw detected update drift. Manual rollback to ${OPENCLAW_VERSION_PIN} is recommended until automated rollback is added.`
            : `SlackClaw remains pinned to ${OPENCLAW_VERSION_PIN}; no rollback was needed.`
        };
      }
      case "reinstall-engine": {
        const bootstrap = await this.ensurePinnedOpenClaw(false);
        const reinstall = await runOpenClaw(["gateway", "install", "--force"], { allowFailure: true });
        const installStatus = bootstrap.status !== "failed" && reinstall.code === 0 ? "completed" : "failed";
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
        return {
          actionId: action.id,
          status: "failed",
          message: "Unsupported recovery action."
        };
    }
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    const [status, health, gateway, update] = await Promise.all([
      this.status(),
      this.healthCheck(),
      runOpenClaw(["gateway", "status", "--json"], { allowFailure: true }),
      runOpenClaw(["update", "status", "--json"], { allowFailure: true })
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
            gatewayStatus: safeJsonParse<OpenClawGatewayStatusJson>(gateway.stdout) ?? gateway.stderr,
            updateStatus: safeJsonParse<OpenClawUpdateStatusJson>(update.stdout) ?? update.stderr
          }
        },
        null,
        2
      )
    };
  }

  async getChannelState(channelId: "telegram" | "whatsapp" | "feishu" | "wechat"): Promise<ChannelSetupState> {
    if (channelId === "whatsapp" && whatsappLoginSession) {
      return createChannelState("whatsapp", {
        status: whatsappLoginSession.status,
        summary:
          whatsappLoginSession.status === "failed"
            ? "WhatsApp login session failed."
            : whatsappLoginSession.status === "completed"
              ? "WhatsApp login session completed."
              : whatsappLoginSession.status === "awaiting-pairing"
                ? "WhatsApp login is waiting for pairing approval."
                : "WhatsApp login is running.",
        detail:
          whatsappLoginSession.logs.at(-1) ??
          "Scan the QR code or follow the WhatsApp login instructions shown by OpenClaw.",
        logs: whatsappLoginSession.logs.slice(-20)
      });
    }

    return createChannelState(channelId, {});
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

    return {
      message: "SlackClaw ran `openclaw plugins install @openclaw/feishu` and prepared the official Feishu plugin.",
      channel: createChannelState("feishu", {
        status: "ready",
        summary: "Official Feishu plugin installed.",
        detail: "The plugin is installed. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw."
      })
    };
  }

  async configureFeishu(
    request: FeishuSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    const configSave = await runOpenClaw(
      [
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
      { allowFailure: true }
    );

    if (configSave.code !== 0) {
      throw new Error(configSave.stderr || configSave.stdout || "SlackClaw could not save the Feishu configuration into OpenClaw.");
    }

    return {
      message:
        "SlackClaw saved your Feishu app credentials into OpenClaw. Restart the gateway next, then enable long connection, publish the Feishu app, send a test DM, and approve the pairing code in SlackClaw.",
      channel: createChannelState("feishu", {
        status: "awaiting-pairing",
        summary: "Official Feishu plugin configured.",
        detail: `OpenClaw saved the ${request.domain ?? "feishu"} tenant credentials. Restart the gateway, switch Feishu event delivery to long connection, publish the app, send a DM to the bot, then approve the Feishu pairing code in SlackClaw.`
      })
    };
  }

  async configureTelegram(request: TelegramSetupRequest): Promise<{ message: string; channel: ChannelSetupState }> {
    const args = ["channels", "add", "--channel", "telegram", "--token", request.token];

    if (request.accountName?.trim()) {
      args.push("--name", request.accountName.trim());
    }

    const result = await runOpenClaw(args, { allowFailure: true });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "SlackClaw could not save the Telegram channel configuration.");
    }

    return {
      message: "Telegram bot token saved. Send a message to the bot, then approve the pairing code in SlackClaw.",
      channel: createChannelState("telegram", {
        status: "awaiting-pairing",
        summary: "Telegram token saved.",
        detail: "The Telegram bot is configured. Send the first message to your bot, then approve the pairing code."
      })
    };
  }

  async startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState }> {
    if (whatsappLoginSession?.status === "in-progress") {
      return {
        message: "WhatsApp login is already running.",
        channel: await this.getChannelState("whatsapp")
      };
    }

    await runOpenClaw(["channels", "add", "--channel", "whatsapp", "--name", "SlackClaw WhatsApp"], {
      allowFailure: true
    });

    whatsappLoginSession = {
      startedAt: new Date().toISOString(),
      status: "in-progress",
      logs: ["Starting WhatsApp login. OpenClaw may print a QR code or pairing instructions here."]
    };

    const command = await resolveOpenClawCommand();

    if (!command) {
      throw new Error("OpenClaw CLI is not installed.");
    }

    const child = spawn(command, ["channels", "login", "--channel", "whatsapp", "--verbose"], {
      env: buildCommandEnv(command)
    });

    const pushLog = (text: string) => {
      if (!whatsappLoginSession) {
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
      whatsappLoginSession.logs.push(...lines);
      whatsappLoginSession.logs = whatsappLoginSession.logs.slice(-40);
      whatsappLoginSession.status = "awaiting-pairing";
    };

    child.stdout.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.on("error", (error) => {
      if (!whatsappLoginSession) {
        return;
      }

      whatsappLoginSession.status = "failed";
      whatsappLoginSession.logs.push(`Failed to start WhatsApp login: ${error instanceof Error ? error.message : String(error)}`);
      void writeErrorLog("WhatsApp login session failed to start.", errorToLogDetails(error));
    });

    child.on("exit", (code) => {
      if (!whatsappLoginSession) {
        return;
      }

      whatsappLoginSession.exitCode = code ?? 1;
      whatsappLoginSession.status = code === 0 ? "awaiting-pairing" : "failed";
      whatsappLoginSession.logs.push(
        code === 0
          ? "WhatsApp login command finished. If pairing is pending, approve the code below."
          : `WhatsApp login command exited with code ${code ?? 1}.`
      );
    });

    return {
      message: "SlackClaw started the WhatsApp login flow. Follow the QR or pairing instructions shown in the session log.",
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

    if (channelId === "whatsapp" && whatsappLoginSession) {
      whatsappLoginSession.status = "completed";
      whatsappLoginSession.logs.push("WhatsApp pairing approved.");
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

  async configureWechatWorkaround(
    request: WechatSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    const pluginSpec = request.pluginSpec?.trim() || "@openclaw-china/wecom-app";
    const pluginId = pluginSpec.split("/").pop() ?? pluginSpec;
    const install = await runOpenClaw(["plugins", "install", pluginSpec], { allowFailure: true });

    if (install.code !== 0) {
      throw new Error(install.stderr || install.stdout || `SlackClaw could not install the WeChat workaround plugin ${pluginSpec}.`);
    }

    const enableById = await runOpenClaw(["plugins", "enable", pluginId], { allowFailure: true });

    if (enableById.code !== 0) {
      await runOpenClaw(["plugins", "enable", pluginSpec], { allowFailure: true });
    }
    await runOpenClaw(["config", "set", "--strict-json", `channels.${pluginId}`, JSON.stringify({
      enabled: true,
      webhookPath: `/${pluginId}`,
      token: request.token,
      encodingAESKey: request.encodingAesKey,
      corpId: request.corpId,
      corpSecret: request.secret,
      agentId: Number(request.agentId),
      dmPolicy: "pairing",
      groupPolicy: "open"
    })], { allowFailure: true });

    return {
      message: `SlackClaw installed the experimental ${pluginSpec} workaround and saved the WeChat enterprise app configuration.`,
      channel: createChannelState("wechat", {
        status: "completed",
        summary: "WeChat workaround configured.",
        detail: "Restart the gateway to load the WeChat workaround plugin."
      })
    };
  }

  async startGatewayAfterChannels(): Promise<{ message: string; engineStatus: EngineStatus }> {
    const restart = await runOpenClaw(["gateway", "restart"], { allowFailure: true });
    const engineStatus = await this.status();

    if (restart.code !== 0 || !engineStatus.running) {
      throw new Error(restart.stderr || restart.stdout || "SlackClaw could not restart the OpenClaw gateway after channel setup.");
    }

    return {
      message: "OpenClaw gateway restarted and is reachable.",
      engineStatus
    };
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
    const installed = Boolean(await resolveOpenClawCommand());

    if (!installed) {
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

    const [versionResult, statusResult, gatewayResult] = await Promise.all([
      runOpenClaw(["--version"], { allowFailure: true }),
      runOpenClaw(["status", "--json"], { allowFailure: true }),
      runOpenClaw(["gateway", "status", "--json"], { allowFailure: true })
    ]);

    const cliVersion = versionResult.stdout || undefined;
    const statusJson = safeJsonParse<OpenClawStatusJson>(statusResult.stdout);
    const gatewayJson = safeJsonParse<OpenClawGatewayStatusJson>(gatewayResult.stdout);

    const gatewayReachable = Boolean(statusJson?.gateway?.reachable || gatewayJson?.rpc?.ok);
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

    const gatewayDetail =
      summarizeGateway(gatewayJson) ??
      statusJson?.gateway?.error ??
      "SlackClaw could not determine gateway reachability.";

    const versionSummary =
      cliVersion === OPENCLAW_VERSION_PIN
        ? `OpenClaw ${cliVersion} matches SlackClaw's pinned version.`
        : cliVersion
          ? `OpenClaw ${cliVersion} detected. SlackClaw targets ${OPENCLAW_VERSION_PIN}.`
          : "OpenClaw version could not be determined.";

    const summary = installed
      ? gatewayReachable
        ? `OpenClaw is installed and the local gateway is reachable. ${versionSummary}`
        : `OpenClaw is installed, but the local gateway is not reachable. ${versionSummary}`
      : "OpenClaw is not installed.";

    return {
      installed,
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

  private async ensurePinnedOpenClaw(forceLocal: boolean): Promise<BootstrapResult> {
    const existingVersion = forceLocal ? await readManagedOpenClawVersion() : await readInstalledOpenClawVersion();
    const systemVersion = forceLocal ? await readSystemOpenClawVersion() : existingVersion;
    const installPath = getManagedOpenClawDir();
    const usesManagedLocalRuntime = forceLocal || Boolean(getAppRootDir());
    const brewCommand = await resolveBrewCommand();

    if (existingVersion === OPENCLAW_VERSION_PIN) {
      return {
        status: "reused-existing",
        changed: false,
        hadExisting: true,
        existingVersion,
        version: existingVersion,
        message: usesManagedLocalRuntime
          ? `OpenClaw ${existingVersion} is already available in SlackClaw's managed local runtime.`
          : `OpenClaw ${existingVersion} is already installed and matches the pinned version.`
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
      ? ["install", "--prefix", installPath, `openclaw@${OPENCLAW_VERSION_PIN}`]
      : ["install", "--global", `openclaw@${OPENCLAW_VERSION_PIN}`];

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

    const nextVersion = await readInstalledOpenClawVersion();

    if (nextVersion !== OPENCLAW_VERSION_PIN) {
      throw new Error(
        usesManagedLocalRuntime
          ? `SlackClaw downloaded OpenClaw into ${installPath}, but could not verify that the managed runtime can execute on this Mac.`
          : "SlackClaw installed OpenClaw, but could not verify the installed CLI."
      );
    }

    return {
      status: existingVersion || systemVersion ? "reinstalled" : "installed",
      changed: true,
      hadExisting: Boolean(existingVersion || systemVersion),
      existingVersion: existingVersion ?? systemVersion,
      version: nextVersion,
      message: usesManagedLocalRuntime
        ? existingVersion
          ? `SlackClaw refreshed its managed local OpenClaw ${nextVersion} runtime in ${installPath}.`
          : systemVersion
            ? `SlackClaw deployed a managed local OpenClaw ${nextVersion} runtime into ${installPath} instead of depending on the system OpenClaw ${systemVersion}.`
            : `SlackClaw deployed OpenClaw ${nextVersion} locally into ${installPath}.`
        : existingVersion
          ? `Replaced existing OpenClaw ${existingVersion} with ${nextVersion}.`
          : `Installed OpenClaw ${nextVersion}.`
    };
  }

  private async resolveAgentArgs(): Promise<string[]> {
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
