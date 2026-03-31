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
    providerType: "built-in",
    exampleModels: ["anthropic/claude-opus-4-6", "anthropic/claude-sonnet-4-6"],
    authEnvVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEYS"],
    setupNotes: [
      "Anthropic API key auth is the recommended path for standard usage-based access.",
      "Setup-token auth is mainly for compatibility when you already use Claude Code."
    ],
    warnings: [
      "Anthropic has blocked some subscription usage outside Claude Code in the past; verify current Anthropic terms before relying on setup-tokens."
    ],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/bedrock`,
    providerRefs: ["amazon-bedrock/"],
    providerType: "built-in",
    exampleModels: ["amazon-bedrock/us.anthropic.claude-opus-4-6-v1:0"],
    authEnvVars: [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "AWS_PROFILE",
      "AWS_BEARER_TOKEN_BEDROCK"
    ],
    setupNotes: [
      "Bedrock uses the AWS SDK credential chain instead of a normal API key.",
      "Automatic discovery needs `bedrock:ListFoundationModels` permission."
    ],
    warnings: ["EC2 instance-role setups may still need `AWS_PROFILE=default` so OpenClaw detects credentials."],
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
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["byteplus/", "byteplus-plan/"],
    providerType: "built-in",
    authEnvVars: ["BYTEPLUS_API_KEY"],
    setupNotes: ["BytePlus is documented on the model-provider concepts page under BytePlus (International)."],
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
    providerType: "built-in",
    exampleModels: ["volcengine-plan/ark-code-latest", "volcengine/doubao-seed-1-6-flash-250715"],
    authEnvVars: ["VOLCANO_ENGINE_API_KEY"],
    setupNotes: ["OpenClaw treats `volcengine` as the general catalog and `volcengine-plan` as the coding catalog."],
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
    docsUrl: MODEL_PROVIDER_CONCEPTS_URL,
    providerRefs: ["chutes/"],
    providerType: "built-in",
    warnings: ["OpenClaw's public provider docs no longer describe Chutes in detail; confirm availability in your installed runtime."],
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
    providerType: "gateway",
    exampleModels: ["cloudflare-ai-gateway/claude-sonnet-4-6"],
    authEnvVars: ["CLOUDFLARE_AI_GATEWAY_API_KEY"],
    setupNotes: [
      "Needs your Cloudflare account ID, gateway ID, and upstream provider API key.",
      "For Anthropic models, use your Anthropic API key behind the gateway."
    ],
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
    providerType: "custom",
    supportsNoAuth: true,
    setupNotes: [
      "Use this for OpenAI-compatible or Anthropic-compatible endpoints that OpenClaw does not bundle.",
      "API key is optional if your endpoint accepts unauthenticated local traffic."
    ],
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
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek models through DeepSeek's OpenAI-compatible API.",
    docsUrl: `${PROVIDER_DOCS_BASE}/deepseek`,
    providerRefs: ["deepseek/"],
    providerType: "built-in",
    exampleModels: ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner"],
    authEnvVars: ["DEEPSEEK_API_KEY"],
    setupNotes: ["If the gateway runs as a daemon, make sure `DEEPSEEK_API_KEY` is available to that process."],
    authMethods: [
      {
        id: "deepseek-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a DeepSeek API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "deepseek-api-key",
        onboardFieldFlags: { apiKey: "--deepseek-api-key" }
      }
    ]
  },
  {
    id: "gemini",
    label: "Google (Gemini / Vertex / CLI)",
    description: "Google Gemini, Google Vertex, Antigravity, and Gemini CLI model access.",
    docsUrl: `${PROVIDER_DOCS_BASE}/google`,
    providerRefs: ["google/", "google-gemini-cli/", "google-antigravity/", "google-vertex/"],
    providerType: "built-in",
    exampleModels: ["google/gemini-3.1-pro-preview", "google/gemini-3.1-flash-preview"],
    authEnvVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    setupNotes: [
      "Google AI Studio API keys are the standard setup path.",
      "Gemini CLI OAuth is available as a separate unofficial provider."
    ],
    warnings: ["Gemini CLI OAuth is unofficial and some users report account restrictions."],
    authMethods: [
      {
        id: "gemini-api-key",
        label: "Google API Key",
        kind: "api-key",
        description: "Paste a Gemini or Google API key for Google AI Studio.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "google-api-key",
        onboardFieldFlags: { apiKey: "--gemini-api-key" }
      },
      {
        id: "google-gemini-cli",
        label: "Google Gemini CLI",
        kind: "oauth",
        description: "Run the Gemini CLI OAuth flow documented by OpenClaw.",
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
    providerType: "built-in",
    exampleModels: ["github-copilot/gpt-4o", "github-copilot/gpt-4.1"],
    authEnvVars: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
    setupNotes: ["The device login stores a GitHub token, then exchanges it for Copilot runtime tokens when OpenClaw runs."],
    warnings: ["Requires an interactive TTY. Model availability depends on your GitHub Copilot plan."],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/huggingface`,
    providerRefs: ["huggingface/"],
    providerType: "gateway",
    exampleModels: [
      "huggingface/deepseek-ai/DeepSeek-R1",
      "huggingface/Qwen/Qwen3-8B",
      "huggingface/meta-llama/Llama-3.3-70B-Instruct"
    ],
    authEnvVars: ["HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"],
    setupNotes: [
      "OpenClaw can refresh the live model catalog from `https://router.huggingface.co/v1/models` when a token is present.",
      "Suffixes like `:fastest`, `:cheapest`, or `:together` select router policies or backends."
    ],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/kilocode`,
    providerRefs: ["kilocode/"],
    providerType: "gateway",
    exampleModels: ["kilocode/kilo/auto", "kilocode/anthropic/claude-opus-4.6"],
    authEnvVars: ["KILOCODE_API_KEY"],
    setupNotes: [
      "`kilocode/kilo/auto` is the default smart-routing model.",
      "One Kilo key unlocks the whole gateway catalog."
    ],
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
    id: "groq",
    label: "Groq",
    description: "Groq-hosted open-source model catalog.",
    docsUrl: `${PROVIDER_DOCS_BASE}/groq`,
    providerRefs: ["groq/"],
    providerType: "built-in",
    exampleModels: ["groq/llama-3.3-70b-versatile"],
    authEnvVars: ["GROQ_API_KEY"],
    setupNotes: ["Groq is optimized for fast open-source inference."],
    authMethods: [
      {
        id: "groq-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste a Groq API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "groq-api-key",
        onboardFieldFlags: { apiKey: "--groq-api-key" }
      }
    ]
  },
  {
    id: "kimi-code",
    label: "Kimi Coding",
    description: "Kimi Coding model access through Moonshot AI.",
    docsUrl: `${PROVIDER_DOCS_BASE}/moonshot`,
    providerRefs: ["kimi-coding/"],
    providerType: "built-in",
    exampleModels: ["kimi-coding/k2p5"],
    authEnvVars: ["KIMI_CODE_API_KEY"],
    setupNotes: ["Kimi Coding is a separate provider from Moonshot; keys and model refs are not interchangeable."],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/moonshot`,
    providerRefs: ["moonshot/", "moonshotai/"],
    providerType: "built-in",
    exampleModels: ["moonshot/kimi-k2.5", "moonshot/kimi-k2-thinking"],
    authEnvVars: ["MOONSHOT_API_KEY"],
    setupNotes: [
      "Moonshot and Kimi Coding use separate endpoints and separate keys.",
      "Moonshot uses `moonshot/...`; Kimi Coding uses `kimi-coding/...`."
    ],
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
    providerType: "gateway",
    exampleModels: ["litellm/claude-opus-4-6", "litellm/gpt-4o"],
    authEnvVars: ["LITELLM_API_KEY"],
    setupNotes: [
      "Point OpenClaw at a LiteLLM proxy base URL and keep your upstream routing inside LiteLLM.",
      "Virtual keys are useful when you want spend limits or tenant isolation for OpenClaw."
    ],
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
    providerType: "built-in",
    exampleModels: ["minimax/MiniMax-M2.7", "minimax/MiniMax-M2.7-highspeed", "minimax/image-01"],
    authEnvVars: ["MINIMAX_API_KEY"],
    setupNotes: [
      "MiniMax OAuth via Coding Plan is the recommended path.",
      "API-key setup uses the Anthropic-compatible endpoint `https://api.minimax.io/anthropic`."
    ],
    authMethods: [
      {
        id: "minimax-api",
        label: "MiniMax API Key (Global)",
        kind: "api-key",
        description: "Paste a MiniMax API key for the international endpoint at api.minimax.io.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-global-api",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-api-key-cn",
        label: "MiniMax API Key (China)",
        kind: "api-key",
        description: "Paste a MiniMax API key for the China endpoint at api.minimaxi.com.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "minimax-cn-api",
        onboardFieldFlags: { apiKey: "--minimax-api-key" }
      },
      {
        id: "minimax-portal",
        label: "MiniMax OAuth (Global)",
        kind: "oauth",
        description: "Run the MiniMax Coding Plan OAuth flow for the international endpoint at api.minimax.io.",
        interactive: true,
        fields: [],
        loginProviderId: "minimax-portal",
        loginMethodId: "oauth"
      },
      {
        id: "minimax-portal-cn",
        label: "MiniMax OAuth (China)",
        kind: "oauth",
        description: "Run the MiniMax Coding Plan OAuth flow for the China endpoint at api.minimaxi.com.",
        interactive: true,
        fields: [],
        loginProviderId: "minimax-portal",
        loginMethodId: "oauth-cn"
      }
    ]
  },
  {
    id: "mistral",
    label: "Mistral",
    description: "Mistral-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/mistral`,
    providerRefs: ["mistral/"],
    providerType: "built-in",
    exampleModels: ["mistral/mistral-large-latest"],
    authEnvVars: ["MISTRAL_API_KEY"],
    setupNotes: ["Mistral can also power Voxtral audio transcription and memory embeddings in OpenClaw."],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/qwen_modelstudio`,
    providerRefs: ["modelstudio/"],
    providerType: "built-in",
    exampleModels: ["modelstudio/qwen3.5-plus", "modelstudio/glm-4.7", "modelstudio/kimi-k2.5"],
    authEnvVars: ["MODELSTUDIO_API_KEY"],
    setupNotes: [
      "Supports Standard (pay-as-you-go) and Coding Plan billing.",
      "Qwen OAuth is deprecated; new Qwen setups should use Model Studio."
    ],
    authMethods: [
      {
        id: "modelstudio-standard-api-key-cn",
        label: "Standard API Key (China)",
        kind: "api-key",
        description: "Use a pay-as-you-go Model Studio API key against the China endpoint.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "modelstudio-standard-api-key-cn",
        onboardFieldFlags: { apiKey: "--modelstudio-api-key-cn" }
      },
      {
        id: "modelstudio-standard-api-key",
        label: "Standard API Key (Global)",
        kind: "api-key",
        description: "Use a pay-as-you-go Model Studio API key against the global endpoint.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "modelstudio-standard-api-key",
        onboardFieldFlags: { apiKey: "--modelstudio-api-key" }
      },
      {
        id: "modelstudio-api-key-cn",
        label: "Coding Plan API Key (China)",
        kind: "api-key",
        description: "Use a Model Studio Coding Plan key against the China endpoint.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }],
        onboardAuthChoice: "modelstudio-api-key-cn",
        onboardFieldFlags: { apiKey: "--modelstudio-api-key-cn" }
      },
      {
        id: "modelstudio-api-key",
        label: "Coding Plan API Key (Global)",
        kind: "api-key",
        description: "Use a Model Studio Coding Plan key against the global endpoint.",
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
    providerType: "built-in",
    exampleModels: ["nvidia/nvidia/llama-3.1-nemotron-70b-instruct"],
    authEnvVars: ["NVIDIA_API_KEY"],
    setupNotes: ["The NVIDIA catalog uses the OpenAI-compatible base URL `https://integrate.api.nvidia.com/v1`."],
    authMethods: [
      {
        id: "nvidia-api-key",
        label: "API Key",
        kind: "api-key",
        description: "Paste an NVIDIA NGC API key.",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true }]
      }
    ]
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local Ollama runtime.",
    docsUrl: `${PROVIDER_DOCS_BASE}/ollama`,
    providerRefs: ["ollama/"],
    providerType: "local",
    exampleModels: ["ollama/llama3.3", "ollama/glm-4.7-flash"],
    authEnvVars: ["OLLAMA_API_KEY"],
    setupNotes: [
      "Local mode needs no provider account.",
      "Cloud + Local mode can open an `ollama.com` sign-in during onboarding."
    ],
    warnings: ["Use Ollama's native API base URL without `/v1` when connecting to remote servers."],
    supportsNoAuth: true,
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
    docsUrl: `${PROVIDER_DOCS_BASE}/opencode`,
    providerRefs: ["opencode/", "opencode-zen/", "opencode-go/"],
    providerType: "gateway",
    exampleModels: ["opencode/claude-opus-4-6", "opencode-go/kimi-k2.5", "opencode-go/glm-5"],
    authEnvVars: ["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"],
    setupNotes: [
      "One OpenCode key covers both `opencode` and `opencode-go` runtime providers.",
      "Zen and Go keep separate runtime prefixes so upstream routing stays correct."
    ],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/openai`,
    providerRefs: ["openai/", "openai-codex/"],
    providerType: "built-in",
    exampleModels: ["openai/gpt-5.4", "openai/gpt-5.4-pro", "openai-codex/gpt-5.4"],
    authEnvVars: ["OPENAI_API_KEY", "OPENAI_API_KEYS", "OPENCLAW_LIVE_OPENAI_KEY"],
    setupNotes: [
      "Direct API usage and Codex OAuth are both supported.",
      "The direct OpenAI provider defaults to auto transport (WebSocket first, SSE fallback)."
    ],
    warnings: ["`openai/gpt-5.3-codex-spark` is intentionally hidden on the direct API path because live OpenAI API calls reject it."],
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
    providerType: "gateway",
    exampleModels: ["openrouter/anthropic/claude-sonnet-4-6"],
    authEnvVars: ["OPENROUTER_API_KEY"],
    setupNotes: ["Model refs use `openrouter/<provider>/<model>`."],
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
    providerType: "gateway",
    setupNotes: [
      "Qianfan is Baidu's MaaS platform with an OpenAI-compatible endpoint.",
      "Qianfan API keys use the `bce-v3/...` format."
    ],
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
    id: "sglang",
    label: "SGLang",
    description: "Self-hosted SGLang via an OpenAI-compatible local server.",
    docsUrl: `${PROVIDER_DOCS_BASE}/sglang`,
    providerRefs: ["sglang/"],
    providerType: "local",
    exampleModels: ["sglang/your-model-id"],
    authEnvVars: ["SGLANG_API_KEY"],
    setupNotes: [
      "Defaults to `http://127.0.0.1:30000/v1` and auto-discovers `/v1/models` when you opt in.",
      "Any value works for `SGLANG_API_KEY` if your server does not enforce auth."
    ],
    supportsNoAuth: true,
    authMethods: [
      {
        id: "sglang",
        label: "SGLang Runtime",
        kind: "local",
        description: "Connect to a local or remote SGLang server.",
        interactive: true,
        fields: [],
        loginProviderId: "sglang"
      }
    ]
  },
  {
    id: "synthetic",
    label: "Synthetic",
    description: "Synthetic-hosted models.",
    docsUrl: `${PROVIDER_DOCS_BASE}/synthetic`,
    providerRefs: ["synthetic/"],
    providerType: "built-in",
    exampleModels: ["synthetic/hf:MiniMaxAI/MiniMax-M2.5", "synthetic/hf:deepseek-ai/DeepSeek-V3"],
    authEnvVars: ["SYNTHETIC_API_KEY"],
    setupNotes: ["Synthetic uses the Anthropic client path, so the base URL should stay `https://api.synthetic.new/anthropic` without `/v1`."],
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
    providerType: "built-in",
    exampleModels: ["together/moonshotai/Kimi-K2.5"],
    authEnvVars: ["TOGETHER_API_KEY"],
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
    providerType: "gateway",
    exampleModels: ["vercel-ai-gateway/anthropic/claude-opus-4.6", "vercel-ai-gateway/openai/gpt-5.4"],
    authEnvVars: ["AI_GATEWAY_API_KEY"],
    setupNotes: [
      "OpenClaw can auto-discover `/v1/models` from the gateway.",
      "Shorthand refs like `vercel-ai-gateway/claude-opus-4.6` normalize to Anthropic routes."
    ],
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
    providerType: "gateway",
    exampleModels: ["venice/llama-3.3-70b", "venice/claude-opus-45"],
    authEnvVars: ["VENICE_API_KEY"],
    setupNotes: [
      "Private Venice models stay on Venice infrastructure.",
      "Anonymized Venice models proxy requests to upstream providers like Anthropic or OpenAI."
    ],
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
    providerType: "local",
    exampleModels: ["vllm/your-model-id"],
    authEnvVars: ["VLLM_API_KEY"],
    setupNotes: [
      "Defaults to `http://127.0.0.1:8000/v1` and auto-discovers `/v1/models` when you opt in.",
      "Any value works for `VLLM_API_KEY` if your server does not enforce auth."
    ],
    supportsNoAuth: true,
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
    docsUrl: `${PROVIDER_DOCS_BASE}/xai`,
    providerRefs: ["xai/"],
    providerType: "built-in",
    exampleModels: ["xai/grok-4", "xai/grok-code-fast-1"],
    authEnvVars: ["XAI_API_KEY"],
    setupNotes: ["The same xAI key can also power Grok web-search and code-execution tooling in OpenClaw."],
    warnings: [
      "There is no xAI OAuth or device-login flow in OpenClaw today.",
      "`grok-4.20-multi-agent-experimental-beta-0304` is not supported on the normal xAI provider path."
    ],
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
    providerType: "built-in",
    exampleModels: ["xiaomi/mimo-v2-flash", "xiaomi/mimo-v2-pro", "xiaomi/mimo-v2-omni"],
    authEnvVars: ["XIAOMI_API_KEY"],
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
    docsUrl: `${PROVIDER_DOCS_BASE}/zai`,
    providerRefs: ["zai/"],
    providerType: "built-in",
    exampleModels: ["zai/glm-5", "zai/glm-4.7"],
    authEnvVars: ["ZAI_API_KEY"],
    setupNotes: [
      "Coding Plan Global/CN and General API Global/CN are separate onboarding choices.",
      "`tool_stream` is enabled by default for Z.AI tool-call streaming."
    ],
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
