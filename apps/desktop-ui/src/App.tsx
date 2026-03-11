import { useEffect, useState } from "react";

import type {
  ChannelSetupState,
  EngineTaskResult,
  HealthCheckResult,
  ModelAuthSession,
  ModelConfigOverview,
  ProductOverview,
  SetupStepResult,
  TaskTemplate
} from "@slackclaw/contracts";

import {
  approveFeishuPairing,
  approveTelegramPairing,
  approveWhatsappPairing,
  authenticateModelProvider,
  completeOnboarding,
  exportDiagnostics,
  fetchModelAuthSession,
  fetchOverview,
  fetchModelConfig,
  installAppService,
  markFirstRunIntroComplete,
  prepareFeishuChannel,
  restartAppService,
  runFirstRunSetup,
  runTask,
  runUpdate,
  setDefaultModel,
  setupFeishuChannel,
  setupTelegramChannel,
  setupWechatWorkaround,
  startGatewayAfterChannels,
  startWhatsappLogin,
  submitModelAuthSessionInput,
  stopSlackClawApp,
  uninstallEngine,
  uninstallAppService,
  uninstallSlackClawApp
} from "./api.js";
import { detectLocale, localeOptions, t, type Locale } from "./i18n.js";

type View = "dashboard" | "deploy" | "config" | "skills" | "chat" | "settings" | "onboarding";
type ConfigTab = "models" | "channels";
type SettingsTab = "general" | "deployment" | "logging" | "advanced";
type SkillsTab = "all" | "enabled" | "disabled";

interface LocalSettingsState {
  general: {
    instanceName: string;
    autoStart: boolean;
    checkUpdates: boolean;
    telemetry: boolean;
  };
  deployment: {
    autoRestart: boolean;
    maxRetries: number;
    healthCheck: boolean;
  };
  logging: {
    level: string;
    retention: number;
    enableDebug: boolean;
  };
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  preloaded: boolean;
  icon: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  meta?: string;
}

const defaultSettingsState: LocalSettingsState = {
  general: {
    instanceName: "My SlackClaw Instance",
    autoStart: true,
    checkUpdates: true,
    telemetry: false
  },
  deployment: {
    autoRestart: true,
    maxRetries: 3,
    healthCheck: true
  },
  logging: {
    level: "info",
    retention: 30,
    enableDebug: false
  }
};

function statusTone(check: HealthCheckResult): "good" | "warn" | "bad" {
  switch (check.severity) {
    case "error":
      return "bad";
    case "warning":
      return "warn";
    default:
      return "good";
  }
}

function channelTone(status: ChannelSetupState["status"]): "good" | "warn" | "bad" {
  if (status === "completed" || status === "ready") {
    return "good";
  }

  if (status === "failed") {
    return "bad";
  }

  return "warn";
}

function toSkillItems(templates: TaskTemplate[]): SkillItem[] {
  const icons = ["🔍", "📊", "✍️", "⚙️", "✉️", "📝", "🌐", "🧾"];

  return templates.map((template, index) => ({
    id: template.id,
    name: template.title,
    description: template.description,
    category: template.category,
    enabled: index < 5,
    preloaded: true,
    icon: icons[index % icons.length]
  }));
}

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

function providerGlyph(label: string): string {
  const normalized = label.toLowerCase();
  const logoMap: Array<[string, string]> = [
    ["openai", "🤖"],
    ["codex", "🤖"],
    ["anthropic", "🧠"],
    ["google", "🔵"],
    ["gemini", "🔵"],
    ["azure", "☁️"],
    ["cohere", "🌊"],
    ["mistral", "🌬️"],
    ["hugging face", "🤗"],
    ["huggingface", "🤗"],
    ["replicate", "🔄"],
    ["together", "🤝"],
    ["groq", "⚡"],
    ["perplexity", "🔍"],
    ["deepseek", "🎯"],
    ["openrouter", "🛣️"],
    ["ollama", "🏠"],
    ["github", "🐙"],
    ["copilot", "🐙"],
    ["qwen", "🌐"],
    ["minimax", "🎵"],
    ["moonshot", "🌙"],
    ["kimi", "🌙"],
    ["xai", "❌"],
    ["z.ai", "🟢"],
    ["zai", "🟢"],
    ["custom", "⚙️"]
  ];

  const matched = logoMap.find(([key]) => normalized.includes(key));
  if (matched) {
    return matched[1];
  }

  const words = label.split(/[\s/.-]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "AI";
}

function authMethodTone(label: string): string {
  if (/oauth|portal|device|login|cli/i.test(label)) {
    return "oauth";
  }

  if (/local|runtime|aws/i.test(label)) {
    return "local";
  }

  return "api";
}

function prettyAuthMethod(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function createDeploySteps(forceLocal: boolean): SetupStepResult[] {
  return [
    {
      id: "check-existing-openclaw",
      title: "Check for an existing OpenClaw installation",
      status: "running",
      detail: forceLocal
        ? "SlackClaw is checking whether a managed local runtime already exists."
        : "SlackClaw is checking for a compatible OpenClaw installation on this Mac."
    },
    {
      id: "prepare-openclaw",
      title: "Prepare OpenClaw and its required dependencies",
      status: "pending",
      detail: forceLocal
        ? "SlackClaw will deploy the pinned OpenClaw runtime into its managed local folder."
        : "SlackClaw will reuse the compatible OpenClaw installation or deploy the pinned runtime if needed."
    }
  ];
}

function localizeInstallCheck(
  locale: Locale,
  check: ProductOverview["installChecks"][number]
): { label: string; detail: string } {
  const localized: Record<
    string,
    Record<Locale, { label: string; detail: string }>
  > = {
    platform: {
      en: { label: "Supported macOS version", detail: check.detail },
      zh: { label: "受支持的 macOS 版本", detail: check.detail },
      ja: { label: "対応する macOS バージョン", detail: check.detail },
      ko: { label: "지원되는 macOS 버전", detail: check.detail },
      es: { label: "Versión compatible de macOS", detail: check.detail }
    },
    disk: {
      en: { label: "Free disk space", detail: check.detail },
      zh: { label: "可用磁盘空间", detail: check.detail },
      ja: { label: "空きディスク容量", detail: check.detail },
      ko: { label: "사용 가능한 디스크 공간", detail: check.detail },
      es: { label: "Espacio libre en disco", detail: check.detail }
    },
    permissions: {
      en: { label: "Document access permission", detail: check.detail },
      zh: { label: "文档访问权限", detail: check.detail },
      ja: { label: "ドキュメントアクセス権限", detail: check.detail },
      ko: { label: "문서 접근 권한", detail: check.detail },
      es: { label: "Permiso de acceso a documentos", detail: check.detail }
    }
  };

  return localized[check.id]?.[locale] ?? { label: check.label, detail: check.detail };
}

function localizedStatus(locale: Locale, status: "pending" | "passed" | "action-required"): string {
  const map = {
    en: { pending: "pending", passed: "passed", "action-required": "action required" },
    zh: { pending: "等待中", passed: "通过", "action-required": "需要处理" },
    ja: { pending: "保留中", passed: "合格", "action-required": "対応が必要" },
    ko: { pending: "대기 중", passed: "통과", "action-required": "조치 필요" },
    es: { pending: "pendiente", passed: "correcto", "action-required": "requiere acción" }
  } as const;

  return map[locale][status];
}

function onboardingCopy(locale: Locale) {
  const copy = {
    en: {
      title: "Welcome to SlackClaw",
      intro: "Let’s verify your system is ready for OpenClaw and then continue to deployment.",
      systemTitle: "System Environment Check",
      systemDetail: "SlackClaw is checking your local prerequisites before deployment.",
      continueToDeploy: "Continue to Deploy",
      continueToDashboard: "Continue to Dashboard",
      readyTitle: "System check complete",
      readyDetail: "Your environment is ready. Continue to deploy OpenClaw.",
      reviewTitle: "Review required items",
      reviewDetail: "SlackClaw can still continue, but some items may need attention during deployment.",
      featureOne: "One-click deployment",
      featureOneDetail: "Deploy OpenClaw and managed variants without terminal commands.",
      featureTwo: "Guided configuration",
      featureTwoDetail: "Walk through onboarding, channels, health checks, and gateway start in order.",
      featureThree: "Live chat console",
      featureThreeDetail: "Use OpenClaw through SlackClaw’s local-first interface once setup is complete.",
      checkSystem: "Check System Requirements",
      back: "Back",
      uninstallEngine: "Uninstall OpenClaw",
      uninstallingEngine: "Uninstalling..."
    },
    zh: {
      title: "欢迎使用 SlackClaw",
      intro: "先检查系统环境是否适合 OpenClaw，然后继续部署。",
      systemTitle: "系统环境检查",
      systemDetail: "SlackClaw 正在检查部署前需要的本地条件。",
      continueToDeploy: "继续部署",
      continueToDashboard: "继续进入控制台",
      readyTitle: "系统检查完成",
      readyDetail: "环境已经就绪，可以继续部署 OpenClaw。",
      reviewTitle: "请注意以下项目",
      reviewDetail: "SlackClaw 仍可继续，但部署过程中可能需要处理这些项目。",
      featureOne: "一键部署",
      featureOneDetail: "无需终端命令即可部署 OpenClaw 和托管变体。",
      featureTwo: "引导式配置",
      featureTwoDetail: "按顺序完成引导、频道、健康检查和网关启动。",
      featureThree: "实时聊天控制台",
      featureThreeDetail: "完成设置后，可通过 SlackClaw 的本地界面使用 OpenClaw。",
      checkSystem: "检查系统要求",
      back: "返回",
      uninstallEngine: "卸载 OpenClaw",
      uninstallingEngine: "卸载中..."
    },
    ja: {
      title: "SlackClaw へようこそ",
      intro: "まずは OpenClaw を動かせる環境か確認し、その後でデプロイに進みます。",
      systemTitle: "システム環境チェック",
      systemDetail: "SlackClaw がデプロイ前の前提条件を確認しています。",
      continueToDeploy: "デプロイへ進む",
      continueToDashboard: "ダッシュボードへ進む",
      readyTitle: "システムチェック完了",
      readyDetail: "環境の準備ができました。OpenClaw のデプロイを続けてください。",
      reviewTitle: "確認が必要な項目があります",
      reviewDetail: "SlackClaw は続行できますが、デプロイ中に対応が必要な場合があります。",
      featureOne: "ワンクリックデプロイ",
      featureOneDetail: "ターミナルなしで OpenClaw と管理バリアントをデプロイします。",
      featureTwo: "ガイド付き設定",
      featureTwoDetail: "オンボーディング、チャネル、ヘルスチェック、ゲートウェイ起動を順番に進めます。",
      featureThree: "ライブチャットコンソール",
      featureThreeDetail: "設定完了後は SlackClaw のローカル UI から OpenClaw を使えます。",
      checkSystem: "システム要件を確認",
      back: "戻る",
      uninstallEngine: "OpenClaw を削除",
      uninstallingEngine: "削除中..."
    },
    ko: {
      title: "SlackClaw에 오신 것을 환영합니다",
      intro: "먼저 OpenClaw 실행 환경을 확인한 뒤 배포로 진행합니다.",
      systemTitle: "시스템 환경 점검",
      systemDetail: "SlackClaw가 배포 전에 필요한 로컬 조건을 확인하고 있습니다.",
      continueToDeploy: "배포로 계속",
      continueToDashboard: "대시보드로 계속",
      readyTitle: "시스템 점검 완료",
      readyDetail: "환경 준비가 끝났습니다. OpenClaw 배포를 계속하세요.",
      reviewTitle: "확인이 필요한 항목",
      reviewDetail: "SlackClaw는 계속 진행할 수 있지만 배포 중 일부 항목을 확인해야 할 수 있습니다.",
      featureOne: "원클릭 배포",
      featureOneDetail: "터미널 없이 OpenClaw와 관리형 변형을 배포합니다.",
      featureTwo: "가이드 설정",
      featureTwoDetail: "온보딩, 채널, 상태 점검, 게이트웨이 시작을 순서대로 진행합니다.",
      featureThree: "실시간 채팅 콘솔",
      featureThreeDetail: "설정 후 SlackClaw의 로컬 UI에서 OpenClaw를 사용할 수 있습니다.",
      checkSystem: "시스템 요구 사항 확인",
      back: "뒤로",
      uninstallEngine: "OpenClaw 제거",
      uninstallingEngine: "제거 중..."
    },
    es: {
      title: "Bienvenido a SlackClaw",
      intro: "Primero comprobamos que tu sistema está listo para OpenClaw y luego seguimos con el despliegue.",
      systemTitle: "Comprobación del entorno",
      systemDetail: "SlackClaw está revisando los requisitos locales antes del despliegue.",
      continueToDeploy: "Continuar al despliegue",
      continueToDashboard: "Continuar al panel",
      readyTitle: "Comprobación completada",
      readyDetail: "Tu entorno está listo. Continúa con el despliegue de OpenClaw.",
      reviewTitle: "Elementos a revisar",
      reviewDetail: "SlackClaw puede continuar, pero algunos elementos pueden requerir atención durante el despliegue.",
      featureOne: "Despliegue con un clic",
      featureOneDetail: "Despliega OpenClaw y variantes gestionadas sin terminal.",
      featureTwo: "Configuración guiada",
      featureTwoDetail: "Sigue onboarding, canales, comprobaciones de salud y arranque del gateway en orden.",
      featureThree: "Consola de chat en vivo",
      featureThreeDetail: "Usa OpenClaw desde la interfaz local de SlackClaw cuando termine la configuración.",
      checkSystem: "Comprobar requisitos",
      back: "Atrás",
      uninstallEngine: "Desinstalar OpenClaw",
      uninstallingEngine: "Desinstalando..."
    }
  } as const;

  return copy[locale];
}

function shellCopy(locale: Locale) {
  const copy = {
    en: {
      dashboard: "Dashboard",
      deploy: "Deploy",
      configuration: "Configuration",
      skills: "Skills",
      chat: "Chat",
      settings: "Settings",
      status: "Status",
      active: "Active",
      needsSetup: "Needs setup"
    },
    zh: {
      dashboard: "总览",
      deploy: "部署",
      configuration: "配置",
      skills: "技能",
      chat: "聊天",
      settings: "设置",
      status: "状态",
      active: "运行中",
      needsSetup: "需要设置"
    },
    ja: {
      dashboard: "ダッシュボード",
      deploy: "デプロイ",
      configuration: "設定",
      skills: "スキル",
      chat: "チャット",
      settings: "設定",
      status: "状態",
      active: "稼働中",
      needsSetup: "セットアップが必要"
    },
    ko: {
      dashboard: "대시보드",
      deploy: "배포",
      configuration: "구성",
      skills: "스킬",
      chat: "채팅",
      settings: "설정",
      status: "상태",
      active: "실행 중",
      needsSetup: "설정 필요"
    },
    es: {
      dashboard: "Panel",
      deploy: "Despliegue",
      configuration: "Configuración",
      skills: "Habilidades",
      chat: "Chat",
      settings: "Ajustes",
      status: "Estado",
      active: "Activo",
      needsSetup: "Necesita configuración"
    }
  } as const;

  return copy[locale];
}

function configCopy(locale: Locale) {
  const copy = {
    en: {
      title: "Configuration",
      subtitle: "Configure AI models and communication channels.",
      modelsTab: (count: number) => `AI Models (${count})`,
      channelsTab: (count: number) => `Channels (${count})`,
      modelInfoTitle: "AI Model Configuration",
      modelInfoDetail:
        "Configure multiple AI models from different providers. SlackClaw reads the live OpenClaw catalog, supports API key and OAuth authentication, and lets you choose the default model before onboarding channels.",
      modelPointOne: "15+ providers supported",
      modelPointTwo: "OAuth & API key auth",
      modelPointThree: "Multiple models per provider",
      refreshProviders: "Refresh providers",
      default: "Default",
      active: "Active",
      configured: "Configured",
      needsAuth: "Needs auth",
      configuredModel: "Configured model",
      source: "Source",
      sourceInstalled: "Detected from installed OpenClaw",
      authentication: "Authentication",
      authInteractive: "OAuth / interactive",
      authApi: "API key",
      editProvider: "Edit Provider",
      documentation: "Documentation",
      noProviders: "No providers are configured yet",
      noProvidersDetail: "Select a provider below and add your first model configuration.",
      addNewModel: "Add New Model",
      addModelTitle: "Add AI Model",
      addModelDetail: "Choose a provider and configure authentication.",
      selectedProviderDetail: "Configure your model settings",
      close: "Close",
      model: "Model",
      selectModel: "Select a model",
      authMethod: "Authentication Method",
      interactiveFlow: "Interactive flow",
      directSetup: "Direct setup",
      authProgress: "Authentication Progress",
      openAuthWindow: "Open authentication window",
      pasteRedirect: "Paste the redirect URL or code",
      pastePlaceholder: "Paste the callback URL or one-time code",
      finishAuth: "Finish Authentication",
      sending: "Sending...",
      helpTitle: "Need help getting started?",
      helpLink: (provider: string) => `View ${provider} documentation`,
      cancel: "Cancel",
      savingModel: "Saving model...",
      setDefaultModel: "Set Default Model",
      configuringProvider: "Configuring provider...",
      configureProvider: "Configure",
      addModelAction: "Add Model",
      changeProvider: "Change Provider",
      saveTitle: "Save Configuration",
      saveReady: "Model configuration is already complete. You can continue configuring channels.",
      savePending: "Apply your provider and model settings, then complete onboarding to unlock channels.",
      onboardingComplete: "Onboarding Complete",
      saveModels: "Save Models",
      completeOnboardingFirst: "Complete onboarding first",
      completeOnboardingFirstDetail: "Finish the AI Models step first. SlackClaw only unlocks channels after OpenClaw onboarding succeeds.",
      channelsInfoTitle: "Communication Channels",
      channelsInfoDetail: "Configure Telegram, WhatsApp, Feishu, and the experimental WeChat workaround, then restart the gateway.",
      channelsPointOne: "Guided setup order",
      channelsPointTwo: "Pairing approval support",
      channelsPointThree: "Gateway restart after channels",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      feishu: "Feishu (飞书)",
      wechat: "WeChat Workaround",
      experimental: "Experimental",
      telegramToken: "Telegram bot token",
      accountName: "Account name",
      pairingCode: "Pairing code",
      saveTelegram: "Save Telegram",
      approveTelegram: "Approve Telegram Pairing",
      startWhatsapp: "Start WhatsApp Login",
      approveWhatsapp: "Approve WhatsApp Pairing",
      approveFeishu: "Approve Feishu Pairing",
      pluginPackage: "Plugin package",
      corpId: "Corp ID",
      agentId: "Agent ID",
      secret: "Secret",
      webhookToken: "Webhook token",
      encodingAesKey: "Encoding AES key",
      configureWechat: "Configure WeChat Workaround",
      restartGateway: "Restart Gateway",
      channelSaveDetail: "Apply changes to your channel configuration and restart the OpenClaw gateway.",
      restarting: "Restarting..."
    },
    zh: {
      title: "配置",
      subtitle: "配置 AI 模型和通信频道。",
      modelsTab: (count: number) => `AI 模型（${count}）`,
      channelsTab: (count: number) => `频道（${count}）`,
      modelInfoTitle: "AI 模型配置",
      modelInfoDetail: "可配置多个不同提供商的 AI 模型。SlackClaw 会读取 OpenClaw 的实时目录，支持 API Key 与 OAuth 认证，并可在频道引导前选择默认模型。",
      modelPointOne: "支持 15+ 提供商",
      modelPointTwo: "支持 OAuth 与 API Key",
      modelPointThree: "每个提供商支持多个模型",
      refreshProviders: "刷新提供商",
      default: "默认",
      active: "已启用",
      configured: "已配置",
      needsAuth: "需要认证",
      configuredModel: "已配置模型",
      source: "来源",
      sourceInstalled: "从已安装的 OpenClaw 检测到",
      authentication: "认证方式",
      authInteractive: "OAuth / 交互式",
      authApi: "API Key",
      editProvider: "编辑提供商",
      documentation: "文档",
      noProviders: "尚未配置任何提供商",
      noProvidersDetail: "请先在下方选择一个提供商并添加首个模型配置。",
      addNewModel: "添加新模型",
      addModelTitle: "添加 AI 模型",
      addModelDetail: "选择提供商并配置认证。",
      selectedProviderDetail: "配置你的模型设置",
      close: "关闭",
      model: "模型",
      selectModel: "选择模型",
      authMethod: "认证方式",
      interactiveFlow: "交互式流程",
      directSetup: "直接配置",
      authProgress: "认证进度",
      openAuthWindow: "打开认证窗口",
      pasteRedirect: "粘贴回调链接或验证码",
      pastePlaceholder: "粘贴回调 URL 或一次性验证码",
      finishAuth: "完成认证",
      sending: "发送中...",
      helpTitle: "需要快速上手帮助？",
      helpLink: (provider: string) => `查看 ${provider} 文档`,
      cancel: "取消",
      savingModel: "保存模型中...",
      setDefaultModel: "设为默认模型",
      configuringProvider: "配置提供商中...",
      configureProvider: "配置",
      addModelAction: "添加模型",
      changeProvider: "更换提供商",
      saveTitle: "保存配置",
      saveReady: "模型配置已完成。你可以继续配置频道。",
      savePending: "先应用提供商和模型设置，再完成引导以解锁频道。",
      onboardingComplete: "引导已完成",
      saveModels: "保存模型",
      completeOnboardingFirst: "请先完成引导",
      completeOnboardingFirstDetail: "请先完成 AI 模型步骤。只有 OpenClaw 引导成功后 SlackClaw 才会解锁频道。",
      channelsInfoTitle: "通信频道",
      channelsInfoDetail: "配置 Telegram、WhatsApp、飞书和实验性的微信变通方案，然后重启网关。",
      channelsPointOne: "按顺序引导设置",
      channelsPointTwo: "支持配对审批",
      channelsPointThree: "频道完成后重启网关",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      feishu: "飞书",
      wechat: "微信变通方案",
      experimental: "实验性",
      telegramToken: "Telegram 机器人令牌",
      accountName: "账户名称",
      pairingCode: "配对码",
      saveTelegram: "保存 Telegram",
      approveTelegram: "批准 Telegram 配对",
      startWhatsapp: "开始 WhatsApp 登录",
      approveWhatsapp: "批准 WhatsApp 配对",
      approveFeishu: "批准飞书配对",
      pluginPackage: "插件包",
      corpId: "企业 ID",
      agentId: "Agent ID",
      secret: "Secret",
      webhookToken: "Webhook Token",
      encodingAesKey: "Encoding AES Key",
      configureWechat: "配置微信变通方案",
      restartGateway: "重启网关",
      channelSaveDetail: "应用频道配置更改并重启 OpenClaw 网关。",
      restarting: "重启中..."
    },
    ja: {
      title: "設定",
      subtitle: "AI モデルと通信チャネルを設定します。",
      modelsTab: (count: number) => `AI モデル (${count})`,
      channelsTab: (count: number) => `チャネル (${count})`,
      modelInfoTitle: "AI モデル設定",
      modelInfoDetail: "複数プロバイダーの AI モデルを設定できます。SlackClaw は OpenClaw のライブカタログを読み取り、API キーと OAuth 認証をサポートし、チャネルのオンボーディング前に既定モデルを選べます。",
      modelPointOne: "15 以上のプロバイダーに対応",
      modelPointTwo: "OAuth と API キー認証",
      modelPointThree: "各プロバイダーで複数モデル",
      refreshProviders: "プロバイダーを更新",
      default: "既定",
      active: "有効",
      configured: "設定済み",
      needsAuth: "認証が必要",
      configuredModel: "設定済みモデル",
      source: "ソース",
      sourceInstalled: "インストール済み OpenClaw から検出",
      authentication: "認証",
      authInteractive: "OAuth / 対話式",
      authApi: "API キー",
      editProvider: "プロバイダーを編集",
      documentation: "ドキュメント",
      noProviders: "まだプロバイダーが設定されていません",
      noProvidersDetail: "下からプロバイダーを選び、最初のモデル設定を追加してください。",
      addNewModel: "新しいモデルを追加",
      addModelTitle: "AI モデルを追加",
      addModelDetail: "プロバイダーを選択して認証を設定します。",
      selectedProviderDetail: "モデル設定を構成します",
      close: "閉じる",
      model: "モデル",
      selectModel: "モデルを選択",
      authMethod: "認証方法",
      interactiveFlow: "対話型フロー",
      directSetup: "直接設定",
      authProgress: "認証の進行状況",
      openAuthWindow: "認証ウィンドウを開く",
      pasteRedirect: "リダイレクト URL またはコードを貼り付け",
      pastePlaceholder: "コールバック URL またはワンタイムコードを貼り付け",
      finishAuth: "認証を完了",
      sending: "送信中...",
      helpTitle: "開始方法で困っていますか？",
      helpLink: (provider: string) => `${provider} のドキュメントを見る`,
      cancel: "キャンセル",
      savingModel: "モデルを保存中...",
      setDefaultModel: "既定モデルに設定",
      configuringProvider: "プロバイダーを設定中...",
      configureProvider: "設定",
      addModelAction: "モデルを追加",
      changeProvider: "プロバイダーを変更",
      saveTitle: "設定を保存",
      saveReady: "モデル設定は完了しています。続けてチャネルを設定できます。",
      savePending: "まずプロバイダーとモデル設定を適用し、その後オンボーディングを完了してチャネルを解放してください。",
      onboardingComplete: "オンボーディング完了",
      saveModels: "モデルを保存",
      completeOnboardingFirst: "先にオンボーディングを完了してください",
      completeOnboardingFirstDetail: "まず AI モデル手順を完了してください。OpenClaw のオンボーディング成功後にのみ SlackClaw はチャネルを解放します。",
      channelsInfoTitle: "通信チャネル",
      channelsInfoDetail: "Telegram、WhatsApp、Feishu、実験的な WeChat 回避策を設定し、その後ゲートウェイを再起動します。",
      channelsPointOne: "ガイド付きの設定順序",
      channelsPointTwo: "ペアリング承認をサポート",
      channelsPointThree: "チャネル後にゲートウェイ再起動",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      feishu: "Feishu (飞书)",
      wechat: "WeChat ワークアラウンド",
      experimental: "実験的",
      telegramToken: "Telegram ボットトークン",
      accountName: "アカウント名",
      pairingCode: "ペアリングコード",
      saveTelegram: "Telegram を保存",
      approveTelegram: "Telegram ペアリングを承認",
      startWhatsapp: "WhatsApp ログインを開始",
      approveWhatsapp: "WhatsApp ペアリングを承認",
      approveFeishu: "Feishu ペアリングを承認",
      pluginPackage: "プラグインパッケージ",
      corpId: "Corp ID",
      agentId: "Agent ID",
      secret: "Secret",
      webhookToken: "Webhook token",
      encodingAesKey: "Encoding AES key",
      configureWechat: "WeChat 回避策を設定",
      restartGateway: "ゲートウェイを再起動",
      channelSaveDetail: "チャネル設定の変更を適用し、OpenClaw ゲートウェイを再起動します。",
      restarting: "再起動中..."
    },
    ko: {
      title: "구성",
      subtitle: "AI 모델과 통신 채널을 구성합니다.",
      modelsTab: (count: number) => `AI 모델 (${count})`,
      channelsTab: (count: number) => `채널 (${count})`,
      modelInfoTitle: "AI 모델 구성",
      modelInfoDetail: "여러 공급자의 AI 모델을 구성할 수 있습니다. SlackClaw는 OpenClaw의 실시간 카탈로그를 읽고 API 키 및 OAuth 인증을 지원하며 채널 온보딩 전에 기본 모델을 선택할 수 있습니다.",
      modelPointOne: "15개 이상 공급자 지원",
      modelPointTwo: "OAuth 및 API 키 인증",
      modelPointThree: "공급자별 여러 모델",
      refreshProviders: "공급자 새로고침",
      default: "기본값",
      active: "활성",
      configured: "구성됨",
      needsAuth: "인증 필요",
      configuredModel: "구성된 모델",
      source: "출처",
      sourceInstalled: "설치된 OpenClaw에서 감지됨",
      authentication: "인증",
      authInteractive: "OAuth / 대화형",
      authApi: "API 키",
      editProvider: "공급자 편집",
      documentation: "문서",
      noProviders: "아직 구성된 공급자가 없습니다",
      noProvidersDetail: "아래에서 공급자를 선택하고 첫 모델 구성을 추가하세요.",
      addNewModel: "새 모델 추가",
      addModelTitle: "AI 모델 추가",
      addModelDetail: "공급자를 선택하고 인증을 구성하세요.",
      selectedProviderDetail: "모델 설정을 구성하세요",
      close: "닫기",
      model: "모델",
      selectModel: "모델 선택",
      authMethod: "인증 방식",
      interactiveFlow: "대화형 흐름",
      directSetup: "직접 설정",
      authProgress: "인증 진행 상황",
      openAuthWindow: "인증 창 열기",
      pasteRedirect: "리디렉션 URL 또는 코드를 붙여넣기",
      pastePlaceholder: "콜백 URL 또는 일회용 코드를 붙여넣으세요",
      finishAuth: "인증 완료",
      sending: "전송 중...",
      helpTitle: "시작이 어렵나요?",
      helpLink: (provider: string) => `${provider} 문서 보기`,
      cancel: "취소",
      savingModel: "모델 저장 중...",
      setDefaultModel: "기본 모델로 설정",
      configuringProvider: "공급자 구성 중...",
      configureProvider: "구성",
      addModelAction: "모델 추가",
      changeProvider: "공급자 변경",
      saveTitle: "구성 저장",
      saveReady: "모델 구성이 이미 완료되었습니다. 계속해서 채널을 구성할 수 있습니다.",
      savePending: "공급자와 모델 설정을 적용한 뒤 온보딩을 완료해 채널을 잠금 해제하세요.",
      onboardingComplete: "온보딩 완료",
      saveModels: "모델 저장",
      completeOnboardingFirst: "먼저 온보딩을 완료하세요",
      completeOnboardingFirstDetail: "먼저 AI 모델 단계를 완료하세요. OpenClaw 온보딩이 성공해야 SlackClaw가 채널을 잠금 해제합니다.",
      channelsInfoTitle: "통신 채널",
      channelsInfoDetail: "Telegram, WhatsApp, Feishu, 실험적 WeChat 우회 구성을 마친 뒤 게이트웨이를 재시작합니다.",
      channelsPointOne: "가이드 순서 설정",
      channelsPointTwo: "페어링 승인 지원",
      channelsPointThree: "채널 후 게이트웨이 재시작",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      feishu: "Feishu (飞书)",
      wechat: "WeChat 우회 구성",
      experimental: "실험적",
      telegramToken: "Telegram 봇 토큰",
      accountName: "계정 이름",
      pairingCode: "페어링 코드",
      saveTelegram: "Telegram 저장",
      approveTelegram: "Telegram 페어링 승인",
      startWhatsapp: "WhatsApp 로그인 시작",
      approveWhatsapp: "WhatsApp 페어링 승인",
      approveFeishu: "Feishu 페어링 승인",
      pluginPackage: "플러그인 패키지",
      corpId: "Corp ID",
      agentId: "Agent ID",
      secret: "Secret",
      webhookToken: "Webhook token",
      encodingAesKey: "Encoding AES key",
      configureWechat: "WeChat 우회 구성",
      restartGateway: "게이트웨이 재시작",
      channelSaveDetail: "채널 구성 변경을 적용하고 OpenClaw 게이트웨이를 재시작합니다.",
      restarting: "재시작 중..."
    },
    es: {
      title: "Configuración",
      subtitle: "Configura modelos de IA y canales de comunicación.",
      modelsTab: (count: number) => `Modelos de IA (${count})`,
      channelsTab: (count: number) => `Canales (${count})`,
      modelInfoTitle: "Configuración de modelos de IA",
      modelInfoDetail: "Configura varios modelos de IA de distintos proveedores. SlackClaw lee el catálogo en vivo de OpenClaw, admite autenticación por API key y OAuth, y te permite elegir el modelo por defecto antes del onboarding de canales.",
      modelPointOne: "Más de 15 proveedores",
      modelPointTwo: "OAuth y API key",
      modelPointThree: "Varios modelos por proveedor",
      refreshProviders: "Actualizar proveedores",
      default: "Predeterminado",
      active: "Activo",
      configured: "Configurado",
      needsAuth: "Necesita autenticación",
      configuredModel: "Modelo configurado",
      source: "Origen",
      sourceInstalled: "Detectado desde OpenClaw instalado",
      authentication: "Autenticación",
      authInteractive: "OAuth / interactivo",
      authApi: "API key",
      editProvider: "Editar proveedor",
      documentation: "Documentación",
      noProviders: "Todavía no hay proveedores configurados",
      noProvidersDetail: "Selecciona un proveedor abajo y añade tu primera configuración de modelo.",
      addNewModel: "Añadir nuevo modelo",
      addModelTitle: "Añadir modelo de IA",
      addModelDetail: "Elige un proveedor y configura la autenticación.",
      selectedProviderDetail: "Configura los ajustes de tu modelo",
      close: "Cerrar",
      model: "Modelo",
      selectModel: "Selecciona un modelo",
      authMethod: "Método de autenticación",
      interactiveFlow: "Flujo interactivo",
      directSetup: "Configuración directa",
      authProgress: "Progreso de autenticación",
      openAuthWindow: "Abrir ventana de autenticación",
      pasteRedirect: "Pega la URL de redirección o el código",
      pastePlaceholder: "Pega la URL de callback o el código de un solo uso",
      finishAuth: "Finalizar autenticación",
      sending: "Enviando...",
      helpTitle: "¿Necesitas ayuda para empezar?",
      helpLink: (provider: string) => `Ver documentación de ${provider}`,
      cancel: "Cancelar",
      savingModel: "Guardando modelo...",
      setDefaultModel: "Definir modelo por defecto",
      configuringProvider: "Configurando proveedor...",
      configureProvider: "Configurar",
      addModelAction: "Añadir modelo",
      changeProvider: "Cambiar proveedor",
      saveTitle: "Guardar configuración",
      saveReady: "La configuración del modelo ya está completa. Puedes continuar con los canales.",
      savePending: "Aplica la configuración del proveedor y del modelo y luego completa el onboarding para desbloquear los canales.",
      onboardingComplete: "Onboarding completo",
      saveModels: "Guardar modelos",
      completeOnboardingFirst: "Completa primero el onboarding",
      completeOnboardingFirstDetail: "Termina primero el paso de AI Models. SlackClaw solo desbloquea los canales cuando el onboarding de OpenClaw termina correctamente.",
      channelsInfoTitle: "Canales de comunicación",
      channelsInfoDetail: "Configura Telegram, WhatsApp, Feishu y el workaround experimental de WeChat y luego reinicia el gateway.",
      channelsPointOne: "Orden guiado de configuración",
      channelsPointTwo: "Soporte para aprobación de emparejamiento",
      channelsPointThree: "Reinicio del gateway tras los canales",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      feishu: "Feishu (飞书)",
      wechat: "Workaround de WeChat",
      experimental: "Experimental",
      telegramToken: "Token del bot de Telegram",
      accountName: "Nombre de la cuenta",
      pairingCode: "Código de emparejamiento",
      saveTelegram: "Guardar Telegram",
      approveTelegram: "Aprobar emparejamiento de Telegram",
      startWhatsapp: "Iniciar sesión de WhatsApp",
      approveWhatsapp: "Aprobar emparejamiento de WhatsApp",
      approveFeishu: "Aprobar emparejamiento de Feishu",
      pluginPackage: "Paquete del plugin",
      corpId: "Corp ID",
      agentId: "Agent ID",
      secret: "Secret",
      webhookToken: "Webhook token",
      encodingAesKey: "Encoding AES key",
      configureWechat: "Configurar workaround de WeChat",
      restartGateway: "Reiniciar gateway",
      channelSaveDetail: "Aplica los cambios de configuración de canales y reinicia el gateway de OpenClaw.",
      restarting: "Reiniciando..."
    }
  } as const;

  return copy[locale];
}

function feishuCopy(locale: Locale) {
  const copy = {
    en: {
      dialogTitle: "Set Up Feishu Channel",
      dialogSubtitle: "Follow the step-by-step guide to connect OpenClaw with your Feishu workspace",
      prepareTitle: "Prepare Feishu Channel",
      prepareSubtitle: "SlackClaw will install the official OpenClaw Feishu plugin before the credential wizard starts.",
      prepareCommandLabel: "Command SlackClaw will run",
      prepareButton: "Install Feishu Plugin",
      setupCardTitle: "Set up your Feishu bot to enable communication through Feishu workspace",
      setupButton: "Configure Feishu Bot",
      changeProvider: "Change setup",
      cancel: "Cancel",
      previous: "Previous",
      nextStep: "Next Step",
      completeSetup: "Complete Setup",
      copy: "Copy",
      paste: "Paste",
      preparing: "Preparing...",
      copied: "Copied to clipboard.",
      testing: "Testing Connection...",
      testConnection: "Test Connection",
      connectionVerified: "Connection Verified",
      connectionSuccess: "Connection Successful!",
      connectionSuccessDetail: "Your Feishu channel is ready to use",
      connectionFailed: "Connection Failed",
      connectionFailedDetail: "Please check your credentials and try again",
      nextSteps: "Next Steps",
      nextOne: "Add the bot to a Feishu group or direct message it",
      nextTwo: "Send a message to test the bot's response",
      nextThree: "Configure your AI models in the Models tab if you haven't already",
      steps: [
        { title: "Create Feishu App", description: "Create an enterprise app in Feishu Open Platform" },
        { title: "Get Credentials", description: "Paste App ID and Secret" },
        { title: "Configure Permissions", description: "Batch import the required scopes" },
        { title: "Enable Bot Capability", description: "Turn on bot capability and set the bot name" },
        { title: "Configure OpenClaw", description: "Save credentials into the official Feishu plugin" },
        { title: "Gateway & Test", description: "Restart gateway, use long connection, publish, and pair" }
      ]
    },
    zh: {
      dialogTitle: "设置飞书频道",
      dialogSubtitle: "按照分步向导将 OpenClaw 连接到你的飞书工作区",
      prepareTitle: "准备飞书频道",
      prepareSubtitle: "SlackClaw 会先安装官方 OpenClaw 飞书插件，然后再进入凭据向导。",
      prepareCommandLabel: "SlackClaw 将运行的命令",
      prepareButton: "安装飞书插件",
      setupCardTitle: "设置飞书机器人以通过飞书工作区进行通信",
      setupButton: "配置飞书机器人",
      changeProvider: "重新设置",
      cancel: "取消",
      previous: "上一步",
      nextStep: "下一步",
      completeSetup: "完成设置",
      copy: "复制",
      paste: "粘贴",
      preparing: "准备中...",
      copied: "已复制到剪贴板。",
      testing: "正在测试连接...",
      testConnection: "测试连接",
      connectionVerified: "连接已验证",
      connectionSuccess: "连接成功！",
      connectionSuccessDetail: "你的飞书频道已可使用",
      connectionFailed: "连接失败",
      connectionFailedDetail: "请检查凭据后重试",
      nextSteps: "后续步骤",
      nextOne: "将机器人添加到飞书群聊或直接消息中",
      nextTwo: "发送一条消息测试机器人的回复",
      nextThree: "如果还没有，请先在模型标签页配置 AI 模型",
      steps: [
        { title: "创建飞书应用", description: "在飞书开放平台创建企业应用" },
        { title: "获取凭据", description: "粘贴 App ID 和 Secret" },
        { title: "配置权限", description: "批量导入所需权限" },
        { title: "启用机器人能力", description: "打开机器人能力并设置机器人名称" },
        { title: "配置 OpenClaw", description: "将凭据保存到官方飞书插件" },
        { title: "网关与测试", description: "重启网关、启用长连接、发布并配对" }
      ]
    },
    ja: {
      dialogTitle: "Feishu チャネルを設定",
      dialogSubtitle: "手順に沿って OpenClaw を Feishu ワークスペースに接続します",
      prepareTitle: "Feishu チャネルを準備",
      prepareSubtitle: "資格情報ウィザードの前に SlackClaw が公式 OpenClaw Feishu プラグインをインストールします。",
      prepareCommandLabel: "SlackClaw が実行するコマンド",
      prepareButton: "Feishu プラグインをインストール",
      setupCardTitle: "Feishu ワークスペース経由で通信できるように Feishu ボットを設定します",
      setupButton: "Feishu ボットを設定",
      changeProvider: "設定を変更",
      cancel: "キャンセル",
      previous: "前へ",
      nextStep: "次へ",
      completeSetup: "設定を完了",
      copy: "コピー",
      paste: "貼り付け",
      preparing: "準備中...",
      copied: "クリップボードにコピーしました。",
      testing: "接続をテスト中...",
      testConnection: "接続をテスト",
      connectionVerified: "接続確認済み",
      connectionSuccess: "接続に成功しました",
      connectionSuccessDetail: "Feishu チャネルを利用できます",
      connectionFailed: "接続に失敗しました",
      connectionFailedDetail: "認証情報を確認して再試行してください",
      nextSteps: "次のステップ",
      nextOne: "ボットを Feishu グループまたはダイレクトメッセージに追加する",
      nextTwo: "メッセージを送って応答を確認する",
      nextThree: "まだなら Models タブで AI モデルを設定する",
      steps: [
        { title: "Feishu アプリを作成", description: "Feishu Open Platform でエンタープライズアプリを作成" },
        { title: "認証情報を取得", description: "App ID と Secret を貼り付け" },
        { title: "権限を設定", description: "必要なスコープを一括導入" },
        { title: "Bot 機能を有効化", description: "Bot 機能をオンにして名前を設定" },
        { title: "OpenClaw を設定", description: "公式 Feishu プラグインへ認証情報を保存" },
        { title: "ゲートウェイとテスト", description: "ゲートウェイ再起動、長接続、有効化、ペアリング" }
      ]
    },
    ko: {
      dialogTitle: "Feishu 채널 설정",
      dialogSubtitle: "단계별 가이드를 따라 OpenClaw를 Feishu 워크스페이스에 연결하세요",
      prepareTitle: "Feishu 채널 준비",
      prepareSubtitle: "자격 증명 마법사를 열기 전에 SlackClaw가 공식 OpenClaw Feishu 플러그인을 설치합니다.",
      prepareCommandLabel: "SlackClaw가 실행할 명령",
      prepareButton: "Feishu 플러그인 설치",
      setupCardTitle: "Feishu 워크스페이스와 통신하려면 Feishu 봇을 설정하세요",
      setupButton: "Feishu 봇 구성",
      changeProvider: "설정 변경",
      cancel: "취소",
      previous: "이전",
      nextStep: "다음 단계",
      completeSetup: "설정 완료",
      copy: "복사",
      paste: "붙여넣기",
      preparing: "준비 중...",
      copied: "클립보드에 복사되었습니다.",
      testing: "연결 테스트 중...",
      testConnection: "연결 테스트",
      connectionVerified: "연결 확인됨",
      connectionSuccess: "연결 성공",
      connectionSuccessDetail: "Feishu 채널을 사용할 수 있습니다",
      connectionFailed: "연결 실패",
      connectionFailedDetail: "자격 증명을 확인하고 다시 시도하세요",
      nextSteps: "다음 단계",
      nextOne: "봇을 Feishu 그룹 또는 DM에 추가하세요",
      nextTwo: "메시지를 보내 봇 응답을 테스트하세요",
      nextThree: "아직 하지 않았다면 Models 탭에서 AI 모델을 구성하세요",
      steps: [
        { title: "Feishu 앱 만들기", description: "Feishu Open Platform에서 엔터프라이즈 앱 생성" },
        { title: "자격 증명 가져오기", description: "App ID와 Secret 붙여넣기" },
        { title: "권한 구성", description: "필수 스코프를 일괄 가져오기" },
        { title: "봇 기능 활성화", description: "봇 기능을 켜고 봇 이름 설정" },
        { title: "OpenClaw 구성", description: "공식 Feishu 플러그인에 자격 증명 저장" },
        { title: "게이트웨이 및 테스트", description: "게이트웨이 재시작, 장기 연결, 게시 및 페어링" }
      ]
    },
    es: {
      dialogTitle: "Configurar canal de Feishu",
      dialogSubtitle: "Sigue la guía paso a paso para conectar OpenClaw con tu espacio de trabajo de Feishu",
      prepareTitle: "Preparar canal de Feishu",
      prepareSubtitle: "SlackClaw instalará el plugin oficial de Feishu para OpenClaw antes de abrir el asistente de credenciales.",
      prepareCommandLabel: "Comando que ejecutará SlackClaw",
      prepareButton: "Instalar plugin de Feishu",
      setupCardTitle: "Configura tu bot de Feishu para habilitar la comunicación mediante tu espacio de trabajo de Feishu",
      setupButton: "Configurar bot de Feishu",
      changeProvider: "Cambiar configuración",
      cancel: "Cancelar",
      previous: "Anterior",
      nextStep: "Siguiente paso",
      completeSetup: "Completar configuración",
      copy: "Copiar",
      paste: "Pegar",
      preparing: "Preparando...",
      copied: "Copiado al portapapeles.",
      testing: "Probando conexión...",
      testConnection: "Probar conexión",
      connectionVerified: "Conexión verificada",
      connectionSuccess: "¡Conexión correcta!",
      connectionSuccessDetail: "Tu canal de Feishu está listo para usarse",
      connectionFailed: "Conexión fallida",
      connectionFailedDetail: "Revisa tus credenciales e inténtalo de nuevo",
      nextSteps: "Siguientes pasos",
      nextOne: "Añade el bot a un grupo de Feishu o envíale un mensaje directo",
      nextTwo: "Envía un mensaje para probar la respuesta del bot",
      nextThree: "Configura tus modelos de IA en la pestaña Models si aún no lo has hecho",
      steps: [
        { title: "Crear app de Feishu", description: "Crea una app empresarial en Feishu Open Platform" },
        { title: "Obtener credenciales", description: "Pega el App ID y Secret" },
        { title: "Configurar permisos", description: "Importa en lote los permisos necesarios" },
        { title: "Activar capacidad de bot", description: "Activa la capacidad de bot y define su nombre" },
        { title: "Configurar OpenClaw", description: "Guarda las credenciales en el plugin oficial de Feishu" },
        { title: "Gateway y prueba", description: "Reinicia el gateway, usa conexión larga, publica y empareja" }
      ]
    }
  } as const;

  return copy[locale];
}

function LanguagePicker(props: {
  locale: Locale;
  onSelectLocale: (locale: Locale) => void;
  ariaLabel: string;
  className?: string;
}) {
  const selected = localeOptions.find((option) => option.value === props.locale) ?? localeOptions[0];

  return (
    <label className={`language-picker ${props.className ?? ""}`}>
      <span className="language-picker-icon" aria-hidden="true">
        🌐
      </span>
      <span className="language-picker-current">
        <span className="language-picker-flag" aria-hidden="true">
          {selected.flag}
        </span>
        <span>{selected.label}</span>
      </span>
      <span className="language-picker-chevron" aria-hidden="true">
        ▾
      </span>
      <select value={props.locale} onChange={(event) => props.onSelectLocale(event.target.value as Locale)} aria-label={props.ariaLabel}>
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.flag} {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FeishuPrepareDialog(props: {
  locale: Locale;
  open: boolean;
  busy: string | null;
  onCancel: () => void;
  onPrepare: () => Promise<void>;
}) {
  const copy = feishuCopy(props.locale);

  if (!props.open) {
    return null;
  }

  return (
    <section className="figma-dialog-backdrop" onClick={props.onCancel}>
      <article className="surface figma-dialog feishu-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="config-card-head">
          <div>
            <h3>{copy.prepareTitle}</h3>
            <p>{copy.prepareSubtitle}</p>
          </div>
        </div>

        <section className="feishu-hero purple">
          <div className="feishu-hero-icon" aria-hidden="true">📦</div>
          <div>
            <h3>Install the official Feishu plugin first</h3>
            <p>SlackClaw prepares the official OpenClaw Feishu channel by downloading the plugin before it asks for your app credentials.</p>
          </div>
        </section>

        <article className="surface feishu-guide-card">
          <div className="feishu-summary-item">
            <span>{copy.prepareCommandLabel}</span>
            <code>openclaw plugins install @openclaw/feishu</code>
          </div>
          <p className="subtle">SlackClaw runs this command for you, then opens the Feishu credential wizard after the plugin is ready.</p>
        </article>

        <div className="button-row spread feishu-nav">
          <button className="button ghost" onClick={props.onCancel}>
            {copy.cancel}
          </button>
          <button className="button primary" onClick={() => void props.onPrepare()} disabled={props.busy === "channel-feishu-prepare"}>
            {props.busy === "channel-feishu-prepare" ? copy.preparing : copy.prepareButton}
          </button>
        </div>
      </article>
    </section>
  );
}

function FeishuSetupDialog(props: {
  locale: Locale;
  open: boolean;
  busy: string | null;
  onCancel: () => void;
  onComplete: (request: {
    appId: string;
    appSecret: string;
    domain?: string;
    botName?: string;
  }) => Promise<void>;
}) {
  const copy = feishuCopy(props.locale);
  const [currentStep, setCurrentStep] = useState(1);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [domain, setDomain] = useState("feishu");
  const [botName, setBotName] = useState("");
  const [gatewayRestarted, setGatewayRestarted] = useState(false);
  const [longConnectionEnabled, setLongConnectionEnabled] = useState(false);
  const [appPublished, setAppPublished] = useState(false);
  const permissionsJson = JSON.stringify(
    {
      scopes: {
        tenant: [
          "aily:file:read",
          "aily:file:write",
          "application:application.app_message_stats.overview:readonly",
          "application:application:self_manage",
          "application:bot.menu:write",
          "cardkit:card:read",
          "cardkit:card:write",
          "contact:user.employee_id:readonly",
          "corehr:file:download",
          "event:ip_list",
          "im:chat.access_event.bot_p2p_chat:read",
          "im:chat.members:bot_access",
          "im:message",
          "im:message.group_at_msg:readonly",
          "im:message.p2p_msg:readonly",
          "im:message:readonly",
          "im:message:send_as_bot",
          "im:resource"
        ],
        user: ["aily:file:read", "aily:file:write", "im:chat.access_event.bot_p2p_chat:read"]
      }
    },
    null,
    2
  );

  useEffect(() => {
    if (!props.open) {
      setCurrentStep(1);
      setAppId("");
      setAppSecret("");
      setDomain("feishu");
      setBotName("");
      setGatewayRestarted(false);
      setLongConnectionEnabled(false);
      setAppPublished(false);
    }
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  function canProceed(step: number): boolean {
    if (step === 2) {
      return true;
    }
    if (step === 6) {
      return Boolean(appId.trim() && appSecret.trim());
    }
    return true;
  }

  async function copyToClipboard(value: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(value);
  }

  async function pasteFromClipboard(setter: (value: string) => void) {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      return;
    }

    const value = await navigator.clipboard.readText();
    if (value) {
      setter(value);
    }
  }

  return (
    <section className="figma-dialog-backdrop" onClick={props.onCancel}>
      <article className="surface figma-dialog feishu-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="config-card-head">
          <div>
            <h3>{copy.dialogTitle}</h3>
            <p>{copy.dialogSubtitle}</p>
          </div>
        </div>

        <div className="feishu-stepper">
          {copy.steps.map((step, index) => {
            const status = currentStep > index + 1 ? "done" : currentStep === index + 1 ? "active" : "idle";
            return (
              <div key={step.title} className="feishu-stepper-item">
                <div className={`feishu-step-badge ${status}`}>
                  {status === "done" ? "✓" : index + 1}
                </div>
                <div className="feishu-step-copy">
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </div>
                {index < copy.steps.length - 1 ? <div className={`feishu-step-line ${currentStep > index + 1 ? "done" : ""}`} /> : null}
              </div>
            );
          })}
        </div>

        <div className="feishu-content">
          {currentStep === 1 ? (
            <div className="stack">
              <section className="feishu-hero blue">
                <div className="feishu-hero-icon" aria-hidden="true">🚀</div>
                <div>
                  <h3>Create the official Feishu app</h3>
                  <p>OpenClaw’s Feishu channel starts with an enterprise app in the Feishu Open Platform. Create the app first, then SlackClaw will save the credentials into OpenClaw for you.</p>
                </div>
              </section>

              <article className="surface feishu-guide-card">
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index">1</div>
                  <div>
                    <strong>Open Feishu Developer Console</strong>
                    <p>Go to the Feishu Open Platform and create an enterprise custom app.</p>
                    <button className="button ghost small" onClick={() => window.open("https://open.feishu.cn/app", "_blank", "noopener,noreferrer")}>
                      Open Feishu Developer Console
                    </button>
                  </div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index">2</div>
                  <div>
                    <strong>Create an enterprise app</strong>
                    <p>Create a new enterprise app and fill in the basic information:</p>
                    <ul className="simple-list">
                      <li>App name, description, and icon</li>
                      <li>Choose the tenant where the bot should run</li>
                      <li>Use the official OpenClaw Feishu plugin flow, not a custom webhook-only bot</li>
                    </ul>
                  </div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index">3</div>
                  <div>
                    <strong>Leave the platform open</strong>
                    <p>You will return to this app console in the next steps to copy credentials, enable bot capability, configure permissions, choose long connection, and publish the app.</p>
                  </div>
                </div>
              </article>

              <section className="feishu-alert amber">
                <strong>Important Note</strong>
                <p>Make sure you have admin permissions in your Feishu workspace to create custom apps. If you do not see the option, contact your workspace administrator.</p>
              </section>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="stack">
              <section className="feishu-hero purple">
                <div className="feishu-hero-icon" aria-hidden="true">🔑</div>
                <div>
                  <h3>Get Your App Credentials</h3>
                  <p>Paste the App ID and App Secret from Feishu into SlackClaw. SlackClaw uses them to configure the official OpenClaw Feishu plugin.</p>
                </div>
              </section>

              <article className="surface feishu-guide-card">
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index purple">1</div>
                  <div>
                    <strong>Find Your Credentials</strong>
                    <p>In the Feishu console, open Your App → Credentials &amp; Basic Info and paste the values here.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    <span>App ID</span>
                    <div className="feishu-inline-field">
                      <input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="cli_a1b2c3d4e5f6g7h8" />
                      <button className="button ghost small" type="button" onClick={() => void pasteFromClipboard(setAppId)}>
                        {copy.paste}
                      </button>
                    </div>
                  </label>
                  <label>
                    <span>App Secret</span>
                    <div className="feishu-inline-field">
                      <input type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder="Enter your App Secret" />
                      <button className="button ghost small" type="button" onClick={() => void pasteFromClipboard(setAppSecret)}>
                        {copy.paste}
                      </button>
                    </div>
                  </label>
                </div>
              </article>

              <section className="feishu-alert blue">
                <strong>Security Tip</strong>
                <p>Your App Secret is sensitive. SlackClaw writes it into the installed OpenClaw configuration, so do not share it or store it in plain text elsewhere.</p>
              </section>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="stack">
              <section className="feishu-hero green">
                <div className="feishu-hero-icon" aria-hidden="true">🔗</div>
                <div>
                  <h3>Configure permissions</h3>
                  <p>Import the exact permission batch required by the OpenClaw Feishu channel guide.</p>
                </div>
              </section>

              <article className="surface feishu-guide-card">
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index green">1</div>
                  <div>
                    <strong>Open Permissions &amp; Scopes</strong>
                    <p>In the Feishu app console, open the permissions section and choose the batch import option.</p>
                  </div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index green">2</div>
                  <div className="stack">
                    <strong>Import the official scope batch</strong>
                    <p>Feishu’s OpenClaw guide uses batch import for the required scopes. Copy the JSON below and import it in the Permissions &amp; Scopes section.</p>
                    <div className="feishu-inline-field">
                      <textarea readOnly value={permissionsJson} />
                      <button className="button ghost small" type="button" onClick={() => void copyToClipboard(permissionsJson)}>
                        {copy.copy}
                      </button>
                    </div>
                    <p>Review the imported scopes and submit them if your workspace requires approval.</p>
                  </div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index green">3</div>
                  <div>
                    <strong>Review and submit permission approval</strong>
                    <ul className="simple-list">
                      <li>Confirm both tenant and user scopes were imported</li>
                      <li>Submit approval if your tenant requires admin review</li>
                      <li>Wait until the required scopes are active before continuing</li>
                    </ul>
                  </div>
                </div>
              </article>

              <section className="feishu-alert amber">
                <strong>Use the exact batch import</strong>
                <p>Do not trim this scope list. The official Feishu channel guide expects this imported set before you enable bot capability and continue to OpenClaw setup.</p>
              </section>
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="stack">
              <section className="feishu-hero orange">
                <div className="feishu-hero-icon" aria-hidden="true">🤖</div>
                <div>
                  <h3>Enable bot capability</h3>
                  <p>Turn on the Feishu bot capability explicitly. This is a required step in the official OpenClaw Feishu setup.</p>
                </div>
              </section>

              <article className="surface feishu-guide-card">
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index orange">1</div>
                  <div>
                    <strong>Enable Bot</strong>
                    <p>In the Feishu app console, open Add Capabilities and enable the Bot capability for this app.</p>
                  </div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index orange">2</div>
                  <div>
                    <strong>Set the bot name and profile</strong>
                    <p>Choose the bot name, avatar, and description that users will see in Feishu chats.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Bot name (optional)</span>
                    <input value={botName} onChange={(event) => setBotName(event.target.value)} placeholder="OpenClaw Bot" />
                  </label>
                  <label>
                    <span>Tenant domain</span>
                    <select value={domain} onChange={(event) => setDomain(event.target.value)}>
                      <option value="feishu">feishu.cn</option>
                      <option value="lark">larksuite.com</option>
                    </select>
                  </label>
                </div>
              </article>

              <section className="feishu-alert blue">
                <strong>Bot capability must be enabled before testing</strong>
                <p>If the bot capability is not enabled, direct messages and pairing will fail even if the credentials are correct.</p>
              </section>
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="stack">
              <section className="feishu-hero orange">
                <div className="feishu-hero-icon" aria-hidden="true">🔒</div>
                <div>
                  <h3>Configure OpenClaw</h3>
                  <p>SlackClaw will write the official Feishu plugin settings into the installed OpenClaw configuration. Long connection is the recommended event delivery mode from the docs.</p>
                </div>
              </section>

              <article className="surface feishu-guide-card">
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index orange">1</div>
                  <div>
                    <strong>Save credentials into OpenClaw</strong>
                    <p>SlackClaw writes the App ID, App Secret, tenant domain, and bot name into the official OpenClaw Feishu plugin configuration.</p>
                  </div>
                </div>
                <div className="feishu-summary-grid">
                  <div className="feishu-summary-item"><span>App ID</span><code>{appId || "Not set"}</code></div>
                  <div className="feishu-summary-item"><span>App Secret</span><code>{appSecret ? "••••••••••••" : "Not set"}</code></div>
                  <div className="feishu-summary-item"><span>Tenant domain</span><code>{domain}</code></div>
                  <div className="feishu-summary-item"><span>Bot name</span><code>{botName || "Default"}</code></div>
                </div>
                <div className="feishu-guide-row">
                  <div className="feishu-guide-index orange">2</div>
                  <div>
                    <strong>What SlackClaw saves</strong>
                    <p>SlackClaw configures the official OpenClaw Feishu plugin with your App ID, App Secret, domain, pairing DM policy, and long-connection mode. You will restart the gateway after this dialog closes.</p>
                  </div>
                </div>
              </article>

              <section className="feishu-alert blue">
                <strong>No public callback URL needed</strong>
                <p>The official Feishu guide uses long connection, so you do not need to expose a public webhook callback URL in this SlackClaw flow.</p>
              </section>
            </div>
          ) : null}

          {currentStep === 6 ? (
            <div className="stack">
              <section className="feishu-hero blue">
                <div className="feishu-hero-icon" aria-hidden="true">✅</div>
                <div>
                  <h3>Start the gateway and finish Feishu setup</h3>
                  <p>After SlackClaw saves the config, restart the OpenClaw gateway, switch Feishu event delivery to long connection, publish the app, and test direct messages.</p>
                </div>
              </section>

              <article className="surface feishu-summary-card">
                <h3>Configuration Summary</h3>
                <div className="feishu-summary-grid">
                  <div className="feishu-summary-item"><span>App ID</span><code>{appId || "Not set"}</code></div>
                  <div className="feishu-summary-item"><span>App Secret</span><code>{appSecret ? "••••••••••••" : "Not set"}</code></div>
                  <div className="feishu-summary-item"><span>Tenant domain</span><code>{domain}</code></div>
                  <div className="feishu-summary-item"><span>Bot name</span><code>{botName || "Default"}</code></div>
                </div>
              </article>

              <article className="surface feishu-test-card">
                <div className="feishu-test-copy">
                  <strong>Required follow-up after saving</strong>
                  <p>Use the guide below after SlackClaw writes the Feishu config into OpenClaw.</p>
                </div>
                <div className="feishu-checklist">
                  <label className="feishu-check">
                    <input type="checkbox" checked={gatewayRestarted} onChange={(event) => setGatewayRestarted(event.target.checked)} />
                    <span>I will restart the OpenClaw gateway from the Channels page right after saving.</span>
                  </label>
                  <label className="feishu-check">
                    <input type="checkbox" checked={longConnectionEnabled} onChange={(event) => setLongConnectionEnabled(event.target.checked)} />
                    <span>I will enable <strong>Use long connection to receive events</strong> and add <code>im.message.receive_v1</code> in Feishu.</span>
                  </label>
                  <label className="feishu-check">
                    <input type="checkbox" checked={appPublished} onChange={(event) => setAppPublished(event.target.checked)} />
                    <span>I will publish the app, send a direct message to the bot, and approve the pairing code in SlackClaw if prompted.</span>
                  </label>
                </div>
              </article>

              <article className="surface feishu-next-card">
                <h3>Official OpenClaw order</h3>
                <ul className="simple-list">
                  <li>Save the Feishu credentials into OpenClaw with this dialog.</li>
                  <li>Restart the gateway from the Channels page.</li>
                  <li>In Feishu Event Subscriptions, choose long connection and add <code>im.message.receive_v1</code>.</li>
                  <li>Publish the app, add the bot, send a direct message, and approve pairing.</li>
                </ul>
              </article>
            </div>
          ) : null}
        </div>

        <div className="button-row spread feishu-nav">
          <button
            className="button ghost"
            onClick={() => {
              if (currentStep === 1) {
                props.onCancel();
                return;
              }
              setCurrentStep((step) => step - 1);
            }}
          >
            {currentStep === 1 ? copy.cancel : copy.previous}
          </button>
          {currentStep < copy.steps.length ? (
            <button className="button primary" onClick={() => setCurrentStep((step) => step + 1)} disabled={!canProceed(currentStep)}>
              {copy.nextStep}
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() =>
                void props.onComplete({
                  appId: appId.trim(),
                  appSecret: appSecret.trim(),
                  domain,
                  botName: botName.trim() || undefined
                })
              }
              disabled={!gatewayRestarted || !longConnectionEnabled || !appPublished || props.busy === "channel-feishu"}
            >
              {props.busy === "channel-feishu" ? copy.testing : copy.completeSetup}
            </button>
          )}
        </div>
      </article>
    </section>
  );
}

function AppShell(props: {
  activeView: View;
  onSelectView: (view: View) => void;
  locale: Locale;
  onSelectLocale: (locale: Locale) => void;
  overview: ProductOverview;
  children: React.ReactNode;
}) {
  const copy = shellCopy(props.locale);
  const navItems: Array<{ view: Exclude<View, "onboarding">; label: string; icon: string }> = [
    { view: "dashboard", label: copy.dashboard, icon: "◫" },
    { view: "deploy", label: copy.deploy, icon: "🚀" },
    { view: "config", label: copy.configuration, icon: "⚙" },
    { view: "skills", label: copy.skills, icon: "⚡" },
    { view: "chat", label: copy.chat, icon: "💬" },
    { view: "settings", label: copy.settings, icon: "☰" }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          <div>
            <h1>SlackClaw</h1>
            <p>OpenClaw Made Easy</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`sidebar-link ${props.activeView === item.view ? "active" : ""}`}
              onClick={() => props.onSelectView(item.view)}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`sidebar-status ${props.overview.engine.running ? "good" : "warn"}`}>
            <strong>
              {copy.status}: {props.overview.engine.running ? copy.active : copy.needsSetup}
            </strong>
            <p>{props.overview.engine.summary}</p>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-main-head">
          <LanguagePicker locale={props.locale} onSelectLocale={props.onSelectLocale} ariaLabel={t(props.locale, "language")} className="app-shell-language-picker" />
        </div>
        {props.children}
      </main>
    </div>
  );
}

function OnboardingScreen(props: {
  locale: Locale;
  overview: ProductOverview;
  onboardingStep: number;
  setOnboardingStep: (step: number) => void;
  busy: string | null;
  onStartIntro: () => Promise<void>;
  onContinueAfterCheck: () => void;
  onSelectLocale: (locale: Locale) => void;
  onUninstallEngine: () => Promise<void>;
}) {
  const copy = onboardingCopy(props.locale);
  const checks = props.overview.installChecks;
  const passedChecks = checks.filter((check) => check.status === "passed").length;
  const progress = props.onboardingStep === 1 ? 50 : 100;
  const allChecksPassed = passedChecks === checks.length || checks.length === 0;

  return (
    <div className="onboarding-shell">
      <div className="onboarding-wrap">
        <div className="onboarding-header">
          <div className="logo-lockup">
            <div className="brand-icon large">✦</div>
            <h1>SlackClaw</h1>
          </div>
          <p>{t(props.locale, "introDetail")}</p>
          <LanguagePicker locale={props.locale} onSelectLocale={props.onSelectLocale} ariaLabel={t(props.locale, "language")} className="onboarding-language-picker" />
        </div>

        <div className="progress-head">
          <span>
            {props.locale === "zh"
              ? `第 ${props.onboardingStep} / 2 步`
              : props.locale === "ja"
                ? `ステップ ${props.onboardingStep} / 2`
                : props.locale === "ko"
                  ? `${props.onboardingStep} / 2 단계`
                  : props.locale === "es"
                    ? `Paso ${props.onboardingStep} de 2`
                    : `Step ${props.onboardingStep} of 2`}
          </span>
          <span>
            {props.locale === "zh"
              ? `已完成 ${progress}%`
              : props.locale === "ja"
                ? `${progress}% 完了`
                : props.locale === "ko"
                  ? `${progress}% 완료`
                  : props.locale === "es"
                    ? `${progress}% completado`
                    : `${progress}% Complete`}
          </span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>

        <section className="surface onboarding-card">
          {props.onboardingStep === 1 ? (
            <>
              <header className="section-copy">
                <h2>{copy.title}</h2>
                <p>{copy.intro}</p>
              </header>
              <div className="feature-stack">
                <article className="feature-card">
                  <span className="feature-icon">🚀</span>
                  <div>
                    <strong>{copy.featureOne}</strong>
                    <p>{copy.featureOneDetail}</p>
                  </div>
                </article>
                <article className="feature-card">
                  <span className="feature-icon">⚙️</span>
                  <div>
                    <strong>{copy.featureTwo}</strong>
                    <p>{copy.featureTwoDetail}</p>
                  </div>
                </article>
                <article className="feature-card">
                  <span className="feature-icon">💬</span>
                  <div>
                    <strong>{copy.featureThree}</strong>
                    <p>{copy.featureThreeDetail}</p>
                  </div>
                </article>
              </div>
              <div className="button-row">
                <button className="button primary" onClick={() => void props.onStartIntro()} disabled={props.busy !== null}>
                  {props.busy === "first-run-intro" ? t(props.locale, "connecting") : copy.checkSystem}
                </button>
                {props.overview.engine.installed ? (
                  <button className="button ghost" onClick={() => void props.onUninstallEngine()} disabled={props.busy !== null}>
                    {props.busy === "engine-uninstall" ? copy.uninstallingEngine : copy.uninstallEngine}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <header className="section-copy">
                <h2>{copy.systemTitle}</h2>
                <p>{copy.systemDetail}</p>
              </header>
              <div className="check-grid">
                {checks.map((check) => (
                  <article key={check.id} className={`check-card ${check.status}`}>
                    {(() => {
                      const localized = localizeInstallCheck(props.locale, check);
                      return (
                        <>
                    <div className="check-title-row">
                      <strong>{localized.label}</strong>
                      <span className={`tiny-badge ${check.status}`}>{localizedStatus(props.locale, check.status)}</span>
                    </div>
                    <p>{localized.detail}</p>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
              <div className={`notice-card ${allChecksPassed ? "good" : "warn"}`}>
                <strong>{allChecksPassed ? copy.readyTitle : copy.reviewTitle}</strong>
                <p>
                  {allChecksPassed
                    ? copy.readyDetail
                    : copy.reviewDetail}
                </p>
              </div>
              <div className="button-row">
                <button className="button ghost" onClick={() => props.setOnboardingStep(1)} disabled={props.busy !== null}>
                  {copy.back}
                </button>
                {props.overview.engine.installed ? (
                  <button className="button ghost" onClick={() => void props.onUninstallEngine()} disabled={props.busy !== null}>
                    {props.busy === "engine-uninstall" ? copy.uninstallingEngine : copy.uninstallEngine}
                  </button>
                ) : null}
                <button className="button primary" onClick={props.onContinueAfterCheck} disabled={props.busy !== null}>
                  {props.overview.firstRun.setupCompleted ? copy.continueToDashboard : copy.continueToDeploy}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function DashboardView(props: { overview: ProductOverview; onSelectView: (view: View) => void }) {
  const stats = [
    { label: "Deployment Status", value: props.overview.engine.running ? "Active" : "Pending", icon: "🖥" },
    { label: "Models Configured", value: String(props.overview.profiles.length), icon: "🧠" },
    { label: "Active Skills", value: String(props.overview.templates.length), icon: "⚡" },
    { label: "Chat Sessions", value: String(props.overview.recentTasks.length), icon: "💬" }
  ];

  const quickActions: Array<{ title: string; description: string; view: View; tone: string }> = [
    { title: "Deploy Instance", description: "Deploy or refresh OpenClaw", view: "deploy", tone: "blue" },
    { title: "Configure Models", description: "Set up onboarding defaults and channels", view: "config", tone: "purple" },
    { title: "Manage Skills", description: "Review preloaded office-work skills", view: "skills", tone: "green" },
    { title: "Start Chatting", description: "Open the chat console", view: "chat", tone: "indigo" }
  ];

  return (
    <div className="page-wrap">
      <header className="page-header">
        <h2>Dashboard</h2>
        <p>Monitor your OpenClaw deployment and SlackClaw setup status.</p>
      </header>

      <section className={`surface deployment-banner ${props.overview.engine.running ? "good" : "warn"}`}>
        <div>
          <strong>{props.overview.engine.running ? "OpenClaw is running" : "No active deployment"}</strong>
          <p>{props.overview.engine.summary}</p>
          <p className="subtle">
            Version: {props.overview.engine.version ?? "not detected"} | Source: {props.overview.installSpec.installSource}
          </p>
        </div>
        <div className="button-row">
          <button className="button ghost" onClick={() => props.onSelectView("config")}>
            Configure
          </button>
          <button className="button primary" onClick={() => props.onSelectView(props.overview.engine.running ? "chat" : "deploy")}>
            {props.overview.engine.running ? "Open Chat" : "Deploy Now"}
          </button>
        </div>
      </section>

      <section className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="surface stat-card">
            <div>
              <p className="label">{stat.label}</p>
              <strong>{stat.value}</strong>
            </div>
            <span className="stat-icon">{stat.icon}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="surface">
          <div className="section-copy">
            <h3>Quick Actions</h3>
            <p>Common tasks and shortcuts</p>
          </div>
          <div className="quick-grid">
            {quickActions.map((action) => (
              <button key={action.title} className={`quick-card ${action.tone}`} onClick={() => props.onSelectView(action.view)}>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="surface">
          <div className="section-copy">
            <h3>Recent Activity</h3>
            <p>Latest SlackClaw events</p>
          </div>
          <div className="activity-list">
            {props.overview.recentTasks.length > 0 ? (
              props.overview.recentTasks.map((task) => (
                <div key={task.taskId} className="activity-item">
                  <span className="activity-dot good" />
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.summary}</p>
                    <span>{formatTime(task.startedAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              props.overview.healthChecks.slice(0, 4).map((check) => (
                <div key={check.id} className="activity-item">
                  <span className={`activity-dot ${statusTone(check)}`} />
                  <div>
                    <strong>{check.title}</strong>
                    <p>{check.summary}</p>
                    <span>{check.detail}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function DeployView(props: {
  locale: Locale;
  overview: ProductOverview;
  busy: string | null;
  onDeploy: (variant: "standard" | "managed-local" | "planned") => Promise<void>;
  onUninstallEngine: () => Promise<void>;
  selectedVariant: string | null;
  setSelectedVariant: (value: string) => void;
  deploySteps: SetupStepResult[];
}) {
  const labels = {
    en: {
      title: "Deploy OpenClaw",
      detail: "Choose a variant and deploy with one click.",
      deployTitle: "Deploying OpenClaw...",
      deployIdle: "One-click deployment",
      deployIdleDetail: "Select your preferred OpenClaw variant and deploy instantly without terminal commands.",
      ready: "Ready to deploy?",
      selected: (value: string) => `You selected ${value}.`,
      empty: "Select a variant to get started.",
      uninstallEngine: "Uninstall OpenClaw",
      uninstallingEngine: "Uninstalling...",
      deployNow: "Deploy Now",
      deploying: "Deploying..."
    },
    zh: {
      title: "部署 OpenClaw",
      detail: "选择一个版本并一键部署。",
      deployTitle: "正在部署 OpenClaw...",
      deployIdle: "一键部署",
      deployIdleDetail: "选择你偏好的 OpenClaw 版本，无需终端即可立即部署。",
      ready: "准备好部署了吗？",
      selected: (value: string) => `你已选择 ${value}。`,
      empty: "请选择一个版本开始。",
      uninstallEngine: "卸载 OpenClaw",
      uninstallingEngine: "卸载中...",
      deployNow: "立即部署",
      deploying: "部署中..."
    },
    ja: {
      title: "OpenClaw をデプロイ",
      detail: "バリアントを選んでワンクリックでデプロイします。",
      deployTitle: "OpenClaw をデプロイ中...",
      deployIdle: "ワンクリックデプロイ",
      deployIdleDetail: "好みの OpenClaw バリアントを選び、ターミナルなしで即座にデプロイします。",
      ready: "デプロイの準備はできましたか？",
      selected: (value: string) => `${value} を選択しました。`,
      empty: "開始するにはバリアントを選択してください。",
      uninstallEngine: "OpenClaw を削除",
      uninstallingEngine: "削除中...",
      deployNow: "今すぐデプロイ",
      deploying: "デプロイ中..."
    },
    ko: {
      title: "OpenClaw 배포",
      detail: "변형을 선택하고 한 번에 배포하세요.",
      deployTitle: "OpenClaw 배포 중...",
      deployIdle: "원클릭 배포",
      deployIdleDetail: "원하는 OpenClaw 변형을 선택하고 터미널 없이 바로 배포하세요.",
      ready: "배포할 준비가 되었나요?",
      selected: (value: string) => `${value}을(를) 선택했습니다.`,
      empty: "시작하려면 변형을 선택하세요.",
      uninstallEngine: "OpenClaw 제거",
      uninstallingEngine: "제거 중...",
      deployNow: "지금 배포",
      deploying: "배포 중..."
    },
    es: {
      title: "Desplegar OpenClaw",
      detail: "Elige una variante y despliega con un clic.",
      deployTitle: "Desplegando OpenClaw...",
      deployIdle: "Despliegue con un clic",
      deployIdleDetail: "Selecciona tu variante preferida de OpenClaw y despliega sin usar terminal.",
      ready: "¿Listo para desplegar?",
      selected: (value: string) => `Has seleccionado ${value}.`,
      empty: "Selecciona una variante para empezar.",
      uninstallEngine: "Desinstalar OpenClaw",
      uninstallingEngine: "Desinstalando...",
      deployNow: "Desplegar ahora",
      deploying: "Desplegando..."
    }
  } as const;
  const copy = labels[props.locale];
  const variants = [
    {
      id: "standard",
      name: "OpenClaw Standard",
      description: "The original OpenClaw path with SlackClaw-managed onboarding and daily controls.",
      icon: "🦅",
      recommended: true,
      features: ["Full SlackClaw workflow", "Channel setup support", "Health and recovery", "Local-first operation"],
      requirements: { memory: "4GB RAM", disk: "10GB", runtime: "System or managed local" }
    },
    {
      id: "managed-local",
      name: "OpenClaw Managed Local",
      description: "Deploy into SlackClaw’s own local runtime under Application Support.",
      icon: "🪶",
      recommended: false,
      features: ["Pinned local runtime", "No global install dependency", "Better packaged-app fit", "Safer for non-technical users"],
      requirements: { memory: "4GB RAM", disk: "10GB", runtime: "Managed local" }
    },
    {
      id: "zeroclaw",
      name: "ZeroClaw",
      description: "Planned future engine target through the adapter seam.",
      icon: "⚡",
      recommended: false,
      features: ["Future adapter support", "Same SlackClaw UI", "Engine swap ready", "Not available yet"],
      requirements: { memory: "TBD", disk: "TBD", runtime: "Planned" }
    },
    {
      id: "ironclaw",
      name: "IronClaw",
      description: "Planned future engine target without product-layer rewrites.",
      icon: "☁️",
      recommended: false,
      features: ["Future adapter support", "Same control plane", "Not available yet", "Roadmap item"],
      requirements: { memory: "TBD", disk: "TBD", runtime: "Planned" }
    }
  ];

  const selectedName = variants.find((variant) => variant.id === props.selectedVariant)?.name;
  const activeDeployStep =
    props.deploySteps.find((step) => step.status === "running") ??
    [...props.deploySteps].reverse().find((step) => step.status === "completed") ??
    props.deploySteps[0];
  const hasInstalledEngine = props.overview.engine.installed;

  return (
    <div className="page-wrap">
      <header className="page-header">
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
      </header>

      <section className={`surface deploy-progress ${props.busy?.startsWith("deploy") ? "active" : ""}`}>
        <strong>{props.busy?.startsWith("deploy") ? copy.deployTitle : copy.deployIdle}</strong>
        <p>
          {props.busy?.startsWith("deploy")
            ? activeDeployStep?.detail ?? "SlackClaw is deploying OpenClaw and preparing the next setup step."
            : copy.deployIdleDetail}
        </p>
        {props.deploySteps.length ? (
          <div className="deploy-step-list">
            {props.deploySteps.map((step) => (
              <div key={step.id} className={`deploy-step-row ${step.status}`}>
                <span className={`tiny-badge ${step.status === "completed" ? "pass" : step.status === "failed" ? "failed" : "pending"}`}>
                  {step.status}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="variant-grid large">
        {variants.map((variant) => {
          const planned = variant.id === "zeroclaw" || variant.id === "ironclaw";
          return (
            <article
              key={variant.id}
              className={`surface deploy-card ${props.selectedVariant === variant.id ? "selected" : ""} ${planned ? "planned" : ""}`}
              onClick={() => props.setSelectedVariant(variant.id)}
            >
              <div className="deploy-card-head">
                <div className="deploy-icon">{variant.icon}</div>
                <div>
                  <h3>{variant.name}</h3>
                  <p>{variant.description}</p>
                </div>
                {variant.recommended ? <span className="tiny-badge pass">Recommended</span> : null}
                {planned ? <span className="tiny-badge pending">Planned</span> : null}
              </div>
              <ul className="simple-list">
                {variant.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="mini-kv-grid">
                <div>
                  <span>Memory</span>
                  <strong>{variant.requirements.memory}</strong>
                </div>
                <div>
                  <span>Disk</span>
                  <strong>{variant.requirements.disk}</strong>
                </div>
                <div>
                  <span>Runtime</span>
                  <strong>{variant.requirements.runtime}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="surface deploy-footer">
        <div>
          <strong>{copy.ready}</strong>
          <p>{selectedName ? copy.selected(selectedName) : copy.empty}</p>
          <p className="subtle">Detected version: {props.overview.engine.version ?? "none"} | Install path: {props.overview.installSpec.installPath ?? "system-managed"}</p>
        </div>
        <div className="button-row">
          {hasInstalledEngine ? (
            <button className="button ghost" onClick={() => void props.onUninstallEngine()} disabled={props.busy !== null}>
              {props.busy === "engine-uninstall" ? copy.uninstallingEngine : copy.uninstallEngine}
            </button>
          ) : null}
          <button
            className="button primary"
            disabled={!props.selectedVariant || props.busy !== null}
            onClick={() =>
              void props.onDeploy(
                props.selectedVariant === "standard"
                  ? "standard"
                  : props.selectedVariant === "managed-local"
                    ? "managed-local"
                    : "planned"
              )
            }
          >
            {props.busy?.startsWith("deploy") ? copy.deploying : copy.deployNow}
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfigView(props: {
  locale: Locale;
  configTab: ConfigTab;
  setConfigTab: (tab: ConfigTab) => void;
  showAddModelDialog: boolean;
  setShowAddModelDialog: (value: boolean) => void;
  modelAuthSession: ModelAuthSession | null;
  modelAuthSessionInput: string;
  setModelAuthSessionInput: (value: string) => void;
  modelConfig: ModelConfigOverview | null;
  selectedProviderId: string;
  setSelectedProviderId: (providerId: string) => void;
  selectedAuthMethodId: string;
  setSelectedAuthMethodId: (methodId: string) => void;
  authValues: Record<string, string>;
  setAuthValues: (values: Record<string, string>) => void;
  selectedModelKey: string;
  setSelectedModelKey: (modelKey: string) => void;
  overview: ProductOverview;
  busy: string | null;
  providerConfigPending: boolean;
  telegramToken: string;
  setTelegramToken: (value: string) => void;
  telegramAccountName: string;
  setTelegramAccountName: (value: string) => void;
  telegramPairingCode: string;
  setTelegramPairingCode: (value: string) => void;
  whatsappPairingCode: string;
  setWhatsappPairingCode: (value: string) => void;
  feishuPairingCode: string;
  setFeishuPairingCode: (value: string) => void;
  showFeishuPrepareDialog: boolean;
  setShowFeishuPrepareDialog: (value: boolean) => void;
  showFeishuDialog: boolean;
  setShowFeishuDialog: (value: boolean) => void;
  wechatPluginSpec: string;
  setWechatPluginSpec: (value: string) => void;
  wechatCorpId: string;
  setWechatCorpId: (value: string) => void;
  wechatAgentId: string;
  setWechatAgentId: (value: string) => void;
  wechatSecret: string;
  setWechatSecret: (value: string) => void;
  wechatToken: string;
  setWechatToken: (value: string) => void;
  wechatEncodingAesKey: string;
  setWechatEncodingAesKey: (value: string) => void;
  onSaveModels: () => Promise<void>;
  onTelegramSetup: () => Promise<void>;
  onTelegramApprove: () => Promise<void>;
  onWhatsappLogin: () => Promise<void>;
  onWhatsappApprove: () => Promise<void>;
  onPrepareFeishu: () => Promise<void>;
  onFeishuApprove: () => Promise<void>;
  onFeishuSetup: (request: {
    appId: string;
    appSecret: string;
    domain?: string;
    botName?: string;
  }) => Promise<void>;
  onWechatSetup: () => Promise<void>;
  onGatewayStart: () => Promise<void>;
  onAuthenticateProvider: () => Promise<void>;
  onSubmitModelAuthInput: () => Promise<void>;
  onAddConfiguredModel: () => Promise<void>;
  onRefreshModelConfig: () => Promise<void>;
}) {
  const telegram = props.overview.channelSetup.channels.find((channel) => channel.id === "telegram");
  const whatsapp = props.overview.channelSetup.channels.find((channel) => channel.id === "whatsapp");
  const feishu = props.overview.channelSetup.channels.find((channel) => channel.id === "feishu");
  const wechat = props.overview.channelSetup.channels.find((channel) => channel.id === "wechat");
  const onboardingComplete = props.overview.channelSetup.baseOnboardingCompleted;
  const copy = configCopy(props.locale);
  const feishuUi = feishuCopy(props.locale);
  const selectedProvider = props.selectedProviderId
    ? props.modelConfig?.providers.find((provider) => provider.id === props.selectedProviderId)
    : undefined;
  const selectedAuthMethod = selectedProvider?.authMethods.find((method) => method.id === props.selectedAuthMethodId) ?? selectedProvider?.authMethods[0];
  const visibleModels =
    selectedProvider && props.modelConfig
      ? props.modelConfig.models.filter((model) => selectedProvider.providerRefs.some((prefix) => model.key.startsWith(prefix)))
      : [];
  const configuredModels =
    props.modelConfig?.configuredModelKeys
      .map((key) => {
        const model = props.modelConfig?.models.find((entry) => entry.key === key);
        const provider = props.modelConfig?.providers.find((entry) => entry.providerRefs.some((prefix) => key.startsWith(prefix)));
        return model && provider ? { model, provider } : null;
      })
      .filter(
        (
          entry
        ): entry is {
          model: NonNullable<typeof props.modelConfig>["models"][number];
          provider: NonNullable<typeof props.modelConfig>["providers"][number];
        } => Boolean(entry)
      ) ?? [];
  const activeChannels = props.overview.channelSetup.channels.filter((channel) => channel.status === "completed" || channel.status === "ready").length;
  const selectedProviderConfigured = Boolean(selectedProvider?.configured);
  const selectedModelAlreadyConfigured = Boolean(
    props.selectedModelKey && props.modelConfig?.configuredModelKeys.includes(props.selectedModelKey)
  );

  return (
    <div className="page-wrap">
      <header className="page-header">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </header>

      <div className="tabs-row">
        <button className={`tab-button ${props.configTab === "models" ? "active" : ""}`} onClick={() => props.setConfigTab("models")}>
          {copy.modelsTab(configuredModels.length)}
        </button>
        <button
          className={`tab-button ${props.configTab === "channels" ? "active" : ""}`}
          onClick={() => props.setConfigTab("channels")}
          disabled={!onboardingComplete}
        >
          {copy.channelsTab(activeChannels)}
        </button>
      </div>

      {props.configTab === "models" ? (
        <div className="stack config-figma">
          <section className="surface figma-info-card">
            <div className="figma-info-icon">AI</div>
            <div className="figma-info-copy">
              <strong>{copy.modelInfoTitle}</strong>
              <p>{copy.modelInfoDetail}</p>
              <div className="figma-info-points">
                <span>{copy.modelPointOne}</span>
                <span>{copy.modelPointTwo}</span>
                <span>{copy.modelPointThree}</span>
              </div>
            </div>
            <button className="button ghost small" onClick={() => void props.onRefreshModelConfig()} disabled={props.busy !== null}>
              {copy.refreshProviders}
            </button>
          </section>

          <section className="stack">
            {configuredModels.length ? (
              configuredModels.map(({ model, provider }) => (
                <article key={model.key} className="surface figma-model-card">
                  <div className="figma-provider-mark" aria-hidden="true">{providerGlyph(provider.label)}</div>
                  <div className="figma-model-main">
                    <div className="figma-model-head">
                      <div className="figma-model-title-row">
                        <h3>{provider.label}</h3>
                        <span className="tiny-badge neutral">{model.name}</span>
                        {props.modelConfig?.defaultModel === model.key ? (
                          <span className="tiny-badge primary">{copy.default}</span>
                        ) : (
                          <span className="tiny-badge outline">{copy.active}</span>
                        )}
                        <span className={`tiny-badge ${provider.configured ? "pass" : "pending"}`}>
                          {provider.configured ? copy.configured : copy.needsAuth}
                        </span>
                      </div>
                      <p>{provider.description}</p>
                    </div>

                    <div className="figma-model-grid">
                      <div className="figma-field">
                        <span>{copy.configuredModel}</span>
                        <strong>{model.key}</strong>
                      </div>
                      <div className="figma-field">
                        <span>{copy.source}</span>
                        <strong>{copy.sourceInstalled}</strong>
                      </div>
                      <div className="figma-field">
                        <span>{copy.authentication}</span>
                        <strong>{provider.authMethods.some((method) => method.interactive) ? copy.authInteractive : copy.authApi}</strong>
                      </div>
                    </div>

                    <div className="figma-model-actions">
                      <button
                        className="button ghost"
                        onClick={() => {
                          props.setSelectedProviderId(provider.id);
                          props.setSelectedAuthMethodId(provider.authMethods[0]?.id ?? "");
                          props.setSelectedModelKey(model.key);
                          props.setShowAddModelDialog(true);
                        }}
                      >
                        {copy.editProvider}
                      </button>
                      <a className="button ghost" href={provider.docsUrl} target="_blank" rel="noreferrer">
                        {copy.documentation}
                      </a>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <article className="surface figma-empty-card">
                <strong>{copy.noProviders}</strong>
                <p>{copy.noProvidersDetail}</p>
              </article>
            )}
          </section>

          <section className="surface figma-add-card">
            <button
              className="figma-add-trigger"
              onClick={() => {
                props.setSelectedProviderId("");
                props.setSelectedAuthMethodId("");
                props.setSelectedModelKey("");
                props.setShowAddModelDialog(true);
              }}
            >
              <span className="figma-add-plus">+</span>
              <span>{copy.addNewModel}</span>
            </button>
          </section>

          {props.showAddModelDialog ? (
            <section className="figma-dialog-backdrop" onClick={() => props.setShowAddModelDialog(false)}>
              <article className="surface figma-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="config-card-head">
                  <div>
                    <h3>{copy.addModelTitle}</h3>
                    <p>{selectedProvider ? copy.selectedProviderDetail : copy.addModelDetail}</p>
                  </div>
                  <button className="button ghost small" onClick={() => props.setShowAddModelDialog(false)}>
                    {copy.close}
                  </button>
                </div>

                {!selectedProvider ? (
                  <div className="figma-provider-grid">
                    {props.modelConfig?.providers.map((provider) => (
                      <button
                        key={provider.id}
                        className="figma-provider-tile"
                        onClick={() => {
                          props.setSelectedProviderId(provider.id);
                          props.setSelectedAuthMethodId(provider.authMethods[0]?.id ?? "");
                          props.setSelectedModelKey("");
                        }}
                      >
                        <div className="figma-provider-mark small" aria-hidden="true">{providerGlyph(provider.label)}</div>
                        <div className="figma-provider-copy">
                          <strong>{provider.label}</strong>
                          <span>{provider.modelCount} models</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="figma-config-panel">
                    <div className="figma-selected-provider">
                      <div className="figma-selected-provider-copy">
                        <div className="figma-provider-mark" aria-hidden="true">{providerGlyph(selectedProvider.label)}</div>
                        <div>
                          <h3>{selectedProvider.label}</h3>
                          <p>{selectedProvider.description}</p>
                        </div>
                      </div>
                      <button
                        className="button ghost small"
                        onClick={() => {
                          props.setSelectedProviderId("");
                          props.setSelectedAuthMethodId("");
                          props.setSelectedModelKey("");
                        }}
                      >
                        {copy.changeProvider}
                      </button>
                    </div>

                    {selectedAuthMethod ? (
                      <>
                        <div className="form-grid">
                          <label>
                            <span>{copy.model}</span>
                            <select value={props.selectedModelKey} onChange={(event) => props.setSelectedModelKey(event.target.value)}>
                              <option value="">{copy.selectModel}</option>
                              {visibleModels.map((model) => (
                                <option key={model.key} value={model.key}>
                                  {model.key}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>{copy.authMethod}</span>
                            <select value={selectedAuthMethod.id} onChange={(event) => props.setSelectedAuthMethodId(event.target.value)}>
                              {selectedProvider.authMethods.map((method) => (
                                <option key={method.id} value={method.id}>
                                  {prettyAuthMethod(method.label)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="figma-auth-note">
                          <span className={`tiny-badge ${authMethodTone(selectedAuthMethod.label)}`}>
                            {selectedAuthMethod.interactive ? copy.interactiveFlow : copy.directSetup}
                          </span>
                          <p>{selectedAuthMethod.description}</p>
                        </div>

                        {selectedAuthMethod.interactive ? (
                          <p className="subtle">
                            SlackClaw runs the OpenClaw terminal authentication flow for you, opens the browser sign-in page when OpenClaw emits it, and keeps the
                            live log here.
                          </p>
                        ) : null}

                        {props.modelAuthSession && props.modelAuthSession.providerId === selectedProvider.id && props.modelAuthSession.methodId === selectedAuthMethod.id ? (
                          <div className="figma-auth-session">
                            <div className="figma-auth-session-head">
                              <strong>{copy.authProgress}</strong>
                              <span className={`tiny-badge ${props.modelAuthSession.status === "completed" ? "pass" : props.modelAuthSession.status === "failed" ? "failed" : "pending"}`}>
                                {props.modelAuthSession.status}
                              </span>
                            </div>
                            <p>{props.modelAuthSession.message}</p>
                            {props.modelAuthSession.launchUrl ? (
                              <a href={props.modelAuthSession.launchUrl} target="_blank" rel="noreferrer">
                                {copy.openAuthWindow}
                              </a>
                            ) : null}
                            {props.modelAuthSession.logs.length ? <pre className="log-box">{props.modelAuthSession.logs.join("\n")}</pre> : null}
                            {props.modelAuthSession.status === "awaiting-input" ? (
                              <div className="figma-auth-input">
                                <label>
                                  <span>{props.modelAuthSession.inputPrompt ?? copy.pasteRedirect}</span>
                                  <input
                                    value={props.modelAuthSessionInput}
                                    onChange={(event) => props.setModelAuthSessionInput(event.target.value)}
                                    placeholder={copy.pastePlaceholder}
                                  />
                                </label>
                                <button className="button primary" onClick={() => void props.onSubmitModelAuthInput()} disabled={props.busy !== null}>
                                  {props.busy === "model-auth-input" ? copy.sending : copy.finishAuth}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {selectedAuthMethod.fields.length ? (
                          <div className="form-grid">
                            {selectedAuthMethod.fields.map((field) => (
                              <label key={field.id}>
                                <span>{field.label}</span>
                                <input
                                  type={field.secret ? "password" : "text"}
                                  placeholder={field.placeholder}
                                  value={props.authValues[field.id] ?? ""}
                                  onChange={(event) =>
                                    props.setAuthValues({
                                      ...props.authValues,
                                      [field.id]: event.target.value
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        ) : null}

                        <div className="figma-doc-card">
                          <strong>{copy.helpTitle}</strong>
                          <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">
                            {copy.helpLink(selectedProvider.label)}
                          </a>
                        </div>

                        <div className="button-row spread top-gap">
                          <button className="button ghost" onClick={() => props.setShowAddModelDialog(false)}>
                            {copy.cancel}
                          </button>
                          <button
                            className="button primary"
                            onClick={() => void (selectedProviderConfigured ? props.onAddConfiguredModel() : props.onAuthenticateProvider())}
                            disabled={
                              props.busy !== null ||
                              props.providerConfigPending ||
                              (selectedProviderConfigured && (!props.selectedModelKey || selectedModelAlreadyConfigured))
                            }
                          >
                            {props.providerConfigPending
                              ? copy.configuringProvider
                              : selectedProviderConfigured
                              ? props.busy === "model-add"
                                ? copy.savingModel
                                : copy.addModelAction
                              : props.busy === "model-auth"
                                ? copy.configuringProvider
                                : copy.configureProvider}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </article>
            </section>
          ) : null}

          <section className="surface action-footer figma-save-card">
            <div>
              <strong>{copy.saveTitle}</strong>
              <p>
                {onboardingComplete ? copy.saveReady : copy.savePending}
              </p>
            </div>
            <button className="button primary" onClick={() => void props.onSaveModels()}>
              {onboardingComplete ? copy.onboardingComplete : copy.saveModels}
            </button>
          </section>
        </div>
      ) : (
        <div className="stack config-figma">
          {!onboardingComplete ? (
            <section className="surface notice-card warn">
              <strong>{copy.completeOnboardingFirst}</strong>
              <p>{copy.completeOnboardingFirstDetail}</p>
            </section>
          ) : null}
          <section className="surface figma-info-card green">
            <div className="figma-info-icon radio">CH</div>
            <div className="figma-info-copy">
              <strong>{copy.channelsInfoTitle}</strong>
              <p>{copy.channelsInfoDetail}</p>
              <div className="figma-info-points">
                <span>{copy.channelsPointOne}</span>
                <span>{copy.channelsPointTwo}</span>
                <span>{copy.channelsPointThree}</span>
              </div>
            </div>
          </section>

          {telegram ? (
            <article className={`surface figma-channel-card ${channelTone(telegram.status)}`}>
              <div className="config-card-head">
                <div>
                  <h3>{copy.telegram}</h3>
                  <p>{telegram.summary}</p>
                </div>
                <span className={`tiny-badge ${telegram.status === "completed" ? "pass" : "pending"}`}>{telegram.status}</span>
              </div>
              <div className="form-grid">
                <label>
                  <span>{copy.telegramToken}</span>
                  <input value={props.telegramToken} onChange={(event) => props.setTelegramToken(event.target.value)} />
                </label>
                <label>
                  <span>{copy.accountName}</span>
                  <input value={props.telegramAccountName} onChange={(event) => props.setTelegramAccountName(event.target.value)} />
                </label>
              </div>
              <div className="button-row">
                <button className="button primary" onClick={() => void props.onTelegramSetup()} disabled={props.busy !== null}>
                  {props.busy === "channel-telegram" ? copy.savingModel : copy.saveTelegram}
                </button>
              </div>
              {(telegram.status === "awaiting-pairing" || telegram.status === "completed") && (
                <div className="form-grid">
                  <label>
                    <span>{copy.pairingCode}</span>
                    <input value={props.telegramPairingCode} onChange={(event) => props.setTelegramPairingCode(event.target.value)} />
                  </label>
                  <div className="button-row align-end">
                    <button className="button ghost" onClick={() => void props.onTelegramApprove()} disabled={props.busy !== null}>
                      {copy.approveTelegram}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ) : null}

          {whatsapp ? (
            <article className={`surface figma-channel-card ${channelTone(whatsapp.status)}`}>
              <div className="config-card-head">
                <div>
                  <h3>{copy.whatsapp}</h3>
                  <p>{whatsapp.summary}</p>
                </div>
                <span className={`tiny-badge ${whatsapp.status === "completed" ? "pass" : "pending"}`}>{whatsapp.status}</span>
              </div>
              {whatsapp.logs?.length ? <pre className="log-box">{whatsapp.logs.join("\n")}</pre> : null}
              <div className="button-row">
                <button className="button primary" onClick={() => void props.onWhatsappLogin()} disabled={props.busy !== null}>
                  {props.busy === "channel-whatsapp-login" ? t(props.locale, "connecting") : copy.startWhatsapp}
                </button>
              </div>
              <div className="form-grid">
                <label>
                  <span>{copy.pairingCode}</span>
                  <input value={props.whatsappPairingCode} onChange={(event) => props.setWhatsappPairingCode(event.target.value)} />
                </label>
                <div className="button-row align-end">
                  <button className="button ghost" onClick={() => void props.onWhatsappApprove()} disabled={props.busy !== null}>
                    {copy.approveWhatsapp}
                  </button>
                </div>
              </div>
            </article>
          ) : null}

          {feishu ? (
            <article className={`surface figma-channel-card ${channelTone(feishu.status)}`}>
              <div className="config-card-head">
                <div className="feishu-channel-head">
                  <div className="figma-provider-mark small feishu-mark" aria-hidden="true">飞</div>
                  <div>
                    <h3>{copy.feishu}</h3>
                    <p>{feishu.summary}</p>
                  </div>
                </div>
                <span className={`tiny-badge ${feishu.status === "completed" ? "pass" : "pending"}`}>{feishu.status}</span>
              </div>
              <div className="figma-model-grid">
                <div className="figma-field">
                  <span>{copy.source}</span>
                  <strong>{feishu.officialSupport ? "Official OpenClaw plugin" : "SlackClaw-managed"}</strong>
                </div>
                <div className="figma-field">
                  <span>{copy.authentication}</span>
                  <strong>App ID + App Secret</strong>
                </div>
                <div className="figma-field">
                  <span>{copy.documentation}</span>
                  <a href="https://docs.openclaw.ai/channels/feishu" target="_blank" rel="noreferrer">
                    Open OpenClaw Feishu docs
                  </a>
                </div>
              </div>
              <div className="feishu-setup-box">
                <p>{feishuUi.setupCardTitle}</p>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={() =>
                      feishu.status === "ready" || feishu.status === "awaiting-pairing" || feishu.status === "completed"
                        ? props.setShowFeishuDialog(true)
                        : props.setShowFeishuPrepareDialog(true)
                    }
                    disabled={props.busy !== null}
                  >
                    {feishu.status === "ready" || feishu.status === "awaiting-pairing" || feishu.status === "completed"
                      ? feishuUi.setupButton
                      : feishuUi.prepareButton}
                  </button>
                </div>
              </div>
              {(feishu.status === "awaiting-pairing" || feishu.status === "completed") && (
                <div className="form-grid">
                  <label>
                    <span>{copy.pairingCode}</span>
                    <input value={props.feishuPairingCode} onChange={(event) => props.setFeishuPairingCode(event.target.value)} />
                  </label>
                  <div className="button-row align-end">
                    <button className="button ghost" onClick={() => void props.onFeishuApprove()} disabled={props.busy !== null}>
                      {copy.approveFeishu}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ) : null}

          <FeishuPrepareDialog
            locale={props.locale}
            open={props.showFeishuPrepareDialog}
            busy={props.busy}
            onCancel={() => props.setShowFeishuPrepareDialog(false)}
            onPrepare={props.onPrepareFeishu}
          />

          {wechat ? (
            <article className={`surface figma-channel-card ${channelTone(wechat.status)}`}>
              <div className="config-card-head">
                <div>
                  <h3>{copy.wechat}</h3>
                  <p>{wechat.summary}</p>
                </div>
                <span className="tiny-badge pending">{copy.experimental}</span>
              </div>
              <div className="form-grid">
                <label>
                  <span>{copy.pluginPackage}</span>
                  <input value={props.wechatPluginSpec} onChange={(event) => props.setWechatPluginSpec(event.target.value)} />
                </label>
                <label>
                  <span>{copy.corpId}</span>
                  <input value={props.wechatCorpId} onChange={(event) => props.setWechatCorpId(event.target.value)} />
                </label>
                <label>
                  <span>{copy.agentId}</span>
                  <input value={props.wechatAgentId} onChange={(event) => props.setWechatAgentId(event.target.value)} />
                </label>
                <label>
                  <span>{copy.secret}</span>
                  <input value={props.wechatSecret} onChange={(event) => props.setWechatSecret(event.target.value)} />
                </label>
                <label>
                  <span>{copy.webhookToken}</span>
                  <input value={props.wechatToken} onChange={(event) => props.setWechatToken(event.target.value)} />
                </label>
                <label>
                  <span>{copy.encodingAesKey}</span>
                  <input value={props.wechatEncodingAesKey} onChange={(event) => props.setWechatEncodingAesKey(event.target.value)} />
                </label>
              </div>
              <div className="button-row spread">
                <button className="button primary" onClick={() => void props.onWechatSetup()} disabled={props.busy !== null}>
                  {copy.configureWechat}
                </button>
                <button className="button ghost" onClick={() => void props.onGatewayStart()} disabled={props.busy !== null}>
                  {copy.restartGateway}
                </button>
              </div>
            </article>
          ) : null}

          <section className="surface action-footer figma-save-card">
            <div>
              <strong>{copy.saveTitle}</strong>
              <p>{copy.channelSaveDetail}</p>
            </div>
            <button className="button primary" onClick={() => void props.onGatewayStart()} disabled={props.busy !== null || !onboardingComplete}>
              {props.busy === "channel-gateway" ? copy.restarting : copy.restartGateway}
            </button>
          </section>

          <FeishuSetupDialog
            locale={props.locale}
            open={props.showFeishuDialog}
            busy={props.busy}
            onCancel={() => props.setShowFeishuDialog(false)}
            onComplete={props.onFeishuSetup}
          />
        </div>
      )}
    </div>
  );
}

function SkillsView(props: {
  skillsTab: SkillsTab;
  setSkillsTab: (tab: SkillsTab) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  skills: SkillItem[];
  setSkills: (skills: SkillItem[]) => void;
}) {
  const filtered = props.skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(props.searchQuery.toLowerCase())
  );
  const enabled = filtered.filter((skill) => skill.enabled);
  const disabled = filtered.filter((skill) => !skill.enabled);

  const visible = props.skillsTab === "enabled" ? enabled : props.skillsTab === "disabled" ? disabled : filtered;

  return (
    <div className="page-wrap">
      <header className="page-header">
        <h2>Skills Management</h2>
        <p>Set up and manage SlackClaw’s office-work skill set.</p>
      </header>

      <div className="top-toolbar">
        <input
          className="search-input"
          placeholder="Search skills..."
          value={props.searchQuery}
          onChange={(event) => props.setSearchQuery(event.target.value)}
        />
        <button className="button ghost" onClick={() => props.setSkills(props.skills.map((skill) => ({ ...skill, enabled: true })))}>
          Preload All Skills
        </button>
        <button className="button primary">Add Custom Skill</button>
      </div>

      <section className="stats-grid small">
        <article className="surface stat-card"><div><p className="label">Total Skills</p><strong>{props.skills.length}</strong></div></article>
        <article className="surface stat-card"><div><p className="label">Enabled</p><strong>{props.skills.filter((skill) => skill.enabled).length}</strong></div></article>
        <article className="surface stat-card"><div><p className="label">Preloaded</p><strong>{props.skills.filter((skill) => skill.preloaded).length}</strong></div></article>
        <article className="surface stat-card"><div><p className="label">Custom</p><strong>{props.skills.filter((skill) => !skill.preloaded).length}</strong></div></article>
      </section>

      <div className="tabs-row">
        <button className={`tab-button ${props.skillsTab === "all" ? "active" : ""}`} onClick={() => props.setSkillsTab("all")}>All Skills</button>
        <button className={`tab-button ${props.skillsTab === "enabled" ? "active" : ""}`} onClick={() => props.setSkillsTab("enabled")}>Enabled</button>
        <button className={`tab-button ${props.skillsTab === "disabled" ? "active" : ""}`} onClick={() => props.setSkillsTab("disabled")}>Disabled</button>
      </div>

      <div className="stack">
        {visible.map((skill) => (
          <article key={skill.id} className={`surface skill-card ${skill.enabled ? "" : "muted"}`}>
            <div className="skill-icon">{skill.icon}</div>
            <div className="skill-body">
              <div className="config-card-head">
                <div>
                  <h3>{skill.name}</h3>
                  <p>{skill.description}</p>
                </div>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={() => props.setSkills(props.skills.map((item) => (item.id === skill.id ? { ...item, enabled: !item.enabled } : item)))}
                  />
                  <span>{skill.enabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>
              <div className="button-row spread">
                <div className="button-row">
                  <span className="tiny-badge pending">{skill.category}</span>
                  {skill.preloaded ? <span className="tiny-badge pass">Preloaded</span> : null}
                </div>
                <div className="button-row">
                  <button className="button ghost">View Details</button>
                  <button className="button ghost">Configure</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ChatView(props: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  busy: string | null;
  onSend: () => Promise<void>;
  onNewChat: () => void;
  templates: TaskTemplate[];
  onTemplateClick: (template: TaskTemplate) => void;
  workflowReady: boolean;
  blockMessage: string;
}) {
  return (
    <div className="page-wrap chat-page">
      <header className="page-header inline">
        <div>
          <h2>Chat with OpenClaw</h2>
          <p>{props.workflowReady ? "Connected to your local SlackClaw workflow." : props.blockMessage}</p>
        </div>
        <button className="button ghost" onClick={props.onNewChat}>
          New Chat
        </button>
      </header>

      <section className="surface chat-surface">
        <div className="chat-messages">
          {props.messages.map((message) => (
            <article key={message.id} className={`chat-row ${message.role}`}>
              <div className={`chat-avatar ${message.role}`}>{message.role === "assistant" ? "✦" : "U"}</div>
              <div className="chat-bubble-wrap">
                <div className={`chat-bubble ${message.role}`}>
                  <p>{message.content}</p>
                </div>
                <div className="chat-meta">
                  <span>{formatTime(message.timestamp)}</span>
                  {message.meta ? <span className="tiny-badge pending">{message.meta}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="chat-composer">
          <textarea
            value={props.input}
            onChange={(event) => props.setInput(event.target.value)}
            placeholder="Type your message..."
          />
          <div className="button-row spread">
            <div className="button-row wrap">
              {props.templates.slice(0, 4).map((template) => (
                <button key={template.id} className="button ghost small" onClick={() => props.onTemplateClick(template)}>
                  {template.title}
                </button>
              ))}
            </div>
            <button className="button primary" onClick={() => void props.onSend()} disabled={!props.workflowReady || props.busy === "task"}>
              {props.busy === "task" ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsView(props: {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  settings: LocalSettingsState;
  setSettings: (settings: LocalSettingsState) => void;
  busy: string | null;
  onSave: () => void;
  onExportDiagnostics: () => Promise<void>;
  onUpdate: () => Promise<void>;
  onInstallService: () => Promise<void>;
  onRestartService: () => Promise<void>;
  onUninstallService: () => Promise<void>;
  onStopApp: () => Promise<void>;
  onUninstallApp: () => Promise<void>;
  appVersion: string;
}) {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <h2>Settings</h2>
        <p>Configure your SlackClaw system preferences.</p>
      </header>

      <div className="tabs-row">
        {(["general", "deployment", "logging", "advanced"] as SettingsTab[]).map((tab) => (
          <button key={tab} className={`tab-button ${props.tab === tab ? "active" : ""}`} onClick={() => props.setTab(tab)}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {props.tab === "general" ? (
        <section className="surface form-surface">
          <label>
            <span>Instance Name</span>
            <input
              value={props.settings.general.instanceName}
              onChange={(event) =>
                props.setSettings({
                  ...props.settings,
                  general: { ...props.settings.general, instanceName: event.target.value }
                })
              }
            />
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.general.autoStart}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  general: { ...props.settings.general, autoStart: !props.settings.general.autoStart }
                })
              }
            />
            <span>Auto-start on boot</span>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.general.checkUpdates}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  general: { ...props.settings.general, checkUpdates: !props.settings.general.checkUpdates }
                })
              }
            />
            <span>Check for updates</span>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.general.telemetry}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  general: { ...props.settings.general, telemetry: !props.settings.general.telemetry }
                })
              }
            />
            <span>Send telemetry</span>
          </label>
          <div className="button-row spread top-gap">
            <div>
              <strong>Current Version</strong>
              <p className="subtle">v{props.appVersion}</p>
            </div>
            <button className="button primary" onClick={props.onSave}>
              Save Changes
            </button>
          </div>
        </section>
      ) : null}

      {props.tab === "deployment" ? (
        <section className="surface form-surface">
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.deployment.autoRestart}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  deployment: { ...props.settings.deployment, autoRestart: !props.settings.deployment.autoRestart }
                })
              }
            />
            <span>Auto-restart on failure</span>
          </label>
          <label>
            <span>Max Retry Attempts</span>
            <select
              value={String(props.settings.deployment.maxRetries)}
              onChange={(event) =>
                props.setSettings({
                  ...props.settings,
                  deployment: { ...props.settings.deployment, maxRetries: Number(event.target.value) }
                })
              }
            >
              <option value="0">No retries</option>
              <option value="1">1 retry</option>
              <option value="3">3 retries</option>
              <option value="5">5 retries</option>
            </select>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.deployment.healthCheck}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  deployment: { ...props.settings.deployment, healthCheck: !props.settings.deployment.healthCheck }
                })
              }
            />
            <span>Health check monitoring</span>
          </label>
          <button className="button primary top-gap" onClick={props.onSave}>
            Save Deployment Settings
          </button>
        </section>
      ) : null}

      {props.tab === "logging" ? (
        <section className="surface form-surface">
          <label>
            <span>Log Level</span>
            <select
              value={props.settings.logging.level}
              onChange={(event) =>
                props.setSettings({
                  ...props.settings,
                  logging: { ...props.settings.logging, level: event.target.value }
                })
              }
            >
              <option value="error">Error only</option>
              <option value="warn">Warnings</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </label>
          <label>
            <span>Log Retention (days)</span>
            <input
              type="number"
              value={props.settings.logging.retention}
              onChange={(event) =>
                props.setSettings({
                  ...props.settings,
                  logging: { ...props.settings.logging, retention: Number(event.target.value) }
                })
              }
            />
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={props.settings.logging.enableDebug}
              onChange={() =>
                props.setSettings({
                  ...props.settings,
                  logging: { ...props.settings.logging, enableDebug: !props.settings.logging.enableDebug }
                })
              }
            />
            <span>Enable debug mode</span>
          </label>
          <div className="button-row">
            <button className="button ghost" onClick={() => void props.onExportDiagnostics()} disabled={props.busy !== null}>
              Download Logs
            </button>
            <button className="button primary" onClick={props.onSave}>
              Save Logging Settings
            </button>
          </div>
        </section>
      ) : null}

      {props.tab === "advanced" ? (
        <section className="stack">
          <article className="surface form-surface">
            <h3>Configuration Management</h3>
            <div className="button-column">
              <button className="button ghost" onClick={() => void props.onExportDiagnostics()} disabled={props.busy !== null}>
                Export Diagnostics
              </button>
              <button className="button ghost" onClick={() => void props.onUpdate()} disabled={props.busy !== null}>
                Check for Updates
              </button>
            </div>
          </article>

          <article className="surface form-surface">
            <h3>System Controls</h3>
            <div className="button-column">
              <button className="button ghost" onClick={() => void props.onInstallService()} disabled={props.busy !== null}>
                Install Service
              </button>
              <button className="button ghost" onClick={() => void props.onRestartService()} disabled={props.busy !== null}>
                Restart Service
              </button>
              <button className="button ghost" onClick={() => void props.onUninstallService()} disabled={props.busy !== null}>
                Remove Service
              </button>
            </div>
          </article>

          <article className="surface danger-zone">
            <h3>Danger Zone</h3>
            <p>These actions stop or remove the current SlackClaw app.</p>
            <div className="button-column">
              <button className="button ghost" onClick={() => void props.onStopApp()} disabled={props.busy !== null}>
                Stop SlackClaw
              </button>
              <button className="button destructive" onClick={() => void props.onUninstallApp()} disabled={props.busy !== null}>
                Uninstall SlackClaw
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}

export default function App() {
  const [overview, setOverview] = useState<ProductOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("onboarding");
  const [locale, setLocale] = useState<Locale>(detectLocale());
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [configTab, setConfigTab] = useState<ConfigTab>("models");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [skillsTab, setSkillsTab] = useState<SkillsTab>("all");
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [deploySteps, setDeploySteps] = useState<SetupStepResult[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("email-admin");
  const [modelConfig, setModelConfig] = useState<ModelConfigOverview | null>(null);
  const [showAddModelDialog, setShowAddModelDialog] = useState(false);
  const [modelAuthSession, setModelAuthSession] = useState<ModelAuthSession | null>(null);
  const [modelAuthSessionInput, setModelAuthSessionInput] = useState("");
  const [providerConfigPending, setProviderConfigPending] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("openai");
  const [selectedAuthMethodId, setSelectedAuthMethodId] = useState<string>("api-key");
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [selectedModelKey, setSelectedModelKey] = useState<string>("");
  const [settings, setSettings] = useState<LocalSettingsState>(() => loadStoredJson("slackclaw.settings", defaultSettingsState));
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm OpenClaw through SlackClaw. Finish setup, then ask me to help with office work.",
      timestamp: new Date().toISOString(),
      meta: "SlackClaw"
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("summarize-thread");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramAccountName, setTelegramAccountName] = useState("");
  const [telegramPairingCode, setTelegramPairingCode] = useState("");
  const [whatsappPairingCode, setWhatsappPairingCode] = useState("");
  const [feishuPairingCode, setFeishuPairingCode] = useState("");
  const [showFeishuPrepareDialog, setShowFeishuPrepareDialog] = useState(false);
  const [showFeishuDialog, setShowFeishuDialog] = useState(false);
  const [wechatPluginSpec, setWechatPluginSpec] = useState("@openclaw-china/wecom-app");
  const [wechatCorpId, setWechatCorpId] = useState("");
  const [wechatAgentId, setWechatAgentId] = useState("");
  const [wechatSecret, setWechatSecret] = useState("");
  const [wechatToken, setWechatToken] = useState("");
  const [wechatEncodingAesKey, setWechatEncodingAesKey] = useState("");

  useEffect(() => {
    saveStoredJson("slackclaw.settings", settings);
  }, [settings]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("slackclaw.locale", locale);
    }
  }, [locale]);


  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    void loadModelConfiguration();
  }, []);

  useEffect(() => {
    if (view !== "onboarding" || onboardingStep !== 2) {
      return;
    }

    void loadOverview();
  }, [onboardingStep, view]);

  useEffect(() => {
    if (!overview?.channelSetup.baseOnboardingCompleted && configTab === "channels") {
      setConfigTab("models");
    }
  }, [configTab, overview?.channelSetup.baseOnboardingCompleted]);

  useEffect(() => {
    const provider = modelConfig?.providers.find((entry) => entry.id === selectedProviderId);
    if (!provider) {
      return;
    }

    setSelectedAuthMethodId((current) => provider.authMethods.find((method) => method.id === current)?.id ?? provider.authMethods[0]?.id ?? "");
    setSelectedModelKey((current) => {
      if (current && modelConfig?.models.some((model) => model.key === current && provider.providerRefs.some((prefix) => model.key.startsWith(prefix)))) {
        return current;
      }

      return provider.sampleModels[0] || "";
    });
    setAuthValues({});
  }, [modelConfig, selectedProviderId]);

  useEffect(() => {
    if (!modelAuthSession || (modelAuthSession.status !== "running" && modelAuthSession.status !== "awaiting-input")) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const result = await fetchModelAuthSession(modelAuthSession.id);
          setModelAuthSession(result.session);
          setModelConfig(result.modelConfig);

          if (result.session.status === "completed") {
            setNotice(result.session.message);
            setError(null);
          }
        } catch (sessionError) {
          setError(sessionError instanceof Error ? sessionError.message : "Unable to refresh provider authentication status.");
        }
      })();
    }, 1200);

    return () => window.clearInterval(timer);
  }, [modelAuthSession]);

  useEffect(() => {
    if (!providerConfigPending || !showAddModelDialog || !selectedProviderId) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await fetchModelConfig();
          setModelConfig(next);

          const provider = next.providers.find((entry) => entry.id === selectedProviderId);
          if (provider?.configured) {
            setProviderConfigPending(false);
            setNotice((current) => current ?? `${provider.label} is configured. Select a model to add it.`);
            setError(null);
          }
        } catch (modelError) {
          setError(modelError instanceof Error ? modelError.message : "Unable to refresh OpenClaw provider configuration.");
        }
      })();
    }, 1200);

    return () => window.clearInterval(timer);
  }, [providerConfigPending, selectedProviderId, showAddModelDialog]);

  useEffect(() => {
    if (!showAddModelDialog) {
      setProviderConfigPending(false);
      setModelAuthSession(null);
      setModelAuthSessionInput("");
    }
  }, [showAddModelDialog]);

  useEffect(() => {
    if (!busy?.startsWith("deploy") || deploySteps.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setDeploySteps((current) => {
        const runningIndex = current.findIndex((step) => step.status === "running");

        if (runningIndex === -1 || runningIndex === current.length - 1) {
          return current;
        }

        return current.map((step, index) => {
          if (index < runningIndex) {
            return { ...step, status: "completed" };
          }

          if (index === runningIndex) {
            return { ...step, status: "completed" };
          }

          if (index === runningIndex + 1) {
            return { ...step, status: "running" };
          }

          return step;
        });
      });
    }, 1400);

    return () => window.clearInterval(timer);
  }, [busy, deploySteps.length]);

  async function loadOverview() {
    try {
      const nextOverview = await fetchOverview();
      setOverview(nextOverview);
      setSelectedProfileId(nextOverview.firstRun.selectedProfileId ?? "email-admin");
      setSkills((current) => (current.length ? current : toSkillItems(nextOverview.templates)));

      if (!nextOverview.firstRun.introCompleted || !nextOverview.firstRun.setupCompleted) {
        setView("onboarding");
      } else if (view === "onboarding") {
        setView("dashboard");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load SlackClaw.");
    }
  }

  async function loadModelConfiguration() {
    try {
      const next = await fetchModelConfig();
      setModelConfig(next);

      const nextProvider = next.providers.find((provider) => provider.id === selectedProviderId) ?? next.providers[0];
      if (nextProvider) {
        setSelectedProviderId(nextProvider.id);
        setSelectedAuthMethodId(nextProvider.authMethods[0]?.id ?? "");
        setSelectedModelKey((current) => current || next.defaultModel || nextProvider.sampleModels[0] || "");
      }
    } catch (modelError) {
      setError(modelError instanceof Error ? modelError.message : "Unable to load OpenClaw model providers.");
    }
  }

  const workflowReady = Boolean(
    overview?.firstRun.setupCompleted &&
      overview?.channelSetup.baseOnboardingCompleted &&
      overview?.channelSetup.gatewayStarted &&
      overview?.engine.running
  );

  async function handleStartIntro() {
    setBusy("first-run-intro");
    setError(null);

    try {
      if (!overview?.firstRun.introCompleted) {
        await markFirstRunIntroComplete();
        await loadOverview();
      }
      setOnboardingStep(2);
    } catch (introError) {
      setError(introError instanceof Error ? introError.message : "Could not start onboarding.");
    } finally {
      setBusy(null);
    }
  }

  function handleContinueAfterCheck() {
    if (overview?.firstRun.setupCompleted) {
      setView("dashboard");
      return;
    }

    setView("deploy");
  }

  async function handleDeploy(variant: "standard" | "managed-local" | "planned") {
    if (variant === "planned") {
      setNotice("This engine target is planned but not implemented yet.");
      return;
    }

    setBusy(`deploy-${variant}`);
    setError(null);
    setNotice(null);
    setDeploySteps(createDeploySteps(variant === "managed-local"));

    try {
      const result = await runFirstRunSetup(variant === "managed-local");
      setOverview(result.overview);
      setDeploySteps(result.steps);
      setNotice(result.message);
      setView("config");
    } catch (deployError) {
      setDeploySteps((current) =>
        current.map((step, index) =>
          index === current.findIndex((item) => item.status === "running")
            ? { ...step, status: "failed", detail: deployError instanceof Error ? deployError.message : "Deployment failed." }
            : step
        )
      );
      setError(deployError instanceof Error ? deployError.message : "Deployment failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUninstallEngine() {
    setBusy("engine-uninstall");
    setError(null);
    setNotice(null);

    try {
      const result = await uninstallEngine();
      setOverview(result.overview);
      setDeploySteps([]);
      setSelectedVariant(null);
      setView("onboarding");
      setOnboardingStep(2);
      setNotice(result.result.message);
    } catch (engineError) {
      setError(engineError instanceof Error ? engineError.message : "Engine uninstall failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTelegramSetup() {
    setBusy("channel-telegram");
    setError(null);
    setNotice(null);
    try {
      const result = await setupTelegramChannel({
        token: telegramToken.trim(),
        accountName: telegramAccountName.trim() || undefined
      });
      setOverview(result.overview);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Telegram setup failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTelegramApprove() {
    setBusy("channel-telegram-approve");
    setError(null);
    setNotice(null);
    try {
      const result = await approveTelegramPairing({ code: telegramPairingCode.trim() });
      setOverview(result.overview);
      setNotice(result.message);
      setTelegramPairingCode("");
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Telegram pairing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleWhatsappLogin() {
    setBusy("channel-whatsapp-login");
    setError(null);
    setNotice(null);
    try {
      const result = await startWhatsappLogin();
      setOverview(result.overview);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "WhatsApp login failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleWhatsappApprove() {
    setBusy("channel-whatsapp-approve");
    setError(null);
    setNotice(null);
    try {
      const result = await approveWhatsappPairing({ code: whatsappPairingCode.trim() });
      setOverview(result.overview);
      setNotice(result.message);
      setWhatsappPairingCode("");
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "WhatsApp pairing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFeishuApprove() {
    setBusy("channel-feishu-approve");
    setError(null);
    setNotice(null);
    try {
      const result = await approveFeishuPairing({ code: feishuPairingCode.trim() });
      setOverview(result.overview);
      setNotice(result.message);
      setFeishuPairingCode("");
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Feishu pairing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFeishuSetup(request: {
    appId: string;
    appSecret: string;
    domain?: string;
    botName?: string;
  }) {
    setBusy("channel-feishu");
    setError(null);
    setNotice(null);
    try {
      const result = await setupFeishuChannel(request);
      setOverview(result.overview);
      setShowFeishuDialog(false);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Feishu setup failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePrepareFeishu() {
    setBusy("channel-feishu-prepare");
    setError(null);
    setNotice(null);
    try {
      const result = await prepareFeishuChannel();
      setOverview(result.overview);
      setShowFeishuPrepareDialog(false);
      setShowFeishuDialog(true);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Feishu plugin install failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleWechatSetup() {
    setBusy("channel-wechat");
    setError(null);
    setNotice(null);
    try {
      const result = await setupWechatWorkaround({
        pluginSpec: wechatPluginSpec.trim() || undefined,
        corpId: wechatCorpId.trim(),
        agentId: wechatAgentId.trim(),
        secret: wechatSecret.trim(),
        token: wechatToken.trim(),
        encodingAesKey: wechatEncodingAesKey.trim()
      });
      setOverview(result.overview);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "WeChat workaround failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGatewayStart() {
    setBusy("channel-gateway");
    setError(null);
    setNotice(null);
    try {
      const result = await startGatewayAfterChannels();
      setOverview(result.overview);
      setNotice(result.message);
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : "Gateway restart failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSendMessage() {
    if (!overview || !chatInput.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatMessages((current) => [...current, userMessage]);
    setBusy("task");
    setError(null);

    try {
      const result: EngineTaskResult = await runTask({
        profileId: selectedProfileId,
        templateId: selectedTemplateId,
        prompt: chatInput
      });

      const assistantMessage: ChatMessage = {
        id: result.taskId,
        role: "assistant",
        content: result.output,
        timestamp: result.finishedAt ?? new Date().toISOString(),
        meta: result.summary
      };

      setChatMessages((current) => [...current, assistantMessage]);
      setChatInput("");
      await loadOverview();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Task failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveModels() {
    setBusy("onboarding");
    setError(null);
    try {
      const nextOverview = await completeOnboarding({ profileId: selectedProfileId });
      setOverview(nextOverview);
      setNotice("Model preferences saved and onboarding completed. Continue with channels.");
      setConfigTab("channels");
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : "Onboarding failed while saving models.");
    } finally {
      setBusy(null);
    }
  }

  async function handleProviderAuth() {
    if (!modelConfig) {
      return;
    }

    setBusy("model-auth");
    setError(null);
    setNotice(null);
    setProviderConfigPending(true);

    try {
      const result = await authenticateModelProvider({
        providerId: selectedProviderId,
        methodId: selectedAuthMethodId,
        values: authValues
      });
      setModelConfig(result.modelConfig);
      setModelAuthSession(result.authSession ?? null);
      setModelAuthSessionInput("");
      const provider = result.modelConfig.providers.find((entry) => entry.id === selectedProviderId);
      if (provider?.configured) {
        setProviderConfigPending(false);
      }
      setNotice(result.message);
      await loadOverview();
    } catch (providerError) {
      setProviderConfigPending(false);
      setError(providerError instanceof Error ? providerError.message : "Provider authentication failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddConfiguredModel() {
    if (!selectedModelKey) {
      setError("Select a model first.");
      return;
    }

    setBusy("model-add");
    setError(null);
    setNotice(null);

    try {
      const result = await setDefaultModel({ modelKey: selectedModelKey });
      setModelConfig(result.modelConfig);
      setModelAuthSession(null);
      setProviderConfigPending(false);
      setModelAuthSessionInput("");
      setShowAddModelDialog(false);
      setNotice(result.message);
      await loadOverview();
    } catch (modelError) {
      setError(modelError instanceof Error ? modelError.message : "Adding model failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmitModelAuthInput() {
    if (!modelAuthSession) {
      return;
    }

    setBusy("model-auth-input");
    setError(null);
    setNotice(null);

    try {
      const result = await submitModelAuthSessionInput(modelAuthSession.id, {
        value: modelAuthSessionInput
      });
      setModelAuthSession(result.session);
      setModelConfig(result.modelConfig);
      setModelAuthSessionInput("");
      setNotice(result.session.message);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Unable to send the redirect URL / code to OpenClaw.");
    } finally {
      setBusy(null);
    }
  }

  function handleSaveSettings() {
    saveStoredJson("slackclaw.settings", settings);
    setNotice("Settings saved successfully.");
  }

  async function handleExportDiagnostics() {
    setBusy("diagnostics");
    setError(null);
    try {
      const result = await exportDiagnostics();
      setNotice(`${result.message} ${result.path}`);
    } catch (diagnosticsError) {
      setError(diagnosticsError instanceof Error ? diagnosticsError.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    setBusy("update");
    setError(null);
    try {
      const result = await runUpdate();
      setNotice(result.message);
      await loadOverview();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallService() {
    setBusy("service-install");
    setError(null);
    try {
      const result = await installAppService();
      setOverview(result.overview);
      setNotice(result.result.message);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : "Service install failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestartService() {
    setBusy("service-restart");
    setError(null);
    try {
      const result = await restartAppService();
      setOverview(result.overview);
      setNotice(result.result.message);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : "Service restart failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUninstallService() {
    setBusy("service-uninstall");
    setError(null);
    try {
      const result = await uninstallAppService();
      setOverview(result.overview);
      setNotice(result.result.message);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : "Service uninstall failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleStopApp() {
    setBusy("app-stop");
    try {
      const result = await stopSlackClawApp();
      setNotice(result.message);
    } catch (appError) {
      setError(appError instanceof Error ? appError.message : "Stop failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUninstallApp() {
    setBusy("app-uninstall");
    try {
      const result = await uninstallSlackClawApp();
      setNotice(result.message);
    } catch (appError) {
      setError(appError instanceof Error ? appError.message : "Uninstall failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!overview) {
    return <div className="loading-page">{locale === "zh" ? "正在加载 SlackClaw…" : locale === "ja" ? "SlackClaw を読み込み中…" : locale === "ko" ? "SlackClaw를 불러오는 중…" : locale === "es" ? "Cargando SlackClaw…" : "Loading SlackClaw…"}</div>;
  }

  if (!overview.firstRun.introCompleted || view === "onboarding") {
    return (
      <OnboardingScreen
        locale={locale}
        overview={overview}
        onboardingStep={onboardingStep}
        setOnboardingStep={setOnboardingStep}
        busy={busy}
        onStartIntro={handleStartIntro}
        onContinueAfterCheck={handleContinueAfterCheck}
        onSelectLocale={setLocale}
        onUninstallEngine={handleUninstallEngine}
      />
    );
  }

  return (
    <AppShell activeView={view} onSelectView={setView} locale={locale} onSelectLocale={setLocale} overview={overview}>
      {error ? <div className="banner error">{error}</div> : null}
      {notice ? <div className="banner ok">{notice}</div> : null}

      {view === "dashboard" ? <DashboardView overview={overview} onSelectView={setView} /> : null}
      {view === "deploy" ? (
        <DeployView
          locale={locale}
          overview={overview}
          busy={busy}
          onDeploy={handleDeploy}
          onUninstallEngine={handleUninstallEngine}
          selectedVariant={selectedVariant}
          setSelectedVariant={setSelectedVariant}
          deploySteps={deploySteps}
        />
      ) : null}
      {view === "config" ? (
        <ConfigView
          locale={locale}
          configTab={configTab}
          setConfigTab={setConfigTab}
          showAddModelDialog={showAddModelDialog}
          setShowAddModelDialog={setShowAddModelDialog}
          modelAuthSession={modelAuthSession}
          modelAuthSessionInput={modelAuthSessionInput}
          setModelAuthSessionInput={setModelAuthSessionInput}
          modelConfig={modelConfig}
          selectedProviderId={selectedProviderId}
          setSelectedProviderId={setSelectedProviderId}
          selectedAuthMethodId={selectedAuthMethodId}
          setSelectedAuthMethodId={setSelectedAuthMethodId}
          authValues={authValues}
          setAuthValues={setAuthValues}
          selectedModelKey={selectedModelKey}
          setSelectedModelKey={setSelectedModelKey}
          overview={overview}
          busy={busy}
          providerConfigPending={providerConfigPending}
          telegramToken={telegramToken}
          setTelegramToken={setTelegramToken}
          telegramAccountName={telegramAccountName}
          setTelegramAccountName={setTelegramAccountName}
          telegramPairingCode={telegramPairingCode}
          setTelegramPairingCode={setTelegramPairingCode}
          whatsappPairingCode={whatsappPairingCode}
          setWhatsappPairingCode={setWhatsappPairingCode}
          feishuPairingCode={feishuPairingCode}
          setFeishuPairingCode={setFeishuPairingCode}
          showFeishuPrepareDialog={showFeishuPrepareDialog}
          setShowFeishuPrepareDialog={setShowFeishuPrepareDialog}
          showFeishuDialog={showFeishuDialog}
          setShowFeishuDialog={setShowFeishuDialog}
          wechatPluginSpec={wechatPluginSpec}
          setWechatPluginSpec={setWechatPluginSpec}
          wechatCorpId={wechatCorpId}
          setWechatCorpId={setWechatCorpId}
          wechatAgentId={wechatAgentId}
          setWechatAgentId={setWechatAgentId}
          wechatSecret={wechatSecret}
          setWechatSecret={setWechatSecret}
          wechatToken={wechatToken}
          setWechatToken={setWechatToken}
          wechatEncodingAesKey={wechatEncodingAesKey}
          setWechatEncodingAesKey={setWechatEncodingAesKey}
          onSaveModels={handleSaveModels}
          onTelegramSetup={handleTelegramSetup}
          onTelegramApprove={handleTelegramApprove}
          onWhatsappLogin={handleWhatsappLogin}
          onWhatsappApprove={handleWhatsappApprove}
          onPrepareFeishu={handlePrepareFeishu}
          onFeishuApprove={handleFeishuApprove}
          onFeishuSetup={handleFeishuSetup}
          onWechatSetup={handleWechatSetup}
          onGatewayStart={handleGatewayStart}
          onAuthenticateProvider={handleProviderAuth}
          onSubmitModelAuthInput={handleSubmitModelAuthInput}
          onAddConfiguredModel={handleAddConfiguredModel}
          onRefreshModelConfig={loadModelConfiguration}
        />
      ) : null}
      {view === "skills" ? (
        <SkillsView
          skillsTab={skillsTab}
          setSkillsTab={setSkillsTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          skills={skills}
          setSkills={setSkills}
        />
      ) : null}
      {view === "chat" ? (
        <ChatView
          messages={chatMessages}
          input={chatInput}
          setInput={setChatInput}
          busy={busy}
          onSend={handleSendMessage}
          onNewChat={() =>
            setChatMessages([
              {
                id: "welcome",
                role: "assistant",
                content: "Hello! I'm OpenClaw through SlackClaw. How can I help you today?",
                timestamp: new Date().toISOString(),
                meta: "SlackClaw"
              }
            ])
          }
          templates={overview.templates}
          onTemplateClick={(template) => {
            setSelectedTemplateId(template.id);
            setChatInput(template.promptHint);
          }}
          workflowReady={workflowReady}
          blockMessage={overview.channelSetup.gatewaySummary}
        />
      ) : null}
      {view === "settings" ? (
        <SettingsView
          tab={settingsTab}
          setTab={setSettingsTab}
          settings={settings}
          setSettings={setSettings}
          busy={busy}
          onSave={handleSaveSettings}
          onExportDiagnostics={handleExportDiagnostics}
          onUpdate={handleUpdate}
          onInstallService={handleInstallService}
          onRestartService={handleRestartService}
          onUninstallService={handleUninstallService}
          onStopApp={handleStopApp}
          onUninstallApp={handleUninstallApp}
          appVersion={overview.appVersion}
        />
      ) : null}
    </AppShell>
  );
}
