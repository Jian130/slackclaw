import type { OnboardingUiConfig } from "@slackclaw/contracts";

export const onboardingUiConfig: OnboardingUiConfig = {
  modelProviders: [
    {
      id: "minimax",
      label: "MiniMax",
      description: "MiniMax models for fast onboarding.",
      theme: "minimax",
      platformUrl: "https://platform.minimaxi.com/login",
      tutorialVideoUrl: "https://platform.minimaxi.com/login",
      defaultModelKey: "minimax/MiniMax-M2.5",
      authMethods: [
        {
          id: "minimax-api",
          label: "API Key",
          kind: "api-key",
          description: "Paste a MiniMax API key.",
          interactive: false,
          fields: [{ id: "apiKey", label: "API Key", required: true, secret: true, placeholder: "Paste your API key here" }]
        }
      ]
    },
    {
      id: "modelstudio",
      label: "Qwen (通义千问)",
      description: "Qwen models for fast onboarding.",
      theme: "qwen",
      platformUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
      defaultModelKey: "modelstudio/qwen3.5-plus",
      authMethods: [
        {
          id: "modelstudio-api-key-cn",
          label: "API Key",
          kind: "api-key",
          description: "Paste a Model Studio API key.",
          interactive: false,
          fields: [{ id: "apiKey", label: "API Key", required: true, secret: true, placeholder: "Paste your API key here" }]
        }
      ]
    },
    {
      id: "openai",
      label: "ChatGPT",
      description: "OpenAI ChatGPT models for fast onboarding.",
      theme: "chatgpt",
      platformUrl: "https://platform.openai.com/api-keys",
      defaultModelKey: "openai/gpt-5.1-codex",
      authMethods: [
        {
          id: "openai-api-key",
          label: "API Key",
          kind: "api-key",
          description: "Paste an OpenAI API key.",
          interactive: false,
          fields: [{ id: "apiKey", label: "API Key", required: true, secret: true, placeholder: "Paste your API key here" }]
        },
        {
          id: "openai-codex",
          label: "OAuth",
          kind: "oauth",
          description: "Connect securely with your account.",
          interactive: true,
          fields: []
        }
      ]
    }
  ],
  channels: [
    {
      id: "wechat",
      label: "WeChat Work",
      secondaryLabel: "企业微信",
      description: "Set up WeChat Work credentials for your digital employees.",
      theme: "wechat",
      setupKind: "wechat-guided",
      docsUrl: "https://work.weixin.qq.com/"
    },
    {
      id: "feishu",
      label: "Feishu",
      secondaryLabel: "飞书",
      description: "Configure Feishu app credentials for your digital employees.",
      theme: "feishu",
      setupKind: "feishu-guided",
      platformUrl: "https://open.feishu.cn/app",
      tutorialVideoUrl: "https://open.feishu.cn/"
    },
    {
      id: "telegram",
      label: "Telegram",
      secondaryLabel: "Telegram",
      description: "Connect a Telegram bot token for your digital employees.",
      theme: "telegram",
      setupKind: "telegram-guided",
      docsUrl: "https://core.telegram.org/bots/tutorial"
    }
  ],
  employeePresets: [
    {
      id: "research-analyst",
      label: "Research Analyst",
      description: "Research quickly, write crisp summaries, and keep answers grounded in the right context.",
      theme: "analyst",
      starterSkillLabels: ["Research Brief", "Status Writer"],
      toolLabels: ["Company handbook", "Delivery playbook"],
      skillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      workStyles: ["Analytical", "Concise"],
      defaultMemoryEnabled: true
    },
    {
      id: "support-captain",
      label: "Support Captain",
      description: "Handle customer-facing requests with calm tone, clear follow-ups, and fast status updates.",
      theme: "support",
      starterSkillLabels: ["Status Writer"],
      toolLabels: ["Customer voice", "Memory"],
      skillIds: ["status-writer"],
      knowledgePackIds: ["customer-voice"],
      workStyles: ["Calm", "Supportive"],
      defaultMemoryEnabled: true
    },
    {
      id: "delivery-operator",
      label: "Delivery Operator",
      description: "Turn briefs into checklists, track milestones, and keep execution moving without extra setup.",
      theme: "operator",
      starterSkillLabels: ["Research Brief"],
      toolLabels: ["Delivery playbook", "Company handbook"],
      skillIds: ["research-brief"],
      knowledgePackIds: ["delivery-playbook", "company-handbook"],
      workStyles: ["Methodical", "Action-oriented"],
      defaultMemoryEnabled: true
    }
  ]
};
