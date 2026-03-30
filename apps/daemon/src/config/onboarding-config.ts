import type {
  OnboardingChannelPresentation,
  OnboardingEmployeePresetPresentation,
  OnboardingModelProviderPresentation,
  OnboardingUiConfig
} from "@slackclaw/contracts";

import { onboardingEmployeePresetPresentationById } from "./ai-member-presets.js";

export interface OnboardingUiConfigSelection {
  modelProviders: OnboardingModelProviderPresentation[];
  channels: OnboardingChannelPresentation[];
  employeePresetIds: string[];
}

const onboardingModelProviders: OnboardingModelProviderPresentation[] = [
  {
    id: "minimax",
    label: "MiniMax",
    description: "MiniMax models for fast onboarding.",
    theme: "minimax",
    platformUrl: "https://platform.minimaxi.com/login",
    tutorialVideoUrl: "https://platform.minimaxi.com/login",
    defaultModelKey: "minimax/MiniMax-M2.7",
    authMethods: [
      {
        id: "minimax-api",
        label: "Global API Key",
        kind: "api-key",
        description: "Use the international MiniMax endpoint (api.minimax.io).",
        interactive: false,
        fields: [{ id: "apiKey", label: "API Key", required: true, secret: true, placeholder: "Paste your API key here" }]
      },
      {
        id: "minimax-api-key-cn",
        label: "China API Key",
        kind: "api-key",
        description: "Use the China MiniMax endpoint (api.minimaxi.com).",
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
];

const onboardingChannels: OnboardingChannelPresentation[] = [
  {
    id: "wechat-work",
    label: "WeChat Work (WeCom)",
    secondaryLabel: "企业微信",
    description: "Set up WeChat Work credentials for your digital employees.",
    theme: "wechat-work",
    setupKind: "wechat-work-guided",
    docsUrl: "https://work.weixin.qq.com/"
  },
  {
    id: "wechat",
    label: "WeChat",
    secondaryLabel: "微信",
    description: "Set up personal WeChat with a QR-first login flow.",
    theme: "wechat",
    setupKind: "wechat-guided"
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
];

export const onboardingUiConfigSelection: OnboardingUiConfigSelection = {
  modelProviders: onboardingModelProviders,
  channels: onboardingChannels,
  employeePresetIds: ["research-analyst", "support-captain", "delivery-operator"]
};

export function resolveOnboardingEmployeePresets(presetIds: string[]): OnboardingEmployeePresetPresentation[] {
  return presetIds.map((presetId) => {
    const preset = onboardingEmployeePresetPresentationById(presetId);
    if (!preset) {
      throw new Error(`Unknown onboarding employee preset: ${presetId}`);
    }

    return preset;
  });
}

export function buildOnboardingUiConfig(selection: OnboardingUiConfigSelection = onboardingUiConfigSelection): OnboardingUiConfig {
  return {
    modelProviders: selection.modelProviders.map((provider) => ({
      ...provider,
      authMethods: provider.authMethods.map((method) => ({
        ...method,
        fields: method.fields.map((field) => ({ ...field }))
      }))
    })),
    channels: selection.channels.map((channel) => ({ ...channel })),
    employeePresets: resolveOnboardingEmployeePresets(selection.employeePresetIds)
  };
}

export function resolveOnboardingUiConfig(): OnboardingUiConfig {
  return buildOnboardingUiConfig();
}
