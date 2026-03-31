import type {
  OnboardingChannelPresentation,
  OnboardingEmployeePresetPresentation,
  OnboardingModelProviderTheme,
  OnboardingModelProviderPresentation,
  OnboardingUiConfig
} from "@chillclaw/contracts";

import { onboardingEmployeePresetPresentationById } from "./ai-member-presets.js";
import { providerDefinitionById, toPublicAuthMethod } from "./openclaw-model-provider-catalog.js";

interface OnboardingModelProviderSelection {
  id: string;
  label?: string;
  description?: string;
  theme: OnboardingModelProviderTheme;
  platformUrl?: string;
  tutorialVideoUrl?: string;
  defaultModelKey: string;
}

export interface OnboardingUiConfigSelection {
  modelProviders: OnboardingModelProviderSelection[];
  channels: OnboardingChannelPresentation[];
  employeePresetIds: string[];
}

const onboardingModelProviders: OnboardingModelProviderSelection[] = [
  {
    id: "minimax",
    label: "MiniMax",
    description: "MiniMax models for fast onboarding.",
    theme: "minimax",
    platformUrl: "https://platform.minimaxi.com/login",
    tutorialVideoUrl: "https://platform.minimaxi.com/login",
    defaultModelKey: "minimax/MiniMax-M2.7"
  },
  {
    id: "modelstudio",
    label: "Qwen (通义千问)",
    description: "Qwen models for fast onboarding.",
    theme: "qwen",
    platformUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
    defaultModelKey: "modelstudio/qwen3.5-plus"
  },
  {
    id: "openai",
    label: "ChatGPT",
    description: "OpenAI ChatGPT models for fast onboarding.",
    theme: "chatgpt",
    platformUrl: "https://platform.openai.com/api-keys",
    defaultModelKey: "openai/gpt-5.1-codex"
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

function buildOnboardingModelProvider(
  selection: OnboardingModelProviderSelection
): OnboardingModelProviderPresentation {
  const provider = providerDefinitionById(selection.id);
  if (!provider) {
    throw new Error(`Unknown onboarding model provider: ${selection.id}`);
  }

  return {
    id: selection.id,
    label: selection.label ?? provider.label,
    description: selection.description ?? provider.description,
    theme: selection.theme,
    platformUrl: selection.platformUrl ?? provider.docsUrl,
    tutorialVideoUrl: selection.tutorialVideoUrl,
    defaultModelKey: selection.defaultModelKey,
    authMethods: provider.authMethods.map(toPublicAuthMethod)
  };
}

export function buildOnboardingUiConfig(selection: OnboardingUiConfigSelection = onboardingUiConfigSelection): OnboardingUiConfig {
  return {
    modelProviders: selection.modelProviders.map((provider) => buildOnboardingModelProvider(provider)),
    channels: selection.channels.map((channel) => ({ ...channel })),
    employeePresets: resolveOnboardingEmployeePresets(selection.employeePresetIds)
  };
}

export function resolveOnboardingUiConfig(): OnboardingUiConfig {
  return buildOnboardingUiConfig();
}
