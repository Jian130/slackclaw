import type { ModelAuthMethod, ModelProviderConfig } from "@chillclaw/contracts";

export interface InternalModelAuthMethod extends ModelAuthMethod {
  loginProviderId?: string;
  loginMethodId?: string;
  onboardAuthChoice?: string;
  onboardFieldFlags?: Record<string, string>;
  tokenProviderId?: string;
  tokenProfileId?: string;
  setupTokenProvider?: string;
  specialCommand?: "login-github-copilot";
}

export interface InternalModelProviderConfig
  extends Omit<ModelProviderConfig, "authMethods" | "configured" | "modelCount" | "sampleModels"> {
  authProviderId?: string;
  authMethods: InternalModelAuthMethod[];
}

const PROVIDER_DOCS_BASE = "https://docs.openclaw.ai/providers";
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
        description:
          "Use the Bedrock provider setup on this Mac. Make sure AWS credentials are already available locally.",
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
          {
            id: "compatibility",
            label: "Compatibility (openai|anthropic)",
            required: true,
            placeholder: "openai"
          },
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
        description: "Paste a MiniMax international API key for api.minimax.io.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-global-api",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-api-key-cn",
        label: "MiniMax CN API Key",
        kind: "api-key",
        description: "Paste a MiniMax China-region API key for api.minimaxi.com.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-cn-api",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-api-lightning",
        label: "MiniMax Lightning",
        kind: "api-key",
        description: "Use the MiniMax Lightning auth flow documented by OpenClaw.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-global-api",
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

export function buildBaseOnboardArgs(): string[] {
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

export function listModelProviderDefinitions(): InternalModelProviderConfig[] {
  return MODEL_PROVIDER_DEFINITIONS;
}

export function providerDefinitionById(providerId: string): InternalModelProviderConfig | undefined {
  return MODEL_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
}

export function providerDefinitionByModelKey(modelKey: string): InternalModelProviderConfig | undefined {
  return MODEL_PROVIDER_DEFINITIONS.find((provider) =>
    provider.providerRefs.some((prefix) => modelKey.startsWith(prefix))
  );
}

export function toPublicAuthMethod(method: InternalModelAuthMethod): ModelAuthMethod {
  return {
    id: method.id,
    label: method.label,
    kind: method.kind,
    description: method.description,
    interactive: method.interactive,
    fields: method.fields
  };
}

export function buildOnboardAuthArgs(method: InternalModelAuthMethod, values: Record<string, string>): string[] {
  if (!method.onboardAuthChoice) {
    throw new Error(`ChillClaw does not have a non-interactive onboarding flow for ${method.label}.`);
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

export function resolveTokenAuthProvider(
  provider: InternalModelProviderConfig,
  method: InternalModelAuthMethod
): string {
  return method.tokenProviderId ?? method.loginProviderId ?? provider.authProviderId ?? provider.id;
}

export function canUseTokenPasteAuth(method: InternalModelAuthMethod): boolean {
  return method.kind === "api-key" && method.fields.length === 1;
}
